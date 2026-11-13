# HUWiki Forge — projektplan v0.3

**Dato:** 13. november 2026  
**Status:** Revideret arkitektur- og arbejdsplan — endnu ikke implementeret  
**Arbejdsnavn:** HUWiki Forge  
**Ændring siden v0.2:** TiddlyWikis eksisterende redigerings-, gemme-, import-/eksport- og server-saverfunktioner er standard. IndexedDB, »Mine wikier« og en ny lagringsmotor er **ikke** krav til Forge og er taget ud af den første udviklingsplan.

## 1. Formål og afgrænsning

HUWiki Forge skal være en offentligt tilgængelig TiddlyWiki-baseret **launcher, Editions-katalog og distributionsplatform**, hostet statisk på GitHub Pages og eventuelt et eget domæne.

**Forge gør én særlig ting:** Når brugeren vælger en Edition, samler **Edition Assembler** en frisk, testet og kompatibel TiddlyWiki-kerne (`empty.html`) med Editionens plugins, tiddlere, tema, sprog og nødvendige indstillinger. Den resulterende wiki er en almindelig, selvstændig TiddlyWiki.

Derefter arbejder brugeren **på TiddlyWikis egne præmisser**:

- Redigering, plugininstallation, sprog- og temavalg samt nye tiddlere sker i TiddlyWiki.
- Brugeren kan benytte TiddlyWikis almindelige **Gem**-funktion til at få en færdig HTML-wiki med sine ændringer.
- Har brugeren en kompatibel server eller Git-tjeneste, kan TiddlyWikis **eksisterende saver-/Saving-indstillinger** bruges til at gemme dertil med de krævede rettigheder og adgangsoplysninger.
- Import, eksport og tilgængelige backupmuligheder bygger på TiddlyWikis eksisterende funktioner. Forge udvikler **ikke** en ny HTML-saver, backupmotor eller generel serversynkronisering.
- Hvis en bestemt browser/host kræver, at wikien først gemmes som en fil og åbnes i en anden kontekst, vejleder vi om det; vi lover ikke, at lokal HTML i sig selv løser CORS.

En Edition er **en opskrift (manifest)**, ikke en manuelt vedligeholdt fuld HTML-fil. Notice er et selvstændigt, valgfrit kommunikationsplugin til opdateringer, senere Talkback og eventuelt federation.

## 2. Grundprincipper

1. **Brug TiddlyWiki, som det er:** Ingen parallelle løsninger til almindelig wikiredigering, HTML-gemning, import/eksport, backup eller server-savers.
2. **Automatisér kun samlingen:** Forge erstatter den manuelle proces med at åbne `empty.html` og installere en Editions komponenter én efter én.
3. **Ingen konto for at komme i gang:** Alle kan åbne Forge og sammensætte en Edition uden Google- eller GitHub-login.
4. **Brugeren ejer sin wiki:** Efter samling er wikien uafhængig af Forge og kan gemmes eller hostes på brugerens foretrukne måde. Notice kan fravælges.
5. **Frisk, men kompatibel kerne:** Brug nyeste *testede* stabile TiddlyWiki-version; ved inkompatibilitet skal Assembler vælge eller tilbyde en kendt kompatibel version og forklare hvorfor. Eksisterende wikier opgraderes ikke stiltiende.
6. **Vedligehold moduler, ikke monolitter:** Plugins og almindelige tiddlere kan vedligeholdes som individuelle kilder på GitHub. Distributionspakker bygges efter behov.
7. **Sikker offentlig/privat adskillelse:** Offentligt Forge-indhold indeholder aldrig et GitHub-token. Den lokale udgiver kan have adgang til en token-baseret Publisher, uden at tokenet gemmes i HTML eller commits.
8. **Notice indføres trinvist:** Opdateringsbeskeder først; support/Talkback og community/federation kommer senere og må ikke være forudsætninger for at bruge wikien.
9. **Ingen automatisk overskrivning:** Ændrede lokale tiddlere, plugins eller indstillinger må ikke overskrives uvarslet af opdateringer.
10. **Gør ikke IndexedDB til et fundament:** En valgfri browserarbejdsplads med lokal autosave kan overvejes senere, men kræver særskilt begrundelse og må ikke ændre standardforløbet.

## 3. Brugerforløb

