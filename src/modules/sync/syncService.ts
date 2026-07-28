import { getArtistsByIds, getPlaylistTracks, getUserPlaylists } from '../spotify';
import type { SpotifyTrack } from '../spotify/types';
import { setMeta, upsertArtists, upsertPlaylists, upsertTracks } from '../storage';

export interface SyncProgress {
  stage: 'playlists' | 'tracks' | 'artists' | 'done';
  message: string;
  completed: number;
  total: number;
}

const noop = () => {};

export const runFullSync = async (
  onProgress: (progress: SyncProgress) => void = noop,
): Promise<void> => {
  onProgress({ stage: 'playlists', message: 'Henter dine playlister...', completed: 0, total: 1 });
  const playlists = await getUserPlaylists();
  await upsertPlaylists(playlists);
  onProgress({
    stage: 'playlists',
    message: `${playlists.length} playlister fundet`,
    completed: 1,
    total: 1,
  });

  const allTracks: SpotifyTrack[] = [];
  for (let i = 0; i < playlists.length; i += 1) {
    const playlist = playlists[i];
    onProgress({
      stage: 'tracks',
      message: `Analyserer "${playlist.name}"...`,
      completed: i,
      total: playlists.length,
    });
    const tracks = await getPlaylistTracks(playlist.id);
    allTracks.push(...tracks);
    await upsertTracks(tracks);
  }
  onProgress({
    stage: 'tracks',
    message: `${allTracks.length} sange gemt lokalt`,
    completed: playlists.length,
    total: playlists.length,
  });

  const artistIds = allTracks.flatMap((track) => track.artists.map((artist) => artist.id));
  onProgress({
    stage: 'artists',
    message: 'Henter kunstner-genrer...',
    completed: 0,
    total: 1,
  });
  const artists = await getArtistsByIds(artistIds);
  await upsertArtists(artists);

  await setMeta('lastSyncedAt', Date.now());
  onProgress({ stage: 'done', message: 'Færdig!', completed: 1, total: 1 });
};
