import {language, languageTitle} from './helpers/animus-language.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root = new URL('../', import.meta.url), read = path => fs.readFileSync(new URL(path, root), 'utf8');
const cutout = JSON.parse(JSON.parse(read('plugins/cutout/dist/plugin.json')).text).tiddlers;
const sources = Object.fromEntries(['playlist', 'motion', 'sfx', 'editor', 'puppet', 'track-preview', 'lipsync', 'face'].map(name => [name, read('plugins/musical/src/' + name + '.js')]));
const plain = value => JSON.parse(JSON.stringify(value));
class Tiddler {constructor(...items) {this.fields = Object.assign({}, ...items.filter(Boolean).map(item => item.fields || item));}}
function modules() {
  const cache = {};
  function load(name) {if(name===languageTitle)return language;
    if(cache[name]) return cache[name];
    const exported = {}; cache[name] = exported;
    if(name.endsWith('/i18n.js')) return Object.assign(exported, {t: value => value, contentName: (_title, value) => value, language: () => 'en'});
    const musical = /\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(name), code = musical ? sources[musical[1]] : cutout[name]?.text;
    if(!code) throw new Error('Test module missing: ' + name);
    vm.runInNewContext(code, {exports: exported, require: load, $tw: {Tiddler}, console}); return exported;
  }
  return {engine: load('$:/plugins/huwiki/cutout/engine.js'), editor: load('$:/plugins/huwiki/musical/editor.js'), motion: load('$:/plugins/huwiki/musical/motion.js'), lips: load('$:/plugins/huwiki/musical/lipsync.js'), face: load('$:/plugins/huwiki/musical/face.js')};
}
function sourceScene() {
  return {version: 1, width: 800, height: 450, duration: 10, parts: [
    {id: 'alma', type: 'group', name: 'Alma', keys: [{t: 0, x: 300, y: 200, sx: 1.2}]},
    {id: 'alma-head', type: 'group', name: 'Head', parent: 'alma', keys: [{t: 0, y: -30, r: 12}]},
    {id: 'alma-eyes', type: 'ellipse', name: 'Eyes', parent: 'alma-head', geo: {rx: 12, ry: 5}, keys: [{t: 0, y: -15}]},
    {id: 'alma-mouth-open', type: 'image', name: 'Mouth', parent: 'alma-head', geo: {x: -10, y: 0, w: 20, h: 15}, variants: ['rest', 'A', 'E', 'O', 'F', 'C'].map(id => ({id, name: id, imageData: 'data:image/svg+xml,<svg id="' + id + '"/>'})), keys: [{t: 0, opacity: 0}]},
    {id: 'alma-mouth-closed', type: 'path', name: 'Closed mouth', parent: 'alma-head', geo: {d: 'M-8 0 Q0 4 8 0'}, keys: [{t: 0, opacity: 1}]},
    {id: 'spoken', type: 'text', text: 'ALMA: OOOOOOOO', keys: [{t: 0, opacity: 1}, {t: 10, opacity: 0}], lipSync: {enabled: true, target: 'alma', open: 'alma-mouth-open', closed: 'alma-mouth-closed', timing: 'script', strength: 1}}
  ]};
}
function harness(initial) {
  const row = (title, data) => ({title, type: 'application/json', text: JSON.stringify(data)});
  const film = {version: 1, width: 800, height: 450, duration: 20, parts: [], scenes: [{id: 'first', source: 'First', duration: 10}, {id: 'second', source: 'Second', duration: 10}], musical: {songs: [{id: 'music', score: 'Score', start: 0, duration: 20}], animationClips: []}};
  const records = plain(initial || {Film: row('Film', film), First: row('First', sourceScene()), Second: row('Second', sourceScene()), Score: {title: 'Score', type: 'text/vnd.abc', text: 'X:1\nK:C\nC D E F|'}}), writes = [];
  const wiki = {getTiddler: title => records[title] ? new Tiddler(records[title]) : null, getTiddlerText: (title, fallback = '') => records[title]?.text ?? fallback, getTiddlers: () => Object.keys(records), each(fn) {for(const [title, fields] of Object.entries(records)) fn(new Tiddler(fields), title);}, addTiddler(t) {records[t.fields.title] = plain(t.fields);writes.push(t.fields.title);}, getModificationFields: () => ({}), generateNewTitle: title => title};
  const api = modules(), doc = svgDocument(), data = api.engine.readScene(wiki, 'Film'), view = api.engine.build(doc, wiki, data, false), host = doc.createElement('main'); doc.body.appendChild(host); host.appendChild(view.svg);
  let time = 1.75, editor = null, pauses = 0; const clock = {at: t => t * 2};
  function repaint() {api.engine.paint(view, time);api.motion.paint(view, data, time, clock);api.lips.apply(view, time, time);if(editor) editor.paint(time);}
  const options = {doc, host, wiki, film: data, view, sceneTitle: 'Film', stageTitle: 'First', scoreTitle: 'Score', duration: () => data.duration, beatClock: () => clock, pause() {pauses++;}, isPlaying: () => false, position: () => time, seek(t) {time = t;repaint();}, repaint, markOwnWrite() {}, onSelect() {}};
  editor = api.editor.attach(options); repaint();
  return {api, doc, host, data, view, editor, options, records, writes, get time() {return time;}, get pauses() {return pauses;}};
}

