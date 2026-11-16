# Forge plugins

**Want to use a plugin?** You do not need to download the whole GitHub repository.

1. Open a TiddlyWiki created with Forge.
2. Open **Control Panel / Kontrolpanel → Plugins → Get More Plugins / Hent flere plugins**.
3. Select **Forge Plugin Library**, choose the plugin, then install it.
4. **Save / Gem** the wiki and reload it if TiddlyWiki asks.

[Open the Forge Plugin Library](https://forge.måns.dk/library/plugins/index.html). The official TiddlyWiki plugin library remains available too. A plugin can also be selected when [building an Edition](https://forge.måns.dk/assembler/); the Assembler handles declared dependencies.

## What the repository contains

Each distributable plugin is stored as `plugins/<id>/dist/plugin.json`. Its source and any instructions are in the corresponding plugin directory. The library index is generated from the available plugin and theme packages; **not every plugin is automatically installed** when you build a wiki.

To regenerate the index after changing a package, run `node scripts/build-forge-plugin-library.mjs` from the repository root, commit the generated registry, and run `npm test`. See the [library architecture](../docs/forge-libraries.md). Plugins may retain their original internal IDs and authors even when their visible names have been simplified.

**Dansk:** Installér via TiddlyWikis **Kontrolpanel → Plugins → Hent flere plugins → Forge Plugin Library**. Gem og genindlæs wikien efter behov. Du behøver ikke hente hele GitHub-projektet.
