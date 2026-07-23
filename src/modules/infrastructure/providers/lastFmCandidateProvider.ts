import { getTopTags, getSimilarArtists, getTopTracksForArtist } from '../../lastfm';
import { getTopArtists } from '../../spotify';
import { getAllArtists } from '../../storage';
import type { Candidate, CandidateProvider, CandidateRequest } from '../../candidateProviders';

/**
 * M21: raised from 3/5/5. The old values bounded the entire candidate
 * universe to at most 3 × 5 × 5 = 75 unique raw candidates, ever, for a
 * given user — every one of them already the "most similar" artists to
 * only 3 seeds, so once M19's exclusion-based refill exhausted that
 * fixed set (in practice within a handful of batches), there was
 * nothing broader left to draw from; whatever was still available near
 * the end was, by construction, the least-similar tail of an already
 * narrow set, which is what read as declining quality rather than a
 * separate ranking defect (Ranking Engine is unchanged — this is a
 * candidate-supply problem, not a scoring one). More seeds (Rule 3) and
 * a wider net per seed now bound the universe at up to 10 × 8 × 8 = 640
 * raw candidates before dedup — enough variety that a session should
 * exhaust it far less often.
 */
const MAX_SEED_ARTISTS = 10;
const MAX_SIMILAR_PER_SEED = 8;
const MAX_TRACKS_PER_ARTIST = 8;

/**
 * M28: a hard ceiling on the combined seed count (Spotify top artists +
 * local library artists), bounding downstream Last.fm call volume
 * regardless of how large the synced library is. A fixed, documented,
 * undertuned constant — not derived from any real usage data — chosen
 * only to bound growth to a predictable multiple of the previous,
 * top-artists-only ceiling (30 vs. 10).
 */
const MAX_TOTAL_SEED_ARTISTS = 30;

interface CandidateArtist {
  name: string;
  match: number;
  /** M24 diagnostic-only: the Spotify seed artist whose similar-artist lookup produced this artist's best match — lets a trace reconstruct "which top-artist started this chain." Never read by enrichment or ranking. */
  seedArtist: string;
}

/**
 * Product Sprint 1's real `CandidateProvider`: the first (and only)
 * concrete implementation of the interface M3 defined but never filled
 * in. Self-contained on purpose — "Spotify Library → Candidate Provider"
 * is one arrow, so this provider reads the user's Spotify top artists
 * itself (via `modules/spotify`, already-real) rather than requiring a
 * caller to pass seed data through `CandidateRequest`, which stays
 * exactly `{ limit }` (M3's interface is unchanged — no architecture
 * change was needed to wire this in).
 *
 * Built on the same, already-proven-real Last.fm data source M15
 * established (`modules/lastfm`) — this is not a new provider *source*,
 * only the new-architecture adapter for it, since `CandidateProvider`
 * (M3) and the old `RecommendationProvider` (v1) are structurally
 * unrelated interfaces.
 *
 * Never throws (matches every other real provider in this codebase): a
 * failure anywhere in the chain degrades to an empty result, which the
 * CandidateAggregator (M3 Rule 5) already treats as this provider's own,
 * isolated failure — never a fabricated candidate (Sprint 1 Rule 7 /
 * M15 ADR-precedent).
 */
export class LastFmCandidateProvider implements CandidateProvider {
  readonly providerName = 'lastfm';

  async fetchCandidates(request: CandidateRequest): Promise<Candidate[]> {
    try {
      const topArtists = await getTopArtists(MAX_SEED_ARTISTS);
      const seedNames = await this.buildSeedNames(topArtists.map((artist) => artist.name));
      if (seedNames.length === 0) return [];

      const candidateArtists = await this.findCandidateArtists(seedNames);
      if (candidateArtists.length === 0) return [];

      const candidates = await this.collectCandidates(candidateArtists);
      return candidates.slice(0, request.limit);
    } catch {
      return [];
    }
  }

