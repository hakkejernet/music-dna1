import type { UserDnaRepository } from '../../persistence';
import type { UserDNA } from '../../userDna';

/**
 * A thin workflow, not domain logic (M10 Rule 1/2): it does exactly one
 * thing — ask the injected repository for a `UserDNA` — and contains no
 * rule about what a `UserDNA` means or how one is built (that's M2's
 * job). The repository is a constructor-injected interface (M10 Rule
 * 4/6/8): this class never imports or names a concrete repository
 * implementation anywhere.
 */
export class LoadUserDna {
  private readonly userDnaRepository: UserDnaRepository;

  constructor(userDnaRepository: UserDnaRepository) {
    this.userDnaRepository = userDnaRepository;
  }

  async execute(userId: string): Promise<UserDNA | null> {
    return this.userDnaRepository.getById(userId);
  }
}
