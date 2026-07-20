import type { LearningEvent } from '../feedbackPipeline';
import type { TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';

/**
 * The one shape every concrete repository satisfies (M9 Rule 3) — no
 * concrete database appears anywhere in this file, only domain objects
 * (M9 Rule 2).
 *
 * Every method is async even though M9's own implementation (Rule 4,
 * in-memory) could resolve synchronously — a real future backend
 * (IndexedDB) is inherently async, and Rule 5 requires repositories to
 * be swappable *without* changing this contract when that swap
 * eventually happens. Getting the contract's shape right now avoids a
 * breaking change to every caller later.
 */
export interface Repository<T> {
  save(item: T): Promise<void>;
  getById(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
}

/** Keyed by `UserDNA`'s own `userId`. */
export type UserDnaRepository = Repository<UserDNA>;

/**
 * Keyed by `LearningEvent`'s own `eventId`. `LearningEvent` (M7) does
 * not carry a `userId` — there is currently no way to scope "all
 * events for this user" at the repository level. See Review Report.
 */
export type LearningEventRepository = Repository<LearningEvent>;

/** Keyed by `TrackDNA`'s own `trackId`. Built per Rule 2's own "TrackDNA (hvis nødvendigt)" — see Review Report for why it's included now rather than deferred. */
export type TrackDnaRepository = Repository<TrackDNA>;
