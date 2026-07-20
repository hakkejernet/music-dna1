import { describeError, repositoryFailure } from '../domainErrors';
import type { RepositoryFailure } from '../domainErrors';
import { failure, success } from '../result';
import type { Result } from '../result';

/**
 * The one place every `InMemory*Repository` method routes its actual
 * storage operation through — this is what turns "infrastructure
 * translates technical failures into domain failures" (M12 Rule 7)
 * into a single, shared implementation instead of nine separately
 * hand-written try/catch blocks. `operation` is any synchronous piece
 * of storage logic (a `Map` read/write); whatever it throws — today
 * that's effectively nothing for an in-memory `Map`, but a real future
 * backend (IndexedDB, network) certainly could — is caught here and
 * described as a plain `RepositoryFailure`, never left as a raw,
 * technical exception for a caller to catch.
 */
export const runRepositoryOperation = <T>(operationName: string, operation: () => T): Result<T, RepositoryFailure> => {
  try {
    return success(operation());
  } catch (error) {
    return failure(repositoryFailure(operationName, describeError(error)));
  }
};
