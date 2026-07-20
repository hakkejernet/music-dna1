# Music DNA

Verdens bedste musik-discovery-værktøj — under opbygning.

**Ikke** en musikafspiller. **Ikke** en Spotify-klon. Kun discovery: log ind
med Spotify, analysér dine playlister, og se dit personlige "Music DNA" —
alt sammen lokalt i din browser.

## Omfang

- [x] Login med Spotify (OAuth Authorization Code + PKCE)
- [x] Hent brugerens playlists og alle sange heri
- [x] Analysér sangene (genre, årti, popularitet, explicit, kunstner-diversitet)
- [x] Gem metadata lokalt (IndexedDB)
- [x] Music DNA-dashboard (nu på `/music-dna`)
- [x] Discovery-side (forsiden, `/`) — viser én sang ad gangen med
      Gem/Afvis/Kendte allerede/Næste og et "Hvorfor denne?"-panel.
- [x] `RecommendationQueue`-arkitektur — Discovery læser fra en separat
      anbefalings-kø, ikke fra brugerens eget bibliotek.
- [x] `SpotifyRecommendationProvider` — første `RecommendationProvider`.
      Kaldte Spotifys `/recommendations` (begrænset for nye apps, ligesom
      audio-features). **Nu deprecated** — se nedenfor.
- [x] `LastFmRecommendationProvider` — **rigtige anbefalinger, ikke mock.**
      Udleder seeds fra brugerens Spotify-topkunstnere, henter lignende
      kunstnere og deres populære tracks via Last.fms API. Fuldstændig
      uafhængig af Spotify ved runtime. `providerConfig.ts` styrer hvilke
      providers der er aktive. Falder tilbage til mock-data hvis Last.fm
      ikke leverer noget. Se `CHANGELOG.md` for kendte API-begrænsninger.
- [x] `modules/ranking/` — Recommendation Ranking Engine. Henter ikke
      musik, rangerer kun det providers har fundet. `SimpleRanker` er
      regelbaseret (ny kunstner / genre-match / allerede i bibliotek /
      flere-kilder-enige), ingen AI. Fuldstændig uafhængig af enhver
      provider. `RecommendationQueue` modtager nu `RankedRecommendation`
      med `finalScore` og `explanations`.
- [x] **Gem virker.** `modules/history/` gemmer den fulde anbefaling
      lokalt (IndexedDB), fjerner den øjeblikkeligt fra køen, og
      udelukker den fra alle fremtidige sessioner. "Hvorfor denne?"
      viser nu de rigtige `explanations` fra `SimpleRanker` i stedet for
      placeholder-tekst.
- [x] `modules/preferences/` — ranking lærer af brugerens gemte og
      afviste anbefalinger (foretrukne/undgåede genrer og kilder,
      foretrukne kunstnere/årtier). Kun lokal statistik, ingen AI, ingen
      caching. `SimpleRanker` bruger nu `PreferenceProfile` til 6 nye
      regler.
- [x] Afvis-panel — vælg en årsag (8 muligheder) når du afviser en sang,
      eller luk/vent og få en almindelig afvisning. Årsagen gemmes lokalt
      og fodrer `PreferenceProfile.topRejectionReasons` (endnu ikke brugt
      af ranking).
- [x] **🎵 Åbn i Spotify** — ét klik fra en anbefaling til at lytte. Har
      anbefalingen et ægte Spotify-ID, åbnes den direkte; ellers slås
      titel+kunstner op via Spotifys søge-API, og et fundet match caches
      lokalt (`modules/spotifyLink/`) så samme sang aldrig slås op igen.
      Intet match -> et Spotify-søgelink, aldrig en blindgyde. Virker på
      iPhone, Android og desktop.
- [x] **Debug-panel** (kun i `npm run dev`, ikke i production-builden) —
      🐛-knap der viser præcis hvad der skete i seneste
      recommendation-load: Spotify-login/top-artists, Last.fm API
      key/kald/resultater, den endelige kø og — hvis mock blev brugt —
      den præcise fallback-årsag. Rent diagnostik, `modules/diagnostics/`.

Se [CHANGELOG.md](./CHANGELOG.md) for detaljer pr. opgave, inkl. kendte
API-begrænsninger i Last.fm-integrationen.

