import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rig={};
const state=(p,t)=>Object.assign({x:0,y:0,r:0,sx:1,sy:1,opacity:1},p.keys?.filter(k=>k.t<=t).at(-1));
runInNewContext(readFileSync(new URL('../plugins/musical/src/skeleton.js',import.meta.url),'utf8'),{exports:rig,require:()=>({state})});
function fixture(height=200){const points=rig.template({x:0,y:0,width:100,height});
 const root={id:'doll',animusRig:points,keys:[{t:0,x:25,y:40}]};
 return [root,...rig.joints.map(([id])=>({id,parent:'doll',animusJoint:id,keys:[{t:0,...points[id]}]}))];}
for(const cycle of Object.keys(rig.cycles)){
 test(cycle+' respects stage direction and starting placement',()=>{
  for(const dir of [-1,1]){
   const parts=fixture(),root=parts[0],before=JSON.stringify(parts),result=rig.sequence(parts,root,0,cycle,dir,1,3,false),keys=result.get(root);
   assert.equal(keys.length,33);assert.equal(JSON.stringify(parts),before);
   assert.equal(keys[0].x,25);assert.equal(keys[0].y,40);
   assert.ok(keys.every(k=>Object.values(k).filter(x=>typeof x==='number').every(Number.isFinite)));
   if(['wheel','run','walk'].includes(cycle)) assert.ok((keys.at(-1).x-25)*dir>10,JSON.stringify(keys.at(-1)));
   assert.ok(Math.abs(keys.at(-1).y-40)<1,'landing '+keys.at(-1).y);
  }
 });
}
test('longer legs change stride and in-place walks remain stationary',()=>{
 const distance=h=>{const p=fixture(h);return rig.sequence(p,p[0],0,'walk',1,1,3,false).get(p[0]).at(-1).x-25;};
 assert.ok(distance(300)>distance(150)*1.5);
 const p=fixture();assert.equal(rig.sequence(p,p[0],0,'walk',1,2,3,true).get(p[0]).at(-1).x,25);
});
test('refuses overlapping edits before changing any part',()=>{const p=fixture();p[2].keys.push({t:.5,r:2});assert.throws(()=>rig.sequence(p,p[0],0,'walk',1,1,3,false),/overlap/);});
test('detaching and reattaching a hand preserves a rotated mirrored pose',()=>{
 const p=[{id:'root'},{id:'arm',parent:'root',keys:[{t:0,x:10,y:20,r:90,sx:-1}]},{id:'hand',parent:'arm',pivot:{x:2,y:1},keys:[{t:0,x:4,y:5}]}];
 rig.reparent(p,p[2],'root',0);let k=p[2].keys[0];assert.ok(Math.abs(k.x-5)<1e-8&&Math.abs(k.y-16)<1e-8);
 rig.reparent(p,p[2],'arm',0);k=p[2].keys[0];assert.ok(Math.abs(k.x-4)<1e-8&&Math.abs(k.y-5)<1e-8);
 assert.throws(()=>rig.reparent(p,p[1],'hand',0),/Circular/);
});
