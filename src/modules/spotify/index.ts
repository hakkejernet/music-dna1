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
export { SpotifyAuthError } from './client';
export type { RecommendationSeeds } from './endpoints';
export type {
  SpotifyArtist,
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from './types';
