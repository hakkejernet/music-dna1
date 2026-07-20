import type { SignalVector } from '../../trackDna';
import { updateReading } from '../learningMath';
import type { LearningStrategy } from '../types';

const GENRE_SIGNALS = ['pop', 'hiphop', 'trap', 'rock', 'country', 'house'] as const;

/**
 * Owns exactly the 6 genre signals — nothing else. Never reads or
 * returns anything about mainstream, explicitness, or duration (M8
 * Rule 6: independence). A thin, one-line-per-signal wrapper around
 * the shared math (M8 Rule 5: strategies learn, they don't reinvent
 * the arithmetic).
 */
export const genreLearningStrategy: LearningStrategy = {
  strategyName: 'GenreLearningStrategy',
  ownedSignals: GENRE_SIGNALS,

  learn(userSignals: SignalVector, trackSignals: SignalVector, weight: number): Partial<SignalVector> {
    const updates: Partial<SignalVector> = {};
    for (const signalKey of GENRE_SIGNALS) {
      updates[signalKey] = updateReading(userSignals[signalKey], trackSignals[signalKey], weight);
    }
    return updates;
  },
};
