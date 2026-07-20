import type { LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../persistence';

/**
 * Describes the system's wired-together dependencies (M11 Rule 6) —
 * not runtime state. This shape is a snapshot of "what was constructed
 * and how it's connected," produced once by `buildAppContext()`;
 * nothing in it represents a changing value (no "current user," no
 * counters, no cache) — only the object graph itself.
 */
export interface AppContext {
  repositories: {
    userDnaRepository: UserDnaRepository;
    trackDnaRepository: TrackDnaRepository;
    learningEventRepository: LearningEventRepository;
  };
  useCases: {
    loadUserDna: LoadUserDna;
    saveUserDna: SaveUserDna;
    persistLearningEvent: PersistLearningEvent;
    learnFromReaction: LearnFromReaction;
  };
}
