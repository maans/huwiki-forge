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
function score(){
 let lines;
 const engine={...abc,renderAbc(host,source,options){
  const tune=abc.parseOnly(source,options)[0];options.afterParsing(tune);lines=tune.lines;
 }};
 const cue=load("cue-sheet.js",{"vendor/abcjs.js":engine,"instrument-view.js":load("instrument-view.js"),
  "repeat-plan.js":load("repeat-plan.js"),"chord-chart.js":load("chord-chart.js")});
 const info=cue.describe(example),host=element("div");
 return {info,render(opts){
  const result=cue.render(host,example,info,{scope:"full",voices:[0],part:"source",perLine:4,
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