### Spotifys rolle

Spotify bruges **ikke længere som recommendation-motor**. Spotify bruges
udelukkende til: login, brugerens bibliotek, playlists, gemte sange og
topkunstnere. `SpotifyRecommendationProvider` ligger stadig i koden af
kompatibilitetshensyn, men er markeret deprecated og er ikke længere i
den aktive provider-konfiguration.

### Vigtigt: ingen audio-features i v0.1

Spotify lukkede i november 2024 for adgang til `audio-features`,
`audio-analysis`, `recommendations` og `related-artists` for **nye**
developer-apps — kun apps med tidligere godkendt "extended quota mode" har
stadig adgang. Det betyder at nyoprettede apps (som denne) ikke kan hente
danceability/energy/valence/tempo for numre.

Music DNA v0.1 er derfor bygget på metadata der *er* tilgængelig: genrer
(via kunstnere), udgivelsesår/årti, popularitet, explicit-andel,
track-længde og kunstner-diversitet. Arkitekturen er lagt så et
audio-features-modul kan tilføjes senere uden omskrivning, hvis I får
adgang til extended quota, eller via en anden datakilde.

## Arkitektur

Modulær opdeling så flere datakilder (Last.fm, MusicBrainz, AI-analyse) kan
tilføjes senere uden at røre eksisterende kode:

```
src/
  modules/
    spotify/    — OAuth (PKCE), API-klient, endpoints, typer
    storage/    — IndexedDB (via idb): tracks, artists, playlists, meta
    sync/       — orkestrerer hentning fra Spotify -> lagring lokalt
    analysis/   — beregner Music DNA ud fra lokalt gemt data
    recommendations/ — Recommendation-interface, RecommendationQueue,
                        RecommendationProvider-interface,
                        providerConfig.ts (aktive providers),
                        LastFmRecommendationProvider (aktiv, rigtig API),
                        SpotifyRecommendationProvider (deprecated)
    lastfm/     — rå Last.fm API-klient (artist.getsimilar,
                  artist.gettoptracks) — bruges kun af
                  LastFmRecommendationProvider
    ranking/    — RecommendationRanker-interface + SimpleRanker.
                  Rangerer, henter aldrig musik. Uafhængig af enhver
                  provider — kender kun Recommendation/UserProfile- og
                  PreferenceProfile-typerne.
    history/    — RecommendationHistory (IndexedDB): gemte OG afviste
                  anbefalinger. Gemte bruges til at fjerne sange fra
                  fremtidige queues; begge fodrer modules/preferences
    preferences/ — PreferenceProfile: foretrukne/undgåede genrer og
                   kilder, foretrukne kunstnere/årtier — udregnet rent
                   statistisk fra modules/history, ingen AI, ingen caching
    spotifyLink/ — resolveSpotifyTrackUrl(): finder/cacher det rigtige
                   open.spotify.com/track/{id}-link for en anbefaling
                   (direkte ID -> lokal cache -> Spotify search ->
                   søgelink-fallback). Eneste sted der ved noget om
                   Spotify-opslag for "Åbn i Spotify" — DiscoveryPage
                   kender kun modulets to funktioner
  features/
    auth/       — login-skærm, OAuth-callback, auth-context
    discovery/  — Discovery-side (forsiden): ét sang-kort ad gangen,
                  læser fra RecommendationQueue
    dashboard/  — Music DNA-dashboard (/music-dna) og undervisualiseringer
    shell/      — app-nav til at skifte mellem Discovery og Music DNA
  lib/          — PKCE-hjælpere, env-håndtering, formatering, shuffle
```

Hver fremtidig kilde (Last.fm, MusicBrainz, ...) får sit eget modul under
`src/modules/`, og `analysis/` udvides til at kombinere data fra flere
kilder — uden at `spotify/`-modulet skal ændres.

## Kom i gang

### 1. Opret en Spotify-app

