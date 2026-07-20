# Music DNA — Product Requirements Document (PRD)

**Status:** Udkast til godkendelse. Dette dokument er projektets
"forfatning" — det definerer *hvad* Music DNA er og *hvorfor*, før vi
bygger "Music DNA Rebuilt". Ingen kode er skrevet som del af dette
dokument, og ingen implementering må starte før dette er godkendt.

**Målgruppe:** Enhver — udvikler, designer, investor, ny holdkammerat —
skal kunne læse dette og forstå produktet uden at kende kodebasen.

---

## 1. Vision

### Hvilket problem løser Music DNA?

Alle store streamingtjenester har en indbygget "discovery"-funktion
(Spotifys Discover Weekly, Apple Musics New Music Mix, osv.). De virker
— til et punkt. Men de har tre strukturelle problemer, som ingen mængde
finpudsning kan løse, fordi de er indbygget i tjenesternes forretning:

1. **De er en sort boks.** Du får en sang. Du får ikke at vide hvorfor.
   Var det fordi den ligner noget du hørte for tre uger siden? Fordi
   pladeselskabet betalte for placeringen? Fordi algoritmen tester en
   ny kunstner op mod dig? Du kan ikke vide det, og du kan ikke
   korrigere den.
2. **De er kommercielt forurenede.** Streamingtjenesternes
   anbefalingsmotorer er også deres primære marketingkanal for
   pladeselskaber. "Discovery" og "reklame" er den samme knap. Det
   betyder anbefalingerne optimerer for noget andet end din smag —
   de optimerer (i hvert fald delvist) for hvad der er kommercielt
   fordelagtigt at spille for dig.
3. **De belønner ikke ærlig feedback.** Et "hjerte" på Spotify betyder
   ikke ret meget for algoritmen sammenlignet med hvor længe du
   lyttede. Der er ingen måde at sige "denne var god, men ikke min
   smag" versus "denne er direkte irriterende, vis mig aldrig noget
   som den her igen." Al feedback bliver presset gennem ét binært
   filter: afspillet eller ikke afspillet.

### Hvorfor er Spotify Discover Weekly ikke nok?

Fordi Discover Weekly løser et andet problem end det Music DNA løser.
Discover Weekly optimerer for **engagement på Spotifys platform** —
flere afspilninger, mere tid i appen, flere grunde til at forblive
abonnent. Music DNA optimerer for **én ting og kun én ting**: at finde
den *specifikke sang* du med størst sandsynlighed vil gemme som din
egen. Det er ikke en bedre udgave af Discover Weekly — det er et
andet spørgsmål, stillet med et andet mål.

Derudover er Discover Weekly *lukket*. Du kan ikke vælge datakilden,
du kan ikke se signalerne, du kan ikke fortælle den "brug mere
ListenBrainz og mindre af din interne sort-boks-model." Music DNA er
bygget modsat: åbne, udskiftelige datakilder, gennemsigtige signaler,
og feedback der faktisk ændrer noget du kan se.

### Hvorfor eksisterer Music DNA?

Fordi der findes rigelige, åbne, ikke-kommercielle datakilder om musik
(Last.fm, ListenBrainz, MusicBrainz) som stort set ingen almindelige
lyttere bruger, fordi ingen har bygget en ordentlig, forklarlig,
personlig oplevelse oven på dem. Music DNA eksisterer for at udfylde
det hul: **din egen, gennemsigtige, feedback-drevne smagsprofil,
kombineret med åbne datakilder, presenteret én sang ad gangen så du
rent faktisk kan tage stilling til hver enkelt.**

---

## 2. Mission

> **"Forudsig hvilke sange brugeren rent faktisk vil gemme."**

Ikke: *"Find lignende kunstnere."*

### Hvorfor det er en helt anden opgave

