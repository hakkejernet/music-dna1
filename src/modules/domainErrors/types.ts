/**
 * Domain-specific, typed error values (M12 Rule 2) — never a bare
 * string, never a magic sentinel value. Each carries exactly the
 * identifying context needed to explain what happened, nothing more.
 */
export interface UserDnaNotFound {
  readonly type: 'UserDnaNotFound';
  readonly userId: string;
}

/**
 * Defined per M12 Rule 2's own example, but not currently produced
 * anywhere in this milestone's code — M8 Rule 7 ("manglende TrackDNA
 * er normal tilstand") is still binding and unchanged (M12 Rule 5/10),
 * so `LearnFromReaction`'s own TrackDNA lookup deliberately does not
 * turn a missing TrackDNA into this error. This type exists for a
 * future workflow that genuinely requires a TrackDNA to exist — see
 * Review Report.
 */
export interface TrackDnaMissing {
  readonly type: 'TrackDnaMissing';
  readonly trackId: string;
}

/**
 * What Infrastructure translates a technical failure into (M12 Rule 7)
 * — `reason` is a plain, human-readable description of the underlying
 * problem, never the raw technical error object itself (no stack
 * traces, no browser/HTTP error types leaking into the domain).
 */
export interface RepositoryFailure {
  readonly type: 'RepositoryFailure';
  readonly operation: string;
  readonly reason: string;
}

/**
 * Defined per M12 Rule 2's own example. Like `TrackDnaMissing`, not
 * currently produced anywhere: `learningEngine.learn()` is unchanged
 * (M12 Rule 5) and remains a pure function that, given valid input,
 * always succeeds — there is no domain scenario in the current system
 * where "learning" itself fails. Reserved for a future scenario where
 * one legitimately could.
 */
export interface LearningFailure {
  readonly type: 'LearningFailure';
  readonly reason: string;
}

export type DomainError = UserDnaNotFound | TrackDnaMissing | RepositoryFailure | LearningFailure;
