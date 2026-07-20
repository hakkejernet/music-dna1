/**
 * The one shared success/failure shape every fallible operation in
 * this milestone uses (M12 Rule 1) — a domain error is data to be
 * described and returned, never a thrown value. Exceptions remain
 * reserved for programming errors (e.g. a mis-wired dependency), never
 * for an expected domain outcome like "not found" or "storage failed".
 */
export interface Success<T> {
  readonly success: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly success: false;
  readonly error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;
