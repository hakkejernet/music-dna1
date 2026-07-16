import type { SpotifyTokens } from './types';

const STORAGE_KEY = 'music-dna:spotify-tokens';

export const loadTokens = (): SpotifyTokens | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyTokens;
  } catch {
    return null;
  }
};

export const saveTokens = (tokens: SpotifyTokens): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
};

export const clearTokens = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
