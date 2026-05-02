import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotesStore } from '../store/notes';
import { formatRelativeTime } from '@tabnotes/shared';

const SCOPE_ICONS: Record<string, string> = {
  url: '🔗',
  domain: '🌐',
  workspace: '⊞',
  global: '🌍',
};

export default function HomePage() {
  const { notes, workspaces, load, loading } = useNotesStore();

  useEffect(() => {
    load();
  }, [load]);

  const recentNotes = notes.slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: 'var(--space-12) 0 var(--space-6)' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            borderRadius: 'var(--radius-full)',
            padding: '4px 14px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            marginBottom: 'var(--space-5)',
          }}
        >
          ✦ Local-first · No account needed · Open source
        </div>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            marginBottom: 'var(--space-5)',
          }}
        >
          Notes that know
          <br />
          <span style={{ color: 'var(--color-accent)' }}>where you are</span>
        </h1>
        <p
          style={{
            fontSize: 'var(--text-lg)',
            color: 'var(--color-text-muted)',
            maxWidth: 480,
            margin: '0 auto var(--space-8)',
            lineHeight: 1.6,
          }}
        >
          TabNotes is a Chrome extension that keeps contextual notes per tab, domain, or workspace — always right where you need them.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/notes"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '10px 22px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
              transition: 'all var(--transition-fast)',
            }}
          >
            Open Notes →
          </Link>
          <a
            href="https://github.com/mikepchelper-spec/TabNotes"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '10px 22px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-muted)',
              color: 'var(--color-text)',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
            }}
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Feature grid */}
      <section>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {[
            { icon: '🔗', title: 'URL Notes', desc: 'Pin a note to a specific page URL — perfect for research.' },
            { icon: '🌐', title: 'Domain Notes', desc: 'One note shared across an entire site — great for docs.' },
            { icon: '⊞', title: 'Workspace Notes', desc: 'Group your notes into projects and switch contexts fast.' },
            { icon: '🌍', title: 'Global Notes', desc: 'A scratchpad always available regardless of where you are.' },
          ].map((f) => (
            <div
              key={f.title}
              style={{
                padding: 'var(--space-5)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <span style={{ fontSize: 26 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent notes */}
      {notes.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.3px' }}>Recent Notes</h2>
            <Link to="/notes" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>View all →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                to="/notes"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    transition: 'all var(--transition-fast)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-strong)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 13 }}>{SCOPE_ICONS[note.scope]}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{note.scope}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                      {formatRelativeTime(note.updatedAt)}
                    </span>
                  </div>
                  {note.title && (
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4, color: 'var(--color-text)' }}>
                      {note.title}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-muted)',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.5,
                    }}
                  >
                    {note.content || <em style={{ color: 'var(--color-text-subtle)' }}>Empty note</em>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      {(notes.length > 0 || workspaces.length > 0) && (
        <section style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Notes', value: notes.length },
            { label: 'Workspaces', value: workspaces.length },
            { label: 'URL Notes', value: notes.filter((n) => n.scope === 'url').length },
            { label: 'Domain Notes', value: notes.filter((n) => n.scope === 'domain').length },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: '1 1 120px',
                padding: 'var(--space-4) var(--space-5)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </section>
      )}

      {/* CTA if no notes */}
      {notes.length === 0 && !loading && (
        <section
          style={{
            textAlign: 'center',
            padding: 'var(--space-12)',
            border: '2px dashed var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>✎</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--color-text)' }}>
            Your first note is one click away
          </div>
          <div style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
            Start capturing ideas right in your browser.
          </div>
          <Link
            to="/notes"
            style={{
              display: 'inline-flex',
              padding: '10px 22px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
            }}
          >
            Create a Note
          </Link>
        </section>
      )}
    </div>
  );
}
