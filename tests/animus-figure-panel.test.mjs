import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Matrix, SvgNode, matrixFor, svgDocument} from './helpers/svg-test-dom.mjs';

const root = new URL('../', import.meta.url), read = path => fs.readFileSync(new URL(path, root), 'utf8'), plain = value => JSON.parse(JSON.stringify(value));
const cutout = JSON.parse(JSON.parse(read('plugins/cutout/dist/plugin.json')).text).tiddlers;
const sources = Object.fromEntries(['playlist', 'motion', 'sfx', 'editor', 'puppet', 'track-preview', 'lipsync', 'face', 'figure-panel'].map(name => [name, read('plugins/musical/src/' + name + '.js')]));
// The production code uses native DOM cloning. Add that independent operation
// to the minimal SVG test surface; its existing matrix math remains unchanged.
SvgNode.prototype.getAttributeNames = function() {return [...new Set([...Object.keys(this.attributes), ...(this.className ? ['class'] : [])])];};
SvgNode.prototype.cloneNode = function(deep) {const node = new SvgNode(this.localName, this.ownerDocument);for(const name of this.getAttributeNames()) node.setAttribute(name, this.getAttribute(name));node._text = this._text;Object.assign(node.style, this.style);if(deep) for(const child of this.children) node.appendChild(child.cloneNode(true));return node;};
function nativeEvents(doc) {
  const captured = {}, add = doc.addEventListener.bind(doc), remove = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, fn, options) => {if(options === true || options?.capture) (captured[type] ||= []).push(fn);else add(type, fn, options);};
  doc.removeEventListener = (type, fn, options) => {if(options === true || options?.capture) captured[type] = (captured[type] || []).filter(listener => listener !== fn);else remove(type, fn, options);};
  return (target, type, values = {}) => {
    const event = {type, target, button: 0, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 1000, clientY: 400, detail: 1, defaultPrevented: false, stopped: false, immediate: false,
      preventDefault() {this.defaultPrevented = true;}, stopPropagation() {this.stopped = true;}, stopImmediatePropagation() {this.stopped = true;this.immediate = true;}, ...values};
    for(const listener of (captured[type] || []).slice()) {listener(event);if(event.immediate) break;}
    return event.stopped ? event : target.dispatch(type, event);
  };
}
class Tiddler {constructor(...items) {this.fields = Object.assign({}, ...items.filter(Boolean).map(item => item.fields || item));}}
function modules(globals = {}) {
  const cache = {};
  function load(name) {
    if(cache[name]) return cache[name];const exported = {};cache[name] = exported;
    if(name.endsWith('/i18n.js')) return Object.assign(exported, {t: value => value, contentName: (_title, value) => value, language: () => 'en'});
    const musical = /\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(name), code = musical ? sources[musical[1]] : cutout[name]?.text;
    if(!code) throw Error('Test module missing: ' + name);vm.runInNewContext(code, {exports: exported, require: load, $tw: {Tiddler}, console, ...globals});return exported;
  }
  return {engine: load('$:/plugins/huwiki/cutout/engine.js'), editor: load('$:/plugins/huwiki/musical/editor.js'), motion: load('$:/plugins/huwiki/musical/motion.js'), lips: load('$:/plugins/huwiki/musical/lipsync.js'), panel: load('$:/plugins/huwiki/musical/figure-panel.js')};
}
const pose = (t = 0, values = {}) => ({t, x: 0, y: 0, r: 0, sx: 1, sy: 1, opacity: 1, easing: 'linear', ...values});
function scene(mirror = false) {
  return {version: 1, width: 800, height: 450, duration: 10, parts: [
    {id: 'prisoner', name: 'Prisoner', type: 'group', keys: [pose(0, {x: mirror ? 420 : 230, y: 280, r: 7, sx: mirror ? -.95 : 1, sy: .95})]},
    {id: 'prisoner-body', name: 'Body', type: 'rect', parent: 'prisoner', geo: {x: -30, y: -60, w: 60, h: 120}, keys: [pose()]},
    {id: 'prisoner-head', name: 'Head', type: 'group', parent: 'prisoner', pivot: {x: 2, y: 3}, keys: [pose(0, {y: -95, r: 8}), pose(10, {y: -95, r: 42})]},
    {id: 'prisoner-head-drawing', name: 'Face, hair and neck', type: 'image', parent: 'prisoner-head', geo: {x: -40, y: -70, w: 80, h: 95}, variants: [{id: 'head', imageData: 'data:image/svg+xml,<svg id="head"/>'}], keys: [pose()]},
    {id: 'prisoner-eyes', name: 'Eyes', type: 'ellipse', parent: 'prisoner-head', geo: {rx: 16, ry: 6}, keys: [pose(0, {y: -30})]},
    {id: 'prisoner-pupils', name: 'Gaze', type: 'ellipse', parent: 'prisoner-head', geo: {rx: 9, ry: 5}, keys: [pose(0, {y: -30})]},
    {id: 'prisoner-eye-lids', name: 'Eyelids', type: 'path', parent: 'prisoner-head', geo: {d: 'M-16 0 L16 0'}, keys: [pose(0, {y: -30, opacity: 0})]},
    {id: 'prisoner-jaw', name: 'Jaw', type: 'group', parent: 'prisoner-head', keys: [pose(0, {y: -10})]},
    {id: 'prisoner-mouth-open', name: 'Mouth', type: 'image', parent: 'prisoner-jaw', geo: {x: -10, y: 0, w: 20, h: 15}, variants: ['rest', 'A', 'E', 'O', 'F', 'C'].map(id => ({id, name: id, imageData: 'data:image/svg+xml,<svg id="' + id + '"/>'})), keys: [pose(0, {opacity: 0})]},
    {id: 'prisoner-mouth-closed', name: 'Closed mouth', type: 'path', parent: 'prisoner-jaw', geo: {d: 'M-8 0 Q0 4 8 0'}, keys: [pose()]},
    {id: 'prisoner-arm-right', name: 'Right upper arm', type: 'group', parent: 'prisoner', keys: [pose(0, {x: 28, y: -45, r: -20}), pose(10, {x: 28, y: -45, r: 20})]},
    {id: 'prisoner-arm-right-drawing', name: 'Upper arm drawing', type: 'rect', parent: 'prisoner-arm-right', geo: {x: -10, y: 0, w: 20, h: 76}, keys: [pose()]},
    {id: 'prisoner-forearm-right', name: 'Right forearm', type: 'group', parent: 'prisoner-arm-right', keys: [pose(0, {x: 0, y: 76, r: 60})]},
    {id: 'prisoner-forearm-right-drawing', name: 'Forearm drawing', type: 'rect', parent: 'prisoner-forearm-right', geo: {x: -9, y: 0, w: 18, h: 70}, keys: [pose()]},
    {id: 'prisoner-hand-right', name: 'Hand', type: 'circle', parent: 'prisoner-forearm-right', geo: {r: 10}, keys: [pose(0, {y: 70})]},
    {id: 'other', name: 'Other actor', type: 'group', keys: [pose(0, {x: 600, y: 200})]},
    {id: 'other-body', type: 'circle', parent: 'other', geo: {r: 25}, keys: [pose()]},
    {id: 'caption', type: 'text', text: 'OOOO', keys: [pose(0), pose(10, {opacity: 0})], lipSync: {enabled: true, target: 'prisoner', open: 'prisoner-mouth-open', closed: 'prisoner-mouth-closed', timing: 'script', strength: .9, visemeText: 'OOOO', visemes: [{t: 0, viseme: 'O', open: .7}, {t: 9, viseme: 'rest'}]}}
  ]};
}
function harness({initial, motion = false, reentry = true, globals = {}, faceWork} = {}) {
  const row = (title, data) => ({title, type: 'application/json', text: JSON.stringify(data)});
  const film = {version: 1, width: 800, height: 450, duration: 20, parts: [], camera: {keys: [{t: 0, x: 400, y: 225, zoom: 1.7, r: 13, skewX: 4}]}, scenes: [{source: 'First', duration: 10}, {source: 'Second', duration: 10, speed: 2, offset: 1, loop: true}], musical: {songs: [{id: 'music', score: 'Score', start: 0, duration: 20}], animationClips: motion ? [{id: 'arm-loop', name: 'Arm loop', target: 'prisoner', start: 10, duration: 10, beatsPerLoop: 8, loop: true, motion: {'prisoner-forearm-right': [pose(0, {y: 76, r: 10}), pose(8, {y: 76, r: 50})]}}] : [], faceKeys: [{actor: 'prisoner', t: 0, eyes: 'squint', mouthMap: {O: 'E'}}]}};
  const records = plain(initial || {Film: row('Film', film), First: row('First', scene()), Second: row('Second', scene(true)), Score: {title: 'Score', type: 'text/vnd.abc', text: 'X:1\nK:C\nC D E F|'}}), writes = [], selections = [], faces = [];
  const wiki = {getTiddler: title => records[title] ? new Tiddler(records[title]) : null, getTiddlerText: (title, fallback = '') => records[title]?.text ?? fallback, getTiddlers: () => Object.keys(records), each(fn) {for(const [title, fields] of Object.entries(records)) fn(new Tiddler(fields), title);}, addTiddler(t) {records[t.fields.title] = plain(t.fields);writes.push(t.fields.title);}, getModificationFields: () => ({}), generateNewTitle: title => title};
  const api = modules(globals), doc = svgDocument(), data = api.engine.readScene(wiki, 'Film'), view = api.engine.build(doc, wiki, data, false), host = doc.createElement('main'), dock = doc.createElement('section');doc.body.appendChild(host);host.appendChild(view.svg);host.appendChild(dock);
  const native = nativeEvents(doc);
  view.svg.screenMatrix = new Matrix(.55, 0, 0, .55, 35, 20);
  let time = 13, editor = null, panel = null, layouts = 0;const clock = {at: t => t * 2};
  function repaint() {api.engine.paint(view, time);api.motion.paint(view, data, time, clock);api.lips.apply(view, time, time);if(editor) editor.paint(time);if(panel) panel.refresh();}
  const options = {doc, host, wiki, film: data, view, sceneTitle: 'Film', stageTitle: 'First', scoreTitle: 'Score', duration: () => data.duration, beatClock: () => clock, pause() {}, isPlaying: () => false, position: () => time, seek(t) {time = t;repaint();}, repaint, markOwnWrite() {}, onSelect(track) {if(reentry && panel && track.part) panel.select(track.part);}};
  editor = api.editor.attach(options);repaint();
  panel = api.panel.mount({doc, wiki, host, parent: dock, view, film: data, editor, position: () => time, pause() {}, onSelect(id) {selections.push(id);if(reentry) panel.select(id);}, onFace(value) {faces.push(plain(value));if(faceWork) faceWork(value);}, onLayout() {layouts++;if(panel) panel.refresh(true);}});
  const preview = dock.querySelector('[data-figure-preview]');preview.screenMatrix = new Matrix(.85, 0, 0, .85, 900, 260);
  return {api, doc, host, dock, data, view, editor, options, records, writes, selections, faces, panel, preview, native, get time() {return time;}, get layouts() {return layouts;}, get leaf() {return panel.context()?.view || view.clips[1].view;}};
}
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, label || `${a} should equal ${b}`);
function pointClose(a, b) {close(a.x, b.x);close(a.y, b.y);}
function clonePart(h, id) {return h.preview.querySelector('[data-cutout-id="' + id + '"]');}
function actorPoint(h, node, value = {x: 0, y: 0}, clone = false) {const actor = clone ? clonePart(h, 'prisoner') : h.leaf.nodes.prisoner.el;return actor.getScreenCTM().inverse().multiply(node.getScreenCTM()).point(value);}
function drag(h, id, degrees, finish = 'pointerup', viaHandle = false) {
  const node = clonePart(h, id), parent = node.parentNode, parentMatrix = parent.getScreenCTM(), start = viaHandle ? h.preview.getScreenCTM().point({x: Number(h.preview.querySelector('[data-figure-action="rotate"]').getAttribute('cx')), y: Number(h.preview.querySelector('[data-figure-action="rotate"]').getAttribute('cy'))}) : node.getScreenCTM().point({x: 0, y: 38});
  const p = h.editor.getPartPivot(id), anchor = parentMatrix.inverse().multiply(node.getScreenCTM()).point(p), local = parentMatrix.inverse().point(start), radians = degrees * Math.PI / 180;
  const end = parentMatrix.point({x: anchor.x + (local.x - anchor.x) * Math.cos(radians) - (local.y - anchor.y) * Math.sin(radians), y: anchor.y + (local.x - anchor.x) * Math.sin(radians) + (local.y - anchor.y) * Math.cos(radians)});
  const target = viaHandle ? h.preview.querySelector('[data-figure-action="rotate"]') : clonePart(h, id + '-drawing')?.firstChild || node.firstChild;
  target.dispatch('pointerdown', {clientX: start.x, clientY: start.y, pointerId: 7, pointerType: 'touch'});
  const canvas = h.dock.querySelector('.huw-musical-figure-canvas');canvas.dispatch('pointermove', {clientX: end.x, clientY: end.y, pointerId: 7, pointerType: 'touch'});
  if(finish) canvas.dispatch(finish, {clientX: end.x, clientY: end.y, pointerId: 7, pointerType: 'touch'});
  return {node, canvas, start, end};
}

