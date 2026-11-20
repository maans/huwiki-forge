import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const engine = {}, face = {}, lips = {};
vm.runInNewContext(fs.readFileSync(new URL('plugins/cutout/src/engine.js', root), 'utf8'), {exports: engine, require: () => ({t: value => value})});
vm.runInNewContext(fs.readFileSync(new URL('plugins/musical/src/face.js', root), 'utf8'), {exports: face, require: () => engine});
vm.runInNewContext(fs.readFileSync(new URL('plugins/musical/src/lipsync.js', root), 'utf8'), {exports: lips, require: name => name.endsWith('/face.js') ? face : engine});
const plain = value => JSON.parse(JSON.stringify(value));
class Node {
  constructor(attrs = {}) { this.attrs = Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); this.writes = 0; this.classList = {toggle() {}}; }
  setAttribute(name, value) { this.attrs[name] = String(value); this.writes++; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; this.writes++; }
}
function actor(id = 'alma') {
  const head = id + '-head', mouth = id + '-mouth';
  return [
    {id, name: id, type: 'group', keys: [{t: 0, x: 130, y: 220, r: 5, sx: -.9, sy: .95, opacity: 1}]},
    {id: id + '-body', name: 'Body', parent: id, type: 'path', geo: {d: 'M-20 0 L20 0 L0 80Z'}, keys: [{t: 0}]},
    {id: head, name: 'Head', parent: id, type: 'group', pivot: {x: 1, y: 3}, keys: [{t: 0, x: 2, y: -95, r: 11, sx: .7, sy: .7}]},
    {id: head + '-drawing', name: 'Face, hair and neck', parent: head, type: 'image', geo: {x: -40, y: -80, w: 80, h: 100}, variants: [{id: 'head', imageData: 'data:image/svg+xml,<svg id="head"/>'}], keys: [{t: 0}]},
    {id: id + '-eyes', name: 'Eyes', parent: head, type: 'image', geo: {x: -25, y: -50, w: 50, h: 20}, variants: [{id: 'eyes', imageData: 'data:image/svg+xml,<svg id="eyes"/>'}], keys: [{t: 0, opacity: 1}]},
    {id: id + '-pupils', name: 'Gaze', parent: head, type: 'image', geo: {x: -25, y: -50, w: 50, h: 20}, variants: [{id: 'pupils', imageData: 'data:image/svg+xml,<svg id="pupils"/>'}], keys: [{t: 0, x: 2, opacity: 1}]},
    {id: id + '-brows', name: 'Eyebrows', parent: head, type: 'image', geo: {x: -25, y: -57, w: 50, h: 8}, variants: [{id: 'brows', imageData: 'data:image/svg+xml,<svg id="brows"/>'}], keys: [{t: 0, r: 3, opacity: 1}]},
    {id: id + '-eye-lids', name: 'Eyelids', parent: head, type: 'image', geo: {x: -26, y: -51, w: 52, h: 22}, variants: [{id: 'lids', imageData: 'data:image/svg+xml,<svg id="lids"/>'}], keys: [{t: 0, opacity: 0}]},
    {id: id + '-jaw', name: 'Jaw', parent: head, type: 'group', keys: [{t: 0, x: 1, y: 2, r: 4}]},
    {id: mouth + '-open', name: 'Mouth — six shapes', parent: id + '-jaw', type: 'image', geo: {x: -17, y: -9, w: 36, h: 28}, variants: ['rest', 'A', 'E', 'O', 'F', 'C'].map(id => ({id, name: id, viseme: id, imageData: 'data:image/svg+xml,<svg id="' + id + '"/>'})), variantId: 'rest', keys: [{t: 0, x: 10, y: -28, opacity: 0}]},
    {id: mouth + '-closed', name: 'Closed mouth', parent: id + '-jaw', type: 'path', geo: {d: 'M-9 0Q-2 -2 3 0Q7 1 11 -1M-4 3Q2 5 7 2'}, keys: [{t: 0, x: 10, y: -28, opacity: 1}]}
  ];
}
function cue(id, target, text, start, end, timing = 'script') {
  return {id, type: 'text', text, keys: [{t: 0, opacity: start ? 0 : 1, easing: 'step'}, ...(start ? [{t: start, opacity: 1, easing: 'step'}] : []), {t: end, opacity: 0, easing: 'step'}],
    lipSync: {enabled: true, target, open: target + '-mouth-open', closed: target + '-mouth-closed', timing, strength: 1}};
}
function scene(name = 'First', id = 'alma') {
  return {version: 1, width: 800, height: 450, duration: 10, _title: name, parts: [...actor(id), cue('o', id, 'OOOO', 0, 4), cue('a', id, 'AAAA', 4, 6), cue('m', id, 'MMMM', 6, 8)]};
}
function viewFor(scene) {
  const view = {scene, duration: scene.duration, nodes: {}, clips: [], svg: new Node(), wiki: {getTiddler() {return null;}, getTiddlerText(_title, fallback) {return fallback;}}};
  for (const part of scene.parts) {
    const geo = part.geo || {}, attrs = part.type === 'image' ? {x: geo.x, y: geo.y, width: geo.w, height: geo.h, href: part.variants?.[0]?.imageData || part.imageData || ''} : part.type === 'path' ? {d: geo.d} : {};
    view.nodes[part.id] = {part, el: new Node(), shape: new Node(attrs), variant: null};
  }
  return view;
}
function filmFor(keys = []) {
  const first = viewFor(scene()), second = viewFor(scene('Second')), third = viewFor(scene('Other actor', 'bo'));
  const film = {version: 1, width: 800, height: 450, duration: 30, _title: 'Performance', parts: [], musical: {faceKeys: keys}, scenes: [{source: 'First', duration: 10}, {source: 'Second', duration: 10}, {source: 'Other actor', duration: 10}]};
  const view = viewFor(film);
  view.clips = [first, second, third].map((view, i) => ({view, duration: 10, settings: film.scenes[i], el: new Node()}));
  return {view, first, second, third, film};
}
function paint(view, time, options = {}, global = time) {engine.paint(view, time);return lips.apply(view, time, global, options);}
function href(view, id = 'alma') {return view.nodes[id + '-mouth-open'].shape.getAttribute('href');}
function shown(view, id) {return Number(view.nodes[id].el.getAttribute('opacity'));}
function writes(view) {return Object.values(view.nodes).reduce((sum, node) => sum + node.el.writes + node.shape.writes, 0);}
function snapshot(view) {return Object.fromEntries(Object.entries(view.nodes).map(([id, node]) => [id, {el: {...node.el.attrs}, shape: {...node.shape.attrs}}]));}

