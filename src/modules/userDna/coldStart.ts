import { validateSignalVector, type SignalReading } from '../trackDna';
import type { LibraryArtistSummary, LibrarySnapshot, LibraryTrackSummary } from './librarySnapshot';
import type { UserDNA } from './types';

/**
 * Cold start is a starting point, never a judgement (Cold Start Design
 * Principle 2) — every signal this module computes uses this same,
 * fixed, low confidence. It never varies by how much corroborating data
 * went into it: that kind of graduated confidence is a real future
 * improvement, but it's more than the simplest correct implementation
 * needs, and M2's goal is explicitly not a polished model (see
 * docs/IMPLEMENTATION_ROADMAP.md M2 scope).
 */
const COLD_START_CONFIDENCE = 0.2;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Deterministic keyword match against Spotify's free-text genre tags — not a real taxonomy, just the simplest thing that works. */
const GENRE_KEYWORDS: Record<string, string[]> = {
  pop: ['pop'],
  hiphop: ['hip hop', 'hip-hop', 'rap'],
  trap: ['trap'],
  rock: ['rock'],
  country: ['country'],
  house: ['house'],
};

const hasUsableArtists = (topArtists: LibraryArtistSummary[] | null): topArtists is LibraryArtistSummary[] =>
  Array.isArray(topArtists) && topArtists.length > 0;

const hasUsableTracks = (savedTracks: LibraryTrackSummary[] | null): savedTracks is LibraryTrackSummary[] =>
  Array.isArray(savedTracks) && savedTracks.length > 0;

/** One signal per genre keyword group — the fraction of top artists whose genre tags match, at the fixed cold-start confidence. */
const buildGenreSignals = (topArtists: LibraryArtistSummary[] | null): Record<string, SignalReading> => {
  if (!hasUsableArtists(topArtists)) return {};

  const signals: Record<string, SignalReading> = {};
  for (const [signalKey, keywords] of Object.entries(GENRE_KEYWORDS)) {
    const matchCount = topArtists.filter((artist) =>
      artist.genres.some((genre) => keywords.some((keyword) => genre.toLowerCase().includes(keyword))),
    ).length;
    signals[signalKey] = { value: clamp01(matchCount / topArtists.length), confidence: COLD_START_CONFIDENCE };
  }
  return signals;
};

/** Spotify's own popularity score, averaged across top artists, is a direct proxy for "mainstream". */
const buildMainstreamSignal = (topArtists: LibraryArtistSummary[] | null): Record<string, SignalReading> => {
  if (!hasUsableArtists(topArtists)) return {};
  const average = topArtists.reduce((sum, artist) => sum + artist.popularity, 0) / topArtists.length;
  return { mainstream: { value: clamp01(average / 100), confidence: COLD_START_CONFIDENCE } };
};

/** Fraction of saved tracks Spotify itself marks explicit — direct track metadata, no restricted API involved. */
const buildExplicitnessSignal = (savedTracks: LibraryTrackSummary[] | null): Record<string, SignalReading> => {
  if (!hasUsableTracks(savedTracks)) return {};
  const explicitCount = savedTracks.filter((track) => track.explicit).length;
  return { explicitness: { value: clamp01(explicitCount / savedTracks.length), confidence: COLD_START_CONFIDENCE } };
};

/** A fixed 6-minute reference, not a statistical claim — the simplest deterministic normalization for a "long vs. short" signal. */
const REFERENCE_MAX_DURATION_MS = 6 * 60 * 1000;

const buildSongLengthSignal = (savedTracks: LibraryTrackSummary[] | null): Record<string, SignalReading> => {
  if (!hasUsableTracks(savedTracks)) return {};
  const averageDurationMs = savedTracks.reduce((sum, track) => sum + track.durationMs, 0) / savedTracks.length;
  return { songLength: { value: clamp01(averageDurationMs / REFERENCE_MAX_DURATION_MS), confidence: COLD_START_CONFIDENCE } };
};

/**
 * M30: unlike every other signal in this module, `trackSimilarity`'s
 * value is not derived from `topArtists` or `savedTracks` at all — it is
 * seeded unconditionally, even for a fully empty snapshot. This is a
 * deliberate, structural statement of what the `trackSimilarityMatch`
 * ranking bucket measures ("closeness to a track the user already,
 * verifiably likes" has no plausible opposite preference the way a
 * genre or mainstream-level *estimate* could turn out wrong), not a
 * guess about this particular user.
 *
 * It still uses the exact same COLD_START_CONFIDENCE every other
 * cold-start signal uses — UserDNA's cold-start confidence policy stays
 * uniform. If trackSimilarity should ever carry more or less weight in
 * ranking than another bucket, that is a decision for the enricher's own
 * confidence (TrackDNA side, see trackSimilarityEnricher) or a future
 * ranking heuristic — never a special-cased confidence model here.
 */
const buildTrackSimilaritySignal = (): Record<string, SignalReading> => ({
  trackSimilarity: { value: 1, confidence: COLD_START_CONFIDENCE },
});

/**
 * Pure and deterministic (Cold Start Design Principle 1): identical
 * (userId, snapshot, now) always produces an identical UserDNA. `now` is
 * an explicit parameter rather than read internally (no `Date.now()`
 * inside this function) — that's what keeps it pure and testable; real
 * call sites simply pass `new Date()`.
 *
 * Each signal group is computed independently from whichever part of
 * the snapshot is actually present (Design Principle 4) — missing
 * topArtists never blocks the savedTracks-derived signals, and vice
 * versa. Whatever isn't computed here — including every signal this
 * milestone has no honest Spotify-derived basis for at all, never a
 * guess (Design Principle 3) — is left at validateSignalVector()'s own
 * neutral default (value: midpoint, confidence: 0), which also covers
 * the fully-empty-library case with no extra code here.
 *
 * See docs/IMPLEMENTATION_ROADMAP.md's M2 Review Report for the full,
 * documented list of which of the 19 catalog signals this can and
 * cannot derive.
 */
export const buildColdStartUserDna = (userId: string, snapshot: LibrarySnapshot, now: Date): UserDNA => {
  const computedSignals: Record<string, SignalReading> = {
    ...buildGenreSignals(snapshot.topArtists),
    ...buildMainstreamSignal(snapshot.topArtists),
    ...buildExplicitnessSignal(snapshot.savedTracks),
    ...buildSongLengthSignal(snapshot.savedTracks),
    ...buildTrackSimilaritySignal(),
  };

  return {
    userId,
    signals: validateSignalVector(computedSignals),
    coldStart: true,
    // No snapshot-persistence mechanism exists yet (out of this milestone's
    // scope) — nothing to reference honestly, so this stays null rather
    // than inventing a fake reference.
    sourceLibrarySnapshotRef: null,
    version: 1,
    updatedAt: now.toISOString(),
  };
};
