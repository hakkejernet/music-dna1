import { BuildDiscoveryQueue, LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import { CandidateAggregator } from '../candidateProviders';
import { EnrichmentPipeline, explicitMetadataEnricher, tagBasedEnricher } from '../enrichment';
import { DEFAULT_LEARNING_STRATEGIES } from '../learningEngine';
import { InMemoryObservationSink } from '../observability';
import { RuleBasedRankingEngine } from '../rankingEngine';
import type { AppContext } from './appContext';
import { LastFmCandidateProvider } from './providers/lastFmCandidateProvider';
import { InMemoryLearningEventRepository } from './repositories/inMemoryLearningEventRepository';
import { InMemoryTrackDnaRepository } from './repositories/inMemoryTrackDnaRepository';
import { InMemoryUserDnaRepository } from './repositories/inMemoryUserDnaRepository';

/**
 * The only function in the system allowed to write `new InMemory...`
 * (M11 Rule 3) — every other module receives its dependencies already
 * built, through interfaces (Rule 4/5). Contains nothing but
 * construction and wiring (Rule 8): no domain logic, no persistence
 * logic, not even a conditional.
 *
 * Returns a fresh `AppContext` on every call — no module-level cache,
 * no singleton (Rule 5): calling this twice produces two fully
 * independent object graphs, each with its own, separate in-memory
 * stores.
 *
 * M14: constructs the one `InMemoryObservationSink` and injects it
 * into `LearnFromReaction` — the only Application Service that
 * integrates with Observability (M14 Rule 1). This file imports the
 * *concrete* `InMemoryObservationSink` (infrastructure already owns
 * concrete implementations, M11 Rule 1) but never the `ObservationSink`
 * *interface* itself — that contract stays known only to
 * `applicationLayer/` (verified by `src/architecture.test.ts`).
 *
 * Product Sprint 1: also constructs the one real `LastFmCandidateProvider`
 * (the first, and only, concrete `CandidateProvider` in the system),
 * wraps it in a `CandidateAggregator` of one, and wires a real
 * `EnrichmentPipeline` (the same two enrichers M4 shipped, unmodified)
 * and `RuleBasedRankingEngine` (M5, unmodified) into the new
 * `BuildDiscoveryQueue` use case — same construction-only role as
 * everything else in this function (Rule 8), nothing new here changes
 * that discipline.
 */
export const buildAppContext = (): AppContext => {
  const userDnaRepository = new InMemoryUserDnaRepository();
  const trackDnaRepository = new InMemoryTrackDnaRepository();
  const learningEventRepository = new InMemoryLearningEventRepository();
  const observationSink = new InMemoryObservationSink();

  const candidateAggregator = new CandidateAggregator([new LastFmCandidateProvider()]);
  const enrichmentPipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);
  const rankingEngine = new RuleBasedRankingEngine();

  return {
    repositories: { userDnaRepository, trackDnaRepository, learningEventRepository },
    useCases: {
      loadUserDna: new LoadUserDna(userDnaRepository),
      saveUserDna: new SaveUserDna(userDnaRepository),
      persistLearningEvent: new PersistLearningEvent(learningEventRepository),
      learnFromReaction: new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES, observationSink),
      buildDiscoveryQueue: new BuildDiscoveryQueue(userDnaRepository, trackDnaRepository, candidateAggregator, enrichmentPipeline, rankingEngine),
    },
    observationSink,
  };
};
