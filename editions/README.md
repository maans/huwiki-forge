# Forge Editions

An **Edition** is a starting configuration for a new TiddlyWiki. It selects the TiddlyWiki core, plugins, example content and settings through a `manifest.json`. It is **not** a separately maintained complete HTML file.

**For users:** [Open an Edition demo](https://forge.måns.dk/) or [customize and download one](https://forge.måns.dk/assembler/). You can deselect optional tools and example packs before download. Edit and save your new wiki with TiddlyWiki's own controls.

**For developers:** See each `editions/<id>/manifest.json` and `catalog/editions.json` for the composition and public metadata. Shared settings come from `editions/shared/libraries.json`: Forge link, Forge Plugin Library and a link to TiddlyWiki Community. Package dependencies and version compatibility are validated during composition; run `npm test` and the relevant browser smoke checks.

**Dansk:** En Edition er en opskrift på en ny wiki, ikke en færdig HTML-fil, der vedligeholdes separat. Vælg en Edition på Forge-forsiden, tilpas den om ønsket, og hent din egen redigerbare HTML-wiki.