test('selecting a forearm shows only its whole active actor with the current authored and runtime pose', () => {
  const h = harness(), before = JSON.stringify(h.data), camera = h.view.svg.getAttribute('viewBox');
  assert.equal(h.layouts, 0, 'mount cannot call workspace before initialization finishes');
  assert.equal(h.panel.select('prisoner-forearm-right-drawing'), true);
  assert.equal(h.panel.selectedPart(), 'prisoner-forearm-right');
  assert.equal(h.panel.context().scene._title, 'Second');assert.equal(h.panel.context().localTime, 7);
  assert.equal(h.dock.querySelector('[data-figure-panel]').getAttribute('data-figure-actor'), 'prisoner');
  assert.ok(clonePart(h, 'prisoner-head'));assert.ok(clonePart(h, 'prisoner-hand-right'));assert.equal(clonePart(h, 'other'), null);assert.equal(clonePart(h, 'caption'), null);
  for(const id of ['prisoner', 'prisoner-head', 'prisoner-arm-right', 'prisoner-forearm-right', 'prisoner-hand-right', 'prisoner-jaw']) {
    assert.equal(clonePart(h, id).getAttribute('transform'), h.leaf.nodes[id].el.getAttribute('transform'), id + ' current transform');
    assert.equal(clonePart(h, id).getAttribute('opacity'), h.leaf.nodes[id].el.getAttribute('opacity'));
  }
  const mouth = clonePart(h, 'prisoner-mouth-open').firstChild;
  assert.match(mouth.getAttribute('href'), /id="E"/);assert.equal(mouth.getAttribute('transform'), h.leaf.nodes['prisoner-mouth-open'].shape.getAttribute('transform'));
  assert.match(clonePart(h, 'prisoner-eyes').firstChild.getAttribute('transform'), /scale\(1 0\.46\)/);
  assert.notEqual(clonePart(h, 'prisoner-head').getAttribute('transform'), 'translate(0 -95) rotate(8) scale(1 1) translate(-2 -3)', 'workshop must not reset to frame zero');
  pointClose(actorPoint(h, clonePart(h, 'prisoner-hand-right'), {x: 0, y: 0}, true), actorPoint(h, h.leaf.nodes['prisoner-hand-right'].el));
  const matrix = h.view.svg.getScreenCTM().inverse().multiply(h.leaf.nodes.prisoner.el.parentNode.getScreenCTM()), mirrored = matrixFor(h.preview.firstChild.getAttribute('transform'));
  for(const key of ['a', 'b', 'c', 'd', 'e', 'f']) close(mirrored[key], matrix[key], 'ancestor ' + key);
  const fitted = h.preview.getAttribute('viewBox').split(' ').map(Number);assert.ok(fitted[2] > 80 && fitted[3] > 180, 'fit covers the complete figure, not the selected forearm');
  const cloned = clonePart(h, 'prisoner');h.panel.refresh(true);h.panel.select('prisoner-hand-right');assert.equal(clonePart(h, 'prisoner'), cloned);assert.equal(h.layouts, 1);
  assert.equal(h.view.svg.getAttribute('viewBox'), camera);assert.equal(JSON.stringify(h.data), before);assert.deepEqual(h.writes, []);
});

