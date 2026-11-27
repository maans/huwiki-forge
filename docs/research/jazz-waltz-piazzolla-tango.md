# Jazz waltz and Piazzolla tango accompaniment

Implemented in ABC Musik 0.3.65 (27 November 2026).

## Musical basis

Jazz waltz uses three quarter-note ride pulses, a light triplet skip after beat two, pedal hi-hat on beats two and three, and feathered bass drum on one. Walking bass plays three quarters per full bar. Piano uses short, lightly swung comping cells with voice leading. The original melody is not automatically swung or rewritten.

Piazzolla-inspired nuevo tango uses eight subdivisions grouped 3+3+2, with accented bass ostinato and short piano chords on subdivisions 1, 4 and 7. At variation 50% or higher, every fourth complete bar can change to four marcato bass attacks while chords retain 3+3+2. The default has no drum kit: its percussive articulation comes from bass and piano. Users can select percussion separately. This is a practical accompaniment preset, not a transcription or simulation of a particular Piazzolla recording or its expressive rubato.

The pattern is normalized to the written bar: eighths in 4/4 or 2/2, sixteenths in 2/4. Both grooves follow actual unfolded bars, pickups, voltas, chord changes and N.C.; generated note releases are clipped at harmony or bar boundaries. Tango bass respects slash chords and concert transposition. Seeded variation is repeatable.

## Selection

- `R:Jazz waltz`, `R:Jazzvals`, jazz genre/origin plus 3/4, or legacy `style:swing` in 3/4: `jazzwaltz`.
- Ordinary 3/4 waltz stays `waltz` without jazz metadata.
- Tango/Piazzolla style metadata, or a Libertango/Piazzolla identity, in 4/4, 2/4 or 2/2: `piazzolla-tango`.
- Style metadata includes `abc-rhythm`, `abc-style`, `abc-genre`, `repertoire-style` and `repertoire-genre`.
- Manual style choices remain available. Auto selection never enables accompaniment by itself.
- Helles' Libertango is tagged Tango nuevo and set to automatic style. Bluesette's inherited 4/4 swing selection is migrated to automatic style with Jazz waltz genre.

## Research sources

- *Standard of Excellence Jazz Ensemble Method*, drums, “Where Do We Go From Here?”, pp.34–35: three-beat ride, pedal hi-hat 2/3, feathered bass drum 1 and restrained swing. https://cdnsm5-ss5.sharpschool.com/UserFiles/Servers/Server_3013453/File/SOE_Jazz_-_Drums.pdf
- Mark Letalien, *Jazz Drumming – Playing in 3/4 Time*, Drums Anytime, 2014: ride pattern and independent pedal hi-hat. https://www.youtube.com/watch?v=eCGKUtj7CY8
- Camilo Martínez, *La interpretación de la batería en el tango*, Universidad Nacional de Cuyo, §2.1.9 “Acompañamiento base 332”: accents on first, fourth and seventh eighths; identifies Libertango as an example. https://bdigital.uncuyo.edu.ar/objetos_digitales/21662/martinez-camilo-tesis.pdf
- Sarah L. Cosano, *Transcribing Astor Piazzolla’s Works to Maximize Stylistic Fidelity*, University of Nebraska–Lincoln, 2019: original scores/recordings as stylistic references, including Libertango. https://digitalcommons.unl.edu/musicstudent/147/

The fixed cells, phrase variation and instrument defaults above are implementation decisions informed by these sources; they are not presented as the only valid performance practice.
