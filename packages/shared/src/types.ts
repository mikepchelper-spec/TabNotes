export type NoteScope = 'url' | 'domain' | 'workspace' | 'global';

export interface Note {
  id: string;
  workspaceId: string | null;
  scope: NoteScope;
  scopeKey: string;
  title?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface StorageData {
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string | null;
  defaultScope: NoteScope;
  theme: 'light' | 'dark' | 'system';
  version: number;
}

export interface ExportData {
  version: number;
  exportedAt: number;
  notes: Note[];
  workspaces: Workspace[];
}
