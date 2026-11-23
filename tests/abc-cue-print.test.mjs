import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const pkg=JSON.parse(await readFile(new URL("../plugins/abc/dist/plugin.json",import.meta.url),"utf8"));
const modules=JSON.parse(pkg.text).tiddlers;
const prefix="$:/plugins/huwiki/abc/";
function load(name,dependencies={}){
 const mod={exports:{}};
 runInNewContext(modules[prefix+name].text,{module:mod,exports:mod.exports,window:{},
  require:id=>dependencies[id.slice(prefix.length)]});
 return mod.exports;
}
const abc=load("vendor/abcjs.js");
const example=['X:1','T:Print test','M:4/4','L:1/4','%%MIDI transpose 1','V:1 name="Melody"',
 'V:2 clef=bass name="Bass"','K:Em','V:1','[P:A] |: "Em"C D E F |1 "B7"B4 :|2 "Em"E4 |',
 '[P:B] "Am"A4 | "B7"B4 |]','V:2','E,4 | B,4 | E,4 | A,4 | B,4 |]'].join('\n');
function element(tag){
 return {tag,attrs:{},children:[],ownerDocument:{createElementNS:(_,name)=>element(name)},
  setAttribute(key,value){this.attrs[key]=String(value);},replaceChildren(){this.children=[];},
  querySelectorAll(){return [];},appendChild(el){this.children.push(el);}};
}
function score(source=example){
 let lines;
 const engine={...abc,renderAbc(host,source,options){
  const tune=abc.parseOnly(source,options)[0];options.afterParsing(tune);lines=tune.lines;
 }};
 const cue=load("cue-sheet.js",{"vendor/abcjs.js":engine,"instrument-view.js":load("instrument-view.js"),
  "repeat-plan.js":load("repeat-plan.js"),"chord-chart.js":load("chord-chart.js")});
 const info=cue.describe(source),host=element("div");
 return {info,render(opts){
  const result=cue.render(host,source,info,{scope:"full",voices:[0],part:"source",perLine:4,
   sections:[],style:"plain",mode:"with",formLabels:true,...opts});
  return {...result,lines};
 }};
}
test("Cue printing keeps capo shapes and the concert key distinct across instruments",()=>{
 const {info,render}=score();assert.equal(info.keys[0],"Fm");
 assert.equal(render({part:"source"}).written,"Em");
 assert.equal(render({part:"c"}).written,"Fm");
 assert.equal(render({part:"tenor"}).written,"Gm");
 assert.equal(render({part:"custom",customSteps:7}).written,"Cm");
});
test("Selected form sections and staves are independent of printed chord symbols",()=>{
 const {info,render}=score();
 assert.deepEqual(Array.from(info.sections,s=>[s.name,s.start,s.end]),[["A",0,3],["B",3,5]]);
 const {lines}=render({scope:"parts",sections:[3],voices:[0,1],mode:"without",formLabels:false});
 assert.equal(lines.length,1);assert.equal(lines[0].staff.length,2);
 for(const staff of lines[0].staff){
  const events=staff.voices[0];
  assert.equal(events.filter(e=>e.el_type==="note").length,2);
  assert.ok(!events.some(e=>e.el_type==="part"||e.chord?.length));
 }
});
test("Chord-only output retains both endings and repeats when a bass part carries no harmony",()=>{
 const {render}=score();
 const [system]=render({scope:"parts",sections:[0],voices:[1],mode:"only",part:"c"}).systems;
 assert.equal(system.children.filter(el=>el.tag==="circle").length,4);
 const words=system.children.map(el=>el.textContent).filter(Boolean);
 for(const word of ["1.","2.","Fm","A"])assert.ok(words.includes(word),word);
 const notes=render({scope:"parts",sections:[0],voices:[1],mode:"without"}).lines[0].staff[0].voices[0];
 assert.ok(notes.some(e=>e.startEnding==="1"));
 assert.ok(notes.some(e=>e.type==="bar_right_repeat"));
});

const scores=JSON.parse(await readFile(new URL("../editions/akustisk-elektrisk-repertoire/tiddlers/scores.json",import.meta.url),"utf8"));
test("To sekunder prints the bass harmony once on the upper selected staff on the original beats",()=>{
 const original=scores.find(t=>t.title==="To sekunder")["abc-source"];
 const {render}=score(original);
 for(const voices of [[0],[1],[0,1]]){
  const [line]=render({voices,scope:"excerpt",start:1,count:2}).lines;
  assert.equal(line.staff.length,voices.length);
  assert.equal(line.staff[0].voices.length,1);
  let time=0;
  const harmony=Array.from(line.staff[0].voices[0]).flatMap(e=>{
   const onset=time;time+=e.duration||0;
   return Array.from(e.chord||[],c=>[onset,c.name.replaceAll("♭","b"),e.positioning.chordPosition]);
  });
  assert.deepEqual(harmony,[[0,"A7","above"],[7/8,"Bb13","above"],[11/8,"A7","above"]]);
  for(const staff of line.staff.slice(1))assert.ok(!staff.voices[0].some(e=>e.chord?.length));
  assert.equal(line.staff[0].voices[0].filter(e=>e.type==="bar_left_repeat").length,1);
 }
});
test("Harmony inside sustained notes is engraved on the same staff without changing the melody",()=>{
 const {render}=score(['X:1','M:4/4','L:1/4','V:1','V:2 clef=bass','K:C','V:1',
  '"C"C4 | D4 |]','V:2','"C"C,2 "G7"G,2 | "Dm"D,4 |]'].join('\n'));
 const [line]=render({voices:[0]}).lines;
 assert.equal(line.staff.length,1);
 const [melody,overlay]=line.staff[0].voices;
 assert.deepEqual(Array.from(melody).filter(e=>e.pitches).map(e=>[e.duration,e.chord[0].name]),[[1,"C"],[1,"Dm"]]);
 const spacers=Array.from(overlay).filter(e=>e.el_type==="note");
 assert.deepEqual(spacers.map(e=>[e.duration,e.chord?.[0]?.name]),[[0.5,undefined],[0.5,"G7"],[1,undefined]]);
 assert.ok(spacers.every(e=>e.rest.type==="invisible"&&!e.pitches));
});
