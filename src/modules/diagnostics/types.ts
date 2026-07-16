export interface SpotifyDiagnostics {
  loginOk: boolean;
  /** Number of top artists Spotify returned — null when the call itself failed (see error). */
  topArtistsFound: number | null;
  error: string | null;
}

export interface LastFmDiagnostics {
  apiKeyPresent: boolean;
  apiCallMade: boolean;
  similarArtistsFound: number | null;
  topTracksFound: number | null;
  recommendationsBuilt: number | null;
  error: string | null;
}

export type RecommendationSource = 'lastfm' | 'mock';

export interface QueueDiagnostics {
  count: number;
  source: RecommendationSource;
}

/** Snapshot of the most recent loadRecommendationQueue() run — read-only view for the dev-only DebugPanel. */
export interface RecommendationDiagnostics {
  spotify: SpotifyDiagnostics;
  lastfm: LastFmDiagnostics;
  queue: QueueDiagnostics | null;
  /** Set only when queue.source === 'mock' — the precise reason mock data was used. */
  fallbackReason: string | null;
}