test('dragging the mirrored semantic forearm preserves its joint, moves the hand and saves a scene-local key', () => {
  const h = harness();h.panel.select('prisoner-forearm-right-drawing');
  const firstBefore = h.records.First.text, filmBefore = h.records.Film.text, source = h.leaf.scene, before = plain(source.parts), pivotBefore = actorPoint(h, h.leaf.nodes['prisoner-forearm-right'].el), handBefore = actorPoint(h, h.leaf.nodes['prisoner-hand-right'].el), camera = h.view.svg.getAttribute('viewBox'), fitted = h.preview.getAttribute('viewBox');
  const node = clonePart(h, 'prisoner-forearm-right'), editing = drag(h, 'prisoner-forearm-right', 35, null);
  assert.equal(editing.canvas.hasPointerCapture(7), true);assert.equal(clonePart(h, 'prisoner-forearm-right'), node, 'selection reentry must retain the captured tree');
  h.panel.refresh(true);assert.equal(h.preview.getAttribute('viewBox'), fitted, 'layout refresh must not refit during a gesture');
  editing.canvas.dispatch('pointerup', {pointerId: 7, clientX: editing.end.x, clientY: editing.end.y});
  assert.notEqual(h.preview.getAttribute('viewBox'), fitted, 'the completed gesture refits the whole changed actor once');
  const [left, top, width, height] = h.preview.getAttribute('viewBox').split(' ').map(Number), actor = clonePart(h, 'prisoner'), box = actor.getBBox(), toPreview = h.preview.getScreenCTM().inverse().multiply(actor.getScreenCTM());
  for(const point of [{x: box.x, y: box.y}, {x: box.x + box.width, y: box.y}, {x: box.x + box.width, y: box.y + box.height}, {x: box.x, y: box.y + box.height}].map(value => toPreview.point(value))) assert.ok(point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height, 'the edited whole figure fits after release');
  const part = source.parts.find(p => p.id === 'prisoner-forearm-right'), key = part.keys.find(k => k.t === 7);
  assert.ok(key, 'global 13 maps through scene start10, speed2 and offset1 to local7');close(key.r, 95);assert.equal(key.x, 0);assert.equal(key.y, 76);
  pointClose(actorPoint(h, h.leaf.nodes['prisoner-forearm-right'].el), pivotBefore);
  const handAfter = actorPoint(h, h.leaf.nodes['prisoner-hand-right'].el);assert.ok(Math.hypot(handAfter.x - handBefore.x, handAfter.y - handBefore.y) > 30);
  pointClose(actorPoint(h, clonePart(h, 'prisoner-hand-right'), {x: 0, y: 0}, true), handAfter);
  assert.deepEqual(plain(source.parts.filter(p => p.id !== 'prisoner-forearm-right')), before.filter(p => p.id !== 'prisoner-forearm-right'));
  assert.deepEqual(h.writes, ['Second']);assert.equal(h.records.First.text, firstBefore);assert.equal(h.records.Film.text, filmBefore);assert.equal(h.time, 13);assert.equal(h.view.svg.getAttribute('viewBox'), camera);
  const reopened = harness({initial: h.records});reopened.panel.select('prisoner-forearm-right');assert.equal(reopened.leaf.scene.parts.find(p => p.id === part.id).keys.find(k => k.t === 7).r, 95);
});

