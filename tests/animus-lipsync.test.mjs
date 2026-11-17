import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const cutout = JSON.parse(fs.readFileSync(new URL('plugins/cutout/dist/plugin.json', root), 'utf8'));
const engine = {};
vm.runInNewContext(JSON.parse(cutout.text).tiddlers['$:/plugins/huwiki/cutout/engine.js'].text, {exports: engine, require: () => ({t: value => value})});
const lips = {};
vm.runInNewContext(fs.readFileSync(new URL('plugins/musical/src/lipsync.js', root), 'utf8'), {exports: lips, require: () => engine});
const plain = value => JSON.parse(JSON.stringify(value));
class Node {
  constructor(attrs = {}) { this.attrs = {...attrs}; this.classList = {toggle() {}}; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
}
function actor(id, label = id) {
  return [{id, name: label, type: 'group', parent: null, keys: [{t: 0, x: 100, y: 60, r: 12, sx: 1.2, sy: .9, opacity: 1}]},
    {id: id + '-head', name: 'Head', type: 'circle', parent: id, geo: {r: 20}, keys: [{t: 0, x: 3, y: -20, r: 4, opacity: 1}]},
    {id: id + '-mouth-open', name: 'Mund · tale/sang', type: 'ellipse', parent: id + '-head', geo: {rx: 5, ry: 6}, keys: [{t: 0, x: 0, y: 7, r: 0, opacity: 0}]},
    {id: id + '-mouth-closed', name: 'Mouth · closed', type: 'path', parent: id + '-head', geo: {d: 'M-5 7 Q0 10 5 7'}, keys: [{t: 0, opacity: 1}]}];
}
function cue(id, who, text, start, end, extra = {}) {
  return {id, type: 'text', text, keys: [{t: 0, opacity: start === 0 ? 1 : 0, easing: 'step'}, ...(start ? [{t: start, opacity: 1, easing: 'step'}] : []), {t: end, opacity: 0, easing: 'step'}],
    lipSync: {enabled: true, target: who, open: who + '-mouth-open', closed: who + '-mouth-closed', timing: 'script', offset: 0, strength: 1, ...extra}};
}
function makeScene(parts, title = 'Scene', duration = 12) { return {version: 1, width: 800, height: 450, duration, _title: title, parts}; }
function viewFor(scene) {
  const view = {scene, duration: scene.duration, nodes: {}, clips: [], svg: new Node(), wiki: {getTiddler() {return null;}, getTiddlerText(_title, fallback) {return fallback;}}};
  for (const p of scene.parts) view.nodes[p.id] = {part: p, el: new Node(), shape: new Node(p.type === 'ellipse' ? {rx: p.geo.rx, ry: p.geo.ry} : p.type === 'image' ? {href: p.variants?.[0]?.imageData || ''} : {}), variant: null};
  return view;
}
function paint(view, time, opts = {}) { engine.paint(view, time); return lips.apply(view, time, time, {sceneTitle: view.scene._title, ...opts}); }
const opacity = (view, id) => Number(view.nodes[id].el.getAttribute('opacity'));

test('real Fyrtøjet actors resolve Danish and English role prefixes without guessing absent roles', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('plugins/animus-example-fyrtoejet/dist/plugin.json', root), 'utf8'));
  const ts = JSON.parse(pkg.text).tiddlers;
  const scene = JSON.parse(ts['Fyrtøjet · Akt 1 scene 1 · Skovens sti'].text);
  assert.equal(lips.actors(scene).length, 2);
  assert.equal(lips.suggest(scene, 'SOLDAT (fra gaden): Hej!')[0].id, 'a1s1-soldier');
  assert.equal(lips.suggest(scene, 'WITCH: Hello!')[0].id, 'a1s1-witch');
  assert.equal(lips.suggest(scene, 'HEKS: Hej!')[0].closed, 'a1s1-witch-smile');
  assert.equal(lips.suggest(scene, 'DOMMER: Stop!').length, 0);
  assert.equal(lips.suggest(scene, 'Jeg ejer kun mine støvler.').length, 0);
  assert.equal(lips.suggest(scene, 'CutOut-dukke: Hej!').length, 0);
});

