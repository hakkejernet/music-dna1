export interface SpotifyDiagnostics {
  loginOk: boolean;
  /** Number of top artists Spotify returned — null when the call itself failed (see error). */
  topArtistsFound: number | null;
  /** Names actually passed on to providers as seeds (post-slice, pre-Last.fm-call). */
  seedArtistNames: string[];
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
  /** Recommendations from providers, after the already-saved filter, before SimpleRanker. */
  beforeRanking: number;
  /** Same set, after SimpleRanker — count only, ranking never drops items. */
  afterRanking: number;
  /** RecommendationQueue.size right after construction. */
  inQueue: number;
  source: RecommendationSource;
}

/** Snapshot of the most recent loadRecommendationQueue() run — read by the debug panel (see src/lib/debugMode.ts for how it's activated). */
export interface RecommendationDiagnostics {
  spotify: SpotifyDiagnostics;
  lastfm: LastFmDiagnostics;
  queue: QueueDiagnostics | null;
  /** Set only when queue.source === 'mock' — the precise reason mock data was used. */
  fallbackReason: string | null;
  /** First 10 recommendations that ended up in the queue, formatted "Title — Artist". */
  topRecommendations: string[];
}
