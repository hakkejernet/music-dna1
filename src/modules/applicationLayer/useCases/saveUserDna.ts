import type { UserDnaRepository } from '../../persistence';
import type { UserDNA } from '../../userDna';

/** Symmetric with `LoadUserDna` — a thin pass-through to the injected repository, no domain logic (M10 Rule 1/2). */
export class SaveUserDna {
  private readonly userDnaRepository: UserDnaRepository;

  constructor(userDnaRepository: UserDnaRepository) {
    this.userDnaRepository = userDnaRepository;
  }

  async execute(userDna: UserDNA): Promise<void> {
    await this.userDnaRepository.save(userDna);
  }
}
