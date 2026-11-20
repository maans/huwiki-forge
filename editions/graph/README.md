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

## Direct touch editor (Graph Studio)
The Graph Studio plugin provides an independent, localized `<$forge-graph-editor graph="$:/graph/Platon"/>` widget above the graph. It updates ordinary tagged tiddlers and graph relationship fields directly: **add node, add edge, choose shape, color, size, optional local SVG icon**. New nodes are tagged with the graph tiddler's `forge-node-tag`. The original Flibbles graph editor is still bundled unchanged, but its gesture-based manipulation bar is hidden in the Forge workbench to avoid duplicate controls. The Graph sidebar remains available.

A copy of the upstream standard editable template is maintained as a small Forge graph template in the Graph Studio plugin. The only relevant visual addition is a local override of the `$node.default` macro to pass `graph-shape` and `graph-size` fields to the original `<$node>` widget. Graph tiddlers opt into it via their `template` field; no global upstream macros are overridden.

## Version 0.2.0-beta.1

The first direct-edit Graph Studio controls are tested in offline Chromium on Danish and English. Node and edge changes update TiddlyWiki tiddlers directly. The per-node style draft is retained even if a graph refresh happens while changing a shape, size, color or icon. Physical iPad touch verification remains pending.

## Version 0.2.1-beta.1: contextual editing

The original Vis-Network **Add Node** and **Add Edge** toolbar buttons are visible within each graph. Graph Studio listens in the Vis-Network `vis-property` lifecycle and opens the relevant **single, compact editor panel within the graph stage**. Clicking a node opens only its appearance editor. Closing or submitting hides the panel, preserving the full graph height. The original graph/Vis-Network packages are unchanged.

## Version 0.2.2-beta.1: optional node pictures

In the compact contextual Appearance editor, users can **select any ordinary image tiddler** in the wiki (including SVG drawings exported from other drawing tools), **upload a new image** or choose **Draw / Tegn selv** for a small built-in pointer/touch SVG sketchpad. The upload accepts PNG, JPEG, GIF, WebP and simple SVG files, with a 5 MB input limit. Uploaded bitmap data is stored as base64 in an ordinary image tiddler; SVG files and simple line drawings are stored as editable SVG image tiddlers. Every imported or drawn image is locally embedded in the single-file wiki, never linked to an external URL, and may be reused by other nodes. The drawing interface is hidden until requested, with Clear and Use drawing actions; the graph itself is not resized.

Imported image tiddlers are reusable in other Forge Editions as TiddlyWiki assets. For complex drawings created in Tegne/Excalidraw, first export the drawing as SVG or PNG, then import it into Graph Studio; raw Excalidraw JSON scenes are not native graph images. Saving the wiki with TiddlyWiki's Save button retains the media; the public Forge demo does not store private uploads server-side.
