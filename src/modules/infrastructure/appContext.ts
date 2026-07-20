import type { LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import type { InMemoryObservationSink } from '../observability';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../persistence';

/**
 * Describes the system's wired-together dependencies (M11 Rule 6) —
 * not runtime state. This shape is a snapshot of "what was constructed
 * and how it's connected," produced once by `buildAppContext()`;
 * nothing in it represents a changing value (no "current user," no
 * counters, no cache) — only the object graph itself.
 *
 * `observationSink` is typed as the concrete `InMemoryObservationSink`,
 * not the `ObservationSink` interface (M14 Rule 1: "Ingen andre lag må
 * kende ObservationSink" — only Application Layer's own use cases are
 * meant to know that contract). Infrastructure already legitimately
 * owns concrete implementations (M11 Rule 1), so referencing the
 * concrete class here for wiring purposes doesn't cross that line —
 * see Review Report for the full reasoning.
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
  observationSink: InMemoryObservationSink;
}
