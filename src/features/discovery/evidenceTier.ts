/**
 * M25: describes how much evidence supports a recommendation's score —
 * never how confident the system is that the song is good. VISION.md
 * ("never fake certainty"): a low-evidence pick can still become a
 * favourite, so this classification only ever reports how much signal
 * ranking had to go on, not a quality judgement.
 */
export type EvidenceTier = 'strong' | 'some' | 'weak' | 'none';

/**
 * Deterministic and total over RankedCandidate.score's entire possible
 * range ([0, 100], guaranteed by the unmodified, frozen scoring formula
 * in rankingEngine/scoring.ts — negative scores are mathematically
 * impossible, so no defensive handling for them is needed).
 *
 * Thresholds come from the scoring formula's own meaning (an average
 * match-quality percentage across whichever buckets contributed), not
 * from tuning to today's observed data. Per M24, real Last.fm candidates
 * today rarely populate more than one of the four buckets, so 'strong'
 * and 'some' may be rare or briefly absent in real usage — that is
 * expected, valuable evidence this milestone is meant to surface, not a
 * reason to lower these boundaries to force a nicer-looking distribution.
 */
export const classifyEvidence = (score: number): EvidenceTier => {
  if (score === 0) return 'none';
  if (score < 20) return 'weak';
  if (score < 50) return 'some';
  return 'strong';
};
