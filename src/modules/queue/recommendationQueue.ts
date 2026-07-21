import type { RankedCandidate } from '../rankingEngine';
import type { QueueReactionEvent, ReactionType } from './types';

export interface ReactionResult {
  event: QueueReactionEvent | null;
  queue: RecommendationQueue;
}

/** The plain-data shape of a queue's own state — everything `restore()` needs to reconstruct an equivalent instance (M20). */
export interface RecommendationQueueSnapshot {
  items: readonly RankedCandidate[];
  cursor: number;
}

/**
 * Owns exactly one thing (M6 Rule 1): position within an already-ranked
 * sequence. It receives `RankedCandidate[]` already sorted by `ranking`
 * (M5) and never reorders, rescoures, or inspects why any item is where
 * it is — it only tracks "where are we in this sequence."
 *
 * An immutable value object (M6 Rule 8): every method that represents
 * an action (`next`, `react`) returns a *new* `RecommendationQueue`
 * rather than modifying `this`. `items` and `cursor` are never
 * reassigned after construction — the class has no setters and no
 * method ever writes to `this.items[i]` or any RankedCandidate's own
 * fields (M6 Rule 1: never touches Candidate/EnrichedCandidate/
 * RankedCandidate/UserDNA).
 *
 * Non-cyclic by construction (same fix v1's RecommendationQueue needed,
 * TDS §2 "queue" — see Review Report for why the concrete v1 class
 * itself isn't reused): `cursor` is capped at `items.length`, an
 * exhausted queue, never wrapped back to 0.
 */
export class RecommendationQueue {
  private readonly items: readonly RankedCandidate[];
  private readonly cursor: number;

  private constructor(items: readonly RankedCandidate[], cursor: number) {
    this.items = items;
    this.cursor = cursor;
  }

  /**
   * Takes its own frozen copy of the given sequence rather than holding
   * the caller's array by reference — the queue's snapshot of "the
   * order I was given" can't be altered by anything the caller does to
   * their own array afterward. This is what makes the immutability
   * guarantee (Rule 8) hold against the outside world, not just against
   * Queue's own methods (which never write to `items` either way).
   */
  static create(rankedCandidates: readonly RankedCandidate[]): RecommendationQueue {
    return new RecommendationQueue(Object.freeze([...rankedCandidates]), 0);
  }

  /**
   * M20: reconstructs a queue at a specific position rather than always
   * starting at 0 — the one thing `create()` deliberately doesn't do,
   * needed to resume a persisted session exactly where it left off.
   * `cursor` is clamped the same way every other method already caps
   * position (never negative, never past `items.length`), so a
   * corrupted or stale stored value can't produce an invalid queue.
   */
  static restore(items: readonly RankedCandidate[], cursor: number): RecommendationQueue {
    const clampedCursor = Math.min(Math.max(cursor, 0), items.length);
    return new RecommendationQueue(Object.freeze([...items]), clampedCursor);
  }

  /** M20: the plain-data view of this queue's own state, for a caller that needs to persist and later `restore()` it — read-only, never a way to mutate this instance. */
  toSnapshot(): RecommendationQueueSnapshot {
    return { items: this.items, cursor: this.cursor };
  }

  /** The candidate currently up for review, or `null` if the queue is exhausted (M6 Rule 7: a normal value, never a thrown error). */
  current(): RankedCandidate | null {
    return this.items[this.cursor] ?? null;
  }

  /** What comes after `current()`, without advancing — `null` past the end, same as `current()`. */
  peek(): RankedCandidate | null {
    return this.items[this.cursor + 1] ?? null;
  }

  /** How many candidates (including the current one) are still ahead. */
  remaining(): number {
    return Math.max(this.items.length - this.cursor, 0);
  }

  /**
   * Advances to the next candidate. Returns a new `RecommendationQueue`
   * — calling `next()` on an already-exhausted queue simply returns an
   * equally-exhausted queue (cursor capped at `items.length`), never a
   * throw and never wrapping back to the start.
   */
  next(): RecommendationQueue {
    return new RecommendationQueue(this.items, Math.min(this.cursor + 1, this.items.length));
  }

  /**
   * M6 Rule 5: reacting to the current candidate produces *only* a
   * plain event describing what happened — Queue never persists it,
   * never updates UserDNA, never calls anything. The returned `queue`
   * is simply the result of moving past the reacted-to item (the same
   * new state `next()` would produce), since a candidate that's been
   * reacted to is, by definition, decided and shouldn't be shown again
   * within this session (TDS §2 queue: "aldrig genbruge en allerede
   * afgjort sang").
   *
   * If the queue is already exhausted, there is nothing to react to —
   * `event` is `null` and the queue is returned unchanged (M6 Rule 7:
   * a normal outcome, not an error).
   */
  react(reactionType: ReactionType): ReactionResult {
    const candidate = this.current();
    if (candidate === null) {
      return { event: null, queue: this };
    }
    return {
      event: { candidateRef: candidate.candidateRef, trackDnaRef: candidate.trackDnaRef, reactionType },
      queue: this.next(),
    };
  }
}
