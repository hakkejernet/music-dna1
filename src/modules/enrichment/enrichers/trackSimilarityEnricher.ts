import type { Candidate } from '../../candidateProviders';
import type { Enricher, PartialSignalContribution } from '../types';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Same undertuned-but-documented posture as popularityEnricher's own
 * POPULARITY_ENRICHMENT_CONFIDENCE — an enricher-owned, per-signal
 * constant on the TrackDNA side. This is unrelated to, and does not
 * override, UserDNA's own cold-start confidence policy (M30 review):
 * if trackSimilarity should ever carry more or less weight than another
 * bucket, that is expressed here or in a future ranking-heuristic change
 * — never by giving trackSimilarity a special confidence model on the
 * UserDNA side, which stays uniform with every other cold-start signal.
 */
const TRACK_SIMILARITY_ENRICHMENT_CONFIDENCE = 0.5;

/** Reads a `trackSimilarityMatch: number` field from any contribution's rawMetadata — the first usable one found, since all contributions describe the same candidate. */
const findTrackSimilarityMatch = (candidate: Candidate): number | null => {
  for (const contribution of candidate.contributions) {
    const { rawMetadata } = contribution;
    if (isRecord(rawMetadata) && typeof rawMetadata.trackSimilarityMatch === 'number' && Number.isFinite(rawMetadata.trackSimilarityMatch)) {
      return rawMetadata.trackSimilarityMatch;
    }
  }
  return null;
};

/**
 * M30: owns the single `trackSimilarity` signal — how closely, per
 * Last.fm's own track-to-track similarity graph (not the artist-level
 * similarity candidate generation already runs on), this candidate
 * matches a track already in the user's synced local library.
 * LastFmCandidateProvider attaches `rawMetadata.trackSimilarityMatch`
 * only on a genuine normalized title+artist match against that library
 * — see its own docs for that lookup.
 *
 * Deterministic, network-free (M4 Rule 8): reads only what's already
 * present in the Candidate it was given. Missing/non-numeric is unknown
 * (M4 Rule 5), not a bad match — the large majority of candidates will
 * have no match at all, which is expected, not an error.
 */
export const trackSimilarityEnricher: Enricher = {
  enricherName: 'track-similarity',
  ownedSignals: ['trackSimilarity'],

  async enrich(candidate: Candidate): Promise<PartialSignalContribution> {
    const match = findTrackSimilarityMatch(candidate);
    if (match === null) return {};
    return { trackSimilarity: { value: clamp01(match), confidence: TRACK_SIMILARITY_ENRICHMENT_CONFIDENCE } };
  },
};
