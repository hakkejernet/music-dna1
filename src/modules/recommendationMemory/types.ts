import type { LearningEvent } from '../feedbackPipeline';

/**
 * The only outcomes Recommendation Memory tracks — mirrors LearningEvent's
 * own reaction vocabulary (M7) rather than importing ReactionType from
 * `queue` directly, the same "derive from the nearest already-validated
 * domain type" discipline learningEngine's own reactionWeight() already
 * uses (M8). feedbackPipeline has no UserDNA dependency, so this keeps
 * Recommendation Memory's independence from UserDNA intact (M29 Rule 1).
 */
export type RecommendationOutcome = LearningEvent['reactionType'];

/**
 * Only the latest outcome per candidate is kept — no history, no
 * analytics, no multiple outcomes per track (M29 scope). `suppressedUntil`
 * is `null` for exactly one case: a `save` outcome, representing
 * permanent ownership, not a temporary preference. The immutability rule
 * itself (once `save`, never overwritten) is decided in `buildMemoryEntry`
 * (rules.ts) — this is a plain data shape, not where that rule lives.
 */
export interface RecommendationMemoryEntry {
  candidateId: string;
  lastOutcome: RecommendationOutcome;
  lastOutcomeAt: string;
  suppressedUntil: string | null;
}
