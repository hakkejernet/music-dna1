/** The four signal categories from PRD "User DNA" — every catalog entry belongs to exactly one. */
export type SignalCategory = 'akustisk' | 'genre' | 'kulturel' | 'struktur';

/**
 * A catalog entry — describes one signal, never a value. Owned by
 * track-dna per TDS §2 ("Eje selve TrackDNA-skemaet — den fulde katalog
 * af signaler"). Both TrackDNA and UserDNA read from the same catalog,
 * which is what lets ranking compare them directly (PRD designprincip 7,
 * "ét sprog for bruger og sang").
 */
export interface SignalDefinition {
  signalKey: string;
  category: SignalCategory;
  /** Inclusive [min, max] every value for this signal must fall within. */
  valueRange: readonly [number, number];
  description: string;
}

/** One signal's actual reading on a track or a user — a value plus how much to trust it. */
export interface SignalReading {
  value: number;
  confidence: number;
}

/** Map from signalKey (see SIGNAL_CATALOG) to its reading. Never contains keys outside the catalog. */
export type SignalVector = Record<string, SignalReading>;

/**
 * TDS §3 data model. Only the signal-vector part is populated by M1's
 * validateSignalVector() — sourceCandidateRef and enrichmentCompleteness
 * are real TrackDNA fields per TDS, but no M1 code constructs or fills
 * them; that's enrichment's job (Milestone M4), not this milestone's.
 */
export interface TrackDNA {
  trackId: string;
  signals: SignalVector;
  sourceCandidateRef: string | null;
  enrichmentCompleteness: number;
}
