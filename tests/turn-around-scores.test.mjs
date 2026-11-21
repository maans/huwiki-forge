import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const plugin = await read('plugins/abc/dist/plugin.json');
const vendor = JSON.parse(plugin.text).tiddlers['$:/plugins/huwiki/abc/vendor/abcjs.js'];
const module = {exports: {}};
runInNewContext(vendor.text, {module});
const scores = await read('editions/turn-around/tiddlers/scores.json');
const production = await read('editions/turn-around/tiddlers/production.json');
const scenes = JSON.parse(production.find(row => row.title.endsWith('Production data')).text).scenes;
const film = JSON.parse(production.find(row => row.title.endsWith('Complete performance (film)')).text);

function parse(score) {
  const [tune] = module.exports.parseOnly(score['abc-source']);
  assert.equal(tune.warnings, undefined, score.title);
  return tune;
}

test('the film resolves all 14 instrumental guides with independent staves in concert pitch', () => {
  assert.equal(film.musical.songs.length, 14);
  for (const clip of film.musical.songs) {
    const score = scores.find(row => row.title === clip.score);
    assert.ok(score, clip.score);
    const tune = parse(score);
    const systems = tune.lines.filter(line => line.staff);
    const tracks = tune.setUpAudio({}).tracks;
    for (const {staff} of systems) {
      assert.equal(staff.length, tracks.length);
      assert.ok(staff.every(part => part.voices.length === 1), clip.score);
      assert.equal(staff[1].clef.type, 'bass');
      assert.equal(staff[2].clef.type, 'bass');
      if (staff[3]) {
        assert.equal(staff[3].clef.type, 'perc');
        assert.equal(staff[3].clef.stafflines, 1);
        assert.equal(staff[3].key.accidentals.length, 0);
      }
    }
    if (tracks[3]) {
      const drum = tracks[3].filter(event => event.cmd === 'note');
      assert.ok(drum.length && drum.every(hit => hit.instrument === 128 && [36,38].includes(hit.pitch)));
    }
    if (clip === film.musical.songs[0]) {
      assert.deepEqual(Array.from(systems, line => line.staff[0].clef.type), ['bass', 'treble', 'bass']);
      const aulos = tracks[0].filter(event => event.cmd === 'note');
      for (const [bar, pitch] of [[0,52], [1,47], [2,64], [6,52]]) {
        assert.equal(aulos.find(note => note.start === bar)?.pitch, pitch);
      }
    }
  }
});

test('the four lyric sheets keep the pitches and syllables of the vocal transcriptions', () => {
  const vocals = scores.filter(row => row.title.includes(' · Vocal score · '));
  assert.equal(vocals.length, 4);
  for (const score of vocals) {
    const scene = scenes[Number(score.title.slice(-2)) - 1];
    const expected = scene.singing[0].notes;
    const tune = parse(score);
    const sung = tune.setUpAudio({}).tracks[0].filter(event => event.cmd === 'note');
    assert.deepEqual(Array.from(sung, event => event.pitch), expected.map(note => note.midi), score.title);
    const syllables = [];
    for (const line of tune.lines.filter(line => line.staff)) {
      for (const note of line.staff[0].voices[0]) {
        if (note.lyric?.[0]?.syllable) syllables.push(note.lyric[0].syllable);
      }
    }
    assert.deepEqual(syllables, expected.map(note => note.syllable), score.title);
  }
});
