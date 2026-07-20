import { LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import { DEFAULT_LEARNING_STRATEGIES } from '../learningEngine';
import { InMemoryObservationSink } from '../observability';
import type { AppContext } from './appContext';
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
 */
export const buildAppContext = (): AppContext => {
  const userDnaRepository = new InMemoryUserDnaRepository();
  const trackDnaRepository = new InMemoryTrackDnaRepository();
  const learningEventRepository = new InMemoryLearningEventRepository();
  const observationSink = new InMemoryObservationSink();

  return {
    repositories: { userDnaRepository, trackDnaRepository, learningEventRepository },
    useCases: {
      loadUserDna: new LoadUserDna(userDnaRepository),
      saveUserDna: new SaveUserDna(userDnaRepository),
      persistLearningEvent: new PersistLearningEvent(learningEventRepository),
      learnFromReaction: new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES, observationSink),
    },
    observationSink,
  };
};
