export { RuleBasedRankingEngine } from './ruleBasedRankingEngine';
export { SIGNAL_GROUPS } from './signalGroups';
// computeSignalLevelDetail/SignalLevelDetail are TEMPORARY (one-time
// candidate-quality audit only) — see scoring.ts.
export { computeSignalLevelDetail } from './scoring';
export type { SignalLevelDetail } from './scoring';
export type { RankedCandidate, RankingEngine, ScoreBreakdown } from './types';
