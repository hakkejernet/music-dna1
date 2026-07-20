import type { RankedCandidate } from '../rankingEngine';
import type { QueueReactionEvent, ReactionType } from './types';

export interface ReactionResult {
  event: QueueReactionEvent | null;
  queue: RecommendationQueue;
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
