# Automatic systems in ABC scores

The common ABC renderer plans system breaks before engraving, using ABCJS's measured bar widths. Imported source text and playback are preserved. This applies to previews, existing local scores, repertoire books and PDF output, without rewriting every converted file.

## Principles

- Break at measure boundaries and aim for comparable visual density across systems. Dense notes, accidentals, chords and lyrics need more room than whole notes or rests.
- Use explicit section labels to identify musical sections. Repeated labels such as A/A/B/A still identify distinct sections. The renderer does not pretend to infer unmarked musical phrases from note pitches.
- Keep a pickup with the following full measures. Keep a short ending intact when its measured width fits. Avoid a stranded final measure when neighboring measures can be redistributed.
- Preserve manual control: numeric bar counts remain explicit overrides, and **Source line breaks** preserves the supplied systems. A genuinely oversized bar or explicitly isolated one-bar section can still require its own system.
- Screen and PDF use the same layout decisions. Written B-flat and E-flat views retain the concert score's system boundaries.

## Sources

- LilyPond 2.24, *Line breaking*: https://lilypond.org/doc/v2.24/Documentation/notation/line-breaking — measured density, permitted bar-line boundaries and manual overrides.
- LilyPond 2.24, *Spacing issues*: https://lilypond.org/doc/v2.24/Documentation/notation/spacing-issues — compare complete alternatives instead of accepting a greedy final short line.
- MuseScore Studio, *Systems and horizontal spacing*: https://handbook.musescore.org/formatting/systems-and-horizontal-spacing — required measure width, automatic systems, explicit breaks and locks.
- ABCJS, *RenderAbc options*: https://docs.abcjs.net/visual/render-abc-options — `wrap`, `lineBreaks`, and the distinction between preferred and mandatory measures per line.

## Verification

Pure layout tests cover automatic/manual modes, repeated section names, pickups, unclosed final measures and avoiding a singleton final system. Browser acceptance loads every converted leadsheet from the shared repertoire catalogue, renders concert/B-flat/E-flat layouts, and compares musical playback before and after engraving. Easy Money is a regression example, rather than a song-specific exception.
