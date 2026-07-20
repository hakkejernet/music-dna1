import type { SignalVector } from '../../trackDna';
import { updateReading } from '../learningMath';
import type { LearningStrategy } from '../types';

/** Owns exactly `songLength` — nothing about genre, mainstream, or explicitness (M8 Rule 6). */
export const durationLearningStrategy: LearningStrategy = {
  strategyName: 'DurationLearningStrategy',
  ownedSignals: ['songLength'],

  learn(userSignals: SignalVector, trackSignals: SignalVector, weight: number): Partial<SignalVector> {
    return { songLength: updateReading(userSignals.songLength, trackSignals.songLength, weight) };
  },
};
