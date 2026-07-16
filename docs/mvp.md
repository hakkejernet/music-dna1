# Music DNA — MVP 1.0

**Formål med dette dokument:** definere hvad "version 1.0" faktisk betyder,
før vi bygger mere arkitektur. Ren analyse — ingen kode er ændret som del af
dette dokument.

---

## 1. Hvem er produktet til?

Folk der allerede har et etableret Spotify-bibliotek (eller lignende) og er
**trætte af den lukkede, algoritme-styrede discovery** de får fra
streamingtjenesten selv — Discover Weekly der gentager sig, anbefalinger der
tydeligt er payola/playlist-placering, "mere af det samme" i stedet for reelt
nyt. Det er musiknørder, playliste-kuratorer og folk der aktivt leder efter
niche/ny musik, ikke folk der bare vil have baggrundsmusik.

De er villige til at logge ind med deres eksisterende Spotify-konto (ingen ny
konto, intet nyt bibliotek at bygge op), men bruger *ikke* Music DNA til at
afspille musik — de bruger det til at *finde* musik og lytter så andetsteds
(Spotify, Bandcamp, køb af vinyl, whatever).

## 2. Hvilket problem løser det?

Mainstream streaming-anbefalinger er en sort boks: brugeren ved ikke *hvorfor*
en sang blev foreslået, og algoritmerne er i stigende grad kommercielt
optimerede (label-aftaler, playlist-placering) frem for smags-optimerede.
Samtidig er de åbne, gennemsigtige datakilder (Last.fm, ListenBrainz,
MusicBrainz — jf. `docs/data-sources.md`) stort set ubrugte af almindelige
lyttere, fordi ingen har bygget en ordentlig, forklarlig UI oven på dem.

Music DNA løser: **"Vis mig én ny sang ad gangen, fortæl mig præcis hvorfor
den blev foreslået, og lad mig reagere hurtigt (gem/afvis/kendte den
allerede) — uden at det er endnu en afspiller eller endnu en Spotify-klon."**

## 3. Hvad er den absolut vigtigste funktion?

**Discovery-loopet med en ægte (ikke-mock) anbefaling og en ægte forklaring.**
Ikke dashboardet, ikke ranking-finpudsning, ikke flere providers. Hvis en
bruger logger ind og ser **én rigtig, forklaret anbefaling** de kan reagere
på, er kernen leveret. Alt andet i kodebasen understøtter det ene loop.

Konkret er der to huller der **skal** lukkes før det er sandt i dag (se
kritisk gennemgang nederst):

- Discovery viser i dag enten Last.fm-mock-data eller (hvis Spotify nogensinde
  genåbner `/recommendations`) Spotify-mock-lignende data — **ingen rigtig
  ekstern anbefaling er koblet på endnu**.
- "Hvorfor denne?"-panelet viser stadig hardkodet placeholder-tekst, **koblet
  fra** de `explanations` som `SimpleRanker` allerede genererer pr. sang.

## 4. Hvad er IKKE en del af MVP?

- AI/ML-baserede anbefalinger (fastholdt fra alle tidligere opgaver).
- Fuld afspilning af musik — kun 30-sek. preview eller "ikke tilgængelig".
  Dette er ikke en midlertidig begrænsning, det er identiteten: **ikke en
  afspiller**.
- Flere login-udbydere (Apple Music, osv.) — kun Spotify.
- Social discovery (følge venner, dele fund, sammenligne Music DNA).
- Eksport af "gemte" sange til en Spotify-playlist eller andet format.
- Desktop-app / SQLite-lag (nævnt i det oprindelige oplæg, men web +
  IndexedDB er hvad der reelt er bygget, og er nok til MVP).
- Avanceret ranking-tuning (vægte som brugeren kan justere, A/B-testet
  scoring) — `SimpleRanker`s faste regler er nok til v1.
- Automatiseret test-suite / CI-pipeline (mangler helt i dag — se kritisk
  gennemgang).
- Flersprogethed (UI er dansk i dag).

## 5. Hvilke features udskydes til v2.0?

- Flere **rigtige** anbefalings-providers kørende samtidig (Last.fm +
  ListenBrainz), med reel sammenligning af, hvornår `SimpleRanker`s
  "flere kilder enige"-regel rent faktisk gør en forskel.
- Apple Music som ekstra login/bibliotek-kilde.
- Discogs/MusicBrainz-baseret metadata-berigelse (styles, krediteringer) ud
  over det Spotify selv giver.
