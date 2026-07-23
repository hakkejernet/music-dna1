import type { EnrichedCandidate } from '../../enrichment';
import type { RankedCandidate } from '../../rankingEngine';

/**
 * M27: selects at most `limit` candidates from an already-ranked pool,
 * capping how many can share the same primary artist. This is filtering
 * only, never re-ranking (RankingEngine's own responsibility, M5,
 * completely untouched by this function): candidates are walked in the
 * exact order `rankedPool` was given in, a candidate is either selected
 * or skipped, and a skipped candidate never displaces a higher-ranked
 * one — the result is always a subsequence of the input.
 *
 * `maxPerArtist` is an explicit parameter, not a constant hardcoded in
 * this file (M27 review comment 1) — this function has no opinion on
 * what the right cap is, only on how to apply one. The caller
 * (`BuildDiscoveryQueue`) decides the value, exactly like `limit` itself
 * is already a caller-supplied parameter, not a constant defined here.
 * This is dependency injection of a configuration value, not a new
 * architectural layer: the function signature grows by one primitive
 * argument, nothing else changes shape.
 *
 * A candidate whose primary artist can't be resolved (missing from
 * `enrichedByCandidateId`, or an empty `artists` array) is never capped
 * — the same "missing data must never act like a bad match" posture
 * used throughout this codebase (M1 onward), applied here to grouping
 * instead of scoring.
 *
 * Grouping uses only `artists[0]` (the primary/first-listed artist) —
 * a deliberate simplification for a featured-artist/collab candidate,
 * consistent with how `artists.join(', ')` already treats the first
 * artist as primary elsewhere (e.g. RecommendationCard).
 */
export const diversifyRankedCandidates = (
  rankedPool: readonly RankedCandidate[],
  enrichedByCandidateId: ReadonlyMap<string, EnrichedCandidate>,
  limit: number,
  maxPerArtist: number,
): RankedCandidate[] => {
  const selected: RankedCandidate[] = [];
  const countByArtist = new Map<string, number>();

  for (const candidate of rankedPool) {
    if (selected.length >= limit) break;

    const artist = enrichedByCandidateId.get(candidate.candidateRef)?.candidate.artists[0] ?? null;
    if (artist === null) {
      selected.push(candidate);
      continue;
    }

    const count = countByArtist.get(artist) ?? 0;
    if (count < maxPerArtist) {
      selected.push(candidate);
      countByArtist.set(artist, count + 1);
    }
    // else: skip — this candidate stays out of THIS batch only, it is
    // never excluded from a future one (that's shownCandidateIds' job).
  }

  return selected;
};
