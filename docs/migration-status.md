# Overførsel af HUWiki Editions til Forge

Status: 13. november 2026. Dette dokument beskriver den konkrete migration af den indsendte `HUWiki-OAuthLab-backup.zip` (132 arkivposter), ikke en påstand om at alle Editions allerede er færdige.

## Ufravigeligt princip

**Alle Editions skal kunne anvendes uden Google-tjenester.** Browseren og en selvstændig TiddlyWiki er fundamentet. Eksterne tjenester kan tilbydes som valgfrie adaptere. Grundfunktioner må ikke være afhængige af Apps Script, Google Drev, Forms eller Sheets. Brugeren gemmer sin wiki med TiddlyWikis indbyggede saver.

For tjenester der kræver en server (fx modtagelse af offentlige formularbesvarelser eller onlineordrer), må Forge tilbyde en selvhostet backend som valgfri komponent. GitHub Pages kan ikke i sig selv skrive eller modtage data.

## Første konkrete overførsel

| Pakke | Status | Kilde og resultat |
| --- | --- | --- |
| HUPedia Edition | **Migreret, automatisk test bestået; browsertest afventer** | Originalt plugin `$:/plugins/huwiki/hupedia` (21 tiddlere), tema `$:/themes/huwiki/hupedia` (2 tiddlere) og otte redigerbare eksempel-tiddlere. Manifest i `editions/hupedia/` |
| HUWiki Trim | **Migreret som selvstændigt plugin; browsertest afventer** | Version 0.1.5, MIT-licens, tre interne tiddlere. `plugins/trim/dist/plugin.json` |
| Demo Edition | **Browsertestet** | Kontrol af boot, startup-plugin, redigering og TiddlyWikis egen Gem |

Den gamle HUPedia-kilde er bevaret i komprimeret form i `migration/hupedia-source.b64`, så pakkens oprindelse og sammensætning kan efterprøves. De normale `plugin.json`, `theme.json` og tiddlerfiler er det, assembleren faktisk bruger.

## Resterende Editions og afhængigheder

| Edition/område | Fra HUWiki-koden | Nødvendigt arbejde før Forge kan kaldes selvstændig |
| --- | --- | --- |
| AI Edition | `AIEdition.js`, `PrivateVault.js` | Flyt den eksisterende pluginpakke, og erstat alle `google.script.run`-kald til privat boks, modelkald og billedgenerering med et lokalt/browserbaseret AI-connection API. Tokens uden for tiddlere/HTML. Se `ai-connections.md` |
| Musik | `MusicEdition.js`, `MusicAsset*.js`, `MusicOfflineAssets.js` | Frigør ABC-, Musik- og SoundFont/afspillermoduler fra Drive-registret; bevar deres interne afhængigheder. Lydfonte må kun høre til backup og lokale runtime-pakker, aldrig wiki-restore |
| Tegne | `TegneEdition.js`, `TegneAsset*.js`, `TegnePackage*.js` | Rekonstruér plugin-assets og versioner, selvstændigt hostede browserbiblioteker, og test uden Apps Script |
| CutOut | `CutOutEdition.js`, `CutOutAsset*.js`, `CutOutSiteRuntime.js` | Rekonstruér plugin og runtime; fjern eventuelle serverbaserede publish-kald |
| Studio | `StudioEdition.js`, `Studio.js`, `StudioPublish.js` | Bevar lokalt design- og pluginværksted; publicering som enkelte GitHub-filer bliver en særskilt, frivillig Publisher |
| Shop | `ShopEdition.js` | Erstat eksisterende server/ordreflow med lokale skabeloner og en valgfri selvhostet modtagertjeneste til offentlige ordrer |
| Spørgeskema | `SurveyEdition.js`, `SurveyLive.js` | Erstat Forms/Sheets med lokal spørgeskemaredigering, delbare formularer og en valgfri selvhostet modtager |
| Slideshow | `SlideshowEdition.js`, `SlideshowPublishing.js` | Genbrug tiddlere og præsentationsmotor, frigør udgivelses- og eventuelle `google.script`-kald |
| AV | `AVEdition.js`, `AVWorkshopAsset.js` | Lokal afspilning/redigering først; Drive-søgning/upload skal være valgfrit eller erstattes |
| HUPin | `HUEditions.js` | Selve pluginpakken findes, men nogle eksempler kræver PasteUp-plugin fra det tidligere Drive-bibliotek. Dette skal migreres først eller vælges fra |
| PasteUp og øvrige bibliotekspakker | `PasteUpDesigns.js` plus tidligere pluginbibliotek | Find eksakte pluginbundles, som arkivet henviser til; offentliggør først efter kontrol af licenser og afhængigheder |

Ingen manglende Google-funktion må erstattes med en dummyknap eller skjult obligatorisk tredjepartstjeneste. Hvis en Edition er under migration, skal kataloget sige det tydeligt og ikke tilbyde en ubrugelig HTML-fil.

## Tildelte acceptkriterier for hver Edition

1. Assembler henter den valgte **testede** TiddlyWiki-kerne og alle deklarerede afhængigheder uden log-in.
2. Wikien kan åbnes fra lokal HTML og hovedfunktionerne virker uden netforbindelse, med undtagelse af eksplicit valgfrie nettjenester.
3. Ingen `google.script.run`, `DriveApp`, Google Forms-/Sheets-kald eller skjult Google-tvang i grundfunktionerne.
4. Både almindelige tiddlere og pluginbundles indlæses ved første opstart; væsentlige browserhandlinger testes.
5. Wikien kan redigeres og gemmes via TiddlyWikis **egen** saver; ingen private forbindelsesoplysninger følger med.
6. Plugin er versioneret, kan installeres separat og har et klart afhængigheds-/licensgrundlag.

## Kernen må ikke ændres bag om ryggen på Editions

`core/empty.html` er den version, browseren bruger. `scripts/sync-tw-core.mjs` undersøger officiel upstream og gemmer eventuelle ændringer i `core/candidate-empty.html` og `core/candidate-version.json`, **ikke** over den fastlåste kerne. En ny kerne skal testes og godkendes manuelt før opdatering.
