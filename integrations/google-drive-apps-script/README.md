# HUWiki Google Drev – isoleret teknisk test

**Status: eksperimentel. Brugeren har oprettet webapp-implementeringen; login, Drive-overførsler og flerbrugerfunktioner er endnu ikke verificeret.**

**Seneste oplyste test-URL (13. november 2026):**
https://script.google.com/macros/s/AKfycbxcW3X-jn0sUcNL1MKUg3RNp4UeG_4LqQyglAc9VlSKcB8mgHTAFUbO1BzAYM4tdwF-/exec

**Apps Script script-ID:** `1WTaV-Z-rTOgR1yLZ5IydFRizlSEFR9NksQVXqWocWeOdJjjJ_MCWRFzP`

Det valgfri Forge-plugin leverer URL'en som default. Dette er en offentlig
webapp-adresse, **ikke et adgangstoken**. Hvis webappens URL skifter ved ny
implementering, skal plugin-konfigurationen også opdateres.


Denne prototype skal ikke erstatte Forge, TiddlyWikis almindelige lokale HTML-gemning
eller det tidligere OAuthLab. Den lader to Google-konti redigere **én delt HTML-wiki**
skiftevis, med versionskontrol og Google Drives almindelige tilladelser.

## Første afprøvning og fundet fejl (13. november 2026)

- Kontoen `humamamm@gmail.com` kunne uploade og åbne `HUWiki-demo (1).html` i ForgeDrive.
- Første gemning gav en **falsk konflikt** efter cirka 10 sekunder.
- Drive-revisionshistorikken viste kun den oprindelige revision: HTML-indholdet var ikke blevet ændret.
- Årsag i den oprindelige kontrol: Drive-feltet `version` tæller også serverændringer i metadata og kan derfor ikke alene bruges til at afgøre, om HTML'en er ændret.
- Rettelse: `md5Checksum` som indholdsfingerprint, og fail-closed hvis checksum mangler. Testene omfatter samme checksum med ændret versionsnummer og ændret checksum med samme versionsnummer.
- Ved retest: Hent først den lokale backup fra den konfliktramte wiki. Udgiv en **ny version af samme Apps Script-implementering**, ellers bruger `/exec` stadig gammel kode.
- Gemmestatus skal måle **samlet browser-ventetid** og server-tid hver for sig.

## Brugerrejsen

1. Brugeren vælger en Edition i Forge, evt. `Google Drev (test)` som ekstra plugin.
2. Forge leverer fortsat en selvstændig HTML-fil. Den virker også uden Google.
3. I den valgfri Apps Script-webapp uploader brugeren sin færdige HTML-fil
   én gang via **lokal** filvælger. Det er **ikke Google Picker**.
4. Filen oprettes i **brugerens eget Google Drev** og åbnes af Apps Script-webappen
   i en iframe. En TiddlyWiki-saver gemmer via `google.script.run`.
5. Fra topbjælken deles filen med en Google-kontomailadresse som **læser** eller
   **redaktør**. Google Drive API sender automatisk invitationsmail med link til
   den delte wiki i Apps Script-webappen.
6. Modtageren åbner linket i egen Google-session. Webappen udføres som den
   **aktuelle bruger**, så Drives rettigheder og Apps Script-kvoter følger denne.

Den oprindeligt downloadede HTML-fil forbindes **ikke automatisk** til Drive.
Når filen er importeret, er webappens Drive-kopi den delte version; rediger
ikke sideløbende i den lokale kopi. Sømløs import direkte fra en lokal TiddlyWiki
kan tilføjes senere, efter at denne løsning er browser- og rettighedstestet.

## Sådan installeres testen

1. Opret et **nyt, selvstændigt Apps Script-projekt på den private Google-konto**.
   Brug ikke det eksisterende OAuthLab-projekt.
2. Kopiér `Code.gs` og `Index.html` til Apps Script. Anvend `appsscript.json`.
   Slå visning af manifestfil til i Apps Script-projektindstillingerne.
