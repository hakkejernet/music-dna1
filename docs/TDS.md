# Music DNA Rebuilt — Technical Design Specification (TDS)

**Status:** Udkast. Oversætter `docs/PRD.md` (godkendt og låst) til
konkrete softwarekomponenter. Ingen produktionskode er skrevet som del
af dette dokument, og ingen implementering starter før dette er
godkendt.

**Forudsætning:** Læseren har læst `docs/PRD.md`. Dette dokument
gentager ikke *hvorfor* — kun *hvordan systemet er struktureret* for at
opnå det.

---

## 1. Systemoversigt

Ti moduler, hver med ét ansvar, forbundet af faste datakontrakter. Intet
modul kalder et andet uden om denne kæde.

```
                    ┌──────────────┐
                    │   spotify    │  (login, bibliotek, afspilning)
                    └──────┬───────┘
                           │ biblioteks-snapshot (kun ved cold start)
                           ▼
                    ┌──────────────┐
                    │  user-dna    │◀────────────────────────┐
                    └──────┬───────┘                          │
                           │ UserDNA                          │
                           ▼                                  │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  candidate-  │───▶│ enrichment   │───▶│  track-dna   │      │
│  providers   │    └──────────────┘    │  (skema)     │      │
└──────┬───────┘                        └──────┬───────┘      │
       │ Candidate[]                            │ TrackDNA[]   │
       │                                         ▼              │
       │                                  ┌──────────────┐      │
       │                                  │   ranking    │◀─────┘
       │                                  └──────┬───────┘
       │                                         │ RankedCandidate[]
       │                                         ▼
       │                                  ┌──────────────┐
       │                                  │    queue     │
       │                                  └──────┬───────┘
       │                                         │ én ad gangen
       │                                         ▼
       │                                  ┌──────────────┐
       │                                  │  discovery   │──▶ (spotify: afspilningslink)
       │                                  └──────┬───────┘
       │                                         │ reaktion
       │                                         ▼
       │                                  ┌──────────────┐
       │                                  │  feedback    │
       │                                  └──────┬───────┘
       │                                         │ FeedbackEvent
       │                          ┌──────────────┼──────────────┐
       │                          ▼                              ▼
       │                   ┌──────────────┐             ┌──────────────┐
       │                   │  user-dna    │             │  analytics   │
       │                   │  (opdatering)│             └──────┬───────┘
       │                   └──────────────┘                     │
       │                                     provider-kvalitet   │
       └─────────────────────────────────────────────────────────┘
```

To lukkede feedback-loops er med vilje en del af arkitekturen, ikke en
fejl i diagrammet:

1. **feedback → user-dna → ranking (næste session)** — det er selve
   mission-mekanismen (afsnit 2 i PRD'et).
2. **feedback → analytics → candidate-providers** — providers vægtes
   over tid efter hvor gode deres kandidater faktisk viser sig at være,
   uden at nogen har hårdkodet en rangering af kilder.

---

## 2. Moduler

For hvert modul: ansvar, input, output, og — lige så vigtigt — hvad
det **ikke** må gøre. Grænserne er ikke forslag; de er det der
forhindrer v1's fejl (recommendation-kilde og produktoplevelse for
sammenflettet til at fejlfinde) i at gentage sig.

### spotify
- **Ansvar:** OAuth-login, læsning af brugerens bibliotek (playlister,
  gemte sange, topkunstnere), og et afspilningslink til en given sang
  hos Spotify.
- **Input:** OAuth-callback, token-refresh, biblioteks-forespørgsler.
- **Output:** autentificeringsstatus, rå biblioteksdata (kun brugt af
  `user-dna` til cold start), en afspilnings-URL (brugt af `discovery`).
- **Må IKKE:** levere kandidat-sange, tage en ranking-beslutning, eller
  blive kaldt af noget modul udover `user-dna` (cold start) og
  `discovery` (afspilningslink).

### candidate-providers
- **Ansvar:** Hente rå kandidat-sange fra én eller flere udskiftelige
  eksterne kilder, samle dem i én dedupliceret pulje, mærke hver med sin
  oprindelse.
- **Input:** en forespørgsel om et antal kandidater, provider-
  konfiguration (hvilke kilder er aktive), og en provider-kvalitets-
  vægtning fra `analytics` (ikke User DNA — se nedenfor).
- **Output:** `Candidate[]` — rå, uscoreret, urangeret.
- **Må IKKE:** kende `UserDNA`, score eller rangere noget, eller vide
  hvordan en kandidat senere vises.

### enrichment
- **Ansvar:** Omsætte hver `Candidate` til en `TrackDNA` — udfylde så
  mange signaler som muligt, hver med en confidence, uanset hvor rig
  eller sparsom kildedataen er.
- **Input:** `Candidate`.
- **Output:** `TrackDNA`.
- **Må IKKE:** kende `UserDNA`, beslutte om en sang er "god", eller
  fjerne en kandidat fra puljen ved delvis enrichment (det er normalt,
  ikke en fejl — se afsnit 7).

### track-dna
- **Ansvar:** Eje selve `TrackDNA`-**skemaet** — den fulde katalog af
  signaler (navn, kategori, gyldigt værdiområde, beskrivelse), og
  validere/normalisere data fra enrichment til dette skema. Dette er
  substantivet (skemaet); `enrichment` er verbet (processen der udfylder
  det).
- **Input:** rå enrichment-output.
- **Output:** en skema-valideret `TrackDNA`.
- **Må IKKE:** selv hente data, eller kende brugeren.

### user-dna
- **Ansvar:** Eje `UserDNA`-skemaet (samme signal-navnerum som
  `TrackDNA`), beregne cold-start-DNA fra Spotify-biblioteket, og
  opdatere DNA'et løbende ud fra `FeedbackEvent`.
- **Input:** biblioteks-snapshot (kun ved cold start), `FeedbackEvent`
  (løbende).
- **Output:** aktuel `UserDNA`.
- **Må IKKE:** hente kandidater, kalde `candidate-providers` direkte,
  eller vise noget til brugeren.

### ranking
- **Ansvar:** Sammenligne `UserDNA` med en pulje af `TrackDNA` og
  producere en `RankedCandidate` (score 0-100 + forklaringer) for hver.
- **Input:** `UserDNA`, `TrackDNA[≤500]`, (valgfrit) provider-
  kvalitetsvægte fra `analytics`.
- **Output:** `RankedCandidate[]`, sorteret.
- **Må IKKE:** kalde en provider direkte, kende brugerens
  Spotify-identitet, eller vise noget selv.

### feedback
- **Ansvar:** Fange og strukturere brugerreaktioner som
  `FeedbackEvent`, persistere dem permanent, og distribuere dem til
  `user-dna` og `analytics`.
- **Input:** en reaktion fra `discovery` (reaktionstype + hvilken
  `RankedCandidate` + sessionskontekst).
- **Output:** en persisteret `FeedbackEvent`.
- **Må IKKE:** selv beregne DNA-ændringer (det er `user-dna`s job),
  eller beslutte hvad der vises næste (det er `queue`s job).

### queue
- **Ansvar:** Holde den aktuelle sessions rækkefølge af
  `RankedCandidate`, levere "næste", og aldrig genbruge en allerede
  afgjort sang inden for sessionen (ikke-cyklisk — allerede løst i v1,
  genbruges direkte).
- **Input:** `RankedCandidate[]` fra `ranking`.
- **Output:** én `RankedCandidate` ad gangen, eller et "tom"-signal.
- **Må IKKE:** hente nye kandidater selv, score noget, eller kende
  hvordan en sang blev fundet/scoret udover det den fik leveret.

### discovery
- **Ansvar:** Vise én sang, indsamle én reaktion, vise "Hvorfor denne?",
  og udstille et afspilningslink (via `spotify`).
- **Input:** `RankedCandidate` fra `queue`, brugerinteraktion.
- **Output:** en reaktion (til `feedback`), en "vis næste" (til `queue`).
- **Må IKKE:** kende ranking-logik, providers, eller DNA-beregninger.

### analytics
- **Ansvar:** Aggregere PRD'ets metrics (Save Rate, Playlist Rate,
  Preview Completion Rate, Spotify Open Rate, Negative Feedback Rate,
  Discovery Novelty Rate) samt tekniske observability-signaler, og
  levere provider-kvalitetsvægte tilbage til `candidate-providers`.
- **Input:** `FeedbackEvent`, `RecommendationSession`, providerkald-
  udfald fra `candidate-providers`.
- **Output:** aggregerede metrics, provider-kvalitetsvægte.
- **Må IKKE:** ændre brugerdata, eller blokere/forsinke
  `discovery`-flowet (skal være asynkront, best-effort).

---

## 3. Datamodeller

Kun felter, betydning og relationer — ingen kode.

### SignalDefinition (katalog-post, ejet af `track-dna`)
| Felt | Betydning |
|---|---|
| signalKey | Unik nøgle (fx `energy`, `trap`, `mainstream`) |
| category | Akustisk / Genre / Kulturel / Struktur (jf. PRD-arkitekturens 4 grupper) |
| valueRange | Gyldigt værdiområde (fx -1..1) |
| description | Menneskelig-læsbar beskrivelse — bruges direkte i "Hvorfor denne?" |

### UserDNA
| Felt | Betydning |
|---|---|
| userId | Lokal reference til den Spotify-autentificerede bruger |
| signals | Map fra signalKey → (værdi, confidence) for hvert signal i kataloget |
| coldStart | Boolean — er dette stadig udelukkende bibliotek-udledt, eller er mindst ét `FeedbackEvent` blevet indarbejdet |
| sourceLibrarySnapshotRef | Reference til hvilket biblioteks-snapshot cold start blev udledt af (auditerbarhed) |
| version / updatedAt | Tidsstempel for sidste opdatering — gør smagsdrift over tid inspicérbar |

**Relation:** ét `UserDNA` pr. bruger, kontinuerligt opdateret — ikke
historik af snapshots i selve modellen (historik rekonstrueres fra
`FeedbackEvent`-loggen, se afsnit 6).

### TrackDNA
| Felt | Betydning |
|---|---|
| trackId | Intern, kanonisk identifikator — uafhængig af enkelte providers ID-skemaer |
| signals | Samme form som `UserDNA.signals`: map fra signalKey → (værdi, confidence) |
| sourceCandidateRef | Reference til den `Candidate` den blev beriget fra |
| enrichmentCompleteness | Samlet dækningsgrad — hvor stor en andel af kataloget fik en non-triviel confidence |

**Relation:** én `TrackDNA` pr. `Candidate`. Samme signal-navnerum som
`UserDNA` — det er forudsætningen for at `ranking` kan sammenligne dem
direkte (PRD designprincip: "ét sprog for bruger og sang").

