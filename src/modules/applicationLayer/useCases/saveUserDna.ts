import type { RepositoryFailure } from '../../domainErrors';
import type { UserDnaRepository } from '../../persistence';
import type { Result } from '../../result';
import type { UserDNA } from '../../userDna';

/** Symmetric with `LoadUserDna` — a thin pass-through to the injected repository, no domain logic (M10 Rule 1/2), propagating its `Result` unchanged (M12 Rule 4). */
export class SaveUserDna {
  private readonly userDnaRepository: UserDnaRepository;

  constructor(userDnaRepository: UserDnaRepository) {
    this.userDnaRepository = userDnaRepository;
  }

  async execute(userDna: UserDNA): Promise<Result<void, RepositoryFailure>> {
    return this.userDnaRepository.save(userDna);
  }
}
