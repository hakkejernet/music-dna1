import type { Observation, ObservationSink } from './types';

/** Deep enough for this milestone's flat Observation shapes: freezes the object itself and its one array-valued field (`providerNames`), if present. */
const freezeObservation = <T extends Observation>(observation: T): T => {
  if ('providerNames' in observation) {
    Object.freeze(observation.providerNames);
  }
  return Object.freeze(observation);
};

/**
 * The only implementation of `ObservationSink` in this milestone (M13
 * Rule 7: "ingen persistence endnu — observationer lever kun i
 * hukommelsen"). Each instance owns its own array — no module-level
 * shared store, same discipline as every `InMemory*` class in this
 * project since M9.
 *
 * Never influences anything (M13 Rule 1): every `record*` method is
 * `void`-returning and does nothing but build and store a frozen
 * snapshot — no branching on the input beyond shaping the object, no
 * call to any other module.
 */
export class InMemoryObservationSink implements ObservationSink {
  private readonly observations: Observation[] = [];

  recordRecommendationShown(
    input: { candidateRef: string; trackDnaRef: string; score: number; providerNames: readonly string[] },
    now: Date,
  ): void {
    this.observations.push(
      freezeObservation({
        type: 'RecommendationShown',
        candidateRef: input.candidateRef,
        trackDnaRef: input.trackDnaRef,
        score: input.score,
        providerNames: [...input.providerNames],
        observedAt: now.toISOString(),
      }),
    );
  }

  recordRecommendationAccepted(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.observations.push(
      freezeObservation({ type: 'RecommendationAccepted', candidateRef: input.candidateRef, trackDnaRef: input.trackDnaRef, observedAt: now.toISOString() }),
    );
  }

  recordRecommendationRejected(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.observations.push(
      freezeObservation({ type: 'RecommendationRejected', candidateRef: input.candidateRef, trackDnaRef: input.trackDnaRef, observedAt: now.toISOString() }),
    );
  }

  recordRecommendationKnown(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.observations.push(
      freezeObservation({ type: 'RecommendationKnown', candidateRef: input.candidateRef, trackDnaRef: input.trackDnaRef, observedAt: now.toISOString() }),
    );
  }

  recordLearningApplied(input: { userId: string; eventId: string; changed: boolean }, now: Date): void {
    this.observations.push(
      freezeObservation({
        type: 'LearningApplied',
        userId: input.userId,
        eventId: input.eventId,
        changed: input.changed,
        observedAt: now.toISOString(),
      }),
    );
  }

  recordCandidatePipelineMeasured(
    input: {
      userId: string;
      rawCandidateCount: number;
      deduplicatedCandidateCount: number;
      enrichedCandidateCount: number;
      finalRankedPoolSize: number;
      providerDiagnostics: readonly { providerName: string; diagnostics: Readonly<Record<string, number>> }[];
    },
    now: Date,
  ): void {
    this.observations.push(
      freezeObservation({
        type: 'CandidatePipelineMeasured',
        userId: input.userId,
        rawCandidateCount: input.rawCandidateCount,
        deduplicatedCandidateCount: input.deduplicatedCandidateCount,
        enrichedCandidateCount: input.enrichedCandidateCount,
        finalRankedPoolSize: input.finalRankedPoolSize,
        providerDiagnostics: Object.freeze(
          input.providerDiagnostics.map((entry) => Object.freeze({ providerName: entry.providerName, diagnostics: Object.freeze({ ...entry.diagnostics }) })),
        ),
        observedAt: now.toISOString(),
      }),
    );
  }

  /** Returns a fresh array copy every call — the individual `Observation`s are already frozen, but the array itself must not be a reference a caller could `push`/`splice` into. */
  getAll(): readonly Observation[] {
    return [...this.observations];
  }
}
