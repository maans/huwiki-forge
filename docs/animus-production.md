# AniMus production tools

AniMus 0.13.0-beta.11 includes large figure and object workshops beneath the stage, facial expressions and learned mouth choices alongside production workshops, direct figure and joint editing, a captions track, preview visibility and audio controls, selection zoom, and video export on the existing stage and music timeline. SitePublisher 0.1.18-test.1 provides audience programme and performance starting views with the shared facial renderer and exporter. The example productions remain separate plugins.

## Create and edit a show

Open **AniMus Forge I · Start** or the show gallery. Enter a title and choose **New show**. A new show contains an empty scene and a silent ABC score. The scene, score and film are ordinary editable tiddlers.

In a show’s top bar, the first menu displays the active editing tool. **Workshops** opens the production editors. **View** switches between stage, score and split preview and includes focus, properties and Site view.

The editor opens in **Split**. The score and stage stay visible when you choose an editing tool. They stack when the editor is too narrow to show them side by side.

**Stage zoom** contains selection zoom and reset. Use the track selector on the timeline and **Playback options** for speed and translated caption languages when available. In the workshops, expand the character parts, facial history, caption appearance or frame timing as needed.

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
4. Release the pointer to keep the change. AniMus saves a key at the current position in the relevant scene or motion loop. A loop edit applies to that beat position in each repetition. Press **Escape** during a drag to cancel it and clear the selection.

Selecting a body part also opens the **Character** workshop beneath the stage. It shows the whole selected character, enlarged in its current animated pose. Select and drag a limb there, or use its rotation handle; the stage updates at the same time. The preview retains the character's current mirroring, joint transforms and facial choices. Opening or switching workshops creates no keys and does not change the film camera. Click an eye or mouth to switch the same area to the face workshop. **← Whole character** or the **Character** tab returns to the body and the last selected joint, unless you have cleared the selection. Clicking the head itself keeps it available for rotation around its neck joint.

Press **Escape**, tap empty space in the scene or a workshop, or use **Clear selection** to remove the editing frame and handles. The workshop stays open with the same character, pose and playhead, and keeps following the animation when you seek. Selecting another part takes one click or tap directly; you do not need to clear the old selection first. A painted backdrop is an editable object, so use empty canvas space or **Clear selection** when you want no object selected.

Clearing selection creates no key and does not erase a saved pose, facial choice or mouth mapping. In the face workshop, the cards continue to show the current choices. Switching between **Face** and **Character** keeps the editing selection empty until you choose a part again.

The CutOut studio has the same **Figure** and **Parts and joints** choices, plus a part selector and **Move**, **Rotate** and **Size** tools. Use **Undo** and **Redo** for its completed direct edits, and **Save project** to apply the draft. AniMus applies a stage drag when you release it; saving the complete wiki file remains a separate TiddlyWiki action. Site view provides audience playback without editing frames or handles.

## Edit a shadow, prop or background

Select an object on the stage or choose it in **Objects in scene**. A single vector shape, image or text object opens the **Object** workshop beneath the stage. It shows that object's current animated position and shape on a light background. Drag it to move it, or use the blue handle to rotate it. Releasing the pointer saves a key at the playhead, using the active scene's local time. **Escape** cancels an unfinished drag and clears selection; a completed edit remains saved.

Use **Properties** for numeric position, scale, rotation and opacity. To animate a new value, place the playhead where the change belongs and use **Add keyframe**, then edit its values. Existing stage handles in **Figure** mode can also resize or skew the whole object.

**Edit / replace** opens the appearance workshop with the object framed at the current scene time. Change its fill or stroke, edit its SVG drawing, or replace its artwork. **Save and return** applies the appearance change while preserving the object's identity, parent, pivot and existing animation keys. This replaces the artwork used by that source object throughout its animation; it does not create a timed appearance change. **Cancel** leaves the source untouched.

If an object's animation makes it invisible at the selected time, the live workshop explains this and offers **Show as guide**. The guide is for editing only: its visibility is never written to the source or exported. The appearance workshop similarly labels any temporary reveal. In Turn Around, the horse shadow has an invisible first frame, so opening its appearance editor no longer produces an unexplained empty canvas.

A silhouette drawn as one shape moves as one object. Independent leg, head or tail movements require separate parts and joints. An object that already has those parts uses the shared figure tools.

## Choose what you see and hear while editing

