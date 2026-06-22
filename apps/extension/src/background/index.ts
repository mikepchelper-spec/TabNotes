import {
  DRIVE_REMOTE_APPLY_STORAGE_KEY,
  handleDriveAlarm,
  handleDriveMessage,
  recordDriveDeletionTombstones,
  scheduleDriveAutoSync,
  scheduleDrivePeriodicSync,
} from './driveSync';
import {
  ACTIVE_REMINDER_ALERT_STORAGE_KEY,
  ActiveReminderAlert,
  DEFAULT_SNOOZE_MINUTES,
  NOTE_REMINDER_ALARM_PREFIX,
  OPEN_REMINDER_REQUEST_STORAGE_KEY,
  PENDING_REMINDERS_STORAGE_KEY,
  PendingNoteReminder,
  REMINDER_ALERT_DURATION_MS,
  REMINDER_BADGE_FLASH_MS,
  createPendingReminderId,
  createNoteReminderAlarmName,
  createNoteReminderNotificationId,
  isFutureReminderTimestamp,
  isReminderTimestamp,
  normalizePendingReminders,
  parseNoteReminderAlarmName,
  parseNoteReminderNotificationId,
  removePendingReminder,
  roundUpToMinute,
  upsertPendingReminder,
} from '../shared/reminders';

type ReminderCollectionKey = 'notes_url' | 'notes_domain' | 'notes_workspace' | 'notes_global';

interface ReminderNote {
  title?: string;
  content?: string;
  reminderAt?: number;
  scope?: string;
  scopeKey?: string;
  workspaceId?: string | null;
}

type ReminderStorageData = Partial<Record<ReminderCollectionKey, Record<string, ReminderNote>>>;

const REMINDER_COLLECTION_KEYS: ReminderCollectionKey[] = [
  'notes_url',
  'notes_domain',
  'notes_workspace',
  'notes_global',
];

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/index.html';
const CLIP_SELECTION_CONTEXT_MENU_ID = 'tabnotes_clip_selection';
const PENDING_CLIP_STORAGE_KEY = 'tn_pending_clip';

interface RuntimeContext {
  url?: string;
}

type RuntimeWithContexts = typeof chrome.runtime & {
  getContexts?: (filter: {
    contextTypes: string[];
    documentUrls: string[];
  }) => Promise<RuntimeContext[]>;
};

type ChromeWithOffscreen = typeof chrome & {
  offscreen?: {
    createDocument: (parameters: {
      url: string;
      reasons: string[];
      justification: string;
    }) => Promise<void>;
    closeDocument: () => Promise<void>;
  };
};

let creatingOffscreen: Promise<void> | null = null;
let badgeFlashTimer: ReturnType<typeof setInterval> | null = null;
let alertStopTimer: ReturnType<typeof setTimeout> | null = null;
let badgeFlashOn = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function normalizeUrl(url: string): string {
  try {
    const TRACKING = new Set([
      'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
      'ref','fbclid','gclid','msclkid','twclid','mc_cid','mc_eid','_ga','_gl','igshid',
    ]);
    const u = new URL(url);
    u.hash = '';
    for (const p of TRACKING) u.searchParams.delete(p);
    const search = u.searchParams.toString();
    let out = `${u.origin}${u.pathname}`.replace(/\/$/, '');
    if (search) out += `?${search}`;
    return out;
  } catch { return url; }
}

function clearAlarm(name: string): Promise<boolean> {
  return new Promise((resolve) => chrome.alarms.clear(name, resolve));
}

function getAllAlarms(): Promise<chrome.alarms.Alarm[]> {
  return new Promise((resolve) => chrome.alarms.getAll(resolve));
}

function getLocalStorage(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setLocalStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));
}

