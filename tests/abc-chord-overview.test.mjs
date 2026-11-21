import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");

// The overview module is pure until mount(): exercise the same source-based
// grouping used by the real ABC player without a browser or fake SVG canvas.
test("ABC chord overview shows every bar with part names and repeat signs",async()=>{
 const src=await readFile(path.join(root,"plugins/abc/src/chord-overview.js"),"utf8");
 const chords=["E7","A7","Dm","E7","E7","Am","E7","Dm","E7","Dm","E7","Am"];
 let index=0;
 const counts=[1,1,1,1,2,2,2,2];
 const chart={chords:[],measures:[]};
 counts.forEach((count,i)=>{
  const bar={number:i+1,chords:[]};
  for(let j=0;j<count;j++){
   const ch={name:chords[index],index:index,startChar:index*9,time:index*.5};
   chart.chords.push(ch);bar.chords.push(ch);index++;
  }
  chart.measures.push(bar);
 });
 const module={};
 runInNewContext(src,{exports:module,require(name){
  assert.equal(name,"$:/plugins/huwiki/abc/chord-chart.js");
  return {extract:()=>chart,atEvent:(chart,event)=>event.index};
 }});
 const abc=String.raw`X:1
T:Oh verden
M:4/4
K:Am
P:A
|: "E7"z4 | "A7"z4 | "Dm"z4 | "E7"z4 :|
P:B
|: "E7"z2 "Am"z2 | "E7"z2 "Dm"z2 | "E7"z2 "Dm"z2 | "E7"z2 "Am"z2 :|`;
 const info=module.describe({},abc,4,{"abc-double-time-section":"B"});
 assert.equal(info.rows.length,2);
 assert.equal(JSON.stringify(info.rows.map(r=>r.name)),JSON.stringify(["A","B"]));
 assert.equal(JSON.stringify(info.rows.map(r=>r.bars.length)),JSON.stringify([4,4]));
 assert.equal(info.rows[0].startRepeat,true);
 assert.equal(info.rows[0].endRepeat,true);
 assert.equal(info.rows[1].startRepeat,true);
 assert.equal(info.rows[1].endRepeat,true);
 assert.equal(info.rows[0].doubleTime,false);
 assert.equal(info.rows[1].doubleTime,true);
 assert.equal(JSON.stringify(info.rows.map(r=>r.bars.map(b=>b.chords.map(c=>c.name)))),
  JSON.stringify([
   [["E7"],["A7"],["Dm"],["E7"]],
   [["E7","Am"],["E7","Dm"],["E7","Dm"],["E7","Am"]]
  ]));
});

test("Balkan 4/4 B doubles backing attacks without changing written bar durations",async()=>{
 const source=await readFile(path.join(root,"plugins/abc/src/meter-arranger.js"),"utf8");
 const module={};
 runInNewContext(source,{exports:module,require(name){
  assert.equal(name,"$:/plugins/huwiki/abc/balkan7.js");
  return {styles:{},patterns:{}};
 }});
 const timeline={bars:[],chords:[]};
 for(let i=0;i<8;i++){
  timeline.bars.push({index:i,sourceBar:i,start:i,end:i+1,duration:1,meter:{num:4,den:4}});
  timeline.chords.push({start:i,name:i<4?"E7":"Am"});
  timeline.chords.push({start:i+.5,name:i<4?"E7":"Dm"});
 }
 const seeds=Array.from({length:64},(_,i)=>({cmd:"note",start:i/8,pitch:48,volume:96}));
 const chords=seeds.map(s=>({...s,pitch:60}));
 const form={sections:[{id:"A",start:0,end:4},{id:"B",start:4,end:8}]};
 const c={enabled:true,bass:"balkan",chords:"balkan",drums:"balkan",bassVolume:70,chordVolume:70,drumVolume:35,variation:0};
 const arranged=module.generate("balkan-44",timeline,form,c,"M:4/4\nK:Am",{"abc-double-time-section":"B"},seeds,chords,false,{wood:{accent:76,beat:77}});
 assert.equal(arranged.bars.length,8);
 assert.ok(arranged.bars.slice(0,4).every(b=>!b.doubleTime));
 assert.ok(arranged.bars.slice(4).every(b=>b.doubleTime));
 assert.ok(arranged.bars.every(b=>Math.abs(b.end-b.start-1)<1e-7));
 function attacks(events,bar){
  return new Set(events.filter(e=>e.start>=bar-1e-7&&e.start<bar+1-1e-7).map(e=>e.start.toFixed(5))).size;
 }
 assert.equal(attacks(arranged.bass,0),2);
 assert.equal(attacks(arranged.bass,4),4);
 assert.equal(attacks(arranged.chords,0),2);
 assert.equal(attacks(arranged.chords,4),4);
 assert.equal(attacks(arranged.drums,0),4);
 assert.equal(attacks(arranged.drums,4),8);
});

test("Chord-only overview keeps ABCJS wrappers out of normal layout while preserving audio DOM",async()=>{
 const player=await readFile(path.join(root,"plugins/abc/src/minimal-player.js"),"utf8");
 const css=await readFile(path.join(root,"plugins/abc/src/NormalStyles.tid"),"utf8");
 assert.ok(player.includes("node.classList.add('huwabc-chord-overview-source')"));
 assert.ok(player.includes("node.setAttribute('aria-hidden','true')"));
 assert.ok(css.includes(".huwabc-minimal-paper>.huwabc-chord-overview-source"));
 assert.match(css,/position:absolute!important/);
 assert.ok(css.includes("height:1px!important"));
});
