# TiddlyForge

A minimal bootstrap plugin for an existing TiddlyWiki 5 wiki. It **does not install extra features** or replace the official library.

- Adds an **F** link to the existing TiddlyWiki page controls (opens https://forge.måns.dk/ in a new tab).
- Adds **Forge Plugin Library** to the regular **Control Panel → Plugins → Get More Plugins** library selector, alongside the official TiddlyWiki library.
- Uses the existing TiddlyWiki language setting for the library instructions (Danish/English).

## Installation

Download or import [plugin.json](dist/plugin.json) into an existing TiddlyWiki. Confirm the standard TiddlyWiki import, save the wiki, and use **Get More Plugins**. Select **Forge Plugin Library** to browse packages in the normal TiddlyWiki interface.

The standalone file is also served at https://forge.måns.dk/plugins/tiddlyforge/dist/plugin.json .

## Source

The two bundled tiddlers are stored in the readable [src/tiddlers.json](src/tiddlers.json). They deliberately match the corresponding entries in [editions/shared/libraries.json](../../editions/shared/libraries.json) so new Forge Editions and other TiddlyWikis behave consistently. No JavaScript modules, additional dialogs or background downloads.

Removing TiddlyForge through TiddlyWiki's normal plugin controls removes its F link and its library entry, unless a user has separately created overriding tiddlers.