### Candidate
| Felt | Betydning |
|---|---|
| candidateId | Intern identifikator |
| title, artists | Grundlæggende identitet |
| externalIds | Hvad providern leverede (isrc, mbid, providerens eget id — ikke nødvendigvis et Spotify-id) |
| rawMetadata | Alt providern sendte, bevaret uændret (traceability — denne sessions erfaring med at "se de faktiske data, ikke en afledt fejl" gør dette obligatorisk, ikke valgfrit) |
| providerMetadataRef | Reference til `ProviderMetadata` for kilden |

**Relation:** én `Candidate` kan (efter deduplikering) have bidrag fra
flere providers — `rawMetadata` bevares pr. bidrag, ikke kun det først
sete.

### RankedCandidate
| Felt | Betydning |
|---|---|
| candidateRef, trackDnaRef | Referencer til grundlaget for scoren |
| score | 0-100 |
| explanations | Liste af menneskelig-læsbare begrundelser |
| rankedAt | Tidsstempel |
| sessionRef | Hvilken `RecommendationSession` denne blev produceret til |

**Relation:** mange `RankedCandidate` pr. `RecommendationSession`; én
`RankedCandidate` refereres af højst én `FeedbackEvent` (brugeren
reagerer én gang pr. visning).

### FeedbackEvent
| Felt | Betydning |
|---|---|
| eventId, timestamp | Identitet og tidspunkt |
| reactionType | ❤️ Gem / 👍 God / 😐 Neutral / 👎 Ikke mig / 🚫 Irriterende |
| rankedCandidateSnapshot | **Snapshot**, ikke kun en reference — fuld kopi af score + `TrackDNA` på reaktionstidspunktet. Nødvendigt fordi `TrackDNA` kan blive re-beriget senere; vi skal kunne se hvad brugeren *faktisk* reagerede på dengang |
| reason | Valgfri fritekst (ved 👎/🚫 — genbrug af v1's `RejectReasonPanel`-mønster) |
| sessionRef, queuePosition | Fatigue-/ordre-effekt-tracing |

**Relation:** dette er systemets **eneste kilde til sandhed**
(se afsnit 6) — alt andet af værdi (opdateret `UserDNA`,
`analytics`-metrics, provider-kvalitet) er afledt heraf.

### RecommendationSession
| Felt | Betydning |
|---|---|
| sessionId, startedAt, endedAt | Identitet og tidsvindue |
| userDnaVersionRef | Hvilken `UserDNA`-version blev brugt til at ranke denne sessions kandidater — kritisk for at kunne måle "gav score 82 rent faktisk gem-adfærd" korrekt |
| contributingProviders | Hvilke `candidate-providers` bidrog kandidater denne session |
| rankedCandidateRefs | De `RankedCandidate` der blev vist (eller en optælling, afhængig af opbevaringsbehov) |

### ProviderMetadata
| Felt | Betydning |
|---|---|
| providerName | Fx `lastfm`, `listenbrainz`, `ai-generator-v1` |
| capabilities | Hvilke signal-kategorier denne kilde plausibelt kan bidrage til (deklareret, bruges af `enrichment` til at vide hvad der er værd at forsøge) |
| qualityScore | Løbende mål (fx gem-rate for kandidater med oprindelse i denne kilde), opdateret af `analytics` |
| lastSuccessAt, lastFailureAt | Helbreds-tracking — fodrer fejlhåndtering og observability |

---

## 4. Dataflow

```
Spotify Login
   ↓
Cold Start DNA        (spotify → user-dna: biblioteks-snapshot → UserDNA v0, coldStart=true)
   ↓
Candidate Providers    (candidate-providers henter + deduplikerer → Candidate[])
   ↓
Enrichment             (enrichment: Candidate → rå signaler)
   ↓
Track DNA              (track-dna: validerer/normaliserer → TrackDNA[])
   ↓
Ranking                (ranking: UserDNA + TrackDNA[] → RankedCandidate[])
   ↓
Discovery              (queue serverer én ad gangen → discovery viser den)
   ↓
Feedback               (brugerreaktion → FeedbackEvent, persisteret)
   ↓
User DNA Update        (feedback → user-dna: UserDNA opdateres, ny version)
   ↓
Analytics              (feedback + session-data → aggregerede metrics + provider-kvalitet)
   ↓
   (provider-kvalitet tilbage til Candidate Providers til næste runde)
```

To ting værd at bemærke ved dette flow, begge direkte konsekvenser af
PRD'ets mission:

- **Feedback er ikke et sidespor — det er midten af loopet.** User DNA
  Update sker efter *hver* reaktion, ikke i batch ved sessionens
  afslutning. Systemet skal (arkitektonisk, ikke nødvendigvis i første
  implementering) kunne opdatere DNA'et og dermed den næste kandidat i
  køen baseret på den seneste reaktion — discovery er ikke en statisk
  liste beregnet én gang.
- **Cold Start DNA er det eneste sted `spotify` og resten af pipelinen
  mødes.** Efter login sker ingen yderligere Spotify-afhængighed i
  dataflowet, udover discoverys afspilningslink (som er et sidespor,
  ikke en del af selve ranking-pipelinen).

---

## 5. Interfaces

Kontrakter mellem moduler — hvilke data der udveksles, ikke kode.

| Fra → Til | Forespørgsel (input) | Svar (output) |
|---|---|---|
| `user-dna` → `spotify` | "giv mig et biblioteks-snapshot" (kun ved cold start) | biblioteks-snapshot (playlister/gemte/topkunstnere) |
| `discovery` → `spotify` | "giv mig et afspilningslink for track X" | afspilnings-URL |
| `candidate-providers` (intern) → hver aktiv provider | "giv mig N kandidater" | `Candidate[]` fra den enkelte kilde |
| `enrichment` ← `candidate-providers` | `Candidate` | (ingen forespørgsel — enrichment forbruger puljen) |
| `enrichment` → `track-dna` | rå enrichment-output | valideret `TrackDNA` |
| `ranking` ← `user-dna` | "giv mig aktuel UserDNA" | `UserDNA` |
| `ranking` ← `track-dna`/`enrichment` | `TrackDNA[≤500]` | (forbruges direkte) |
| `ranking` → `queue` | (leverer resultatet af en ranking-kørsel) | `RankedCandidate[]` |
| `queue` → `discovery` | "næste" | én `RankedCandidate`, eller "tom" |
| `discovery` → `feedback` | reaktion + `RankedCandidate`-reference + sessionskontekst | (bekræftelse) |
| `feedback` → `user-dna` | `FeedbackEvent` | (DNA opdateres, ingen synkron returværdi krævet) |
| `feedback` → `analytics` | `FeedbackEvent` | (indgår i aggregering) |
| `analytics` → `candidate-providers` | (periodisk/asynkront) opdaterede `ProviderMetadata.qualityScore` | (bruges ved næste hentning) |

**Generel regel:** intet modul modtager mere data end det har brug for
til sit erklærede ansvar (afsnit 2). `candidate-providers` sender
aldrig `UserDNA` med, uanset hvor praktisk det ville være — den grænse
er PRD-designprincip 2, ikke en implementeringsdetalje.

---

## 6. Persistence

### Permanent (kilde til sandhed — tabes aldrig)
- **FeedbackEvent-loggen.** Systemets vigtigste data. Slettes aldrig,
  ikke engang ved "nulstil min profil" (anonymiseres i så fald, slettes
  ikke destruktivt, fordi det også er træningsdata for den fremtidige
  lærte model, jf. PRD Fase 4).
- **UserDNA — nuværende tilstand.** Teknisk set genererbar fra
  `FeedbackEvent`-loggen (se nedenfor), men gemmes som en materialiseret
  tilstand for ydeevne — man vil ikke genberegne fra bunden ved hver
  session.
- **RecommendationSession-records.** Nødvendige for at kunne spore
  hvilken `UserDNA`-version producerede hvilket resultat.
- **ProviderMetadata.qualityScore.** Akkumuleret værdi over tid — at
  tabe den betyder ikke datatab i streng forstand (den kan genopbygges
  fra `FeedbackEvent`-loggen), men det er dyrt at genberegne ofte.

### Cache (kan ryddes uden permanent datatab)
- **TrackDNA pr. Candidate.** Hvis en kandidat dukker op igen, undgå at
  genberige fra bunden — men går cachen tabt, genskabes den ved næste
  møde med samme kandidat (forudsat providern stadig har dataen).
- **Candidate-puljen pr. session.** Fuldt forbigående, gendannes ved
  næste hentning.

### Regenerérbart (afledt, aldrig kilde til sandhed)
- **UserDNA er, strukturelt, en materialiseret visning af
  `FeedbackEvent`-loggen** (plus cold-start-snapshottet). Hvis
  `UserDNA`-tilstanden korrumperes eller tabes, kan den i princippet
  genopbygges ved at genafspille alle `FeedbackEvent` for brugeren i
  kronologisk orden. Dette er en bevidst arkitektonisk egenskab, ikke
  en tilfældighed — samme mønster som event sourcing.
- **RankedCandidate-scorer.** Altid genberegnelige fra `UserDNA` +
  `TrackDNA` på et givent tidspunkt — gemmes kun i det omfang det er
  nødvendigt for session-/feedback-tracing (`rankedCandidateSnapshot` i
  `FeedbackEvent` er den eneste plads en score *skal* overleve permanent,
  fordi den er en historisk kendsgerning, ikke en aktuel beregning).
- **Aggregerede analytics-tal.** Altid genberegnelige fra
  `FeedbackEvent` + `RecommendationSession`.

---

## 7. Error Handling

**Grundregel, gennemgående:** mock-/placeholder-data er kun tilladt i
test/udviklingsmiljø. Aldrig serveret til en rigtig bruger som om det
var et ægte resultat. Enhver fejltilstand løses enten (a) gracefully
med reelle, delvise data, eller (b) vises ærligt som "intet at vise
lige nu" — aldrig (c) en stille erstatning der ser ud som et normalt
resultat.

| Situation | Håndtering |
|---|---|
| **Ingen kandidater** (alle providers fejlede, eller alle lykkedes men returnerede 0) | `discovery` viser en tydelig, ærlig tom-tilstand ("Ingen nye sange lige nu"). Årsagen (alle fejlede vs. reelt tomt resultat) logges til `analytics`, aldrig maskeret af en stille fallback. |
| **Provider-fejl** (én af flere fejler) | De øvrige providers' resultater bruges stadig — en delvis pulje er normalt. Fejlen registreres i `ProviderMetadata.lastFailureAt` og påvirker fremtidig vægtning, blokerer ikke den aktuelle session. |
| **Manglende metadata** (en candidate har for lidt info) | `TrackDNA` bygges stadig, med lav/nul confidence på de signaler der ikke kunne udledes. Kandidaten forbliver i puljen — `ranking` nedvægter den naturligt via confidence, den fjernes ikke eksplicit af et enkelt lag. |
| **Tomt DNA** (ingen cold-start-data og ingen feedback endnu) | `UserDNA` falder tilbage til en neutral profil (alle signaler ved midtpunkt, meget lav confidence). `ranking` producerer stadig scores (baseret på generel diversitet/popularitet i stedet for personlig lighed), markeret tydeligt i `analytics` som "lav-confidence session". |
| **Delvist enrichment** (nogle signaler udfyldt, andre ikke) | Dette er den **normale** tilstand, ikke en fejl. Håndteres af confidence-vægtning i `ranking`, ingen specialkode nødvendig. |

---

## 8. Observability

### Hvad skal logges/måles
- **Pr. ranking-kørsel:** input (hvilken `UserDNA`-version, antal
  kandidater, hvilke providers bidrog), output (score-fordeling, mest
  brugte forklaringer).
- **Pr. FeedbackEvent:** den forudsagte score sammen med den faktiske
  reaktion — se nedenfor.
- **Pr. provider:** succesrate, svartid, hvor mange af de deklarerede
  `capabilities` den faktisk bidrog med data til.
- **Pr. enrichment-kørsel:** gennemsnitlig confidence pr. signal-
  kategori — stiger dækningen over tid, eller er den flad?
- **System-helbred pr. modul** (ikke kun pr. provider) — adskil
  "Last.fm er nede" fra "vores egen enrichment-logik fejler internt."

### Hvordan måler vi om Ranking Engine bliver bedre?

Den centrale måling: **kalibrering.** Bucket alle `RankedCandidate` efter
forudsagt score (0-20, 20-40, 40-60, 60-80, 80-100) og mål den faktiske
gem-rate inden for hver bucket, over tid.

- En velkalibreret ranking har markant højere faktisk gem-rate i
  80-100-bucket'en end i 0-20-bucket'en.
- Hvis buckets ikke adskiller sig meningsfuldt, er ranking ikke
  velkalibreret — uanset hvor sofistikeret modellen internt er.
- Dette er den samme test uafhængigt af om ranking-implementeringen er
  v1 (regelbaseret) eller v2 (lært) — det er selve pointen med at
  holde kontrakten fast (afsnit 5): vi kan A/B-sammenligne v1 og v2 på
  præcis denne måling uden at ændre noget andet i systemet.

Alt dette skal være **synligt** — ikke kun logget et sted ingen kigger.
Direkte arv fra v1's debug-panel-arbejde: diagnostik ingen kan se, er
lige så ubrugelig som ingen diagnostik.

---

## 9. Migration — fra v1 til Rebuilt

### Genbruges direkte
- **`spotify`-modulet** (auth, bibliotek, deep-linking) — allerede
  korrekt scoped, ingen ansvarsændring.
- **`queue` + `discovery`-UI-mønsteret** (én-sang-ad-gangen,
  ikke-cyklisk kø) — allerede korrekt bygget og fejlrettet i denne
  session.
- **Provider-interface-tankegangen** (v1's `RecommendationProvider`/
  `providerConfig`) — generaliseres til `candidate-providers`, opfindes
  ikke forfra.
- **Diagnostik-/observability-mønsteret** (`modules/diagnostics`,
  debug-panel-tilgangen) — direkte forløber for afsnit 8 her.

### Refaktoreres (idéen er rigtig, formen skal udvides)
- `modules/preferences` (statistisk smagsprofil) → kimen til
  `user-dna`, udvidet fra få statistikker til det fulde signalskema.
- `modules/history` (Gem/Afvis + 8 afvis-årsager) → kimen til
  `feedback`, udvidet til 5 graduerede reaktioner + det rigere
  `FeedbackEvent`-skema.
- `SimpleRanker` (regel-bonusser) → kimen til `ranking` v1
  (DNA-vægtet lighed) — samme forklarings-princip, ny beregningsmodel.
- `LastFmRecommendationProvider` → én konkret implementation under det
  generaliserede `candidate-providers`-interface, ikke selve
  interfacet.

### Kasseres
- `SpotifyRecommendationProvider` (allerede deprecated) — fjernes helt.
  Missionen udelukker Spotify som kandidat-kilde permanent, ingen grund
  til at bevare den, heller ikke som reference.
- **Mock-som-produktions-fallback-mønsteret** (v1's
  `createMockRecommendations()` som eneste sikkerhedsnet) — erstattes
  af den ærlige fejlhåndtering i afsnit 7. Mock-data bevares kun som
  testværktøj, aldrig som produktionsadfærd.
- Det nuværende, smalle `Recommendation`/`RankedRecommendation`-
  typehierarki — erstattes af `Candidate`/`TrackDNA`/`RankedCandidate`.

---

## 10. Architectural Decision Records (ADR)

Hver ADR er en beslutning der allerede er indbygget i afsnit 1-9 — dette
afsnit gør *hvorfor* eksplicit, så en fremtidig beslutning om at
udfordre den skal forholde sig til den oprindelige begrundelse, ikke
kun til den nuværende kode.

### ADR-01 — Event sourcing frem for kun at gemme nuværende UserDNA

- **Beslutning:** `FeedbackEvent`-loggen er permanent og ubegrænset;
  `UserDNA` er en afledt, opdaterbar tilstand, ikke den eneste gemte
  sandhed.
- **Baggrund:** Hvis vi kun gemte den nuværende `UserDNA`-tilstand og
  overskrev den ved hver opdatering, ville vi tabe evnen til at forstå
  *hvordan* en bruger endte med den smagsprofil de har, til at
  genberegne DNA'et hvis opdaterings-logikken senere ændres/rettes, og
  til at bruge historikken som træningsdata til den lærte model (PRD
  Fase 4).
- **Alternativer overvejet:** (a) kun nuværende snapshot, ingen log; (b)
  periodiske snapshots (fx dagligt) i stedet for hver hændelse.
- **Hvorfor denne løsning:** Et snapshot-kun-design gør Fase 4 (lært
  model) umulig uden at have samlet data forfra fra det øjeblik
  beslutningen ændres — det er for dyrt at rette senere. Periodiske
  snapshots taber præcis den information (hvilken reaktion hørte til
  hvilken kandidat) som gør et `FeedbackEvent` værdifuldt i sig selv.
- **Konsekvenser:** Lagringsbehovet vokser ubegrænset pr. bruger over
  tid (afvejet, ikke gratis) — men giver til gengæld regenerérbarhed
  (ADR-05) og en direkte vej til Fase 4 uden en separat
  "start med at samle data"-fase.

### ADR-02 — Candidate Providers er adskilt fra Ranking

- **Beslutning:** At *finde* kandidater og at *vurdere* kandidater er
  to forskellige moduler, forbundet af `Candidate`/`TrackDNA` som
  fælles kontrakt.
- **Baggrund:** v1's `LastFmRecommendationProvider` blandede "hent
  lignende kunstnere" og "afgør om det er en god anbefaling" i samme
  kodesti — det gjorde det umuligt at bytte datakilde uden at ændre
  hvordan sange blev vurderet, og skjulte fejl der reelt lå i
  datahentningen bag en generisk "ingen anbefalinger."
- **Alternativer overvejet:** (a) hver provider leverer sin egen score
  direkte; (b) én monolitisk "recommendation service" der gør begge
  ting.
- **Hvorfor denne løsning:** PRD-mission (afsnit 2) kræver at vi kan
  skifte/tilføje datakilder uden at ændre *hvordan* vi vurderer en sang
  — det er kun muligt hvis vurdering aldrig er en del af en providers
  ansvar.
- **Konsekvenser:** Kræver et fælles sprog (`TrackDNA`) alle providers
  kan mappes til via `enrichment`, uanset hvor forskellig deres rå
  data er — det er en reel merudgift i enrichment-laget, betalt for at
  få adskillelsen.

### ADR-03 — Spotify bruges kun til login, bibliotek og afspilning

- **Beslutning:** `spotify`-modulet leverer aldrig kandidater og
  påvirker aldrig ranking.
- **Baggrund:** v1 havde oprindeligt `SpotifyRecommendationProvider`
  som aktiv anbefalingskilde, senere deprecated. Selv efter det lå den
  stadig i kodebasen som en mulig fristelse. PRD designprincip 1
  gør grænsen permanent, ikke en aktuel konfiguration.
- **Alternativer overvejet:** (a) Spotify som én af flere
  candidate-providers, ligeværdig med Last.fm/ListenBrainz.
- **Hvorfor denne løsning:** Spotifys egne anbefalinger er netop den
  sorte boks / kommercielt-forurenede mekanisme Music DNA eksisterer
  som modsvar til (PRD Vision) — at bruge Spotify som kandidat-kilde
  ville underminere selve eksistensgrundlaget, uanset hvor teknisk
  bekvemt det er (Spotify har allerede al metadata vi behøver).
- **Konsekvenser:** Vi er afhængige af eksterne, mindre polerede
  datakilder for selve kandidat-kvaliteten — en bevidst afvejning,
  ikke en tilfældighed (se PRD Risici).

### ADR-04 — FeedbackEvent, ikke RecommendationSession eller aggregerede tal, er source of truth

- **Beslutning:** Når to datakilder er i konflikt eller noget skal
  genopbygges, er `FeedbackEvent`-loggen den autoritative kilde —
  `RecommendationSession` og `analytics`-aggregater er begge afledte.
- **Baggrund:** Der er flere kandidater til "kilde til sandhed" i
  systemet — sessions-log, aggregerede metrics, den nuværende
  `UserDNA`. Uden en eksplicit beslutning om hvilken der vinder ved
  uoverensstemmelse, er systemets tilstand ikke veldefineret.
- **Alternativer overvejet:** (a) `RecommendationSession` som kilde
  til sandhed (den har mere kontekst pr. visning); (b) ingen
  eksplicit hierarki, alle datakilder anses lige gyldige.
- **Hvorfor denne løsning:** `FeedbackEvent` er den eneste af de tre
  der indeholder en faktisk brugerhandling — `RecommendationSession`
  beskriver kun hvad der blev *vist*, ikke hvad brugeren *besluttede*.
  Kun handlinger, ikke visninger, bør drive fremtidig personalisering.
- **Konsekvenser:** `RecommendationSession` skal ses som kontekst-
  metadata, ikke en uafhængig datakilde — den må aldrig bruges til at
  opdatere `UserDNA` uden en tilknyttet `FeedbackEvent`.

### ADR-05 — UserDNA kan regenereres

- **Beslutning:** `UserDNA` er (i princippet) fuldt genberegnelig fra
  `FeedbackEvent`-loggen plus cold-start-snapshottet — det er ikke
  uafhængig, uigenkaldelig data.
- **Baggrund:** Direkte konsekvens af ADR-01. Hvis opdaterings-
  formlen for `UserDNA` senere findes at være forkert eller forbedres,
  skal vi kunne rette *fortiden* for eksisterende brugere, ikke kun
  fremtidige opdateringer.
- **Alternativer overvejet:** (a) `UserDNA` som uafhængig, kun
  fremadrettet muterbar tilstand (ingen genberegning mulig).
- **Hvorfor denne løsning:** Uden regenerérbarhed bliver enhver fejl
  eller forbedring i DNA-opdateringslogikken permanent for allerede
  eksisterende brugere — det er uforeneligt med at forvente at
  ranking-/DNA-formlerne vil udvikle sig (PRD Fase 3-4).
- **Konsekvenser:** Opdateringsformlen for `UserDNA` skal være en ren
  funktion af (tidligere tilstand, ny `FeedbackEvent`) — enhver
  skjult sideeffekt eller ikke-deterministisk logik ville bryde denne
  egenskab.

### ADR-06 — Én Discovery Queue, ikke lister/playlister

- **Beslutning:** `queue` leverer altid præcis én kandidat ad gangen;
  der findes ikke en "se alle anbefalinger"-visning.
- **Baggrund:** PRD afsnit 6 ("Kun én beslutning ad gangen") og afsnit
  10 ("Hvad bygger vi IKKE") udelukker begge lister/playlister
  eksplicit — men den tekniske konsekvens (queue-interfacet kan
  strukturelt kun eksponere "next", ikke "alle") skal være en
  arkitektonisk garanti, ikke kun en UI-konvention der kan omgås.
- **Alternativer overvejet:** (a) `queue` eksponerer den fulde
  rangerede liste, og `discovery` *vælger* kun at vise én ad gangen.
- **Hvorfor denne løsning:** Alternativ (a) gør det trivielt for en
  fremtidig feature at "bare tilføje en liste-visning" ved kun at
  ændre `discovery` — hvis det skal være svært, skal `queue` selv
  aldrig eksponere mere end "næste."
- **Konsekvenser:** Enhver fremtidig funktion der reelt har brug for
  at se flere kandidater samtidig (fx en debug-/analyse-visning) må
  gå uden om `queue` og direkte til `ranking`-output — en bevidst
  friktion.

### ADR-07 — Ingen mock-fallback i produktion

- **Beslutning:** Mock-/placeholder-data er kun tilladt i test- og
  udviklingsmiljø, aldrig som en stille produktions-fallback.
- **Baggrund:** v1's `createMockRecommendations()` var det *eneste*
  sikkerhedsnet når den rigtige kilde fejlede — det maskerede en reel
  fejl (manglende OAuth-scope) i lang tid, fordi appen "virkede" uden
  at afsløre at den viste statisk placeholder-indhold.
- **Alternativer overvejet:** (a) behold en automatisk mock-fallback,
  men gør den visuelt tydelig markeret som "eksempel-data."
- **Hvorfor denne løsning:** Selv en tydeligt markeret mock-fallback
  risikerer at blive den faktiske oplevelse for en bruger i timer/dage
  hvis fejlen ikke bliver opdaget — en ærlig tom-tilstand er en
  ubehagelig, men korrekt, oplevelse; en mock-fallback er en behagelig,
  men forkert, oplevelse. PRD designprincip 6 vælger ærlighed.
- **Konsekvenser:** Kræver at Error Handling (afsnit 7) er grundigt
  designet — "vis ærligt at det er tomt" er kun et acceptabelt UX hvis
  det sker sjældent, hvilket kræver at de underliggende fejlårsager
  faktisk bliver rettet, ikke maskeret.

### ADR-08 — TrackDNA er adskilt fra Enrichment

- **Beslutning:** `track-dna` ejer skemaet (signal-katalog +
  validering); `enrichment` er processen der udfylder det.
- **Baggrund:** Uden denne adskillelse ville hver enrichment-kilde
  (tag-baseret, AI-baseret, fremtidig audio-baseret) kunne opfinde sit
  eget format, og ranking ville skulle kende til alle af dem.
- **Alternativer overvejet:** (a) lad hver enrichment-metode returnere
  sit eget format, og lad `ranking` normalisere ved brug.
- **Hvorfor denne løsning:** At sætte normaliseringsansvaret i
  `ranking` ville gøre `ranking` afhængig af hvor mange
  enrichment-kilder der findes — det modsatte af at gøre det
  udskifteligt. Ved at lade `track-dna` eje skemaet, kan nye
  enrichment-kilder tilføjes uden at `ranking` overhovedet opdager det.
- **Konsekvenser:** Enhver ny signal-kategori skal først tilføjes til
  `track-dna`s katalog, før nogen enrichment-kilde kan udfylde den —
  en lille administrativ friktion, betalt for konsistens.

### ADR-09 — Ranking er forklarlig (regelbaseret) i v1, ikke en sort boks

- **Beslutning:** Den første ranking-implementering er en vægtet
  DNA-lighedsberegning med eksplicitte forklaringer — ikke en trænet
  model, selv om PRD nævner "AI Ranking Engine."
- **Baggrund:** En trænet model kræver træningsdata vi ikke har før vi
  har kørt v1 i praksis. At starte med en model vi ikke kan forklare,
  ville også direkte bryde PRD designprincip 5 ("forklar altid
  hvorfor").
- **Alternativer overvejet:** (a) start direkte med en simpel lært
  model (fx logistisk regression) trænet på syntetisk/antaget data.
- **Hvorfor denne løsning:** En model trænet på syntetiske antagelser
  om brugeradfærd er ikke bedre end en eksplicit regelbaseret model —
  den er bare sværere at forklare og fejlfinde, uden at være mere
  præcis. Regelbaseret v1 er lige god til at bevise missionen (PRD
  MVP), og markant lettere at diagnosticere hvis den performer dårligt.
- **Konsekvenser:** v1 vil sandsynligvis underperforme en fremtidig
  velkalibreret lært model — accepteret bevidst, fordi kalibrerings-
  målingen (afsnit 8) gør det muligt at bevise *hvornår* v2 reelt er
  bedre, i stedet for at antage det fra start.

### ADR-10 — Vi starter med et reduceret signal-sæt, ikke alle 30-50

- **Beslutning:** MVP'en (PRD afsnit 7) bruger et undersæt (~15-20) af
  det fulde signal-katalog.
- **Baggrund:** Fuld dækning af 30-50 signaler kræver enrichment fra
  flere kilder pr. signal-gruppe — en betydelig mængde arbejde, der
  ikke er nødvendig for at bevise mission-skiftet (kunstner-lighed →
  gem-forudsigelse).
- **Alternativer overvejet:** (a) byg det fulde katalog først, test
  bagefter.
- **Hvorfor denne løsning:** Hvis MVP'en fejler at bevise missionen med
  et fuldt katalog, er det uklart om fejlen ligger i selve
  mission-skiftet eller i for-tyndt enrichment af 30-50 signaler — et
  reduceret, men solidt udfyldt sæt giver et renere eksperiment.
- **Konsekvenser:** `track-dna`s skema skal designes til at kunne
  udvides uden at bryde eksisterende `TrackDNA`/`UserDNA`-data (nye
  signaler tilføjes med lav/nul confidence for allerede-beregnede
  profiler, ikke retroaktiv genberegning som et krav).

### ADR-11 — Providers må aldrig kende UserDNA

- **Beslutning:** Ingen data fra `UserDNA` sendes til
  `candidate-providers`, uanset hvor nyttigt det ville være for en
  specifik kilde (fx en AI-provider der kunne generere bedre
  kandidater med fuld kontekst).
- **Baggrund:** Uden denne grænse ville hver ny provider potentielt
  kræve adgang til hele brugerens smagsprofil, hvilket gør
  privatlivs-overfladen proportional med antallet af tilsluttede
  eksterne kilder.
- **Alternativer overvejet:** (a) tillad providers at modtage et let,
  anonymiseret udtræk af `UserDNA` (fx kun genre-signaler) for bedre
  kandidat-relevans ved kilden.
- **Hvorfor denne løsning:** Selv et "let udtræk" er stadig
  brugerdata sendt til en tredjepart pr. forespørgsel — PRD Risici
  (licens/privatliv) og NFR (Privatliv, afsnit 11) gør dette til en
  hård grænse, ikke en optimering man kan vælge til.
- **Konsekvenser:** Kandidat-relevans ved selve hentningen er lavere
  end den kunne være — det kompenseres af `ranking`, som *har* adgang
  til `UserDNA` og gør det tunge personaliserings-arbejde efter
  hentning, ikke under den.

### ADR-12 — Confidence er en del af hvert signal, ikke kun en rå værdi

- **Beslutning:** Hvert signal i `UserDNA` og `TrackDNA` har en
  værdi **og** en confidence — ikke kun en værdi.
- **Baggrund:** Uden confidence ville et signal udledt fra ét
  tag (lav sikkerhed) og et signal udledt fra hundreder af
  feedback-hændelser (høj sikkerhed) blive vægtet identisk i
  `ranking` — det ville gøre systemet enten for hurtigt til at
  overfitte på tynde data, eller kræve kunstige minimums-tærskler før
  et signal "må" bruges.
- **Alternativer overvejet:** (a) kun binære "kendt/ukendt"-flag i
  stedet for en kontinuerlig confidence; (b) ingen confidence,
  acceptér støj som en pris for enkelhed.
- **Hvorfor denne løsning:** En kontinuerlig confidence tillader
  `ranking` at nedvægte usikre signaler gradvist, i stedet for en hård
  cutoff — det er samme mønster som v1's `PreferenceProfile`, bare
  gjort systematisk i stedet for ad hoc.
- **Konsekvenser:** Hvert lag der producerer eller opdaterer et signal
  (cold start, enrichment, feedback-opdatering) skal også producere en
  begrundet confidence, ikke kun en værdi — mere ansvar pr. lag, betalt
  for bedre kalibrering.

### ADR-13 — Analytics er asynkront og aldrig blokerende for Discovery

- **Beslutning:** `analytics` må aldrig forsinke eller fejle
  `discovery`-flowet — indsamling er best-effort og afkoblet.
- **Baggrund:** Målinger (Save Rate, kalibrering, osv.) er afgørende
  for at vide om systemet virker (PRD Success Metrics), men er ikke
  nødvendige for at systemet virker i øjeblikket for brugeren.
- **Alternativer overvejet:** (a) synkron logging ved hver
  `FeedbackEvent`, med fejl i logging som en fejl i selve
  feedback-handlingen.
- **Hvorfor denne løsning:** At koble brugerens oplevelse til
  analytics-infrastrukturens tilgængelighed ville gøre en
  measurement-fejl til en produkt-fejl — det er en helt anden
  kategori af problem, og bør behandles som sådan.
- **Konsekvenser:** Der er en teoretisk risiko for at tabe enkelte
  analytics-datapunkter ved samtidige fejl — accepteret, fordi
  `FeedbackEvent`-loggen (den vigtigste data) er upåvirket af dette
  (jf. ADR-04), kun de afledte aggregater kan blive forsinket.

### ADR-14 — Candidate Aggregator er bevidst mekanisk

- **Beslutning:** `CandidateAggregator` må kun aggregere, deduplikere,
  bevare metadata, og isolere fejl. Den må aldrig rangere, prioritere
  providers, filtrere kandidater, eller træffe recommendation-
  beslutninger.
- **Baggrund:** M3 gjorde `CandidateAggregator` til den eneste kode der
  kender til mere end én `CandidateProvider` (ADR-02, ADR-11) — netop
  fordi den sidder centralt, er den det oplagte sted en beslutning om
  "hvilken kandidat er bedst" ville sive ind, hvis grænsen ikke var
  gjort eksplicit.
- **Alternativer overvejet:** (a) lad aggregatoren vægte providers efter
  historisk kvalitet ved dedup (fx foretræk Last.fm's metadata over en
  ny, uprøvet kildes, hvis de er i konflikt); (b) lad aggregatoren
  droppe kandidater under en vis providertillid.
- **Hvorfor denne løsning:** Begge alternativer er en rangerings- eller
  filtrerings-beslutning i forklædning — de hører til `ranking`
  (TDS §2, som *har* adgang til `UserDNA` og providerkvalitet via
  `analytics`), ikke til `candidate-providers`, som TDS §2 allerede
  forbyder at "score eller rangere noget". At holde aggregatoren
  mekanisk er det der lader `ranking` forblive det ene sted en
  kvalitets- eller relevans-afgørelse tages.
- **Konsekvenser:** Ved dedup bevares *alle* konkurrerende
  contributions uændret (M3 Rule 6) — aggregatoren tager ikke stilling
  til hvilken der er "rigtigst". Al vægtning af providerkvalitet sker
  nedstrøms, i `ranking`, aldrig her.

### ADR-15 — Enricher-output er append-only

- **Beslutning:** En enricher må kun producere sine egne signaler. Den
  må aldrig overskrive en anden enrichers signaler, slette et signal,
  eller mutere den `Candidate` den blev givet.
- **Baggrund:** M4 gjorde hvert signal til ansvar for præcis én
  enricher (Rule 3) og gjorde `Candidate` immutabelt ind i pipelinen
  (Rule 1, `deepFreeze()`). Denne ADR gør den samlede konsekvens
  eksplicit som én regel: en enrichers output kan kun *tilføje* til
  resultatet af en enrichment-kørsel, aldrig ændre eller fjerne noget
  en anden del af systemet allerede har produceret.
- **Alternativer overvejet:** (a) lad en senere enricher i kørselsordenen
  overskrive et signal en tidligere enricher allerede har udfyldt, som
  en "sidste ord vinder"-opdateringsmekanisme; (b) lad en enricher
  eksplicit slette et signal den vurderer er forkert udfyldt af en
  anden kilde.
- **Hvorfor denne løsning:** Begge alternativer kræver at en enricher
  kender til andre enrichers' resultater eller til `Candidate`s
  oprindelige tilstand ud over sin egen — det ville bryde M4 Rule 2's
  isolation og gøre resultatet afhængigt af kørselsorden, hvilket også
  underminerer determinisme (Rule 6). At holde output append-only er
  det som lader `EnrichmentPipeline` (ikke den enkelte enricher) forblive
  det eneste sted flere bidrag samles — samme rolle som
  `CandidateAggregator` spiller for providers (ADR-14).
- **Konsekvenser:** `EnrichmentPipeline` afviser allerede (Rule 3,
  konstruktionstjek) overlappende signal-ejerskab og kasserer
  runtime-readings uden for en enrichers erklærede ejerskab — denne ADR
  gør den eksisterende adfærd til en navngivet, bindende beslutning i
  stedet for en implementeringsdetalje. Enhver fremtidig enricher der
  har brug for at *korrigere* et andet signal (fx en bedre kilde der
  overtrumfer en svagere) kræver en ny, eksplicit beslutning — ikke en
  stille overskrivning.

### ADR-16 — Samlet score er algoritmisk og foranderlig; ScoreBreakdown er en stabil forklaringskontrakt

- **Beslutning:** Den samlede `score` (0-100) er resultatet af en
  algoritmisk beregning og kan udvikle sig over tid — en fremtidig
  ranking-implementation kan ændre *hvordan* score beregnes.
  `ScoreBreakdown` er derimod en forklaringskontrakt: den skal fortsat
  kunne fortolkes ens på tværs af forskellige ranking-implementationer,
  ikke kun af den der producerede den.
- **Baggrund:** M5 gjorde `ScoreBreakdown` til en del af
  `RankingEngine`s offentlige kontrakt (Rule 3 + Rule 8) netop for at
  gøre enhver score forklarlig. Uden denne ADR ville en fremtidig,
  fx ML-baseret, ranker kunne opfinde sit eget breakdown-format, og
  "forklarlig score" ville kun betyde noget for den ranker der lige nu
  er aktiv — ikke en egenskab ved systemet.
- **Alternativer overvejet:** (a) lad `scoreBreakdown` være en fri,
  implementation-specifik struktur (`Record<string, unknown>`), og lad
  hver ranker definere sin egen forklaringsform; (b) gør kun `score`
  til den offentlige kontrakt, og behandl breakdown som et internt,
  ranker-specifikt debug-felt uden garanti.
- **Hvorfor denne løsning:** Begge alternativer ville gøre ADR-09
  ("Ranking er forklarlig, ikke en sort boks") til en egenskab ved den
  *nuværende* implementation snarere end ved arkitekturen — det ville
  bryde Rule 8's udskiftelighedskrav i praksis, selv hvis
  `RankingEngine`-interfacet formelt var uændret: en downstream-forbruger
  (fx en fremtidig UI eller `analytics`) kunne ikke fortsætte at vise
  eller måle "hvorfor fik denne sang sin score" hen over et
  ranker-bytte. Ved at holde `ScoreBreakdown`s form (de navngivne
  buckets) stabil, mens den bagvedliggende beregning af både `score` og
  bucket-værdierne frit kan ændre sig, bevares forklarligheden som en
  systemegenskab, ikke en implementationsdetalje.
- **Konsekvenser:** En fremtidig ranking-implementation (regelbaseret
  v2, ML-baseret, eller andet) skal fortsat udfylde de samme
  `ScoreBreakdown`-felter meningsfuldt, selv hvis dens interne
  beregningsmetode er helt anderledes end M5's `quality × trust`-model.
  Tilføjelse af et nyt breakdown-felt (fx hvis flere signal-grupper
  senere tages i brug, jf. M5's Review Report) er en eksplicit,
  dokumenteret udvidelse af kontrakten — ikke noget en enkelt
  ranker-implementation kan gøre ensidigt.

### ADR-17 — QueueState er ene ejer af sessionens position

- **Beslutning:** `QueueState` (M6's `RecommendationQueue`) er det
  eneste sted i systemet der holder eller beregner den aktuelle
  position i anbefalingssekvensen. Intet andet modul — `discovery`,
  `feedback`, `analytics`, en fremtidig UI, eller noget andet — må
  duplikere, cache, eller selv udlede "hvor langt er brugeren nået".
- **Baggrund:** M6 gjorde `RecommendationQueue` til et immutabelt
  value-objekt der ejer "kun rækkefølgen" (Rule 1) og al navigation
  (Rule 6: `current`/`next`/`peek`/`remaining`). Uden denne ADR ville
  et fremtidigt modul, der har brug for at vide "hvad er den aktuelle
  kandidat", kunne fristes til at holde sit eget positions-tal
  synkroniseret med queue'en i stedet for at spørge queue'en selv —
  to sandheder om samme ting, med den uundgåelige risiko for at de
  glider ud af sync.
- **Alternativer overvejet:** (a) lad `discovery` (en fremtidig
  milestone) holde sit eget "aktuelt index" og kun bruge
  `RecommendationQueue` til at hente listen initialt; (b) lad
  `feedback` udlede positionen af hvor mange `FeedbackEvent` der er
  logget for den aktuelle session, som en implicit tæller.
- **Hvorfor denne løsning:** Begge alternativer skaber en anden kilde
  til sandhed om samme tilstand — præcis det ADR-01/ADR-04's
  event-sourcing-tilgang allerede undgår for `UserDNA` (én kilde:
  `FeedbackEvent`-loggen) og ADR-05 undgår for DNA-regenerering. At
  lade et andet modul beregne eller gætte positionen ville også
  underminere M6's egen determinisme-garanti (Rule 3): to forskellige
  moduler kunne nå frem til to forskellige "aktuelle" kandidater efter
  samme handlingssekvens, hvis blot ét af dem havde en bug i sin egen
  kopi af logikken.
- **Konsekvenser:** Ethvert fremtidigt modul der har brug for "hvad er
  den aktuelle/næste kandidat" skal modtage eller forespørge den
  aktuelle `RecommendationQueue`-state direkte (typisk fra en
  fremtidig session-/orchestration-lag, endnu ikke bygget) — aldrig
  rekonstruere eller antage positionen selv. Dette begrænser ikke
  hvor `RecommendationQueue`s state *opbevares* mellem interaktioner
  (det er en fremtidig milestones valg, fx `discovery` eller en
  session-container) — kun at der aldrig findes to uafhængige
  beregninger af den samme position.

### ADR-18 — LearningEvent beskriver observerede handlinger, ikke fortolkede præferencer

- **Beslutning:** `LearningEvent` (M7's `feedbackPipeline`) beskriver
  kun *hvad der observerbart skete* — hvilken kandidat, hvilken
  reaktionstype, hvornår. Den indeholder ingen fortolkning af hvad
  brugeren derved menes at foretrække (fx "brugeren liker rock", "denne
  genre er nu at foretrække").
- **Baggrund:** M7 gjorde `feedbackPipeline` til det eneste modul der
  omsætter en rå reaktion til et domæneobjekt for læringssystemet
  (M8). Uden denne ADR ville det være en naturlig, men forkert,
  udvidelse at lade pipelinen selv gætte på betydningen af en reaktion
  (fx udlede "genre-præference" af et `save` på en rock-sang) —
  præcis den slags fortolkning Rule 4 allerede forbyder ("den må ikke
  udføre læring"), men uden en ADR ville grænsen kun leve i roadmap-
  teksten, ikke i arkitekturen.
- **Alternativer overvejet:** (a) lad `LearningEvent` inkludere et
  afledt felt som fx `impliedPreference` eller `signalDelta`, beregnet
  ud fra reaktionstypen og kandidatens `TrackDNA`, for at spare `user-
  dna` (M8) besværet med selv at fortolke; (b) lad pipelinen vægte
  reaktioner forskelligt (fx `save` "tæller mere" end `known`) i selve
  domæneobjektet.
- **Hvorfor denne løsning:** Begge alternativer flytter en
  lærings-beslutning opstrøms til et modul der pr. definition ikke må
  lære (Rule 1/4) — og de ville gøre `LearningEvent` afhængig af
  *hvordan* `user-dna` i øjeblikket fortolker feedback, hvilket
  underminerer at flere, potentielt forskellige, fremtidige
  lærings-strategier (jf. TDS' egen ambition om en `ranking`-motor der
  kan udskiftes, jf. M5's `RankingEngine`-interface) skal kunne
  konsumere samme, neutrale hændelse. Ved at holde `LearningEvent` til rene,
  observerede fakta, kan `user-dna` (eller en fremtidig lærings-model)
  frit ændre *hvordan* den fortolker en reaktion uden at
  `feedbackPipeline` skal ændres.
- **Konsekvenser:** Al fortolkning — hvad et `save` på en given
  `TrackDNA` betyder for `UserDNA`s signaler — sker udelukkende i M8
  (eller senere), aldrig i `feedbackPipeline`. `LearningEvent`s skema
  kan derfor forblive stabilt selv hvis lærings-strategien ændrer sig
  markant.

### ADR-19 — Validering afviser, men fortolker eller normaliserer aldrig semantisk ukendte værdier

- **Beslutning:** `feedbackPipeline`s validering skelner skarpt mellem
  to ting: *syntaktisk normalisering* (fx trimme whitespace fra en
  ellers gyldig streng) og *semantisk fortolkning* (fx gætte at
  `"likeddet"` nok betyder `"save"`, eller stille "known" ind som
  standard for en ukendt reaktionstype). Kun det første er tilladt.
  Alt der ikke eksakt matcher et kendt, gyldigt værdisæt bliver afvist
  — aldrig gættet, oversat, eller tilnærmet.
- **Baggrund:** M7 Rule 4 tillader validering og normalisering, men
  forbyder læring. Grænsen mellem "normalisering" og "en lille smule
  fortolkning" er ikke selvindlysende — denne ADR gør den konkret: en
  `reactionType` på `"like"` er ikke "tæt nok på" `"save"` til at blive
  accepteret som det; den afvises som `invalid-reaction-type`, punktum.
- **Alternativer overvejet:** (a) lad valideringen forsøge en
  best-effort-oversættelse af almindelige varianter (`"like"` →
  `"save"`, `"skip"` → `"reject"`) for at være mere tilgivende over for
  upstream-fejl; (b) lad en ukendt reaktionstype falde tilbage til en
  standardværdi (fx `"known"`) i stedet for at blive afvist.
- **Hvorfor denne løsning:** Begge alternativer er en fortolkning af
  hvad en kalder *nok* mente — det er præcis den slags gæt Rule 4
  ("ingen læring") og hele projektets etablerede disciplin (fejlrettet
  gentagne gange i v1: gæt på manglende/uventede data er roden til
  runtime-fejl, ikke løsningen på dem) allerede forbyder. En afvist
  hændelse med en præcis, navngivet grund (`invalid-reaction-type`
  osv.) er langt mere nyttig for en fremtidig fejlfinding end en
  hændelse der blev "reddet" ved et gæt, og som derfor ser gyldig ud,
  men beskriver noget der aldrig faktisk skete.
- **Konsekvenser:** En upstream-fejl (fx en fremtidig UI der sender en
  forkert streng) bliver synlig som en afvisning med en klar grund, i
  stedet for at blive tavst omdannet til en anden, forkert, men
  gyldigt udseende hændelse. Dette lægger presset for korrekthed på
  kalderen (queue/en fremtidig UI), hvor det hører hjemme — ikke på
  `feedbackPipeline`, som ikke kan vide *hvad* kalderen egentlig mente.

### ADR-20 — Learning Engine orkestrerer; strategier lærer

- **Beslutning:** `learningEngine`s `learn()`-funktion indeholder ingen
  domænespecifik viden om noget enkelt signal (genre, mainstream,
  explicitness, duration, eller noget fremtidigt). Den kombinerer kun
  det `LearningStrategy`-objekter selv producerer. Al viden om *hvordan*
  et signal skal læres bor i den enkelte strategi, aldrig i `learn()`.
- **Baggrund:** M8 gjorde `LearningStrategy` til den eneste vej et
  signal må ændres (Rule 4). Uden denne ADR ville det være en naturlig,
  men forkert, genvej at lade `learn()` selv indeholde en særregel for
  ét bestemt signal (fx "hvis reactionType er reject og signalet er
  explicitness, gør noget særligt") — det ville gøre `learn()`
  afhængig af hvilke signaler der findes, præcis den kobling
  strategi-mønstret findes for at undgå.
- **Alternativer overvejet:** (a) lad `learn()` selv rumme et lille
  antal indbyggede specialtilfælde for de "vigtigste" signaler, og
  reservere `LearningStrategy` til alt andet; (b) lad `learn()` vælge
  imellem flere formler afhængigt af hvilket signal der opdateres.
- **Hvorfor denne løsning:** Begge alternativer genindfører nøjagtig
  den kobling M4's ADR-08 allerede afviste for `enrichment`/`track-dna`
  (lad ikke det orkestrerende lag opfinde sit eget format/regelsæt pr.
  signal) — af samme grund: nye signaler eller nye lærings-strategier
  skal kunne tilføjes uden at røre `learn()` selv, og et "vigtigt
  signal, indbygget i engine"-særtilfælde ville gøre præcis det
  umuligt uden at ændre orkestratoren igen.
- **Konsekvenser:** Enhver fremtidig `LearningStrategy` — inklusive én
  der bruger en helt anden formel end `updateReading()` — kan tilføjes
  til `learn()`s strategiliste uden at én linje i `learningEngine.ts`
  ændres. Testet direkte i M8 (en brugerdefineret `FixedResult`-strategi
  der ignorerer `updateReading()` fuldstændigt, anvendt af `learn()`
  helt uændret).

### ADR-21 — Hvert UserDNA-signal har én entydig ejer

- **Beslutning:** Ethvert signal i `UserDNA` må opdateres af præcis én
  `LearningStrategy`. Flere strategier må aldrig opdatere samme signal
  — hverken samtidigt, i forskellige kørsler, eller ved en fremtidig
  udvidelse.
- **Baggrund:** M8 Rule 6 kræver at strategier er uafhængige og aldrig
  ændrer andre signaler. Uden en navngivet ADR ville "uafhængige" kunne
  fortolkes som blot en stilistisk anbefaling; denne ADR gør det til en
  strukturel invariant: `learn()` kaster med det samme, ved hvert kald,
  hvis to strategier i den givne liste erklærer det samme signal
  (`assertDisjointOwnership`) — samme mønster som ADR-15 gjorde for
  enrichment-signaler.
- **Alternativer overvejet:** (a) tillad flere strategier pr. signal og
  fastsæt en implicit prioritetsorden (fx "sidste strategi i listen
  vinder"); (b) tillad flere strategier pr. signal og gennemsnit deres
  resultater.
- **Hvorfor denne løsning:** Begge alternativer gør resultatet
  afhængigt af *hvilke* strategier der er konfigureret og i hvilken
  rækkefølge — det underminerer M8 Rule 9's determinisme-garanti i
  praksis, selv hvis den enkelte strategi selv er deterministisk, og
  gør det umuligt at ræsonnere om "hvorfor har dette signal denne
  værdi" uden at kende hele konfigurationen. Én ejer pr. signal er den
  samme disciplin `candidate-providers`/`enrichment` allerede følger
  (ADR-15) og som `ScoreBreakdown` (ADR-16) forudsætter for at kunne
  tilskrive en ændring til en bestemt kilde.
- **Konsekvenser:** At udvide dækningen af et signal til en ny kilde
  (fx en fremtidig, mere avanceret genre-strategi) kræver at erstatte
  den eksisterende ejer, ikke at tilføje en konkurrerende. At lade to
  strategier begge bidrage til samme signal er en eksplicit,
  fremtidig arkitekturbeslutning (en ny ADR), ikke noget der kan ske
  ved en tilfældig konfigurationsændring.

### ADR-22 — Repository-kontrakten er stabil; implementeringen er udskiftelig

- **Beslutning:** `Repository<T>` (og de tre navngivne kontrakter,
  `UserDnaRepository`/`LearningEventRepository`/`TrackDnaRepository`)
  er den ene, stabile grænseflade alt andet i systemet forholder sig
  til. Hvilken konkret lagringsmekanisme der ligger bagved (in-memory
  nu, IndexedDB senere, eventuelt en fjern-backend derefter) må ændre
  sig frit, uden at kontraktens metodesignaturer ændres.
- **Baggrund:** M9 byggede kun en in-memory-implementation (Rule 4),
  men gjorde kontrakten selv async (frem for at matche in-memorys
  egen synkrone natur) netop for at et fremtidigt, uundgåeligt
  asynkront lag (IndexedDB) kan indsættes uden et brud. Uden denne ADR
  ville "udskiftelighed" kun være en observation om M9s kode, ikke en
  bindende grænse fremtidige milestones skal respektere.
- **Alternativer overvejet:** (a) lad kontrakten være synkron nu (mere
  bekvem for in-memory-brug) og acceptere et brud i alle kaldere når et
  rigtigt lag tilføjes; (b) lad hver fremtidig backend definere sin
  egen kontrakt, og lad kaldere vide hvilken implementation de taler
  til.
- **Hvorfor denne løsning:** Begge alternativer gør et fremtidigt
  lagerskifte til en ændring der spreder sig til hver kalder — præcis
  den kobling `Repository<T>` findes for at undgå. En stabil,
  allerede-asynkron kontrakt betyder at `learningEngine` (eller et
  fremtidigt orkestrerings-lag) aldrig behøver vide om det taler til
  en `Map` eller en rigtig database.
- **Konsekvenser:** En fremtidig `IndexedDbUserDnaRepository` (eller
  lignende) skal implementere `UserDnaRepository` uændret — samme
  metodenavne, samme parametre, samme returtyper. Ethvert behov for at
  ændre selve kontrakten (fx et nyt metodenavn) er en ny, eksplicit
  arkitekturbeslutning, ikke en bieffekt af at vælge en ny backend.

### ADR-23 — Repositories returnerer altid defensive kopier, deler aldrig mutable referencer

- **Beslutning:** Enhver `Repository<T>`-implementation skal både ved
  `save()` og ved enhver læsning (`getById()`/`getAll()`) returnere
  eller opbevare en kopi, aldrig den samme objekt-reference som
  kalderen gav eller vil modtage. At mutere et objekt før eller efter
  en repository-operation må aldrig kunne påvirke hverken det gemte
  eller et andet allerede-returneret resultat.
- **Baggrund:** M9 Rule 7 krævede defensive kopier "ved både save() og
  load()" — denne ADR gør det til en permanent, navngivet egenskab ved
  *enhver* fremtidig implementation af disse kontrakter, ikke kun
  M9's egen `InMemory*`-familie.
- **Alternativer overvejet:** (a) kun kopiere ved `save()` og betragte
  returnerede objekter som "kalderens eget ansvar ikke at mutere"; (b)
  dokumentere non-mutation som en konvention frem for at gennemtvinge
  den med faktiske kopier.
- **Hvorfor denne løsning:** Begge alternativer flytter risikoen for
  et helt bestemt fejlmønster — et modul der (utilsigtet) muterer et
  domæneobjekt det fik fra en repository, og derved korrumperer
  systemets egen kilde til sandhed — tilbage til hver kalder, i stedet
  for at gøre det strukturelt umuligt én gang, ét sted. Det er samme
  filosofi som M4's `deepFreeze()` af `Candidate` og M6's frosne
  kopi i `RecommendationQueue.create()`, nu gjort til en permanent
  kontraktforpligtelse for hele persistence-laget.
- **Konsekvenser:** En fremtidig `IndexedDbUserDnaRepository` skal
  selv sikre samme egenskab (fx via sin egen deep-copy ved
  serialisering til og fra det format den rent faktisk gemmer) — det
  er ikke noget der kommer gratis fra at bruge en rigtig database, og
  skal derfor eksplicit testes igen, ikke antages, når den bygges.

**Note (ikke en beslutning, en status):** `LearningEvent` (M7) mangler
stadig et bruger-scope (intet `userId`-felt) — `LearningEventRepository`
kan derfor ikke i dag besvare "alle hændelser for denne bruger", kun
"alle hændelser nogensinde gemt". Dette er korrekt identificeret i M9's
Review Report som en fremtidig opgave (kræver en ADR mod M7, jf.
ADR-16, når/hvis den besluttes) — bevidst ikke løst her.

### ADR-24 — Application Services beskriver workflows; domænelogik forbliver i domænet

- **Beslutning:** En Application Service (M10's "Use Case", fx
  `LearnFromReaction`) beskriver kun *rækkefølgen* af trin i en
  arbejdsgang — hent, kald, gem. Enhver regel om *hvad et signal betyder*,
  *hvordan et signal skal opdateres*, eller *hvornår noget er gyldigt*
  bor i det domænemodul der allerede ejer det (`learningEngine` for
  DNA-opdatering, `feedbackPipeline` for validering, `trackDna` for
  skemaet) — aldrig i Application-laget selv.
- **Baggrund:** M10 gjorde Application Services til det første lag der
  faktisk *kalder* flere domænemoduler sammen (`persistence` +
  `learningEngine`). Uden denne ADR ville det være en naturlig, men
  forkert, genvej at lade en Application Service selv indeholde en lille
  regel "for at spare en ekstra kalder" (fx en særlig håndtering af én
  reaktionstype, direkte i `LearnFromReaction`) — det ville sprede
  domænekundskab ud over to lag i stedet for ét.
- **Alternativer overvejet:** (a) lad Application Services indeholde
  simple, "ikke-værd-at-flytte"-domæneregler direkte, og reservere
  domænemodulerne til de mere komplekse tilfælde; (b) lad Application
  Services validere forretningsregler før de kalder domænet, som en
  "hurtig kontrol".
- **Hvorfor denne løsning:** Begge alternativer gør det umuligt at vide
  *hvor* en given regel om systemets adfærd findes uden at læse
  Application-laget også — det underminerer selve pointen med at have
  navngivne, ejerskabsklare domænemoduler (ADR-08, ADR-20). En
  Application Service der udelukkende orkestrerer kan testes ved at
  bevise dens output er identisk med et direkte kald til domænet (jf.
  M10's Review Report) — det beviset er umuligt hvis Application-laget
  selv har tilføjet eller ændret noget undervejs.
- **Konsekvenser:** Enhver ny forretningsregel tilføjes til det
  ejende domænemodul, aldrig til en Application Service. Application
  Services kan omskrives, omarrangeres, eller udskiftes helt uden at
  nogen regel om hvad systemet *gør* ændrer sig.

### ADR-25 — Application Layer konstruerer aldrig sine egne afhængigheder

- **Beslutning:** Ingen klasse i `applicationLayer` må selv skabe en
  konkret repository-, strategi-, eller anden domæneafhængighed. Alt
  leveres udefra, gennem interfaces, ved konstruktion.
- **Baggrund:** M10 Rule 4/6/8 forbyder globale instanser, singletons,
  service locators, og hardcodede persistence-implementeringer.
  Uden en navngivet ADR ville en fremtidig, velmenende bekvemmeligheds-
  ændring (fx "lad `LearnFromReaction` selv oprette en
  `InMemoryUserDnaRepository`, hvis ingen gives" som en default-værdi)
  kunne glide ind som en lille bekvemmelighed, uden at nogen opdager at
  det underminerer hele lagets testbarhed og udskiftelighed.
- **Alternativer overvejet:** (a) tillad et default-konstruktørargument
  der falder tilbage til en konkret in-memory-implementation, for
  nemmere brug uden explicit wiring; (b) et centralt "composition
  root"/service locator-modul som Application Services selv slår op i.
- **Hvorfor denne løsning:** Begge alternativer genindfører præcis den
  skjulte kobling M10 Rule 4 udelukker ved navn ("ingen service
  locator") — et default eller en central opslagstjeneste er blot en
  service locator i forklædning, og gør det umuligt at bevise
  udskiftelighed uden at først fjerne defaulten. At kræve alt leveret
  eksplicit er hvad der gjorde M10's egne beviser (fake vs. rigtig
  repository, identisk resultat) mulige at skrive i første omgang.
- **Konsekvenser:** Enhver, der bruger en Application Service — i dag
  tests, i fremtiden et rigtigt composition-root/wiring-lag, endnu ikke
  bygget — er ansvarlig for selv at konstruere og injicere alle
  afhængigheder. Der findes ingen "nem" genvej, kun den eksplicitte vej.

### ADR-26 — Composition Root er eneste sted hvor konkrete implementationer konstrueres

- **Beslutning:** `buildAppContext()` (M11's Composition Root,
  `src/modules/infrastructure/compositionRoot.ts`) er det ENESTE sted i
  hele systemet der må skrive `new InMemory...` (eller enhver fremtidig
  konkret repository-/adapter-klasse). Intet andet modul — domæne,
  Application Layer, eller test — konstruerer en konkret
  infrastruktur-klasse direkte.
- **Baggrund:** ADR-25 gjorde det til en regel at Application Layer
  aldrig konstruerer sine egne afhængigheder; denne ADR færdiggør
  billedet fra den anden side — der skal findes ét, navngivet sted hvor
  konstruktionen rent faktisk sker, ellers ville "aldrig i Application
  Layer" bare betyde at konstruktionen dukkede tilfældigt op et andet
  sted (en test, en fremtidig UI-fil) uden nogen samlet oversigt over
  systemets fulde afhængighedsgraf.
- **Alternativer overvejet:** (a) lad hver test eller hvert fremtidigt
  indgangspunkt (UI, CLI, osv.) selv konstruere de repositories det har
  brug for, lokalt; (b) flere, mindre composition roots, én pr. feature
  eller pr. indgangspunkt.
- **Hvorfor denne løsning:** Begge alternativer spreder konstruktions-
  ansvaret ud over flere steder — nøjagtig den skjulte kobling M10
  Rule 4/ADR-25 findes for at undgå, blot flyttet til et andet lag.
  Ét, samlet Composition Root betyder at "hvilken konkret
  implementation bruger systemet lige nu" kan besvares ved at læse én
  fil, og at en fremtidig `IndexedDbUserDnaRepository` kun kræver en
  ændring i denne ene fil, ikke en søgning gennem hele kodebasen.
- **Konsekvenser:** M11's egen `architecture.test.ts` gør denne regel
  til en automatisk verificeret invariant (jf. ADR-27) i stedet for en
  konvention: enhver fremtidig `new InMemory...`/`new IndexedDb...` uden
  for `infrastructure/` fejler testsuiten med det samme.

### ADR-27 — Arkitekturregler verificeres automatisk via tests

- **Beslutning:** Strukturelle arkitekturregler — grænser mellem lag,
  forbudte imports, "kun ét sted konstruerer X" — udtrykkes hvor muligt
  som en eksekverbar test, ikke kun som prosa i en Review Report eller
  en engangs-`grep` udført under udvikling.
- **Baggrund:** M1-M10s Review Reports dokumenterede den slags grænser
  gennem manuel gennemlæsning og `grep`-verifikation på
  commit-tidspunktet — sandt da det blev skrevet, men uden nogen
  garanti at det forbliver sandt efter fremtidige ændringer.
  `src/architecture.test.ts` (M11) gør præcis én af disse grænser
  (ingen konkrete repository-imports uden for `infrastructure/`) til en
  test der køres ved hver `npm run test` — en fremtidig regression
  fanges med det samme, ikke ved den næste manuelle review.
- **Alternativer overvejet:** (a) forblive ved manuel `grep`-verifikation
  dokumenteret i Review Reports, som ved M1-M10; (b) et separat
  lint-værktøj/plugin dedikeret til arkitektur-regler (fx
  dependency-cruiser eller lignende), konfigureret uden for selve
  testsuiten.
- **Hvorfor denne løsning:** (a) beviste allerede sin svaghed — flere
  af denne sessions "TDS-afklaringer" var netop nødvendige fordi en
  antagelse fra en tidligere milestone ikke længere holdt, og intet
  automatisk fangede det før næste manuelle review. (b) er en rimelig
  fremtidig udvidelse, men introducerer en ny værktøjsafhængighed for
  en enkelt regel, hvor en almindelig Vitest-test (samme testløber,
  samme kommando, ingen ny afhængighed) er tilstrækkelig lige nu — den
  simpleste korrekte implementation, ikke en poleret løsning.
- **Konsekvenser:** Fremtidige arkitektoniske grænser (fx en tilsvarende
  regel for et kommende lag) bør, hvor det er praktisk muligt, følge
  samme mønster: en test der faktisk scanner kildekoden, ikke kun en
  sætning i en Review Report. Ikke alle regler kan udtrykkes så
  mekanisk (fx "Engine indeholder ingen domænelogik" er stadig bevist
  ved output-sammenligning, ikke ved en syntaks-scanning) — denne ADR
  gælder specifikt strukturelle im/eksport-grænser, ikke enhver
  arkitekturregel.

### ADR-28 — Repository-kontrakter returnerer Result i stedet for rå værdier

- **Beslutning:** `Repository<T>`s `save`/`getById`/`getAll` returnerer
  `Promise<Result<..., RepositoryFailure>>` — aldrig en rå værdi,
  `null`, eller `undefined` som succes- eller fejlsignal. En
  lagerhandling er enten en `Success` (med hvad det så indebærer,
  inklusive et gyldigt "intet fundet" for `getById`) eller en
  navngivet `Failure`.
- **Baggrund:** M12 gjorde det til en bindende regel at ingen fejl må
  skjules og at domænefejl skal beskrives eksplicit, aldrig via en
  kastet undtagelse eller en tvetydig `null`. Dette ændrer
  `Repository<T>`s kontrakt, som ADR-22 (M9) beskrev som "stabil" —
  denne ADR dokumenterer den ændring eksplicit, som M12s egen bindende
  regel krævede. ADR-22 forbliver bevidst uændret som historisk
  post: den var korrekt beskrivelse af kontrakten *dengang*, og
  ændres ikke retroaktivt.
- **Alternativer overvejet:** (a) bevar `T | null` som returtype og
  lad kaldere selv opdage fejl via en separat, parallel mekanisme (fx
  et kastet exception ved reelle lagerfejl, `null` ved "ikke fundet");
  (b) brug `undefined` for "ikke fundet" og reservér `null` til fejl.
- **Hvorfor denne løsning:** Begge alternativer genindfører netop den
  tvetydighed M12 blev startet for at fjerne — en kalder der ser `null`
  kan ikke vide, uden at læse implementeringen, om det betyder "intet
  fundet" (normalt) eller "noget gik i stykker" (en fejl der bør
  propageres). Et explicit `Result` gør de to udfald til to forskellige,
  ikke-forvekslelige værdier i typesystemet selv.
- **Konsekvenser:** Enhver fremtidig repository-implementation
  (IndexedDB, en fjern-backend) skal implementere denne kontrakt
  uændret. Enhver kalder af en repository skal håndtere begge grene af
  `Result`, ikke kun den lykkelige — kompilatoren tvinger det, den
  behøver ikke huskes.

### ADR-29 — Infrastructure oversætter tekniske fejl til domænefejl

- **Beslutning:** Intet teknisk fejlobjekt (en rå `Error`, en
  browser-/HTTP-specifik fejltype, en stacktrace) forlader nogensinde
  `infrastructure/`-laget. Hver konkret repository-implementation
  fanger sin egen tekniske exception og oversætter den til en
  `RepositoryFailure` med en ren, læsbar `reason`-tekst, før noget
  andet lag ser den.
- **Baggrund:** M12 Rule 7 forbyder browser-/HTTP-fejl i domænet og
  kræver at infrastructure oversætter. `runRepositoryOperation()`
  (den delte try/catch-mekanisme alle tre `InMemory*Repository`-klasser
  bruger) er den konkrete implementering af denne regel — denne ADR
  gør den til en bindende arkitekturbeslutning, ikke kun en
  implementeringsdetalje i én milestones kode.
- **Alternativer overvejet:** (a) lad den rå tekniske fejl (fx en
  `DOMException` fra en fremtidig IndexedDB-implementation) boble
  direkte op til Application Layer, som selv afgør hvordan den skal
  fortolkes; (b) log den tekniske fejl et centralt sted og returnér en
  generisk, kontekstfri `RepositoryFailure` uden `reason`.
- **Hvorfor denne løsning:** (a) ville gøre Application Layer
  afhængig af hvilken konkret backend der er i brug — præcis den
  kobling Dependency Inversion (ADR-25/26) findes for at undgå. (b)
  ville opfylde "ingen tekniske fejl i domænet" men gøre fejlen
  ubrugelig til fejlfinding — `reason` bevarer den oprindelige
  begrundelse som ren tekst uden at lække selve det tekniske
  fejlobjekt. `describeError()` (M12) er det som gør denne oversættelse
  konsekvent på tværs af alle tre repositories.
- **Konsekvenser:** En fremtidig `IndexedDbUserDnaRepository` skal
  selv fange sine egne tekniske exceptions (fx en `DOMException` fra
  en afvist transaktion) og oversætte dem gennem samme mønster —
  ADR-28s kontrakt garanterer formen, denne ADR garanterer at intet
  teknisk lækker igennem den.

---

## 11. Non-functional Requirements (NFR)

Krav til systemets egenskaber, ikke dets funktioner — arkitektoniske
beslutninger, ingen implementering.

### Performance
Discovery skal føles øjeblikkelig for allerede-rangerede kandidater i
`queue` — "næste sang" er en lokal opslag, ikke en ny beregning. En
fuld `ranking`-kørsel over op til 500 kandidater skal ikke forsinke
sessionsstart mærkbart; `enrichment` af en stor pulje skal kunne foregå
progressivt/i baggrunden, ikke blokere UI'et. Brugeren skal opleve at
vente på *candidate-hentning* højst én gang pr. session, aldrig på
ranking af data der allerede er hentet.

### Skalering
To uafhængige dimensioner: **antal brugere** (hver bruger har sit eget
isolerede `UserDNA` + `FeedbackEvent`-log; ingen delt tilstand mellem
brugere udover globale `ProviderMetadata`-kvalitetstal) og **antal
providers** (tilføjelse af en ny `candidate-providers`-kilde må aldrig
kræve ændringer i `ranking`, `queue` eller `discovery` — direkte
konsekvens af ADR-02). `FeedbackEvent`-loggen vokser ubegrænset pr.
bruger over tid (ADR-01) — arkitekturen skal forudsætte at
`UserDNA`-opslag forbliver hurtigt via den materialiserede tilstand
(afsnit 6), ikke ved at genafspille hele loggen ved hvert opslag.

### Pålidelighed
Ingen enkelt providers nedetid må kunne stoppe hele discovery-flowet
(afsnit 7, Error Handling). `FeedbackEvent`-tab er den værst tænkelige
fejl i systemet (ADR-01, ADR-04) — skal skrives med den højeste
holdbarhedsgaranti den valgte lagringsteknologi tilbyder, og skrivning
skal bekræftes *før* nogen afledt tilstand (`UserDNA`) opdateres.

### Vedligeholdelse
Modulgrænserne (afsnit 2) er selve vedligeholdelsesstrategien: et
modul skal kunne omskrives internt uden at noget andet modul ændres,
så længe interfacet (afsnit 5) holder. Ranking v1→v2-udskiftningen
(PRD Fase 4, ADR-09) er lakmustesten — kræver den ændringer uden for
`ranking`-modulet, er grænserne ikke stramme nok.

### Testbarhed
Hvert modul skal kunne testes isoleret ved at mocke dets
input-kontrakt (afsnit 5) — intet modul bør kræve en fuld
ende-til-ende-opsætning (rigtigt Spotify-login, rigtige eksterne
API'er) for at teste sin egen logik. Kalibrerings-målingen (afsnit 8)
er selv en testbarheds-mekanisme for `ranking` — den beviser om en
implementering er god eller dårlig, uafhængigt af hvordan den er
bygget internt.

### Forklarlighed
Enhver `RankedCandidate` skal kunne besvare "hvorfor denne score" med
menneskelig-læsbare `explanations` — en del af selve datamodellen
(afsnit 3), ikke en valgfri tilføjelse. Kravet gælder uændret uanset om
`ranking` er regelbaseret (v1) eller en lært model (v2) — en model der
ikke kan producere forklaringer, opfylder ikke dette krav, uanset dens
nøjagtighed (ADR-09).

### Privatliv
Ingen data om en brugers smag, feedback eller lyttehistorik deles
mellem brugere eller sendes til en ekstern `candidate-providers`-kilde
udover det minimum selve forespørgslen kræver — og aldrig `UserDNA`
(ADR-11). Spotify-integrationen bruger mindst mulig scope
(en direkte lært lektion fra v1's manglende `user-top-read`-fejl: for
lidt scope er en funktionsfejl, for meget scope er en privatlivsrisiko
— begge skal aktivt undgås, ikke kun den ene). En "nulstil min
profil"-handling skal være mulig uden at ødelægge aggregeret
træningsværdi (anonymisering, ikke nødvendigvis destruktiv sletning,
jf. afsnit 6).

### Offline-adfærd
En reaktion afgivet uden netværksforbindelse må ikke tabes — skal
kunne køes lokalt og synkroniseres når forbindelsen genoprettes (direkte
konsekvens af at `FeedbackEvent` er kilde til sandhed, ADR-04). Allerede
hentede/rangerede kandidater i den aktuelle `queue` skal kunne vises
offline — ny candidate-hentning og cold start kræver naturligvis
forbindelse, men det er ikke et krav at *hele* systemet virker fra nul
uden netværk, kun at igangværende sessioner og feedback er robuste mod
forbindelsestab.

### Robusthed mod eksterne API-fejl
Direkte formuleret som krav (dækket arkitektonisk af afsnit 7 og
ADR-07): enhver ekstern afhængighed (Spotify, enhver
candidate-provider) skal kunne fejle helt, uden at det crasher appen
eller producerer et resultat der ser normalt ud men er forkert.
Diagnostik (afsnit 8) skal altid kunne forklare *hvilken* ekstern
afhængighed der fejlede og *hvordan* — en uges usynlig fejl i v1
(manglende OAuth-scope, opdaget først ved manuel kodegennemgang) er
selve begrundelsen for at gøre dette til et non-functional krav, ikke
kun en god idé.

---

## 12. Open Questions

Arkitektoniske beslutninger der stadig mangler, før implementering kan
starte med fuld tillid:

1. **Beregningssted for enrichment/ranking.** Hele v1 er klient-side,
   ingen backend. Kræver DNA-skemaets størrelse (30-50 signaler × op
   til 500 kandidater pr. session) en server-/edge-komponent for
   ydeevne, eller kan det stadig klares i browseren?
2. **Flere enheder.** Hvis en bruger bruger Music DNA på flere
   enheder, er lokal-first lagring (IndexedDB, v1's nuværende tilgang)
   tilstrækkelig, eller kræver "feedback er vigtigst"-princippet en
   central lagring for ikke at tabe historik ved enhedsskift?
3. **Novelty-balancering.** Hvordan indregnes Discovery Novelty Rate
   (fra PRD) matematisk i v1-ranking — en fast konstant, eller noget
   brugerjusterbart?
4. **Hvilken anden datakilde først** (Fase 2 i PRD-roadmappet):
   ListenBrainz eller MusicBrainz — afhænger af reel dækning og vilkår,
   ikke afklaret.
5. **Global vs. pr.-bruger provider-kvalitet.** Er
   `ProviderMetadata.qualityScore` ét globalt tal, eller en matrix
   (denne bruger foretrækker kilde A, en anden foretrækker kilde B)?
   Påvirker hele analytics-feedback-loopets datamodel.
6. **AI-providers og attribution.** Juridisk/vilkårsmæssig håndtering
   af AI-genererede kandidater (jf. PRD Risici) er ikke en teknisk
   beslutning, men blokerer implementeringen af den konkrete provider.
7. **Den præcise cold-start-formel.** Hvordan omsættes "topkunstnere +
   gemte sange" konkret til startværdier for de 30-50 signaler? Kræver
   sin egen lille specifikation, ikke defineret her.
8. **😐 Neutral som signal eller ikke-signal.** Skal den tælle som et
   svagt negativt læringssignal (aktivt sprunget over uden entusiasme),
   eller kun bruges til at måle friktion uden at påvirke `UserDNA`?
   PRD'et antyder "næsten intet," men den præcise vægt er ikke fastlagt.
9. **Tærskel for Fase 4.** Efter hvor mange `FeedbackEvent` (globalt
   eller pr. bruger) er der "nok data" til at retfærdiggøre at bygge
   den lærte ranking-model? Intet kvantitativt tærskelværdi er
   defineret endnu.

---

**Dette dokument kræver godkendelse, ligesom PRD'et, før implementering
af Music DNA Rebuilt starter.**
