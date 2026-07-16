# Changelog

## PreferenceProfile: ranking lærer af gemte/afviste anbefalinger

Recommendation Engine begynder at lære af brugerens feedback — stadig ingen
AI, ingen ML, kun lokal statistik (tælling og tærskelværdier).

- Nyt modul `modules/preferences/` med `buildPreferenceProfile()`. Beregnes
  frisk hver gang (ingen caching) ud fra `modules/history`s gemte og
  afviste anbefalinger:
  - `favoriteGenres` / `avoidedGenres` — genrer der går igen mindst 2 gange
    blandt hhv. gemte og afviste sange
  - `favoriteArtistIds` — enhver kunstner brugeren har gemt en sang med før
  - `favoriteDecades` — årtier der går igen mindst 2 gange blandt gemte
    sange (ofte tom i praksis lige nu, da Last.fm ikke leverer
    udgivelsesdato — se forrige changelog-punkt)
  - `favoriteSources` / `avoidedSources` — kilder (`"lastfm"` osv.) der
    går igen mindst 2 gange blandt hhv. gemte og afviste sange
- **Ny forudsætning tilføjet:** "Afvis"-knappen gemte tidligere ingenting —
  uden det ville `avoidedGenres`/`avoidedSources` aldrig kunne udregnes.
  `modules/history` har fået en ny `rejected`-store (versioneret
  IndexedDB-migration, ingen datatab for eksisterende `saved`-data), og
  "Afvis" persisterer nu en afvisning i baggrunden. **Ingen synlig
  UI-ændring** — knappen gør stadig præcis det samme (går videre til næste
  sang), blot med et usynligt databaseskriv, ligesom "Gem" allerede gjorde
- `RankingInput` har fået et valgfrit `preferences?: PreferenceProfile`-felt.
  En helt ny bruger uden historik rangerer præcis som før — reglerne
  herunder er additive og no-op uden data
- `SimpleRanker` har fået 6 nye simple regler, alle med tilhørende
  `explanations`:
  - `+15` genre matcher `favoriteGenres` → "Du har tidligere gemt mange
    sange fra denne genre"
  - `-15` genre matcher `avoidedGenres` → "Du afviser ofte sange fra denne
    genre"
  - `+10` kunstner matcher `favoriteArtistIds` → "Du har tidligere gemt
    sange med denne kunstner"
  - `+5` / `-5` kilde matcher `favoriteSources` / `avoidedSources` →
    tilsvarende forklaringer
  - `+5` årti matcher `favoriteDecades` → "Du foretrækker ofte musik fra
    dette årti"
- `loadRecommendationQueue()` bygger nu `PreferenceProfile` og sender den
  med til `SimpleRanker.rank(...)`
- Verificeret: seedede gemt/afvist-historik direkte i IndexedDB (2× samme
  genre gemt, 2× en anden genre afvist, 1× en bestemt kunstner gemt), og
  bekræftede at den foretrukne genre/kunstner rangerede øverst med de
  rigtige forklaringer, mens den undgåede genre rangerede nederst — uden
  nogen ændring i DOM-struktur eller synlig UI
- Ingen AI, ingen nye eksterne API'er, ingen caching — kun lokal statistik
- Build, typecheck og lint grønne

## LastFmRecommendationProvider: rigtige Last.fm-anbefalinger, ikke mock

Discovery viser nu rigtige sange fra Last.fm i stedet for mock-data. "Ikke
perfekt, bare fungerende" — ingen caching, ingen AI, ingen avanceret ranking.

- **Flow:** Spotify-topkunstnere (allerede hentet til `UserProfile`) → Last.fm
  `artist.getsimilar` pr. seed-kunstner → dedupliceret liste af lignende
  kunstnere (bedste match bevaret ved overlap) → Last.fm
  `artist.gettoptracks` pr. kandidat-kunstner → konverteret til
  `Recommendation` med `source: "lastfm"`, `score` = kunstnerens
  Last.fm-match (0–1), og en menneskelæsbar `reason` ("Ligner X på Last.fm")
- **Resiliens:** hvert kald pakkes i `Promise.allSettled` — fejler ét
  `artist.getsimilar`- eller `artist.gettoptracks`-kald for én kunstner,
  logges det tydeligt og de øvrige kunstnere fortsætter uændret. Provideren
  kaster aldrig, returnerer `[]` i værste fald
