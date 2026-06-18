import React from 'react';
import { useSidePanelStore } from '../store';
import { useTranslation } from '@tabnotes/i18n';
import { AppIcon } from './AppIcon';

/**
 * Persistent bottom navigation. Reads view + chat feature flag from the store;
 * note count and groq-key indicator are passed in (still owned by the monolith
 * during the migration). Extracted verbatim (Task 3.2) — no behavior change.
 */
export function BottomNav({
  groqKey,
}: {
  groqKey: string;
}) {
  const { t } = useTranslation();
  const view = useSidePanelStore((s) => s.view);
  const setView = useSidePanelStore((s) => s.setView);
  const setSettingsTarget = useSidePanelStore((s) => s.setSettingsTarget);
  const chatEnabled = useSidePanelStore((s) => s.features.chatView);
  const allNotes = useSidePanelStore((s) => s.allNotes);
  const activeWorkspaceId = useSidePanelStore((s) => s.activeWorkspaceId);
  const workspaceNotesCount = React.useMemo(
    () => allNotes.filter((note) => (note.workspaceId ?? null) === activeWorkspaceId).length,
    [allNotes, activeWorkspaceId]
  );

  return (
    <div className="sp-bottom-nav">
      <button
        className={`sp-nav-btn${view === 'note' ? ' active' : ''}`}
        onClick={() => setView('note')}
      >
        <span className="sp-nav-icon"><AppIcon name="note" size={18} /></span>
        <span className="sp-nav-label">{t('nav.note')}</span>
      </button>
      <button
        className={`sp-nav-btn${view === 'all' ? ' active' : ''}`}
        onClick={() => setView('all')}
      >
        <span className="sp-nav-icon"><AppIcon name="list" size={18} /></span>
        <span className="sp-nav-label">{t('nav.allNotes')}</span>
        {workspaceNotesCount > 0 && (
          <span
            className="sp-nav-badge"
            style={{
              position: 'absolute',
              top: 7,
              right: 'calc(50% - 18px)',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 8,
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: 99,
              minWidth: 14,
              textAlign: 'center',
              lineHeight: '14px',
            }}
          >
            {workspaceNotesCount}
          </span>
        )}
      </button>
      {chatEnabled && (
        <button
          className={`sp-nav-btn${view === 'chat' ? ' active' : ''}`}
          onClick={() => setView('chat')}
        >
          <span className="sp-nav-icon"><AppIcon name="chat" size={18} /></span>
          <span className="sp-nav-label">{t('nav.ask')}</span>
          {groqKey && <span className="sp-nav-ai-dot" />}
        </button>
      )}
      <button
        className={`sp-nav-btn${view === 'settings' ? ' active' : ''}`}
        onClick={() => {
          setSettingsTarget(null);
          setView('settings');
        }}
      >
        <span className="sp-nav-icon"><AppIcon name="settings" size={18} /></span>
        <span className="sp-nav-label">{t('nav.settings')}</span>
      </button>
    </div>
  );
}

export default BottomNav;
