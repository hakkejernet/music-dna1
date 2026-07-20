import { env } from '../../lib/env';
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce';
import { clearTokens, loadTokens, saveTokens } from './tokenStore';
import type { SpotifyTokens } from './types';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const VERIFIER_KEY = 'music-dna:pkce-verifier';
const STATE_KEY = 'music-dna:oauth-state';

// Read-only scopes only: this is a discovery tool, never writes to the user's Spotify account.
// user-top-read is required for getTopArtists() (/me/top/artists) — without it
// Spotify 403s that call, buildUserProfile() silently ends up with empty
// seedArtistNames, and LastFmRecommendationProvider never even calls Last.fm
// (see its own seedNames.length === 0 early return). A token issued before
// this scope existed can't gain it via refresh — only a fresh authorize with
// a new consent screen grants it, hence isAuthenticated()'s scope check below.
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-read-email',
  'user-top-read',
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

const toTokens = (
  response: TokenResponse,
  fallbackRefreshToken?: string,
  fallbackScope?: string,
): SpotifyTokens => ({
  accessToken: response.access_token,
  refreshToken: response.refresh_token ?? fallbackRefreshToken ?? '',
  expiresAt: Date.now() + response.expires_in * 1000,
  scope: response.scope ?? fallbackScope ?? '',
});

/** True only if every scope in SCOPES is present on the token's granted scope string. */
const hasRequiredScopes = (grantedScope: string | undefined): boolean => {
  const granted = new Set((grantedScope ?? '').split(' ').filter(Boolean));
  return SCOPES.every((scope) => granted.has(scope));
};

export const buildAuthorizeUrl = async (): Promise<string> => {
  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: env.spotifyClientId,
    response_type: 'code',
    redirect_uri: env.spotifyRedirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES.join(' '),
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
};

export const handleAuthCallback = async (url: URL): Promise<void> => {
  const params = url.searchParams;
  const error = params.get('error');
  if (error) {
    throw new Error(`Spotify authorization failed: ${error}`);
  }

  const code = params.get('code');
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  if (!code || !verifier) {
    throw new Error('Missing authorization code or PKCE verifier.');
  }
  if (!returnedState || returnedState !== expectedState) {
    throw new Error('OAuth state mismatch — possible CSRF attempt, aborting.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.spotifyRedirectUri,
    client_id: env.spotifyClientId,
    code_verifier: verifier,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;
  saveTokens(toTokens(data));
};

const refreshAccessToken = async (previousTokens: SpotifyTokens): Promise<SpotifyTokens> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: previousTokens.refreshToken,
    client_id: env.spotifyClientId,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;
  // Spotify's refresh grant doesn't let you gain new scopes — a refreshed
  // token always carries what was originally authorized, so preserve the
  // prior token's scope if the refresh response omits it.
  const tokens = toTokens(data, previousTokens.refreshToken, previousTokens.scope);
  saveTokens(tokens);
  return tokens;
};

const EXPIRY_BUFFER_MS = 60_000;

export const getValidAccessToken = async (): Promise<string | null> => {
  const tokens = loadTokens();
  if (!tokens) return null;

  if (tokens.expiresAt - Date.now() > EXPIRY_BUFFER_MS) {
    return tokens.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(tokens);
    return refreshed.accessToken;
  } catch {
    clearTokens();
    return null;
  }
};

/**
 * A token that predates a SCOPES change (or was granted before the user
 * approved everything now required) can't gain the missing scope through a
 * refresh — only a fresh authorize with a new consent screen does. So an
 * existing, unexpired token with insufficient scope is treated as "not
 * logged in": it's cleared here, which sends the user back to LoginScreen
 * instead of silently running with a permission it doesn't have.
 */
export const isAuthenticated = (): boolean => {
  const tokens = loadTokens();
  if (!tokens) return false;

  if (!hasRequiredScopes(tokens.scope)) {
    clearTokens();
    return false;
  }

  return true;
};

export const logout = (): void => clearTokens();