function stripReminderText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNotificationButtonTitle(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

function getOffscreenApi() {
  return (chrome as ChromeWithOffscreen).offscreen;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const runtimeWithContexts = chrome.runtime as RuntimeWithContexts;

  if (runtimeWithContexts.getContexts) {
    const contexts = await runtimeWithContexts.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }

  const clientsApi = (globalThis as unknown as {
    clients?: { matchAll: () => Promise<Array<{ url: string }>> };
  }).clients;
  if (!clientsApi?.matchAll) return false;
  const clients = await clientsApi.matchAll();
  return clients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = getOffscreenApi();
  if (!offscreen) return;
  if (await hasOffscreenDocument()) return;

  if (!creatingOffscreen) {
    creatingOffscreen = offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play an audible TabNotes reminder alert until the user responds.',
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }

  await creatingOffscreen;
}

async function closeOffscreenDocument(): Promise<void> {
  const offscreen = getOffscreenApi();
  if (!offscreen || !(await hasOffscreenDocument())) return;
  await offscreen.closeDocument().catch(() => undefined);
}

async function sendReminderAudioMessage(
  message:
    | { target: 'tabnotes-reminder-audio'; type: 'START_REMINDER_AUDIO'; durationMs: number }
    | { target: 'tabnotes-reminder-audio'; type: 'STOP_REMINDER_AUDIO' }
): Promise<void> {
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}

function getActiveReminderAlert(value: unknown): ActiveReminderAlert | null {
  if (!value || typeof value !== 'object') return null;
  const alert = value as Partial<ActiveReminderAlert>;
  if (
    typeof alert.noteId !== 'string' ||
    !isReminderTimestamp(alert.startedAt) ||
    !isReminderTimestamp(alert.expiresAt) ||
    alert.expiresAt <= Date.now()
  ) {
    return null;
  }
  return alert as ActiveReminderAlert;
}

async function getPendingReminderCount(): Promise<number> {
  const reminders = await getPendingReminders();
  return reminders.length;
}

async function applyBadgeFrame(flashing: boolean): Promise<void> {
  const pendingCount = await getPendingReminderCount();
  if (pendingCount === 0) {
    await updateBadgeForActiveTab();
    return;
  }

  const text = flashing ? '!' : pendingCount > 99 ? '99+' : String(pendingCount);
  const background = flashing ? '#ff3b30' : '#dcae19';
  const textColor = flashing ? '#ffffff' : '#111318';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: background });
  chrome.action.setBadgeTextColor({ color: textColor });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.action.setBadgeText({ text, tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: background, tabId: tab.id });
    chrome.action.setBadgeTextColor({ color: textColor, tabId: tab.id });
  }
}

function clearReminderAlertTimers(): void {
  if (badgeFlashTimer) clearInterval(badgeFlashTimer);
  if (alertStopTimer) clearTimeout(alertStopTimer);
  badgeFlashTimer = null;
  alertStopTimer = null;
}

function startBadgeFlashLoop(expiresAt: number): void {
  clearReminderAlertTimers();
  badgeFlashOn = false;

  const tick = () => {
    if (Date.now() >= expiresAt) {
      void stopReminderAlert();
      return;
    }
    badgeFlashOn = !badgeFlashOn;
    void applyBadgeFrame(badgeFlashOn);
  };

  tick();
  badgeFlashTimer = setInterval(tick, REMINDER_BADGE_FLASH_MS);
  alertStopTimer = setTimeout(() => {
    void stopReminderAlert();
  }, Math.max(0, expiresAt - Date.now()));
}

async function startReminderAlert(noteId: string, durationMs = REMINDER_ALERT_DURATION_MS): Promise<void> {
  const now = Date.now();
  const expiresAt = now + durationMs;

  await setLocalStorage({
    [ACTIVE_REMINDER_ALERT_STORAGE_KEY]: {
      noteId,
      startedAt: now,
      expiresAt,
    } satisfies ActiveReminderAlert,
  });

  await ensureOffscreenDocument();
  await sendReminderAudioMessage({
    target: 'tabnotes-reminder-audio',
    type: 'START_REMINDER_AUDIO',
    durationMs,
  });
  startBadgeFlashLoop(expiresAt);
}

