import type { RepositoryFailure, UserDnaNotFound } from '../../domainErrors';
import { userDnaNotFound } from '../../domainErrors';
import type { LearningEvent } from '../../feedbackPipeline';
import { learn, type LearningStrategy } from '../../learningEngine';
import type { ObservationSink } from '../../observability';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { success, type Result } from '../../result';
import type { UserDNA } from '../../userDna';

/**
 * The main coordinating workflow (M10 Rule 1/2): loads the pieces
 * `learningEngine.learn()` (M8, imported and called exactly as-is —
 * Rule 3, never moved or modified) needs, calls it, and persists the
 * result. Every actual rule about *what* learning means lives in
 * `learn()` and its strategies; this class only sequences load → call
 * → save. All three repositories and the strategy list are
 * constructor-injected interfaces (Rule 4/5/6/8) — nothing here names
 * a concrete repository or a concrete strategy implementation.
 *
 * Never mutates `userDna` or `learningEvent` (Rule 7): the only new
 * `UserDNA` in existence after `execute()` is the one `learn()` itself
 * constructed; this class neither writes to any field on the objects
 * it receives nor before passing them onward.
 *
 * M12: every step's `Result` is checked explicitly and propagated the
 * moment it fails (Rule 4) — no logging, no retry, no recovery, no
 * fallback (Rule 6): a missing `UserDNA` becomes `Failure(UserDnaNotFound)`,
 * never a silently-fabricated default profile.
 *
 * M14: this is the one Application Service in the system that
 * integrates with `ObservationSink` (M14 Rule 1) — it is the only use
 * case that already knows, at the moment it succeeds, both which
 * reaction happened and whether learning actually changed anything.
 * Observations are recorded only after every domain step has already
 * succeeded (Rule 4), and only best-effort (Rule 5/ADR-32): a failure
 * recording an observation is caught and discarded, never allowed to
 * change this method's own `Result`.
 */
export class LearnFromReaction {
  private readonly userDnaRepository: UserDnaRepository;
  private readonly trackDnaRepository: TrackDnaRepository;
  private readonly learningEventRepository: LearningEventRepository;
  private readonly strategies: readonly LearningStrategy[];
  private readonly observationSink: ObservationSink;

  constructor(
    userDnaRepository: UserDnaRepository,
    trackDnaRepository: TrackDnaRepository,
    learningEventRepository: LearningEventRepository,
    strategies: readonly LearningStrategy[],
    observationSink: ObservationSink,
  ) {
    this.userDnaRepository = userDnaRepository;
    this.trackDnaRepository = trackDnaRepository;
    this.learningEventRepository = learningEventRepository;
    this.strategies = strategies;
    this.observationSink = observationSink;
  }

  /**
   * `userId` identifies whose `UserDNA` to update; `learningEvent` is
   * assumed already valid (M7's `processReactionEvent` is what
   * produces one — calling that is not this workflow's job, see
   * Review Report).
   *
   * If no `UserDNA` exists yet for `userId`, this returns
   * `Failure(UserDnaNotFound)` — a real, expected domain outcome, not
   * a thrown exception (M12 Rule 1: exceptions are for programming
   * errors only) and not a fabricated default profile (M12 Rule 6).
   *
   * A missing `TrackDNA` for the event's `trackDnaRef` is left as
   * `null` and passed straight to `learn()`, which already treats
   * that as normal (M8 Rule 7, still unchanged and binding) — it is
   * deliberately *not* turned into a `TrackDnaMissing` failure here,
   * since that would contradict M8's own rule about what "missing" means.
   */
  async execute(userId: string, learningEvent: LearningEvent): Promise<Result<UserDNA, UserDnaNotFound | RepositoryFailure>> {
    const userDnaResult = await this.userDnaRepository.getById(userId);
    if (!userDnaResult.success) return userDnaResult;

    if (userDnaResult.value === null) {
      return { success: false, error: userDnaNotFound(userId) };
    }
    const userDna = userDnaResult.value;

    const trackDnaResult = await this.trackDnaRepository.getById(learningEvent.trackDnaRef);
    if (!trackDnaResult.success) return trackDnaResult;
    const trackDna = trackDnaResult.value;

    const updatedUserDna = learn(this.strategies, userDna, learningEvent, trackDna);

    const saveUserDnaResult = await this.userDnaRepository.save(updatedUserDna);
    if (!saveUserDnaResult.success) return saveUserDnaResult;

    const saveEventResult = await this.learningEventRepository.save(learningEvent);
    if (!saveEventResult.success) return saveEventResult;

    // Everything the use case itself needed to do has already
    // succeeded — only now, after the fact, does it describe what
    // happened to Observability (M14 Rule 4). `changed` mirrors
    // learningEngine's own no-op detection (M8): version only
    // increments when a signal actually moved, so this needs no new
    // knowledge learn() doesn't already expose.
    this.recordObservations(userId, learningEvent, userDna.version !== updatedUserDna.version);

    return success(updatedUserDna);
  }

  /** Best-effort, by construction (M14 Rule 5/ADR-32): each call is isolated so a failure recording one observation can never suppress the other, and no failure here can ever reach `execute()`'s own return value. */
  private recordObservations(userId: string, learningEvent: LearningEvent, changed: boolean): void {
    const now = new Date(learningEvent.recordedAt);
    const candidateRef = learningEvent.candidateRef;
    const trackDnaRef = learningEvent.trackDnaRef;

    this.recordSafely(() => {
      switch (learningEvent.reactionType) {
        case 'save':
          this.observationSink.recordRecommendationAccepted({ candidateRef, trackDnaRef }, now);
          break;
        case 'reject':
          this.observationSink.recordRecommendationRejected({ candidateRef, trackDnaRef }, now);
          break;
        case 'known':
          this.observationSink.recordRecommendationKnown({ candidateRef, trackDnaRef }, now);
          break;
      }
    });

    this.recordSafely(() => {
      this.observationSink.recordLearningApplied({ userId, eventId: learningEvent.eventId, changed }, now);
    });
  }

  private recordSafely(action: () => void): void {
    try {
      action();
    } catch {
      // Observability is best effort (M14 Rule 5, ADR-32) — a failure
      // here describes nothing about whether the use case itself
      // succeeded, so it is deliberately discarded, never rethrown,
      // never turned into part of this method's Result.
    }
  }
}
