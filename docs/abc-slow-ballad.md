# Slow jazz ballads

Use `R:Slow jazz ballad` to select **Jazz · Langsom ballade** when accompaniment
is set to Automatic. A manual style remains authoritative. Generic `R:Jazz ballad`
also selects this style at quarter-note tempos up to 70; the Q field's written
beat unit is respected. Slow tempo alone does not turn other genres into jazz.

The style plays quiet sustained piano harmony and upright bass at bar starts
and actual chord changes, with restrained voice leading and slash bass. Pedal
hi-hat on beats 2 and 4 supplies a quiet pulse. GM does not provide authentic
brush swishes, so this preset does not label the percussion as sampled brushes.
Variation adjusts dynamics only: it cannot introduce syncopation, walking bass,
random pushes or fills. The written melody, tempo and repeats remain unchanged.

Actual unfolded measures govern pickups, repeat endings, rests/N.C., internal
key changes and releases. Each sustained event stops before the next harmony
or bar boundary. Part levels, mute/solo and accompaniment off still apply.

`R:` is the ABC rhythm metadata field; the association with a playback preset
is a plugin feature, not a standard ABC playback instruction.
Reference: https://abcnotation.com/wiki/abc:standard:v2.1#r_rhythm

# Modulation during MuseScore import

A transposed second half may be a genuine modulation. The importer now selects
all written measures by default for both single and batch imports. A detected
transposed repetition is advisory; users can change the range explicitly.
Those Who Were is a concrete example: 38 written measures, G followed by B-flat
at written measure 20 (including the intervening pickup).
