import { LastFmApiError } from '../lastfm';

/** Last.fm's own error code for "Rate Limit Exceeded — Your IP has made too many requests in a short period". */
const RATE_LIMIT_ERROR_CODE = 29;

/**
 * Turns a raw error caught somewhere in the Last.fm pipeline into one of
 * the fixed categories the DebugPanel shows. Read-only diagnostics — never
 * changes how the caller handles the error (still skip-and-continue).
 */
export const classifyLastFmFailure = (error: unknown): string => {
  if (error instanceof LastFmApiError) {
    return error.message.includes(`API-fejl ${RATE_LIMIT_ERROR_CODE} `) ? 'Rate limit' : 'Last.fm API fejl';
  }
  if (error instanceof TypeError) return 'Network fejl';
  if (error instanceof SyntaxError) return 'Parsing fejl';
  return 'Last.fm API fejl';
};