### A. Ny bruger uden egen server

1. Åbner HUWiki Forge i browseren.
2. Vælger eksempelvis **Musik Edition** i kataloget.
3. Edition Assembler henter en godkendt `empty.html` samt de præcise komponenter fra manifestet og samler dem **før TiddlyWikis boot**, så også JavaScript-plugins virker fra første start.
4. Den færdige wiki åbnes. Brugeren opretter tiddlere, installerer andre plugins, skifter sprog osv. på normal TiddlyWiki-vis.
5. Brugeren vælger **Gem** i TiddlyWiki og får sin egen komplette HTML-fil. Denne kan fortsat redigeres og gemmes med TiddlyWikis almindelige funktioner.
6. Notice kan kontrollere opdateringer, når wikien er online.

**Vigtigt:** Den første version lover ikke, at en wiki forbliver tilgængelig som en autosavet browserarbejdsplads efter lukning af fanen. Brugeren skal bruge TiddlyWikis almindelige gemmefunktion, medmindre vedkommende har konfigureret en saver.

### B. Bruger med egen server / Git-hosting

1. Opretter sin Edition som ovenfor.
2. Åbner TiddlyWikis eksisterende **Saving-indstillinger** og konfigurerer en understøttet saver, f.eks. en Git-tjeneste eller egen kompatibel server.
3. Gemmer herefter direkte fra TiddlyWiki, når browser, hosting, autentifikation og CORS tillader det.
4. Hvor direkte gemning ikke fungerer i den oprindelige browserkontekst, kan brugeren først gemme HTML-filen og åbne den i den kontekst, som saveren understøtter, eller ændre serveropsætning.
5. Hvis brugeren ønsker det, kan den offentligt hostede wiki senere tilmeldes Notice Community.

**Ansvarsgrænse:** Forge bygger ikke nye generelle server-savers og påtager sig ikke at konfigurere eller reparere alle tredjepartsservere.

### C. Vedligeholder / udgiver

1. Åbner den lokale administration baseret på Forge-kodebasen, helst på en isoleret origin, hvis GitHub-token skal bruges.
2. Redigerer et Edition-manifest, en almindelig tiddler eller kildefiler til et plugin.
3. Vælger **Udgiv til GitHub** i et særskilt Publisher-plugin; ser filsti, ændring og branch før bekræftelse.
4. Indtaster et kortlivet, repository-begrænset token til den enkelte session. Tokenet lagres ikke i tiddlere, HTML, repository eller eksporter.
5. Publisher opretter eller opdaterer kun den relevante fil via GitHub Contents API og kontrollerer aktuel SHA for at undgå stiltiende overskrivning.
6. Et byggeworkflow opdaterer efter behov genererede pluginbundles, katalog og Notice-opdateringsfeed.

### D. Support og community — senere

En bruger kan frivilligt sende et spørgsmål fra Notice uden at have en offentlig wikiadresse. En særskilt modtagertjeneste lagrer henvendelsen og stiller svar til rådighed. Senere kan brugeren frivilligt registrere en offentligt hostet wiki og abonnere på andre wikiers offentlige ændringsfeeds.

## 4. Systemets dele — med tydelig ansvarsfordeling

| Del | Ansvar | Prioritet |
|---|---|---|
| **Forge Launcher** | Editions-katalog, valg og start af en ny wiki | Først |
| **Edition Assembler** | Manifest, afhængigheder, kerneversion, komponenter og samling før boot | Først |
| **Manifest / Package Builder** | Struktur for Editions og byggeproces til TiddlyWiki-pluginbundles | Først, minimal version |
| **GitHub Publisher** | Adminværktøj til at udgive enkelte tiddlere, manifests og pluginkilder til bestemte mapper | Efter første Assembler-test |
| **Notice / Updates** | Versionstjek og tilbud om opdateringer i allerede oprettede wikier | Derefter |
| **Notice / Talkback** | Supporthenvendelse og svar via særskilt backend | Senere |
| **Notice / Community** | Frivillige offentlige wikiadresser og læsbare feeds | Senere |
| **Collaboration Adapter** | Eventuelt reelt to-vejs samarbejde, rettigheder og konfliktlog | Sidst, hvis ønsket |
| **Valgfrit browserlager** | Eventuel IndexedDB-arbejdsplads/autosave på Forge-domænet | **Uden for v0.1** |

