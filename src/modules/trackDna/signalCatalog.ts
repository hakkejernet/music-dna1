import type { SignalDefinition } from './types';

/**
 * MVP signal catalog — a reduced subset of PRD's full 30-50 signals,
 * per TDS ADR-10 ("vi starter med et reduceret signal-sæt, ikke alle
 * 30-50 fra dag ét"). 19 signals, spanning all four PRD categories
 * (akustisk/genre/kulturel/struktur), so ranking has enough to
 * differentiate tracks without requiring enrichment from many sources
 * before this can be tested end to end.
 *
 * Every signal uses the same [0, 1] range for consistency in this MVP
 * set: 0 = signalet er stort set fraværende, 1 = signalet er meget
 * fremtrædende. (A bipolar signal like valence is expressed as
 * "hvor lyst/positivt" rather than a signed scale — 0 er mørkest, 1 er
 * lysest — purely to avoid mixing scales in the first version.)
 *
 * This exact list is the artifact M1's review point asks about: is
 * this the right subset to prove the mission without being too thin
 * for ranking or too wide for enrichment to cover well?
 */
export const SIGNAL_CATALOG: readonly SignalDefinition[] = [
  // --- Akustisk ---
  {
    signalKey: 'energy',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Overordnet intensitet/kraft i sangen — høj værdi lyder fysisk "meget", lav værdi lyder afdæmpet.',
  },
  {
    signalKey: 'tempo',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Opfattet hastighed — 0 er meget langsomt, 1 er meget hurtigt.',
  },
  {
    signalKey: 'valence',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Stemning fra mørk/trist (0) til lys/positiv (1) — uafhængig af energy (en sang kan være mørk og energisk på samme tid).',
  },
  {
    signalKey: 'acousticness',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Andel akustiske/organiske instrumenter frem for elektronisk/syntetisk produktion.',
  },
  {
    signalKey: 'danceability',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Hvor velegnet rytme/beat er til dans — en separat egenskab fra tempo (en langsom sang kan stadig være meget "danceable").',
  },
  {
    signalKey: 'aggressiveness',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Konfronterende/hård karakter (skrigende vokal, distortion, hård dynamik) — adskilt fra energy: en sang kan være energisk uden at være aggressiv.',
  },
  {
    signalKey: 'melodicStrength',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Hvor fremtrædende og hængende en melodisk linje er — adskilt fra danceability: en melodisk sang er ikke nødvendigvis rytmisk dansbar.',
  },
  {
    signalKey: 'instrumentalness',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Hvor stor en andel af sangen der er uden vokal — 1 er rent instrumental.',
  },
  {
    signalKey: 'vocalMale',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Tilstedeværelse af mandlig lead-vokal. Uafhængig af vocalFemale — en sang kan have begge (duet/kor).',
  },
  {
    signalKey: 'vocalFemale',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Tilstedeværelse af kvindelig lead-vokal. Uafhængig af vocalMale — en sang kan have begge (duet/kor).',
  },
  {
    signalKey: 'explicitness',
    category: 'akustisk',
    valueRange: [0, 1],
    description: 'Grad af explicit indhold (sprog/tema) — 0 er rent, 1 er tydeligt explicit.',
  },

  // --- Genre (kontinuert medlemskab, ikke ét hårdkodet label) ---
  {
    signalKey: 'pop',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Hvor tydeligt sangen passer pop-konventioner (struktur, produktion, tilgængelighed).',
  },
  {
    signalKey: 'hiphop',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Hvor tydeligt sangen passer hip-hop/rap-konventioner (flow, beat-stil, levering).',
  },
  {
    signalKey: 'trap',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Specifikt trap-undergenre-karakter (808-baslinjer, hi-hat-rytmemønstre) — adskilt fra det bredere hiphop-signal.',
  },
  {
    signalKey: 'rock',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Hvor tydeligt sangen passer rock-konventioner (bandinstrumentering, guitar-drevet).',
  },
  {
    signalKey: 'country',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Hvor tydeligt sangen passer country-konventioner (instrumentering, vokal-stil, tematik).',
  },
  {
    signalKey: 'house',
    category: 'genre',
    valueRange: [0, 1],
    description: 'Hvor tydeligt sangen passer house-konventioner (fast fire-on-the-floor-rytme, elektronisk produktion).',
  },

  // --- Kulturel ---
  {
    signalKey: 'mainstream',
    category: 'kulturel',
    valueRange: [0, 1],
    description: 'Hvor bredt kendt/populær sangen/kunstneren er — 0 er meget niche, 1 er meget mainstream.',
  },
  {
    signalKey: 'trackSimilarity',
    category: 'kulturel',
    valueRange: [0, 1],
    description: 'Hvor tæt sangen, ifølge Last.fms egen track-til-track-similaritet, matcher et spor brugeren allerede har i sit bibliotek.',
  },

  // --- Struktur ---
  {
    signalKey: 'songLength',
    category: 'struktur',
    valueRange: [0, 1],
    description: 'Normaliseret sanglængde — 0 er meget kort, 1 er meget langt (relativt til et typisk populærmusik-spænd).',
  },
] as const;
