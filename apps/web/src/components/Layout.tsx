import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useThemeStore } from '../store/theme';

const NAV_ITEMS = [
  { to: '/',           label: 'Home',       icon: '⌂', exact: true },
  { to: '/notes',      label: 'Notes',      icon: '✎', exact: false },
  { to: '/workspaces', label: 'Workspaces', icon: '⊞', exact: false },
  { to: '/about',      label: 'About',      icon: '✦', exact: false },
  { to: '/settings',   label: 'Settings',   icon: '⚙', exact: false },
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

      {/* ── Header ── */}
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'rgba(var(--color-bg-rgb, 250,250,249), 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1140,
          margin: '0 auto',
          padding: '0 var(--space-6)',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}>

          {/* Logo */}
          <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{
              width: 30,
              height: 30,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
            }}>T</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.4px' }}>
              TabNotes
            </span>
          </NavLink>

          {/* Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-bg-muted)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  border: isActive ? '1px solid var(--color-border)' : '1px solid transparent',
                })}
              >
                <span style={{ fontSize: 12 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <a
              href="https://github.com/mikepchelper-spec/TabNotes"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500, textDecoration: 'none', transition: 'all var(--transition-fast)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--color-bg-muted)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLAnchorElement).style.background = 'var(--color-bg-subtle)'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
            <button
              onClick={toggleTheme}
              title={`Theme: ${theme}`}
              style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-muted)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-subtle)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'; }}
            >{themeIcon}</button>
          </div>

        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, maxWidth: 1140, width: '100%', margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>T</div>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-subtle)' }}>TabNotes</span>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-border-strong)' }}>·</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>Local-first · Privacy-first · No account needed</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-border-strong)' }}>·</span>
        <a href="https://github.com/mikepchelper-spec/TabNotes" target="_blank" rel="noopener noreferrer" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', textDecoration: 'none' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-accent)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-text-subtle)'; }}
        >Open source →</a>
      </footer>
    </div>
  );
}
