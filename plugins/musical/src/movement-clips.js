/*\
title: $:/plugins/huwiki/musical/movement-clips.js
type: application/javascript
module-type: library
\*/
"use strict";
const Rig=require("$:/plugins/huwiki/musical/skeleton.js");
const Engine=require("$:/plugins/huwiki/cutout/engine.js");
const epsilon=1e-6;
const order=(a,b)=>a.t-b.t;
const inside=(t,start,end)=>t>=start-epsilon&&t<=end+epsilon;
function overlaps(moves,id,start,end){
 return moves.some(m=>m.id!==id&&m.start<end-epsilon&&m.end>start+epsilon);
}
exports.overlaps=overlaps;

// Before 0.16 only the sampled motion was saved. Identify its library
// settings against the original actor before retargeting to another rig.
function legacyRecipe(parts,owner,clip,samples){
 const rootKeys=samples.get(owner.id);
 if(!rootKeys||rootKeys.length<2)throw Error("samples");
 const repeats=Math.max(1,Math.round((rootKeys.length-1)/32));
 const prop=parts.find(p=>p!==owner&&!p.parent&&samples.has(p.id));
 const base=parts.map(p=>{
  const first=samples.get(p.id)?.[0]||Engine.state(p,clip.start);
  return Object.assign({},p,{keys:[Object.assign({},first,{t:0})]});
 });
 const root=base.find(p=>p.id===owner.id),duration=repeats*Rig.cycles[clip.type][2];
 let bestScore=Infinity,best;
 for(const dir of [1,-1,0]){
  let predicted;
  try{predicted=Rig.sequence(base,root,0,clip.type,dir===-1?-1:1,repeats,duration,dir===0,1,prop&&base.find(p=>p.id===prop.id));}
  catch(_){continue;}
  let error=0;
  for(const [p,keys] of predicted){
   const actual=samples.get(p.id);if(!actual)continue;
   for(const k of actual){
    const index=Math.round((keys.length-1)*(k.t-clip.start)/(clip.end-clip.start));
    const expected=keys[Math.min(keys.length-1,Math.max(0,index))];
    error+=(expected.x-k.x)**2+(expected.y-k.y)**2+(expected.r-k.r)**2;
   }
  }
  if(error<bestScore){bestScore=error;best={dir,repeats,propId:prop&&prop.id};}
 }
 if(!best)throw Error("unbound");
 return best;
}

// Preserve authored tweaks when a sampled clip stays on the same body. Anchor
// the delta of each local joint to the pose at its new starting time.
function rebase(keys,part,clip,previous){
 const first=keys[0],base=Engine.state(part,clip.start),rad=Math.PI/180;
 const ca=Math.cos(first.r*rad),sa=Math.sin(first.r*rad),cb=Math.cos(base.r*rad),sb=Math.sin(base.r*rad);
 const sx=first.sx?base.sx/first.sx:1,sy=first.sy?base.sy/first.sy:1;
 return keys.map(k=>{
  const dx=k.x-first.x,dy=k.y-first.y,x=(ca*dx+sa*dy)*sx,y=(ca*dy-sa*dx)*sy;
  return Object.assign({},k,{t:clip.start+(k.t-previous.start)*(clip.end-clip.start)/(previous.end-previous.start),
   x:base.x+cb*x-sb*y,y:base.y+sb*x+cb*y,r:base.r+(k.r-first.r)*Math.sign(sx*sy||1),sx:k.sx*sx,sy:k.sy*sy});
 });
}

