import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const file=new URL("../plugins/musescore-import/dist/plugin.json",import.meta.url);
const pkg=JSON.parse(await readFile(file)),tiddlers=JSON.parse(pkg.text).tiddlers;
const converter={},source=tiddlers[pkg.title+"/converter.js"].text;
runInNewContext(source,{exports:converter});
const abc={exports:{}};
runInNewContext(tiddlers[pkg.title+"/abcjs.js"].text,{module:abc,exports:abc.exports,window:{}});
const note=(pitch,dur)=>({kind:"note",dur,notes:[{pitch}],beam:-1});
const harmony=(value,at)=>({kind:"harmony",value,at});
function staff(id,voices,transpose=0){
 return {id,partId:id,name:id,voices:[{id,index:0,clef:"treble"}],
  measures:voices.map((evs,i)=>({index:i+1,voices:[evs],transpose}))};
}
const score=(staves,format="mscx")=>({staves,format,warnings:[],totalMeasures:staves[0].measures.length,title:"Test"});
function symbols(result){
 const t=abc.exports.parseOnly(result.abc)[0];
 return Array.from(t.lines).flatMap(l=>Array.from(l.staff||[]).flatMap(s=>Array.from(s.voices).flatMap(v=>{
  let time=0;return Array.from(v).flatMap(e=>{
   const out=Array.from(e.chord||[],c=>[c.name,time]);
   time+=e.duration||0;return out;
  });
 })));
}
test("Melody alone retains the unselected bass part's chords across a held tone",()=>{
 const melody=staff("melody",[[note(72,1)],[note(74,1)]]);
 const bass=staff("bass",[[harmony("C",0),note(48,.5),harmony("G7/B",.5),note(47,.5)],[note(47,1)]]);
 const model=score([melody,bass]),before=JSON.stringify(model);
 const out=converter.renderABC(model,["melody"],1,2);
 assert.deepEqual(symbols(out),[["C",0],["G7/B",.5]]);
 assert.match(out.abc,/-/);assert.equal(out.notes,2);
 assert.deepEqual(symbols(converter.renderABC(model,["melody"],2,2)),[["G7/B",0]]);
 assert.equal(JSON.stringify(model),before);
});
test("One harmony per score position, even when both selected staves mark both beats",()=>{
 const melody=staff("melody",[[harmony("Dm",0),note(65,.5),harmony("Dm",.5),note(65,.5)]]);
 const bass=staff("bass",[[harmony("Dm",0),note(50,.5),harmony("Dm",.5),note(50,.5)]]);
 for(const selection of [["melody"],["bass"],["melody","bass"],["bass","melody"]]){
  assert.deepEqual(symbols(converter.renderABC(score([melody,bass]),selection,1,1)),[["Dm",0],["Dm",.5]]);
 }
});
test("Transferred MusicXML slash chords follow the written part's instrument",()=>{
 const clarinet=staff("clarinet",[[note(62,1)]],-2);
 const bass=staff("bass",[[harmony("C/G",0),note(48,1)]]);
 assert.deepEqual(symbols(converter.renderABC(score([clarinet,bass],"musicxml"),["clarinet"],1,1)),[["D/A",0]]);
});
