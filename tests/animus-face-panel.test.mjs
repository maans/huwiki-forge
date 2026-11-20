import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const panel = {};
runInNewContext(readFileSync(new URL('plugins/musical/src/face-panel.js', root), 'utf8'), {exports: panel, require: () => ({})});

test('a flat custom actor exposes facial parts without treating its arms as a head', () => {
  const scene = {parts: [
    {id: 'alma', name: 'Alma', type: 'group'},
    {id: 'alma-arm', name: 'Arm', parent: 'alma'},
    {id: 'alma-leg', name: 'Leg', parent: 'alma'},
    {id: 'alma-mouth', name: 'Mouth', parent: 'alma'},
    {id: 'alma-pupils', name: 'Eyes', parent: 'alma'}
  ]};
  const context = {scene, actorId: 'alma', actorPartId: 'alma', headId: 'alma', parts: {open: 'alma-mouth', pupils: ['alma-pupils']}};
  assert.equal(panel.isFace(context, 'alma-arm'), false);
  assert.equal(panel.isFace(context, 'alma-leg'), false);
  assert.equal(panel.isFace(context, 'alma'), false, 'selecting the whole body does not open facial choices');
  assert.equal(panel.isFace(context, 'alma-mouth'), true);
  assert.equal(panel.isFace(context, 'alma-pupils'), true);
});

test('the actual Turn Around head and its descendants open the face strip', () => {
  const production = JSON.parse(readFileSync(new URL('editions/turn-around/tiddlers/production.json', root), 'utf8'));
  const scene = JSON.parse(production.find(t => t.title === 'Turn Around · 01 · The Whole World').text);
  const context = {scene, actorId: 'prisoner', actorPartId: 'prisoner', headId: 'prisoner-head', parts: {}};
  for (const id of ['prisoner-head', 'prisoner-head-drawing', 'prisoner-jaw', 'prisoner-mouth-open', 'prisoner-pupils']) {
    assert.ok(scene.parts.some(part => part.id === id));
    assert.equal(panel.isFace(context, id), true, id);
  }
  assert.equal(panel.isFace(context, 'prisoner-arm-left'), false);
  assert.equal(panel.isFace(context, 'prisoner'), false);
});
