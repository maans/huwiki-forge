/*\
title: $:/plugins/huwiki/musical/editor.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Playlist=require("$:/plugins/huwiki/musical/playlist.js"),Engine=require("$:/plugins/huwiki/cutout/engine.js"),Motion=require("$:/plugins/huwiki/musical/motion.js"),NS="http://www.w3.org/2000/svg";
function el(doc,tag,cls,txt,parent){var e=doc.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;if(parent)parent.appendChild(e);return e;}
function num(x,f){x=Number(x);return Number.isFinite(x)?x:f;}
function lim(x,a,b){return Math.min(b,Math.max(a,num(x,0)));}
function round(x){return Math.round(x*100)/100;}
function interpolate(keys,t,prop,defaultValue){
 keys=(keys||[]).slice().sort(function(a,b){return a.t-b.t;});if(!keys.length)return defaultValue;
 var a=keys[0],b=a;if(t>=keys[keys.length-1].t)a=b=keys[keys.length-1];
 else if(t>a.t)for(var i=0;i<keys.length-1;i++)if(t>=keys[i].t&&t<=keys[i+1].t){a=keys[i];b=keys[i+1];break;}
 var q=a===b?0:lim((t-a.t)/(b.t-a.t),0,1);if(a.easing==="step")q=0;else if(a.easing!=="linear")q=q*q*(3-2*q);
 return num(a[prop],defaultValue)*(1-q)+num(b[prop],num(a[prop],defaultValue))*q;
}
function ensureMusical(film){var m=film.musical||(film.musical={version:1});
 if(!m.cameraB)m.cameraB={easing:"smooth",keys:[{t:0,x:400,y:225,zoom:1},{t:6,x:248,y:260,zoom:2.3},{t:10,x:675,y:270,zoom:2.3},{t:14,x:400,y:225,zoom:1}]};
 if(!Array.isArray(m.cuts))m.cuts=[{t:0,camera:"A"},{t:6,camera:"B"},{t:8,camera:"A"},{t:10,camera:"B"},{t:12,camera:"A"}];
 if(!m.lighting)m.lighting={keys:[{t:0,intensity:1},{t:4,intensity:.78},{t:8,intensity:1},{t:12,intensity:.85},{t:15.5,intensity:1}]};
 if(!Array.isArray(m.animationClips))m.animationClips=[];
 // Capture the original rest pose once, independently from editable keys.
 // This keeps beat-zero edits visible and preserves changes to the puppet rig.
 m.animationClips.forEach(function(c){
  c.motionReference=c.motionReference||{};
  Object.keys(c.motion||{}).forEach(function(id){
   var first=(c.motion[id]||[])[0];if(!first||c.motionReference[id])return;
   c.motionReference[id]={};
   ["x","y","r","sx","sy","opacity"].forEach(function(k){
    c.motionReference[id][k]=num(first[k],k==="sx"||k==="sy"||k==="opacity"?1:0);
   });
  });
 });
 return m;}
var translations={da:{title:"Musical Studio · tidslinje",help:"Vælg et spor, indsæt kontrolpunkter ved afspilningspositionen, eller træk dem vandret. Klik på et punkt for at redigere det.",song:"Musiknummer (komplet ABC)",backdrop:"Baggrund",stage:"Scene",foreground:"Forgrund",light:"Belysning",cameraA:"Kamera A",cameraB:"Kamera B",cuts:"Kameraklip",add:"+ Kontrolpunkt",remove:"Slet punkt",time:"Tid (sek.)",x:"X",y:"Y",r:"Rotation (°)",opacity:"Synlighed",zoom:"Zoom",intensity:"Lysstyrke",camera:"Aktivt kamera",easing:"Overgang",smooth:"Blød",step:"Klip",linear:"Lineær",readonly:"Hele musiknummeret afspilles som ét samlet ABC-spor. Redigér noderne i ABC-editoren.",empty:"Vælg et kontrolpunkt eller indsæt et nyt.",saved:"Gemt i wikien"},en:{title:"Musical Studio · timeline",help:"Select a track, add keyframes at the playhead, or drag them horizontally. Click a keyframe to edit it.",song:"Song (complete ABC)",backdrop:"Background",stage:"Stage",foreground:"Foreground",light:"Lighting",cameraA:"Camera A",cameraB:"Camera B",cuts:"Camera cuts",add:"+ Keyframe",remove:"Delete keyframe",time:"Time (sec)",x:"X",y:"Y",r:"Rotation (°)",opacity:"Opacity",zoom:"Zoom",intensity:"Light intensity",camera:"Active camera",easing:"Transition",smooth:"Smooth",step:"Cut",linear:"Linear",readonly:"The whole song plays on one ABC track. Edit notation in the ABC editor.",empty:"Select a control point or insert a new one.",saved:"Saved to wiki"}};
function attach(o){
 var doc=o.doc,film=o.film,m=ensureMusical(film),inner=o.view.clips&&o.view.clips[0]&&o.view.clips[0].view,source=inner&&inner.scene;
 var L=translations[/\/en(?:-|$)/i.test(o.wiki.getTiddlerText("$:/language",""))?"en":"da"];
 L.addSong=L===translations.da?"Tilføj musiknummer":"Add complete song";
 L.replaceSong=L===translations.da?"Skift nodeark":"Replace ABC score";
 L.removeSong=L===translations.da?"Fjern nummer":"Remove song";
 L.moveEarlier=L===translations.da?"Flyt tidligere":"Move earlier";
 L.moveLater=L===translations.da?"Flyt senere":"Move later";
 L.chooseSong=L===translations.da?"Vælg ABC-nodeark":"Choose ABC score";
 L.songInfo=L===translations.da?"Hele nummeret afspilles som ét spor. Instrumentstemmerne ligger inde i ABC-nodearket.":"Each full song is one clip; its instrument voices are inside the ABC score.";
 L.start=L===translations.da?"Start (sek.)":"Start (sec)";
 L.fadeIn=L===translations.da?"Indtoning (sek.)":"Fade in (sec)";
 L.fadeOut=L===translations.da?"Udtoning (sek.)":"Fade out (sec)";
 L.volume=L===translations.da?"Lydstyrke (%)":"Volume (%)";
 L.mute=L===translations.da?"Slå lyd fra":"Mute";
 L.overlap=L===translations.da?"Overlap":"Overlap";
 L.help=L===translations.da?"Hvert helt musiknummer har sit eget spor. Træk blokken for at forskyde starten, eller redigér crossfades i felterne nedenfor.":"Each full song has its own track. Drag its block to adjust the start, or edit crossfades in the fields below.";

 if(!Array.isArray(m.songs)||!m.songs.length)m.songs=[{id:"song-1",score:o.scoreTitle,start:0,duration:film.duration,kind:"complete-abc"}];
 m.songs=Playlist.reflow(m.songs,o.scoreTitle);
 var root=el(doc,"section","huw-musical-editor",undefined,o.host),head=el(doc,"div","huw-musical-editor-header",undefined,root);
 el(doc,"h3","",L.title,head);el(doc,"p","",L.help,root);
 var cameraLabel=el(doc,"span","huw-musical-active-camera","",head);
 L.name=L===translations.da?"Navn":"Name";L.color=L===translations.da?"Farve":"Color";L.text=L===translations.da?"Tekst":"Text";
 var clipBar=el(doc,"div","huw-musical-clip-editor-bar",undefined,root);
 clipBar.hidden=true;
 var clipBack=el(doc,"button","huw-musical-clip-back",L===translations.da?"← Tilbage til forestillingen":"← Back to performance",clipBar);clipBack.type="button";
 var clipHeading=el(doc,"div","huw-musical-clip-editor-heading",undefined,clipBar);
 var clipTitle=el(doc,"strong","huw-musical-clip-editor-title","",clipHeading);
 var clipMeta=el(doc,"span","huw-musical-clip-editor-meta","",clipHeading);
 var onionButton=el(doc,"button","huw-musical-onion-toggle","Onion skin",clipBar);
 onionButton.type="button";onionButton.title=L===translations.da?"Vis eller skjul forrige og næste stilling":"Show or hide previous and next poses";
 var onionEnabled=true,onionGhosts=[];
 function onionButtonState(){onionButton.setAttribute("aria-pressed",String(onionEnabled));onionButton.classList.toggle("is-active",onionEnabled);}
 function clearOnion(){onionGhosts.forEach(function(item){if(item.ghost.parentNode)item.ghost.parentNode.removeChild(item.ghost);});onionGhosts=[];}
 onionButton.onclick=function(){onionEnabled=!onionEnabled;onionButtonState();if(!onionEnabled)clearOnion();o.repaint();};
 onionButtonState();
 var rows=el(doc,"div","huw-musical-tracks",undefined,root),inspector=el(doc,"div","huw-musical-inspector",undefined,root),status=el(doc,"output","huw-musical-edited-status","",root);
 var playhead=0,choice={id:"song:"+m.songs[0].id,key:0},playheads=[],filter="all",zoom=1,expandedClipId="",detailClipId="",detailReturn=null,lastClipTap=null,isolation="";
 var tracks=[{id:"song",kind:"song",name:L.song},{id:"backdrop",kind:"part",part:"stage-back",name:L.backdrop},{id:"stage",kind:"part",part:"stage-floor",name:L.stage},{id:"foreground",kind:"part",part:"foreground-flags",name:L.foreground},{id:"lights",kind:"light",name:L.light}];
 if(Array.isArray(m.animationClips)&&m.animationClips.length){
  m.animationClips.forEach(function(c){tracks.push({id:"animation:"+c.id,kind:"animation",clipId:c.id,name:c.name||c.id});});
 }else if(source)source.parts.filter(function(p){return /-root$/.test(p.id)&&p.keys&&p.keys.length>1;}).forEach(function(p){tracks.push({id:p.id,kind:"part",part:p.id,name:p.name||p.id});});
 tracks.push({id:"camera-A",kind:"camera",name:L.cameraA},{id:"camera-B",kind:"camera",name:L.cameraB},{id:"cuts",kind:"cut",name:L.cuts});
 var map={};tracks.forEach(function(t){map[t.id]=t;});
 m.animationClips.forEach(function(c){map["accent:"+c.id]={id:"accent:"+c.id,kind:"accent",clipId:c.id,name:(c.name||c.id)+" · solo"};});
 function songTracks(){return m.songs.map(function(s,i){return {id:"song:"+s.id,kind:"song",index:i,name:"♫ "+(i+1)+". "+s.score};});}
 function group(t){return t.kind==="song"?"music":(t.kind==="camera"||t.kind==="cut")?"camera":(t.id==="lights"||["backdrop","stage","foreground"].indexOf(t.id)>=0)?"scene":"animation";}
 function track(){return songTracks().find(function(s){return s.id===choice.id;})||map[choice.id]||songTracks()[0]||tracks[0];}
 function axisDuration(){return Math.max(1,o.duration(),film.duration,Playlist.total(m.songs));}
 function part(t){return source&&source.parts.find(function(p){return p.id===t.part;});}
 function animation(t){return m.animationClips.find(function(c){return c.id===t.clipId;});}
 function activeDetail(){return m.animationClips.find(function(c){return c.id===detailClipId;});}
 function partById(id){return source&&source.parts&&source.parts.find(function(p){return p.id===id;});}
 function belongsToClip(clip,id){
  var p=partById(id),seen={};
  while(p&&!seen[p.id]){if(p.id===clip.target)return true;seen[p.id]=true;p=partById(p.parent);}
  return false;
 }
 function detailTrack(clip,partId){
  var p=source&&source.parts.find(function(k){return k.id===partId;});
  var id="motion:"+clip.id+":"+partId;
  return map[id]||(map[id]={id:id,kind:"motion",clipId:clip.id,part:partId,name:p&&p.name||partId});
 }
 function openAnimation(clipId){
  var clip=m.animationClips.find(function(c){return c.id===clipId;});if(!clip)return false;
  if(!detailClipId)detailReturn={id:choice.id,key:choice.key,filter:filter};
  clearOnion();detailClipId=clip.id;choice={id:"animation:"+clip.id,key:0};
  expandedClipId="animation:"+clip.id;
  o.host.classList.add("huw-musical--clip-detail");
  clipBar.hidden=false;draw();
  if(playhead<clip.start||playhead>clip.start+clip.duration)o.seek(clip.start);
  o.repaint();if(o.onSelect)o.onSelect(track());
  if(root.scrollIntoView)root.scrollIntoView({block:"nearest"});
  return true;
 }
 function closeAnimation(){
  if(!detailClipId)return false;
  clearOnion();detailClipId="";o.host.classList.remove("huw-musical--clip-detail");
  clipBar.hidden=true;
  if(detailReturn){choice={id:detailReturn.id,key:detailReturn.key};filter=detailReturn.filter;}
  detailReturn=null;lastClipTap=null;draw();o.repaint();
  return true;
 }
 clipBack.onclick=closeAnimation;
 function animationTime(c,beat){
  var clock=o.beatClock&&o.beatClock();if(!clock)return c.start+beat*.5;
  var start=lim(c.start,0,axisDuration()),lo=start,hi=axisDuration(),goal=clock.at(start)+beat;
  for(var i=0;i<24;i++){var mid=(lo+hi)/2;if(clock.at(mid)<goal)lo=mid;else hi=mid;}
  return hi;
 }
 function clipRange(c){return {start:lim(c.start,0,axisDuration()),end:lim(num(c.start,0)+num(c.duration,0),0,axisDuration())};}
 function target(t){if(t.kind==="part")return part(t);if(t.kind==="animation")return animation(t);
  if(t.kind==="motion"||t.kind==="accent")return animation(t);
  if(t.id==="camera-A")return film.camera;if(t.id==="camera-B")return m.cameraB;
  if(t.kind==="light")return m.lighting;if(t.kind==="cut")return m;return null;}
 function keys(t){var v=target(t);if(!v)return [];
  if(t.kind==="motion")return (v.motion||{})[t.part]||[];
  if(t.kind==="accent")return v.accents||(v.accents=[]);
  if(t.kind==="animation")return [];
  return t.kind==="cut"?v.cuts:(v.keys||(v.keys=[]));}
 function toFilm(time,t){if(t.kind!=="part")return lim(time,0,film.duration);var c=film.scenes&&film.scenes[0]||{};return lim((time-num(c.offset,0))/Math.max(.01,num(c.speed,1))+num(c.start,0),0,film.duration);}
 function fromFilm(time,t){if(t.kind!=="part")return time;var c=film.scenes&&film.scenes[0]||{};return Engine.localTime(time,source?source.duration:film.duration,c);}
 function toAudio(time){return lim(time,0,o.duration());}
 function activeCam(time){var c="A";m.cuts.slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(num(k.t,0)<=time+1e-6)c=k.camera==="B"?"B":"A";});return c;}
 function cameraState(time){return Engine.cameraState({width:film.width,height:film.height,camera:activeCam(time)==="B"?m.cameraB:film.camera},time);}
 function illumination(time){return lim(interpolate(m.lighting.keys,time,"intensity",1),0,1);}
 // Onion skin is a preview overlay. The copied drawings never become new
 // CutOut parts, keyframes or saved scene data.
 function paintOnion(time){
  var clip=activeDetail(),clock=o.beatClock&&o.beatClock(),
   beat=clip&&clock?Motion.phase(clip,time,clock):null;
  if(!onionEnabled||!clip||beat===null){if(onionGhosts.length)clearOnion();return;}
  var views=(o.view.clips||[]).filter(function(item){
   return item.view&&item.view.nodes&&item.view.nodes[clip.target]&&
    item.view.nodes[clip.target].el&&item.view.nodes[clip.target].el.parentNode;
  });
  var stale=onionGhosts.length!==views.length*2||onionGhosts.some(function(item){
   return item.clipId!==clip.id||!item.original.isConnected||
    item.ghost.parentNode!==item.original.parentNode;
  });
  if(stale){
   clearOnion();
   views.forEach(function(item){
    var original=item.view.nodes[clip.target].el;
    ["previous","next"].forEach(function(kind){
     var ghost=original.cloneNode(true);
     ghost.classList.add("huw-musical-onion-ghost");
     ghost.setAttribute("pointer-events","none");ghost.setAttribute("aria-hidden","true");
     ghost.style.opacity=kind==="previous"?"0.22":"0.14";
     original.parentNode.insertBefore(ghost,original);
     onionGhosts.push({clipId:clip.id,sceneClip:item,nested:item.view,original:original,
      ghost:ghost,kind:kind,elements:[ghost].concat(Array.prototype.slice.call(ghost.querySelectorAll("[data-cutout-id]")))});
    });
   });
  }
  var neighbors=Motion.neighboringPoses(clip,beat),clipTime=Engine.clipAt(film.scenes||[],time).time;
  onionGhosts.forEach(function(item){
   var sceneClip=item.sceneClip,nested=item.nested,local=Engine.localTime(clipTime,nested.scene.duration,sceneClip.settings),
    ghostBeat=neighbors[item.kind];
   item.ghost.style.display=sceneClip.el&&sceneClip.el.getAttribute("display")==="none"?"none":"";
   item.elements.forEach(function(element){
    var id=element.getAttribute("data-cutout-id"),ref=nested.nodes[id];if(!ref||!ref.part)return;
    var part=ref.part,base=Engine.state(part,local),motion=clip.motion&&clip.motion[id],
     pose=motion?Motion.animatedState(part,base,motion,ghostBeat,clip.motionReference&&clip.motionReference[id]):base,pv=part.pivot||{x:0,y:0};
    element.setAttribute("transform","translate("+pose.x+" "+pose.y+") rotate("+pose.r+") scale("+pose.sx+" "+pose.sy+") translate("+(-num(pv.x,0))+" "+(-num(pv.y,0))+")");
    element.setAttribute("opacity",String(pose.opacity));
   });
  });
 }
 var overlay=doc.createElementNS(NS,"rect");overlay.setAttribute("class","huw-musical-light-overlay");overlay.setAttribute("pointer-events","none");o.view.svg.appendChild(overlay);
 function paint(time){var c=cameraState(time),w=film.width/c.zoom,h=film.height/c.zoom,box={x:c.x-w/2,y:c.y-h/2,width:w,height:h};
  o.view.svg.setAttribute("viewBox",[box.x,box.y,box.width,box.height].join(" "));
  Object.keys(box).forEach(function(k){overlay.setAttribute(k,box[k]);});overlay.setAttribute("fill","#040716");overlay.setAttribute("opacity",round((1-illumination(time))*.78));
  // This is a preview-only camera and solo mode. The actual film camera and
  // all other animation clips remain unchanged in the saved TiddlyWiki.
  var detail=activeDetail();
  if(detail){
   var person=source&&source.parts.find(function(p){return p.id===detail.target;});
   if(person){var pose=Engine.state(person,time);o.view.svg.setAttribute("viewBox",[round(pose.x-200),round(pose.y-165),400,225].join(" "));}
  }
  if(isolation!==detailClipId){
   (o.view.clips||[]).forEach(function(filmClip){var nested=filmClip.view;if(!nested)return;
    m.animationClips.forEach(function(c){var node=nested.nodes&&nested.nodes[c.target];
     if(node&&node.el)node.el.style.display=detailClipId&&c.id!==detailClipId?"none":"";
    });
   });isolation=detailClipId;
  }
  paintOnion(time);
  cameraLabel.textContent=detail?(L===translations.da?"Animation: ":"Animation: ")+detail.name:L.camera+" "+activeCam(time);playhead=time;
  playheads.forEach(function(e){
   if(e.dataset.cursorMode==="beat"){
    var phase=detail&&Motion.phase(detail,time,o.beatClock&&o.beatClock());
    e.style.display=phase===null?"none":"";
    e.style.left=phase===null?"0%":(100*phase/Math.max(.125,num(detail.beatsPerLoop,8)))+"%";
   }else e.style.left=(100*time/axisDuration())+"%";
  });
 }
 function save(t){var isPart=t.kind==="part",name=isPart?o.stageTitle:o.sceneTitle,value=isPart?source:film,old=o.wiki.getTiddler(name);if(!old||!value)return;
  var json=JSON.stringify(value);o.markOwnWrite(name,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:name,text:json}));status.textContent=L.saved;
 }
 function choose(id,key){choice={id:id,key:key};var t=track();
  if(t.kind==="animation")expandedClipId=t.id;
  if(t.kind==="motion"||t.kind==="accent")expandedClipId="animation:"+t.clipId;
  draw();if(o.onSelect)o.onSelect(track());}
 function selected(){return track().kind==="song"?m.songs[track().index]:track().kind==="animation"?animation(track()):keys(track())[choice.key];}
 function newPoint(t,time){if(t.kind==="song")return;
  if(t.kind==="animation"){
   var c=animation(t);if(!c)return;
   var accents=c.accents||(c.accents=[]),key={t:round(time),x:0,y:0,r:0};
   accents.push(key);accents.sort(function(a,b){return a.t-b.t;});
   choose("accent:"+c.id,accents.indexOf(key));save({kind:"animation"});return;
  }
  var at=round(t.kind==="motion"?(Motion.phase(animation(t),time,o.beatClock())||0):t.kind==="accent"?time:fromFilm(time,t));
  var list=keys(t),known=list.findIndex(function(k){return Math.abs(k.t-at)<.02;});if(known>=0){choose(t.id,known);return;}
  var k={t:at};if(t.kind==="motion"){Object.assign(k,Motion.sample(list,at)||{x:0,y:0,r:0,sx:1,sy:1,opacity:1});k.easing="smooth";}
  else if(t.kind==="accent")Object.assign(k,{x:0,y:0,r:0});
  else if(t.kind==="part"){
   var state=Engine.state(part(t),at);["x","y","r","sx","sy","opacity"].forEach(function(field){k[field]=round(num(state[field],1));});
  }else if(t.kind==="camera"){
   var cam=Engine.cameraState({width:film.width,height:film.height,camera:target(t)},at);k.x=round(cam.x);k.y=round(cam.y);k.zoom=round(cam.zoom);k.easing="smooth";
  }else if(t.kind==="light")k.intensity=round(illumination(at));else if(t.kind==="cut")k.camera=activeCam(at);
  list.push(k);list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();
 }
 function removePoint(t){var list=keys(t);if(!list[choice.key])return;
  if(t.kind==="motion"&&(choice.key===0||choice.key===list.length-1))return;list.splice(choice.key,1);choice.key=Math.max(0,Math.min(choice.key,list.length-1));save(t);draw();o.repaint();}
 function formNumber(k,label,field,step,min,max){var p=el(doc,"label","huw-musical-property",undefined,inspector);el(doc,"span","",label,p);
  var input=el(doc,"input","",undefined,p);input.type="number";input.step=step;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
  input.value=round(num(k[field],0));input.onchange=function(){var value=Number(input.value);if(!Number.isFinite(value))return;
   if(min!==undefined)value=Math.max(min,value);if(max!==undefined)value=Math.min(max,value);k[field]=field==="t"?round(value):value;
   var t=track();if(field==="t"){var list=keys(t);list.sort(function(a,b){return a.t-b.t;});choice.key=list.indexOf(k);}
   if(t.kind==="motion"&&field!=="t"){
    var motionKeys=keys(t),first=motionKeys[0],last=motionKeys[motionKeys.length-1];
    if(k===first&&last&&last!==first&&Math.abs(num(last.t,0)-num(animation(t).beatsPerLoop,8))<.01)last[field]=k[field];
    if(k===last&&first&&last!==first&&Math.abs(num(first.t,0))<.01)first[field]=k[field];
   }
   save(t);draw();o.repaint();};
 }
 function formText(target,label,field,apply){
  var labelEl=el(doc,"label","huw-musical-property",undefined,inspector);
  el(doc,"span","",label,labelEl);var input=el(doc,"input","",undefined,labelEl);
  input.type="text";input.value=String(target[field]||"");
  input.onchange=function(){target[field]=input.value;if(apply)apply(input.value);save(track());draw();o.repaint();};
 }
 function formSelect(k,label,field,options){var p=el(doc,"label","huw-musical-property",undefined,inspector);el(doc,"span","",label,p);
  var select=el(doc,"select","",undefined,p);options.forEach(function(option){var x=el(doc,"option","",option[1],select);x.value=option[0];});
  select.value=k[field]||options[0][0];select.onchange=function(){k[field]=select.value;save(track());draw();o.repaint();};
 }
 function songChoices(){var choices=[];
  o.wiki.each(function(t,title){if(t.fields&&typeof t.fields["abc-source"]==="string"&&/^\s*X:\s*\d+/m.test(t.fields["abc-source"]))choices.push(title);});
  return choices.sort();
 }
 function fitStage(){
  if(!Array.isArray(film.scenes)||!film.scenes.length)return;
  var length=film.scenes.reduce(function(n,s){return n+Math.max(.125,num(s.duration,16));},0);
  var total=Playlist.total(m.songs),base=film.scenes[0],n=0;
  while(length+.1<total&&n++<20){
   var d=Math.min(Math.max(.125,num(base.duration,16)),total-length);
   film.scenes.push(Object.assign({},base,{id:"musical-repeat-"+film.scenes.length+"-"+n,start:0,offset:0,duration:round(d)}));
   length+=d;
  }
  film.duration=length;
 }
 function persistSongs(reload){
  var old=typeof o.clips==="function"?o.clips():[];
  m.songs.forEach(function(s){var match=old.find(function(c){return c.id===s.id;});if(match&&reload!==true)s.duration=match.duration;});
  m.songs=Playlist.reflow(m.songs,o.scoreTitle);
  fitStage();save({kind:"song"});
  if(reload&&o.reload)o.reload();
  else{
   if(o.updateClips)o.updateClips(m.songs);
   draw();o.repaint();
  }
 }
 function drawSongForm(){
  var t=track(),i=t.index,k=m.songs[i];
  if(!k)return;
  var clips=typeof o.clips==="function"?o.clips():m.songs;
  var clip=clips.find(function(x){return x.id===k.id;})||k;
  var actions=el(doc,"div","huw-musical-key-actions huw-musical-song-actions",undefined,inspector);
  var available=songChoices(),select=el(doc,"select","huw-musical-song-select",undefined,actions);
  select.setAttribute("aria-label",L.chooseSong);
  available.forEach(function(title){var option=el(doc,"option","",title,select);option.value=title;});
  if(available.indexOf(k.score)>=0)select.value=k.score;
  function button(cls,title,fn,disabled){
   var b=el(doc,"button",cls,title,actions);b.type="button";b.disabled=!!disabled;b.onclick=fn;return b;
  }
  button("huw-musical-add-song",L.addSong,function(){
   var id="song-"+(m.songs.length+1);while(m.songs.some(function(s){return s.id===id;}))id+="-x";
   var cross=Math.min(2,k.duration);
   k.fadeOut=Math.max(k.fadeOut||0,cross);
   m.songs.splice(i+1,0,{id:id,score:select.value,start:round(k.start+k.duration-cross),
    duration:16,fadeIn:cross,fadeOut:0,volume:1,kind:"complete-abc"});
   persistSongs(true);
  },!available.length);
  button("huw-musical-replace-song",L.replaceSong,function(){
   k.score=select.value;k.duration=16;persistSongs(true);
  },!available.length);
  button("huw-musical-remove-song",L.removeSong,function(){
   m.songs.splice(i,1);choice.id="song:"+m.songs[Math.max(0,i-1)].id;persistSongs(true);
  },m.songs.length<=1);
  button("huw-musical-move-song-earlier",L.moveEarlier,function(){
   var song=m.songs.splice(i,1)[0];m.songs.splice(i-1,0,song);persistSongs(false);
  },i===0);
  button("huw-musical-move-song-later",L.moveLater,function(){
   var song=m.songs.splice(i,1)[0];m.songs.splice(i+1,0,song);persistSongs(false);
  },i===m.songs.length-1);
  function songNumber(title,field,step,min,max,scale){
   var label=el(doc,"label","huw-musical-property",undefined,inspector);
   el(doc,"span","",title,label);var input=el(doc,"input","",undefined,label);
   input.type="number";input.step=step;input.min=min;input.max=max;input.value=round(Number(k[field])*(scale||1));
   input.onchange=function(){
    var value=Number(input.value);if(!Number.isFinite(value))return;
    k[field]=round(lim(value,min,max)/(scale||1));persistSongs(false);
   };
  }
  songNumber(L.start||"Start (s)","start",.1,0,21600,1);
  songNumber(L.fadeIn||"Fade in (s)","fadeIn",.1,0,k.duration,1);
  songNumber(L.fadeOut||"Fade out (s)","fadeOut",.1,0,k.duration,1);
  songNumber(L.volume||"Volume (%)","volume",1,0,100,100);
  var mute=el(doc,"label","huw-musical-property huw-musical-mute",undefined,inspector);
  var box=el(doc,"input","",undefined,mute);box.type="checkbox";box.checked=k.muted===true;
  el(doc,"span","",L.mute||"Mute",mute);box.onchange=function(){k.muted=box.checked;persistSongs(false);};
  var overlaps=m.songs.filter(function(x){return x!==k&&Playlist.overlap(x,k)>.005;})
   .map(function(x){return x.score+" ("+round(Playlist.overlap(x,k))+"s)";});
  el(doc,"p","huw-musical-song-info",
   L.songInfo+" "+k.score+" · "+round(clip.duration)+" s · "+
   (L.overlap||"Overlap")+": "+(overlaps.length?overlaps.join(", "):"—"),inspector);
 }
 function drawForm(){inspector.textContent="";var t=track(),k=selected();el(doc,"strong","",t.name,inspector);
  if(t.kind==="song"){drawSongForm();return;}
  if(t.kind==="animation"){
   if(!k){el(doc,"p","",L.empty,inspector);return;}
   var hint=L===translations.da?"Bevægelsesklip: ét mønster gentages i takt med ABC-tempoet. Klik klippet for at åbne dets indre nøglepunkter.":"Motion clip: one pattern repeats in time with the ABC tempo. Open the clip to edit its inner keyframes.";
   el(doc,"p","huw-musical-song-info",hint,inspector);
   formText(k,L.name,"name",function(value){t.name=value||k.id;});
   formNumber(k,L.start||"Start (s)","start",.25,0,film.duration);
   formNumber(k,L===translations.da?"Varighed (sek.)":"Duration (sec)","duration",.25,.25,film.duration);
   formNumber(k,L===translations.da?"Sløjfelængde (fjerdedelsslag)":"Loop length (quarter beats)","beatsPerLoop",1,1,64);
   formNumber(k,L===translations.da?"Bevægelseshastighed":"Motion rate","rate",.25,.25,4);
   var loopLabel=el(doc,"label","huw-musical-property",undefined,inspector),check=el(doc,"input","",undefined,loopLabel);
   check.type="checkbox";check.checked=k.loop!==false;
   el(doc,"span","",L===translations.da?"Gentag bevægelse":"Repeat motion",loopLabel);
   check.onchange=function(){k.loop=check.checked;save(t);draw();o.repaint();};
   var button=el(doc,"button","huw-musical-clip-expand",expandedClipId===t.id?(L===translations.da?"Skjul bevægelsens keyframes":"Hide motion keyframes"):(L===translations.da?"Åbn bevægelsesmønster":"Open motion pattern"),inspector);
   button.type="button";button.onclick=function(){expandedClipId=expandedClipId===t.id?"":t.id;draw();};
   el(doc,"p","huw-musical-song-info",L===translations.da?"Solobevægelser tilføjes som separate accent-keyframes ved afspilningspositionen.":"Solo accents can be added as separate keyframes at the current playhead.",inspector);
   var accentBtn=el(doc,"button","huw-musical-add-accent",L===translations.da?"+ Solobevægelse":"+ Solo accent",inspector);
   accentBtn.type="button";accentBtn.onclick=function(){newPoint(t,playhead);};
   return;
  }
  var actions=el(doc,"div","huw-musical-key-actions",undefined,inspector),add=el(doc,"button","",L.add,actions),del=el(doc,"button","",L.remove,actions);
  add.type=del.type="button";add.onclick=function(){newPoint(t,playhead);};
  del.disabled=!k||(t.kind==="motion"&&(choice.key===0||choice.key===keys(t).length-1));del.onclick=function(){removePoint(t);};
  if(!k){el(doc,"p","",L.empty,inspector);return;}
  formNumber(k,t.kind==="motion"?(L===translations.da?"Slag i løkken":"Beat in loop"):L.time,
   "t",t.kind==="motion"?.25:.05,0,t.kind==="motion"?num(animation(t).beatsPerLoop,8):film.duration);
  if(t.kind==="motion"){
   formNumber(k,L.x,"x",1,-10000,10000);formNumber(k,L.y,"y",1,-10000,10000);formNumber(k,L.r,"r",1,-3600,3600);
   formNumber(k,L.opacity,"opacity",.05,0,1);formNumber(k,"Scale X","sx",.05,.01,16);formNumber(k,"Scale Y","sy",.05,.01,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="accent"){
   formNumber(k,L.x,"x",1,-1000,1000);formNumber(k,L.y,"y",1,-1000,1000);formNumber(k,L.r,"r",1,-360,360);
  }else if(t.kind==="part"){
   var item=part(t),nested=o.view.clips&&o.view.clips[0]&&o.view.clips[0].view,
    visual=nested&&nested.nodes&&nested.nodes[t.part]&&nested.nodes[t.part].shape;
   if(item){
    formText(item,L.name,"name",function(value){t.name=value||t.part;});
    if(typeof item.fill==="string"&&/^#[0-9a-f]{6}$/i.test(item.fill)){
     var colorLabel=el(doc,"label","huw-musical-property",undefined,inspector);
     el(doc,"span","",L.color,colorLabel);var color=el(doc,"input","huw-musical-color-input",undefined,colorLabel);
     color.type="color";color.value=item.fill;
     color.onchange=function(){
      item.fill=color.value;if(visual)visual.setAttribute("fill",item.fill);
      save(t);o.repaint();
     };
    }
    if(item.type==="text")formText(item,L.text,"text",function(value){if(visual)visual.textContent=value;});
   }
   formNumber(k,L.x,"x",1,-10000,10000);formNumber(k,L.y,"y",1,-10000,10000);formNumber(k,L.r,"r",1,-3600,3600);
   formNumber(k,L.opacity,"opacity",.05,0,1);formNumber(k,"Scale X","sx",.05,.01,16);formNumber(k,"Scale Y","sy",.05,.01,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="camera"){
   formText(k,L.name,"label");
   formNumber(k,L.x,"x",1,-5000,5000);formNumber(k,L.y,"y",1,-5000,5000);formNumber(k,L.zoom,"zoom",.1,.25,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="light")formNumber(k,L.intensity,"intensity",.05,0,1);
  else if(t.kind==="cut")formSelect(k,L.camera,"camera",[["A",L.cameraA],["B",L.cameraB]]);
 }
 function drawDetail(){
  var clip=activeDetail();if(!clip)return;
  clipTitle.textContent=clip.name||clip.id;
  clipMeta.textContent=(L===translations.da?"Bevægelsesløkke · ":"Motion loop · ")+round(num(clip.beatsPerLoop,8))+
   (L===translations.da?" slag · følger ABC-tempoet":" beats · follows ABC tempo");
  var span=Math.max(.125,num(clip.beatsPerLoop,8));
  var rule=el(doc,"div","huw-musical-timeline-ruler huw-musical-detail-ruler",undefined,rows);
  el(doc,"span","huw-musical-ruler-label",L===translations.da?"Slag i løkken":"Beats in loop",rule);
  var ruleLane=el(doc,"div","huw-musical-ruler-lane",undefined,rule);
  for(var i=0;i<=span;i++){
   var tick=el(doc,"span","huw-musical-ruler-tick",i===span?"↻":String(i+1),ruleLane);
   tick.style.left=(100*i/span)+"%";
  }
  ruleLane.onclick=function(ev){var box=ruleLane.getBoundingClientRect();
   var fraction=lim((ev.clientX-box.left)/Math.max(1,box.width),0,1);
   o.seek(animationTime(clip,round(fraction*span)));
  };
  Object.keys(clip.motion||{}).forEach(function(partId){
   var t=detailTrack(clip,partId),row=el(doc,"div","huw-musical-track huw-musical-detail-track",undefined,rows);
   row.dataset.trackId=t.id;row.dataset.group="animation";
   if(choice.id===t.id)row.classList.add("is-selected");
   var caption=el(doc,"div","huw-musical-lane-title",t.name,row);
   caption.onclick=function(){choose(t.id,0);};
   var lane=el(doc,"div","huw-musical-lane huw-musical-beat-lane",undefined,row);
   lane.onclick=function(ev){if(ev.target.closest&&ev.target.closest(".huw-musical-key"))return;
    var box=lane.getBoundingClientRect(),beat=lim((ev.clientX-box.left)/Math.max(1,box.width),0,1)*span;
    o.seek(animationTime(clip,beat));
    var list=keys(t),index=0,best=Infinity;
    list.forEach(function(k,j){var d=Math.abs(num(k.t,0)-beat);if(d<best){best=d;index=j;}});
    choose(t.id,index);
   };
   (clip.motion[partId]||[]).forEach(function(k,index){
    var dot=el(doc,"button","huw-musical-key huw-musical-motion-key",undefined,lane);
    dot.type="button";dot.style.left=(100*num(k.t,0)/span)+"%";
    dot.setAttribute("aria-label",t.name+" · "+round(k.t)+" "+(L===translations.da?"slag":"beats"));
    dot.title=dot.getAttribute("aria-label");
    if(choice.id===t.id&&choice.key===index)dot.classList.add("is-selected");
    dot.onclick=function(ev){ev.preventDefault();ev.stopPropagation();choose(t.id,index);o.seek(animationTime(clip,num(k.t,0)));};
   });
   var cursor=el(doc,"div","huw-musical-lane-cursor",undefined,lane);
   cursor.dataset.cursorMode="beat";playheads.push(cursor);
  });
  // Solo accents belong to this animation, but use absolute seconds because
  // they are story events (unlike the beat-based repeating motion pattern).
  var soloRule=el(doc,"div","huw-musical-timeline-ruler huw-musical-detail-solo-ruler",undefined,rows);
  el(doc,"span","huw-musical-ruler-label",L===translations.da?"Solo · sekunder":"Solo · seconds",soloRule);
  var soloRuleLane=el(doc,"div","huw-musical-ruler-lane",undefined,soloRule);
  var duration=axisDuration(),step=duration>60?10:5;
  for(var second=0;second<=duration;second+=step){
   var tick=el(doc,"span","huw-musical-ruler-tick",second+"s",soloRuleLane);
   tick.style.left=(100*second/duration)+"%";
  }
  soloRuleLane.onclick=function(ev){var box=soloRuleLane.getBoundingClientRect();
   o.seek((ev.clientX-box.left)/Math.max(1,box.width)*duration);
  };
  var accent=map["accent:"+clip.id],soloRow=el(doc,"div","huw-musical-track huw-musical-detail-track",undefined,rows);
  soloRow.dataset.group="animation";soloRow.dataset.trackId=accent.id;
  if(choice.id===accent.id)soloRow.classList.add("is-selected");
  var soloTitle=el(doc,"div","huw-musical-lane-title",L===translations.da?"Solobevægelser":"Solo accents",soloRow);
  soloTitle.onclick=function(){choose(accent.id,0);};
  var soloLane=el(doc,"div","huw-musical-lane",undefined,soloRow);
  (clip.accents||[]).forEach(function(k,index){
   var dot=el(doc,"button","huw-musical-key huw-musical-accent-key",undefined,soloLane);
   dot.type="button";dot.style.left=(100*num(k.t,0)/duration)+"%";
   dot.title=round(k.t)+"s";dot.setAttribute("aria-label",dot.title);
   if(choice.id===accent.id&&choice.key===index)dot.classList.add("is-selected");
   dot.onclick=function(ev){ev.preventDefault();ev.stopPropagation();choose(accent.id,index);o.seek(num(k.t,0));};
  });
  var cursor=el(doc,"div","huw-musical-lane-cursor",undefined,soloLane);
  cursor.dataset.cursorMode="seconds";playheads.push(cursor);
  drawForm();
 }
 function draw(){rows.textContent="";playheads=[];
  if(detailClipId){drawDetail();return;}
  var axis=axisDuration();
  var ruler=el(doc,"div","huw-musical-timeline-ruler",undefined,rows);
  el(doc,"span","huw-musical-ruler-label",L.time,ruler);
  var ruleLane=el(doc,"div","huw-musical-ruler-lane",undefined,ruler);
  var step=axis>240?30:axis>120?15:axis>60?10:axis>30?5:zoom>=1.8?2:5;
  for(var seconds=0;seconds<=axis;seconds+=step){
   var tick=el(doc,"span","huw-musical-ruler-tick",round(seconds)+"s",ruleLane);
   tick.style.left=(100*seconds/axis)+"%";
  }
  ruleLane.onclick=function(ev){
   var rect=ruleLane.getBoundingClientRect(),fraction=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
   o.seek(toAudio(fraction*axis));
  };
  var all=songTracks().concat(tracks.filter(function(t){return t.kind!=="song";}))
   .filter(function(t){return filter==="all"||group(t)===filter;});
  all.forEach(function(t){
   var row=el(doc,"div","huw-musical-track",undefined,rows);
   row.dataset.group=group(t);row.dataset.trackId=t.id;
   if(t.id===choice.id)row.classList.add("is-selected");
   var title=el(doc,"div","huw-musical-lane-title",t.name,row);
   title.onclick=function(){choose(t.id,t.kind==="song"?0:choice.key);};
   var lane=el(doc,"div","huw-musical-lane",undefined,row);
   lane.onclick=function(ev){
    if(ev.target.closest&&ev.target.closest(".huw-musical-key,.huw-musical-song-clip"))return;
    var rect=lane.getBoundingClientRect(),u=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
    o.seek(toAudio(u*axis));if(choice.id!==t.id)choose(t.id,0);
   };
   if(t.kind==="animation"){
    var motionClip=animation(t),span=clipRange(motionClip);
    var block=el(doc,"div","huw-musical-motion-clip",motionClip.name||t.name,lane);
    block.setAttribute("role","button");block.tabIndex=0;
    block.style.left=(100*span.start/axis)+"%";
    block.style.width=(100*Math.max(.1,span.end-span.start)/axis)+"%";
    block.title=(motionClip.name||t.name)+" · "+round(span.start)+"–"+round(span.end)+"s · "+round(motionClip.beatsPerLoop)+" beats / loop · "+(L===translations.da?"Dobbeltklik for at redigere":"Double-click to edit");
    block.setAttribute("aria-label",block.title);
    if(t.id===choice.id||expandedClipId===t.id)block.classList.add("is-selected");
    block.onclick=function(ev){ev.stopPropagation();if(detailClipId)return;
     if(ev.detail>=2){openAnimation(t.clipId);return;}
     choose(t.id,0);
    };
    // Safari/iPad may not generate dblclick after a re-render on the first tap.
    // Detect the second release on the clip, not the same DOM node.
    block.addEventListener("pointerup",function(ev){
     if(ev.button!==undefined&&ev.button!==0)return;
     var now=Date.now(),last=lastClipTap;
     if(last&&last.id===t.clipId&&now-last.time<480&&
       Math.abs(ev.clientX-last.x)<30&&Math.abs(ev.clientY-last.y)<30){
      lastClipTap=null;ev.preventDefault();ev.stopPropagation();openAnimation(t.clipId);
     }else lastClipTap={id:t.clipId,time:now,x:ev.clientX,y:ev.clientY};
    });
    block.addEventListener("dblclick",function(ev){ev.preventDefault();ev.stopPropagation();openAnimation(t.clipId);});
    block.onkeydown=function(ev){if(ev.key==="Enter"){ev.preventDefault();openAnimation(t.clipId);}
      else if(ev.key===" "){ev.preventDefault();choose(t.id,0);}};
    (motionClip.accents||[]).forEach(function(k,index){
     var accent=el(doc,"button","huw-musical-key huw-musical-accent-key",undefined,lane);
     accent.type="button";accent.style.left=(100*num(k.t,0)/axis)+"%";
     accent.title=(L===translations.da?"Solobevægelse":"Solo accent")+" · "+round(k.t)+"s";
     accent.setAttribute("aria-label",accent.title);
     accent.onclick=function(ev){ev.stopPropagation();o.seek(k.t);choose("accent:"+motionClip.id,index);};
    });
   }else if(t.kind==="song"){
    var s=m.songs[t.index],clip=(typeof o.clips==="function"?o.clips():m.songs)
      .find(function(c){return c.id===s.id;})||s;
    var block=el(doc,"div","huw-musical-song-clip",String(t.index+1)+". "+s.score,lane);
    block.setAttribute("role","button");block.setAttribute("tabindex","0");
    block.title=s.score+" · "+round(s.start)+"–"+round(s.start+s.duration)+"s";
    block.style.left=(100*clip.start/axis)+"%";block.style.width=(100*clip.duration/axis)+"%";
    if(t.id===choice.id)block.classList.add("is-selected");
    if(t.index%2)block.classList.add("huw-musical-song-alt");
    var fadeIn=el(doc,"span","huw-musical-fade-in",undefined,block);
    var fadeOut=el(doc,"span","huw-musical-fade-out",undefined,block);
    function fadeStyle(){
     fadeIn.style.width=(100*lim(s.fadeIn||0,0,s.duration)/Math.max(.125,s.duration))+"%";
     fadeOut.style.width=(100*lim(s.fadeOut||0,0,s.duration)/Math.max(.125,s.duration))+"%";
    }
    fadeStyle();
    var left=el(doc,"span","huw-musical-fade-handle huw-musical-fade-left",undefined,block);
    var right=el(doc,"span","huw-musical-fade-handle huw-musical-fade-right",undefined,block);
    left.title=L.fadeIn;right.title=L.fadeOut;
    block.addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();choose(t.id,0);o.seek(s.start);}});
    block.onclick=function(ev){ev.stopPropagation();choose(t.id,0);o.seek(s.start);};
    block.onpointerdown=function(ev){
     if(ev.button!==undefined&&ev.button!==0)return;
     ev.stopPropagation();var rect=lane.getBoundingClientRect(),startX=ev.clientX,
      initial={start:s.start,fadeIn:s.fadeIn||0,fadeOut:s.fadeOut||0},moved=false,
      kind=ev.target===left?"fadeIn":ev.target===right?"fadeOut":"start";
     if(block.setPointerCapture)block.setPointerCapture(ev.pointerId);
     function move(e){
      var delta=(e.clientX-startX)*axis/Math.max(1,rect.width);
      if(Math.abs(delta)<.05&&!moved)return;
      moved=true;
      if(kind==="start")s.start=round(lim(initial.start+delta,0,21600));
      else if(kind==="fadeIn")s.fadeIn=round(lim(initial.fadeIn+delta,0,s.duration));
      else s.fadeOut=round(lim(initial.fadeOut-delta,0,s.duration));
      block.style.left=(100*s.start/axis)+"%";
      fadeStyle();status.textContent=L.saved;
     }
     function finish(cancelled){
      block.removeEventListener("pointermove",move);
      block.removeEventListener("pointerup",done);
      block.removeEventListener("pointercancel",cancel);
      if(cancelled)Object.assign(s,initial);
      else if(moved)persistSongs(false);
      else{choice.id=t.id;drawForm();}
     }
     function done(){finish(false);}function cancel(){finish(true);}
     block.addEventListener("pointermove",move);
     block.addEventListener("pointerup",done);
     block.addEventListener("pointercancel",cancel);
    };
   }else{
    if(t.id==="stage"){
     var stageBlock=el(doc,"div","huw-musical-block","",lane);stageBlock.title=t.name;
    }
    keys(t).forEach(function(k,index){
     var point=el(doc,"button","huw-musical-key",undefined,lane);point.type="button";
     point.style.left=(100*toFilm(k.t,t)/axis)+"%";
     point.title=(k.label?k.label+" · ":"")+t.name+" · "+round(k.t)+"s";point.setAttribute("aria-label",point.title);
     if(t.kind==="cut"){point.classList.add("huw-musical-cut-point");point.textContent=k.camera||"A";}
     if(t.id===choice.id&&index===choice.key)point.classList.add("is-selected");
     point.onclick=function(ev){ev.stopPropagation();ev.preventDefault();choose(t.id,index);o.seek(toAudio(toFilm(k.t,t)));};
     point.onpointerdown=function(ev){
      if(ev.button!==undefined&&ev.button!==0)return;ev.stopPropagation();
      var start=num(k.t,0),rect=lane.getBoundingClientRect(),moved=false;
      if(point.setPointerCapture)point.setPointerCapture(ev.pointerId);
      function move(e){
       var u=lim((e.clientX-rect.left)/Math.max(1,rect.width),0,1),
        value=round(fromFilm(u*axis,t));
       if(Math.abs(value-start)<.02&&!moved)return;moved=true;k.t=value;
       point.style.left=(100*toFilm(k.t,t)/axis)+"%";o.seek(toAudio(toFilm(k.t,t)));
      }
      function finish(cancelled){
       point.removeEventListener("pointermove",move);
       point.removeEventListener("pointerup",done);
       point.removeEventListener("pointercancel",abort);
       if(cancelled)k.t=start;
       else if(moved){var values=keys(t);values.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:values.indexOf(k)};save(t);}
       if(moved)draw();o.repaint();
      }
      function done(){finish(false);}function abort(){finish(true);}
      point.addEventListener("pointermove",move);
      point.addEventListener("pointerup",done);
      point.addEventListener("pointercancel",abort);
     };
    });
   }
   var cursor=el(doc,"div","huw-musical-lane-cursor",undefined,lane);
   cursor.style.left=(100*playhead/axis)+"%";playheads.push(cursor);
   if(t.kind==="animation"&&expandedClipId===t.id){
    var expanded=el(doc,"div","huw-musical-loop-detail",undefined,rows);
    el(doc,"div","huw-musical-loop-heading",(L===translations.da?"Bevægelsesmønster":"Motion pattern")+" · "+num(animation(t).beatsPerLoop,8)+" " +(L===translations.da?"slag · følger ABC-tempo":"beats · follows ABC tempo"),expanded);
    var beatSpan=Math.max(.125,num(animation(t).beatsPerLoop,8));
    Object.keys(animation(t).motion||{}).forEach(function(partId){
     var p=source&&source.parts.find(function(item){return item.id===partId;});
     var child={id:"motion:"+animation(t).id+":"+partId,kind:"motion",clipId:animation(t).id,part:partId,name:"↳ "+(p&&p.name||partId)};
     map[child.id]=child;
     var nestedRow=el(doc,"div","huw-musical-track huw-musical-motion-row",undefined,expanded);
     nestedRow.dataset.trackId=child.id;
     var nestedTitle=el(doc,"div","huw-musical-lane-title",child.name,nestedRow);
     nestedTitle.onclick=function(){choose(child.id,0);};
     var nestedLane=el(doc,"div","huw-musical-lane huw-musical-beat-lane",undefined,nestedRow);
     (animation(t).motion[partId]||[]).forEach(function(k,index){
      var dot=el(doc,"button","huw-musical-key huw-musical-motion-key",undefined,nestedLane);
      dot.type="button";dot.style.left=(100*num(k.t,0)/beatSpan)+"%";
      dot.title=child.name+" · "+round(k.t)+" beats";dot.setAttribute("aria-label",dot.title);
      if(choice.id===child.id&&choice.key===index)dot.classList.add("is-selected");
      dot.onclick=function(ev){ev.stopPropagation();choose(child.id,index);o.seek(animationTime(animation(t),num(k.t,0)));};
     });
    });
   }
  });
  drawForm();
 }
 function selectPart(id){
  if(detailClipId){
   var own=activeDetail();if(!own||!belongsToClip(own,id))return false;
   var mt=detailTrack(own,id),index=0,minimum=Infinity;
   var phase=Motion.phase(own,playhead,o.beatClock&&o.beatClock())||0;
   keys(mt).forEach(function(k,i){var d=Math.abs(num(k.t,0)-phase);if(d<minimum){minimum=d;index=i;}});
   choose(mt.id,index);return true;
  }
  var motionClip=m.animationClips.find(function(c){return c.target===id||(c.motion&&c.motion[id]);});
  if(motionClip){choose("animation:"+motionClip.id,0);return true;}
  if(!source||!source.parts)return false;
  var p=source.parts.find(function(item){return item.id===id;});if(!p)return false;
  var t=tracks.find(function(t){return t.kind==="part"&&t.part===id;});
  if(!t){t={id:"part:"+id,kind:"part",part:id,name:p.name||id};tracks.splice(tracks.length-3,0,t);}
  filter="all";
  var list=keys(t),at=fromFilm(playhead,t),index=0,nearest=Infinity;
  list.forEach(function(key,i){var delta=Math.abs(num(key.t,0)-at);if(delta<nearest){index=i;nearest=delta;}});
  choose(t.id,index);return true;
 }
 function beginPartMove(id,globalTime){
  if(detailClipId){
   var c=activeDetail(),p=partById(id);if(!c||!p||!belongsToClip(c,id))return null;
   var t=detailTrack(c,id),span=Math.max(.125,num(c.beatsPerLoop,8)),
    beat=round(Motion.phase(c,globalTime,o.beatClock&&o.beatClock())||0);
   c.motion=c.motion||{};c.motionReference=c.motionReference||{};var created=!c.motion[id];
   if(!c.motionReference[id]){
    var reference=created?Engine.state(p,0):(c.motion[id]||[])[0]||Engine.state(p,0);
    c.motionReference[id]={};
    ["x","y","r","sx","sy","opacity"].forEach(function(field){
     c.motionReference[id][field]=num(reference[field],field==="sx"||field==="sy"||field==="opacity"?1:0);
    });
   }
   if(created){
    var base=Engine.state(p,0),first=Object.assign({t:0,easing:"smooth"},base);
    c.motion[id]=[first,Object.assign({},first,{t:span})];
   }
   var list=keys(t),index=list.findIndex(function(k){return Math.abs(num(k.t,0)-beat)<.05;});
   var inserted=index<0,k=inserted?Object.assign({t:beat,easing:"smooth"},Motion.sample(list,beat)||{x:0,y:0,r:0,sx:1,sy:1,opacity:1}):list[index];
   if(inserted)list.push(k);
   var oldX=num(k.x,0),oldY=num(k.y,0),oldR=num(k.r,0);
   return {
    update:function(dx,dy,turn){
     if(Number.isFinite(turn))k.r=round(oldR+turn);
     else{k.x=round(oldX+dx);k.y=round(oldY+dy);}
     o.repaint();
    },
    commit:function(){
     list.sort(function(a,b){return a.t-b.t;});
     Motion.syncLoopSeam(list,span,k);
     choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();
    },
    cancel:function(){
     if(inserted)list.splice(list.indexOf(k),1);
     else{k.x=oldX;k.y=oldY;k.r=oldR;}
     if(created)delete c.motion[id];
     draw();o.repaint();
    }
   };
  }
  var t=tracks.find(function(t){return t.kind==="part"&&t.part===id;});
  if(!t&&source&&source.parts){var candidate=source.parts.find(function(p){return p.id===id;});
   if(candidate){t={id:"part:"+id,kind:"part",part:id,name:candidate.name||id};tracks.splice(tracks.length-3,0,t);map[t.id]=t;}}
  if(!t||!part(t))return null;
  var at=round(fromFilm(globalTime,t)),list=keys(t),index=list.findIndex(function(k){return Math.abs(k.t-at)<.025;});
  var inserted=index<0;
  var k=inserted?Object.assign({t:at},Engine.state(part(t),at)):list[index];
  if(inserted){list.push(k);index=list.length-1;}
  var oldX=num(k.x,0),oldY=num(k.y,0);
  return {
   update:function(dx,dy){k.x=round(oldX+dx);k.y=round(oldY+dy);o.repaint();},
   commit:function(){list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();},
   cancel:function(){if(inserted)list.splice(list.indexOf(k),1);else{k.x=oldX;k.y=oldY;}draw();o.repaint();}
  };
 }
 function isJointMove(id){var clip=activeDetail(),p=partById(id);return !!(clip&&p&&id!==clip.target&&belongsToClip(clip,id));}
 function getPartPivot(id){var p=partById(id);return p&&p.pivot||{x:0,y:0};}
 function setFilter(value){filter=["all","music","camera","animation","scene"].indexOf(value)>=0?value:"all";draw();}
 function setZoom(value){zoom=lim(value,1,5);rows.style.setProperty("--musical-zoom",String(zoom));draw();}
 function addKeyframe(){var t=track();if(t&&t.kind!=="song")newPoint(t,playhead);}
 function removeKeyframe(){var t=track();if(t&&t.kind!=="song")removePoint(t);}
 draw();return {paint:paint,redraw:draw,selectPart:selectPart,beginPartMove:beginPartMove,
  isJointMove:isJointMove,getPartPivot:getPartPivot,
  openAnimation:openAnimation,closeAnimation:closeAnimation,inClipDetail:function(){return !!detailClipId;},getDetailClip:activeDetail,
  addKeyframe:addKeyframe,removeKeyframe:removeKeyframe,setFilter:setFilter,setZoom:setZoom,
  getZoom:function(){return zoom;},getSelection:track,
  dispose:function(){clearOnion();if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
}
exports.attach=attach;exports.ensureMusical=ensureMusical;exports.interpolate=interpolate;
})();