async function stopReminderAlert(): Promise<void> {
  clearReminderAlertTimers();
  await sendReminderAudioMessage({
    target: 'tabnotes-reminder-audio',
    type: 'STOP_REMINDER_AUDIO',
  });
  await chrome.storage.local.remove(ACTIVE_REMINDER_ALERT_STORAGE_KEY);
  await closeOffscreenDocument();
  await updateBadgeForActiveTab();
}

async function restoreReminderAlertIfNeeded(): Promise<void> {
  const result = await getLocalStorage([
    ACTIVE_REMINDER_ALERT_STORAGE_KEY,
    PENDING_REMINDERS_STORAGE_KEY,
  ]);
  const alert = getActiveReminderAlert(result[ACTIVE_REMINDER_ALERT_STORAGE_KEY]);
  const pendingCount = normalizePendingReminders(result[PENDING_REMINDERS_STORAGE_KEY]).length;

  if (!alert || pendingCount === 0) {
    await chrome.storage.local.remove(ACTIVE_REMINDER_ALERT_STORAGE_KEY);
    return;
  }

  const remainingMs = alert.expiresAt - Date.now();
  await ensureOffscreenDocument();
  await sendReminderAudioMessage({
    target: 'tabnotes-reminder-audio',
    type: 'START_REMINDER_AUDIO',
    durationMs: remainingMs,
  });
  startBadgeFlashLoop(alert.expiresAt);
}

function createClipContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    // Ignore benign errors from menu cleanup during extension reloads.
    void chrome.runtime.lastError;
    chrome.contextMenus.create(
      {
        id: CLIP_SELECTION_CONTEXT_MENU_ID,
        title: chrome.i18n.getMessage('contextMenuClipSelection') || 'Clip selection to TabNotes',
        contexts: ['selection'],
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  });
}


// ── Badge updater ─────────────────────────────────────────────────────────────

async function updateBadge(tabId: number, url: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      'tabnotes_data',
      PENDING_REMINDERS_STORAGE_KEY,
    ]);
    const pendingCount = normalizePendingReminders(result[PENDING_REMINDERS_STORAGE_KEY]).length;

    if (pendingCount > 0) {
      chrome.action.setBadgeText({ text: pendingCount > 99 ? '99+' : String(pendingCount), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#dcae19', tabId });
      chrome.action.setBadgeTextColor({ color: '#111318', tabId });
      return;
    }

    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url === 'chrome://newtab/') {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const data = result['tabnotes_data'] as {
      notes_url?: Record<string, { scope: string; scopeKey: string; url?: string }>;
      notes_domain?: Record<string, { scope: string; scopeKey: string; url?: string }>;
      notes_workspace?: Record<string, { scope: string; scopeKey: string; url?: string }>;
      notes_global?: Record<string, { scope: string; scopeKey: string; url?: string }>;
      activeWorkspaceId?: string | null;
    } | undefined;

    const allNotes = [
      ...Object.values(data?.notes_url ?? {}),
      ...Object.values(data?.notes_domain ?? {}),
      ...Object.values(data?.notes_workspace ?? {}),
      ...Object.values(data?.notes_global ?? {}),
    ];

    if (allNotes.length === 0) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const wsId = data?.activeWorkspaceId ?? null;
    const currentUrlKey = normalizeUrl(url);
    const currentDomainKey = normalizeDomain(url);
    const currentWorkspaceKey = wsId ?? 'default';

    const count = allNotes.filter(n => {
      if (n.scope === 'url') return n.scopeKey === currentUrlKey;
      if (n.scope === 'domain') return n.scopeKey === currentDomainKey;
      if (n.scope === 'workspace') return n.scopeKey === currentWorkspaceKey;
      return false;
    }).length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#4f6ef7', tabId });
      chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

async function updateBadgeForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url) await updateBadge(tab.id, tab.url);
}

// ── Daily Digest ──────────────────────────────────────────────────────────────

interface DigestSettings { enabled?: boolean; time?: string; }

