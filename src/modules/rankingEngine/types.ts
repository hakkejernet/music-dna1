import type { EnrichedCandidate } from '../enrichment';
import type { UserDNA } from '../userDna';

/**
 * The four signal-groups this milestone actually scores — see
 * `signalGroups.ts` for the exact catalog-signal membership and the
 * Review Report for why these four (not all 19 catalog signals) are in
 * scope for M5.
 */
export interface ScoreBreakdown {
  genreMatch: number;
  mainstreamMatch: number;
  explicitMatch: number;
  durationMatch: number;
  /** M30: how closely a candidate matches a track already in the user's library, per Last.fm's own track-similarity graph. */
  trackSimilarityMatch: number;
}

/**
 * TDS §3 RankedCandidate, minus `sessionRef`. `sessionRef` ties a
 * ranking result to a `RecommendationSession` — a queue/discovery
 * concept M5 explicitly must not know about (Rule 9, "ingen
 * recommendation queue"). Assigning it is downstream's job, once a
 * session actually exists; see Review Report.
 */
export interface RankedCandidate {
  candidateRef: string;
  trackDnaRef: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  explanations: string[];
  rankedAt: string;
}

/**
 * A pure, swappable contract (M5 Rule 8): nothing outside this
 * interface's shape may depend on *how* a score was produced. A future
 * ML-based ranker implements the exact same interface — same input,
 * same output shape — with zero changes anywhere else in the system.
 *
 * Synchronous, not async like CandidateProvider/Enricher: those two
 * interfaces are async because a *future* implementation might
 * plausibly need I/O (a real API, in enrichment's case). Ranking has no
 * such future — Rule 9 bans network access categorically, not just for
 * this milestone — so "pure function" (Rule 1) is taken literally here.
 */
export interface RankingEngine {
  rank(userDna: UserDNA, candidates: readonly EnrichedCandidate[], now: Date): RankedCandidate[];
}
