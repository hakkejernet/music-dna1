import type { RepositoryFailure } from '../../domainErrors';
import type { RecommendationMemoryRepository } from '../../persistence';
import type { RecommendationMemoryEntry } from '../../recommendationMemory';
import type { Result } from '../../result';
import { deepClone } from '../deepClone';
import { runRepositoryOperation } from '../repositoryOperation';

/**
 * M29: owns its own `Map`, keyed by `candidateId` — no shared or global
 * store, same discipline as every other InMemory repository. Defensive
 * copies + `Result`-returning, matching the other three. Implements
 * exactly the two methods `RecommendationMemoryRepository` declares —
 * no `getAll()`, since nothing in this milestone calls it.
 */
export class InMemoryRecommendationMemoryRepository implements RecommendationMemoryRepository {
  private readonly store = new Map<string, RecommendationMemoryEntry>();

  async get(candidateId: string): Promise<Result<RecommendationMemoryEntry | null, RepositoryFailure>> {
    return runRepositoryOperation('RecommendationMemoryRepository.get', () => {
      const found = this.store.get(candidateId);
      return found ? deepClone(found) : null;
    });
  }

  async put(entry: RecommendationMemoryEntry): Promise<Result<void, RepositoryFailure>> {
    return runRepositoryOperation('RecommendationMemoryRepository.put', () => {
      this.store.set(entry.candidateId, deepClone(entry));
    });
  }
}
