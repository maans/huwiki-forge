# Forge Edition Assembler

[Open the public Assembler](https://forge.måns.dk/assembler/) · [Back to Forge](https://forge.måns.dk/)

The Assembler creates **one editable TiddlyWiki HTML file** from an Edition and the components you select. A GitHub account is not needed.

## How to build a wiki

1. Under **1. Your starting point / Dit udgangspunkt**, select an Edition. You can give your wiki a name.
2. Under **2. Tools / Værktøjer** and **3. Content and examples / Indhold og eksempler**, keep or remove the selected packages. Under **4. Appearance / Udseende**, choose a theme.
3. Review the summary. Click **Build and download your wiki / Byg og hent din wiki**.
4. Open the downloaded HTML file, edit it in TiddlyWiki, and use its **Save / Gem** button. Keep a backup.

The Assembler automatically uses a pinned, tested TiddlyWiki core. You do **not** need to find or upload `empty.html`. The optional **Advanced / Avanceret** file picker is only for testing a different official core.

### Dependencies and limitations

Tools included in the starting Edition are checked by default, but they can be unchecked. Removing a required tool also removes the selections that depend on it. For example, you can remove the MuseScore importer **without** removing ABC notation; removing ABC also removes the importer and ABC-dependent lessons. The Assembler shows when it has adjusted your selection.

All Editions are test versions. Some features and combinations are not yet verified on every browser or device. Forge does not save your finished wiki to an online account or keep local copies synchronized.

## For maintainers

The UI is `assembler/index.html`, with selection logic in `ui.mjs` and composition in `compose.mjs` and `assemble.mjs`. It reads `catalog/editions.json`, Edition manifests and the package registry. Run `npm test` with Node.js 20+ and the relevant browser checks before publishing changes. See [homepage and build notes](../docs/forge-home.md).

**Dansk, kort fortalt:** Vælg en Edition, justér flueben og tema, klik **Byg og hent din wiki**, og gem derefter ændringer med TiddlyWikis egen **Gem**-knap. `empty.html` skal ikke hentes manuelt.
