import type { SignalReading } from '../trackDna';

/**
 * The simplest correct implementation, not a tuned model (same ethos as
 * M2's fixed cold-start confidence) — real tuning, if ever needed, is a
 * future, analytics-informed decision, not this milestone's job.
 */
const VALUE_LEARNING_RATE = 0.3;
const CONFIDENCE_LEARNING_RATE = 0.3;

/** Every signal in the current catalog shares the [0, 1] range (M1's SIGNAL_CATALOG, documented there as an explicit MVP-wide decision) — hardcoding it here rides on that same invariant, not a separate assumption. */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The one formula every `LearningStrategy` uses for every signal it
 * owns (M8 Rule 8: SAVE/REJECT/KNOWN are just different `weight`s
 * through this same math, never special-cased per strategy).
 *
 * `weight` is signed: positive moves the user's value toward the
 * track's (reinforcing), negative moves it away (opposing), and its
 * magnitude scales both the value and confidence change. When
 * `trackReading.confidence` is 0 — a missing/unknown TrackDNA signal,
 * M8 Rule 7 — both deltas are exactly zero regardless of `weight`, so
 * the reading comes back byte-identical: "skip" falls out of the
 * arithmetic itself, not a separate branch that could disagree with it.
 *
 * Both deltas carry a `(1 - userReading.confidence)` factor — a signal
 * the user's DNA is already very sure about moves *less* per additional
 * reaction than one that's still mostly a guess (TDS ADR-05's "aftagende
 * læringsrate med stigende confidence", carried over from M8's own
 * predecessor roadmap text even though no numbered M8 rule this time
 * restates it — see Review Report). Confidence only ever moves *up*
 * (toward certainty) regardless of `weight`'s sign, via
 * `Math.abs(weight)`: a strong reject is just as informative about the
 * user's taste as a strong save — both reduce uncertainty, they just
 * point in opposite directions for `value`.
 */
export const updateReading = (userReading: SignalReading, trackReading: SignalReading, weight: number): SignalReading => {
  const remainingUncertainty = 1 - userReading.confidence;
  const valueDelta = weight * trackReading.confidence * VALUE_LEARNING_RATE * remainingUncertainty * (trackReading.value - userReading.value);
  const confidenceDelta = Math.abs(weight) * trackReading.confidence * CONFIDENCE_LEARNING_RATE * remainingUncertainty;
  return {
    value: clamp01(userReading.value + valueDelta),
    confidence: clamp01(userReading.confidence + confidenceDelta),
  };
};
