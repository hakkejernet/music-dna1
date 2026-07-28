import { getValidAccessToken } from './auth';

const API_BASE = 'https://api.spotify.com/v1';
const MAX_RETRIES = 3;

export class SpotifyAuthError extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// TEMPORARY — Concern B (403-on-/me) diagnostic only. Captures the raw
// HTTP details of the most recent failed Spotify request so they can be
// displayed on-page, since devtools isn't reachable while testing on
// iPad. Read-only observation, never consulted by any request/response
// handling below — request behavior is unchanged. Remove this block,
// its export, and the DiscoveryPage panel that reads it once the 403
// investigation concludes.
// ============================================================
export interface SpotifyRequestDiagnostics {
  timestamp: number;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  authorizationHeaderAttached: boolean;
}

let lastFailedRequestDiagnostics: SpotifyRequestDiagnostics | null = null;

export const getLastFailedSpotifyRequestDiagnostics = (): SpotifyRequestDiagnostics | null =>
  lastFailedRequestDiagnostics;

/** Reads the body once and stashes full response diagnostics; returns the body text so callers don't need a second, invalid read. */
const captureFailureDiagnostics = async (
  response: Response,
  url: string,
  authorizationHeaderAttached: boolean,
): Promise<string> => {
  const body = await response.text();
  lastFailedRequestDiagnostics = {
    timestamp: Date.now(),
    url,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    authorizationHeaderAttached,
  };
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

  if (response.status === 429 && retries < MAX_RETRIES) {
    const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1');
    await wait(retryAfterSeconds * 1000);
    return spotifyGet<T>(path, retries + 1);
  }

  if (response.status === 401) {
    await captureFailureDiagnostics(response, url, Boolean(token));
    throw new SpotifyAuthError('Spotify session expired. Please log in again.');
  }

  if (!response.ok) {
    const body = await captureFailureDiagnostics(response, url, Boolean(token));
    throw new Error(`Spotify API error ${response.status} on ${path}: ${body}`);
  }

  return (await response.json()) as T;
};
