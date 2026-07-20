import { LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import { DEFAULT_LEARNING_STRATEGIES } from '../learningEngine';
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
 */
export const buildAppContext = (): AppContext => {
  const userDnaRepository = new InMemoryUserDnaRepository();
  const trackDnaRepository = new InMemoryTrackDnaRepository();
  const learningEventRepository = new InMemoryLearningEventRepository();

  return {
    repositories: { userDnaRepository, trackDnaRepository, learningEventRepository },
    useCases: {
      loadUserDna: new LoadUserDna(userDnaRepository),
      saveUserDna: new SaveUserDna(userDnaRepository),
      persistLearningEvent: new PersistLearningEvent(learningEventRepository),
      learnFromReaction: new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES),
    },
  };
};
