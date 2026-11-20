import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJSON = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const production = await readJSON('editions/turn-around/tiddlers/production.json');
const originals = new Map((await readJSON('tests/fixtures/turn-around-authored-scores.json')).map(row => [row.title, row]));

test('all fourteen scores preserve the authored notes and rhythm while keeping each instrument on its own staff', async () => {
  const pkg = await readJSON('plugins/abc/dist/plugin.json');
  const vendor = JSON.parse(pkg.text).tiddlers['$:/plugins/huwiki/abc/vendor/abcjs.js'].text;
  const module = {exports: {}};
  new Function('module', 'exports', vendor)(module, module.exports);
  const ABC = module.exports;
  const voices = abc => new Map([...abc.matchAll(/\[V:([A-Z])\]\n([\s\S]*?)(?=\[V:|$)/g)].map(match => [match[1], match[2]]));
  const tokens = body => body.replace(/\s+/g, '').replace(/\|\|\]/g, '|]');
  const notes = track => track.filter(event => event.cmd === 'note').map(({startChar, endChar, ...event}) => event);
  // Isolating a voice renumbers its output channel; its instrument program
  // must still match the corresponding staff in the complete score.
  const programs = track => track.filter(event => event.cmd === 'program').map(({channel, ...event}) => event);
  const scores = production.filter(row => /^Turn Around · Score · \d/.test(row.title));
  assert.equal(scores.length, 14);
  for (const row of scores) {
    const before = originals.get(row.title)['abc-source'];
    const after = row['abc-source'];
    const beforeVoices = voices(before), afterVoices = voices(after);
    assert.deepEqual([...afterVoices.keys()], [...beforeVoices.keys()], row.title);
    for (const [voice, body] of beforeVoices) {
      assert.equal(tokens(afterVoices.get(voice)), tokens(body), row.title + ' changes authored notes in ' + voice);
    }
    const tune = ABC.parseOnly(after)[0];
    assert.deepEqual(tune.warnings || [], [], row.title);
    const systems = tune.lines.filter(line => line.staff);
    assert.ok(systems.length > 1, row.title);
    for (const system of systems) {
      assert.equal(system.staff.length, 5, row.title + ' has a missing instrument in a later system');
      assert.ok(system.staff.every(staff => staff.voices.length === 1), row.title);
      const drum = system.staff[4];
      assert.equal(drum.clef.type, 'perc', row.title);
      for (const note of drum.voices[0].filter(event => event.pitches)) {
        assert.ok(note.pitches.every(pitch => pitch.verticalPos >= 0 && pitch.verticalPos <= 8), row.title + ' has drum ledger lines');
      }
    }
    const audio = tune.setUpAudio();
    assert.equal(audio.tracks.length, 5, row.title);
    const header = before.split('%%score')[0];
    // Parse each original part independently: the old combined layout lost the
    // empty S staff on later lines and incorrectly routed later drum notes to S.
    for (const [index, voice] of ['A', 'L', 'K', 'S', 'D'].entries()) {
      const definition = before.match(new RegExp('^V:' + voice + ' [^\\n]*\\n(?:%%[^\\n]*\\n)*', 'm'))?.[0];
      assert.ok(definition, row.title + ' ' + voice);
      const isolated = ABC.parseOnly(header + definition + '[V:' + voice + ']\n' + beforeVoices.get(voice))[0];
      const expected = isolated.setUpAudio();
      assert.equal(audio.tempo, expected.tempo, row.title);
      assert.deepEqual(programs(audio.tracks[index]), programs(expected.tracks[0]), row.title + ' changes the instrument program in ' + voice);
      assert.deepEqual(notes(audio.tracks[index]), notes(expected.tracks[0]), row.title + ' changes sounding pitches, timing, durations or instrument in ' + voice);
    }
  }
});
