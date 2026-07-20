/**
 * The defensive-copy mechanism M9 Rule 7 requires on both `save()` and
 * every read — not the persistence *serialization format* Rule 9
 * defers to a future milestone. This never produces or stores a JSON
 * string anywhere; the round-trip through `JSON.stringify`/`.parse` is
 * purely an internal deep-copy technique, safe because every current
 * domain object (`UserDNA`, `TrackDNA`, `LearningEvent`) is plain,
 * JSON-safe data with no functions, `undefined`, or cyclic references.
 */
export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