async function scheduleDigest(): Promise<void> {
  chrome.alarms.clear('tn_daily_digest');
  const result = await chrome.storage.local.get('tn_digest');
  const settings = (result['tn_digest'] as DigestSettings | undefined) ?? {};
  if (!settings.enabled) return;

  const [h, m] = (settings.time ?? '09:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

  chrome.alarms.create('tn_daily_digest', {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  });
}

async function fireDigest(): Promise<void> {
  const result = await chrome.storage.local.get(['tabnotes_data', 'tn_digest']);
  const settings = (result['tn_digest'] as DigestSettings | undefined) ?? {};
  if (!settings.enabled) return;

  const data = result['tabnotes_data'] as {
    notes_url?: Record<string, { updatedAt?: number; createdAt?: number; title?: string; content?: string }>;
    notes_domain?: Record<string, { updatedAt?: number; createdAt?: number; title?: string; content?: string }>;
    notes_workspace?: Record<string, { updatedAt?: number; createdAt?: number; title?: string; content?: string }>;
    notes_global?: Record<string, { updatedAt?: number; createdAt?: number; title?: string; content?: string }>;
  } | undefined;

  const notes = [
    ...Object.values(data?.notes_url ?? {}),
    ...Object.values(data?.notes_domain ?? {}),
    ...Object.values(data?.notes_workspace ?? {}),
    ...Object.values(data?.notes_global ?? {}),
  ];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = notes.filter(n => (n.updatedAt ?? 0) > cutoff || (n.createdAt ?? 0) > cutoff);
  const total = notes.length;

  const message = recent.length > 0
    ? chrome.i18n.getMessage(recent.length === 1 ? 'digestRecent_one' : 'digestRecent_other', [String(recent.length), String(total)])
    : chrome.i18n.getMessage(total === 1 ? 'digestNoChanges_one' : 'digestNoChanges_other', [String(total)]);

  chrome.notifications.create('tn_digest_' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: chrome.i18n.getMessage('digestTitle'),
    message,
    priority: 1,
  });
}

// ── Backup reminder ───────────────────────────────────────────────────────────

async function scheduleBackupCheck(): Promise<void> {
  chrome.alarms.create('tn_backup_check', { periodInMinutes: 24 * 60, delayInMinutes: 1 });
}

async function checkBackupReminder(): Promise<void> {
  const result = await chrome.storage.local.get(['tn_backup_remind', 'tn_last_export']);
  const days = (result['tn_backup_remind'] as { days?: number } | undefined)?.days ?? 7;
  if (!days) return; // 0 = off

  const lastExport = (result['tn_last_export'] as number | undefined) ?? 0;
  const msElapsed = Date.now() - lastExport;
  const msDue = days * 24 * 60 * 60 * 1000;
  if (msElapsed < msDue) return;

  const daysSince = lastExport === 0 ? null : Math.floor(msElapsed / (24 * 60 * 60 * 1000));
  const message = daysSince === null
    ? chrome.i18n.getMessage('backupNever')
    : chrome.i18n.getMessage(daysSince === 1 ? 'backupReminderMessage_one' : 'backupReminderMessage_other', [String(daysSince)]);
  const btnTitle = chrome.i18n.getMessage('backupOpenButton');

  chrome.notifications.create('tn_backup_remind_' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: chrome.i18n.getMessage('backupReminderTitle'),
    message,
    priority: 1,
    buttons: [{ title: btnTitle }],
  });
}

// ── Note reminders ───────────────────────────────────────────────────────────

async function getPendingReminders(): Promise<PendingNoteReminder[]> {
  const result = await getLocalStorage(PENDING_REMINDERS_STORAGE_KEY);
  return normalizePendingReminders(result[PENDING_REMINDERS_STORAGE_KEY]);
}

async function setPendingReminders(reminders: PendingNoteReminder[]): Promise<void> {
  await setLocalStorage({
    [PENDING_REMINDERS_STORAGE_KEY]: normalizePendingReminders(reminders),
  });
  await updateBadgeForActiveTab();
}

async function scheduleNoteReminderAlarm(noteId: string, reminderAt: unknown): Promise<boolean> {
  if (!noteId) return false;

  const alarmName = createNoteReminderAlarmName(noteId);
  await clearAlarm(alarmName);

  if (!isFutureReminderTimestamp(reminderAt)) return false;

  chrome.alarms.create(alarmName, { when: reminderAt });
  return true;
}

