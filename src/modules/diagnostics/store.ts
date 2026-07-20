import type { LastFmDiagnostics, RecommendationDiagnostics, SpotifyDiagnostics } from './types';

const emptyDiagnostics = (): RecommendationDiagnostics => ({
  spotify: { loginOk: false, topArtistsFound: null, seedArtistNames: [], error: null, topArtistsDebug: null },
  lastfm: {
    apiKeyPresent: false,
    apiCallMade: false,
    similarArtistsFound: null,
    topTracksFound: null,
    recommendationsBuilt: null,
    error: null,
  },
  queue: null,
  fallbackReason: null,
  topRecommendations: [],
});

let current: RecommendationDiagnostics = emptyDiagnostics();

/** Called once at the start of loadRecommendationQueue() so a run never mixes state with the previous one. */
export const resetRecommendationDiagnostics = (): void => {
  current = emptyDiagnostics();
};

export const updateRecommendationDiagnostics = (patch: Partial<RecommendationDiagnostics>): void => {
  current = { ...current, ...patch };
};

export const updateSpotifyDiagnostics = (patch: Partial<SpotifyDiagnostics>): void => {
  current = { ...current, spotify: { ...current.spotify, ...patch } };
};

export const updateLastFmDiagnostics = (patch: Partial<LastFmDiagnostics>): void => {
  current = { ...current, lastfm: { ...current.lastfm, ...patch } };
};

/** Snapshot of the most recent loadRecommendationQueue() run — read by the debug panel. */
export const getRecommendationDiagnostics = (): RecommendationDiagnostics => current;
