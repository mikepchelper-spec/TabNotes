import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Note, NoteScope, Workspace,
  ChromeStorageAdapter, NotesService, WorkspacesService, StorageData,
  normalizeUrl, normalizeDomain, formatRelativeTime, searchNotes,
  exportData, importData,
} from '@tabnotes/shared';
import type { ExportData } from '@tabnotes/shared';
import './sidepanel.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cr: any = (typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).chrome)
  ? (globalThis as Record<string, unknown>).chrome
  : null;

type View = 'note' | 'all' | 'settings' | 'graph' | 'chat';

const SCOPE_OPTIONS: { value: NoteScope; label: string; icon: string; desc: string }[] = [
  { value: 'url',       label: 'URL',       icon: '🔗', desc: 'Exact page URL' },
  { value: 'domain',    label: 'Domain',    icon: '🌐', desc: 'Entire site' },
  { value: 'workspace', label: 'Workspace', icon: '⊞', desc: 'Your project' },
  { value: 'global',    label: 'Global',    icon: '🌍', desc: 'Everywhere' },
];

const NOTE_COLORS = [
  { value: '', label: 'Default' },
  { value: '#fef9c3', label: 'Yellow' },
  { value: '#dcfce7', label: 'Green' },
  { value: '#dbeafe', label: 'Blue' },
  { value: '#fce7f3', label: 'Pink' },
  { value: '#ede9fe', label: 'Purple' },
];

const TEMPLATES = [
  {
    label: '📋 Meeting',
    title: 'Meeting Notes',
    content: '## Attendees\n- \n\n## Agenda\n1. \n\n## Decisions\n- \n\n## Action Items\n- [ ] ',
  },
  {
    label: '✅ To-Do',
    title: 'To-Do List',
    content: '## Today\n- [ ] \n- [ ] \n- [ ] \n\n## This week\n- [ ] \n- [ ] ',
  },
  {
    label: '🔬 Research',
    title: 'Research',
    content: '## Goal\n\n## Sources\n- \n\n## Key findings\n\n## Summary\n',
  },
  {
    label: '📅 Daily Log',
    title: '',
    content: '',
    dynamic: true,
  },
];

function readingTime(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 50) return '';
  return `~${Math.ceil(words / 200)} min`;
}

function parseMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Checked tasks
    .replace(/^- \[x\] (.+)$/gim, '<li class="tn-task tn-done"><input type="checkbox" checked data-task="true" /><span>$1</span></li>')
    // Unchecked tasks
    .replace(/^- \[ \] (.+)$/gim, '<li class="tn-task"><input type="checkbox" data-task="true" /><span>$1</span></li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="tn-wikilink" data-wiki="$1">[[<u>$1</u>]]</span>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul]|<p)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

function autoTitleFromContent(c: string): string {
  const first = c.trim().split('\n')[0].replace(/^#+\s*/, '').replace(/^- \[.?\] /, '').trim();
  return first.slice(0, 60);
}

// ── Crypto utilities ──────────────────────────────────────────
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
async function encryptText(text: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  const buf = new Uint8Array(28 + cipher.byteLength);
  buf.set(salt, 0); buf.set(iv, 16); buf.set(new Uint8Array(cipher), 28);
  return btoa(String.fromCharCode(...buf));
}
async function decryptText(data: string, password: string): Promise<string> {
  const buf  = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const key  = await deriveKey(password, buf.slice(0, 16));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(16, 28) }, key, buf.slice(28));
  return new TextDecoder().decode(plain);
}

// ── Note graph component ──────────────────────────────────────
function NoteGraph({ notes, activeId, onSelect }: {
  notes: Note[]; activeId: string | null; onSelect: (n: Note) => void;
}) {
  const W = 310, H = 280, cx = W / 2, cy = H / 2;
  const active = notes.find((n) => n.id === activeId);
  const others = notes.filter((n) => n.id !== activeId).slice(0, 9);

  const wikiLinks = new Set<string>();
  if (active) {
    for (const m of [...active.content.matchAll(/\[\[(.+?)\]\]/g)]) wikiLinks.add(m[1].toLowerCase());
  }

  const nodes = others.map((n, i) => {
    const angle = (i / Math.max(others.length, 1)) * 2 * Math.PI - Math.PI / 2;
    const r = 105;
    const label = (n.title || n.content.trim().split('\n')[0]).slice(0, 10);
    const linked = wikiLinks.has((n.title || '').toLowerCase());
    const shared = active ? active.tags.filter((t) => n.tags.includes(t)).length : 0;
    return { note: n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), label, linked, shared };
  });

  return (
    <svg width={W} height={H} style={{ display: 'block', margin: 'auto', overflow: 'visible' }}>
      {nodes.filter((n) => n.linked || n.shared > 0).map((n, i) => (
        <line key={i} x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke={n.linked ? '#2b5be8' : '#c8d0e0'}
          strokeWidth={n.linked ? 1.8 : 1}
          strokeDasharray={n.linked ? 'none' : '5 3'}
          opacity={.65}
        />
      ))}
      {nodes.map((n) => (
        <g key={n.note.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(n.note)}>
          <circle cx={n.x} cy={n.y} r={20}
            fill={n.linked ? '#edf1ff' : 'var(--bg-card, #fff)'}
            stroke={n.linked ? '#2b5be8' : n.shared > 0 ? '#5c83f5' : '#c8d0e0'}
            strokeWidth={n.linked || n.shared > 0 ? 2 : 1}
          />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={8.5}
            fill="var(--text, #222)" fontFamily="system-ui,sans-serif">
            {n.label}
          </text>
        </g>
      ))}
      {active && (
        <g>
          <circle cx={cx} cy={cy} r={26} fill="#2b5be8" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill="#fff"
            fontFamily="system-ui,sans-serif" fontWeight="600">
            {(active.title || active.content.split('\n')[0]).slice(0, 13)}
          </text>
        </g>
      )}
      {!active && (
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#aaa" fontFamily="system-ui">
          No note selected
        </text>
      )}
    </svg>
  );
}

function pillLabel(n: Note, idx: number): string {
  if (n.title?.trim()) return n.title.trim();
  if (n.content.trim()) {
    const first = n.content.trim().split('\n')[0];
    return first.length > 18 ? first.slice(0, 18) + '…' : first;
  }
  return `Note ${idx + 1}`;
}

