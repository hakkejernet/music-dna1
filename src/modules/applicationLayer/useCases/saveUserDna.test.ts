import { describe, expect, it } from 'vitest';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import { buildAppContext } from '../../infrastructure';
import type { UserDnaRepository } from '../../persistence';
import { failure, success, type Result } from '../../result';
import { validateSignalVector } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { SaveUserDna } from './saveUserDna';

const buildUserDna = (userId: string): UserDNA => ({
  userId,
  signals: validateSignalVector({}),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

class FakeUserDnaRepository implements UserDnaRepository {
  public savedItems: UserDNA[] = [];
  private readonly failNextSave: RepositoryFailure | null;

  constructor(failNextSave: RepositoryFailure | null = null) {
    this.failNextSave = failNextSave;
  }

  async save(item: UserDNA): Promise<Result<void, RepositoryFailure>> {
    if (this.failNextSave) return failure(this.failNextSave);
    this.savedItems.push(item);
    return success(undefined);
  }

  async getById(): Promise<Result<UserDNA | null, RepositoryFailure>> {
    throw new Error('not used in this test');
  }

  async getAll(): Promise<Result<UserDNA[], RepositoryFailure>> {
    return success(this.savedItems);
  }
}

describe('SaveUserDna — dependency injection, no domain logic (M10 Rule 1/2/4)', () => {
  it('passes the given UserDNA straight through to the injected repository, unmodified', async () => {
    const fakeRepository = new FakeUserDnaRepository();
    const useCase = new SaveUserDna(fakeRepository);
    const userDna = buildUserDna('user-1');

    const result = await useCase.execute(userDna);

    expect(result).toEqual(success(undefined));
    expect(fakeRepository.savedItems).toEqual([userDna]);
  });

  it('never mutates the UserDNA it was given (M10 Rule 7)', async () => {
    const userDna = buildUserDna('user-1');
    const before = JSON.parse(JSON.stringify(userDna));

    await new SaveUserDna(new FakeUserDnaRepository()).execute(userDna);

    expect(userDna).toEqual(before);
  });
});

describe('SaveUserDna — error propagation (M12 Rule 4)', () => {
  it('propagates a RepositoryFailure unchanged, never swallowing it', async () => {
    const theFailure = repositoryFailure('UserDnaRepository.save', 'simulated storage outage');
    const useCase = new SaveUserDna(new FakeUserDnaRepository(theFailure));

    expect(await useCase.execute(buildUserDna('user-1'))).toEqual(failure(theFailure));
  });
});

describe('SaveUserDna — repository swappability (M10 Rule 4, M11 Rule 4/8)', () => {
  it('works identically against a fake and against the real repository the Composition Root wires (M11)', async () => {
    const userDna = buildUserDna('user-1');

    const fakeRepository = new FakeUserDnaRepository();
    await new SaveUserDna(fakeRepository).execute(userDna);

    // Only buildAppContext() names a concrete implementation — this
    // test never imports InMemoryUserDnaRepository directly.
    const { repositories } = buildAppContext();
    await new SaveUserDna(repositories.userDnaRepository).execute(userDna);

    expect(await repositories.userDnaRepository.getById('user-1')).toEqual(success(userDna));
    expect(fakeRepository.savedItems[0]).toEqual(userDna);
  });
});
