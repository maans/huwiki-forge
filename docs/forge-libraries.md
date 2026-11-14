# TiddlyWiki Forge: Plugin Library og TiddlyWiki Community

Plugin Library leveres direkte fra [Forge på GitHub](https://github.com/maans/huwiki-forge) gennem GitHub Pages. Der kræves **ingen Google Apps Script-server, uploadservice, database, nøgle eller konto** for at browse/hente offentlige pakker.

## Plugin Library (installerbare pakker)

Adresse: **https://forge.måns.dk/library/plugins/index.html**

- Integrerer med TiddlyWikis **eksisterende** *Kontrolpanel → Plugins → Get More Plugins*. Det officielle TiddlyWiki-pluginbibliotek bevares ved siden af.
- En fælles tiddler \`$:/config/HUWikiPluginLibrary\` med tag \`$:/tags/PluginLibrary\` og ovenstående URL er lagt i \`editions/shared/libraries.json\`. Alle Forge Editions indlæser denne ene fælles kilde gennem deres manifest.
- Den statiske \`library/plugins/index.html\` implementerer TiddlyWikis officielle \`GET\`/\`GET-RESPONSE\`-iframe-protokol for \`recipes/library/tiddlers.json\` og \`recipes/library/tiddlers/<title>.json\`. Der er **ingen** skriveendepunkter.
- \`library/plugins/registry.json\` indeholder kun kort metadata og relative stier til de **originale** \`plugins/<id>/dist/plugin.json\` og \`themes/<id>/dist/theme.json\`. Den faktiske pluginpakke hentes først, når brugeren installerer den.
- De eksisterende tredjepartslicenser, metadata, forfattere og afhængigheder overføres uden ændringer. Pakker med svære afhængigheder (f.eks. Excalidraw/React) installeres efter TiddlyWikis almindelige afhængighedsregler, ikke via skjult kode eller ekstern CDN.
- Filerne genereres fra repositoryets **faktiske** pakker med \`node scripts/build-forge-plugin-library.mjs\`. \`tests/forge-libraries.test.mjs\` kontrollerer at registrets versioner og liste stadig matcher filerne i GitHub. Ved en senere pluginopdatering skal dette indeks regenereres og committes sammen med pakken.

**Hvorfor ikke en GitHub-mappe som plugin-URL?** TiddlyWikis indbyggede bibliotek viser og installerer plugins ved hjælp af en enkel iframe-forespørgselsprotokol; et almindeligt \`github.com/.../tree/main/plugins\`-link understøtter ikke dette. Forge's statiske Pages-side er adapteren, men alle kildefiler ligger stadig i det offentlige GitHub-repository.

## TiddlyWiki Community

Adresse: **https://tiddlywiki.com/#Community**

- Forge henviser til TiddlyWikis eksisterende fællesskab. Det tidligere ekstra Edition-katalog på `/community/` er erstattet med en viderestilling.
- Community har ingen `$:/tags/SideBar`-markering og vises derfor ikke som en fane i nye Editions.
- De gamle tiddlertitler `HUWiki Community` og `$:/config/HUWikiCommunity` bevares kun for kompatibilitet med gemte wikier. Deres tekst og adresse peger nu på TiddlyWiki; begge har tomme tags.
- Teksten følger TiddlyWikis `$:/language`. Plugin Library bevarer sin normale plads i pluginbiblioteket.

## Læsetilstand og eksisterende kopier

- Den fælles sidebar-tilpasning skjuler Tools via den eksisterende `$:/temp/HUWiki/AuthorReadingMode`-tilstand. Den tilføjer hverken en ny læseknap eller en ny standardtilstand.
- Hvis Tools var valgt, skifter sidepanelet til Open ved aktivering af læsetilstand. Tools vender tilbage i redigeringstilstand. Kontrolpanelet og Gem bevares.
- Allerede gemte HTML-wikier opdateres ikke automatisk. Importér den opdaterede fælles konfiguration, gem og genåbn, eller hent en ny Edition. Eksisterende indhold skal ikke overskrives.

## Tailscale Serve/Funnel

\`Tailscale Serve\` kan give private adgangsforbindelser til en selvhostet Node/TiddlyWiki-server. \`Tailscale Funnel\` kan valgfrit udstille en offentlig URL til en sådan server, og dermed f.eks. tilbyde en levende, delt wiki. **Det er et separat projekt** fra bibliotekerne ovenfor. Sørg for korrekt adgangsstyring, før en redigerbar wiki overhovedet udstilles offentligt. Intet i Forge Library eller Community bruger Funnel som obligatorisk afhængighed.

## Status og manuel afprøvning

- CI validerer sammensætning af de fem Editions, metadata, versionssynkronisering og \`GET\`/\`GET-RESPONSE\`-protokollen.
- Kontrollér manuelt i den **downloadede** HTML-wiki på Mac/iPad: *Get More Plugins* → Plugin Library → vælg og installer en mindre pluginpakke → Gem/genåbn wiki. Kontrollér at Community-fanen er væk, og at Tools skjules i læsetilstand.
- Gemte wikier fra **før** denne ændring opdateres ikke automatisk; byg en ny Edition eller importér den fælles biblioteks-konfiguration.
