# AniMus production tools

AniMus 0.11.0-beta.2 includes production workshops and script-driven mouth animation on the existing stage and music timeline. The example productions remain separate plugins.

## Create and edit a show

Open **AniMus Forge I · Start** or the show gallery. Enter a title and choose **New show**. A new show contains an empty scene and a silent ABC score. The scene, score and film are ordinary editable tiddlers.

Open a show and use its toolbar:

| Control | Work it supports |
| --- | --- |
| Scenes | Change names, durations, backgrounds and order; add a scene. Choose whether timeline cues move with scenes. |
| Draw SVG | Draw or import SVG layers. Add, duplicate, rename, reorder, hide and lock layers. Draw freehand paths, shapes and text. |
| SVG frames | Add and duplicate drawings, see the previous frame, set frame rate and hold time, preview and loop. Save and reopen the editable drawing. |
| Music | Edit the selected ABC score with the existing graphical notation editor, piano and source editor. Import ABC. Save, cancel or save a copy. |
| Script | Edit dialogue, captions and scene notes. Bind a line to its speaking character and mouth parts, or record the selected line. |
| Audio tracks | Record or import audio, listen, retake, trim, position, duplicate, mute and set volume. |
| Site view | Prepare the selected production as an audience HTML page with play/pause, stop, timeline and full screen. |

Double-click a stage figure to edit its parts, parent joints and pivots. Double-click an animation clip to edit movement. Camera, lighting, curtains and effects remain editable tracks.

The SVG editor preserves the part's identity, parent, pivot and existing motion. It stores editable vector data and publishes ordinary CutOut image variants with step keys. It does not add a second copy of the original figure.

Recorded audio is stored as an audio tiddler. The project references the recording with start, source offset, duration, level and mute fields. Temporary blob URLs are not stored in the project. Removing a clip does not delete its source recording.

Use TiddlyWiki's Save button to save the complete wiki file. Recording asks for microphone access only after **Record** is pressed. Import is available when microphone recording is unavailable.

## Mouth animation from the script

Give a character an **open mouth** part and, optionally, a **closed mouth** part under the same figure. Ordinary CutOut shapes and SVG layers can be used. Keep the character's body, head and mouth as separate parts so the mouth can move without changing the rest of the drawing.

Open **Script**, select a line and use **Lip sync**:

1. Set the line's start and end times and enter its text, for example `ALMA: Aaaaaa.`.
2. Enable lip sync for that line. Select the speaking figure, open mouth and optional closed mouth.
3. Choose script timing, or the linked recording when one is available. Set an offset if the mouth needs to start earlier or later, and adjust the movement amount.
4. Choose **Save and return**. Scrub the timeline or press **Play** to check the mouth. Reopen the script to change the binding or disable it.

Speaker prefixes can help match lines to figures. The **Assign speaking roles** scene action offers this for multiple lines. Check the selected figure and mouth parts; explicit bindings determine which character moves. Other characters remain unchanged.

The movement is an approximation derived from the written line: vowels, consonants and punctuation provide the opening rhythm and pauses. A linked recording can supply timing, but the engine does not analyse the voice or recognise spoken phonemes. Use the timing controls to align it with a performance. The same saved binding runs in the editor and Site view, including seeking and paused previews.

Bindings are stored on the caption part as `lipSync`, separately from its geometry and animation keys. Playback changes the rendered mouth state and preserves the original drawing. For example:

```json
{
  "enabled": true,
  "target": "alma",
  "open": "alma-mouth-open",
  "closed": "alma-mouth-closed",
  "timing": "script",
  "offset": 0,
  "strength": 1
}
```

`target`, `open` and `closed` refer to part IDs in the same scene. `timing` is `script` or `auto`; `auto` uses linked narration when available and otherwise follows the script. `offset` is in seconds, with a positive value delaying the movement; `strength` ranges from 0 to 1. Lip sync is opt-in per line.

## Site view

The Site button uses the existing SitePublisher. It accepts a film tiddler or a `musical-stage` view, including the direct field references created by New show. The exported HTML includes referenced scenes, graphics, ABC scores and recorded audio; it omits authoring tools and scene notes.

