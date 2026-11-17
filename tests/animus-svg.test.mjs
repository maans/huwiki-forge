import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../plugins/musical/src/' + name, import.meta.url), 'utf8');
const model = {};
vm.runInNewContext(source('svg-model.js'), {exports: model});
const workshop = {};
vm.runInNewContext(source('svg-layers.js'), {exports: workshop, require(id) {
  if (id.endsWith('/svg-model.js')) return model;
  if (id.endsWith('/engine.js')) return {imageHref: (_wiki, part) => part.imageData || ''};
  throw Error(id);
}});
const plain = value => JSON.parse(JSON.stringify(value));

test('SVG layers and frames retain independently editable vector paths', () => {
  const drawing = model.create({x: -10, y: -20, w: 100, h: 80}, 'Arm');
  const first = drawing.layers[0];
  drawing.frames[0].artwork[first.id].push({id: 'line', type: 'path', d: 'M0 0 L15 28', fill: 'none', stroke: '#123456', strokeWidth: 3});
  const sleeve = model.addLayer(drawing, 'Sleeve', first.id);
  drawing.frames[0].artwork[sleeve.id].push({id: 'sleeve', type: 'rect', left: 0, top: 0, width: 20, height: 10, fill: '#b00'});
  const frame = model.addFrame(drawing, 0, true);
  drawing.frames[frame].artwork[first.id][0].d = 'M0 0 L30 10';
  assert.equal(drawing.frames[0].artwork[first.id][0].d, 'M0 0 L15 28');
  assert.notEqual(drawing.frames[0].artwork[first.id][0].id, drawing.frames[frame].artwork[first.id][0].id);
  const serialized = model.frameSvg(drawing, frame);
  assert.match(serialized, /M0 0 L30 10/);
  assert.match(serialized, /<rect/);
  assert.doesNotMatch(serialized, /<canvas|data:image\/png/);
  model.moveLayer(drawing, sleeve.id, -1);
  assert.equal(drawing.layers[0].id, sleeve.id);
  const copy = model.duplicateLayer(drawing, sleeve.id);
  assert.notEqual(copy.id, sleeve.id);
  drawing.frames[0].artwork[copy.id][0].width = 50;
  assert.equal(drawing.frames[0].artwork[sleeve.id][0].width, 20);
  model.removeLayer(drawing, sleeve.id);
  for (const f of drawing.frames) assert.equal(f.artwork[sleeve.id], undefined);
});

test('frame exposure, looping and seeking use the same deterministic clock', () => {
  const drawing = model.create();
  model.addFrame(drawing, 0, true);
  drawing.fps = 10;
  drawing.frames[0].hold = 2;
  assert.ok(Math.abs(model.duration(drawing) - .3) < 1e-9);
  assert.equal(model.frameAt(drawing, .199), 0);
  assert.equal(model.frameAt(drawing, .2), 1);
  assert.equal(model.frameAt(drawing, 3), 1);
  drawing.loop = true;
  assert.equal(model.frameAt(drawing, .31), 0);
  drawing.start = 1;
  const keys = plain(model.frameTimes(drawing, 1.8));
  assert.deepEqual(keys, [{t: 1, frame: 0}, {t: 1.2, frame: 1}, {t: 1.3, frame: 0}, {t: 1.5, frame: 1}, {t: 1.6, frame: 0}]);
});

test('undo/redo snapshots preserve drawings without shared mutable references', () => {
  const drawing = model.create();
  const history = new model.History(drawing);
  model.addLayer(drawing, 'Head');
  history.commit(drawing);
  const restored = history.undo();
  assert.equal(restored.layers.length, 1);
  restored.layers[0].name = 'Unrelated';
  const redone = history.redo();
  assert.equal(redone.layers.length, 2);
  assert.notEqual(redone.layers[0].name, 'Unrelated');
});

