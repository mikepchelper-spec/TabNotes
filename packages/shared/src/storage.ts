import type { Note, NoteVersion, Workspace, StorageData, ExportData, NoteScope } from './types';
import { generateId, getScopeKey } from './utils';

export const STORAGE_VERSION = 2;

export const DEFAULT_STORAGE: StorageData = {
  notes: {},
  workspaces: {},
  activeWorkspaceId: null,
  defaultScope: 'domain',
  theme: 'system',
  markdownEnabled: false,
  version: STORAGE_VERSION,
};

export interface StorageAdapter {
  get(): Promise<StorageData>;
  set(data: Partial<StorageData>): Promise<void>;
  clear(): Promise<void>;
}

function migrateNote(raw: Partial<Note>): Note {
  return {
    id: raw.id ?? generateId(),
    workspaceId: raw.workspaceId ?? null,
    scope: raw.scope ?? 'global',
    scopeKey: raw.scopeKey ?? '',
    title: raw.title,
    content: raw.content ?? '',
    tags: raw.tags ?? [],
    folder: raw.folder,
    versions: raw.versions ?? [],
    reminderAt: raw.reminderAt,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

export class LocalStorageAdapter implements StorageAdapter {
  private key = 'tabnotes_data';

  async get(): Promise<StorageData> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...DEFAULT_STORAGE };
      const parsed = JSON.parse(raw) as Partial<StorageData>;
      const notes: Record<string, Note> = {};
      for (const [id, note] of Object.entries(parsed.notes ?? {})) {
        notes[id] = migrateNote(note as Partial<Note>);
      }
      return { ...DEFAULT_STORAGE, ...parsed, notes };
    } catch {
      return { ...DEFAULT_STORAGE };
    }
  }

  async set(data: Partial<StorageData>): Promise<void> {
    const current = await this.get();
    localStorage.setItem(this.key, JSON.stringify({ ...current, ...data }));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

export class ChromeStorageAdapter implements StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get api(): any {
    return typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).chrome
      ? (globalThis as Record<string, unknown>).chrome
      : null;
  }

  async get(): Promise<StorageData> {
    const api = this.api;
    return new Promise((resolve) => {
      if (!api?.storage) { resolve({ ...DEFAULT_STORAGE }); return; }
      api.storage.local.get('tabnotes_data', (result: Record<string, unknown>) => {
        const raw = result['tabnotes_data'] as Partial<StorageData> | undefined;
        const notes: Record<string, Note> = {};
        for (const [id, note] of Object.entries(raw?.notes ?? {})) {
          notes[id] = migrateNote(note as Partial<Note>);
        }
        resolve({ ...DEFAULT_STORAGE, ...(raw ?? {}), notes });
      });
    });
  }

  async set(data: Partial<StorageData>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...data };
    const api = this.api;
    return new Promise((resolve) => {
      if (!api?.storage) { resolve(); return; }
      api.storage.local.set({ tabnotes_data: updated }, resolve);
    });
  }

  async clear(): Promise<void> {
    const api = this.api;
    return new Promise((resolve) => {
      if (!api?.storage) { resolve(); return; }
      api.storage.local.remove('tabnotes_data', resolve);
    });
  }
}

export class NotesService {
  constructor(private adapter: StorageAdapter) {}

