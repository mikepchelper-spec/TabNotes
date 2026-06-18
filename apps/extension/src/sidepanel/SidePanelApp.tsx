import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Note,
  NoteScope,
  type MoveNoteTarget,
  ChromeStorageAdapter,
  NotesService,
  WorkspacesService,
  normalizeDomain,
  stripFormatting,
} from '@tabnotes/shared';
import { useSidePanelStore } from './store';
import { ViewHost } from './views/ViewHost';
import { usePinLock } from './hooks/usePinLock';
import { useFolderManager } from './hooks/useFolderManager';
import { useChromeStorageAndTabs } from './hooks/useChromeStorageAndTabs';
import { useNoteActions } from './hooks/useNoteActions';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useWorkspaceManager } from './hooks/useWorkspaceManager';
import { usePreferences } from './hooks/usePreferences';
import { BottomNav } from './components/BottomNav';
import { ScopeBar } from './components/ScopeBar';
import { HeaderBar } from './components/HeaderBar';
import { ContextStrip } from './components/ContextStrip';
import { NoteTree, type Template } from './components/NoteTree';
import { CommandPalette } from './components/CommandPalette';
import { EncryptionPrompt } from './components/EncryptionPrompt';
import { PendingReminders } from './components/PendingReminders';
import { AppIcon, type AppIconName } from './components/AppIcon';
import { useTranslation, type TranslationKey } from '@tabnotes/i18n';
import {
  DEFAULT_SNOOZE_MINUTES,
  OPEN_REMINDER_REQUEST_STORAGE_KEY,
  PENDING_REMINDERS_STORAGE_KEY,
  PendingNoteReminder,
  normalizePendingReminders,
  removePendingReminder,
} from '../shared/reminders';
import './sidepanel.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cr: any =
  typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).chrome
    ? (globalThis as Record<string, unknown>).chrome
    : null;

interface RuntimeResponse {
  ok?: boolean;
  error?: string;
  reminderAt?: number;
}

function sendRuntimeMessage(message: Record<string, unknown>): Promise<RuntimeResponse | null> {
  return new Promise((resolve, reject) => {
    if (!cr?.runtime?.sendMessage) {
      resolve(null);
      return;
    }

    cr.runtime.sendMessage(message, (response: RuntimeResponse | undefined) => {
      const lastError = cr.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response ?? null);
    });
  });
}



const SCOPE_OPTIONS: { value: NoteScope; label: string; icon: AppIconName; desc: string }[] = [
  { value: 'url', label: 'URL', icon: 'url', desc: 'Exact page URL' },
  { value: 'domain', label: 'Domain', icon: 'domain', desc: 'Entire site' },
  { value: 'workspace', label: 'Projects', icon: 'workspace', desc: 'Your project' },
  { value: 'global', label: 'Global', icon: 'global', desc: 'Everywhere' },
];

const templateFieldKey = (id: Template['id'], field: 'title' | 'content'): TranslationKey =>
  `templates.${id}.${field}` as TranslationKey;

const templateDateLocale = (language?: string) =>
  language?.toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';

// ── Crypto utilities ──────────────────────────────────────────
// AES-256-GCM encryption now lives in @tabnotes/shared (crypto.ts), where it
// is unit-tested. encryptText / decryptText are imported above.

// ── Note graph component ──────────────────────────────────────
// Extracted to editor/NoteGraph.tsx (Task 3.1); imported above.

// ── Feature flags type now lives in store/types (DEFAULT_FEATURES imported) ──

// ── Chat types now imported from views/ChatView ──────────────


