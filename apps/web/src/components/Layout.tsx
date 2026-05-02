import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useThemeStore } from '../store/theme';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '⌂', exact: true },
  { to: '/notes', label: 'Notes', icon: '✎', exact: false },
  { to: '/workspaces', label: 'Workspaces', icon: '⊞', exact: false },
  { to: '/settings', label: 'Settings', icon: '⚙', exact: false },
];

export default function Layout() {
  const { theme, setTheme } = useThemeStore();

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const themeIcon = theme === 'light' ? '☀' : theme === 'dark' ? '☽' : '◑';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 var(--space-6)',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: 'var(--color-accent)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              T
            </div>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
              TabNotes
            </span>
          </NavLink>

          {/* Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-bg-muted)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                })}
              >
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              onClick={toggleTheme}
              title={`Theme: ${theme}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)',
              }}
            >
              {themeIcon}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--space-5) var(--space-6)',
          textAlign: 'center',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-subtle)',
        }}
      >
        TabNotes — local-first, privacy-first. No account required.
      </footer>
    </div>
  );
}
