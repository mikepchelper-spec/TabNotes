import { create } from 'zustand';
import {
  Note,
  Workspace,
  NoteScope,
  LocalStorageAdapter,
  NotesService,
  WorkspacesService,
  StorageData,
} from '@tabnotes/shared';

const adapter = new LocalStorageAdapter();
const notesService = new NotesService(adapter);
const workspacesService = new WorkspacesService(adapter);

interface NotesStore {
  notes: Note[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  defaultScope: NoteScope;
  loading: boolean;
  load: () => Promise<void>;
  createNote: (params: { scope: NoteScope; url?: string; content?: string; title?: string }) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Pick<Note, 'content' | 'title'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  setActiveWorkspace: (id: string | null) => Promise<void>;
  setDefaultScope: (scope: NoteScope) => Promise<void>;
  exportData: () => Promise<StorageData>;
  importData: (data: string) => Promise<void>;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  notes: [],
  workspaces: [],
  activeWorkspaceId: null,
  defaultScope: 'domain',
  loading: false,

  load: async () => {
    set({ loading: true });
    const [notes, workspaces, activeWorkspaceId] = await Promise.all([
      notesService.getAllNotes(),
      workspacesService.getAll(),
      workspacesService.getActive(),
    ]);
    const data = await adapter.get();
    set({ notes, workspaces, activeWorkspaceId, defaultScope: data.defaultScope, loading: false });
  },

  createNote: async ({ scope, url = 'https://tabnotes.app', content, title }) => {
    const { activeWorkspaceId } = get();
    const note = await notesService.createNote({ scope, url, workspaceId: activeWorkspaceId, content, title });
    await get().load();
    return note;
  },

  updateNote: async (id, updates) => {
    await notesService.updateNote(id, updates);
    await get().load();
  },

  deleteNote: async (id) => {
    await notesService.deleteNote(id);
    await get().load();
  },

  createWorkspace: async (name) => {
    const ws = await workspacesService.create(name);
    await get().load();
    return ws;
  },

  updateWorkspace: async (id, name) => {
    await workspacesService.update(id, name);
    await get().load();
  },

  deleteWorkspace: async (id) => {
    await workspacesService.delete(id);
    await get().load();
  },

  setActiveWorkspace: async (id) => {
    await workspacesService.setActive(id);
    set({ activeWorkspaceId: id });
  },

  setDefaultScope: async (scope) => {
    await adapter.set({ defaultScope: scope });
    set({ defaultScope: scope });
  },

  exportData: async () => {
    return adapter.get();
  },

  importData: async (jsonStr) => {
    const parsed = JSON.parse(jsonStr) as Partial<StorageData>;
    const current = await adapter.get();
    await adapter.set({
      notes: { ...current.notes, ...(parsed.notes ?? {}) },
      workspaces: { ...current.workspaces, ...(parsed.workspaces ?? {}) },
    });
    await get().load();
  },
}));