Use the **eye** beside a visual track to hide or show its contribution in the editor. Use the **speaker** beside a music, voice or effects track to mute or hear it during preview. The **Captions** track has its own eye button, so subtitles can be hidden while you work on a face or an arm. Its timed caption blocks let you jump to a line; **Open manuscript and captions** opens the text workshop.

Select a figure or body part with the dashed frame, then choose **Zoom to selection** above the stage. **Parts and joints** lets you select an individual arm, hand, head or other part before zooming. **Full screen** enlarges the editing stage, and **Reset zoom** returns to the normal preview. Press **Z** to zoom to the selection or **0** to reset. Clearing selection keeps the current preview zoom. Use **Exit full screen** to leave the enlarged stage; **Clear selection** remains available inside it.

Selection zoom also reveals the selected part when the scene's camera has moved it outside the shot. Choose an off-camera character in the object selector, then zoom to it. Resetting the zoom or exporting restores the authored scene framing.

These track buttons and selection zoom affect the editor preview only. They do not change the saved scene, film camera or export choices. Choose the video soundtrack and burned captions in **Export video**. After export, the editor returns to its previous preview settings and zoom.

## Mouth animation from the script

Give a character an **open mouth** part and, optionally, a **closed mouth** part under the same figure. Ordinary CutOut shapes and SVG layers can be used. Keep the character's body, head and mouth as separate parts so the mouth can move without changing the rest of the drawing.

Open **Script**, select a line and use **Lip sync**:

1. Set the line's start and end times and enter its text, for example `ALMA: Aaaaaa.`.
2. Enable lip sync for that line. Select the speaking figure, open mouth and optional closed mouth.
3. Choose script timing, or the linked recording when one is available. Set an offset if the mouth needs to start earlier or later, and adjust the movement amount.
4. Choose **Save and return**. Scrub the timeline or press **Play** to check the mouth. Reopen the script to change the binding or disable it.

Speaker prefixes can help match lines to figures. The **Assign speaking roles** scene action offers this for multiple lines. Check the selected figure and mouth parts; explicit bindings determine which character moves. **Speaking figure** is chosen separately for each spoken line or song lyric, so successive lines can belong to different characters. A binding controls only its selected figure. Other characters retain their own authored animation, including any separately animated mouth parts.

The movement is an approximation derived from the written line: vowels, consonants and punctuation provide the opening rhythm and pauses. A linked recording can supply timing, but the engine does not analyse the voice or recognise spoken phonemes. Use the timing controls to align it with a performance. The same saved binding runs in the editor and Site view, including seeking and paused previews.

A production can also contain prepared mouth frames with precise timing and an opening envelope, as Turn Around does. Those frames keep their existing timing when you teach the workshop a different mouth drawing. When prepared frames are bound to a particular text or recording, changing that source falls back to the text approximation until suitable timing is supplied.

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

## Face choices and the face workshop

Pause the show, choose **Parts and joints**, and click an eye or mouth on the stage or in the enlarged character workshop. The face workshop opens in the same area beneath the stage. You can also use its **Face** tab. Opening the choices changes no saved data; selecting a card creates or updates a face key at the playhead.

**Face** offers combined expressions, **Eyes** offers eye and gaze choices, and **Mouth** shows the character's own drawings. Combined expressions keep automatic speech and previously learned mouth choices. **Blink** produces one brief blink; the other eye choices remain until the next eye key. Head rotation still uses the existing neck pivot and direct manipulation.

By default, a mouth choice teaches autosync a replacement for the current letter group. For example, choose an E drawing while O is active: later O-group moments use that drawing for this character, including later scenes. Earlier frames, other groups and other characters keep their choices. **Follow script** restores the selected group's original mapping from the playhead. **More choices → Hold this mouth** explicitly holds one drawing for every sound until automatic movement is restored.

The **Face workshop** contains a large preview, the seven letter groups and their current mouth choices, and a visual history of saved face keys. Click a group before choosing its mouth; click a history entry to seek to that key. **Script** opens the associated line. The script's **Save and open face workshop** button saves the draft and returns to the speaking character. **Undo choice** reverts the last facial edit; face keys can also be moved or deleted on their own timeline track. **← Whole character** returns to the figure workshop without changing the playhead or pose.

