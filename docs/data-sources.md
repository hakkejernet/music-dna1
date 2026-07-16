# Datakilder til Music DNA — teknisk research

**Formål:** Finde den bedste langsigtede strategi for musik-discovery — hvilke
åbne/kommercielle musiktjenester bør vi bygge videre på, og hvad skal hver af
dem bruges til. Dette er research, ikke implementering. Ingen kode er
ændret som del af dette dokument.

**Dato:** Juli 2026. **Forbehold:** API-landskabet ændrer sig hurtigt — Spotify
alene har strammet sine udvikler-vilkår tre gange på ca. 16 måneder (nov.
2024, maj 2025, feb. 2026) i den periode denne rapport dækker. Tal og vilkår
herunder bør genbekræftes mod kildernes egen dokumentation før større
arkitektur-beslutninger låses fast.

---

## 1. Last.fm API

1. **Data:** Scrobbles/lyttehistorik (kræver brugerens login), artist-/album-/
   track-metadata, crowd-sourced tags (den reelle genre-kilde), `artist.getSimilar`,
   `track.getSimilar`, `tag.getSimilar`, charts, brugerens top-artister/-numre, bios.
2. **Kræver OAuth?** Nej for læsning af katalog/similarity — kun en API-nøgle.
   Egen (ikke-standard OAuth2) session-baseret auth kræves for at scrobble/skrive
   på vegne af en bruger.
3. **Rate limits:** 5 requests/sekund pr. IP, gennemsnit over 5 minutter. Cache af
   Last.fm-data er begrænset til en "reasonable usage cap" på 100 MB uden skriftligt
   samtykke fra Last.fm.
4. **Licens/vilkår:** Data må **kun bruges til ikke-kommercielle formål** som
   standard. Kommerciel brug kræver en separat aftale (kontakt partners@last.fm).
   Brud er en "material breach" der giver Last.fm ret til at lukke adgangen med det samme.
5. **Recommendations?** Ja — `artist.getSimilar`/`track.getSimilar` er reelt bygget
   til similarity-baseret discovery. Ingen personaliseret ML ud over det.
6. **Metadata?** Ja — særligt genre/stemning via tags (rig, men støjet folksonomi).
   Svagere på strukturerede udgivelsesdata end MusicBrainz/Discogs.
7. **Kommercielt brugbar?** Nej, ikke uden separat aftale.
8. **Fordele:** Gratis, ingen bruger-OAuth nødvendig for læsning, ægte
   similarity-graf for både artister og numre, enormt tag-univers, krydsrefererer
   fint til MusicBrainz-MBID'er.
9. **Ulemper:** Kommerciel spærring, støjet/inkonsistent tag-kvalitet, ældre
   API-design (AudioScrobbler 2.0), svag/uofficiel dokumentation nogle steder.
10. **Fit til projektet: 7/10** — bedste åbne similarity-motor vi kan bruge uden
    forhandling, så længe produktet forbliver ikke-kommercielt.

---

## 2. MusicBrainz

