import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root = new URL('../', import.meta.url), plain = value => JSON.parse(JSON.stringify(value));
const bundle = JSON.parse(JSON.parse(fs.readFileSync(new URL('plugins/cutout/dist/plugin.json', root), 'utf8')).text).tiddlers;
const puppetSource = fs.readFileSync(new URL('plugins/musical/src/puppet.js', root), 'utf8');
class Tiddler {constructor(...values) {this.fields = Object.assign({}, ...values.map(value => value?.fields || value));}}
function harness() {
  const source = {version: 1, kind: 'scene', width: 800, height: 450, duration: 4, _title: 'Scene', parts: [
    {id: 'body', name: 'Body', type: 'rect', geo: {x: -25, y: -50, w: 50, h: 100}, keys: [{t: 0, x: 200, y: 200, r: 0, sx: 1, sy: 1, opacity: 1}]},
    {id: 'arm', name: 'Arm', type: 'rect', parent: 'body', geo: {x: -8, y: 0, w: 16, h: 70}, pivot: {x: 2, y: 3}, keys: [{t: 0, x: 25, y: -40, r: 30, sx: 1, sy: 1, opacity: 1}, {t: 2, x: 28, y: -37, r: -20, sx: 1, sy: 1, opacity: 1}]},
    {id: 'hand', name: 'Hand', type: 'circle', parent: 'arm', geo: {r: 9}, keys: [{t: 0, x: 0, y: 70, r: 0, sx: 1, sy: 1, opacity: 1}]}
  ]};
  const film = {version: 1, width: 800, height: 450, duration: 4, parts: [], musical: {animationClips: []}}, records = {Scene: {title: 'Scene', text: JSON.stringify(source)}, Film: {title: 'Film', text: JSON.stringify(film)}}, writes = [];
  const wiki = {getTiddlerText: (title, fallback = '') => records[title]?.text ?? fallback, getTiddler: title => records[title] && new Tiddler(records[title]), addTiddler(tiddler) {records[tiddler.fields.title] = plain(tiddler.fields);writes.push(tiddler.fields.title);}};
  const cache = {};
  function load(id) {if(cache[id]) return cache[id];const exported = {};cache[id] = exported;const code = id.endsWith('/puppet.js') ? puppetSource : bundle[id]?.text;if(!code) throw Error('Missing module: ' + id);vm.runInNewContext(code, {exports: exported, require: load, $tw: {Tiddler}, console});return exported;}
  const engine = load('$:/plugins/huwiki/cutout/engine.js'), puppet = load('$:/plugins/huwiki/musical/puppet.js'), doc = svgDocument(), host = doc.createElement('main');doc.body.appendChild(host);
  let confirms = 0;doc.defaultView.confirm = () => {confirms++;return true;};
  const sceneView = engine.build(doc, wiki, source, false), view = {clips: [{view: sceneView}]};host.appendChild(sceneView.svg);engine.paint(sceneView, 0);
  const panel = puppet.mount({doc, wiki, host, view, film, sceneTitle: 'Film', stageTitle: 'Scene', editor: {redraw() {}}, pause() {}, repaint() {}, markOwnWrite() {}});
  assert.equal(panel.open('arm'), true);
  return {doc, host, panel, source, records, writes, get confirms() {return confirms;}, get overlay() {return host.querySelector('.huw-puppet-workshop');}, get canvas() {return host.querySelector('.huw-puppet-canvas');}};
}
const selected = h => h.overlay.querySelector('.huw-puppet-part.is-active')?.dataset.partId || '';
const node = (h, id) => h.canvas.querySelector('[data-cutout-id="' + id + '"]');
function gesture(h, {id = 'arm', pivot = false, pointerId = 11, dx = 21, dy = -14} = {}) {
  const target = node(h, id), hit = pivot ? target.children.find(child => child.hasAttribute('data-cutout-joint')) : target.firstChild, parent = target.parentNode.getScreenCTM(), start = parent.point({x: 10, y: 20}), end = parent.point({x: 10 + dx, y: 20 + dy});
  hit.dispatch('pointerdown', {pointerId, pointerType: 'touch', clientX: start.x, clientY: start.y});
  target.dispatch('pointermove', {pointerId, pointerType: 'touch', clientX: end.x, clientY: end.y});
  return {target, end, pointerId};
}
function finish(g, type = 'pointerup') {g.target.dispatch(type, {pointerId: g.pointerId, pointerType: 'touch', clientX: g.end.x, clientY: g.end.y});}
function save(h) {h.overlay.querySelector('.huw-puppet-save').click();return JSON.parse(h.records.Scene.text);}

test('Escape releases the selected puppet part from a field without closing or changing the draft', () => {
  const h = harness(), before = JSON.stringify(h.source), frame = h.canvas.firstChild.getAttribute('viewBox');
  assert.equal(selected(h), 'arm');
  const input = h.overlay.querySelector('.huw-puppet-fields input');input.focus();
  const event = input.dispatch('keydown', {key: 'Escape'});
  assert.equal(event.defaultPrevented, true);assert.equal(event.stopped, true);
  assert.equal(h.panel.isOpen(), true);assert.equal(selected(h), '');assert.equal(h.confirms, 0);
  assert.equal(h.canvas.querySelector('.huw-cutout-selected'), null);assert.equal(h.canvas.firstChild.getAttribute('viewBox'), frame);
  assert.equal(h.doc.activeElement, h.overlay);assert.match(h.overlay.querySelector('.huw-puppet-fields').textContent, /Vælg en del|Select a part/);
  h.overlay.dispatch('keydown', {key: 'Escape'});assert.equal(h.panel.isOpen(), true);
  assert.equal(JSON.stringify(h.source), before);assert.deepEqual(h.writes, []);
});

