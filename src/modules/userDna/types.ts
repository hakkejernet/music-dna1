import type { SignalVector } from '../trackDna';

/**
 * TDS §3 data model. user-dna owns this schema (TDS §2: "Eje
 * UserDNA-skemaet"), but the *behavior* that fills it in —
 * cold-start-beregning fra Spotify-biblioteket, og løbende opdatering
 * fra feedback — is explicitly out of scope for this milestone
 * (Milestone M2 og M8 i docs/IMPLEMENTATION_ROADMAP.md). Only the
 * shape exists here; nothing in this module constructs one yet.
 */
export interface UserDNA {
  userId: string;
  signals: SignalVector;
  /** True until the first real FeedbackEvent has been incorporated — set/cleared by M8, not by anything in this module. */
  coldStart: boolean;
  sourceLibrarySnapshotRef: string | null;
  version: number;
  updatedAt: string;
}
