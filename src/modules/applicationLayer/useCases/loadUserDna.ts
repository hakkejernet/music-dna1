import type { RepositoryFailure } from '../../domainErrors';
import type { UserDnaRepository } from '../../persistence';
import type { Result } from '../../result';
import type { UserDNA } from '../../userDna';

/**
 * A thin workflow, not domain logic (M10 Rule 1/2): it does exactly one
 * thing — ask the injected repository for a `UserDNA` — and contains no
 * rule about what a `UserDNA` means or how one is built (that's M2's
 * job). The repository is a constructor-injected interface (M10 Rule
 * 4/6/8): this class never imports or names a concrete repository
 * implementation anywhere.
 *
 * Propagates the repository's `Result` exactly as received (M12 Rule
 * 4): `Success(null)` — "no UserDNA for this id" — is not turned into
 * an error here, since this use case never asserts one must exist;
 * that judgement belongs to whichever caller actually needs it to
 * (see `LearnFromReaction`). A `Failure` is returned unchanged, never
 * logged, retried, or replaced with a fallback.
 */
export class LoadUserDna {
  private readonly userDnaRepository: UserDnaRepository;

  constructor(userDnaRepository: UserDnaRepository) {
    this.userDnaRepository = userDnaRepository;
  }

  async execute(userId: string): Promise<Result<UserDNA | null, RepositoryFailure>> {
    return this.userDnaRepository.getById(userId);
  }
}
