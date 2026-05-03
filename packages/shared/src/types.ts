export type NoteScope = 'url' | 'domain' | 'workspace' | 'global';

export interface NoteVersion {
  content: string;
  title?: string;
  savedAt: number;
}

export interface Note {
  id: string;
  workspaceId: string | null;
  scope: NoteScope;
  scopeKey: string;
  title?: string;
  content: string;
  tags: string[];
  folder?: string;
  versions?: NoteVersion[];
  reminderAt?: number;
  encrypted?: boolean;
  encryptedData?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StorageData {
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string | null;
  defaultScope: NoteScope;
  theme: 'light' | 'dark' | 'system';
  markdownEnabled: boolean;
  version: number;
}

export interface ExportPrefs {
  colors?: Record<string, string>;
  pins?: string[];
  fontsize?: number;
  align?: 'left' | 'center' | 'right';
  features?: Record<string, boolean>;
  digest?: { enabled?: boolean; time?: string };
  streak?: { count?: number; lastDate?: string };
}

export interface ExportData {
  version: number;
  exportedAt: number;
  notes: Note[];
  workspaces: Workspace[];
  prefs?: ExportPrefs;
}
