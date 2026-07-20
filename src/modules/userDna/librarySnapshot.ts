/**
 * The minimal shape Cold Start actually needs from a Spotify library —
 * not v1's full SpotifyArtist/SpotifyTrack types. Deliberately decoupled
 * from modules/spotify's exact shape (TDS designprincip: Spotify is a
 * replaceable data source, not something the rest of the system should
 * be tightly coupled to). Building the real Spotify → LibrarySnapshot
 * mapping, and wiring this to a live session, is explicitly out of scope
 * for this milestone (see docs/IMPLEMENTATION_ROADMAP.md M2 Review Report).
 *
 * `null` on either field means "this data source wasn't available" —
 * distinct from an empty array, though both are treated the same way by
 * buildColdStartUserDna() (Cold Start Design Principle 4: no single
 * feature's absence should block the rest of the computation).
 */
export interface LibraryArtistSummary {
  /** Raw Spotify genre tags for this artist (free text, e.g. "dream pop") — matched by keyword, not a fixed taxonomy. */
  genres: string[];
  /** Spotify's own 0-100 popularity score for the artist. */
  popularity: number;
}

export interface LibraryTrackSummary {
  explicit: boolean;
  durationMs: number;
}

export interface LibrarySnapshot {
  topArtists: LibraryArtistSummary[] | null;
  savedTracks: LibraryTrackSummary[] | null;
}
