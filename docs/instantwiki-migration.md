# InstantWiki migration

InstantWiki is a plugin (`$:/plugins/huwiki/instantwiki`) and a document-to-wiki service at `/instantwiki/`. The service is itself an editable TiddlyWiki. The home page links to it; the plugin is in the existing native Plugin Library. It uses the existing Edition Assembler and registry, not a new package system.

## Original reviewed

The original `HUWiki-OAuthLab-backup.zip / HUWiki-OAuthLab-backup/Code.js` has SHA-256 `13e42d4aceaac74deafb3d11fc0342c899e25699d469edd1e40f947328e8331c`. The 56 InstantWiki functions are preserved verbatim in `migration/instantwiki/original.js` with provenance. Readable HUWiki `Code.js` and `Wiki.html` were also inspected to understand the UI. The original `$:/Wiki/DocumentView` and `$:/Wiki/DocumentStyles` were recovered from the gzipped `PersonalAsset00.js` platform bundle (0.14.9-themes-0.1.1-design-save). Both tiddlers are preserved verbatim in `migration/instantwiki/document-view-original.json`, with bundle and excerpt checksums in provenance. The plugin reuses the original recursive renderer, temporary edit buffers, save/cancel keyboard actions and open-all StoryList action. Its Danish renderer is unchanged; the English copy translates only visible strings. No substitute document renderer was created. Author attribution remains HUWiki. The source did not declare a license; none is inferred.

Preserved behavior:

- New wiki or import into an existing wiki; document name and shared tag.
- Automatic, heading, semantic and detailed splitting, optional separate list items.
- Editable preview titles. Checked boundaries start tiddlers; unchecked boundaries merge with the preceding part without dropping text. First boundary is fixed. All suggestions / merge into one.
- Original continuous document view with recursive parent/child structure, direct section editing (heading/edges), Save/Cancel and Ctrl/⌘+Enter/Escape. The original “Open as tiddlers” action opens all parts at once in order. Collision-safe titles and `instant-*` metadata are retained.
- Sheet selection, header row, title column, tag column, content columns, automatic/rows/table modes.
- PDF text per page or original view. Optional original file retained in the wiki.

Changed deliberately:

- Local browser readers replace Google Drive upload, Google conversion and Apps Script creation. Files are not sent to Forge. Google sign-in and source folders are unnecessary.
- Public HTTPS links are fetched without credentials and require the source host to allow CORS. Private/login/CORS-blocked links have a local-file fallback. There is no hidden proxy that copies private documents.
- Import uses TiddlyWiki's native confirmation. Existing/system titles are not overwritten. New wiki creation uses the same pinned core, Edition registry, language package and F link as other Forge wikis.
- Source attachments other than PDF use a binary download type; imported HTML scripts/forms/embeds are removed. HTML text is escaped so source widgets cannot execute as TiddlyWiki commands.
- Native `$:/language` controls Danish/English. No extra language selector or saver is introduced.

## Test-release limitations

This is not a claim of complete source fidelity or full legacy parity:

- DOCX/ODT preserve main-body headings, text, lists and tables. Images are placeholders; layout, tracked changes, footnotes, comments and embedded objects are not reconstructed. Preserve the original when needed. Legacy `.doc` requires export to DOCX/PDF.
- PDF text extraction may misorder columns. No OCR. Scanned PDFs can be retained as original documents; they do not become editable recognized text.
- Spreadsheet import covers one selected sheet's displayed values. Formulas, charts and formatting are not transferred. Limits: 1,000 rows, 100 columns and 500 resulting tiddlers.
- Markdown currently preserves text and headings, not full Markdown formatting. HTML external images become placeholders.
- Files up to 20 MB, extracted text up to 5 MB, Office ZIP expansion up to 100 MB, PDFs up to 150 pages. Original attachments enlarge the resulting HTML.
- Document previews are transient. Import or create a wiki before closing the page, then use TiddlyWiki's saver. Browser/physical mobile acceptance beyond Chromium remains pending.

## Verification

`node --test tests/instantwiki.test.mjs` checks merge semantics, hierarchy after rename, safe collisions and escaped source text. `scripts/instantwiki-browser-smoke.mjs` checks Danish/English UI, actual HTML upload, blocked active content, Edition creation, native import review, native save/reopen, and offline DOCX/XLSX/CSV/PDF readers. Its own CI workflow checks reproducible package/service output before running Chromium. Record actual run and live deployment results with the release.

Local acceptance on 14 November 2026: 99 project tests passed. Chromium end-to-end tests passed for both native languages including browser first-visit selection, document-to-Shop-Edition download, save/reopen, native import confirmation, inert HTML attachments, remote HTTPS document retrieval and invalid-URL rejection. Offline reader fixtures passed for DOCX, ODT, XLSX, XLS, ODS, CSV, TSV, Markdown and text PDF, including PDF original-only mode. Manual Chrome import of a Danish garden document verified editable tiddlers and parent/child navigation. The recovered original combined view is covered by browser assertions for direct editing, cancel, keyboard save and opening every part as individual tiddlers in the original order. CI and live deployment are verified separately on the PR/deployed revision.


Follow-up acceptance on 14 November 2026 used a private 24-page PDF in both HUPedia creation and native import into a copy of an existing Shop wiki. The original Danish DocumentView was compared byte-for-byte with the archived template and is unchanged. It renders titles only for genuine heading parts; ordinary parts show their bodies, with editing through either edge. The PDF reader had incorrectly inserted synthetic page headings into the bodies: those have been removed. PDF page names remain the individual tiddler titles. Native import also now serializes custom list fields with TiddlyWiki string-list syntax, matching the original writer; without this, the open-all action split page titles at spaces. The browser regression test now checks open-all after native import, including multiword titles.

This does not restore the original PDF conversion pipeline: HUWiki converted PDFs to temporary Google Docs with OCR and then used the document structure parser, including a complexity assessment. Forge currently extracts local PDF text per page without OCR or reconstructed heading structure. That gap remains explicit; the original view alone does not imply conversion parity. The private source and resulting test wikis are not committed.
