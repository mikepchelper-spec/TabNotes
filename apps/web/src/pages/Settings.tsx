import React, { useEffect, useRef } from 'react';
import { useNotesStore } from '../store/notes';
import { useThemeStore } from '../store/theme';
import { NoteScope, exportData } from '@tabnotes/shared';

const SCOPE_OPTIONS: { value: NoteScope; label: string; desc: string }[] = [
  { value: 'url',       label: 'URL',       desc: 'Notes tied to exact page URLs' },
  { value: 'domain',    label: 'Domain',    desc: 'One note shared across a site' },
  { value: 'workspace', label: 'Workspace', desc: 'Notes linked to your workspace' },
  { value: 'global',    label: 'Global',    desc: 'A single global scratchpad' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, letterSpacing: 0, color: 'var(--color-text)' }}>{title}</h2>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { notes, workspaces, defaultScope, markdownEnabled, setDefaultScope, setMarkdownEnabled, exportData: exportStore, importData } = useNotesStore();
  const { theme, setTheme } = useThemeStore();
  const [importStatus, setImportStatus] = React.useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { useNotesStore.getState().load(); }, []);

  const handleExport = async () => {
    const data = await exportStore();
    const blob = new Blob([JSON.stringify(exportData(data), null, 2)], { type: 'application/json' });
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
      await importData(await file.text());
      setImportStatus('Import successful!');
    } catch {
      setImportStatus('Import failed — invalid file.');
    }
    setTimeout(() => setImportStatus(null), 3000);
    if (fileRef.current) fileRef.current.value = '';
  };

  const RadioBtn = ({ label, desc, value, current, onSelect }: { label: string; desc: string; value: string; current: string; onSelect: () => void }) => (
    <label onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1.5px solid ${current === value ? 'var(--color-accent)' : 'var(--color-border)'}`, background: current === value ? 'var(--color-accent-subtle)' : 'var(--color-bg)', cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
      <input type="radio" checked={current === value} onChange={onSelect} style={{ accentColor: 'var(--color-accent)' }} />
      <div><div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{desc}</div></div>
    </label>
  );

  const Toggle = ({ enabled, onToggle, label, desc }: { enabled: boolean; onToggle: () => void; label: string; desc: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)' }}>
      <div><div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{desc}</div></div>
      <button onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: enabled ? 'var(--color-accent)' : 'var(--color-border-strong)', cursor: 'pointer', position: 'relative', transition: 'background var(--transition-base)', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left var(--transition-base)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)', maxWidth: 560 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: 0 }}>Settings</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>Manage your TabNotes preferences and data.</p>
      </div>

      <Section title="Appearance">
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${theme === t ? 'var(--color-accent)' : 'var(--color-border)'}`, background: theme === t ? 'var(--color-accent-subtle)' : 'var(--color-bg)', color: theme === t ? 'var(--color-accent)' : 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: theme === t ? 600 : 400, cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
              {t === 'light' ? '☀ Light' : t === 'dark' ? '☽ Dark' : '◑ System'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Editor">
        <Toggle
          enabled={markdownEnabled}
          onToggle={() => setMarkdownEnabled(!markdownEnabled)}
          label="Markdown Preview"
          desc="Write in Markdown and toggle a rendered preview. Uses monospace font in edit mode."
        />
      </Section>

      <Section title="Default Note Scope">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {SCOPE_OPTIONS.map((s) => (
            <RadioBtn key={s.value} label={s.label} desc={s.desc} value={s.value} current={defaultScope} onSelect={() => setDefaultScope(s.value)} />
          ))}
        </div>
      </Section>

      <Section title="Data">
        <div style={{ display: 'flex', gap: 0, padding: 'var(--space-4)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', alignItems: 'center' }}>
          {[{ label: 'Notes', value: notes.length }, { label: 'Workspaces', value: workspaces.length }, { label: 'Tags', value: [...new Set(notes.flatMap((n) => n.tags))].length }].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <div style={{ width: 1, height: 32, background: 'var(--color-border)', margin: '0 16px' }} />}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{stat.value}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{stat.label}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button onClick={handleExport} style={{ flex: 1, padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-muted)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer' }}>↓ Export JSON</button>
          <label style={{ flex: 1, padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-muted)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ↑ Import JSON
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </div>
        {importStatus && <div style={{ fontSize: 'var(--text-sm)', textAlign: 'center', padding: 8, borderRadius: 'var(--radius-md)', background: importStatus.includes('success') ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)', color: importStatus.includes('success') ? 'var(--color-success)' : 'var(--color-danger)' }}>{importStatus}</div>}
      </Section>

      <Section title="Chrome Extension">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          <p style={{ marginBottom: 'var(--space-3)' }}>The TabNotes Chrome extension brings contextual notes directly into your browser — one click away, always in context.</p>
          <a href="https://github.com/mikepchelper-spec/TabNotes" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-muted)', color: 'var(--color-text)', fontSize: 'var(--text-sm)', fontWeight: 500, textDecoration: 'none' }}>
            View Source on GitHub →
          </a>
        </div>
      </Section>

      <Section title="Pro (Coming Soon)">
        <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, var(--color-accent-subtle), var(--color-bg-muted))', border: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)' }}>✦ TabNotes Pro</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>Sync notes across all your devices, access them on the web, and unlock premium features.</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {['Cloud sync across devices', 'Web dashboard access', 'Note history & backups', 'Premium themes'].map((f) => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><span style={{ color: 'var(--color-accent)' }}>✓</span> {f}</li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}
