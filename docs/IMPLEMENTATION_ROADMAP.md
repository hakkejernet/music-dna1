# Music DNA Rebuilt — Implementation Roadmap

**Status:** Godkendt. Oversætter det godkendte `docs/PRD.md` og
`docs/TDS.md` til en konkret byggerækkefølge. Ingen kode er skrevet som
del af dette dokument.

**Princip:** Hver milestone kan implementeres uafhængigt, testes
isoleret, reviewes før den næste starter, og leverer konkret værdi —
enten brugervendt værdi eller en verificerbar teknisk evne (begge
typer er markeret tydeligt nedenfor, aldrig sammenblandet som om de var
det samme).

Dette dokument dækker vejen til PRD Fase 1 (MVP) fuldt ud, plus det
første, konkrete skridt ind i Fase 2 (M11 — bevis på at flere
providers virker). Fase 2's resterende omfang, og Fase 3-4, planlægges
i egne, senere roadmap-dokumenter, når vi når dertil — af samme grund
som resten af dette projekt ikke planlægger langt ud over det næste
bevisbare skridt.

---

## Definition of Done

Denne regel gælder for **hele** Music DNA Rebuilt, ikke kun denne
roadmap — enhver milestone (M1-M11 og alle fremtidige) er først færdig
når **alle** otte punkter er opfyldt:

1. Alle acceptkriterier for milestonen er opfyldt.
2. Alle relevante tests består.
3. Der findes ingen TODO eller placeholder-kode relateret til
   milestonen.
4. Dokumentation er opdateret hvis nødvendigt.
5. Milestonen fungerer isoleret, uden at afhænge af fremtidige
   milestones.
6. Der findes ingen kendte kritiske fejl.
7. Koden er reviewet i forhold til `docs/PRD.md`, `docs/TDS.md` og
   TDS'ets Architectural Decision Records.
8. Milestonen demonstrerer den værdi den er designet til at levere
   (jf. dens "Type"- og "Acceptkriterier"-felter i denne roadmap).

**Ingen ny milestone må begynde før den forrige er godkendt.** Delvis
opfyldelse af Definition of Done tæller som ikke færdig — der findes
ingen "80% færdig, god nok til at fortsætte."

## Review Report

Efter hver milestone skrives en kort Review Report, i dette faste
format:

- **Hvad blev bygget?**
- **Hvilke filer blev ændret?**
- **Hvilke tests blev kørt?**
- **Hvilke risici er tilbage?**
- **Er milestone 100% færdig ifølge Definition of Done?**
- **Er projektet klar til næste milestone?**

Hver Review Report tilføjes som en ny sektion direkte under den
pågældende milestone i dette dokument, umiddelbart efter den er
færdig — samme princip som v1's `CHANGELOG.md`: én løbende,
kronologisk log af hvad der faktisk blev gjort og verificeret, ikke en
plan for hvad der skulle gøres. Godkendelse af en Review Report er
selve porten der åbner for den næste milestone.

## Test-standard

Etableret efter M1, før M2, som en procesbeslutning — ikke sin egen
milestone, men bindende for alle fra M2 og frem (Definition of Done
punkt 2, "alle relevante tests består", forudsætter dette).

