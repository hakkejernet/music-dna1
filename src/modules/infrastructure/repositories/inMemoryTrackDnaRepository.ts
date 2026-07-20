import { deepClone } from '../deepClone';
import type { TrackDnaRepository } from '../../persistence';
import type { TrackDNA } from '../../trackDna';

/** Each instance owns its own `Map`, keyed by `trackId` — no shared or global store (M9 Rule 8). Defensive copies on every operation (M9 Rule 7), same as the other two InMemory repositories. */
export class InMemoryTrackDnaRepository implements TrackDnaRepository {
  private readonly store = new Map<string, TrackDNA>();

  async save(item: TrackDNA): Promise<void> {
    this.store.set(item.trackId, deepClone(item));
  }

  async getById(id: string): Promise<TrackDNA | null> {
    const found = this.store.get(id);
    return found ? deepClone(found) : null;
  }

  async getAll(): Promise<TrackDNA[]> {
    return [...this.store.values()].map((item) => deepClone(item));
  }
}
