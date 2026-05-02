import React, { useEffect, useRef, useState } from 'react';
import { useNotesStore } from '../store/notes';
import { useThemeStore } from '../store/theme';
import { NoteScope, exportData, importData, DEFAULT_STORAGE } from '@tabnotes/shared';

const SCOPE_OPTIONS: { value: NoteScope; label: string; desc: string }[] = [
  { value: 'url', label: 'URL', desc: 'Notes tied to exact page URLs' },
  { value: 'domain', label: 'Domain', desc: 'One note shared across a site' },
  { value: 'workspace', label: 'Workspace', desc: 'Notes linked to your workspace' },
  { value: 'global', label: 'Global', desc: 'A single global scratchpad' },
];

export default function SettingsPage() {
  const { notes, workspaces, defaultScope, setDefaultScope, exportData: exportStore, importData: importStore } = useNotesStore();
  const { theme, setTheme } = useThemeStore();
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useNotesStore.getState().load();
  }, []);

  const handleExport = async () => {
    const data = await exportStore();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabnotes-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importStore(text);
      setImportStatus('Import successful!');
    } catch {
      setImportStatus('Import failed — invalid file.');
    }
    setTimeout(() => setImportStatus(null), 3000);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 560 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.5px' }}>Settings</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
          Manage your TabNotes preferences and data.
        </p>
      </div>

      {/* Appearance */}
      <SettingSection title="Appearance">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 4 }}>Theme</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${theme === t ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: theme === t ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                  color: theme === t ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: theme === t ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'light' ? '☀ Light' : t === 'dark' ? '☽ Dark' : '◑ System'}
              </button>
            ))}
          </div>
        </div>
      </SettingSection>

      {/* Default scope */}
      <SettingSection title="Default Note Scope">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SCOPE_OPTIONS.map((s) => (
            <label
              key={s.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${defaultScope === s.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: defaultScope === s.value ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <input
                type="radio"
                name="scope"
                value={s.value}
                checked={defaultScope === s.value}
                onChange={() => setDefaultScope(s.value)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{s.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </SettingSection>

      {/* Data */}
      <SettingSection title="Data">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{notes.length}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Notes</div>
            </div>
            <div style={{ width: 1, background: 'var(--color-border)' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{workspaces.length}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Workspaces</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={handleExport}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-muted)',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ↓ Export JSON
            </button>
            <label
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-muted)',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              ↑ Import JSON
              <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>
          {importStatus && (
            <div style={{ fontSize: 'var(--text-sm)', color: importStatus.includes('success') ? 'var(--color-success)' : 'var(--color-danger)', textAlign: 'center' }}>
              {importStatus}
            </div>
          )}
        </div>
      </SettingSection>

      {/* Extension */}
      <SettingSection title="Chrome Extension">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          <p style={{ marginBottom: 'var(--space-3)' }}>
            The TabNotes Chrome extension brings contextual notes directly into your browser — one click away, always in context.
          </p>
          <a
            href="https://github.com/mikepchelper-spec/TabNotes"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-muted)',
              color: 'var(--color-text)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            View Source on GitHub →
          </a>
        </div>
      </SettingSection>

      {/* Pro */}
      <SettingSection title="Pro (Coming Soon)">
        <div
          style={{
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--color-accent-subtle), var(--color-bg-muted))',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)' }}>
            ✦ TabNotes Pro
          </div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            Sync notes across all your devices, access them on the web, and unlock premium features.
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {['Cloud sync across devices', 'Web dashboard access', 'Note history & backups', 'Premium themes'].map((f) => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-accent)' }}>✓</span> {f}
              </li>
            ))}
          </ul>
        </div>
      </SettingSection>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--color-text)', letterSpacing: '-0.2px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
