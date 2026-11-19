# AniMus production tools

AniMus 0.11.0-beta.3 includes production workshops, direct figure and joint editing, and script-driven mouth animation on the existing stage and music timeline. SitePublisher 0.1.16-test.3 adds audience programme and performance starting views. The example productions remain separate plugins.

## Create and edit a show

Open **AniMus Forge I · Start** or the show gallery. Enter a title and choose **New show**. A new show contains an empty scene and a silent ABC score. The scene, score and film are ordinary editable tiddlers.

Open a show and use its toolbar:

| Control | Work it supports |
| --- | --- |
| Figure / Parts and joints | Select a figure or body part directly on the stage and edit its pose at the playhead. |
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

## Edit a figure on the stage

1. Pause the performance and place the playhead at the moment you want to change.
2. Choose **Figure** and click a visible part of the character. The dashed frame selects the entire figure. Drag the figure to move it, or use its handles to resize or rotate it.
3. Choose **Parts and joints** and click an arm, leg or other body part. The smaller dashed frame and marked pivot show the selected part and its attachment. Drag a mounted limb around that point, or use the round rotation handle. Its attached children follow the movement.
4. Release the pointer to keep the change. AniMus saves a key at the current position in the relevant scene or motion loop. A loop edit applies to that beat position in each repetition. Press **Escape** during a drag to cancel it.

The CutOut studio has the same **Figure** and **Parts and joints** choices, plus a part selector and **Move**, **Rotate** and **Size** tools. Use **Undo** and **Redo** for its completed direct edits, and **Save project** to apply the draft. AniMus applies a stage drag when you release it; saving the complete wiki file remains a separate TiddlyWiki action. Site view provides audience playback without editing frames or handles.

## Mouth animation from the script

Give a character an **open mouth** part and, optionally, a **closed mouth** part under the same figure. Ordinary CutOut shapes and SVG layers can be used. Keep the character's body, head and mouth as separate parts so the mouth can move without changing the rest of the drawing.

Open **Script**, select a line and use **Lip sync**:

1. Set the line's start and end times and enter its text, for example `ALMA: Aaaaaa.`.
2. Enable lip sync for that line. Select the speaking figure, open mouth and optional closed mouth.
3. Choose script timing, or the linked recording when one is available. Set an offset if the mouth needs to start earlier or later, and adjust the movement amount.
4. Choose **Save and return**. Scrub the timeline or press **Play** to check the mouth. Reopen the script to change the binding or disable it.

Speaker prefixes can help match lines to figures. The **Assign speaking roles** scene action offers this for multiple lines. Check the selected figure and mouth parts; explicit bindings determine which character moves. **Speaking figure** is chosen separately for each spoken line or song lyric, so successive lines can belong to different characters. A binding controls only its selected figure. Other characters retain their own authored animation, including any separately animated mouth parts.

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

When opened from an AniMus production, the publisher uses controls for an audience programme:

| Control | Meaning in AniMus |
| --- | --- |
| Programme | The production's title, running time and scenes in performance order, grouped into acts when the production has them. **Open performance** opens the selected show in the preview. |
| Audience view | Settings for the audience page: its appearance, public title, whether that title is shown, the productions included and the starting view. |
| Starting view → Performance | The HTML page opens on the stage, ready for the audience to press **Play**. This is the default for one production. |
| Starting view → Programme | The HTML page opens with the programme. The audience chooses **Open performance**, then presses **Play**. This is the default when publishing several productions. |

Choose **This performance** to publish the current show, or **Performances in this wiki** to select several. A show and its underlying film appear only once. The programme presents readable production information; scene data and private scene notes are not shown as article text. Switching between the programme and the performance is also available on the exported page.

The starting view is saved into the downloaded HTML. Looking at the programme tab in the publisher is separate from choosing the exported starting view. Opening a performance does not start its sound automatically. **Download HTML** saves the prepared audience page; these settings do not alter the production's animation or recordings. In ordinary ABC publication, **Overview**, **Settings** and the **Music stand / Normal score view** choice retain their score-specific meaning.

The audience player uses the shared AniMus clock, CutOut renderer, mouth animation, ABC audio controller, effects and narration player. Script bindings and their mouth parts are included in the exported page. Missing music does not block the visual performance. Automatic replacement by another music synthesizer is disabled in the publication's default mode. Instrument samples still follow the existing ABC sound library configuration; this release does not bundle the entire sample bank into every site.

