# AniMus materials and starter scenes

Open an AniMus scene and choose **Workshops → Materials**. Search the original Kenney, RGS Dev and Glitch collections. Filter characters/cutouts, props, scenery pieces, complete background images, or face parts. Only the chosen item and its required PNG images are imported. Downloaded images and per-item author/source/license metadata stay inside the wiki and work offline. The catalogue itself contains metadata and remote previews, not every full collection.

**Kenney Starter** and **The Greek Harbour** are optional packages in Forge Plugin Library. Each contains an editable starting scene. Select it in **New show**, or open the package's start page and use **Use as new animation**. This creates a separate film, stage and score; the source template remains available for further projects.

Use **Layers ↕** beside the object selector in the editor to change depth. Frontmost elements appear at the top. Pointer drag, keyboard arrows and up/down buttons all change the same saved scene order. The drag implementation is adapted from the ABC Repertoire list: local scrolling, mouse, touch, pen, and an 8 px movement threshold. A figure's full subtree moves together. Music, camera and caption tracks keep their own timeline meaning.

## Sources

- Kenney Toon Characters 1: https://opengameart.org/content/toon-characters-1
- Kenney Background Elements Redux: https://opengameart.org/content/background-elements-redux
- RGS Dev Modular Animated Vector Characters: https://rgsdev.itch.io/free-cc0-modular-animated-vector-characters-2d
- Glitch originals: https://github.com/tinyspeck/glitch-items
- Glitch PNG conversion: https://github.com/ThirdPartyNinjas/GlitchAssets
- Greek harbour artwork and figures: the Forge Ship of Theseus production. These are marked separately as project artwork, including AI provenance; they are not relabelled CC0.

The four external sources are CC0. Mirrored images use pinned Git revisions. RGS samples are cropped from the free PNG archive, not a paid vector-source package. Their mouths are examples to align and map in the face workshop; the catalogue does not claim phonetic accuracy for the eight supplied shapes.

# Materialer og startscener

Åbn **Værksteder → Materialer** i en AniMus-scene. Søg efter figurer/cutouts, rekvisitter, kulissedele, hele baggrundsbilleder og ansigtsdele. Kun det valgte materiale og dets nødvendige PNG-filer hentes. Kilde, ophaver og licens følger med, også offline.

Startpakkerne **Kenney Starter** og **Den græske havn** indeholder hver en redigerbar prøvescene. Vælg den ved oprettelse af en ny forestilling, eller vælg **Brug som ny animation** på pakkens startside. Din animation oprettes som en selvstændig kopi.

Åbn **Lag ↕** ved editorens objektvælger. Forrest vises øverst. Træk i håndtaget, brug piletaster, eller klik op/ned. Hele figuren med alle kropsdele flyttes samlet. Træk-og-slip bygger på repertoirelistens løsning og ruller kun selve laglisten.

## Release validation · 2026-11-22

Version `0.13.0-beta.21-assets.1` passed 652 portable source tests (nine environment-specific tests skipped), catalogue/package integrity checks, and browser acceptance for template copying, keyboard/pointer layer movement, whole-background filtering and individual puppet import. The catalogue contains 1,142 entries in five collections.

Verified workflow: https://github.com/maans/huwiki-forge/actions/runs/45018044262

## Folded tracks and independent productions

The timeline shows complete root figures and props in front-to-back order. Expand a root to create its face, scene motion and child-part rows, and expand a limb to reveal its own children. Reorder root handles to change paint order while retaining their complete SVG wrappers and all local animation keys. `Layers ↕` is also available in the fixed timeline toolbar. The recordings lane initially renders one SVG overview; individual editing controls exist only when expanded.

The AniMus Edition is a small workshop with a blank/ Kenney template selector. The Greek harbour starter and the four full productions open separate demo wikis through ordinary links. They do not import their data into an existing project. The Forge homepage shows the main AniMus card; the original Turn Around and Theseus demo URLs remain valid.

Production material metadata is indexed separately from the complete shows. Selecting one item downloads its model and image dependencies. Pictures use small gallery previews. The audio category contains individually downloadable CC0 Kenney recordings, with provenance and duration, and places them on the existing audio effects lane. Speech recordings, songs, ABC scores and built-in MIDI effects are not catalogued as downloadable sound files.

## Foldbare spor og særskilte forestillinger

Tidslinjen viser hele figurer og rekvisitter, forrest øverst. Fold en række ud for at redigere ansigt, bevægelse og kropsdele. Træk i grebet for at flytte hele gruppen mellem lagene, eller brug `Lag ↕` ved tidslinjen. Indtaling og lydfiler er sammenfoldet fra starten; redigerbare klip bygges først, når sporet åbnes.

AniMus starter som et enkelt værksted. Kortene til de store forestillinger åbner hver sin wiki. Materialebiblioteket henter derimod én valgt figur, rekvisit, baggrund eller audiolydeffekt ad gangen. Taleoptagelser, sange og musiknumre er ikke med i kataloget; MIDI-effekterne er fortsat indbygget i AniMus.
