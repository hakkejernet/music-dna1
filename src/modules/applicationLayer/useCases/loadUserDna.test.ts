import { describe, expect, it } from 'vitest';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import { buildAppContext } from '../../infrastructure';
import type { UserDnaRepository } from '../../persistence';
import { failure, success, type Result } from '../../result';
import { validateSignalVector } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { LoadUserDna } from './loadUserDna';

const buildUserDna = (userId: string): UserDNA => ({
  userId,
  signals: validateSignalVector({}),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** A minimal, hand-rolled fake — nothing shared with `persistence`'s own implementations — proving `LoadUserDna` depends only on the interface (M10 Rule 4/6/8). */
class FakeUserDnaRepository implements UserDnaRepository {
  public getByIdCalls: string[] = [];
  private readonly fixed: UserDNA | null;
  private readonly failNextGetById: RepositoryFailure | null;

  constructor(fixed: UserDNA | null, failNextGetById: RepositoryFailure | null = null) {
    this.fixed = fixed;
    this.failNextGetById = failNextGetById;
  }

  async save(): Promise<Result<void, RepositoryFailure>> {
    throw new Error('not used in this test');
  }

  async getById(id: string): Promise<Result<UserDNA | null, RepositoryFailure>> {
    this.getByIdCalls.push(id);
    if (this.failNextGetById) return failure(this.failNextGetById);
    return success(this.fixed);
  }

  async getAll(): Promise<Result<UserDNA[], RepositoryFailure>> {
    return success(this.fixed ? [this.fixed] : []);
  }
}

describe('LoadUserDna — dependency injection (M10 Rule 4/5)', () => {
  it('delegates entirely to whatever repository was injected, calling it with the given userId', async () => {
    const fixedUserDna = buildUserDna('user-1');
    const fakeRepository = new FakeUserDnaRepository(fixedUserDna);
    const useCase = new LoadUserDna(fakeRepository);

    const result = await useCase.execute('user-1');

    expect(result).toEqual(success(fixedUserDna));
    expect(fakeRepository.getByIdCalls).toEqual(['user-1']);
  });

  it('returns Success(null) — not a failure — when the injected repository has nothing for that id (M12 Rule 3: not-found is not an error)', async () => {
    const useCase = new LoadUserDna(new FakeUserDnaRepository(null));
    expect(await useCase.execute('unknown-user')).toEqual(success(null));
  });
});

describe('LoadUserDna — error propagation (M12 Rule 4)', () => {
  it('propagates a RepositoryFailure from the injected repository unchanged, never swallowing or replacing it', async () => {
    const theFailure = repositoryFailure('UserDnaRepository.getById', 'simulated storage outage');
    const useCase = new LoadUserDna(new FakeUserDnaRepository(null, theFailure));

    expect(await useCase.execute('user-1')).toEqual(failure(theFailure));
  });
});

describe('LoadUserDna — repository swappability (M10 Rule 4, M11 Rule 4/8)', () => {
  it('behaves identically whether given a hand-rolled fake or the real repository the Composition Root wires (M11)', async () => {
    const userDna = buildUserDna('user-1');

    // The real implementation comes only from buildAppContext() — this
    // test never names InMemoryUserDnaRepository directly, matching
    // M11 Rule 4 ("Application Layer må aldrig kalde new InMemory...").
    const { repositories } = buildAppContext();
    await repositories.userDnaRepository.save(userDna);

    const fakeRepository = new FakeUserDnaRepository(userDna);

    const resultFromReal = await new LoadUserDna(repositories.userDnaRepository).execute('user-1');
    const resultFromFake = await new LoadUserDna(fakeRepository).execute('user-1');

    expect(resultFromReal).toEqual(resultFromFake);
  });
});