test('held face channels and viseme corrections merge independently without changing input keys', () => {
  const input = [{actor: 'alma', t: 2, mood: 'happy', mouthMap: {O: 'E'}, note: 'keep metadata'}, {actor: 'bo', t: 1, eyes: 'closed'}];
  const before = JSON.stringify(input); let keys = input;
  keys = face.withKey(keys, 'alma', 2, {eyes: 'wide', mouth: {mode: 'auto'}, mouthMap: {M: 'A'}});
  assert.equal(JSON.stringify(input), before);
  assert.equal(keys.length, 2);
  const held = face.state(keys, 20, 'alma');
  assert.equal(held.mood, 'happy'); assert.equal(held.eyes, 'wide');
  assert.deepEqual(plain(held.mouthMap), {O: 'E', M: 'A'});
  assert.equal(face.state(keys, 1.9, 'alma').active, false);
  assert.equal(face.state(keys, 20, 'bo').eyes, 'closed');
  keys = face.withKey(keys, 'alma', 4, {mouthMap: {O: null}});
  assert.deepEqual(plain(face.state(keys, 4, 'alma').mouthMap), {M: 'A'});
  keys = face.withKey(keys, 'alma', 5, {mouthMap: null});
  keys = face.withKey(keys, 'alma', 5, {mouthMap: {A: 'F'}});
  assert.deepEqual(plain(face.state(keys, 8, 'alma').mouthMap), {A: 'F'}, 'same-time remap must retain the reset of earlier sounds');
  assert.deepEqual(plain(face.state(keys, 3, 'alma').mouthMap), {O: 'E', M: 'A'});
  assert.equal(keys.find(key => key.t === 2).note, 'keep metadata');
});

