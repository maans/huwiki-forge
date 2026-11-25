# MuseScore source catalogues

From either repertoire homepage, choose **Nodearkiv**. The overview shows counts, catalogue browsing, recent updates, metadata filters and clickable title suggestions. The existing Ian Hayden and Balkan ABC collections also provide a catalogue overview; The Session and ABCnotation link to their own browsing pages.

The two independent plugins **Akustisk Elektrisk · Nodearkiv** and **Silba Ätno · Nodearkiv** add searchable metadata for original MuseScore files. They do not install songs into the active repertoire or contain preconverted ABC. The original files are kept separately under `catalog/musescore/sources/`, addressed by SHA-256.

In ABC's collection search, choose an orchestra, search by title/composer/key/meter/instrument, and inspect **Details and versions**. One result represents one tune; the newest known source is preferred. Earlier instrument, capo and arrangement variants remain available with their dates. Select one or several sources, then open them in **MuseScore → ABC Importer**. Its existing voice/range selection, notation preview and native TiddlyWiki import review determine what is finally imported. Existing titles are handled by the native importer. Imported titles have no orchestra prefix; provenance is retained in separate fields.

Installing a catalogue makes its metadata searchable offline. Previewing a source requires a connection to fetch the selected original. Original files are fetched only after an explicit preview request; their byte count and SHA-256 are checked where WebCrypto is available. The importer converts locally in the browser. PDF import is deferred.

Sources were selected from incoming and sent mail attachments dated 2015–2026, including historical ZIP collections. The latest attachment with each normalized source filename was retained. Work-level grouping and explicit version dates avoid presenting historical filenames as independent repertoire titles. A later date is evidence of receipt of that file; it is not a claim that an older, different instrumentation has been re-edited. Contributor and composer are separate fields. User-specific mail addresses, message bodies and mail identifiers are not published.

Akustisk Elektrisk's corrected repertoire v31 of 20 May 2026 supplies the active three sets and the additional historical categories. All 36 active titles now have a MuseScore source, including **Sat** supplied from the local score folder. Sat’s download date is not presented as a verified revision date. Seven additional local versions were matched byte-for-byte to dated mail attachments; different local files without dated evidence are marked explicitly and do not replace the latest documented mail version. Other missing sources are explicitly marked in the index. Silba Ätno includes later additions, proposals and Måns's correction files, without making them active setlist entries. **Those Who Were** is excluded for the future Helles catalogue. Six MuseScore 1.x originals require re-saving in a newer MuseScore version; they remain downloadable with that compatibility note.

Build and validate:

```sh
node scripts/build-musescore-banks.mjs
node scripts/build-musescore-import.mjs
node scripts/build-abc-ui.mjs
node scripts/build-forge-plugin-library.mjs
node scripts/assemble-repertoire-source-banks.mjs
node --test tests/musescore-banks.test.mjs tests/abc-search-player.test.mjs tests/musescore-harmony.test.mjs tests/forge-libraries.test.mjs
```

The public catalogue JSON files are the reproducible metadata inputs; original binary hashes are verified by the build. `catalog/musescore/audit.json` records coverage and remaining gaps. The source inspection checked that the current converter retained all selected source notes for 388 supported files. This is structural verification, not a manual listening or engraving acceptance for every historical arrangement.

## Dansk

De to nodearkiver indeholder søgeoplysninger og henvisninger til originalfiler. Søgningen viser ét resultat pr. nummer med seneste kendte version og andre arrangementer under **Oplysninger og versioner**. Markér de ønskede numre, vælg stemmer og takter i MuseScore-importeren, kontrollér nodeeksemplet, og godkend i TiddlyWikis importliste. Ingen numre føjes automatisk til repertoire eller sætlister. Titler får ikke orkestrets navn som præfiks.

De valgte originaler hentes først ved forhåndsvisning og konverteres lokalt. PDF-noder kommer eventuelt senere og kun til numre uden MuseScore-kilde. Manglende kilder og ældre filformater vises tydeligt. Kataloget er et baggrundsarkiv; det er ikke en påstand om, at alle numre stadig er i det aktive repertoire.