1. **Data:** Kanoniske identifikatorer (MBID'er) for artister/udgivelser/optagelser/
   værker, relationer (medlem-af, remix-af, cover-af), udgivelsesdatoer, labels,
   krediteringer, ISRC/ISWC, tags/genrer (renere end Last.fms, men mindre volumen).
   Cover Art Archive (separat CC-licenseret billedtjeneste) hænger på samme MBID'er.
2. **Kræver OAuth?** Nej for læsning. OAuth2 kun for at redigere selve databasen
   (irrelevant for os).
3. **Rate limits:** ca. 1 request/sekund pr. IP i gennemsnit (50/sek. pr.
   user-agent, 300/sek. globalt er separate, højere lofter) — IP'er der
   overskrider raten blokeres midlertidigt.
4. **Licens/vilkår:** Kernedata er **CC0** (reelt public domain) — det bedste
   licensgrundlag i denne rapport. Enkelte afledte/aggregerede datasæt er
   CC BY-NC-SA i stedet.
5. **Recommendations?** Nej — ingen similarity- eller anbefalingsfunktion.
   Det er en identitets-/metadata-graf, ikke en smags-motor.
6. **Metadata?** Ja — bedste-i-klassen kanonisk metadata; fungerer som "rygraden"
   andre kilder (ListenBrainz, delvist Discogs, Cover Art Archive) hænger på.
7. **Kommercielt brugbar?** Ja for CC0-kernedata; tungere kommerciel API-brug
   bør aftales direkte med MetaBrainz.
8. **Fordele:** CC0, ekstremt pålidelige identifikatorer, community-vedligeholdt,
   fælles ID-rum der lader os koble Last.fm-tags, ListenBrainz-statistik,
   Discogs-udgivelser og Cover Art Archive-billeder sammen uden at være låst
   til én streamingtjenestes interne ID'er.
9. **Ulemper:** Meget lavt per-IP rate limit til live-opslag i stor skala (kræver
   caching/spejling eller bulk-dumps ved høj volumen), ingen recommendations/
   similarity i sig selv.
10. **Fit til projektet: 8/10** — ikke til discovery direkte, men den nødvendige
    neutrale ID-lag der lader os kombinere alle de andre kilder uden at være
    afhængige af én tjenestes ID-rum.

---

## 3. ListenBrainz

1. **Data:** Brugerens lyttehistorik (scrobbles), collaborative-filtering
   anbefalede optagelser (`GET /1/cf/recommendation/user/{user}/recording`),
   "similar artists" via Labs API, "fresh releases", årsopgørelser, playlister —
   alt sammen nøglet til MusicBrainz-MBID'er.
2. **Kræver OAuth?** Simpelt bruger-token (fra kontoindstillinger, ikke fuld
   OAuth2-dans) for at indsende lyt-data eller lave personaliserede kald.
   Offentlig statistik kan læses uden.
3. **Rate limits:** Header-baseret og dynamisk (`X-RateLimit-*`), højere for
   autentificerede kald, 429 ved overskridelse — mere generøst end MusicBrainz'
   rå 1 req/sek.
4. **Licens/vilkår:** Drevet af MetaBrainz Foundation (non-profit), samme åbne
   filosofi som MusicBrainz. Ingen kommerciel spærring fundet, i modsætning til
   Last.fm og Deezer — bør dog bekræftes direkte hos MetaBrainz før commercial
   go-live.
5. **Recommendations?** Ja — det er eksplicit en anbefalings-motor
   (collaborative filtering med matrix-faktorisering/ALS), plus et voksende
   Labs-datasæt for "similar artists".
6. **Metadata?** Kun indirekte — ListenBrainz handler om lyttemønstre, ikke
   katalog-metadata; den læner sig på MusicBrainz for det.
7. **Kommercielt brugbar?** Ja, ingen ikke-kommerciel klausul fundet (men bør
   bekræftes eksplicit hos MetaBrainz).
8. **Fordele:** Non-profit/mission-alignet med "discovery, ikke udnyttelse",
   reelle anbefalinger, ingen kommerciel betalingsmur fundet, tæt integreret med
   MusicBrainz' ID-rum (samme rum som vores metadata-lag ville bruge), aktivt
   udviklet.
9. **Ulemper:** Meget mindre brugerbase end Spotify (ét datasæt-snapshot viste
   ca. 21.700 brugere) → tyndere collaborative-filtering-dækning for nichesmag;
   "similar artists"-datasættet er eksplicit ikke kørt igennem for al data endnu
   (plettet dækning); mindre poleret dokumentation/SDK'er end kommercielle API'er.
10. **Fit til projektet: 9/10** — bedste filosofiske og arkitektoniske match til
    "musik-discovery, ikke udnyttelse", og det mest lovende **rigtige** (ikke
    mock) anbefalings-datakilde at koble på som næste skridt.

---

## 4. Discogs API

1. **Data:** Meget dyb udgivelses-/pressnings-metadata (formater, katalognumre,
   labels, krediteringer, styles/genres, marketplace-priser, community
   want/have-statistik), komplet diskografi pr. artist.
2. **Kræver OAuth?** OAuth 1.0a for brugerspecifikke handlinger (samling,
   ønskeliste). Nøgle/hemmelighed alene hæver rate limit for anonym katalog-læsning.
3. **Rate limits:** 60 requests/minut autentificeret, 25/minut uautentificeret,
   glidende 60-sekunders vindue.
4. **Licens/vilkår:** Kommerciel brug er generelt tilladt, med navngivne
   undtagelser: må ikke videresælge adgang/data, ikke lægge betalingsmur om
   samme gratis data, ikke bruge det til at drive trafik væk fra Discogs eller
   lave uautoriseret markedsanalyse.
5. **Recommendations?** Nej — ingen similarity- eller smags-motor.
6. **Metadata?** Ja — nok den bedste genre/style-taksonomi i denne rapport
   (mere præcis end Spotifys flade genre-strenge) og ubestridt bedst til fysiske
   udgivelser/pressninger. Svagere til at identificere en specifik streaming-track,
   da databasen er bygget om samler-/marketplace-logik, ikke streaming-kataloger.
7. **Kommercielt brugbar?** Generelt ja, med ovenstående begrænsninger.
8. **Fordele:** Rig genre/style-taksonomi, dyb udgivelses-/pressningshistorik,
   kommerciel brug tilladt uden forhandling i de fleste tilfælde.
9. **Ulemper:** Bygget om fysiske udgivelser/samling, ikke streaming-numre —
   at matche en Spotify-track til en specifik Discogs-udgivelse er ikke-trivielt
   (ingen ligetil ISRC-først-opslag, ofte kunstner+titel-heuristik), ingen
   anbefalingsværdi, lavt rate limit til bulk-berigelse.
10. **Fit til projektet: 5/10** — god sekundær metadata-berigelse (styles,
    besætning, pressningsinfo) til fremtidige power-user-features, ikke central
    for discovery.

---

## 5. Spotify Web API (nuværende begrænsninger)

Vi bruger allerede Spotify til login/bibliotek i denne app, så nedenstående er
baseret både på egen erfaring i kodebasen og på research.

1. **Data der reelt kan hentes i Development Mode i dag:** brugerprofil (`/me`),
   brugerens playlister (`/me/playlists`), playlist-indhold **kun for playlister
   brugeren selv ejer eller er collaborator på** (`/playlists/{id}/items` —
   omdøbt fra `/tracks` i feb. 2026), gemte/library-numre, top-artister/-numre
   (`/me/top/{type}`), grundlæggende artist/album/track-opslag, søgning.
2. **Kræver OAuth?** Ja — Authorization Code + PKCE (det vi selv har bygget).
   Intet client secret nødvendigt for en ren SPA.
3. **Rate limits:** Glidende 30-sekunders vindue, varierer med "quota mode".
   **Vigtigt:** Fra 11. feb. 2026 kræver alle nye Development Mode Client ID'er
   et Spotify Premium-abonnement, hver udvikler må kun have ét Dev Mode
   Client ID, og hvert Client ID er begrænset til **5 autoriserede brugere**
   (ned fra 25). Fra 9. marts 2026 gælder det samme for alle eksisterende
   integrationer.
4. **Licens/vilkår:** Kommerciel brug kræver Extended Quota Mode. Siden
   15. maj 2025 er den adgang forbeholdt **organisationer (ikke enkeltpersoner)
   med mindst 250.000 månedlige aktive brugere** — reelt lukket land for et
   indie-/hobbyprojekt som dette.
5. **Recommendations?** Nej — `/recommendations`, `/audio-features`,
   `/audio-analysis` og `/related-artists` blev fjernet for nye apps i nov. 2024
   og er stadig væk. Bekræftet i vores eget `SpotifyRecommendationProvider`,
   som konsekvent får 403/404 og falder tilbage til mock/Last.fm.
6. **Metadata?** Ja, men krympende — `/browse/new-releases`, `/markets` og
   `/artists/{id}/top-tracks` blev fjernet i feb. 2026. Grundlæggende opslag
   virker stadig.
7. **Kommercielt brugbar?** Ikke realistisk, jf. punkt 4, medmindre vi vokser
   til 250.000+ MAU som organisation.
8. **Fordele:** Suverænt det største og bedst matchede streamingkatalog;
   OAuth-flowet er allerede bygget og virker til login/bibliotek; brugerens data
   ligger allerede her (intet behov for import).
9. **Ulemper:** Aktivt og gentagne gange fjendtlig over for tredjeparts
   discovery-værktøjer (tre stramninger på ~16 måneder); ingen
   anbefalings-overflade tilbage; 5-bruger-loftet i Dev Mode gør appen reelt
   ubrugelig for andre end udvikleren selv uden (svært opnåelig) Extended Quota.
10. **Fit til projektet: 6/10** — obligatorisk til login/bibliotek/playlister
    (det er der brugerens data er), men må aldrig være anbefalings-motoren.
    Behandl Spotify som en data*kilde*, ikke en discovery-*partner*, og forvent
    fortsat udhuling af adgangen over tid.

---

## 6. Deezer API

1. **Data:** Katalog-søgning, artist-/album-/track-metadata, charts,
   radio/"mix"-streams pr. artist, relaterede artister, brugerens
   playlister/bibliotek (med OAuth), 30-sekunders previews.
2. **Kræver OAuth?** OAuth2 for personlige/bruger-data. Offentlig
   katalog/chart/søgning/related-data virker uden nøgle.
3. **Rate limits:** ca. 50 requests / 5 sekunder.
4. **Licens/vilkår:** Vilkårene begrænser eksplicit brug til **ikke-kommercielle
   formål** — udvikleren må ikke "modtage, generere eller drage fordel af" nogen
   form for indtægt i forbindelse med brugen, medmindre der er indgået en
   separat partneraftale. Nyoprettelse af API-adgang til enkeltpersoner er
   ifølge supportkilder også blevet strammet.
5. **Recommendations?** Delvist — `related`-artist- og radio/mix-endpoints
   fungerer som en let discovery-overflade ("mere af det samme"), ikke
   personaliseret ML.
6. **Metadata?** Ja, rimelig kataloggenkendelse (stærk i Europa), mindre dyb
   end MusicBrainz/Discogs.
7. **Kommercielt brugbar?** Nej, ikke uden underskrevet partneraftale.
8. **Fordele:** Gratis previews, related-artist/radio-endpoints er en reel
   (om end simpel) discovery-overflade, enkel OAuth2, decent alternativt
   katalog til krydstjek mod Spotify.
9. **Ulemper:** Samme type hårde ikke-kommercielle vilkår som Last.fm,
   rapporter om strammet adgang for private udviklere, mindre økosystem/
   community end Spotify eller Last.fm.
10. **Fit til projektet: 5/10** — brugbar som sekundært discovery-signal
    (related-artist/radio) og katalog-krydstjek, blokeret på samme måde som
    Last.fm hvis produktet nogensinde skal monetiseres.

---

## 7. Apple Music API (MusicKit) — kun relevant hvis vi understøtter Apple Music-brugere

1. **Data:** Hele Apple Music-kataloget (søgning, artister, albums, sange,
   playlister, charts), brugerens Apple Music-bibliotek/playlister (med
   bruger-token), personaliserede "for you"-anbefalinger — men kun for aktive
   Apple Music-abonnenter.
2. **Kræver OAuth?** Apples egen model: et udvikler-token signeret med en
   privat nøgle + et per-bruger "music-user-token" hentet via Apples
   JS/native MusicKit-autorisationsflow — ikke standard OAuth2, tungere at
   integrere på web end en almindelig redirect.
3. **Rate limits:** Ikke offentliggjort som faste tal; beskrevet som generøst
   men throttlet pr. app, detaljer kræver et betalt medlemskab at se/teste.
4. **Licens/vilkår:** Kræver et aktivt **Apple Developer Program-medlemskab
   ($99/år)** blot for at få credentials — en reel adgangsbarriere
   sammenlignet med alle andre kilder i denne rapport.
5. **Recommendations?** Ja, men kun meningsfuldt for brugere med et aktivt
   Apple Music-abonnement — personaliserings-endpoints afspejler Apples egen
   motor, ikke noget vi selv kan styre eller genbruge for ikke-abonnenter.
6. **Metadata?** Ja, solid kataloggenkendelse, sammenlignelig med Spotifys.
7. **Kommercielt brugbar?** Ja, under den betalte udvikleraftale.
8. **Fordele:** Kvalitetskatalog + reelt gode personaliserede anbefalinger for
   abonnenter, stabile vilkår historisk (ingen tilsvarende stramningsbølger som
   Spotify).
9. **Ulemper:** $99/år bare for at eksperimentere, kræver at brugeren har et
   Apple Music-abonnement for at låse de interessante (anbefalings-)dele op,
   tungere web-auth-flow end en almindelig OAuth-redirect, irrelevant for de
   mange brugere der bruger Spotify/andre tjenester i stedet.
10. **Fit til projektet: 3/10 i dag** — kun relevant hvis/når produktet
    eksplicit understøtter Apple Music-brugere som en anden login-udbyder;
    ikke pengene værd for det nuværende Spotify-only MVP.

---

## 8. Andre seriøse åbne kilder (kort)

- **AcousticBrainz / Essentia** — AcousticBrainz lukkede permanent i feb. 2022;
  et frosset dump fra juni 2022 (ca. 7,5 mio. optagelser) kan stadig downloades,
  men der er ingen live API og ingen dækning af noget udgivet efter 2022.
  Motoren bag, **Essentia**, er open source og kan selv-hostes til at beregne
  de samme ~120 audio-feature-felter fra rå lyd — men det kræver adgang til
  selve lydfilerne, som vi ikke har (Spotify giver ikke fuld lyd, og selv
  30-sek.-previews er stadig sjældnere tilgængelige). Kun relevant på langt
  sigt, hvis vi nogensinde får adgang til faktiske lydfiler.
- **TheAudioDB** — lille community-database for metadata/artwork, gratis tier
  30 req/min, ingen klar åben licenserklæring fundet. Kun egnet som mindre
  supplerende artwork/bio-kilde, ikke som fundament.
- **Genius API** — sangtekster + begrænset metadata/annotationer. Gratis til
  ikke-kommercielt brug, OAuth til brugerhandlinger. Kunne fodre en fremtidig
  "tekstuelt tema"-discovery-vinkel; uden for scope for v0.1–v0.3.
- **Wikidata / Cover Art Archive** — begge CC0/CC-BY-licenserede og
  MBID-koblede. Gode supplerende gratis billed-/faktakilder, når MusicBrainz
  først er identitets-rygraden.

---

## Sammenligningstabel

| Kilde | Recommendations | Metadata | Similar artists/tracks | Kommercielt OK | OAuth påkrævet | Rate limit | Fit (1–10) |
|---|---|---|---|---|---|---|---|
| Last.fm | Ja (similarity) | Delvis (tags) | Ja, begge | Nej (aftale krævet) | Nej (kun til skrivning) | 5 req/s pr. IP | 7 |
| MusicBrainz | Nej | Ja (kanonisk) | Nej | Ja (CC0-kerne) | Nej | ~1 req/s pr. IP | 8 |
| ListenBrainz | Ja (CF-motor) | Nej (låner MB) | Ja (artist, spæd) | Ja (uklart, ingen spærring fundet) | Kun til personlige kald | Dynamisk/header-baseret | 9 |
| Discogs | Nej | Ja (styles/pressning) | Nej | Ja (med undtagelser) | OAuth1.0a (bruger-data) | 60/min auth. | 5 |
| Spotify Web API | Nej (lukket nov. 2024) | Ja (krympende) | Nej | Nej (250k MAU-krav) | Ja (PKCE) | 30s vindue, 5 brugere i Dev Mode | 6 |
| Deezer | Delvis (related/radio) | Ja | Delvis | Nej (aftale krævet) | Ja (personlige data) | ~50/5s | 5 |
| Apple Music | Ja (kun abonnenter) | Ja | Nej (ikke separat) | Ja ($99/år) | Ja (MusicKit-specifik) | Ikke offentliggjort | 3 |

---

## Anbefalet arkitektur for Music DNA

| Funktion | Primær kilde | Sekundær / fremtidig | Begrundelse |
|---|---|---|---|
| **Login** | Spotify (OAuth PKCE) | Apple Music (kun hvis vi understøtter Apple Music-brugere) | Det er der brugerens identitet og reelle lyttekontekst allerede er. Ingen åben kilde kan erstatte "brugerens egen konto". |
| **Bibliotek** (playlister, gemte sange) | Spotify (`/me/playlists`, `/playlists/{id}/items`) | — | Samme begrundelse som login — det er brugerens egne data. Bemærk: feb. 2026-omdøbningen til `/items` og "kun ejede/collaborative playlister" er endnu ikke reflekteret i vores eget `modules/spotify/endpoints.ts` — flagges her som en opfølgningsopgave, **rettes ikke** i dette research-dokument. |
| **Metadata** (kanonisk identitet, genre, krediteringer) | MusicBrainz (CC0, MBID som fælles nøgle) | Discogs (styles/pressning), Cover Art Archive/Wikidata (billeder/fakta) | MusicBrainz er den neutrale, licensfri rygrad der lader os koble alle andre kilder sammen uden at være låst til én streamingtjenestes ID-rum. |
| **Discovery** (finde reelt nye kandidater) | ListenBrainz (`cf/recommendation`, fresh releases) | Last.fm-similarity, Deezer related/radio | ListenBrainz er den eneste kilde i rapporten der er en *rigtig* anbefalingsmotor, samtidig åben og uden kommerciel spærring. Spotify er eksplicit udelukket (jf. `SpotifyRecommendationProvider`s `@deprecated`-status). |
| **Similar artists** | Last.fm (`artist.getSimilar`, moden dækning) | ListenBrainz Labs `similar-artists` (åben, MBID-native, spæd dækning) | Kombineres via den eksisterende multi-provider-arkitektur (`providerConfig.ts`) — ingen af dem behøver være eneste sandhed. |
| **Similar tracks** | Last.fm (`track.getSimilar`) | ListenBrainz (efterhånden som Labs-datasæt modnes) | Last.fm er i dag den eneste kilde med reel track-til-track-similarity i bred dækning. |
| **Ranking** | Lokal (`modules/ranking`, `SimpleRanker`) | — | Ranking bør aldrig afhænge af én kildes egen opfattelse af "bedst" — derfor er det allerede sit eget modul, uafhængigt af enhver provider. Fremtidig forbedring: berig `UserProfile`/ranking-regler med MusicBrainz-kanoniske genre-tags og ListenBrainz-lyttestatistik, stadig regelbaseret — kræver ikke AI for at blive bedre. |

**Kernestrategi:** Spotify er data*kilde* for identitet/bibliotek — aldrig
discovery-*partner*. ListenBrainz og Last.fm (begge fra MetaBrainz-økosystemet
og CBS/Last.fm) er de reelle discovery-motorer at bygge videre på, med
MusicBrainz som det licensfri ID-lag der binder det hele sammen. Dette matcher
allerede den provider-arkitektur der er bygget (`RecommendationProvider`,
`providerConfig.ts`, `SimpleRanker`) — næste naturlige skridt er en
`ListenBrainzRecommendationProvider` og en `LastFmRecommendationProvider` med
rigtige API-kald i stedet for mock-data, ikke en ny arkitektur.

---

## Risici og åbne spørgsmål

- **Last.fm og Deezer** spærrer begge kommerciel brug bag en manuel
  partneraftale — skal afklares (eller budgetteres som juridisk opgave) før
  nogen form for monetisering.
- **Spotify har strammet sine udvikler-vilkår tre gange på ~16 måneder**
  (nov. 2024, maj 2025, feb. 2026), hver gang mere restriktivt. Enhver
  Spotify-funktionalitet bør behandles som "lånt, ikke ejet" — hold
  login-/bibliotek-laget udskifteligt.
- **ListenBrainz' anbefalingsdækning er reel, men brugerbasen er ordner af
  størrelse mindre end Spotifys** — forvent tyndere/plettede kandidatpuljer
  for nichesmag, i hvert fald indledningsvist.
- **Feb. 2026-ændringen hos Spotify omdøber `/playlists/{id}/tracks` til
  `/items`** og begrænser resultater til ejede/collaborative playlister.
  Vores eksisterende `getPlaylistTracks` i `modules/spotify/endpoints.ts`
  kalder stadig den gamle sti og bør opdateres i en separat, fremtidig opgave
  — flagget her, **ikke rettet**, jf. denne opgaves "ingen kode"-scope.
- **Licens-due-diligence er ikke juridisk rådgivning.** Alt ovenstående er
  baseret på offentligt tilgængelig dokumentation og bør bekræftes direkte
  med hver tjeneste før en kommerciel lancering.

---

## Kilder

- [Last.fm API Terms of Service](https://www.last.fm/api/tos)
- [Last.fm API Docs](https://www.last.fm/api/intro)
- [artist.getSimilar](https://www.last.fm/api/show/artist.getSimilar) · [track.getSimilar](https://www.last.fm/api/show/track.getSimilar)
- [MusicBrainz — About / Data License](https://musicbrainz.org/doc/About/Data_License)
- [MusicBrainz API / Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [ListenBrainz API docs](https://listenbrainz.readthedocs.io/en/latest/users/api/index.html)
- [ListenBrainz — Recommendations](https://listenbrainz.readthedocs.io/en/latest/users/api/recommendation.html)
- [ListenBrainz Labs — similar-artists dataset](https://labs.api.listenbrainz.org/similar-artists)
- [Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)
- [Discogs Developer Docs](https://www.discogs.com/developers)
- [Spotify — Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify — Introducing some changes to our Web API (nov. 2024)](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- [Spotify — Updating the Criteria for Web API Extended Access (maj 2025)](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access)
- [Spotify — Update on Developer Access and Platform Security (feb. 2026)](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
- [Spotify — Web API Changelog, februar 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [Spotify — February 2026 Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [TechCrunch — Spotify changes developer mode API to require premium accounts, limits test users](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Deezer for Developers — Terms of Use](https://developers.deezer.com/termsofuse)
- [Deezer FAQs For Developers](https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers)
- [Apple — MusicKit](https://developer.apple.com/musickit/)
- [Apple Music API docs](https://developer.apple.com/documentation/applemusicapi/)
- [AcousticBrainz — Making a hard decision to end the project](https://blog.metabrainz.org/2022/02/16/acousticbrainz-making-a-hard-decision-to-end-the-project/)
- [TheAudioDB — Free Music API Documentation](https://www.theaudiodb.com/free_music_api)
