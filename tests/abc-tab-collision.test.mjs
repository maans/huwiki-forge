import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchTabCollisions} from '../scripts/abcjs-tab-collision-patch.mjs';
const plugin=JSON.parse(await readFile(new URL('../plugins/abc/dist/plugin.json',import.meta.url),'utf8'));
const vendor=JSON.parse(plugin.text).tiddlers['$:/plugins/huwiki/abc/vendor/abcjs.js'].text;
test('ABCJS keeps chord tones when a candidate string has no matching spelling',()=>{
 const source=patchTabCollisions(vendor);
 const start=source.indexOf('function s(e,t){for(var r=[],n=0;n<t.length;n++)if(!t[n].endTie)');
 assert.ok(start>0);
 const end=source.indexOf('function h(e)',start);
 class Note{
  constructor(name){this.name=name;this.pitch={c:60,e:64}[name];this.pitchAltered=0;this.acc=0;}
  checkKeyAccidentals(){}
  emitNoAccidentals(){return this.name;}
 }
 const convert=new Function('a',source.slice(start,end)+';return s;')(Note);
 const engine={stringPitches:[40,45,50,55],strings:[['x'],['x'],['x'],['x']],
  secondPos:[[],[],[],[]],accidentals:[],measureAccidentals:{}};
 const notes=convert(engine,[{name:'c'},{name:'e'}]);
 assert.equal(notes.length,2);assert.ok(notes.every(Boolean));
 assert.deepEqual(notes.map(n=>n.note.name),['c','e']);
 assert.ok(notes.some(n=>n.num==='?'),'unresolved fingering is retained for the physical string solver');
});
test('patch is idempotent and refuses unknown upstream code',()=>{
 const once=patchTabCollisions(vendor);
 assert.equal(patchTabCollisions(once),once);
 assert.throws(()=>patchTabCollisions('unrecognized vendor'),/Unrecognized/);
});