test('active motion clips receive beat keys while the authored source rig stays unchanged', () => {
  const h = harness({motion: true});h.panel.select('prisoner-forearm-right-drawing');const sourceBefore = JSON.stringify(h.leaf.scene.parts), clip = h.data.musical.animationClips[0], old = h.api.motion.sample(clip.motion['prisoner-forearm-right'], 6).r;
  drag(h, 'prisoner-forearm-right', -25);
  const key = clip.motion['prisoner-forearm-right'].find(k => k.t === 6);assert.ok(key);close(key.r, old - 25);assert.equal(key.x, 0);assert.equal(key.y, 76);
  assert.equal(h.editor.getSelection().kind, 'motion');assert.equal(JSON.stringify(h.leaf.scene.parts), sourceBefore);assert.deepEqual(h.writes, ['Film']);
});

test('click, cancellation, hiding and export suspension never persist an unfinished joint edit', () => {
  const h = harness();h.panel.select('prisoner-forearm-right');const before = JSON.stringify(h.leaf.scene.parts), shape = clonePart(h, 'prisoner-forearm-right-drawing').firstChild, screen = shape.getScreenCTM().point({x: 0, y: 35}), canvas = h.dock.querySelector('.huw-musical-figure-canvas');
  shape.dispatch('pointerdown', {clientX: screen.x, clientY: screen.y});canvas.dispatch('pointerup');assert.equal(JSON.stringify(h.leaf.scene.parts), before);assert.deepEqual(h.writes, []);
  drag(h, 'prisoner-forearm-right', 20, 'pointercancel');assert.equal(JSON.stringify(h.leaf.scene.parts), before);
  drag(h, 'prisoner-forearm-right', 20, null);h.panel.hide();assert.equal(JSON.stringify(h.leaf.scene.parts), before);assert.equal(h.panel.isOpen(), false);
  h.panel.show();drag(h, 'prisoner-forearm-right', 20, null);const restore = h.panel.suspend();assert.equal(JSON.stringify(h.leaf.scene.parts), before);assert.equal(h.panel.isOpen(), false);restore();restore();assert.equal(h.panel.isOpen(), true);
  drag(h, 'prisoner-forearm-right', 20, null);h.panel.dispose();assert.equal(JSON.stringify(h.view.clips[1].view.scene.parts), before);assert.deepEqual(h.writes, []);assert.equal(h.dock.querySelector('[data-figure-panel]'), null);
});

