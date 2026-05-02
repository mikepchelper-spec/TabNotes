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

type View = 'note' | 'all' | 'settings';

const SCOPE_OPTIONS: { value: NoteScope; label: string; icon: string; desc: string }[] = [
  { value: 'url',       label: 'URL',       icon: '🔗', desc: 'Exact page URL' },
  { value: 'domain',    label: 'Domain',    icon: '🌐', desc: 'Entire site' },
  { value: 'workspace', label: 'Workspace', icon: '⊞', desc: 'Your project' },
  { value: 'global',    label: 'Global',    icon: '🌍', desc: 'Everywhere' },
];

function parseMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul]|<p)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
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

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Services
  const adapter = useRef(new ChromeStorageAdapter());
  const noteSvc = useRef(new NotesService(adapter.current));
  const wsSvc = useRef(new WorkspacesService(adapter.current));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Refs for stable autosave (no stale closures)
  const activeNoteIdRef = useRef<string | null>(null);
  const scopeRef = useRef<NoteScope>('domain');
  const currentUrlRef = useRef('');
  const wsIdRef = useRef<string | null>(null);

  useEffect(() => { activeNoteIdRef.current = activeNoteId; }, [activeNoteId]);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  useEffect(() => { currentUrlRef.current = currentUrl; }, [currentUrl]);
  useEffect(() => { wsIdRef.current = activeWorkspaceId; }, [activeWorkspaceId]);

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

      await refreshAllNotes();

      cr.tabs.query({ active: true, currentWindow: true }, async (tabs: { url?: string }[]) => {
        const url = tabs[0]?.url ?? '';
        setCurrentUrl(url);
        setCurrentDomain(normalizeDomain(url));
        currentUrlRef.current = url;
        await loadContextNotes(url, sc, wsId);
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
    const created = await noteSvc.current.createNote({
      scope: scopeRef.current,
      url,
      workspaceId: wsIdRef.current,
    });
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    selectNote(created);
    await refreshAllNotes();
  };

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

    setSaved(true);
    await refreshAllNotes();
    setTimeout(() => setSaved(false), 2000);
  }, [refreshAllNotes]);

  const schedule = useCallback((c: string, t: string, tg: string) => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(c, t, tg), 600);
  }, [saveNote]);

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

  // ── Derived ──────────────────────────────────────────────────
  const activeNote = contextNotes.find((n) => n.id === activeNoteId) ?? null;

  const scopeKey =
    scope === 'url'       ? normalizeUrl(currentUrl) :
    scope === 'domain'    ? currentDomain :
    scope === 'workspace' ? (workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? 'Workspace') :
    'Global';

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const filteredNotes = searchNotes(allNotes, searchQ);
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
    <div className="sp-root">

      {/* ── Header ── */}
      <div className="sp-header">
        <div className="sp-logo">
          <div className="sp-logo-mark">T</div>
          <span className="sp-logo-text">TabNotes</span>
        </div>
        <div className="sp-workspace-pill" onClick={() => setView('settings')}>
          <div className="sp-workspace-dot" style={{ background: activeWs ? 'var(--accent)' : 'var(--text-subtle)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>
            {activeWs ? activeWs.name : 'No Workspace'}
          </span>
        </div>
        <div className="sp-header-actions">
          {tabLoading && <div className="sp-spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />}
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
            {contextNotes.map((n, idx) => {
              const isActive = n.id === activeNoteId;
              const isConfirm = deletePillConfirmId === n.id;
              return (
                <div
                  key={n.id}
                  className={`sp-note-pill${isActive ? ' active' : ''}${isConfirm ? ' confirm' : ''}`}
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
                  placeholder="Title (optional)"
                  disabled={tabLoading}
                />

                {preview && markdownEnabled ? (
                  <div
                    className="sp-markdown-preview"
                    dangerouslySetInnerHTML={{ __html: content ? parseMarkdown(content) : '<p style="color:var(--text-subtle);font-style:italic">Nothing to preview yet.</p>' }}
                  />
                ) : (
                  <textarea
                    className={`sp-note-textarea${markdownEnabled ? ' mono' : ''}`}
                    autoFocus={!tabLoading}
                    value={content}
                    onChange={(e) => { setContent(e.target.value); schedule(e.target.value, title, tags); }}
                    placeholder={`Note for this ${scope}…`}
                    disabled={tabLoading}
                  />
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
                  {activeNote && (
                    <>
                      <span className="sp-note-meta-sep">·</span>
                      <span className="sp-note-meta-text">{formatRelativeTime(activeNote.updatedAt)}</span>
                    </>
                  )}
                  <span className="sp-note-meta-spacer" />
                  {markdownEnabled && (
                    <button
                      className={`sp-meta-toggle${preview ? ' active' : ''}`}
                      onClick={() => setPreview(!preview)}
                    >
                      {preview ? '✎ Edit' : '◈ Preview'}
                    </button>
                  )}
                </div>
              </>
            )}
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
            </div>

            <div className="sp-notes-list">
              {filteredNotes.length === 0 ? (
                <div className="sp-empty-state">
                  <div className="sp-empty-icon">✎</div>
                  <div className="sp-empty-title">{searchQ ? 'No results' : 'No notes yet'}</div>
                  <div className="sp-empty-desc">
                    {searchQ ? `Nothing matched "${searchQ}"` : 'Switch to Note tab and start writing.'}
                  </div>
                </div>
              ) : (
                filteredNotes.map((n) => {
                  const scopeOpt = SCOPE_OPTIONS.find((s) => s.value === n.scope);
                  const isSelected = selectedId === n.id;
                  return (
                    <div
                      key={n.id}
                      className={`sp-note-card${isSelected ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedId(isSelected ? null : n.id);
                        setActiveNoteId(n.id); activeNoteIdRef.current = n.id;
                        setContent(n.content); setTitle(n.title ?? ''); setTags(n.tags.join(', '));
                        setScope(n.scope); scopeRef.current = n.scope;
                        setView('note'); setPreview(false); setConfirmDelete(false);
                      }}
                    >
                      <div className="sp-card-top">
                        <span className="sp-card-scope-icon">{scopeOpt?.icon}</span>
                        <span className="sp-card-scope">{n.scope}</span>
                        <span className="sp-card-time">{formatRelativeTime(n.updatedAt)}</span>
                      </div>
                      {n.title && <div className="sp-card-title">{n.title}</div>}
                      {n.content && <div className="sp-card-excerpt">{n.content}</div>}
                      {n.tags.length > 0 && (
                        <div className="sp-card-tags">
                          {n.tags.slice(0, 4).map((t) => <span key={t} className="sp-card-tag">#{t}</span>)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

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

        {/* Settings */}
        {view === 'settings' && (
          <div className="sp-settings-view">
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
        <button className={`sp-nav-btn${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>
          <span className="sp-nav-icon">⚙</span>
          <span className="sp-nav-label">Settings</span>
        </button>
      </div>
    </div>
  );
}
