# Forge Graph Edition (beta)

This Edition uses the **original** upstream graph engine, not a copied or renamed implementation.

- TW5-Graph v1.7.1 by Flibbles — https://github.com/flibbles/tw5-graph — BSD-3-Clause.
- Vis-Network v10.6.3 by Flibbles — https://github.com/flibbles/tw5-vis-network — the upstream package includes its own license and third-party notices.
- Graph Studio by HUWiki Forge — MIT, an optional styling and dependency wrapper around the two unmodified plugins.

The official GitHub release artifacts are pinned by version and SHA-256 in `scripts/build-graph-edition.mjs`. The artifacts are downloaded only **at build time** on GitHub Actions; user-facing demos and downloaded single-file wikis embed both plugins and work offline without calling GitHub.

## Data model

- Graph definitions: `$:/graph/Platon`, `$:/graph/Mindmap`, `$:/graph/Projekt`.
- Content nodes: ordinary tagged tiddlers.
- Relationships: ordinary TiddlyWiki title-list fields `symboliserer`, `fører-til`, `forudsætter`, `forbinder`.
- Node positions: JSON body of each graph tiddler, persisted by TW5-Graph's editable graph template.

The native Graph sidebar and settings are still provided by Flibbles. Forge's start pages are localized in da/en through `$:/language`. The upstream Graph controls have not been translated yet.

Test `https://forge.måns.dk/demo/?edition=graph&lang=da` and the equivalent English URL. The demo uses the same on-demand assembler as every other Edition; there is no separate generated HTML demo. Changes made in a demo must be retained with TiddlyWiki's own Save button.

## Maintenance

Run `node scripts/build-graph-edition.mjs` to verify/download the pinned upstream releases and rebuild the registry/homepage, then `npm test`. The Graph Edition workflow performs these steps on its feature branch and commits the generated files before merging.

## WikiText block-mode layout

Graph Edition's bilingual introduction and node tiddlers use HTML `<div>` and TiddlyWiki's `<$list>` widgets. **Leave a blank line after each opening tag** before WikiText headings (`!`) or numbered lists (`#`) to keep the content in block parsing mode. See the official [HTML in WikiText](https://tiddlywiki.com/static/HTML%2520in%2520WikiText.html) and [parser mode transitions](https://tiddlywiki.com/static/WikiText%2520parser%2520mode%2520transitions.html). The browser smoke test verifies rendered headings and ordered list items in Danish and English.
