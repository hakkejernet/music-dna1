import type { SignalVector } from '../../trackDna';
import { updateReading } from '../learningMath';
import type { LearningStrategy } from '../types';

/** Owns exactly `explicitness` — nothing about genre, mainstream, or duration (M8 Rule 6). */
export const explicitnessLearningStrategy: LearningStrategy = {
  strategyName: 'ExplicitnessLearningStrategy',
  ownedSignals: ['explicitness'],

  learn(userSignals: SignalVector, trackSignals: SignalVector, weight: number): Partial<SignalVector> {
    return { explicitness: updateReading(userSignals.explicitness, trackSignals.explicitness, weight) };
  },
};
