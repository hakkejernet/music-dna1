export { buildAuthorizeUrl, getGrantedScopes, getValidAccessToken, handleAuthCallback, isAuthenticated, logout } from './auth';
export {
  getArtistsByIds,
  getCurrentUser,
  getPlaylistTracks,
  getRecommendedTracks,
  getTopArtists,
  getUserPlaylists,
  searchTracks,
} from './endpoints';
// getSpotifyRequestLog/SpotifyRequestDiagnostics are TEMPORARY
// (Concern B 403 investigation only) — see client.ts.
export { getSpotifyRequestLog, SpotifyAuthError } from './client';
export type { RecommendationSeeds } from './endpoints';
export type { SpotifyRequestDiagnostics } from './client';
export type {
  SpotifyArtist,
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from './types';
