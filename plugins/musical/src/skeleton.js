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
const cycles={
 walk:["Gang","Walk",1.1],run:["Løb","Run",.72],jump:["Hop","Jump",.85],
 wheel:["Vejrmølle","Cartwheel",1.5],box:["Boksning","Boxing",.8],
 tiptoe:["List på tå","Tiptoe",1.6],listen:["Lyt","Listen",1.8],wave:["Vink","Wave",1.5],
 stumble:["Snubl og find balancen","Stumble and recover",1.35],
 pickup:["Saml noget op","Pick something up",2],stepclap:["Sidetrin med klap","Side step and clap",2],
 conduct:["Dirigér","Conduct",2],explain:["Forklar","Explain",2.1],
 emphasize:["Understreg et ord","Emphasize a word",1.2],ask:["Stil et spørgsmål","Ask a question",1.7]
};
function smooth(t) { const q=Math.min(1,Math.max(0,t));return q*q*(3-2*q); }
function pulse(t,start,peak,end) {
 return t<peak?smooth((t-start)/(peak-start)):1-smooth((t-peak)/(end-peak));
}
function gesture(type,u,dir) {
 const a={},out=dir>0?"L":"R",other=dir>0?"R":"L";
 const hold=smooth(u/.25)*smooth((1-u)/.24);
 const accent=pulse(u,.2,.42,.74),answer=pulse(u,.45,.7,.98);
 switch(type){
 case "tiptoe":
  a.chest=6*dir*hold;a.head=-4*dir*hold;
  a.elbowL=-dir*30*hold;a.elbowR=dir*24*hold;
  a.shoulderL=dir*12*Math.sin(2*Math.PI*u);a.shoulderR=-a.shoulderL;break;
 case "listen":
  a.head=dir*15*hold;a.chest=dir*5*hold;
  a["shoulder"+out]=-dir*60*hold;a["elbow"+out]=-dir*122*hold;break;
 case "wave":
  a.chest=dir*4*hold;a.head=-dir*7*hold;
  a["shoulder"+out]=-dir*89*hold;a["elbow"+out]=-dir*(69+24*Math.sin(6*Math.PI*u))*hold;
  a["hand"+out]=dir*13*Math.sin(6*Math.PI*u)*hold;break;
 case "stumble":{
  const trip=pulse(u,0,.29,.66),catchStep=pulse(u,.3,.57,1);
  a.chest=dir*(32*trip-13*catchStep);a.head=-dir*12*trip;
  a["shoulder"+out]=-dir*(85*trip+30*catchStep);a["shoulder"+other]=dir*62*trip;
  a["thigh"+out]=-dir*(42*trip+32*catchStep);a["knee"+out]=dir*67*trip;
  a["thigh"+other]=dir*24*trip;break;}
 case "pickup":
  a.chest=dir*56*hold;a.head=dir*10*accent;
  a.thighL=a.thighR=-dir*54*hold;a.kneeL=a.kneeR=dir*96*hold;
  a["shoulder"+out]=-dir*42*hold;a["elbow"+other]=dir*24*hold;break;
 case "stepclap":{
  const side=Math.sin(2*Math.PI*u),lift=Math.sin(2*Math.PI*u)**2;
  a.chest=dir*6*side;a.head=-dir*3*side;
  a.thighL=-dir*22*Math.max(0,side);a.thighR=dir*22*Math.max(0,-side);
  a.kneeL=dir*16*lift;a.kneeR=-dir*16*lift;break;}
 case "conduct":{
  const beat=pulse(u,.1,.24,.4)+pulse(u,.48,.64,.85);
  a["shoulder"+out]=-dir*(58*hold+15*beat);
  a["elbow"+out]=-dir*(58*hold-40*beat);
  a["hand"+out]=dir*18*beat;
  a["shoulder"+other]=dir*(32*hold+16*answer);a["elbow"+other]=dir*32*hold;
  a.chest=dir*4*beat;a.head=dir*5*beat;break;}
 case "explain":
  a.chest=dir*(5*accent-3*answer);a.head=-dir*6*answer;
  a["shoulder"+out]=-dir*(14*hold+24*accent);a["elbow"+out]=-dir*(40*hold+19*accent);
  a["shoulder"+other]=dir*22*answer;a["elbow"+other]=dir*45*answer;break;
 case "emphasize":
  a.chest=dir*9*accent;a.head=dir*8*pulse(u,.24,.45,.68);
  a["shoulder"+out]=-dir*36*hold;a["elbow"+out]=-dir*(58*hold-33*accent);break;
 case "ask":
  a.head=-dir*14*hold;a.chest=dir*4*accent;
  a.shoulderL=-24*hold;a.elbowL=-58*hold;a.shoulderR=22*hold;a.elbowR=51*hold;break;
 }
 return a;
}
function offsets(type,u,dir){
 if(!["walk","run","jump","wheel","box"].includes(type))return gesture(type,u,dir);
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
 const step=(fast?.98:type==="tiptoe"?.38:.65)*Math.min(...legs.map(l=>l.upper+l.lower)),travel=direction*step*u;
 let drop=0;
 for(const l of legs){
  const q=Math.max(0,Math.min(1,u*2-(l.side==="R"?0:1)));
  const smooth=q*q*(3-2*q);
  l.goal={x:l.foot.x+direction*step*smooth-travel,y:l.foot.y-step*(fast?.32:type==="tiptoe"?.27:.19)*Math.sin(Math.PI*q)**2};
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
// Solve the two segments in fitted-puppet coordinates so hands can meet even
// when two characters have different shoulder widths and arm lengths.
function reachHand(points,frames,side,goal,amount){
 const sh="shoulder"+side,el="elbow"+side,ha="hand"+side;
 const shoulder=point(frames[sh],points[sh]),elbow=point(frames[el],points[el]),hand=point(frames[ha],points[ha]);
 if(amount<=0)return hand;
 const span=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const upper=span(shoulder,elbow),lower=span(elbow,hand);
 if(Math.min(upper,lower)<.001)return hand;
 const target={x:hand.x+(goal.x-hand.x)*amount,y:hand.y+(goal.y-hand.y)*amount};
 const dx=target.x-shoulder.x,dy=target.y-shoulder.y;
 const d=Math.max(Math.abs(upper-lower)+.00001,Math.min(upper+lower,Math.hypot(dx,dy)));
 const axis=Math.atan2(dy,dx),offset=Math.acos(Math.max(-1,Math.min(1,(d*d+upper*upper-lower*lower)/(2*d*upper))));
 const angle=axis+(side==="L"?-1:1)*offset;
 const mid={x:shoulder.x+upper*Math.cos(angle),y:shoulder.y+upper*Math.sin(angle)};
 const end={x:shoulder.x+d*Math.cos(axis),y:shoulder.y+d*Math.sin(axis)};
 function segment(a,b,to,next){
  const delta=(Math.atan2(next.y-to.y,next.x-to.x)-Math.atan2(b.y-a.y,b.x-a.x))/radians;
  return mul(move(to.x,to.y),mul(rotate(delta),move(-a.x,-a.y)));
 }
 frames[sh]=segment(points[sh],points[el],shoulder,mid);
 frames[el]=segment(points[el],points[ha],mid,end);
 frames[ha]=frames[el];
 return end;
}
// Older Kenney templates and characters inserted from Materials use the same
// part IDs but may predate saved rigs. Derive their joints without editing them.
function fittedRig(parts,root){
 const named=new Map(),prefix=root.id.replace(/actor$/,"");
 if(root.id.endsWith("actor") && (root["animus-library-id"]||root.id).includes("kenney-")){
  for(const [end,joint] of [["body","chest"],["head","head"],["back-arm","shoulderR"],["back-elbow","elbowR"],
   ["back-hand","handR"],["back-leg","thighR"],["back-knee","kneeR"],["front-arm","shoulderL"],
   ["front-elbow","elbowL"],["front-hand","handL"],["front-leg","thighL"],["front-knee","kneeL"]]){
   const part=parts.find(p=>p.id===prefix+end);
   if(part)named.set(part,joint);
  }
 }
 if(root.animusRig)return {points:root.animusRig,joint:p=>p.animusJoint||(["chest","head"].includes(named.get(p))?named.get(p):null)};
 if(named.size!==12)return null;
 const points={},toRoot=inv(world(parts,root.id,0));
 for(const [part,id] of named){
  const matrix=mul(toRoot,world(parts,part.id,0));
  points[id]=point(matrix,part.pivot||{x:0,y:0});
  if(id.startsWith("knee")){
   const g=part.geo;
   points["foot"+id.slice(-1)]=point(matrix,{x:g.x+g.w/2,y:g.y+g.h});
  }
 }
 points.hip={x:(points.thighL.x+points.thighR.x)/2,y:(points.thighL.y+points.thighR.y)/2};
 return {points,joint:p=>named.get(p)};
}
function sequence(parts,root,start,type,dir,repeats,limit,inPlace,rate=1,prop=null,coverKeys=false){
 if(Engine.state(root,start).sx<0)dir=-dir;
 const rig=fittedRig(parts,root);
 if(!rig)throw Error("unbound");
 const points=rig.points,dt=cycles[type][2]/rate,end=start+dt*repeats;
 if(end>limit+1e-6)throw Error("duration");
 const actors=parts.filter(p=>p!==root&&points[rig.joint(p)]&&belongs(p));
 function belongs(p){const seen=new Set();while(p&&!seen.has(p.id)){if(p===root)return true;seen.add(p.id);p=parts.find(q=>q.id===p.parent);}return false;}
 if(!actors.length)throw Error("unbound");
 const targets=[root,...actors],affected=parts.filter(belongs);
 const used=new Set(targets);for(const part of targets){let p=part;while(p!==root&&p.parent){p=affected.find(q=>q.id===p.parent);if(!p)break;used.add(p);}}
 function conflict(p){
  return (p.keys||[]).some(k=>k.t>start+1e-6&&k.t<=end+1e-6&&(!coverKeys||k.animusMove||!targets.includes(p)));
 }
 if(Array.from(used).some(conflict))throw Error("overlap");
 const roots=world(parts,root.id,start),base=new Map(affected.map(p=>[p,mul(inv(roots),world(parts,p.id,start))]));
 const byId=new Map(parts.map(p=>[p.id,p])),out=new Map(targets.map(p=>[p,[]]));
 const grab=type==="pickup"&&prop;
 if(grab&&(prop.parent||!parts.includes(prop)||belongs(prop)||(prop.keys||[]).some(k=>k.t>start+1e-6&&k.t<=end+1e-6)))throw Error("overlap");
 const propBase=grab?Engine.state(prop,start):null;
 if(grab)out.set(prop,[]);
 const frames=32;let x=0,y=0,prior=jointFrames(points,type,0,dir);
 const height=Math.abs(points.footR.y-points.head.y);
 for(let i=0;i<=repeats*frames;i++){
  const u=i===0?0:((i-1)%frames+1)/frames;
  const f=jointFrames(points,type,u,dir);
  if(type==="walk"||type==="run"||type==="tiptoe"){
   const gait=stride(points,f,type,u,dir);x=gait.travel+dir*gait.step*(i===0?0:Math.floor((i-1)/frames));y=gait.drop;
  }else if(type==="stepclap"){
   x=dir*height*.12*Math.sin(2*Math.PI*u);
   y=height*.018*Math.sin(2*Math.PI*u)**2;
   const clap=pulse(u,0,.23,.5)+pulse(u,.5,.73,1);
   for(const side of ["R","L"]){
    const goal={x:points.chest.x,y:points.chest.y+height*.06};
    reachHand(points,f,side,goal,clap);
   }
  }else if(type==="stumble"||type==="pickup"){
   const floor=Math.max(points.footR.y,points.footL.y);
   y=floor-Math.max(...["footR","footL"].map(id=>point(f[id],points[id]).y));
   if(type==="stumble")x=dir*height*.19*(Math.floor(Math.max(0,i-1)/frames)+smooth((u-.22)/.52));
  }else if(i&&type==="wheel"){
   // Follow the lowest supporting extremity for a cartwheel. On foot,
   // select the foot travelling backwards in puppet space during stance.
   const contacts=type==="wheel"?["handR","handL","footR","footL"]:["footR","footL"];
   const candidates=contacts.map(id=>{const a=point(prior[id],points[id]),b=point(f[id],points[id]);return {dx:a.x-b.x,dy:a.y-b.y,low:(a.y+b.y)/2};});
   candidates.sort((a,b)=>type==="wheel"?b.low-a.low:dir*(b.dx-a.dx));
   x+=candidates[0].dx;y=Math.max(points.footR.y,points.footL.y)-Math.max(...contacts.map(id=>point(f[id],points[id]).y));
  }
  const travel=move(inPlace?0:x,type==="jump"?-height*.33*Math.sin(Math.PI*u):y);
  if(grab){
   const handSide=dir>0?"L":"R",handFrame=mul(roots,travel);
   const touch=point(inv(handFrame),{x:propBase.x,y:propBase.y});
   const carry={x:points.chest.x+dir*height*.15,y:points.chest.y+height*.14};
   const held=i>=frames/2;
   let destination=touch,amount=smooth(u*2);
   if(held){
    const lift=smooth((i/frames-.5)*2);
    destination={x:touch.x+(carry.x-touch.x)*lift,y:touch.y+(carry.y-touch.y)*lift};
    amount=1;
   }
   const hand=point(handFrame,reachHand(points,f,handSide,destination,amount));
   if(i===frames/2&&Math.hypot(hand.x-propBase.x,hand.y-propBase.y)>height*.04*Math.hypot(roots[0],roots[1]))throw Error("reach");
   out.get(prop).push(Object.assign({},propBase,{x:held?hand.x:propBase.x,y:held?hand.y:propBase.y,t:start+i*dt/frames,easing:"linear"}));
  }
  const delta=p=>{while(p&&p!==root){if(points[rig.joint(p)])return f[rig.joint(p)];p=byId.get(p.parent);}return f.hip;};
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
exports.fittedRig=fittedRig;exports.joints=joints;exports.cycles=cycles;exports.template=template;exports.reparent=reparent;exports.sequence=sequence;
