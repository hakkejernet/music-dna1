import { describe, expect, it } from 'vitest';
import { describeError, learningFailure, repositoryFailure, trackDnaMissing, userDnaNotFound } from './domainErrors';

describe('domain error constructors — typed values, never strings or magic values (M12 Rule 2)', () => {
  it('userDnaNotFound() carries a discriminant and the identifying userId', () => {
    expect(userDnaNotFound('user-1')).toEqual({ type: 'UserDnaNotFound', userId: 'user-1' });
  });

  it('trackDnaMissing() carries a discriminant and the identifying trackId', () => {
    expect(trackDnaMissing('track-1')).toEqual({ type: 'TrackDnaMissing', trackId: 'track-1' });
  });

  it('repositoryFailure() carries the failed operation and a plain reason', () => {
    expect(repositoryFailure('UserDnaRepository.save', 'disk full')).toEqual({
      type: 'RepositoryFailure',
      operation: 'UserDnaRepository.save',
      reason: 'disk full',
    });
  });

  it('learningFailure() carries a discriminant and a plain reason', () => {
    expect(learningFailure('strategy misconfigured')).toEqual({ type: 'LearningFailure', reason: 'strategy misconfigured' });
  });
});

describe('describeError — translates any thrown value into a plain string (M12 Rule 7)', () => {
  it('uses the message of a real Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error thrown value rather than failing itself', () => {
    expect(describeError('a plain string throw')).toBe('a plain string throw');
    expect(describeError(42)).toBe('42');
  });
});
