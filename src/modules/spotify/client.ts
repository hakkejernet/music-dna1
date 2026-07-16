import { getValidAccessToken } from './auth';

const API_BASE = 'https://api.spotify.com/v1';
const MAX_RETRIES = 3;

export class SpotifyAuthError extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    throw new SpotifyAuthError('Spotify session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(`Spotify API error ${response.status} on ${path}: ${await response.text()}`);
  }

  return (await response.json()) as T;
};
