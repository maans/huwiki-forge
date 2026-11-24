import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('plugins/abc/dist/plugin.json',root),'utf8'));
const entries=JSON.parse(pkg.text).tiddlers,prefix='$:/plugins/huwiki/abc/',cache={};
function load(name){if(cache[name])return cache[name];const module={exports:{}};cache[name]=module.exports;
 runInNewContext(entries[prefix+name].text,{module,exports:module.exports,window:{},require:id=>load(id.slice(prefix.length))});return cache[name]=module.exports;
}
const ABC=load('vendor/abcjs.js'),balanced=load('balanced-layout.js'),engraving=load('engraving-rules.js'),acc=load('accompaniment.js');
const songs=JSON.parse(await readFile(new URL('editions/silba-atno-repertoire/tiddlers/repertoire.json',root),'utf8'));
const source=songs.find(s=>s.title.includes('Purim'))['abc-source'];
const voice=ABC.parseOnly(source)[0].deline({lineBreaks:false})[0].staff[0].voices[0];
test('Purim pickup stays with A and every pitch, duration and repeat survives',()=>{
 const tune=ABC.parseOnly(source)[0];
 function audio(t){acc.prepare(ABC,t,source,{style:'custom',enabled:false,bass:'off',chords:'off',drums:'off'},false,{});return JSON.stringify(t.setUpAudio({chordsOff:true}));}
 const before=audio(tune);
 engraving.prepare(tune,{},source);
 assert.equal(tune.getPickupLength(),.125);
 assert.ok(tune.lines[0].staff[0].voices[0].filter(e=>e.el_type==='note').length>1,'no pickup-only first system');
 assert.equal(audio(tune),before);
 const parts=tune.lines.flatMap(l=>(l.staff||[]).flatMap(s=>s.voices.flatMap(v=>v.filter(e=>e.el_type==='part').map(e=>e.title))));
 assert.deepEqual(Array.from(parts),['A','B','C']);
});
test('two-bar endings share a row with body measures when measured space permits',()=>{
 const t=ABC.parseOnly('X:1\nM:4/4\nK:C\nC8|D8|[1 E8|F8:|[2 G8|A8|')[0];
 const v=t.deline({lineBreaks:false})[0].staff[0].voices[0],raw=v.filter(e=>e.el_type==='bar').length;
 const p=balanced.plan(v,Array(raw).fill(50),70,{});
 assert.equal(p.rows.length,1,'a two-bar ending does not request a separate row');
 assert.equal(p.measures.length,6,'the extra invisible volta event is not a musical measure');
});
test('crowded two-bar endings remain intact and avoid an isolated ending row when possible',()=>{
 const t=ABC.parseOnly('X:1\nM:4/4\nK:C\nC8|D8|[1 E8|F8:|[2 G8|A8|')[0];
 const v=t.deline({lineBreaks:false})[0].staff[0].voices[0],raw=v.filter(e=>e.el_type==='bar').length;
 const p=balanced.plan(v,Array(raw).fill(70),70,{});
 const endingRows=p.rows.map(row=>p.measures.slice(row.from,row.to));
 for(const row of endingRows)assert.ok(!(row.length===2&&row.every(b=>b.ending===row[0].ending)&&row[0].ending),'do not give one two-bar ending a whole line');
 for(const label of ['1','2'])assert.equal(endingRows.filter(row=>row.some(b=>b.ending===label)).length,1);
});
test('Purim planning handles all 20 full measures, pickup, tuplets and A/B/C boundaries',()=>{
 const raw=voice.filter(e=>e.el_type==='bar').length,original=JSON.stringify(voice);
 const plan=balanced.plan(voice,Array(raw).fill(45),70,{pickup:true,parts:true});
 assert.ok(plan);assert.equal(plan.measures.length,21);assert.equal(plan.measures[0].pickup,true);
 assert.equal(plan.rows[0].from,0);assert.ok(plan.rows[0].to>1);
 for(const row of plan.rows)assert.equal(new Set(plan.measures.slice(row.from,row.to).map(b=>b.part)).size,1);
 assert.equal(JSON.stringify(voice),original,'planning never edits the parsed music');
 assert.equal(balanced.plan(voice,[],70,{}),null,'unavailable metrics retain normal wrapping');
});
test('balanced layout and pickup fix are shipped from source',async()=>{
 for(const name of ['balanced-layout.js','engraving-rules.js'])assert.equal(entries[prefix+name].text,await readFile(new URL('plugins/abc/src/'+name,root),'utf8'));
});
test('balanced layout flows through part labels by default and retains an explicit line-break choice',()=>{
 assert.equal(engraving.partLines({'abc-bars-per-line':'balanced'}),false);
 assert.equal(engraving.partLines({'abc-bars-per-line':'balanced','abc-parts-new-line':'yes'}),true);
 assert.equal(engraving.partLines({'abc-bars-per-line':'4'}),true);
});
