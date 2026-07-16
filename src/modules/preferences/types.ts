/**
 * Purely local, purely statistical taste signal derived from the user's own
 * save/reject history (see modules/history). No AI, no machine learning —
 * every field here is just a frequency count above a small threshold.
 */
export interface PreferenceProfile {
  /** Genres that show up often among saved recommendations. */
  favoriteGenres: string[];
  /** Genres that show up often among rejected recommendations. */
  avoidedGenres: string[];
  /** Artist IDs the user has saved a track from before. */
  favoriteArtistIds: string[];
  /** Decades (e.g. "1990") that show up often among saved recommendations. */
  favoriteDecades: string[];
  /** Recommendation sources (e.g. "lastfm") that show up often among saved recommendations. */
  favoriteSources: string[];
  /** Recommendation sources that show up often among rejected recommendations. */
  avoidedSources: string[];
  /**
   * Reject-panel reasons the user picks most often, most frequent first
   * (e.g. "For poppet", "Kan ikke lide vokalen"). Not used by SimpleRanker
   * yet — infrastructure for a future rule.
   */
  topRejectionReasons: string[];
}