- **Test-runner:** [Vitest](https://vitest.dev), konfigureret direkte i
  `vite.config.ts` (via `vitest/config`s `defineConfig`, som er en
  overbygning på Vites egen — ingen parallel config-fil). Valgt fordi
  det er den native løsning for et Vite-projekt: den løser
  extensionless imports helt identisk med appens egen build (samme
  problem der gjorde M1's midlertidige verifikationsscript nødt til at
  bundles med `esbuild` for at kunne køre under almindelig Node), har
  en Jest-kompatibel `describe`/`it`/`expect`-API, og kræver ingen
  separat transform-konfiguration.
- **Konvention:** enhedstests ligger **side om side** med den kode de
  tester, navngivet `<modul>.test.ts` (fx
  `src/modules/trackDna/validateSignalVector.test.ts`) — ikke i en
  separat `tests/`-mappe. Dette holder en tests relevans synlig uden at
  skulle lede efter den.
- **Omfang:** dette er enheds-/logik-tests af ren, deterministisk
  forretningslogik (moduler uden DOM/netværk) — det er *ikke* en
  udskiftning af de eksisterende Playwright-baserede
  integrationsverifikationer af UI-flows, som forbliver den rigtige
  metode til det de allerede har bevist gennem hele v1-arbejdet.
- **Kørsel:** `npm run test` (kører `vitest run`, én gang, ingen
  watch-mode — CI-/DoD-gate-venligt). Skal bestå som del af Definition
  of Done punkt 2 for enhver milestone med forretningslogik.
- **Eksempel etableret:** M1's tidligere midlertidige verifikations-
  script er konverteret til en permanent test-fil
  (`src/modules/trackDna/validateSignalVector.test.ts`, 14 tests) som
  skabelon for hvordan fremtidige milestoners tests skal se ud.

## Arkitektur-note: signal-oprindelse (efter M2, før M3)

Bindende krav for alle fremtidige milestones der konstruerer eller
opdaterer et signal — ikke implementeret nu, men arkitekturen må ikke
gøre det umuligt senere. Mest relevant for M4 (enrichment, der
konstruerer `TrackDNA`-signaler) og M8 (feedback-baseret
`UserDNA`-opdatering).

Hvert signal skal på sigt kunne besvare:
- Hvilken værdi har det?
- Hvilken confidence har det?
- Hvor stammer denne viden fra? (Cold Start, Feedback, eller en
  fremtidig kilde)

**Arkitektonisk vurdering, verificeret nu:** dette er *ikke* blokeret
af M1 eller M2's nuværende implementering. `SignalReading`
(`{value, confidence}`) er et almindeligt objekt — en tredje, additiv
egenskab (fx `source`) kan tilføjes til typen når det besluttes.
Ingen kode i `validateSignalVector()` eller `buildColdStartUserDna()`
antager at et signal *kun* har disse to felter (ingen
`Object.keys(...).length === 2`-agtige tjek noget sted); TypeScripts
strukturelle typecheck vil selv pege på de konstruktionssteder der
skal opdateres den dag feltet tilføjes — en mekanisk migrering, ikke
en ombygning.

Ingen kode ændret som del af denne note.

---

## Afhængighedsoversigt

```
M1 (TrackDNA/UserDNA-skema) ──┬──▶ M2 (Cold Start DNA) ─────────────┐
                              │                                     │
M3 (Candidate Provider) ──────┼──▶ M4 (Enrichment) ──────────────┐  │
                              │                                  ▼  ▼
                              │                              M5 (Ranking v1)
                              │                                     │
                              │                                     ▼
                              │                          M6 (Queue+Discovery koblet)
                              │                                     │
                              │                                     ▼
                              │                          M7 (5 feedback-reaktioner)
                              │                                     │
                              │                                     ▼
                              │                          M8 (UserDNA-opdatering)
                              │                                     │
                              ▼                                     ▼
                          M9 (Fejlhåndtering, ingen mock) ◀──────────┘
                                     │                     M10 (Observability/kalibrering)
                                     ▼                              ▲
                          M11 (Anden provider) ───────────────────────┘
```

M1 og M3 har ingen indbyrdes afhængighed og kan bygges parallelt (eller
i vilkårlig rækkefølge). Alt andet følger en lineær kæde, med M9 og
M10 som de eneste to der trækker på flere tidligere milestones samtidig.

---

## M1 — TrackDNA/UserDNA-skema

**Type:** Teknisk evne (ikke brugervendt).

**Formål:** Definere det fælles signal-katalog (`track-dna`-modulet,
TDS afsnit 2+3) — det reducerede MVP-sæt (~15-20 signaler, jf. TDS
ADR-10), hver med navn, kategori, gyldigt værdiområde og beskrivelse —
samt validering/normalisering af data ind i dette skema.

**Afhængigheder:** Ingen. Kan startes first.

**Omfang:**
- Det endelige, navngivne katalog af MVP-signaler (delmængde af
  PRD'ets fulde 50).
- En valideringsfunktion der tager vilkårlig, delvis input og altid
  producerer et skema-korrekt objekt (manglende signaler → lav/nul
  confidence, aldrig en fejl) — den direkte lektion fra v1's
  `followers.total`-crash.

**Acceptkriterier:**
- Kataloget er skrevet ned og navngivet præcist — ingen to signaler
  overlapper i betydning.
- Et objekt med *alle* signaler udfyldt valideres korrekt.
- Et objekt med *ingen* signaler udfyldt (helt tomt input) valideres
  til et gyldigt skema-objekt med nul-confidence overalt, uden fejl.
- Et objekt med delvist, uventet-formet input (fx forkert type på ét
  felt) degraderer til lav confidence på det felt, uden at vælte hele
  valideringen.

**Testes isoleret ved:** rene input/output-eksempler (fuldt udfyldt,
tomt, delvist, malformeret) — ingen ekstern afhængighed, ingen login,
ingen netværk krævet.

**Review-punkt:** er signal-kataloget det rigtige udsnit til at bevise
missionen (ikke for tyndt til at ranking kan differentiere, ikke så
stort at enrichment bliver en flaskehals)?

### Review Report — M1

**Hvad blev bygget?**
Signal-kataloget (19 MVP-signaler, fordelt på alle fire PRD-kategorier:
11 akustisk, 6 genre, 1 kulturel, 1 struktur — direkte udledt af PRD's
egne eksempel-signaler plus et minimum af tilføjelser for kategori-
dækning), den delte `SignalVector`-type, `TrackDNA`- og `UserDNA`-
skemaerne (TDS §3), og en valideringsfunktion
(`validateSignalVector()`) der tager vilkårlig input og altid
returnerer et skema-korrekt resultat.

To bevidste scope-afgrænsninger, ikke fundet som problemer men som
tolkning af hvor grænsen mellem "skema" og "funktionalitet fra senere
milestones" ligger:
- `UserDNA` og `TrackDNA` er kun typer — ingen kode konstruerer en
  reel instans endnu. `sourceCandidateRef`/`enrichmentCompleteness`
  (TrackDNA) og `coldStart`/`sourceLibrarySnapshotRef`/`version`
  (UserDNA) findes som felter, fordi TDS §3 allerede låste dem, men
  ingen adfærd udfylder dem — det er M4's og M2's/M8's ansvar.
- "Ingen to signaler overlapper i betydning" (acceptkriterium 1) er
  verificeret ved skrevne, indbyrdes afgrænsede beskrivelser
  (fx `energy` vs. `aggressiveness` vs. `melodicStrength` er
  eksplicit forklaret som forskellige akser) — det er en semantisk
  bedømmelse, ikke noget en test kan bevise automatisk. Nævnt
  eksplicit her i stedet for stille antaget.

**Hvilke filer blev ændret?**
Kun nye filer, intet eksisterende rørt:
- `src/modules/trackDna/types.ts`
- `src/modules/trackDna/signalCatalog.ts`
- `src/modules/trackDna/validateSignalVector.ts`
- `src/modules/trackDna/index.ts`
- `src/modules/userDna/types.ts`
- `src/modules/userDna/index.ts`

**Hvilke tests blev kørt?**
9 checks i et midlertidigt script (samme princip som al tidligere
verifikation i dette projekt: skrevet, kørt via en engangs-`esbuild`-
bundling for at kunne importere modulets egne, ubundlede
filsti-imports under Node, derefter fjernet igen — ingen ny permanent
afhængighed tilføjet). Alle 9 bestod. **Bemærkning:** projektet har
ingen permanent test-runner konfigureret endnu (ingen vitest/jest) —
det er ikke besluttet af PRD/TDS/roadmap, og jeg har ikke truffet den
beslutning ensidigt her, for at holde scope stramt. Hvis fremtidige
milestones skal have vedvarende regressions-tests, bør valg af
test-runner besluttes eksplicit, ikke antages.

**Bevis for at alle acceptkriterier er opfyldt:**
1. *Kataloget er navngivet præcist, ingen overlap* — 19 unikke,
   ikke-tomme nøgler med >10-tegns beskrivelser, verificeret
   programmatisk (ingen dubletter) + manuelt gennemlæst for semantisk
   overlap.
2. *Fuldt udfyldt objekt validerer korrekt* — testet med alle 19
   signaler udfyldt; output matcher input eksakt.
3. *Tomt input → gyldigt skema, nul-confidence overalt, ingen fejl* —
   testet med `{}` og separat med `null`, `undefined`, en streng, et
   tal, et array og en funktion som input; alle gav samme korrekte,
   fejlfrie resultat.
4. *Delvist/uventet-formet input degraderer kun det ramte felt* —
   testet med præcis v1's fejlklasse (forkert type på ét felt, ud af
   normalt talområde, manglende under-felt, `null` i stedet for et
   objekt) i samme input som gyldige felter — de gyldige felter forblev
   upåvirkede, kun de defekte felter fik nul-confidence.

**Review Report ifølge roadmap:** dette dokument, jf. formatet defineret
under "Review Report" i toppen af denne roadmap.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier opfyldt — ja (se ovenfor). 2. Tests består — ja,
9/9. 3. Ingen TODO/placeholder — ja, ingen `TODO`-kommentarer, ingen
stub-funktioner. 4. Dokumentation opdateret — ja, denne Review Report
+ inline-kommentarer der eksplicit henviser til hvilke fremtidige
milestones (M2/M4/M8) der udfylder de endnu ikke-brugte felter. 5.
Fungerer isoleret uden fremtidige milestones — ja, ingen import af
`userDna`/`trackDna` findes noget andet sted i kodebasen; hele
projektets eksisterende build/bundle er byte-for-byte uændret
(samme output-hash før og efter). 6. Ingen kendte kritiske fejl — ja.
7. Reviewet mod PRD/TDS/ADR — ja, se scope-afgrænsningerne ovenfor,
alle direkte forankret i TDS §2/§3 og ADR-10/ADR-12. 8. Demonstrerer
den tilsigtede værdi (teknisk evne) — ja: der findes nu et fælles,
robust skema begge fremtidige moduler kan bygges videre på, og det
bevisligt tåler den præcise fejlklasse (manglende/forkert-typet felt)
der tidligere væltede v1's Spotify-integration.

**Ja — M1 er 100% færdig ifølge Definition of Done.**

**Er projektet klar til næste milestone?**
Ja. M2 (Cold Start DNA) kan starte uden ændringer i M1's output —
`validateSignalVector()` og `SIGNAL_CATALOG` er de eneste
afhængigheder M2 behøver, begge stabile og eksporteret fra
`trackDna/index.ts`.

---

## M2 — Cold Start DNA fra Spotify-bibliotek

**Type:** Brugervendt værdi (synligt resultat for en ægte, logget-ind
bruger).

**Formål:** Udlede en initial `UserDNA` fra allerede-eksisterende
Spotify-biblioteksdata (v1's `spotify`-modul, som genbruges uændret).

**Afhængigheder:** M1 (skemaet skal findes for at have noget at
udfylde).

**Omfang:**
- En dokumenteret, deterministisk formel: topkunstnere/genrer/gemte
  sange → startværdier for det MVP-signal-sæt fra M1.
- `coldStart`-flaget sættes korrekt (sandt indtil første rigtige
  feedback).

**Acceptkriterier:**
- En rigtig, logget-ind bruger får en `UserDNA` udfyldt — inspicérbar
  (fx via en simpel debug-visning, samme mønster som v1's
  debug-panel), ikke kun teoretisk til stede.
- To brugere med tydeligt forskellige biblioteker (fx én med mest
  metal, én med mest pop) får synligt forskellige `UserDNA`-profiler.
- En bruger med et stort set tomt bibliotek får stadig en gyldig,
  neutral `UserDNA` (lav confidence, ikke en fejl) — jf. TDS Error
  Handling "tomt DNA".

**Testes isoleret ved:** kendte, faste biblioteks-eksempler (ikke en
levende Spotify-session nødvendigvis — mockede biblioteksdata er
tilladt her, da det er en test af selve formlen, ikke af Spotify-
integrationen, som allerede er bygget og testet i v1).

**Review-punkt:** er cold-start-formlen rimelig, eller producerer den
overraskende/urimelige startprofiler for oplagte testcases?

### Review Report — M2

**Hvad blev bygget?**
`buildColdStartUserDna(userId, snapshot, now)` — en ren, deterministisk
funktion: `Spotify Library-snapshot → Cold Start Builder → UserDNA`,
uden UI og uden live Spotify-kald (se scope-afgrænsning nedenfor).
Genre- (6), mainstream-, explicitness- og songLength-signaler
beregnes fra biblioteksdata når den er til stede; alt andet efterlades
ved M1's neutrale default via `validateSignalVector()`. Hvert beregnet
signal får samme fikserede, lave confidence (`0.2`) — aldrig gradueret
efter datamængde, som eksplicit besluttet for at holde
implementationen simpel (opgavens eget mål: "den simpleste korrekte
implementation", ikke en poleret model).

**Scope-afgrænsning, gjort eksplicit:** roadmappets oprindelige
acceptkriterium nævnte "inspicérbar (fx via en simpel debug-visning)"
som ét eksempel på hvordan resultatet kunne ses. De nye instrukser for
M2 sagde eksplicit "Ingen UI... Kun input: Spotify Library → Cold
Start Builder → UserDNA" — jeg har derfor tolket "inspicérbar" som
opfyldt ved at funktionen returnerer et rigtigt, inspicerbart
JS-objekt, verificeret gennem tests, uden at bygge nogen visning. Der
er heller ikke lavet nogen kobling til en levende Spotify-session
(ingen import fra `modules/spotify`) — det er en fremtidig
integrationsopgave, ikke del af denne milestone. Ingen af disse to
punkter er en konflikt med PRD/TDS/ADR; det er en tolkning af hvor
grænsen for "kun Cold Start" ligger, gjort synlig i stedet for stille
antaget.

**Hvilke filer blev ændret?**
Kun nye filer:
- `src/modules/userDna/librarySnapshot.ts`
- `src/modules/userDna/coldStart.ts`
- `src/modules/userDna/coldStart.test.ts`
- `src/modules/userDna/index.ts` (udvidet med de nye eksports)

**Hvilke tests blev kørt?**
`npm run test` — 11 nye tests (plus M1's 14, alle stadig grønne, 25
i alt), organiseret efter de 5 designprincipper og roadmappets egne
acceptkriterier. `npm run build` og `npm run lint` uændrede (samme
output-hash som før M2 — ingen eksisterende kode påvirket).

**Bevis for acceptkriterier/principper:**

| Krav | Test | Resultat |
|---|---|---|
| Princip 1: deterministisk | Samme input kaldt to gange, `.toEqual()` | ✅ Byte-identisk, også for tomt bibliotek |
| Princip 2: altid lav confidence | Alle beregnede signalers confidence ≤ 0.2 | ✅ |
| Princip 3: ukendt, ikke gættet | De 10 ikke-beregnelige signaler (se tabel nedenfor) har confidence 0, selv med et rigt bibliotek | ✅ |
| Princip 4: ingen enkelt-feature-afhængighed | `topArtists`-signaler beregnes uden `savedTracks` og omvendt; tomme arrays giver ingen division-by-zero-crash | ✅ |
| Princip 5: ren, testbar, ingen UI/ranking/recommendation | Ingen import af React, `ranking`, eller candidate-typer noget sted i modulet | ✅ |
| AC: udfyldt, inspicerbar `UserDNA` for en reel bruger | `userId`/`version`/`updatedAt` korrekt sat, `signals` ikke-tom | ✅ |
| AC: to forskellige biblioteker → synligt forskellige profiler | Rock- vs. pop-tungt bibliotek → `rock`/`pop`/`mainstream`-værdier tydeligt forskellige | ✅ |
| AC: tomt bibliotek → gyldig, neutral, ikke en fejl | `{ topArtists: [], savedTracks: null }` → alle signaler confidence 0, intet throw | ✅ |

**Dokumentation: hvilke signaler kan beregnes direkte, hvilke efterlades bevidst med lav/nul confidence:**

| Signal | Kan beregnes fra Spotify-biblioteket? | Kilde |
|---|---|---|
| pop, hiphop, trap, rock, country, house | ✅ Ja | Nøgleord-match mod topkunstneres `genres`-tags |
| mainstream | ✅ Ja | Gennemsnitlig `popularity` (0-100) for topkunstnere |
| explicitness | ✅ Ja | Andel gemte sange markeret `explicit` |
| songLength | ✅ Ja | Gennemsnitlig `durationMs` for gemte sange, normaliseret |
| energy, tempo, valence, acousticness, danceability, aggressiveness, melodicStrength, instrumentalness, vocalMale, vocalFemale | ❌ Nej — forbliver ved default (confidence 0) | Kræver Spotifys audio-features-endpoint, som allerede er dokumenteret utilgængeligt for nye developer-apps siden november 2024 (jf. v1's `README.md`, "Vigtigt: ingen audio-features i v0.1"). Ingen anden datakilde er tilsluttet i denne milestone (det er `candidate-providers`/`enrichment`s fremtidige opgave, M3-M4) — at gætte disse ville bryde Design Principle 3. |

9 af 19 katalog-signaler kan altså udfyldes ærligt fra det Spotify-data
denne app faktisk har adgang til; de resterende 10 er alle i den
akustiske kategori og forbliver retmæssigt "ukendt" ved cold start.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier opfyldt — ja. 2. Tests består — ja, 25/25. 3. Ingen
TODO/placeholder — ja. 4. Dokumentation opdateret — ja, tabellen
ovenfor plus inline-kommentarer i `coldStart.ts`. 5. Fungerer isoleret
uden fremtidige milestones — ja, ingen import af `candidate-providers`,
`ranking`, eller UI; build-output uændret. 6. Ingen kendte kritiske
fejl — ja. 7. Reviewet mod PRD/TDS/ADR — ja, se scope-afgrænsningen
ovenfor, direkte forankret i TDS Open Question 7 (den præcise
cold-start-formel, nu besvaret) og ADR-12 (confidence som del af hvert
signal). 8. Demonstrerer den tilsigtede værdi — ja: en reel, testbar
Cold Start-formel eksisterer nu og er bevist deterministisk, robust
mod manglende data, og ærlig om sine egne begrænsninger.

**Ja — M2 er 100% færdig ifølge Definition of Done.**

**Er projektet klar til næste milestone?**
Ja. M3 (generaliseret Candidate Provider) har ingen afhængighed af M2
og kan påbegyndes uafhængigt, jf. afhængighedsoversigten.

---

## M3 — Candidate Provider-abstraktionen

**Scope-note (afløser oprindelig beskrivelse nedenfor):** da M3 skulle
påbegyndes, indskærpede brugeren scopet eksplicit: succes måles IKKE på
om ægte musik kan hentes, men på om arkitekturen kan udvides uden
omskrivninger — bevist med deterministiske test-providers, ingen
internetadgang, ingen rigtig Last.fm-genskrivning. Det trak samtidig
`CandidateAggregator` + deduplikering + fejlisolering (oprindeligt
planlagt til M11, se dér) frem i denne milestone. Den oprindelige
"Formål/Omfang/Acceptkriterier"-tekst nedenfor er bevaret som historik,
men er **erstattet** af det faktisk udførte arbejde, dokumenteret i
Review Report'en under den.

**Type:** Teknisk evne (adfærd for brugeren uændret i dette skridt).

**Formål (oprindeligt):** Refaktorere v1's `LastFmRecommendationProvider`
til det generelle `candidate-providers`-interface (TDS afsnit 2) —
leverer `Candidate[]`, aldrig en score.

**Afhængigheder:** Ingen (kan bygges parallelt med M1/M2).

**Omfang (oprindeligt):**
- Last.fm-integrationen genbruges uændret på API-niveau; kun formen af
  det den *returnerer* ændres (rå kandidat, ikke en færdig
  anbefaling).
- `ProviderMetadata` (TDS afsnit 3) oprettes for denne ene kilde.

**Acceptkriterier (oprindeligt):**
- Samme Last.fm-kald som i dag, men output er nu `Candidate[]` uden
  score/rangering.
- En fejlende Last.fm-kilde påvirker ikke noget andet modul (der er
  intet andet modul endnu i denne milestone, men interfacet skal
  allerede være formet til at understøtte det).
- `ProviderMetadata` for Last.fm eksisterer og er inspicérbar.

**Testes isoleret ved:** samme mock-Last.fm-tilgang v1 allerede har
brugt gennem hele denne session (mocket HTTP-svar, ingen afhængighed
af `track-dna` eller ranking).

**Review-punkt:** er `Candidate`-formen generel nok til at en helt
anderledes kilde (fx en AI-provider) også kunne levere den, uden at
skemaet skal ændres igen ved næste provider (M11)?

### Review Report — M3

**Hvad blev bygget?**
`src/modules/candidateProviders/`:
- `types.ts` — `CandidateProvider` (rent interface: `providerName` +
  `fetchCandidates(request)`), `Candidate` (med `contributions:
  CandidateContribution[]`, se TDS-afklaring nedenfor), `CandidateRequest`,
  `ProviderMetadata` (kun `providerName`/`lastSuccessAt`/`lastFailureAt` —
  se afgrænsning nedenfor).
- `candidateAggregator.ts` — `CandidateAggregator`, den eneste klasse der
  kender til mere end én provider. `fetchAll(request, now)` bruger
  `Promise.allSettled` (fejlisolering), en accent-/tegnsætnings-uafhængig
  normaliseret titel+første-kunstner som dedup-nøgle, og slår sammen ved
  at konkatenere `contributions` (aldrig kassere den ene providers
  metadata for at beholde den anden). `now` er et eksplicit parameter —
  samme determinisme-mønster som `buildColdStartUserDna` (M2).
- `candidateAggregator.test.ts` — 12 tests med to deterministiske
  in-memory test-doubles (`FixedListProvider`, `FailingProvider`), ingen
  `fetch`, intet netværkskald noget sted.

**TDS-afklaring, gjort eksplicit (ikke en konflikt):** TDS §3's
`Candidate`-model beskriver `rawMetadata` som "bevares pr. bidrag, ikke
kun det først sete" i prosa, men modellerer det som et fladt felt.
`contributions: CandidateContribution[]` er den strukturelle formalisering
af præcis den sætning — hver contribution bærer sin egen
`providerName`/`externalIds`/`rawMetadata`. Ingen ændring af TDS'
`ProviderMetadata`-tabel var nødvendig for selve dedup-logikken.

**Afgrænsning af `ProviderMetadata`, gjort eksplicit:** TDS §3 lister også
`capabilities` og `qualityScore` på `ProviderMetadata`. Begge er udeladt
her: `capabilities` er enrichments (M4) viden om hvad en kilde plausibelt
kan bidrage til, `qualityScore` beregnes af `analytics` (M10) fra
feedback-udfald. At tilføje dem nu ville være at gætte en form før de
moduler, der reelt ejer den viden, findes. Kun `lastSuccessAt`/
`lastFailureAt` — det M3's egen fejlisoleringslogik faktisk producerer —
er med.

**Scope-hul, gjort synligt (ikke stille besluttet):** ingen kode i denne
milestone rører v1's `LastFmRecommendationProvider` eller wirer den til
det nye interface — det var oprindeligt M3's opgave, men brugerens
opdaterede instruktion for M3 udelukkede eksplicit rigtige API-kald.
Der er derfor nu intet planlagt skridt, der gør Last.fm til en rigtig
`CandidateProvider`. Forslag (ikke besluttet her): lad M11 dække *begge*
opgaver — omskriv Last.fm til det nye interface, tilføj én ny kilde, og
brug den allerede-beviste `CandidateAggregator` til at aggregere dem. Se
opdateret M11-sektion nedenfor for det konkrete forslag; det afventer
brugerens godkendelse ligesom alt andet.

**Hvilke tests blev kørt?**
`npm run test` — 12 nye tests (plus M1's 14 + M2's 11, 37 i alt, alle
grønne). `npx tsc -b`, `npm run lint`, `npm run build` alle grønne og
uændrede for al tidligere kode.

**Bevis for udvidbarhed (M3 Rule: "kan arkitekturen udvides uden
omskrivninger"):**
| Test | Resultat |
|---|---|
| Én provider virker uden kendskab til nogen anden | ✅ |
| Tilføjelse af en ny, ubeslægtet provider ændrer ikke den førstes egne kandidater | ✅ |
| Fjernelse af en provider fjerner kun dens egne kandidater | ✅ |

**Bevis for fejlisolering (Rule 5):**
| Test | Resultat |
|---|---|
| Én fejlende provider stopper ikke de andres resultater | ✅ |
| Den fejlende providers egen `ProviderMetadata` viser fejlen; den raske providers metadata er upåvirket | ✅ |
| Alle providers fejler samtidig → intet throw, tomt resultat | ✅ |

**Bevis for metadata-bevaring ved deduplikering (Rule 6):**
| Test | Resultat |
|---|---|
| To providers' bud på "samme sang" flettes til én `Candidate` med begge `contributions` intakte | ✅ |
| Accent/casing/tegnsætning behandles som samme spor til matching | ✅ |
| Tre-vejs overlap bevarer alle tre bidrag | ✅ |
| Reelt forskellige sange (selv fra samme provider) flettes ikke | ✅ |

**Bevis for testbarhed uden internet:** alle 12 tests bruger kun
in-memory klasser (`FixedListProvider`, `FailingProvider`); ingen import
af `fetch`, `modules/lastfm`, eller `modules/spotify` noget sted i
`candidateProviders/`.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   bevistabellerne ovenfor. 2. Tests består — ja, 37/37. 3. Ingen
   TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne Review
   Report plus inline-kommentarer i koden. 5. Fungerer isoleret uden
   fremtidige milestones — ja, intet import af `enrichment`, `ranking`,
   `userDna`, `feedback`, `queue`, `discovery`, UI, eller `analytics`
   noget sted i `candidateProviders/`. 6. Ingen kendte kritiske fejl —
   ja. 7. Reviewet mod PRD/TDS/ADR — ja, se TDS-afklaringen og
   `ProviderMetadata`-afgrænsningen ovenfor; begge er formaliseringer af
   eksisterende TDS-prosa, ikke ændringer af den. 8. Demonstrerer den
   tilsigtede værdi — ja: beviset er ikke at musik kan hentes, men at
   `CandidateAggregator` er den eneste kode der kender til flere
   providers, og at ingen af de tre bindende egenskaber (udvidbarhed,
   fejlisolering, metadata-bevaring) kræver at røre en providers egen kode.

**Ja — M3 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja, med én åben beslutning at træffe først: hvor det udskudte arbejde
("gør Last.fm til en rigtig `CandidateProvider`") skal placeres — se
scope-hul-noten ovenfor og forslaget til M11 nedenfor.

---

## M4 — Enrichment af én kilde

**Type:** Teknisk evne.

**Formål:** Bygge den første konkrete enricher: Last.fm-tags/metadata
→ `TrackDNA` (delmængde af M1's katalog en tag-baseret kilde
plausibelt kan bidrage til).

**Afhængigheder:** M1 (skema), M3 (kandidater at berige).

**Omfang:**
- Mapping fra Last.fm-tags/genre-info til de af MVP-signalerne der er
  tag-udledelige (primært genre/kulturel-kategorien fra PRD).
- Signaler uden for det denne kilde kan bidrage til forbliver
  lav/nul-confidence — ikke et fejlscenarie (TDS "delvist
  enrichment").

**Acceptkriterier:**
- En rigtig `Candidate` fra M3 bliver til en gyldig `TrackDNA` med
  meningsfuld confidence på genre-relaterede signaler.
- To tydeligt forskellige sange (fx en metal-sang og en pop-sang) får
  synligt forskellige `TrackDNA`-profiler på de signaler kilden kan
  udlede.
- `enrichmentCompleteness` (TDS datamodel) afspejler korrekt at kun et
  delsæt af signalerne blev udfyldt.

**Testes isoleret ved:** faste, kendte `Candidate`-eksempler med kendt
tag-data → forventet `TrackDNA`-output, ingen afhængighed af `ranking`
eller `user-dna`.

**Review-punkt:** er mappingen fra tags til signaler rimelig, eller
tydeligt skæv (fx overvurderer den "mainstream" for alt med mange
lyttere)?

---

## M5 — Ranking v1 (regelbaseret DNA-lighed)

**Type:** Teknisk evne, men med brugervendt konsekvens (scoren
eksisterer nu, selvom ingen ser den endnu i UI før M6).

**Formål:** Bygge den vægtede lighedsberegning (TDS afsnit 2 + ADR-09):
`UserDNA` + `TrackDNA[]` → `RankedCandidate[]` med score 0-100 og
forklaringer.

**Afhængigheder:** M2 (UserDNA), M4 (TrackDNA).

**Omfang:**
- Vægtet lighedsformel pr. signal, confidence-vægtet, normaliseret
  0-100 over den aktuelle kandidat-batch.
- Forklarings-generering (top-bidragende signaler, menneskelig-læsbar
  tekst — samme princip som v1's `explanations`).

**Acceptkriterier:**
- Givet en `UserDNA` og en pulje af `TrackDNA`, produceres en
  `RankedCandidate[]` sorteret efter score.
- En kandidat der ligger tæt på `UserDNA` på de højest vægtede
  signaler får en markant højere score end en kandidat der ligger
  langt fra den, på faste testcases.
- Hver `RankedCandidate` har mindst én meningsfuld, ikke-generisk
  forklaring.
- Lav-confidence-signaler bidrager mindre til scoren end
  høj-confidence-signaler på identiske værdier (beviser at
  confidence-vægtningen reelt virker, ikke kun er til stede i skemaet).

**Testes isoleret ved:** faste `UserDNA` + `TrackDNA`-eksempler,
håndberegnede forventede scores til sammenligning — ingen afhængighed
af `queue`, `discovery`, eller nogen levende provider.

**Review-punkt:** producerer scoringen intuitivt rigtige resultater på
åbenlyse testcases (en sang der er identisk med brugerens profil bør
scoreø højt; en modsat sang bør score lavt)?

---

## M6 — Queue + Discovery koblet til det nye flow

**Type:** Brugervendt værdi — **det første milestone en almindelig
bruger reelt oplever.**

**Formål:** Bytte v1's `RecommendationQueue`/`DiscoveryPage`s
datakilde fra det gamle `Recommendation`-typehierarki til
`RankedCandidate` fra M5, uden at ændre selve kø-/UI-logikken (den er
allerede korrekt bygget og fejlrettet, jf. TDS Migration "genbruges
direkte").

**Afhængigheder:** M5.

**Omfang:**
- `queue` og `discovery` forbruger `RankedCandidate` i stedet for
  `RankedRecommendation`.
- "Hvorfor denne?"-panelet viser de nye DNA-baserede forklaringer.
- Ingen ændring af selve kø-adfærden (ikke-cyklisk, én ad gangen —
  allerede korrekt).

**Acceptkriterier:**
- En rigtig bruger logger ind og ser en sang, rangeret af det nye
  system, i den eksisterende Discovery-UI.
- "Næste" bevæger sig korrekt gennem køen uden at wrappe (allerede
  bevist i v1, skal forblive sandt efter datakilde-skiftet).
- "Hvorfor denne?" viser en forklaring der stammer fra `ranking` (M5),
  ikke den gamle `SimpleRanker`.

**Testes isoleret ved:** samme Playwright-mock-tilgang som resten af
denne session — mock candidate-providers/enrichment-output, verificér
UI-adfærd uden en levende ekstern afhængighed.

**Review-punkt:** føles oplevelsen identisk med v1's Discovery-UX (den
skal ikke ændre sig — kun *hvad* der vises, ikke *hvordan*)?

---

## M7 — 5 feedback-reaktioner

**Type:** Brugervendt værdi.

**Formål:** Udvide fra v1's Gem/Afvis/Kendte til de 5 graduerede
reaktioner (❤️👍😐👎🚫), med det rigere `FeedbackEvent`-skema (TDS
afsnit 3) — inklusive et fuldt snapshot af score+`TrackDNA` på
reaktionstidspunktet.

**Afhængigheder:** M6 (der skal være en rigtig `RankedCandidate` i UI
at reagere på).

**Omfang:**
- Fem knapper/handlinger i `discovery`.
- `FeedbackEvent` persisteres permanent ved hver reaktion (TDS
  Persistence, "kilde til sandhed").
- Genbrug af v1's `RejectReasonPanel`-mønster til valgfri fritekst ved
  👎/🚫.

**Acceptkriterier:**
- Alle 5 reaktioner er tilgængelige og producerer en korrekt,
  struktureret `FeedbackEvent`.
- Hvert `FeedbackEvent` indeholder et fuldt, korrekt snapshot af den
  `RankedCandidate` det gælder (score + `TrackDNA`, ikke kun en
  reference).
- `FeedbackEvent`-loggen overlever en sidegenindlæsning (persisteret,
  ikke kun i hukommelsen).

**Testes isoleret ved:** simulerede reaktioner på faste
`RankedCandidate`-eksempler, verificér det persisterede
`FeedbackEvent`-objekts nøjagtige indhold.

**Review-punkt:** er de 5 reaktioners visuelle/tekstuelle udtryk
tydelige nok at en bruger forstår forskellen mellem 👍 og ❤️, og mellem
👎 og 🚫, uden forklaring?

---

## M8 — UserDNA-opdatering fra feedback

**Type:** Brugervendt værdi — **selve mission-beviset.**

**Formål:** Implementere den vægtede glidende opdatering (TDS ADR-05,
PRD afsnit 2 "Mission") der bruger hvert `FeedbackEvent` til at
opdatere `UserDNA`.

**Afhængigheder:** M7 (kilden til opdateringerne), M2 (den tilstand
der opdateres).

**Omfang:**
- Opdateringsformel: reaktionstype → vægt, aftagende læringsrate med
  stigende confidence (TDS/PRD-beskrevet formel).
- `coldStart`-flaget skifter til falsk efter første reelle
  `FeedbackEvent`.
- Den hurtige undtagelse for 🚫 (kortsigtet undertrykkelse, PRD
  afsnit — nævnt som to-hastigheds-design) kan udskydes til en
  selvstændig senere milestone, hvis det gør denne milestone for stor;
  markeres da eksplicit som ikke inkluderet her.

**Acceptkriterier:**
- Efter en ❤️-reaktion på en sang med høj "energi", stiger
  `UserDNA.energy`-værdien målbart (og dens confidence).
- Efter en 🚫-reaktion, falder den tilsvarende værdi målbart.
- Efter mange reaktioner på lignende sange, stabiliserer et signals
  værdi sig (mindre bevægelse pr. ny reaktion end ved de første
  reaktioner) — beviser at læringsraten reelt aftager med confidence.
- En efterfølgende `ranking`-kørsel (M5) med den opdaterede `UserDNA`
  producerer synligt forskellige scores end før opdateringen, for
  kandidater der er relevante for det ændrede signal.

**Testes isoleret ved:** en sekvens af faste, håndlavede
`FeedbackEvent`-eksempler → forventet `UserDNA`-tilstand efter hver,
sammenlignet med håndberegnede forventninger — ingen UI, ingen levende
provider.

**Review-punkt:** dette er det vigtigste review i hele roadmap'en —
opfører DNA'et sig som forventet på simple, forudsigelige testcases,
før vi stoler på det på rigtige, uforudsigelige brugerdata?

---

## M9 — Fejlhåndtering: ingen mock-fallback

**Type:** Teknisk evne med direkte brugervendt konsekvens (ærlige
fejltilstande i stedet for skjulte).

**Formål:** Implementere de fem fejlscenarier fra TDS afsnit 7 (ingen
kandidater, provider-fejl, manglende metadata, tomt DNA, delvist
enrichment) uden nogen produktions-mock, jf. ADR-07.

**Afhængigheder:** M3+M4 (der skal være reelle fejlpunkter at håndtere
— provider-kald og enrichment).

**Omfang:**
- En tydelig, ærlig tom-tilstand i `discovery` når ingen kandidater
  findes.
- Diagnostik der viser *hvilken* årsag (samme princip som v1's
  debug-panel, men nu dækkende det nye flow) — aktiveres via samme
  `?debug=1`-mønster.
- Bekræftelse af at delvist enrichment og tomt DNA *ikke* udløser en
  fejltilstand (de er normale, jf. TDS).

**Acceptkriterier:**
- Simulerer alle providers nede → brugeren ser en tydelig, ærlig
  besked, ikke placeholder-indhold.
- Simulerer én af flere providers nede → resten af flowet fungerer
  upåvirket.
- Simulerer en bruger med tomt bibliotek og ingen feedback → systemet
  producerer stadig (lav-confidence) resultater, ikke en fejl.
- Debug-visningen viser den korrekte, specifikke årsag i hvert af de
  fire scenarier — ikke en generisk "noget gik galt".

**Testes isoleret ved:** samme Playwright-mock-tilgang som denne
sessions v1-arbejde med debug-panelet — direkte genbrug af metoden,
ikke kun princippet.

**Review-punkt:** er "ærlig tom-tilstand" reelt en acceptabel UX, eller
opleves den som et nedbrud af en almindelig bruger, der ikke kan se
diagnostikken?

---

## M10 — Observability og kalibreringsmåling

**Type:** Teknisk evne, med direkte produktbeslutnings-værdi.

**Formål:** Implementere kernemetrics fra PRD (Save Rate, Negative
Feedback Rate, m.fl.) og kalibrerings-bucket-målingen fra TDS afsnit 8.

**Afhængigheder:** M8 (feedback+DNA-opdatering skal generere data at
måle på), M5 (scores at kalibrere mod).

**Omfang:**
- Aggregering af de PRD-definerede metrics fra `FeedbackEvent`-loggen.
- Kalibrerings-buckets (0-20/20-40/.../80-100 forudsagt score → faktisk
  gem-rate).
- En simpel, inspicérbar visning af disse tal (ikke nødvendigvis et
  poleret dashboard — det er et internt værktøj i denne fase).

**Acceptkriterier:**
- Save Rate, Negative Feedback Rate og de øvrige PRD-metrics kan
  beregnes korrekt fra en fast mængde testdata med kendt forventet
  resultat.
- Kalibrerings-bucketsne viser korrekt fordeling på samme testdata.
- Målingen kører uden at forsinke eller kunne fejle
  `discovery`-flowet (ADR-13 — verificér ved at simulere en
  analytics-fejl og bekræfte at feedback/discovery upåvirket).

**Testes isoleret ved:** faste `FeedbackEvent`+`RecommendationSession`-
datasæt → håndberegnede forventede aggregater.

**Review-punkt:** giver de første rigtige tal (selv fra få interne
testbrugere) et meningsfuldt billede, eller er datamængden for lav til
at sige noget endnu — og hvis sidste, hvad er den mindste datamængde
der ville gøre det meningsfuldt?

---

## M11 — To rigtige Candidate Providers (bevis på pluggability)

**Scope-note tilføjet efter M3 (afventer godkendelse, ikke selvstændigt
besluttet):** M3's bruger-instruktion udelukkede rigtige API-kald, så
`CandidateAggregator` + deduplikering + fejlisolering blev allerede
bygget og testet der — med deterministiske test-providers, ikke rigtig
Last.fm-data. Det betyder v1's `LastFmRecommendationProvider` er
*stadig* ikke omskrevet til det nye `CandidateProvider`-interface. Denne
milestone dækker derfor nu **to** opgaver i stedet for én: (1) omskriv
Last.fm til det nye interface (M3's oprindelige formål), og (2) tilslut
én ny kilde samtidig (denne milestones oprindelige formål). Begge bruger
den allerede-beviste `CandidateAggregator` uændret — det er selve
pointen: aggregatoren blev bevist generel nok i M3 uden at kende til en
eneste rigtig kilde, og skal nu bare modtage to rigtige.

**Type:** Teknisk evne, med direkte strategisk værdi (beviser PRD Fase
2's centrale påstand).

**Formål:** Tilslutte Last.fm (genskrevet til det generelle interface)
og én ny kilde (ListenBrainz eller MusicBrainz — TDS Open Question 4
afgøres konkret her) samtidig, gennem den eksisterende
`CandidateAggregator`.

**Afhængigheder:** M3 (provider-interfacet og aggregatoren skal være
stabile — er de, jf. M3's Review Report), M9 (fejlhåndtering skal
allerede understøtte flere samtidige providers).

**Omfang:**
- Last.fm-integrationen (uændret på API-niveau) pakket i en
  `CandidateProvider`-implementation.
- Én ny `CandidateProvider`-implementation for den anden kilde.
- `ProviderMetadata` for begge kilder, klar til at blive brugt af
  `analytics` (feedback-loopet til provider-kvalitet er dog selv
  uden for denne milestones omfang — det er en Fase 3-opgave).
- Ingen ny aggregerings-/deduplikeringslogik — den findes allerede i
  `CandidateAggregator` fra M3 og genbruges uændret.

**Acceptkriterier:**
- Begge providers kaldes samtidigt via `CandidateAggregator`; en fejl i
  én påvirker ikke den anden (allerede bevist i M3 med test-doubles,
  bekræftes nu med to reelle kilder).
- En sang der findes hos begge kilder optræder kun én gang i den
  endelige pulje, med metadata fra begge bevaret (ikke kun den først
  sete) — samme dedup-logik som M3, nu med rigtig data.
- `ranking` og alt nedstrøms fungerer identisk uden ændringer — det
  er selve beviset på at abstraktionen holder (ingen kode uden for
  `candidate-providers` ændres for at tilføje disse kilder).

**Testes isoleret ved:** mockede svar fra begge kilder, inklusive et
overlap-scenarie, verificér korrekt deduplikering — samme mock-tilgang
v1 allerede har brugt for Last.fm.

**Review-punkt:** krævede tilslutningen af de to kilder reelt *ingen*
ændringer i `candidateAggregator.ts` selv? Hvis den gjorde, er det et
signal om at M3's abstraktion (TDS ADR-02) ikke var stram nok, og skal
rettes før flere providers tilføjes.

---

## Efter M11

PRD Fase 1 (MVP) er hermed fuldt dækket (M1-M10), og det første,
konkrete skridt ind i Fase 2 er taget (M11). Resten af Fase 2, og hele
Fase 3-4 (fuldt signal-katalog, provider-kvalitets-feedback-loop, den
lærte ranking-model), planlægges i deres egne roadmap-dokumenter, når
vi når dertil — samme disciplin som resten af projektet: ikke planlægge
længere frem end vi kan bevise værdien af næste skridt.

---

**Dette dokument kræver godkendelse, ligesom PRD'et og TDS'et, før
implementering af M1 starter.**
