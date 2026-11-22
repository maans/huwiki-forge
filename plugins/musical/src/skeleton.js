/*\
title: $:/plugins/huwiki/musical/skeleton.js
type: application/javascript
module-type: library
\*/
"use strict";
const Engine=require("$:/plugins/huwiki/cutout/engine.js");
const identity=[1,0,0,1,0,0];
const radians=Math.PI/180;
function mul(a,b){
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function inv(m){
 const [a,b,c,d,x,y]=m,det=a*d-b*c;
 if(Math.abs(det)<1e-9)throw Error("Singular transform");
 return [d/det,-b/det,-c/det,a/det,(c*y-d*x)/det,(b*x-a*y)/det];
}
function move(x,y){return [1,0,0,1,x,y];}
function rotate(r){const c=Math.cos(r*radians),s=Math.sin(r*radians);return [c,s,-s,c,0,0];}
function point(m,p){return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
function local(p,t){
 const k=Engine.state(p,t),v=p.pivot||{x:0,y:0},m=mul(rotate(k.r),[k.sx,0,0,k.sy,0,0]);
 return mul(move(k.x,k.y),mul(m,move(-v.x,-v.y)));
}
function world(parts,id,t,seen=new Set()){
 const p=parts.find(p=>p.id===id);
 if(!p)return identity;
 if(seen.has(id))throw Error("Circular hierarchy");seen.add(id);
 return mul(world(parts,p.parent,t,seen),local(p,t));
}
function pose(p,m,base){
 const v=point(m,p.pivot||{x:0,y:0}),sx=Math.hypot(m[0],m[1])*(base.sx<0?-1:1);
 if(Math.abs(sx)<1e-9||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-6*Math.max(1,Math.abs(sx)*Math.hypot(m[2],m[3])))throw Error("shear");
 const angle=Math.atan2(m[1]/sx,m[0]/sx)/radians;
 return Object.assign({},base,{x:v.x,y:v.y,r:angle+360*Math.round((base.r-angle)/360),sx:sx,sy:(m[0]*m[3]-m[1]*m[2])/sx});
}
function reparent(parts,p,parent,time){
 const chain=new Set(),times=new Set([0,time]);
 function collect(id){while(id&&!chain.has(id)){chain.add(id);const q=parts.find(a=>a.id===id);if(!q)break;(q.keys||[]).forEach(k=>times.add(k.t));id=q.parent;}}
 collect(parent);if(chain.has(p.id))throw Error("Circular hierarchy");collect(p.id);
 if(Array.from(times).every(t=>{
  const a=world(parts,parent,t),b=world(parts,p.parent,t);
  return a.every((v,i)=>Math.abs(v-b[i])<1e-9);
 })){p.parent=parent;return;}
 const keys=Array.from(times).sort((a,b)=>a-b).map(t=>{
  const k=Object.assign({},Engine.state(p,t),(p.keys||[]).find(k=>k.t===t)||{},{t});
  return pose(p,mul(inv(world(parts,parent,t)),world(parts,p.id,t)),k);
 });
 p.parent=parent;p.keys=keys;
}
const joints=[["hip","",.5,.53,"Hofte","Pelvis"],["chest","hip",.5,.3,"Bryst","Chest"],["head","chest",.5,.21,"Hoved","Head"]];
for(const [side,sign,da,en] of [["R",-1,"Højre","Right"],["L",1,"Venstre","Left"]]){
 for(const [key,parent,dx,y,d,e] of [["shoulder","chest",.18,.30,"skulder","shoulder"],["elbow","shoulder",.29,.45,"albue","elbow"],["hand","elbow",.38,.58,"hånd","hand"],["thigh","hip",.09,.56,"hofteled","hip"],["knee","thigh",.11,.76,"knæ","knee"],["foot","knee",.12,.96,"fod","foot"]]){
  joints.push([key+side,["chest","hip"].includes(parent)?parent:parent+side,.5+dx*sign,y,da+" "+d,en+" "+e]);
 }
}
function template(box){return Object.fromEntries(joints.map(([key,,x,y])=>[key,{x:box.x+x*box.width,y:box.y+y*box.height}]));}
const cycles={walk:["Gang","Walk",1.1],run:["Løb","Run",.72],jump:["Hop","Jump",.85],wheel:["Vejrmølle","Cartwheel",1.5],box:["Boksning","Boxing",.8]};
function offsets(type,u,dir){
 const wave=Math.sin(2*Math.PI*u),arc=Math.sin(Math.PI*u),bend=arc*arc,angles={};
 for(const [s,h] of [["R",1],["L",-1]]){
  const phase=wave*h;
  if(type==="walk"||type==="run"){
   const fast=type==="run";angles["thigh"+s]=dir*phase*(fast?49:29);
   angles["knee"+s]=dir*Math.max(0,-h*Math.sin(2*Math.PI*u-Math.PI/2))*(fast?61:28)*Math.min(1,u*12,(1-u)*12);
   angles["shoulder"+s]=-dir*phase*(fast?44:23);
  }else if(type==="wheel"){
   angles["shoulder"+s]=h*125*bend;angles["thigh"+s]=-h*32*bend;
  }else if(type==="jump"){
   angles["thigh"+s]=-dir*32*bend;angles["knee"+s]=dir*62*bend;angles["shoulder"+s]=dir*65*bend;
  }else{angles["shoulder"+s]=dir*Math.max(0,phase)*76;angles["elbow"+s]=-dir*Math.max(0,phase)*35;}
 }
 angles.hip=type==="wheel"?360*u*dir:0;
 return angles;
}
function jointFrames(points,type,u,dir){
 const matrices={},angles=offsets(type,u,dir);
 for(const [id,parent] of joints){
  const p=points[id],spin=mul(move(p.x,p.y),mul(rotate(angles[id]||0),move(-p.x,-p.y)));
  matrices[id]=mul(matrices[parent]||identity,spin);
 }
 return matrices;
}
// Two-link inverse kinematics keeps each planted ankle fixed in scene space.
// Distances come from the fitted puppet; no pixel stride is shared across dolls.
function stride(points,frames,type,u,direction){
 const fast=type==="run",angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x),length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const legs=["R","L"].map(side=>{
  const hip=points["thigh"+side],knee=points["knee"+side],foot=points["foot"+side];
  return {side,hip,knee,foot,upper:length(hip,knee),lower:length(knee,foot)};
 });
 const step=(fast?.98:.65)*Math.min(...legs.map(l=>l.upper+l.lower)),travel=direction*step*u;
 let drop=0;
 for(const l of legs){
  const q=Math.max(0,Math.min(1,u*2-(l.side==="R"?0:1)));
  const smooth=q*q*(3-2*q);
  l.goal={x:l.foot.x+direction*step*smooth-travel,y:l.foot.y-step*(fast?.32:.19)*Math.sin(Math.PI*q)**2};
  const dx=l.goal.x-l.hip.x,maxReach=l.upper+l.lower;
  drop=Math.max(drop,l.goal.y-l.hip.y-Math.sqrt(Math.max(0,maxReach*maxReach-dx*dx)));
 }
 for(const l of legs){
  const goal={x:l.goal.x,y:l.goal.y-drop},span=length(l.hip,goal);
  if(span<1e-7||l.upper<1e-7||l.lower<1e-7)throw Error("joint");
  const bend=Math.atan2(Math.sin(angle(l.hip,l.knee)-angle(l.hip,l.foot)),Math.cos(angle(l.hip,l.knee)-angle(l.hip,l.foot)));
  const sign=Math.abs(bend)>.02?Math.sign(bend):-direction;
  const opening=Math.acos(Math.max(-1,Math.min(1,(span*span+l.upper*l.upper-l.lower*l.lower)/(2*l.upper*span))));
  const thighAngle=angle(l.hip,goal)+sign*opening,thigh=thighAngle-angle(l.hip,l.knee);
  const knee={x:l.hip.x+l.upper*Math.cos(thighAngle),y:l.hip.y+l.upper*Math.sin(thighAngle)};
  const shin=angle(knee,goal)-angle(l.knee,l.foot);
  const around=(p,r)=>mul(move(p.x,p.y),mul(rotate(r/radians),move(-p.x,-p.y)));
  frames["thigh"+l.side]=around(l.hip,thigh);
  frames["knee"+l.side]=mul(move(knee.x-l.knee.x,knee.y-l.knee.y),around(l.knee,shin));
  frames["foot"+l.side]=move(goal.x-l.foot.x,goal.y-l.foot.y);
 }
 return {step,travel,drop:drop-(fast?step*.085*Math.sin(2*Math.PI*u)**4:0)};
}
function sequence(parts,root,start,type,dir,repeats,limit,inPlace,rate=1){
 if(Engine.state(root,start).sx<0)dir=-dir;
 const points=root.animusRig,dt=cycles[type][2]/rate,end=start+dt*repeats;
 if(end>limit+1e-6)throw Error("duration");
 const actors=parts.filter(p=>p!==root&&points[p.animusJoint]&&belongs(p));
 function belongs(p){const seen=new Set();while(p&&!seen.has(p.id)){if(p===root)return true;seen.add(p.id);p=parts.find(q=>q.id===p.parent);}return false;}
 if(!actors.length)throw Error("unbound");
 const targets=[root,...actors],affected=parts.filter(belongs);
 const used=new Set(targets);for(const part of targets){let p=part;while(p!==root&&p.parent){p=affected.find(q=>q.id===p.parent);if(!p)break;used.add(p);}}
 if(Array.from(used).some(p=>(p.keys||[]).some(k=>k.t>start+1e-6&&k.t<=end+1e-6)))throw Error("overlap");
 const roots=world(parts,root.id,start),base=new Map(affected.map(p=>[p,mul(inv(roots),world(parts,p.id,start))]));
 const byId=new Map(parts.map(p=>[p.id,p])),out=new Map(targets.map(p=>[p,[]]));
 const frames=32;let x=0,y=0,prior=jointFrames(points,type,0,dir);
 const height=Math.abs(points.footR.y-points.head.y);
 for(let i=0;i<=repeats*frames;i++){
  const u=i===0?0:((i-1)%frames+1)/frames;
  const f=jointFrames(points,type,u,dir);
  if(type==="walk"||type==="run"){
   const gait=stride(points,f,type,u,dir);x=gait.travel+dir*gait.step*(i===0?0:Math.floor((i-1)/frames));y=gait.drop;
  }else if(i&&type==="wheel"){
   // Follow the lowest supporting extremity for a cartwheel. On foot,
   // select the foot travelling backwards in puppet space during stance.
   const contacts=type==="wheel"?["handR","handL","footR","footL"]:["footR","footL"];
   const candidates=contacts.map(id=>{const a=point(prior[id],points[id]),b=point(f[id],points[id]);return {dx:a.x-b.x,dy:a.y-b.y,low:(a.y+b.y)/2};});
   candidates.sort((a,b)=>type==="wheel"?b.low-a.low:dir*(b.dx-a.dx));
   x+=candidates[0].dx;y=Math.max(points.footR.y,points.footL.y)-Math.max(...contacts.map(id=>point(f[id],points[id]).y));
  }
  const travel=move(inPlace?0:x,type==="jump"?-height*.33*Math.sin(Math.PI*u):y);
  const delta=p=>{while(p&&p!==root){if(points[p.animusJoint])return f[p.animusJoint];p=byId.get(p.parent);}return f.hip;};
  for(const p of targets){
   const m=p===root?mul(local(root,start),mul(travel,f.hip)):
    mul(inv(mul(delta(byId.get(p.parent)),base.get(byId.get(p.parent)))),mul(delta(p),base.get(p)));
   const list=out.get(p),ref=Object.assign({},Engine.state(p,start));
   if(list.length)ref.r=list[list.length-1].r;
   list.push(Object.assign(pose(p,m,ref),{t:start+i*dt/frames,easing:"linear"}));
  }
  prior=f;
 }
 return out;
}
exports.joints=joints;exports.cycles=cycles;exports.template=template;exports.reparent=reparent;exports.sequence=sequence;
