export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash, hash, and common tracking params
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('ref');
    let normalized = `${u.origin}${u.pathname}`;
    if (u.searchParams.toString()) {
      normalized += `?${u.searchParams.toString()}`;
    }
    return normalized.replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function getScopeKey(scope: import('./types').NoteScope, url: string, workspaceId?: string | null): string {
  switch (scope) {
    case 'url':
      return normalizeUrl(url);
    case 'domain':
      return normalizeDomain(url);
    case 'workspace':
      return workspaceId ?? 'default';
    case 'global':
      return '';
  }
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