test('face resolution follows actual head/jaw parents and rejects a body-only selection', () => {
  const source = scene(), desc = face.resolve(source, 'alma-mouth-open');
  assert.equal(desc.actorId, 'alma'); assert.equal(desc.headId, 'alma-head');
  assert.equal(face.resolve(source, 'alma-head-drawing').actorId, 'alma');
  assert.equal(face.resolve(source, 'alma-eyes').actorId, 'alma');
  assert.equal(face.resolve(source, 'alma').actorId, 'alma');
  assert.equal(face.resolve(source, 'alma-body'), null);
  assert.deepEqual(plain(desc.parts), {eyes: ['alma-eyes'], pupils: ['alma-pupils'], brows: ['alma-brows'], lids: ['alma-eye-lids'], open: 'alma-mouth-open', closed: 'alma-mouth-closed'});
  assert.deepEqual(plain(desc.variants).map(v => v.id), ['rest', 'A', 'E', 'O', 'F', 'C']);
});

test('learned O correction starts at global key time, crosses scenes, and leaves other sounds and actors alone', () => {
  const {view, first, second, third, film} = filmFor([{actor: 'alma', t: 2.5, mouth: {mode: 'auto'}, mouthMap: {O: 'E'}}]);
  const before = JSON.stringify([film, first.scene, second.scene, third.scene]);
  paint(view, 1); assert.match(href(first), /id="O"/);
  paint(view, 3); assert.match(href(first), /id="E"/);
  let context = lips.faceContext(view, 'alma-mouth-open', 3, 3);
  assert.equal(context.viseme, 'O'); assert.equal(context.effectiveVariant, 'E'); assert.equal(context.custom, true);
  assert.equal(context.variantMap.O, 'E'); assert.equal(context.defaultVariantMap.O, 'O');
  paint(view, 5); assert.match(href(first), /id="A"/);
  context = lips.faceContext(view, 'alma-mouth-open', 5, 5);
  assert.equal(context.custom, false); assert.equal(context.viseme, 'A');
  paint(view, 13); assert.match(href(second), /id="E"/);
  context = lips.faceContext(view, 'alma-head', 13, 13);
  assert.equal(context.view, second); assert.equal(context.localTime, 3); assert.equal(context.sceneTitle, 'Second');
  paint(view, 23); assert.match(href(third, 'bo'), /id="O"/);
  paint(view, 1); assert.match(href(first), /id="O"/);
  paint(view, 13); assert.match(href(second), /id="E"/);
  assert.equal(JSON.stringify([film, first.scene, second.scene, third.scene]), before);
});

test('raw M and rest remain distinct learning situations, and both can show a chosen open variant', () => {
  const {view, first} = filmFor([{actor: 'alma', t: 1, mouthMap: {M: 'A', rest: 'F'}}]);
  paint(view, 6.5);
  assert.match(href(first), /id="A"/); assert.equal(shown(first, 'alma-mouth-open'), 1); assert.equal(shown(first, 'alma-mouth-closed'), 0);
  let context = lips.faceContext(view, 'alma-mouth-open', 6.5, 6.5);
  assert.equal(context.viseme, 'M'); assert.equal(context.cueId, 'm'); assert.equal(context.effectiveVariant, 'A');
  assert.equal(context.defaultVariantMap.M, 'rest');
  paint(view, 8.5);
  assert.match(href(first), /id="F"/); assert.equal(shown(first, 'alma-mouth-open'), 1);
  context = lips.faceContext(view, 'alma-mouth-closed', 8.5, 8.5);
  assert.equal(context.viseme, 'rest'); assert.equal(context.cueId, ''); assert.equal(context.effectiveVariant, 'F');
});

test('fixed mouth is explicit and a later Auto key resumes the learned automatic mappings', () => {
  const {view, first} = filmFor([{actor: 'alma', t: 0, mouthMap: {O: 'E'}}, {actor: 'alma', t: 1, mouth: {mode: 'fixed', variant: 'F'}}, {actor: 'alma', t: 3, mouth: {mode: 'auto'}}]);
  paint(view, .5); assert.match(href(first), /id="E"/);
  paint(view, 2); assert.match(href(first), /id="F"/);
  assert.equal(lips.faceContext(view, 'alma-head', 2, 2).state.mouth.mode, 'fixed');
  paint(view, 3.1); assert.match(href(first), /id="E"/);
  paint(view, 5); assert.match(href(first), /id="A"/);
  paint(view, 2); assert.match(href(first), /id="F"/);
});

