import type { LearningEvent } from '../feedbackPipeline';

/**
 * The only place a `ReactionType`'s meaning as a *learning strength* is
 * defined (M8 Rule 8) — every strategy receives just this number, never
 * the raw reaction type, so no strategy can implement SAVE/REJECT/KNOWN
 * differently from any other.
 *
 * The parameter type is derived from `LearningEvent['reactionType']`
 * rather than importing `ReactionType` from `queue` directly — this
 * module (and everything in `learningEngine/`) never imports from
 * `queue` at all, consistent with M8 Rule 1's "must never know Queue".
 * `LearningEvent` (M7's declared output, and M8's declared input) is
 * the one unavoidable type reference; see the Review Report for why
 * that specific import doesn't count as "knowing Feedback Pipeline" any
 * more than M7 importing `ReactionType` from `queue`'s type counted as
 * "knowing Queue".
 *
 * `known` is 0 — deliberately no guessed direction or magnitude. v1's
 * own "Kendte allerede" action never touched any preference signal
 * either (it behaved identically to skipping — see Review Report);
 * there is no honest basis here for treating "the user already knew
 * this song" as evidence of liking or disliking its DNA (M8 Rule 7's
 * "never guess" principle, applied to the reaction vocabulary itself).
 */
export const reactionWeight = (reactionType: LearningEvent['reactionType']): number => {
  switch (reactionType) {
    case 'save':
      return 1;
    case 'reject':
      return -1;
    case 'known':
      return 0;
  }
};
