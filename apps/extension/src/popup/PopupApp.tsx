import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Note,
  NoteScope,
  ChromeStorageAdapter,
  NotesService,
  WorkspacesService,
  Workspace,
  normalizeUrl,
  normalizeDomain,
  formatRelativeTime,
} from '@tabnotes/shared';
import './popup.css';

const SCOPE_OPTIONS: { value: NoteScope; label: string; icon: string }[] = [
  { value: 'url', label: 'URL', icon: '🔗' },
  { value: 'domain', label: 'Domain', icon: '🌐' },
  { value: 'workspace', label: 'Workspace', icon: '⊞' },
  { value: 'global', label: 'Global', icon: '🌍' },
];

export default function PopupApp() {
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');
  const [scope, setScope] = useState<NoteScope>('domain');
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const adapter = useRef(new ChromeStorageAdapter());
  const notesService = useRef(new NotesService(adapter.current));
  const workspacesService = useRef(new WorkspacesService(adapter.current));

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mq.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const url = tab?.url ?? '';
      setCurrentUrl(url);
      setCurrentDomain(normalizeDomain(url));

      const [wsList, activeWsId, storageData] = await Promise.all([
        workspacesService.current.getAll(),
        workspacesService.current.getActive(),
        adapter.current.get(),
      ]);
      setWorkspaces(wsList);
      setActiveWorkspaceId(activeWsId);
      const savedScope = storageData.defaultScope ?? 'domain';
      setScope(savedScope);
      await loadNote(savedScope, url, activeWsId);
      setLoading(false);
    });
  }, []);

  const loadNote = useCallback(async (s: NoteScope, url: string, wsId: string | null) => {
    const existing = await notesService.current.getNoteByScope(s, url, wsId);
    setNote(existing);
    setContent(existing?.content ?? '');
    setTitle(existing?.title ?? '');
  }, []);

  const handleScopeChange = async (s: NoteScope) => {
    setScope(s);
    await loadNote(s, currentUrl, activeWorkspaceId);
  };

  const handleChange = (val: string) => {
    setContent(val);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(val, title), 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(content, val), 600);
  };

  const saveNote = async (c: string, t: string) => {
    if (note) {
      await notesService.current.updateNote(note.id, { content: c, title: t });
    } else {
      const created = await notesService.current.createNote({
        scope,
        url: currentUrl,
        workspaceId: activeWorkspaceId,
        content: c,
        title: t,
      });
      setNote(created);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const scopeKey = scope === 'url'
    ? normalizeUrl(currentUrl)
    : scope === 'domain'
    ? currentDomain
    : scope === 'workspace'
    ? (workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? 'Default')
    : 'Global';

  if (loading) {
    return (
      <div className="popup-loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="popup-root">
      {/* Header */}
      <div className="popup-header">
        <div className="popup-logo">
          <div className="logo-icon">T</div>
          <span className="logo-text">TabNotes</span>
        </div>
        <button className="icon-btn" onClick={openOptions} title="Settings">⚙</button>
      </div>

      {/* Scope switcher */}
      <div className="scope-bar">
        {SCOPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`scope-btn ${scope === opt.value ? 'active' : ''}`}
            onClick={() => handleScopeChange(opt.value)}
            title={opt.label}
          >
            <span className="scope-icon">{opt.icon}</span>
            <span className="scope-label">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Scope context */}
      <div className="scope-context">
        <span className="scope-key">{scopeKey || 'Global note'}</span>
        {saved && <span className="saved-badge">✓ Saved</span>}
      </div>

      {/* Title */}
      <input
        className="note-title"
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Title (optional)"
      />

      {/* Editor */}
      <textarea
        className="note-editor"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={`Write your ${scope} note here…`}
        autoFocus
      />

      {/* Footer */}
      <div className="popup-footer">
        <span className="footer-meta">
          {note ? formatRelativeTime(note.updatedAt) : 'New note'}
        </span>
        <span className="footer-count">{content.length} chars</span>
      </div>
    </div>
  );
}