"Find lignende kunstnere" er en **graf-opgave**: kunstner A ligner
kunstner B (ifølge et andet publikums lyttemønstre), hent B's populære
sange. Det er én led væk fra det vi faktisk vil vide, og det leder til
et konkret, gentagne gange observeret problem: to kunstnere kan ligne
hinanden statistisk, uden at en specifik sang fra den ene rammer din
smag. Kunstner-lighed er en *proxy*. En dårlig proxy producerer et
system der teknisk "virker" (det leverer sange), men ikke virker for
brugeren (sangene bliver ikke gemt).

"Forudsig hvilke sange brugeren vil gemme" er en **prognose-opgave**:
givet alt vi ved om denne bruger og alt vi ved om denne sang, hvad er
sandsynligheden for at handlingen "gem" sker? Det er et helt andet
spørgsmål, fordi:

- Det optimerer direkte for den handling vi faktisk bryder os om — ikke
  en indirekte, statistisk nabo-relation.
- Det gør **feedback til den vigtigste datakilde i systemet**, fordi
  feedback er den eneste plads hvor vi observerer det faktiske svar på
  spørgsmålet vi stiller. Kunstner-lighed kræver ingen feedback for at
  fungere (dårligt). Gem-forudsigelse bliver *bedre* for hver eneste
  reaktion en bruger giver.
- Det gør datakilden ligegyldig for selve missionen. Om en kandidat-sang
  kommer fra Last.fm, ListenBrainz, en AI, eller en fremtidig kilde er
  underordnet — det eneste der tæller er om systemet korrekt forudsiger
  om *denne bruger* vil gemme *denne sang*. Det er hvorfor providers kan
  være udskiftelige (se Designprincipper) uden at missionen ændrer sig.

---

## 3. North Star Metric

Projektet skal have **én** overordnet metric, som alle beslutninger
optimeres imod. Alt andet i dette dokument — designprincipper, MVP,
roadmap, success metrics — er underordnet den her:

> **"Øge sandsynligheden for, at en bruger finder og gemmer en sang, de
> ellers aldrig ville have opdaget."**

Det er ikke det samme som "øge antal gemte sange." En bruger der gemmer
20 sange af kunstnere de allerede kender, har ikke fået discovery — de
har fået en genvej til noget de allerede vidste de kunne lide. North
Star-metricen kræver *begge* dele på samme tid: en gemt sang (bevis på
værdi) **og** en sang de ellers ikke ville have fundet (bevis på reel
discovery, ikke bare bekræftelse af eksisterende smag). Det er derfor
missionen (afsnit 2) og North Star-metricen er to formuleringer af det
samme: missionen siger *hvad* systemet skal gøre, denne metric siger
*hvordan vi måler om det lykkedes*.

### Afledte metrics

Ingen af disse er North Star-metricen selv — de er observérbare
signaler der tilsammen antyder om vi bevæger os i den rigtige retning.

- **Save Rate** — hvor stor en andel af de viste anbefalinger der ender
  med ❤️ Gem. Den mest direkte proxy for "fandt værdi."
- **Playlist Rate** — hvor stor en andel af de gemte/viste sange der
  senere ender i en Spotify-playliste hos brugeren. En sang der
  overlever ind i en playliste er et stærkere bevis på varig værdi end
  et enkelt hjerte i øjeblikket.
- **Preview Completion Rate** — hvor stor en andel af afspillede
  previews der bliver hørt til ende, før brugeren tager en beslutning.
  Lav completion-rate på tværs af mange sange kan betyde beslutningerne
  tages for hurtigt/uinformeret til at være pålidelige feedback-signaler.
- **Spotify Open Rate** — hvor ofte brugeren klikker "Åbn i Spotify" på
  en anbefaling. Et intentions-signal der findes selv uden et Gem — "nok
  interesseret til at ville høre den fulde sang" er værdifuldt at måle
  separat fra selve gem-handlingen.
- **Negative Feedback Rate** — andelen af reaktioner der er 👎 Ikke mig
  eller 🚫 Irriterende. Det omvendte kvalitetssignal: en stigende eller
  flad rate her betyder ranking/kalibrering ikke forbedrer sig.
