# Spotify Embed som primær afspiller — teknisk research

**Formål:** Undersøge om Spotify Embed (iframe-widget) kan bruges som
primær afspiller i Music DNA. Ren research — ingen kode er ændret som del
af dette dokument, jf. konklusionen nedenfor.

**Dato:** Juli 2026.

---

## Hurtig konklusion

**Anbefaling: Brug ikke Spotify Embed som primær afspiller.** Den
afgørende blokker er punkt 5 nedenfor: **på mobil (inkl. iPhone Safari)
spiller embeddet altid kun 30-sekunders preview, uanset login eller
Premium-status.** Det er præcis den samme lyd-ceiling vi allerede har med
den eksisterende `<audio previewUrl>`-løsning — men Spotify Embed
tilføjer markant mere kompleksitet, en afhængighed vi ikke har opfyldt
(rigtige Spotify track-ID'er, se "Konkret problem i vores kodebase"), og
et branding-krav der trækker produktet i retning af at *være* en
afspiller. Se "Anbefalet alternativ" for hvad vi bør gøre i stedet.

---

## De 8 spørgsmål

### 1. Kan Spotify Embed afspille musik direkte i browseren?

Ja. Et `<iframe>` der peger på `https://open.spotify.com/embed/track/<ID>`
renderer en selvstændig afspiller (cover, titel, play-knap, progress bar)
og afspiller lyd direkte i browseren uden at forlade siden.

### 2. Kræver det Premium?

Delvist, og situationen er mere restriktiv end den ofte fremstilles:

- **Ikke logget ind**: altid kun 30-sekunders preview, uanset enhed.
- **Logget ind (fra selve embeddets egen login-prompt, ikke vores
  app-login)**: kan give fuld sang — **men kun på desktop**. Spotifys
  egen supportdokumentation for embedded players er eksplicit: *"On
  mobile devices it will only ever embed the preview-length track, and
  on desktops it will default to full track"* for autentificerede
  brugere.
- Der er ingen streng Premium-only-spærring dokumenteret for embeds
  specifikt (i modsætning til Web Playback SDK, som kræver Premium) —
  men adskillige community-tråde rapporterer inkonsistent adfærd
  ("only showing preview even though logged in"), så selv på desktop er
  fuld afspilning ikke garanteret pålidelig.

### 3. Virker det på iPhone Safari?

Embeddet **loader og virker** i iPhone Safari (det er et almindeligt
iframe, ingen kendte blokerende kompatibilitetsproblemer for selve
visningen). Men afspilningen er begrænset til **kun 30-sekunders
preview** på mobil — jf. punkt 2. Der er desuden dokumenterede,
langvarige problemer med iOS Safaris autoplay-politik for Spotifys
web-afspilningsløsninger generelt (Web Playback SDK): kommandoer der ikke
stammer direkte fra en brugerhandling i samme synkrone kald bliver
klassificeret som autoplay og blokeret. Embeddets egen play-knap (et
direkte brugerklik) undgår typisk dette, men bekræfter blot at
mobilafspilning i Spotifys web-løsninger generelt er skrøbelig.

### 4. Virker det i en PWA/GitHub Pages?

Ja, rent teknisk. Et iframe der peger på et andet domæne (`open.spotify.com`)
fungerer identisk om det er hostet på GitHub Pages, i en PWA, eller
andre steder — der er ingen CSP/frame-restriktion fra vores side der
blokerer det (vi embedder *deres* indhold, ikke omvendt), og Spotify
tillader eksplicit at deres embed-URL'er frames på tredjepartssider (det
er hele formålet med embed-produktet). Ingen ekstra opsætning nødvendig
ud over selve iframe-tagget.

### 5. Kan man afspille hele sangen eller kun preview?

Som opsummeret i punkt 1-3: **hele sangen kun på desktop, og kun hvis
brugeren logger ind i selve embeddet.** På mobil (hvor Music DNA
sandsynligvis har en stor del af sine brugere, jf. hele denne sessions
udfordring med at oprette Spotify-appen fra en iPhone) er det **altid
kun 30-sekunders preview** — nøjagtig samme grænse som vores nuværende
`previewUrl`-tilgang, blot uden den ekstra iframe-kompleksitet.

