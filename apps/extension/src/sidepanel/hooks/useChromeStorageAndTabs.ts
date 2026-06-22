import React, { useState, useEffect, useCallback } from 'react';
import {
  NoteScope,
  ChromeStorageAdapter,
  NotesService,
  WorkspacesService,
  StorageData,
  normalizeDomain,
  stripFormatting,
} from '@tabnotes/shared';
import { useSidePanelStore } from '../store';
import i18n, { resolveLanguage } from '@tabnotes/i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cr: any =
  typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>).chrome
    ? (globalThis as Record<string, unknown>).chrome
    : null;

const PENDING_CLIP_STORAGE_KEY = 'tn_pending_clip';
const DRIVE_SYNC_REQUEST_MIN_MS = 60_000;

interface PendingClip {
  text: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

function normalizePendingClip(value: unknown): PendingClip | null {
  if (!value || typeof value !== 'object') return null;
  const clip = value as Partial<PendingClip>;
  const text = typeof clip.text === 'string' ? clip.text.trim() : '';
  if (!text) return null;
  return {
    text,
    sourceUrl: typeof clip.sourceUrl === 'string' ? clip.sourceUrl : undefined,
    sourceTitle: typeof clip.sourceTitle === 'string' ? clip.sourceTitle : undefined,
  };
}

function formatClipMarkdown(clip: PendingClip, fallbackUrl: string): string {
  const sourceUrl = clip.sourceUrl || fallbackUrl;
  const sourceTitle = clip.sourceTitle || sourceUrl || 'Source';
  const quotedText = clip.text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');

  return sourceUrl
    ? `\n\n${quotedText}\n\n- [${sourceTitle}](${sourceUrl})`
    : `\n\n${quotedText}`;
}

interface UseChromeStorageAndTabsProps {
  adapter: React.MutableRefObject<ChromeStorageAdapter>;
  noteSvc: React.MutableRefObject<NotesService>;
  wsSvc: React.MutableRefObject<WorkspacesService>;
  saveTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  contentSavedRef: React.MutableRefObject<string>;
  lastSaveTs: React.MutableRefObject<number>;
  editorRef: React.RefObject<HTMLDivElement>;

  // Callbacks and refs
  activeNoteIdRef: React.MutableRefObject<string | null>;
  scopeRef: React.MutableRefObject<NoteScope>;
  currentUrlRef: React.MutableRefObject<string>;
  wsIdRef: React.MutableRefObject<string | null>;
  addNoteToContextRef: React.MutableRefObject<() => Promise<void>>;
}

export function useChromeStorageAndTabs({
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
}: UseChromeStorageAndTabsProps) {
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [streak, setStreak] = useState(0);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestTime, setDigestTime] = useState('09:00');
  const [backupRemindDays, setBackupRemindDays] = useState<number>(7);

