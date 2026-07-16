import type { Recommendation } from './types';

/**
 * Holds the sequence of songs Discovery shows the user, decoupled from
 * where those recommendations come from. Today it's seeded with mock
 * data or ranked provider results; later more sources can populate it
 * the same way, without Discovery's UI needing to change.
 *
 * Generic over T so callers that rank recommendations (see
 * modules/ranking) can hold RankedRecommendation — which still is-a
 * Recommendation — without the queue itself knowing about ranking.
 */
export class RecommendationQueue<T extends Recommendation = Recommendation> {
  private items: T[];
  private cursor = 0;

  constructor(initial: T[] = []) {
    this.items = initial;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Null once every recommendation in this batch has been shown — the browsing session has ended, it doesn't loop back to the start. */
  current(): T | null {
    return this.items[this.cursor] ?? null;
  }

  /** Moves to the next recommendation. Never wraps back to the start — once the last item has been shown, current() returns null instead of repeating earlier ones. */
  advance(): T | null {
    this.cursor += 1;
    return this.current();
  }

  enqueue(recommendation: T): void {
    this.items.push(recommendation);
  }

  /** Removes a recommendation by id (e.g. once saved) so it's never shown again this session. */
  remove(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;

    this.items.splice(index, 1);
    if (index < this.cursor) {
      this.cursor -= 1;
    }
  }

  toArray(): T[] {
    return [...this.items];
  }
}