- `UserProfile` har fået `seedArtistNames` (Last.fms API virker på
  kunstnernavne, ikke Spotify-ID'er — navnene lå allerede i
  `buildUserProfile()`s Spotify-kald, blot ikke gemt før nu)
- Nyt modul `modules/lastfm/` (klient + endpoints for
  `artist.getsimilar`/`artist.gettoptracks`, adskilt fra
  `modules/recommendations/lastFmProvider.ts` der laver
  Recommendation-mapningen — samme mønster som `modules/spotify`)
- Ny env-variabel `VITE_LASTFM_API_KEY` (gratis nøgle via
  last.fm/api/account/create)

### API-begrænsninger fundet under implementering

- Last.fms `artist.gettoptracks` giver **ikke** album, udgivelsesdato,
  varighed, ISRC eller preview-URL — kun kunstner/track-navn, playcount,
  listeners og billede. `SpotifyTrack`-felterne der mangler er sat til
  neutrale/ærlige standardværdier (`albumName: "Ukendt album"`,
  `previewUrl: null`, `durationMs: 0`, osv.) frem for at gætte.
- Last.fm returnerer HTTP 200 selv ved metode-fejl (fx ukendt
  kunstnernavn) — fejlen ligger i stedet i et `error`-felt i JSON-body'en.
  `modules/lastfm/client.ts` tjekker begge dele.
- Ingen stabile track-ID'er fra Last.fm (mbid mangler ofte) — bruger mbid
  når det findes, ellers en slug af kunstner+titel som fallback-ID.
- Rate limit er 5 kald/sekund pr. IP (jf. `docs/data-sources.md`) — med op
  til 3 seed-kunstnere × 5 lignende × 5 tracks kan et fuldt load ramme
  ~15–18 kald. Ingen backoff/retry er bygget ind endnu (bevidst, jf.
  opgavens "ikke avanceret" scope) — enkelte 429'ere vil blot resultere i
  færre (men stadig mange) anbefalinger.

### Vigtigt: ikke testet live i denne session

Dette sandbox-miljøs udgående netværkspolitik blokerer eksplicit
`api.spotify.com` **og** `ws.audioscrobbler.com` (Last.fm) med en
`403 gateway policy denial` — bekræftet via proxy-statusloggen, ikke noget
en API-nøgle kan løse. Det har derfor ikke været muligt at gennemføre den
efterspurgte test med en rigtig Spotify-bruger i denne session.

I stedet er hele flowet (Spotify-login → `buildUserProfile` →
`LastFmRecommendationProvider` → `SimpleRanker` → `RecommendationQueue` →
Discovery-UI) verificeret med Playwrights netværks-mocking: realistiske
Spotify- og Last.fm-svar simuleret lokalt i browseren, inklusiv et
kunstner-kald der bevidst fejler for at bekræfte resiliens-kravet.
Resultat: **70 unikke anbefalinger** ud af 15 kandidat-kunstnere (14
lykkedes, 1 simuleret fejl), altså komfortabelt over kravet om mindst 20.
Denne test beviser at parsing/mapping/resiliens-logikken er korrekt — den
beviser **ikke** at Last.fms rigtige data eller rate limits opfører sig
identisk. **Denne opgave bør testes af en rigtig bruger med en gyldig
Spotify- og Last.fm-nøgle i et miljø med almindelig internetadgang**, før
den betragtes som fuldt bekræftet.

- Build, typecheck og lint grønne.

## To produktfejl lukket: Gem virker, "Hvorfor denne?" viser rigtige forklaringer

Lukker de to huller `docs/mvp.md` fandt ved gennemgang af koden. Ingen nye
providers, ingen AI, ingen nye API-kald, ingen ændrede ranking-regler.