  // Groq / AI states
  const [groqKey, setGroqKey] = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeyVisible, setGroqKeyVisible] = useState(false);

  // Offline / sync status
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());
  const [syncedToast, setSyncedToast] = useState(false);
  const [clipFeedback, setClipFeedback] = useState(false);
  const lastDriveSyncRequestRef = React.useRef(0);

  // Store setters
  const setView = useSidePanelStore((s) => s.setView);
  const setThemeState = useSidePanelStore((s) => s.setThemeState);
  const setMdState = useSidePanelStore((s) => s.setMdState);
  const setPreview = useSidePanelStore((s) => s.setPreview);
  const setScope = useSidePanelStore((s) => s.setScope);
  const setCurrentUrl = useSidePanelStore((s) => s.setCurrentUrl);
  const setCurrentDomain = useSidePanelStore((s) => s.setCurrentDomain);
  const setAllNotes = useSidePanelStore((s) => s.setAllNotes);
  const setContextNotes = useSidePanelStore((s) => s.setContextNotes);
  const setWorkspaces = useSidePanelStore((s) => s.setWorkspaces);
  const setActiveWorkspaceId = useSidePanelStore((s) => s.setActiveWorkspaceId);
  const setDefaultScopeState = useSidePanelStore((s) => s.setDefaultScope);
  const setLanguageState = useSidePanelStore((s) => s.setLanguageState);

  const setContent = useSidePanelStore((s) => s.setContent);
  const setTitle = useSidePanelStore((s) => s.setTitle);
  const setTags = useSidePanelStore((s) => s.setTags);
  const setSaved = useSidePanelStore((s) => s.setSaved);

  const requestDriveSyncIfEnabled = useCallback(() => {
    if (!cr?.runtime?.sendMessage || !navigator.onLine) return;
    const now = Date.now();
    if (now - lastDriveSyncRequestRef.current < DRIVE_SYNC_REQUEST_MIN_MS) return;
    lastDriveSyncRequestRef.current = now;
    cr.runtime.sendMessage({ type: 'DRIVE_SYNC_IF_ENABLED' }, () => {
      // Automatic remote pulls are best-effort; Settings exposes detailed Drive errors.
      void cr.runtime.lastError;
    });
  }, []);



  const refreshAllNotes = useCallback(async () => {
    const notes = await noteSvc.current.getAllNotes();
    setAllNotes(notes);
    return notes;
  }, [noteSvc, setAllNotes]);

  const appendClipToCurrentNote = useCallback(
    async (rawClip: unknown): Promise<boolean> => {
      const clip = normalizePendingClip(rawClip);
      if (!clip) return false;

      const state = useSidePanelStore.getState();
      const sourceUrl = clip.sourceUrl || currentUrlRef.current;
      const nextContent = state.content.trim()
        ? `${state.content}${formatClipMarkdown(clip, currentUrlRef.current)}`
        : formatClipMarkdown(clip, currentUrlRef.current).trimStart();
      const parsedTags = state.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const title = stripFormatting(state.title || clip.sourceTitle || sourceUrl || '');

      setSaved(false);
      clearTimeout(saveTimer.current);

      const savedNote = activeNoteIdRef.current
        ? await noteSvc.current.updateNote(activeNoteIdRef.current, {
            content: nextContent,
            title: title || undefined,
            tags: parsedTags,
          })
        : await noteSvc.current.createNote({
            scope: scopeRef.current,
            url: currentUrlRef.current || sourceUrl,
            workspaceId: wsIdRef.current,
            content: nextContent,
            title: title || undefined,
            tags: parsedTags,
          });

      if (!savedNote) return false;

      activeNoteIdRef.current = savedNote.id;
      setContent(savedNote.content);
      setTitle(stripFormatting(savedNote.title ?? ''));
      setTags(savedNote.tags.join(', '));
      setContextNotes(
        await noteSvc.current.getNotesByScope(
          scopeRef.current,
          currentUrlRef.current || sourceUrl,
          wsIdRef.current
        )
      );
      contentSavedRef.current = savedNote.content;
      lastSaveTs.current = Date.now();
      setView('note');
      setSaved(true);
      setClipFeedback(true);
      await refreshAllNotes();

      setTimeout(() => editorRef.current?.focus(), 120);
      setTimeout(() => setSaved(false), 2000);
      setTimeout(() => setClipFeedback(false), 2000);
      return true;
    },
    [
      activeNoteIdRef,
      contentSavedRef,
      currentUrlRef,
      editorRef,
      lastSaveTs,
      noteSvc,
      refreshAllNotes,
      saveTimer,
      scopeRef,
      setContent,
      setContextNotes,
      setSaved,
      setTags,
      setTitle,
      setView,
      wsIdRef,
    ]
  );

  const loadContextNotes = useCallback(
    async (url: string, sc: NoteScope, wsId: string | null, preferNoteId?: string | null) => {
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        setContextNotes([]);
        setActiveWorkspaceId(wsId);
        activeNoteIdRef.current = null;
        setContent('');
        setTitle('');
        setTags('');
        return;
      }

      const notes = await noteSvc.current.getNotesByScope(sc, url, wsId);
      setContextNotes(notes);

      const pick = preferNoteId
        ? (notes.find((n) => n.id === preferNoteId) ?? notes[0] ?? null)
        : (notes[0] ?? null);

      activeNoteIdRef.current = pick?.id ?? null;
      setContent(pick?.content ?? '');
      setTitle(pick?.title ?? '');
      setTags(pick?.tags.join(', ') ?? '');
      setSaved(false);
      setPreview(false);
    },
    [noteSvc, setContextNotes, setActiveWorkspaceId, activeNoteIdRef, setContent, setTitle, setTags, setSaved, setPreview]
  );

  const switchToTab = useCallback(
    async (url: string) => {
      setTabLoading(true);
      setCurrentUrl(url);
      setCurrentDomain(normalizeDomain(url));
      currentUrlRef.current = url;

      await Promise.all([
        refreshAllNotes(),
        loadContextNotes(url, scopeRef.current, wsIdRef.current),
      ]);
      setTabLoading(false);
    },
    [loadContextNotes, refreshAllNotes, setCurrentDomain, setCurrentUrl, currentUrlRef, scopeRef, wsIdRef]
  );

  // Online / offline detection
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setPendingSyncIds((prev) => {
        if (prev.size > 0) {
          setSyncedToast(true);
          setTimeout(() => setSyncedToast(false), 3000);
        }
        return new Set();
      });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // CLIP_TEXT listener (legacy Web Clipper bridge)
  useEffect(() => {
    if (!cr?.runtime?.onMessage) return;
    const handler = (msg: {
      type: string;
      text: string;
      sourceUrl: string;
      sourceTitle: string;
    }) => {
      if (msg.type !== 'CLIP_TEXT') return;
      void appendClipToCurrentNote(msg);
    };
    cr.runtime.onMessage.addListener(handler);
    return () => cr.runtime.onMessage.removeListener(handler);
  }, [appendClipToCurrentNote]);

  // Cross-tab real-time sync
  useEffect(() => {
    if (!cr?.storage?.onChanged) return;
    let t: ReturnType<typeof setTimeout>;

    const handler = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string
    ) => {
      if (area === 'local' && changes[PENDING_CLIP_STORAGE_KEY]?.newValue) {
        void appendClipToCurrentNote(changes[PENDING_CLIP_STORAGE_KEY].newValue).then((consumed) => {
          if (consumed) cr.storage.local.remove(PENDING_CLIP_STORAGE_KEY);
        });
        return;
      }
      if (area === 'local' && changes['tn_quick_capture']?.newValue) {
        cr.storage.local.remove('tn_quick_capture');
        addNoteToContextRef.current().then(() => {
          setView('note');
          setTimeout(() => editorRef.current?.focus(), 120);
        });
        return;
      }
      if (area !== 'local' || !changes['tabnotes_data']) return;
      if (Date.now() - lastSaveTs.current < 1200) return;

      clearTimeout(t);
      t = setTimeout(async () => {
        const allUpdated = await noteSvc.current.getAllNotes();
        setAllNotes(allUpdated);
        const ctxUpdated = await noteSvc.current.getNotesByScope(
          scopeRef.current,
          currentUrlRef.current,
          wsIdRef.current
        );
        setContextNotes(ctxUpdated);

        const storageData = await adapter.current.get();
        const wsList = await wsSvc.current.getAll();
        setWorkspaces(wsList);
        const wsId = await wsSvc.current.getActive();
        setActiveWorkspaceId(wsId);
        wsIdRef.current = wsId;

        const resolvedLng = resolveLanguage(
          (storageData as unknown as { language?: string }).language ?? cr?.i18n?.getUILanguage?.() ?? navigator.language
        );
        setLanguageState(resolvedLng);
        i18n.changeLanguage(resolvedLng);

        if (storageData.theme) {
          setThemeState(storageData.theme);
        }

        const id = activeNoteIdRef.current;
        if (id) {
          const remote = ctxUpdated.find((n) => n.id === id) ?? allUpdated.find((n) => n.id === id);
          if (remote && remote.content !== contentSavedRef.current) {
            setContent((localContent) => {
              if (localContent === contentSavedRef.current) {
                contentSavedRef.current = remote.content;
                setTitle(stripFormatting(remote.title ?? ''));
                setTags(remote.tags.join(', '));
                return remote.content;
              }
              return localContent;
            });
          }
        }
      }, 250);
    };

    cr.storage.onChanged.addListener(handler);
    return () => {
      cr.storage.onChanged.removeListener(handler);
      clearTimeout(t);
    };
  }, [addNoteToContextRef, appendClipToCurrentNote, setView, editorRef, lastSaveTs, noteSvc, setAllNotes, scopeRef, currentUrlRef, wsIdRef, setContextNotes, wsSvc, setWorkspaces, setActiveWorkspaceId, activeNoteIdRef, contentSavedRef, setContent, setTitle, setTags, adapter, setLanguageState, setThemeState]);

  // Initial load
  useEffect(() => {
    if (!cr?.tabs) {
      setLoading(false);
      return;
    }

    const init = async () => {
      const [storageData, wsId, wsList] = await Promise.all([
        adapter.current.get(),
        wsSvc.current.getActive(),
        wsSvc.current.getAll(),
      ]);

      const sc: NoteScope = (storageData as StorageData).defaultScope ?? 'domain';
      setDefaultScopeState(sc);
      setScope(sc);
      scopeRef.current = sc;
      setActiveWorkspaceId(wsId);
      wsIdRef.current = wsId;
      setWorkspaces(wsList);
      setMdState(storageData.markdownEnabled ?? false);
      const themeValue = (storageData as unknown as { theme: 'light' | 'dark' | 'system' }).theme ?? 'system';
      setThemeState(themeValue);

      const resolvedLng = resolveLanguage(
        (storageData as unknown as { language?: string }).language ?? cr?.i18n?.getUILanguage?.() ?? navigator.language
      );
      setLanguageState(resolvedLng);
      i18n.changeLanguage(resolvedLng);

      // Load daily digest settings
      if (cr?.storage?.local?.get) {
        const digestResult = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_digest', res)
        );
        const d = digestResult['tn_digest'] as { enabled?: boolean; time?: string } | undefined;
        if (d) {
          setDigestEnabled(d.enabled ?? false);
          setDigestTime(d.time ?? '09:00');
        }
      }

      // Load Groq API key
      if (cr?.storage?.local?.get) {
        const gk = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_groq_key', res)
        );
        if (gk['tn_groq_key']) {
          const key = gk['tn_groq_key'] as string;
          setGroqKey(key);
          setGroqKeyInput(key);
        } else {
          const envKey =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (import.meta as any).env?.VITE_GROQ_KEY ?? '';
          if (envKey) {
            setGroqKey(envKey);
            setGroqKeyInput(envKey);
            cr?.storage?.local?.set({ tn_groq_key: envKey });
          }
        }
      }

      // Load writing streak
      if (cr?.storage?.local?.get) {
        const sr = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_streak', res)
        );
        const s = sr['tn_streak'] as { count?: number } | undefined;
        if (s?.count) setStreak(s.count);
      }

      await refreshAllNotes();

      cr.tabs.query({ active: true, currentWindow: true }, async (tabs: { url?: string }[]) => {
        const url = tabs[0]?.url ?? '';
        setCurrentUrl(url);
        setCurrentDomain(normalizeDomain(url));
        currentUrlRef.current = url;
        await loadContextNotes(url, sc, wsId);

        const pendingClipData = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get(PENDING_CLIP_STORAGE_KEY, res)
        );
        if (await appendClipToCurrentNote(pendingClipData[PENDING_CLIP_STORAGE_KEY])) {
          cr.storage.local.remove(PENDING_CLIP_STORAGE_KEY);
        }

        const qcData = await new Promise<Record<string, unknown>>((res) =>
          cr.storage.local.get('tn_quick_capture', res)
        );
        if (qcData['tn_quick_capture']) {
          cr.storage.local.remove('tn_quick_capture');
          await addNoteToContextRef.current();
          setView('note');
          setTimeout(() => editorRef.current?.focus(), 120);
        }

        setLoading(false);
        requestDriveSyncIfEnabled();
      });
    };

    init();
  }, [adapter, wsSvc, setDefaultScopeState, setScope, scopeRef, setActiveWorkspaceId, wsIdRef, setWorkspaces, setMdState, setThemeState, setLanguageState, refreshAllNotes, setCurrentUrl, setCurrentDomain, currentUrlRef, loadContextNotes, appendClipToCurrentNote, addNoteToContextRef, setView, editorRef, requestDriveSyncIfEnabled]);

  useEffect(() => {
    const onFocus = () => requestDriveSyncIfEnabled();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestDriveSyncIfEnabled();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [requestDriveSyncIfEnabled]);

  // Tab event listeners
  useEffect(() => {
    if (!cr?.tabs) return;

    const onActivated = (info: { tabId: number }) => {
      cr.tabs.get(info.tabId, (tab: { url?: string }) => {
        if (cr.runtime.lastError) return;
        const url = tab?.url ?? '';
        if (url !== currentUrlRef.current) switchToTab(url);
      });
    };

    const onUpdated = (
      _tabId: number,
      changeInfo: { status?: string },
      tab: { active?: boolean; url?: string }
    ) => {
      if (!tab.active) return;
      if (changeInfo.status === 'complete' && tab.url && tab.url !== currentUrlRef.current) {
        switchToTab(tab.url);
      }
    };

    cr.tabs.onActivated.addListener(onActivated);
    cr.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cr.tabs.onActivated.removeListener(onActivated);
      cr.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [switchToTab, currentUrlRef]);

  const saveDigest = (enabled: boolean, time: string) => {
    cr?.runtime?.sendMessage({ type: 'SET_DIGEST', enabled, time });
  };

  return {
    loading,
    tabLoading,
    setTabLoading,
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
    setSyncedToast,
    clipFeedback,
    refreshAllNotes,
    loadContextNotes,
    switchToTab,
    saveDigest,
  };
}