async function dismissPendingReminder(noteId: string): Promise<void> {
  const reminders = await getPendingReminders();
  const remaining = removePendingReminder(reminders, noteId);
  await setPendingReminders(remaining);
  if (remaining.length === 0) {
    await stopReminderAlert();
  }
}

async function requestOpenReminder(noteId: string): Promise<void> {
  await stopReminderAlert();
  await setLocalStorage({
    [OPEN_REMINDER_REQUEST_STORAGE_KEY]: {
      noteId,
      requestedAt: Date.now(),
    },
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
}

function findReminderNote(
  data: ReminderStorageData | undefined,
  noteId: string
): { foundScope: ReminderCollectionKey; note: ReminderNote } | null {
  for (const colKey of REMINDER_COLLECTION_KEYS) {
    const note = data?.[colKey]?.[noteId];
    if (note) return { foundScope: colKey, note };
  }
  return null;
}

async function fireNoteReminder(noteId: string): Promise<void> {
  const result = await getLocalStorage('tabnotes_data');
  const data = result['tabnotes_data'] as ReminderStorageData | undefined;
  const found = findReminderNote(data, noteId);

  if (!found) return;

  const firedAt = Date.now();
  const preview = stripReminderText(found.note.content).slice(0, 120);
  const title =
    stripReminderText(found.note.title) ||
    preview.slice(0, 60) ||
    chrome.i18n.getMessage('noteReminderDefault');

  const reminders = await getPendingReminders();
  await setPendingReminders(
    upsertPendingReminder(reminders, {
      id: createPendingReminderId(noteId, firedAt),
      noteId,
      title,
      preview,
      firedAt,
      reminderAt: found.note.reminderAt,
      scope: found.note.scope,
      scopeKey: found.note.scopeKey,
      workspaceId: found.note.workspaceId ?? null,
    })
  );

  chrome.notifications.create(createNoteReminderNotificationId(noteId), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: chrome.i18n.getMessage('noteReminderTitle'),
    message: title,
    priority: 2,
    buttons: [
      { title: getNotificationButtonTitle('noteReminderOpenButton', 'Open note') },
      { title: getNotificationButtonTitle('noteReminderSnoozeButton', 'Snooze 10 min') },
    ],
  });
  await startReminderAlert(noteId);

  const updatedCol = { ...(data?.[found.foundScope] ?? {}) };
  if (updatedCol[noteId]) {
    updatedCol[noteId] = { ...updatedCol[noteId], reminderAt: undefined };
  }

  await setLocalStorage({
    tabnotes_data: {
      ...(data ?? {}),
      [found.foundScope]: updatedCol,
    },
  });
}

async function updateNoteReminderAt(noteId: string, reminderAt: number | undefined): Promise<void> {
  const result = await getLocalStorage('tabnotes_data');
  const data = result['tabnotes_data'] as ReminderStorageData | undefined;
  const found = findReminderNote(data, noteId);

  if (!found) return;

  const updatedCol = { ...(data?.[found.foundScope] ?? {}) };
  updatedCol[noteId] = {
    ...updatedCol[noteId],
    reminderAt,
  };

  await setLocalStorage({
    tabnotes_data: {
      ...(data ?? {}),
      [found.foundScope]: updatedCol,
    },
  });
}

async function snoozeReminder(noteId: string, minutes = DEFAULT_SNOOZE_MINUTES): Promise<number | null> {
  const boundedMinutes = Number.isFinite(minutes) ? Math.max(1, Math.min(24 * 60, minutes)) : DEFAULT_SNOOZE_MINUTES;
  const reminderAt = roundUpToMinute(Date.now() + boundedMinutes * 60 * 1000);

  await updateNoteReminderAt(noteId, reminderAt);
  const scheduled = await scheduleNoteReminderAlarm(noteId, reminderAt);
  if (!scheduled) return null;

  await dismissPendingReminder(noteId);
  return reminderAt;
}

async function restoreNoteReminderAlarms(): Promise<{
  cleared: number;
  scheduled: number;
  fired: number;
}> {
  const existingAlarms = await getAllAlarms();
  const noteAlarms = existingAlarms.filter((alarm) =>
    alarm.name.startsWith(NOTE_REMINDER_ALARM_PREFIX)
  );
  await Promise.all(noteAlarms.map((alarm) => clearAlarm(alarm.name)));

  const result = await getLocalStorage('tabnotes_data');
  const data = result['tabnotes_data'] as ReminderStorageData | undefined;
  if (!data) return { cleared: noteAlarms.length, scheduled: 0, fired: 0 };

  const now = Date.now();
  const overdueNoteIds = new Set<string>();
  let scheduled = 0;

  for (const colKey of REMINDER_COLLECTION_KEYS) {
    for (const [noteId, note] of Object.entries(data[colKey] ?? {})) {
      if (!isReminderTimestamp(note.reminderAt)) continue;

      if (note.reminderAt > now) {
        chrome.alarms.create(createNoteReminderAlarmName(noteId), { when: note.reminderAt });
        scheduled += 1;
      } else {
        overdueNoteIds.add(noteId);
      }
    }
  }

  for (const noteId of overdueNoteIds) {
    await fireNoteReminder(noteId);
  }

  return {
    cleared: noteAlarms.length,
    scheduled,
    fired: overdueNoteIds.size,
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
  createClipContextMenu();
  updateBadgeForActiveTab();
  scheduleDigest();
  scheduleBackupCheck();
  void scheduleDrivePeriodicSync().catch(() => undefined);
  void restoreNoteReminderAlarms().catch(() => undefined);
  void restoreReminderAlertIfNeeded().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  createClipContextMenu();
  scheduleDigest();
  scheduleBackupCheck();
  void scheduleDrivePeriodicSync().catch(() => undefined);
  void restoreNoteReminderAlarms().catch(() => undefined);
  void restoreReminderAlertIfNeeded().catch(() => undefined);
});

// ── Open side panel on icon click ─────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CLIP_SELECTION_CONTEXT_MENU_ID) return;
  const text = info.selectionText?.trim();
  if (!text) return;

  void (async () => {
    const sourceUrl = info.pageUrl || tab?.url || '';
    await chrome.storage.local.set({
      [PENDING_CLIP_STORAGE_KEY]: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        sourceUrl,
        sourceTitle: tab?.title || sourceUrl,
        createdAt: Date.now(),
      },
    });

    if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
  })().catch(() => undefined);
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-side-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
  }
  if (command === 'quick-capture') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // Open panel first, then set flag — panel reads it on load or via onChanged
      chrome.sidePanel.open({ tabId: tab.id });
      await chrome.storage.local.set({ tn_quick_capture: Date.now() });
    }
  }
});

