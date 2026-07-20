import type { RepositoryFailure } from '../../domainErrors';
import type { LearningEvent } from '../../feedbackPipeline';
import type { LearningEventRepository } from '../../persistence';
import type { Result } from '../../result';

/** A thin pass-through to the injected repository — persisting a `LearningEvent` verbatim, no interpretation of it (that boundary belongs to M7's own ADR-18/19), propagating its `Result` unchanged (M12 Rule 4). */
export class PersistLearningEvent {
  private readonly learningEventRepository: LearningEventRepository;

  constructor(learningEventRepository: LearningEventRepository) {
    this.learningEventRepository = learningEventRepository;
  }

  async execute(learningEvent: LearningEvent): Promise<Result<void, RepositoryFailure>> {
    return this.learningEventRepository.save(learningEvent);
  }
}
