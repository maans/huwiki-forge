# Turn Around — Beyond the Cave

An AI-generated English musical animation made with AniMus, freely editable as a complete TiddlyWiki project. This Forge demo demonstrates how audio recordings, music, cutout animation and drawn animation can work together, and gives users a project they can adapt with their own recordings and ideas.

The performance lasts 8 minutes and 1 second. It contains 14 scenes, 87 spoken lines, four original songs, painted Greek settings and articulated characters. The adaptation follows Plato's cave from the prisoners and shadows through the ascent, the daylight and the difficult return.

## Open and work with the demo

- **Watch the performance** opens the audience player.
- **Open in AniMus** opens the native animation and audio editor.
- **Script** opens AniMus' manuscript workshop with the actual scene captions and mouth bindings.
- **Music** opens the instrumental and vocal ABC scores.

Characters retain separate jointed limbs, heads, eyes and mouth shapes. Scenes, camera keys, captions, recordings, their timeline placement and scores remain editable. The audience player reads the native film and its edited scene sources.

Every spoken line is a separate embedded audio take. Four separately generated sung performances and fourteen instrumental recordings are also embedded. Editing words or notation does not automatically regenerate those fixed recordings; use AniMus' recording and import controls to replace or remix them.

## Media and attribution

The illustrations, writing, voices, singing, music and animation were created with AI assistance. The singing uses ACE-Step 1.5; the wiki includes provenance and source links. The musical colours are a modern interpretation inspired by lyra, kithara, aulos and frame drum, rather than a claim to reconstruct a surviving ancient performance.

The wiki's **About and credits** page contains the narrative, instrument and software sources. Included software packages retain their existing licence notices. Model weights and development environments are not included in the demo.

## Packaging

`manifest.json` composes the native AniMus, CutOut and ABC packages with the project's loose tiddlers. The source recordings are divided between three JSON files to keep each transfer manageable; the resulting wiki still contains every recording in one HTML file. All production media are local to that single-file wiki, so playing the saved performance does not call an external speech or music service.
