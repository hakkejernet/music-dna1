import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastFmSimilarArtist, LastFmTrack } from '../lastfm';
import type { PreferenceProfile } from '../preferences/types';
import type { UserProfile } from './types';

/**
 * M15 integration tests for the v1 Discovery pipeline: `loadRecommendationQueue()`
 * → `getConfiguredProviders()` (real, unmocked — production wiring) →
 * `LastFmRecommendationProvider` (real, unmocked business logic) → `SimpleRanker`
 * (real, unmocked) → `modules/diagnostics` (real, unmocked — this app's
 * equivalent of "Observability" for this milestone's Rule 6). Only the true
 * network boundary (`../lastfm`'s two endpoint functions) and the
 * Spotify/IndexedDB-dependent inputs (`buildUserProfile`, `getSavedTrackIds`,
 * `buildPreferenceProfile`) are mocked — everything that actually decides
 * *what a real candidate looks like* and *how it gets ranked* runs for real.
 */
const { getSimilarArtists, getTopTracksForArtist } = vi.hoisted(() => ({
  getSimilarArtists: vi.fn<(artistName: string) => Promise<LastFmSimilarArtist[]>>(),
  getTopTracksForArtist: vi.fn<(artistName: string) => Promise<LastFmTrack[]>>(),
}));
// classifyLastFmFailure (modules/diagnostics) imports the real LastFmApiError
// class from this same module to classify a caught error — re-export the
// real class alongside the two mocked endpoint functions so that path keeps
// working exactly as in production.
vi.mock('../lastfm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lastfm')>();
  return { ...actual, getSimilarArtists, getTopTracksForArtist };
});

const { buildUserProfile } = vi.hoisted(() => ({ buildUserProfile: vi.fn<() => Promise<UserProfile>>() }));
vi.mock('./userProfile', () => ({ buildUserProfile }));

const { getSavedTrackIds } = vi.hoisted(() => ({ getSavedTrackIds: vi.fn<() => Promise<Set<string>>>() }));
vi.mock('../history', () => ({ getSavedTrackIds }));

const { buildPreferenceProfile } = vi.hoisted(() => ({ buildPreferenceProfile: vi.fn<() => Promise<PreferenceProfile>>() }));
vi.mock('../preferences', () => ({ buildPreferenceProfile }));

const EMPTY_PREFERENCES: PreferenceProfile = {
  favoriteGenres: [],
  avoidedGenres: [],
  favoriteArtistIds: [],
  favoriteDecades: [],
  favoriteSources: [],
  avoidedSources: [],
  topRejectionReasons: [],
};

const buildProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'user-1',
  seedArtistIds: [],
  seedArtistNames: ['Radiohead'],
  seedTrackIds: [],
  seedGenres: [],
  libraryArtistIds: [],
  libraryTrackIds: [],
  ...overrides,
});

const similarArtist = (name: string, match: number): LastFmSimilarArtist => ({
  name,
  mbid: null,
  match,
  url: `https://last.fm/music/${name}`,
});

const lastFmTrack = (id: string, name: string, artistName: string, playcount: number): LastFmTrack => ({
  id,
  name,
  artistName,
  artistMbid: null,
  playcount,
  listeners: playcount,
  url: `https://last.fm/music/${artistName}/_/${name}`,
  images: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  buildUserProfile.mockResolvedValue(buildProfile());
  getSavedTrackIds.mockResolvedValue(new Set());
  buildPreferenceProfile.mockResolvedValue(EMPTY_PREFERENCES);
});

