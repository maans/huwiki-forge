import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const root=new URL('../plugins/abc/src/',import.meta.url),cache={};
async function setup(){
 for(const name of ['volta-layout.js','balanced-layout.js','engraving-rules.js','sheet-layout.js'])cache[name]=await readFile(new URL(name,root),'utf8');
 const modules={};function load(name){name=name.split('/').pop();if(name==='i18n.js')return {dictionary:{}};if(name==='voice-names.js')return {scan:()=>[]};if(modules[name])return modules[name];const exports=modules[name]={};runInNewContext(cache[name],{exports,require:load});return exports;}
 return {sheet:load('sheet-layout.js'),balanced:load('balanced-layout.js')};
}
const {sheet,balanced}=await setup();
const bar=(pitch='C')=>[{el_type:'note',duration:1,pitches:[{pitch}]},{el_type:'bar',type:'bar_thin'}];
test('automatic selects measured layout while explicit bar counts and source systems remain available',()=>{
 let calls=0;const voice=Array.from({length:8},()=>bar()).flat();
 const ABC={parseOnly:()=>[{getPickupLength:()=>0,getBarLength:()=>1,deline:()=>[{staff:[{voices:[voice]}]}]}],tuneMetrics:()=>{calls++;return [{sections:[{measureWidths:Array(8).fill(100),left:70}]}];}};
 const automatic=sheet.options(ABC,'X:1\nK:C\nC8|',{});
 assert.ok(automatic.lineBreaks);assert.equal(automatic.wrap,null);assert.equal(calls,1);
 assert.equal(JSON.stringify(sheet.options(ABC,'X:1\nK:C\nC8|',{'abc-bars-per-line':'0'})),JSON.stringify(automatic));
 const four=sheet.options(ABC,'X:1\nK:C\nC8|',{'abc-bars-per-line':'4'});assert.deepEqual(Array.from(four.lineBreaks[0]),[3]);
 const source=sheet.options(ABC,'X:1\nK:C\nC8|',{'abc-bars-per-line':'source'});assert.equal(source.wrap,null);assert.equal(source.lineBreaks,undefined);
 assert.deepEqual(Object.keys(sheet.options({},'source',{})),[],'metrics failure retains the renderer fallback');
});
test('a short final system is redistributed instead of stranding one easy measure',()=>{
 const voice=Array.from({length:5},()=>bar()).flat(),original=JSON.stringify(voice);
 const plan=balanced.plan(voice,Array(5).fill(130),70,{});
 assert.ok(plan.rows.length>1);assert.ok(plan.rows.every(r=>r.to-r.from>=2));assert.equal(JSON.stringify(voice),original);
});
test('repeated A labels identify distinct sections and a pickup stays attached',()=>{
 const voice=[{el_type:'part',title:'A'},...bar(),...bar(),{el_type:'part',title:'A'},...bar(),...bar()];
 const plan=balanced.plan(voice,Array(4).fill(40),70,{parts:true});assert.equal(plan.rows.length,2);
 assert.deepEqual(Array.from(plan.rows,r=>r.to-r.from),[2,2]);
 const pickup=[{el_type:'note',duration:.125},{el_type:'bar'}, {el_type:'part',title:'A'},...bar(),...bar(),...bar(),...bar()];
 const p=balanced.plan(pickup,Array(5).fill(120),70,{parts:true,pickup:true});assert.ok(p.rows[0].to>1);
});
test('a legal final measure without closing bar uses its measured width',()=>{
 const plan=balanced.plan([...bar(),{el_type:'note',duration:1}],[80,80],70,{});
 assert.ok(plan);assert.equal(plan.measures.length,2);assert.equal(plan.rows.length,1);
});
