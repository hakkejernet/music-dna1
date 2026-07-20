import type { EnrichedCandidate } from '../enrichment';
import type { UserDNA } from '../userDna';
import { computeScore, explainBreakdown } from './scoring';
import type { RankedCandidate, RankingEngine } from './types';

/**
 * v1 of the swappable RankingEngine contract (M5 Rule 8) — a rule-based,
 * confidence-weighted DNA-similarity ranker (TDS ADR-09: explainable,
 * not a black box). A future learned ranker implements the same
 * `RankingEngine` interface; nothing here is special-cased anywhere
 * else in the system.
 *
 * A pure function end to end (M5 Rule 1): reads `userDna` and
 * `candidates`, never writes to either, never touches anything outside
 * its own arguments (no providers, no enrichers, no storage — Rule 2),
 * and returns a new array every call.
 */
export class RuleBasedRankingEngine implements RankingEngine {
  rank(userDna: UserDNA, candidates: readonly EnrichedCandidate[], now: Date): RankedCandidate[] {
    const rankedAt = now.toISOString();

    const ranked: RankedCandidate[] = candidates.map((enriched) => {
      const { score, breakdown } = computeScore(userDna.signals, enriched.trackDna.signals);
      return {
        candidateRef: enriched.candidate.candidateId,
        trackDnaRef: enriched.trackDna.trackId,
        score,
        scoreBreakdown: breakdown,
        explanations: explainBreakdown(breakdown),
        rankedAt,
      };
    });

    // M5 Rule 7: ties broken by candidateRef, not by original array
    // position — the same set of candidates in any input order produces
    // the exact same output order. Plain `<`/`>` rather than
    // localeCompare: locale-aware comparison can vary by runtime/ICU
    // version, which would make the tie-break itself non-deterministic
    // across environments — exactly what Rule 7 forbids.
    return ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.candidateRef < b.candidateRef) return -1;
      if (a.candidateRef > b.candidateRef) return 1;
      return 0;
    });
  }
}