test('eyes, mood and rewind preserve joints and authored geometry with no cumulative transforms', () => {
  const keys = [{actor: 'alma', t: 2, ...face.preset('surprised')}, {actor: 'alma', t: 5, eyes: 'left', mood: 'happy'}];
  const {view, first} = filmFor(keys), original = JSON.stringify(first.scene), fresh = filmFor(keys);
  paint(view, 1); const initial = snapshot(first);
  engine.paint(view, 3);
  const anchors = Object.fromEntries(['alma', 'alma-head', 'alma-jaw', 'alma-mouth-open'].map(id => [id, first.nodes[id].el.getAttribute('transform')]));
  lips.apply(view, 3, 3);
  for (const [id, transform] of Object.entries(anchors)) assert.equal(first.nodes[id].el.getAttribute('transform'), transform, id + ' anchor');
  const wide = first.nodes['alma-eyes'].shape.getAttribute('transform');
  assert.match(wide, /scale\(1 1\.22\)/);
  paint(view, 3); assert.equal(first.nodes['alma-eyes'].shape.getAttribute('transform'), wide);
  paint(view, 5.3); assert.match(first.nodes['alma-pupils'].shape.getAttribute('transform'), /translate\(-4 0\)/);
  assert.match(href(first), /id="A"/, 'combined expression retains spoken A');
  paint(view, 8.5); assert.notEqual(first.nodes['alma-mouth-closed'].shape.getAttribute('d'), first.nodes['alma-mouth-closed'].part.geo.d);
  paint(view, 1); assert.deepEqual(snapshot(first), initial, 'rewind restores original graphics and mouth');
  paint(view, 8.5); paint(fresh.view, 8.5); assert.deepEqual(snapshot(first), snapshot(fresh.first), 'random access equals a fresh reopened view');
  assert.equal(JSON.stringify(first.scene), original);
});

test('a keyed blink releases after its short interval and seeks reproduce the same eyelids', () => {
  const {view, first} = filmFor([{actor: 'alma', t: 2, eyes: 'blink'}]);
  paint(view, 1.9); assert.equal(shown(first, 'alma-eye-lids'), 0);
  paint(view, 2.1); assert.equal(shown(first, 'alma-eye-lids'), 1); assert.equal(shown(first, 'alma-pupils'), 0);
  paint(view, 2.29); assert.equal(shown(first, 'alma-eye-lids'), 0); assert.equal(shown(first, 'alma-pupils'), 1);
  paint(view, 2.1); assert.equal(shown(first, 'alma-eye-lids'), 1);
  paint(view, 1.9); assert.equal(shown(first, 'alma-eye-lids'), 0);
});

test('reset and removing all keys restore facial graphics and authored mouth opacity', () => {
  const {view, first, film} = filmFor([{actor: 'alma', t: 0, eyes: 'closed', mood: 'happy', mouth: {mode: 'fixed', variant: 'A'}}]);
  paint(view, 8.5);
  lips.reset(view);
  assert.equal(shown(first, 'alma-mouth-open'), 0);
  assert.equal(shown(first, 'alma-mouth-closed'), 1);
  assert.equal(shown(first, 'alma-eye-lids'), 0);
  assert.equal(first.nodes['alma-mouth-closed'].shape.getAttribute('d'), first.nodes['alma-mouth-closed'].part.geo.d);
  paint(view, 8.5); film.musical.faceKeys = []; paint(view, 8.5);
  assert.equal(shown(first, 'alma-eye-lids'), 0);
  assert.equal(shown(first, 'alma-mouth-open'), 0);
  assert.equal(first.nodes['alma-brows'].shape.getAttribute('transform'), null);
});

test('head-only previews use real variants, clear previous live distortion, and do not alter the source', () => {
  const {view, first} = filmFor([{actor: 'alma', t: 0, ...face.preset('surprised')}]);
  paint(view, 3);
  const before = JSON.stringify(first.scene), miniature = {scene: first.scene, wiki: first.wiki, nodes: {}, localTime: 3};
  for (const [id, node] of Object.entries(first.nodes)) if(id !== 'alma' && id !== 'alma-body') miniature.nodes[id] = {part: node.part, el: new Node(node.el.attrs), shape: new Node(node.shape.attrs)};
  face.preview(miniature, 'alma', {eyes: 'open', mood: 'neutral', mouth: {mode: 'fixed', variant: 'E'}});
  assert.equal(miniature.nodes['alma-eyes'].shape.getAttribute('transform'), null);
  assert.match(href(miniature), /id="E"/); assert.equal(shown(miniature, 'alma-mouth-open'), 1);
  const once = snapshot(miniature);
  face.preview(miniature, 'alma', {eyes: 'open', mood: 'neutral', mouth: {mode: 'fixed', variant: 'E'}});
  assert.deepEqual(snapshot(miniature), once);
  face.preview(miniature, 'alma', {eyes: 'blink'}); assert.equal(shown(miniature, 'alma-eye-lids'), 1);
  assert.equal(JSON.stringify(first.scene), before);
  assert.notEqual(first.nodes['alma-eyes'].shape.getAttribute('transform'), null, 'live preview stays unchanged');
});