test('a completed empty-space tap deselects and another part is selected with one direct tap', () => {
  const h = harness(), canvas = h.canvas;
  canvas.dispatch('pointerdown', {pointerId: 7, pointerType: 'touch', clientX: 4, clientY: 5});
  assert.equal(selected(h), 'arm', 'touch down alone is not a completed blank tap');
  canvas.dispatch('pointerup', {pointerId: 8, pointerType: 'touch', clientX: 4, clientY: 5});assert.equal(selected(h), 'arm', 'another pointer cannot finish this tap');
  canvas.dispatch('pointerup', {pointerId: 7, pointerType: 'touch', clientX: 4, clientY: 5});
  assert.equal(selected(h), '');assert.equal(h.panel.isOpen(), true);assert.equal(canvas.hasPointerCapture(7), false);
  const hand = node(h, 'hand');hand.firstChild.dispatch('pointerdown', {pointerId: 7});hand.dispatch('pointerup', {pointerId: 7});assert.equal(selected(h), 'hand');
  const arm = node(h, 'arm');arm.firstChild.dispatch('pointerdown', {pointerId: 7});arm.dispatch('pointerup', {pointerId: 7});assert.equal(selected(h), 'arm', 'direct switching does not require a preliminary deselection tap');
  assert.deepEqual(h.writes, []);
});

test('moving or cancelling a blank touch leaves the current selection intact', () => {
  const h = harness(), canvas = h.canvas;
  for(const cancelType of ['pointercancel', 'lostpointercapture']) {
    canvas.dispatch('pointerdown', {pointerId: 3, pointerType: 'touch'});canvas.dispatch(cancelType, {pointerId: 3});canvas.dispatch('pointerup', {pointerId: 3});assert.equal(selected(h), 'arm');
  }
  canvas.dispatch('pointerdown', {pointerId: 3, pointerType: 'touch', clientX: 10, clientY: 10});
  canvas.dispatch('pointermove', {pointerId: 3, pointerType: 'touch', clientX: 35, clientY: 10});canvas.dispatch('pointerup', {pointerId: 3, pointerType: 'touch', clientX: 10, clientY: 10});assert.equal(selected(h), 'arm');
  canvas.dispatch('pointerdown', {pointerId: 3, pointerType: 'touch', isPrimary: false});canvas.dispatch('pointerup', {pointerId: 3});assert.equal(selected(h), 'arm');
  assert.deepEqual(h.writes, []);
});

test('Escape rolls back only the unfinished puppet movement and keeps earlier draft edits', () => {
  const h = harness(), original = plain(h.source.parts), first = gesture(h, {dx: 12, dy: 7});finish(first);
  const committed = node(h, 'arm').getAttribute('transform');assert.match(h.overlay.querySelector('output').textContent, /Ikke gemt|Not saved/);
  const interrupted = gesture(h, {dx: 35, dy: -25});assert.notEqual(node(h, 'arm').getAttribute('transform'), committed);
  h.overlay.dispatch('keydown', {key: 'Escape'});
  assert.equal(selected(h), '');assert.equal(node(h, 'arm').getAttribute('transform'), committed);assert.equal(h.panel.isOpen(), true);assert.equal(h.confirms, 0);
  assert.equal(interrupted.target.hasPointerCapture(interrupted.pointerId), false);finish(interrupted);
  const saved = save(h), arm = saved.parts.find(part => part.id === 'arm'), before = original.find(part => part.id === 'arm');
  assert.equal(h.panel.isOpen(), false);assert.deepEqual(h.writes, ['Scene']);
  assert.deepEqual(arm.keys, before.keys.map(key => ({...key, x: key.x + 12, y: key.y + 7})));
  assert.deepEqual(arm.pivot, before.pivot);assert.deepEqual(saved.parts.filter(part => part.id !== 'arm'), original.filter(part => part.id !== 'arm'));
});

test('pointer cancellation rolls back a moving joint pivot and retains all source keys', () => {
  for(const event of ['pointercancel', 'lostpointercapture']) {
    const h = harness(), before = plain(h.source.parts), g = gesture(h, {pivot: true});finish(g, event);
    assert.equal(selected(h), 'arm');assert.equal(h.panel.isOpen(), true);assert.doesNotMatch(h.overlay.querySelector('output').textContent, /Ikke gemt endnu|Not saved yet/);
    finish(g);assert.deepEqual(save(h).parts, before, event + ' must not retain a partial pivot or translate child keys');
  }
});

test('nested drawing handles its own Escape and explicit Cancel still closes the puppet workshop', () => {
  const h = harness(), nested = h.doc.createElement('section');nested.className = 'huw-svg-workshop';h.overlay.appendChild(nested);
  nested.dispatch('keydown', {key: 'Escape'});assert.equal(selected(h), 'arm');assert.equal(h.panel.isOpen(), true);
  h.overlay.querySelector('.huw-puppet-cancel').click();assert.equal(h.panel.isOpen(), false);
});
