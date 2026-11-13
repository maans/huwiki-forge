# Plugins

Plugins leveres som TiddlyWiki-plugin-tiddlere i JSON-format. `forge-demo` er en test, ikke en produktionsplugin. Kilder, bundling og versionering til Musik/ABC/Notice kommer senere.

Det installerbare, læsebaserede **HUWiki Plugin Library** er udgivet på [GitHub Pages](https://forge.måns.dk/library/plugins/index.html). `node scripts/build-forge-plugin-library.mjs` bygger et indeks over samtlige distribuerede `plugins/*/dist/plugin.json` og `themes/*/dist/theme.json` uden at kopiere selve pluginpakkerne. Indekset versionstestes i CI. Se [arkitekturen](../docs/forge-libraries.md).