  /**
   * M28: widens the seed set beyond the live Spotify top-artists call by
   * also drawing on the user's already-synced local library
   * (`modules/storage.getAllArtists()`) — zero new network calls, since
   * that data is already on disk. Purely additive: `topArtistNames` are
   * always included first, a library artist can only ever add a seed
   * slot, never displace one.
   *
   * A local-storage failure (IndexedDB unavailable, or the user simply
   * has never synced) degrades to "no additional seeds" via this
   * function's own `.catch(() => [])` — deliberately local, not the
   * outer try/catch in `fetchCandidates`, so a storage-layer problem
   * never discards `topArtistNames`' perfectly valid seeds too. In that
   * case (or for any never-synced user) this function returns exactly
   * `topArtistNames`, deduplicated and capped — byte-for-byte the same
   * seed set this provider used before M28.
   *
   * Seed-selection policy, stated explicitly so this never has to be
   * reverse-engineered later: library artists are used in exactly the
   * order `getAllArtists()` returns them — no re-sorting, no weighting
   * or ranking by relevance, recency, or play count. That order is
   * itself deterministic: `getAllArtists()` reads the `artists` object
   * store via `keyPath: 'id'` (the artist's Spotify ID, an immutable,
   * stable string), and IndexedDB's `getAll()` returns records in
   * ascending order of that key — never insertion order, sync
   * timestamp, or anything session-dependent. The same local library
   * always produces the same seed set. When the combined list must be
   * capped, the library artists with the lexicographically smallest
   * Spotify IDs are the ones included — an arbitrary but fully
   * deterministic tie-break, not a preference judgment.
   */
  private async buildSeedNames(topArtistNames: string[]): Promise<string[]> {
    const libraryArtists = await getAllArtists().catch(() => []);
    const libraryArtistNames = libraryArtists.map((artist) => artist.name);

    const seedNames: string[] = [];
    const seen = new Set<string>();
    for (const name of [...topArtistNames, ...libraryArtistNames]) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      if (seedNames.length >= MAX_TOTAL_SEED_ARTISTS) break;
      seen.add(key);
      seedNames.push(name);
    }
    return seedNames;
  }

  /** Similar artists per seed, merged and deduplicated by name (keeping the best match) — same shape as the old, already-proven LastFmRecommendationProvider logic (M15). */
  private async findCandidateArtists(seedNames: string[]): Promise<CandidateArtist[]> {
    const results = await Promise.allSettled(seedNames.map((seed) => getSimilarArtists(seed)));

    const byName = new Map<string, CandidateArtist>();
    results.forEach((result, index) => {
      if (result.status === 'rejected') return;
      const seedArtist = seedNames[index];
      for (const artist of result.value.slice(0, MAX_SIMILAR_PER_SEED)) {
        const key = artist.name.toLowerCase();
        const existing = byName.get(key);
        if (!existing || artist.match > existing.match) {
          byName.set(key, { name: artist.name, match: artist.match, seedArtist });
        }
      }
    });
    return [...byName.values()];
  }

  /**
   * Top tracks + genre tags per candidate artist, mapped straight to
   * `Candidate`. Tags are fetched alongside tracks so `rawMetadata.tags`
   * is populated for `tagBasedEnricher` (M4) — without this, every
   * candidate would enrich to a fully neutral TrackDNA and "why this
   * track" would never have anything real to say (Sprint 1 Rule 4).
   * `explicit` is deliberately left off `rawMetadata`: Last.fm exposes no
   * such field, so `explicitMetadataEnricher` stays at its own neutral
   * default for every candidate from this provider — a known limitation,
   * not something faked here.
   */
  private async collectCandidates(candidateArtists: CandidateArtist[]): Promise<Candidate[]> {
    const results = await Promise.allSettled(
      candidateArtists.map(async (artist) => {
        const [tracks, tags] = await Promise.all([
          getTopTracksForArtist(artist.name),
          getTopTags(artist.name).catch(() => []),
        ]);
        return { artist, tracks, tags };
      }),
    );

    const byCandidateId = new Map<string, Candidate>();
    for (const result of results) {
      if (result.status === 'rejected') continue;
      const { artist, tracks, tags } = result.value;
      for (const track of tracks.slice(0, MAX_TRACKS_PER_ARTIST)) {
        const candidateId = `lastfm-${track.id}`;
        if (byCandidateId.has(candidateId)) continue;
        byCandidateId.set(candidateId, {
          candidateId,
          title: track.name,
          artists: [track.artistName],
          contributions: [
            {
              providerName: this.providerName,
              externalIds: { lastfmTrackId: track.id },
              rawMetadata: {
                tags,
                playcount: track.playcount,
                listeners: track.listeners,
                similarArtistMatch: artist.match,
                // M24 diagnostic-only provenance — never read by any enricher or by ranking.
                seedArtist: artist.seedArtist,
                similarArtist: artist.name,
              },
            },
          ],
        });
      }
    }
    return [...byCandidateId.values()];
  }
}