- **Discovery Novelty Rate** — hvor stor en andel af de gemte sange der
  kommer fra kunstnere brugeren ikke kendte i forvejen (ikke i deres
  Spotify-bibliotek eller tidligere lyttehistorik). Dette er den metric
  der direkte adskiller Music DNA fra "endnu en måde at genopdage din
  egen musiksamling" — uden en høj novelty rate er North Star-metricen
  ikke reelt indfriet, uanset hvor høj save rate er.

## 4. Decision Framework

Alle fremtidige features — uden undtagelse, uanset hvor godt de lyder,
uanset hvem der foreslår dem — skal kunne besvare disse fire spørgsmål:

1. **Øger den sandsynligheden for en gemt sang?**
2. **Giver den bedre feedback-data?**
3. **Gør den discovery hurtigere eller bedre?**
4. **Kan den forklares til brugeren?**

**Hvis svaret er nej til alle fire, skal featureen ikke bygges.** Ikke
"udskydes til senere" — afvises. Det er den samme disciplin som afsnit
10's "Hvad bygger vi IKKE?"-liste, gjort til en gentagelig test i stedet
for en fast liste, så nye idéer kan vurderes uden at skulle opdatere en
statisk liste hver gang.

En feature skal ikke besvare *alle* fire med "ja" — én tydeligt "ja" er
nok til at retfærdiggøre at den undersøges videre. Men hvis den ærlige
vurdering er "nej" på alle fire, er det ikke en detalje der kan rettes
med bedre eksekvering — featureen er forkert for produktet, uanset hvor
godt den bygges.

---

## 5. Designprincipper

Disse er ikke forslag. De er reglerne der afgør om en fremtidig
kode-ændring er "rigtig" eller "forkert" for Music DNA, uafhængigt af om
den tekniske løsning er elegant.

1. **Spotify er en musiksamling, ikke en recommendation-engine.**
   Spotify bruges til login, bibliotek, playlister, gemte sange og
   afspilning — aldrig til at generere eller vælge hvilken sang der
   vises næste. Denne grænse er allerede overtrådt én gang i projektets
   historie og korrigeret; den må ikke overtrådes igen.

2. **Providers må aldrig kende User DNA.** En datakilde (Last.fm,
   ListenBrainz, MusicBrainz, en AI, en fremtidig kilde) leverer rå
   kandidat-sange og hvad den naturligt ved om dem. Den ser aldrig
   brugerens smagsprofil og tager aldrig selv stilling til om en sang
   passer til brugeren. Det ansvar ligger udelukkende ét sted (se
   punkt 3).

3. **Ranking er adskilt fra candidate sourcing.** At *finde* kandidater
   og at *vurdere* kandidater er to forskellige ansvar, løst af to
   forskellige dele af systemet, forbundet af en fast kontrakt. Det
   betyder vi kan udskifte hvor sangene kommer fra, eller hvordan de
   vurderes, uden at røre den anden side.

4. **Feedback er vigtigere end AI.** En simpel, forklarlig
   regelbaseret model der lærer af rigtig brugerfeedback slår en
   avanceret model der ikke gør. Al udvikling af ranking-intelligens
   starter med at gøre feedback-loopet solidt, ikke med at gøre
   modellen kraftigere.

5. **Forklar altid hvorfor en sang anbefales.** Ingen anbefaling uden
   en menneskelig-læsbar begrundelse. Det er ikke en "nice to have"
   UI-detalje — det er hvordan brugeren kan korrigere systemet, og
   hvordan vi kan fejlfinde det, når det opfører sig forkert.

6. **Ingen skjulte fallback-løsninger i produktion.** Hvis den
   rigtige datakilde fejler, skal det være *synligt* — for brugeren
   (en tydelig tom-tilstand) og for os (diagnostik der viser præcis
   hvorfor). En stille tilbagefald til statisk placeholder-indhold har
   allerede kostet dette projekt uger af "hvorfor virker det ikke," og
   må ikke ske igen.