// Edit the two affected tracks in memory. Restoring all covered keys first
// also recovers an older clip's endpoint stored in an adjacent clip's prior.
exports.edit=function(scene,request){
 const {sourceId,targetId,id,start,end}=request;
 const originals=new Map(scene.parts.map(p=>[p.id,p]));
 const source=originals.get(sourceId),target=originals.get(targetId);
 const owners=new Set([source,target].filter(Boolean));
 if(!source||(!request.remove&&(!target||!Rig.fittedRig(scene.parts,target))))throw Error("unbound");
 const selected=(source.animusMoves||[]).find(m=>m.id===id);
 if(!selected&&!request.recipe)throw Error("missing");
 if(!request.remove){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>scene.duration+epsilon)throw Error("duration");
  if(overlaps(target.animusMoves||[],id,start,end))throw Error("occupied");
 }
 const items=[],known=new Map(),covered=new Map(),touched=new Set();
 for(const owner of owners){
  for(const move of owner.animusMoves||[]){
   const item={owner,previous:move,clip:Object.assign({},move),samples:new Map()};
   items.push(item);known.set(move.id,item);
   for(const [partId,prior] of Object.entries(move.prior||{})){
    touched.add(partId);covered.set(partId,(covered.get(partId)||[]).concat(prior));
   }
  }
 }
 const parts=scene.parts.map(p=>Object.assign({},p)),draft=new Map(parts.map(p=>[p.id,p]));
 for(const p of parts){
  if(!touched.has(p.id))continue;
  const base=[];
  for(const k of (p.keys||[]).concat(covered.get(p.id)||[])){
   const item=known.get(k.animusMove);
   if(!item){base.push(k);continue;}
   if(inside(k.t,item.previous.start,item.previous.end)){
    if(!item.samples.has(p.id))item.samples.set(p.id,[]);
    item.samples.get(p.id).push(k);
   }
  }
  p.keys=base.sort(order);
 }
 for(const item of items)for(const keys of item.samples.values())keys.sort(order);
 let edited=known.get(id);
 if(!edited){
  edited={owner:target,clip:{id,type:request.type,recipe:request.recipe},samples:new Map()};
  items.push(edited);known.set(id,edited);
 }
 if(!request.remove){
  edited.owner=target;Object.assign(edited.clip,{start,end});
  if(source!==target&&!edited.clip.recipe)edited.clip.recipe=legacyRecipe(scene.parts,source,selected,edited.samples);
 }
 const pending=items.filter(item=>item!==edited||!request.remove);
 function apply(item){
  const {clip,owner,previous,samples}=item,actor=draft.get(owner.id);
  const hasProp=Array.from(samples.keys()).some(key=>key!==owner.id&&!draft.get(key)?.parent);
  let data;
  if(!previous||item===edited&&owner!==source||hasProp){
   const recipe=clip.recipe||legacyRecipe(scene.parts,owner,previous,samples);
   const prop=recipe.propId&&draft.get(recipe.propId);
   if(recipe.propId&&!prop)throw Error("reach");
   const rate=recipe.repeats*Rig.cycles[clip.type][2]/(clip.end-clip.start);
   const cover=item!==edited||!!previous||request.coverKeys;
   data=Rig.sequence(parts,actor,clip.start,clip.type,recipe.dir===-1?-1:1,recipe.repeats,scene.duration,recipe.dir===0,rate,prop,cover);
   clip.recipe=recipe;
  }else{
   data=new Map();
   for(const [partId,keys] of samples){const p=draft.get(partId);data.set(p,rebase(keys,p,clip,previous));}
   if(!data.has(actor))throw Error("samples");
  }
  clip.prior={};
  for(const [p,keys] of data){
   const old=p.keys||[],prior=old.filter(k=>inside(k.t,clip.start,clip.end));
   if(prior.some(k=>k.animusMove&&!known.has(k.animusMove)))throw Error("occupied");
   const keep=old.filter(k=>!inside(k.t,clip.start,clip.end));
   if(clip.start>0&&!old.some(k=>k.t<=clip.start))keys.unshift(Object.assign({t:0},Engine.state(p,0)));
   clip.prior[p.id]=prior;
   p.keys=keep.concat(keys.map(k=>Object.assign({},k,{animusMove:clip.id}))).sort(order);
   touched.add(p.id);
  }
 }
 pending.slice().sort((a,b)=>a.clip.start-b.clip.start).forEach(apply);
 // No source data is mutated until every target and every interval succeeds.
 for(const partId of touched)if(draft.has(partId))originals.get(partId).keys=draft.get(partId).keys;
 for(const owner of owners)owner.animusMoves=pending.filter(i=>i.owner===owner).map(i=>i.clip);
 return edited.clip;
};
