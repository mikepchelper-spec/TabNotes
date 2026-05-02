import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Note, NoteScope, Workspace,
  ChromeStorageAdapter, NotesService, WorkspacesService, StorageData,
  normalizeUrl, normalizeDomain, formatRelativeTime, searchNotes,
} from '@tabnotes/shared';
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

export default function SidePanelApp() {
  /* ── Core state ── */
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('note');
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');
  const [markdownEnabled, setMdState] = useState(false);
  const [preview, setPreview] = useState(false);

  /* ── Tab context ── */
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');

  /* ── Notes / workspaces ── */
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [defaultScope, setDefaultScopeState] = useState<NoteScope>('domain');

  /* ── Current note editor ── */
  const [scope, setScope] = useState<NoteScope>('domain');
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState(false);

  /* ── All-notes search ── */
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const adapter = useRef(new ChromeStorageAdapter());
  const noteSvc = useRef(new NotesService(adapter.current));
  const wsSvc = useRef(new WorkspacesService(adapter.current));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  /* ── Theme detection ── */
  useEffect(() => {
    const apply = (t: typeof theme) => {
      if (t === 'system') {
        document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', t);
      }
    };
    apply(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const h = (e: MediaQueryListEvent) => document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      mq.addEventListener('change', h);
      return () => mq.removeEventListener('change', h);
    }
  }, [theme]);

  /* ── Initial load ── */
  const loadAll = useCallback(async (url: string, wsId: string | null, sc: NoteScope) => {
    const [notes, wsList, data] = await Promise.all([
      noteSvc.current.getAllNotes(),
      wsSvc.current.getAll(),
      adapter.current.get(),
    ]);
    setAllNotes(notes);
    setWorkspaces(wsList);
    setMdState(data.markdownEnabled ?? false);
    setThemeState((data as unknown as { theme: typeof theme }).theme ?? 'system');
    if (url) {
      const n = await noteSvc.current.getNoteByScope(sc, url, wsId);
      setNote(n); setContent(n?.content ?? ''); setTitle(n?.title ?? ''); setTags(n?.tags.join(', ') ?? '');
    }
  }, []);

  useEffect(() => {
    if (!cr?.tabs) { setLoading(false); return; }
    cr.tabs.query({ active: true, currentWindow: true }, async (tabs: { url?: string }[]) => {
      const url = tabs[0]?.url ?? '';
      setCurrentUrl(url);
      setCurrentDomain(normalizeDomain(url));
      const [wsId, storageData] = await Promise.all([wsSvc.current.getActive(), adapter.current.get()]);
      setActiveWorkspaceId(wsId);
      const sc: NoteScope = (storageData as StorageData).defaultScope ?? 'domain';
      setDefaultScopeState(sc); setScope(sc);
      await loadAll(url, wsId, sc);
      setLoading(false);
    });
  }, [loadAll]);

  /* ── Scope switch ── */
  const handleScopeChange = async (s: NoteScope) => {
    setScope(s); setPreview(false);
    const n = await noteSvc.current.getNoteByScope(s, currentUrl, activeWorkspaceId);
    setNote(n); setContent(n?.content ?? ''); setTitle(n?.title ?? ''); setTags(n?.tags.join(', ') ?? '');
    setSaved(false);
  };

  /* ── Autosave ── */
  const saveNote = useCallback(async (c: string, t: string, tg: string) => {
    const parsedTags = tg.split(',').map((s) => s.trim()).filter(Boolean);
    if (note) {
      await noteSvc.current.updateNote(note.id, { content: c, title: t || undefined, tags: parsedTags });
    } else {
      const created = await noteSvc.current.createNote({ scope, url: currentUrl, workspaceId: activeWorkspaceId, content: c, title: t || undefined, tags: parsedTags });
      setNote(created);
    }
    setSaved(true);
    const notes = await noteSvc.current.getAllNotes();
    setAllNotes(notes);
    setTimeout(() => setSaved(false), 2000);
  }, [note, scope, currentUrl, activeWorkspaceId]);

  const schedule = useCallback((c: string, t: string, tg: string) => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(c, t, tg), 600);
  }, [saveNote]);

  /* ── Settings helpers ── */
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

  /* ── Derived ── */
  const scopeKey = scope === 'url' ? normalizeUrl(currentUrl) : scope === 'domain' ? currentDomain : scope === 'workspace' ? (workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? 'Workspace') : 'Global';
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const filteredNotes = searchNotes(allNotes, searchQ);

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Loading TabNotes…</span>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
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
          <span>{activeWs ? activeWs.name : 'No Workspace'}</span>
        </div>
        <div className="sp-header-actions">
          <button className="sp-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">
            {theme === 'dark' ? '☀' : '☽'}
          </button>
          <button className="sp-icon-btn" onClick={() => cr?.runtime?.openOptionsPage()} title="Full settings">⚙</button>
        </div>
      </div>

      {/* ── Scope bar (only for note view) ── */}
      {view === 'note' && (
        <div className="sp-scope-bar">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`sp-scope-btn ${scope === opt.value ? 'active' : ''}`}
              onClick={() => handleScopeChange(opt.value)}
            >
              <span className="sp-scope-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Context strip (only for note view) ── */}
      {view === 'note' && (
        <div className="sp-context-strip">
          <span className="sp-context-key">{scopeKey || '—'}</span>
          {saved && (
            <span className="sp-save-badge">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Saved
            </span>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="sp-content">

        {/* View: Note editor */}
        {view === 'note' && (
          <div className="sp-note-view">
            <input
              className="sp-note-title-input"
              value={title}
              onChange={(e) => { setTitle(e.target.value); schedule(content, e.target.value, tags); }}
              placeholder="Title"
            />

            {preview && markdownEnabled ? (
              <div
                className="sp-markdown-preview"
                dangerouslySetInnerHTML={{ __html: content ? parseMarkdown(content) : '<p style="color:var(--text-subtle);font-style:italic">Nothing to preview yet.</p>' }}
              />
            ) : (
              <textarea
                className={`sp-note-textarea${markdownEnabled ? ' mono' : ''}`}
                autoFocus
                value={content}
                onChange={(e) => { setContent(e.target.value); schedule(e.target.value, title, tags); }}
                placeholder={`Note for this ${scope}…`}
              />
            )}

            <div className="sp-tags-row">
              <span className="sp-tags-label">Tags</span>
              <input
                className="sp-tags-input"
                value={tags}
                onChange={(e) => { setTags(e.target.value); schedule(content, title, e.target.value); }}
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <div className="sp-note-meta">
              <span className="sp-note-meta-text">{content.split(/\s+/).filter(Boolean).length}w</span>
              <span className="sp-note-meta-sep">·</span>
              <span className="sp-note-meta-text">{content.length}ch</span>
              {note && (
                <>
                  <span className="sp-note-meta-sep">·</span>
                  <span className="sp-note-meta-text">{formatRelativeTime(note.updatedAt)}</span>
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
          </div>
        )}

        {/* View: All notes */}
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
                  <button onClick={() => setSearchQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 12, padding: 0, fontFamily: 'var(--font)' }}>✕</button>
                )}
              </div>
            </div>

            <div className="sp-notes-list">
              {filteredNotes.length === 0 ? (
                <div className="sp-empty-state">
                  <div className="sp-empty-icon">✎</div>
                  <div className="sp-empty-title">{searchQ ? 'No results' : 'No notes yet'}</div>
                  <div className="sp-empty-desc">{searchQ ? `Nothing matched "${searchQ}"` : 'Switch to Note tab and start writing.'}</div>
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
                        setNote(n); setContent(n.content); setTitle(n.title ?? ''); setTags(n.tags.join(', '));
                        setScope(n.scope); setView('note'); setPreview(false);
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

            {/* FAB — new note */}
            <button
              className="sp-fab"
              title="New note"
              onClick={async () => {
                const n = await noteSvc.current.createNote({ scope: defaultScope, url: currentUrl, workspaceId: activeWorkspaceId });
                setNote(n); setContent(''); setTitle(''); setTags(''); setScope(defaultScope);
                const notes = await noteSvc.current.getAllNotes();
                setAllNotes(notes);
                setView('note');
              }}
            >+</button>
          </div>
        )}

        {/* View: Settings */}
        {view === 'settings' && (
          <div className="sp-settings-view">
            {/* Theme */}
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

            {/* Editor */}
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

            {/* Default scope */}
            <div className="sp-settings-section">
              <div className="sp-settings-label">Default Scope</div>
              <div className="sp-scope-grid">
                {SCOPE_OPTIONS.map((s) => (
                  <div key={s.value} className={`sp-scope-row${defaultScope === s.value ? ' active' : ''}`} onClick={() => setDefaultScope(s.value)}>
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

            {/* Workspace */}
            <div className="sp-settings-section">
              <div className="sp-settings-label">Active Workspace</div>
              <div className="sp-scope-grid">
                <div className={`sp-scope-row${activeWorkspaceId === null ? ' active' : ''}`} onClick={async () => { await wsSvc.current.setActive(null); setActiveWorkspaceId(null); }}>
                  <span className="sp-scope-row-icon">🌍</span>
                  <div className="sp-scope-row-info">
                    <div className="sp-scope-row-name">No Workspace</div>
                    <div className="sp-scope-row-desc">Global notes</div>
                  </div>
                  {activeWorkspaceId === null && <span className="sp-scope-row-check">✓</span>}
                </div>
                {workspaces.map((ws) => (
                  <div key={ws.id} className={`sp-scope-row${activeWorkspaceId === ws.id ? ' active' : ''}`} onClick={async () => { await wsSvc.current.setActive(ws.id); setActiveWorkspaceId(ws.id); }}>
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

            {/* Stats */}
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

            {/* Pro card */}
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