| Group | Letters or situation |
| --- | --- |
| Rest | Spaces, punctuation and pauses |
| A | a |
| E | e, i, y, æ |
| O | o, u, å, ø |
| F | f, v |
| Lips together | m, b, p |
| Other consonants | Remaining consonants |

The groups follow the existing text approximation or prepared mouth frames; they are not recognised audio phonemes. The artwork and layer names determine the available facial controls. Choices are stored in `film.musical.faceKeys` using global performance seconds and a stable actor ID. Each channel is held independently, and learned mappings accumulate per group. The editor, ordinary audience player, Site view and video renderer all use the same rules. Scene rearrangement moves face keys when **Move music, audio and stage cues with scenes** is enabled.

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

## Video export in the ordinary demo

The AniMus and Turn Around edition manifests both include the independently installable `animus-video-export` plugin. The normal `/demo/?edition=turn-around&lang=da` route builds the audience player and native editor with the same exporter. Previous `/previews/animus-export/` links redirect to this demo, retaining the requested language and tiddler location.

**Export video / Eksportér video** opens a single file list: MP4 video, music WAV, speech/singing WAV, effects WAV and WebVTT captions. Every checked item is created as a downloadable file. Each completed row has its own download arrow; multiple selected files can be downloaded together as a ZIP. Separate controls choose the MP4 soundtrack and whether its picture includes burned captions. Selecting a WAV or VTT file does not change the MP4 content.

Completed files are reused within the current player session. Adding another file creates only missing or changed content. Closing the dialog preserves its settings and ready files; cancellation or an error retains earlier completed downloads. Reloading the page or destroying the player clears this temporary cache.

Video is opaque 16:9 H.264 MP4 at 720p or 1080p and 24 or 30 fps. Mixed MP4 audio uses AAC; independent WAV stems are stereo PCM16 at 48 kHz. All exported files share the selected source interval and output origin. Audio keeps its offsets, mutes, levels, fades, leading silence and internal pauses. The output interval is padded to a complete video frame, with silence after the requested audio end. Export uses the original recordings, original ABC sample engine and existing theatre effects; unavailable audio does not trigger an alternative synthesizer.

MP4 creation requires browser AVC support and AAC support when sound is included. WAV and caption files remain independently selectable. Native codec support and iPad/LumaFusion behavior require device acceptance; the code does not assume that a browser on every platform supports these codecs. Caption files use the selected player language and are rebased to the exported interval.

The editor's export lifecycle temporarily restores the performance view before rendering, then returns to the original paused position. The scoped Turn Around adapter reads the current canonical film and live mixer without saving a second timeline. The exporter also appears in SitePublisher output when the optional plugin is installed while publishing.

`animus-export-smoke.yml` checks the ordinary demo route, default composition, player-to-editor transition, delayed ABC startup, current captions and recorded stems. Its Linux and macOS browser jobs retain exported files and screenshots; the macOS job requires native H.264/AAC and checks decoded audio timing. Unit tests cover independent downloads, reuse, cancellation, source-change invalidation, sample alignment and the audience-player adapter.

## Build and verify

```sh
node scripts/build-animus.mjs
node scripts/build-animus-video-export.mjs
node scripts/build-site-publisher.mjs
node scripts/build-turn-around-player.mjs
node scripts/build-forge-plugin-library.mjs
node --test tests/animus-*.test.mjs tests/site-cutout-media.test.mjs tests/site-drawing-svg.test.mjs
```

The plugin and Turn Around runtime build scripts support `--check`. AniMus module sources live in `plugins/musical/src`. SitePublisher sources and the publication viewer live in `plugins/site-publisher/src`. Turn Around's normal lip-sync tiddler is kept byte-identical to the shared source, so it cannot override new editor features with an older runtime.

Tests exercise editable SVG round trips, generated frame playback in CutOut, recording lifecycle, audio seek/pause/overlap, scene retiming, score draft isolation, export dependencies and the shared audience clock. Mouth tests verify explicit character bindings, the real lipsync module in Site view, seek/play/pause behaviour, unchanged source shapes and a silent second character.

Direct-edit tests dispatch pointer gestures through the CutOut editor and use the real AniMus editor and renderers. They check figure versus limb selection, rotation under a rotated and scaled parent, a fixed joint pivot, child movement, playhead keys, nested-scene timing, cancellation, undo/redo and source save/reopen. Browser acceptance also checks native Escape, empty-space touches, direct reselection, cancellation during rotation, retained face choices and unchanged sources in Chrome. Pointer support does not substitute for a native iPad/Safari device test.

