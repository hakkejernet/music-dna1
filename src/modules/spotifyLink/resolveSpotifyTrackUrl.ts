import { searchTracks } from '../spotify';
import { getCachedSpotifyTrackId, setCachedSpotifyTrackId } from './cache';
import { findExactMatch } from './matching';
import { buildSpotifySearchUrl, buildSpotifyTrackUrl } from './links';

export interface SpotifyLinkResult {
  url: string;
  /** Non-null only when we're confident this is the right track (direct ID, cache hit, or an unambiguous search match). */
  spotifyTrackId: string | null;
}

/**
 * Synchronous, always-valid link — safe to use as an `<a href>` the moment
 * a card renders. Mobile Safari blocks navigation that happens after an
 * `await` following the click (it no longer counts as a user gesture), so
 * the button must always have a real href ready before the click, not one
 * set later by an async resolution. resolveSpotifyTrackUrl() upgrades this
 * to a precise track link in the background; if it resolves before the
 * user clicks, the href will already reflect it.
 */
export const getInstantSpotifyUrl = (title: string, artist: string, spotifyTrackId: string | null): string =>
  spotifyTrackId ? buildSpotifyTrackUrl(spotifyTrackId) : buildSpotifySearchUrl(title, artist);

/**
 * Resolves the best available Spotify link for a track, in order:
 * 1. Already has a real Spotify Track ID -> direct link, no API call.
 * 2. Previously resolved for this title+artist -> cached direct link, no API call.
 * 3. Spotify Search API -> unambiguous title+artist match -> cache it, direct link.
 * 4. No match (or the search failed) -> Spotify search link — still one click.
 * Never throws.
 */
export const resolveSpotifyTrackUrl = async (
  title: string,
  artist: string,
  spotifyTrackId: string | null,
): Promise<SpotifyLinkResult> => {
  if (spotifyTrackId) {
    return { url: buildSpotifyTrackUrl(spotifyTrackId), spotifyTrackId };
  }

  const cached = await getCachedSpotifyTrackId(title, artist);
  if (cached) {
    return { url: buildSpotifyTrackUrl(cached), spotifyTrackId: cached };
  }

  try {
    const candidates = await searchTracks(title, artist);
    const match = findExactMatch(candidates, title, artist);
    if (match) {
      await setCachedSpotifyTrackId(title, artist, match.id);
      return { url: buildSpotifyTrackUrl(match.id), spotifyTrackId: match.id };
    }
  } catch (error) {
    console.warn('[spotifyLink] Spotify-søgning fejlede, falder tilbage til søgelink:', error);
  }

  return { url: buildSpotifySearchUrl(title, artist), spotifyTrackId: null };
};
