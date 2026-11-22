import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const face = {};
vm.runInNewContext(readFileSync(new URL('../plugins/musical/src/face.js', import.meta.url), 'utf8'), {exports: face, require: () => ({})});

test('a flat animated head keeps its keys and artwork when facial overlays are added independently', () => {
  const parts = [{id:'actor', type:'group'}, {id:'head', parent:'actor', type:'image', name:'Head', asset:'Original', keys:[{t:0,r:10},{t:2,r:50}]}];
  const original = JSON.stringify(parts);
  const scene = {parts};
  assert.equal(face.resolve(scene,'head'), null);
  parts.push({id:'eyes', name:'Eyes', parent:'head', type:'image', facialRole:'authoredEyes'});
  assert.deepEqual(Array.from(face.resolve(scene,'head').parts.eyes), ['eyes']);
  parts.push({id:'mouth', name:'Mouth open', parent:'head', type:'image', facialRole:'authoredMouth', variants:[{id:'O',viseme:'O'}]});
  const resolved = face.resolve(scene,'actor');
  assert.equal(resolved.parts.open,'mouth');
  assert.equal(face.variantMaps(scene,resolved,{}).variantMap.O,'O');
  assert.equal(JSON.stringify(parts.slice(0,2)),original);
});
