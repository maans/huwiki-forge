import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {correctScene} from '../scripts/fix-theseus-prop-layers.mjs';
const json=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
test('the small AniMus workshop keeps large productions separate and preserves their demo routes',async()=>{
 const manifest=await json('editions/animus/manifest.json'),catalog=await json('catalog/editions.json'),gallery=await json('editions/animus/tiddlers/gallery.json');
 assert(!manifest.plugins.some(p=>/animus-example-|animus-theme-greek/.test(p)));assert(manifest.plugins.some(p=>p.includes('animus-starter-kenney')));
 const start=gallery.find(t=>t.title==='AniMus Forge I · Start').text;
 for(const id of ['animus-orchestra','animus-tinderbox','turn-around','theseus-ship']){assert(start.includes('demo/?edition='+id));assert(catalog.editions.find(e=>e.id===id).home.hidden);}
 assert(start.includes('target="_blank"'));assert(!start.includes('<$musical-stage'));
 for(const [id,plugin] of [['animus-orchestra','animus-example-orchestra'],['animus-tinderbox','animus-example-fyrtoejet'],['animus-harbour','animus-theme-greek-harbour']]){const own=await json('editions/'+id+'/manifest.json');assert.equal(own.id,id);assert(own.plugins.some(p=>p.includes('/'+plugin+'/')));}
});
test('Theseus table and plank move behind all actors as one identity group, preserving authored poses',()=>{
 const scene={parts:[{id:'harbour'},{id:'pip',keys:[{t:0,x:90}]},{id:'pip-hand',parent:'pip'},{id:'saved-parts-shelf',keys:[{t:0,x:20,r:4}]},{id:'saved-plank',keys:[{t:0,x:40,y:50,r:2}]},{id:'notches',parent:'saved-plank',keys:[{t:1,r:9}]}]};
 const keys=Object.fromEntries(scene.parts.map(p=>[p.id,structuredClone(p.keys)]));correctScene(scene);const index=id=>scene.parts.findIndex(p=>p.id===id);
 assert(index('saved-timber')<index('pip'));assert(index('saved-plank')<index('pip'));assert(index('saved-parts-shelf')<index('saved-plank'));
 assert.equal(scene.parts[index('saved-plank')].parent,'saved-timber');assert.equal(scene.parts[index('notches')].parent,'saved-plank');
 for(const [id,pose] of Object.entries(keys))assert.deepEqual(scene.parts[index(id)].keys,pose);
 const once=JSON.stringify(scene);correctScene(scene);assert.equal(JSON.stringify(scene),once,'migration is idempotent');
});