// ── Badge: update when active tab changes ─────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) await updateBadge(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.active) {
    await updateBadge(tabId, tab.url);
  }
});

// ── Badge: update when notes change in storage ────────────────────────────────

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  if (changes['tabnotes_data'] || changes[PENDING_REMINDERS_STORAGE_KEY]) {
    await updateBadgeForActiveTab();
  }

  if (
    changes[PENDING_REMINDERS_STORAGE_KEY] &&
    normalizePendingReminders(changes[PENDING_REMINDERS_STORAGE_KEY].newValue).length === 0
  ) {
    await stopReminderAlert();
  }

  if (changes['tabnotes_data']) {
    const isDriveRemoteApply = Boolean(changes[DRIVE_REMOTE_APPLY_STORAGE_KEY]);
    if (!isDriveRemoteApply) {
      await recordDriveDeletionTombstones(
        changes['tabnotes_data'].oldValue,
        changes['tabnotes_data'].newValue,
      );
      await scheduleDriveAutoSync();
    }
  }
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (handleDriveMessage(msg, sendResponse)) return true;

  // CAPTURE_TAB: take a screenshot of the active tab
  if (msg.type === 'CAPTURE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]?.windowId) { sendResponse({ error: 'No active tab' }); return; }
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'jpeg', quality: 40 });
        sendResponse({ dataUrl });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    });
    return true;
  }

  // SET_DIGEST: save digest settings and reschedule alarm
  if (msg.type === 'SET_DIGEST') {
    (async () => {
      await chrome.storage.local.set({ tn_digest: { enabled: msg.enabled, time: msg.time } });
      await scheduleDigest();
      sendResponse({ ok: true });
    })();
    return true;
  }

  // SET_BACKUP_REMIND: save backup reminder interval
  if (msg.type === 'SET_BACKUP_REMIND') {
    (async () => {
      await chrome.storage.local.set({ tn_backup_remind: { days: msg.days } });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // SET_REMINDER: schedule a chrome.alarms reminder for a note
  if (msg.type === 'SET_REMINDER') {
    (async () => {
      const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
      const ok = await scheduleNoteReminderAlarm(noteId, msg.reminderAt);
      if (ok) await dismissPendingReminder(noteId);
      sendResponse(ok ? { ok: true } : { ok: false, error: 'INVALID_REMINDER_TIME' });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }
  // CLEAR_REMINDER: cancel a scheduled alarm
  if (msg.type === 'CLEAR_REMINDER') {
    (async () => {
      if (typeof msg.noteId === 'string') {
        await clearAlarm(createNoteReminderAlarmName(msg.noteId));
        await dismissPendingReminder(msg.noteId);
      }
      sendResponse({ ok: true });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (msg.type === 'DISMISS_REMINDER') {
    (async () => {
      const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
      if (noteId) await dismissPendingReminder(noteId);
      sendResponse({ ok: true });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (msg.type === 'SNOOZE_REMINDER') {
    (async () => {
      const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
      const minutes = typeof msg.minutes === 'number' ? msg.minutes : DEFAULT_SNOOZE_MINUTES;
      const reminderAt = noteId ? await snoozeReminder(noteId, minutes) : null;
      sendResponse(
        reminderAt
          ? { ok: true, reminderAt }
          : { ok: false, error: 'UNABLE_TO_SNOOZE_REMINDER' }
      );
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (msg.type === 'OPEN_REMINDER') {
    (async () => {
      const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
      if (noteId) await requestOpenReminder(noteId);
      sendResponse({ ok: Boolean(noteId) });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (msg.type === 'RESTORE_REMINDER_ALARMS') {
    (async () => {
      const result = await restoreNoteReminderAlarms();
      sendResponse({ ok: true, result });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }
});

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (await handleDriveAlarm(alarm.name)) return;

  // Daily digest
  if (alarm.name === 'tn_daily_digest') {
    await fireDigest();
    return;
  }

  // Backup reminder check
  if (alarm.name === 'tn_backup_check') {
    await checkBackupReminder();
    return;
  }

  const noteId = parseNoteReminderAlarmName(alarm.name);
  if (!noteId) return;

  try {
    await fireNoteReminder(noteId);
  } catch {
    // Notification cleanup is best-effort.
  }
});

// ── Notification click → open sidepanel ───────────────────────────────────────

chrome.notifications.onClicked.addListener(async (notifId) => {
  const reminderNoteId = parseNoteReminderNotificationId(notifId);
  if (reminderNoteId) {
    await requestOpenReminder(reminderNoteId);
    chrome.notifications.clear(notifId);
    return;
  }

  if (!notifId.startsWith('tn_digest_') && !notifId.startsWith('tn_backup_remind_')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
  chrome.notifications.clear(notifId);
});

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  const reminderNoteId = parseNoteReminderNotificationId(notifId);
  if (reminderNoteId) {
    if (buttonIndex === 0) {
      await requestOpenReminder(reminderNoteId);
    } else {
      await snoozeReminder(reminderNoteId, DEFAULT_SNOOZE_MINUTES);
    }
    chrome.notifications.clear(notifId);
    return;
  }

  if (!notifId.startsWith('tn_backup_remind_')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
  chrome.notifications.clear(notifId);
});
