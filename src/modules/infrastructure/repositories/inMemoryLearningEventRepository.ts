import type { RepositoryFailure } from '../../domainErrors';
import type { LearningEvent } from '../../feedbackPipeline';
import type { LearningEventRepository } from '../../persistence';
import type { Result } from '../../result';
import { deepClone } from '../deepClone';
import { runRepositoryOperation } from '../repositoryOperation';

/**
 * Each instance owns its own `Map`, keyed by `eventId` — no shared or
 * global store (M9 Rule 8). `save()` upserts by `eventId`: since M7's
 * `eventId` is already deterministic and content-derived, saving "the
 * same" event twice is a harmless, idempotent no-op rather than a
 * duplicate — no extra de-duplication logic needed here.
 *
 * Defensive copies on every operation (M9 Rule 7); returns a `Result`
 * rather than a bare value (M12 Rule 3), same as
 * `InMemoryUserDnaRepository`.
 */
export class InMemoryLearningEventRepository implements LearningEventRepository {
  private readonly store = new Map<string, LearningEvent>();

  async save(item: LearningEvent): Promise<Result<void, RepositoryFailure>> {
    return runRepositoryOperation('LearningEventRepository.save', () => {
      this.store.set(item.eventId, deepClone(item));
    });
  }

  async getById(id: string): Promise<Result<LearningEvent | null, RepositoryFailure>> {
    return runRepositoryOperation('LearningEventRepository.getById', () => {
      const found = this.store.get(id);
      return found ? deepClone(found) : null;
    });
  }

  async getAll(): Promise<Result<LearningEvent[], RepositoryFailure>> {
    return runRepositoryOperation('LearningEventRepository.getAll', () => [...this.store.values()].map((item) => deepClone(item)));
  }
}
