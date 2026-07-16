/**
 * https://open.spotify.com/... links double as universal/app links on iOS
 * and Android (opens the Spotify app when installed, falls back to the
 * web player) and as normal links on desktop — no platform branching
 * needed. See docs/spotify-embed-research.md for why this beats a
 * spotify:// URI (which has no reliable web fallback).
 */
export const buildSpotifyTrackUrl = (spotifyTrackId: string): string => `https://open.spotify.com/track/${spotifyTrackId}`;

export const buildSpotifySearchUrl = (title: string, artist: string): string =>
  `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;