7. **Ét sprog for bruger og sang.** Brugerens smagsprofil og en sangs
   karakter beskrives i det samme sæt signaler, så de kan sammenlignes
   direkte. Det er hvad der gør ranking muligt uden at gætte.

---

## 6. User Journey

Fra første login til den 500. feedback-hændelse — ren produktoplevelse,
ingen teknik.

### Session 1 — Login og første indtryk

Brugeren logger ind med Spotify. Ingen ny konto, intet nyt bibliotek at
bygge op — Music DNA læser (læse-adgang, aldrig skrive-adgang) hvad der
allerede findes: playlister, gemte sange, topkunstnere. I baggrunden
bygges en *foreløbig* smagsprofil ud fra dette — men brugeren ser ikke
et spørgeskema eller en opsætningsproces. De ser med det samme **én
sang**.

### De første 10 sange — kalibrering

Systemet vidste meget lidt ved login (kun hvad Spotify-biblioteket
antyder). De første reaktioner — Gem, God, Neutral, Ikke mig,
Irriterende — flytter smagsprofilen markant, fordi der endnu ikke er
meget at afveje imod. Brugeren oplever formentlig et par tydelige
fejlskud i denne fase ("hvorfor viser du mig det her") — det er
forventet og en del af kalibreringen, ikke et tegn på at systemet er
defekt. Hver reaktion har en synlig, umiddelbar begrundelse ("Hvorfor
denne?"), så selv et fejlskud giver brugeren indblik i hvordan systemet
tænker.

### De første 50 sange — systemet begynder at "kende" brugeren

Mønstre begynder at stabilisere sig. Brugeren mærker at sangene bliver
mere relevante — færre "det er slet ikke mig," flere "God" og
"Gem." Første gemte sang er et vigtigt øjeblik: det er beviset på at
systemet allerede har leveret værdi, uafhængigt af hvor perfekt resten
er.

### 50-200 sange — brugeren begynder at stole på systemet

Brugeren begynder at genkende sin egen smag beskrevet tilbage til dem
i "Hvorfor denne?"-forklaringerne ("høj energi," "mørk stemning,"
"ny kunstner for dig") — det er her Music DNA'et begynder at føles som
*deres eget*, ikke en generisk algoritme. Irriterende-reaktioner bliver
sjældnere, fordi systemet allerede har lært at undgå de tydelige
fejlskud.

### 200-500 sange — finjustering og drift

Systemet er nu godt kalibreret på brugerens *stabile* smag, men
begynder også at kunne registrere *skift* — en periode med mere
energiske sange, en ny genre-interesse. Fordi ældre feedback vejer
mindre over tid, følger profilen med, i stedet for at fastfryse ved de
første ugers indtryk. Ved dette punkt har brugeren formentlig etableret
en fast vane: åbn appen, tag stilling til nogle sange, gå videre til
sin dag — ikke en lang lytte-session, men korte, gentagne
beslutnings-øjeblikke.

### Gennemgående, hele vejen

- Aldrig en liste, aldrig en playliste — altid én sang, én beslutning.
- Aldrig afspilning i appen — "Åbn i Spotify" for at høre den fulde sang.
- Aldrig en anbefaling uden begrundelse.
- Aldrig en usynlig fejl — hvis systemet løber tør for gode kandidater,
  siger det det, i stedet for at foregive at levere kvalitet.

---

## 7. MVP

**Formål:** bevise at mission-skiftet virker — at gem-forudsigelse
producerer mærkbart bedre resultater end kunstner-lighed gjorde. Ikke
at bevise at hele visionen (50 signaler, flere providers, lært
AI-model) er fuldt bygget.

### MVP indeholder

- **Én datakilde** (den bedst tilgængelige åbne kilde, fx Last.fm eller
  ListenBrainz) bag det generelle provider-interface — ikke fordi
  interfacet ikke skal bygges generelt, men fordi vi ikke behøver flere
  kilder for at bevise missionen.
- **Et reduceret, men reelt DNA** — et meningsfuldt undersæt af de
  fulde 50 signaler (fx 15-20: de mest tydelige akustiske og
  genre-signaler), frem for alle på dag ét. Nok til at ranking rent
  faktisk kan differentiere sange, ikke nok til at kræve måneders
  enrichment-arbejde først.
- **Alle 5 feedback-reaktioner** fra start — ikke en forenklet
  Gem/Afvis. Feedback-rigdommen er selve pointen med v2 og må ikke
  udskydes.
- **v1-ranking (forklarlig, regelbaseret vægtet lighed)** — ikke den
  lærte model. Den lærte model kræver data vi endnu ikke har; den
  regelbaserede version kan køre fra dag ét og er stadig et markant
  spring fra "kunstner ligner kunstner."
- **Én-sang-ad-gangen Discovery** — allerede bygget, genbruges direkte.
- **Synlig fejltilstand** i stedet for skjult fallback, når kandidater
  ikke kan hentes.

### MVP indeholder IKKE

- Flere samtidige providers (interfacet er generelt, men kun én kilde
  er tilsluttet).
- Den lærte/trænede ranking-model.
- Alle 50 signaler.
- Provider-kvalitetsmåling (hvilken kilde performer bedst).
- Segmenteret/kontekst-afhængigt DNA.

MVP'en er et bevis på retning, ikke en skitse af den endelige
funktionsbredde.

---

## 8. Roadmap

### Fase 1 — Fundamentet
**Mål:** bevise at gem-forudsigelse virker bedre end kunstner-lighed.
Reduceret DNA, én provider, v1-ranking, alle 5 reaktioner, synlig
fejltilstand. Dette er MVP'en fra afsnit 7.

### Fase 2 — Åbn datakilde-laget
**Mål:** bevise at provider-abstraktionen faktisk er generel, ikke
kun i teorien. Tilslut en anden datakilde (fx ListenBrainz eller
MusicBrainz) samtidig med den første, med kandidat-aggregering og
deduplikering. Ingen ændring af ranking eller UI — det er selve
beviset på at grænserne fra Designprincipper holder i praksis.

### Fase 3 — DNA'et modnes
**Mål:** udvid fra det reducerede signal-sæt til det fulde 30-50
signal-katalog, med enrichment fra flere kilder (tag-baseret,
AI-baseret) pr. signal-gruppe. Byg provider-kvalitetsmåling, så
systemet begynder at lære hvilken kilde der reelt leverer værdi for
hvilke brugere.

### Fase 4 — Den lærte ranking-model
**Mål:** når der er nok feedback-data akkumuleret (fra fase 1-3), byg
den lærte ranking-model, trænet på faktiske feedback-hændelser, som ny
ranking-implementation bag samme kontrakt som v1. Mål succes ved at
sammenligne v1 og v2 direkte på samme brugere, samme kandidater — ikke
ved at antage at "lært" automatisk betyder "bedre."

Hver fase har et binært succeskriterium (virker/virker ikke), ikke en
åben-ende liste af forbedringer. Ingen fase starter før den forrige er
bevist.

---

## 9. Success Metrics

Metrics der måler om systemet rent faktisk løser missionen — ikke
vanity-metrics som downloads, DAU uden kontekst, eller sessionlængde
(sessionlængde er ligefrem et *advarselstegn* her: Music DNA er ikke en
afspiller, lang tid i appen uden handling betyder ubeslutsomhed, ikke
engagement).

1. **Gem-rate**: hvor stor en andel af de viste anbefalinger ender med
   ❤️ Gem. Dette er den mest direkte måling af om missionen ("forudsig
   hvad brugeren vil gemme") reelt bliver indfriet.
2. **Tid til første gemte sang**: hvor hurtigt en ny bruger oplever
   den første konkrete værdi. En lang forsinkelse her er et
   onboarding-/kalibrerings-problem, uanset hvor god modellen bliver
   senere.
3. **Gennemsnitlige feedback-hændelser pr. session**: er brugeren
   aktivt engageret i at *tage stilling*, ikke bare passivt bladre
   forbi? Lav feedback-rate pr. session er et tegn på at
   beslutnings-friktionen er for høj, eller kandidaterne er tydeligt
   irrelevante.
4. **Returrate**: kommer brugeren tilbage næste dag/uge? Det er det
   endelige bevis på at oplevelsen er værdifuld nok til at gentage —
   men skal altid læses sammen med gem-rate, ikke isoleret (en bruger
   der vender tilbage men aldrig gemmer noget er stadig et problem).
5. **Andel 🚫 Irriterende af alle reaktioner, over tid**: bør falde
   markant i takt med at DNA'et modnes for en given bruger. Stigende
   eller flad irriterende-rate er et direkte signal om at
   ranking/kalibrering ikke virker.
6. **Provider-bidrag til gemte sange** (fra fase 2): hvor mange af de
   faktisk gemte sange kom fra hvilken kilde? Beviser om
   multi-provider-arkitekturen tilfører reel værdi, eller om én kilde
   reelt bærer det hele.

**Bevidst udeladt:** downloads/installationer, antal registrerede
brugere uden aktivitetskontekst, sessionslængde/tid-i-app, antal
kandidat-sange hentet (et input-tal, ikke et resultat-tal).

---

## 10. Hvad bygger vi IKKE?

Bevidst uden for scope — ikke "endnu ikke," men afvist som en del af
produktets identitet:

- **Sociale features** (venner, følgere, aktivitetsfeed).
- **Chat eller beskeder** mellem brugere.
- **Deling** af sange, lister eller profiler til andre platforme/personer.
- **Playlister** — Music DNA bygger og administrerer aldrig playlister.
  Det er et discovery-værktøj, ikke en kurateringsplatform.
- **Kommentarer** på sange, kunstnere eller andet indhold.
- **Følg andre brugere** eller se andres smagsprofiler.
- **Afspilning i appen** — Music DNA afspiller aldrig musik selv; det
  linker til Spotify for den fulde sang. At blive en afspiller er den
  mest sandsynlige "scope creep" for dette projekt, og er allerede
  overvejet og eksplicit afvist tidligere (se `docs/spotify-embed-research.md`).
- **Gamification** (streaks, badges, leaderboards).
- **Egen musikkatalog/streaming-licens** — Music DNA ejer aldrig selve
  lyden, kun metadata og henvisninger.

Denne liste er lige så vigtig som roadmappet. Den er, hvordan projektet
undgår at blive et andet, mudret produkt end det, missionen faktisk
beskriver.

---

## 11. Tekniske principper

Ansvar mellem moduler, på et niveau der ikke kræver kodebase-kendskab.
(Fuld teknisk arkitektur er dokumenteret separat.)

- **Spotify-laget** har ét ansvar: identitet og bibliotek. Det leverer
  aldrig en kandidat-sang og tager aldrig en ranking-beslutning.
- **Datakilde-laget** har ét ansvar: finde rå kandidat-sange, fra en
  eller flere udskiftelige kilder, uden nogen viden om den enkelte
  bruger.
- **Berigelses-laget** har ét ansvar: omsætte hvad en datakilde
  leverede til den samme fælles beskrivelse (signal-profil), uanset
  hvor sparsom eller rig den oprindelige information var.
- **Bruger-DNA-laget** har ét ansvar: holde brugerens smagsprofil
  opdateret, udelukkende drevet af faktisk feedback (plus et
  foreløbigt udgangspunkt fra biblioteket ved første login).
- **Ranking-laget** har ét ansvar: sammenligne en brugers profil med en
  sangs profil og producere en score med en begrundelse — uden at vide
  eller bekymre sig om hvor sangen kom fra.
- **Feedback-laget** har ét ansvar: fange brugerens reaktion struktureret
  og videresende den til både bruger-DNA og ranking, så begge lærer af
  samme begivenhed.
- **Discovery-laget (det brugeren ser)** har ét ansvar: vise én sang,
  indsamle én reaktion, og vide intet om hvordan sangen blev fundet
  eller scoret.

Hvert lag kan ændres, forbedres eller udskiftes uden at de andre lag
opdager det, så længe kontrakten mellem dem holder. Det er selve
forsikringen mod at gentage v1's fejl: dengang var recommendation-kilden
og selve produktoplevelsen for sammenflettet til at man kunne se hvor
en fejl opstod.

---

## 12. Risici

### Afhængighed af Spotify

Music DNA kræver Spotify til login og bibliotek. Hvis Spotify
ændrer sine API-vilkår, scopes, eller adgangsbegrænsninger (det er
allerede sket én gang i praksis i dette projekt — adgang til visse
endpoints er blevet strammet for nye developer-apps), rammer det
kerneoplevelsen. **Reduktion:** hold Spotify-integrationen minimal og
isoleret (kun login/bibliotek/afspilning, jf. designprincip 1) — mindre
overflade betyder mindre eksponering for fremtidige ændringer.
Langsigtet reduktion: undersøg om login/bibliotek kan understøtte
alternative kilder (Apple Music, lokale filer) uden at ændre resten af
systemet, fordi Spotify aldrig er mere end identitets- og
biblioteks-laget.

### Afhængighed af eksterne datakilder

Last.fm, ListenBrainz, MusicBrainz og fremtidige kilder er alle
uden for vores kontrol — de kan ændre API'er, indføre rate limits, gå
i drift-nedbrud, eller lukke helt. **Reduktion:** dette er præcis
hvorfor provider-abstraktionen (designprincip 2-3) er en risiko-strategi,
ikke kun en kodearkitektur — ingen enkelt kildes nedetid slår hele
produktet ud, og en dårlig/lukket kilde kan fjernes uden at ranking
eller UI ændres.

### Licens- og brugsvilkår

Åbne datakilder har stadig vilkår (attribution-krav,
rate-limit-politikker, forbud mod visse kommercielle anvendelser).
AI-baserede providers/enrichers rejser yderligere spørgsmål om
træningsdata-proveniens og output-brugsrettigheder. **Reduktion:**
dokumentér hver kildes vilkår explicit før den tilsluttes (samme
disciplin som `docs/data-sources.md` allerede praktiserer), og byg
attribution ind i UI hvor krævet, i stedet for at opdage et
overtrådt vilkår efter lancering.

### Metadata-kvalitet og -konsistens

Forskellige kilder beskriver den samme sang forskelligt (forskellige
kunstner-navne-formater, manglende felter, inkonsistente genre-tags).
Dårlig metadata betyder dårlig enrichment betyder dårligt DNA betyder
dårlig ranking — fejl forplanter sig opad gennem hele stakken.
**Reduktion:** confidence-scorer på hvert signal (så usikre/manglende
data vejer mindre i stedet for at blive behandlet som sikre), og
synlig diagnostik der viser *hvilken* kilde og hvilket trin der
producerede et mistænkeligt resultat — den slags gennemsigtighed
denne session har vist er uundværlig, ikke valgfri.

### Kold-start-risiko (nye brugere)

Et system der kun bliver godt af feedback er per definition svagt for
brugere med meget lidt feedback endnu. **Reduktion:** cold-start fra
Spotify-biblioteket (afsnit 6) giver et bedre-end-tilfældigt
udgangspunkt, og v1's forklarlige, regelbaserede ranking (afsnit 7)
fungerer uden træningsdata fra dag ét — den lærte model er en
fase 4-forbedring, aldrig en fase 1-forudsætning.

---

**Dette dokument kræver godkendelse før Music DNA Rebuilt påbegyndes.**