export default function SidePanelApp() {
  const { t, i18n } = useTranslation();

  // Services
  const adapter = useRef(new ChromeStorageAdapter());
  const noteSvc = useRef(new NotesService(adapter.current));
  const wsSvc = useRef(new WorkspacesService(adapter.current));
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const contentSavedRef = useRef(''); // last content persisted — dirty-check for cross-tab sync
  const lastSaveTs = useRef(0); // timestamp of our most recent save — skip our own writes

  // Refs for stable autosave (no stale closures)
  const activeNoteIdRef = useRef<string | null>(null);
  const scopeRef = useRef<NoteScope>('domain');
  const currentUrlRef = useRef('');
  const wsIdRef = useRef<string | null>(null);

  // Zustand Store Hooks / Selectors
  const view = useSidePanelStore((s) => s.view);
  const setView = useSidePanelStore((s) => s.setView);
  const theme = useSidePanelStore((s) => s.theme);
  const setPreview = useSidePanelStore((s) => s.setPreview);

  const currentUrl = useSidePanelStore((s) => s.currentUrl);
  const setCurrentUrl = useSidePanelStore((s) => s.setCurrentUrl);
  const setCurrentDomain = useSidePanelStore((s) => s.setCurrentDomain);

  const setContextNotes = useSidePanelStore((s) => s.setContextNotes);
  const workspaces = useSidePanelStore((s) => s.workspaces);
  const activeWorkspaceId = useSidePanelStore((s) => s.activeWorkspaceId);

  const scope = useSidePanelStore((s) => s.scope);
  const setScope = useSidePanelStore((s) => s.setScope);
  const activeNoteId = useSidePanelStore((s) => s.activeNoteId);
  const setActiveNoteId = useSidePanelStore((s) => s.setActiveNoteId);
  const content = useSidePanelStore((s) => s.content);
  const setContent = useSidePanelStore((s) => s.setContent);
  const title = useSidePanelStore((s) => s.title);
  const setTitle = useSidePanelStore((s) => s.setTitle);
  const tags = useSidePanelStore((s) => s.tags);
  const setTags = useSidePanelStore((s) => s.setTags);
  const setSaved = useSidePanelStore((s) => s.setSaved);

  const noteColors = useSidePanelStore((s) => s.noteColors);
  const setNoteColors = useSidePanelStore((s) => s.setNoteColors);
  const setPinnedNotes = useSidePanelStore((s) => s.setPinnedNotes);
  const setFolderColors = useSidePanelStore((s) => s.setFolderColors);
  const setExpandedFolders = useSidePanelStore((s) => s.setExpandedFolders);

  const setFontSizeState = useSidePanelStore((s) => s.setFontSizeState);
  const setDefaultAlignState = useSidePanelStore((s) => s.setDefaultAlignState);
  const setFeatures = useSidePanelStore((s) => s.setFeatures);

  // Quick-capture: ref so the storage.onChanged handler can call it without stale closure
  const addNoteToContextRef = useRef<() => Promise<void>>(async () => {});

  // Rich editor ref (contentEditable div)
  const editorRef = useRef<HTMLDivElement>(null);

  // Invoke Chrome Storage and Tabs Synchronization hook
  const {
    loading,
    tabLoading,
    streak,
    setStreak,
    digestEnabled,
    setDigestEnabled,
    digestTime,
    setDigestTime,
    backupRemindDays,
    setBackupRemindDays,
    groqKey,
    setGroqKey,
    groqKeyInput,
    setGroqKeyInput,
    groqKeyVisible,
    setGroqKeyVisible,
    isOnline,
    pendingSyncIds,
    setPendingSyncIds,
    syncedToast,
    clipFeedback,
    refreshAllNotes,
    loadContextNotes,
    saveDigest,
  } = useChromeStorageAndTabs({
    adapter,
    noteSvc,
    wsSvc,
    saveTimer,
    contentSavedRef,
    lastSaveTs,
    editorRef,
    activeNoteIdRef,
    scopeRef,
    currentUrlRef,
    wsIdRef,
    addNoteToContextRef,
  });

  // Local UI / Interactive States
  const [checklistMode, setChecklistMode] = useState(false);
  const [checklistItems, setChecklistItems] = useState<{ id: string; checked: boolean; text: string }[]>([]);
  const isUpdatingChecklistRef = useRef(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  // Invoke Note Actions hook (Import / Export / PDF / Encryption)
  const {
    dataFeedback,
    exportCurrentNote,
    exportToPDF,
    handleLockNote,
    handleUnlockNote,
    handleExport,
    handleImport,
  } = useNoteActions({
    adapter,
    noteSvc,
    wsSvc,
    refreshAllNotes,
    setContextNotes,
    scopeRef,
    currentUrlRef,
    wsIdRef,
    activeNoteIdRef,
    importInputRef,
    setBackupRemindDays,
  });

  const [deletePillConfirmId, setDeletePillConfirmId] = useState<string | null>(null);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<string | null>(null);

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Collapsible scope groups — all collapsed by default
  const [collapsedScopes, setCollapsedScopes] = useState<Set<string>>(
    new Set(['url', 'domain', 'workspace', 'global'])
  );
  const toggleScope = (sc: string) =>
    setCollapsedScopes((prev) => {
      const n = new Set(prev);
      n.has(sc) ? n.delete(sc) : n.add(sc);
      return n;
    });

  // Tag filter in All Notes
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Typewriter mode / Wiki autocomplete / Encryption
  const [showEncPrompt, setShowEncPrompt] = useState<'lock' | 'unlock' | null>(null);

  // History / Reminders / Reference panel
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const reminderRef = useRef<HTMLDivElement>(null);
  const [reminderInput, setReminderInput] = useState('');
  const [pendingReminders, setPendingReminders] = useState<PendingNoteReminder[]>([]);
  const [refNoteId, setRefNoteId] = useState<string | null>(null);
  const [showRefPanel, setShowRefPanel] = useState(false);

  // Templates dropdown
  const [showTemplates, setShowTemplates] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);

  const [colorPickerNoteId, setColorPickerNoteId] = useState<string | null>(null);

  // Invoke PIN Lock hook
  const {
    pinHash,
    pinLocked,
    pinEntry,
    setPinEntry,
    pinError,
    setPinError,
    pinSetInput,
    setPinSetInput,
    pinSetConfirm,
    setPinSetConfirm,
    pinSetFeedback,
    savePin,
    removePin,
    lockNow,
    submitPinUnlock,
  } = usePinLock();

  // ── Note Selection Callback ──
  const selectNote = useCallback((n: Note) => {
    clearTimeout(saveTimer.current);
    setActiveNoteId(n.id);
    activeNoteIdRef.current = n.id;
    setContent(n.content);
    setTitle(stripFormatting(n.title ?? ''));
    setTags(n.tags.join(', '));
    setSaved(false);
    setPreview(false);
  }, [setActiveNoteId, setContent, setTitle, setTags, setSaved, setPreview]);

  // Invoke Folder Manager hook
  const {
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,
    showMovePicker,
    setShowMovePicker,
    newFolderRef,
    folderMenuRef,
    dragOverFolder,
    isDragging,
    createFolder,
    renameFolder,
    deleteFolder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFolderManager({
    currentUrlRef,
    scopeRef,
    wsIdRef,
    noteSvc,
    adapter,
    selectNote,
    refreshAllNotes,
    setContextNotes,
  });

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);
  // Invoke Workspace and Reminder manager hook
  const {
    editWsName,
    setEditWsName,
    editWsColor,
    setEditWsColor,
    newWsNameInput,
    setNewWsNameInput,
    newWsColorInput,
    setNewWsColorInput,
    wsDropdown,
    setWsDropdown,
    wsDropdownRef,
    onSetActiveWorkspace,
    onSwitchWorkspace,
    onUpdateWorkspace,
    onDeleteWorkspace,
    onCreateWorkspace,
    onSetReminder,
    onClearReminder,
  } = useWorkspaceManager({
    wsSvc,
    noteSvc,
    wsIdRef,
    activeNoteId,
    currentUrlRef,
    scopeRef,
    refreshAllNotes,
    loadContextNotes,
  });

  // Invoke Preferences hook
  const {
    copied,
    focusMode,
    setFocusMode,
    typewriterMode,
    setTypewriterMode,
    setTheme,
    setMarkdown,
    setDefaultScope,
    copyNote,
    togglePin,
    changeFontSize,
    setDefaultAlign,
    toggleFeature,
    language,
    setLanguage,
  } = usePreferences({
    adapter,
    title,
    content,
  });

  const openPendingReminder = useCallback(
    async (noteId: string, dismiss = true) => {
      clearTimeout(saveTimer.current);

      const notes = await refreshAllNotes();
      const note = notes.find((candidate) => candidate.id === noteId);
      if (!note) {
        if (dismiss) {
          setPendingReminders((prev) => removePendingReminder(prev, noteId));
          await sendRuntimeMessage({ type: 'DISMISS_REMINDER', noteId }).catch(() => null);
        }
        return;
      }

      if (note.workspaceId !== wsIdRef.current) {
        await onSetActiveWorkspace(note.workspaceId ?? null);
      }

      setScope(note.scope);
      scopeRef.current = note.scope;

      const contextForNote = notes
        .filter(
          (candidate) =>
            candidate.scope === note.scope &&
            candidate.scopeKey === note.scopeKey &&
            candidate.workspaceId === (note.workspaceId ?? null)
        )
        .sort((a, b) => a.createdAt - b.createdAt);
      setContextNotes(contextForNote);

      if (note.scope === 'url') {
        setCurrentUrl(note.scopeKey);
        currentUrlRef.current = note.scopeKey;
        setCurrentDomain(normalizeDomain(note.scopeKey));
      } else if (note.scope === 'domain') {
        const contextUrl = `https://${note.scopeKey}/`;
        setCurrentUrl(contextUrl);
        currentUrlRef.current = contextUrl;
        setCurrentDomain(note.scopeKey);
      }

      selectNote(note);
      setView('note');
      setShowRefPanel(false);

      if (dismiss) {
        setPendingReminders((prev) => removePendingReminder(prev, noteId));
        await sendRuntimeMessage({ type: 'DISMISS_REMINDER', noteId }).catch(() => null);
      }

      setTimeout(() => editorRef.current?.focus(), 120);
    },
    [
      refreshAllNotes,
      onSetActiveWorkspace,
      setScope,
      setContextNotes,
      setCurrentUrl,
      setCurrentDomain,
      selectNote,
      setView,
      setShowRefPanel,
    ]
  );

  const dismissPendingReminder = useCallback(async (noteId: string) => {
    setPendingReminders((prev) => removePendingReminder(prev, noteId));
    await sendRuntimeMessage({ type: 'DISMISS_REMINDER', noteId }).catch(() => null);
  }, []);

  const snoozePendingReminder = useCallback(
    async (noteId: string) => {
      setPendingReminders((prev) => removePendingReminder(prev, noteId));
      const response = await sendRuntimeMessage({
        type: 'SNOOZE_REMINDER',
        noteId,
        minutes: DEFAULT_SNOOZE_MINUTES,
      }).catch(() => null);

      if (response?.ok === false) {
        await dismissPendingReminder(noteId);
        return;
      }

      await refreshAllNotes();
    },
    [dismissPendingReminder, refreshAllNotes]
  );

  useEffect(() => {
    if (!cr?.storage?.local) return;

    cr.storage.local.get(
      [PENDING_REMINDERS_STORAGE_KEY, OPEN_REMINDER_REQUEST_STORAGE_KEY],
      (result: Record<string, unknown>) => {
        setPendingReminders(normalizePendingReminders(result[PENDING_REMINDERS_STORAGE_KEY]));
        const request = result[OPEN_REMINDER_REQUEST_STORAGE_KEY] as
          | { noteId?: unknown }
          | undefined;
        if (typeof request?.noteId === 'string') {
          openPendingReminder(request.noteId);
          cr.storage.local.remove(OPEN_REMINDER_REQUEST_STORAGE_KEY);
        }
      }
    );

    const handler = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string
    ) => {
      if (area !== 'local') return;

      if (changes[PENDING_REMINDERS_STORAGE_KEY]) {
        setPendingReminders(
          normalizePendingReminders(changes[PENDING_REMINDERS_STORAGE_KEY].newValue)
        );
      }

      const request = changes[OPEN_REMINDER_REQUEST_STORAGE_KEY]?.newValue as
        | { noteId?: unknown }
        | undefined;
      if (typeof request?.noteId === 'string') {
        openPendingReminder(request.noteId);
        cr.storage.local.remove(OPEN_REMINDER_REQUEST_STORAGE_KEY);
      }
    };

    cr.storage.onChanged.addListener(handler);
    return () => cr.storage.onChanged.removeListener(handler);
  }, [openPendingReminder]);


  // ── Load extra prefs from localStorage ───────────────────────
  useEffect(() => {
    try {
      const colors = localStorage.getItem('tn_colors');
      if (colors) setNoteColors(JSON.parse(colors));
      const pins = localStorage.getItem('tn_pins');
      if (pins) setPinnedNotes(new Set(JSON.parse(pins)));
      const fs = localStorage.getItem('tn_fontsize');
      if (fs) setFontSizeState(Number(fs));
      const al = localStorage.getItem('tn_align') as 'left' | 'center' | 'right' | null;
      if (al) setDefaultAlignState(al);
      const ft = localStorage.getItem('tn_features');
      if (ft) setFeatures((prev) => ({ ...prev, ...JSON.parse(ft) }));
      const fColors = localStorage.getItem('tn_folder_colors');
      if (fColors) setFolderColors(JSON.parse(fColors));
    } catch {
      /* ignore */
    }
  }, [setNoteColors, setPinnedNotes, setFontSizeState, setDefaultAlignState, setFeatures, setFolderColors]);

  // ── Click outside → close templates dropdown ─────────────────
  useEffect(() => {
    if (!showTemplates) return;
    const handle = (e: MouseEvent) => {
      if (!templatesRef.current?.contains(e.target as Node)) setShowTemplates(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showTemplates]);

  // ── Click outside → close color picker ───────────────────────
  useEffect(() => {
    if (!colorPickerNoteId) return;
    const handle = (e: MouseEvent) => {
      const el = document.querySelector('.sp-color-picker');
      if (el && !el.contains(e.target as Node)) setColorPickerNoteId(null);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [colorPickerNoteId]);



  // ── Scope switch ──────────────────────────────────────────────
  const handleScopeChange = async (s: NoteScope) => {
    setScope(s);
    scopeRef.current = s;
    setPreview(false);
    clearTimeout(saveTimer.current);
    await loadContextNotes(currentUrlRef.current, s, wsIdRef.current);
    await refreshAllNotes();
  };



  const updateStreak = React.useCallback(async () => {
    if (!cr?.storage?.local) return;
    const today = new Date().toISOString().split('T')[0];
    const sr = await new Promise<Record<string, unknown>>((res) =>
      cr.storage.local.get('tn_streak', res)
    );
    const s = sr['tn_streak'] as { count?: number; lastDate?: string } | undefined;
    if (s?.lastDate === today) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const newCount = s?.lastDate === yStr ? (s.count ?? 0) + 1 : 1;
    await new Promise<void>((res) =>
      cr.storage.local.set({ tn_streak: { count: newCount, lastDate: today } }, res)
    );
    setStreak(newCount);
  }, [setStreak]);

  const addNoteToContext = async (folderName?: string) => {
    const url = currentUrlRef.current;
    if (!url || url.startsWith('chrome://')) return;
    const folder = folderName || undefined;
    const created = await noteSvc.current.createNote({
      scope: scopeRef.current,
      url,
      workspaceId: wsIdRef.current,
      folder,
    });
    if (folder) {
      setExpandedFolders((prev) => ({ ...prev, [folder]: true }));
    }
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    selectNote(created);
    await refreshAllNotes();
    updateStreak();
  };
  addNoteToContextRef.current = addNoteToContext;

  // ── Autosave — uses refs, never stale ────────────────────────
  const saveNote = useCallback(
    async (c: string, t: string, tg: string) => {
      const id = activeNoteIdRef.current;
      const parsedTags = tg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      let saved: Note | null = null;

      if (id) {
        saved = await noteSvc.current.updateNote(id, {
          content: c,
          title: t || undefined,
          tags: parsedTags,
        });
      } else {
        const url = currentUrlRef.current;
        if (!url || url.startsWith('chrome://')) return;
        saved = await noteSvc.current.createNote({
          scope: scopeRef.current,
          url,
          workspaceId: wsIdRef.current,
          content: c,
          title: t || undefined,
          tags: parsedTags,
        });
      }

      if (saved) {
        activeNoteIdRef.current = saved.id;
        setActiveNoteId(saved.id);
        // Refresh context notes to reflect updated title in pill
        const url = currentUrlRef.current;
        const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
        setContextNotes(notes);
      }

      // Track what we just saved so cross-tab sync can tell it's not a remote change
      contentSavedRef.current = c;
      lastSaveTs.current = Date.now();

      // Track offline queue — note saved locally; will "sync" when reconnected
      if (!navigator.onLine && saved?.id) {
        setPendingSyncIds((prev) => new Set([...prev, saved.id]));
      }

      setSaved(true);
      await refreshAllNotes();
      updateStreak();
      setTimeout(() => setSaved(false), 2000);
    },
    [refreshAllNotes, updateStreak, setContextNotes, setActiveNoteId, setSaved, setPendingSyncIds]
  );

  const moveNote = useCallback(
    async (noteId: string, target: MoveNoteTarget) => {
      clearTimeout(saveTimer.current);

      // Flush pending editor changes before relocating a currently open note.
      if (activeNoteIdRef.current === noteId) {
        await saveNote(content, title, tags);
      }

      const moved = await noteSvc.current.moveNote(noteId, target);
      if (!moved) return;

      const destinationWorkspaceId = moved.workspaceId ?? null;
      if (destinationWorkspaceId !== wsIdRef.current) {
        await onSetActiveWorkspace(destinationWorkspaceId);
      } else {
        wsIdRef.current = destinationWorkspaceId;
      }

      setScope(moved.scope);
      scopeRef.current = moved.scope;

      let contextUrl = currentUrlRef.current;
      if (moved.scope === 'url') {
        contextUrl = moved.scopeKey;
        setCurrentDomain(normalizeDomain(contextUrl));
      } else if (moved.scope === 'domain') {
        contextUrl = `https://${moved.scopeKey}/`;
        setCurrentDomain(moved.scopeKey);
      } else if (!contextUrl) {
        contextUrl = 'https://tabnotes.local/';
      }

      setCurrentUrl(contextUrl);
      currentUrlRef.current = contextUrl;

      await loadContextNotes(contextUrl, moved.scope, destinationWorkspaceId, moved.id);
      const movedInContext = useSidePanelStore
        .getState()
        .contextNotes.find((note) => note.id === moved.id);
      selectNote(movedInContext ?? moved);

      await refreshAllNotes();
    },
    [
      content,
      title,
      tags,
      saveNote,
      onSetActiveWorkspace,
      setScope,
      setCurrentDomain,
      setCurrentUrl,
      loadContextNotes,
      selectNote,
      refreshAllNotes,
    ]
  );

  const schedule = useCallback(
    (c: string, t: string, tg: string) => {
      setSaved(false);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveNote(c, t, tg), 600);
    },
    [saveNote, setSaved]
  );

  // ── Checklist mode (Google Keep style) handlers ───────────────────
  const saveChecklist = useCallback((items: { id: string; checked: boolean; text: string }[]) => {
    const md = items
      .map(it => `${it.checked ? '- [x]' : '- [ ]'} ${it.text}`)
      .join('<br>');
    isUpdatingChecklistRef.current = true;
    setContent(md);
    schedule(md, title, tags);
  }, [title, tags, schedule, setContent]);



  const toggleChecklistMode = () => {
    const nextMode = !checklistMode;
    setChecklistMode(nextMode);

    if (nextMode) {
      // Convert plain text lines to checklist items
      const temp = document.createElement('div');
      temp.innerHTML = content;
      const lines = temp.innerHTML
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const newItems = lines.map((line, idx) => {
        if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
          const checked = line.startsWith('- [x]');
          const text = line.substring(6);
          return { id: `item-${idx}-${Date.now()}-${idx}`, checked, text };
        }
        if (line.startsWith('- ')) {
          return { id: `item-${idx}-${Date.now()}-${idx}`, checked: false, text: line.substring(2) };
        }
        return { id: `item-${idx}-${Date.now()}-${idx}`, checked: false, text: line };
      });

      setChecklistItems(newItems);
      saveChecklist(newItems);
    }
  };

  // ── Screenshot capture ───────────────────────────────────────
  const captureScreenshot = () => {
    cr?.runtime?.sendMessage(
      { type: 'CAPTURE_TAB' },
      (res: { dataUrl?: string; error?: string }) => {
        if (!res?.dataUrl) return;
        const ts = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
        const insert = `\n\n![Screenshot ${ts}](${res.dataUrl})\n`;
        const next = content + insert;
        setContent(next);
        schedule(next, title, tags);
      }
    );
  };

  // Export to PDF is handled by useNoteActions hook


  // Note encryption is handled by useNoteActions hook

  // Daily digest saving is handled by useChromeStorageAndTabs hook







  // ── Bulk delete selected notes ────────────────────────────────
  const bulkDeleteNotes = async () => {
    clearTimeout(saveTimer.current);
    const ids = Array.from(bulkSelectedIds);
    await Promise.all(ids.map((id) => noteSvc.current.deleteNote(id)));
    setBulkSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    setSelectMode(false);
    // If active note was deleted, reset editor
    if (bulkSelectedIds.has(activeNoteIdRef.current ?? '')) {
      const url = currentUrlRef.current;
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
      setContextNotes(notes);
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Delete note by id (from list card) ───────────────────────
  const deleteCardNote = async (id: string) => {
    clearTimeout(saveTimer.current);
    await noteSvc.current.deleteNote(id);
    setDeleteCardConfirmId(null);
    // If we deleted the active note, clear editor
    if (id === activeNoteIdRef.current) {
      const url = currentUrlRef.current;
      const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
      setContextNotes(notes);
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Delete note by id (from pill ×) ──────────────────────────
  const deletePillNote = async (id: string) => {
    clearTimeout(saveTimer.current);
    await noteSvc.current.deleteNote(id);
    const url = currentUrlRef.current;
    const notes = await noteSvc.current.getNotesByScope(scopeRef.current, url, wsIdRef.current);
    setContextNotes(notes);
    setDeletePillConfirmId(null);
    // If we deleted the active note, switch to first remaining
    if (id === activeNoteIdRef.current) {
      const next = notes[0] ?? null;
      activeNoteIdRef.current = next?.id ?? null;
      setActiveNoteId(next?.id ?? null);
      setContent(next?.content ?? '');
      setTitle(next?.title ?? '');
      setTags(next?.tags.join(', ') ?? '');
      setSaved(false);
    }
    await refreshAllNotes();
  };

  // ── Insert date/time at cursor ────────────────────────────────
  const insertDatetime = () => {
    const el = editorRef.current;
    const now = new Date();
    const str = now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (el) {
      el.focus();
      document.execCommand('insertText', false, str);
      const html = el.innerHTML;
      setContent(html);
      schedule(html, title, tags);
    } else {
      const next = content + (content ? '\n' : '') + str;
      setContent(next);
      schedule(next, title, tags);
    }
  };

  // Keyboard Shortcuts Hook
  useKeyboardShortcuts({
    content,
    title,
    tags,
    focusMode,
    setFocusMode,
    setTypewriterMode,
    saveNote,
    insertDatetime,
    saveTimer,
  });

  // Exporting is handled by useNoteActions hook

  // ── Note color ────────────────────────────────────────────────
  const setNoteColor = (noteId: string, color: string) => {
    const next = { ...noteColors };
    if (color) next[noteId] = color;
    else delete next[noteId];
    setNoteColors(next);
    localStorage.setItem('tn_colors', JSON.stringify(next));
    setColorPickerNoteId(null);
  };



  // Folder operations are handled by useFolderManager hook

  // ── Apply template ────────────────────────────────────────────
  const applyTemplate = (tpl: Template) => {
    let newTitle = t(templateFieldKey(tpl.id, 'title'));
    let newContent = t(templateFieldKey(tpl.id, 'content'));

    if (tpl.dynamic) {
      const d = new Date();
      const activeLanguage = i18n.resolvedLanguage || i18n.language || language;
      newTitle = d.toLocaleDateString(templateDateLocale(activeLanguage), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      newContent = t(templateFieldKey(tpl.id, 'content'), { date: newTitle });
    }

    setTitle(newTitle);
    setContent(newContent);
    schedule(newContent, newTitle, tags);
    setShowTemplates(false);
    setTimeout(() => editorRef.current?.focus(), 50);
  };

  // ── Export / Import ───────────────────────────────────────────
  // Import/Export and feedback are handled by useNoteActions hook



  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const isRestrictedUrl =
    !currentUrl ||
    currentUrl.startsWith('chrome://') ||
    currentUrl.startsWith('chrome-extension://');

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Loading TabNotes…</span>
      </div>
    );
  }

  // PIN lock management is handled by usePinLock hook

  if (pinLocked && pinHash) {
    return (
      <div className="sp-root">
        <div className="sp-pin-lock">
          <div className="sp-pin-lock-icon">
            <AppIcon name="lock" size={30} />
          </div>
          <div className="sp-pin-lock-title">TabNotes is locked</div>
          <div className="sp-pin-lock-desc">Enter your PIN to open the side panel.</div>
          <form
            className="sp-pin-lock-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitPinUnlock();
            }}
          >
            <input
              className="sp-pin-lock-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pinEntry}
              placeholder="Enter PIN"
              onChange={(e) => {
                setPinEntry(e.target.value);
                setPinError('');
              }}
            />
            <button type="submit" className="sp-pin-lock-btn" disabled={!pinEntry}>
              Unlock
            </button>
          </form>
          {pinError && <div className="sp-pin-lock-error">{pinError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`sp-root${focusMode ? ' focus-mode' : ''}`}>
      {/* ── Header ── */}
      <HeaderBar
        activeWs={activeWs}
        wsDropdown={wsDropdown}
        setWsDropdown={setWsDropdown}
        wsDropdownRef={wsDropdownRef}
        onSwitchWorkspace={onSwitchWorkspace}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        tabLoading={tabLoading}
        streak={streak}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncIds.size}
        syncedToast={syncedToast}
        language={language}
        setLanguage={setLanguage}
      />

      {/* ── Scope bar ── */}
      {view === 'note' && (
        <ScopeBar
          scopeOptions={SCOPE_OPTIONS}
          onScopeChange={handleScopeChange}
          tabLoading={tabLoading}
        />
      )}

      {/* ── Context strip ── */}
      {view === 'note' && <ContextStrip tabLoading={tabLoading} />}

      <PendingReminders
        reminders={pendingReminders}
        onOpen={openPendingReminder}
        onSnooze={snoozePendingReminder}
        onDismiss={dismissPendingReminder}
      />

      {/* ── Main Layout (Sidebar Tree + Content) ── */}
      <div className="sp-main-layout">
        {!isRestrictedUrl && (
          <NoteTree
            tabLoading={tabLoading}
            isDragging={isDragging}
            dragOverFolder={dragOverFolder}
            showNewFolder={showNewFolder}
            setShowNewFolder={setShowNewFolder}
            newFolderName={newFolderName}
            setNewFolderName={setNewFolderName}
            newFolderRef={newFolderRef}
            templatesRef={templatesRef}
            showTemplates={showTemplates}
            setShowTemplates={setShowTemplates}
            folderMenuRef={folderMenuRef}
            renameFolder={renameFolder}
            deleteFolder={deleteFolder}
            createFolder={createFolder}
            applyTemplate={applyTemplate}
            addNoteToContext={addNoteToContext}
            selectNote={selectNote}
            deletePillNote={deletePillNote}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            deletePillConfirmId={deletePillConfirmId}
            setDeletePillConfirmId={setDeletePillConfirmId}
          />
        )}

      <ViewHost
        tabLoading={tabLoading}
        isRestrictedUrl={isRestrictedUrl}
        selectNote={selectNote}
        checklistMode={checklistMode}
        checklistItems={checklistItems}
        setChecklistItems={setChecklistItems}
        toggleChecklistMode={toggleChecklistMode}
        saveChecklist={saveChecklist}
        editorRef={editorRef}
        onSetReminder={onSetReminder}
        onClearReminder={onClearReminder}
        setShowReminderPicker={setShowReminderPicker}
        setShowHistory={setShowHistory}
        showRefPanel={showRefPanel}
        setShowRefPanel={setShowRefPanel}
        setShowEncPrompt={setShowEncPrompt}
        insertDatetime={insertDatetime}
        copyNote={copyNote}
        clipFeedback={clipFeedback}
        focusMode={focusMode}
        setFocusMode={setFocusMode}
        typewriterMode={typewriterMode}
        setTypewriterMode={setTypewriterMode}
        colorPickerNoteId={colorPickerNoteId}
        setColorPickerNoteId={setColorPickerNoteId}
        onSetNoteColor={setNoteColor}
        isUpdatingChecklistRef={isUpdatingChecklistRef}
        schedule={schedule}
        showMovePicker={showMovePicker}
        setShowMovePicker={setShowMovePicker}
        moveNote={moveNote}
        copied={copied}
        showHistory={showHistory}
        historyRef={historyRef}
        showReminderPicker={showReminderPicker}
        reminderRef={reminderRef}
        reminderInput={reminderInput}
        setReminderInput={setReminderInput}
        exportCurrentNote={exportCurrentNote}
        exportToPDF={exportToPDF}
        captureScreenshot={captureScreenshot}
        refNoteId={refNoteId}
        setRefNoteId={setRefNoteId}
        searchQ={searchQ}
        setSearchQ={setSearchQ}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        selectMode={selectMode}
        setSelectMode={setSelectMode}
        bulkSelectedIds={bulkSelectedIds}
        setBulkSelectedIds={setBulkSelectedIds}
        bulkDeleteConfirm={bulkDeleteConfirm}
        setBulkDeleteConfirm={setBulkDeleteConfirm}
        collapsedScopes={collapsedScopes}
        toggleScope={toggleScope}
        deleteCardConfirmId={deleteCardConfirmId}
        setDeleteCardConfirmId={setDeleteCardConfirmId}
        deleteCardNote={deleteCardNote}
        bulkDeleteNotes={bulkDeleteNotes}
        addNoteToContext={addNoteToContext}
        togglePin={togglePin}
        groqKey={groqKey}
        toggleFeature={toggleFeature}
        groqKeyInput={groqKeyInput}
        setGroqKeyInput={setGroqKeyInput}
        groqKeyVisible={groqKeyVisible}
        setGroqKeyVisible={setGroqKeyVisible}
        saveGroqKey={(key) => {
          cr?.storage?.local?.set({ tn_groq_key: key });
          setGroqKey(key);
        }}
        setTheme={setTheme}
        pinHash={pinHash}
        pinSetInput={pinSetInput}
        setPinSetInput={setPinSetInput}
        pinSetConfirm={pinSetConfirm}
        setPinSetConfirm={setPinSetConfirm}
        pinSetFeedback={pinSetFeedback}
        savePin={savePin}
        removePin={removePin}
        lockNow={lockNow}
        setMarkdown={setMarkdown}
        changeFontSize={changeFontSize}
        setDefaultAlign={setDefaultAlign}
        setDefaultScope={setDefaultScope}
        digestEnabled={digestEnabled}
        setDigestEnabled={setDigestEnabled}
        digestTime={digestTime}
        setDigestTime={setDigestTime}
        saveDigest={saveDigest}
        editWsName={editWsName}
        setEditWsName={setEditWsName}
        editWsColor={editWsColor}
        setEditWsColor={setEditWsColor}
        newWsNameInput={newWsNameInput}
        setNewWsNameInput={setNewWsNameInput}
        newWsColorInput={newWsColorInput}
        setNewWsColorInput={setNewWsColorInput}
        onSetActiveWorkspace={onSetActiveWorkspace}
        onUpdateWorkspace={onUpdateWorkspace}
        onDeleteWorkspace={onDeleteWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        handleExport={handleExport}
        handleImport={handleImport}
        importInputRef={importInputRef}
        dataFeedback={dataFeedback}
        backupRemindDays={backupRemindDays}
        setBackupRemind={(days) => {
          setBackupRemindDays(days);
          cr?.storage?.local?.set({ tn_backup_remind: { days } });
          cr?.runtime?.sendMessage({ type: 'SET_BACKUP_REMIND', days });
        }}
        language={language}
        setLanguage={setLanguage}
      />
      </div>

      <CommandPalette
        setFocusMode={setFocusMode}
        setTypewriterMode={setTypewriterMode}
        addNoteToContext={addNoteToContext}
        selectNote={selectNote}
        captureScreenshot={captureScreenshot}
        exportToPDF={exportToPDF}
        handleScopeChange={handleScopeChange}
        loadContextNotes={loadContextNotes}
        currentUrlRef={currentUrlRef}
        scopeRef={scopeRef}
        wsIdRef={wsIdRef}
      />

      <EncryptionPrompt
        showEncPrompt={showEncPrompt}
        setShowEncPrompt={setShowEncPrompt}
        onLockNote={handleLockNote}
        onUnlockNote={handleUnlockNote}
      />



      {/* ── Bottom nav ── */}
      <BottomNav groqKey={groqKey} />
    </div>
  );
}
