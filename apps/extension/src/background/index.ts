// ── Helpers (inline, no imports needed in service worker) ────────────────────

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

// Returns all scope keys that could match a given tab URL
function scopeKeysForUrl(url: string, workspaceId: string | null): string[] {
  return [
    normalizeUrl(url),    // url scope
    normalizeDomain(url), // domain scope
    workspaceId ?? 'default', // workspace scope
    '',                   // global scope
  ];
}

// ── Badge updater ─────────────────────────────────────────────────────────────

async function updateBadge(tabId: number, url: string): Promise<void> {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url === 'chrome://newtab/') {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  try {
    const result = await chrome.storage.local.get('tabnotes_data');
    const data = result['tabnotes_data'] as {
      notes?: Record<string, { scopeKey: string; url?: string }>;
      activeWorkspaceId?: string | null;
    } | undefined;

    if (!data?.notes) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const wsId = data.activeWorkspaceId ?? null;
    const validKeys = new Set(scopeKeysForUrl(url, wsId));
    const count = Object.values(data.notes).filter(n => validKeys.has(n.scopeKey)).length;

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
    notes?: Record<string, { updatedAt?: number; createdAt?: number; title?: string; content?: string }>;
  } | undefined;

  const notes = Object.values(data?.notes ?? {});
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = notes.filter(n => (n.updatedAt ?? 0) > cutoff || (n.createdAt ?? 0) > cutoff);
  const total = notes.length;

  const message = recent.length > 0
    ? `${recent.length} note${recent.length !== 1 ? 's' : ''} updated in the last 24h — ${total} total`
    : `No changes yesterday — ${total} note${total !== 1 ? 's' : ''} in your collection`;

  chrome.notifications.create('tn_digest_' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '📓 TabNotes Daily Digest',
    message,
    priority: 1,
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
  updateBadgeForActiveTab();
  scheduleDigest();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDigest();
});

// ── Open side panel on icon click ─────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
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
  if (area === 'local' && changes['tabnotes_data']) {
    await updateBadgeForActiveTab();
  }
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

  // SET_REMINDER: schedule a chrome.alarms reminder for a note
  if (msg.type === 'SET_REMINDER') {
    const alarmName = 'tn_reminder_' + msg.noteId;
    chrome.alarms.clear(alarmName);
    if (msg.reminderAt && msg.reminderAt > Date.now()) {
      chrome.alarms.create(alarmName, { when: msg.reminderAt });
    }
  }
  // CLEAR_REMINDER: cancel a scheduled alarm
  if (msg.type === 'CLEAR_REMINDER') {
    chrome.alarms.clear('tn_reminder_' + msg.noteId);
  }
});

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Daily digest
  if (alarm.name === 'tn_daily_digest') {
    await fireDigest();
    return;
  }

  if (!alarm.name.startsWith('tn_reminder_')) return;
  const noteId = alarm.name.replace('tn_reminder_', '');

  try {
    const result = await chrome.storage.local.get('tabnotes_data');
    const data = result['tabnotes_data'] as {
      notes?: Record<string, { title?: string; content?: string }>;
    } | undefined;
    const note = data?.notes?.[noteId];
    const title = note?.title || (note?.content?.trim().split('\n')[0].slice(0, 60)) || 'TabNotes reminder';

    chrome.notifications.create('tn_notif_' + noteId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '⏰ TabNotes Reminder',
      message: title,
      priority: 2,
    });

    const notes = { ...(data?.notes ?? {}) };
    if (notes[noteId]) {
      notes[noteId] = { ...notes[noteId], reminderAt: undefined } as typeof notes[string];
    }
    await chrome.storage.local.set({
      tabnotes_data: { ...(data ?? {}), notes },
    });
  } catch {}
});

// ── Notification click → open sidepanel ───────────────────────────────────────

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith('tn_notif_') && !notifId.startsWith('tn_digest_')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
  chrome.notifications.clear(notifId);
});
