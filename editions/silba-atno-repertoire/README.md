# SilbaÄtno Repertoire

A dedicated TiddlyWiki **Musik Edition** for SilbaÄtno's rehearsal repertoire, based on Henrik's provisional list of 5 November 2026.

## Open the repertoire

The landing page uses a photograph sourced from [the orchestra website](https://akustisk-elektrisk.dk/index3.html), with a link to the original. The repo does not redistribute the photo.

- [Editable Music Edition](./index.html) — 17 complete, editable ABC scores, notation, mixer and playback.
- [Audience SitePublisher view](./site/index.html) — all 17 scores in **one standalone HTML file** with navigation, notation and playback.
- [Original MuseScore files](./sources/) — the 17 exact MSCZ attachments used as sources.
- [Conversion report](./conversion-report.json) — source names, bar counts, voice counts, automatically trimmed transposed duplicates and warnings. These diagnostics live in the report, **not as repeated text beneath every score**.

The editor and audience versions link to one another. The audience Site opens the first score in the music stand (nodepult) and navigates between all 17 tunes. The editor homepage uses native WikiText-compatible HTML markup and a scoped stylesheet. The audience HTML comes from the existing HUWiki SitePublisher, not a second custom viewer or synthesizer.

## Content and programme order

The original list comprises 21 entries: 14 on the main list, two uncertain, and five currently excluded. **Seventeen** have identifiable MuseScore sources and are included here, in their existing programme order. Four without an identifiable source remain excluded: *Oh verden*, *Hjul og Stejle nr. 6*, *Dance Me to the End of Love*, and *Lulu Swing*.

The 14 main-list items are a working selection, not a confirmed concert programme; the intended 45-minute performance is expected to contain at most 12.

For each imported score the process selects all populated original staff voices (including separate chord/rest layers), preserves chord symbols where possible, and stores a documented source filename. If the importer's high-confidence fingerprint identifies a transposed duplicate second half, it omits that repeated half. Native part sources, changes of metre and repeats should still be reviewed visually.

Accompaniment is enabled per score. When the second voice uses bass clef, the mixer routes bass from that voice rather than adding an independent generated style bass. Otherwise it uses the style bass.

## Quality and rights

The 17 source files converted through the repository's existing MuseScore-to-ABC converter and both HTML builds passed the GitHub Actions build checks. This is a **beta**, not a guarantee of note-perfect conversion, and human comparison against the original scores is still needed.

Known import warnings: *Englishman in New York* has positioned-note/spacing warnings; *Hotel Nora* has percussion notation that is not yet fully supported in ABC. Automatic transposed-duplicate trimming should also be checked.

Several pieces and arrangements may be copyright-protected. Publication and reuse of scores, source attachments and arrangements require the appropriate permissions from their rights holders. The software remains subject to its respective licences.

## Rebuild

Use the documented [MuseScore importer](../../plugins/musescore-import/) and [SitePublisher](../../plugins/site-publisher/) for user editing. A GitHub Actions workflow automates import and the **existing** SitePublisher export so the two HTML files remain reproducible:

- Workflow: [Build SilbaÄtno Repertoire](../../.github/workflows/publish-silba-etno-repertoire.yml)
- Import adapter: [build-silba-etno-repertoire.mjs](../../scripts/build-silba-etno-repertoire.mjs)
- Native assembler adapter: [assemble-silba-etno-repertoire.mjs](../../scripts/assemble-silba-etno-repertoire.mjs)
- SitePublisher browser automation: [publish-silba-etno-site.mjs](../../scripts/publish-silba-etno-site.mjs)

The original tiddlers/songs.json retains the complete 21-item source mapping and is not included twice in the assembled wiki.
