import React from 'react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-8)' }}>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 'var(--space-3)' }}>{title}</h2>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-md)', lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--space-12)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', borderRadius: 'var(--radius-full)', padding: '4px 14px', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>
          Last updated: January 2025
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-1px', marginBottom: 'var(--space-4)' }}>Privacy Policy</h1>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          TabNotes is built on a simple principle: your notes belong to you, only you, and stay on your device.
        </p>
      </div>

      <Section title="The short version">
        <div style={{ padding: 'var(--space-5)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[
              'We collect zero personal data',
              'Your notes never leave your browser',
              'No account, no tracking, no analytics',
              'No third-party services receive your data',
              'No servers. Everything is stored locally',
            ].map((item) => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-success)', fontSize: 16, flexShrink: 0 }}>✓</span>
                <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Data storage">
        <p style={{ marginBottom: 'var(--space-3)' }}>
          All data created with TabNotes — including your notes, workspaces, tags, and settings — is stored exclusively using:
        </p>
        <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <li><strong style={{ color: 'var(--color-text)' }}>chrome.storage.local</strong> — for the Chrome extension, stored on your device, sandboxed to the extension</li>
          <li><strong style={{ color: 'var(--color-text)' }}>localStorage</strong> — for the companion web app, stored in your browser for that origin only</li>
        </ul>
        <p>No data is ever transmitted to any external server. TabNotes works entirely offline.</p>
      </Section>

      <Section title="Permissions used by the extension">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[
            { perm: 'storage', why: 'To save and retrieve your notes locally on your device.' },
            { perm: 'tabs',    why: 'To read the current tab\'s URL so notes can be contextually linked to that page.' },
            { perm: 'activeTab', why: 'To access the URL of the tab you\'re actively viewing, only when the extension is open.' },
            { perm: 'sidePanel', why: 'To display the TabNotes panel alongside your browsing content.' },
          ].map(({ perm, why }) => (
            <div key={perm} style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', marginBottom: 4 }}>{perm}</div>
              <div style={{ fontSize: 'var(--text-sm)' }}>{why}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Data you can export">
        <p>
          TabNotes allows you to export all your notes as a JSON file at any time from the Settings page. This file stays on your device — we have no access to it. You can also delete all data by clearing browser storage for the extension.
        </p>
      </Section>

      <Section title="No analytics or tracking">
        <p>
          TabNotes does not include any analytics, crash reporting, telemetry, advertising SDKs, or tracking pixels. We do not know how many people use TabNotes, what they write, or even that you installed it.
        </p>
      </Section>

      <Section title="Open source">
        <p>
          TabNotes is fully open source. You can audit every line of code at{' '}
          <a href="https://github.com/mikepchelper-spec/TabNotes" target="_blank" rel="noopener noreferrer">
            github.com/mikepchelper-spec/TabNotes
          </a>
          . There are no hidden network requests, obfuscated scripts, or opaque dependencies.
        </p>
      </Section>

      <Section title="Children">
        <p>TabNotes does not knowingly collect information from children under 13. Since we collect no data from anyone, this applies equally to all users.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>If we ever change this policy in a way that affects data handling, we will update this page and bump the date at the top. Since the core promise — zero data collection — is fundamental to TabNotes, any meaningful change would also be reflected in a new extension version with its own release notes.</p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Open an issue or discussion on{' '}
          <a href="https://github.com/mikepchelper-spec/TabNotes" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </Section>
    </div>
  );
}
