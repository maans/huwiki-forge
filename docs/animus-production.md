# AniMus production tools

AniMus 0.11.0-beta.1 adds authoring tools to the existing stage and music timeline. The example productions remain separate plugins.

## Create and edit a show

Open **AniMus Forge I · Start** or the show gallery. Enter a title and choose **New show**. A new show contains an empty scene and a silent ABC score. The scene, score and film are ordinary editable tiddlers.

Open a show and use its toolbar:

| Control | Work it supports |
| --- | --- |
| Scenes | Change names, durations, backgrounds and order; add a scene. Choose whether timeline cues move with scenes. |
| Draw SVG | Draw or import SVG layers. Add, duplicate, rename, reorder, hide and lock layers. Draw freehand paths, shapes and text. |
| SVG frames | Add and duplicate drawings, see the previous frame, set frame rate and hold time, preview and loop. Save and reopen the editable drawing. |
| Music | Edit the selected ABC score with the existing graphical notation editor, piano and source editor. Import ABC. Save, cancel or save a copy. |
| Script | Edit dialogue, captions and scene notes. Record the selected line. |
| Audio tracks | Record or import audio, listen, retake, trim, position, duplicate, mute and set volume. |
| Site view | Prepare the selected production as an audience HTML page with play/pause, stop, timeline and full screen. |

Double-click a stage figure to edit its parts, parent joints and pivots. Double-click an animation clip to edit movement. Camera, lighting, curtains and effects remain editable tracks.

The SVG editor preserves the part's identity, parent, pivot and existing motion. It stores editable vector data and publishes ordinary CutOut image variants with step keys. It does not add a second copy of the original figure.

Recorded audio is stored as an audio tiddler. The project references the recording with start, source offset, duration, level and mute fields. Temporary blob URLs are not stored in the project. Removing a clip does not delete its source recording.

Use TiddlyWiki's Save button to save the complete wiki file. Recording asks for microphone access only after **Record** is pressed. Import is available when microphone recording is unavailable.

## Site view

The Site button uses the existing SitePublisher. It accepts a film tiddler or a `musical-stage` view, including the direct field references created by New show. The exported HTML includes referenced scenes, graphics, ABC scores and recorded audio; it omits authoring tools and scene notes.

The audience player uses the shared AniMus clock, CutOut renderer, ABC audio controller, effects and narration player. Missing music does not block the visual performance. Automatic replacement by another music synthesizer is disabled in the publication's default mode. Instrument samples still follow the existing ABC sound library configuration; this release does not bundle the entire sample bank into every site.

## Build and verify

```sh
node scripts/build-animus.mjs
node scripts/build-site-publisher.mjs
node scripts/build-forge-plugin-library.mjs
node --test tests/animus-*.test.mjs tests/site-cutout-media.test.mjs tests/site-drawing-svg.test.mjs
```

The two build scripts support `--check`. AniMus module sources live in `plugins/musical/src`. SitePublisher sources and the publication viewer live in `plugins/site-publisher/src`.

Tests exercise editable SVG round trips, generated frame playback in CutOut, recording lifecycle, audio seek/pause/overlap, scene retiming, score draft isolation, export dependencies and the shared audience clock. Browser checks exercise the actual controls separately. Real microphone quality and iPad/Safari listening still need device testing.

Automatic cue movement during scene rearrangement supports ordinary sequential scenes. If imported CutOut clips use speed changes, offsets or loops, the scene workshop disables automatic cue movement; their music and audio remain adjustable on the timeline. Video/MP4 export and automatic mouth animation are outside this release.

## Dansk

Åbn AniMus-startsiden eller galleriet, skriv et navn, og vælg **Ny forestilling**. Brug **Scener**, **Tegn SVG**, **Musik**, **Manuskript**, **Lydspor** og **Sitevisning** i forestillingens værktøjslinje.

SVG-værkstedet bevarer lag, tegninger, animationsbilleder og figurens eksisterende led. Musikværkstedet bruger den eksisterende ABC-editor med en særskilt kladde, så **Annuller** bevarer det oprindelige nodeark. Lydværkstedet gemmer optagelser i wikien og placerer klippene på den fælles tidslinje.

**Sitevisning** åbner den samme udgiver som ABC-nodevisningen. Publikum får forestillingen med musik, undertekster, lydeffekter og indtaling samt almindelig afspilningsbetjening. Gem hele wikien med TiddlyWikis Gem-knap for at beholde arbejdet som fil.
