import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('plugins/abc/dist/plugin.json',root),'utf8'));
const entries=JSON.parse(pkg.text).tiddlers,prefix='$:/plugins/huwiki/abc/',cache={};
function load(name){if(cache[name])return cache[name];const module={exports:{}};cache[name]=module.exports;
 runInNewContext(entries[prefix+name].text,{module,exports:module.exports,window:{},require:id=>load(id.slice(prefix.length))});
 return cache[name]=module.exports;
}
const ABC=load('vendor/abcjs.js'),spelling=load('minor-spelling.js'),sheet=load('sheet-layout.js'),volta=load('volta-layout.js'),acc=load('accompaniment.js');
const songs=JSON.parse(await readFile(new URL('editions/silba-atno-repertoire/tiddlers/repertoire.json',root),'utf8'));
const source=songs.find(s=>s.title.includes('Dalar'))['abc-source'];
function notes(t){return t.lines.flatMap(l=>(l.staff||[]).flatMap(s=>(s.voices||[]).flatMap(v=>v.filter(e=>e.pitches).flatMap(e=>e.pitches))));}
function audio(t){acc.prepare(ABC,t,source,{style:'custom',enabled:false,bass:'off',chords:'off',drums:'off'},false,{});return JSON.stringify(t.setUpAudio({chordsOff:true}));}
test('Real Dalarne dominant thirds read D# in Em and C# in Dm with concert audio intact',()=>{
 const baseline=audio(ABC.parseOnly(source)[0]);
 for(const [steps,name] of [[-2,'^d'],[-4,'^c'],[0,'^e']]){
  const tune=ABC.parseOnly(source,{visualTranspose:steps})[0];spelling.apply(tune);
  assert.equal(notes(tune)[7].name,name);
  assert.equal(notes(tune)[8].accidental,undefined,'the following tonic needs no redundant natural sign');
  assert.equal(audio(tune),baseline,'no pitch, duration or repeat occurrence may change');
 }
});
test('Spelling follows a major dominant, preserving other harmonies and accidental carry',()=>{
 for(const [harmony,expected] of [['B',['^d','d','e','e']],['Bm',['_e','e','=e','e']],['Eb',['_e','e','=e','e']]]){
  const t=ABC.parseOnly('X:1\nK:Em\n"'+harmony+'"_e2 e2 =e2 e2 |')[0];
  const original=JSON.stringify(t.setUpAudio({chordsOff:true}));spelling.apply(t);
  assert.deepEqual(Array.from(notes(t),p=>p.name),expected);
  assert.equal(JSON.stringify(t.setUpAudio({chordsOff:true})),original);
 }
});
test('The short second ending shares a system with the first ending at four bars per line',()=>{
 const result=JSON.parse(JSON.stringify(sheet.options(ABC,source,{'abc-bars-per-line':'4'})));
 assert.deepEqual(result.lineBreaks,[[4,9,12,16]]);
 const repeat=load('repeat-plan.js').build(ABC,source,{});
 assert.equal(repeat.order.length,32,'engraving must keep the original A/B repeat walk');
});
test('A multi-bar second ending keeps its existing system breaks',()=>{
 const b=(start,end)=>({el_type:'bar',startEnding:start,endEnding:end}),n=()=>({el_type:'note',duration:1});
 const voice=[b(),n(),b(),n(),b(),n(),b('1'),n(),b('2',true),n(),b(),n(),b(undefined,true)];
 assert.deepEqual(Array.from(volta.balance(voice,[4])),[4]);
});
test('Both notation rules are shipped from their versioned sources',async()=>{
 for(const name of ['minor-spelling.js','volta-layout.js','sheet-layout.js'])assert.equal(entries[prefix+name].text,await readFile(new URL('plugins/abc/src/'+name,root),'utf8'));
});
