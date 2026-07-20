# Music DNA Rebuilt — Implementation Roadmap

**Status:** Udkast til godkendelse. Oversætter det godkendte
`docs/PRD.md` og `docs/TDS.md` til en konkret byggerækkefølge. Ingen
kode er skrevet som del af dette dokument.

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

---

## M3 — Én Candidate Provider, generaliseret

**Type:** Teknisk evne (adfærd for brugeren uændret i dette skridt).

**Formål:** Refaktorere v1's `LastFmRecommendationProvider` til det
generelle `candidate-providers`-interface (TDS afsnit 2) — leverer
`Candidate[]`, aldrig en score.

**Afhængigheder:** Ingen (kan bygges parallelt med M1/M2).

**Omfang:**
- Last.fm-integrationen genbruges uændret på API-niveau; kun formen af
  det den *returnerer* ændres (rå kandidat, ikke en færdig
  anbefaling).
- `ProviderMetadata` (TDS afsnit 3) oprettes for denne ene kilde.

**Acceptkriterier:**
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

## M11 — Anden Candidate Provider (bevis på pluggability)

**Type:** Teknisk evne, med direkte strategisk værdi (beviser PRD Fase
2's centrale påstand).

**Formål:** Tilslutte en anden kilde (ListenBrainz eller MusicBrainz —
TDS Open Question 4 afgøres konkret her) samtidig med Last.fm, med
kandidat-aggregering/deduplikering.

**Afhængigheder:** M3 (provider-interfacet skal være stabilt), M9
(fejlhåndtering skal allerede understøtte flere samtidige providers).

**Omfang:**
- Én ny `CandidateProvider`-implementation.
- Aggregerings-/deduplikeringslogik når to kilder returnerer den
  samme sang.
- `ProviderMetadata` for begge kilder, klar til at blive brugt af
  `analytics` (feedback-loopet til provider-kvalitet er dog selv
  uden for denne milestones omfang — det er en Fase 3-opgave).

**Acceptkriterier:**
- Begge providers kaldes samtidigt; en fejl i én påvirker ikke den
  anden (allerede sikret af M9, bekræftes igen her med to reelle
  kilder).
- En sang der findes hos begge kilder optræder kun én gang i den
  endelige pulje, med metadata fra begge bevaret (ikke kun den først
  sete).
- `ranking` og alt nedstrøms fungerer identisk uden ændringer — det
  er selve beviset på at abstraktionen holder (ingen kode uden for
  `candidate-providers` ændres for at tilføje denne kilde).

**Testes isoleret ved:** mockede svar fra begge kilder, inklusive et
overlap-scenarie, verificér korrekt deduplikering.

**Review-punkt:** krævede tilslutningen af den nye kilde reelt *ingen*
ændringer uden for `candidate-providers`? Hvis den gjorde, er det et
signal om at abstraktionen (TDS ADR-02) ikke var stram nok, og skal
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
