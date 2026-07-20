import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastFmSimilarArtist, LastFmTrack } from '../lastfm';
import { processReactionEvent } from '../feedbackPipeline';
import type { SpotifyArtist, SpotifyTrack } from '../spotify';
import type { LibrarySnapshot } from '../userDna';

/**
 * Product Sprint 1 Rule 8's "integrationstests for hele flowet": this
 * file exercises the *entire* real, wired system — `buildAppContext()`
 * (M11's actual Composition Root, unmodified) all the way through
 * `Spotify Library → Candidate Provider → Ranking → Queue → reaction →
 * learning → observability`. Only the true network boundary
 * (`../spotify`'s `getTopArtists`, `../lastfm`'s three endpoint
 * functions) is mocked — every domain piece in between
 * (CandidateAggregator, EnrichmentPipeline + its two real enrichers,
 * RuleBasedRankingEngine, RecommendationQueue, processReactionEvent,
 * LearnFromReaction, learn(), InMemoryObservationSink) is the real,
 * unmodified implementation.
 */
const { getTopArtists } = vi.hoisted(() => ({ getTopArtists: vi.fn<(limit?: number) => Promise<SpotifyArtist[]>>() }));
vi.mock('../spotify', () => ({ getTopArtists }));

const { getSimilarArtists, getTopTracksForArtist, getTopTags } = vi.hoisted(() => ({
  getSimilarArtists: vi.fn<(artistName: string) => Promise<LastFmSimilarArtist[]>>(),
  getTopTracksForArtist: vi.fn<(artistName: string) => Promise<LastFmTrack[]>>(),
  getTopTags: vi.fn<(artistName: string) => Promise<string[]>>(),
}));
vi.mock('../lastfm', () => ({ getSimilarArtists, getTopTracksForArtist, getTopTags }));

const { getAllTracks } = vi.hoisted(() => ({ getAllTracks: vi.fn<() => Promise<SpotifyTrack[]>>() }));
vi.mock('../storage', () => ({ getAllTracks }));

const spotifyArtist = (name: string, genres: string[], popularity: number): SpotifyArtist => ({
  id: `spotify-${name}`,
  name,
  genres,
  popularity,
  followers: 0,
  images: [],
});

const similarArtist = (name: string, match: number): LastFmSimilarArtist => ({ name, mbid: null, match, url: `https://last.fm/${name}` });

const lastFmTrack = (id: string, name: string, artistName: string, playcount: number): LastFmTrack => ({
  id,
  name,
  artistName,
  artistMbid: null,
  playcount,
  listeners: playcount,
  url: `https://last.fm/${id}`,
  images: [],
});

const EMPTY_SNAPSHOT: LibrarySnapshot = { topArtists: null, savedTracks: null };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Sprint 1 — the whole Discovery flow, end to end through the real Composition Root (Rule 1/6/7/8)', () => {
  it('Spotify Library → Candidate Provider → Ranking → Queue: a real save reaction is learned from and observed', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead', ['art rock'], 70)]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue(['dream pop']);
    getAllTracks.mockResolvedValue([]);

    const { buildAppContext } = await import('./compositionRoot');
    const appContext = buildAppContext();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const discoveryResult = await appContext.useCases.buildDiscoveryQueue.execute('user-1', EMPTY_SNAPSHOT, 10, now);
    if (!discoveryResult.success) throw new Error('expected Success');

    // Real candidate, real ranking, real queue (Sprint 1 Rule 1/2).
    expect(discoveryResult.value.queue.remaining()).toBe(1);
    const ranked = discoveryResult.value.queue.current();
    expect(ranked).not.toBeNull();
    expect(ranked?.candidateRef).toBe('lastfm-track-svefn');

    // The user reacts — this is Queue's own, real react() (M6), never mutated by anything downstream.
    const { event, queue: nextQueue } = discoveryResult.value.queue.react('save');
    expect(event).not.toBeNull();
    expect(nextQueue.current()).toBeNull();

    // The reaction is validated and turned into a real LearningEvent (M7, unmodified).
    const feedback = processReactionEvent(event, now);
    if (!feedback.accepted) throw new Error('expected the reaction to be accepted');

    // Learning + observability (Sprint 1 Rule 6/7): real UserDNA update, real observation.
    const learnResult = await appContext.useCases.learnFromReaction.execute('user-1', feedback.learningEvent);
    if (!learnResult.success) throw new Error('expected Success');

    expect(learnResult.value.version).toBeGreaterThan(1);
    const observations = appContext.observationSink.getAll();
    expect(observations.some((observation) => observation.type === 'RecommendationAccepted')).toBe(true);
    expect(observations.some((observation) => observation.type === 'LearningApplied')).toBe(true);
  });

  it('never fabricates a recommendation when the real provider yields nothing — the queue is genuinely empty (Rule 7)', async () => {
    getTopArtists.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([]);

    const { buildAppContext } = await import('./compositionRoot');
    const appContext = buildAppContext();

    const discoveryResult = await appContext.useCases.buildDiscoveryQueue.execute('user-1', EMPTY_SNAPSHOT, 10, new Date());
    if (!discoveryResult.success) throw new Error('expected Success');

    expect(discoveryResult.value.queue.current()).toBeNull();
    expect(discoveryResult.value.queue.remaining()).toBe(0);
    expect(discoveryResult.value.enrichedCandidates).toEqual([]);
  });

  it('a "known" reaction is learned from and produces a RecommendationKnown observation, distinct from "save"', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead', [], 70)]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([]);

    const { buildAppContext } = await import('./compositionRoot');
    const appContext = buildAppContext();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const discoveryResult = await appContext.useCases.buildDiscoveryQueue.execute('user-1', EMPTY_SNAPSHOT, 10, now);
    if (!discoveryResult.success) throw new Error('expected Success');

    const { event } = discoveryResult.value.queue.react('known');
    const feedback = processReactionEvent(event, now);
    if (!feedback.accepted) throw new Error('expected the reaction to be accepted');

    await appContext.useCases.learnFromReaction.execute('user-1', feedback.learningEvent);

    const observations = appContext.observationSink.getAll();
    expect(observations.some((observation) => observation.type === 'RecommendationKnown')).toBe(true);
    expect(observations.some((observation) => observation.type === 'RecommendationAccepted')).toBe(false);
  });
});
