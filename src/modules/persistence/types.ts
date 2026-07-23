import type { RepositoryFailure } from '../domainErrors';
import type { LearningEvent } from '../feedbackPipeline';
import type { RecommendationMemoryEntry } from '../recommendationMemory';
import type { Result } from '../result';
import type { TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';

/**
 * The one shape every concrete repository satisfies (M9 Rule 3) — no
 * concrete database appears anywhere in this file, only domain objects
 * (M9 Rule 2).
 *
 * Every method is async even though the in-memory implementation
 * (M9 Rule 4) could resolve synchronously — a real future backend
 * (IndexedDB) is inherently async, and M9 Rule 5 requires repositories
 * to be swappable *without* changing this contract when that swap
 * eventually happens.
 *
 * Every method returns a `Result`, never a bare value, `null`, or
 * `undefined` (M12 Rule 3) — a repository operation either succeeded
 * (with whatever value that implies, including a legitimate "nothing
 * found" for `getById`) or failed for an identifiable technical reason
 * (`RepositoryFailure`, M12 Rule 7). Note the distinction this contract
 * makes deliberately: `getById` returning `Success(null)` means "the
 * lookup succeeded, there was nothing there" — a normal outcome, not a
 * failure. Only the underlying storage operation itself breaking is a
 * `Failure`. Whether "not found" is itself a problem is a judgement
 * only the *caller* (e.g. an Application Service) can make, since only
 * it knows whether "not found" is expected here.
 */
export interface Repository<T> {
  save(item: T): Promise<Result<void, RepositoryFailure>>;
  getById(id: string): Promise<Result<T | null, RepositoryFailure>>;
  getAll(): Promise<Result<T[], RepositoryFailure>>;
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

/**
 * M29: deliberately NOT a `Repository<T>` alias — Recommendation Memory
 * needs exactly two operations (read one entry, write one entry); a
 * generic `getAll()` is never called by anything in this milestone, so
 * it is not part of this contract at all (M29 Rule 3: no convenience
 * methods beyond what's immediately required). `get`/`put` naming
 * (rather than `getById`/`save`) reflects that this is its own,
 * intentionally minimal contract, not the shared generic one — and that
 * `put()` itself carries no business rule: the M29 Rule 2 immutability
 * requirement ("ownership is permanent") is decided entirely by
 * `recommendationMemory`'s own `buildMemoryEntry()`, never here.
 */
export interface RecommendationMemoryRepository {
  get(candidateId: string): Promise<Result<RecommendationMemoryEntry | null, RepositoryFailure>>;
  put(entry: RecommendationMemoryEntry): Promise<Result<void, RepositoryFailure>>;
}
