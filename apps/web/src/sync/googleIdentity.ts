const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
  callback?: (response: TokenResponse) => void;
}

interface GoogleIdentityApi {
  accounts?: {
    oauth2?: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

interface RuntimeConfig {
  googleClientId?: unknown;
  VITE_GOOGLE_CLIENT_ID?: unknown;
}

let scriptPromise: Promise<void> | null = null;
let clientIdPromise: Promise<string | null> | null = null;
let cachedClientId: string | null | undefined;

function cleanClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && !trimmed.includes('REPLACE_WITH') ? trimmed : null;
}

function getBuildTimeClientId(): string | null {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return cleanClientId(value);
}

async function loadRuntimeClientId(): Promise<string | null> {
  const configUrl = new URL('tabnotes.config.json', window.location.origin + import.meta.env.BASE_URL);
  try {
    const response = await fetch(configUrl, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const config = (await response.json()) as RuntimeConfig;
    return cleanClientId(config.googleClientId) ?? cleanClientId(config.VITE_GOOGLE_CLIENT_ID);
  } catch {
    return null;
  }
}

async function getConfiguredClientId(): Promise<string | null> {
  const buildTimeClientId = getBuildTimeClientId();
  if (buildTimeClientId) {
    cachedClientId = buildTimeClientId;
    return buildTimeClientId;
  }

  if (cachedClientId !== undefined) return cachedClientId;
  if (!clientIdPromise) {
    clientIdPromise = loadRuntimeClientId().then((clientId) => {
      cachedClientId = clientId;
      return clientId;
    });
  }
  return clientIdPromise;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity failed to load.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity failed to load.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function hasGoogleClientId(): boolean {
  return Boolean(cachedClientId ?? getBuildTimeClientId());
}

export async function hasConfiguredGoogleClientId(): Promise<boolean> {
  return Boolean(await getConfiguredClientId());
}

export async function requestGoogleDriveToken(interactive: boolean): Promise<string> {
  const clientId = await getConfiguredClientId();
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID for the TabNotes web app.');
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity is unavailable.');

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_APPDATA_SCOPE,
      prompt: interactive ? 'consent' : '',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google returned no access token.'));
          return;
        }
        resolve(response.access_token);
      },
    });

    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export function revokeGoogleDriveToken(token: string): Promise<void> {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.resolve();
  return new Promise((resolve) => oauth2.revoke(token, resolve));
}