test('standalone scene rendering reads global film rules and recording time', () => {
  const source = scene(), line = source.parts.find(part => part.id === 'o');
  line.lipSync.timing = 'auto';
  const view = viewFor(source), film = {musical: {faceKeys: [{actor: 'alma', t: 102, mouthMap: {O: 'E'}}]}}, options = {film, sceneTitle: 'First', duration: 120, audioClips: [{id: 'take', sceneTitle: 'First', cueId: 'o', text: 'OOOO', start: 100, duration: 4, offset: 0, sourceDuration: 4}]};
  paint(view, 1, options, 101); assert.match(href(view), /id="O"/);
  paint(view, 3, options, 103); assert.match(href(view), /id="E"/);
  const context = lips.faceContext(view, 'alma-head', 3, 103, options);
  assert.equal(context.viseme, 'O'); assert.equal(context.effectiveVariant, 'E'); assert.equal(context.state.time, 103);
  paint(view, 1, options, 101); assert.match(href(view), /id="O"/);
});

test('hidden scenes receive no recurring facial or lipsync writes and invalidation can cross a scene boundary', () => {
  const {view, first, second} = filmFor([{actor: 'alma', t: 0, eyes: 'wide', mouthMap: {O: 'E'}}]);
  paint(view, 1); assert.equal(writes(second), 0);
  lips.invalidate(view);
  paint(view, 11); const asleep = writes(first);
  paint(view, 12); paint(view, 13);
  assert.equal(writes(first), asleep, 'hidden scene must remain untouched between active frames');
  paint(view, 1); assert.match(href(first), /id="E"/);
  assert.match(first.nodes['alma-eyes'].shape.getAttribute('transform'), /scale\(1 1\.22\)/);
});

test('the shipped Turn Around head resolves all facial layers and its actual six mouth drawings', () => {
  const production = JSON.parse(fs.readFileSync(new URL('editions/turn-around/tiddlers/production.json', root), 'utf8'));
  const first = production.find(t => t.title === 'Turn Around · 01 · The Whole World');
  const source = JSON.parse(first.text), before = JSON.stringify(source), description = face.resolve(source, 'prisoner-head-drawing');
  assert.equal(description.actorId, 'prisoner'); assert.equal(description.headId, 'prisoner-head');
  assert.deepEqual(plain(description.parts), {eyes: ['prisoner-eyes'], pupils: ['prisoner-pupils'], brows: ['prisoner-brows'], lids: ['prisoner-eye-lids'], open: 'prisoner-mouth-open', closed: 'prisoner-mouth-closed'});
  assert.deepEqual(plain(description.variants).map(variant => variant.id), ['rest', 'A', 'E', 'O', 'F', 'C']);
  assert.equal(JSON.stringify(source), before);
});

function timedScene(frames, overrides = {}) {
  const source = scene('Timed dialogue');
  source.parts = source.parts.filter(part => part.type !== 'text');
  const line = cue('timed', 'alma', 'OOOOOOOO', 0, 10, overrides.timing || 'script');
  Object.assign(line.lipSync, {visemes: frames, visemeText: line.text, ...overrides});
  source.parts.push(line); return {source, line, view: viewFor(source)};
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message || `${actual} should equal ${expected}`);

