import type { SignalVector } from '../trackDna';

/**
 * The only way any signal may change (M8 Rule 4: no signal changed
 * directly, only through a named strategy). A strategy owns a
 * disjoint set of signals (M8 Rule 6: independence — genre never
 * knows mainstream exists, and vice versa) and returns updates for
 * *only* those signals; `learn()` (the engine) discards anything a
 * strategy returns outside its own declared ownership, the same
 * defensive boundary M4's EnrichmentPipeline enforces for Enrichers.
 *
 * A plain object, not a class with a constructor — there is nothing
 * for a strategy to hold as state (M8 Rule 2): `learn` is a pure
 * function of exactly its three arguments.
 *
 * `weight` is a signed number (see `reactionWeight.ts`), never the raw
 * `ReactionType` (M8 Rule 8): a strategy has no way to special-case
 * SAVE/REJECT/KNOWN even if it wanted to, because it never sees the
 * distinction — only "how strongly, and in which direction."
 */
export interface LearningStrategy {
  readonly strategyName: string;
  readonly ownedSignals: readonly string[];
  learn(userSignals: SignalVector, trackSignals: SignalVector, weight: number): Partial<SignalVector>;
}