test('manuscript sampling follows vowels, bilabial closures and punctuation with deterministic seeks', () => {
  assert.equal(lips.sample('ALMA: Aaaaaa.', .4, 4).viseme, 'A');
  assert.equal(lips.sample('ALMA: Aaaaaa.', 3.8, 4).open, 0);
  assert.equal(lips.sample('MAMA', .2, 4).open, 0);
  assert.equal(lips.sample('MAMA', 1.3, 4).viseme, 'A');
  assert.equal(lips.sample('MAMA', 2.5, 4).open, 0);
  assert.equal(lips.sample('MAMA', 3.5, 4).viseme, 'A');
  assert.equal(lips.sample('ØØØ', .5, 2).viseme, 'O');
  assert.equal(lips.sample('ÆÆÆ', .5, 2).viseme, 'E');
  assert.equal(lips.sample('ÅÅÅ', .5, 2).viseme, 'O');
  assert.equal(lips.sample('♪ Aaaaaa. ♪', .4, 4).viseme, 'A');
  assert.deepEqual(plain(lips.sample('ALMA (whispers): MAMA', 1.3, 4)), plain(lips.sample('MAMA', 1.3, 4)));
  assert.equal(lips.sample('AAAA', 4, 4).open, 0);
  assert.equal(lips.sample('', 1, 4).open, 0);
  assert.equal(lips.sample('A', -1, 4).open, 0);
});

test('timing derives real visible cue intervals; hidden captions never invent speech', () => {
  assert.deepEqual(plain(lips.timing(cue('line', 'alma', 'A', 1, 5), 12)), {start: 1, end: 5});
  assert.deepEqual(plain(lips.timing({keys: [{t: 0, opacity: 0}, {t: 5, opacity: 0}]}, 12)), {start: 0, end: 0});
  const hidden = cue('line', 'alma', 'A', 1, 5); hidden.keys = [{t: 0, opacity: 0}];
  const view = viewFor(makeScene([...actor('alma', 'Alma'), hidden]));
  paint(view, 2); assert.equal(opacity(view, 'alma-mouth-open'), 0);
});

test('only the bound actor speaks, with punctuation pauses and fully closed in-between lines', () => {
  const scene = makeScene([...actor('alma', 'Alma'), ...actor('bo', 'Bo'), cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5), cue('spoken-1', 'bo', 'BO: Oooooo.', 6, 10)]);
  const view = viewFor(scene), before = JSON.stringify(scene);
  paint(view, .5); assert.equal(opacity(view, 'alma-mouth-open'), 0); assert.equal(opacity(view, 'bo-mouth-open'), 0);
  paint(view, 1.4); assert.equal(opacity(view, 'alma-mouth-open'), 1); assert.equal(opacity(view, 'alma-mouth-closed'), 0); assert.equal(opacity(view, 'bo-mouth-open'), 0);
  assert.equal(view.nodes['alma-mouth-open'].el.getAttribute('data-lipsync-viseme'), 'A');
  assert.ok(Number(view.nodes['alma-mouth-open'].shape.getAttribute('ry')) > 6);
  const transform = view.nodes.alma.el.getAttribute('transform');
  assert.equal(transform, 'translate(100 60) rotate(12) scale(1.2 0.9) translate(0 0)');
  paint(view, 4.8); assert.equal(opacity(view, 'alma-mouth-open'), 0); assert.equal(opacity(view, 'alma-mouth-closed'), 1);
  paint(view, 6.4); assert.equal(opacity(view, 'bo-mouth-open'), 1); assert.equal(opacity(view, 'alma-mouth-open'), 0);
  paint(view, 12); assert.equal(opacity(view, 'bo-mouth-open'), 0);
  paint(view, 1.4); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  assert.equal(JSON.stringify(scene), before);
});

test('disabled configuration restores authored mouth geometry/opacity and strength zero closes it', () => {
  const line = cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5), scene = makeScene([...actor('alma'), line]);
  const view = viewFor(scene);
  paint(view, 1.4);
  line.lipSync.strength = 0;
  paint(view, 1.4); assert.equal(opacity(view, 'alma-mouth-open'), 0); assert.equal(opacity(view, 'alma-mouth-closed'), 1);
  line.lipSync.strength = 1; paint(view, 1.4);
  line.lipSync.enabled = false; paint(view, 1.4);
  assert.equal(Number(view.nodes['alma-mouth-open'].shape.getAttribute('rx')), 5);
  assert.equal(Number(view.nodes['alma-mouth-open'].shape.getAttribute('ry')), 6);
  assert.equal(opacity(view, 'alma-mouth-open'), 0);
  assert.equal(view.nodes['alma-mouth-open'].el.getAttribute('data-lipsync-viseme'), null);
  line.lipSync.enabled = true; paint(view, 1.4); lips.reset(view);
  assert.equal(Number(view.nodes['alma-mouth-open'].shape.getAttribute('ry')), 6);
  assert.equal(opacity(view, 'alma-mouth-open'), 0);
});