test('eyes and mouth route to the shared facial area, while head artwork remains a rotatable head', () => {
  const h = harness();h.panel.select('prisoner-forearm-right-drawing');const before = JSON.stringify(h.leaf.scene.parts), eyes = clonePart(h, 'prisoner-eyes').firstChild, canvas = h.dock.querySelector('.huw-musical-figure-canvas');
  h.native(eyes, 'pointerdown');assert.deepEqual(h.faces, [], 'navigation must wait for the completed tap');assert.equal(canvas.hasPointerCapture(7), true);
  h.native(canvas, 'pointerup');assert.deepEqual(h.faces, [{partId: 'prisoner-eyes', actorId: 'prisoner', headId: 'prisoner-head', tab: 'eyes'}]);
  assert.equal(h.panel.selectedPart(), 'prisoner-forearm-right', 'face return remembers the last body joint');
  h.native(clonePart(h, 'prisoner-mouth-open').firstChild, 'pointerdown', {clientY: 420});h.native(canvas, 'pointerup', {clientY: 420});assert.equal(h.faces[1].tab, 'mouth');
  assert.equal(JSON.stringify(h.leaf.scene.parts), before);assert.deepEqual(h.writes, []);
  h.panel.select('prisoner-head-drawing');const angle = h.api.engine.state(h.leaf.nodes['prisoner-head'].part, 7).r,pivotBefore = actorPoint(h, h.leaf.nodes['prisoner-head'].el, {x: 2, y: 3});
  drag(h, 'prisoner-head', 20, 'pointerup', true);
  close(h.leaf.nodes['prisoner-head'].part.keys.find(key => key.t === 7).r, angle + 20);
  pointClose(actorPoint(h, h.leaf.nodes['prisoner-head'].el, {x: 2, y: 3}), pivotBefore);assert.equal(h.faces.length, 2);
});