The audience player uses the shared AniMus clock, CutOut renderer, mouth animation, ABC audio controller, effects and narration player. Script bindings and their mouth parts are included in the exported page. Missing music does not block the visual performance. Automatic replacement by another music synthesizer is disabled in the publication's default mode. Instrument samples still follow the existing ABC sound library configuration; this release does not bundle the entire sample bank into every site.

## Build and verify

```sh
node scripts/build-animus.mjs
node scripts/build-site-publisher.mjs
node scripts/build-forge-plugin-library.mjs
node --test tests/animus-*.test.mjs tests/site-cutout-media.test.mjs tests/site-drawing-svg.test.mjs
```

The two build scripts support `--check`. AniMus module sources live in `plugins/musical/src`. SitePublisher sources and the publication viewer live in `plugins/site-publisher/src`.

Tests exercise editable SVG round trips, generated frame playback in CutOut, recording lifecycle, audio seek/pause/overlap, scene retiming, score draft isolation, export dependencies and the shared audience clock. Mouth tests verify explicit character bindings, the real lipsync module in Site view, seek/play/pause behaviour, unchanged source shapes and a silent second character.

The browser acceptance script assembles the complete edition, creates a show through its UI, edits music, draws SVG frames, imports and trims a recording, binds a scripted line to a prepared character, saves and reopens the workshops, and plays the published Site view. Run it in an environment that supports Chrome:

```sh
npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
CHROME_BIN=/usr/bin/google-chrome ANIMUS_BROWSER_TESTS=1 node --test tests/animus-site-view.test.mjs
CHROME_BIN=/usr/bin/google-chrome node scripts/animus-browser-smoke.mjs
```

The CI browser job runs these checks and keeps screenshots and traces. Enabled browser checks fail on browser or playback errors. Real microphone quality and iPad/Safari listening still need device testing.

Automatic cue movement during scene rearrangement supports ordinary sequential scenes. If imported CutOut clips use speed changes, offsets or loops, the scene workshop disables automatic cue movement; their music and audio remain adjustable on the timeline. Video/MP4 export is outside this release.

## Dansk

Åbn AniMus-startsiden eller galleriet, skriv et navn, og vælg **Ny forestilling**. Brug **Scener**, **Tegn SVG**, **Musik**, **Manuskript**, **Lydspor** og **Sitevisning** i forestillingens værktøjslinje.

SVG-værkstedet bevarer lag, tegninger, animationsbilleder og figurens eksisterende led. Musikværkstedet bruger den eksisterende ABC-editor med en særskilt kladde, så **Annuller** bevarer det oprindelige nodeark. Lydværkstedet gemmer optagelser i wikien og placerer klippene på den fælles tidslinje.

### Læbesynkronisering

Vælg en replik i **Manuskript**. Under **Læbesynkronisering** vælger du **Aktivér for denne replik**, **Talende figur**, **Åben mund** og eventuelt **Lukket mund**. Munddelene skal høre til den valgte figur. Under **Timing** vælger du **Kun manuskriptets tider** eller **Tilknyttet indtaling, ellers manuskript**. Brug **Tidsforskydning (s)** og **Mundbevægelse (%)** til at justere resultatet, og tryk **Gem og tilbage**.

En replik som `ALMA: Aaaaaa.` kan hjælpe med at finde figuren Alma. **Fordel taleroller** hjælper med flere replikker i scenen; kontrollér figur- og mundvalgene. Læbesynkronisering aktiveres pr. replik. Figurer uden en aktiv binding bevæger ikke munden på grund af andres replikker.

Mundrytmen tilnærmes ud fra teksten. En tilknyttet indtaling kan styre timingen, men stemmen analyseres ikke. Tegningen og dens oprindelige nøglebilleder bevares, og den samme mundbevægelse følger tidslinjen både i editoren og i **Sitevisning**.

**Sitevisning** åbner den samme udgiver som ABC-nodevisningen. Publikum får forestillingen med musik, undertekster, lydeffekter og indtaling samt almindelig afspilningsbetjening. Gem hele wikien med TiddlyWikis Gem-knap for at beholde arbejdet som fil.