## Video export for video editors (experimental)

AniMus Video Export is a separately installable TiddlyWiki plugin (`$:/plugins/huwiki/animus-video-export`). In AniMus Forge I, it is included in the edition manifest. The plugin adds **Eksportér video / Export video** beside the transport in the editable stage, and in the published Site view when the plugin is installed at publication time. The current source remains editable and untouched.

The export panel accepts a full production, current top-level segment or exact time interval. Initial export presets are **1280 × 720 or 1920 × 1080** at **24 or 30 fps** in **H.264 MP4**, intended for import into LumaFusion or another editor. Choose from three export types:

| Export type | Result |
| --- | --- |
| MP4 with mixed audio | One video with the selected sound sources mixed to AAC. |
| Video editing package | ZIP containing a silent `video.mp4`, selected `music.wav`, `speech.wav` and `effects.wav`, optional `captions.vtt`, a timing manifest and import instructions. |
| Separate audio tracks only | The same WAV package without video. This mode does not require H.264 or AAC encoders. |

WAVs are **48 kHz stereo PCM16**. Every selected track retains the same origin, leading silence, internal pauses and duration. Source offsets, mutes, levels and fades are retained; tracks are not independently normalized. Audio is rendered in bounded chunks and serialized before the next stem, avoiding retention of three full-length floating-point buffers. The uncompressed ZIP references the finished media blobs; CRC checks read bounded slices rather than copying an entire film into another byte array.

For a selected source interval `[start, end)`, output starts at zero. Duration is rounded up to the next whole video frame; all WAVs contain the corresponding exact sample count (1,600 samples per frame at 30 fps or 2,000 at 24 fps). The last picture completes its frame and the tiny remainder after the requested end is silent in every WAV. `manifest.json` records the source range, common output duration, exact frame counts, levels and any clipping. Invalid PCM fails explicitly. Clipping is reported so source levels can be corrected before another export.

Music includes the original ABCJS sample synthesis and recordings whose `kind` is `music`. Speech includes narration, recorded singing (`song`) and ordinary unclassified recordings. Recorded `sfx`/`effects` and generated theatre cues go to the effects stem. A previously mixed recording remains intact: this exporter does not isolate vocals from accompaniment inside one file. The Turn Around film uses its existing recorded sources and respects its muted ABC scores, avoiding duplicate music. Its scoped adapter attaches the same export panel to the film's own player, preserving the current mixer settings and returning to the original paused position after export.