### Hvad Forge udtrykkeligt ikke bygger

- Ny HTML-gemmefunktion eller backupmotor.
- Ny generel import-/eksportmotor.
- Alternativ til TiddlyWikis redigeringsgrænseflade.
- Generel hosting- eller server-saver for brugerens wiki.
- Krav om IndexedDB, brugerprofil eller »Mine wikier« for at oprette en Edition.

## 5. Foreslået GitHub-struktur

```text
huwiki-forge/
├── index.html                       # offentlig TiddlyWiki-baseret launcher
├── assembler/                      # nødvendige before-boot samlingsrutiner
├── catalog/
│   └── editions.json               # Editions-katalog
├── core/
│   └── versions.json               # testede/godkendte TiddlyWiki-kerner
├── editions/
│   ├── standard/
│   │   ├── manifest.json
│   │   └── tiddlers/
│   └── musik/
│       ├── manifest.json
│       └── tiddlers/
├── plugins/
│   ├── abc/
│   │   ├── manifest.json
│   │   ├── src/                      # redigerbare modul-tiddlere
│   │   └── dist/plugin.json         # genereret distributionsbundle
│   ├── musik/
│   └── notice/
├── updates/
│   └── feed.json
├── .github/workflows/              # validering, bygning, Pages
└── docs/
```

*Bemærk:* Den tekniske pakning af Assembler skal vælges efter den første prototype. Den kan have UI i launcheren, men må kunne indsætte tiddlere og plugins før boot af **den nye wiki**.

### Edition-manifest — illustrativ skitse

```json
{
  "schemaVersion": 1,
  "id": "musik",
  "name": "HUWiki Musik Edition",
  "editionVersion": "0.1.0",
  "core": { "channel": "stable-tested", "minVersion": "5.4.0" },
  "plugins": [
    { "id": "$:/plugins/huwiki/abc", "path": "plugins/abc/dist/plugin.json" },
    { "id": "$:/plugins/huwiki/notice", "path": "plugins/notice/dist/plugin.json" }
  ],
  "tiddlers": ["editions/musik/tiddlers/start.json"],
  "assets": [],
  "language": "da-DK"
}
```

Det endelige schema skal indeholde validerbare versioner, checksums, plugin-afhængigheder, licenser og oplysninger om ressourcer, der kun virker online. Versions-/hashbinding skal sikre, at en samling ikke blander filer fra forskellige releases.

## 6. Første tekniske afprøvninger

| Prøve | Opgave | Bestået når ... |
|---|---|---|
| **T1. Samling før boot** | Hent en testet `empty.html`, tilføj en tiddler og et JavaScript-plugin fra manifestet, start wikien | Plugin fungerer ved første åbning, uden manuel installation/genindlæsning |
| **T2. TiddlyWikis egen Gem** | Redigér den samlede wiki og gem HTML med TiddlyWikis eksisterende gemmefunktion | Den downloadede HTML indeholder indhold og plugins og kan genåbnes uafhængigt af Forge |
| **T3. Standard server-saver** | Konfigurér en eksisterende Git-/server-saver i den færdige wiki | TiddlyWiki kan gemme på en understøttet destination, eller en konkret dokumenteret browser-/CORS-begrænsning identificeres; **ingen ny saver bygges** |
| **T4. GitHub Publisher** | Opret, ret og slet en test-tiddler i en valgt mappe | Kun den ønskede fil ændres; SHA-konflikter fanges; tokenet optræder ikke i offentlig HTML eller commit |
| **T5. Netværk og browser** | Afprøv kernedownload, pakker og samling på Mac og iPad | CORS, caching og eventuel `file://`/`localhost`-forskel er dokumenteret og håndteret |

Vi bruger disse prøver som stopregel, før vi påbegynder større migrationer. Hvis direkte hentning af den officielle `empty.html` blokeres af CORS eller cache, kan en automatisk og versionsmærket kopi på GitHub Pages være en løsning. Den skal altid stamme fra en kontrolleret officiel release.

## 7. Udviklingsfaser

### Fase 0 — kortlægning og kontrakter

