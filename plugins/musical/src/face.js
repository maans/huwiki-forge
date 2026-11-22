/*\
title: $:/plugins/huwiki/musical/face.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Facial choices are held on the performance clock. Rendering changes only
// the local artwork, never a joint, authored key, or parent transform.
var Engine=require("$:/plugins/huwiki/cutout/engine.js"),savedViews=new WeakMap(),anatomies=new WeakMap();
var own=Object.prototype.hasOwnProperty;
var SOUNDS=[{id:"rest",label:"Pause",en:"Rest",letters:"pause"},{id:"A",label:"A-lyd",en:"A sound",letters:"a"},{id:"E",label:"E-lyd",en:"E sound",letters:"e i y æ"},{id:"O",label:"O-lyd",en:"O sound",letters:"o u å ø"},{id:"F",label:"F-lyd",en:"F sound",letters:"f v"},{id:"M",label:"Læber sammen",en:"Lips together",letters:"m b p"},{id:"C",label:"Andre konsonanter",en:"Other consonants",letters:"c d g h j k l n q r s t w x z"}];
var EYES=[{id:"auto",label:"Følg animationen",en:"Follow animation"},{id:"open",label:"Åbne",en:"Open"},{id:"closed",label:"Lukkede",en:"Closed"},{id:"blink",label:"Blink",en:"Blink"},{id:"wide",label:"Store øjne",en:"Wide"},{id:"squint",label:"Knebne",en:"Squint"},{id:"left",label:"Blik mod venstre",en:"Look left"},{id:"right",label:"Blik mod højre",en:"Look right"},{id:"up",label:"Se op",en:"Look up"},{id:"down",label:"Se ned",en:"Look down"}];
var PRESETS=[{id:"original",label:"Oprindeligt",en:"Original",patch:{mood:"original",eyes:"auto",mouth:{mode:"auto"}}},{id:"neutral",label:"Neutral",en:"Neutral",patch:{mood:"neutral",eyes:"open",mouth:{mode:"auto"}}},{id:"happy",label:"Glad",en:"Happy",patch:{mood:"happy",eyes:"open",mouth:{mode:"auto"}}},{id:"sad",label:"Trist",en:"Sad",patch:{mood:"sad",eyes:"squint",mouth:{mode:"auto"}}},{id:"angry",label:"Vred",en:"Angry",patch:{mood:"angry",eyes:"squint",mouth:{mode:"auto"}}},{id:"surprised",label:"Overrasket",en:"Surprised",patch:{mood:"surprised",eyes:"wide",mouth:{mode:"auto"}}}];
function num(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function clean(value){return String(value||"").toLowerCase().replace(/æ/g,"ae").replace(/ø/g,"oe").replace(/å/g,"aa").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function hasId(items,id){return items.some(function(item){return item.id===id;});}
function preset(id){var found=PRESETS.find(function(item){return item.id===id;});return found?clone(found.patch):null;}
function ordered(keys){return (Array.isArray(keys)?keys:[]).map(function(key,index){return {key:key,index:index};}).filter(function(item){return item.key&&typeof item.key.actor==="string"&&Number.isFinite(Number(item.key.t));}).sort(function(a,b){return Number(a.key.t)-Number(b.key.t)||a.index-b.index;});}
function state(keys,time,actorId){var result={eyes:"auto",mood:"original",mouth:{mode:"auto"},mouthMap:{},eyesAt:null,time:num(time,0),active:false};
 ordered(keys).forEach(function(item){var key=item.key;if(key.actor!==actorId||Number(key.t)>result.time)return;result.active=true;
  if(hasId(EYES,key.eyes)){result.eyes=key.eyes;result.eyesAt=Number(key.t);}
  if(hasId(PRESETS,key.mood))result.mood=key.mood;
  if(key.mouth&&key.mouth.mode==="auto")result.mouth={mode:"auto"};
  else if(key.mouth&&key.mouth.mode==="fixed"&&typeof key.mouth.variant==="string")result.mouth={mode:"fixed",variant:key.mouth.variant};
  if(key.mouthMap===null)result.mouthMap={};
  else if(key.mouthMap&&typeof key.mouthMap==="object")SOUNDS.forEach(function(sound){if(!own.call(key.mouthMap,sound.id))return;var value=key.mouthMap[sound.id];if(value===null)delete result.mouthMap[sound.id];else if(typeof value==="string"&&value)result.mouthMap[sound.id]=value;});
 });return result;
}
function withKey(keys,actorId,time,patch){var result=clone(Array.isArray(keys)?keys:[]),at=num(time,NaN);if(!actorId||!Number.isFinite(at)||!patch)return result;at=Math.max(0,at);
 var key=null;result.forEach(function(item){if(item&&item.actor===actorId&&Math.abs(num(item.t,Infinity)-at)<1e-7)key=item;});
 if(!key){key={actor:String(actorId),t:at};result.push(key);}else key.t=at;
 if(hasId(EYES,patch.eyes))key.eyes=patch.eyes;
 if(hasId(PRESETS,patch.mood))key.mood=patch.mood;
 if(patch.mouth&&patch.mouth.mode==="auto")key.mouth={mode:"auto"};
 else if(patch.mouth&&patch.mouth.mode==="fixed"&&typeof patch.mouth.variant==="string")key.mouth={mode:"fixed",variant:patch.mouth.variant};
 if(patch.mouthMap===null)key.mouthMap=null;
 else if(patch.mouthMap&&typeof patch.mouthMap==="object"){
  // Preserve a reset when the next choice is made at the very same time.
  var mapping=key.mouthMap&&typeof key.mouthMap==="object"?clone(key.mouthMap):{};
  if(key.mouthMap===null)SOUNDS.forEach(function(sound){mapping[sound.id]=null;});
  SOUNDS.forEach(function(sound){if(!own.call(patch.mouthMap,sound.id))return;var value=patch.mouthMap[sound.id];if(value===null||typeof value==="string"&&value)mapping[sound.id]=value;});key.mouthMap=mapping;
 }
 return result.sort(function(a,b){return num(a&&a.t,0)-num(b&&b.t,0);});
}
function beneath(map,id,root){var seen={};while(id&&map[id]&&!seen[id]){if(id===root)return true;seen[id]=true;id=map[id].parent;}return false;}
function facialName(part){return clean((part.name||"")+" "+part.id);}
function headPart(part){return /(?:^| )(?:head|hoved|face|ansigt)(?: |$)/.test(facialName(part))&&!/(?:^| )(?:drawing|tegning)(?: |$)/.test(facialName(part));}
function mouthKind(part){var label=facialName(part);if(!/(?:^| )(?:mouth|mund|lip|lips|laeber|smile|smil)(?: |$)/.test(label)||part.type==="group")return "";
 if(/(?:^| )(?:closed|rest|neutral|smile|smil|lukket)(?: |$)/.test(label))return "closed";
 return part.type==="path"&&!/(?:^| )(?:open|aaben)(?: |$)/.test(label)?"closed":"open";
}
function actorRoot(map,part){var current=part,found=part,seen={};while(current&&current.parent&&map[current.parent]&&!seen[current.parent]){seen[current.parent]=true;current=map[current.parent];found=current;
 if(current.actor===true||current.speaker||current.role||current.characterName)return current;
 if(current.type==="group"&&!/(?:^| )(?:head|hoved|face|ansigt|mouth|mund|jaw|kaebe)(?: |$)/.test(facialName(current)))return current;
 }return found;}
function anatomy(scene){var cached=anatomies.get(scene),parts=scene.parts||[];if(cached&&cached.parts===parts&&cached.length===parts.length)return cached;
 var map=Object.create(null),faces=[],seen=Object.create(null);parts.forEach(function(part){map[part.id]=part;});
 parts.forEach(function(part){if(!mouthKind(part))return;var root=actorRoot(map,part);if(seen[root.id])return;seen[root.id]=true;
  var head=part,ancestor=part,visited={};while(ancestor&&!visited[ancestor.id]){visited[ancestor.id]=true;if(headPart(ancestor)){head=ancestor;break;}if(ancestor.id===root.id)break;ancestor=map[ancestor.parent];}
  if(head===part){head=parts.find(function(candidate){return headPart(candidate)&&beneath(map,candidate.id,root.id);})||map[part.parent]||part;}
  var facial={eyes:[],pupils:[],brows:[],lids:[],surfaces:[],open:"",closed:""};
  parts.forEach(function(candidate){if(!beneath(map,candidate.id,head.id))return;var label=facialName(candidate),kind=mouthKind(candidate);
   if(kind){if(!facial[kind])facial[kind]=candidate.id;}
   else if(/(?:^| )(?:eyelid|eyelids|lids|lid|oejelaag|oejenlaag|blink)(?: |$)/.test(label)||/eye lids/.test(label))facial.lids.push(candidate.id);
   else if(/(?:^| )(?:eyebrow|eyebrows|brow|brows|bryn|oejenbryn)(?: |$)/.test(label))facial.brows.push(candidate.id);
   else if(/(?:^| )(?:pupil|pupils|pupilol|gaze|blik|pupiller)(?: |$)/.test(label))facial.pupils.push(candidate.id);
   else if(/(?:^| )(?:eye|eyes|oeje|oejne)(?: |$)/.test(label))facial.eyes.push(candidate.id);
   else if(candidate.facialRole==="surface")facial.surfaces.push(candidate.id);
  });
  var open=map[facial.open],variants=(open&&open.variants||[]).map(function(variant){return Object.assign({},variant);});
  faces.push({actorId:String(root.actorId||root.characterId||root.id),actorPartId:root.id,headId:head.id,label:String(root.role||root.speaker||root.characterName||root.name||root.id),parts:facial,variants:variants});
 });cached={parts:parts,length:parts.length,map:map,faces:faces};anatomies.set(scene,cached);return cached;
}
function resolve(scene,partId){if(!scene)return null;var found=anatomy(scene),part=found.map[partId];return found.faces.find(function(face){return partId===face.actorId||partId===face.actorPartId||part&&beneath(found.map,partId,face.headId);})||null;}
function variantFor(part,viseme){var names={rest:["rest","closed","close","neutral","lukket","m","b","p"],M:["m","b","p","closed","rest","lukket"],A:["a","aa","ah","open","aaben"],E:["e","i","wide","smile","bred"],O:["o","u","round","rund"],F:["f","v","teeth"],C:["c","s","consonant","open"]},wanted=names[viseme]||names.C;
 return ((part&&part.variants)||[]).find(function(variant){var label=clean(variant.viseme||variant.lipShape||variant.name||String(variant.id||"").split(/[-/]/).pop());return wanted.indexOf(label)>=0;});
}
function variantMaps(scene,face,pose){var open=anatomy(scene).map[face.parts.open]||{},defaults={},effective={};SOUNDS.forEach(function(sound){var variant=variantFor(open,sound.id),mapped=pose&&pose.mouthMap&&pose.mouthMap[sound.id];defaults[sound.id]=variant?variant.id:"";effective[sound.id]=(open.variants||[]).some(function(item){return item.id===mapped;})?mapped:defaults[sound.id];});return {defaultVariantMap:defaults,variantMap:effective};}
function set(node,key,value){if(!node)return;if(value===undefined||value===null){if(node.removeAttribute)node.removeAttribute(key);}else node.setAttribute(key,String(value));}
function saved(view){var found=savedViews.get(view);if(!found){found={nodes:Object.create(null),local:0};savedViews.set(view,found);}return found;}
function change(view,id,target,key,value){var node=view.nodes&&view.nodes[id];if(!node||!node[target])return;var cache=saved(view),entry=cache.nodes[id];if(!entry||entry.node!==node){entry={node:node,shape:{},el:{}};cache.nodes[id]=entry;}if(!own.call(entry[target],key))entry[target][key]=node[target].getAttribute(key);set(node[target],key,value);}
function restore(view,opacity){var cache=savedViews.get(view);if(!cache)return;Object.keys(cache.nodes).forEach(function(id){var entry=cache.nodes[id],node=entry.node;Object.keys(entry.shape).forEach(function(key){set(node.shape,key,entry.shape[key]);});if(own.call(entry,"imageUseHref")&&node.shape.firstChild)set(node.shape.firstChild,"href",entry.imageUseHref);Object.keys(entry.el).forEach(function(key){if(key!=="opacity"||opacity)set(node.el,key,entry.el[key]);});});cache.nodes=Object.create(null);}
function prepare(view){restore(view,false);}
function bounds(part){var geo=part.geo||{};if(part.type==="image"||part.type==="rect")return {x:num(geo.x,-(part.type==="image"?75:40)),y:num(geo.y,-(part.type==="image"?55:25)),w:num(geo.w,part.type==="image"?150:80),h:num(geo.h,part.type==="image"?110:50)};
 if(part.type==="circle"||part.type==="ellipse"){var rx=num(geo.rx,num(geo.r,20)),ry=num(geo.ry,num(geo.r,20)),cx=num(geo.cx,0),cy=num(geo.cy,0);return {x:cx-rx,y:cy-ry,w:rx*2,h:ry*2};}
 var numbers=String(geo.d||"").match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[],xs=[],ys=[];for(var i=0;i+1<numbers.length;i+=2){xs.push(Number(numbers[i]));ys.push(Number(numbers[i+1]));}var x=xs.length?Math.min.apply(Math,xs):-10,y=ys.length?Math.min.apply(Math,ys):0;return {x:x,y:y,w:Math.max(2,xs.length?Math.max.apply(Math,xs)-x:20),h:Math.max(2,ys.length?Math.max.apply(Math,ys)-y:5)};
}
function localGraphic(view,id,dx,dy,sx,sy,angle){var node=view.nodes&&view.nodes[id];if(!node||!node.shape)return;var box=bounds(node.part||{}),cx=box.x+box.w/2,cy=box.y+box.h/2,base=node.shape.getAttribute("transform")||"";change(view,id,"shape","transform",base+" translate("+num(dx,0)+" "+num(dy,0)+") translate("+cx+" "+cy+") rotate("+num(angle,0)+") scale("+num(sx,1)+" "+num(sy,1)+") translate("+(-cx)+" "+(-cy)+")");}
function opacity(view,ids,value){ids.forEach(function(id){change(view,id,"el","opacity",value);});}
function showVariant(view,id,variant){var node=view.nodes&&view.nodes[id];if(!node||!variant||node.part.type!=="image")return false;
 if(node.part.geo&&node.part.geo.crop&&typeof Engine.showImageVariant==="function"){
  change(view,id,"shape","viewBox",node.shape.getAttribute("viewBox"));var entry=saved(view).nodes[id];
  if(!own.call(entry,"imageUseHref"))entry.imageUseHref=node.shape.firstChild&&node.shape.firstChild.getAttribute("href");
  Engine.showImageVariant(view,node,variant);
 }else change(view,id,"shape","href",Engine.imageHref(view.wiki,variant));
 return true;
}
function showMouth(view,face,variantId){var id=face.parts.open,node=view.nodes&&view.nodes[id],part=node&&node.part,variant=part&&(part.variants||[]).find(function(item){return item.id===variantId;});if(!node||!variant)return false;var href=Engine.imageHref(view.wiki,variant);if(!href)return false;
 showVariant(view,id,variant);change(view,id,"el","opacity",1);if(face.parts.closed)change(view,face.parts.closed,"el","opacity",0);return true;
}
function eyes(view,face,pose,previewing){var choice=pose.eyes||"auto",ids=face.parts,blink=choice==="blink",elapsed=num(pose.time,0)-num(pose.eyesAt,num(pose.time,0));
 if(blink){if(!previewing&&(elapsed<0||elapsed>=.28))choice="auto";else choice="closed";}
 if(choice==="auto")return;
 var switched=ids.eyes.length>0&&ids.eyes.every(function(id){var node=view.nodes&&view.nodes[id],variants=node&&node.part.variants||[],variant=variants.find(function(v){return v.id===choice;});return showVariant(view,id,variant);});
 if(switched){opacity(view,ids.eyes,1);opacity(view,ids.lids,0);opacity(view,ids.pupils,choice==="closed"?0:1);return;}
 if(choice==="closed"){opacity(view,ids.lids,1);opacity(view,ids.pupils,0);if(ids.lids.length)opacity(view,ids.eyes,0);else ids.eyes.forEach(function(id){localGraphic(view,id,0,0,1,.08,0);});return;}
 opacity(view,ids.lids,0);opacity(view,ids.eyes,1);opacity(view,ids.pupils,1);
 if(choice==="wide"||choice==="squint"){var sy=choice==="wide"?1.22:.46;ids.eyes.forEach(function(id){localGraphic(view,id,0,0,1,sy,0);});ids.pupils.forEach(function(id){localGraphic(view,id,0,0,1,choice==="wide"?1.08:.55,0);});}
 else if(["left","right","up","down"].indexOf(choice)>=0){ids.pupils.forEach(function(id){var box=bounds((view.nodes[id]||{}).part||{}),dx=(choice==="left"?-1:choice==="right"?1:0)*Math.min(5,box.w*.08),dy=(choice==="up"?-1:choice==="down"?1:0)*Math.min(3,box.h*.12);localGraphic(view,id,dx,dy,1,1,0);});}
}
function mood(view,face,pose,signal){var name=pose.mood||"original";if(name==="original")return;var moves={neutral:[0,0],happy:[-2,-3],sad:[2,-7],angry:[2,7],surprised:[-6,0]},move=moves[name]||moves.neutral;
 (face.parts.surfaces||[]).forEach(function(id){var node=view.nodes&&view.nodes[id],wanted=name==="angry"?"sad":name,variant=(node&&node.part.variants||[]).find(function(v){return v.id===wanted;});showVariant(view,id,variant);});
 face.parts.brows.forEach(function(id){localGraphic(view,id,0,move[0],1,1,move[1]);});
 if(signal&&num(signal.open,0)>.06)return;
 var mouth=view.nodes&&view.nodes[face.parts.closed],mouthVariant=(mouth&&mouth.part.variants||[]).find(function(v){return v.id===name||name==="neutral"&&v.id==="rest";});if(mouthVariant){showVariant(view,face.parts.closed,mouthVariant);return;}
 if(name==="surprised"){var open=view.nodes&&view.nodes[face.parts.open],variant=variantFor(open&&open.part,"O");if(variant&&showMouth(view,face,variant.id))return;}
 var closed=view.nodes&&view.nodes[face.parts.closed];if(!closed||closed.part.type!=="path")return;var box=bounds(closed.part),x=box.x,right=x+box.w,y=num((String(closed.part.geo&&closed.part.geo.d||"").match(/[-+]?(?:\d*\.)?\d+/g)||[])[1],box.y),middle=x+box.w/2,curve=name==="happy"?box.w*.3:name==="sad"?-box.w*.22:name==="angry"?-box.w*.08:0;
 change(view,face.parts.closed,"shape","d","M"+x+" "+y+" Q"+middle+" "+(y+curve)+" "+right+" "+y);
}
function applyOne(view,face,pose,signal,previewing){signal=signal||{viseme:"rest",open:0};eyes(view,face,pose,previewing);mood(view,face,pose,signal);
 var variant=pose.mouth&&pose.mouth.mode==="fixed"?pose.mouth.variant:pose.mouthMap&&pose.mouthMap[signal.viseme];if(variant)showMouth(view,face,variant);
}
function apply(view,keys,localTime,globalTime,signals){if(!view||!view.scene||!Array.isArray(keys)||!keys.length)return;var cache=saved(view);cache.local=localTime;
 anatomy(view.scene).faces.forEach(function(face){var pose=state(keys,globalTime,face.actorId);if(!pose.active)return;applyOne(view,face,pose,signals&&signals[face.actorPartId],false);});
}
function sourceGraphic(view,node,time){var part=node.part||{},geo=part.geo||{},shape=node.shape;if(!shape)return;set(shape,"transform",null);
 if(part.type==="path")set(shape,"d",String(geo.d||""));
 if(part.type==="ellipse"){set(shape,"rx",num(geo.rx,30));set(shape,"ry",num(geo.ry,18));}
 if(part.type==="image"){var box=bounds(part);set(shape,"x",box.x);set(shape,"y",box.y);set(shape,"width",box.w);set(shape,"height",box.h);var authored=Engine.state(part,time),variant=(part.variants||[]).find(function(item){return item.id===authored.variantId;})||(part.variants||[])[0];if(variant){if(typeof Engine.showImageVariant==="function")Engine.showImageVariant(view,node,variant);else set(shape,"href",Engine.imageHref(view.wiki,variant));}}
 set(node.el,"opacity",Engine.state(part,time).opacity);
}
function preview(view,actorId,pose){if(!view||!view.scene)return null;var face=resolve(view.scene,actorId);if(!face)return null;restore(view,true);var local=num(view.localTime,0),ids=[face.parts.open,face.parts.closed].concat(face.parts.eyes,face.parts.pupils,face.parts.brows,face.parts.lids,face.parts.surfaces||[]);
 ids.forEach(function(id){var node=id&&view.nodes&&view.nodes[id];if(node)sourceGraphic(view,node,local);});
 var selected=Object.assign({eyes:"auto",mood:"original",mouth:{mode:"auto"},mouthMap:{},time:0,eyesAt:0},pose||{});applyOne(view,face,selected,{viseme:"rest",open:0},true);return face;
}
function reset(view){restore(view,true);savedViews.delete(view);}
function invalidate(view){if(view&&view.scene)anatomies.delete(view.scene);}
exports.PRESETS=PRESETS;exports.EYES=EYES;exports.SOUNDS=SOUNDS;exports.preset=preset;exports.state=state;exports.withKey=withKey;exports.resolve=resolve;exports.variantFor=variantFor;exports.variantMaps=variantMaps;exports.prepare=prepare;exports.apply=apply;exports.preview=preview;exports.reset=reset;exports.invalidate=invalidate;
})();
