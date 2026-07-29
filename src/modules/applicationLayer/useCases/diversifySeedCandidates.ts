import type { Candidate } from '../../candidateProviders';

/** The `seedArtist` any CandidateProvider may record in a contribution's `rawMetadata` — read-only, provider-agnostic (M32 doesn't assume Last.fm specifically). Grouping key is case-insensitive since seed names pass through free-text sources. */
const seedArtistOf = (candidate: Candidate): string | null => {
  for (const contribution of candidate.contributions) {
    const rawMetadata = contribution.rawMetadata;
    if (typeof rawMetadata === 'object' && rawMetadata !== null) {
      const seedArtist = (rawMetadata as Record<string, unknown>).seedArtist;
      if (typeof seedArtist === 'string' && seedArtist.length > 0) return seedArtist.toLowerCase();
    }
  }
  return null;
};

/**
 * M32: selects up to `targetPoolSize` candidates from an already-fetched
 * pool, capping how many can share the same seed artist — analogous to
 * diversifyRankedCandidates (M27), but applied to the raw candidate pool
 * by *seed* artist, before enrichment/ranking, instead of to the ranked
 * pool by *primary* artist afterward. Both are filtering only: neither
 * fetches anything new, re-ranks, or invents a candidate that wasn't
 * already in the input.
 *
 * This only has real effect when `candidates` is genuinely larger than
 * `targetPoolSize` — the caller (BuildDiscoveryQueue) is responsible for
 * requesting a large-enough raw pool from CandidateAggregator first
 * (see RAW_CANDIDATE_FETCH_SIZE), since capping a pool that was already
 * truncated down to exactly the target size has nothing left to
 * rebalance. When `candidates.length <= targetPoolSize`, every candidate
 * is kept — the same "if a seed naturally produces fewer than the cap,
 * keep them all" posture applied one level up, to the whole pool.
 *
 * A candidate whose seed artist can't be resolved (no CandidateProvider
 * recorded one) is never capped — the same "missing data must never act
 * like a bad match" posture diversifyRankedCandidates already uses for
 * an unresolvable primary artist — but it still counts toward, and is
 * bounded by, the overall target.
 *
 * Algorithm, in three passes:
 * 1. Every ungrouped (unattributable) candidate, uncapped.
 * 2. Up to `maxPerSeed` from every seed's group — so no seed can claim
 *    more than its fair share before every other seed has had a chance.
 * 3. If the pool is still short of `targetPoolSize`, round-robin one
 *    more candidate at a time from every seed that still has remaining
 *    (beyond-cap) candidates, until the target is reached or every
 *    seed's group is exhausted. Round-robin (not "refill from the first
 *    surplus seed found") is what actually gives every other seed a
 *    real opportunity to contribute, per the milestone's own wording —
 *    a seed only gets a second, third, etc. above-cap slot after every
 *    other seed with remaining candidates has already had a turn in
 *    that same round.
 */
export const diversifySeedCandidates = (candidates: readonly Candidate[], maxPerSeed: number, targetPoolSize: number): Candidate[] => {
  const groups = new Map<string, Candidate[]>();
  const ungrouped: Candidate[] = [];

  for (const candidate of candidates) {
    const seed = seedArtistOf(candidate);
    if (seed === null) {
      ungrouped.push(candidate);
      continue;
    }
    const group = groups.get(seed);
    if (group) group.push(candidate);
    else groups.set(seed, [candidate]);
  }

  const target = Math.min(targetPoolSize, candidates.length);
  const result: Candidate[] = [];

  for (const candidate of ungrouped) {
    if (result.length >= target) break;
    result.push(candidate);
  }

  const groupList = [...groups.values()];
  for (const group of groupList) {
    for (const candidate of group.slice(0, maxPerSeed)) {
      if (result.length >= target) break;
      result.push(candidate);
    }
  }

  const nextIndex = groupList.map(() => maxPerSeed);
  let addedThisRound = true;
  while (result.length < target && addedThisRound) {
    addedThisRound = false;
    for (let i = 0; i < groupList.length && result.length < target; i += 1) {
      const group = groupList[i];
      if (nextIndex[i] < group.length) {
        result.push(group[nextIndex[i]]);
        nextIndex[i] += 1;
        addedThisRound = true;
      }
    }
  }

  return result;
};