export default function SidePanelApp() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('note');
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [markdownEnabled, setMdState] = useState(false);
  const [preview, setPreview] = useState(false);

  // Tab context
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');
  const [tabLoading, setTabLoading] = useState(false);

  // Notes / workspaces
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [contextNotes, setContextNotes] = useState<Note[]>([]);   // notes for current scope+URL
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [defaultScope, setDefaultScopeState] = useState<NoteScope>('domain');

  // Editor — active note within context
  const [scope, setScope] = useState<NoteScope>('domain');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Pills scroll state
  const pillsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [deletePillConfirmId, setDeletePillConfirmId] = useState<string | null>(null);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<string | null>(null);

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Collapsible scope groups — all collapsed by default
  const [collapsedScopes, setCollapsedScopes] = useState<Set<string>>(
    new Set(['url', 'domain', 'workspace', 'global'])
  );
  const toggleScope = (sc: string) =>
    setCollapsedScopes((prev) => { const n = new Set(prev); n.has(sc) ? n.delete(sc) : n.add(sc); return n; });

  // Workspace quick-switcher dropdown
  const [wsDropdown, setWsDropdown] = useState(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // Quick-capture: ref so the storage.onChanged handler can call it without stale closure
  const addNoteToContextRef = useRef<() => Promise<void>>(async () => {});

  // Tag filter in All Notes
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Copy to clipboard feedback
  const [copied, setCopied] = useState(false);

  // ── Daily Digest ──────────────────────────────────────────────
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestTime, setDigestTime] = useState('09:00');

  // ── Writing Streak ────────────────────────────────────────────
  const [streak, setStreak] = useState(0);

  // ── Chat / RAG ────────────────────────────────────────────────
  type ChatMsg = { role: 'user' | 'assistant'; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatScope, setChatScope]       = useState<'domain' | 'all'>('domain');
  const [groqKey, setGroqKey]           = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeyVisible, setGroqKeyVisible] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  // ── Command palette ───────────────────────────────────────────
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdQuery, setCmdQuery]             = useState('');
  const [cmdSelIdx, setCmdSelIdx]           = useState(0);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // ── Offline queue ─────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const [syncedToast, setSyncedToast] = useState(false);

  // ── Typewriter mode / Wiki autocomplete / Encryption ─────────
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [wikiAnchor, setWikiAnchor] = useState<{ start: number; end: number } | null>(null);
  const [showEncPrompt, setShowEncPrompt] = useState<'lock' | 'unlock' | null>(null);
  const [encPassword, setEncPassword] = useState('');
  const [encError, setEncError] = useState('');

  // ── History / Reminders / Reference panel ─────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const reminderRef = useRef<HTMLDivElement>(null);
  const [reminderInput, setReminderInput] = useState('');
  const [refNoteId, setRefNoteId] = useState<string | null>(null);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [clipFeedback, setClipFeedback] = useState(false);

  // ── Folders ───────────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderVal, setRenameFolderVal] = useState('');
  const [showMovePicker, setShowMovePicker] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Note colors & pins (stored in localStorage)
  const [noteColors, setNoteColors] = useState<Record<string, string>>({});
  const [pinnedNotes, setPinnedNotes] = useState<Set<string>>(new Set());
  const [colorPickerNoteId, setColorPickerNoteId] = useState<string | null>(null);

  // Font size: 12 | 13 | 15
  const [fontSize, setFontSizeState] = useState<number>(13);

  // Focus mode (hides all chrome, just editor)
  const [focusMode, setFocusMode] = useState(false);

  // Templates dropdown
  const [showTemplates, setShowTemplates] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);

  // Textarea ref (for cursor-based insertion)
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Services
  const adapter = useRef(new ChromeStorageAdapter());
  const noteSvc = useRef(new NotesService(adapter.current));
  const wsSvc = useRef(new WorkspacesService(adapter.current));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const contentSavedRef = useRef('');   // last content persisted — dirty-check for cross-tab sync
  const lastSaveTs = useRef(0);         // timestamp of our most recent save — skip our own writes

  // Refs for stable autosave (no stale closures)
  const activeNoteIdRef = useRef<string | null>(null);
  const scopeRef = useRef<NoteScope>('domain');
  const currentUrlRef = useRef('');
  const wsIdRef = useRef<string | null>(null);
  const activeFolderRef = useRef<string | null>(null);

  useEffect(() => { activeNoteIdRef.current = activeNoteId; }, [activeNoteId]);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  useEffect(() => { currentUrlRef.current = currentUrl; }, [currentUrl]);
  useEffect(() => { activeFolderRef.current = activeFolder; }, [activeFolder]);
  useEffect(() => { wsIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);

  // ── Load extra prefs from localStorage ───────────────────────
  useEffect(() => {
    try {
      const colors = localStorage.getItem('tn_colors');
      if (colors) setNoteColors(JSON.parse(colors));
      const pins = localStorage.getItem('tn_pins');
      if (pins) setPinnedNotes(new Set(JSON.parse(pins)));
      const fs = localStorage.getItem('tn_fontsize');
      if (fs) setFontSizeState(Number(fs));
    } catch { /* ignore */ }
  }, []);

  // ── Click outside → close workspace dropdown ─────────────────
  useEffect(() => {
    if (!wsDropdown) return;
    const handle = (e: MouseEvent) => {
      if (!wsDropdownRef.current?.contains(e.target as Node)) setWsDropdown(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [wsDropdown]);

  // ── Click outside → close templates dropdown ─────────────────
  useEffect(() => {
    if (!showTemplates) return;
    const handle = (e: MouseEvent) => {
      if (!templatesRef.current?.contains(e.target as Node)) setShowTemplates(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showTemplates]);

  // ── Click outside → close color picker ───────────────────────
  useEffect(() => {
    if (!colorPickerNoteId) return;
    const handle = (e: MouseEvent) => {
      const el = document.querySelector('.sp-color-picker');
      if (el && !el.contains(e.target as Node)) setColorPickerNoteId(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [colorPickerNoteId]);

  // ── Online / offline detection ────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Flush pending queue — notes are already in local storage, so "flush"
      // means marking them as synced and showing a toast
      setPendingSyncIds((prev) => {
        if (prev.size > 0) {
          setSyncedToast(true);
          setTimeout(() => setSyncedToast(false), 3000);
        }
        return new Set();
      });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Cross-tab real-time sync ──────────────────────────────────
  useEffect(() => {
    if (!cr?.storage?.onChanged) return;
    let t: ReturnType<typeof setTimeout>;

    const handler = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string,
    ) => {
      // Quick-capture: background sets this flag when Ctrl+Shift+N is pressed
      if (area === 'local' && changes['tn_quick_capture']?.newValue) {
        cr.storage.local.remove('tn_quick_capture');
        addNoteToContextRef.current().then(() => {
          setView('note');
          setTimeout(() => textareaRef.current?.focus(), 120);
        });
        return;
      }
      if (area !== 'local' || !changes.notes) return;
      // Skip if this change was triggered by our own save (within 1.2 s window)
      if (Date.now() - lastSaveTs.current < 1200) return;

      clearTimeout(t);
      t = setTimeout(async () => {
        // Refresh note lists
        const allUpdated = await noteSvc.current.getAllNotes();
        setAllNotes(allUpdated);
        const ctxUpdated = await noteSvc.current.getNotesByScope(
          scopeRef.current, currentUrlRef.current, wsIdRef.current,
        );
        setContextNotes(ctxUpdated);

        // Sync active note editor only when the user hasn't typed new content
        const id = activeNoteIdRef.current;
        if (id) {
          const remote = ctxUpdated.find((n) => n.id === id)
            ?? allUpdated.find((n) => n.id === id);
          if (remote && remote.content !== contentSavedRef.current) {
            // Remote has a newer version AND we haven't dirtied the editor
            setContent((localContent) => {
              if (localContent === contentSavedRef.current) {
                // Not dirty — adopt the remote version
                contentSavedRef.current = remote.content;
                setTitle(remote.title ?? '');
                setTags(remote.tags.join(', '));
                return remote.content;
              }
              return localContent; // dirty — preserve local edits
            });
          }
        }
      }, 250);
    };

    cr.storage.onChanged.addListener(handler);
    return () => { cr.storage.onChanged.removeListener(handler); clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Typewriter mode: keep cursor line vertically centered ─────
  useEffect(() => {
    if (!typewriterMode || !textareaRef.current) return;
    const el = textareaRef.current;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const line = el.value.substring(0, el.selectionStart ?? 0).split('\n').length;
    el.scrollTop = Math.max(0, (line - 1) * lh - el.clientHeight / 2 + lh);
  }, [content, typewriterMode]);

  // ── CLIP_TEXT listener (Web Clipper content script) ──────────
  useEffect(() => {
    if (!cr?.runtime?.onMessage) return;
    const handler = (msg: { type: string; text: string; sourceUrl: string; sourceTitle: string }) => {
      if (msg.type !== 'CLIP_TEXT') return;
      const clip = `\n\n> ${msg.text}\n\n— [${msg.sourceTitle || msg.sourceUrl}](${msg.sourceUrl})`;
      setContent((prev) => {
        const next = prev + clip;
        schedule(next, title, tags);
        return next;
      });
      setClipFeedback(true);
      setTimeout(() => setClipFeedback(false), 2000);
    };
    cr.runtime.onMessage.addListener(handler);
    return () => cr.runtime.onMessage.removeListener(handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Click outside → close history / reminder popups ──────────
  useEffect(() => {
    if (!showHistory && !showReminderPicker) return;
    const handle = (e: MouseEvent) => {
      if (showHistory && !historyRef.current?.contains(e.target as Node)) setShowHistory(false);
      if (showReminderPicker && !reminderRef.current?.contains(e.target as Node)) setShowReminderPicker(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showHistory, showReminderPicker]);

  // ── Click outside → close folder menu / move picker ──────────
  useEffect(() => {
    if (!folderMenuId && !showMovePicker) return;
    const handle = (e: MouseEvent) => {
      if (!folderMenuRef.current?.contains(e.target as Node)) {
        setFolderMenuId(null);
        setRenamingFolder(null);
      }
      const mp = document.querySelector('.sp-move-picker');
      if (mp && !mp.contains(e.target as Node)) setShowMovePicker(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [folderMenuId, showMovePicker]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrl) return;

      if (e.key === 's') {
        e.preventDefault();
        clearTimeout(saveTimer.current);
        saveNote(content, title, tags);
      } else if (e.key === 'd') {
        e.preventDefault();
        insertDatetime();
      } else if (e.key === 'k') {
        e.preventDefault();
        setCmdQuery(''); setCmdSelIdx(0); setShowCmdPalette(true);
        setTimeout(() => cmdInputRef.current?.focus(), 30);
      } else if (e.key === 'f' && e.shiftKey) {
        e.preventDefault();
        setFocusMode((p) => !p);
      } else if (e.key === 't' && e.shiftKey) {
        e.preventDefault();
        setTypewriterMode((p) => !p);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      } else if (e.key === 'Escape') {
        setWikiQuery(null); setWikiAnchor(null);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, tags, focusMode]);

  // ── Theme ─────────────────────────────────────────────────────
  useEffect(() => {
    const apply = (t: typeof theme) => {
      const resolved = t === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const h = (e: MediaQueryListEvent) =>
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      mq.addEventListener('change', h);
      return () => mq.removeEventListener('change', h);
    }
  }, [theme]);

  // ── Helpers ───────────────────────────────────────────────────
  const refreshAllNotes = useCallback(async () => {
    const notes = await noteSvc.current.getAllNotes();
    setAllNotes(notes);
    return notes;
  }, []);

  /** Load all notes for current scope+URL and activate one */
  const loadContextNotes = useCallback(async (
    url: string,
    sc: NoteScope,
    wsId: string | null,
    preferNoteId?: string | null,
  ) => {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      setContextNotes([]);
      setActiveNoteId(null); activeNoteIdRef.current = null;
      setContent(''); setTitle(''); setTags('');
      return;
    }

    const notes = await noteSvc.current.getNotesByScope(sc, url, wsId);
    setContextNotes(notes);

    const pick = preferNoteId
      ? (notes.find((n) => n.id === preferNoteId) ?? notes[0] ?? null)
      : (notes[0] ?? null);

    setActiveNoteId(pick?.id ?? null);
    activeNoteIdRef.current = pick?.id ?? null;
    setContent(pick?.content ?? '');
    setTitle(pick?.title ?? '');
    setTags(pick?.tags.join(', ') ?? '');
    setSaved(false);
    setPreview(false);
    setConfirmDelete(false);
  }, []);

  // ── Switch to a new tab URL ───────────────────────────────────
  const switchToTab = useCallback(async (url: string) => {
    setTabLoading(true);
    setCurrentUrl(url);
    setCurrentDomain(normalizeDomain(url));
    currentUrlRef.current = url;

    await Promise.all([
      refreshAllNotes(),
      loadContextNotes(url, scopeRef.current, wsIdRef.current),
    ]);
    setTabLoading(false);
  }, [loadContextNotes, refreshAllNotes]);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!cr?.tabs) { setLoading(false); return; }

    const init = async () => {
      const [storageData, wsId, wsList] = await Promise.all([
        adapter.current.get(),
        wsSvc.current.getActive(),
        wsSvc.current.getAll(),
      ]);

      const sc: NoteScope = (storageData as StorageData).defaultScope ?? 'domain';
      setDefaultScopeState(sc); setScope(sc); scopeRef.current = sc;
      setActiveWorkspaceId(wsId); wsIdRef.current = wsId;
      setWorkspaces(wsList);
      setMdState(storageData.markdownEnabled ?? false);
      setThemeState((storageData as unknown as { theme: typeof theme }).theme ?? 'system');

      // Load daily digest settings
      if (cr?.storage?.local?.get) {
        const digestResult = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_digest', res)
        );
        const d = digestResult['tn_digest'] as { enabled?: boolean; time?: string } | undefined;
        if (d) { setDigestEnabled(d.enabled ?? false); setDigestTime(d.time ?? '09:00'); }
      }

      // Load Groq API key
      if (cr?.storage?.local?.get) {
        const gk = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_groq_key', res)
        );
        if (gk['tn_groq_key']) {
          const key = gk['tn_groq_key'] as string;
          setGroqKey(key); setGroqKeyInput(key);
        }
      }

      // Load writing streak
      if (cr?.storage?.local?.get) {
        const sr = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_streak', res)
        );
        const s = sr['tn_streak'] as { count?: number } | undefined;
        if (s?.count) setStreak(s.count);
      }

      await refreshAllNotes();

      cr.tabs.query({ active: true, currentWindow: true }, async (tabs: { url?: string }[]) => {
        const url = tabs[0]?.url ?? '';
        setCurrentUrl(url);
        setCurrentDomain(normalizeDomain(url));
        currentUrlRef.current = url;
        await loadContextNotes(url, sc, wsId);

        // Quick-capture: check if the shortcut was pressed while panel was closed
        const qcData = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_quick_capture', res)
        );
        if (qcData['tn_quick_capture']) {
          cr.storage.local.remove('tn_quick_capture');
          await addNoteToContextRef.current();
          setView('note');
          setTimeout(() => textareaRef.current?.focus(), 120);
        }

        setLoading(false);
      });
    };

    init();
  }, [loadContextNotes, refreshAllNotes]);

  // ── Tab event listeners ───────────────────────────────────────
  useEffect(() => {
    if (!cr?.tabs) return;

    const onActivated = (info: { tabId: number }) => {
      cr.tabs.get(info.tabId, (tab: { url?: string }) => {
        if (cr.runtime.lastError) return;
        const url = tab?.url ?? '';
        if (url !== currentUrlRef.current) switchToTab(url);
      });
    };

    const onUpdated = (
      _tabId: number,
      changeInfo: { status?: string },
      tab: { active?: boolean; url?: string },
    ) => {
      if (!tab.active) return;
      if (changeInfo.status === 'complete' && tab.url && tab.url !== currentUrlRef.current) {
        switchToTab(tab.url);
      }
    };

    cr.tabs.onActivated.addListener(onActivated);
    cr.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cr.tabs.onActivated.removeListener(onActivated);
      cr.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [switchToTab]);

  // ── Pills scroll detection ────────────────────────────────────
  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    };
    el.addEventListener('scroll', update, { passive: true });
    // Use timeout so DOM has rendered with new pills
    const t = setTimeout(update, 50);
    return () => { el.removeEventListener('scroll', update); clearTimeout(t); };
  }, [contextNotes]);

  const scrollPills = (dir: 'left' | 'right') => {
    pillsRef.current?.scrollBy({ left: dir === 'right' ? 130 : -130, behavior: 'smooth' });
  };

  // ── Scope switch ──────────────────────────────────────────────
  const handleScopeChange = async (s: NoteScope) => {
    setScope(s); scopeRef.current = s;
    setPreview(false);
    clearTimeout(saveTimer.current);
    await loadContextNotes(currentUrlRef.current, s, wsIdRef.current);
    await refreshAllNotes();
  };

  // ── Note picker ───────────────────────────────────────────────
  const selectNote = (n: Note) => {
    clearTimeout(saveTimer.current);
    setActiveNoteId(n.id); activeNoteIdRef.current = n.id;
    setContent(n.content);
    setTitle(n.title ?? '');
    setTags(n.tags.join(', '));
    setSaved(false); setPreview(false); setConfirmDelete(false);
  };

  const addNoteToContext = async () => {
    const url = currentUrlRef.current;
    if (!url || url.startsWith('chrome://')) return;
    const folder = activeFolderRef.current ?? undefined;
    const created = await noteSvc.current.createNote({
      scope: scopeRef.current,
      url,
      workspaceId: wsIdRef.current,
      folder,
    });
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    selectNote(created);
    await refreshAllNotes();
    updateStreak();
  };
  addNoteToContextRef.current = addNoteToContext;

  // ── Autosave — uses refs, never stale ────────────────────────
  const saveNote = useCallback(async (c: string, t: string, tg: string) => {
    const id = activeNoteIdRef.current;
    const parsedTags = tg.split(',').map((s) => s.trim()).filter(Boolean);
    let saved: Note | null = null;

    if (id) {
      saved = await noteSvc.current.updateNote(id, {
        content: c, title: t || undefined, tags: parsedTags,
      });
    } else {
      const url = currentUrlRef.current;
      if (!url || url.startsWith('chrome://')) return;
      saved = await noteSvc.current.createNote({
        scope: scopeRef.current, url, workspaceId: wsIdRef.current,
        content: c, title: t || undefined, tags: parsedTags,
      });
    }

    if (saved) {
      activeNoteIdRef.current = saved.id;
      setActiveNoteId(saved.id);
      // Refresh context notes to reflect updated title in pill
      const url = currentUrlRef.current;
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
      setContextNotes(notes);
    }

    // Track what we just saved so cross-tab sync can tell it's not a remote change
    contentSavedRef.current = c;
    lastSaveTs.current = Date.now();

    // Track offline queue — note saved locally; will "sync" when reconnected
    if (!navigator.onLine && saved?.id) {
      setPendingSyncIds((prev) => new Set([...prev, saved.id]));
    }

    setSaved(true);
    await refreshAllNotes();
    updateStreak();
    setTimeout(() => setSaved(false), 2000);
  }, [refreshAllNotes, updateStreak]);

  const schedule = useCallback((c: string, t: string, tg: string) => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(c, t, tg), 600);
  }, [saveNote]);

  // ── Screenshot capture ───────────────────────────────────────
  const captureScreenshot = () => {
    cr?.runtime?.sendMessage({ type: 'CAPTURE_TAB' }, (res: { dataUrl?: string; error?: string }) => {
      if (!res?.dataUrl) return;
      const ts = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
      const insert = `\n\n![Screenshot ${ts}](${res.dataUrl})\n`;
      const next = content + insert;
      setContent(next); schedule(next, title, tags);
    });
  };

  // ── Export to PDF ────────────────────────────────────────────
  const exportToPDF = () => {
    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>${title || 'TabNote'}</title>
<style>
  body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.7}
  h1,h2,h3{font-family:system-ui,sans-serif}
  h1{border-bottom:2px solid #e5e7eb;padding-bottom:8px}
  code{background:#f5f5f5;padding:2px 5px;border-radius:3px;font-size:.88em}
  blockquote{border-left:3px solid #9ca3af;padding-left:16px;color:#6b7280;margin:0 0 1em}
  a{color:#2b5be8} ul{padding-left:20px} li{margin:3px 0}
  .meta{font-size:.8em;color:#9ca3af;padding-bottom:10px;margin-bottom:20px;border-bottom:1px solid #f0f0f0}
  @media print{body{margin:0}}
</style></head><body>
${title ? `<h1>${title}</h1>` : ''}
<div class="meta">${new Date().toLocaleString()}${currentDomain ? ` · ${currentDomain}` : ''}${tags ? ` · Tags: ${tags}` : ''}</div>
${parseMarkdown(content)}
<script>window.addEventListener('load',()=>window.print());<\/script>
</body></html>`;
    if (cr?.tabs?.create) {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      cr.tabs.create({ url });
    } else {
      const w = window.open('', '_blank'); w?.document.write(html); w?.document.close();
    }
  };

  // ── Note encryption ──────────────────────────────────────────
  const handleLockNote = async () => {
    if (!activeNoteId || !encPassword) return;
    try {
      const encrypted = await encryptText(content, encPassword);
      await noteSvc.current.updateNote(activeNoteId, {
        content: '🔐 This note is encrypted.', encrypted: true, encryptedData: encrypted,
      });
      setContent('🔐 This note is encrypted.');
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, currentUrlRef.current, wsIdRef.current);
      setContextNotes(notes); await refreshAllNotes();
      setShowEncPrompt(null); setEncPassword(''); setEncError('');
    } catch { setEncError('Encryption failed.'); }
  };

  const handleUnlockNote = async () => {
    const note = allNotes.find((n) => n.id === activeNoteId);
    if (!activeNoteId || !encPassword || !note?.encryptedData) return;
    try {
      const decrypted = await decryptText(note.encryptedData, encPassword);
      await noteSvc.current.updateNote(activeNoteId, {
        content: decrypted, encrypted: false, encryptedData: undefined,
      });
      setContent(decrypted);
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, currentUrlRef.current, wsIdRef.current);
      setContextNotes(notes); await refreshAllNotes();
      setShowEncPrompt(null); setEncPassword(''); setEncError('');
    } catch { setEncError('Wrong password.'); }
  };

  // ── Daily Digest save ────────────────────────────────────────
  const saveDigest = (enabled: boolean, time: string) => {
    cr?.runtime?.sendMessage({ type: 'SET_DIGEST', enabled, time });
  };

  // ── Chat / RAG ────────────────────────────────────────────────
  const rankNotes = React.useCallback((notes: Note[], query: string): Note[] => {
    if (!query.trim()) return [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return [...notes]
      .map((n) => {
        const text = `${n.title ?? ''} ${n.content}`.toLowerCase();
        const score = words.reduce((s, w) => s + (text.split(w).length - 1), 0);
        return { note: n, score };
      })
      .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
      .slice(0, 10)
      .map((x) => x.note);
  }, []);

  const sendChat = React.useCallback(async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    if (!groqKey) {
      setChatMessages((m) => [...m, { role: 'assistant', content: '⚠ Add your Groq API key in Settings first.' }]);
      return;
    }
    const pool = chatScope === 'domain'
      ? allNotes.filter((n) => n.scope === 'domain' && n.scopeKey === currentDomain)
      : allNotes;
    const relevant = rankNotes(pool, q);
    const scopeLabel = chatScope === 'domain' ? `domain: ${currentDomain || 'current site'}` : 'all notes';
    const contextStr = relevant.length > 0
      ? relevant.map((n) => `### ${n.title || 'Untitled'}\n${n.content.slice(0, 800)}`).join('\n\n---\n\n')
      : '(no notes found)';
    const system = `You are a personal knowledge assistant. Answer ONLY based on the user's notes below. If the answer isn't there, say so clearly. Be direct and concise.\n\nNotes from ${scopeLabel}:\n---\n${contextStr}\n---`;

    const userMsg = { role: 'user' as const, content: q };
    setChatMessages((m) => [...m, userMsg, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const history = [...chatMessages, userMsg].slice(-8);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: system },
            ...history.map((m) => ({ role: m.role, content: m.content })),
          ],
          stream: true, max_tokens: 1024, temperature: 0.3,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setChatMessages((m) => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: `❌ API error ${res.status}: ${errText.slice(0, 120)}` }; return n; });
        setChatLoading(false); return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'));
        for (const line of lines) {
          try {
            const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
            if (delta) { full += delta; setChatMessages((m) => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: full }; return n; }); }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (e) {
      setChatMessages((m) => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: `❌ ${String(e)}` }; return n; });
    }
    setChatLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatInput, chatLoading, groqKey, chatScope, allNotes, currentDomain, chatMessages, rankNotes]);

  // Auto-scroll chat to bottom
  React.useEffect(() => {
    if (view === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, view]);

  // ── Writing Streak update ─────────────────────────────────────
  const updateStreak = React.useCallback(async () => {
    if (!cr?.storage?.local) return;
    const today = new Date().toISOString().split('T')[0];
    const sr = await new Promise<Record<string, unknown>>((res) =>
      cr.storage.local.get('tn_streak', res)
    );
    const s = sr['tn_streak'] as { count?: number; lastDate?: string } | undefined;
    if (s?.lastDate === today) return; // already counted today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const newCount = s?.lastDate === yStr ? (s.count ?? 0) + 1 : 1;
    await new Promise<void>((res) =>
      cr.storage.local.set({ tn_streak: { count: newCount, lastDate: today } }, res)
    );
    setStreak(newCount);
  }, []);

  // ── Wiki link autocomplete ───────────────────────────────────
  const insertWikiLink = (noteTitle: string) => {
    if (!wikiAnchor || !textareaRef.current) return;
    const before = content.slice(0, wikiAnchor.start) + `[[${noteTitle}]]`;
    const next = before + content.slice(wikiAnchor.end);
    setContent(next); schedule(next, title, tags);
    setWikiQuery(null); setWikiAnchor(null);
    setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(before.length, before.length);
    }, 0);
  };

  // ── Bulk delete selected notes ────────────────────────────────
  const bulkDeleteNotes = async () => {
    clearTimeout(saveTimer.current);
    const ids = Array.from(bulkSelectedIds);
    await Promise.all(ids.map((id) => noteSvc.current.deleteNote(id)));
    setBulkSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    setSelectMode(false);
    // If active note was deleted, reset editor
    if (bulkSelectedIds.has(activeNoteIdRef.current ?? '')) {
      const url = currentUrlRef.current;
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
      setContextNotes(notes);
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Delete note by id (from list card) ───────────────────────
  const deleteCardNote = async (id: string) => {
    clearTimeout(saveTimer.current);
    await noteSvc.current.deleteNote(id);
    setDeleteCardConfirmId(null);
    // If we deleted the active note, clear editor
    if (id === activeNoteIdRef.current) {
      const url = currentUrlRef.current;
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
      setContextNotes(notes);
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Delete note by id (from pill ×) ──────────────────────────
  const deletePillNote = async (id: string) => {
    clearTimeout(saveTimer.current);
    await noteSvc.current.deleteNote(id);
    const url = currentUrlRef.current;
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    setDeletePillConfirmId(null);
    // If we deleted the active note, switch to first remaining
    if (id === activeNoteIdRef.current) {
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Settings helpers ──────────────────────────────────────────
  const setTheme = async (t: typeof theme) => {
    setThemeState(t);
    await adapter.current.set({ theme: t as 'light' | 'dark' | 'system' });
  };
  const setMarkdown = async (v: boolean) => {
    setMdState(v); setPreview(false);
    await adapter.current.set({ markdownEnabled: v });
  };
  const setDefaultScope = async (s: NoteScope) => {
    setDefaultScopeState(s);
    await adapter.current.set({ defaultScope: s });
  };

  // ── Copy note to clipboard ────────────────────────────────────
  const copyNote = async () => {
    const text = [title, content].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Insert date/time at cursor ────────────────────────────────
  const insertDatetime = () => {
    const ta = textareaRef.current;
    const now = new Date();
    const str = now.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    if (ta) {
      const start = ta.selectionStart ?? content.length;
      const end = ta.selectionEnd ?? content.length;
      const next = content.slice(0, start) + str + content.slice(end);
      setContent(next);
      schedule(next, title, tags);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + str.length, start + str.length);
      }, 0);
    } else {
      const next = content + (content ? '\n' : '') + str;
      setContent(next);
      schedule(next, title, tags);
    }
  };

  // ── Export current note as .md ────────────────────────────────
  const exportCurrentNote = () => {
    if (!content && !title) return;
    const text = [title ? `# ${title}` : '', content].filter(Boolean).join('\n\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (title || 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Note color ────────────────────────────────────────────────
  const setNoteColor = (noteId: string, color: string) => {
    const next = { ...noteColors };
    if (color) next[noteId] = color;
    else delete next[noteId];
    setNoteColors(next);
    localStorage.setItem('tn_colors', JSON.stringify(next));
    setColorPickerNoteId(null);
  };

  // ── Pin / unpin note ──────────────────────────────────────────
  const togglePin = (noteId: string) => {
    const next = new Set(pinnedNotes);
    next.has(noteId) ? next.delete(noteId) : next.add(noteId);
    setPinnedNotes(next);
    localStorage.setItem('tn_pins', JSON.stringify(Array.from(next)));
  };

  // ── Font size ─────────────────────────────────────────────────
  const changeFontSize = (dir: 1 | -1) => {
    const SIZES = [11, 12, 13, 14, 15, 16];
    const idx = SIZES.indexOf(fontSize);
    const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, idx + dir))];
    setFontSizeState(next);
    localStorage.setItem('tn_fontsize', String(next));
  };

  // ── Folder operations ─────────────────────────────────────────
  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = name.startsWith('/') ? name : '/' + name;
    setActiveFolder(folder);
    setShowNewFolder(false);
    setNewFolderName('');
    // Create a blank note in that folder so it persists
    const url = currentUrlRef.current;
    if (!url || url.startsWith('chrome://')) return;
    const created = await noteSvc.current.createNote({
      scope: scopeRef.current, url, workspaceId: wsIdRef.current, folder,
    });
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    selectNote(created);
    await refreshAllNotes();
  };

  const renameFolder = async (oldPath: string, newName: string) => {
    const newPath = newName.startsWith('/') ? newName : '/' + newName;
    const data = await adapter.current.get();
    const updates: Record<string, Note> = { ...data.notes };
    for (const [id, note] of Object.entries(updates)) {
      if (note.folder === oldPath) {
        updates[id] = { ...note, folder: newPath, updatedAt: Date.now() };
      }
    }
    await adapter.current.set({ notes: updates });
    if (activeFolder === oldPath) setActiveFolder(newPath);
    setRenamingFolder(null);
    setFolderMenuId(null);
    const url = currentUrlRef.current;
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    await refreshAllNotes();
  };

  const deleteFolder = async (path: string) => {
    const data = await adapter.current.get();
    const updates: Record<string, Note> = { ...data.notes };
    for (const [id, note] of Object.entries(updates)) {
      if (note.folder === path) {
        updates[id] = { ...note, folder: undefined, updatedAt: Date.now() };
      }
    }
    await adapter.current.set({ notes: updates });
    if (activeFolder === path) setActiveFolder(null);
    setFolderMenuId(null);
    const url = currentUrlRef.current;
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    await refreshAllNotes();
  };

  const moveNoteToFolder = async (noteId: string, folder: string | undefined) => {
    await noteSvc.current.updateNote(noteId, { folder });
    const url = currentUrlRef.current;
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    await refreshAllNotes();
    setShowMovePicker(false);
  };

  // ── Apply template ────────────────────────────────────────────
  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    let newTitle = tpl.title;
    let newContent = tpl.content;
    if (tpl.dynamic) {
      const d = new Date();
      newTitle = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      newContent = `# ${newTitle}\n\n## Done\n- \n\n## Notes\n\n## Tomorrow\n- `;
    }
    setTitle(newTitle);
    setContent(newContent);
    schedule(newContent, newTitle, tags);
    setShowTemplates(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Export / Import ───────────────────────────────────────────
  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setDataFeedback({ type, msg });
    setTimeout(() => setDataFeedback(null), 3500);
  };

  const handleExport = async () => {
    try {
      const data = await adapter.current.get();
      const payload = exportData(data);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `tabnotes-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('success', `Exported ${payload.notes.length} notes`);
    } catch {
      showFeedback('error', 'Export failed');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportData;
      if (!Array.isArray(parsed.notes)) throw new Error('Invalid format');
      const current = await adapter.current.get();
      const merged = importData(parsed, current);
      await adapter.current.set({ notes: merged.notes, workspaces: merged.workspaces });
      const [notes, wsList] = await Promise.all([
        noteSvc.current.getAllNotes(),
        wsSvc.current.getAll(),
      ]);
      setAllNotes(notes);
      setWorkspaces(wsList);
      const added = parsed.notes.length;
      showFeedback('success', `Imported ${added} note${added !== 1 ? 's' : ''}`);
    } catch {
      showFeedback('error', 'Invalid backup file');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  // ── Command palette items ─────────────────────────────────────
  type PaletteItem = { label: string; sublabel?: string; icon: string; shortcut?: string; run: () => void };
  const paletteItems: PaletteItem[] = React.useMemo(() => {
    const q = cmdQuery.toLowerCase().trim();
    const items: PaletteItem[] = [];

    // Notes — recent when no query, fuzzy-filtered when typing
    const notePool = q
      ? allNotes.filter((n) => `${n.title ?? ''} ${n.content}`.toLowerCase().includes(q)).slice(0, 8)
      : [...allNotes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    notePool.forEach((n) => items.push({
      label: n.title || n.content.split('\n')[0] || 'Untitled',
      sublabel: n.content.replace(/\n+/g, ' ').slice(0, 72).trim(),
      icon: n.encrypted ? '🔒' : '📝',
      run: () => { selectNote(n); setView('note'); },
    }));

    // Actions
    const actions: PaletteItem[] = [
      { label: 'New note',            icon: '✎',  run: () => { addNoteToContext(); setView('note'); } },
      { label: 'All Notes',           icon: '☰',  run: () => setView('all') },
      { label: 'Note Graph',          icon: '⬡',  run: () => setView('graph') },
      { label: 'Settings',            icon: '⚙',  run: () => setView('settings') },
      { label: 'Toggle Markdown',     icon: '◈',  run: () => setMdState((p) => !p) },
      { label: 'Toggle Focus mode',   icon: '⊡',  shortcut: 'Ctrl+Shift+F', run: () => setFocusMode((p) => !p) },
      { label: 'Toggle Typewriter',   icon: '✍',  shortcut: 'Ctrl+Shift+T', run: () => setTypewriterMode((p) => !p) },
      { label: 'Capture screenshot',  icon: '📸', run: () => captureScreenshot() },
      { label: 'Export to PDF',       icon: '🖨',  run: () => exportToPDF() },
      { label: 'Scope: URL',          icon: '🔗', run: () => handleScopeChange('url') },
      { label: 'Scope: Domain',       icon: '🌐', run: () => handleScopeChange('domain') },
      { label: 'Scope: Workspace',    icon: '⊞',  run: () => handleScopeChange('workspace') },
      { label: 'Scope: Global',       icon: '🌍', run: () => handleScopeChange('global') },
      ...workspaces.map((ws) => ({
        label: `Switch to workspace: ${ws.name}`,
        icon: '⊞',
        run: async () => {
          setActiveWorkspaceId(ws.id); wsIdRef.current = ws.id;
          await loadContextNotes(currentUrlRef.current, scopeRef.current, ws.id);
        },
      })),
    ];
    const filteredActions = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
    filteredActions.forEach((a) => items.push(a));

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmdQuery, allNotes, workspaces]);

  const paletteItemsRef = React.useRef(paletteItems);
  paletteItemsRef.current = paletteItems;

  // ── Derived ──────────────────────────────────────────────────
  const activeNote = contextNotes.find((n) => n.id === activeNoteId) ?? null;

  // Derive folder list from context notes
  const scopeFolders = [...new Set(contextNotes.map((n) => n.folder).filter(Boolean) as string[])].sort();

  // Filter by active folder, then sort pinned first
  const folderFilteredNotes = activeFolder === null
    ? contextNotes
    : contextNotes.filter((n) => (n.folder ?? '') === activeFolder || (activeFolder === '' && !n.folder));

  const sortedContextNotes = [...folderFilteredNotes].sort((a, b) => {
    const aPin = pinnedNotes.has(a.id) ? 0 : 1;
    const bPin = pinnedNotes.has(b.id) ? 0 : 1;
    return aPin - bPin;
  });

  const activeNoteColor = activeNoteId ? (noteColors[activeNoteId] ?? '') : '';

  const scopeKey =
    scope === 'url'       ? normalizeUrl(currentUrl) :
    scope === 'domain'    ? currentDomain :
    scope === 'workspace' ? (workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? 'Workspace') :
    'Global';

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const allTags = [...new Set(allNotes.flatMap((n) => n.tags))].sort();
  const filteredNotes = searchNotes(allNotes, searchQ)
    .filter((n) => tagFilter ? n.tags.includes(tagFilter) : true)
    .sort((a, b) => {
      const aPin = pinnedNotes.has(a.id) ? 0 : 1;
      const bPin = pinnedNotes.has(b.id) ? 0 : 1;
      return aPin - bPin || b.updatedAt - a.updatedAt;
    });
  const isRestrictedUrl = !currentUrl
    || currentUrl.startsWith('chrome://')
    || currentUrl.startsWith('chrome-extension://');

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Loading TabNotes…</span>
      </div>
    );
  }

  return (
    <div className={`sp-root${focusMode ? ' focus-mode' : ''}`}>

      {/* ── Header ── */}
      <div className="sp-header">
        <div className="sp-logo">
          <div className="sp-logo-mark">T</div>
          <span className="sp-logo-text">TabNotes</span>
        </div>
        <div className="sp-ws-dropdown-wrap" ref={wsDropdownRef}>
          <div
            className={`sp-workspace-pill${wsDropdown ? ' open' : ''}`}
            onClick={() => setWsDropdown(!wsDropdown)}
          >
            <div className="sp-workspace-dot" style={{ background: activeWs ? 'var(--accent)' : 'var(--text-subtle)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
              {activeWs ? activeWs.name : 'No Workspace'}
            </span>
            <span className="sp-ws-chevron">{wsDropdown ? '▴' : '▾'}</span>
          </div>
          {wsDropdown && (
            <div className="sp-ws-dropdown">
              <div
                className={`sp-ws-option${activeWorkspaceId === null ? ' active' : ''}`}
                onClick={async () => {
                  await wsSvc.current.setActive(null);
                  setActiveWorkspaceId(null); wsIdRef.current = null;
                  setWsDropdown(false);
                  await loadContextNotes(currentUrlRef.current, scopeRef.current, null);
                }}
              >
                <span>🌍</span> No Workspace
                {activeWorkspaceId === null && <span className="sp-ws-check">✓</span>}
              </div>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`sp-ws-option${activeWorkspaceId === ws.id ? ' active' : ''}`}
                  onClick={async () => {
                    await wsSvc.current.setActive(ws.id);
                    setActiveWorkspaceId(ws.id); wsIdRef.current = ws.id;
                    setWsDropdown(false);
                    await loadContextNotes(currentUrlRef.current, scopeRef.current, ws.id);
                  }}
                >
                  <span>⊞</span> {ws.name}
                  {activeWorkspaceId === ws.id && <span className="sp-ws-check">✓</span>}
                </div>
              ))}
              <div className="sp-ws-divider" />
              <div className="sp-ws-option manage" onClick={() => { setWsDropdown(false); setView('settings'); }}>
                ⚙ Manage workspaces
              </div>
            </div>
          )}
        </div>
        <div className="sp-header-actions">
          {tabLoading && <div className="sp-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />}

          {/* Writing streak */}
          {streak >= 2 && (
            <div className="tn-streak-badge" title={`${streak}-day writing streak! Keep it up.`}>
              🔥 {streak}
            </div>
          )}

          {/* Connection status indicator */}
          {!isOnline && (
            <div className="tn-offline-badge" title={`Offline — ${pendingSyncIds.size > 0 ? `${pendingSyncIds.size} note${pendingSyncIds.size !== 1 ? 's' : ''} queued for sync` : 'notes save locally as always'}`}>
              <span className="tn-offline-dot" />
              {pendingSyncIds.size > 0 && <span className="tn-offline-count">{pendingSyncIds.size}</span>}
            </div>
          )}
          {syncedToast && (
            <div className="tn-synced-toast">✓ All synced</div>
          )}

          <button
            className={`sp-icon-btn${view === 'graph' ? ' active' : ''}`}
            onClick={() => setView(view === 'graph' ? 'note' : 'graph')}
            title="Note graph view"
          >⬡</button>
          <button className="sp-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
            {theme === 'dark' ? '☀' : '☽'}
          </button>
          <button className="sp-icon-btn" onClick={() => cr?.runtime?.openOptionsPage()} title="Settings">⚙</button>
        </div>
      </div>

      {/* ── Scope bar ── */}
      {view === 'note' && (
        <div className="sp-scope-bar">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`sp-scope-btn ${scope === opt.value ? 'active' : ''}`}
              onClick={() => handleScopeChange(opt.value)}
              disabled={tabLoading}
            >
              <span className="sp-scope-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Context strip + note pills ── */}
      {view === 'note' && (
        <div className="sp-context-strip">
          <span className="sp-context-key" title={scopeKey}>
            {tabLoading ? 'Switching tab…' : (scopeKey || '—')}
          </span>
          <div className="sp-context-right">
            {!tabLoading && contextNotes.length > 0 && (
              <span className="sp-context-count">
                {contextNotes.length} {contextNotes.length === 1 ? 'note' : 'notes'}
              </span>
            )}
            {saved && (
              <span className="sp-save-badge">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Saved
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Folder bar ── */}
      {view === 'note' && !isRestrictedUrl && (scopeFolders.length > 0 || showNewFolder) && (
        <div className="sp-folder-bar" ref={folderMenuRef}>

          {/* All chip */}
          <button
            className={`sp-folder-chip${activeFolder === null ? ' active' : ''}`}
            onClick={() => setActiveFolder(null)}
          >📁 All</button>

          {/* Folder chips */}
          {scopeFolders.map((f) => (
            <div key={f} style={{ position: 'relative', flexShrink: 0 }}>
              {renamingFolder === f ? (
                <form
                  style={{ display: 'flex', gap: 3 }}
                  onSubmit={(e) => { e.preventDefault(); renameFolder(f, renameFolderVal); }}
                >
                  <input
                    className="sp-folder-rename-input"
                    value={renameFolderVal}
                    onChange={(e) => setRenameFolderVal(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFolder(null); }}
                  />
                  <button type="submit" className="sp-folder-chip active" style={{ padding: '2px 6px' }}>✓</button>
                </form>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <button
                    className={`sp-folder-chip${activeFolder === f ? ' active' : ''}`}
                    onClick={() => setActiveFolder(activeFolder === f ? null : f)}
                  >
                    📂 {f.replace(/^\//, '')}
                    <span className="sp-folder-chip-count">
                      {contextNotes.filter((n) => n.folder === f).length}
                    </span>
                  </button>
                  <button
                    className="sp-folder-menu-btn"
                    onClick={() => setFolderMenuId(folderMenuId === f ? null : f)}
                    title="Folder options"
                  >⋯</button>
                  {folderMenuId === f && (
                    <div className="sp-folder-menu">
                      <button className="sp-folder-menu-item" onClick={() => {
                        setRenamingFolder(f);
                        setRenameFolderVal(f.replace(/^\//, ''));
                        setFolderMenuId(null);
                      }}>✏ Rename</button>
                      <button className="sp-folder-menu-item danger" onClick={() => deleteFolder(f)}>
                        🗑 Delete folder
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* New folder input */}
          {showNewFolder ? (
            <form
              style={{ display: 'flex', gap: 3, flexShrink: 0 }}
              onSubmit={(e) => { e.preventDefault(); createFolder(); }}
            >
              <input
                ref={newFolderRef}
                className="sp-folder-rename-input"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name…"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }}}
              />
              <button type="submit" className="sp-folder-chip active" style={{ padding: '2px 6px' }}>✓</button>
            </form>
          ) : (
            <button
              className="sp-folder-chip new"
              onClick={() => setShowNewFolder(true)}
              title="New folder"
            >＋</button>
          )}
        </div>
      )}

      {/* ── Note picker pills ── */}
      {view === 'note' && !isRestrictedUrl && (
        <div className="sp-note-picker">
          {/* Left arrow — appears when pills are scrolled */}
          <button
            className={`sp-pill-arrow${canScrollLeft ? ' visible' : ''}`}
            onClick={() => scrollPills('left')}
            tabIndex={canScrollLeft ? 0 : -1}
            aria-hidden={!canScrollLeft}
          >‹</button>

          <div className="sp-note-pills" ref={pillsRef}>
            {sortedContextNotes.map((n, idx) => {
              const isActive = n.id === activeNoteId;
              const isConfirm = deletePillConfirmId === n.id;
              const isPinned = pinnedNotes.has(n.id);
              const color = noteColors[n.id];
              return (
                <div
                  key={n.id}
                  className={`sp-note-pill${isActive ? ' active' : ''}${isConfirm ? ' confirm' : ''}`}
                  style={color && !isActive ? { borderColor: color, background: color } : undefined}
                  onClick={() => {
                    if (isConfirm) {
                      deletePillNote(n.id);
                    } else {
                      setDeletePillConfirmId(null);
                      selectNote(n);
                    }
                  }}
                  title={isConfirm ? 'Click to confirm delete' : (n.title || `Note ${idx + 1}`)}
                  role="button"
                >
                  {isPinned && <span style={{ fontSize: 8, flexShrink: 0 }}>📌</span>}
                  <span className="sp-pill-label">
                    {isConfirm ? 'Delete?' : pillLabel(n, idx)}
                  </span>
                  {isActive && !isConfirm && (
                    <button
                      className="sp-pill-x"
                      onClick={(e) => { e.stopPropagation(); setDeletePillConfirmId(n.id); }}
                      title="Delete this note"
                    >×</button>
                  )}
                  {isConfirm && (
                    <button
                      className="sp-pill-x cancel"
                      onClick={(e) => { e.stopPropagation(); setDeletePillConfirmId(null); }}
                      title="Cancel"
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right arrow — appears when more pills are hidden */}
          <button
            className={`sp-pill-arrow${canScrollRight ? ' visible' : ''}`}
            onClick={() => scrollPills('right')}
            tabIndex={canScrollRight ? 0 : -1}
            aria-hidden={!canScrollRight}
          >›</button>

          <button
            className="sp-note-pill-add"
            onClick={() => { setDeletePillConfirmId(null); addNoteToContext(); }}
            title="Add another note for this context"
            disabled={tabLoading}
          >+</button>

          {/* Templates dropdown */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={templatesRef}>
            <button
              className="sp-note-pill-add"
              onClick={() => setShowTemplates(!showTemplates)}
              title="Insert template"
              style={{ fontSize: 12, borderStyle: 'solid' }}
            >≡</button>
            {showTemplates && (
              <div className="sp-templates-dropdown">
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.label} className="sp-template-item" onClick={() => applyTemplate(tpl)}>
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="sp-content">

        {/* Note editor */}
        {view === 'note' && (
          <div className="sp-note-view">
            {isRestrictedUrl ? (
              <div className="sp-empty-state" style={{ flex: 1 }}>
                <div className="sp-empty-icon">🔒</div>
                <div className="sp-empty-title">Can't access this page</div>
                <div className="sp-empty-desc">TabNotes can't add notes to Chrome system pages. Navigate to any website.</div>
              </div>
            ) : (
              <>
                <input
                  className="sp-note-title-input"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); schedule(content, e.target.value, tags); }}
                  onBlur={() => {
                    if (!title.trim() && content.trim()) {
                      const auto = autoTitleFromContent(content);
                      if (auto) { setTitle(auto); schedule(content, auto, tags); }
                    }
                  }}
                  placeholder={content.trim() ? autoTitleFromContent(content) || 'Title…' : 'Title…'}
                  disabled={tabLoading}
                />

                {preview && markdownEnabled ? (
                  <div
                    className="sp-markdown-preview"
                    style={activeNoteColor ? { background: activeNoteColor } : undefined}
                    dangerouslySetInnerHTML={{ __html: content ? parseMarkdown(content) : '<p style="color:var(--text-subtle);font-style:italic">Nothing to preview yet.</p>' }}
                    onClick={(e) => {
                      const t = e.target as HTMLElement;
                      // Wiki link navigation
                      const wl = t.closest('.tn-wikilink') as HTMLElement | null;
                      if (wl) {
                        const wiki = (wl.dataset.wiki ?? '').toLowerCase();
                        const target = allNotes.find((n) =>
                          (n.title ?? '').toLowerCase() === wiki ||
                          n.content.trim().split('\n')[0].toLowerCase() === wiki
                        );
                        if (target) { selectNote(target); setView('note'); }
                        return;
                      }
                      // Checkbox toggle
                      if (t.tagName !== 'INPUT' || t.getAttribute('data-task') !== 'true') return;
                      const span = t.nextElementSibling;
                      const taskText = span?.textContent?.trim() ?? '';
                      const checked = (t as HTMLInputElement).checked;
                      const from = checked ? `- [ ] ${taskText}` : `- [x] ${taskText}`;
                      const to   = checked ? `- [x] ${taskText}` : `- [ ] ${taskText}`;
                      const next = content.replace(from, to);
                      setContent(next);
                      schedule(next, title, tags);
                    }}
                  />
                ) : (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      ref={textareaRef}
                      className={`sp-note-textarea${markdownEnabled ? ' mono' : ''}${typewriterMode ? ' tn-typewriter' : ''}`}
                      autoFocus={!tabLoading}
                      value={content}
                      onChange={(e) => {
                        const val = e.target.value;
                        setContent(val); schedule(val, title, tags);
                        const cursor = e.target.selectionStart;
                        const before = val.slice(0, cursor);
                        const m = before.match(/\[\[([^\]]*?)$/);
                        if (m) { setWikiQuery(m[1]); setWikiAnchor({ start: before.length - m[0].length, end: cursor }); }
                        else { setWikiQuery(null); setWikiAnchor(null); }
                      }}
                      placeholder={`Note for this ${scope}…`}
                      disabled={tabLoading}
                      style={{ fontSize: fontSize, ...(activeNoteColor ? { background: activeNoteColor } : {}) }}
                    />
                    {wikiQuery !== null && (
                      <div className="tn-wiki-suggest">
                        {allNotes
                          .filter((n) => n.id !== activeNoteId && (n.title || n.content.split('\n')[0]).toLowerCase().includes(wikiQuery!.toLowerCase()))
                          .slice(0, 6)
                          .map((n) => {
                            const label = n.title || n.content.split('\n')[0];
                            return (
                              <button key={n.id} className="tn-wiki-item" onMouseDown={(e) => { e.preventDefault(); insertWikiLink(label); }}>
                                {label.slice(0, 45)}
                              </button>
                            );
                          })}
                        {allNotes.filter((n) => n.id !== activeNoteId && (n.title || n.content.split('\n')[0]).toLowerCase().includes(wikiQuery!.toLowerCase())).length === 0 && (
                          <span className="tn-wiki-empty">No matching notes</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="sp-tags-row">
                  <span className="sp-tags-label">Tags</span>
                  <input
                    className="sp-tags-input"
                    value={tags}
                    onChange={(e) => { setTags(e.target.value); schedule(content, title, e.target.value); }}
                    placeholder="tag1, tag2, tag3"
                    disabled={tabLoading}
                  />
                </div>

                <div className="sp-note-meta">
                  <span className="sp-note-meta-text">{content.split(/\s+/).filter(Boolean).length}w</span>
                  <span className="sp-note-meta-sep">·</span>
                  <span className="sp-note-meta-text">{content.length}ch</span>
                  {readingTime(content) && (
                    <>
                      <span className="sp-note-meta-sep">·</span>
                      <span className="sp-note-meta-text">{readingTime(content)}</span>
                    </>
                  )}
                  <span className="sp-note-meta-spacer" />

                  {/* Move to folder */}
                  {activeNoteId && (
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`sp-meta-toggle${activeNote?.folder ? ' active' : ''}`}
                        onClick={() => setShowMovePicker(!showMovePicker)}
                        title={activeNote?.folder ? `In ${activeNote.folder}` : 'Move to folder'}
                      >📁{activeNote?.folder ? ' ' + activeNote.folder.replace(/^\//, '') : ''}</button>
                      {showMovePicker && (
                        <div className="sp-move-picker">
                          <button
                            className={`sp-move-item${!activeNote?.folder ? ' active' : ''}`}
                            onClick={() => moveNoteToFolder(activeNoteId, undefined)}
                          >📄 No folder (root)</button>
                          {scopeFolders.map((f) => (
                            <button
                              key={f}
                              className={`sp-move-item${activeNote?.folder === f ? ' active' : ''}`}
                              onClick={() => moveNoteToFolder(activeNoteId, f)}
                            >📂 {f.replace(/^\//, '')}</button>
                          ))}
                          <div className="sp-move-divider" />
                          <button
                            className="sp-move-item new"
                            onClick={() => { setShowMovePicker(false); setShowNewFolder(true); }}
                          >＋ New folder</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Insert date */}
                  <button className="sp-meta-toggle" onClick={insertDatetime} title="Insert date/time (Ctrl+D)">📅</button>

                  {/* Font size */}
                  <button className="sp-meta-toggle" onClick={() => changeFontSize(-1)} title="Smaller text" style={{ fontWeight: 700 }}>A-</button>
                  <button className="sp-meta-toggle" onClick={() => changeFontSize(1)} title="Larger text" style={{ fontWeight: 700 }}>A+</button>

                  {/* Pin */}
                  {activeNoteId && (
                    <button
                      className={`sp-meta-toggle${pinnedNotes.has(activeNoteId) ? ' active' : ''}`}
                      onClick={() => togglePin(activeNoteId)}
                      title={pinnedNotes.has(activeNoteId) ? 'Unpin note' : 'Pin note'}
                    >📌</button>
                  )}

                  {/* Color picker */}
                  {activeNoteId && (
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`sp-meta-toggle${activeNoteColor ? ' active' : ''}`}
                        onClick={() => setColorPickerNoteId(colorPickerNoteId ? null : activeNoteId)}
                        title="Note color"
                        style={activeNoteColor ? { borderColor: activeNoteColor, background: activeNoteColor, color: '#333' } : undefined}
                      >🎨</button>
                      {colorPickerNoteId === activeNoteId && (
                        <div className="sp-color-picker">
                          {NOTE_COLORS.map((c) => (
                            <button
                              key={c.value}
                              className={`sp-color-swatch${activeNoteColor === c.value ? ' active' : ''}`}
                              style={{ background: c.value || 'var(--bg-subtle)', border: '2px solid ' + (activeNoteColor === c.value ? 'var(--accent)' : 'var(--border)') }}
                              onClick={() => setNoteColor(activeNoteId, c.value)}
                              title={c.label}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Export current note */}
                  {(content || title) && (
                    <button className="sp-meta-toggle" onClick={exportCurrentNote} title="Export note as .md">↓md</button>
                  )}

                  {/* Export to PDF */}
                  {(content || title) && (
                    <button className="sp-meta-toggle" onClick={exportToPDF} title="Export to PDF / Print">🖨</button>
                  )}

                  {/* Screenshot capture */}
                  {markdownEnabled && (
                    <button className="sp-meta-toggle" onClick={captureScreenshot} title="Capture screenshot of current tab">📸</button>
                  )}

                  {/* Typewriter mode */}
                  <button
                    className={`sp-meta-toggle${typewriterMode ? ' active' : ''}`}
                    onClick={() => setTypewriterMode(!typewriterMode)}
                    title={typewriterMode ? 'Exit typewriter mode (Ctrl+Shift+T)' : 'Typewriter mode — cursor stays centered (Ctrl+Shift+T)'}
                  >✍</button>

                  {/* Encrypt note */}
                  {activeNoteId && (
                    <button
                      className={`sp-meta-toggle${activeNote?.encrypted ? ' active' : ''}`}
                      onClick={() => { setShowEncPrompt(activeNote?.encrypted ? 'unlock' : 'lock'); setEncPassword(''); setEncError(''); }}
                      title={activeNote?.encrypted ? 'Decrypt note' : 'Encrypt note with password'}
                    >{activeNote?.encrypted ? '🔒' : '🔓'}</button>
                  )}

                  {/* Focus mode */}
                  <button
                    className={`sp-meta-toggle${focusMode ? ' active' : ''}`}
                    onClick={() => setFocusMode(!focusMode)}
                    title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode (Ctrl+Shift+F)'}
                  >{focusMode ? '⊠' : '⊡'}</button>

                  {/* Reference panel (dual view) */}
                  <button
                    className={`sp-meta-toggle${showRefPanel ? ' active' : ''}`}
                    onClick={() => setShowRefPanel(!showRefPanel)}
                    title={showRefPanel ? 'Close reference panel' : 'Open reference panel'}
                  >⊟</button>

                  {/* Copy */}
                  {content && (
                    <button
                      className={`sp-meta-toggle${copied ? ' active' : ''}`}
                      onClick={copyNote}
                      title="Copy note to clipboard"
                    >
                      {copied ? '✓' : '⎘'}
                    </button>
                  )}

                  {/* Version history */}
                  {activeNoteId && (activeNote?.versions?.length ?? 0) > 0 && (
                    <div style={{ position: 'relative' }} ref={historyRef}>
                      <button
                        className={`sp-meta-toggle${showHistory ? ' active' : ''}`}
                        onClick={() => setShowHistory(!showHistory)}
                        title="Version history"
                      >🕐</button>
                      {showHistory && (
                        <div className="sp-history-panel">
                          <div className="sp-history-header">Version History</div>
                          {[...(activeNote!.versions ?? [])].reverse().map((v, i) => (
                            <button
                              key={i}
                              className="sp-history-item"
                              onClick={() => {
                                setContent(v.content);
                                if (v.title !== undefined) setTitle(v.title ?? '');
                                schedule(v.content, v.title ?? title, tags);
                                setShowHistory(false);
                              }}
                            >
                              <span className="sp-history-time">{formatRelativeTime(v.savedAt)}</span>
                              <span className="sp-history-preview">{v.content.trim().slice(0, 55) || '(empty)'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reminder */}
                  {activeNoteId && (
                    <div style={{ position: 'relative' }} ref={reminderRef}>
                      <button
                        className={`sp-meta-toggle${activeNote?.reminderAt ? ' active' : ''}`}
                        onClick={() => {
                          if (activeNote?.reminderAt) {
                            noteSvc.current.updateNote(activeNoteId, { reminderAt: undefined });
                            cr?.runtime?.sendMessage({ type: 'CLEAR_REMINDER', noteId: activeNoteId });
                            const url = currentUrlRef.current;
                            noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current).then(setContextNotes);
                          } else {
                            setShowReminderPicker(!showReminderPicker);
                          }
                        }}
                        title={activeNote?.reminderAt
                          ? `Reminder set for ${new Date(activeNote.reminderAt).toLocaleString()} — click to clear`
                          : 'Set reminder'}
                      >{activeNote?.reminderAt ? '⏰✓' : '⏰'}</button>
                      {showReminderPicker && (
                        <div className="sp-reminder-picker">
                          <div className="sp-reminder-label">Remind me at</div>
                          <input
                            type="datetime-local"
                            className="sp-reminder-input"
                            value={reminderInput}
                            onChange={(e) => setReminderInput(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                          />
                          <button
                            className="sp-reminder-set-btn"
                            disabled={!reminderInput}
                            onClick={async () => {
                              const ts = new Date(reminderInput).getTime();
                              await noteSvc.current.updateNote(activeNoteId, { reminderAt: ts });
                              cr?.runtime?.sendMessage({ type: 'SET_REMINDER', noteId: activeNoteId, reminderAt: ts, noteTitle: title || autoTitleFromContent(content) });
                              const url = currentUrlRef.current;
                              const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
                              setContextNotes(notes);
                              setShowReminderPicker(false);
                              setReminderInput('');
                            }}
                          >Set reminder</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clip feedback badge */}
                  {clipFeedback && (
                    <span className="sp-clip-badge">📋 Clipped!</span>
                  )}

                  {/* Markdown preview */}
                  {markdownEnabled && (
                    <button
                      className={`sp-meta-toggle${preview ? ' active' : ''}`}
                      onClick={() => setPreview(!preview)}
                    >
                      {preview ? '✎' : '◈'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Reference Panel (dual view) ── */}
        {view === 'note' && showRefPanel && !isRestrictedUrl && (
          <div className="sp-ref-panel">
            <div className="sp-ref-panel-header">
              <span className="sp-ref-panel-title">Reference</span>
              <button className="sp-icon-btn" style={{ fontSize: 11 }} onClick={() => { setRefNoteId(null); setShowRefPanel(false); }}>✕</button>
            </div>
            {refNoteId === null ? (
              <div className="sp-ref-note-list">
                {contextNotes.filter((n) => n.id !== activeNoteId).length === 0 ? (
                  <div className="sp-ref-empty">No other notes in this scope to reference.</div>
                ) : (
                  contextNotes.filter((n) => n.id !== activeNoteId).map((n, i) => (
                    <button
                      key={n.id}
                      className="sp-ref-note-item"
                      onClick={() => setRefNoteId(n.id)}
                    >
                      <span className="sp-ref-note-label">{pillLabel(n, i)}</span>
                      <span className="sp-ref-note-preview">{n.content.trim().slice(0, 60) || '—'}</span>
                    </button>
                  ))
                )}
                {allNotes.filter((n) => n.id !== activeNoteId && !contextNotes.find((c) => c.id === n.id)).slice(0, 8).map((n, i) => (
                  <button
                    key={n.id}
                    className="sp-ref-note-item"
                    onClick={() => setRefNoteId(n.id)}
                  >
                    <span className="sp-ref-note-label">{pillLabel(n, i)}</span>
                    <span className="sp-ref-note-preview" style={{ color: 'var(--text-subtle)' }}>
                      {n.scope} · {n.content.trim().slice(0, 40) || '—'}
                    </span>
                  </button>
                ))}
              </div>
            ) : (() => {
              const rn = allNotes.find((n) => n.id === refNoteId);
              if (!rn) return null;
              return (
                <div className="sp-ref-note-view">
                  <div className="sp-ref-note-view-header">
                    <button className="sp-ref-back" onClick={() => setRefNoteId(null)}>← Back</button>
                    <span className="sp-ref-note-view-title">{rn.title || pillLabel(rn, 0)}</span>
                  </div>
                  <div
                    className="sp-ref-note-content sp-markdown-preview"
                    dangerouslySetInnerHTML={{ __html: rn.content ? parseMarkdown(rn.content) : '<p style="color:var(--text-subtle);font-style:italic">Empty note</p>' }}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* All notes */}
        {view === 'all' && (
          <div className="sp-all-view">
            <div className="sp-search-wrap">
              <div className="sp-search-inner">
                <span className="sp-search-icon">⌕</span>
                <input
                  className="sp-search-input"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search notes, titles, tags…"
                  autoFocus
                />
                {searchQ && (
                  <button
                    onClick={() => setSearchQ('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 12, padding: 0, fontFamily: 'var(--font)' }}
                  >✕</button>
                )}
              </div>
              <button
                className={`sp-select-toggle${selectMode ? ' active' : ''}`}
                title={selectMode ? 'Cancel selection' : 'Select multiple notes'}
                onClick={() => {
                  setSelectMode(!selectMode);
                  setBulkSelectedIds(new Set());
                  setBulkDeleteConfirm(false);
                  setDeleteCardConfirmId(null);
                }}
              >
                {selectMode ? 'Cancel' : '☑'}
              </button>
            </div>

            {/* Tag filter chips */}
            {allTags.length > 0 && (
              <div className="sp-tag-chips">
                {tagFilter && (
                  <button className="sp-tag-chip clear" onClick={() => setTagFilter(null)}>✕ Clear</button>
                )}
                {allTags.map((t) => (
                  <button
                    key={t}
                    className={`sp-tag-chip${tagFilter === t ? ' active' : ''}`}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  >#{t}</button>
                ))}
              </div>
            )}

            <div className="sp-notes-list">
              {filteredNotes.length === 0 ? (
                <div className="sp-empty-state">
                  <div className="sp-empty-icon">✎</div>
                  <div className="sp-empty-title">{searchQ || tagFilter ? 'No results' : 'No notes yet'}</div>
                  <div className="sp-empty-desc">
                    {searchQ ? `Nothing matched "${searchQ}"` : tagFilter ? `No notes tagged #${tagFilter}` : 'Switch to Note tab and start writing.'}
                  </div>
                </div>
              ) : (
                // ── Group by scope ──────────────────────────────
                SCOPE_OPTIONS
                  .map((scopeOpt) => ({
                    scopeOpt,
                    notes: filteredNotes.filter((n) => n.scope === scopeOpt.value),
                  }))
                  .map(({ scopeOpt, notes }) => {
                    const isCollapsed = collapsedScopes.has(scopeOpt.value);
                    return (
                      <div key={scopeOpt.value} className="sp-scope-group">
                        {/* Group header */}
                        <button
                          className="sp-group-header"
                          onClick={() => toggleScope(scopeOpt.value)}
                        >
                          <span className="sp-group-chevron">{isCollapsed ? '▸' : '▾'}</span>
                          <span className="sp-group-icon">{scopeOpt.icon}</span>
                          <span className="sp-group-label">{scopeOpt.label}</span>
                          <span className={`sp-group-count${notes.length === 0 ? ' empty' : ''}`}>{notes.length}</span>
                        </button>

                        {/* Empty state when group is open but has no notes */}
                        {!isCollapsed && notes.length === 0 && (
                          <div className="sp-group-empty">No {scopeOpt.label.toLowerCase()} notes yet</div>
                        )}

                        {/* Notes in this group */}
                        {!isCollapsed && notes.length > 0 && notes.map((n) => {
                          const isSelected = selectedId === n.id;
                          const isBulkSelected = bulkSelectedIds.has(n.id);
                          return (
                            <div
                              key={n.id}
                              className={`sp-note-card${isSelected ? ' selected' : ''}${deleteCardConfirmId === n.id ? ' delete-confirm' : ''}${selectMode && isBulkSelected ? ' bulk-selected' : ''}${selectMode ? ' select-mode' : ''}`}
                              onClick={(e) => {
                                if (selectMode) {
                                  setBulkDeleteConfirm(false);
                                  setBulkSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                                    return next;
                                  });
                                  return;
                                }
                                if ((e.target as HTMLElement).closest('.sp-card-delete')) return;
                                if (deleteCardConfirmId === n.id) { setDeleteCardConfirmId(null); return; }
                                setDeleteCardConfirmId(null);
                                setSelectedId(isSelected ? null : n.id);
                                setActiveNoteId(n.id); activeNoteIdRef.current = n.id;
                                setContent(n.content); setTitle(n.title ?? ''); setTags(n.tags.join(', '));
                                setScope(n.scope); scopeRef.current = n.scope;
                                setView('note'); setPreview(false); setConfirmDelete(false);
                              }}
                            >
                              {selectMode && (
                                <span className={`sp-card-checkbox${isBulkSelected ? ' checked' : ''}`}>
                                  {isBulkSelected ? '✓' : ''}
                                </span>
                              )}
                              <div className="sp-card-top">
                                {pinnedNotes.has(n.id) && (
                                  <span className="sp-card-pin" title="Pinned">📌</span>
                                )}
                                <span className="sp-card-time">{formatRelativeTime(n.updatedAt)}</span>
                                {!selectMode && (
                                  <button
                                    className={`sp-card-delete${deleteCardConfirmId === n.id ? ' confirming' : ''}`}
                                    title={deleteCardConfirmId === n.id ? 'Click to confirm delete' : 'Delete note'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (deleteCardConfirmId === n.id) {
                                        deleteCardNote(n.id);
                                      } else {
                                        setDeleteCardConfirmId(n.id);
                                      }
                                    }}
                                  >
                                    {deleteCardConfirmId === n.id ? 'Delete?' : '🗑'}
                                  </button>
                                )}
                              </div>
                              {n.title && <div className="sp-card-title">{n.title}</div>}
                              {n.content && <div className="sp-card-excerpt">{n.content}</div>}
                              {n.tags.length > 0 && (
                                <div className="sp-card-tags">
                                  {n.tags.slice(0, 4).map((t) => <span key={t} className="sp-card-tag">#{t}</span>)}
                                </div>
                              )}
                              <div className="sp-card-scope-ctx">
                                <span className="sp-card-scope-icon">{SCOPE_OPTIONS.find((s) => s.value === n.scope)?.icon}</span>
                                <span className="sp-card-scope-key">{n.scopeKey || n.scope}</span>
                                {n.scope === 'url' && n.scopeKey && (
                                  <a
                                    href={n.scopeKey}
                                    target="_blank"
                                    rel="noopener"
                                    className="sp-card-open-url"
                                    onClick={(e) => e.stopPropagation()}
                                    title="Open this URL"
                                  >↗</a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
              )}
            </div>

            {/* Bulk action bar */}
            {selectMode && (
              <div className="sp-bulk-bar">
                <span className="sp-bulk-count">
                  {bulkSelectedIds.size === 0
                    ? 'Tap notes to select'
                    : `${bulkSelectedIds.size} selected`}
                </span>
                {bulkSelectedIds.size > 0 && (
                  <>
                    <button
                      className="sp-bulk-select-all"
                      onClick={() => {
                        if (bulkSelectedIds.size === filteredNotes.length) {
                          setBulkSelectedIds(new Set());
                        } else {
                          setBulkSelectedIds(new Set(filteredNotes.map((n) => n.id)));
                        }
                        setBulkDeleteConfirm(false);
                      }}
                    >
                      {bulkSelectedIds.size === filteredNotes.length ? 'Deselect all' : 'Select all'}
                    </button>
                    <button
                      className={`sp-bulk-delete${bulkDeleteConfirm ? ' confirming' : ''}`}
                      onClick={() => {
                        if (bulkDeleteConfirm) {
                          bulkDeleteNotes();
                        } else {
                          setBulkDeleteConfirm(true);
                        }
                      }}
                    >
                      {bulkDeleteConfirm
                        ? `Confirm delete ${bulkSelectedIds.size}`
                        : `Delete ${bulkSelectedIds.size}`}
                    </button>
                  </>
                )}
              </div>
            )}

            <button
              className="sp-fab"
              title="New note"
              onClick={async () => {
                const url = currentUrlRef.current || 'https://tabnotes.app';
                const n = await noteSvc.current.createNote({
                  scope: defaultScope, url, workspaceId: wsIdRef.current,
                });
                setActiveNoteId(n.id); activeNoteIdRef.current = n.id;
                setContent(''); setTitle(''); setTags('');
                setScope(defaultScope); scopeRef.current = defaultScope;
                const notes = await noteSvc.current.getNotesByScope(defaultScope, url, wsIdRef.current);
                setContextNotes(notes);
                await refreshAllNotes();
                setView('note');
              }}
            >+</button>
          </div>
        )}

        {/* ── Chat / RAG view ── */}
        {view === 'chat' && (
          <div className="sp-chat-view">
            {/* Scope toggle + note count */}
            <div className="sp-chat-topbar">
              <div className="sp-chat-scope-toggle">
                <button
                  className={`sp-chat-scope-btn${chatScope === 'domain' ? ' active' : ''}`}
                  onClick={() => setChatScope('domain')}
                  title="Ask about notes from this domain"
                >🌐 {currentDomain || 'Domain'}</button>
                <button
                  className={`sp-chat-scope-btn${chatScope === 'all' ? ' active' : ''}`}
                  onClick={() => setChatScope('all')}
                  title="Ask about all your notes"
                >🌍 All notes</button>
              </div>
              <span className="sp-chat-ctx-count">
                {(() => {
                  const pool = chatScope === 'domain'
                    ? allNotes.filter((n) => n.scope === 'domain' && n.scopeKey === currentDomain)
                    : allNotes;
                  return `${pool.length} note${pool.length !== 1 ? 's' : ''} in context`;
                })()}
              </span>
            </div>

            {/* Messages */}
            <div className="sp-chat-messages">
              {chatMessages.length === 0 && (
                <div className="sp-chat-empty">
                  {!groqKey ? (
                    <div className="sp-chat-no-key">
                      <span className="sp-chat-no-key-icon">🔑</span>
                      <p>Add your Groq API key in Settings to start chatting with your notes.</p>
                      <button className="sp-chat-goto-settings" onClick={() => setView('settings')}>
                        Open Settings →
                      </button>
                    </div>
                  ) : (
                    <div className="sp-chat-hint">
                      <span className="sp-chat-hint-icon">💬</span>
                      <p>Ask anything about your notes.</p>
                      <div className="sp-chat-examples">
                        {['What ideas did I note here?', 'Summarize my notes', 'What should I follow up on?'].map((ex) => (
                          <button
                            key={ex}
                            className="sp-chat-example"
                            onClick={() => { setChatInput(ex); chatInputRef.current?.focus(); }}
                          >{ex}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`sp-chat-msg sp-chat-msg-${msg.role}`}>
                  <div className="sp-chat-bubble">
                    {msg.content || (msg.role === 'assistant' && chatLoading && i === chatMessages.length - 1
                      ? <span className="sp-chat-typing"><span /><span /><span /></span>
                      : null)}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input row */}
            <div className="sp-chat-input-row">
              <input
                ref={chatInputRef}
                className="sp-chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask about your notes…"
                disabled={chatLoading}
                autoComplete="off"
              />
              <button
                className="sp-chat-send"
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                title="Send (Enter)"
              >{chatLoading ? '…' : '↑'}</button>
            </div>

            {chatMessages.length > 0 && (
              <button className="sp-chat-clear" onClick={() => setChatMessages([])}>Clear chat</button>
            )}
          </div>
        )}

        {/* ── Graph view ── */}
        {view === 'graph' && (
          <div className="sp-graph-view">
            <div className="sp-graph-header">
              <span className="sp-graph-title">⬡ Note Graph</span>
              <button className="sp-icon-btn" style={{ fontSize: 11 }} onClick={() => setView('note')}>✕</button>
            </div>
            <div className="sp-graph-legend">
              <span className="sp-graph-legend-item"><span style={{ color: '#2b5be8' }}>─</span> Wiki link</span>
              <span className="sp-graph-legend-item"><span style={{ color: '#c8d0e0' }}>╌</span> Shared tag</span>
              <span className="sp-graph-legend-sep" />
              <span className="sp-graph-legend-item" style={{ color: 'var(--text-subtle)', fontSize: 10 }}>Click a node to open note</span>
            </div>
            <NoteGraph
              notes={allNotes}
              activeId={activeNoteId}
              onSelect={(n) => { selectNote(n); setView('note'); }}
            />
            {allNotes.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13, marginTop: 24 }}>
                No notes yet. Create some notes to see the graph.
              </p>
            )}
            <div className="sp-graph-stats">
              <span>{allNotes.length} note{allNotes.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{allNotes.filter((n) => /\[\[/.test(n.content)).length} with wiki links</span>
            </div>
          </div>
        )}

        {/* Settings */}
        {view === 'settings' && (
          <div className="sp-settings-view">
            <div className="sp-settings-section">
              <div className="sp-settings-label">AI Assistant</div>
              <div className="sp-settings-row-info" style={{ marginBottom: 10 }}>
                <div className="sp-settings-row-title">Groq API Key</div>
                <div className="sp-settings-row-desc">
                  Powers "Ask your notes" chat. Free key at{' '}
                  <a href="https://console.groq.com" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>console.groq.com</a>
                </div>
              </div>
              <div className="sp-groq-key-row">
                <input
                  className="sp-groq-key-input"
                  type={groqKeyVisible ? 'text' : 'password'}
                  placeholder="gsk_…"
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const key = groqKeyInput.trim();
                      cr?.storage?.local?.set({ tn_groq_key: key });
                      setGroqKey(key);
                    }
                  }}
                />
                <button className="sp-groq-key-eye" onClick={() => setGroqKeyVisible((v) => !v)} title={groqKeyVisible ? 'Hide' : 'Show'}>
                  {groqKeyVisible ? '🙈' : '👁'}
                </button>
                <button
                  className="sp-groq-key-save"
                  onClick={() => {
                    const key = groqKeyInput.trim();
                    cr?.storage?.local?.set({ tn_groq_key: key });
                    setGroqKey(key);
                  }}
                >Save</button>
              </div>
              {groqKey && (
                <div className="sp-groq-key-status">
                  ✓ Key saved —{' '}
                  <button className="sp-groq-open-chat" onClick={() => setView('chat')}>Open chat →</button>
                </div>
              )}
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Appearance</div>
              <div className="sp-theme-grid">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button key={t} className={`sp-theme-btn${theme === t ? ' active' : ''}`} onClick={() => setTheme(t)}>
                    {t === 'light' ? '☀ Light' : t === 'dark' ? '☽ Dark' : '◑ System'}
                  </button>
                ))}
              </div>
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Editor</div>
              <div className="sp-settings-row">
                <div className="sp-settings-row-info">
                  <div className="sp-settings-row-title">Markdown Preview</div>
                  <div className="sp-settings-row-desc">Write in Markdown with rendered preview</div>
                </div>
                <button className={`sp-toggle ${markdownEnabled ? 'on' : 'off'}`} onClick={() => setMarkdown(!markdownEnabled)}>
                  <div className="sp-toggle-knob" />
                </button>
              </div>
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Default Scope</div>
              <div className="sp-scope-grid">
                {SCOPE_OPTIONS.map((s) => (
                  <div
                    key={s.value}
                    className={`sp-scope-row${defaultScope === s.value ? ' active' : ''}`}
                    onClick={() => setDefaultScope(s.value)}
                  >
                    <span className="sp-scope-row-icon">{s.icon}</span>
                    <div className="sp-scope-row-info">
                      <div className="sp-scope-row-name">{s.label}</div>
                      <div className="sp-scope-row-desc">{s.desc}</div>
                    </div>
                    {defaultScope === s.value && <span className="sp-scope-row-check">✓</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Daily Digest</div>
              <div className="sp-settings-row">
                <div className="sp-settings-row-info">
                  <div className="sp-settings-row-title">Morning Notification</div>
                  <div className="sp-settings-row-desc">Daily summary of your note activity</div>
                </div>
                <button
                  className={`sp-toggle ${digestEnabled ? 'on' : 'off'}`}
                  onClick={() => { const next = !digestEnabled; setDigestEnabled(next); saveDigest(next, digestTime); }}
                >
                  <div className="sp-toggle-knob" />
                </button>
              </div>
              {digestEnabled && (
                <div className="sp-digest-time-row">
                  <span className="sp-digest-time-label">Send digest at</span>
                  <input
                    type="time"
                    className="sp-digest-time-input"
                    value={digestTime}
                    onChange={(e) => { setDigestTime(e.target.value); saveDigest(digestEnabled, e.target.value); }}
                  />
                </div>
              )}
              {digestEnabled && (
                <div className="sp-digest-preview">
                  <span className="sp-digest-preview-icon">📓</span>
                  <span>Every day at <strong>{digestTime}</strong> you'll get a notification like:<br />
                  <em>"3 notes updated in the last 24h — 47 total"</em></span>
                </div>
              )}
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Active Workspace</div>
              <div className="sp-scope-grid">
                <div
                  className={`sp-scope-row${activeWorkspaceId === null ? ' active' : ''}`}
                  onClick={async () => {
                    await wsSvc.current.setActive(null);
                    setActiveWorkspaceId(null); wsIdRef.current = null;
                  }}
                >
                  <span className="sp-scope-row-icon">🌍</span>
                  <div className="sp-scope-row-info">
                    <div className="sp-scope-row-name">No Workspace</div>
                    <div className="sp-scope-row-desc">Global notes</div>
                  </div>
                  {activeWorkspaceId === null && <span className="sp-scope-row-check">✓</span>}
                </div>
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className={`sp-scope-row${activeWorkspaceId === ws.id ? ' active' : ''}`}
                    onClick={async () => {
                      await wsSvc.current.setActive(ws.id);
                      setActiveWorkspaceId(ws.id); wsIdRef.current = ws.id;
                    }}
                  >
                    <span className="sp-scope-row-icon">⊞</span>
                    <div className="sp-scope-row-info">
                      <div className="sp-scope-row-name">{ws.name}</div>
                      <div className="sp-scope-row-desc">{allNotes.filter((n) => n.workspaceId === ws.id).length} notes</div>
                    </div>
                    {activeWorkspaceId === ws.id && <span className="sp-scope-row-check">✓</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="sp-settings-section">
              <div className="sp-settings-label">Stats</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[
                  { label: 'Notes', value: allNotes.length },
                  { label: 'Workspaces', value: workspaces.length },
                  { label: 'Tags', value: [...new Set(allNotes.flatMap((n) => n.tags))].length },
                ].map((s) => (
                  <div key={s.label} style={{ padding: '10px 8px', borderRadius: 'var(--r-md)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Data management */}
            <div className="sp-settings-section">
              <div className="sp-settings-label">Data</div>
              <div className="sp-data-grid">
                <button className="sp-data-btn export" onClick={handleExport}>
                  <span className="sp-data-btn-icon">↓</span>
                  <div className="sp-data-btn-info">
                    <div className="sp-data-btn-title">Export backup</div>
                    <div className="sp-data-btn-desc">Download all notes as JSON</div>
                  </div>
                </button>
                <button className="sp-data-btn import" onClick={() => importInputRef.current?.click()}>
                  <span className="sp-data-btn-icon">↑</span>
                  <div className="sp-data-btn-info">
                    <div className="sp-data-btn-title">Import backup</div>
                    <div className="sp-data-btn-desc">Merge notes from JSON file</div>
                  </div>
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleImport}
                />
              </div>
              {dataFeedback && (
                <div className={`sp-data-feedback ${dataFeedback.type}`}>
                  {dataFeedback.type === 'success' ? '✓' : '✕'} {dataFeedback.msg}
                </div>
              )}
            </div>

            <div className="sp-settings-section sp-coffee-section">
              <div className="sp-settings-label">Support</div>
              <a
                href="https://www.paypal.com/paypalme/atlaspcsupport"
                target="_blank"
                rel="noopener"
                className="sp-coffee-btn"
              >
                ☕ Buy me a coffee
              </a>
            </div>

            <div className="sp-pro-card">
              <div className="sp-pro-title">✦ TabNotes Pro — Coming Soon</div>
              <div className="sp-pro-desc">Sync across devices, web dashboard access, note history and premium themes.</div>
              <a href="https://github.com/mikepchelper-spec/TabNotes" target="_blank" rel="noopener" className="sp-pro-btn">
                View on GitHub →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── Command palette overlay ── */}
      {showCmdPalette && (
        <div className="tn-palette-overlay" onMouseDown={() => setShowCmdPalette(false)}>
          <div className="tn-palette-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="tn-palette-search-row">
              <span className="tn-palette-icon-search">⌘</span>
              <input
                ref={cmdInputRef}
                className="tn-palette-input"
                placeholder="Search notes or type a command…"
                value={cmdQuery}
                onChange={(e) => { setCmdQuery(e.target.value); setCmdSelIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowCmdPalette(false); return; }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCmdSelIdx((i) => Math.min(i + 1, paletteItemsRef.current.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCmdSelIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    const item = paletteItemsRef.current[cmdSelIdx];
                    if (item) { item.run(); setShowCmdPalette(false); }
                  }
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="tn-palette-esc" onClick={() => setShowCmdPalette(false)}>Esc</kbd>
            </div>

            <div className="tn-palette-divider" />

            <div className="tn-palette-list">
              {paletteItems.length === 0 && (
                <div className="tn-palette-empty">No results for "{cmdQuery}"</div>
              )}
              {paletteItems.map((item, idx) => (
                <button
                  key={idx}
                  className={`tn-palette-item${idx === cmdSelIdx ? ' selected' : ''}`}
                  onMouseEnter={() => setCmdSelIdx(idx)}
                  onMouseDown={(e) => { e.preventDefault(); item.run(); setShowCmdPalette(false); }}
                >
                  <span className="tn-palette-item-icon">{item.icon}</span>
                  <span className="tn-palette-item-body">
                    <span className="tn-palette-item-label">{item.label}</span>
                    {item.sublabel && (
                      <span className="tn-palette-item-sub">{item.sublabel}</span>
                    )}
                  </span>
                  {item.shortcut && (
                    <kbd className="tn-palette-shortcut">{item.shortcut}</kbd>
                  )}
                </button>
              ))}
            </div>

            <div className="tn-palette-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Encryption prompt overlay ── */}
      {showEncPrompt && (
        <div className="tn-enc-overlay">
          <div className="tn-enc-dialog">
            <div className="tn-enc-title">
              {showEncPrompt === 'lock' ? '🔒 Encrypt note' : '🔑 Decrypt note'}
            </div>
            <p className="tn-enc-desc">
              {showEncPrompt === 'lock'
                ? 'Enter a password to encrypt this note with AES-256. You\'ll need the same password to read it again.'
                : 'Enter your password to decrypt and restore this note.'}
            </p>
            <input
              className="tn-enc-input"
              type="password"
              placeholder="Password…"
              value={encPassword}
              autoFocus
              onChange={(e) => { setEncPassword(e.target.value); setEncError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') showEncPrompt === 'lock' ? handleLockNote() : handleUnlockNote();
                if (e.key === 'Escape') { setShowEncPrompt(null); setEncPassword(''); setEncError(''); }
              }}
            />
            {encError && <p className="tn-enc-error">{encError}</p>}
            <div className="tn-enc-actions">
              <button className="tn-enc-cancel" onClick={() => { setShowEncPrompt(null); setEncPassword(''); setEncError(''); }}>Cancel</button>
              <button
                className="tn-enc-confirm"
                onClick={showEncPrompt === 'lock' ? handleLockNote : handleUnlockNote}
                disabled={!encPassword}
              >
                {showEncPrompt === 'lock' ? 'Encrypt' : 'Decrypt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav ── */}
      <div className="sp-bottom-nav">
        <button className={`sp-nav-btn${view === 'note' ? ' active' : ''}`} onClick={() => setView('note')}>
          <span className="sp-nav-icon">✎</span>
          <span className="sp-nav-label">Note</span>
        </button>
        <button className={`sp-nav-btn${view === 'all' ? ' active' : ''}`} onClick={() => setView('all')}>
          <span className="sp-nav-icon">☰</span>
          <span className="sp-nav-label">All Notes</span>
          {allNotes.length > 0 && (
            <span style={{ position: 'absolute', top: 7, right: 'calc(50% - 18px)', background: 'var(--accent)', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 99, minWidth: 14, textAlign: 'center', lineHeight: '14px' }}>
              {allNotes.length}
            </span>
          )}
        </button>
        <button className={`sp-nav-btn${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>
          <span className="sp-nav-icon">💬</span>
          <span className="sp-nav-label">Ask</span>
          {groqKey && <span className="sp-nav-ai-dot" />}
        </button>
        <button className={`sp-nav-btn${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>
          <span className="sp-nav-icon">⚙</span>
          <span className="sp-nav-label">Settings</span>
        </button>
      </div>
    </div>
  );
}
