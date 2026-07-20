import type { RepositoryFailure } from '../../domainErrors';
import type { TrackDnaRepository } from '../../persistence';
import type { Result } from '../../result';
import type { TrackDNA } from '../../trackDna';
import { deepClone } from '../deepClone';
import { runRepositoryOperation } from '../repositoryOperation';

/** Each instance owns its own `Map`, keyed by `trackId` — no shared or global store (M9 Rule 8). Defensive copies + `Result`-returning (M12 Rule 3), same as the other two InMemory repositories. */
export class InMemoryTrackDnaRepository implements TrackDnaRepository {
  private readonly store = new Map<string, TrackDNA>();

  async save(item: TrackDNA): Promise<Result<void, RepositoryFailure>> {
    return runRepositoryOperation('TrackDnaRepository.save', () => {
      this.store.set(item.trackId, deepClone(item));
    });
  }

  async getById(id: string): Promise<Result<TrackDNA | null, RepositoryFailure>> {
    return runRepositoryOperation('TrackDnaRepository.getById', () => {
      const found = this.store.get(id);
      return found ? deepClone(found) : null;
    });
  }

  async getAll(): Promise<Result<TrackDNA[], RepositoryFailure>> {
    return runRepositoryOperation('TrackDnaRepository.getAll', () => [...this.store.values()].map((item) => deepClone(item)));
  }
}
