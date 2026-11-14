# Bundled readers

All reader code is bundled in the plugin. No runtime CDN or remote conversion API.

- `jszip.js`: exact vendor text from the existing Slideshow package, JSZip 3.10.2, Stuart Knightley and contributors. MIT alternative of the upstream MIT/GPLv3 dual license. Full MIT license included.
- `pdf.js`, `pdf-worker.js`: exact CommonJS vendor text from the existing Slideshow package, PDF.js 6.4.299, Mozilla Foundation and contributors. Apache 2.0 license included. Both files must remain the matching pair; they are verified by SHA-256.
- `xlsx.js`: SheetJS Community Edition 0.20.3, downloaded from https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js . Apache 2.0 license from https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE is included unchanged.

`checksums.json` pins the exact bundled bytes. Existing embedded copyright notices are preserved. New readers do not inherit an invented HUWiki license. Original InstantWiki provenance is recorded separately in `migration/instantwiki/`.