describe('loadRecommendationQueue — real candidates flow through the real, unmocked pipeline (M15 Rule 2/8)', () => {
  it('fetches real candidates via the production-configured LastFmRecommendationProvider and ranks them with the unmodified SimpleRanker', async () => {
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9), similarArtist('Bon Iver', 0.8)]);
    getTopTracksForArtist.mockImplementation(async (artistName: string) => {
      if (artistName === 'Sigur Ros') return [lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)];
      if (artistName === 'Bon Iver') return [lastFmTrack('track-skinny', 'Skinny Love', 'Bon Iver', 800_000)];
      return [];
    });
    // One of the two tracks is already in the user's synced library —
    // proves SimpleRanker's own, untouched penalty rule still fires on
    // real provider output, not just on test fixtures built for M5.
    buildUserProfile.mockResolvedValue(buildProfile({ libraryTrackIds: ['track-skinny'] }));

    const { loadRecommendationQueue } = await import('./loadRecommendationQueue');
    const queue = await loadRecommendationQueue();

    expect(queue.size).toBe(2);
    const first = queue.current();
    const second = queue.advance();

    // Real data, not fabricated: both tracks came straight out of the
    // mocked Last.fm responses above, identified by their real ids.
    expect(first?.track.id).toBe('track-svefn');
    expect(first?.source).toBe('lastfm');
    expect(second?.track.id).toBe('track-skinny');

    // Ranking (SimpleRanker, unchanged — M15 Rule 4 applied to this
    // track's analogue) still applies its own rules: a new artist earns a
    // bonus, an already-owned track earns a penalty, and the queue is
    // still sorted by finalScore descending — exactly as M5 proved on
    // fixtures, now proven on real candidates.
    expect(first?.explanations).toContain('Ny kunstner');
    expect(second?.explanations).toContain('Allerede i dit bibliotek');
    expect(first?.finalScore).toBeGreaterThan(second?.finalScore ?? Number.POSITIVE_INFINITY);
  });

  it('records normal observations in modules/diagnostics — this app\'s Observability equivalent (M15 Rule 6)', async () => {
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9), similarArtist('Bon Iver', 0.8)]);
    getTopTracksForArtist.mockImplementation(async (artistName: string) => {
      if (artistName === 'Sigur Ros') return [lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)];
      if (artistName === 'Bon Iver') return [lastFmTrack('track-skinny', 'Skinny Love', 'Bon Iver', 800_000)];
      return [];
    });

    const { loadRecommendationQueue } = await import('./loadRecommendationQueue');
    const { getRecommendationDiagnostics } = await import('../diagnostics');
    await loadRecommendationQueue();

    const diagnostics = getRecommendationDiagnostics();
    expect(diagnostics.queue).toEqual({ beforeRanking: 2, afterRanking: 2, inQueue: 2, source: 'lastfm' });
    expect(diagnostics.fallbackReason).toBeNull();
    expect(diagnostics.lastfm.apiCallMade).toBe(true);
    expect(diagnostics.lastfm.similarArtistsFound).toBe(2);
    expect(diagnostics.lastfm.topTracksFound).toBe(2);
    expect(diagnostics.lastfm.recommendationsBuilt).toBe(2);
    expect(diagnostics.lastfm.error).toBeNull();
    expect(diagnostics.topRecommendations).toEqual(['Svefn-g-englar — Sigur Ros', 'Skinny Love — Bon Iver']);
  });
});

describe('loadRecommendationQueue — a real provider producing nothing yields an empty queue, never fabricated data (M15 Rule 7)', () => {
  it('returns an empty queue when the user has no seed artists to look up', async () => {
    buildUserProfile.mockResolvedValue(buildProfile({ seedArtistNames: [] }));

    const { loadRecommendationQueue } = await import('./loadRecommendationQueue');
    const { getRecommendationDiagnostics } = await import('../diagnostics');
    const queue = await loadRecommendationQueue();

    expect(queue.isEmpty()).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.current()).toBeNull();

    const diagnostics = getRecommendationDiagnostics();
    expect(diagnostics.queue?.source).toBe('empty');
    expect(diagnostics.fallbackReason).not.toBeNull();
    expect(getSimilarArtists).not.toHaveBeenCalled();
  });

  it('returns an empty queue — with the real failure recorded in diagnostics — when Last.fm itself fails, never mock recommendations', async () => {
    getSimilarArtists.mockRejectedValue(new Error('network down'));

    const { loadRecommendationQueue } = await import('./loadRecommendationQueue');
    const { getRecommendationDiagnostics } = await import('../diagnostics');
    const queue = await loadRecommendationQueue();

    expect(queue.isEmpty()).toBe(true);
    expect(queue.size).toBe(0);

    const diagnostics = getRecommendationDiagnostics();
    expect(diagnostics.queue?.source).toBe('empty');
    expect(diagnostics.lastfm.similarArtistsFound).toBe(0);
    // The real cause is captured by diagnostics even though it isn't the
    // fallbackReason surfaced first (spotify.topArtistsFound is checked
    // first — pre-existing M-earlier behavior, unchanged by M15) — proves
    // the failure was actually observed, not silently swallowed.
    expect(diagnostics.lastfm.error).not.toBeNull();
  });
});

describe('the last production mock provider has been removed (M15 Rule 1)', () => {
  it('no mockData module exists anywhere in modules/recommendations anymore', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    expect(existsSync(join(dir, 'mockData.ts'))).toBe(false);
  });

  it('the recommendations barrel no longer exports a mock-recommendation factory', async () => {
    const recommendationsModule = await import('./index');
    expect(Object.keys(recommendationsModule)).not.toContain('createMockRecommendations');
  });

  it('the only configured production provider is the real LastFmRecommendationProvider', async () => {
    const { getConfiguredProviders } = await import('./providerConfig');
    const { LastFmRecommendationProvider } = await import('./lastFmProvider');

    const providers = getConfiguredProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(LastFmRecommendationProvider);
  });
});
