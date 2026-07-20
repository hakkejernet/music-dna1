import type { UserDNA } from '../../userDna';
import { deepClone } from '../deepClone';
import type { UserDnaRepository } from '../types';

/**
 * Each instance owns its own `Map` — no module-level shared store, no
 * singleton, no global state (M9 Rule 8). Constructing a second
 * instance starts with a completely empty, independent store.
 *
 * Every `save()`/`getById()`/`getAll()` defensively clones (M9 Rule
 * 7): the caller's own object is never held by reference internally,
 * and nothing handed back to a caller is the internally-held
 * reference either — mutating either side afterward can never affect
 * the other.
 */
export class InMemoryUserDnaRepository implements UserDnaRepository {
  private readonly store = new Map<string, UserDNA>();

  async save(item: UserDNA): Promise<void> {
    this.store.set(item.userId, deepClone(item));
  }

  async getById(id: string): Promise<UserDNA | null> {
    const found = this.store.get(id);
    return found ? deepClone(found) : null;
  }

  async getAll(): Promise<UserDNA[]> {
    return [...this.store.values()].map((item) => deepClone(item));
  }
}
