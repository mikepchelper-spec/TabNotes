import React, { useEffect, useState } from 'react';
import { useNotesStore } from '../store/notes';

export default function WorkspacesPage() {
  const { workspaces, notes, activeWorkspaceId, load, createWorkspace, updateWorkspace, deleteWorkspace, setActiveWorkspace } = useNotesStore();
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await createWorkspace(newName.trim());
    setNewName('');
    setCreating(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await updateWorkspace(id, editName.trim());
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
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.5px' }}>Workspaces</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
          Organize your notes into projects and switch contexts instantly.
        </p>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
            color: '#fff',
            fontWeight: 600,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}
        >
          Create
        </button>
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
              🌍
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
                    background: 'var(--color-accent)',
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
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleUpdate(ws.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(ws.id); if (e.key === 'Escape') setEditId(null); }}
                      onClick={(e) => e.stopPropagation()}
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
                  ) : (
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{ws.name}</div>
                  )}
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{count} notes</div>
                </div>
                {isActive && !isEditing && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 600 }}>Active</span>
                )}
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      onClick={() => { setEditId(ws.id); setEditName(ws.name); }}
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