Publication UI tests run the publisher's actual event handlers and HTML builder, then execute the exported navigation runtime. They cover readable programme content, both audience starting views, programme-to-performance navigation, multiple productions and the existing ABC music-stand setting.

The browser acceptance script assembles the complete edition, creates a show through its UI, edits music, draws SVG frames, imports and trims a recording, binds a scripted line to a prepared character, saves and reopens the workshops, and plays the published Site view. Run it in an environment that supports Chrome:

```sh
npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
CHROME_BIN=/usr/bin/google-chrome ANIMUS_BROWSER_TESTS=1 node --test tests/animus-site-view.test.mjs
CHROME_BIN=/usr/bin/google-chrome node scripts/animus-browser-smoke.mjs
CHROME_BIN=/usr/bin/google-chrome node scripts/animus-figure-browser-smoke.mjs
```

The CI browser job runs these checks and keeps screenshots and traces. Enabled browser checks fail on browser or playback errors. Real microphone quality and iPad/Safari listening still need device testing.

Automatic cue movement during scene rearrangement supports ordinary sequential scenes. If imported CutOut clips use speed changes, offsets or loops, the scene workshop disables automatic cue movement; their music and audio remain adjustable on the timeline. Video/MP4 export is available through the separately installable exporter described above.

## Dansk

Åbn AniMus-startsiden eller galleriet, skriv et navn, og vælg **Ny forestilling**. Den første menu viser det aktive værktøj. Under **Værksteder** finder du **Manuskript**, **Scener**, **Tegn SVG**, **Musik** og **Lydspor**. Under **Visning** vælger du scene, noder eller delt visning. Her finder du også fokusvisning, egenskaber og sitevisning.

Editoren starter i **Delt visning**. Noder og scene forbliver synlige, når du vælger et redigeringsværktøj. De står under hinanden, hvis editoren er for smal til at vise dem side om side.

**Scenezoom** samler zoom til markering og nulstilling. Vælg sporgruppe direkte på tidslinjen. **Afspilningsvalg** samler hastighed og undertekstsprog, når der findes oversættelser. I værkstederne kan du folde figurens dele, ansigtshistorik, underteksternes udseende og billedtiming ud efter behov.

SVG-værkstedet bevarer lag, tegninger, animationsbilleder og figurens eksisterende led. Musikværkstedet bruger den eksisterende ABC-editor med en særskilt kladde, så **Annuller** bevarer det oprindelige nodeark. Lydværkstedet gemmer optagelser i wikien og placerer klippene på den fælles tidslinje.

### Figurer, dele og led direkte på scenen

Sæt forestillingen på pause, og vælg tidspunktet på tidslinjen. Vælg **Figur**, og klik på figuren i scenen. Den stiplede ramme markerer hele figuren; træk for at flytte den, eller brug håndtagene til størrelse og rotation.

Vælg **Dele og led**, og klik på den arm, det ben eller den del, du vil ændre. Rammen og det markerede drejepunkt viser den valgte del og dens montering. Træk en monteret kropsdel omkring leddet, eller brug det runde drejehåndtag. Dele monteret på den følger med. AniMus gemmer ændringen som en nøgle ved tidsmarkøren, når du slipper. I en gentaget bevægelse ændres det tilsvarende tidspunkt i bevægelsens løkke. **Escape** under trækket annullerer ændringen og slipper markeringen.

Når du vælger en kropsdel, åbner **Figurværkstedet** under scenen. Her vises hele den valgte figur stort i dens aktuelle pose, inklusive spejling, led og ansigtsudtryk. Vælg og træk kropsdelene direkte i værkstedet, eller brug drejehåndtaget; ændringen vises samtidig i scenen. Tryk på et øje eller munden for at skifte samme område til ansigtsværkstedet. **← Hele figuren** eller fanen **Figur** fører tilbage til figuren og det senest valgte led, medmindre du har sluppet markeringen. Tryk på selve hovedet for at vippe det omkring halsleddet. Åbning og skift mellem værkstederne ændrer hverken nøglebilleder, tidsmarkør eller filmens kamera.

