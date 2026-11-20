import { readApiJson } from './api';

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

async function fetchFromCompanion(candidate: CompanionConnection, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Thiri-Pairing-Key', candidate.code);
  let response: Response;
  try {
    response = await fetch(`${candidate.url}${path}`, { ...init, headers, credentials: 'omit', redirect: 'error' });
  } catch (error) {
    if (init.signal?.aborted && init.signal.reason?.name === 'AbortError') throw error;
    throw new Error('Cannot reach your PC. Check the companion and reconnect using its current tunnel URL.');
  }
  if (response.status === 401) throw new Error('Pairing expired. Reconnect using the current code shown on your PC.');
  return response;
}

export async function checkCompanion(candidate: CompanionConnection): Promise<void> {
  const response = await fetchFromCompanion(candidate, '/api/health', { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Cannot reach the companion. Check the tunnel URL shown on your PC.');
  const health = await readApiJson(response);
  if (health.status !== 'ok' || health.desktopAvailable !== true) {
    throw new Error('This URL does not provide desktop control. Update and restart Nandar on your PC, then use its current tunnel URL.');
  }
}

export function companionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (connection) return fetchFromCompanion(connection, path, init);
  return fetch(path, { ...init, credentials: 'omit' });
}
