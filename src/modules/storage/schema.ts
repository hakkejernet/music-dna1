import type { DBSchema } from 'idb';
import type { SpotifyArtist, SpotifyPlaylist, SpotifyTrack } from '../spotify/types';

export interface SyncMeta {
  key: string;
  value: string | number;
}

export interface MusicDnaDb extends DBSchema {
  tracks: {
    key: string;
    value: SpotifyTrack;
    indexes: { 'by-album': string };
  };
  artists: {
    key: string;
    value: SpotifyArtist;
  };
  playlists: {
    key: string;
    value: SpotifyPlaylist;
  };
  meta: {
    key: string;
    value: SyncMeta;
  };
}
