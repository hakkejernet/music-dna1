# Changelog

## LastFmRecommendationProvider + provider-konfiguration

Arkitektur-skift: Spotify er ikke længere recommendation-motoren.
Spotify bruges fremover kun til login, bibliotek, playlists, gemte
sange og topkunstnere.

- `RecommendationProvider`-interfacet er uændret
- `SpotifyRecommendationProvider` er markeret `@deprecated` (kommentar
  i koden) — ligger stadig af kompatibilitetshensyn, men er ikke
  længere i den aktive provider-konfiguration
- Ny `LastFmRecommendationProvider`: implementerer
  `RecommendationProvider`, returnerer mock-data. **Fuldstændig
  uafhængig af Spotify** — importerer aldrig
  `modules/spotify`'s klient/auth/endpoints, og virker uændret selv
  hvis Spotify-login fejler helt
- Ny `providerConfig.ts` med `getConfiguredProviders()` — den ene
  funktion der bestemmer hvilke providers `loadRecommendationQueue()`
  bruger. I dag kun Last.fm; at tilføje flere (fx Spotify igen, eller
  MusicBrainz senere) er at udvide dette array, intet andet
- `loadRecommendationQueue()` kører nu alle konfigurerede providers
  parallelt (`Promise.allSettled`) og **konkatenerer** resultaterne —
  ingen fusion eller scoring endnu. En provider der fejler bidrager
  bare med 0 anbefalinger og logges tydeligt, uden at vælte de andre.
  Falder tilbage til de eksisterende mock-anbefalinger hvis alle
  providers tilsammen returnerer en tom liste
- `DiscoveryPage` er **uændret** ud over hvad der allerede var der —
  kender fortsat kun `RecommendationQueue` og `loadRecommendationQueue`
- Verificeret: med en session uden gyldigt Spotify-login (Spotify-kald
  fejler) viser Discovery stadig Last.fm-mock-sangene korrekt — beviser
  at provideren er reelt Spotify-uafhængig
- Ingen AI, ingen MusicBrainz endnu
- Build, typecheck og lint grønne

## SpotifyRecommendationProvider

RecommendationQueue har fået sin første rigtige provider — stadig ingen
AI, ingen Last.fm, ingen fallback-algoritmer, kun Spotify.

- Nyt `RecommendationProvider`-interface (`getRecommendations(user):
  Promise<Recommendation[]>`) i `modules/recommendations/types.ts`,
  sammen med et `UserProfile`-taste-signal (`seedArtistIds`,
  `seedTrackIds`, `seedGenres`)
- `SpotifyRecommendationProvider` implementerer interfacet: kalder
  Spotifys `/recommendations`-endpoint med seeds fra brugerens
  top-kunstnere. **Fanger alle fejl og returnerer altid `[]` i stedet
  for at kaste** — Spotify lukkede `/recommendations` for nye apps i
  nov. 2024 (samme begrænsning som audio-features), så et 403/404 her
  er en forventet, ikke-fatal udfald. Fejlen logges tydeligt
  (`console.warn`) med kontekst, så den er til at debugge
- `buildUserProfile()` bygger `UserProfile` fra `/me/top/artists`
  (ikke begrænset) — ny hjælpefunktion, ingen ændring i eksisterende
  Spotify-endpoints ud over tilføjelsen af `getTopArtists` og
  `getRecommendedTracks`
- `loadRecommendationQueue()` er det eneste, `DiscoveryPage` kender:
  den prøver Spotify-provideren først, og falder automatisk tilbage
  til `createMockRecommendations()` hvis listen er tom (uanset årsag —
  API-begrænsning, netværksfejl, eller ingen seeds). Mock-systemet
  fungerer stadig uændret som fallback
- `DiscoveryPage` importerer aldrig `SpotifyRecommendationProvider`
  direkte — kun `RecommendationQueue` og `loadRecommendationQueue`
- Verificeret end-to-end: med en session uden gyldigt Spotify-login
  fejler Spotify-kaldet rent, bliver fanget og logget, og Discovery
  falder automatisk tilbage til mock-anbefalinger uden at crashe
- Build, typecheck og lint grønne

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
