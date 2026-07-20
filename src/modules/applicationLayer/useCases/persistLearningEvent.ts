import type { LearningEvent } from '../../feedbackPipeline';
import type { LearningEventRepository } from '../../persistence';

/** A thin pass-through to the injected repository — persisting a `LearningEvent` verbatim, no interpretation of it (that boundary belongs to M7's own ADR-18/19). */
export class PersistLearningEvent {
  private readonly learningEventRepository: LearningEventRepository;

  constructor(learningEventRepository: LearningEventRepository) {
    this.learningEventRepository = learningEventRepository;
  }

  async execute(learningEvent: LearningEvent): Promise<void> {
    await this.learningEventRepository.save(learningEvent);
  }
}
