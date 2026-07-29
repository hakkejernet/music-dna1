import { getValidAccessToken } from './auth';

const API_BASE = 'https://api.spotify.com/v1';
const MAX_RETRIES = 3;

export class SpotifyAuthError extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// TEMPORARY — Concern B (403-on-/me) diagnostic only. Logs the raw HTTP
// details of every Spotify request this page session makes — success or
// failure — so a 403 on one endpoint can be compared against the
// outcome of other endpoints in the same session, on-page, since
// devtools isn't reachable while testing on iPad. Read-only observation,
// never consulted by any request/response handling below — request
// behavior is unchanged; the only structural change is reading the body
// once as text (below) instead of calling response.json() directly, so
// it can be both logged and parsed. Remove this block, its exports, and
// the DiscoveryPage panel that reads it once the 403 investigation
// concludes.
// ============================================================
export interface SpotifyRequestDiagnostics {
  timestamp: number;
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  authorizationHeaderAttached: boolean;
}

const MAX_LOGGED_REQUESTS = 50;
const requestLog: SpotifyRequestDiagnostics[] = [];

// A fresh array each call (not the live, mutated `requestLog`) — a caller
// that puts this into React state and polls it needs a new reference each
// time to reliably trigger a re-render; handing back the same mutated
// array would make React's setState bail out on every poll after the
// first, since it never sees the reference change.
export const getSpotifyRequestLog = (): readonly SpotifyRequestDiagnostics[] => [...requestLog];

/** Reads the body once and appends a log entry; returns the body text so callers don't need a second, invalid read. */
const recordRequestDiagnostics = async (
  response: Response,
  url: string,
  authorizationHeaderAttached: boolean,
): Promise<string> => {
  const body = await response.text();
  requestLog.push({
    timestamp: Date.now(),
    url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    authorizationHeaderAttached,
  });
  if (requestLog.length > MAX_LOGGED_REQUESTS) {
    // Evict the oldest successful request first — a diagnostic log whose
    // whole purpose is surfacing failures must never let a long run of
    // routine 200s (e.g. runFullSync() paginating through a large
    // library) push a genuine failure out the front. Only if every
    // entry is currently a failure (never observed in practice) does
    // this fall back to evicting the oldest entry regardless.
    const oldestSuccessIndex = requestLog.findIndex((entry) => entry.ok);
    if (oldestSuccessIndex !== -1) {
      requestLog.splice(oldestSuccessIndex, 1);
    } else {
      requestLog.shift();
    }
  }
  return body;
};
// ============================================================
// END TEMPORARY diagnostic capture.
// ============================================================

export const spotifyGet = async <T>(path: string, retries = 0): Promise<T> => {
  const token = await getValidAccessToken();
  if (!token) {
    throw new SpotifyAuthError('No valid Spotify session. Please log in again.');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await recordRequestDiagnostics(response, url, Boolean(token));

  if (response.status === 429 && retries < MAX_RETRIES) {
    const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1');
    await wait(retryAfterSeconds * 1000);
    return spotifyGet<T>(path, retries + 1);
  }

  if (response.status === 401) {
    throw new SpotifyAuthError('Spotify session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(`Spotify API error ${response.status} on ${path}: ${body}`);
  }

  return JSON.parse(body) as T;
};