test('recording auto timing follows moved takes; script mode deliberately follows caption keys', () => {
  const line = cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5, {timing: 'auto'}), view = viewFor(makeScene([...actor('alma'), line], 'Dialogue', 20));
  const clips = [{id: 'take', cueId: 'spoken-0', sceneTitle: 'Dialogue', text: line.text, start: 10, offset: 0, duration: 4, sourceDuration: 4, muted: true}];
  paint(view, 1.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
  paint(view, 10.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  // Silent previews retain theatrical movement; loading or muting audio is not
  // phoneme detection and must not change the manuscript animation clock.
  clips[0].start = 12; lips.invalidate(view);
  paint(view, 10.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
  paint(view, 12.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  line.lipSync.timing = 'script';
  paint(view, 1.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  paint(view, 12.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
});

test('trimmed recording retains its original text position rather than restarting the sentence', () => {
  const line = cue('spoken-0', 'alma', 'ALMA: Updated caption', 1, 5, {timing: 'auto'}), view = viewFor(makeScene([...actor('alma'), line], 'Dialogue', 20));
  const clips = [{id: 'take', cueId: 'spoken-0', sceneTitle: 'Dialogue', text: 'ALMA: MMMM AAAA', start: 10, offset: 4, duration: 4, sourceDuration: 8}];
  assert.equal(lips.sample('MMMM AAAA', .4, 8).open, 0);
  assert.equal(lips.sample('MMMM AAAA', 4.4, 8).viseme, 'A');
  paint(view, 10.4, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  assert.equal(view.nodes['alma-mouth-open'].el.getAttribute('data-lipsync-viseme'), 'A');
  paint(view, 14, {audioClips: clips}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
});

test('recordings match both scene title and cue ID and explicit offsets shift only lipsync', () => {
  const line = cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5, {timing: 'auto', offset: 1}), view = viewFor(makeScene([...actor('alma'), line], 'First scene', 20));
  const unrelated = [{id: 'take', cueId: 'spoken-0', sceneTitle: 'Other scene', start: 10, offset: 0, duration: 4, sourceDuration: 4}];
  paint(view, 1.4, {audioClips: unrelated}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
  paint(view, 2.4, {audioClips: unrelated}); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  paint(view, 10.4, {audioClips: unrelated}); assert.equal(opacity(view, 'alma-mouth-open'), 0);
});

test('nested scene speed, source offset and loops use the same clock as CutOut painting', () => {
  const child = viewFor(makeScene([...actor('alma'), cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 3)], 'Nested', 4));
  const intro = viewFor(makeScene([], 'Intro', 4));
  const parent = viewFor(makeScene([], 'Film', 12));
  parent.scene.scenes = [{source: 'Intro', duration: 4}, {source: 'Nested', duration: 8, speed: 2, offset: 1, loop: true}];
  parent.clips = [{view: intro, duration: 4, settings: parent.scene.scenes[0], el: new Node()}, {view: child, duration: 4, settings: parent.scene.scenes[1], el: new Node()}];
  paint(parent, 4.2); assert.equal(opacity(child, 'alma-mouth-open'), 1); // local 1.4
  paint(parent, 5.4); assert.equal(opacity(child, 'alma-mouth-open'), 0); // local 3.8
  paint(parent, 6.2); assert.equal(opacity(child, 'alma-mouth-open'), 1); // wrapped local 1.4
  paint(parent, 1.2); assert.equal(opacity(child, 'alma-mouth-open'), 0); // inactive scene
  paint(parent, 4.2); assert.equal(opacity(child, 'alma-mouth-open'), 1); // backwards seek
});

test('nested animation parts use their own start, offset, speed and loop clocks', () => {
  const child = viewFor(makeScene([...actor('alma'), cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 3)], 'Puppet clip', 4));
  const part = {id: 'clip', type: 'animation', animation: 'Puppet clip', start: 2, speed: 2, offset: 1, loop: true, keys: [{t: 0, opacity: 1}]};
  const parent = viewFor(makeScene([part], 'Film', 12)); parent.nodes.clip.nested = child;
  paint(parent, 1); assert.equal(opacity(child, 'alma-mouth-open'), 0);
  paint(parent, 2.2); assert.equal(opacity(child, 'alma-mouth-open'), 1);
  paint(parent, 3.4); assert.equal(opacity(child, 'alma-mouth-open'), 0);
  paint(parent, 4.2); assert.equal(opacity(child, 'alma-mouth-open'), 1);
});

test('overlapping cues for one actor choose the latest start and stable cue order', () => {
  const first = cue('spoken-0', 'alma', 'AAAAAA', 1, 8), second = cue('spoken-1', 'alma', 'MMMMMM', 2, 5), scene = makeScene([...actor('alma'), first, second]), view = viewFor(scene);
  paint(view, 1.4); assert.equal(opacity(view, 'alma-mouth-open'), 1);
  paint(view, 2.4); assert.equal(opacity(view, 'alma-mouth-open'), 0);
  paint(view, 5.4); assert.equal(opacity(view, 'alma-mouth-open'), 1);
});

test('image mouth variants switch transiently and restore the authored image on disable', () => {
  const image = {id: 'mouth', name: 'Mouth', type: 'image', parent: null, geo: {x: -5, y: -5, w: 10, h: 10}, variants: [{id: 'original', name: 'rest', imageData: 'data:image/svg+xml,<svg/>'}, {id: 'speak-a', name: 'A', imageData: 'data:image/svg+xml,<svg id="a"/>'}], variantId: 'original', keys: [{t: 0, opacity: 1}]};
  const line = cue('spoken-0', 'mouth', 'ALMA: Aaaaaa.', 1, 5, {open: 'mouth', closed: ''}), scene = makeScene([image, line]), view = viewFor(scene);
  paint(view, 1.4); assert.equal(view.nodes.mouth.shape.getAttribute('href'), image.variants[1].imageData);
  paint(view, 4.8); assert.equal(view.nodes.mouth.shape.getAttribute('href'), image.variants[0].imageData);
  paint(view, 1.4); line.lipSync.enabled = false; paint(view, 1.4);
  assert.equal(view.nodes.mouth.shape.getAttribute('href'), image.variants[0].imageData);
  assert.equal(view.nodes.mouth.variant, 'original');
  assert.equal(image.variantId, 'original');
});

test('explicit empty mouth choices are respected and shared nodes restore their authored opacity', () => {
  const first = cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5, {closed: ''});
  const scene = makeScene([...actor('alma'), first]), view = viewFor(scene);
  assert.equal(lips.compile(scene).bindings[0].closed, '');
  paint(view, 1.4); assert.equal(opacity(view, 'alma-mouth-closed'), 1);
  first.lipSync.open = '';
  assert.equal(lips.compile(scene).cues.length, 0);
  first.lipSync.open = 'alma-mouth-open';
  const otherClosed = {id: 'alma-alt-closed', type: 'path', parent: 'alma', geo: {d: 'M-3 0 L3 0'}, keys: [{t: 0, opacity: .4}]};
  const open = scene.parts.find(p => p.id === 'alma-mouth-open'); open.keys[0].opacity = .75;
  first.lipSync.closed = 'alma-mouth-closed';
  scene.parts.push(otherClosed, cue('spoken-1', 'alma', 'ALMA: Oooooo.', 6, 10, {closed: 'alma-alt-closed'}));
  const shared = viewFor(scene);
  paint(shared, 1.4);
  assert.equal(opacity(shared, 'alma-mouth-open'), 1);
  lips.reset(shared);
  assert.equal(opacity(shared, 'alma-mouth-open'), .75);
  assert.equal(opacity(shared, 'alma-alt-closed'), .4);
});

test('a local view can use global recording time without losing script animation', () => {
  const scene = makeScene([...actor('alma'), cue('spoken-0', 'alma', 'ALMA: Aaaaaa.', 1, 5)]), view = viewFor(scene);
  engine.paint(view, 1.4);
  lips.apply(view, 1.4, 101.4, {sceneTitle: scene._title});
  assert.equal(opacity(view, 'alma-mouth-open'), 1);
});
