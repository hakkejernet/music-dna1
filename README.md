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
      Gem/Afvis/Kendte allerede/Næste og et "Hvorfor denne?"-panel med
      placeholder-grunde. **Ren UI** — ingen anbefalings-algoritme, ingen
      AI, ingen ny API-logik endnu.
- [x] `RecommendationQueue`-arkitektur — Discovery læser fra en separat
      anbefalings-kø (i dag fyldt med mock-data), ikke fra brugerens eget
      bibliotek. Klar til at modtage en rigtig kilde senere.
- [x] `SpotifyRecommendationProvider` — første rigtige
      `RecommendationProvider`. Kalder Spotifys `/recommendations`
      (begrænset for nye apps, ligesom audio-features), fejler aldrig
      hårdt, og falder automatisk tilbage til mock-anbefalinger.

Ingen rigtige anbefalinger endnu — det kommer i en senere version. Se
[CHANGELOG.md](./CHANGELOG.md) for detaljer pr. opgave.

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
                        SpotifyRecommendationProvider (falder tilbage
                        til mock-data hvis Spotify ikke leverer)
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

### 2. Konfigurér miljøvariabler

```bash
cp .env.example .env.local
```

Indsæt dit Client ID i `.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=dit-client-id
```

### 3. Installér og kør

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

Scopes: kun læse-adgang (`playlist-read-private`,
`playlist-read-collaborative`, `user-read-private`, `user-read-email`) —
værktøjet skriver aldrig til din Spotify-konto.

## Scripts

- `npm run dev` — dev-server
- `npm run build` — typecheck + produktionsbuild
- `npm run lint` — oxlint
- `npm run preview` — preview af produktionsbuild
