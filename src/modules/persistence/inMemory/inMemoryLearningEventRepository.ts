import type { LearningEvent } from '../../feedbackPipeline';
import { deepClone } from '../deepClone';
import type { LearningEventRepository } from '../types';

/**
 * Each instance owns its own `Map`, keyed by `eventId` — no shared or
 * global store (M9 Rule 8). `save()` upserts by `eventId`: since M7's
 * `eventId` is already deterministic and content-derived, saving "the
 * same" event twice is a harmless, idempotent no-op rather than a
 * duplicate — no extra de-duplication logic needed here.
 *
 * Defensive copies on every operation (M9 Rule 7), same as
 * `InMemoryUserDnaRepository`.
 */
export class InMemoryLearningEventRepository implements LearningEventRepository {
  private readonly store = new Map<string, LearningEvent>();

  async save(item: LearningEvent): Promise<void> {
    this.store.set(item.eventId, deepClone(item));
  }

  async getById(id: string): Promise<LearningEvent | null> {
    const found = this.store.get(id);
    return found ? deepClone(found) : null;
  }

  async getAll(): Promise<LearningEvent[]> {
    return [...this.store.values()].map((item) => deepClone(item));
  }
}
