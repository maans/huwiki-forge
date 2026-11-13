# Overførsel af den eksisterende HUWiki-kode til Forge

**Kilde:** HUWiki-OAuthLab-backup.zip (132 filer). Undersøgt 13. november 2026.

Arkivet bruges som teknisk reference og grundlag for fremtidig komponentmigrering. Apps Script-koden offentliggøres ikke automatisk i Forge-repositoryet.

## Genanvendelige funktioner fra Code.js

| HUWiki-funktion | Anvendelse i Forge |
| --- | --- |
| `wikiFetchAndPinCore_` | Henter original `https://tiddlywiki.com/empty.html` og gemmer en fastlåst kopi. Forge bruger GitHub Actions i stedet for Apps Script/Drive. |
| `wikiDetectCoreVersion_` | Læser kerneversionsnummeret. Genbrugt i `scripts/sync-tw-core.mjs`. |
| `wikiInjectStore_` | Indsætter JSON stores før `<!--~~ Library modules ~~-->`. Genbrugt i `assembler/assemble.mjs`. |
| `wikiSafeStoreJson_` | Beskytter JSON indlejret i HTML mod afsluttende script-tags. Genbrugt i assembleren. |
| `wikiNewWikiPluginSeed_` | Vælger standardsprog, tema, Edition og plugin-afhængigheder. Skal senere gøres manifestbaseret. |
| `wikiBuildCombinedStoreHtml_` | Samler systemtiddlere, Edition og konfiguration før opstart. Skal fortsat opdeles i selvstændige moduler. |

## Editions i arkivet

Kilderne indeholder kode og ressourcepakker til bl.a. Music, Studio, AI, Tegne, CutOut, Shop, Survey, Slideshow, AV, HUPedia/HUPin og Trim. Nogle pakker ligger komprimeret/indlejret i JavaScript, og visse afhængigheder hentes fra et separat Drive-pluginbibliotek. Det betyder, at arkivet ikke uden videre er et færdigt GitHub-katalog af installerbare plugin-JSON-filer.

Før vi flytter en Edition, skal vi rekonstruere dens TiddlyWiki-tiddlere/pluginbundle, identificere afhængigheder og kontrollere tilladelser til videredistribution af tredjepartskomponenter. Det er ikke en antagelse om, at ZIP-filen indeholder adgangstokens.

## Kernesynkronisering og CORS

Original HUWiki bruger serverside `UrlFetchApp.fetch`, som ikke er underlagt browserens CORS-politik. Forge bruger derfor en GitHub Actions-job til at hente den officielle `empty.html` til `core/empty.html` (med kerneversion og SHA-256 i `core/versions.json`). Assembleren henter den fra sit eget domæne og bruger et GitHub-raw-spejl ved Pages-forsinkelse.

GitHub Actions' bot-commits med `GITHUB_TOKEN` starter ikke et nyt GitHub Pages-build i branch-publishing-tilstand. En senere normal commit genudgiver også den spejlede kerne, og raw GitHub-fallback er tilgængelig indtil da.

En ny version fra den officielle kilde skal behandles som **kandidat**. Inden den bruges til produktions-Editions, skal vi teste plugin-kompatibilitet og have en tilbagerulningsmulighed.

## Hvad der endnu ikke er gjort

- Ingen eksisterende Musik/Tegne/Studio-Edition er migreret eller testet i browseren.
- Ingen Publisher/Notice/Talkback er implementeret.
- Prototype-assembling og automatiske tests er ikke det samme som en gennemført browsertest af en færdig TiddlyWiki.