- Kortlæg eksisterende HUWiki Editions, plugins, temaer, oversættelser, eksempelpakker, eksterne biblioteker og licenser.
- Definér manifest, filstier, versionspolitik, pluginbundles og source-of-truth.
- Beslut hvilke komponenter der er Edition-specifikke, og hvilke der kan installeres separat i andre TiddlyWikier.
- Bevar nuværende HUWiki som fungerende system under udviklingen.

**Leverance:** Dependency-inventar, manifest-udkast og test-repository.

### Fase 1 — minimal Edition Assembler

- Vælg én simpel test-Edition og ét minimalt JavaScript-plugin.
- Saml officiel kompatibel kerne + komponenter før boot.
- Åbn den nye wiki og test **TiddlyWikis almindelige Gem og HTML-fil**, uden at udvikle et nyt gemmesystem.
- Test eksisterende server-saver og browserbegrænsninger; ingen IndexedDB-autosave.

**Leverance:** Demonstration: vælg Edition → åbn færdig TiddlyWiki → redigér → Gem → genåbn HTML.

### Fase 2 — offentlig Forge Launcher

- Editions-katalog med beskrivelser, opret-knap og tydelig status for hvilken kerneversion der bruges.
- Fejlhåndtering, downloadforløb, afhængigheds- og versionskontrol.
- En enkel vejledning til TiddlyWikis egne Gem-funktioner og valgfrie server-savers.
- Ingen konti, intet nødvendigt browserlager, ingen nyskabt »Mine wikier«.

**Leverance:** Offentlig Pages-launcher, der kan fremstille en selvstændig wiki.

### Fase 3 — pluginbibliotek og kildefiler

- Standard Edition først; derefter en begrænset Musik/ABC Edition som stresstest.
- Enkelt-tiddler-kilder, pluginbundle-bygning, opdaterede manifests og versioner.
- Skil eksempelsamlinger fra plugin-kode, hvor det giver mening.
- Håndtér tunge lydressourcer særskilt og bevar den aftalte forskel mellem online ressourcer og offline-backup.

**Leverance:** Mindst to Editions kan samles uden at vedligeholde færdige Edition-HTML-filer.

### Fase 4 — lokal administration og GitHub Publisher

- Samme Forge-kodebase, udvidet med privat udgivelsesfunktion.
- Vis filsti/ændringspreview; udgiv enkelt-tiddlere og manifests med konfliktsikring.
- Generér distribution, versionsfeed og katalogopdateringer efter commit.
- Token bruges kun under kontrolleret session, aldrig i offentliggjorte artefakter.

**Leverance:** Én lokal ændring bliver til præcis den ønskede offentlige GitHub-fil og eventuelt en ny pluginrelease.

### Fase 5 — Notice Updates

- Selvstændigt installerbart Notice-plugin, også i eksporterede/selvhostede wikier.
- Check af versioner og kompatibilitet; manuel godkendelse af opdateringer.
- Beskyttelse af brugerens lokale ændringer og mulighed for at afvise opdateringer.

**Leverance:** En selvstændig wiki opdager en ny version uden at være afhængig af Forge som gemmested.

### Fase 6 — Notice Talkback

- Vælg minimal modtagertjeneste (f.eks. serverløs funktion eller lille Apps Script).
- Test support-POST fra både hostet og lokal HTML under reelle CORS-regler.
- Ticket-id, privat svaradgang, misbrugsbeskyttelse og kun bruger-godkendte metadata.

**Leverance:** En bruger kan skrive fra sin wiki og modtage svar uden GitHub-/Google-konto.

### Fase 7 — frivilligt community og federation

- Registrér offentlig wikiadresse med dokumentation for ejerskab.
- Publicér læsbare metadata og ændringsfeeds; tillad abonnement på offentligt indhold.
- Undersøg TWederation og andre TiddlyWiki-projekter som inspiration; direkte genbrug forudsætter sikkerheds-/kompatibilitetskontrol.

**Leverance:** To selvhostede wikier kan opdage og hente hinandens bevidst offentliggjorte ændringer.

### Fase 8 — eventuelt samarbejde

- Et separat Collaboration Adapter-plugin kan senere håndtere autentificeret to-vejs synkronisering, rettigheder, ændringslog og konflikter.
- Ikke nødvendigt for Forge, Edition Assembler eller Notice Updates.

**Leverance:** Kun hvis der faktisk er behov og en forsvarlig backend.

