import type { Failure, Result, Success } from './types';

export const success = <T>(value: T): Success<T> => ({ success: true, value });

export const failure = <E>(error: E): Failure<E> => ({ success: false, error });

/** A type guard, not a domain rule — useful for narrowing a `Result` without repeating `.success` checks by hand. */
export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => result.success;

export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => !result.success;
