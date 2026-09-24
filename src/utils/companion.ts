export interface CompanionConnection { url: string; code: string }

const storageKey = 'thiri-companion';

function readStored(): CompanionConnection | null {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? JSON.parse(value) as CompanionConnection : null;
  } catch {
    return null;
  }
}

let connection = typeof window === 'undefined' ? null : readStored();

export function getCompanion(): CompanionConnection | null { return connection; }

export function setCompanion(value: CompanionConnection | null): void {
  connection = value;
  if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
  else sessionStorage.removeItem(storageKey);
}

export function normalizeCompanionUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use an HTTPS tunnel URL or a localhost URL.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter only the companion base URL.');
  return url.origin;
}

export function companionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (connection) headers.set('X-Thiri-Pairing-Key', connection.code);
  return fetch(`${connection?.url || ''}${path}`, { ...init, headers, credentials: 'omit' });
}
