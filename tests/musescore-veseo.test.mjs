import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url);
const xml=require('tiddlywiki/plugins/tiddlywiki/xmldom/files/dom-parser.js');
// The existing XML dependency implements DOM Level 2; provide browser element
// traversal so the real converter runs against the original MSCX documents.
function elementTraversal(node){
 if(node.nodeType===1||node.nodeType===9){
  Object.defineProperty(node,'firstElementChild',{get(){for(let n=this.firstChild;n;n=n.nextSibling)if(n.nodeType===1)return n;return null;}});
  Object.defineProperty(node,'nextElementSibling',{get(){for(let n=this.nextSibling;n;n=n.nextSibling)if(n.nodeType===1)return n;return null;}});
 }
 for(let n=node.firstChild;n;n=n.nextSibling)elementTraversal(n);
 return node;
}
class DOMParser{parseFromString(raw,type){return elementTraversal(new xml.DOMParser().parseFromString(raw,type));}}
const converter={};runInNewContext(await readFile(new URL('../plugins/musescore-import/src/converter.js',import.meta.url),'utf8'),{exports:converter,DOMParser});
const pkg=JSON.parse(await readFile(new URL('../plugins/musescore-import/dist/plugin.json',import.meta.url),'utf8'));
const tiddlers=JSON.parse(pkg.text).tiddlers,zipModule={exports:{}},abcModule={exports:{}};
runInNewContext(tiddlers[pkg.title+'/jszip.js'].text,{module:zipModule,exports:zipModule.exports,require,setImmediate,clearImmediate,setTimeout,clearTimeout,Buffer,Uint8Array,ArrayBuffer});
runInNewContext(tiddlers[pkg.title+'/abcjs.js'].text,{module:abcModule,exports:abcModule.exports,window:{}});
const catalogue=JSON.parse(await readFile(new URL('../catalog/musescore/akustisk-elektrisk.json',import.meta.url),'utf8'));
const originals=catalogue.entries.filter(e=>e.family==='veseococek');
async function original(entry){
 const zip=await zipModule.exports.loadAsync(await readFile(new URL('../'+entry.sourcePath,import.meta.url)));
 const name=Object.keys(zip.files).find(n=>/\.mscx$/i.test(n));
 return zip.file(name).async('string');
}
function rhythm(voice){return Array.from(voice.filter(e=>e.kind==='note'||e.kind==='rest'),e=>({kind:e.kind,duration:e.dur,pitches:Array.from(e.notes||[],n=>n.pitch)}));}
function parsedMeasures(abc){
 const tune=abcModule.exports.parseOnly(abc)[0],bars=[];let bar={duration:0,pitches:[],harmonies:[]};
 for(const line of tune.lines)for(const staff of line.staff||[])for(const voice of staff.voices)for(const event of voice){
  if(event.el_type==='note'){
   bar.duration+=event.duration||0;
   bar.pitches.push(...Array.from(event.pitches||[],n=>n.pitch));
   bar.harmonies.push(...Array.from(event.chord||[],c=>c.name.replace(/♯/g,'#').replace(/♭/g,'b')));
  }else if(event.el_type==='bar'&&bar.duration>1e-8){bars.push(bar);bar={duration:0,pitches:[],harmonies:[]};}
 }
 if(bar.duration>1e-8)bars.push(bar);
 return bars;
}
for(const entry of originals)test('Veseo original '+entry.sourceFile+' expands repeated melody bars without losing time or harmony',async()=>{
 const raw=await original(entry),model=converter.parseMuse(raw,entry.sourceFile),melody=model.staves[0];
 assert.equal(model.totalMeasures,16,'the source contains sixteen measures');
 for(const [repeat,previous] of [[6,5],[10,9],[13,12],[14,13]]){
  assert.deepEqual(rhythm(melody.measures[repeat-1].voices[0]),rhythm(melody.measures[previous-1].voices[0]),'measure '+repeat+' repeats the preceding musical events');
  assert.notEqual(melody.measures[repeat-1].voices[0],melody.measures[previous-1].voices[0],'repeated measures have independent events');
 }
 assert.equal(melody.voices[0].count,139,'all 107 written notes plus 32 repeated notes are available to the importer');
 const result=converter.renderABC(model,[melody.voices[0].id],1,16,{barsPerLine:4}),bars=parsedMeasures(result.abc);
 assert.deepEqual(Array.from(result.lineBreaks),[4,8,12,16],'four full 9/8 measures per requested line');
 assert.equal(bars.length,16,'ABC has exactly the source measure count');
 assert.equal(result.notes,139,'harmonic projection does not create attacks or lose repeated notes');
 assert.equal(bars.reduce((n,b)=>n+b.pitches.length,0),139,'ABCJS reads every source/repeated melody pitch');
 for(const [i,bar] of bars.entries()){
  assert.ok(bar.pitches.length>0,'melody measure '+(i+1)+' must not become a chord-only blank');
  assert.ok(Math.abs(bar.duration-9/8)<1e-8,'measure '+(i+1)+' retains nine eighths');
 }
 const sourceHarmonies=model.staves.flatMap(st=>st.measures.flatMap(m=>m.voices.flatMap(v=>v.filter(e=>e.kind==='harmony').map(e=>e.value))));
 assert.deepEqual(bars.flatMap(b=>b.harmonies),Array.from(sourceHarmonies),'every source harmony stays in score order exactly once');
 assert.notDeepEqual(bars[5].harmonies,bars[4].harmonies,'measure6 retains its own accompaniment rather than copying the previous chord');
});

test('both MuseScore repeat spellings copy notes and rests without replaying earlier section/key/harmony events',()=>{
 for(const tag of ['RepeatMeasure','MeasureRepeat']){
  const model=converter.parseMuse('<museScore><Score><Staff id="1"><Measure><voice><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig><KeySig><accidental>1</accidental></KeySig><RehearsalMark><text>A</text></RehearsalMark><Harmony><root>14</root></Harmony><Chord><durationType>half</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord><Rest><durationType>half</durationType></Rest></voice></Measure><Measure><voice><Harmony><root>15</root></Harmony><'+tag+'><durationType>measure</durationType><duration>4/4</duration><subtype>1</subtype></'+tag+'></voice></Measure></Staff></Score></museScore>','repeat.mscx');
  const first=model.staves[0].measures[0].voices[0],second=model.staves[0].measures[1].voices[0];
  assert.deepEqual(rhythm(second),rhythm(first));
  assert.equal(second.filter(e=>e.kind==='part').length,0,'section A is not repeated');
  assert.deepEqual(Array.from(second.filter(e=>e.kind==='harmony'),e=>e.value),['G'],'the repeated bar keeps its own G chord');
  assert.notEqual(second.find(e=>e.kind==='note').notes,first.find(e=>e.kind==='note').notes,'pitch data is cloned');
 }
});
