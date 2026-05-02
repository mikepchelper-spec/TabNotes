import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNotesStore } from '../store/notes';
import { Note, NoteScope, formatRelativeTime } from '@tabnotes/shared';

const SCOPE_OPTIONS = [
  { value: 'url' as NoteScope, label: 'URL', icon: '🔗' },
  { value: 'domain' as NoteScope, label: 'Domain', icon: '🌐' },
  { value: 'workspace' as NoteScope, label: 'Workspace', icon: '⊞' },
  { value: 'global' as NoteScope, label: 'Global', icon: '🌍' },
];

const ALL_SCOPES = ['all', ...SCOPE_OPTIONS.map((s) => s.value)] as const;

export default function NotesPage() {
  const { notes, workspaces, activeWorkspaceId, load, createNote, updateNote, deleteNote } = useNotesStore();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [filterScope, setFilterScope] = useState<'all' | NoteScope>('all');
  const [saved, setSaved] = useState(false);
  const [newScope, setNewScope] = useState<NoteScope>('global');
  const [creating, setCreating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const filteredNotes = filterScope === 'all' ? notes : notes.filter((n) => n.scope === filterScope);

  const selectNote = (note: Note) => {
    setSelectedNote(note);
    setEditContent(note.content);
    setEditTitle(note.title ?? '');
    setSaved(false);
  };

  const handleContentChange = useCallback(
    (val: string) => {
      setEditContent(val);
      setSaved(false);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (selectedNote) {
          await updateNote(selectedNote.id, { content: val, title: editTitle });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      }, 800);
    },
    [selectedNote, editTitle, updateNote]
  );

  const handleTitleChange = useCallback(
    (val: string) => {
      setEditTitle(val);
      setSaved(false);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (selectedNote) {
          await updateNote(selectedNote.id, { title: val, content: editContent });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      }, 800);
    },
    [selectedNote, editContent, updateNote]
  );

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.5px' }}>Notes</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select
            value={newScope}
            onChange={(e) => setNewScope(e.target.value as NoteScope)}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              padding: '7px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {SCOPE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '7px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Scope filter */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', background: 'var(--color-bg-muted)', borderRadius: 'var(--radius-md)', padding: 2, width: 'fit-content' }}>
        {['all', ...SCOPE_OPTIONS.map((s) => s.value)].map((s) => {
          const opt = SCOPE_OPTIONS.find((o) => o.value === s);
          const isActive = filterScope === s;
          return (
            <button
              key={s}
              onClick={() => setFilterScope(s as typeof filterScope)}
              style={{
                padding: '5px 12px',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                border: 'none',
                background: isActive ? 'var(--color-bg)' : 'transparent',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              {opt ? `${opt.icon} ${opt.label}` : 'All'}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-4)', minHeight: 500 }}>
        {/* Notes list */}
        <div
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filteredNotes.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              No notes yet. Create one!
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredNotes.map((note) => {
                const scope = SCOPE_OPTIONS.find((s) => s.value === note.scope);
                const isSelected = selectedNote?.id === note.id;
                return (
                  <div
                    key={note.id}
                    onClick={() => selectNote(note)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                      transition: 'background var(--transition-fast)',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-subtle)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 4 }}>
                      <span style={{ fontSize: 11 }}>{scope?.icon}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                        {note.scope}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                        {formatRelativeTime(note.updatedAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: note.title ? 600 : 400, color: note.title ? 'var(--color-text)' : 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {note.title || note.content.slice(0, 60) || 'Empty note'}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-text-subtle)',
                        fontSize: 11,
                        cursor: 'pointer',
                        opacity: 0,
                        fontFamily: 'var(--font-sans)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-danger)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                      className="delete-btn"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        {selectedNote ? (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Editor header */}
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                background: 'var(--color-bg-subtle)',
              }}
            >
              <span style={{ fontSize: 12 }}>
                {SCOPE_OPTIONS.find((s) => s.value === selectedNote.scope)?.icon}
              </span>
              <input
                value={editTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Note title (optional)"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: saved ? 'var(--color-success)' : 'var(--color-text-subtle)',
                  transition: 'color var(--transition-base)',
                }}
              >
                {saved ? '✓ Saved' : 'Auto-saves'}
              </span>
            </div>
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing..."
              style={{
                flex: 1,
                padding: 'var(--space-5)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-md)',
                lineHeight: 1.7,
                border: 'none',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                resize: 'none',
                outline: 'none',
                minHeight: 400,
              }}
            />
            {/* Footer */}
            <div
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                background: 'var(--color-bg-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-subtle)',
              }}
            >
              <span>{editContent.length} chars</span>
              <span>·</span>
              <span>{editContent.split(/\s+/).filter(Boolean).length} words</span>
              <span>·</span>
              <span>Created {formatRelativeTime(selectedNote.createdAt)}</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '2px dashed var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              gap: 'var(--space-3)',
            }}
          >
            <span style={{ fontSize: 32 }}>✎</span>
            <span style={{ fontSize: 'var(--text-sm)' }}>Select a note or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
}
