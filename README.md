# HUWiki Forge

**Status: første tekniske prototype — ikke en færdig offentlig TiddlyWiki-launcher.**

HUWiki Forge skal oprette en ny, selvstændig TiddlyWiki fra en **frisk, testet og kompatibel** `empty.html` og et manifest med Editionens tiddlere og plugins. Brugeren redigerer og gemmer bagefter med TiddlyWikis **egne** funktioner. Forge bygger hverken en ny HTML-saver, backupmotor eller generel serversynkronisering.

## Prøv Forge Assembler

Åbn **[Edition Assembler](https://maans.github.io/huwiki-forge/assembler/)** og vælg en Edition fra kataloget:

- **HUPedia Edition (test):** Den første migrerede, rigtige HUWiki Edition. Originalt HUPedia-plugin (21 interne tiddlere), eget tema (2 interne tiddlere), otte redigerbare eksempel-tiddlere og lokal konfiguration. Ingen Google-tjenester er nødvendige.
- **Demo Edition:** Den tidligere gennemprøvede opstartstest af TiddlyWiki og et startup-plugin.

Tryk **Byg Edition**. Forge henter automatisk den **fastlåste** TiddlyWiki-kerne og leverer én selvstændig HTML-fil. Du skal **ikke** selv hente `empty.html`. Åbn filen og brug TiddlyWikis indbyggede redigering og Gem-funktion.

Et valgfrit felt til en lokal `empty.html` er bevaret til versionskontrol. Den officielle upstream-kerne overvåges i GitHub Actions, men nye versioner gemmes som **kandidater** og erstatter ikke automatisk den version, Editions bruger.

**Separat plugin:** [HUWiki Trim 0.1.5](plugins/trim/dist/plugin.json) er overført med sin MIT-licens. Trim er et plugin, ikke en selvstændig Edition. I Edition Assembler kan du vælge det under **Ekstra plugins**, hvis det skal med i den nyoprettede wiki.

Kør `npm test` (Node.js 20+) for de automatiske tests. De kontrollerer nu også HUPedia-komponenter og samling mod den fastlåste kerne. Enhedstests kan ikke erstatte reel browserafprøvning.

Se [migrationsstatus og Google-uafhængighed](docs/migration-status.md), [AI Editionens forbindelsesdesign](docs/ai-connections.md) og [HUWiki-kildeanalysen](docs/huwiki-source-analysis.md).
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
