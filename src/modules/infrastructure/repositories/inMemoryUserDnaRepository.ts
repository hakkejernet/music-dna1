import type { RepositoryFailure } from '../../domainErrors';
import type { UserDnaRepository } from '../../persistence';
import type { Result } from '../../result';
import type { UserDNA } from '../../userDna';
import { deepClone } from '../deepClone';
import { runRepositoryOperation } from '../repositoryOperation';

/**
 * Each instance owns its own `Map` — no module-level shared store, no
 * singleton, no global state (M9 Rule 8). Constructing a second
 * instance starts with a completely empty, independent store.
 *
 * Every `save()`/`getById()`/`getAll()` defensively clones (M9 Rule
 * 7) and returns a `Result` rather than a bare value (M12 Rule 3) —
 * see `runRepositoryOperation()` for the shared try/catch → `Result`
 * translation (M12 Rule 7).
 */
export class InMemoryUserDnaRepository implements UserDnaRepository {
  private readonly store = new Map<string, UserDNA>();

  async save(item: UserDNA): Promise<Result<void, RepositoryFailure>> {
    return runRepositoryOperation('UserDnaRepository.save', () => {
      this.store.set(item.userId, deepClone(item));
    });
  }

  async getById(id: string): Promise<Result<UserDNA | null, RepositoryFailure>> {
    return runRepositoryOperation('UserDnaRepository.getById', () => {
      const found = this.store.get(id);
      return found ? deepClone(found) : null;
    });
  }

  async getAll(): Promise<Result<UserDNA[], RepositoryFailure>> {
    return runRepositoryOperation('UserDnaRepository.getAll', () => [...this.store.values()].map((item) => deepClone(item)));
  }
}
