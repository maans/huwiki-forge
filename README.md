# HUWiki Forge

**Status: første tekniske prototype — ikke en færdig offentlig TiddlyWiki-launcher.**

HUWiki Forge skal oprette en ny, selvstændig TiddlyWiki fra en **frisk, testet og kompatibel** `empty.html` og et manifest med Editionens tiddlere og plugins. Brugeren redigerer og gemmer bagefter med TiddlyWikis **egne** funktioner. Forge bygger hverken en ny HTML-saver, backupmotor eller generel serversynkronisering.

## Første assembler-test

1. Åbn [Edition Assembler](https://maans.github.io/huwiki-forge/assembler/) fra GitHub Pages.
2. Tryk **Byg demo-Edition**. Forge forsøger selv at hente en officiel TiddlyWiki `empty.html` fra det synkroniserede Github-spejl.
3. Åbn den downloadede HTML-fil. Tiddleren *Demo: Velkommen* og JavaScript-startup-plugin skal virke ved første opstart.
4. Gem derefter den nye wiki med TiddlyWikis helt almindelige Gem-funktion.

Du skal **ikke** selv downloade `empty.html`. Det er dog stadig muligt at vælge en lokal fil i et fold-ud-felt, hvis du vil teste en bestemt version.

Den officielle kerne synkroniseres af [GitHub Actions](.github/workflows/sync-tw-core.yml). Dette er fortsat en prototype: vi har brug for en reel browsertest og test af de eksisterende Editions.

Kør automatiske enhedstests med `npm test` (Node.js 20+). Se [analysen af den gamle HUWiki-kode](docs/huwiki-source-analysis.md).

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
