/**
 * Recursively freezes an object graph so that any attempt by an enricher
 * to mutate the Candidate it was given fails structurally (throws in
 * strict mode, silently no-ops otherwise) rather than relying on every
 * enricher simply choosing not to mutate it. This is what makes M4 Rule
 * 1's immutability requirement a guarantee, not a convention.
 */
export const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};
