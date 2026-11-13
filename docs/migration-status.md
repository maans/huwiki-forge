# Overførsel af HUWiki Editions til Forge

Status: 13. november 2026. Dette dokument beskriver den konkrete migration af den indsendte `HUWiki-OAuthLab-backup.zip` (132 arkivposter), ikke en påstand om at alle Editions allerede er færdige.

## Ufravigeligt princip

**Alle Editions skal kunne anvendes uden Google-tjenester.** Browseren og en selvstændig TiddlyWiki er fundamentet. Eksterne tjenester kan tilbydes som valgfrie adaptere. Grundfunktioner må ikke være afhængige af Apps Script, Google Drev, Forms eller Sheets. Brugeren gemmer sin wiki med TiddlyWikis indbyggede saver.

For tjenester der kræver en server (fx modtagelse af offentlige formularbesvarelser eller onlineordrer), må Forge tilbyde en selvhostet backend som valgfri komponent. GitHub Pages kan ikke i sig selv skrive eller modtage data.

**Ny HUPedia-browsertest:** Kontroller dansk/engelsk i faktabokse, formularer, sidepanel, starter-artikler og siteundertitel. Visnings- og redigeringstiddlere bruger særskilt locale-variabel, så sprogomskiftningen ikke overtager `currentTiddler` eller ændrer felt-id’er. Test også SitePublisher og PDF Publisher: ingen synlig `\\whitespace trim`, beskrivelser i TiddlyWikis værktøjsmenu, korrekt mål-tiddler og separat Mac-download. Automatiske tests erstatter ikke browserkontrollen.

## Første konkrete overførsel

| Pakke | Status | Kilde og resultat |
| --- | --- | --- |
| HUPedia Edition | **Migreret; dansk/engelsk UI og læsbar WikiText i 0.2.4-test.1; ny browsertest mangler** | Originalt plugin `$:/plugins/huwiki/hupedia` (21 tiddlere), tema `$:/themes/huwiki/hupedia` (2 tiddlere) og otte redigerbare eksempel-tiddlere. Manifest i `editions/hupedia/`. Sprog følger `$:/language` uden ekstra knapper; datafelter og tags bevares |
| HUWiki Musik Edition | **Samlet som 0.1.0-test.1; automatiske tests bestået, ny browsertest mangler** | ABC 0.3.31-test.8, Musik 0.3.17-test.1, seks undervisningspakker, Modern-temaet, MuseScore Importer 0.1.4-beta.1 samt SitePublisher og PDF Publisher. Manifest i `editions/music/`. Ingen Google-login påkrævet for samlingen. |\n| HUWiki Trim | **Migreret; indstillinger er vist i brugerens HUPedia-browsertest** | Version 0.1.5, MIT-licens, tre interne tiddlere. `plugins/trim/dist/plugin.json` |
| Demo Edition | **Browsertestet** | Kontrol af boot, startup-plugin, redigering og TiddlyWikis egen Gem |

| HUWiki SitePublisher | **Migreret som valgfrit Forge-plugin; browsertest af nyeste version mangler** | v0.1.15-test.1, med direkte tegningsudgivelse og beskyttelse mod tom editor-eksport; CutOut-læser, indlejrede medier og Excalidraw/SVG-eksport via kompatibel tegnemotor (browsertest udestår), baseret på Musik 0.3.51, med justeret toolbar, MIT. `plugins/site-publisher/dist/plugin.json` |
| HUWiki PDF Publisher | **Migreret som valgfrit Forge-plugin; browser-test med HUPedia mangler** | v0.2.8-test.1, baseret på Musik 0.3.51, med justeret toolbar, MIT. `plugins/print-article/dist/plugin.json` |

**Udgivelsesværktøjerne er fælles; de er med i Musik Edition og valgfrie i HUPedia.** Se [udgivelsesplanen](publishers.md) for kompatibilitet med HUPedia, Musik og andre Editions. Den gamle HUPedia-site-skabelon er ikke længere en del af Forsiden; en ny tiddler forklarer udgivelsesmulighederne. Godkendte artikler filtreres endnu ikke automatisk ved eksport.

Den gamle HUPedia-kilde er bevaret i komprimeret form i `migration/hupedia-source.b64`, så pakkens oprindelse og sammensætning kan efterprøves. De normale `plugin.json`, `theme.json` og tiddlerfiler er det, assembleren faktisk bruger.