test('a completed facial tap cannot click through to a replacement choice, while the next deliberate card tap saves', () => {
  const h = harness();h.panel.select('prisoner-forearm-right');const before = JSON.stringify(h.data), sceneBefore = JSON.stringify(h.leaf.scene), canvas = h.dock.querySelector('.huw-musical-figure-canvas');
  h.native(clonePart(h, 'prisoner-eyes').firstChild, 'pointerdown');assert.equal(h.faces.length, 0);assert.equal(h.panel.isDragging(), true);
  h.native(canvas, 'pointerup');assert.equal(h.faces.length, 1);assert.equal(h.panel.isDragging(), false);
  // This is the browser failure: the first touch's compatibility click lands
  // on the newly installed Open-eyes card instead of the removed SVG artwork.
  h.panel.hide();const card = h.doc.createElement('button');card.textContent = 'Open eyes';h.dock.appendChild(card);card.onclick = () => h.editor.chooseFace('prisoner-eyes', {channel: 'eyes', value: 'open'});
  const compatibility = h.native(card, 'click');assert.equal(compatibility.defaultPrevented, true);assert.deepEqual(h.writes, []);assert.equal(JSON.stringify(h.data), before);assert.equal(JSON.stringify(h.leaf.scene), sceneBefore);
  h.native(card, 'pointerdown', {pointerId: 8});h.native(card, 'pointerup', {pointerId: 8});h.native(card, 'click', {pointerId: 8});
  assert.deepEqual(h.writes, ['Film']);assert.equal(h.editor.faceContext('prisoner-eyes').state.eyes, 'open');
});