function fakeExport(drawing) {
  return drawing.layers.map(layer => ({id: layer.id, name: layer.name, visible: layer.visible, bounds: drawing.bounds,
    frames: drawing.frames.map(frame => ({id: frame.id, svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L1 1"/></svg>'})),
    times: model.frameTimes(drawing, 1)}));
}

test('saving SVG layers replaces the original appearance once and preserves joints and motion', () => {
  const arm = {id: 'arm', type: 'path', name: 'Arm', parent: 'body', geo: {d: 'M0 0 L0 40'}, stroke: '#000', pivot: {x: 3, y: 4}, keys: [{t: 0, x: 12, y: 13, r: 20}, {t: 2, x: 12, y: 13, r: -20}]};
  const wrist = {id: 'wrist', type: 'circle', parent: 'arm', geo: {r: 5}, keys: [{t: 0, y: 40}]};
  const parts = [{id: 'body', type: 'group'}, arm, wrist];
  const keys = JSON.stringify(arm.keys);
  const drawing = workshop.fromPart({}, arm);
  model.addLayer(drawing, 'Sleeve');
  model.addFrame(drawing, 0, true);
  drawing.start = .1;
  const added = workshop.applyToParts(parts, arm, fakeExport(drawing), {model: drawing});
  assert.equal(arm.type, 'group');
  assert.equal(arm.id, 'arm');
  assert.equal(arm.parent, 'body');
  assert.equal(JSON.stringify(arm.keys), keys);
  assert.deepEqual(arm.pivot, {x: 3, y: 4});
  assert.equal(wrist.parent, 'arm');
  assert.equal(parts.filter(p => p.id === 'arm').length, 1);
  assert.equal(arm.geo, undefined);
  assert.equal(added.length, 2);
  for (const layer of added) {
    assert.equal(layer.type, 'image');
    assert.equal(layer.parent, 'arm');
    assert.equal(layer.keys[0].opacity, 0);
    assert.equal(layer.keys[1].t, .1);
    assert.equal(layer.keys[1].easing, 'step');
    assert.match(layer.variants[0].imageData, /^data:image\/svg\+xml/);
  }
  const previousIds = added.map(p => p.id);
  const reopened = workshop.fromPart({}, arm);
  assert.equal(reopened.layers.length, 2);
  assert.equal(reopened.frames.length, 2);
  workshop.applyToParts(parts, arm, fakeExport(reopened), {model: reopened});
  assert.equal(parts.length, 5);
  assert.deepEqual(parts.filter(p => p.svgLayerOwner === 'arm').map(p => p.id), plain(previousIds));
  model.removeLayer(reopened, reopened.layers[1].id);
  workshop.applyToParts(parts, arm, fakeExport(reopened), {model: reopened});
  assert.equal(parts.length, 4);
  assert.equal(parts.includes(wrist), true);
});

test('capacity rejection leaves the scene unchanged', () => {
  const root = {id: 'root', type: 'group'};
  const parts = [root, ...Array.from({length: 299}, (_, index) => ({id: 'p' + index}))];
  const drawing = model.create();
  const before = JSON.stringify(parts);
  assert.throws(() => workshop.applyToParts(parts, root, fakeExport(drawing), {model: drawing}), /300 parts/);
  assert.equal(JSON.stringify(parts), before);
});

test('exported SVG frames play through the existing CutOut state evaluator', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../plugins/cutout/dist/plugin.json', import.meta.url), 'utf8'));
  const engineSource = JSON.parse(pkg.text).tiddlers['$:/plugins/huwiki/cutout/engine.js'].text;
  const engine = {};
  vm.runInNewContext(engineSource, {exports: engine, require: () => ({t: value => value})});
  const part = {id: 'drawing', type: 'group', keys: [{t: 0, x: 50, y: 60}]}, parts = [part];
  const drawing = model.create();
  model.addFrame(drawing, 0, true);
  drawing.fps = 10;
  drawing.start = .5;
  drawing.loop = true;
  const [layer] = workshop.applyToParts(parts, part, fakeExport(drawing), {model: drawing});
  assert.equal(engine.state(layer, .49).opacity, 0);
  assert.equal(engine.state(layer, .5).opacity, 1);
  assert.equal(engine.state(layer, .5).variantId, layer.variants[0].id);
  assert.equal(engine.state(layer, .61).variantId, layer.variants[1].id);
  assert.equal(engine.state(layer, .71).variantId, layer.variants[0].id);
  assert.equal(engine.state(layer, .52).variantId, layer.variants[0].id);
});

test('SVG output escapes authored text and attribute strings', () => {
  const drawing = model.create();
  drawing.frames[0].artwork[drawing.layers[0].id].push({id: '"bad', type: 'text', text: '<script>alert(1)</script>', fill: '#fff'});
  const svg = model.frameSvg(drawing, 0);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /data-svg-shape="&quot;bad"/);
});