**Delte materialer:** `catalog/materials.json` indeholder 16 statiske kilder, herunder HUPedia-eksempler, seks Musik-undervisningssamlinger, pluginpakker og temaer. Det kommende Delt-panel skal hente hvert indholdselement ved behov og bruge TiddlyWikis egen importkontrol. [Se den detaljerede OAuthLab-opgørelse](oauthlab-transfer-inventory.md).\n\n## Resterende Editions og afhængigheder

| Edition/område | Fra HUWiki-koden | Nødvendigt arbejde før Forge kan kaldes selvstændig |
| --- | --- | --- |
| AI Edition | `AIEdition.js`, `PrivateVault.js` | Flyt den eksisterende pluginpakke, og erstat alle `google.script.run`-kald til privat boks, modelkald og billedgenerering med et lokalt/browserbaseret AI-connection API. Tokens uden for tiddlere/HTML. Se `ai-connections.md` |
| Musik – resterende arbejde | Nyere Musik-wiki og `MusicOfflineAssets.js` | Editionens kerne er flyttet. Test afspilning, MIDI, SoundFont, import, iPad og kompatibilitet med de seneste Musik-kilder; lydfonte må kun ligge i backup/lokal runtime og aldrig wiki-restore |
| Tegne | `TegneEdition.js`, `TegneAsset*.js`, `TegnePackage*.js` | **Første Forge-test 0.1.0-test.1 oprettet:** Offentlig Excalidraw 0.3.0 + React 1.0.0, eget HUWiki-panel og SitePublisher som offline HTML. Den gamle HUWiki-motor 0.3.4, fuldt galleri/figurbibliotek og Mac/iPad-browseraccept mangler. Se [Tegne-migration](tegne-migration.md). |
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
7. **Sprogtest er obligatorisk ved import af enhver Edition:** Alle UI-tekster, pluginbeskrivelser (`caption`, `description`), værktøjstip, knapper, indstillinger, modaler og hjælpetekster skal automatisk følge TiddlyWikis **eksisterende `$:/language`** på både dansk og engelsk. Der må **ikke** tilføjes lokale sprogvælgere eller parallelle sprogsystemer. Kontroller skiftet i samme wiki og efter gem/genåbn; tiddlernes faglige brugerindhold oversættes ikke automatisk.


## Sprogkontrol ved Edition-migration

Når vi importerer **AI, Musik, Tegne, CutOut, Studio, Shop, Spørgeskema, Slideshow, AV, HUPin** og øvrige Editions, gennemgår vi hver editions UI-tiddlere, pluginmetadata og JavaScript for hårdkodede danske tekster. Eksisterende oversættelser bevares og tilpasses TiddlyWikis sprogmekanisme. Manglende engelske tekster oversættes og afprøves, før Editionen markeres som færdig. Det gælder også fælles plugins installeret i en anden Edition, og det skal fungere uden ekstra sprogvælgerknapper. Se også [pluginstandarden](plugin-standard.md).

## Redigeringsvenlig WikiText

Ved import skal **redigeringstilstand være lige så gennemtænkt som visningstilstand**: almindelige artikler med tydelige blanklinjer, overskrifter og listepunkter i kildekoden, og ingen sprogbetingede blok-widgets i artikelens egen `text`. Ved gengivelse af felter og skabeloner skal vi bruge eksplicit **`$mode="block"`**, så TiddlyWikis overskrifter og lister bevares.

HUPedia 0.2.4-test.1 anvender den danske artikeltekst i `text` og den valgfrie engelske i `text-en`, med en separat flerslinjet editor. De fælles lokaliserings- og visningsregler ligger i systemtiddlere. Redaktionens statusoversigt bruger nu korrekt HTML-listestruktur i stedet for `<br/>` som linjeadskillelse. Udgangspunktet er stadig TiddlyWikis indbyggede sprogindstilling, uden ekstra sprogknapper.

**Browseraccept:** Kontrollér at `!`-overskrifter, `*`-lister, paragraph-blanklinjer, faktabokse, statusoversigt og redigering af `text-en` fungerer efter en ny Edition-build og efter gem/genåbn. Automatiske tests kontrollerer format og pakning, men browserrendering skal valideres separat.

## Kernen må ikke ændres bag om ryggen på Editions

`core/empty.html` er den version, browseren bruger. `scripts/sync-tw-core.mjs` undersøger officiel upstream og gemmer eventuelle ændringer i `core/candidate-empty.html` og `core/candidate-version.json`, **ikke** over den fastlåste kerne. En ny kerne skal testes og godkendes manuelt før opdatering.
