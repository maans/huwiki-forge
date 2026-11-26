# Jazz · Swing: shared shell voicings

Swing playback plans a progression of three-note shells from the source chord
symbols, independently of the chosen comping rhythm or instrument. It evaluates
both 1–3–7 and 1–7–3 families across the whole phrase. Fifth-related roots favour
exchanging the upper roles; stepwise roots favour retaining the interval shape.
Common tones and small upper-voice movements determine the actual register.
Repeated harmonies retain their position, and candidate shells favour reachable
guitar grips on bass string 6/5 and strings 4 and 3.

For example, one possible turnaround is:

| Chord | Sounding MIDI notes | Structure |
| --- | --- | --- |
| Dm7 | D3 F3 C4 | 1–3–7 |
| G7 | G2 F3 B3 | 1–7–3 |
| Cmaj7 | C3 E3 B3 | 1–3–7 |
| C6 | C3 E3 A3 | 1–3–6 |
| Am7 | A2 G3 C4 | 1–7–3 |
| Dm7 | D3 F3 C4 | 1–3–7 |

Sixths remain sixths; plain triads do not gain a seventh. Explicit suspensions,
alterations, colours and slash bass are retained. C6 and Am7 are voiced according
to the written symbol; playback does not substitute one symbol for another.
N.C. silences the chord part. Unrecognized symbols keep their original realization.

Written rhythm heads in swing charts use the same harmonic plan as generated
backing. Only rhythm-head attacks are revoiced; melodic cues retain their notes.
Rests, tied durations, repeats and source MIDI transpositions are preserved.
Automatic rhythm-chart detection and `abc-rhythm-playback: written/off` retain
their existing meaning. A source marked `R:Swing` keeps its written guitar style
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
