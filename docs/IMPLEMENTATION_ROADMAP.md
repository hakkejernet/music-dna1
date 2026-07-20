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

**Scope-note (afløser oprindelig beskrivelse nedenfor, samme mønster som
M3):** da M4 skulle påbegyndes, indskærpede brugeren scopet eksplicit:
succes måles IKKE på hvor mange signaler der kan udfyldes, men på om
Enrichment er korrekt, deterministisk og udvidbart — bevist med
deterministiske test-kandidater, ingen netværkskald, ingen eksterne
API'er. Otte bindende regler (immutability, forbudt viden om
UserDNA/Ranking/Feedback/Queue/Discovery/UI, én ansvarlig enricher pr.
signal, obligatorisk confidence, normal degradering ved manglende
metadata, determinisme, sporbar signal-oprindelse, ingen netværk) styrede
det faktiske arbejde. Den oprindelige "Formål/Omfang/Acceptkriterier"
nedenfor er bevaret som historik, men **erstattet** af det faktisk
udførte arbejde, dokumenteret i Review Report'en under den.

**Type:** Teknisk evne.

**Formål (oprindeligt):** Bygge den første konkrete enricher: Last.fm-tags/metadata
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

### Review Report — M4

**Hvad blev bygget?**
`src/modules/enrichment/`:
- `types.ts` — `Enricher` (rent interface: `enricherName`,
  `ownedSignals`, async `enrich(candidate)`), `EnrichedCandidate`
  (`{candidate, trackDna, enrichmentMetadata}`), `EnrichmentMetadata`
  (`enricherNames`, `signalSources`, `enrichedAt`).
- `deepFreeze.ts` — rekursiv `Object.freeze` af hele Candidate-grafen før
  nogen enricher rører den; gør immutability til en strukturel garanti,
  ikke en konvention.
- `enrichmentPipeline.ts` — `EnrichmentPipeline`, den eneste kode der
  kender til mere end én enricher. Konstruktøren afviser (kaster) hvis to
  enrichers erklærer samme signal (`assertDisjointOwnership`); `enrich(candidate, now)`
  deep-fryser candidate'en, kører alle enrichers via `Promise.allSettled`
  (fejlisolering), kasserer enhver reading en enricher returnerer for et
  signal den ikke selv har erklæret ejerskab over, kører resultatet gennem
  M1's `validateSignalVector()`, og udregner `enrichmentCompleteness`.
- `enrichers/tagBasedEnricher.ts` — ejer de 6 genre-signaler; læser
  `rawMetadata.tags` fra en hvilken som helst contribution. Fast confidence
  `0.5` (direkte per-track-tag-evidens, stærkere end M2's biblioteks-
  aggregat, men stadig kun nøgleord-match). Med tags til stede får *alle*
  6 genre-signaler en reading (både match=1 og ikke-match=0) — en reel
  bestemmelse, ikke et gæt; helt uden tags forbliver alle 6 ved default.
