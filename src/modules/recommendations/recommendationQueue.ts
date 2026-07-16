import type { Recommendation } from './types';

/**
 * Holds the sequence of songs Discovery shows the user, decoupled from
 * where those recommendations come from. Today it's seeded with mock
 * data; later a real engine (or an external API) can populate it the
 * same way, without Discovery's UI needing to change.
 */
export class RecommendationQueue {
  private items: Recommendation[];
  private cursor = 0;

  constructor(initial: Recommendation[] = []) {
    this.items = initial;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  current(): Recommendation | null {
    if (this.isEmpty()) return null;
    return this.items[this.cursor % this.items.length];
  }

  advance(): Recommendation | null {
    if (this.isEmpty()) return null;
    this.cursor = (this.cursor + 1) % this.items.length;
    return this.current();
  }

  enqueue(recommendation: Recommendation): void {
    this.items.push(recommendation);
  }

  toArray(): Recommendation[] {
    return [...this.items];
  }
}