test('authored viseme seconds, exact consonant closures and terminal rest survive longer captions', () => {
  const frames = [{t: 0, viseme: 'rest'}, {t: 1, viseme: 'A', open: .8}, {t: 2, viseme: 'M', open: 1}, {t: 2.5, viseme: 'O', open: .6}, {t: 4, viseme: 'rest'}];
  const {source, line, view} = timedScene(frames), before = JSON.stringify(source);
  assert.equal(paint(view, .5)[0].viseme, 'rest');
  let value = paint(view, 1.5)[0]; assert.equal(value.viseme, 'A'); near(value.open, .8);
  value = paint(view, 2)[0]; assert.equal(value.viseme, 'M'); assert.equal(value.open, 0); assert.equal(shown(view, 'alma-mouth-open'), 0);
  value = paint(view, 2.75)[0]; assert.equal(value.viseme, 'O'); near(value.open, .6);
  value = paint(view, 4.01)[0]; assert.equal(value.viseme, 'rest'); assert.equal(value.open, 0); assert.equal(shown(view, 'alma-mouth-open'), 0);
  assert.equal(JSON.stringify(source), before);
  source.duration = 20; line.keys[line.keys.length - 1].t = 20;
  value = paint(view, 1.5)[0]; assert.equal(value.viseme, 'A'); near(value.open, .8);
  value = paint(view, 10)[0]; assert.equal(value.viseme, 'rest');
  paint(view, 2.75); const forward = snapshot(view); paint(view, 10); paint(view, 2.75); assert.deepEqual(snapshot(view), forward);
});

test('authored energy uses the original continuous 60 ms triangular envelope without softening M/rest', () => {
  const {view} = timedScene([{t: 0, viseme: 'A', open: .2}, {t: 2, viseme: 'A', open: 1}, {t: 3, viseme: 'M'}, {t: 3.5, viseme: 'A', open: 1}, {t: 4, viseme: 'rest'}]);
  near(paint(view, 1.9)[0].open, .2);
  near(paint(view, 2)[0].open, .6);
  near(paint(view, 2.015)[0].open, .9);
  near(paint(view, 2.1)[0].open, 1);
  const before = paint(view, 1.999)[0].open, after = paint(view, 2.001)[0].open;
  assert.ok(after > before && after - before < .053, 'subframe seeks remain continuous across an energy boundary');
  assert.equal(paint(view, 3)[0].open, 0); assert.equal(paint(view, 4)[0].open, 0);
});

test('timed frame normalization copies, sorts, validates and uses the later duplicate frame', () => {
  const frames = [{t: 2, viseme: 'A', open: .9}, {t: -1, viseme: 'E'}, {t: 1, viseme: 'o', open: 5}, null, {t: 1, viseme: 'f', open: .3}, {t: 3, viseme: 'REST', open: 1}, {t: 'bad', viseme: 'A'}, {t: 4, viseme: 'unknown'}];
  const {source, view} = timedScene(frames), before = JSON.stringify(frames), compiled = lips.compile(source).cues[0].visemes;
  assert.deepEqual(plain(compiled).map(({t, viseme, open}) => ({t, viseme, open})), [{t: 1, viseme: 'F', open: .3}, {t: 2, viseme: 'A', open: .9}, {t: 3, viseme: 'rest', open: 0}]);
  assert.equal(paint(view, 1.5)[0].viseme, 'F'); assert.equal(JSON.stringify(frames), before);
});

test('timed take trimming and global offsets retain the authored point and invalidate on text or audio replacement', () => {
  const {source, line, view} = timedScene([{t: 0, viseme: 'rest'}, {t: 1, viseme: 'A', open: .8}, {t: 2, viseme: 'E', open: .5}, {t: 3, viseme: 'rest'}], {timing: 'auto', visemeAudioAsset: 'Original take'});
  const clip = {id: 'take', cueId: 'timed', sceneTitle: source._title, text: line.text, asset: 'Original take', start: 100, offset: 2, duration: 2, sourceDuration: 4};
  const options = {sceneTitle: source._title, audioClips: [clip], duration: 120};
  let value = paint(view, 1, options, 100.2)[0]; assert.equal(value.viseme, 'E'); near(value.open, .5);
  line.lipSync.offset = .5;
  assert.equal(paint(view, 1, options, 100.2).length, 0);
  value = paint(view, 1, options, 100.7)[0]; assert.equal(value.viseme, 'E');
  clip.asset = 'Replacement take';
  value = paint(view, 1, options, 100.7)[0]; assert.equal(value.viseme, 'O', 'a replaced recording uses the letter approximation, not stale take timing');
  clip.asset = 'Original take'; line.text = 'AAAAAAAA';
  assert.equal(lips.compile(source).cues[0].visemes, null, 'editing the caption invalidates its authored frame text');
  line.lipSync.timing = 'script'; line.lipSync.offset = 0;
  value = paint(view, 1.5)[0]; assert.equal(value.viseme, 'A'); near(value.open, .94);
  line.lipSync.visemeText = line.text;
  value = paint(view, 1.5)[0]; assert.equal(value.viseme, 'A'); near(value.open, .8);
});