### 6. Kan vi embedde et track ud fra Spotify Track ID?

Ja, direkte: `<iframe src="https://open.spotify.com/embed/track/{TRACK_ID}" ...>`.
Ingen API-nøgle eller OAuth nødvendig for selve visningen — det er en
offentlig URL. **Men** det kræver et **rigtigt Spotify track-ID**, og det
er her vores konkrete arkitektur-problem opstår — se næste afsnit.

### 7. Kan vi styre afspilleren via JavaScript (play/pause/next)?

Ja, via Spotifys **iFrame API** (separat fra selve embed-iframen):

- Indlæses via `<script src="https://open.spotify.com/embed/iframe-api/v1"></script>`
- Giver et `EmbedController`-objekt med metoder: `play()`, `pause()`,
  `resume()`, `togglePlay()`, `seek()`, `loadUri()` (til at skifte
  track uden at genindlæse hele iframen — dét er vejen til en
  "næste sang"-oplevelse)
- Events via `addListener('ready', ...)` og `addListener('playback_update', ...)`
- Community-rapporter peger på at API'et til tider opfører sig
  uforudsigeligt (`play()` der ikke starter afspilning korrekt,
  `togglePlay()` uden effekt i visse browsere) — dokumenteret, men ikke
  officielt anerkendt/rettet af Spotify.

### 8. Begrænsninger og licenskrav

- **Branding**: al brug af Spotify-metadata (cover, titel, kunstner,
  lyd) skal ledsages af Spotify-logoet. Man må ikke beskære cover-art,
  lægge tekst/kontroller oven på det, eller placere eget brand oven på
  artworket.
- **Ingen co-branding**: Spotifys brand må ikke bruges sammen med andre
  brands i samme kommunikation — relevant hvis vi nogensinde viser
  Last.fm- og Spotify-kilder side om side i samme visuelle element.
- **Ingen autoplay, ingen loop**: eksplicit ikke understøttet af
  embed-iframen.
- **Developer Terms of Service** gælder for al brug af embed-ressourcer,
  samt Spotifys slutbruger-aftale/privatlivspolitik for selve
  afspilningen.
- **Ingen download/redistribution** af lyden — kun streaming via
  Spotifys egen infrastruktur, hvilket embed-modellen i sagens natur
  overholder (vi rører aldrig selve lyddataen).

---

## Konkret problem i vores kodebase

Uafhængigt af ovenstående begrænsninger er der et arkitektur-problem der
gør Spotify Embed svært at bruge i praksis lige nu: **vores aktive
anbefalings-kilde (`LastFmRecommendationProvider`) leverer ikke rigtige
Spotify track-ID'er.** `SpotifyTrack.id` for en Last.fm-sporet anbefaling
er enten et MusicBrainz-mbid eller en syntetisk slug (se
`modules/recommendations/lastFmProvider.ts`), aldrig et Spotify-ID. For
at kunne embedde disse tracks via Spotify skulle vi enten:

- Tilføje et nyt Spotify search-kald pr. anbefaling for at matche
  kunstner+titel til et Spotify track-ID (endnu et API-kald pr. sang,
  upålideligt matching, og et brud med "ingen nye API-kald"-disciplinen
  der har præget de seneste opgaver), eller
- Kun tilbyde embed for de (i dag ikke-aktive) Spotify-sporede
  anbefalinger.

Begge er reel ekstra kompleksitet for en gevinst der, jf. punkt 5, reelt
er nul på mobil.

---

## Missionskonflikt

Værd at sige højt: opgaven beder om at undersøge Spotify Embed som
**"primær afspiller"** — men Music DNAs erklærede identitet siden dag ét
har været **"Ikke en musikafspiller. Ikke en Spotify-klon. Kun
discovery."** En primær, fuld-sang, JS-styret afspiller (med
play/pause/next) er funktionelt en afspiller, uanset om lyden kommer fra
Spotify. Det er ikke min beslutning at træffe, men det bør være et
bevidst valg, ikke en implementeringsdetalje der glider ind af sig selv —
især når den tekniske gevinst (jf. ovenstående) er så begrænset på
mobil.

