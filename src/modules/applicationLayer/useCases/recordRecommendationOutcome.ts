import type { RepositoryFailure } from '../../domainErrors';
import type { RecommendationMemoryRepository } from '../../persistence';
import { buildMemoryEntry, type RecommendationOutcome } from '../../recommendationMemory';
import { success, type Result } from '../../result';

/**
 * M29: the write side of Recommendation Memory. Reads the existing entry
 * (if any), lets `buildMemoryEntry` decide the next state — including
 * whether to write at all, since ownership (a `save` outcome) is
 * immutable (M29 Rule 2) — and persists the result.
 *
 * Deliberately independent of `LearnFromReaction`/`learn()`/UserDNA
 * (M29 Rule 1): this class touches only `RecommendationMemoryRepository`,
 * never `UserDnaRepository` or `TrackDnaRepository`. `now` is an explicit
 * parameter, never sampled internally (M29 Rule 3).
 */
export class RecordRecommendationOutcome {
  private readonly recommendationMemoryRepository: RecommendationMemoryRepository;

  constructor(recommendationMemoryRepository: RecommendationMemoryRepository) {
    this.recommendationMemoryRepository = recommendationMemoryRepository;
  }

  async execute(candidateId: string, outcome: RecommendationOutcome, now: Date): Promise<Result<void, RepositoryFailure>> {
    const existingResult = await this.recommendationMemoryRepository.get(candidateId);
    if (!existingResult.success) return existingResult;

    const entry = buildMemoryEntry(existingResult.value, candidateId, outcome, now);
    if (entry === null) return success(undefined);

    return this.recommendationMemoryRepository.put(entry);
  }
}
