import type { LearningEvent } from '../../feedbackPipeline';
import { learn, type LearningStrategy } from '../../learningEngine';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
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
 */
export class LearnFromReaction {
  private readonly userDnaRepository: UserDnaRepository;
  private readonly trackDnaRepository: TrackDnaRepository;
  private readonly learningEventRepository: LearningEventRepository;
  private readonly strategies: readonly LearningStrategy[];

  constructor(
    userDnaRepository: UserDnaRepository,
    trackDnaRepository: TrackDnaRepository,
    learningEventRepository: LearningEventRepository,
    strategies: readonly LearningStrategy[],
  ) {
    this.userDnaRepository = userDnaRepository;
    this.trackDnaRepository = trackDnaRepository;
    this.learningEventRepository = learningEventRepository;
    this.strategies = strategies;
  }

  /**
   * `userId` identifies whose `UserDNA` to update; `learningEvent` is
   * assumed already valid (M7's `processReactionEvent` is what
   * produces one — calling that is not this workflow's job, see
   * Review Report). If no `UserDNA` exists yet for `userId`, this
   * throws immediately rather than guessing or falling back to some
   * default (M10 Rule 9: simple propagation only, no fallback) —
   * a fresh user's cold-start `UserDNA` (M2) is expected to already
   * exist by the time any reaction can be learned from.
   *
   * A missing `TrackDNA` for the event's `trackDnaRef` is left as
   * `null` and passed straight to `learn()`, which already treats
   * that as normal (M8 Rule 7) — no special-casing needed here.
   */
  async execute(userId: string, learningEvent: LearningEvent): Promise<UserDNA> {
    const userDna = await this.userDnaRepository.getById(userId);
    if (userDna === null) {
      throw new Error(`LearnFromReaction: no UserDNA found for user "${userId}".`);
    }

    const trackDna = await this.trackDnaRepository.getById(learningEvent.trackDnaRef);

    const updatedUserDna = learn(this.strategies, userDna, learningEvent, trackDna);

    await this.userDnaRepository.save(updatedUserDna);
    await this.learningEventRepository.save(learningEvent);

    return updatedUserDna;
  }
}
