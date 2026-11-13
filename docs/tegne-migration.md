# HUWiki Tegne Edition – portering til Forge

Status: 13. november 2026 · **0.1.1-test.1**. Mac/iPad-browsertest mangler.

## Første testudgave

Den nye Edition i `editions/tegne/` samler den fastlåste TiddlyWiki 5.4.1, HUWiki Modern-tema, Excalidraw-editor, React-widget, HUWiki Tegne-panel og SitePublisher i én redigerbar HTML-wiki.

Panelet understøtter ny, åbn, duplikér og hent redigerbar `.excalidraw`. Det følger TiddlyWikis `$:/language` (da/en) uden ekstra sprogvælger. To nye tegninger og en artikel med `{{Farvefigurer}}` er inkluderet som tests.

## Kilder, ophav og udgaver

OAuthLabs `TegneEdition.js` definerede fire gzip/Base64-pakker: `huwiki/tegne` 1.1.0 (galleri og figurer), `itw/tw-excalidraw` 0.3.4 (HUWiki-tilpasset motor), `linonetwo/tw-react` 1.0.0 (React) og `huwiki/tegne-da` 1.0.0 (dansk). Disse blev rekonstrueret og analyseret fra brugerens originale backup.

Den første Forge-test henter **offentlig Excalidraw v0.3.0** fra [ItsTheWhales release](https://github.com/ItsTheWhale/tiddlywiki-excalidraw/releases/tag/v0.3.0), SHA-256 `798a4dd0c1019795e616830aac86e627981fa2e9de1985795c281d2872f0d6af`. React v1.0.0 er låst til commit `06276b7c5b2cc464ad4cdf94f8c3ebaaf854de55` og blob SHA `023f92ef58a6072835846fd621513346df59d680` fra samme repos installerede kilde. Reacts oprindelige MIT-licens importeres fra LinOnetwos udgivelse.

GitHub Actions kører `scripts/build-tegne-vendor.mjs`, verificerer checksums og lægger de komplette pluginpakker i Forge. Der tilføjes kun en HUWiki `huwikiExportSvg`-bro og den originale danske Excalidraw-lingo. De oprindelige tredjepartslicenser, forfatternavne og dokumentation bevares. Ingen Google- eller CDN-krav efter HTML-wikien er samlet.

**Vigtig forskel:** Den offentlige Excalidraw 0.3.0 er ikke identisk med OAuthLabs HUWiki-tilpassede 0.3.4. Det omfattende gamle HUWiki-galleri og figurbibliotek er ikke fuldt flyttet. Denne Edition er en test af tegning → redigering → SitePublisher, ikke en 1:1-portering.

## Størrelse og browseraccept

Den importerede editor alene fylder omtrent **26,6 MB** som JSON. Den færdige single-file wiki bliver betydeligt større end en tom TiddlyWiki. Der er endnu ikke gennemført manuelle browserforsøg, især ikke iPad-hukommelse og faktisk indlæsning.

Test på Mac og iPad: opret/redigér/duplikér tegninger, Gem/genåbn wiki, skift da/en via `$:/language`, eksportér `Farvefigurer` direkte og `En tegning i en artikel` gennem SitePublisher, kontroller offline SVG, transparens, skrifter og medieafhængigheder. Manglende/private filer må ikke forsvinde lydløst.

Den oprindelige HUWiki 0.3.4-motor og det originale galleri/figurbibliotek skal sammenlignes og migreres separat, med fuld licens- og regressionstest.

## Rettelser i 0.1.1-test.1

Tegne-panelets ekstra gemmeknap er fjernet. Brug TiddlyWikis eksisterende Gem-funktion. Et ugyldigt engelsk filter i redigeringspanelet er rettet; automatikken kontrollerer nu også synlige filterfejl i den rigtige browser.