- `enrichers/explicitMetadataEnricher.ts` — ejer `explicitness`; læser
  `rawMetadata.explicit`. Fast confidence `0.9` (direkte provider-metadata,
  ikke en inferens — samme kategori evidens som v1's Spotify `explicit`-felt).
- `enrichmentPipeline.test.ts` — 15 nye tests.

**Bindende regler → hvor de er implementeret (ikke kun hævdet):**

| Regel | Implementering |
|---|---|
| 1. Ingen mutation, Candidate genskabelig | `deepFreeze()` før enrichers kører; `EnrichedCandidate.candidate` er samme reference, aldrig kopieret/ændret |
| 2. Intet kendskab til UserDNA/Ranking/Feedback/Queue/Discovery/UI | `enrichment/` importerer kun fra `candidateProviders` og `trackDna` — verificeret ved gennemlæsning af alle imports i modulet |
| 3. Én ansvarlig enricher pr. signal, ingen implicit overskrivning | `assertDisjointOwnership()` kaster ved konstruktion ved overlap; pipeline kasserer desuden runtime-readings uden for en enrichers erklærede `ownedSignals` |
| 4. Alle signaler har confidence, intet gæt | `PartialSignalContribution` er `Partial<SignalVector>` — hver reading er en fuld `{value, confidence}`; udeladte signaler får `validateSignalVector()`s neutrale default (confidence 0), aldrig en gættet værdi |
| 5. Manglende metadata er normalt, ingen fejl | `findTags`/`findExplicitFlag` returnerer `null` ved manglende felt → tomt bidrag, ikke et throw; `Promise.allSettled` isolerer en enrichers eget throw fra resten |
| 6. Determinisme | `now` er et eksplicit parameter (aldrig `Date.now()` internt); ingen anden ikke-deterministisk kilde (intet netværk, ingen tilfældighed) |
| 7. Sporbar TrackDNA (value/confidence/source) | `value`/`confidence` er allerede en del af `SignalReading` (M1); `source` er nu faktisk implementeret som `EnrichmentMetadata.signalSources` — se afgrænsning nedenfor |
| 8. Ingen netværk/eksterne API'er | Ingen `fetch`/import af `modules/lastfm` eller `modules/spotify` noget sted i `enrichment/`; alle tests bruger `makeCandidate()`-fixtures |

**Afgrænsning af Regel 7, gjort eksplicit:** reglen tillader at source
"først implementeres senere" — men da pipelinen alligevel må vide hvilken
enricher der rørte hvilket signal (for at kunne afvise out-of-contract-
readings, Regel 3), var det billigt at rent faktisk registrere det, i
stedet for kun at hævde arkitekturen *kunne* understøtte det. Det er
lagt i `EnrichmentMetadata.signalSources` — et felt på enrichments eget
output — og **ikke** i `TrackDNA`/`SignalReading` selv, som stadig kun har
`{value, confidence}` (uændret siden M1). At udvide `SignalReading` med et
`source`-felt hører til `track-dna`-modulets skema (M1s ejerskab), ikke
til enrichment, og er derfor ikke gjort her — samme grænsedragning som
M2/M3's egne scope-noter.

**Andre scope-beslutninger, gjort eksplicit:**
- `trackId` sættes til `candidate.candidateId`. Der findes endnu ingen
  separat track-id-udstedelsestjeneste (TDS nævner `trackId` som "intern,
  kanonisk identifikator, uafhængig af enkelte providers ID-skemaer") — at
  bygge én er ikke del af Enrichment og ikke bedt om her. Dette er den
  simpleste ærlige værdi tilgængelig nu, ikke en påstand om at den er
  kanonisk på tværs af providers.
- Ingen rigtig Last.fm-tilslutning (samme mønster som M3/M11): denne
  milestones regel 8 udelukkede eksterne API-kald, så begge enrichers
  virker på en generisk `rawMetadata.tags`/`rawMetadata.explicit`-form, ikke
  det faktiske Last.fm-svarskema. At mappe et rigtigt Last.fm-svar til
  denne form er ikke gjort — det er en fremtidig ledningsopgave (jf. M11's
  allerede planlagte Last.fm-omskrivning), ikke en del af selve
  Enrichment-arkitekturen.

**Hvilke tests blev kørt?**
`npm run test` → 52/52 grønne (37 fra M1-M3 + 15 nye). `npx tsc -b`,
`npm run lint`, `npm run build` alle grønne og uændrede for al
eksisterende kode.

**Bevis for immutability:** to tests — én der viser candidate'en er
byte-identisk (`toEqual` mod en før-snapshot) efter en kørsel med en
enricher der aktivt forsøger at mutere den (`MutatingEnricher`, forsøger
både felt-tildeling og array-push, begge på en frossen struktur), og én
der viser `result.candidate` er samme reference som input, ikke en kopi.

**Bevis for determinisme:** samme `(candidate, now)` kaldt to gange →
`toEqual` på hele resultatet, inklusive `enrichmentMetadata.enrichedAt`.

**Bevis for korrekt confidence:** tag-match → `{value: 1, confidence: 0.5}`;
tag-ikke-match (tags til stede, ingen match) → `{value: 0, confidence: 0.5}`;
direkte `explicit`-metadata → `{value, confidence: 0.9}` — synligt højere
end tag-baseret confidence, som bevidst; alle signaler intet enricher rørte
→ confidence 0, aldrig et gæt.

**Bevis for at manglende metadata ikke vælter enrichment:** tomt
`rawMetadata` (`{}`), samt `null`/streng/tal/`undefined` som hele
`rawMetadata`-værdien, resulterer alle i et fuldt, validt `TrackDNA` uden
throw — alle 19 signaler til stede, alle ved default. Separat test viser
at én enricher der altid kaster (`ThrowingEnricher`) hverken vælter
pipelinen eller påvirker den anden enrichers bidrag; endda alle enrichers
fejlende samtidig giver stadig et gyldigt (tomt) resultat.

**Bevis for ingen implicit overskrivning:** konstruktion af en pipeline
med to enrichers der begge erklærer `mainstream` kaster med det samme
(`assertDisjointOwnership`), før nogen candidate kan berige noget. Separat
test viser at en enricher som returnerer en reading for et signal den
*ikke* har erklæret (`OutOfContractEnricher`), får den readings kasseret —
signalet forbliver ved default, ikke ved den uautoriserede værdi.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   tabellen og bevisafsnittene ovenfor. 2. Tests består — ja, 52/52.
   3. Ingen TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne
   Review Report plus inline-kommentarer i koden. 5. Fungerer isoleret
   uden fremtidige milestones — ja, intet import af `userDna`, `ranking`,
   `feedback`, `queue`, `discovery`, UI, eller `analytics` noget sted i
   `enrichment/`. 6. Ingen kendte kritiske fejl — ja. 7. Reviewet mod
   PRD/TDS/ADR — ja: `source`-tilføjelsen i `EnrichmentMetadata` udvider
   ikke TDS' `TrackDNA`/`SignalReading`-skema, kun enrichments eget output;
   ADR-08 ("TrackDNA er adskilt fra Enrichment") og ADR-14 ("Candidate
   Aggregator er bevidst mekanisk") er begge respekteret — enrichment
   producerer, men rangerer eller filtrerer ikke. 8. Demonstrerer den
   tilsigtede værdi — ja: beviset er ikke antal udfyldte signaler
   (7 af 19 med de to nuværende enrichers), men at pipelinen er
   udvidbar (ny enricher = ingen ændring i eksisterende), fejlisoleret,
   og aldrig gætter.

**Ja — M4 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja, med samme type åbne beslutning som efter M3: hvor/hvornår Last.fm
rent faktisk mappes til enrichments generiske `rawMetadata`-form. Ingen
ændring foretaget her — kun gjort synlig, som scope-hullerne i M3.

---

## M5 — Ranking v1 (regelbaseret DNA-lighed)

**Scope-note (afløser oprindelig beskrivelse nedenfor, samme mønster som
M3/M4):** da M5 skulle påbegyndes, indskærpede brugeren scopet
eksplicit: succes måles IKKE på hvor "smarte" anbefalingerne virker, men
på om Ranking Engine er en ren, deterministisk og udskiftelig komponent.
Ni bindende regler (ren funktion/ingen sideeffekter, kun læsning,
forklarlig score-breakdown, normal degradering ved manglende signaler,
confidence skal vægte skalaen — ikke kun relativt, determinisme,
eksplicit tie-break, udskiftelig kontrakt, intet netværk/UI/queue/
feedback) styrede det faktiske arbejde, inklusive input-formen
(`EnrichedCandidate[]`, ikke rå `TrackDNA[]`). Den oprindelige
"Formål/Omfang/Acceptkriterier" nedenfor er bevaret som historik, men
**erstattet** af det faktisk udførte arbejde, dokumenteret i Review
Report'en under den.

**Type:** Teknisk evne, men med brugervendt konsekvens (scoren
eksisterer nu, selvom ingen ser den endnu i UI før M6).

**Formål (oprindeligt):** Bygge den vægtede lighedsberegning (TDS afsnit 2 + ADR-09):
`UserDNA` + `TrackDNA[]` → `RankedCandidate[]` med score 0-100 og
forklaringer.

**Afhængigheder:** M2 (UserDNA), M4 (TrackDNA).

**Omfang (oprindeligt):**
- Vægtet lighedsformel pr. signal, confidence-vægtet, normaliseret
  0-100 over den aktuelle kandidat-batch.
- Forklarings-generering (top-bidragende signaler, menneskelig-læsbar
  tekst — samme princip som v1's `explanations`).

**Acceptkriterier (oprindeligt):**
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

### Review Report — M5

**Hvad blev bygget?**
`src/modules/rankingEngine/` (ny mappe, se navngivnings-note nedenfor):
- `types.ts` — `RankingEngine` (rent interface: synkron
  `rank(userDna, candidates, now) => RankedCandidate[]`), `RankedCandidate`
  (`candidateRef`, `trackDnaRef`, `score`, `scoreBreakdown`,
  `explanations`, `rankedAt` — uden `sessionRef`, se afgrænsning
  nedenfor), `ScoreBreakdown` (`genreMatch`, `mainstreamMatch`,
  `explicitMatch`, `durationMatch`).
- `signalGroups.ts` — den eksplicitte, dokumenterede mapping fra hvert
  af de 4 breakdown-navne til dets katalog-signaler.
- `scoring.ts` — `computeScore()`: for hver bucket beregnes
  `quality * trust` (se formel-note nedenfor), derefter et samlet
  0-100-tal som et ligevægtet gennemsnit af de buckets der faktisk
  havde data; `explainBreakdown()` genererer menneskelig-læsbare
  forklaringer direkte fra breakdown'et, ikke separat.
- `ruleBasedRankingEngine.ts` — `RuleBasedRankingEngine implements
  RankingEngine`: regelbaseret, forklarlig (TDS ADR-09), ren funktion,
  sorterer efter score, dernæst efter `candidateRef` (streng-sammenligning,
  ikke `localeCompare`, se afgrænsning nedenfor) ved uafgjort.
- `ruleBasedRankingEngine.test.ts` — 12 nye tests.

**Navngivnings-note, gjort eksplicit:** v1's eksisterende
`src/modules/ranking/` (med `SimpleRanker`) er urørt — det er stadig
den gamle recommendation-motors ranker, som ikke er del af Music DNA
Rebuilt og ikke må ændres (`ingen kode uden for M5`). Den nye,
TDS-definerede `ranking`-komponent er derfor lagt i en separat mappe,
`rankingEngine/`, for at undgå navnekollision — ikke en omdøbning eller
sletning af noget eksisterende.

**Formel-note, gjort eksplicit (den vigtigste tolkning i denne
milestone):** Rule 4 ("manglende signal skal bidrage med 0 eller
ignoreres") og Rule 5 ("confidence 0.2 skal vægte lavere end confidence
0.9 for et identisk match — ikke kun relativt til andre signaler") er i
spænding med hinanden under en simpel confidence-vægtet gennemsnitsformel:
normaliseres der (divideres med summen af vægte), forsvinder confidence's
absolutte effekt fuldstændigt for enkelt-signal-buckets (vægten går ud
med sig selv i tæller og nævner) — det ville opfylde Rule 4, men ikke
Rule 5. Løsningen implementeret her: hver bucket-score er `quality * trust`,
hvor `quality` er et confidence-vægtet gennemsnit af lighed *kun* blandt
signaler der faktisk har data (ukendte signaler tæller hverken godt eller
skidt — Rule 4), og `trust` er den gennemsnitlige kombinerede confidence
over *alle* signaler i bucket'en, inklusive de ukendte (dette er hvad der
giver Rule 5's konkrete eksempel direkte: for en enkelt-signal-bucket
reducerer formlen til `lighed × confidence`, så 0.2 vs. 0.9 confidence på
et identisk match giver netop 0.2 vs. 0.9). For `genreMatch` (6 signaler)
betyder det at delvis dækning (fx kun 1 af 6 genre-signaler kendt) sænker
`trust` uden at behandle den kendte del som et dårligt match — en ærlig,
ikke-straffende model, konsistent med ADR-12's "confidence er en del af
hvert signal."

**Andre scope-beslutninger, gjort eksplicit:**
- `sessionRef` (TDS §3 RankedCandidate) er udeladt. Feltet forudsætter en
  `RecommendationSession` — et queue/discovery-begreb Rule 9 eksplicit
  forbyder Ranking Engine at kende til. At udfylde det er en fremtidig
  opgave for det modul der rent faktisk opretter en session (M6), ikke
  for ranking selv.
- `rank()` er synkron, ikke async som `CandidateProvider`/`Enricher`
  (M3/M4). De to er async fordi en *fremtidig* implementation plausibelt
  kunne have brug for I/O (en rigtig API, for enrichments vedkommende).
  Ranking har ingen sådan fremtid — Rule 9 forbyder netværk permanent,
  ikke kun i denne milestone — så "ren funktion" (Rule 1) er taget
  bogstaveligt.
- Ingen `deepFreeze()` (i modsætning til M4's `EnrichmentPipeline`).
  `EnrichmentPipeline` fryser defensivt fordi den er en orkestrator der
  kalder *flere, uafhængige, potentielt fejlbarlige* enrichers — samme
  rolle som `CandidateAggregator` har for providers. `RuleBasedRankingEngine`
  har ingen indre plugin-grænse at forsvare (den er selv "bladet", ikke
  orkestratoren); en fremtidig ranking-orkestrator, hvis der nogensinde
  bliver flere samtidige ranking-strategier, ville være det rette sted
  for en sådan frysning — ikke den enkelte, i sig selv rene, algoritme.
  Immutability er derfor bevist ved ligheds-test (før/efter-snapshot),
  samme mønster som M3's `CandidateAggregator`-tests, ikke ved en
  strukturel frysning.
- Tie-break bruger `<`/`>` på rene strenge, ikke `.localeCompare()` —
  locale-bevidst sammenligning kan variere med ICU-version mellem
  runtime-miljøer, hvilket ville gøre selve tie-break'et
  ikke-deterministisk tværs af miljøer (Node under test vs. browser i
  produktion) — præcis det Rule 6/7 forbyder.

**Hvilke tests blev kørt?**
`npm run test` → 64/64 grønne (52 fra M1-M4 + 12 nye). `npx tsc -b`,
`npm run lint`, `npm run build` alle grønne og uændrede for al
eksisterende kode (inklusive v1's urørte `modules/ranking`).

**Bevis for determinisme:** samme `(userDna, candidates, now)` kaldt to
gange → `toEqual`-identisk resultat.

**Bevis for immutability:** `userDna` og hver candidate er byte-identiske
(`toEqual` mod en før-snapshot) efter `rank()`; funktionen returnerer en
ny, uafhængig array hver gang.

**Bevis for tie-break:** to kandidater med garanteret identisk score
(identisk perfekt match) rangeres i samme rækkefølge (`candidate-a` før
`candidate-b`) uanset om de blev givet som `[a, b]` eller `[b, a]` til
`rank()` — beviser uafhængighed af input-rækkefølge, ikke kun at
sorteringen er "stabil" på én bestemt kørsel.

**Bevis for score-breakdown:** hver `RankedCandidate` har alle 4 navngivne
felter til stede altid (også når de er 0); `explanations` er udledt
direkte af breakdown'et (ikke en separat, potentielt inkonsistent
beregning) og er en tom liste — ikke en opfundet tekst — når intet kunne
bestemmes.

**Bevis for korrekt håndtering af confidence:** identisk perfekt match
ved confidence 0.2 vs. 0.9 giver bucket-scoren 0.2 vs. 0.9 (ikke kun en
relativ forskel, men de facto disse tal) og en lavere samlet score for
0.2-tilfældet; to signaler med hhv. confidence 0.1 og 0.95 og identisk
værdi-match giver en `genreMatch` der ligger strengt mellem 0 og 1 — aldrig
behandlet som lige sikre.

**Bevis for korrekt håndtering af manglende signaler:** en candidate med
helt tomme signaler ranker til en gyldig `RankedCandidate` med score 0,
uden throw; et enkelt kendt signal i en 6-signals-bucket giver en
bucket-score strengt mellem 0 og 1 (den kendte del straffes ikke, men
den ukendte del tælles heller ikke som bekræftet); en tom candidate-liste
giver en tom result-liste, ikke en fejl.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   bevisafsnittene ovenfor. 2. Tests består — ja, 64/64. 3. Ingen
   TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne Review
   Report plus inline-kommentarer i koden (særligt formel-noten i
   `scoring.ts`). 5. Fungerer isoleret uden fremtidige milestones — ja,
   intet import af `queue`, `discovery`, `feedback`, UI, `analytics`,
   eller v1's `modules/ranking` noget sted i `rankingEngine/`; kun
   type-imports fra `candidateProviders`, `enrichment`, `trackDna`,
   `userDna` (data-formen, ikke deres logik). 6. Ingen kendte kritiske
   fejl — ja. 7. Reviewet mod PRD/TDS/ADR — ja: `sessionRef`-udeladelsen
   og den synkrone kontrakt er begge afgrænsninger af TDS' eksisterende
   §3/§2-beskrivelse, ikke ændringer af den; ADR-09 (forklarlig, ikke
   en sort boks) er direkte efterlevet af at breakdown *er* beregningen,
   ikke en efterrationalisering. 8. Demonstrerer den tilsigtede værdi —
   ja: beviset er ikke om anbefalingerne "virker godt", men at
   `RankingEngine` er ren, deterministisk, og at en anden implementation
   (fx en fremtidig ML-ranker) kan indsættes bag samme interface uden at
   noget andet i systemet ændres.

**Ja — M5 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja. M6 (Queue + Discovery koblet til det nye flow) kan nu bygges på et
`RankingEngine` der er bevist rent, deterministisk og udskifteligt.

---

## M6 — Recommendation Queue / Orchestration

**Scope-note (afløser oprindelig beskrivelse nedenfor, samme mønster som
M3/M4/M5):** da M6 skulle påbegyndes, indskærpede brugeren scopet
eksplicit til KUN Recommendation Queue/Orchestration — ikke Discovery-UI,
ikke en databinding til v1's eksisterende komponenter. Ni bindende
regler (køen ejer kun rækkefølgen, kender kun `RankedCandidate`, er
deterministisk, beregner ingen scorer, registrerer aldrig feedback —
kun returnerer hændelser, navigation uden sideeffekter, tom queue er
normal, immutability, intet UI/React/persistence/netværk) styrede det
faktiske arbejde. Rule 8 (immutability: handlinger returnerer en ny
queue-state) er direkte uforenelig med v1's `RecommendationQueue`, som
er en muterbar klasse (`this.cursor`, `this.items` opdateres in-place) —
se TDS-afklaringen i Review Report'en for hvorfor TDS' egen antagelse om
direkte genbrug ikke kunne overholdes. Den oprindelige
"Formål/Omfang/Acceptkriterier" nedenfor er bevaret som historik, men
**erstattet** af det faktisk udførte arbejde.

**Type (oprindeligt):** Brugervendt værdi — det første milestone en
almindelig bruger reelt oplever.

**Formål (oprindeligt):** Bytte v1's `RecommendationQueue`/`DiscoveryPage`s
datakilde fra det gamle `Recommendation`-typehierarki til
`RankedCandidate` fra M5, uden at ændre selve kø-/UI-logikken (den er
allerede korrekt bygget og fejlrettet, jf. TDS Migration "genbruges
direkte").

**Afhængigheder:** M5.

**Omfang (oprindeligt):**
- `queue` og `discovery` forbruger `RankedCandidate` i stedet for
  `RankedRecommendation`.
- "Hvorfor denne?"-panelet viser de nye DNA-baserede forklaringer.
- Ingen ændring af selve kø-adfærden (ikke-cyklisk, én ad gangen —
  allerede korrekt).

**Acceptkriterier (oprindeligt):**
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

### Review Report — M6

**Hvad blev bygget?**
`src/modules/queue/` (ny mappe, samme navngivnings-situation som M5 —
se afklaring nedenfor):
- `types.ts` — `ReactionType` (`'save' | 'reject' | 'known'`),
  `QueueReactionEvent` (`candidateRef`, `trackDnaRef`, `reactionType`) —
  queue's egen, lokale hændelses-vokabular, ikke importeret fra noget
  `feedback`-modul (som ikke findes endnu).
- `recommendationQueue.ts` — `RecommendationQueue`: et immutabelt
  value-objekt over en allerede-rangeret `RankedCandidate[]`.
  `static create()` tager sin egen frosne kopi af den givne sekvens
  (`Object.freeze([...rankedCandidates])`) — queue'ens snapshot kan ikke
  ændres af noget kalderen gør med sit eget array bagefter.
  `current()`/`peek()`/`remaining()` er rene forespørgsler; `next()` og
  `react()` returnerer en ny `RecommendationQueue`-instans, aldrig en
  muteret `this`. `react()` returnerer *kun* en `QueueReactionEvent`
  (eller `null` hvis køen er tom) plus den nye state — ingen persistering,
  intet kald til `userDna` eller noget andet modul.
- `recommendationQueue.test.ts` — 18 nye tests.

**TDS-afklaring, gjort eksplicit (ikke en konflikt, ingen ADR
nødvendig):** TDS §2's `queue`-beskrivelse og roadmappets oprindelige
M6-tekst begge antog at v1's `RecommendationQueue`
(`src/modules/recommendations/recommendationQueue.ts`) kunne genbruges
direkte, siden dens ikke-cykliske adfærd allerede var korrekt og
fejlrettet. M6's Rule 8 (immutability: handlinger returnerer en ny
queue-state) gør den antagelse uholdbar — v1's klasse er bevidst
muterbar (`this.cursor += 1` in-place, jf. dens egen fejlrettelse
tidligere i denne session). Der er derfor bygget en ny, immutabel klasse
i et nyt modul (`src/modules/queue/`), som **gentager** v1's
ikke-cykliske løsning (cursor capped ved `items.length`, aldrig
wrappet) i den nye, immutable form — samme adfærd, ny mekanisme. v1's
`modules/recommendations/recommendationQueue.ts` er **urørt** — dette er
ikke en ændring af en tidligere milestone (ADR-16 er derfor ikke
relevant her: intet fra M1-M5 er ændret, kun tilføjet noget nyt parallelt
til v1's egen, stadig urørte kode).

**Navngivnings-note:** samme mønster som M5's `rankingEngine/` vs. v1's
`ranking/` — den nye, TDS-definerede `queue`-komponent hedder
`src/modules/queue/` for at undgå kollision med v1's
`modules/recommendations/recommendationQueue.ts`, som forbliver
uændret og ubrugt af denne milestone.

**Andre scope-beslutninger, gjort eksplicit:**
- Ingen Discovery-UI, ingen React, ingen binding til `DiscoveryPage` —
  Rule 9 forbyder det eksplicit. Det oprindelige roadmap-formål ("en
  rigtig bruger logger ind og ser en sang... i den eksisterende
  Discovery-UI") er derfor ikke opfyldt i denne milestone — det er nu
  en fremtidig UI-koblingsopgave, ikke del af selve Queue-arkitekturen.
- `react()` fremmer altid til næste kandidat efter en reaktion (samme
  `next()`-state), fordi TDS §2 selv siger queue aldrig må "genbruge en
  allerede afgjort sang" — en kandidat der er reageret på er afgjort.
- `peek()` har ingen parameter (viser kun ét skridt frem) — den mest
  bogstavelige læsning af Rule 6's liste, ingen ekstra funktionalitet
  tilføjet ud over det navngivne.

**Hvilke tests blev kørt?**
`npm run test` → 82/82 grønne (64 fra M1-M5 + 18 nye). `npx tsc -b`,
`npm run lint`, `npm run build` alle grønne og uændrede for al
eksisterende kode (inklusive v1's urørte `RecommendationQueue`).

**Bevis for immutability:** `next()`/`react()` kaldt på en queue ændrer
aldrig dens egne `current()`/`remaining()`-værdier bagefter; et separat
array givet til `create()` og efterfølgende muteret af kalderen (push,
overskrivning af element 0) påvirker ikke queue'ens egen sekvens; ingen
`RankedCandidate` queue'en holder på ændres af nogen queue-operation.

**Bevis for determinisme:** to uafhængigt oprettede queues, drevet
gennem identiske handlingssekvenser (gentagne `next()`-kald), producerer
identiske resultater hele vejen igennem.

**Bevis for korrekt navigation:** `current()` starter ved første element
i den givne rækkefølge; `peek()` viser næste uden at fremme; `next()`
fremmer præcis ét skridt; `remaining()` tæller korrekt ned; en udtømt
queue forbliver udtømt og wrapper aldrig tilbage til start (ikke-cyklisk,
verificeret eksplicit med et separat test).

**Bevis for tom queue:** `create([])` giver `current()`/`peek() = null`,
`remaining() = 0`, uden throw; `next()` på en tom/udtømt queue forbliver
tom uden throw; `react()` på en tom queue giver `{event: null, queue: uændret}`.

**Bevis for at feedback kun returneres som hændelser:** `react()`s
returnerede `event` indeholder præcis tre felter (`candidateRef`,
`trackDnaRef`, `reactionType`) — ingen score, intet breakdown, ingen
DNA-data; alle tre navngivne reaktionstyper (save/reject/known)
håndteres identisk på queue-niveau; intet kald til `userDna` eller noget
andet modul sker nogen steder i `queue/` (verificeret ved gennemlæsning
af modulets imports — kun `../rankingEngine`s type og egne lokale typer).

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   bevisafsnittene ovenfor. 2. Tests består — ja, 82/82. 3. Ingen
   TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne Review
   Report plus inline-kommentarer i koden. 5. Fungerer isoleret uden
   fremtidige milestones — ja, intet import af `discovery`, `feedback`,
   `userDna`, UI, eller v1's `modules/recommendations` noget sted i
   `queue/`; kun et type-import fra `rankingEngine` (M5). 6. Ingen
   kendte kritiske fejl — ja. 7. Reviewet mod PRD/TDS/ADR — ja:
   TDS-afklaringen ovenfor dokumenterer hvorfor v1's konkrete klasse
   ikke genbruges, uden at det er en ændring af en tidligere milestone
   (ADR-16 udløses ikke); ADR-16 selv (score vs. breakdown-stabilitet)
   er ikke relevant for denne milestone. 8. Demonstrerer den tilsigtede
   værdi — ja: beviset er ikke hvor mange anbefalinger der vises (ingen
   UI eksisterer endnu), men at systemet kan levere kandidater til et
   fremtidigt UI på en ren, immutabel, reproducerbar måde.

**Ja — M6 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja. M7 (5 feedback-reaktioner) kan bygges på en `RecommendationQueue`
der allerede strukturerer reaktioner som rene hændelser — det er
præcis den grænseflade en fremtidig `feedback`-modul har brug for at
konsumere.

---

## M7 — Feedback Pipeline

**Scope-note (afløser oprindelig beskrivelse nedenfor, samme mønster som
M3-M6):** da M7 skulle påbegyndes, indskærpede brugeren scopet
eksplicit til KUN Feedback Pipeline — validering, normalisering,
berigelse med tidsstempel, og omdannelse til et domæneobjekt for M8.
Otte bindende regler (pipeline ejer kun feedback, input er kun
`QueueReactionEvent`, output er et domæneobjekt, må validere men ikke
lære, determinisme, idempotens, manglende metadata er normalt, intet
persistence/database/IndexedDB/API) styrede det faktiske arbejde. Det
er en markant indskrænkning af det oprindelige M7 nedenfor på to
punkter: (a) tre reaktionstyper (`save`/`reject`/`known`, M6's egne)
i stedet for fem graduerede emoji-reaktioner, og (b) ingen UI, ingen
persistering — se Review Report for den fulde konsekvens af begge. Den
oprindelige "Formål/Omfang/Acceptkriterier" nedenfor er bevaret som
historik, men **erstattet** af det faktisk udførte arbejde.

**Type (oprindeligt):** Brugervendt værdi.

**Formål (oprindeligt):** Udvide fra v1's Gem/Afvis/Kendte til de 5 graduerede
reaktioner (❤️👍😐👎🚫), med det rigere `FeedbackEvent`-skema (TDS
afsnit 3) — inklusive et fuldt snapshot af score+`TrackDNA` på
reaktionstidspunktet.

**Afhængigheder:** M6 (der skal være en rigtig `RankedCandidate` i UI
at reagere på).

**Omfang (oprindeligt):**
- Fem knapper/handlinger i `discovery`.
- `FeedbackEvent` persisteres permanent ved hver reaktion (TDS
  Persistence, "kilde til sandhed").
- Genbrug af v1's `RejectReasonPanel`-mønster til valgfri fritekst ved
  👎/🚫.

**Acceptkriterier (oprindeligt):**
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

### Review Report — M7

**Hvad blev bygget?**
`src/modules/feedbackPipeline/` (ny mappe, navngivnings-note nedenfor):
- `types.ts` — `LearningEvent` (`eventId`, `candidateRef`, `trackDnaRef`,
  `reactionType`, `recordedAt`), `FeedbackRejectionReason` (fire
  navngivne afvisningsgrunde), `FeedbackPipelineResult` (discriminated
  union: `{accepted: true, learningEvent}` eller `{accepted: false,
  reason}`).
- `feedbackPipeline.ts` — `processReactionEvent(input: unknown, now:
  Date): FeedbackPipelineResult`. `input` er bevidst `unknown`, ikke
  den typede `QueueReactionEvent` (samme "antag intet om upstream-data"
  disciplin som `validateSignalVector`, M1): validerer at input er et
  objekt med ikke-tomme `candidateRef`/`trackDnaRef`-strenge og en
  `reactionType` blandt de tre kendte (`save`/`reject`/`known`);
  normaliserer (trimmer) ref-felterne; afviser med en navngivet grund
  ved fejl, uden at kaste. `computeEventId()` er en ren FNV-1a-hash over
  `candidateRef::trackDnaRef::reactionType` — deterministisk og
  indholds-afledt, aldrig afhængig af `now` eller kaldetidspunkt.
- `feedbackPipeline.test.ts` — 21 nye tests.

**Navngivnings- og scope-afklaring, gjort eksplicit (ikke en konflikt,
ingen ADR nødvendig — intet fra M1-M6 er ændret):**
- Modulet hedder `feedbackPipeline`, ikke TDS' `feedback` — TDS §2's
  `feedback`-modul inkluderer persistering og distribution til
  `user-dna`/`analytics`, som M7's Rule 1 og Rule 8 begge eksplicit
  forbyder. `feedbackPipeline` er den snævre, rene delmængde denne
  milestone bygger; det fulde `feedback`-modul (med persistering) er en
  fremtidig opgave, ikke omdøbt eller udskudt implicit.
- `LearningEvent` er en bevidst **smallere** struktur end TDS §3's
  `FeedbackEvent`. TDS' skema kræver `rankedCandidateSnapshot` (fuld
  kopi af score + `TrackDNA`), `sessionRef`, `queuePosition`, og
  valgfri `reason` — ingen af disse findes i M7's eneste tilladte input
  (`QueueReactionEvent` fra M6: kun `candidateRef`, `trackDnaRef`,
  `reactionType`). At opfinde disse felter ville være et gæt, ikke en
  normalisering (Rule 4 forbyder netop det slags). `LearningEvent`
  indeholder derfor præcis det der ærligt kan udledes af den erklærede
  input — resten (snapshot, session-kontekst) er en fremtidig
  koblingsopgave (formentlig når `discovery`/en session-container
  bygges), ikke noget denne milestone kan eller skal foregribe.
- Reaktions-vokabularet er de tre typer M6's `QueueReactionEvent`
  allerede definerer (`save`/`reject`/`known`), ikke det oprindelige
  roadmaps fem graduerede emoji-reaktioner (❤️👍😐👎🚫). At udvide til
  fem kræver en ændring af M6's `ReactionType` — en tidligere
  milestone — hvilket nu kræver en ny ADR (ADR-16) hvis/når det bliver
  aktuelt. Denne beslutning er derfor ikke truffet her; den er gjort
  synlig som et åbent punkt for en fremtidig milestone, samme mønster
  som M3/M11's scope-hul.

**Hvilke tests blev kørt?**
`npm run test` → 103/103 grønne (82 fra M1-M6 + 21 nye). `npx tsc -b`,
`npm run lint`, `npm run build` alle grønne og uændrede for al
eksisterende kode.

**Bevis for determinisme:** samme `(input, now)` kaldt to gange giver
`toEqual`-identisk resultat.

**Bevis for idempotens:** samme event behandlet ved to forskellige
`now`-tidspunkter giver samme `eventId` begge gange (selvom
`recordedAt` med rette er forskellig) — `eventId` er en ren funktion af
selve hændelsens indhold, aldrig af hvornår eller hvor mange gange den
behandles; forskellige reaktionstyper på samme kandidat giver
forskellige, men hver for sig stabile, id'er.

**Bevis for validering og afvisning af ugyldige events:** `null`,
`undefined`, en streng, et tal, og et array afvises alle som
`not-an-object`; manglende/tomme/whitespace-only `candidateRef` eller
`trackDnaRef` afvises med navngivne grunde; en ukendt `reactionType`
(eller en helt manglende) afvises som `invalid-reaction-type`; intet af
dette kaster nogensinde en exception.

**Bevis for at gyldige events bliver til LearningEvents:** et gyldigt
event giver et fuldt udfyldt, korrekt normaliseret `LearningEvent`; alle
tre reaktionstyper accepteres; omgivende whitespace på ref-felter
trimmes; uventede ekstra felter i input (fx et forsøgt `sessionRef`
eller `score`) ignoreres uden at afvise hændelsen (Rule 7: minimal,
kun-de-tre-nødvendige-felter metadata er en normal tilstand, ikke en
degraderet en).

**Bevis for at UserDNA aldrig ændres:** `feedbackPipeline/` importerer
ingen steder `userDna`, `queue` (kun dens `ReactionType`-*type*), eller
noget andet modul med tilstand — verificeret ved gennemlæsning af alle
imports; `LearningEvent`s felter indeholder strukturelt ingen
DNA/signal-data (ingen `signals`-nøgle kan eksistere, da typen ikke
definerer den); en sekvens af flere behandlede events akkumulerer ingen
delt tilstand mellem kald (hvert kald til `processReactionEvent` er
uafhængigt af alle tidligere kald).

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   bevisafsnittene ovenfor. 2. Tests består — ja, 103/103. 3. Ingen
   TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne Review
   Report plus inline-kommentarer i koden. 5. Fungerer isoleret uden
   fremtidige milestones — ja, intet import af `userDna`, persistence/
   `storage`, UI, eller `analytics` noget sted i `feedbackPipeline/`;
   kun et type-import fra `queue` (M6). 6. Ingen kendte kritiske fejl —
   ja. 7. Reviewet mod PRD/TDS/ADR — ja: navngivnings- og
   scope-afklaringerne ovenfor er begge afgrænsninger af TDS' bredere
   `feedback`/`FeedbackEvent`-beskrivelse, ikke ændringer af den; ADR-16
   og ADR-17 er begge respekteret (intet fra M1-M6 er ændret; queue
   forbliver ene ejer af positionen — `feedbackPipeline` læser aldrig
   queue-state, kun det event queue selv har produceret). 8.
   Demonstrerer den tilsigtede værdi — ja: beviset er ikke om `UserDNA`
   bliver bedre (der er ingen kobling til `user-dna` overhovedet), men
   at feedback kan registreres, valideres og afleveres til et fremtidigt
   læringssystem uden at udføre selve læringen.

**Ja — M7 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja, med to åbne beslutninger at træffe før/under M8: (a) skal
reaktions-vokabularet udvides fra tre til fem typer (kræver en ADR mod
M6, jf. ADR-16), og (b) hvordan/hvornår `LearningEvent` beriges med den
snapshot-/session-kontekst TDS' fulde `FeedbackEvent` forudsætter, hvis
M8 har brug for det. Ingen af disse er afgjort her — kun gjort synlige.

---

## M8 — Learning Engine

**Scope-note (afløser oprindelig beskrivelse nedenfor, samme mønster som
M3-M7):** da M8 skulle påbegyndes, indskærpede brugeren scopet
eksplicit til KUN Learning Engine — arkitekturen for hvordan `UserDNA`
opdateres, ikke om anbefalingerne bliver "gode". Ti bindende regler
(engine ejer kun UserDNA-opdatering og kender intet om Queue/Ranking/
Providers/UI/Feedback Pipeline, ren funktion uden intern tilstand,
UserDNA er immutable, alle ændringer via en navngivet
`LearningStrategy`, engine indeholder ingen domæneregler, strategier er
uafhængige, manglende TrackDNA er normalt, `ReactionType` beskriver kun
styrke — ikke implementation, determinisme, intet persistence) styrede
det faktiske arbejde. Den oprindelige "Formål/Omfang/Acceptkriterier"
nedenfor er bevaret som historik — dens kerneidé (vægtet opdatering med
aftagende læringsrate, TDS ADR-05) er faktisk bevaret i den nye
implementation (se Review Report), men er nu udtrykt gennem den
strategi-baserede arkitektur disse ti regler kræver, ikke direkte i
noget "engine"-lag.

**Type (oprindeligt):** Brugervendt værdi — selve mission-beviset.

**Formål (oprindeligt):** Implementere den vægtede glidende opdatering (TDS ADR-05,
PRD afsnit 2 "Mission") der bruger hvert `FeedbackEvent` til at
opdatere `UserDNA`.

**Afhængigheder:** M7 (kilden til opdateringerne), M2 (den tilstand
der opdateres).

**Omfang (oprindeligt):**
- Opdateringsformel: reaktionstype → vægt, aftagende læringsrate med
  stigende confidence (TDS/PRD-beskrevet formel).
- `coldStart`-flaget skifter til falsk efter første reelle
  `FeedbackEvent`.
- Den hurtige undtagelse for 🚫 (kortsigtet undertrykkelse, PRD
  afsnit — nævnt som to-hastigheds-design) kan udskydes til en
  selvstændig senere milestone, hvis det gør denne milestone for stor;
  markeres da eksplicit som ikke inkluderet her.

**Acceptkriterier (oprindeligt):**
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

### Review Report — M8

**Hvad blev bygget?**
`src/modules/learningEngine/`:
- `types.ts` — `LearningStrategy` (rent interface: `strategyName`,
  `ownedSignals`, synkron `learn(userSignals, trackSignals, weight)`).
  En plain object-kontrakt, ingen klasse — der er intet for en strategi
  at holde som tilstand.
- `reactionWeight.ts` — `reactionWeight(reactionType)`: den ENESTE plads
  hvor `save`/`reject`/`known` omsættes til et signeret tal (`1`/`-1`/`0`).
  Parametertypen er udledt som `LearningEvent['reactionType']` — modulet
  importerer aldrig `queue` direkte (se afklaring nedenfor).
- `learningMath.ts` — `updateReading()`: den ene formel enhver strategi
  bruger for ethvert signal den ejer. `valueDelta`/`confidenceDelta`
  ganges begge med `trackReading.confidence` (nul hvis TrackDNA-signalet
  er ukendt → nul ændring, Rule 7 "falder ud af aritmetikken") og med
  `(1 - userReading.confidence)` (aftagende læringsrate med stigende
  confidence, TDS ADR-05 — bevaret fra det oprindelige M8-formål, se
  afklaring nedenfor). Confidence bevæger sig altid opad
  (`Math.abs(weight)`), værdien bevæger sig med eller mod
  TrackDNA-værdien afhængig af `weight`s fortegn.
- `strategies/` — fire tynde, tilstandsløse objekter:
  `genreLearningStrategy` (de 6 genre-signaler), `mainstreamLearningStrategy`
  (`mainstream`), `explicitnessLearningStrategy` (`explicitness`),
  `durationLearningStrategy` (`songLength`) — samme fire signal-grupper
  som M5's `rankingEngine`, af samme grund: det er de signaler M2/M4
  faktisk kan udfylde med rigtig data i dag.
- `learningEngine.ts` — `learn(strategies, userDna, learningEvent,
  trackDna)`: en almindelig, eksporteret funktion, **ikke** en klasse
  (se afklaring nedenfor). Tjekker disjoint ejerskab ved hvert kald
  (`assertDisjointOwnership`, samme mønster som M4's
  `EnrichmentPipeline`), kalder hver strategi i et `try/catch`
  (fejlisolering, samme filosofi som M3 Rule 5/M4 Rule 5), kasserer
  readings uden for en strategis erklærede ejerskab, kører resultatet
  gennem M1's `validateSignalVector()`, og opdaterer kun
  `coldStart`/`version`/`updatedAt` hvis noget faktisk ændrede sig.
- `learningEngine.test.ts` — 18 nye tests.

**Type-import-afklaring, gjort eksplicit (samme mønster som M5→M4,
M6→M5, M7→M6 — ingen ADR nødvendig, da intet fra M1-M7 ændres):** Rule 1
forbyder `learningEngine` at "kende" Queue/Ranking/Providers/UI/Feedback
Pipeline, men erklærer samtidig `LearningEvent` (defineret i M7's
`feedbackPipeline`) som et af de tre tilladte input. Dette er kun en
konflikt hvis "kende" læses som "må ikke referere typen" — hele denne
sessions etablerede praksis (M5 importerer `EnrichedCandidate` fra
`enrichment`, M6 importerer `RankedCandidate` fra `rankingEngine`, M7
importerer `ReactionType` fra `queue`) læser det i stedet som
"må ikke afhænge af adfærd/logik". `learningEngine/` importerer derfor
**kun** typen `LearningEvent` fra `feedbackPipeline` — aldrig
`processReactionEvent()` eller noget andet derfra — og importerer
**intet** fra `queue`, `rankingEngine`, `candidateProviders`, eller
`enrichment`, hverken typer eller adfærd. `ReactionType` selv er aldrig
importeret direkte; `reactionWeight()`s parametertype er udledt via
`LearningEvent['reactionType']`, så end ikke en `queue`-import-linje
findes i modulet.

**Design-afklaring: funktion, ikke klasse (Rule 2):** M3's
`CandidateAggregator` og M4's `EnrichmentPipeline` er begge klasser med
en konstruktør der gemmer `providers`/`enrichers`. M8's Rule 2 er
markant skarpere formuleret ("Ingen intern tilstand. Ingen caches.
Ingen singleton. Ingen globale variable.") end de tilsvarende regler i
M3/M4 — for at undgå enhver tvivl om hvorvidt en gemt konstruktør-
parameter tæller som "tilstand", er `learn()` her en almindelig,
eksporteret funktion der modtager `strategies` som et almindeligt
argument ved hvert kald, ikke noget en klasse-instans holder på. Det
disjoint-ejerskabstjek der i M4 kørte én gang ved konstruktion, køres
her ved hvert kald i stedet — en smule redundant arbejde pr. kald, betalt
for at eliminere ethvert konstruktions-trin overhovedet.

**Formel-afklaring: den oprindelige M8-idé er bevaret, ikke droppet:**
den oprindelige roadmap-teksts acceptkriterium ("mindre bevægelse pr.
ny reaktion end ved de første reaktioner — beviser at læringsraten
reelt aftager med confidence", TDS ADR-05) er ikke en del af de ti nye,
bindende regler denne gang, men er bevidst bevaret i selve
`updateReading()`-formlen (`(1 - userReading.confidence)`-faktoren) —
det er billigt, i tråd med TDS ADR-05, og modsiger ingen af de ti regler.
Et separat test beviser egenskaben direkte (5 ens `save`-reaktioner i
træk giver aftagende, ikke konstante, bevægelser).

**`known`-vægt-afklaring, gjort eksplicit:** `reactionWeight('known') =
0` er grundet i v1's egen etablerede semantik — `DiscoveryPage.tsx`s
`handleAction('known')` (linje 89-91) fremskyndede blot køen uden nogen
`PreferenceProfile`- eller historik-opdatering, identisk med `'next'`.
Der findes ingen ærlig basis for at gætte en retning (positiv eller
negativ) for "brugeren kendte allerede denne sang" — Rule 7's "ingen
gæt"-princip er her udvidet til selve reaktions-vokabularet, ikke kun
til manglende TrackDNA-data.

**Hvilke tests blev kørt?**
`npm run test` → 121/121 grønne (103 fra M1-M7 + 18 nye). `npx tsc -b`,
`npm run lint`, `npm run build` alle grønne og uændrede for al
eksisterende kode.

**Bevis for immutability:** input-`UserDNA` er byte-identisk
(`toEqual` mod en før-snapshot) efter `learn()`; resultatet er en ny
objekt-reference (`not.toBe`), inklusive et nyt `signals`-objekt.

**Bevis for determinisme:** samme `(userDna, learningEvent, trackDna)`
kaldt to gange giver `toEqual`-identisk resultat.

**Bevis for uafhængige strategier:** `genreLearningStrategy` ændrer kun
genre-signaler, aldrig `mainstream`/`explicitness`/`songLength`; to
strategier der begge erklærer `mainstream` får kaldet til `learn()` til
at kaste med det samme; en strategi der returnerer en reading for et
signal den ikke ejer, får den reading kasseret; én strategi der kaster
en exception blokerer ikke de andres opdateringer.

**Bevis for manglende TrackDNA:** `trackDna = null` giver en
uændret (men ny-instans) `UserDNA`, uden throw; et tomt `TrackDNA`
(alle signaler confidence 0) giver samme resultat; et `TrackDNA` med
kun ét kendt signal (`rock`) opdaterer kun det ene, mens et søskende
genre-signal uden data (`pop`) forbliver uændret.

**Bevis for at hver strategi kun ændrer sit eget signalområde:** dækket
sammen med uafhængigheds-beviset ovenfor — samme tests.

**Bevis for at Learning Engine ikke indeholder domæneregler:** en
brugerdefineret test-strategi (`FixedResult`, der ikke bruger
`updateReading` overhovedet) får sit resultat anvendt helt uændret af
`learn()`; med en tom `strategies`-liste sker der intet som helst — der
er ingen indbygget "hvis ingen strategi findes, gør X"-adfærd i
`learn()` selv.

**Er milestone 100% færdig ifølge Definition of Done?**
1. Acceptkriterier (de nye, brugerdefinerede regler) opfyldt — ja, se
   bevisafsnittene ovenfor. 2. Tests består — ja, 121/121. 3. Ingen
   TODO/placeholder — ja. 4. Dokumentation opdateret — ja, denne Review
   Report plus inline-kommentarer i koden. 5. Fungerer isoleret uden
   fremtidige milestones — ja, intet import af `queue`, `rankingEngine`,
   `candidateProviders`, `enrichment`, eller UI noget sted i
   `learningEngine/`; kun ét type-import fra `feedbackPipeline`
   (`LearningEvent`, det erklærede input) og genbrug af `trackDna`s
   skema (`validateSignalVector`, ikke på forbudslisten). 6. Ingen
   kendte kritiske fejl — ja. 7. Reviewet mod PRD/TDS/ADR — ja:
   type-import- og funktion-vs-klasse-afklaringerne ovenfor er begge
   afgrænsninger, ikke ændringer, af tidligere milestones (ADR-16
   udløses ikke); ADR-17 (queue er ene ejer af positionen) er
   respekteret — `learningEngine` kender intet til positionen; ADR-18
   (LearningEvent beskriver observerede handlinger) og ADR-19
   (validering fortolker aldrig semantisk) er begge respekteret —
   `reactionWeight()` omsætter kun en allerede-valideret, kendt
   `reactionType` til et tal, det gætter ikke på nye betydninger. 8.
   Demonstrerer den tilsigtede værdi — ja: beviset er ikke om
   anbefalingerne bliver "bedre" (ingen `ranking`-kørsel er del af denne
   milestone), men at `UserDNA` kan opdateres deterministisk,
   reproducerbart, og uden at `learningEngine` kender noget om resten
   af systemet.

**Ja — M8 er 100% færdig ifølge Definition of Done (for det scope
brugeren faktisk satte).**

**Er projektet klar til næste milestone?**
Ja. M9 (Fejlhåndtering: ingen mock-fallback) kan bygges videre på en
`UserDNA` der nu har en reel, bevist opdateringsmekanisme.

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
