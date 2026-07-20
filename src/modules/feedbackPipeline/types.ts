import type { ReactionType } from '../queue';

/** Why an input was refused (M7 Rule 4: the pipeline validates, it never guesses past a problem). */
export type FeedbackRejectionReason = 'not-an-object' | 'missing-candidate-ref' | 'missing-track-dna-ref' | 'invalid-reaction-type';

/**
 * The domain object M8 (learning) will eventually consume — everything
 * this pipeline can honestly derive from a `QueueReactionEvent` alone,
 * normalized and enriched with a timestamp (M7 Rule 3/4). See the
 * Review Report for why this is narrower than TDS §3's full
 * `FeedbackEvent` (no session/snapshot context is available this far
 * upstream) and why it is deliberately *not* named `FeedbackEvent`.
 */
export interface LearningEvent {
  /** Deterministic, content-derived — the same (candidateRef, trackDnaRef, reactionType) always produces the same id, which is what makes idempotency checkable (M7 Rule 6). */
  eventId: string;
  candidateRef: string;
  trackDnaRef: string;
  reactionType: ReactionType;
  recordedAt: string;
}

export type FeedbackPipelineResult = { accepted: true; learningEvent: LearningEvent } | { accepted: false; reason: FeedbackRejectionReason };
