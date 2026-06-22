import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotesStore } from '../store/notes';
import { formatRelativeTime } from '@tabnotes/shared';

const SCOPE_ICONS: Record<string, string> = {
  url: '⌁',
  domain: '◎',
  workspace: '⊞',
  global: '◇',
};

export default function HomePage() {
  const { notes, workspaces, load, loading } = useNotesStore();

  useEffect(() => {
    load();
  }, [load]);

  const recentNotes = notes.slice(0, 6);
  const allTags = [...new Set(notes.flatMap((n) => n.tags))];

  const stats = [
    { label: 'Total Notes', value: notes.length },
    { label: 'Workspaces', value: workspaces.length },
    { label: 'URL Notes', value: notes.filter((n) => n.scope === 'url').length },
    { label: 'Domain Notes', value: notes.filter((n) => n.scope === 'domain').length },
  ];

  const featureCards = [
    {
      icon: '⌁',
      title: 'Scoped by URL',
      desc: 'Attach notes directly to a specific page so context is never lost when you switch tasks.',
    },
    {
      icon: '⊞',
      title: 'Workspace Context',
      desc: 'Group notes by project and jump between active workstreams with one click.',
    },
    {
      icon: '✦',
      title: 'Fast Capture',
      desc: 'Keep writing velocity high with autosave, shortcuts, tags, and inline organization.',
    },
    {
      icon: '◇',
      title: 'Private by Default',
      desc: 'No account, no server dependency, no sync lock-in. Your notes stay in your browser.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px, 4vw, 54px)' }}>
      <section
        style={{
          border: '1px solid color-mix(in srgb, var(--color-border) 80%, transparent)',
          borderRadius: 'var(--radius-xl)',
          background:
            'radial-gradient(900px 400px at 10% -20%, color-mix(in srgb, var(--color-accent) 24%, transparent), transparent 60%), var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-6)',
            padding: 'clamp(20px, 5vw, 44px)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div
              style={{
                display: 'inline-flex',
                width: 'fit-content',
                alignItems: 'center',
                gap: 8,
                background: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                letterSpacing: 0,
              }}
            >
              Productive notes for every tab
            </div>

            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 58px)',
                fontWeight: 700,
                lineHeight: 1.03,
                letterSpacing: 0,
                color: 'var(--color-text)',
              }}
            >
              Capture context,
              <br />
              keep momentum.
            </h1>

            <p
              style={{
                maxWidth: 620,
                fontSize: 'var(--text-lg)',
                color: 'var(--color-text-muted)',
                lineHeight: 1.65,
              }}
            >
              TabNotes gives every URL, domain, and workspace its own lightweight memory layer. Write once,
              recover instantly, and keep everything local.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link
                to="/notes"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '11px 20px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-ink)',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  boxShadow: 'var(--shadow-accent)',
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
                  gap: 6,
                  padding: '11px 18px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                }}
              >
                View Source
              </a>
            </div>
          </div>

          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid color-mix(in srgb, var(--color-border) 80%, transparent)',
              background: 'color-mix(in srgb, var(--color-bg-card) 92%, transparent)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>
              /live-metrics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: 'var(--color-bg-subtle)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text)' }}>{stat.value}</div>
                  <div style={{ marginTop: 2, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 35%, var(--color-border))',
                background: 'var(--color-accent-subtle)',
                padding: 'var(--space-3)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', marginBottom: 4 }}>Unique tags</div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-accent)' }}>{allTags.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-3)' }}>
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)',
                padding: 'var(--space-5)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <span style={{ fontSize: 24 }}>{feature.icon}</span>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text)' }}>{feature.title}</h2>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{feature.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {recentNotes.length > 0 && (
        <section
          style={{
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)',
            padding: 'clamp(16px, 3vw, 28px)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text)' }}>Recent Notes</h2>
            <Link to="/notes" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              See all →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
            {recentNotes.map((note) => (
              <Link key={note.id} to="/notes" style={{ textDecoration: 'none' }}>
                <article
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-subtle)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    minHeight: 154,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{SCOPE_ICONS[note.scope]}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                      {note.scope}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                      {formatRelativeTime(note.updatedAt)}
                    </span>
                  </div>

                  <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-text)' }}>
                    {note.title || 'Untitled note'}
                  </div>

                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-muted)',
                      lineHeight: 1.6,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {note.content || 'No content yet.'}
                  </div>

                  {note.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
                      {note.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-bg-card)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-subtle)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              </Link>
            ))}
          </div>
        </section>
      )}

      {notes.length === 0 && !loading && (
        <section
          style={{
            textAlign: 'center',
            padding: 'clamp(30px, 5vw, 52px)',
            border: '1.5px dashed var(--color-border-strong)',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--color-bg-card)',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 'var(--space-3)' }}>✎</div>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-2)', color: 'var(--color-text)' }}>
            Start with your first contextual note
          </div>
          <div style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
            Every page can keep memory. Create one now and open it anytime from Chrome.
          </div>
          <Link
            to="/notes"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              fontWeight: 700,
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
            }}
          >
            Create Note
          </Link>
        </section>
      )}
    </div>
  );
}