- Genre-/stemnings-styret discovery ("vis mig kun elektronisk" / "overrask
  mig helt").
- Eksport af gemte sange til en Spotify-playlist.
- Social/deling.
- Rigtig test-suite og CI.

## 6. Hvilke KPI'er afgør om projektet er en succes?

| KPI | Hvad den viser |
|---|---|
| **Aktivering**: % af nye brugere der gennemfører login + første sync | Er onboarding-friktionen for høj? |
| **Kerne-engagement**: gennemsnitligt antal swipes (Gem/Afvis/Kendte/Næste) pr. session | Bruges selve loopet, eller giver folk op efter 1-2 sange? |
| **Gem-rate**: andel anbefalinger der bliver gemt | Direkte mål for anbefalingskvalitet — det tal `SimpleRanker` i sidste ende skal optimere |
| **"Kendte allerede"-rate** | Højt tal = vi anbefaler ting brugeren allerede kender → discovery-motoren fejler i sit ene job |
| **Retention**: andel brugere der kommer tilbage inden for 7 dage | Er det værd at vende tilbage til, eller er det en engangs-nyhed? |
| **"Hvorfor denne?"-engagement**: % der åbner panelet | Bekræfter (eller afkræfter) at gennemsigtighed rent faktisk er en værdi brugerne vil have |
| **Teknisk sundhed**: fejlrate på Spotify-auth, tid til første anbefaling | Er fundamentet stabilt nok til at de andre tal betyder noget? |

---

## Prioriteret roadmap (MoSCoW)

Kompleksitet: **S** (timer–1 dag), **M** (2–4 dage), **L** (1–2 uger),
**XL** (2+ uger). Værdi: Lav / Middel / Høj / Kritisk.

### MUST HAVE

| Feature | Kompleksitet | Værdi | Afhængigheder |
|---|---|---|---|
| Spotify OAuth-login (PKCE) | Færdig | Kritisk | — |
| Bibliotek-sync til IndexedDB | Færdig | Kritisk (fødekilde for ranking) | Spotify-login |
| Discovery-loop UI (kort, knapper, why-panel) | Færdig | Kritisk | — |
| **Mindst én rigtig (ikke-mock) recommendation-provider** | L | Kritisk | Se kritisk gennemgang — anbefaler Last.fm først, ikke ListenBrainz |
| **"Gem" skal faktisk gemme noget** (i dag: ren UI-handling uden lagring) | S | Høj | Lokal storage (findes allerede) |
| **Koble `RankedRecommendation.explanations` til "Hvorfor denne?"-panelet** (i dag: hardkodet placeholder) | S | Høj | `modules/ranking` (findes allerede) |
| Tydelig "ingen flere anbefalinger lige nu"-tilstand i produktion (mock må ikke være det brugeren reelt ser) | S | Høj | Rigtig provider |
| Basal fejlhåndtering/empty-states | Færdig | Høj | — |

### SHOULD HAVE

| Feature | Kompleksitet | Værdi | Afhængigheder |
|---|---|---|---|
| Music DNA-dashboard som sekundær side | Færdig | Middel | Bibliotek-sync |
| Anden rigtig provider (ListenBrainz) kørende parallelt med Last.fm | M | Middel–Høj | ID-mapping Spotify→MBID (se risici) |
| Simpelt onboarding-skærmbillede (hvad *er* det her, inden login) | S | Middel | — |
| Mulighed for at se/administrere sine gemte sange (en simpel liste) | M | Middel–Høj | "Gem" persisterer (must-have ovenfor) |
| Re-sync-UX-polish (progress, fejl-retry) | Færdig i store træk | Lav–Middel | — |

### COULD HAVE

| Feature | Kompleksitet | Værdi | Afhængigheder |
|---|---|---|---|
| Genre-/stemnings-filter på discovery-sessionen | M | Middel | Genre-data pr. anbefaling (findes delvist) |
| Eksportér gemte sange til en Spotify-playlist | M | Middel | Kræver skrive-scope til Spotify (ny OAuth-scope) |
| Deezer/Discogs som metadata-berigelse | M | Lav–Middel | — |
| Manuel lys/mørk-tema-vælger (i dag kun `prefers-color-scheme`) | S | Lav | — |
| Apple Music som ekstra login-udbyder | L | Lav (indtil vi rent faktisk har Apple Music-brugere) | MusicKit, $99/år developer-konto |

### WON'T HAVE (v1)

| Feature | Hvorfor ikke |
|---|---|
| AI/ML-anbefalinger | Eksplicit udelukket fra dag ét, og løser ikke det egentlige problem (gennemsigtighed) |
| Fuld musikafspilning | Kerne-identitet: "ikke en afspiller" |
| Native mobil-app | Web dækker målgruppen fint til MVP |
| Desktop/SQLite | Ingen efterspørgsel bekræftet endnu |
| Social/deling | Tilføjer kompleksitet uden at styrke kerne-loopet |
| Flersprogethed | Ingen bekræftet ikke-dansk brugergruppe endnu |
| Avanceret ranking-tuning/ML | `SimpleRanker` er nok, indtil data viser at den ikke er |

---

## Kritisk gennemgang: "Hvis vi skulle lancere om 14 dage, hvad ville du slette?"

Ærligt svar: **arkitekturen er allerede foran produktet.** Vi har bygget et
fleksibelt multi-provider-system med ranking-motor til at fodre et
Discovery-loop der i dag udelukkende viser mock-data. Det er den forkerte
rækkefølge til en 14-dages deadline. Her er hvad jeg konkret ville slette
eller skære væk:

1. **Slet `SpotifyRecommendationProvider` helt.** Den er allerede markeret
   `@deprecated`, den er ikke i den aktive provider-konfiguration, og
   Spotifys `/recommendations`-endpoint er lukket for os permanent (jf.
   `docs/data-sources.md`). Den koster ingen funktionalitet at fjerne — kun
   en fil, en afhængighed på `getRecommendedTracks`, og kognitiv belastning
   for enhver der læser koden og undrer sig over hvorfor der er en
   Spotify-provider når Spotify eksplicit ikke må være discovery-motoren.

2. **Kør kun med ÉN rigtig provider til lancering, ikke flere samtidig.**
   `providerConfig.ts`/`Promise.allSettled`-konkatenering/`SimpleRanker`s
   "flere kilder enige"-bonus er alle bygget til at understøtte flere
   samtidige providers — men vi har endnu ikke én eneste rigtig provider
   kørende. At forsøge at koble to rigtige API'er på samtidig inden for 14
   dage er unødvendig risiko. Byg Last.fm-integrationen, test den i
   produktion, og lad ListenBrainz vente til v2 (se punkt 4 nedenfor for
   hvorfor rækkefølgen er byttet om fra forrige researchdokument).

3. **Fjern (eller skjul bag et feature-flag) "flere kilder
   enige"-ranking-reglen** indtil der reelt er 2+ aktive providers. Den er i
   dag inaktiv kode der aldrig slår til — ærligt talt død vægt lige nu.

4. **Genvurdér rækkefølgen fra `docs/data-sources.md`: byg Last.fm-provideren
   først, ikke ListenBrainz.** Dette er en vigtig præcisering i forhold til
   den tidligere anbefaling. ListenBrainz er stadig det bedste **langsigtede**
   filosofiske match, men dens `cf/recommendation`-endpoint kræver at
   *brugeren selv* allerede har en lyttehistorik på ListenBrainz — det har en
   helt ny bruger, der lige har koblet sin Spotify-konto til Music DNA,
   naturligvis ikke. Last.fm kan derimod give reelle similarity-anbefalinger
   ud fra brugerens Spotify-topkunstnere (som vi allerede henter) uden at
   kræve en forudgående konto hos en tredje tjeneste. Til en 14-dages
   deadline er Last.fm den pragmatiske vej ind; ListenBrainz er den rigtige
   v2-investering, når vi kan tåle den lidt tyndere, spættede dækning og
   engangsomkostningen ved MBID-mapping.

5. **Overvej seriøst at skjule Music DNA-dashboardet fra navigationen ved
   lancering** (ikke slette koden — bare fjerne linket). Det er allerede
   færdigbygget og virker fint, så risikoen ved at beholde det er lav — men
   hvis fokus for de 14 dage skal være benhårdt på "ét loop, der virker med
   rigtige data", er dashboardet den funktion der distraherer mest fra det,
   uden at styrke det. Dette er en reversibel beslutning (én linje i
   `AppNav`), ikke en permanent sletning — men den tvinger et bevidst valg om
   hvad "færdigt" betyder for de 14 dage.

6. **De to reelle, uglamourøse huller skal lukkes før noget som helst andet:**
   "Gem" gemmer i dag intet (`advance('save')` i `DiscoveryPage.tsx` gør
   præcis det samme som "Næste"), og "Hvorfor denne?"-panelet viser stadig
   hardkodet placeholder-tekst i stedet for de `explanations` som
   `SimpleRanker` rent faktisk allerede beregner pr. anbefaling. Begge er
   små, veldefinerede opgaver (S-kompleksitet) — men uden dem lyver produktet
   reelt om sin egen kernefunktion over for brugeren.

7. **Ingen automatiserede tests findes i dag.** Til en rigtig lancering (med
   rigtige brugeres Spotify-konti) ville jeg som minimum ville kræve en
   manuel QA-tjekliste for login-flowet og fejlhåndtering, hvis der ikke er
   tid til en rigtig test-suite på 14 dage — men det bør ikke blokere
   lanceringen, hvis tiden er hamret.

**Kort sagt:** vi har et solidt, udvideligt skelet, men et skelet leverer
ikke værdi til en bruger. De 14 dage bør gå til at gøre **ét** rigtigt
provider-loop sandt, fra login til en forklaret, gemmelig anbefaling — ikke
til at gøre arkitekturen endnu mere fleksibel.
