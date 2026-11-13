# HUWiki Forge

**Status: første tekniske prototype — ikke en færdig offentlig TiddlyWiki-launcher.**

HUWiki Forge skal oprette en ny, selvstændig TiddlyWiki fra en **frisk, testet og kompatibel** `empty.html` og et manifest med Editionens tiddlere og plugins. Brugeren redigerer og gemmer bagefter med TiddlyWikis **egne** funktioner. Forge bygger hverken en ny HTML-saver, backupmotor eller generel serversynkronisering.

## Første assembler-test

1. Hent `empty.html` fra https://tiddlywiki.com/empty.html til din computer.
2. Åbn `assembler/index.html` via GitHub Pages eller en lokal webserver (`python3 -m http.server` i repositoryets rod).
3. Vælg den hentede `empty.html`, og klik **Byg demo-Edition**.
4. Åbn den downloadede HTML-fil. Tiddleren *Demo: Velkommen* og det indlæste JavaScript-startup-plugin skal virke ved første opstart.
5. Gem den nye wiki med TiddlyWikis almindelige Gem-funktion.

Dette er bevidst en **separat testside**, ikke den endelige Forge-startside. Testen undgår CORS- og opdateringsproblemer ved at lade brugeren vælge den officielle `empty.html` lokalt. Senere tilføjer vi en testet, versionslåst kopi af kernen til repositoryet og flytter launcherens brugerflade ind i en rigtig TiddlyWiki.

Kør automatisk kontrol lokalt med `npm test` (Node.js 20+).

## Struktur

- `assembler/` — før-boot assembler og testside
- `editions/` — Editions-manifester og tiddlere
- `plugins/` — plugin-kilder og distributionsbundles
- `catalog/` — tilgængelige Editions
- `core/` — planlagte, testede TiddlyWiki-kerner
- `docs/` — arkitektur, sikkerhed og [projektplan v0.3](docs/projektplan-v0.3.md)
- `updates/` — kommende Notice-feed
- `admin/` — kommende GitHub Publisher

## Grundprincipper

- Ingen GitHub- eller Google-konto for almindelige brugere.
- TiddlyWikis eksisterende redigering, HTML-gemning, eksport, import og saver-funktioner genbruges.
- En Edition er et manifest, ikke en vedligeholdt monolitisk HTML-fil.
- Fork, GitHub-template og Download ZIP kan distribuere den samlede kildekode.
- Notice starter med opdateringsbeskeder; Talkback og frivilligt community kommer senere.
- Tokens og andre hemmeligheder må aldrig indgå i offentlige filer eller eksporter.

**Licens til ny Forge-kode er endnu ikke besluttet.** Tredjepartskomponenters licenser skal respekteres, før projektet frigives til videre distribution.
