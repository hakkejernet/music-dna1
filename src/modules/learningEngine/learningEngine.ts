import type { LearningEvent } from '../feedbackPipeline';
import { validateSignalVector, type SignalVector, type TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';
import { reactionWeight } from './reactionWeight';
import { durationLearningStrategy } from './strategies/durationLearningStrategy';
import { explicitnessLearningStrategy } from './strategies/explicitnessLearningStrategy';
import { genreLearningStrategy } from './strategies/genreLearningStrategy';
import { mainstreamLearningStrategy } from './strategies/mainstreamLearningStrategy';
import type { LearningStrategy } from './types';

/** The four strategies this milestone ships — see Review Report for why exactly these four (mirrors M5's ranking buckets, and M2's computable-signal set). */
export const DEFAULT_LEARNING_STRATEGIES: readonly LearningStrategy[] = [
  genreLearningStrategy,
  mainstreamLearningStrategy,
  explicitnessLearningStrategy,
  durationLearningStrategy,
];

/**
 * Enforces M8 Rule 6 (independence: no strategy may touch another's
 * signals) as a structural guarantee rather than a convention — two
 * strategies claiming the same signal is a wiring bug, caught
 * immediately. Run on every `learn()` call rather than once at
 * construction time, because there is no construction step here (M8
 * Rule 2: no class, no stored state) — `strategies` is a plain
 * argument, fresh every call.
 */
const assertDisjointOwnership = (strategies: readonly LearningStrategy[]): void => {
  const ownerOf = new Map<string, string>();
  for (const strategy of strategies) {
    for (const signalKey of strategy.ownedSignals) {
      const existingOwner = ownerOf.get(signalKey);
      if (existingOwner !== undefined) {
        throw new Error(
          `Signal "${signalKey}" is claimed by both "${existingOwner}" and "${strategy.strategyName}" — ` +
            'each signal must have exactly one responsible strategy (M8 Rule 6).',
        );
      }
      ownerOf.set(signalKey, strategy.strategyName);
    }
  }
};

const signalsChanged = (before: SignalVector, after: SignalVector): boolean =>
  Object.keys(after).some((key) => before[key].value !== after[key].value || before[key].confidence !== after[key].confidence);

/**
 * The engine (M8 Rule 5: orchestrates, contains no domain-specific
 * rules itself — every line here is about *combining* strategies'
 * results, never about what any signal means). A plain function, not
 * a class: there is no state to construct or hold (M8 Rule 2) —
 * `strategies` is passed fresh on every call, exactly like every other
 * argument.
 *
 * Never imports from `queue`, `rankingEngine`, `candidateProviders`, or
 * `enrichment` (M8 Rule 1) — `LearningEvent` (from `feedbackPipeline`)
 * is the one unavoidable exception, being the declared input itself;
 * see the Review Report for why that specific type reference doesn't
 * count as "knowing Feedback Pipeline" any more than M5 importing
 * `EnrichedCandidate`'s type counted as "knowing Enrichment".
 *
 * Deterministic (M8 Rule 9): no `Date.now()` anywhere — the new
 * `updatedAt` is derived from `learningEvent.recordedAt`, which is
 * itself part of the declared input, so no extra "now" parameter is
 * needed at all.
 *
 * `trackDna` may be `null` (M8 Rule 7: missing TrackDNA is normal) —
 * every strategy then sees an all-unknown signal vector
 * (`validateSignalVector({})`), which the shared learning math already
 * turns into a no-op for every signal (zero confidence ⇒ zero delta),
 * with no special-casing needed here either.
 */
export const learn = (strategies: readonly LearningStrategy[], userDna: UserDNA, learningEvent: LearningEvent, trackDna: TrackDNA | null): UserDNA => {
  assertDisjointOwnership(strategies);

  const weight = reactionWeight(learningEvent.reactionType);
  const trackSignals: SignalVector = trackDna ? trackDna.signals : validateSignalVector({});

  const nextSignals: SignalVector = { ...userDna.signals };
  for (const strategy of strategies) {
    try {
      const updates = strategy.learn(userDna.signals, trackSignals, weight);
      for (const [signalKey, reading] of Object.entries(updates)) {
        // Only a signal the strategy actually declared ownership of may
        // be recorded from it — the same defensive boundary M4's
        // EnrichmentPipeline enforces for Enrichers (Rule 6).
        if (reading === undefined || !strategy.ownedSignals.includes(signalKey)) continue;
        nextSignals[signalKey] = reading;
      }
    } catch {
      // One strategy misbehaving must never block the others (same
      // resilience discipline as M3 Rule 5 / M4 Rule 5) — its owned
      // signals simply stay as they were.
    }
  }

  const validatedSignals = validateSignalVector(nextSignals);
  const changed = signalsChanged(userDna.signals, validatedSignals);

  return {
    userId: userDna.userId,
    signals: validatedSignals,
    coldStart: changed ? false : userDna.coldStart,
    sourceLibrarySnapshotRef: userDna.sourceLibrarySnapshotRef,
    version: changed ? userDna.version + 1 : userDna.version,
    updatedAt: changed ? learningEvent.recordedAt : userDna.updatedAt,
  };
};
