import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useThemeStore } from '../store/theme';

const MOBILE_ENTRY = import.meta.env.VITE_TABNOTES_MOBILE_ENTRY === 'true';

const NAV_ITEMS = MOBILE_ENTRY ? [
  { to: '/', label: 'Web App', icon: '▣', exact: true },
  { to: '/settings', label: 'Settings', icon: '⚙', exact: false },
] : [
  { to: '/', label: 'Home', icon: '⌂', exact: true },
  { to: '/app', label: 'Web App', icon: '▣', exact: false },
  { to: '/notes', label: 'Notes', icon: '✎', exact: false },
  { to: '/workspaces', label: 'Workspaces', icon: '⊞', exact: false },
  { to: '/about', label: 'About', icon: '✦', exact: false },
  { to: '/settings', label: 'Settings', icon: '⚙', exact: false },
];

export default function Layout() {
  const { theme, setTheme } = useThemeStore();

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const themeIcon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◑';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <header
        style={{
          borderBottom: '1px solid color-mix(in srgb, var(--color-border) 75%, transparent)',
          background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 120,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '10px var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <NavLink
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              flexShrink: 0,
              marginRight: 'var(--space-2)',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                background: 'linear-gradient(135deg, #f2c735, #dcae19)',
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-accent-ink)',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0,
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              T
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                  letterSpacing: 0,
                }}
              >
                TabNotes
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>
                local-first notes
              </span>
            </div>
          </NavLink>

          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'color-mix(in srgb, var(--color-bg-card) 65%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-border) 82%, transparent)',
              borderRadius: 'var(--radius-full)',
              padding: 4,
              flex: '1 1 420px',
              minWidth: 260,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                style={({ isActive }) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--color-accent-ink)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-accent)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                  boxShadow: isActive ? 'var(--shadow-accent)' : 'none',
                  border: isActive
                    ? '1px solid color-mix(in srgb, var(--color-accent-hover) 82%, transparent)'
                    : '1px solid transparent',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                })}
              >
                <span style={{ fontSize: 12 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <a
              href="https://github.com/mikepchelper-spec/TabNotes"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 11px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              title={`Theme: ${theme}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                fontSize: 13,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {themeIcon}
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: 'clamp(20px, 4vw, 42px) var(--space-6) clamp(34px, 5vw, 56px)',
        }}
      >
        <Outlet />
      </main>

      <footer
        style={{
          borderTop: '1px solid color-mix(in srgb, var(--color-border) 72%, transparent)',
          background: 'rgba(var(--color-bg-rgb), 0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: 'var(--space-5) var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
            Local-first. Context-aware. Built for Chrome workflows.
          </span>
          <a
            href="https://github.com/mikepchelper-spec/TabNotes"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            Open source →
          </a>
        </div>
      </footer>
    </div>
  );
}