---

## Anbefalet alternativ

Behold den nuværende, lette tilgang, og udvid den i stedet for at
erstatte den:

1. **Behold `previewUrl`-baseret 30-sekunders preview** (allerede
   bygget, `PreviewPlayer`-komponenten) som standard — den virker
   overalt, kræver intet branding, og har samme reelle lydlængde på
   mobil som Spotify Embed ville give.
2. **Tilføj et "Åbn i Spotify"-link** (eller Last.fm/anden kildes
   tilsvarende) der bruger et `spotify:track:{id}`-URI eller
   `https://open.spotify.com/track/{id}`-link, når vi rent faktisk har
   et ægte Spotify-ID. Det sender brugeren til Spotifys egen app/side
   for at høre hele sangen — nul branding-krav, nul JS-kontrol-kompleksitet,
   og det er *tydeligt* discovery ("gå lyt der"), ikke *afspilning*
   ("lyt her"). Dette kræver dog stadig et ægte Spotify-ID pr. track,
   som i dag kun findes for Spotify-sporede (ikke Last.fm-sporede)
   anbefalinger.
3. Hvis fuld-sang-afspilning nogensinde bliver en eksplicit produktbeslutning
   (ikke bare en teknisk mulighed), er **Spotify Embed stadig det rigtige
   værktøj at vende tilbage til** frem for Web Playback SDK — Web
   Playback SDK kræver *hård* Premium (ikke bare "kan give fuld sang på
   desktop"), har samme eller værre iOS Safari-autoplay-problemer, og
   kræver en markant tungere integration (device-registrering,
   afspilnings-overdragelse). Embed er den lette variant af de to
   Spotify-løsninger — den er bare ikke let nok til at retfærdiggøre
   kompleksiteten lige nu, givet mobil-begrænsningen.

**Ingen prototype bygget** (`/embed-test` findes ikke) — jf. opgavens
egen betingelse ("hvis Spotify Embed ikke er en god løsning, dokumentér
præcis hvorfor") er konklusionen at det ikke er en god løsning til formålet
"primær afspiller", så en prototype ville ikke tilføje ny viden ud over
denne dokumentation.

---

## Kilder

- [Embeds — Spotify for Developers](https://developer.spotify.com/documentation/embeds)
- [iFrame API — Spotify for Developers](https://developer.spotify.com/documentation/embeds/references/iframe-api)
- [Using the iFrame API — Spotify for Developers](https://developer.spotify.com/documentation/embeds/tutorials/using-the-iframe-api)
- [Creating an Embed — Spotify for Developers](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)
- [Design & Branding Guidelines — Spotify for Developers](https://developer.spotify.com/documentation/design)
- [Embedded players — Spotify Support (for artists)](https://support.spotify.com/us/artists/article/embedded-players/)
- [Web Playback SDK — Spotify for Developers](https://developer.spotify.com/documentation/web-playback-sdk)
- [Getting Started with Web Playback SDK — Spotify for Developers](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started)
- [Spotify Community — "Only showing preview"](https://community.spotify.com/t5/Spotify-for-Developers/Only-showing-preview/td-p/5485141)
- [Spotify Community — "Embed code: full songs vs preview"](https://community.spotify.com/t5/Spotify-for-Developers/Embed-code-full-songs-vs-preview/td-p/5514126)
- [Spotify Community — "Spotify Album Embed only playing preview even though logged in"](https://community.spotify.com/t5/Spotify-for-Developers/Spotify-Album-Embed-only-playing-preview-even-though-logged-in/td-p/5615898)
- [Spotify Community — "Iframe embedcontroller.play() broken"](https://community.spotify.com/t5/Spotify-for-Developers/Iframe-embedcontroller-play-broken/td-p/5820105)
- [Spotify Community — Web Playback SDK iOS Safari/Chrome issues](https://community.spotify.com/t5/Spotify-for-Developers/Spotify-Web-SDK-iOS-Safari-Chrome-Playback-Issues-Setting-Volume/td-p/5316263)