- **❤️ Gem virker nu rent faktisk.** Nyt modul `modules/history/`
  (IndexedDB, egen `music-dna-history`-database) persisterer den fulde
  `RankedRecommendation` lokalt når brugeren gemmer. Sangen fjernes med
  det samme fra `RecommendationQueue` (ny `remove(id)`-metode), så den
  aldrig vises igen i den aktuelle session. `loadRecommendationQueue()`
  filtrerer desuden allerede-gemte track-ID'er fra ved hver ny
  indlæsning, så en gemt sang heller ikke dukker op igen i en senere
  session. Statistikken ("❤️ X gemt") i Discovery-headeren opdateres
  med det samme og reflekterer det reelle, persisterede antal.
- **"Hvorfor denne?" viser nu de rigtige `explanations`** som
  `SimpleRanker` allerede beregnede for den aktuelle anbefaling — ikke
  længere en hardkodet placeholder-liste. Er `explanations` tom, vises
  en pæn fallback-besked i stedet.
- `RecommendationQueue` er gjort generisk
  (`RecommendationQueue<T extends Recommendation>`), så
  `RankedRecommendation`s felter (`finalScore`, `explanations`) er
  tilgængelige med fuld type-sikkerhed helt ud i `DiscoveryPage` — uden
  cast eller `any`.
- Verificeret end-to-end: gemte en sang, så tælleren gå fra 0→1, så
  IndexedDB rent faktisk indeholdt snapshottet (med `finalScore` og
  `explanations`), reloadede hele appen, og bekræftede at den gemte sang
  ikke dukkede op igen i en ny, frisk queue.
- Build, typecheck og lint grønne.

## Recommendation Ranking Engine

Nyt modul `modules/ranking/`. Det henter ikke musik — det rangerer kun
det, det får. Fuldstændig uafhængigt af Spotify, Last.fm og fremtidige
providers (importerer kun de delte `Recommendation`/`UserProfile`-typer,
aldrig en providers implementering).

- `RankingInput { recommendations: Recommendation[]; profile: UserProfile }`,
  `RankedRecommendation extends Recommendation` (tilføjer `finalScore`
  og `explanations`), og `RecommendationRanker`-interfacet, præcis som
  specificeret
- `SimpleRanker`: rent regelbaseret, ingen AI/ML, ingen netværks- eller
  storage-adgang i selve rankeren. Fire regler:
  - `+20` hvis ingen af sangens kunstnere findes i biblioteket → "Ny kunstner"
  - `+10` hvis en af sangens genrer matcher brugerens favoritgenrer → "Matcher dine favoritgenrer"
  - `-30` hvis sangen allerede findes i biblioteket → "Allerede i dit bibliotek" (ellers "Ikke fundet i dit bibliotek")
  - `+5` placeholder for fremtidig fusion — slår kun til hvis to
    providers i samme batch reelt anbefaler den samme sang → "Flere
    kilder er enige om denne sang"
- `Recommendation` har fået et `genres: string[]`-felt (provider-leveret,
  tomt hvis kilden ikke kan levere det) og `UserProfile` har fået
  `libraryArtistIds`/`libraryTrackIds`, hentet lokalt fra IndexedDB —
  ingen nye API-kald
- `getPrimaryGenre()` er forenklet til bare at læse `recommendation.genres[0]`
  i stedet for en mock-specifik kunstner-ID-opslagstabel
- `loadRecommendationQueue()` kører nu `SimpleRanker.rank(...)` på
  batchen (rigtig eller mock-fallback) før `RecommendationQueue`
  bygges — køen modtager `RankedRecommendation` i stedet for rå
  `Recommendation`
- **Fejlrettelse undervejs**: `buildUserProfile()` brugte ét fælles
  `Promise.all` til både Spotify-kald og lokale storage-opslag, så en
  fejlende Spotify-session slettede allerede-synkroniserede
  biblioteksdata og gjorde ranking-reglerne forkerte. Isoleret Spotify-
  delen i sin egen try/catch, så biblioteksdata altid bevares uanset
  Spotify-status
- `DiscoveryPage` er **100 % uændret** — ingen diff i filen overhovedet
- Verificeret: seedede et lokalt bibliotek hvor én sang og dens
  kunstner allerede var kendt — den sang endte korrekt sidst i køen
  (score -30), mens to helt nye sange (score +20) endte først, med
  Spotify-sessionen bevidst fejlende under hele testen
- Ingen AI, ingen machine learning, ingen nye API-kald
- Build, typecheck og lint grønne

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