test('real editor merges same-playhead facial choices into the global film and reloads them in later scenes', () => {
  const h = harness(), firstBefore = h.records.First.text, secondBefore = h.records.Second.text;
  assert.equal(h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'E'}), true);
  assert.equal(h.editor.chooseFace('alma-eyes', {channel: 'eyes', value: 'wide'}), true);
  assert.equal(h.editor.chooseFace('alma-head', {channel: 'expression', value: 'happy'}), true);
  assert.equal(h.time, 1.75); assert.equal(h.pauses, 3);
  const keys = plain(h.editor.faceHistory('alma'));
  assert.equal(keys.length, 1); assert.equal(keys[0].t, 1.75); assert.equal(keys[0].actor, 'alma');
  assert.equal(keys[0].mood, 'happy'); assert.equal(keys[0].eyes, 'open'); assert.deepEqual(keys[0].mouthMap, {O: 'E'}); assert.deepEqual(keys[0].mouth, {mode: 'auto'});
  assert.deepEqual(h.writes, ['Film', 'Film', 'Film']);
  assert.equal(h.records.First.text, firstBefore); assert.equal(h.records.Second.text, secondBefore);
  assert.equal(h.editor.getSelection().kind, 'face');
  assert.ok(h.host.querySelector('[data-track-id="face:alma"] .huw-musical-key'));
  const reopened = harness(h.records);
  assert.deepEqual(plain(reopened.editor.faceHistory('alma')), keys);
  reopened.options.seek(13);
  const ctx = reopened.editor.faceContext('alma-head');
  assert.equal(ctx.sceneTitle, 'Second'); assert.equal(ctx.localTime, 3); assert.equal(ctx.viseme, 'O'); assert.equal(ctx.effectiveVariant, 'E'); assert.equal(ctx.state.mood, 'happy');
  assert.match(reopened.view.clips[1].view.nodes['alma-mouth-open'].shape.getAttribute('href'), /id="E"/);
  reopened.options.seek(1); assert.equal(reopened.editor.faceContext('alma-head').effectiveVariant, 'O');
});

test('real editor timeline timing, delete, and undo preserve complete facial corrections', () => {
  const h = harness();
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'E'});
  h.options.seek(6);
  h.editor.chooseFace('alma-eyes', {channel: 'eyes', value: 'closed'});
  const before = plain(h.editor.faceHistory('alma'));
  h.editor.selectFaceKey('alma', 1.75);
  const timeInput = h.host.querySelector('.huw-musical-inspector .huw-musical-property input');
  assert.ok(timeInput); timeInput.value = '4.5'; timeInput.dispatch('change');
  assert.deepEqual(plain(h.editor.faceHistory('alma')).map(key => key.t), [4.5, 6]);
  assert.equal(h.time, 1.75, 'editing key time does not silently move the playhead');
  h.options.seek(3); assert.equal(h.editor.faceContext('alma-head').effectiveVariant, 'O');
  h.options.seek(5); assert.equal(h.editor.faceContext('alma-head').effectiveVariant, 'E');
  assert.equal(h.editor.undoFace(), true);
  assert.deepEqual(plain(h.editor.faceHistory('alma')), before);
  h.editor.selectFaceKey('alma', 6); h.editor.removeKeyframe();
  assert.equal(h.editor.faceHistory('alma').length, 1); assert.equal(h.editor.faceContext('alma-head').state.eyes, 'auto');
  assert.equal(h.editor.undoFace(), true);
  assert.deepEqual(plain(h.editor.faceHistory('alma')), before); assert.equal(h.editor.faceContext('alma-head').state.eyes, 'closed');
  const reopened = harness(h.records); assert.deepEqual(plain(reopened.editor.faceHistory('alma')), before);
  assert.equal(reopened.editor.canUndoFace(), false, 'history belongs to this editing session');
});