3. Aktivér **Advanced Google services → Drive API v3** i Apps Script.
   Hvis projektet bruger eget Cloud-projekt, skal Drive API også aktiveres dér.
4. Implementér som **Webapp**:
   - **Udfør som:** `Brugeren, der åbner webappen` / `USER_ACCESSING`.
   - **Hvem har adgang:** `Alle med en Google-konto` (logget ind) / `ANYONE`.
5. Åbn den ovenstående `/exec`-adresse som den private bruger, og godkend tilladelserne.
6. Byg en **lille test-Edition** i Forge. Vælg filen fra webappens lokale
   filvælger, og kontroller at den kan åbnes og gemmes.
7. Del med skolekontoen som redaktør. Modtageren bruger linket i
   Google Drive-invitationen. Test begge veje.
8. Opret derefter forskellige tiddlere og til sidst en bevidst konflikt
   i to åbne sessioner. Bekræft, at sidste ændring ikke overskrives lydløst.
9. Mål indlæsning og gemning med både en lille wiki og Musik Edition.

## Gennemførte begrænsninger og fejl vi skal lede efter

- Ingen `UrlFetchApp`, `MailApp`, `GmailApp` eller Google Picker bruges.
- Appen laver **hele HTML-uploaden ved gemning**, ikke tiddlerbaseret sync.
- Google Drives `md5Checksum` for **filindholdet** kontrolleres før upload; `version` er ikke pålideligt som indholdsfingerprint, fordi det også ændres ved metadataændringer. `LockService` serialiserer
  webappens gemninger, men kan **ikke** sikre atomisk konfliktkontrol mod
  redigering uden for dette Apps Script-projekt.
- En konfliktramt browser beholder lokale ændringer i hukommelsen.
  Brugeren skal kunne eksportere lokal backup, før vedkommende genindlæser.
- `google.script.run` og iframe-opsætningen skal testes på Mac og iPad.
- Den valgte 12 MB testgrænse er bevidst konservativ; store Editions kan
  ramme Apps Scripts upload- og udførelsesgrænser.
- En Google Workspace-administrator kan begrænse ekstern deling eller de
  scopes, webappen beder om. Meddel fejlen i stedet for at omgå den.
- Google Drive-notifikationen sendes via **Drive API's permissions.create**
  (ikke Gmail API); `sendNotificationEmail=true`. Senere kan vi tilbyde
  eget mailprogram/anden udbyder, hvis deling og invitation skal adskilles.
- `DriveApp` kræver bred Drive-adgang i Apps Script. Den eksisterende
  OAuthLab-verifikation overføres **ikke** automatisk til en ny app.
- Utestet med TiddlyWiki HTML, der benytter ekstern core.

## Arkitektur og fremtidig retning

```text
Forge Edition Assembler
  └─ Valgfrit Google Drev-plugin (launcher / hjælp)
       └─ Selvstændig Apps Script-webapp [USER_ACCESSING]
            ├─ HTMLService + google.script.run
            ├─ TiddlyWiki i iframe + custom saver
            ├─ Drive API: filer og permissions
            └─ Google Drive: én delt wiki.html
```

*Dette er en afgrænset test af den enkle helfilsløsning.* Senere kan vi bygge
en udskiftelig sync-adapter med tiddler-deltaer, hvis praktiske målinger
retfærdiggør kompleksiteten. Der skal ikke indføres nogen Google-afhængighed
i almindelige Editions.

## Kilder

- Tiddly Drive 2: https://github.com/aneuhold/tiddlydrive
- Apps Script webapps: https://developers.google.com/apps-script/guides/web
- HTMLService-client/server: https://developers.google.com/apps-script/guides/html/communication
- Drive permissions/create: https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create

Tiddly Drive 2 er GPLv3. Denne prototype er en selvstændig implementering
inspireret af de offentligt beskrevne designmønstre; ingen kode er kopieret.
Licens for ny Forge-kode fastlægges senere.
