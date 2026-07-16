# Changelog

## RecommendationQueue-arkitektur

Discovery viser ikke længere sange fra brugerens eget bibliotek — det
gik imod projektets mission (find NY musik). Discovery læser nu fra en
separat `RecommendationQueue` i stedet for `modules/storage`.

- Nyt modul `modules/recommendations/`:
  - `Recommendation`-interface (`id`, `track`, `source`, `score`, `reasons`)
  - `RecommendationQueue`-klasse: `current()` / `advance()` / `enqueue()` /
    `isEmpty()` / `size` / `toArray()` — ved intet om hvor anbefalingerne
    kommer fra
  - `createMockRecommendations()`: 6 håndlavede mock-sange (ingen af dem
    fra brugerens bibliotek), shufflet ved opstart
  - `getPrimaryGenre()`: mock-kun hjælper til genre-visning, indtil en
    rigtig kilde leverer genre-data
- `DiscoveryPage` bygger nu en `RecommendationQueue` med mock-data i
  stedet for at kalde `getAllTracks()`/`getAllArtists()` fra
  IndexedDB — virker uden at brugeren nogensinde har synkroniseret sit
  bibliotek
- Ingen ændringer i `DiscoveryCard`, `PreviewPlayer`, `ActionBar` eller
  `WhyPanel` — de eksisterende UI-komponenter virker uændret
- Stadig **ingen** rigtig anbefalings-algoritme, ingen AI, ingen nye
  API-kald — kun arkitekturen der gør Discovery klar til at modtage
  eksterne anbefalinger senere

## Discovery-side (UI only)

Forsiden er nu en Discovery-side i stedet for Music DNA-dashboardet.
Dashboardet ligger uændret på `/music-dna`, tilgængeligt via en ny
top-navigation.

- Ny `/` (home): Discovery — viser én sang ad gangen fra det lokalt
  synkroniserede bibliotek (shufflet, ingen algoritme endnu)
- Sang-kort: albumcover, titel, kunstner(e), album, genre (hvis
  tilgængelig via kunstner-data), og en 30-sekunders Spotify-preview
  (native `<audio>`-afspiller), eller en besked hvis `preview_url`
  mangler
- Handlingsknapper: ❤️ Gem, ❌ Afvis, 👀 Kendte allerede, ➡ Næste — alle
  går videre til næste sang; ingen af dem gemmer noget endnu (ren UI)
- "Hvorfor denne?"-knap åbner et sidepanel med placeholder-grunde
  (matcher musiksmag / ligner playlist-sange / samme genre / samme
  stemning) — ingen rigtig analyse
- Music DNA-dashboardet flyttet til `/music-dna`, funktionalitet
  uændret
- Ny top-nav (`AppNav`) til at skifte mellem Discovery og Music DNA

Nye moduler: `features/discovery/` (DiscoveryPage +
DiscoveryCard/PreviewPlayer/ActionBar/WhyPanel-komponenter),
`features/shell/AppNav`, `lib/shuffle`. Ingen ændringer i
`modules/spotify`, `modules/storage`, `modules/sync` eller
`modules/analysis` — ren UI-opgave.

## v0.1 — Spotify OAuth + Music DNA-dashboard

- Login med Spotify (OAuth Authorization Code + PKCE)
- Hent brugerens playlists og alle sange heri
- Analysér sangene lokalt (genre, årti, popularitet, explicit,
  kunstner-diversitet) — uden audio-features, som Spotify lukkede for
  nye apps i nov. 2024
- Gem metadata lokalt i IndexedDB
- Music DNA-dashboard