test('in-place authored viseme edits refresh cached timing, shape and energy without a reload', () => {
  const {line, view} = timedScene([{t: 0, viseme: 'A', open: .8}, {t: 4, viseme: 'rest'}]);
  assert.equal(paint(view, 1)[0].viseme, 'A');
  line.lipSync.visemes[0].viseme = 'E'; line.lipSync.visemes[0].open = .4;
  let value = paint(view, 1)[0]; assert.equal(value.viseme, 'E'); near(value.open, .4);
  line.lipSync.visemes[0].t = 2;
  assert.equal(paint(view, 1)[0].viseme, 'rest');
  value = paint(view, 3)[0]; assert.equal(value.viseme, 'E'); near(value.open, .4);
});

test('learned choices overlay timed speech while retaining its original energy, jaw motion and parent anchors', () => {
  const {source, view} = timedScene([{t: 0, viseme: 'O', open: .6}, {t: 2, viseme: 'M'}, {t: 3, viseme: 'rest'}], {strength: .8});
  source.musical = {faceKeys: [{actor: 'alma', t: 1, mouthMap: {O: 'E', M: 'A', rest: 'F'}}]};
  paint(view, .5); assert.match(href(view), /id="O"/);
  engine.paint(view, 1.5);
  const rootPose = view.nodes.alma.el.getAttribute('transform'), headPose = view.nodes['alma-head'].el.getAttribute('transform');
  lips.apply(view, 1.5, 1.5);
  assert.match(href(view), /id="E"/);
  let context = lips.faceContext(view, 'alma-head', 1.5, 1.5);
  assert.equal(context.viseme, 'O'); assert.equal(context.effectiveVariant, 'E'); near(context.open, .48);
  assert.equal(view.nodes.alma.el.getAttribute('transform'), rootPose); assert.equal(view.nodes['alma-head'].el.getAttribute('transform'), headPose);
  const jaw = view.nodes['alma-jaw'].el.getAttribute('transform');
  near(Number(/^translate\(1 ([^)]+)\)/.exec(jaw)[1]), 2 + .48 * 1.5);
  assert.match(jaw, /rotate\(4\) scale\(1 1\)/);
  const scale = /scale\(([^ ]+) ([^)]+)\)/.exec(view.nodes['alma-mouth-open'].shape.getAttribute('transform'));
  near(Number(scale[1]), .95 + .1 * .48); near(Number(scale[2]), .85 + .3 * .48);
  paint(view, 2.5); context = lips.faceContext(view, 'alma-head', 2.5, 2.5);
  assert.equal(context.viseme, 'M'); assert.match(href(view), /id="A"/); assert.equal(shown(view, 'alma-mouth-open'), 1); assert.equal(shown(view, 'alma-mouth-closed'), 0);
  assert.equal(view.nodes['alma-jaw'].el.getAttribute('transform'), 'translate(1 2) rotate(4) scale(1 1) translate(0 0)');
  paint(view, 3.5); assert.match(href(view), /id="F"/);
  paint(view, .5); assert.match(href(view), /id="O"/);
});

test('the first shipped Turn Around take keeps its authored O frame and measured envelope', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('editions/turn-around/tiddlers/production.json', root), 'utf8'));
  const title = 'Turn Around · 01 · The Whole World', source = {...JSON.parse(rows.find(row => row.title === title).text), _title: title};
  const film = JSON.parse(rows.find(row => row.title === 'Turn Around · Complete performance (film)').text);
  const clip = film.musical.audioClips.find(item => item.sceneTitle === title && item.cueId === 'spoken-3');
  const line = source.parts.find(part => part.id === 'spoken-3'), at = clip.start + .219, view = viewFor(source), before = JSON.stringify(source);
  const result = paint(view, at, {film, audioClips: film.musical.audioClips, duration: film.duration}, at).find(value => value.target === 'prisoner');
  assert.equal(result.cueId, 'spoken-3'); assert.equal(result.viseme, 'O');
  near(result.open, (.446 + .999) / 2 * line.lipSync.strength);
  const context = lips.faceContext(view, 'prisoner-head', at, at, {film, audioClips: film.musical.audioClips});
  assert.equal(context.viseme, 'O'); assert.equal(context.effectiveVariant, 'O');
  assert.equal(JSON.stringify(source), before);
});
