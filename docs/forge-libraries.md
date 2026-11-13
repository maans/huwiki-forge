# HUWiki Forge: Plugin Library og Community

Begge biblioteker leveres direkte fra [Forge på GitHub](https://github.com/maans/huwiki-forge) gennem GitHub Pages. Der kræves **ingen Google Apps Script-server, uploadservice, database, nøgle eller konto** for at browse/hente offentlige pakker.

## HUWiki Plugin Library (installerbare pakker)

Adresse: **https://forge.måns.dk/library/plugins/index.html**

- Integrerer med TiddlyWikis **eksisterende** *Kontrolpanel → Plugins → Get More Plugins*. Det officielle TiddlyWiki-pluginbibliotek bevares ved siden af.
- En fælles tiddler \`$:/config/HUWikiPluginLibrary\` med tag \`$:/tags/PluginLibrary\` og ovenstående URL er lagt i \`editions/shared/libraries.json\`. Alle Forge Editions indlæser denne ene fælles kilde gennem deres manifest.
- Den statiske \`library/plugins/index.html\` implementerer TiddlyWikis officielle \`GET\`/\`GET-RESPONSE\`-iframe-protokol for \`recipes/library/tiddlers.json\` og \`recipes/library/tiddlers/<title>.json\`. Der er **ingen** skriveendepunkter.
- \`library/plugins/registry.json\` indeholder kun kort metadata og relative stier til de **originale** \`plugins/<id>/dist/plugin.json\` og \`themes/<id>/dist/theme.json\`. Den faktiske pluginpakke hentes først, når brugeren installerer den.
- De eksisterende tredjepartslicenser, metadata, forfattere og afhængigheder overføres uden ændringer. Pakker med svære afhængigheder (f.eks. Excalidraw/React) installeres efter TiddlyWikis almindelige afhængighedsregler, ikke via skjult kode eller ekstern CDN.
- Filerne genereres fra repositoryets **faktiske** pakker med \`node scripts/build-forge-plugin-library.mjs\`. \`tests/forge-libraries.test.mjs\` kontrollerer at registrets versioner og liste stadig matcher filerne i GitHub. Ved en senere pluginopdatering skal dette indeks regenereres og committes sammen med pakken.

**Hvorfor ikke en GitHub-mappe som plugin-URL?** TiddlyWikis indbyggede bibliotek viser og installerer plugins ved hjælp af en enkel iframe-forespørgselsprotokol; et almindeligt \`github.com/.../tree/main/plugins\`-link understøtter ikke dette. Forge's statiske Pages-side er adapteren, men alle kildefiler ligger stadig i det offentlige GitHub-repository.

## HUWiki Community (Editions og offentlige wikier)

Adresse: **https://forge.måns.dk/community/**

- Community viser **Forge Editions** direkte fra \`catalog/editions.json\`, med link til manifest og \`/assembler/?edition=<id>\`. Assembler vælger den relevante Edition, som brugeren derefter selv bygger og gemmer.
- Valgfrie links til **offentligt delte brugerwikier** kan tilføjes i \`catalog/community.json\` efter ejerens tilladelse. Der er ingen automatiske private wiki-opslag, brugerupload, selvbetjening til publicering eller påstand om serverbaseret deling.
- Den fælles \`$:/config/HUWikiCommunity\` angiver Community-URL'en og et læsbart \`HUWiki Community\`-panel ligger i wikiens sidebjælke. Det har **ikke** tag \`$:/tags/PluginLibrary\`, fordi Editions ikke skal optræde som installerbare plugins.
- Teksten i TiddlyWiki følger eksisterende \`$:/language\` (dansk/engelsk). Den statiske Community-side viser dansk/engelsk efter browserens sprog, uden ekstra sprogvælger.

## Tailscale Serve/Funnel

\`Tailscale Serve\` kan give private adgangsforbindelser til en selvhostet Node/TiddlyWiki-server. \`Tailscale Funnel\` kan valgfrit udstille en offentlig URL til en sådan server, og dermed f.eks. tilbyde en levende, delt wiki. **Det er et separat projekt** fra bibliotekerne ovenfor. Sørg for korrekt adgangsstyring, før en redigerbar wiki overhovedet udstilles offentligt. Intet i Forge Library eller Community bruger Funnel som obligatorisk afhængighed.

## Status og manuel afprøvning

- CI validerer sammensætning af de fem Editions, metadata, versionssynkronisering og \`GET\`/\`GET-RESPONSE\`-protokollen.
- Kontrollér manuelt i den **downloadede** HTML-wiki på Mac/iPad: *Get More Plugins* → HUWiki Plugin Library → vælg og installer en mindre pluginpakke → Gem/genåbn wiki. Afprøv også Community-fanen og dens links til Edition Assembler.
- Gemte wikier fra **før** denne ændring opdateres ikke automatisk; byg en ny Edition eller importér den fælles biblioteks-konfiguration.