test('slow facial construction keeps the compatibility-click guard and allows the next intentional tap', () => {
  let now = 10000;class Clock extends Date {static now() {return now;}}
  const h = harness({globals: {Date: Clock}, faceWork() {now += 5000;}});h.panel.select('prisoner-forearm-right');
  const before = JSON.stringify(h.data), canvas = h.dock.querySelector('.huw-musical-figure-canvas');
  h.native(clonePart(h, 'prisoner-eyes').firstChild, 'pointerdown');h.native(canvas, 'pointerup');assert.equal(now, 15000);
  h.panel.hide();const card = h.doc.createElement('button');h.dock.appendChild(card);card.onclick = () => h.editor.chooseFace('prisoner-eyes', {channel: 'eyes', value: 'open'});
  now += 100;
  assert.equal(h.native(card, 'click').defaultPrevented, true, 'five seconds spent constructing facial previews must not expire the original touch guard');
  assert.deepEqual(h.writes, []);assert.equal(JSON.stringify(h.data), before);
  // Some browsers omit the compatibility click. A new deliberate pointerdown
  // still ends that old sequence immediately, even within its guard interval.
  h.panel.show();h.native(clonePart(h, 'prisoner-eyes').firstChild, 'pointerdown', {pointerId: 8});h.native(canvas, 'pointerup', {pointerId: 8});h.panel.hide();
  now += 100;h.native(card, 'pointerdown', {pointerId: 9});h.native(card, 'pointerup', {pointerId: 9});h.native(card, 'click', {pointerId: 9});
  assert.deepEqual(h.writes, ['Film']);assert.equal(h.editor.faceContext('prisoner-eyes').state.eyes, 'open');
});

