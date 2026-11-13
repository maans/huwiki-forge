# ForgeDrive — valgfri Google Drev-integration (test)

**Status (13. november 2026):** Background tiddler sync under udvikling på
`feat/forgedrive-background-tiddler-sync` (PR #2, draft).
**Ikke udrullet på den eksisterende /exec-webapp.** GitHub Actions tester
simulationer; **ægte flerbruger- og browsertest med to Google-konti mangler**.

- Repository: https://github.com/maans/huwiki-forge
- Script-ID: `1WTaV-Z-rTOgR1yLZ5IydFRizlSEFR9NksQVXqWocWeOdJjjJ_MCWRFzP`
- Eksisterende webapp:
  https://script.google.com/macros/s/AKfycbxcW3X-jn0sUcNL1MKUg3RNp4UeG_4LqQyglAc9VlSKcB8mgHTAFUbO1BzAYM4tdwF-/exec

## Det nye

1. Forge bygger fortsat en almindelig, selvstændig TiddlyWiki-HTML-fil.
2. Brugeren vælger frivilligt Google Drev-pluginet og uploader wikien via en
   **lokal filvælger** i Apps Script HTML Service — ingen Google Picker.
3. `huSyncEnable` opretter **én Google Sheets-ændringslog pr. HTML-wiki**
   og kobler den til wikien via Drive custom properties. Eksisterende
   tiddlere forbliver i den oprindelige HTML-baseline; den overskrives ikke.
4. Eksisterende direkte maildelinger spejles til loggen, før synk
   aktiveres. Link-, domæne- og gruppedeling afvises, hvis de ikke kan
   spejles sikkert. Efterfølgende invitationer og rolleændringer omfatter
   både HTML-filen og ændringsloggen.
5. `DeltaClient.html` samler små, lokale ændringer efter en rolig periode,
   sender dem med `google.script.run` og henter andres ændringer med en
   moderat pollingfrekvens. Skjulte faner poller ikke, og synk genoptages
   ved tilbagevenden til fanen eller nettet.
6. Revisionskontrol foregår **pr. tiddler**, med operation-ID'er for
   sikre gentagne forsøg. Konkurrerende ændringer bevarer den lokale
   version og rapporterer en konflikt; øvrige tiddlere kan fortsætte.
   Klienten gemmer en lokal sammenligningsbaseline af bekræftede tiddlere.
   Hvis TiddlyWiki viser ugemte ændringer, men ingen delta-operationer
   ligger i kø, sammenlignes wikiens almindelige tiddlere lokalt med
   baseline. Oversete redigeringer eller sletninger køres gennem den
   almindelige revisionskontrollerede synkronisering uden ekstra Drive-kald.
   Brugerfladen viser særskilt **registreret**, **bekræftet gemt** og
   **fundet ved kontrol**, sammen med den oprindelige TiddlyWiki-dirty-status.
   Derfor er `0 pending` aldrig i sig selv en gemmebekræftelse.
7. Kun bekræftede ændringer tæller som synkroniserede. Ved offline/fejl
   forbliver ændringer i køen, og browseren advarer før lukning.
   Pending drafts genoprettes via kontoopdelt browserlagring, **hvis
   browseren tillader dette**. Ved manglende/fuld browserlagring vises
   advarsel: hent altid en lokal HTML-backup, før du lukker.
   **Gendannede ændringer fra et ældre HTML-snapshot bliver ikke sendt
   automatisk til et nyt snapshot**. Klienten bevarer dem til lokal
   sikkerhedskopi og kræver manuel afklaring.
8. Store medie- og plugin-tiddlere, der ikke kan være i en Sheets-celle,
   udelades af delta-loggen og kræver et manuelt fuldt HTML-snapshot.
   Andre åbne klienter må genåbne wikien for at få sådanne ændringer.
   De sendes ikke i et endeløst retry-loop.
9. Komplet HTML-snapshot bevares som frivillig handling. `huSave`
   kontrollerer både Drives indholds-`md5Checksum` og journalens
   sekvensnummer under samme Apps Script-lock som delta-skrivningerne.
   `huSyncEnable` og alle `huSyncPush` kontrollerer også browserens
   **oprindelige HTML-checksum**. Hvis en anden bruger har gemt et nyt
   HTML-snapshot, stoppes synkroniseringen uden at kassere lokale ændringer,
   selv hvis ændringen kun omfattede store medier eller systemtiddlere.
   En gammel browser kan derfor ikke overskrive nyere logændringer.
10. Snapshot-sekvensnummer bruges ved genåbning til at hente **kompakte
    revisionshoveder**, ikke alle gamle tiddler-tekster. TiddlyWikis
    `$:/language` (dansk/engelsk) styrer synkgrænsefladen uden en
    ekstra sprogvælger.

## Vigtige krav

- Manifest: `webapp.executeAs: USER_ACCESSING`, `access: ANYONE`
  (altså loggede Google-brugere). Ikke ejerens rettigheder eller kvoter.
- Advanced Drive API v3 og `SpreadsheetApp` bruges med scopes
  `drive` og `spreadsheets`; ingen Picker, UrlFetch, Gmail eller MailApp.
- `Drive.Permissions.remove(fileId, permissionId)` er Apps Scripts
  Advanced Drive-navn for API v3's `permissions.delete`.
- Script-lock beskytter webappens egne samtidige skrivninger. Google
  Drive-redigering uden for denne webapp er **ikke atomisk** med denne lås.
  Indholds-checksum standser en overskrivning ved en forskel.
- Synkronisering gælder, mens fanen er åben; den er **ikke** en
  serverbaseret baggrundsproces, der fortsætter efter lukning.
- De fleste almindelige tiddlere synkroniseres som deltaer. `$:/`-
  systemtiddlere og overstore assets kræver fortsat et snapshot.
- Viewer kan hente fjernændringer; redigering og invitation afhænger
  af Drives aktuelle filrettigheder.
- Almindelige Forge Editions er helt uafhængige af Google Drive.

## Automatisk test

Kør `npm test` fra repositoryets rodmappe.
Særligt `tests/forgedrive-background-sync.test.mjs` tester backend,
to browserklienter, konflikter, duplikerede operationer, deling,
sletning, offline recovery, tiddlerredigering under upload,
snapshots og status. `tests/google-drive-adapter.test.mjs` tester
den oprindelige helfil-adapter og manifestets rettigheder.

Disse tests bruger en simuleret Drive/Sheets-backend. **De beviser
ikke**, at Google Workspace-delingspolitik, HTML Service-iframes,
kvoter, iPad eller større reelle wikier fungerer.

## Invitationsmail og korrekt webapp-link

Googles standardmail om deling viser automatisk et filkort med navnet
på `wiki.html`. **Filkortet åbner Google Drives rå HTML-forhåndsvisning,
ikke TiddlyWiki i ForgeDrive.** Denne destination kan ikke ændres med
Drive Permissions API. Modtageren skal i stedet bruge deep-linket til
Apps Script-webappen med `/exec?id=<wiki-file-id>`.

ForgeDrive tilføjer derfor både en tydelig, tosproget instruktion i
Googles `emailMessage` og et **Åbn i ForgeDrive / Kopiér ForgeDrive-link**
i webappen. Det kan videresendes selvstændigt, hvis Gmail ikke gør
adressen i delingsbeskeden klikbar. URL'en hentes fra
`ScriptApp.getService().getUrl()` — aldrig fra HTML Service-rammens
`script.googleusercontent.com`-adresse. Drive styrer fortsat adgang
til både HTML-filen og ændringsloggen; linket giver ikke i sig selv adgang.

## Manuel første test, efter sikker backup og ny version

1. Brug den private Google-konto som ejer af den eksisterende
   Apps Script-webapp. Tag først en `clasp pull`-backup af HEAD.
2. Upload den gennemtestede branch med `clasp push`. **Opdater derefter
   manuelt den eksisterende implementering med en ny version**;
   opret ikke en ny /exec-adresse.
3. Importér en lille Demo Edition, aktivér tiddler-synk, og redigér et
   par små tiddlere. Kontroller at dirty-indikatoren slukkes, når
   sidste ændring er bekræftet, og at der ikke sker helfil-upload
   for hver ændring.
4. Del som redaktør til skolekontoen. Kontroller først om
   skolekontoens Workspace-politik tillader ekstern deling og
   OAuth-adgang til begge filer.
5. Åbn på begge konti og kontroller: ny tiddler, redigering,
   fjernsletning, samtidige konflikter og genåbning.
6. Afprøv en offline ændring, netforbindelse igen, en overstor
   medietiddler samt manuel HTML-sikkerhedskopi. Brug kun testdata.

## Tidligere fund (13. november 2026)

- Første helfilstest: ca. **2,5 MB** HTML, upload og åbning lykkedes.
- Første gemning gav en falsk konflikt pga. Google Drive `version`
  (metadata ændrer version); rettet til **`md5Checksum`**.
- Hel HTML-gemning tog **34,4 sek.** fra browseren og **3,0 sek.**
  i selve Apps Script-kaldet. Derfor deltaer til hverdag og kun
  lejlighedsvise snapshots.
- TW dirty-indikator forblev rød efter gemning; delta-klientens
  ack- og remote-event-håndtering er forbedret, men kræver en
  reel browsertest.

## Relevante Google-referencer

- https://developers.google.com/apps-script/manifest/web-app-api-executable
- https://developers.google.com/apps-script/advanced/drive
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions
