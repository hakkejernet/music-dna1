import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtist, SpotifyTrack } from '../spotify';

const { getTopArtists } = vi.hoisted(() => ({ getTopArtists: vi.fn<(limit?: number) => Promise<SpotifyArtist[]>>() }));
vi.mock('../spotify', () => ({ getTopArtists }));

const { getAllTracks } = vi.hoisted(() => ({ getAllTracks: vi.fn<() => Promise<SpotifyTrack[]>>() }));
vi.mock('../storage', () => ({ getAllTracks }));

const spotifyArtist = (genres: string[], popularity: number): SpotifyArtist => ({
  id: 'artist-1',
  name: 'Artist',
  genres,
  popularity,
  followers: 0,
  images: [],
});

const spotifyTrack = (explicit: boolean, durationMs: number): SpotifyTrack => ({
  id: 'track-1',
  name: 'Track',
  durationMs,
  explicit,
  popularity: 50,
  isrc: null,
  previewUrl: null,
  albumId: 'album-1',
  albumName: 'Album',
  albumImages: [],
  releaseDate: null,
  releaseDatePrecision: null,
  artists: [{ id: 'artist-1', name: 'Artist' }],
  addedAt: null,
  playlistIds: [],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('buildLibrarySnapshot — maps real Spotify + storage data into LibrarySnapshot', () => {
  it('maps top artists and saved tracks when both are available', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist(['dream pop'], 40)]);
    getAllTracks.mockResolvedValue([spotifyTrack(true, 200_000)]);

    const { buildLibrarySnapshot } = await import('./buildLibrarySnapshot');
    const snapshot = await buildLibrarySnapshot();

    expect(snapshot).toEqual({
      topArtists: [{ genres: ['dream pop'], popularity: 40 }],
      savedTracks: [{ explicit: true, durationMs: 200_000 }],
    });
  });

  it('degrades each half independently to null when empty, never throws', async () => {
    getTopArtists.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([]);

    const { buildLibrarySnapshot } = await import('./buildLibrarySnapshot');
    const snapshot = await buildLibrarySnapshot();

    expect(snapshot).toEqual({ topArtists: null, savedTracks: null });
  });

  it('degrades to null (not a thrown error) when Spotify fails but storage succeeds', async () => {
    getTopArtists.mockRejectedValue(new Error('spotify down'));
    getAllTracks.mockResolvedValue([spotifyTrack(false, 180_000)]);

    const { buildLibrarySnapshot } = await import('./buildLibrarySnapshot');
    const snapshot = await buildLibrarySnapshot();

    expect(snapshot).toEqual({ topArtists: null, savedTracks: [{ explicit: false, durationMs: 180_000 }] });
  });
});
