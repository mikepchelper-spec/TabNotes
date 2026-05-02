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

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true });
  updateBadgeForActiveTab();
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
    return true; // keep message channel open for async sendResponse
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
  // CLIP_TEXT: forwarded automatically to any open extension pages (sidepanel listens directly)
});

// ── Reminder alarms ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('tn_reminder_')) return;
  const noteId = alarm.name.replace('tn_reminder_', '');

  // Read note from storage to get title
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

    // Clear the reminderAt from the note so it doesn't re-trigger
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
  if (!notifId.startsWith('tn_notif_')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id });
  chrome.notifications.clear(notifId);
});
