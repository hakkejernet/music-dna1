export interface TopArtistsParseError {
  message: string;
  stack: string | null;
  /** Where in the source this was caught — hardcoded, not derived from the (often source-mapless, minified) stack. */
  location: string;
}

export interface TopArtistsFirstArtist {
  name: string | null;
  id: string | null;
  /** Object.keys() of the raw first item — exactly what Spotify sent, not what SpotifyArtist assumes. */
  fields: string[];
}

/**
 * Raw, unmapped truth about the GET /me/top/artists call — a second,
 * debug-only request (only made when ?debug=1 is active) that mirrors
 * exactly what buildSpotifySeed()'s real request sends, so this reflects
 * actual Spotify data rather than an error message derived from it.
 */
export interface TopArtistsDebug {
  httpStatus: number | null;
  itemCount: number | null;
  firstArtist: TopArtistsFirstArtist | null;
  parseError: TopArtistsParseError | null;
  /** Precise reason seedArtistNames ended up empty, if it did. */
  emptySeedReason: string | null;
}

export interface SpotifyDiagnostics {
  loginOk: boolean;
  /** Number of top artists Spotify returned — null when the call itself failed (see error). */
  topArtistsFound: number | null;
  /** Names actually passed on to providers as seeds (post-slice, pre-Last.fm-call). */
  seedArtistNames: string[];
  error: string | null;
  /** Only populated when ?debug=1 is active — see TopArtistsDebug. */
  topArtistsDebug: TopArtistsDebug | null;
}

export interface LastFmDiagnostics {
  apiKeyPresent: boolean;
  apiCallMade: boolean;
  similarArtistsFound: number | null;
  topTracksFound: number | null;
  recommendationsBuilt: number | null;
  error: string | null;
}

/** M15: 'mock' was removed together with the production mock-data fallback — an empty result is now a real, representable outcome instead of being papered over. */
export type RecommendationSource = 'lastfm' | 'empty';

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
  /** Set only when queue.source === 'empty' — the precise reason no real recommendations were found. */
  fallbackReason: string | null;
  /** First 10 recommendations that ended up in the queue, formatted "Title — Artist". */
  topRecommendations: string[];
}
