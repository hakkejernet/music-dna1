export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Space-separated scopes Spotify actually granted — used to detect tokens issued before a scope was added to SCOPES. */
  scope: string;
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyUser {
  id: string;
  displayName: string | null;
  email: string | null;
  images: SpotifyImage[];
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  trackCount: number;
  images: SpotifyImage[];
  snapshotId: string;
}

export interface SpotifyArtistRef {
  id: string;
  name: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  durationMs: number;
  explicit: boolean;
  popularity: number;
  isrc: string | null;
  previewUrl: string | null;
  albumId: string;
  albumName: string;
  albumImages: SpotifyImage[];
  releaseDate: string | null;
  releaseDatePrecision: 'year' | 'month' | 'day' | null;
  artists: SpotifyArtistRef[];
  addedAt: string | null;
  playlistIds: string[];
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: number;
  images: SpotifyImage[];
}
