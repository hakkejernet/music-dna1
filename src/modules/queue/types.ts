/**
 * The three reactions the DoD names explicitly. Deliberately queue's
 * own, local vocabulary — not imported from a `feedback` module, which
 * does not exist yet (a future milestone's job, per TDS §2 "feedback").
 * Queue only needs to be able to *describe* a reaction, never interpret
 * or act on what it means.
 */
export type ReactionType = 'save' | 'reject' | 'known';

/**
 * A plain description of "the user reacted to this candidate" — never
 * persisted, never sent anywhere by Queue itself (M6 Rule 5). What
 * happens with this event (persistence, UserDNA updates) is entirely a
 * future milestone's responsibility; Queue's job ends at producing it.
 */
export interface QueueReactionEvent {
  candidateRef: string;
  trackDnaRef: string;
  reactionType: ReactionType;
}