test('real editor reset of one letter preserves learned other letters and explicit fixed mode stays opt-in', () => {
  const h = harness();
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'E'});
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'F', viseme: 'M'});
  h.options.seek(3);
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'auto', viseme: 'O'});
  let context = h.editor.faceContext('alma-head');
  assert.equal(context.effectiveVariant, 'O'); assert.equal(context.variantMap.M, 'F'); assert.equal(context.state.mouth.mode, 'auto');
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'A', mode: 'fixed'});
  assert.equal(h.editor.faceContext('alma-head').state.mouth.mode, 'fixed');
  h.options.seek(4);
  h.editor.chooseFace('alma-mouth-open', {channel: 'mouth', value: 'auto'});
  context = h.editor.faceContext('alma-head'); assert.equal(context.state.mouth.mode, 'auto'); assert.equal(context.variantMap.M, 'F');
  h.options.seek(1); assert.equal(h.editor.faceContext('alma-head').custom, false);
});

test('clearing a real editor selection never falls back to another track or writes keys', () => {
  const h=harness();h.editor.chooseFace('alma-mouth-open',{channel:'mouth',value:'E'});
  h.editor.selectPart('alma-head',true);const before=plain(h.records),keys=plain(h.data),writes=h.writes.length,time=h.time,events=[];
  h.options.onSelect=selection=>events.push(selection);
  assert.equal(h.editor.clearSelection(),true);assert.equal(h.editor.getSelection(),null);assert.equal(events.at(-1),null);
  assert.equal(h.host.querySelector('.huw-musical-track.is-selected'),null);assert.equal(h.host.querySelector('.huw-musical-key.is-selected'),null);
  h.editor.addKeyframe();h.editor.removeKeyframe();h.editor.redraw();h.editor.paint(h.time);
  assert.equal(h.editor.clearSelection(),false);assert.equal(h.editor.getSelection(),null);assert.equal(h.writes.length,writes);
  assert.deepEqual(plain(h.records),before);assert.deepEqual(plain(h.data),keys);assert.equal(h.time,time);
  assert.equal(h.editor.faceContext('alma-head').effectiveVariant,'E','deselection preserves the applied face');
  assert.equal(h.editor.undoFace(),true,'face undo also works with no selected timeline track');assert.equal(h.editor.getSelection(),null);
  assert.equal(h.editor.selectPart('alma-head',true),true);assert.equal(h.editor.getSelection().part,'alma-head');
});

test('leaving animation detail does not resurrect a selection cleared inside it', () => {
  const records=harness().records,film=JSON.parse(records.Film.text);film.musical.animationClips.push({id:'loop',target:'alma',name:'Loop',start:0,duration:10,beatsPerLoop:4,motion:{'alma-head':[{t:0,r:0},{t:2,r:15}]}});records.Film.text=JSON.stringify(film);
  const h=harness(records);h.editor.selectPart('alma-head',true);assert.equal(h.editor.getSelection().kind,'motion');
  assert.equal(h.editor.openAnimation('loop'),true);h.editor.clearSelection();assert.equal(h.editor.getSelection(),null);
  assert.equal(h.editor.inClipDetail(),true,'deselecting does not leave the working view');
  h.editor.closeAnimation();assert.equal(h.editor.getSelection(),null);assert.equal(h.host.querySelector('.huw-musical-track.is-selected'),null);assert.equal(h.writes.length,0);
});
