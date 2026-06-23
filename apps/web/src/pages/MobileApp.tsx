import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatRelativeTime,
  htmlToPlainText,
  sanitizeHtml,
  type Note,
  type NoteScope,
} from '@tabnotes/shared';
import { useNotesStore } from '../store/notes';

function fieldStyle(): React.CSSProperties {
  return {
    width: '100%',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    background: 'var(--color-bg-card)',
    color: 'var(--color-text)',
    padding: '11px 12px',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  };
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-accent)' : 'var(--color-bg-card)',
    color: active ? 'var(--color-accent-ink)' : 'var(--color-text-muted)',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function getWorkspaceFolders(notes: Note[], workspaceId: string | null): string[] {
  return [
    ...new Set(
      notes
        .filter((note) => note.workspaceId === workspaceId)
        .map((note) => note.folder?.trim())
        .filter((folder): folder is string => Boolean(folder))
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function noteMatches(note: Note, query: string): boolean {
  if (!query.trim()) return true;
  const text =
    `${note.title ?? ''} ${htmlToPlainText(note.content)} ${note.tags.join(' ')} ${note.folder ?? ''}`.toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function displayFolderName(value: string): string {
  return value.startsWith('/') ? value.slice(1) : value;
}

function getNoteTitle(note: Note): string {
  return note.title || htmlToPlainText(note.content).slice(0, 48) || 'Untitled';
}

function getNotePreview(note: Note): string {
  return htmlToPlainText(note.content).replace(/\s+/g, ' ').slice(0, 130);
}

function noteHasHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

export default function MobileAppPage() {
  const {
    notes,
    workspaces,
    sync,
    load,
    createNote,
    updateNote,
    deleteNote,
    syncWithDrive,
    disconnectDrive,
  } = useNotesStore();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [editorMode, setEditorMode] = useState<'read' | 'edit'>('edit');
  const draftRef = useRef({ title: '', content: '', tags: '', folder: '' });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    draftRef.current = { title, content, tags, folder };
  }, [title, content, tags, folder]);

  const folders = useMemo(() => getWorkspaceFolders(notes, workspaceId), [notes, workspaceId]);
  const selectedNote = selectedNoteId
    ? (notes.find((note) => note.id === selectedNoteId) ?? null)
    : null;
  const visibleNotes = notes
    .filter((note) => note.workspaceId === workspaceId)
    .filter((note) => !folder || note.folder === folder)
    .filter((note) => noteMatches(note, query));

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const safeRenderedContent = useMemo(() => sanitizeHtml(content), [content]);
  const selectedHasHtml = noteHasHtml(content);
  const syncLabel =
    sync.status === 'ok'
      ? `Synced ${sync.lastSyncIso ? formatRelativeTime(Date.parse(sync.lastSyncIso)) : ''}`
      : sync.status === 'local'
        ? 'Local changes pending'
        : sync.status === 'syncing'
          ? 'Syncing with Drive'
          : sync.status === 'setup_required'
            ? 'Drive setup required'
            : sync.status === 'error'
              ? 'Sync needs attention'
              : 'Drive disconnected';

  function startNewNote() {
    setSelectedNoteId(null);
    setTitle('');
    setContent('');
    setTags('');
    setDraftDirty(false);
    setEditorMode('edit');
  }

  function selectNote(note: Note) {
    setSelectedNoteId(note.id);
    setTitle(note.title ?? '');
    setContent(note.content);
    setTags(note.tags.join(', '));
    setFolder(note.folder ?? '');
    setDraftDirty(false);
    setEditorMode('read');
  }

  useEffect(() => {
    if (!selectedNoteId || draftDirty || saving) return;
    const latest = notes.find((note) => note.id === selectedNoteId);
    if (!latest) {
      setSelectedNoteId(null);
      setTitle('');
      setContent('');
      setTags('');
      setDraftDirty(false);
      setEditorMode('edit');
      return;
    }

    setTitle(latest.title ?? '');
    setContent(latest.content);
    setTags(latest.tags.join(', '));
    setFolder(latest.folder ?? '');
  }, [draftDirty, notes, saving, selectedNoteId]);

  const saveCurrentNote = useCallback(
    async (mode: 'manual' | 'auto' = 'manual') => {
      if (!content.trim() && !title.trim()) return;
      if (mode === 'auto' && !selectedNote) return;

      setSaving(true);
      const draft = { title, content, tags, folder };
      try {
        const parsedTags = draft.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        if (selectedNote) {
          await updateNote(selectedNote.id, {
            title: draft.title.trim() || undefined,
            content: draft.content,
            tags: parsedTags,
            folder: draft.folder || undefined,
          });
        } else {
          const scope: NoteScope = workspaceId ? 'workspace' : 'global';
          const note = await createNote({
            scope,
            workspaceId,
            title: draft.title.trim() || undefined,
            content: draft.content,
            tags: parsedTags,
            folder: draft.folder || undefined,
          });
          setSelectedNoteId(note.id);
        }
        const latest = draftRef.current;
        if (
          latest.title === draft.title &&
          latest.content === draft.content &&
          latest.tags === draft.tags &&
          latest.folder === draft.folder
        ) {
          setDraftDirty(false);
        }
        if (mode === 'manual') setEditorMode('read');
      } finally {
        setSaving(false);
      }
    },
    [content, createNote, folder, selectedNote, tags, title, updateNote, workspaceId]
  );

  useEffect(() => {
    if (!selectedNote || !draftDirty || saving) return;
    const timer = window.setTimeout(() => {
      void saveCurrentNote('auto');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [draftDirty, saveCurrentNote, saving, selectedNote]);

  function updateDraft(setter: (value: string) => void, value: string) {
    setter(value);
    setDraftDirty(true);
  }

  async function removeSelectedNote() {
    if (!selectedNote) return;
    const ok = confirm(
      'Delete this note? It will be deleted from synced devices after Drive sync.'
    );
    if (!ok) return;
    await deleteNote(selectedNote.id);
    startNewNote();
  }

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 920, margin: '0 auto' }}>
      <section
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          background: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-md)',
          padding: 'clamp(16px, 4vw, 26px)',
          display: 'grid',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <p
              style={{
                color: 'var(--color-accent)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0,
              }}
            >
              TABNOTES WEB
            </p>
            <h1 style={{ fontSize: 34, lineHeight: 1.06, marginTop: 6 }}>
              Your TabNotes, everywhere.
            </h1>
            <p
              style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 8 }}
            >
              Read, edit, and sync notes with the same private Drive app data used by the extension.
            </p>
          </div>
          <button
            onClick={() => syncWithDrive(true)}
            disabled={sync.status === 'syncing'}
            style={{
              border: 'none',
              borderRadius: 999,
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              padding: '10px 14px',
              fontWeight: 800,
              cursor: sync.status === 'syncing' ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {sync.status === 'syncing' ? 'Syncing' : 'Sync'}
          </button>
        </div>

        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            background: 'var(--color-bg-subtle)',
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <strong style={{ fontSize: 'var(--text-sm)' }}>{syncLabel}</strong>
            {sync.status !== 'setup_required' && (
              <button
                onClick={disconnectDrive}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 999,
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-muted)',
                  padding: '5px 10px',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            )}
          </div>
          {sync.lastError && (
            <p style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)' }}>
              {sync.lastError}
            </p>
          )}
          {sync.status === 'setup_required' && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
              Add a Google OAuth Web Application client ID in the web runtime config before enabling
              Drive sync.
            </p>
          )}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
          gap: 16,
        }}
        className="mobile-app-grid"
      >
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 18,
              background: 'var(--color-bg-card)',
              padding: 14,
              display: 'grid',
              gap: 12,
            }}
          >
            <label
              style={{
                display: 'grid',
                gap: 6,
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              Workspace
              <select
                value={workspaceId ?? ''}
                onChange={(event) => {
                  setWorkspaceId(event.target.value || null);
                  setFolder('');
                  startNewNote();
                }}
                style={fieldStyle()}
              >
                <option value="">Global notes</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              <button type="button" onClick={() => setFolder('')} style={pillStyle(folder === '')}>
                All
              </button>
              {folders.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFolder(item)}
                  style={pillStyle(folder === item)}
                >
                  {displayFolderName(item)}
                </button>
              ))}
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              style={fieldStyle()}
            />
          </div>

          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 18,
              background: 'var(--color-bg-card)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <strong>{selectedWorkspace?.name ?? 'Global notes'}</strong>
              <p
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                  marginTop: 2,
                }}
              >
                {visibleNotes.length} note{visibleNotes.length === 1 ? '' : 's'}
              </p>
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {visibleNotes.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  No notes in this view.
                </div>
              ) : (
                visibleNotes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => selectNote(note)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      background:
                        selectedNoteId === note.id ? 'var(--color-accent-subtle)' : 'transparent',
                      color: 'var(--color-text)',
                      padding: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                      {getNoteTitle(note)}
                    </strong>
                    {getNotePreview(note) && (
                      <span
                        style={{
                          display: '-webkit-box',
                          color: 'var(--color-text-subtle)',
                          fontSize: 'var(--text-xs)',
                          lineHeight: 1.45,
                          marginTop: 4,
                          overflow: 'hidden',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                        }}
                      >
                        {getNotePreview(note)}
                      </span>
                    )}
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--color-text-muted)',
                        fontSize: 'var(--text-xs)',
                        marginTop: 4,
                      }}
                    >
                      {note.folder ? `${displayFolderName(note.folder)} · ` : ''}
                      {formatRelativeTime(note.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 18,
            background: 'var(--color-bg-card)',
            padding: 14,
            display: 'grid',
            gap: 12,
            alignContent: 'start',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <strong>{selectedNote ? getNoteTitle(selectedNote) : 'New note'}</strong>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {selectedNote && (
                <div
                  aria-label="Editor mode"
                  style={{
                    display: 'flex',
                    border: '1px solid var(--color-border)',
                    borderRadius: 999,
                    background: 'var(--color-bg-subtle)',
                    padding: 3,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditorMode('read')}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      background: editorMode === 'read' ? 'var(--color-accent)' : 'transparent',
                      color:
                        editorMode === 'read'
                          ? 'var(--color-accent-ink)'
                          : 'var(--color-text-muted)',
                      padding: '5px 9px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('edit')}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      background: editorMode === 'edit' ? 'var(--color-accent)' : 'transparent',
                      color:
                        editorMode === 'edit'
                          ? 'var(--color-accent-ink)'
                          : 'var(--color-text-muted)',
                      padding: '5px 9px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
              <button
                onClick={startNewNote}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 999,
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text-muted)',
                  padding: '6px 10px',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                New
              </button>
            </div>
          </div>

          {editorMode === 'read' && selectedNote ? (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span>{folder ? displayFolderName(folder) : 'No category'}</span>
                <span>{formatRelativeTime(selectedNote.updatedAt)}</span>
                {selectedHasHtml && <span>Rich text</span>}
              </div>
              <article
                className="tn-note-viewer"
                dangerouslySetInnerHTML={{
                  __html: safeRenderedContent || '<p class="tn-note-empty">No content yet.</p>',
                }}
              />
              {tags.trim() && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .map((tag) => (
                      <span
                        key={tag}
                        style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: 999,
                          color: 'var(--color-text-muted)',
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setEditorMode('edit')}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  padding: '12px 14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Edit this note
              </button>
            </>
          ) : (
            <>
              <label
                style={{
                  display: 'grid',
                  gap: 6,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Existing category
                <select
                  value={folder}
                  onChange={(event) => updateDraft(setFolder, event.target.value)}
                  style={fieldStyle()}
                >
                  <option value="">No category</option>
                  {folders.map((item) => (
                    <option key={item} value={item}>
                      {displayFolderName(item)}
                    </option>
                  ))}
                </select>
              </label>

              <input
                value={title}
                onChange={(event) => updateDraft(setTitle, event.target.value)}
                placeholder="Title"
                style={fieldStyle()}
              />
              {selectedHasHtml && (
                <p style={{ color: 'var(--color-warning)', fontSize: 'var(--text-xs)' }}>
                  This note contains rich formatting from the extension. Editing here preserves the
                  raw HTML, but use the extension for precise rich-text changes.
                </p>
              )}
              <textarea
                value={content}
                onChange={(event) => updateDraft(setContent, event.target.value)}
                placeholder="Write a note from the web app"
                style={{
                  ...fieldStyle(),
                  minHeight: 220,
                  resize: 'vertical',
                  lineHeight: 1.6,
                  fontFamily: selectedHasHtml ? 'var(--font-mono)' : 'var(--font-sans)',
                }}
              />
              <input
                value={tags}
                onChange={(event) => updateDraft(setTags, event.target.value)}
                placeholder="tags, separated, by comma"
                style={fieldStyle()}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void saveCurrentNote('manual')}
                  disabled={saving || (!content.trim() && !title.trim())}
                  style={{
                    flex: '1 1 160px',
                    border: 'none',
                    borderRadius: 12,
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-ink)',
                    padding: '12px 14px',
                    fontWeight: 800,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving || (!content.trim() && !title.trim()) ? 0.6 : 1,
                  }}
                >
                  {saving
                    ? 'Saving'
                    : selectedNote
                      ? draftDirty
                        ? 'Save changes'
                        : 'Saved'
                      : 'Add note'}
                </button>
                {selectedNote && (
                  <button
                    onClick={removeSelectedNote}
                    style={{
                      border: '1px solid var(--color-danger-subtle)',
                      borderRadius: 12,
                      background: 'var(--color-danger-subtle)',
                      color: 'var(--color-danger)',
                      padding: '12px 14px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