1. Gå til [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   og opret en app.
2. Under app-indstillinger, tilføj denne redirect URI:
   `http://127.0.0.1:5173/callback`
3. Kopiér **Client ID**.

### 2. Opret en Last.fm API-nøgle

1. Gå til [last.fm/api/account/create](https://www.last.fm/api/account/create)
   og opret en gratis API-konto — ingen godkendelsesproces, nøglen virker
   med det samme.
2. Kopiér **API key**.

### 3. Konfigurér miljøvariabler

```bash
cp .env.example .env.local
```

Indsæt dine nøgler i `.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=dit-client-id
VITE_LASTFM_API_KEY=din-lastfm-nøgle
```

### 4. Installér og kør

```bash
npm install
npm run dev
```

Åbn `http://127.0.0.1:5173`, log ind med Spotify, og lad appen analysere
dine playlists. Data gemmes lokalt i browserens IndexedDB — intet sendes
til en server.

## OAuth-flow

Da dette er en ren klient-app uden backend, bruges **Authorization Code
med PKCE** (ikke Implicit Grant, som Spotify har udfaset, og ikke
Client Secret, som aldrig må ligge i en SPA):

1. `buildAuthorizeUrl()` genererer en code verifier/challenge og en
   `state`-værdi (CSRF-beskyttelse), gemmer dem i `sessionStorage`, og
   sender brugeren til Spotifys login-side.
2. Spotify redirecter til `/callback` med en `code`.
3. `handleAuthCallback()` verificerer `state`, udveksler koden til et
   access/refresh-token-par via `code_verifier`, og gemmer dem i
   `localStorage`.
4. `getValidAccessToken()` refresher automatisk access-tokenet når det
   er ved at udløbe.
5. `isAuthenticated()` tjekker desuden at det gemte token faktisk har alle
   scopes appen kræver lige nu (gemt sammen med tokenet ved login). Mangler
   ét — typisk fordi tokenet er fra før et scope blev tilføjet, som
   `user-top-read` blev — kan det **ikke** opgraderes via refresh (Spotify
   giver kun nye scopes via et nyt samtykke), så tokenet ryddes og brugeren
   sendes automatisk tilbage til login-skærmen for at godkende igen.

Scopes: kun læse-adgang (`playlist-read-private`,
`playlist-read-collaborative`, `user-read-private`, `user-read-email`,
`user-top-read`) — værktøjet skriver aldrig til din Spotify-konto.
`user-top-read` bruges af `getTopArtists()`, som
`LastFmRecommendationProvider` er afhængig af for at kunne udlede seeds —
uden det scope 403'er kaldet, og appen falder tilbage til mock-data (se
CHANGELOG.md).

## Scripts

- `npm run dev` — dev-server
- `npm run build` — typecheck + produktionsbuild
- `npm run lint` — oxlint
- `npm run test` — Vitest (enhedstests for `src/modules/**/*.test.ts`)
- `npm run preview` — preview af produktionsbuild

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` bygger og deployer automatisk til GitHub
Pages ved push til `claude/music-discovery-v01-b00w0u` (eller manuelt via
"Run workflow"). Appen ender på
`https://<bruger>.github.io/music-dna1/`.

Da dette er en ren frontend-app uden backend, bages `VITE_SPOTIFY_CLIENT_ID`
og `VITE_LASTFM_API_KEY` ind i den offentlige JS-bundle ved build — helt
normalt for denne type nøgler (Spotifys PKCE-flow er designet til det).

Én gang, før første deploy:

1. **Tilføj repo-secrets**: Settings → Secrets and variables → Actions →
   New repository secret. Tilføj `VITE_SPOTIFY_CLIENT_ID` og
   `VITE_LASTFM_API_KEY`.
2. **Slå Pages til**: Settings → Pages → Source: **GitHub Actions**.
3. **Opdater Spotify-appens redirect URI** til
   `https://<bruger>.github.io/music-dna1/callback` (præcis denne — se
   `deploy.yml`).

GitHub Pages har ingen server-side rewrites, så `public/404.html` +
scriptet i `index.html` bruger det velkendte
[spa-github-pages](https://github.com/rafgraph/spa-github-pages)-trick til
at holde client-side routing (inkl. `/callback`) i live ved direkte
navigation/refresh. `vite.config.ts`s `base` og `App.tsx`s
`BrowserRouter`-`basename` holder sig automatisk synkroniseret via
`import.meta.env.BASE_URL` — kun produktionsbuilds får subpath'et,
lokal dev kører stadig på `/`.