  async getAllNotes(): Promise<Note[]> {
    const data = await this.adapter.get();
    return Object.values(data.notes).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getNoteByScope(scope: NoteScope, url: string, workspaceId?: string | null): Promise<Note | null> {
    const notes = await this.getNotesByScope(scope, url, workspaceId);
    return notes[0] ?? null;
  }

  async getNotesByScope(scope: NoteScope, url: string, workspaceId?: string | null): Promise<Note[]> {
    const data = await this.adapter.get();
    const scopeKey = getScopeKey(scope, url, workspaceId);
    return Object.values(data.notes)
      .filter((n) => n.scope === scope && n.scopeKey === scopeKey && n.workspaceId === (workspaceId ?? null))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async createNote(params: {
    scope: NoteScope; url: string;
    workspaceId?: string | null; content?: string; title?: string; tags?: string[]; folder?: string;
  }): Promise<Note> {
    const data = await this.adapter.get();
    const now = Date.now();
    const note: Note = {
      id: generateId(),
      workspaceId: params.workspaceId ?? null,
      scope: params.scope,
      scopeKey: getScopeKey(params.scope, params.url, params.workspaceId),
      title: params.title,
      content: params.content ?? '',
      tags: params.tags ?? [],
      folder: params.folder,
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.adapter.set({ notes: { ...data.notes, [note.id]: note } });
    return note;
  }

  async updateNote(
    id: string,
    updates: Partial<Pick<Note, 'content' | 'title' | 'tags' | 'folder' | 'reminderAt'>>,
  ): Promise<Note | null> {
    const data = await this.adapter.get();
    const note = data.notes[id];
    if (!note) return null;

    // Snapshot version before content changes (keep max 5)
    const versions: NoteVersion[] = [...(note.versions ?? [])];
    if (updates.content !== undefined && updates.content !== note.content) {
      versions.push({ content: note.content, title: note.title, savedAt: note.updatedAt });
      if (versions.length > 5) versions.splice(0, versions.length - 5);
    }

    const updated: Note = { ...note, ...updates, versions, updatedAt: Date.now() };
    await this.adapter.set({ notes: { ...data.notes, [id]: updated } });
    return updated;
  }

  async deleteNote(id: string): Promise<void> {
    const data = await this.adapter.get();
    const notes = { ...data.notes };
    delete notes[id];
    await this.adapter.set({ notes });
  }

  async getOrCreateNote(params: { scope: NoteScope; url: string; workspaceId?: string | null }): Promise<Note> {
    return (await this.getNoteByScope(params.scope, params.url, params.workspaceId))
      ?? this.createNote(params);
  }
}

export class WorkspacesService {
  constructor(private adapter: StorageAdapter) {}

  async getAll(): Promise<Workspace[]> {
    const data = await this.adapter.get();
    return Object.values(data.workspaces).sort((a, b) => a.createdAt - b.createdAt);
  }

  async create(name: string, color?: string): Promise<Workspace> {
    const data = await this.adapter.get();
    const now = Date.now();
    const workspace: Workspace = { id: generateId(), name, color, createdAt: now, updatedAt: now };
    await this.adapter.set({ workspaces: { ...data.workspaces, [workspace.id]: workspace } });
    return workspace;
  }

  async update(id: string, updates: Partial<Pick<Workspace, 'name' | 'color'>>): Promise<Workspace | null> {
    const data = await this.adapter.get();
    const ws = data.workspaces[id];
    if (!ws) return null;
    const updated: Workspace = { ...ws, ...updates, updatedAt: Date.now() };
    await this.adapter.set({ workspaces: { ...data.workspaces, [id]: updated } });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const data = await this.adapter.get();
    const workspaces = { ...data.workspaces };
    delete workspaces[id];
    const activeWorkspaceId = data.activeWorkspaceId === id ? null : data.activeWorkspaceId;
    await this.adapter.set({ workspaces, activeWorkspaceId });
  }

  async setActive(id: string | null): Promise<void> {
    await this.adapter.set({ activeWorkspaceId: id });
  }

  async getActive(): Promise<string | null> {
    return (await this.adapter.get()).activeWorkspaceId;
  }
}

export function exportData(data: StorageData): ExportData {
  return {
    version: STORAGE_VERSION,
    exportedAt: Date.now(),
    notes: Object.values(data.notes),
    workspaces: Object.values(data.workspaces),
  };
}

export function importData(exported: ExportData, current: StorageData): StorageData {
  const notes = { ...current.notes };
  for (const n of exported.notes) notes[n.id] = n;
  const workspaces = { ...current.workspaces };
  for (const ws of exported.workspaces) workspaces[ws.id] = ws;
  return { ...current, notes, workspaces };
}