Editing packages default to picture without burned subtitles. Optional **WebVTT** follows the player's currently selected caption language and is rebased to the selected clip. It remains a portable sidecar or timing reference; **direct VTT import in LumaFusion has not been verified**. LumaTouch's [official supported-media list](https://luma-touch.helpscoutdocs.com/article/5-what-types-of-media-are-supported-by-lumafusion) lists WAV and MP4. Unzip in Files, import the video and desired WAVs, and place every file at the same timeline start. The native **Share** action is offered where supported, alongside ZIP and individual media downloads.

Video frames are rendered from the shared CutOut/SVG scene, at exact positions in the AniMus performance timeline. H.264 and AAC encoding use the browser's WebCodecs APIs. The original ABCJS sample synthesizer supplies the orchestra's samples; recorded audio and the existing sound-effects module are rendered offline. Audio failures do not cause automatic substitution by TinySynth. If a soundbank is unavailable, a sound export fails visibly; a user can deliberately disable the unavailable track and render a silent video.

**Current limitations:** Full MP4 export needs `VideoEncoder` and, for a mixed soundtrack, `AudioEncoder` supporting AVC/AAC. Unsupported browser/device reports an error; WAV-only export remains independent of those encoders. A short, silent calibration measures the native AAC encoder's initial delay for the selected configuration; MP4 edit lists remove that delay and trim padded audio to the picture duration. The calibration is cached for the session and fails explicitly if reliable timing cannot be established. WAV packages retain exact PCM sample counts without a codec-dependent trim. The renderer does not guarantee faster-than-realtime performance on iPad. Very long videos may exhaust memory; try a 5–10 second 720p clip first. H.264 has no alpha channel, so these exports are opaque 16:9 footage. Background art must be readable locally and embeddable in exported SVG. Native iPad/LumaFusion acceptance is still required; the export panel labels this feature experimental.

Build/check the plugin with `node scripts/build-animus-video-export.mjs` and `node scripts/build-animus-video-export.mjs --check`; tests include `node --test tests/animus-video-export*.test.mjs`. The focused browser smoke `node scripts/animus-stems-browser-smoke.mjs` renders real Web Audio with H.264/AAC APIs disabled, decodes the downloaded ZIP/WAVs independently and checks separation, gain, offsets, padding and restoration of the player position.

The `AniMus export smoke` workflow additionally runs `scripts/animus-codec-browser-smoke.mjs` with native H.264/AAC encoders and measures decoded transient positions. Its macOS job requires both codecs. `scripts/plato-export-browser-smoke.mjs` opens the actual Turn Around audience player, verifies the export dialog in fullscreen, checks the recorded stems against live mixer gains and Danish captions, then exports and decodes a five-second scene with and without audio. The workflow retains these MP4/WAV results and a self-contained `turn-around-export-test.html` for device acceptance. A Linux-only WAV pass does not count as native MP4 verification.

## Build and verify

```sh
node scripts/build-animus.mjs
node scripts/build-animus-video-export.mjs
node scripts/build-site-publisher.mjs
node scripts/build-forge-plugin-library.mjs
node --test tests/animus-*.test.mjs tests/site-cutout-media.test.mjs tests/site-drawing-svg.test.mjs
```

The two build scripts support `--check`. AniMus module sources live in `plugins/musical/src`. SitePublisher sources and the publication viewer live in `plugins/site-publisher/src`.

Tests exercise editable SVG round trips, generated frame playback in CutOut, recording lifecycle, audio seek/pause/overlap, scene retiming, score draft isolation, export dependencies and the shared audience clock. Mouth tests verify explicit character bindings, the real lipsync module in Site view, seek/play/pause behaviour, unchanged source shapes and a silent second character.

Direct-edit tests dispatch pointer gestures through the CutOut editor and use the real AniMus editor and renderers. They check figure versus limb selection, rotation under a rotated and scaled parent, a fixed joint pivot, child movement, playhead keys, nested-scene timing, cancellation, undo/redo and source save/reopen. Browser acceptance also checks the rendered selection and gestures in Chrome. Pointer support does not substitute for a native iPad/Safari device test.

Publication UI tests run the publisher's actual event handlers and HTML builder, then execute the exported navigation runtime. They cover readable programme content, both audience starting views, programme-to-performance navigation, multiple productions and the existing ABC music-stand setting.

The browser acceptance script assembles the complete edition, creates a show through its UI, edits music, draws SVG frames, imports and trims a recording, binds a scripted line to a prepared character, saves and reopens the workshops, and plays the published Site view. Run it in an environment that supports Chrome:

```sh
npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
CHROME_BIN=/usr/bin/google-chrome ANIMUS_BROWSER_TESTS=1 node --test tests/animus-site-view.test.mjs
CHROME_BIN=/usr/bin/google-chrome node scripts/animus-browser-smoke.mjs
```

The CI browser job runs these checks and keeps screenshots and traces. Enabled browser checks fail on browser or playback errors. Real microphone quality and iPad/Safari listening still need device testing.

Automatic cue movement during scene rearrangement supports ordinary sequential scenes. If imported CutOut clips use speed changes, offsets or loops, the scene workshop disables automatic cue movement; their music and audio remain adjustable on the timeline. Video/MP4 export is available through the experimental, separately installable exporter described above.

## Dansk

Åbn AniMus-startsiden eller galleriet, skriv et navn, og vælg **Ny forestilling**. Brug **Scener**, **Tegn SVG**, **Musik**, **Manuskript**, **Lydspor** og **Sitevisning** i forestillingens værktøjslinje.

SVG-værkstedet bevarer lag, tegninger, animationsbilleder og figurens eksisterende led. Musikværkstedet bruger den eksisterende ABC-editor med en særskilt kladde, så **Annuller** bevarer det oprindelige nodeark. Lydværkstedet gemmer optagelser i wikien og placerer klippene på den fælles tidslinje.

### Figurer, dele og led direkte på scenen

Sæt forestillingen på pause, og vælg tidspunktet på tidslinjen. Vælg **Figur**, og klik på figuren i scenen. Den stiplede ramme markerer hele figuren; træk for at flytte den, eller brug håndtagene til størrelse og rotation.

Vælg **Dele og led**, og klik på den arm, det ben eller den del, du vil ændre. Rammen og det markerede drejepunkt viser den valgte del og dens montering. Træk en monteret kropsdel omkring leddet, eller brug det runde drejehåndtag. Dele monteret på den følger med. AniMus gemmer ændringen som en nøgle ved tidsmarkøren, når du slipper. I en gentaget bevægelse ændres det tilsvarende tidspunkt i bevægelsens løkke. **Escape** under trækket annullerer ændringen.

I CutOut-studiet kan du også vælge delen i listen og bruge **Flyt**, **Drej** eller **Størrelse**. **Fortryd** og **Gentag** gælder de afsluttede direkte ændringer; tryk **Gem projekt** for at anvende kladden. AniMus gemmer scenetrækket ved slip. Gem hele wikien med TiddlyWikis Gem-knap for at beholde arbejdet som fil. **Sitevisning** viser forestillingen uden redigeringsrammer og håndtag.

### Læbesynkronisering

Vælg en replik i **Manuskript**. Under **Læbesynkronisering** vælger du **Aktivér for denne replik**, **Talende figur**, **Åben mund** og eventuelt **Lukket mund**. Munddelene skal høre til den valgte figur. Under **Timing** vælger du **Kun manuskriptets tider** eller **Tilknyttet indtaling, ellers manuskript**. Brug **Tidsforskydning (s)** og **Mundbevægelse (%)** til at justere resultatet, og tryk **Gem og tilbage**.

En replik som `ALMA: Aaaaaa.` kan hjælpe med at finde figuren Alma. **Fordel taleroller** hjælper med flere replikker i scenen; kontrollér figur- og mundvalgene. **Talende figur** vælges særskilt for hver replik eller sanglinje, så forskellige figurer kan skiftes til at tale eller synge. En binding styrer kun den valgte figur. Andre figurer bevarer deres egne animationer, herunder eventuelle særskilte mundnøgler.

Mundrytmen tilnærmes ud fra teksten. En tilknyttet indtaling kan styre timingen, men stemmen analyseres ikke. Tegningen og dens oprindelige nøglebilleder bevares, og den samme mundbevægelse følger tidslinjen både i editoren og i **Sitevisning**.

### Program og publikumsvisning

**Sitevisning** åbner udgiveren med valg, der passer til en musical:

| Valg | Betydning i AniMus |
| --- | --- |
| **Program** | Et læsbart program med forestillingens titel, varighed og scener i rækkefølge, opdelt i akter når forestillingen har dem. **Åbn forestillingen** åbner den valgte forestilling i forhåndsvisningen. |
| **Publikumsvisning** | Indstillinger for publikums side: **Sidens udseende**, **Publikumstitel**, visning af overskriften, forestillingerne der medtages og **Startvisning**. |
| **Startvisning → Forestillingen** | HTML-siden åbner på scenen. Publikum trykker selv **Afspil**. Det er standarden ved én forestilling. |
| **Startvisning → Programmet** | HTML-siden åbner med programmet. Publikum vælger **Åbn forestillingen** og trykker derefter **Afspil**. Det er standarden ved flere forestillinger. |

Under **Indhold** kan du vælge **Denne forestilling** eller **Forestillinger i wikien**. En forestillingsside og dens bagvedliggende film medtages kun én gang. Programmet viser forestillingens oplysninger; rå scenedata og private scenenoter vises ikke som artikeltekst. Publikum kan også gå tilbage til programmet på den udgivne side.

Valget i **Startvisning** gælder den HTML-fil, du henter. Det ændres ikke blot ved at kigge på fanen **Program** i udgiveren. Åbning af forestillingen starter ikke lyden automatisk. **Hent HTML** gemmer publikums side med musik, undertekster, lydeffekter, indtaling og afspilningsbetjening. Indstillingerne ændrer ikke forestillingens animationer eller optagelser.

Ved almindelig udgivelse af ABC-noder bevares **Overblik**, **Indstillinger** og valget mellem **Nodepult** og **Normal nodevisning**. Gem hele wikien med TiddlyWikis Gem-knap for at beholde redigeringsarbejdet som fil.
