import { env } from '../../lib/env';
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce';
import { clearTokens, loadTokens, saveTokens } from './tokenStore';
import type { SpotifyTokens } from './types';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const VERIFIER_KEY = 'music-dna:pkce-verifier';
const STATE_KEY = 'music-dna:oauth-state';

// Read-only scopes only: this is a discovery tool, never writes to the user's Spotify account.
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-read-email',
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

const toTokens = (response: TokenResponse, fallbackRefreshToken?: string): SpotifyTokens => ({
  accessToken: response.access_token,
  refreshToken: response.refresh_token ?? fallbackRefreshToken ?? '',
  expiresAt: Date.now() + response.expires_in * 1000,
});

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

const refreshAccessToken = async (refreshToken: string): Promise<SpotifyTokens> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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
  const tokens = toTokens(data, refreshToken);
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
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  } catch {
    clearTokens();
    return null;
  }
};

export const isAuthenticated = (): boolean => loadTokens() !== null;

export const logout = (): void => clearTokens();