Brug **Escape**, tryk på tom plads i scenen eller værkstedet, eller vælg **Slip markering** for at fjerne rammen og håndtagene. Værkstedet bliver åbent med samme figur, pose og tidspunkt. Du kan vælge en anden kropsdel direkte med ét tryk; du behøver ikke slippe den gamle markering først. En tegnet kulisse er selv et objekt, så brug tom plads omkring billedet eller **Slip markering**, når intet skal være valgt.

At slippe markeringen opretter ingen nøglebilleder og sletter hverken gemte positurer, ansigtsudtryk eller mundvalg. Kortene i ansigtsværkstedet viser fortsat de gældende valg. Skift mellem **Ansigt** og **Figur** bevarer den tomme markering, indtil du vælger en del igen.

I CutOut-studiet kan du også vælge delen i listen og bruge **Flyt**, **Drej** eller **Størrelse**. **Fortryd** og **Gentag** gælder de afsluttede direkte ændringer; tryk **Gem projekt** for at anvende kladden. AniMus gemmer scenetrækket ved slip. Gem hele wikien med TiddlyWikis Gem-knap for at beholde arbejdet som fil. **Sitevisning** viser forestillingen uden redigeringsrammer og håndtag.

### Vælg, hvad du ser og hører under redigering

Brug **øjet** ved et visuelt spor til at skjule eller vise dets indhold i editoren. Brug **højttaleren** ved musik, indtaling eller lydeffekter til at slå lyden fra eller til i forhåndsvisningen. Sporet **Undertekster** har sit eget øje, så teksten kan skjules, mens du arbejder med et ansigt eller en arm. Klik på en undertekstblok for at gå til den replik; **Åbn manuskript og undertekster** åbner tekstværkstedet.

Markér en figur eller kropsdel med den stiplede ramme, og vælg **Zoom til markering** over scenen. Med **Dele og led** kan du vælge eksempelvis arm, hånd eller hoved, før du zoomer. **Fuld skærm** forstørrer redigeringsscenen, og **Nulstil zoom** går tilbage til den normale forhåndsvisning. Tryk **Z** for at zoome til markeringen eller **0** for at nulstille. Når du slipper markeringen, bevares zoom. Brug **Forlad fuld skærm** til at forlade den store visning; **Slip markering** kan også bruges inde i den.

Zoom til markering viser også den valgte kropsdel, når scenens kamera har flyttet den uden for billedet. Vælg en figur uden for billedet i objektvælgeren, og zoom til den. Nulstilling af zoom og eksport gendanner scenens oprindelige billedudsnit.

Sporknapperne og zoom gælder kun editorens forhåndsvisning. De ændrer ikke den gemte scene, filmens kamera eller eksportvalgene. Vælg videoens lyd og indbrændte undertekster i **Eksportér video**. Efter eksport vender editoren tilbage til de tidligere visningsvalg og zoom.

### Ansigtsudtryk og ansigtsværksted

Sæt filmen på pause, vælg **Dele og led**, og klik på et øje eller munden i scenen eller figurværkstedet. Ansigtsværkstedet åbner i samme område under scenen; du kan også vælge fanen **Ansigt**. Klik på et billede for at gemme et nøglebillede ved tidsmarkøren. **Ansigt** vælger samlede udtryk, **Øjne** vælger blik eller øjenstilling, og **Mund** viser figurens mundtegninger. Et ansigtsudtryk bevarer automatisk tale og dine tilpassede mundvalg.

Et mundvalg lærer som udgangspunkt autosync, hvilken tegning du ønsker til den aktuelle bogstavgruppe. Valget gælder fra tidsmarkøren for samme figur, også i senere scener. Tidligere billeder og andre bogstavgrupper bevares. **Følg manuskript** gendanner den valgte gruppes oprindelige mundvalg. **Flere valg → Hold denne mund** fastholder én mund, indtil du slår automatisk mundbevægelse til igen.

**Ansigtsværksted** viser ansigtet større, alle bogstavgrupper med deres mundvalg og en billedoversigt over gemte ansigtsvalg. Klik på en gruppe for at vælge dens mund, eller klik på et tidligere valg for at gå til dets tidspunkt. **Manuskript** åbner replikken; **Gem og åbn ansigtsværksted** fører tilbage til den talende figur. **Fortryd valget** fortryder ansigtsændringen. Nøglebillederne har deres eget spor, hvor de kan flyttes og slettes. **← Hele figuren** fører tilbage til figurværkstedet med samme tidspunkt og pose.

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
