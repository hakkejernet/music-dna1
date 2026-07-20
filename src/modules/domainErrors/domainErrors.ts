import type { LearningFailure, RepositoryFailure, TrackDnaMissing, UserDnaNotFound } from './types';

export const userDnaNotFound = (userId: string): UserDnaNotFound => ({ type: 'UserDnaNotFound', userId });

export const trackDnaMissing = (trackId: string): TrackDnaMissing => ({ type: 'TrackDnaMissing', trackId });

export const repositoryFailure = (operation: string, reason: string): RepositoryFailure => ({ type: 'RepositoryFailure', operation, reason });

export const learningFailure = (reason: string): LearningFailure => ({ type: 'LearningFailure', reason });

/** M12 Rule 7: infrastructure translates a technical failure into a plain, readable reason — never the raw error object, never a stack trace. */
export const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
