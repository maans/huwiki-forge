/*\
title: $:/plugins/huwiki/musical/lipsync.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Deterministic manuscript animation. Optional authored viseme frames can use
// word offsets and a measured energy envelope. They are not phonetic recognition.
// Without timed frames the original letter/punctuation approximation is kept.
// Rendering never alters the authored scene, keyframes, root or head transform.
var Engine=require("$:/plugins/huwiki/cutout/engine.js"),Face;
try{Face=require("$:/plugins/huwiki/musical/face.js");}catch(ignore){}
if(!Face||typeof Face.resolve!=="function"||typeof Face.apply!=="function")Face=null;
var views=new WeakMap();
var ALIASES={soldat:"soldier",soldaten:"soldier",soldier:"soldier",heks:"witch",heksen:"witch",witch:"witch",prinsesse:"princess",prinsessen:"princess",princess:"princess",konge:"king",kongen:"king",king:"king",dronning:"queen",dronningen:"queen",queen:"queen",koebmand:"merchant",kobmand:"merchant",merchant:"merchant",barn:"child",barnet:"child",child:"child",dommer:"judge",dommeren:"judge",judge:"judge",hund:"dog",hunden:"dog",dog:"dog",fortaeller:"narrator",narrator:"narrator"};
function num(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clean(value){return String(value||"").toLowerCase().replace(/æ/g,"ae").replace(/ø/g,"oe").replace(/å/g,"aa").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function canonical(value){value=clean(value);return ALIASES[value]||value;}
function splitSpeaker(text){text=String(text||"");var match=/^\s*([^:\n]{1,80}):\s*([\s\S]*)$/.exec(text);return {speaker:match?match[1].replace(/\([^)]*\)|\[[^\]]*\]/g,"").trim():"",text:(match?match[2]:text).replace(/\[[^\]]*\]|\([^)]*\)/g," ")};}
function partMap(scene){var map=Object.create(null);(scene.parts||[]).forEach(function(part){map[part.id]=part;});return map;}
function beneath(map,id,root){var seen={};while(id&&map[id]&&!seen[id]){if(id===root)return true;seen[id]=true;id=map[id].parent;}return false;}
function actorRoot(map,part){var current=part,found=part,seen={};while(current&&current.parent&&map[current.parent]&&!seen[current.parent]){seen[current.parent]=true;current=map[current.parent];found=current;
  if(current.actor===true||current.speaker||current.role||current.characterName)return current;
  if(current.type==="group"&&!/\b(?:head|hoved|face|ansigt|mouth|mund|jaw|kaebe)\b/.test(clean(current.name||current.id)))return current;
 }return found;}
function mouthKind(part){var label=clean((part.name||"")+" "+part.id);if(!/(?:^| )(?:mouth|mund|lip|lips|laeber|smile|smil)(?: |$)/.test(label))return "";
 if(/(?:^| )(?:closed|rest|neutral|smile|smil|lukket)(?: |$)/.test(label))return "closed";
 if(/(?:^| )(?:open|aaben|tale|sang|speak|sing)(?: |$)/.test(label)||part.type==="ellipse"||part.type==="image")return "open";
 return part.type==="path"?"closed":"open";
}
function actors(scene){var map=partMap(scene),found=Object.create(null),result=[];(scene.parts||[]).forEach(function(part){var kind=mouthKind(part);if(!kind)return;var root=actorRoot(map,part),actor=found[root.id];if(!actor){actor={id:root.id,label:String(root.role||root.speaker||root.characterName||root.name||root.id),open:"",closed:""};found[root.id]=actor;result.push(actor);}if(!actor[kind])actor[kind]=part.id;});return result;}
function suggest(scene,text){var who=canonical(splitSpeaker(text).speaker);if(!who)return [];var found=actors(scene),map=partMap(scene);if(who==="alle"||who==="all"||who==="kor"||who==="chorus")return found;
 return found.filter(function(actor){var part=map[actor.id]||{},labels=[actor.label.split(/[·|]/)[0],part.role,part.speaker,part.characterName],tail=String(actor.id).split(/[-/]/).pop();if(ALIASES[clean(tail)])labels.push(tail);return labels.some(function(label){return label&&canonical(label)===who;});});
}
function ranges(part,duration){duration=Math.max(0,num(duration,0));var keys=(part.keys||[]).filter(function(key){return key&&Number.isFinite(Number(key.t));}).slice().sort(function(a,b){return Number(a.t)-Number(b.t);}),result=[],visible=keys.length?num(keys[0].opacity,1)>=.45:true,start=visible?0:null;
 keys.forEach(function(key){var time=clamp(num(key.t,0),0,duration),next=num(key.opacity,1)>=.45;if(next&&!visible)start=time;else if(!next&&visible&&start!==null&&time>start)result.push({start:start,end:time});visible=next;});if(visible&&start!==null&&duration>start)result.push({start:start,end:duration});return result;
}
function timing(part,duration){var items=ranges(part,duration);return items.length?{start:items[0].start,end:items[0].end}:{start:0,end:0};}
function speech(text){var value=splitSpeaker(text).text.toLowerCase(),segments=[],total=0;Array.from(value).forEach(function(letter){var viseme="C",open=.32,width=1,height=.42,weight=.55;
  if(/[.?!…]/.test(letter)){viseme="rest";open=0;width=1;height=0;weight=2.8;}
  else if(/[,;:—–-]/.test(letter)){viseme="rest";open=0;width=1;height=0;weight=1.5;}
  else if(/\s/.test(letter)){viseme="rest";open=0;width=1;height=0;weight=.45;}
  else if(/[mbp]/.test(letter)){viseme="M";open=0;width=1;height=0;weight=.9;}
  else if(/[ouåø]/.test(letter)){viseme="O";open=.78;width=.66;height=1.06;weight=1.2;}
  else if(/[eiyæ]/.test(letter)){viseme="E";open=.58;width=1.24;height=.58;weight=1.05;}
  else if(letter==="a"){viseme="A";open=.94;width=1.02;height=1.15;weight=1.25;}
  else if(/[fv]/.test(letter)){viseme="F";open=.2;width=1.1;height=.25;weight=.65;}
  else if(!/[a-z0-9]/.test(letter))return;
  segments.push({start:total,end:total+weight,viseme:viseme,open:open,width:width,height:height});total+=weight;
 });return {segments:segments,total:total};}
function rest(){return {viseme:"rest",open:0,width:1,height:0};}
function samplePlan(plan,elapsed,duration){if(!plan.total||!(duration>0)||!Number.isFinite(elapsed)||elapsed<0||elapsed>=duration)return rest();var position=elapsed/duration*plan.total,low=0,high=plan.segments.length-1;
 while(low<high){var mid=(low+high)>>1;if(position<plan.segments[mid].end)high=mid;else low=mid+1;}var part=plan.segments[low];return {viseme:part.viseme,open:part.open,width:part.width,height:part.height};}
function sample(text,elapsed,duration){return samplePlan(speech(text),num(elapsed,-1),num(duration,0));}
// Authored seconds are relative to the beginning of this cue/take, never
// stretched to a different caption length. A terminal rest frame can end the
// voice before its caption disappears. Copy and sort; never touch source data.
var TIMED_SHAPES={rest:{open:0,width:1,height:0},M:{open:0,width:1,height:0},A:{open:.94,width:1.02,height:1.15},E:{open:.58,width:1.24,height:.58},O:{open:.78,width:.66,height:1.06},F:{open:.2,width:1.1,height:.25},C:{open:.32,width:1,height:.42}};
function timedFrames(source){if(!Array.isArray(source))return null;var frames=[];
 source.forEach(function(frame,index){if(!frame)return;var t=Number(frame.t),label=String(frame.viseme||"rest"),v=label.toUpperCase()==="REST"?"rest":label.toUpperCase();if(!Number.isFinite(t)||t<0||!TIMED_SHAPES[v])return;
  frames.push({t:t,viseme:v,open:v==="rest"||v==="M"?0:clamp(num(frame.open,TIMED_SHAPES[v].open),0,1),index:index});
 });frames.sort(function(a,b){return a.t-b.t||a.index-b.index;});
 // If an editor writes two frames at one instant, the later authored frame wins.
 return frames.length?frames.filter(function(frame,i){return i===frames.length-1||frame.t!==frames[i+1].t;}):null;
}
function frameIndex(frames,time){var low=0,high=frames.length;while(low<high){var mid=(low+high)>>1;if(frames[mid].t<=time)low=mid+1;else high=mid;}return low-1;}
function triangleIntegral(u){var half=.03;if(u<=-half)return 0;if(u>=half)return 1;return u<=0?(u+half)*(u+half)/(2*half*half):1-(half-u)*(half-u)/(2*half*half);}
function smoothedEnvelope(frames,time,duration){
 var from=Math.max(0,time-.03),to=Math.min(duration,time+.03),i=frameIndex(frames,from),cursor=from,amount=0;
 // Exact integral of piecewise constant energy under a triangular kernel.
 // Unlike a few sampled taps, this stays continuous between rendering frames.
 while(cursor<to){var next=i+1<frames.length?frames[i+1].t:to,end=Math.min(to,next),value=i<0?0:frames[i].open;
  amount+=value*(triangleIntegral(end-time)-triangleIntegral(cursor-time));cursor=end;i++;
 }return clamp(amount,0,1);
}
function sampleTimed(frames,elapsed,duration){var resting={viseme:"rest",open:0,width:1,height:0,timed:true};if(!frames||!frames.length||!Number.isFinite(elapsed)||elapsed<0||elapsed>=duration)return resting;
 var i=frameIndex(frames,elapsed);if(i<0)return resting;var frame=frames[i],shape=TIMED_SHAPES[frame.viseme];
 // Exact consonant closures and word rests override coarticulation. Envelope
 // smoothing is a deterministic 60 ms triangular window, so seeking produces
 // exactly the same result as forward playback and never accumulates state.
 if(frame.viseme==="rest"||frame.viseme==="M")return {viseme:frame.viseme,open:0,width:1,height:0,timed:true};if(frame.open<.08)return resting;
 var amount=smoothedEnvelope(frames,elapsed,duration);
 if(amount<.08)return resting;return {viseme:frame.viseme,open:amount,width:shape.width,height:shape.height,timed:true};
}
function compile(scene,options){options=options||{};var title=String(scene._title||options.sceneTitle||""),map=partMap(scene),characters=actors(scene),cues=[],bindings=[],seen=Object.create(null),recordings=Array.isArray(options.audioClips)?options.audioClips:[];
 (scene.parts||[]).forEach(function(part,index){var source=part.lipSync;if(part.type!=="text"||!source||source.enabled!==true)return;
  var targets=Array.isArray(source.targets)&&source.targets.length?source.targets:[source.target];
  targets.filter(function(target,i){return target&&targets.indexOf(target)===i;}).forEach(function(target){
  var config=Object.assign({},source,{target:target}),actor=characters.find(function(item){return item.id===config.target;}),target=String(config.target||""),has=Object.prototype.hasOwnProperty,open=String((has.call(config,"open")?config.open:actor&&actor.open)||""),closed=String((has.call(config,"closed")?config.closed:actor&&actor.closed)||"");
  if(!target||!map[target]||!map[open]||!beneath(map,open,target)||closed===open)return;if(closed&&(!map[closed]||!beneath(map,closed,target)))return;
  var jaw=target+"-jaw",binding={target:target,open:open,closed:closed,jaw:map[jaw]&&beneath(map,jaw,target)?jaw:""},key=target+"\n"+open+"\n"+closed;if(!seen[key]){seen[key]=binding;bindings.push(binding);}else binding=seen[key];
  var matches=recordings.filter(function(clip){return clip&&String(clip.cueId||"")===String(part.id)&&String(clip.sceneTitle||"")===title;}).map(function(clip,clipIndex){var offset=Math.max(0,num(clip.offset,0)),duration=Math.max(0,num(clip.duration,0));return {id:String(clip.id||clipIndex),asset:String(clip.asset||""),start:Math.max(0,num(clip.start,0)),offset:offset,duration:duration,sourceDuration:Math.max(offset+duration,num(clip.sourceDuration,offset+duration)),speech:speech(clip.text||part.text||"")};});
  // Original authored mouth frames belong to a particular line and take.
  // Editing text or replacing a recording must not silently reuse stale timing.
  var sameText=!has.call(config,"visemeText")||String(config.visemeText)===String(part.text||"");
  cues.push({id:String(part.id),index:index,binding:binding,offset:num(config.offset,0),strength:clamp(num(config.strength,1),0,1),mode:config.timing==="script"?"script":"auto",intervals:ranges(part,scene.duration),speech:speech(part.text||""),visemes:sameText?timedFrames(config.visemes):null,visemeAudioAsset:String(config.visemeAudioAsset||""),recordings:matches});
  });
 });return {sceneTitle:title,actors:characters,cues:cues,bindings:bindings};
}
var CONFIG_FIELDS=["enabled","target","open","closed","timing","offset","strength","visemes","visemeText","visemeAudioAsset"];
var CLIP_FIELDS=["id","cueId","sceneTitle","asset","start","offset","duration","sourceDuration","text"];
function targetStamp(config){return JSON.stringify(config.targets||null);}
function visemeStamp(config){return (Array.isArray(config.visemes)?config.visemes:[]).map(function(f){return f?[f.t,f.viseme,f.open]:null;});}
function sameVisemes(config,stamp){var frames=Array.isArray(config.visemes)?config.visemes:[];return !!stamp&&frames.length===stamp.length&&!frames.some(function(frame,i){var old=stamp[i];return !frame?!old?false:true:!old||frame.t!==old[0]||frame.viseme!==old[1]||frame.open!==old[2];});}
function sourceStamp(scene){var entries=[];(scene.parts||[]).forEach(function(part){if(!part.lipSync)return;var config=part.lipSync;entries.push({part:part,text:part.text,config:config,targetValues:targetStamp(config),values:CONFIG_FIELDS.map(function(k){return config[k];}),visemeValues:visemeStamp(config),keys:part.keys,keyValues:(part.keys||[]).map(function(k){return [k.t,k.opacity];})});});return {parts:scene.parts,length:(scene.parts||[]).length,entries:entries,duration:scene.duration};}
function sameSource(scene,stamp){if(!stamp||stamp.parts!==scene.parts||stamp.length!==(scene.parts||[]).length||stamp.duration!==scene.duration)return false;var index=0,valid=true;(scene.parts||[]).some(function(part){if(!part.lipSync)return false;var saved=stamp.entries[index++],config=part.lipSync;if(!saved||saved.part!==part||saved.text!==part.text||saved.config!==config||saved.keys!==part.keys||saved.keyValues.length!==(part.keys||[]).length){valid=false;return true;}
  if(targetStamp(config)!==saved.targetValues||CONFIG_FIELDS.some(function(k,i){return config[k]!==saved.values[i];})||!sameVisemes(config,saved.visemeValues)||(part.keys||[]).some(function(k,i){return k.t!==saved.keyValues[i][0]||k.opacity!==saved.keyValues[i][1];})){valid=false;return true;}return false;});return valid&&index===stamp.entries.length;}
function clipStamp(clips){return clips.map(function(clip){return CLIP_FIELDS.map(function(key){return clip&&clip[key];});});}
function sameClips(clips,stamp){return !!stamp&&stamp.length===clips.length&&!clips.some(function(clip,i){return CLIP_FIELDS.some(function(key,j){return (clip&&clip[key])!==stamp[i][j];});});}
function cacheFor(view,options,title){var cache=views.get(view),clips=options.audioClips||[];if(!cache){cache={plan:null,nodes:Object.create(null),local:0};views.set(view,cache);}if(!cache.plan||cache.scene!==view.scene||cache.title!==title||!sameSource(view.scene,cache.source)||!sameClips(clips,cache.clips)){
  cache.scene=view.scene;cache.title=title;cache.plan=compile(view.scene,{sceneTitle:title,audioClips:clips});cache.source=sourceStamp(view.scene);cache.clips=clipStamp(clips);
 }return cache;}
var GEOMETRY=["rx","ry","r","x","y","width","height","transform"];
function set(node,name,value){if(!node)return;if(value===null||value===undefined){if(node.removeAttribute)node.removeAttribute(name);}else node.setAttribute(name,String(value));}
function keep(cache,node,id){var saved=cache.nodes[id];if(!saved||saved.node!==node){saved={node:node,geometry:Object.create(null),opacity:null,href:node.shape&&node.shape.getAttribute("href"),hadViseme:node.el&&node.el.getAttribute("data-lipsync-viseme"),hadCue:node.el&&node.el.getAttribute("data-lipsync-cue")};GEOMETRY.forEach(function(key){saved.geometry[key]=node.shape&&node.shape.getAttribute(key);});cache.nodes[id]=saved;}return saved;}
function jawTransform(part,time,amount){var s=Engine.state(part,time),p=part.pivot||{};return "translate("+s.x+" "+(s.y+Math.min(1.5,Math.max(0,amount)))+") rotate("+s.r+") scale("+s.sx+" "+s.sy+") translate("+(-num(p.x,0))+" "+(-num(p.y,0))+")";}
function restoreNode(saved,view,time,opacity){var node=saved.node,part=node.part||{},shape=node.shape;GEOMETRY.forEach(function(key){set(shape,key,saved.geometry[key]);});
 if(saved.jaw)set(node.el,"transform",jawTransform(part,time,0));
 if(part.type==="image"){var state=Engine.state(part,time),variant=(part.variants||[]).find(function(v){return v.id===state.variantId;})||(part.variants||[])[0];if(typeof Engine.showImageVariant==="function")Engine.showImageVariant(view,node,variant||part);else{var href=variant&&typeof Engine.imageHref==="function"?Engine.imageHref(view.wiki,variant):saved.href;set(shape,"href",href);}}
 if(opacity)set(node.el,"opacity",saved.opacity);set(node.el,"data-lipsync-viseme",saved.hadViseme);set(node.el,"data-lipsync-cue",saved.hadCue);
}
function restoreShapes(cache,view,time,opacity){Object.keys(cache.nodes).forEach(function(id){restoreNode(cache.nodes[id],view,time,opacity);});}
function variantFor(part,viseme){var names={rest:["rest","closed","close","neutral","lukket","m","b","p"],M:["m","b","p","closed","rest","lukket"],A:["a","aa","ah","open","aaben"],E:["e","i","wide","smile","bred"],O:["o","u","round","rund"],F:["f","v","teeth"],C:["c","s","consonant","open"]},wanted=names[viseme]||names.C;
 return (part.variants||[]).find(function(variant){var label=clean(variant.viseme||variant.lipShape||variant.name||String(variant.id||"").split(/[-/]/).pop());return wanted.indexOf(label)>=0;});}
function appearance(cache,view,binding,value,cueId,strength){var open=view.nodes&&view.nodes[binding.open],closed=view.nodes&&view.nodes[binding.closed],amount=value.open*strength,speaking=amount>(value.timed ? .08 : .06);
 if(!open)return;var saved=keep(cache,open,binding.open),shape=open.shape,part=open.part,variant=part.type==="image"&&variantFor(part,speaking?value.viseme:"rest"),hasRest=part.type==="image"&&variantFor(part,"rest");
 var jaw=binding.jaw&&view.nodes&&view.nodes[binding.jaw];if(jaw){var jawSaved=keep(cache,jaw,binding.jaw);jawSaved.jaw=true;if(jawSaved.opacity===null)jawSaved.opacity=jaw.el.getAttribute("opacity");set(jaw.el,"transform",jawTransform(jaw.part,cache.local,speaking&&value.timed?amount*1.5:0));}
 // Capture the authored pose after Engine/Motion painting, before overriding
 // only the mouth's visibility and local graphic geometry.
 if(saved.opacity===null)saved.opacity=open.el.getAttribute("opacity");
 set(open.el,"opacity",speaking||(!closed&&hasRest)?1:0);set(open.el,"data-lipsync-viseme",speaking?value.viseme:"rest");set(open.el,"data-lipsync-cue",speaking?cueId:"");
 if(variant&&typeof Engine.imageHref==="function"){if(typeof Engine.showImageVariant==="function")Engine.showImageVariant(view,open,variant);else{var href=Engine.imageHref(view.wiki,variant);if(href)set(shape,"href",href);}
  if(speaking&&value.timed&&part.deformMouth===true){var g=part.geo||{},cx=num(g.x,0)+num(g.w,1)/2,cy=num(g.y,0)+num(g.h,1)/2,base=saved.geometry.transform||"",xs=.95+.1*amount,ys=.85+.3*amount;set(shape,"transform",base+" translate("+cx+" "+cy+") scale("+xs+" "+ys+") translate("+(-cx)+" "+(-cy)+")");}
 }
 else if(speaking&&shape&&(part.type!=="image"||part.deformMouth===true)){var width=1+(value.width-1)*strength,height=Math.max(.08,value.height*strength);
  if(part.type==="ellipse"){set(shape,"rx",num(saved.geometry.rx,num(part.geo&&part.geo.rx,5))*width);set(shape,"ry",num(saved.geometry.ry,num(part.geo&&part.geo.ry,6))*height);}
  else{var geo=part.geo||{},cx=num(geo.cx,0),cy=num(geo.cy,0),base=saved.geometry.transform||"";set(shape,"transform",base+" translate("+cx+" "+cy+") scale("+width+" "+height+") translate("+(-cx)+" "+(-cy)+")");}
 }
 if(closed){var closedSaved=keep(cache,closed,binding.closed);if(closedSaved.opacity===null)closedSaved.opacity=closed.el.getAttribute("opacity");set(closed.el,"opacity",speaking?0:1);set(closed.el,"data-lipsync-viseme",speaking?value.viseme:"rest");set(closed.el,"data-lipsync-cue",speaking?cueId:"");}
}
function evaluate(cue,local,global){var chosen=null;if(cue.mode==="auto"&&cue.recordings.length){cue.recordings.forEach(function(clip,index){var start=clip.start+cue.offset,elapsed=global-start;if(elapsed<0||elapsed>=clip.duration)return;var useTimed=cue.visemes&&(!cue.visemeAudioAsset||clip.asset===cue.visemeAudioAsset);if(!chosen||start>=chosen.start)chosen={start:start,order:index,value:useTimed?sampleTimed(cue.visemes,clip.offset+elapsed,clip.sourceDuration):samplePlan(clip.speech,clip.offset+elapsed,clip.sourceDuration)};});return chosen;}
 cue.intervals.forEach(function(interval,index){var start=interval.start+cue.offset,elapsed=local-start;if(elapsed<0||elapsed>=interval.end-interval.start)return;if(!chosen||start>=chosen.start)chosen={start:start,order:index,value:cue.visemes?sampleTimed(cue.visemes,elapsed,interval.end-interval.start):samplePlan(cue.speech,elapsed,interval.end-interval.start)};});return chosen;
}
function choose(plan,local,global){var byActor=Object.create(null);plan.cues.forEach(function(cue){var evaluated=evaluate(cue,local,global);if(!evaluated)return;var old=byActor[cue.binding.target];if(!old||evaluated.start>old.state.start||evaluated.start===old.state.start&&cue.index>old.cue.index)byActor[cue.binding.target]={cue:cue,state:evaluated};});return byActor;}
function faceKeys(view,options){var film=options.film||view.scene;return film&&film.musical&&Array.isArray(film.musical.faceKeys)?film.musical.faceKeys:[];}
// Once a branch leaves the stage, release its transient face once. Hidden
// scenes then do no per-frame cue evaluation, image swapping, or facial work.
function deactivate(view){if(!view)return;var cache=views.get(view);if(!cache||!cache.active)return;cache.active=false;if(Face)Face.reset(view);restoreShapes(cache,view,cache.local,false);if(cache.plan)cache.plan.bindings.forEach(function(binding){appearance(cache,view,binding,rest(),"",0);});(view.clips||[]).forEach(function(child){deactivate(child.view);});Object.keys(view.nodes||{}).forEach(function(id){if(view.nodes[id].nested)deactivate(view.nodes[id].nested);});}
function apply(view,localTime,globalTime,options){if(!view||!view.scene)return [];options=options||{};var local=num(localTime,0),global=num(globalTime,local),clips=Array.isArray(options.audioClips)?options.audioClips:[],keys=faceKeys(view,options),rootDuration=Math.max(num(view.scene.duration,0),num(options.duration,0));clips.forEach(function(clip){rootDuration=Math.max(rootDuration,num(clip.start,0)+num(clip.duration,0));});var result=[];
 function visit(current,time,title,active,depth){if(!current||!current.scene||depth>16)return;if(!active){deactivate(current);return;}title=String(current.scene._title||title||"");var cache=cacheFor(current,{audioClips:clips},title);cache.local=time;cache.active=true;if(Face)Face.prepare(current);restoreShapes(cache,current,time,false);var signals=Object.create(null);
  if(options.enabled!==false){var byActor=local>=0&&local<rootDuration?choose(cache.plan,time,global):Object.create(null),captured=Object.create(null);
   cache.plan.bindings.forEach(function(binding){[binding.open,binding.closed].forEach(function(id){var node=id&&current.nodes&&current.nodes[id];if(node&&!captured[id]){captured[id]=true;var saved=keep(cache,node,id);saved.opacity=node.el.getAttribute("opacity");}});});
   cache.plan.bindings.forEach(function(binding){appearance(cache,current,binding,rest(),"",0);});
   Object.keys(byActor).forEach(function(id){var chosen=byActor[id],cue=chosen.cue;appearance(cache,current,cue.binding,chosen.state.value,cue.id,cue.strength);var signal={sceneTitle:title,target:id,cueId:cue.id,viseme:cue.strength>0?chosen.state.value.viseme:"rest",open:chosen.state.value.open*cue.strength};signals[id]=signal;result.push(signal);});
  }
  if(Face)Face.apply(current,keys,time,global,signals);
  var sequence=current.scene.scenes||[],which=Engine.clipAt(sequence,time).index,elapsed=0;(current.clips||[]).forEach(function(child,index){var settings=child.settings||sequence[index]||{},duration=Math.max(.1,num(settings.duration,4)),childTime=Engine.localTime(clamp(time-elapsed,0,duration),num(child.duration,child.view&&child.view.scene.duration||0),settings);visit(child.view,childTime,settings.source||settings.animation||settings.theatre,active&&index===which,depth+1);elapsed+=duration;});
  Object.keys(current.nodes||{}).forEach(function(id){var node=current.nodes[id],part=node.part||{};if(!node.nested)return;var childDuration=num(node.nested.duration,node.nested.scene&&node.nested.scene.duration||0);visit(node.nested,Engine.localTime(time,childDuration,part),part.animation,active&&time>=num(part.start,0),depth+1);});
 }
 visit(view,local,options.sceneTitle,true,0);return result;
}
function faceContext(view,partId,localTime,globalTime,options){if(!Face||!view||!view.scene)return null;options=options||{};var global=num(globalTime,num(localTime,0)),clips=Array.isArray(options.audioClips)?options.audioClips:[];
 function find(current,time,title,depth){if(!current||!current.scene||depth>16)return null;title=String(current.scene._title||title||"");var description=Face.resolve(current.scene,partId);
  if(description){var cache=cacheFor(current,{audioClips:clips},title),chosen=options.enabled===false?null:choose(cache.plan,time,global)[description.actorPartId],cue=chosen&&chosen.cue,value=chosen&&cue.strength>0?chosen.state.value:rest(),pose=Face.state(faceKeys(view,options),global,description.actorId),maps=Face.variantMaps(current.scene,description,pose),fixed=pose.mouth.mode==="fixed"&&description.variants.some(function(variant){return variant.id===pose.mouth.variant;}),mapped=pose.mouthMap[value.viseme],custom=!!(fixed||mapped&&description.variants.some(function(variant){return variant.id===mapped;})),effective=fixed?pose.mouth.variant:maps.variantMap[value.viseme];
   if(!custom&&value.open<=.06&&pose.mood==="surprised")effective=maps.defaultVariantMap.O||effective;
   return Object.assign({},description,maps,{view:current,leafView:current,scene:current.scene,sceneTitle:title,localTime:time,globalTime:global,state:pose,viseme:value.viseme,cueId:cue?cue.id:"",cue:cue||null,open:value.open*(cue?cue.strength:0),effectiveVariant:effective||"",custom:custom});
  }
  var sequence=current.scene.scenes||[],at=Engine.clipAt(sequence,time),child=(current.clips||[])[at.index],found;if(child){var settings=child.settings||sequence[at.index]||{};found=find(child.view,Engine.localTime(at.time,num(child.duration,child.view&&child.view.scene.duration||0),settings),settings.source||settings.animation||settings.theatre,depth+1);if(found)return found;}
  var ids=Object.keys(current.nodes||{});for(var i=0;i<ids.length;i++){var node=current.nodes[ids[i]],part=node.part||{};if(!node.nested||time<num(part.start,0))continue;found=find(node.nested,Engine.localTime(time,num(node.nested.duration,node.nested.scene&&node.nested.scene.duration||0),part),part.animation,depth+1);if(found)return found;}return null;
 }
 return find(view,num(localTime,0),options.sceneTitle,0);
}
function walk(view,callback,depth){if(!view||depth>16)return;callback(view);(view.clips||[]).forEach(function(child){walk(child.view,callback,depth+1);});Object.keys(view.nodes||{}).forEach(function(id){var node=view.nodes[id];if(node.nested)walk(node.nested,callback,depth+1);});}
function invalidate(view){walk(view,function(current){var cache=views.get(current);if(cache)cache.plan=null;if(Face)Face.invalidate(current);},0);}
function reset(view){walk(view,function(current){if(Face)Face.reset(current);var cache=views.get(current);if(!cache)return;restoreShapes(cache,current,cache.local,true);cache.nodes=Object.create(null);cache.plan=null;cache.active=false;},0);}
exports.actors=actors;exports.suggest=suggest;exports.timing=timing;exports.compile=compile;exports.sample=sample;exports.apply=apply;exports.faceContext=faceContext;exports.invalidate=invalidate;exports.reset=reset;
})();
