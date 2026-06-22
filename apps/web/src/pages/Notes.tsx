import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNotesStore } from '../store/notes';
import { Note, NoteScope, formatRelativeTime, searchNotes, renderMarkdown } from '@tabnotes/shared';

const SCOPE_OPTIONS = [
  { value: 'url' as NoteScope, label: 'URL', icon: '⌁' },
  { value: 'domain' as NoteScope, label: 'Domain', icon: '◎' },
  { value: 'workspace' as NoteScope, label: 'Workspace', icon: '⊞' },
  { value: 'global' as NoteScope, label: 'Global', icon: '◇' },
];

function parseMarkdown(text: string): string {
  // Shared renderer sanitizes its output before returning.
  return renderMarkdown(text);
}

export default function NotesPage() {
  const { notes, workspaces, activeWorkspaceId, load, createNote, updateNote, deleteNote, markdownEnabled } = useNotesStore();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | NoteScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const [newScope, setNewScope] = useState<NoteScope>('global');
  const [creating, setCreating] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { load(); }, [load]);

  const workspaceNotes = notes.filter((n) => n.workspaceId === activeWorkspaceId);

  const filteredNotes = searchNotes(
    filterScope === 'all' ? workspaceNotes : workspaceNotes.filter((n) => n.scope === filterScope),
    searchQuery
  );

  const allTags = [...new Set(workspaceNotes.flatMap((n) => n.tags))].sort();

  const selectNote = (note: Note) => {
    setSelectedNote(note);
    setEditContent(note.content);
    setEditTitle(note.title ?? '');
    setEditTags(note.tags.join(', '));
    setSaved(false);
    setPreviewMode(false);
  };

  const doSave = useCallback(async (content: string, title: string, tags: string) => {
    if (!selectedNote) return;
    const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    await updateNote(selectedNote.id, { content, title: title || undefined, tags: parsedTags });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [selectedNote, updateNote]);

  const scheduleAutosave = useCallback((content: string, title: string, tags: string) => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(content, title, tags), 700);
  }, [doSave]);

  const handleCreate = async () => {
    setCreating(true);
    const note = await createNote({ scope: newScope });
    setCreating(false);
    selectNote(note);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteNote(id);
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: 0 }}>Notes</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {workspaceNotes.length} note{workspaceNotes.length !== 1 ? 's' : ''}
            {activeWs ? ` · Workspace: ${activeWs.name}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select
            value={newScope}
            onChange={(e) => setNewScope(e.target.value as NoteScope)}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
          </select>
          <button onClick={handleCreate} disabled={creating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-accent-ink)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            + New Note
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-subtle)', fontSize: 13, pointerEvents: 'none' }}>⌕</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, titles, tags…"
            style={{ width: '100%', paddingLeft: 30, padding: '8px 12px 8px 30px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Scope filter pills */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--color-bg-muted)', borderRadius: 'var(--radius-md)', padding: 2 }}>
          {['all', ...SCOPE_OPTIONS.map((s) => s.value)].map((s) => {
            const opt = SCOPE_OPTIONS.find((o) => o.value === s);
            const isActive = filterScope === s;
            return (
              <button key={s} onClick={() => setFilterScope(s as typeof filterScope)} style={{ padding: '5px 10px', borderRadius: 'calc(var(--radius-md) - 2px)', border: 'none', background: isActive ? 'var(--color-bg)' : 'transparent', color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', fontWeight: isActive ? 600 : 400, fontSize: 'var(--text-xs)', cursor: 'pointer', fontFamily: 'var(--font-sans)', boxShadow: isActive ? 'var(--shadow-sm)' : 'none', whiteSpace: 'nowrap' }}>
                {opt ? `${opt.icon} ${opt.label}` : 'All'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tag quick-filter */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setSearchQuery(searchQuery === tag ? '' : tag)} style={{ padding: '3px 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', background: searchQuery === tag ? 'var(--color-accent)' : 'var(--color-bg-muted)', color: searchQuery === tag ? 'var(--color-accent-ink)' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Split pane */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-4)', minHeight: 520 }}>
        {/* List */}
        <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {filteredNotes.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {searchQuery ? 'No results for "' + searchQuery + '"' : 'No notes yet'}
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredNotes.map((note) => {
                const scope = SCOPE_OPTIONS.find((s) => s.value === note.scope);
                const isSelected = selectedNote?.id === note.id;
                return (
                  <div key={note.id} onClick={() => selectNote(note)} style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-bg)', transition: 'background var(--transition-fast)', position: 'relative' }}
                    onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-subtle)'; }}
                    onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 11 }}>{scope?.icon}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{note.scope}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', flexShrink: 0 }}>{formatRelativeTime(note.updatedAt)}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: note.title ? 600 : 400, color: note.title ? 'var(--color-text)' : 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: note.tags.length ? 4 : 0 }}>
                      {note.title || note.content.slice(0, 55) || 'Empty note'}
                    </div>
                    {note.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {note.tags.slice(0, 3).map((t) => (
                          <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--color-bg-muted)', color: 'var(--color-text-subtle)' }}>#{t}</span>
                        ))}
                      </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }} style={{ position: 'absolute', right: 6, top: 6, padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-subtle)', fontSize: 10, cursor: 'pointer', opacity: 0, fontFamily: 'var(--font-sans)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-danger)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        {selectedNote ? (
          <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Editor toolbar */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-bg-subtle)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12 }}>{SCOPE_OPTIONS.find((s) => s.value === selectedNote.scope)?.icon}</span>
              <input
                value={editTitle}
                onChange={(e) => { setEditTitle(e.target.value); scheduleAutosave(editContent, e.target.value, editTags); }}
                placeholder="Title (optional)"
                style={{ flex: 1, minWidth: 120, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--color-text)', outline: 'none' }}
              />
              {markdownEnabled && (
                <div style={{ display: 'flex', background: 'var(--color-bg-muted)', borderRadius: 6, padding: 2, gap: 1 }}>
                  {['Edit', 'Preview'].map((mode) => {
                    const isActive = mode === 'Preview' ? previewMode : !previewMode;
                    return (
                      <button key={mode} onClick={() => setPreviewMode(mode === 'Preview')} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: isActive ? 'var(--color-bg)' : 'transparent', color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: isActive ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {mode}
                      </button>
                    );
                  })}
                </div>
              )}
              <span style={{ fontSize: 'var(--text-xs)', color: saved ? 'var(--color-success)' : 'var(--color-text-subtle)', transition: 'color var(--transition-base)', flexShrink: 0 }}>
                {saved ? '✓ Saved' : 'Auto-saves'}
              </span>
            </div>

            {/* Tags input */}
            <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-subtle)' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>Tags:</span>
              <input
                value={editTags}
                onChange={(e) => { setEditTags(e.target.value); scheduleAutosave(editContent, editTitle, e.target.value); }}
                placeholder="tag1, tag2, tag3"
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', outline: 'none' }}
              />
            </div>

            {/* Content area */}
            {previewMode && markdownEnabled ? (
              <div
                style={{ flex: 1, padding: 'var(--space-5)', overflowY: 'auto', fontSize: 'var(--text-md)', lineHeight: 1.7, color: 'var(--color-text)' }}
                dangerouslySetInnerHTML={{ __html: editContent ? parseMarkdown(editContent) : '<p style="color:var(--color-text-subtle)"><em>Nothing to preview</em></p>' }}
              />
            ) : (
              <textarea
                autoFocus
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); scheduleAutosave(e.target.value, editTitle, editTags); }}
                placeholder="Start writing…"
                style={{ flex: 1, padding: 'var(--space-5)', fontFamily: markdownEnabled ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 'var(--text-md)', lineHeight: 1.7, border: 'none', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'none', outline: 'none', minHeight: 400 }}
              />
            )}

            {/* Footer */}
            <div style={{ padding: '6px 14px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-bg-subtle)', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
              <span>{editContent.length} chars</span>
              <span>·</span>
              <span>{editContent.split(/\s+/).filter(Boolean).length} words</span>
              <span>·</span>
              <span>Updated {formatRelativeTime(selectedNote.updatedAt)}</span>
              {selectedNote.scopeKey && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{selectedNote.scopeKey}</span></>}
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 'var(--radius-lg)', border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: 32 }}>✎</span>
            <span style={{ fontSize: 'var(--text-sm)' }}>Select a note or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
}
