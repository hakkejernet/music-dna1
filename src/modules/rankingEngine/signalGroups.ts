/**
 * The exact catalog-signal membership of each score-breakdown bucket
 * from the M5 instruction's own example. This is a deliberately narrow
 * subset of SIGNAL_CATALOG's 19 signals — see the Review Report for why
 * these 9 (not all 19) are what M5 scores.
 */
export const SIGNAL_GROUPS = {
  genreMatch: ['pop', 'hiphop', 'trap', 'rock', 'country', 'house'],
  mainstreamMatch: ['mainstream'],
  explicitMatch: ['explicitness'],
  durationMatch: ['songLength'],
} as const;

export type ScoreBreakdownKey = keyof typeof SIGNAL_GROUPS;

export const SCORE_BREAKDOWN_KEYS: readonly ScoreBreakdownKey[] = Object.keys(SIGNAL_GROUPS) as ScoreBreakdownKey[];
