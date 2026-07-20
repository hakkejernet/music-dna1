import type { ReactionType } from '../queue';
import type { FeedbackPipelineResult, LearningEvent } from './types';

const VALID_REACTION_TYPES: readonly ReactionType[] = ['save', 'reject', 'known'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isReactionType = (value: unknown): value is ReactionType =>
  typeof value === 'string' && (VALID_REACTION_TYPES as readonly string[]).includes(value);

/**
 * FNV-1a over the event's own identifying content — deterministic and
 * dependency-free. Not cryptographic, doesn't need to be: the only
 * requirement is that the same (candidateRef, trackDnaRef, reactionType)
 * always produces the same id (M7 Rule 5/6), not collision-resistance
 * against adversarial input.
 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const fnv1aHex = (input: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Deliberately derived only from the event's own content, never from
 * `now` — this is what makes the *same* reaction, reprocessed at a
 * different wall-clock time, still identifiable as the same event (M7
 * Rule 6: idempotency is about recognizing a repeat, not about the
 * output being byte-identical on every field).
 */
export const computeEventId = (candidateRef: string, trackDnaRef: string, reactionType: ReactionType): string =>
  `evt_${fnv1aHex(`${candidateRef}::${trackDnaRef}::${reactionType}`)}`;

/**
 * The whole pipeline (M7 Rule 1): validates, normalizes, and enriches a
 * single reaction into a `LearningEvent` — never learns from it, never
 * writes to UserDNA/Queue/Ranking/Candidate/TrackDNA (none of those
 * modules are even imported here), never persists anything (Rule 8).
 *
 * `input` is deliberately `unknown`, not the `QueueReactionEvent` type
 * (M7 Rule 2) — the pipeline's own job is exactly to not trust that its
 * caller already validated the shape, the same "never assume upstream
 * data is well-formed" discipline as `validateSignalVector` (M1).
 * Anything beyond the three required fields is ignored, not rejected
 * (M7 Rule 7): a minimally-described reaction with only these three
 * fields — no session, no snapshot, no extra metadata — is normal,
 * fully valid feedback, not a degraded case.
 *
 * `now` is an explicit parameter (M7 Rule 5, same pattern as every
 * prior milestone): identical input at identical `now` always produces
 * an identical result.
 */
export const processReactionEvent = (input: unknown, now: Date): FeedbackPipelineResult => {
  if (!isRecord(input)) {
    return { accepted: false, reason: 'not-an-object' };
  }

  const candidateRef = typeof input.candidateRef === 'string' ? input.candidateRef.trim() : '';
  if (candidateRef.length === 0) {
    return { accepted: false, reason: 'missing-candidate-ref' };
  }

  const trackDnaRef = typeof input.trackDnaRef === 'string' ? input.trackDnaRef.trim() : '';
  if (trackDnaRef.length === 0) {
    return { accepted: false, reason: 'missing-track-dna-ref' };
  }

  if (!isReactionType(input.reactionType)) {
    return { accepted: false, reason: 'invalid-reaction-type' };
  }
  const reactionType = input.reactionType;

  const learningEvent: LearningEvent = {
    eventId: computeEventId(candidateRef, trackDnaRef, reactionType),
    candidateRef,
    trackDnaRef,
    reactionType,
    recordedAt: now.toISOString(),
  };
  return { accepted: true, learningEvent };
};