test('dragged, cancelled, multi-touch and time-changed facial taps do not navigate or write keys', () => {
  const h = harness();h.panel.select('prisoner-forearm-right');const before = JSON.stringify(h.data), canvas = h.dock.querySelector('.huw-musical-figure-canvas'), eye = () => clonePart(h, 'prisoner-eyes').firstChild;
  h.native(eye(), 'pointerdown');h.native(canvas, 'pointermove', {clientX: 1012});h.native(canvas, 'pointerup', {clientX: 1012});assert.equal(h.faces.length, 0);
  h.native(eye(), 'pointerdown');h.native(canvas, 'pointercancel');assert.equal(h.faces.length, 0);
  h.native(eye(), 'pointerdown');h.native(eye(), 'pointerdown', {pointerId: 8, isPrimary: false});h.native(canvas, 'pointerup', {pointerId: 8, isPrimary: false});h.native(canvas, 'pointerup');assert.equal(h.faces.length, 0);
  h.native(eye(), 'pointerdown');h.native(canvas, 'pointerup', {clientX: 1012});assert.equal(h.faces.length, 0, 'a large jump on release also cancels a tap');
  h.native(eye(), 'pointerdown');h.options.seek(12);h.native(canvas, 'pointerup');assert.equal(h.faces.length, 0);
  assert.deepEqual(h.writes, []);assert.equal(JSON.stringify(h.data), before);assert.equal(h.panel.selectedPart(), 'prisoner-forearm-right');
  h.native(eye(), 'pointerdown');h.native(canvas, 'pointerup');assert.equal(h.faces.length, 1, 'a fresh single-finger tap remains usable after cancellation');
});

test('seeking changes the active occurrence and cancels a gesture before it can key a different scene', () => {
  const h = harness();h.panel.select('prisoner-forearm-right');const second = h.leaf, before = JSON.stringify(second.scene.parts), oldNode = clonePart(h, 'prisoner');
  drag(h, 'prisoner-forearm-right', 20, null);h.options.seek(2);
  assert.equal(h.panel.isDragging(), false);assert.equal(JSON.stringify(second.scene.parts), before);assert.deepEqual(h.writes, []);
  assert.equal(h.panel.context().scene._title, 'First');assert.equal(h.panel.context().localTime, 2);assert.notEqual(clonePart(h, 'prisoner'), oldNode);
  assert.equal(clonePart(h, 'prisoner').getAttribute('transform'), h.view.clips[0].view.nodes.prisoner.el.getAttribute('transform'));
  h.options.seek(13);assert.equal(h.panel.context().scene._title, 'Second');assert.equal(clonePart(h, 'prisoner-head').getAttribute('transform'), second.nodes['prisoner-head'].el.getAttribute('transform'));
});

test('isolated preview removes editor-only hiding while preserving authored invisibility and keyboard joint rotation', () => {
  const h = harness(), stage = h.view.clips[1].view;stage.nodes.prisoner.el.classList.add('huw-musical-preview-hidden');stage.nodes.prisoner.el.setAttribute('style', 'display:none;opacity:.8');
  h.panel.select('prisoner-forearm-right');assert.equal(clonePart(h, 'prisoner').classList.contains('huw-musical-preview-hidden'), false);assert.doesNotMatch(clonePart(h, 'prisoner').getAttribute('style'), /display/);assert.match(clonePart(h, 'prisoner').getAttribute('style'), /opacity/);
  assert.equal(clonePart(h, 'prisoner-eye-lids').getAttribute('opacity'), '0');assert.equal(stage.nodes.prisoner.el.classList.contains('huw-musical-preview-hidden'), true);assert.equal(stage.nodes.prisoner.el.getAttribute('style'), 'display:none;opacity:.8');
  const handle = h.preview.querySelector('[data-figure-action="rotate"]');assert.equal(handle.getAttribute('tabindex'), '0');assert.equal(h.preview.getAttribute('role'), 'group');
  handle.dispatch('keydown', {key: 'ArrowRight'});assert.equal(stage.nodes['prisoner-forearm-right'].part.keys.find(key => key.t === 7).r, 65);assert.deepEqual(h.writes, ['Second']);
});
