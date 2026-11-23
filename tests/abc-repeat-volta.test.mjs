import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(import.meta.dirname,"..");
const source=await readFile(path.join(root,"plugins/abc/src/repeat-plan.js"),"utf8");
const exports={};runInNewContext(source,{exports});
const songs=JSON.parse(await readFile(path.join(root,"editions/silba-atno-repertoire/tiddlers/repertoire.json"),"utf8"));
const dalarne=songs.find(song=>song["silba-musescore-file"]==="laat-fraan-dalarna-cbb.mscz");

// The real score contains 19 written measures: A with two one-bar endings,
// followed immediately by a new |: starting B, which also has two endings.
// Feed those bar events through the real repeat planner, not a handwritten
// interpretation of its output.
function tune(){
 const events=[];
 const bar=(type,ending)=>events.push({el_type:"bar",type,...(ending?{startEnding:ending}:{})});
 bar("bar_left_repeat");
 for(let number=1;number<=19;number++){
  events.push({el_type:"note",duration:.5,pitches:[{pitch:60+number%7}],startChar:number*10,endChar:number*10+2});
  if(number===7||number===15)bar("bar_thin","1");
  else if(number===8||number===17)bar("bar_right_repeat","2");
  else if(number===9)bar("bar_left_repeat");
  else bar("bar_thin");
 }
 return {lines:[{staff:[{voices:[events]}]}]};
}
function plan(){
 return exports.build({parseOnly(){return [tune()];}},dalarne["abc-source"],{});
}
test("Dalarne A second ending stops at B's own opening repeat",()=>{
 assert.ok(dalarne,"The actual 17-score repertoire contains Dalarne");
 const result=plan();
 assert.equal(result.active,true,"Shared audio planner must take over adjacent A/B volta repeats");
 assert.deepEqual(Array.from(result.sections,s=>[s.start,s.end,s.bodyEnd]),[[0,9,7],[9,19,15]]);
 assert.deepEqual(Array.from(result.sections[0].endings,e=>[e.start,e.end,e.numbers.join(",")]),[[7,8,"1"],[8,9,"2"]]);
 assert.deepEqual(Array.from(result.sections[1].endings,e=>[e.start,e.end,e.numbers.join(",")]),[[15,17,"1"],[17,19,"2"]]);
 assert.deepEqual(Array.from(result.order,n=>n+1),[
  1,2,3,4,5,6,7,8, // A pass 1: first ending
  1,2,3,4,5,6,7,9, // A pass 2: second ending
  10,11,12,13,14,15,16,17, // B pass 1
  10,11,12,13,14,15,18,19 // B pass 2
 ]);
 assert.equal(result.order.length,32,"Melody and chord accompaniment must walk the same 32 bars");
});
test("Dalarne keeps first and second A voltas together without merging B",async()=>{
 assert.match(dalarne["abc-source"],/\[1 z4 :\| \[2 z2"A" A2 \|:\n\[P:B\]/);
 const build=await readFile(path.join(root,"scripts/build-silba-etno-repertoire.mjs"),"utf8");
 assert.match(build,/laat-fraan-dalarna-cbb\.mscz/);
 assert.match(build,/rendered\.abc=rendered\.abc\.replace\(before,after\)/);
});