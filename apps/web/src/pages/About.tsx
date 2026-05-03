import React from 'react';

const FEATURES = [
  {
    category: 'Editor',
    icon: '✍️',
    color: '#2b5be8',
    items: [
      { name: 'WYSIWYG Rich Text', desc: 'Bold, italic, underline, strikethrough, inline code and highlight render as you type — no markdown visible.' },
      { name: 'Keyboard Shortcuts', desc: 'Ctrl+B bold · Ctrl+I italic · Ctrl+U underline. Formatting always at your fingertips.' },
      { name: 'Markdown Preview', desc: 'Toggle between rich edit mode and a beautifully rendered markdown view with the ↓md button.' },
      { name: 'Typewriter Mode', desc: 'Keeps the current line centered on screen for long, distraction-free writing sessions.' },
      { name: 'Text Alignment', desc: 'Left, center, right, or justify — format any paragraph exactly how you want it.' },
      { name: 'Font Size', desc: 'A– / A+ controls let you scale the editor to your comfort without touching browser zoom.' },
      { name: 'Date / Time Stamp', desc: 'Insert the current date and time anywhere with Ctrl+D or the calendar button.' },
    ],
  },
  {
    category: 'Organization',
    icon: '📂',
    color: '#0ea5e9',
    items: [
      { name: '4 Scopes', desc: 'URL (exact page) · Domain (whole site) · Workspace (your project) · Global (always available). Notes stay where they belong.' },
      { name: 'Multiple Notes per Scope', desc: 'Create as many notes as you need in any context. Navigate them with a clean pill selector.' },
      { name: 'Workspaces', desc: 'Group notes into named projects — client work, personal projects, research — and switch context instantly.' },
      { name: 'Folders', desc: 'Further organize notes within any scope into folders for a clean, tidy sidebar.' },
      { name: 'Tags', desc: 'Add comma-separated tags to any note and filter your entire library by them.' },
      { name: 'Pin Notes', desc: 'Pin important notes to the top of any list so they\'re always front and center.' },
      { name: 'Note Colors', desc: 'Color-code note backgrounds for instant visual organization — 8 colors available.' },
    ],
  },
  {
    category: 'Productivity',
    icon: '⚡',
    color: '#f59e0b',
    items: [
      { name: 'Templates', desc: 'One-click templates for Daily Log, Meeting Notes, To-Do list, and Daily Standup — start writing immediately.' },
      { name: 'Wiki Links', desc: 'Type [[Note name]] to link notes together. Autocomplete suggests matching notes as you type.' },
      { name: 'Command Palette', desc: 'Ctrl+K opens a spotlight-style launcher to jump to any note, action, or view in seconds.' },
      { name: 'Web Clipper', desc: 'Select any text on any webpage and clip it straight into the current note with one click.' },
      { name: 'Writing Streak', desc: 'A fire-badge tracks your daily writing habit. Keep the streak alive — stay consistent.' },
      { name: 'Reminders', desc: 'Set a reminder on any note and receive a browser notification at exactly the right moment.' },
      { name: 'Daily Digest', desc: 'Opt-in morning digest: a notification that summarises your recent notes to start the day right.' },
    ],
  },
  {
    category: 'Intelligence',
    icon: '🧠',
    color: '#8b5cf6',
    items: [
      { name: 'Smart Suggestions', desc: 'As you write, TabNotes silently analyses your content and surfaces the most relevant other notes in a Related panel.' },
      { name: 'AI Chat (Ask)', desc: 'Ask questions about your notes in plain language. Powered by Groq — bring your own API key, keep your privacy.' },
      { name: 'Note Graph', desc: 'A live visual graph of all your notes, connected by wiki links and shared tags. See the big picture at a glance.' },
    ],
  },
  {
    category: 'Data & Privacy',
    icon: '🔒',
    color: '#22c55e',
    items: [
      { name: 'Note History', desc: 'Every note is automatically versioned. Restore any previous version with a single click — nothing is ever truly lost.' },
      { name: 'Export as Markdown', desc: 'Download any note as a clean .md file — compatible with Obsidian, Notion, Bear, and more.' },
      { name: 'Export / Import JSON', desc: 'Back up your entire notes library as a JSON file and restore it on any device or profile.' },
      { name: 'Note Encryption', desc: 'Encrypt individual notes with AES-256 and a personal password. Only you can unlock them.' },
      { name: 'Local-first', desc: 'All data lives in Chrome storage. No server, no account, no analytics, no tracking. Ever.' },
      { name: 'Open Source', desc: 'MIT licensed — read every line of code, fork it, or contribute. Full transparency guaranteed.' },
    ],
  },
];

const STATS = [
  { value: '4', label: 'note scopes' },
  { value: '7', label: 'editor features' },
  { value: '3', label: 'AI capabilities' },
  { value: '100%', label: 'local-first' },
];

export default function AboutPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: 'var(--space-10) 0 var(--space-4)' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--color-accent-subtle)', color: 'var(--color-accent)',
          borderRadius: 'var(--radius-full)', padding: '4px 14px',
          fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: 'var(--space-5)',
        }}>
          ✦ Complete feature list
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700,
          color: 'var(--color-text)', letterSpacing: '-1px', lineHeight: 1.15,
          marginBottom: 'var(--space-4)',
        }}>
          Everything TabNotes can do
        </h1>
        <p style={{
          fontSize: 'var(--text-lg)', color: 'var(--color-text-muted)',
          maxWidth: 520, margin: '0 auto', lineHeight: 1.6,
        }}>
          A premium note-taking extension built for power users who care about privacy, speed, and context.
        </p>
      </section>

      {/* Stats strip */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
        {STATS.map((s) => (
          <div key={s.label} style={{
            padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, letterSpacing: '-1px', color: 'var(--color-accent)' }}>{s.value}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* Feature categories */}
      {FEATURES.map((cat) => (
        <section key={cat.category}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-5)' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: cat.color + '18',
            }}>{cat.icon}</div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.4px' }}>{cat.category}</h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--space-3)',
          }}>
            {cat.items.map((item) => (
              <div key={item.name} style={{
                padding: 'var(--space-5)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                display: 'flex', flexDirection: 'column', gap: 6,
                transition: 'all 150ms',
              }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = cat.color + '60';
                  el.style.boxShadow = `0 0 0 3px ${cat.color}12`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = 'var(--color-border)';
                  el.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  width: 'fit-content',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: cat.color, flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{item.name}</span>
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.55, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* CTA */}
      <section style={{
        textAlign: 'center', padding: 'var(--space-10)',
        borderRadius: 'var(--radius-xl)',
        background: 'linear-gradient(135deg, var(--color-accent-subtle) 0%, var(--color-bg-subtle) 100%)',
        border: '1px solid var(--color-border)',
      }}>
        <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 'var(--space-3)' }}>
          Ready to try it?
        </h2>
        <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
          Free, open source, and always local-first. No account required.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://github.com/mikepchelner-spec/TabNotes"
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)', color: '#fff',
              fontWeight: 600, fontSize: 'var(--text-sm)', textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            View on GitHub
          </a>
          <a
            href="/notes"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '10px 22px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)', color: 'var(--color-text)',
              fontWeight: 600, fontSize: 'var(--text-sm)', textDecoration: 'none',
              border: '1px solid var(--color-border)',
            }}
          >
            Browse my notes →
          </a>
        </div>
      </section>

    </div>
  );
}