## 8. Sikkerhed, kompatibilitet og tekniske grænser

- Token må aldrig indgå i tiddlere, pluginbundles, HTML-eksport, builds eller commits. Tredjeparts-JavaScript på samme origin kan læse browserens storage; en adminfunktion bør adskilles fra offentlig kørsel.
- GitHub Pages er statisk og kan ikke alene modtage Talkback-beskeder eller skrive til et community-register.
- Browserens CORS-regler gælder både ved samling fra eksterne domæner og ved forsøg på at gemme på andre domæner. **At gemme HTML lokalt løser ikke CORS i sig selv.** Den understøttede URL/origin, saver og serversvar skal testes.
- Nyeste officielle TiddlyWiki-kerne må ikke automatisk erstatte en testet version, før Editionens plugin-kompatibilitet er bekræftet.
- Den samlede wiki skal have en korrekt, normal TiddlyWiki-boot og bevare dens egne saver-/eksportmuligheder.
- Notice må ikke installere vilkårlig JavaScript fra fremmede wikier automatisk.
- En »online« Edition kan stadig bruge ressourcer fra nettet. Hvis en Edition tilbyder en særskilt offline-pakke, må den beskrive sine ekstra afhængigheder tydeligt; dette ændrer ikke TiddlyWikis almindelige HTML-gemning.

## 9. Åbne beslutninger

1. **Assemblerens indpakning:** Ren TiddlyWiki med boot-/build-modul eller en minimal shell ved siden af launcheren? Afgøres efter T1.
2. **Kildens `empty.html`:** Direkte fetch fra TiddlyWiki eller automatisk spejlet, versioneret kerne på Pages, afhængigt af CORS og releasekontrol.
3. **Administratorens origin:** Direkte lokal fil, `localhost` eller anden isoleret lokal kontekst.
4. **Kilde-/bundlekontrakt:** Hvordan tiddlere, pluginmoduler og distributionsbundles organiseres uden at miste kildeinformation.
5. **Versionspolitik:** Hvilke core/plugin/Edition-kombinationer godkendes og hvordan vises inkompatibilitet.
6. **Notice Talksback:** Minimums-backend, CORS, identitets-/svarnøglemodel og spambegrænsning.
7. **Valgfri browserarbejdsplads:** Undersøges kun senere, hvis brugere faktisk efterspørger at fortsætte uden at gemme en HTML-fil eller konfigurere en saver.

## 10. Første konkrete opgave

> **Byg den mindste mulige Edition Assembler** med en test-Edition, et almindeligt tiddler-JSON og et fungerende JavaScript-plugin. Hent en testet `empty.html`, saml den og åbn wikien. Redigér og brug derefter **TiddlyWikis helt almindelige Gem-funktion** til at gemme og genåbne den komplette HTML-fil. Afprøv en eksisterende Git-/server-saver som selvstændig test. *Ingen IndexedDB, ny HTML-eksport, ny backupmotor eller »Mine wikier« i prototypen.*

Når det virker, går vi videre til Publisher og Notice. Først derefter giver det mening at beslutte, om noget ekstra browserlager overhovedet er nødvendigt.

## 11. Dokumentation at støtte implementeringen på

- [TiddlyWiki — dokumentation](https://tiddlywiki.com/) — standardredigering, Saving, import og eksport.
- [TiddlyWiki — Git Service Saver](https://tiddlywiki.com/static/Saving%2520to%2520a%2520Git%2520service.html) — eksempel på eksisterende server-/Git-gemning.
- [TiddlyWiki — Plugin Fields](https://tiddlywiki.com/static/Plugin%2520Fields.html) — plugin-pakning og felter.
- [TiddlyWiki — PluginFolders](https://tiddlywiki.com/static/PluginFolders.html) — kilde-/pluginstruktur.
- [TiddlyWiki Dev](https://tiddlywiki.com/dev/) — boot og indlæsning.
- [GitHub REST API: repository contents](https://docs.github.com/en/rest/repos/contents) — opret/opdatér enkeltfiler.

---

**Beslutning i v0.3:** HUWiki Forge skal ikke bygge en alternativ TiddlyWiki. Den skal gøre det lettere at **oprette, distribuere, vedligeholde og forbinde almindelige TiddlyWikier**.