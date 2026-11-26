# Jazz · Swing: shared shell voicings

Swing playback plans connected guitar and piano shell progressions separately
from the source chord symbols. Both 1–3–7 and 1–7–3 families remain available.
Fifth-related roots favour exchanging upper roles; stepwise roots favour retaining
the interval shape. Guitar starts in its lower working register and favours
reachable grips on bass string 6/5 and strings 4 and 3. Piano retains its own
brighter whole-phrase path, including its independent bass register and explicit
extensions. Lowering the guitar no longer moves the piano down with it.

For example, one possible turnaround is:

| Chord | Guitar, sounding notes | Piano, sounding notes |
| --- | --- | --- |
| Dm7 | D3 F3 C4 | D3 C4 F4 |
| G7 | G2 F3 B3 | G2 B3 F4 |
| Cmaj7 | C3 E3 B3 | C3 B3 E4 |
| C6 | C3 E3 A3 | C3 A3 E4 |
| Am7 | A2 G3 C4 | A2 C4 G4 |
| Dm7 | D3 F3 C4 | D3 C4 F4 |

Sixths remain sixths; plain major/minor triads do not gain a seventh. Suspensions
and slash bass are retained. Piano adds explicit alterations and colours above
the shell; Freddie Green guitar omits these colours and plays the basic shell.
Diminished guitar chords use root, minor third and sixth (1–♭3–6 or 1–6–♭3);
piano can add the diminished fifth. C6 and Am7 are voiced according
to the written symbol; playback does not substitute one symbol for another.
N.C. silences the chord part. Unrecognized symbols keep their original realization.

Written rhythm heads in swing charts use the same harmonic plan as generated
backing. Only rhythm-head attacks are revoiced; melodic cues retain their notes.
Rests, tied durations, repeats and source MIDI transpositions are preserved.
Automatic rhythm-chart detection and `abc-rhythm-playback: written/off` retain
their existing meaning. A source marked `R:Swing`, or swing in the `Q:` tempo
label, keeps its written guitar style
even if a different backing style is selected. The tiddler field
`abc-rhythm-style: freddie-green` can also identify that written style.

For guitar programs 24–28 (zero-based GM), quarter-note runs have more low-note
weight on beats 1/3, more upper-note weight on 2/4, and restrained backbeat accents.
As an initial MIDI approximation, note gates are 62% of a quarter on 1/3 and 34%
on 2/4; tied hits and isolated or syncopated figures keep their written durations.
Beat positions follow the played measure map, including pickups. Other instruments
retain their own comping rhythm and articulation, and explicit arpeggios stay broken.

The gate/velocity settings are an approximation, not a sampled acoustic archtop or
a claim to reproduce every period of Freddie Green's playing.

Background:

- Michael Pettersen, [Distilling Big Band Guitar](https://freddiegreen.org/technique/pettersen.html).
- Tim Berens, [Basics of Freddie Green Comping](https://w.freddiegreen.org/technique/berens.html).
- Michael Pettersen, [The Short and Long of Freddie Green](https://w.freddiegreen.org/transcriptions/fromcoasttocoast.html).

Validation: `node --test tests/abc-swing-voicings.test.mjs tests/abc-rhythm-head-audio.test.mjs`.

## Rhythm and balance

Jazz · Swing piano comping uses seeded four-bar phrases with offbeats, rests,
short responses and occasional held chords. Faster swing has fewer piano attacks;
the shell positions and explicit extensions above remain the same. Written rhythm
figures keep their notated attacks. Written swing guitar voices default to 50% in the mixer. This is a real
post-render channel gain, rather than reduced MIDI velocity: articulation and
dynamic markings remain in the events, and the volume control stays adjustable.

With the form/tempo feel setting, A sections start in two-feel; B and C sections
use quarter-note walking bass and a more active double-feel ride pattern. At
160 quarter notes per minute and above, the variation setting also permits
coordinated four-bar feel changes in other sections. Explicit two/four settings
override this. Drum events are raised by 20% before the mixer's normal volume
control. The score, melody, metronome and BPM are unchanged.

Lettered P: section markers (including inline/descriptive markers) follow the
actual unfolded playback timeline through repeats and voltas. Numeric rehearsal
marks and second endings do not become B sections. Pickups and short final bars
follow their actual duration. N.C. silences the generated pitched backing.

Validation also includes `node --test tests/abc-swing-arrangement.test.mjs`.

The default opening guitar grip is fixed in the lower register before planning
voice leading across the phrase. Later harmonies cannot pull a long chart's
opening into the brighter family. A continuing register cost discourages an
unnecessary high guitar bass; an explicit starting-family choice remains valid.
For Easy Money the opening Gm7 is G2–F3–B♭3, not G3–B♭3–F4.

Rhythm-head MIDI metadata and chord-symbol click previews now use the same
arranged pitches, instrument and articulation as playback, and route through
the same voice channel gain. N.C. remains
silent on clicks too. Instrument overrides are resolved before selecting guitar
or piano shells. The browser acceptance test compares the full rendered Easy
Money chart, controller audio, note preview and chord preview in C and B♭.

Piano voice leading is independent of the lower guitar path. Across the complete
Easy Money chart its piano positions match the brighter pre-0.3.58 arrangement;
the opening piano Gm7 is G3–F4–B♭4 while guitar is G2–F3–B♭3. Browser acceptance
checks these two openings separately, the visible guitar slider at 50%, channel
gain 0.5, and the voice-bus routing of note and chord previews.

In written swing guitar charts, a regular bar of four quarter-note chord stabs
leaves the piano free to comp. A deviating written bar takes priority: piano
follows its chord attacks, syncopations, ties and rests instead of inserting a
free pattern over the figure. This uses the unfolded played measures, so repeat
endings and pickups keep their actual rhythm. Piano still uses its independent
brighter voicings. Bass and drums retain their own selected groove.
