import React, { useEffect, useState } from 'react';
import { useNotesStore } from '../store/notes';

const WORKSPACE_COLORS = [
  { value: '#dcae19', label: 'Yellow' },
  { value: '#2f6dff', label: 'Blue' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#10b981', label: 'Green' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#14b8a6', label: 'Teal' },
];

export default function WorkspacesPage() {
  const { workspaces, notes, activeWorkspaceId, load, createWorkspace, updateWorkspace, deleteWorkspace, setActiveWorkspace } = useNotesStore();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#dcae19');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await createWorkspace(newName.trim(), newColor);
    setNewName('');
    setNewColor('#dcae19');
    setCreating(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await updateWorkspace(id, { name: editName.trim(), color: editColor });
    setEditId(null);
    setEditName('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workspace and all its workspace-scoped notes?')) return;
    await deleteWorkspace(id);
  };

  const noteCountByWorkspace = (wsId: string) =>
    notes.filter((n) => n.workspaceId === wsId).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 640 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: 0 }}>Workspaces</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
          Organize your notes into projects and switch contexts instantly.
        </p>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New workspace name..."
            style={{
              flex: 1,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Color:</span>
          {WORKSPACE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setNewColor(c.value)}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: c.value,
                border: newColor === c.value ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
                cursor: 'pointer',
                padding: 0,
                transform: newColor === c.value ? 'scale(1.15)' : 'none',
                transition: 'transform 0.1s ease',
              }}
              title={c.label}
            />
          ))}
        </div>
      </form>

      {/* No workspaces */}
      {workspaces.length === 0 && (
        <div
          style={{
            padding: 'var(--space-10)',
            textAlign: 'center',
            border: '2px dashed var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 'var(--space-3)' }}>⊞</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No workspaces yet</div>
          <div style={{ fontSize: 'var(--text-sm)' }}>Create one to group your notes by project.</div>
        </div>
      )}

      {/* Workspace list */}
      {workspaces.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* No workspace (global) */}
          <div
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${activeWorkspaceId === null ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: activeWorkspaceId === null ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onClick={() => setActiveWorkspace(null)}
          >
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              ◇
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>No Workspace (Global)</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {notes.filter((n) => !n.workspaceId).length} notes
              </div>
            </div>
            {activeWorkspaceId === null && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600 }}>Active</span>
            )}
          </div>

          {workspaces.map((ws) => {
            const isActive = activeWorkspaceId === ws.id;
            const isEditing = editId === ws.id;
            const count = noteCountByWorkspace(ws.id);

            return (
              <div
                key={ws.id}
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isActive ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div
                  onClick={() => setActiveWorkspace(ws.id)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: ws.color || 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {ws.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setActiveWorkspace(ws.id)}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(ws.id); if (e.key === 'Escape') setEditId(null); }}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            border: '1px solid var(--color-accent)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 6px',
                            background: 'var(--color-bg)',
                            color: 'var(--color-text)',
                            outline: 'none',
                            width: '100%',
                          }}
                        />
                        <button
                          onClick={() => handleUpdate(ws.id)}
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-accent-ink)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                        >
                          Cancel
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {WORKSPACE_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setEditColor(c.value)}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              background: c.value,
                              border: editColor === c.value ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{ws.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{count} notes</div>
                    </>
                  )}
                </div>
                {isActive && !isEditing && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600 }}>Active</span>
                )}
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      onClick={() => { setEditId(ws.id); setEditName(ws.name); setEditColor(ws.color || '#dcae19'); }}
                      style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-muted)', color: 'var(--color-text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ws.id)}
                      style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-danger-subtle)', background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
