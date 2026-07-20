import type { SignalVector } from '../../trackDna';
import { updateReading } from '../learningMath';
import type { LearningStrategy } from '../types';

/** Owns exactly `mainstream` — nothing about genre, explicitness, or duration (M8 Rule 6). */
export const mainstreamLearningStrategy: LearningStrategy = {
  strategyName: 'MainstreamLearningStrategy',
  ownedSignals: ['mainstream'],

  learn(userSignals: SignalVector, trackSignals: SignalVector, weight: number): Partial<SignalVector> {
    return { mainstream: updateReading(userSignals.mainstream, trackSignals.mainstream, weight) };
  },
};
