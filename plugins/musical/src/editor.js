/*\
title: $:/plugins/huwiki/musical/editor.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Language=require("$:/plugins/huwiki/musical/language.js");
var isDanish=Language.isDanish;
var Sfx=require("$:/plugins/huwiki/musical/sfx.js");
var EffectsLibrary=require("$:/plugins/huwiki/musical/effects-library.js");
var Model=require("$:/plugins/huwiki/cutout/model.js");
var TrackPreview=require("$:/plugins/huwiki/musical/track-preview.js");
function optionalSvgLayers(){
 try{var api=require("$:/plugins/huwiki/cutout/svg-layers.js");return api&&typeof api.open==="function"?api:null;}
 catch(_missing){return null;}
}

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
 if(!m.figureTransforms||typeof m.figureTransforms!=="object")m.figureTransforms={};
 if(!Array.isArray(m.sfx))m.sfx=[];
 if(!Array.isArray(m.audioClips))m.audioClips=[];
 return m;}
var translations={da:{title:"Musical Studio · tidslinje",help:"Vælg et spor, indsæt kontrolpunkter ved afspilningspositionen, eller træk dem vandret. Klik på et punkt for at redigere det.",song:"Musiknummer (komplet ABC)",backdrop:"Baggrund",stage:"Scene",foreground:"Forgrund",light:"Belysning",cameraA:"Kamera A",cameraB:"Kamera B",cuts:"Kameraklip",add:"+ Kontrolpunkt",remove:"Slet punkt",time:"Tid (sek.)",x:"X",y:"Y",r:"Rotation (°)",opacity:"Synlighed",zoom:"Zoom",intensity:"Lysstyrke",camera:"Aktivt kamera",easing:"Overgang",smooth:"Blød",step:"Klip",linear:"Lineær",readonly:"Hele musiknummeret afspilles som ét samlet ABC-spor. Redigér noderne i ABC-editoren.",empty:"Vælg et kontrolpunkt eller indsæt et nyt.",saved:"Gemt i wikien"},en:{title:"Musical Studio · timeline",help:"Select a track, add keyframes at the playhead, or drag them horizontally. Click a keyframe to edit it.",song:"Song (complete ABC)",backdrop:"Background",stage:"Stage",foreground:"Foreground",light:"Lighting",cameraA:"Camera A",cameraB:"Camera B",cuts:"Camera cuts",add:"+ Keyframe",remove:"Delete keyframe",time:"Time (sec)",x:"X",y:"Y",r:"Rotation (°)",opacity:"Opacity",zoom:"Zoom",intensity:"Light intensity",camera:"Active camera",easing:"Transition",smooth:"Smooth",step:"Cut",linear:"Linear",readonly:"The whole song plays on one ABC track. Edit notation in the ABC editor.",empty:"Select a control point or insert a new one.",saved:"Saved to wiki"}};
function attach(o){
 var ui=Language.translator(o.wiki);
 var displayName=o.displayName||function(value){return value;};
 var doc=o.doc,film=o.film,m=ensureMusical(film),inner=o.view.clips&&o.view.clips[0]&&o.view.clips[0].view,source=inner&&inner.scene;
 var layerPanel=null,disposeLayerDrag=null,groupScene=null,groupExpanded={},audioExpanded=false;
 var da=isDanish(o.wiki);
 var L=da?Object.assign({},translations.da):ui.labels(Object.assign({},translations.en));
 L.addSong=da?"Tilføj musiknummer":ui("Add complete song");
 L.replaceSong=da?"Skift nodeark":ui("Replace ABC score");
 L.removeSong=da?"Fjern nummer":ui("Remove song");
 L.moveEarlier=da?"Flyt tidligere":ui("Move earlier");
 L.moveLater=da?"Flyt senere":ui("Move later");
 L.chooseSong=da?"Vælg ABC-nodeark":ui("Choose ABC score");
 L.songInfo=da?"Hele nummeret afspilles som ét spor. Instrumentstemmerne ligger inde i ABC-nodearket.":ui("Each full song is one clip; its instrument voices are inside the ABC score.");
 L.start=da?"Start (sek.)":ui("Start (sec)");
 L.fadeIn=da?"Indtoning (sek.)":ui("Fade in (sec)");
 L.fadeOut=da?"Udtoning (sek.)":ui("Fade out (sec)");
 L.volume=da?"Lydstyrke (%)":ui("Volume (%)");
 L.mute=da?"Slå lyd fra":ui("Mute");
 L.overlap=da?"Overlap":ui("Overlap");
 L.help=da?"Dobbeltklik på et effektklip for at udskifte eller slette det. Fold effektsporene ud for at redigere varighed og overlap.":ui("Double-click an effect clip to replace or delete it. Expand effect lanes to edit duration and overlaps.");

 if(!Array.isArray(m.songs)||!m.songs.length)m.songs=[{id:"song-1",score:o.scoreTitle,start:0,duration:film.duration,kind:"complete-abc"}];
 m.songs=Playlist.reflow(m.songs,o.scoreTitle);
 var root=el(doc,"section","huw-musical-editor",undefined,o.host),head=el(doc,"div","huw-musical-editor-header",undefined,root);
 el(doc,"h3","",L.title,head);el(doc,"p","",L.help,root);
 var cameraLabel=el(doc,"span","huw-musical-active-camera","",head);
 L.name=da?"Navn":ui("Name");L.color=da?"Farve":ui("Color");L.text=da?"Tekst":ui("Text");
 var clipBar=el(doc,"div","huw-musical-clip-editor-bar",undefined,root);
 clipBar.hidden=true;
 var clipBack=el(doc,"button","huw-musical-clip-back",da?"← Tilbage til forestillingen":ui("← Back to performance"),clipBar);clipBack.type="button";
 var clipHeading=el(doc,"div","huw-musical-clip-editor-heading",undefined,clipBar);
 var clipTitle=el(doc,"strong","huw-musical-clip-editor-title","",clipHeading);
 var clipMeta=el(doc,"span","huw-musical-clip-editor-meta","",clipHeading);
 var rows=el(doc,"div","huw-musical-tracks",undefined,root),inspector=el(doc,"div","huw-musical-inspector",undefined,root),status=el(doc,"output","huw-musical-edited-status","",root);
 var preview=TrackPreview.create(),previewControls=[],previewHidden=[],captionCues=TrackPreview.captions(o.view,Engine);
 var cameraEditActive=false,playhead=0,choice={id:"song:"+m.songs[0].id,key:0},playheads=[],filter="all",zoom=1,expandedClipId="",detailClipId="",detailReturn=null,lastClipTap=null;
 var tracks=[{id:"song",kind:"song",name:L.song},{id:"scenes",kind:"scene-range",name:da?"Akter og scener":ui("Acts and scenes")},
  {id:"scene-objects",kind:"object-browser",name:da?"Objekter i scenen":ui("Objects in scene")},
  {id:"captions",kind:"captions",name:da?"Undertekster":ui("Captions")},
  {id:"backdrop",kind:"part",part:"stage-back",name:L.backdrop},{id:"stage",kind:"part",part:"stage-floor",name:L.stage},{id:"foreground",kind:"part",part:"foreground-flags",name:L.foreground},{id:"lights",kind:"light",name:L.light}];
 if((film.parts||[]).some(function(p){return p.id==="curtain-left";}))tracks.push({id:"curtain-left-track",kind:"film-part",part:"curtain-left",name:da?"Venstre fortæppe":ui("Left curtain")});
 if((film.parts||[]).some(function(p){return p.id==="curtain-right";}))tracks.push({id:"curtain-right-track",kind:"film-part",part:"curtain-right",name:da?"Højre fortæppe":ui("Right curtain")});
 if(Array.isArray(m.animationClips)&&m.animationClips.length){
  m.animationClips.forEach(function(c){tracks.push({id:"animation:"+c.id,kind:"animation",clipId:c.id,target:c.target,name:displayName(c.name||c.id)});});
 }else if(source)source.parts.filter(function(p){return /-root$/.test(p.id)&&p.keys&&p.keys.length>1;}).forEach(function(p){tracks.push({id:p.id,kind:"part",part:p.id,name:displayName(p.name||p.id)});});
 // Whole-object tracks are separate from limb/loop animation, so movement of
 // a puppet does not overwrite the animation of its arms, legs or instrument.
 var knownFigures={};m.animationClips.forEach(function(c){if(!c.target||knownFigures[c.target])return;knownFigures[c.target]=true;
  if(!m.figureTransforms[c.target])m.figureTransforms[c.target]={keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,skewX:0,skewY:0,easing:'smooth'}]};
  tracks.push({id:'figure:'+c.target,kind:'figure',part:c.target,name:(da?'Hele objekt · ':ui('Whole object · '))+displayName(c.name||c.target)});
 });
 tracks.push({id:"sfx",kind:"sfx",name:da?"MIDI-effekter":ui("MIDI effects")});
 tracks.push({id:"audio-fx",kind:"audio-fx",name:da?"Audioeffekter":ui("Audio effects")});
 var effectExpanded={sfx:false,"audio-fx":false},effectLibrary=null,lastFxOpen=0;
 tracks.push({id:"audio-lane",kind:"audio-lane",name:da?"Indtaling og lydfiler":ui("Voice and audio files")});
 tracks.push({id:"camera-A",kind:"camera",name:L.cameraA},{id:"camera-B",kind:"camera",name:L.cameraB},{id:"cuts",kind:"cut",name:L.cuts});
 tracks=tracks.filter(function(t){return t.kind!=='part'||!!sceneForPart(t.part,o.view,0);});
 var map={};tracks.forEach(function(t){map[t.id]=t;});
 // Facial choices belong to the performance clock so the same character
 // keeps learned speech shapes when it reappears in another source scene.
 var faceApi=null,faceUndo=[];
 function facial(){
  if(faceApi&&typeof faceApi.sync.faceContext==='function')return faceApi;
  try{faceApi={model:require('$:/plugins/huwiki/musical/face.js'),sync:require('$:/plugins/huwiki/musical/lipsync.js')};}
  catch(_unavailable){return null;}
  return faceApi&&typeof faceApi.sync.faceContext==='function'?faceApi:null;
 }
 function ensureFaceTrack(context){
  var id='face:'+context.actorId,t=map[id];
  if(!t){t={id:id,kind:'face',actorId:context.actorId,part:context.headId||context.actorId,name:(da?'Ansigt · ':ui('Face · '))+(context.label||context.actorId)};map[id]=t;tracks.splice(Math.max(0,tracks.length-3),0,t);}
  if(context.headId)t.part=context.headId;
  return t;
 }
 (m.faceKeys||[]).forEach(function(k){if(!k||!k.actor||map['face:'+k.actor])return;
  var scene=sceneForPart(k.actor,o.view,0),api=facial(),context=api&&scene&&api.model.resolve(scene,k.actor);
  ensureFaceTrack(context||{actorId:k.actor,label:k.actor});
 });
 m.animationClips.forEach(function(c){map["accent:"+c.id]={id:"accent:"+c.id,kind:"accent",clipId:c.id,name:displayName(c.name||c.id)+" · solo"};});
 function audioTrack(t){return ["song","song-lane","audio","audio-lane","sfx","audio-fx"].indexOf(t.kind)>=0;}
 function setPreviewEnabled(id,enabled){
  preview.set(id,enabled!==false);previewControls.forEach(function(control){control.update();});
  if(o.onPreviewChange)o.onPreviewChange();o.repaint();
 }
 function addPreviewControl(title,row,t){
  // Keep the switch separate from selecting the row, especially on touch.
  var text=title.textContent;title.textContent="";
  el(doc,"span","huw-musical-track-name",text,title);
  var sound=audioTrack(t),button=el(doc,"button","huw-musical-preview-toggle",undefined,title);button.type="button";
  button.dataset.previewTrack=t.id;button.dataset.previewKind=sound?"audio":"visibility";
  var svg=doc.createElementNS(NS,"svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.7");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");button.appendChild(svg);
  var icon=doc.createElementNS(NS,"path");icon.setAttribute("d",sound?"M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14":"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0");svg.appendChild(icon);
  var slash=doc.createElementNS(NS,"path");slash.setAttribute("d","M3 3l18 18");svg.appendChild(slash);
  function update(){var enabled=preview.enabled(t.id);
   button.setAttribute("aria-pressed",String(enabled));row.classList.toggle("is-preview-disabled",!enabled);slash.setAttribute("display",enabled?"none":"inline");
   var action=sound?(enabled?(da?"Slå lyd fra":ui("Mute")):(da?"Slå lyd til":ui("Unmute"))):(enabled?(da?"Skjul":ui("Hide")):(da?"Vis":ui("Show")));
   button.title=action+": "+t.name+(da?" · kun i editoren":ui(" · editor preview only"));button.setAttribute("aria-label",button.title);
  }
  button.onclick=function(ev){ev.preventDefault();ev.stopPropagation();setPreviewEnabled(t.id,!preview.enabled(t.id));};
  button.ondblclick=function(ev){ev.stopPropagation();};
  button.onpointerdown=function(ev){ev.stopPropagation();};
  button.onkeydown=function(ev){ev.stopPropagation();};
  previewControls.push({update:update});update();
 }
 function clearPreviewVisibility(){
  previewHidden.forEach(function(entry){entry.el.classList.remove("huw-musical-preview-hidden");entry.el.style.display=entry.display;});previewHidden=[];
 }
 function applyPreviewVisibility(time){
  var disabled=preview.disabled(),detail=preview.exporting()?null:activeDetail();
  if(!disabled.length&&!detail){if(previewHidden.length)clearPreviewVisibility();return;}
  var ids=Object.create(null),hideScene=!preview.enabled("scenes"),hideObjects=!preview.enabled("scene-objects"),next=[];
  disabled.forEach(function(id){var t=map[id],c;
   if(!t)return;
   if(t.kind==="animation"||t.kind==="accent"){c=animation(t);if(c&&time>=num(c.start,0)&&time<num(c.start,0)+num(c.duration,0))ids[c.target]=true;}
   else if(t.part)ids[t.part]=true;
  });
  if(detail)m.animationClips.forEach(function(c){if(c.target&&c.target!==detail.target)ids[c.target]=true;});
  function hide(node){if(node&&next.indexOf(node)<0)next.push(node);}
  function walk(view,local,depth){if(!view||depth>16)return;
   var nodes=view.nodes||{},keys=Object.keys(nodes);
   keys.forEach(function(id){var node=nodes[id];
    if(ids[id]||(hideObjects&&!node.part.parent))hide(node.el);
    if(node.nested&&(!node.el||node.el.getAttribute("display")!=="none")){
     var timing=Engine.timing(local,num(node.nested.duration,node.nested.scene.duration),node.part);
     if(timing.active)walk(node.nested,timing.time,depth+1);
    }
   });
   var active=Engine.clipAt(view.scene.scenes||[],local),clip=(view.clips||[])[active.index];
   if(clip&&clip.view){if(hideScene)hide(clip.el);walk(clip.view,Engine.localTime(active.time,clip.duration,clip.settings),depth+1);}
   else if(hideScene&&view===o.view)keys.forEach(function(id){hide(nodes[id].el);});
  }
  if(!preview.enabled("lights"))hide(overlay);
  if(hideScene||hideObjects||Object.keys(ids).length)walk(o.view,time,0);
  var retained=[];
  previewHidden.forEach(function(entry){if(next.indexOf(entry.el)>=0)retained.push(entry);
   else{entry.el.classList.remove("huw-musical-preview-hidden");entry.el.style.display=entry.display;}
  });
  next.forEach(function(node){if(retained.some(function(entry){return entry.el===node;}))return;
   retained.push({el:node,display:node.style.display||""});node.classList.add("huw-musical-preview-hidden");node.style.display="none";
  });previewHidden=retained;
 }
 function songTracks(){return m.songs.map(function(s,i){return {id:"song:"+s.id,kind:"song",index:i,name:"♫ "+(i+1)+". "+displayName(s.score)};});}
 function audioTracks(){return m.audioClips.map(function(c,i){return {id:'audio:'+c.id,kind:'audio',index:i,name:displayName(c.name||c.role||c.id)};});}
 function musicLanes(){return [{id:"music:A",kind:"song-lane",lane:"A",name:da?"♫ Musik A":ui("♫ Music A")},
  {id:"music:B",kind:"song-lane",lane:"B",name:da?"♫ Musik B":ui("♫ Music B")}];}
 function group(t){return (t.kind==="song"||t.kind==="song-lane"||t.kind==="sfx"||t.kind==='audio'||t.kind==='audio-lane'||t.kind==='audio-fx')?"music":(t.kind==="camera"||t.kind==="cut")?"camera":(t.id==="lights"||t.kind==="captions"||["backdrop","stage","foreground"].indexOf(t.id)>=0)?"scene":"animation";}
 function track(){if(!choice.id)return null;return songTracks().concat(audioTracks()).find(function(s){return s.id===choice.id;})||map[choice.id]||songTracks()[0]||tracks[0];}
 function axisDuration(){return Math.max(1,o.duration(),film.duration,Playlist.total(m.songs));}
 function part(t){var scene=t.kind==='film-part'?film:sceneForPart(t.part,o.view,0)||source;return scene&&(scene.parts||[]).find(function(p){return p.id===t.part;});}
 function paintPartAppearance(scene,id,field,value){
  if(!scene)return;var title=scene._title;
  // Reused source scenes have separate rendered trees and model objects.
  // Keep those occurrences consistent without touching another source that
  // happens to contain an identically named part.
  function walk(view,depth){if(!view||depth>16)return;
   if(view.scene===scene||title&&view.scene&&view.scene._title===title){
    var item=(view.scene.parts||[]).find(function(p){return p.id===id;}),node=view.nodes&&view.nodes[id];if(item)item[field]=value;
    if(node&&node.shape){if(field==='text')node.shape.textContent=value;else node.shape.setAttribute(field,value);}
   }
   (view.clips||[]).forEach(function(clip){walk(clip.view,depth+1);});
   Object.keys(view.nodes||{}).forEach(function(key){if(view.nodes[key].nested)walk(view.nodes[key].nested,depth+1);});
  }walk(o.view,0);
 }
 function animation(t){return m.animationClips.find(function(c){return c.id===t.clipId;});}
 function activeDetail(){return m.animationClips.find(function(c){return c.id===detailClipId;});}
 function detailTrack(clip,partId){
  var p=partByDeepId(partId)||source&&source.parts.find(function(k){return k.id===partId;});
  var id="motion:"+clip.id+":"+partId;
  return map[id]||(map[id]={id:id,kind:"motion",clipId:clip.id,part:partId,name:displayName(p&&p.name||partId)});
 }
 function openAnimation(clipId){
  var clip=m.animationClips.find(function(c){return c.id===clipId;});if(!clip)return false;
  if(!detailClipId)detailReturn={id:choice.id,key:choice.key,filter:filter};
  detailClipId=clip.id;choice={id:"animation:"+clip.id,key:0};
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
  detailClipId="";o.host.classList.remove("huw-musical--clip-detail");
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
 function target(t){if(t.kind==="figure")return m.figureTransforms[t.part]||null;if(t.kind==="part"||t.kind==="film-part")return part(t);if(t.kind==="animation")return animation(t);
  if(t.kind==="motion"||t.kind==="accent")return animation(t);
  if(t.id==="camera-A")return film.camera;if(t.id==="camera-B")return m.cameraB;
  if(t.kind==="light")return m.lighting;if(t.kind==="cut"||t.kind==="sfx")return m;return null;}
 function keys(t){if(t.kind==='face')return (m.faceKeys||[]).filter(function(k){return k.actor===t.actorId;}).sort(function(a,b){return a.t-b.t;});var v=target(t);if(!v)return [];
  if(t.kind==="motion")return (v.motion||{})[t.part]||[];
  if(t.kind==="accent")return v.accents||(v.accents=[]);
  if(t.kind==="animation")return [];
  return t.kind==="cut"?v.cuts:t.kind==="sfx"?v.sfx:(v.keys||(v.keys=[]));}
 function toFilm(time,t){
  if(t.kind!=="part")return lim(time,0,film.duration);
  var context=partContext(t.part,o.view,playhead,[],true,0);if(!context)return lim(time,0,film.duration);
  var value=time;
  for(var i=context.path.length-1;i>=0;i--){
   var edge=context.path[i],settings=edge.settings||{},speed=num(settings.speed,1),offset=num(settings.offset,0),start=num(settings.start,0);
   if(Math.abs(speed)<1e-8){value=edge.parentTime;continue;}
   var input=start+(value-offset)/speed;
   if(settings.loop&&edge.sourceDuration>0){
    var raw=(Math.max(edge.input,start)-start)*speed+offset;
    var cycle=Math.round((raw-value)/edge.sourceDuration),best=null,distance=Infinity;
    for(var turn=cycle-2;turn<=cycle+2;turn++){
     var candidate=start+(value+turn*edge.sourceDuration-offset)/speed;
     if(candidate>=Math.max(0,start)-.00001&&candidate<=edge.limit+.00001&&Math.abs(candidate-edge.input)<distance){best=candidate;distance=Math.abs(candidate-edge.input);}
    }
    if(best!==null)input=best;
   }
   value=edge.timelineStart+lim(input,0,edge.limit);
  }
  return lim(value,0,film.duration);
 }
 function fromFilm(time,t){if(t.kind!=="part")return time;var context=partContext(t.part,o.view,time,[],true,0);return context?context.time:time;}
 function toAudio(time){return lim(time,0,o.duration());}
 function activeCam(time){if(!preview.enabled("cuts"))return "A";var c="A";m.cuts.slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(num(k.t,0)<=time+1e-6)c=k.camera==="B"?"B":"A";});return c;}
 function cameraState(time){return preview.enabled("camera-"+activeCam(time))?Engine.cameraState({width:film.width,height:film.height,camera:activeCam(time)==="B"?m.cameraB:film.camera},time):{x:film.width/2,y:film.height/2,zoom:1};}
 function illumination(time){return lim(interpolate(m.lighting.keys,time,"intensity",1),0,1);}
 var overlay=doc.createElementNS(NS,"rect");overlay.setAttribute("class","huw-musical-light-overlay");overlay.setAttribute("pointer-events","none");o.view.svg.appendChild(overlay);
 // The previous global dimmer also darkened the actors *inside* their spotlights.
 // A radial mask punches two graduated holes through the ambient dimmer, following
 // the actual CutOut puppet roots rather than a separate pre-rendered image.
 var focusDefs=Array.isArray(m.focusSpots)&&m.focusSpots.length?doc.createElementNS(NS,"defs"):null,
  focusHoles=[],focusMap={};
 if(focusDefs){
  var focusId="huw-focus-"+String(Date.now())+"-"+Math.floor(Math.random()*1000000),
   gradientId=focusId+"-soft",gradient=doc.createElementNS(NS,"radialGradient");
  gradient.setAttribute("id",gradientId);
  [["0%",1],["43%",.96],["72%",.65],["100%",0]].forEach(function(item){
   var stop=doc.createElementNS(NS,"stop");stop.setAttribute("offset",item[0]);
   stop.setAttribute("stop-color","black");stop.setAttribute("stop-opacity",String(item[1]));gradient.appendChild(stop);
  });focusDefs.appendChild(gradient);
  var mask=doc.createElementNS(NS,"mask");mask.setAttribute("id",focusId);
  mask.setAttribute("maskUnits","objectBoundingBox");
  mask.setAttribute("x","0");mask.setAttribute("y","0");mask.setAttribute("width","1");mask.setAttribute("height","1");
  var back=doc.createElementNS(NS,"rect");
  back.setAttribute("fill","white");mask.appendChild(back);
  for(var n=0;n<2;n++){
   var hole=doc.createElementNS(NS,"ellipse");hole.setAttribute("fill","url(#"+gradientId+")");
   hole.setAttribute("rx","118");hole.setAttribute("ry","153");mask.appendChild(hole);focusHoles.push(hole);
  }
  focusDefs.appendChild(mask);o.view.svg.insertBefore(focusDefs,o.view.svg.firstChild);
  overlay.setAttribute("mask","url(#"+focusId+")");
  m.focusSpots.forEach(function(cue){if(cue&&cue.sceneId)focusMap[cue.sceneId]=cue;});
 }
 function activeNested(time){
  var current=o.view,local=time;
  for(var depth=0;depth<12&&current&&current.clips&&current.clips.length;depth++){
   var hit=Engine.clipAt(current.scene.scenes||[],local),child=current.clips[hit.index];
   if(!child||!child.view)break;
   local=Engine.localTime(hit.time,child.duration,child.settings);current=child.view;
  }
  return {view:current,time:local};
 }
 function updateFocus(time){
  if(!focusHoles.length)return;
  var active=activeNested(time),cue=active.view&&focusMap[active.view.scene.id],targets=cue&&cue.targets||[];
  focusHoles.forEach(function(hole,i){
   var node=active.view&&active.view.nodes&&active.view.nodes[targets[i]];
   if(!node){hole.setAttribute("display","none");return;}
   var pose=Engine.state(node.part,active.time);
   hole.setAttribute("display","inline");hole.setAttribute("cx",String(pose.x));
   hole.setAttribute("cy",String(pose.y-(cue.yOffset===undefined?63:cue.yOffset)));
   hole.setAttribute("rx",String(cue.rx||118));hole.setAttribute("ry",String(cue.ry||153));
  });
 }
 function paint(time){var c=cameraState(time),w=film.width/c.zoom,h=film.height/c.zoom,box={x:c.x-w/2,y:c.y-h/2,width:w,height:h};
  o.view.svg.setAttribute("viewBox",[box.x,box.y,box.width,box.height].join(" "));
  Object.keys(box).forEach(function(k){overlay.setAttribute(k,box[k]);});overlay.setAttribute("fill","#040716");
  overlay.setAttribute("opacity",round(focusHoles.length?Math.max(.18,Math.min(.65,(1-illumination(time))*.76+.12)):(1-illumination(time))*.78));
  updateFocus(time);
  // This is a preview-only camera and solo mode. The actual film camera and
  // all other animation clips remain unchanged in the saved TiddlyWiki.
  var detail=preview.exporting()?null:activeDetail();
  if(detail){
   var person=source&&source.parts.find(function(p){return p.id===detail.target;});
   if(person){var pose=Engine.state(person,time);o.view.svg.setAttribute("viewBox",[round(pose.x-200),round(pose.y-165),400,225].join(" "));}
  }
  paintTransform(time);
  if(focusDefs)["x","y","width","height"].forEach(function(k){back.setAttribute(k,overlay.getAttribute(k));});
  applyPreviewVisibility(time);
  var cameraText=detail?(da?"Animation: ":ui("Animation: "))+detail.name:L.camera+" "+activeCam(time);
  if(cameraLabel.textContent!==cameraText)cameraLabel.textContent=cameraText;playhead=time;
  if(!detailClipId&&!preview.exporting()&&groupScene&&currentStage().scene!==groupScene)draw();
  var axis=axisDuration();
  playheads.forEach(function(e){
   if(e.dataset.cursorMode==="beat"){
    var phase=detail&&Motion.phase(detail,time,o.beatClock&&o.beatClock());
    e.style.display=phase===null?"none":"";
    e.style.left=phase===null?"0%":(100*phase/Math.max(.125,num(detail.beatsPerLoop,8)))+"%";
   }else e.style.left=(100*time/axis)+"%";
  });
 }
 function save(t){var isPart=t.kind==="part",partScene=isPart&&(sceneForPart(t.part,o.view,0)||source),name=isPart?(partScene&&partScene._title||o.stageTitle):o.sceneTitle,value=isPart?partScene:film,old=o.wiki.getTiddler(name);if(!old||!value)return;
  if(t.kind==='face'&&Array.isArray(m.faceKeys))m.faceKeys.sort(function(a,b){return a.t-b.t;});
  var json=JSON.stringify(value);o.markOwnWrite(name,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:name,text:json}));status.textContent=L.saved;
  if(t.kind==="sfx"&&o.onFxChange)o.onFxChange(m.sfx);
  if(t.kind==='audio'&&o.onAudioChange)o.onAudioChange(m.audioClips);
 }
 function choose(id,key,properties,moveId){choice={id:id,key:key,moveId:moveId};var t=track();
  if(t&&t.kind==='figure')ensureFigureTrack(t.part);
  var active=currentStage(),id=t&&(t.kind==='face'?t.actorId:t.kind==='animation'?t.target:t.part),seen={};
  if(id&&t.kind!=='figure'){var p=(active.scene.parts||[]).find(function(p){return p.id===id;});
   if(t.kind==='face'||t.kind==='animation')groupExpanded[(active.scene._title||active.scene.id||'')+':'+id]=true;
   while(p&&p.parent&&!seen[p.id]){seen[p.id]=true;groupExpanded[(active.scene._title||active.scene.id||'')+':'+p.parent]=true;p=active.scene.parts.find(function(n){return n.id===p.parent;});}
  }
  if(t.kind==="animation")expandedClipId=t.id;
  if(t.kind==="motion"||t.kind==="accent")expandedClipId="animation:"+t.clipId;
  draw();if(o.onSelect)o.onSelect(track(),properties);}
 function clearSelection(){var hadSelection=!!choice.id;choice={id:"",key:-1};if(detailReturn){detailReturn.id="";detailReturn.key=-1;}draw();if(o.onSelect)o.onSelect(null);return hadSelection;}
 function selected(){var t=track();return !t?null:t.kind==="captions"?captionCues[choice.key]:t.kind==="song"?m.songs[t.index]:t.kind==='audio'?m.audioClips[t.index]:t.kind==="animation"?animation(t):keys(t)[choice.key];}
 function faceContext(id){
  var api=facial(),located=id&&partContext(id,o.view,playhead,[],true,0);
  if(!api||!located||!located.active)return null;
  var scene=located.view.scene,context=api.sync.faceContext(located.view,id,located.time,playhead,{film:film,sceneTitle:scene._title||o.stageTitle,audioClips:m.audioClips});
  if(!context)return null;
  context.view=located.view;context.scene=scene;context.localTime=located.time;context.time=playhead;
  var matching=captionCues.filter(function(cue){return cue.sceneTitle===scene._title&&(!context.cueId||cue.partId===context.cueId)&&cue.part&&cue.part.lipSync&&cue.part.lipSync.target===context.actorId;});
  matching.sort(function(a,b){
   function distance(cue){return playhead>=cue.start&&playhead<cue.end?0:Math.min(Math.abs(cue.start-playhead),Math.abs(cue.end-playhead));}
   return distance(a)-distance(b);
  });
  var cue=matching[0];if(cue)context.cue={text:String(cue.part.text||cue.text||''),partId:cue.partId,sceneTitle:cue.sceneTitle,time:cue.start,start:cue.start,end:cue.end,active:playhead>=cue.start&&playhead<cue.end};
  return context;
 }
 function rememberFace(){faceUndo.push(Model.clone(m.faceKeys||[]));if(faceUndo.length>30)faceUndo.shift();}
 function writeFace(actorId,time,patch,t){
  var api=facial();if(!api)return false;
  var prior=m.faceKeys||[],next=api.model.withKey(prior,actorId,lim(time,0,axisDuration()),patch);
  if(JSON.stringify(next)===JSON.stringify(prior))return true;
  rememberFace();m.faceKeys=next;
  t=t||ensureFaceTrack(faceContext(actorId)||{actorId:actorId});
  var list=keys(t),index=0;list.forEach(function(k,i){if(Math.abs(k.t-time)<.025)index=i;});
  choice={id:t.id,key:index};var active=currentStage();groupExpanded[(active.scene._title||active.scene.id||'')+':'+actorId]=true;save(t);draw();o.repaint();if(o.onSelect)o.onSelect(t);return true;
 }
 function chooseFace(id,selection){
  selection=selection||{};if(o.pause)o.pause();
  var context=faceContext(id),api=facial();if(!context||!api)return false;
  var patch={},value=String(selection.value||''),channel=selection.channel;
  if(channel==='expression'){
   if(!api.model.PRESETS.some(function(p){return p.id===value;}))return false;
   patch=api.model.preset(value);
  }else if(channel==='eyes'){
   if(!api.model.EYES.some(function(p){return p.id===value;}))return false;patch.eyes=value;
  }else if(channel==='mouth'){
   var sound=String(selection.viseme||context.viseme||'rest');
   if(!api.model.SOUNDS.some(function(s){return s.id===sound;}))return false;
   if(value==='auto'){patch.mouth={mode:'auto'};patch.mouthMap={};patch.mouthMap[sound]=null;}
   else{
    if(!(context.variants||[]).some(function(v){return v.id===value;}))return false;
    if(selection.mode==='fixed')patch.mouth={mode:'fixed',variant:value};
    else{patch.mouth={mode:'auto'};patch.mouthMap={};patch.mouthMap[sound]=value;}
   }
  }else return false;
  return writeFace(context.actorId,playhead,patch,ensureFaceTrack(context));
 }
 function faceHistory(actorId){return Model.clone((m.faceKeys||[]).filter(function(k){return !actorId||k.actor===actorId;}).sort(function(a,b){return a.t-b.t;}));}
 function selectFaceKey(actorId,time){
  if(o.pause)o.pause();o.seek(lim(time,0,axisDuration()));
  var t=ensureFaceTrack(faceContext(actorId)||{actorId:actorId}),list=keys(t),index=0,best=Infinity;
  list.forEach(function(k,i){var distance=Math.abs(k.t-time);if(distance<best){best=distance;index=i;}});choose(t.id,index);return true;
 }
 function undoFace(){
  if(!faceUndo.length)return false;
  m.faceKeys=faceUndo.pop();var t=track();if(!t||t.kind!=='face')t={kind:'face'};
  save(t);draw();o.repaint();if(o.onSelect)o.onSelect(track());return true;
 }
 function faceKeyLabel(k){
  var api=facial(),pieces=[];
  if(k.mood&&api){var preset=api.model.PRESETS.find(function(p){return p.id===k.mood;});pieces.push(preset?(da?preset.label:preset.en):k.mood);}
  if(k.eyes&&api){var eye=api.model.EYES.find(function(p){return p.id===k.eyes;});pieces.push((da?'Øjne: ':ui('Eyes: '))+(eye?(da?eye.label:eye.en):k.eyes));}
  if(k.mouth&&k.mouth.mode==='fixed')pieces.push((da?'Fast mund: ':ui('Fixed mouth: '))+k.mouth.variant);
  if(k.mouthMap)Object.keys(k.mouthMap).forEach(function(sound){pieces.push((sound==='rest'?(da?'Pause':ui('Rest')):sound)+' → '+(k.mouthMap[sound]===null?(da?'Automatisk':ui('Automatic')):k.mouthMap[sound]));});
  else if(k.mouthMap===null)pieces.push(da?'Automatiske mundformer':ui('Automatic mouth shapes'));
  if(!pieces.length&&k.mouth)pieces.push(da?'Følg manuskript':ui('Follow script'));return pieces.join(' · ');
 }
 function newPoint(t,time,fxType){if(t.kind==="song"||((t.kind==='part'||t.kind==='film-part')&&!part(t)))return;
  if(t.kind==='face'){
   var api=facial();if(!api)return;
   var snapshot=api.model.state(m.faceKeys||[],time,t.actorId);
   writeFace(t.actorId,time,{eyes:snapshot.eyes,mood:snapshot.mood,mouth:snapshot.mouth,mouthMap:snapshot.mouthMap||{}},t);return;
  }
  if(t.kind==="animation"){
   var c=animation(t);if(!c)return;
   var accents=c.accents||(c.accents=[]),key={t:round(time),x:0,y:0,r:0};
   accents.push(key);accents.sort(function(a,b){return a.t-b.t;});
   choose("accent:"+c.id,accents.indexOf(key));save({kind:"animation"});return;
  }
  var at=round(t.kind==="motion"?(Motion.phase(animation(t),time,o.beatClock())||0):t.kind==="accent"?time:fromFilm(time,t));
  var list=keys(t),known=list.findIndex(function(k){return Math.abs(k.t-at)<.02;});if(known>=0&&t.kind!=="sfx"){choose(t.id,known);return;}
  var k={t:at};if(t.kind==="motion")Object.assign(k,Motion.sample(list,at)||{x:0,y:0,r:0,sx:1,sy:1,opacity:1});
  else if(t.kind==="accent")Object.assign(k,{x:0,y:0,r:0});
  else if(t.kind==="figure"){
   Object.assign(k,figureState(at,t.part));
  }else if(t.kind==="part"||t.kind==="film-part"){
   var state=Engine.state(part(t),at);["x","y","r","sx","sy","opacity"].forEach(function(field){k[field]=round(num(state[field],1));});
  }else if(t.kind==="camera"){
   var cam=cameraStateFor(at,t.id==="camera-B"?"B":"A");k.x=round(cam.x);k.y=round(cam.y);k.zoom=round(cam.zoom);
   k.r=round(cam.r);k.skewX=round(cam.skewX);k.skewY=round(cam.skewY);k.easing="smooth";
  }else if(t.kind==="light")k.intensity=round(illumination(at));else if(t.kind==="cut")k.camera=activeCam(at);
  else if(t.kind==="sfx")Object.assign(k,{id:"fx-"+Date.now()+"-"+Math.floor(Math.random()*100000),type:fxType||"magic",t:Math.min(at,Math.max(0,film.duration-.1)),volume:.7,reverb:0,duration:Math.max(.1,Math.min(1,film.duration-at))});
  list.push(k);list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();
 }
 function removePoint(t){var list=keys(t);if(!list[choice.key])return;
  if(t.kind==='face'){rememberFace();var removed=list[choice.key];m.faceKeys=(m.faceKeys||[]).filter(function(k){return k!==removed;});choice.key=Math.max(0,choice.key-1);save(t);draw();o.repaint();if(o.onSelect)o.onSelect(t);return;}
  if(t.kind==="motion"&&(choice.key===0||choice.key===list.length-1))return;list.splice(choice.key,1);choice.key=Math.max(0,Math.min(choice.key,list.length-1));save(t);draw();o.repaint();}
 function formNumber(k,label,field,step,min,max){var p=el(doc,"label","huw-musical-property",undefined,inspector);el(doc,"span","",label,p);
  var input=el(doc,"input","",undefined,p);input.type="number";input.step=step;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
  input.value=round(num(k[field],0));input.onchange=function(){var value=Number(input.value);if(!Number.isFinite(value))return;
   if(track().kind==='face')rememberFace();
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
  var each=o.wiki.eachTiddlerPlusShadows||o.wiki.each;
  each.call(o.wiki,function(t,title){if(t.fields&&!/^\$:\/temp\//.test(title)&&!t.fields['draft.of']&&typeof t.fields["abc-source"]==="string"&&/^\s*X:\s*\d+/m.test(t.fields["abc-source"]))choices.push(title);});
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
 var openSongOptions="";
 function drawSongForm(){
  var t=track(),i=t.index,k=m.songs[i];
  if(!k)return;
  var clips=typeof o.clips==="function"?o.clips():m.songs;
  var clip=clips.find(function(x){return x.id===k.id;})||k;
  var clipOptions=el(doc,'details','huw-musical-song-options',undefined,inspector);
  el(doc,'summary','',da?'Redigér musikklip':ui('Edit music clip'),clipOptions);
  clipOptions.open=openSongOptions===k.id;
  clipOptions.ontoggle=function(){if(clipOptions.parentNode===inspector)openSongOptions=clipOptions.open?k.id:'';};
  var actions=el(doc,"div","huw-musical-key-actions huw-musical-song-actions",undefined,clipOptions);
  var available=songChoices(),select=el(doc,"select","huw-musical-song-select",undefined,actions);
  select.setAttribute("aria-label",L.chooseSong);
  available.forEach(function(title){var option=el(doc,"option","",title,select);option.value=title;});
  if(available.indexOf(k.score)>=0)select.value=k.score;
  var laneLabel=el(doc,"label","huw-musical-property",undefined,inspector);
  el(doc,"span","",da?"Musikspor":ui("Music lane"),laneLabel);
  var laneSelect=el(doc,"select","huw-musical-song-select",undefined,laneLabel);
  [["A",da?"Musik A":ui("Music A")],["B",da?"Musik B":ui("Music B")]].forEach(function(entry){var option=el(doc,"option","",entry[1],laneSelect);option.value=entry[0];});
  laneSelect.value=k.lane||"A";
  laneSelect.onchange=function(){var old=k.lane;k.lane=laneSelect.value;
   if(m.songs.some(function(s){return s!==k&&s.lane===k.lane&&Playlist.overlap(s,k)>.005;})){
    k.lane=old;laneSelect.value=old;status.textContent=da?"To klip kan ikke overlappe på samme musikspor.":ui("Clips cannot overlap on the same music lane.");return;
   }
   persistSongs(false);
  };
  function button(cls,title,fn,disabled){
   var b=el(doc,"button",cls,title,actions);b.type="button";b.disabled=!!disabled;b.onclick=fn;return b;
  }
  var editScore=button('huw-musical-edit-score',da?'Redigér noder':ui('Edit notation'),function(){if(o.onEditScore)o.onEditScore(k.score,k);});
  inspector.insertBefore(editScore,clipOptions);
  button("huw-musical-add-song",L.addSong,function(){
   var id="song-"+(m.songs.length+1);while(m.songs.some(function(s){return s.id===id;}))id+="-x";
   var cross=Math.min(2,k.duration);
   k.fadeOut=Math.max(k.fadeOut||0,cross);
   m.songs.splice(i+1,0,{id:id,score:select.value,start:round(k.start+k.duration-cross),
    duration:16,fadeIn:cross,fadeOut:0,volume:1,lane:k.lane==="A"?"B":"A",kind:"complete-abc"});
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
 function recordedFx(c){return c&&(c.kind==="sfx"||c.kind==="effects");}
 function clipLevel(ends,start,duration){
  var level=ends.findIndex(function(end){return end<=start;});
  if(level<0)level=ends.length;
  ends[level]=start+duration;
  return level;
 }
 function fxName(type){
  var preset=Sfx.PRESETS[type];return preset?(da?preset[1]:ui(preset[2])):String(type||"FX");
 }
 function fxLevel(k,field,label,fallback){
  var row=el(doc,"label","huw-musical-property",undefined,inspector);
  el(doc,"span","",label,row);
  var input=el(doc,"input","",undefined,row),output=el(doc,"output","",undefined,row);
  input.type="range";input.min=0;input.max=100;input.step=1;input.setAttribute("aria-label",label);
  input.value=Math.round(100*num(k[field],fallback));output.textContent=input.value+"%";
  input.oninput=function(){output.textContent=input.value+"%";k[field]=Number(input.value)/100;};
  input.onchange=function(){input.oninput();save(track());};
 }
 function openEffects(t,k){
  if(effectLibrary)return;
  if(o.pause)o.pause();
  var audioMode=t.kind==="audio-fx"||recordedFx(k);
  effectLibrary=EffectsLibrary.open({doc:doc,wiki:o.wiki,host:root,danish:da,ui:ui,mode:audioMode?"audio":"synth",presets:Sfx.PRESETS,selected:k,
   onPause:o.pause,onPreview:function(entry){if(o.previewFx)o.previewFx({type:entry.id,duration:1,volume:.7,reverb:0});},
   onStopPreview:function(){if(o.stopPreviewFx)o.stopPreviewFx();},
   onClose:function(){effectLibrary=null;},
   onChoose:function(entry){
    if(audioMode){
     if(k)EffectsLibrary.replaceAudio(k,entry);
     else {k=EffectsLibrary.makeClip(entry,playhead,axisDuration());m.audioClips.push(k);}
     save({kind:"audio"});choice={id:"audio:"+k.id,key:0};draw();o.repaint();
    }else if(k){k.type=entry.id;save(t);choice={id:"sfx",key:m.sfx.indexOf(k)};draw();o.repaint();}
    else newPoint(t,playhead,entry.id);
   },onDelete:k?function(){
    if(audioMode){m.audioClips=m.audioClips.filter(function(c){return c!==k;});save({kind:"audio"});choice={id:"audio-fx",key:-1};}
    else {m.sfx=m.sfx.filter(function(c){return c!==k;});save(t);choice={id:"sfx",key:-1};}
    draw();o.repaint();
   }:null});
 }
 function fxForm(t,k){
  var audioMode=t.kind==="audio-fx"||recordedFx(k),chooseEffect=el(doc,"button","huw-musical-open-effects",k?(da?"Udskift eller slet effekt":ui("Replace or delete effect")):(da?"＋ Effektbibliotek":ui("＋ Effect library")),inspector);chooseEffect.type="button";
  chooseEffect.onclick=function(){openEffects(t,k);};
  if(!k)return;
  formText(k,L.name,audioMode?"name":"label");
  formNumber(k,L.time,audioMode?"start":"t",.05,0,Math.max(0,film.duration-num(k.duration,1)));
  formNumber(k,da?"Varighed (sek.)":ui("Duration (sec)"),"duration",.05,.02,audioMode?Math.max(.02,(k.sourceDuration||film.duration)-num(k.offset,0)):Math.max(.08,film.duration-k.t));
  fxLevel(k,"volume",da?"Lydstyrke":ui("Volume"),1);fxLevel(k,"reverb",da?"Rumklang":ui("Reverb"),0);
  if(audioMode){formNumber(k,L.fadeIn,"fadeIn",.05,0,k.duration);formNumber(k,L.fadeOut,"fadeOut",.05,0,k.duration);}
  if(!audioMode){var audition=el(doc,"button","",da?"▶ Lyt":ui("▶ Listen"),inspector);audition.type="button";audition.onclick=function(){if(o.previewFx)o.previewFx(k);};}
 }
 function fxBlock(lane,t,k,index,axis,level){
  var recorded=recordedFx(k),field=recorded?"start":"t",id=recorded?"audio:"+k.id:t.id;
  var maxLength=recorded&&k.sourceDuration?Math.max(.02,k.sourceDuration-num(k.offset,0)):axis;
  var preset=Sfx.PRESETS[k.type]||Sfx.PRESETS.magic;
  var block=el(doc,"button","huw-musical-fx-clip",undefined,lane);block.type="button";
  block.dataset.fxType=recorded?"recording":k.type;block.style.top=(level*27+3)+"px";
  var name=recorded?displayName(k.name||k.asset):(k.label||fxName(k.type));
  var collapsed=!effectExpanded[t.id];block.classList.toggle("is-collapsed",collapsed);block.dataset.fxId=k.id||String(index);
  el(doc,"span","huw-musical-fx-icon",recorded?(k.icon||"🔊"):preset[0],block).setAttribute("aria-hidden","true");
  el(doc,"span","huw-musical-fx-name",name,block);
  var handle=el(doc,"span","huw-musical-fx-trim","",block);
  handle.title=da?"Træk for at ændre varighed":ui("Drag to change duration");
  function paint(){
   block.style.left=(100*k[field]/axis)+"%";block.style.width=(100*num(k.duration,1)/axis)+"%";
   block.title=name+" · "+round(k[field])+" s · "+round(num(k.duration,1))+" s";block.setAttribute("aria-label",block.title);
  }
  paint();if(id===choice.id&&(recorded||index===choice.key))block.classList.add("is-selected");
  block.onclick=function(e){
   e.stopPropagation();var now=Date.now(),tapId="fx:"+(k.id||index),last=lastClipTap,isDouble=last&&last.id===tapId&&now-last.time<480&&Math.abs(e.clientX-last.x)<30&&Math.abs(e.clientY-last.y)<30;
   lastClipTap=isDouble?null:{id:tapId,time:now,x:e.clientX,y:e.clientY};
   if(o.pause)o.pause();
   if(choice.id!==id||(!recorded&&choice.key!==m.sfx.indexOf(k)))choose(id,recorded?0:m.sfx.indexOf(k));
   o.seek(toAudio(k[field]));
   if(isDouble){lastFxOpen=now;openEffects(t,k);}
  };
  block.ondblclick=function(e){e.preventDefault();e.stopPropagation();if(Date.now()-lastFxOpen>150){lastFxOpen=Date.now();openEffects(t,k);}};
  block.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openEffects(t,k);}};
  block.onpointerdown=function(e){
   if(e.button!==undefined&&e.button!==0)return;e.stopPropagation();var x=e.clientX,rect=lane.getBoundingClientRect(),start=k[field],length=num(k.duration,1),trim=!collapsed&&e.target===handle,moved=false;
   if(block.setPointerCapture)block.setPointerCapture(e.pointerId);
   block.onpointermove=function(ev){
    var dx=ev.clientX-x;if(!moved&&Math.abs(dx)<3)return;if(!moved&&o.pause)o.pause();moved=true;lastClipTap=null;
    var change=dx*axis/Math.max(1,rect.width);
    if(trim)k.duration=round(lim(length+change,.08,Math.min(maxLength,Math.max(.08,axis-start))));
    else k[field]=round(lim(start+change,0,Math.max(0,axis-length)));
    paint();
   };
   function finish(cancel){
    block.onpointermove=block.onpointerup=block.onpointercancel=null;
    if(!moved)return;
    if(cancel){k[field]=start;k.duration=length;paint();return;}
    var list=keys(t);if(!recorded)list.sort(function(a,b){return a.t-b.t;});save(recorded?{kind:"audio"}:t);choose(id,recorded?0:list.indexOf(k));o.seek(toAudio(k[field]));
   }
   block.onpointerup=function(){finish(false);};block.onpointercancel=function(){finish(true);};
  };
 }
 // Remember a completed hold across the redraw that replaces the pressed row.
 var heldPointer=false,cancelHold=null;
 rows.addEventListener("click",function(event){
  if(heldPointer){heldPointer=false;event.preventDefault();event.stopPropagation();}
 },true);
 rows.addEventListener("pointerdown",function(){heldPointer=false;},true);
 function installPropertyGesture(row,open){
  var controls="input,select,.huwrep-order-handle,.huw-musical-group-fold,.huw-musical-preview-toggle";
  row.oncontextmenu=function(event){
   if(event.target.closest(controls))return;
   event.preventDefault();event.stopPropagation();
   if(cancelHold)cancelHold();
   if(!heldPointer)open(event.target);
  };
  row.onpointerdown=function(event){
   if(cancelHold)cancelHold();
   if(event.button!==0||event.target.closest(controls))return;
   if(event.target.closest("button")&&!event.target.closest("[data-rig-move]"))return;
   var target=event.target,x=event.clientX,y=event.clientY;
   var timer=doc.defaultView.setTimeout(function(){
    cancel();if(row.isConnected){heldPointer=true;open(target);}
   },550);
   function cancel(){
    doc.defaultView.clearTimeout(timer);
    ["pointerup","pointercancel","pointerleave"].forEach(function(type){row.removeEventListener(type,cancel);});
    row.removeEventListener("pointermove",move);cancelHold=null;
   }
   function move(e){if(Math.hypot(e.clientX-x,e.clientY-y)>7)cancel();}
   cancelHold=cancel;
   ["pointerup","pointercancel","pointerleave"].forEach(function(type){row.addEventListener(type,cancel);});
   row.addEventListener("pointermove",move);
  };
 }
 function movementError(error){
  var messages={
   occupied:da?"Der ligger allerede en aktivitet her.":"Another activity is already here.",
   overlap:da?"Her er allerede nøglebilleder.":"There are already keyframes here.",
   unbound:da?"Vælg et figurspor med et skelet.":"Choose a figure track with a skeleton.",
   duration:da?"Hele aktiviteten skal ligge i scenen.":"The whole activity must fit inside the scene.",
   reach:da?"Flyt rekvisitten inden for dukkens rækkevidde.":"Move the prop within reach of the puppet.",
   changed:da?"Scenen er ændret. Åbn editoren igen.":"The scene changed. Reopen the editor.",
   samples:da?"Klippet mangler bevægelsespunkter.":"Motion samples are missing from this clip."
  };
  return messages[error.message]||(da?"Bevægelsen passer ikke til denne figur.":"This movement does not fit this figure.");
 }
 function movementInterval(view,partId,start,seconds){
  if(!Number.isFinite(start)||!Number.isFinite(seconds)||start<0||seconds<.01||start+seconds>film.duration+.00001)throw Error("duration");
  var now=partContext(partId,o.view,start,[],true,0),margin=Math.min(.00001,seconds/2);
  var last=partContext(partId,o.view,start+seconds-margin,[],true,0);
  if(!now||!last||!now.active||!last.active||now.view!==view||last.view!==view)throw Error("duration");
  var rate=now.path.reduce(function(r,edge){return r*num(edge.settings.speed,1);},1);
  var end=now.time+rate*seconds;
  if(!(rate>0)||Math.abs(last.time-(end-margin*rate))>.001||end>view.scene.duration+.00001)throw Error("duration");
  return {start:now.time,end:end};
 }
 function writeMovement(view,original,request){
  var scene=view.scene,title=scene._title||(scene===film?o.sceneTitle:o.stageTitle),old=o.wiki.getTiddler(title);
  if(!old||o.wiki.getTiddlerText(title,'')!==original)throw Error("changed");
  var model=require("$:/plugins/huwiki/musical/movement-clips.js");
  model.edit(scene,request);
  // A source scene can appear several times in the same show.
  var byId=new Map(scene.parts.map(function(p){return [p.id,p];}));
  function sync(v){
   if(v!==view&&v.scene._title===title)v.scene.parts.forEach(function(p){
    var updated=byId.get(p.id);if(updated){p.keys=updated.keys;if(updated.animusMoves)p.animusMoves=updated.animusMoves;}
   });
   (v.clips||[]).forEach(function(c){if(c.view)sync(c.view);});
   Object.keys(v.nodes||{}).forEach(function(id){if(v.nodes[id].nested)sync(v.nodes[id].nested);});
  }
  sync(o.view);
  var json=JSON.stringify(scene);o.markOwnWrite(title,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:title,text:json}));
  status.textContent=L.saved;
 }
 function moveActivity(view,original,sourceId,move,targetId,start,seconds){
  try{
   var span=movementInterval(view,targetId,start,seconds);
   writeMovement(view,original,Object.assign(span,{sourceId:sourceId,targetId:targetId,id:move.id}));
  }catch(error){status.textContent=movementError(error);return false;}
  o.seek(start);choose('figure:'+targetId,0,true,move.id);o.repaint();return true;
 }
 function drawActivity(lane,view,original,t,move,axis){
  var rig=require("$:/plugins/huwiki/musical/skeleton.js"),names=rig.cycles[move.type];if(!names)return;
  var track={kind:view.scene===film?"film-part":"part",part:t.part},start=toFilm(move.start,track),end=toFilm(move.end,track),seconds=end-start;
  if(seconds<=0)return;
  var block=el(doc,"button","huw-musical-motion-clip",undefined,lane);block.type="button";
  el(doc,"span","",names[da?0:1],block);block.dataset.rigMove=move.id;block.dataset.start=String(start);
  block.classList.toggle("is-selected",choice.moveId===move.id);
  block.title=names[da?0:1]+" · "+round(start)+"–"+round(end)+" s ("+round(seconds)+" s)";
  block.setAttribute("aria-label",block.title);
  function position(node,at){node.style.left=100*at/axis+"%";node.style.width=100*seconds/axis+"%";}
  position(block,start);
  var suppressClick=false;
  block.onclick=function(e){e.stopPropagation();if(suppressClick){suppressClick=false;return;}o.seek(start);choose(t.id,0,true,move.id);};
  block.onpointerdown=function(e){
   if(e.button!==0||e.isPrimary===false||block.hasPointerCapture&&block.hasPointerCapture(e.pointerId))return;
   e.stopPropagation();suppressClick=false;
   if(o.pause)o.pause();
   var rect=lane.getBoundingClientRect(),offset=(e.clientX-rect.left)*axis/Math.max(1,rect.width)-start;
   var pointer=e.pointerId,x=e.clientX,y=e.clientY,ghost=null,destination=null,at=start;
   var compatible=new Map(),clips=require("$:/plugins/huwiki/musical/movement-clips.js");
   block.setPointerCapture(pointer);
   function drag(ev){
    if(ev.pointerId!==pointer||!ghost&&Math.hypot(ev.clientX-x,ev.clientY-y)<4)return;
    if(!ghost){ghost=el(doc,"span","huw-musical-motion-clip huw-activity-ghost",names[da?0:1],lane);ghost.setAttribute("aria-hidden","true");}
    var hit=doc.elementFromPoint(ev.clientX,ev.clientY),row=hit&&hit.closest("[data-layer-id]"),targetLane=row&&row.querySelector(".huw-musical-lane");
    destination=null;ghost.hidden=true;
    if(!targetLane||!rows.contains(row))return;
    var p=view.nodes[row.dataset.layerId],box=targetLane.getBoundingClientRect();
    if(!p||ev.clientX<box.left)return;
    if(!compatible.has(p.part.id))compatible.set(p.part.id,!!rig.fittedRig(view.scene.parts,p.part));
    if(!compatible.get(p.part.id))return;
    var fraction=(ev.clientX-box.left)/Math.max(1,box.width);
    at=round(lim(fraction*axis-offset,0,Math.max(0,axis-seconds)));
    if(Math.abs(ev.clientX-x)<2&&targetLane.getBoundingClientRect().left===rect.left)at=start;
    else{
     var nearest=Math.min(.20,6*axis/Math.max(1,box.width));
     (p.part.animusMoves||[]).forEach(function(other){
      if(other.id===move.id)return;
      [toFilm(other.end,Object.assign({},track,{part:p.part.id})),toFilm(other.start,Object.assign({},track,{part:p.part.id}))-seconds].forEach(function(edge){
       var d=Math.abs(edge-(fraction*axis-offset));if(edge>=0&&d<nearest){at=edge;nearest=d;}
      });
     });
    }
    destination=p.part.id;
    if(ghost.parentNode!==targetLane)targetLane.appendChild(ghost);ghost.hidden=false;
    position(ghost,at);
    var invalid=false;
    try{var span=movementInterval(view,destination,at,seconds);invalid=clips.overlaps(p.part.animusMoves||[],move.id,span.start,span.end);}
    catch(_outside){invalid=true;}
    ghost.classList.toggle("is-invalid",invalid);
   }
   function finish(ev,cancel){
    if(ev.pointerId!==pointer)return;
    if(!cancel)drag(ev);
    block.onpointermove=block.onpointerup=block.onpointercancel=block.onlostpointercapture=null;
    if(block.hasPointerCapture(pointer))block.releasePointerCapture(pointer);
    if(!ghost)return;
    ghost.remove();suppressClick=true;ev.stopPropagation();ev.preventDefault();
    if(cancel)return;
    if(!destination){status.textContent=movementError(Error("unbound"));return;}
    if(destination!==t.part||Math.abs(at-start)>.00001)moveActivity(view,original,t.part,move,destination,at,seconds);
   }
   block.onpointermove=drag;block.onpointerup=function(ev){finish(ev,false);};
   block.onpointercancel=block.onlostpointercapture=function(ev){finish(ev,true);};
  };
 }
 function rigControls(t){
  var ctx=partContext(t.part,o.view,playhead,[],true,0),root=ctx&&ctx.view.nodes[t.part].part;
  if(!root||!ctx.active)return;
  var rig=require("$:/plugins/huwiki/musical/skeleton.js"),scene=ctx.view.scene;
  if(!rig.fittedRig(scene.parts,root))return;
  var group=el(doc,"fieldset","huw-musical-rig-controls",undefined,inspector);el(doc,"legend","",da?"Bevægelsesbibliotek":"Motion library",group);
  function dropdown(name,options){
   var label=el(doc,"label","",name+" ",group),select=el(doc,"select","",undefined,label);
   options.forEach(function(opt){el(doc,"option","",opt[1],select).value=opt[0];});select.value=String(options[0][0]);return select;
  }
  var kind=dropdown(da?"Bevægelse":"Movement",Object.keys(rig.cycles).map(function(id){return [id,rig.cycles[id][da?0:1]];}));
  var dir=dropdown(da?"Retning":"Direction",[["1",da?"Mod højre":"Right"],["-1",da?"Mod venstre":"Left"],["0",da?"På stedet":"In place"]]);
  var tempo=dropdown("Tempo",[["1",da?"Normalt":"Normal"],["0.75",da?"Langsomt":"Slow"],["1.5",da?"Hurtigt":"Fast"]]);
  var count=dropdown(da?"Gentagelser":"Repeats",[1,2,3,4,6,8].map(function(v){return [v,v];}));
  var props=scene.parts.filter(function(p){return !p.parent&&(p["animus-category"]==="prop"||/^glitch-/.test(p.id));});
  var propMenu=dropdown(da?"Rekvisit":"Prop",[["",da?"Kun bevægelsen":"Gesture only"]].concat(props.map(function(p){return [p.id,p.name||p.id];})));
  propMenu.parentNode.hidden=true;
  function propChoice(){return kind.value==="pickup"&&props.find(function(p){return p.id===propMenu.value;})||null;}
  var track={kind:scene===film?"film-part":"part",part:t.part};
  var durationLabel=el(doc,"label","",da?"Samlet varighed (sek.) ":"Total duration (sec) ",group);
  var duration=el(doc,"input","huw-rig-duration",undefined,durationLabel);
  duration.type="number";duration.min=".01";duration.step="any";
  var clockRate=ctx.path.reduce(function(rate,edge){return rate*num(edge.settings.speed,1);},1);
  function presetDuration(){
   duration.value=String(round(Number(count.value)*rig.cycles[kind.value][2]/Number(tempo.value)/clockRate));
  }
  var fit=el(doc,"button","",da?"Til næste kontrolpunkt":"Fit to next keyframe",group);fit.type="button";
  function nextKey(){return keys(t).find(function(key){return key.t>playhead+1e-6;});}
  fit.onclick=function(){
   var next=nextKey();
   if(!next){status.textContent=da?"Der skal være et senere kontrolpunkt på figurens spor.":"Add a later keyframe on the figure track.";return;}
   duration.value=String(round(next.t-playhead));removePreview();
  };
  var timingOptions=el(doc,"details","huw-motion-timing",undefined,group);
  el(doc,"summary","",da?"Flere tidsvalg":"More timing options",timingOptions);
  timingOptions.appendChild(tempo.parentNode);timingOptions.appendChild(fit);
  presetDuration();
  function motionRate(){
   var seconds=Number(duration.value);
   if(!Number.isFinite(seconds)||seconds<.01||!(clockRate>0)){
    status.textContent=da?"Vælg en positiv varighed i en fremadgående scene.":"Choose a positive duration in a forward-playing scene.";
    return 0;
   }
   return Number(count.value)*rig.cycles[kind.value][2]/(seconds*clockRate);
  }
  var tryButton=el(doc,"button","",da?"Prøv bevægelsen":"Preview motion",group);tryButton.type="button";
  var sampleView=el(doc,"div","huw-rig-motion-preview",undefined,group);
  function removePreview(){sampleView.textContent="";if(replace)replace.hidden=true;}
  kind.onchange=tempo.onchange=count.onchange=function(){propMenu.parentNode.hidden=kind.value!=="pickup"||!props.length;presetDuration();removePreview();};
  dir.onchange=propMenu.onchange=duration.oninput=removePreview;
  tryButton.onclick=function(){
   removePreview();var ids=new Set([root.id]),members=[root];
   for(var i=0;i<members.length;i++)scene.parts.forEach(function(p){if(p.parent===members[i].id&&!ids.has(p.id)){ids.add(p.id);members.push(p);}});
   var now=partContext(t.part,o.view,playhead,[],true,0);if(!now||!now.active)return;
   var prop=propChoice();if(prop)members.push(prop);
   var copy=members.map(function(p){return Object.assign({},p,{keys:[Object.assign({t:0},Engine.state(p,now.time))]});});
   var rate=motionRate();if(!rate)return;
   var span=rig.cycles[kind.value][2]/rate,data;
   try{data=rig.sequence(copy,copy[0],0,kind.value,dir.value==="-1"?-1:1,1,span+.001,dir.value==="0",rate,prop?copy[copy.length-1]:null);}
   catch(err){if(err.message==="reach"){status.textContent=reachMessage();return;}status.textContent=da?"Kontrollér leddene og sæt kropsdelene fast på skelettet.":"Check the joints and attach artwork to the rig.";return;}
   data.forEach(function(keys,p){p.keys=keys;});
   var view=Engine.build(doc,o.wiki,{version:1,width:scene.width,height:scene.height,duration:span,parts:copy,background:"transparent"},false);
   sampleView.appendChild(view.svg);var bounds=[],node=view.nodes[root.id].el;
   for(var f=0;f<=8;f++){Engine.paint(view,span*f/8);var b=node.getBBox(),m=node.transform.baseVal.consolidate();
    if(!m)continue;[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].forEach(function(pt){var v=view.svg.createSVGPoint();v.x=pt[0];v.y=pt[1];bounds.push(v.matrixTransform(m.matrix));});}
   if(bounds.length){var xs=bounds.map(p=>p.x),ys=bounds.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);view.svg.setAttribute("viewBox",[x-8,y-8,Math.max(...xs)-x+16,Math.max(...ys)-y+16].join(" "));}
   var frameBox=view.svg.getAttribute("viewBox"),first=null;function tick(stamp){if(!group.contains(view.svg)||!inspector.contains(group))return;if(first===null)first=stamp;var elapsed=(stamp-first)/1000;Engine.paint(view,Math.min(span,elapsed));view.svg.setAttribute("viewBox",frameBox);if(elapsed<span)doc.defaultView.requestAnimationFrame(tick);}
   doc.defaultView.requestAnimationFrame(tick);
  };
  function reachMessage(){return movementError(Error("reach"));}
  var original=o.wiki.getTiddlerText(scene._title||(scene===film?o.sceneTitle:o.stageTitle),'');
  var add=el(doc,"button","",da?"Indsæt ved tidsmarkøren":"Insert at playhead",group);add.type="button";
  var replace=el(doc,"button","",da?"Brug bevægelsen her":"Use movement here",group);replace.type="button";replace.hidden=true;
  add.onclick=function(){insert(false);};replace.onclick=function(){insert(true);};
  function insert(coverKeys){
   replace.hidden=true;
   var seconds=Number(duration.value),prop=propChoice(),at=playhead;
   try{
    var span=movementInterval(ctx.view,t.part,at,seconds);
    writeMovement(ctx.view,original,Object.assign(span,{id:"rig-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8),
     sourceId:root.id,targetId:root.id,type:kind.value,recipe:{dir:Number(dir.value),repeats:Number(count.value),propId:prop&&prop.id},coverKeys:coverKeys}));
   }catch(error){
    if(error.message==="overlap"&&!coverKeys)replace.hidden=false;
    status.textContent=movementError(error);return;
   }
   choice.moveId=null;
   var following=partContext(t.part,o.view,at+seconds,[],true,0);
   if(following&&following.active&&following.view===ctx.view)o.seek(at+seconds);
   draw();o.repaint();
  }
  var picked=(root.animusMoves||[]).find(function(move){return move.id===choice.moveId;});
  if(picked){
   var edit=el(doc,"fieldset","huw-musical-rig-controls",undefined,inspector);
   inspector.insertBefore(edit,group);
   el(doc,"legend","",rig.cycles[picked.type][da?0:1],edit);
   var label=el(doc,"label","",da?"Klippets varighed (sek.) ":"Clip duration (sec) ",edit);
   var input=el(doc,"input","huw-rig-duration",undefined,label);
   input.type="number";input.min=".01";input.step="any";input.value=String(round((picked.end-picked.start)/clockRate));
   var apply=el(doc,"button","",da?"Gem varighed":"Save duration",edit);apply.type="button";
   apply.onclick=function(){
    moveActivity(ctx.view,original,root.id,picked,root.id,toFilm(picked.start,track),Number(input.value));
   };
   var start=el(doc,"label","",da?"Start (sek.) ":"Start (sec) ",edit);
   var when=el(doc,"input","huw-activity-start",undefined,start);when.type="number";when.step=".01";when.min="0";when.value=String(round(toFilm(picked.start,track)));
   var labelTarget=el(doc,"label","",da?"Figur ":"Figure ",edit),dest=el(doc,"select","huw-activity-target",undefined,labelTarget);
   scene.parts.filter(function(p){return !p.parent&&rig.fittedRig(scene.parts,p);}).forEach(function(p){el(doc,"option","",p.name||p.id,dest).value=p.id;});
   dest.value=root.id;
   var relocate=el(doc,"button","",da?"Flyt klip":"Move clip",edit);relocate.type="button";
   relocate.onclick=function(){moveActivity(ctx.view,original,root.id,picked,dest.value,Number(when.value),Number(input.value));};
   var next=el(doc,"button","",da?"Tilføj efter klippet":"Add after clip",edit);next.type="button";
   next.onclick=function(){o.seek(toFilm(picked.end,track));choose(t.id,0,true);};
  }
  var moves=root.animusMoves||[],toRemove=picked||moves[moves.length-1];
  if(toRemove){
   var caption=picked?(da?"Fjern dette klip":"Remove this clip"):(da?"Fjern seneste bevægelse":"Remove last movement");
   var undo=el(doc,"button","",caption+" · "+rig.cycles[toRemove.type][da?0:1],picked?edit:group);undo.type="button";
   undo.onclick=function(){
    try{writeMovement(ctx.view,original,{sourceId:root.id,remove:true,id:toRemove.id});}
    catch(error){status.textContent=movementError(error);return;}
    choice.moveId=null;draw();o.repaint();
   };
  }
 }
 function drawForm(){inspector.textContent="";var t=track(),k=selected();
  if(!t){el(doc,'p','huw-musical-inspector-help',da?'Ingen markering. Vælg en figur, kropsdel eller et spor.':ui('Nothing selected. Choose a character, body part or track.'),inspector);return;}
  var kindNames={"figure":da?"Hele objekt":ui("Whole object"),"animation":da?"Animationsklip":ui("Animation clip"),
   "song":da?"Musikklip":ui("Music clip"),"part":da?"Kulisse / del":ui("Scenery / part"),
   "film-part":da?"Sceneobjekt / rekvisit":ui("Stage object / prop"),"camera":da?"Kamera":ui("Camera"),
   "motion":da?"Ledbevægelse":ui("Limb motion"),"accent":da?"Bevægelsesaccent":ui("Motion accent"),"face":da?"Ansigtsudtryk og autosync":ui("Face expressions and autosync"),
   "audio-fx":da?"Audioeffekter":ui("Audio effects"),"light":da?"Lys":ui("Lighting"),"sfx":da?"MIDI-effekt":ui("MIDI effect"),"cut":da?"Kameraklip":ui("Camera cut"),
   "captions":da?"Undertekster":ui("Captions"),"scene-range":da?"Scene":ui("Scene"),"object-browser":da?"Objektvælger":ui("Object picker")};
  el(doc,"span","huw-musical-inspector-type",kindNames[t.kind]||(da?"Egenskaber":ui("Properties")),inspector);
  el(doc,"strong","huw-musical-inspector-selection",t.name,inspector);
  if(t.kind==="figure")rigControls(t);
  var explanation=t.kind==="figure"?(da?"Flyt, drej, skalér eller skævvrid hele objektet. Ændringer kan gemmes som nøglebilleder; dukkeleddene bevares.":ui("Move, rotate, scale or skew the whole object. Changes are keyframed; the puppet joints are preserved.")):
   t.kind==="animation"?(da?"Du redigerer bevægelsesklippets tid og gentagelse – ikke figurens størrelse. Dobbeltklik på klippet for ledbevægelser.":ui("You are editing the clip timing and repetition, not the whole figure's size. Double-click the clip for limb motion.")):
   t.kind==="song"?(da?"Her redigeres musikklippets start, fade, lydstyrke og mute. Dobbeltklik på klippet for at åbne ABC.":ui("Edit the music clip's start, fades, volume and mute. Double-click the clip to open ABC.")):
   t.kind==="camera"?(da?"Kameraets udsnit og nøglebilleder. Træk den stiplede kameraramme for at panorere, zoome eller dreje.":ui("Camera framing and keyframes. Drag the dashed camera frame to pan, zoom or rotate.")):
   t.kind==="film-part"||t.kind==="part"?(da?"Redigér den valgte kulisse eller rekvisit. SVG-knappen åbner dens tegning og lag.":ui("Edit the selected scenery or prop. Open its drawing and layers with the SVG button.")):
   t.kind==="motion"?(da?"Dette punkt ændrer én del af figurens bevægelsesløkke.":ui("This point changes one part of the figure's motion loop.")):
   t.kind==="sfx"?(da?"Træk et lydklip for at flytte det, eller træk i højre kant for at ændre varigheden.":ui("Drag a sound clip to move it, or drag its right edge to change its duration.")):"";
  if(explanation)el(doc,"p","huw-musical-inspector-help",explanation,inspector);
  if(t.kind==="sfx"||t.kind==="audio-fx"||t.kind==="audio"&&recordedFx(k)){fxForm(t,k);return;}
  if(t.kind==='face'){
   el(doc,'p','huw-musical-inspector-help',da?'Valgene gælder fra nøglebilledet og frem for denne figur, også i senere scener. Mundvalg forbedrer autosync for den valgte bogstavgruppe.':ui('Choices apply from this keyframe onwards for this character, including later scenes. Mouth choices update autosync for the selected letter group.'),inspector);
   if(k){el(doc,'p','huw-musical-face-key-description',faceKeyLabel(k),inspector);formNumber(k,L.time,'t',.05,0,axisDuration());}
   var faceActions=el(doc,'div','huw-musical-key-actions',undefined,inspector);
   var faceOpen=el(doc,'button','huw-musical-open-face',da?'Ansigtsværksted':ui('Face workshop'),faceActions);faceOpen.type='button';faceOpen.onclick=function(){if(o.onEditFace)o.onEditFace({actorId:t.actorId,time:playhead});};
   var faceDelete=el(doc,'button','',L.remove,faceActions);faceDelete.type='button';faceDelete.disabled=!k;faceDelete.onclick=function(){removePoint(t);};
   var faceUndoButton=el(doc,'button','huw-musical-undo-face',da?'Fortryd ansigtsvalg':ui('Undo face choice'),faceActions);faceUndoButton.type='button';faceUndoButton.disabled=!faceUndo.length;faceUndoButton.onclick=undoFace;return;
  }
  if(t.kind==="captions"){
   el(doc,"p","huw-musical-preview-note",da?"Øjet skjuler kun undertekster i editoren. Videoens undertekster vælges ved eksport.":ui("The eye hides captions only in the editor. Choose the video's captions when exporting."),inspector);
   if(k){el(doc,"p","huw-musical-caption-text",String(k.part.text||k.text),inspector);el(doc,"p","huw-musical-song-info",round(k.start)+"–"+round(k.end)+" s · "+k.sceneTitle,inspector);}
   if(o.onEditCaptions){var captionButton=el(doc,"button","huw-musical-edit-captions",da?"Åbn manuskript og undertekster":ui("Open manuscript and captions"),inspector);captionButton.type="button";captionButton.onclick=function(){o.onEditCaptions(k?{partId:k.partId,sceneTitle:k.sceneTitle,time:k.start}:{});};}
   return;
  }
  if(t.kind==="scene-range"){
   var sceneButton=el(doc,'button','huw-musical-edit-scenes',da?'Redigér scener og rækkefølge':ui('Edit scenes and order'),inspector);sceneButton.type='button';sceneButton.onclick=function(){if(o.onEditScenes)o.onEditScenes();};return;}
  if(t.kind==='audio-lane'||t.kind==='audio'){
   var audioButton=el(doc,'button','huw-musical-edit-audio',da?'Åbn lydværksted':ui('Open audio workshop'),inspector);audioButton.type='button';audioButton.onclick=function(){if(o.onEditAudio)o.onEditAudio(k?{clipId:k.id}:{});};
   if(k){formNumber(k,L.start,'start',.1,0,21600);
    if(recordedFx(k)){
     fxLevel(k,"volume",da?"Lydstyrke":ui("Volume"),1);fxLevel(k,"reverb",da?"Rumklang":ui("Reverb"),0);
     formNumber(k,da?"Varighed (sek.)":ui("Duration (sec)"),"duration",.05,.02,Math.max(.02,(k.sourceDuration||film.duration)-num(k.offset,0)));
    }else formNumber(k,da?'Lydstyrke (0–1)':ui('Volume (0–1)'),'volume',.05,0,1);
    el(doc,'p','huw-musical-song-info',(k.role?k.role+' · ':'')+(k.text||k.name||'')+' · '+round(k.duration)+'s',inspector);
    var muteAudio=el(doc,'button','',k.muted?(da?'Slå lyd til':ui('Unmute')):(da?'Slå lyd fra':ui('Mute')),inspector);muteAudio.type='button';muteAudio.onclick=function(){k.muted=!k.muted;save(t);if(o.onAudioChange)o.onAudioChange(m.audioClips);draw();};
   }return;
  }
  if(t.kind==="song"){drawSongForm();return;}
  if(t.kind==="animation"){
   if(!k){el(doc,"p","",L.empty,inspector);return;}
   var hint=da?"Bevægelsesklip: ét mønster gentages i takt med ABC-tempoet. Klik klippet for at åbne dets indre nøglepunkter.":ui("Motion clip: one pattern repeats in time with the ABC tempo. Open the clip to edit its inner keyframes.");
   el(doc,"p","huw-musical-song-info",hint,inspector);
   if(t.target){var whole=el(doc,"button","huw-musical-select-whole",da?"↗ Vælg hele figuren":ui("↗ Select whole figure"),inspector);
    whole.type="button";whole.onclick=function(){selectFigure(t.target);};}
   formText(k,L.name,"name",function(value){t.name=value||k.id;});
   formNumber(k,L.start||"Start (s)","start",.25,0,film.duration);
   formNumber(k,da?"Varighed (sek.)":ui("Duration (sec)"),"duration",.25,.25,film.duration);
   formNumber(k,da?"Sløjfelængde (fjerdedelsslag)":ui("Loop length (quarter beats)"),"beatsPerLoop",1,1,64);
   formNumber(k,da?"Bevægelseshastighed":ui("Motion rate"),"rate",.25,.25,4);
   var loopLabel=el(doc,"label","huw-musical-property",undefined,inspector),check=el(doc,"input","",undefined,loopLabel);
   check.type="checkbox";check.checked=k.loop!==false;
   el(doc,"span","",da?"Gentag bevægelse":ui("Repeat motion"),loopLabel);
   check.onchange=function(){k.loop=check.checked;save(t);draw();o.repaint();};
   var button=el(doc,"button","huw-musical-clip-expand",expandedClipId===t.id?(da?"Skjul bevægelsens keyframes":ui("Hide motion keyframes")):(da?"Åbn bevægelsesmønster":ui("Open motion pattern")),inspector);
   button.type="button";button.onclick=function(){expandedClipId=expandedClipId===t.id?"":t.id;draw();};
   el(doc,"p","huw-musical-song-info",da?"Solobevægelser tilføjes som separate accent-keyframes ved afspilningspositionen.":ui("Solo accents can be added as separate keyframes at the current playhead."),inspector);
   var accentBtn=el(doc,"button","huw-musical-add-accent",da?"+ Solobevægelse":ui("+ Solo accent"),inspector);
   accentBtn.type="button";accentBtn.onclick=function(){newPoint(t,playhead);};
   return;
  }
  var actions=el(doc,"div","huw-musical-key-actions",undefined,inspector),add=el(doc,"button","",L.add,actions),del=el(doc,"button","",L.remove,actions);
  add.type=del.type="button";add.onclick=function(){newPoint(t,playhead);};
  del.disabled=!k||(t.kind==="motion"&&(choice.key===0||choice.key===keys(t).length-1));del.onclick=function(){removePoint(t);};
  if(!k){el(doc,"p","",L.empty,inspector);return;}
  formNumber(k,t.kind==="motion"?(da?"Slag i løkken":ui("Beat in loop")):(da?"Kontrolpunktets tid (sek.)":ui("Keyframe time (sec)")),
   "t",t.kind==="motion"?.25:.05,0,t.kind==="motion"?num(animation(t).beatsPerLoop,8):film.duration);
  if(t.kind==="motion"){
   formNumber(k,L.x,"x",1,-10000,10000);formNumber(k,L.y,"y",1,-10000,10000);formNumber(k,L.r,"r",1,-3600,3600);
   formNumber(k,L.opacity,"opacity",.05,0,1);formNumber(k,"Scale X","sx",.05,.01,16);formNumber(k,"Scale Y","sy",.05,.01,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="accent"){
   formNumber(k,L.x,"x",1,-1000,1000);formNumber(k,L.y,"y",1,-1000,1000);formNumber(k,L.r,"r",1,-360,360);
  }else if(t.kind==="part"||t.kind==="film-part"){
   var item=part(t),location=t.kind==='film-part'?{view:o.view}:partContext(t.part,o.view,playhead,[],true,0),appearanceScene=location&&location.view.scene;
   if(item){
    formText(item,L.name,"name",function(value){t.name=value||t.part;});
    if(typeof item.fill==="string"&&/^#[0-9a-f]{6}$/i.test(item.fill)){
     var colorLabel=el(doc,"label","huw-musical-property",undefined,inspector);
     el(doc,"span","",L.color,colorLabel);var color=el(doc,"input","huw-musical-color-input",undefined,colorLabel);
     color.type="color";color.value=item.fill;
     color.onchange=function(){
      item.fill=color.value;paintPartAppearance(appearanceScene,t.part,'fill',item.fill);
      save(t);o.repaint();
     };
    }
    if(item.type==="text")formText(item,L.text,"text",function(value){paintPartAppearance(appearanceScene,t.part,'text',value);});
    // Props and scenery use exactly the same lightweight SVG layer editor as puppets.
    var drawVisual=el(doc,"button","huw-musical-edit-svg",da?"✎ SVG-lag / rekvisit":ui("✎ SVG layers / prop"),inspector);
    drawVisual.type="button";drawVisual.onclick=function(){
     if(o.pause)o.pause();
     var SvgLayers=optionalSvgLayers();
     if(!SvgLayers){status.textContent=da?"SVG-lagværkstedet mangler i denne betaversion. Musik og forestilling fungerer stadig.":ui("The SVG layer workshop is unavailable in this beta. Music and the show still work.");return;}
     var destination=t.kind==='film-part'?film:sceneForPart(item.id,o.view,0)||source;if(!destination)return;
     SvgLayers.open({doc:doc,wiki:o.wiki,host:o.host,part:item,duration:destination.duration||film.duration,da:da,onSave:function(layers,settings){
      destination.parts=destination.parts||[];
      SvgLayers.applyToParts(destination.parts,item,layers,settings);
      save(t);if(o.reload)o.reload();else{o.repaint();draw();}return true;
     }});
    };
   }
   formNumber(k,L.x,"x",1,-10000,10000);formNumber(k,L.y,"y",1,-10000,10000);formNumber(k,L.r,"r",1,-3600,3600);
   formNumber(k,L.opacity,"opacity",.05,0,1);formNumber(k,"Scale X","sx",.05,.01,16);formNumber(k,"Scale Y","sy",.05,.01,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="figure"){
   formNumber(k,L.x,"x",1,-5000,5000);formNumber(k,L.y,"y",1,-5000,5000);
   formNumber(k,L.r,"r",1,-360,360);formNumber(k,"Skew X","skewX",1,-35,35);
   formNumber(k,"Skew Y","skewY",1,-35,35);formNumber(k,"Scale X","sx",.05,.05,16);
   formNumber(k,"Scale Y","sy",.05,.05,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="camera"){
   formText(k,L.name,"label");
   formNumber(k,L.x,"x",1,-5000,5000);formNumber(k,L.y,"y",1,-5000,5000);formNumber(k,L.zoom,"zoom",.1,.25,16);
   formNumber(k,L.r,"r",1,-360,360);formNumber(k,"Skew X","skewX",1,-35,35);
   formNumber(k,"Skew Y","skewY",1,-35,35);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="light")formNumber(k,L.intensity,"intensity",.05,0,1);
  else if(t.kind==="cut")formSelect(k,L.camera,"camera",[["A",L.cameraA],["B",L.cameraB]]);
 }
 function rulerCursor(lane,mode){
  var cursor=el(doc,"span","huw-musical-lane-cursor huw-musical-ruler-cursor",undefined,lane);
  cursor.dataset.cursorMode=mode;cursor.setAttribute("aria-hidden","true");
  var clip=activeDetail(),phase=mode==="beat"&&clip?Motion.phase(clip,playhead,o.beatClock&&o.beatClock()):0;
  cursor.style.display=phase===null?"none":"";
  cursor.style.left=(mode==="beat"&&clip?100*phase/Math.max(.125,num(clip.beatsPerLoop,8)):100*playhead/axisDuration())+"%";
  playheads.push(cursor);
 }
 function revealPlayhead(){
  var cursor=rows.querySelector('.huw-musical-ruler-cursor[data-cursor-mode="seconds"]');
  if(!cursor||rows.scrollWidth<=rows.clientWidth)return;
  var left=cursor.parentNode.previousElementSibling.getBoundingClientRect().right;
  var right=rows.getBoundingClientRect().right,x=cursor.getBoundingClientRect().left;
  if(x<left+5)rows.scrollLeft+=x-left-12;
  else if(x>right-5)rows.scrollLeft+=x-right+12;
 }
 function drawDetail(){
  var clip=activeDetail();if(!clip)return;
  clipTitle.textContent=displayName(clip.name||clip.id);
  clipMeta.textContent=(da?"Bevægelsesløkke · ":ui("Motion loop · "))+round(num(clip.beatsPerLoop,8))+
   (da?" slag · følger ABC-tempoet":ui(" beats · follows ABC tempo"));
  var span=Math.max(.125,num(clip.beatsPerLoop,8));
  var rule=el(doc,"div","huw-musical-timeline-ruler huw-musical-detail-ruler",undefined,rows);
  el(doc,"span","huw-musical-ruler-label",da?"Slag i løkken":ui("Beats in loop"),rule);
  var ruleLane=el(doc,"div","huw-musical-ruler-lane",undefined,rule);
  for(var i=0;i<=span;i++){
   var tick=el(doc,"span","huw-musical-ruler-tick",i===span?"↻":String(i+1),ruleLane);
   tick.style.left=(100*i/span)+"%";
  }
  rulerCursor(ruleLane,"beat");
  ruleLane.onclick=function(ev){var box=ruleLane.getBoundingClientRect();
   var fraction=lim((ev.clientX-box.left)/Math.max(1,box.width),0,1);
   o.seek(animationTime(clip,round(fraction*span)));
  };
  Object.keys(clip.motion||{}).forEach(function(partId){
   var t=detailTrack(clip,partId),row=el(doc,"div","huw-musical-track huw-musical-detail-track",undefined,rows);
   row.dataset.trackId=t.id;row.dataset.group="animation";
   if(choice.id===t.id)row.classList.add("is-selected");
   var caption=el(doc,"div","huw-musical-lane-title",t.name,row);
   caption.onclick=function(){choose(t.id,0);};addPreviewControl(caption,row,t);
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
    dot.setAttribute("aria-label",t.name+" · "+round(k.t)+" "+(da?"slag":ui("beats")));
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
  el(doc,"span","huw-musical-ruler-label",da?"Solo · sekunder":ui("Solo · seconds"),soloRule);
  var soloRuleLane=el(doc,"div","huw-musical-ruler-lane",undefined,soloRule);
  var duration=axisDuration(),step=duration>60?10:5;
  for(var second=0;second<=duration;second+=step){
   var tick=el(doc,"span","huw-musical-ruler-tick",second+"s",soloRuleLane);
   tick.style.left=(100*second/duration)+"%";
  }
  rulerCursor(soloRuleLane,"seconds");
  soloRuleLane.onclick=function(ev){var box=soloRuleLane.getBoundingClientRect();
   o.seek((ev.clientX-box.left)/Math.max(1,box.width)*duration);
  };
  var accent=map["accent:"+clip.id],soloRow=el(doc,"div","huw-musical-track huw-musical-detail-track",undefined,rows);
  soloRow.dataset.group="animation";soloRow.dataset.trackId=accent.id;
  if(choice.id===accent.id)soloRow.classList.add("is-selected");
  var soloTitle=el(doc,"div","huw-musical-lane-title",da?"Solobevægelser":ui("Solo accents"),soloRow);
  soloTitle.onclick=function(){choose(accent.id,0);};addPreviewControl(soloTitle,soloRow,accent);
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
 function currentStage(){var v=o.view,time=playhead;for(var depth=0;depth<16&&v.clips&&v.clips.length;depth++){
   var at=Engine.clipAt(v.scene.scenes||[],time),clip=v.clips[at.index];if(!clip||!clip.view)break;
   time=Engine.localTime(at.time,clip.duration,clip.settings);v=clip.view;
  }return v;
 }
 function openLayers(){if(!layerPanel)layerPanel=require('$:/plugins/huwiki/musical/layer-order.js').mount(Object.assign({},o,{position:function(){return playhead;},onSelect:selectFigure,onChange:draw}));layerPanel.open();}
 function foldButton(title,t,key,expanded,toggle){var fold=el(doc,'button','huw-musical-group-fold',expanded?'▾':'▸',title);fold.type='button';fold.dataset.foldKey=key;
  fold.setAttribute('aria-expanded',String(expanded));fold.setAttribute('aria-label',(expanded?(da?'Fold sammen: ':ui('Collapse: ')):(da?'Fold ud: ':ui('Expand: ')))+t.name);
  title.insertBefore(fold,title.firstChild);fold.onpointerdown=function(e){e.stopPropagation();};fold.onkeydown=function(e){e.stopPropagation();};
  fold.onclick=function(e){e.preventDefault();e.stopPropagation();var scroll=rows.scrollTop;toggle();draw();rows.scrollTop=scroll;var next=Array.prototype.find.call(rows.querySelectorAll('[data-fold-key]'),function(b){return b.dataset.foldKey===key;});if(next)next.focus({preventScroll:true});};
 }
 function stageTracks(view){
  var parts=view.scene.parts||[],by={},children={},result=[],seen={};parts.forEach(function(p){by[p.id]=p;(children[p.parent||'']||(children[p.parent||'']=[])).push(p);});
  function sourceTrack(p){var t=tracks.find(function(t){return (t.kind==='part'||t.kind==='film-part')&&t.part===p.id;});
   if(!t){t={id:'part:'+p.id,kind:view.scene===film?'film-part':'part',part:p.id,name:displayName(p.name||p.id)};tracks.push(t);map[t.id]=t;}return t;
  }
  function visit(p,depth,owner){if(seen[p.id])return;seen[p.id]=true;var t=depth?sourceTrack(p):ensureFigureTrack(p.id,true),nested=children[p.id]||[],key=(view.scene._title||view.scene.id||'')+':'+p.id;
   var extra=depth?[]:tracks.filter(function(c){return c.kind==='face'&&c.actorId===p.id||c.kind==='animation'&&c.target===p.id;});
   result.push(Object.assign({},t,{name:displayName(p.name||p.id),layerRoot:!depth,layerOwner:owner,depth:depth,foldKey:key,foldable:nested.length>0||extra.length>0||!depth,expanded:!!groupExpanded[key]}));
   if(!groupExpanded[key])return;
   if(!depth){var base=sourceTrack(p);result.push(Object.assign({},base,{name:da?'Bevægelse i scenen':ui('Scene motion'),depth:1,layerOwner:owner}));}
   extra.forEach(function(c){result.push(Object.assign({},c,{depth:depth+1,layerOwner:owner}));});
   nested.forEach(function(child){visit(child,depth+1,owner);});
  }
  (children['']||[]).slice().reverse().filter(function(p){return !p.lipSync&&!captionCues.some(function(c){return c.part===p||c.sceneTitle===view.scene._title&&c.partId===p.id;});}).forEach(function(p){visit(p,0,p.id);});
  return result;
 }
 function draw(){if(disposeLayerDrag)disposeLayerDrag();disposeLayerDrag=null;var oldScroll=rows.scrollTop;rows.textContent="";playheads=[];previewControls=[];
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
  rulerCursor(ruleLane,"seconds");
  ruleLane.onclick=function(ev){
   var rect=ruleLane.getBoundingClientRect(),fraction=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
   o.seek(toAudio(fraction*axis));
  };
  var active=currentStage(),sceneText=o.wiki.getTiddlerText(active.scene._title||(active.scene===film?o.sceneTitle:o.stageTitle),'');groupScene=active.scene;var visual=stageTracks(active),layerIds=visual.filter(function(t){return t.layerRoot;}).map(function(t){return t.part;});
  var all=tracks.filter(function(t){return t.kind==='scene-range'||t.kind==='object-browser';}).concat(visual)
   .concat(tracks.filter(function(t){return ['song','scene-range','object-browser','figure','part','face','animation'].indexOf(t.kind)<0&&!(t.kind==='film-part'&&active.scene===film);}))
   .concat(musicLanes()).filter(function(t){return filter==='all'||group(t)===filter;});
  all.forEach(function(t){
   var row=el(doc,"div","huw-musical-track",undefined,rows);
   row.dataset.group=group(t);row.dataset.trackId=t.id;
   if(t.layerRoot){row.classList.add('huwrep-order-row','huw-musical-figure-group');row.dataset.layerId=t.part;}
   if(t.depth){row.classList.add('huw-musical-group-child');row.style.setProperty('--group-depth',String(t.depth));}
   if(t.layerOwner)row.dataset.layerOwner=t.layerOwner;
   if(t.id===choice.id||(t.kind==="song-lane"&&m.songs.some(function(s){return s.lane===t.lane&&choice.id==="song:"+s.id;})))row.classList.add("is-selected");
   var title=el(doc,"div","huw-musical-lane-title",t.name,row);
   var selectableObject=!!(t.kind==="figure"||t.kind==="animation"||t.kind==="part"||t.kind==="film-part"||t.kind==="camera"||t.kind==='face');
   if(selectableObject){title.setAttribute('role','button');title.setAttribute('tabindex','0');
    title.setAttribute('aria-label',(da?'Markér på scenen: ':ui('Select on stage: '))+t.name);
    title.title=da?'Klik eller dobbeltklik for at markere objektet på scenen':ui('Click or double-click to select the object on stage');
    title.classList.add('huw-musical-select-object-title');
   }
   function selectTrackTitle(){if(t.kind==='figure')ensureFigureTrack(t.part);if(t.kind==="song-lane"){
    var candidate=m.songs.find(function(s){return s.lane===t.lane&&playhead>=s.start&&playhead<s.start+s.duration;})||m.songs.find(function(s){return s.lane===t.lane;});
    if(candidate)choose("song:"+candidate.id,0);
   }else{
    choose(t.id,0);
    // If the track belongs to another act/scene, navigate to its own clip.
    // Otherwise the object is correctly selected but not currently on stage,
    // which makes its dashed frame appear broken to the user.
    var targetClip=t.kind==='animation'?animation(t):t.kind==='figure'?m.animationClips.find(function(c){return c.target===t.part;}):null;
    if(targetClip){var range=clipRange(targetClip);
     if(playhead<range.start||playhead>=range.end)o.seek(Math.min(range.end-.01,range.start+.05));
    }
   }}
   title.onclick=selectTrackTitle;
   if(selectableObject){
    title.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();selectTrackTitle();};
    title.onkeydown=function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectTrackTitle();}};
   }
   addPreviewControl(title,row,t);
   if(t.foldable)foldButton(title,t,t.foldKey,t.expanded,function(){groupExpanded[t.foldKey]=!groupExpanded[t.foldKey];});
   if(t.layerRoot){var handle=el(doc,'button','huwrep-order-handle','⠿',title);handle.type='button';handle.setAttribute('aria-label',(da?'Flyt lag: ':ui('Move layer: '))+t.name);handle.title=da?'Træk op for at flytte frem, ned for at flytte bagud':ui('Drag up to bring forward, down to send back');title.insertBefore(handle,title.firstChild);handle.onclick=function(e){e.stopPropagation();};}
   var lane=el(doc,"div","huw-musical-lane",undefined,row);
   if(map[t.id]||t.kind==="figure"){
    function openProperties(target){
     var clip=target.closest("[data-rig-move]"),point=target.closest("[data-key-index]");
     var index=point?Number(point.dataset.keyIndex):choice.id===t.id?choice.key:0;
     if(clip)o.seek(Number(clip.dataset.start));
     choose(t.id,index,true,clip&&clip.dataset.rigMove);
    }
    installPropertyGesture(row,openProperties);

   }
   if(t.kind==="figure"){
    var rigStage=currentStage(),scenePart=rigStage.nodes&&rigStage.nodes[t.part]&&rigStage.nodes[t.part].part;
    (scenePart&&scenePart.animusMoves||[]).forEach(function(move){drawActivity(lane,rigStage,sceneText,t,move,axis);});
   }
   lane.onclick=function(ev){
    if(ev.target.closest&&ev.target.closest(".huw-musical-key,.huw-musical-song-clip,.huw-musical-fx-clip,.huw-musical-caption-clip"))return;
    var rect=lane.getBoundingClientRect(),u=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
    // Tapping a lane navigates the show; it should not rebuild the entire
    // timeline and inspector just because the user scrubbed on a touch screen.
    o.seek(toAudio(u*axis));
   };
   if(t.kind==="sfx"||t.kind==="audio-fx"){
    row.classList.add("huw-musical-effects-track");row.classList.toggle("is-collapsed",!effectExpanded[t.id]);
    var fold=el(doc,"button","huw-musical-fx-fold",effectExpanded[t.id]?"▾":"▸",title);fold.type="button";fold.setAttribute("aria-expanded",String(!!effectExpanded[t.id]));
    fold.title=(effectExpanded[t.id]?(da?"Klap sammen: ":ui("Collapse: ")):(da?"Fold ud: ":ui("Expand: ")))+t.name;fold.setAttribute("aria-label",fold.title);
    fold.onclick=function(ev){ev.preventDefault();ev.stopPropagation();effectExpanded[t.id]=!effectExpanded[t.id];draw();};
    var addFx=el(doc,"button","huw-musical-fx-add","+",title);addFx.type="button";
    addFx.title=da?"Åbn effektbibliotek":ui("Open effect library");addFx.setAttribute("aria-label",addFx.title+": "+t.name);
    addFx.onclick=function(ev){ev.stopPropagation();openEffects(t,null);};
    var ends=[],minimumSpan=21*axis/Math.max(1,lane.clientWidth||800),allFx=t.kind==="sfx"?m.sfx.slice():m.audioClips.filter(recordedFx);
    function fxStart(c){return recordedFx(c)?c.start:c.t;}
    allFx.sort(function(a,b){return fxStart(a)-fxStart(b);}).forEach(function(k){
     var start=fxStart(k),level=effectExpanded[t.id]?clipLevel(ends,start,Math.max(minimumSpan,num(k.duration,1))):0;
     fxBlock(lane,t,k,m.sfx.indexOf(k),axis,level);
    });
    lane.style.minHeight=effectExpanded[t.id]?Math.max(32,ends.length*27+5)+"px":"30px";
   }else if(t.kind==="object-browser"){
    lane.classList.add("huw-musical-object-lane");
    // This single compact lane is a fast selector for *untracked* props and
    // scenery as well as puppets. It does not create 40 extra timeline rows.
    function activeRoots(v,depth){if(!v||depth>16)return [];
     var result=[];
     (v.clips||[]).some(function(c){if(c.view&&(!c.el||c.el.getAttribute('display')!=='none')){
      var child=activeRoots(c.view,depth+1);if(child.length){result=child;return true;}}
      return false;});
     if(result.length)return result;
     var parts=v.scene&&v.scene.parts||[];
     return parts.filter(function(p){return !p.parent&&p.id;}).map(function(p){return {id:p.id,name:displayName(p.name||p.id)};});
    }
    var picker=el(doc,'select','huw-musical-object-picker',undefined,lane);
    picker.setAttribute('aria-label',da?'Vælg figur eller rekvisit på scenen':ui('Select figure or prop on stage'));
    function populateObjects(){var objects=activeRoots(o.view,0),selected=picker.value;
     picker.textContent='';var hint=el(doc,'option','',da?'Vælg figur, rekvisit eller kulisse…':ui('Select figure, prop or scenery…'),picker);hint.value='';
     objects.forEach(function(obj){var op=el(doc,'option','',obj.name,picker);op.value=obj.id;});
     if(selected&&objects.some(function(obj){return obj.id===selected;}))picker.value=selected;
    }
    picker.addEventListener('focus',populateObjects);
    picker.addEventListener('pointerdown',populateObjects);
    picker.onchange=function(ev){ev.stopPropagation();if(picker.value)selectFigure(picker.value);};
    picker.onclick=function(ev){ev.stopPropagation();};
    title.onclick=function(){populateObjects();picker.focus();};
    title.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();populateObjects();picker.focus();};
    populateObjects();
    var layersButton=el(doc,'button','huw-musical-layers-button',da?'Lag ↕':ui('Layers ↕'),lane);layersButton.type='button';layersButton.onclick=function(ev){ev.stopPropagation();openLayers();};
   }else if(t.kind==="captions"){
    captionCues.forEach(function(cue,index){
     var b=el(doc,"button","huw-musical-caption-clip",displayName(String(cue.part.text||cue.text)),lane);b.type="button";
     b.dataset.captionRole=cue.role;b.dataset.captionId=cue.id;
     b.style.left=(100*cue.start/axis)+"%";b.style.width=(100*Math.max(.03,cue.end-cue.start)/axis)+"%";
     b.title=displayName(String(cue.part.text||cue.text))+" · "+round(cue.start)+"–"+round(cue.end)+"s";b.setAttribute("aria-label",b.title);
     b.classList.toggle("is-selected",choice.id==="captions"&&choice.key===index);
     b.onclick=function(ev){ev.stopPropagation();if(o.pause)o.pause();choose("captions",index);o.seek(Math.min(cue.end-.001,cue.start+.01));};
     b.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();if(o.onEditCaptions)o.onEditCaptions({partId:cue.partId,sceneTitle:cue.sceneTitle,time:cue.start});};
    });
   }else if(t.kind==='audio-lane'){
    row.classList.add('huw-musical-audio-track');row.classList.toggle('is-collapsed',!audioExpanded);
    foldButton(title,t,'audio-lane',audioExpanded,function(){audioExpanded=!audioExpanded;});
    var recordingEnds=[],minimumRecording=18*axis/Math.max(1,lane.clientWidth||800);
    var recordings=m.audioClips.filter(function(c){return !recordedFx(c);});
    if(!audioExpanded){
     var overview=doc.createElementNS(NS,'svg');overview.setAttribute('viewBox','0 0 1000 36');overview.setAttribute('preserveAspectRatio','none');overview.setAttribute('aria-hidden','true');overview.setAttribute('class','huw-musical-audio-overview');lane.appendChild(overview);
     var bars=doc.createElementNS(NS,'path');bars.setAttribute('d',recordings.map(function(c){return 'M'+round(1000*c.start/axis)+' 23h'+round(Math.max(.5,1000*c.duration/axis));}).join(' '));overview.appendChild(bars);
     el(doc,'span','huw-musical-audio-count',recordings.length+(da?' klip':ui(' clips')),lane);
    }else recordings.sort(function(a,b){return a.start-b.start;}).forEach(function(c){
     var b=el(doc,'button','huw-musical-recorded-clip',(c.role?displayName(c.role)+': ':'')+displayName(c.name||c.text||(da?'Lyd':ui('Audio'))),lane);b.type='button';
     var level=audioExpanded?clipLevel(recordingEnds,c.start,Math.max(minimumRecording,c.duration)):0;
     if(!audioExpanded){b.tabIndex=-1;b.setAttribute('aria-hidden','true');}
     b.style.top=(8+32*level)+'px';
     b.style.left=(100*c.start/axis)+'%';b.style.width=(100*Math.max(.1,c.duration)/axis)+'%';b.classList.toggle('is-muted',!!c.muted);b.setAttribute('aria-pressed',String(choice.id==='audio:'+c.id));
     b.title=displayName(c.name||(da?'Lyd':ui('Audio')))+' · '+round(c.start)+'–'+round(c.start+c.duration)+'s';
     b.onclick=function(ev){ev.stopPropagation();var now=Date.now(),last=lastClipTap,isDouble=last&&last.id==='audio:'+c.id&&now-last.time<480&&Math.abs(ev.clientX-last.x)<30&&Math.abs(ev.clientY-last.y)<30;
      lastClipTap=isDouble?null:{id:'audio:'+c.id,time:now,x:ev.clientX,y:ev.clientY};
      // Keep the selected clip under the pointer during the second click.
      if(choice.id!=='audio:'+c.id)choose('audio:'+c.id,0);
      if(Math.abs(playhead-c.start)>.0001)o.seek(c.start);
      if(isDouble&&o.onEditAudio)o.onEditAudio({clipId:c.id});};
     b.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();if(o.onEditAudio)o.onEditAudio({clipId:c.id});};
     b.onkeydown=function(ev){if(ev.key==='Enter'){ev.preventDefault();if(o.onEditAudio)o.onEditAudio({clipId:c.id});}};
     b.onpointerdown=function(ev){if(!audioExpanded)return;if(ev.button!==undefined&&ev.button!==0)return;ev.stopPropagation();var rect=lane.getBoundingClientRect(),x=ev.clientX,start=c.start,moved=false;
      if(b.setPointerCapture)b.setPointerCapture(ev.pointerId);
      function move(e){var dx=e.clientX-x;if(!moved&&Math.abs(dx)<4)return;if(!moved&&o.pause)o.pause();moved=true;lastClipTap=null;c.start=round(Math.max(0,start+dx/Math.max(1,rect.width)*axis));b.style.left=(100*c.start/axis)+'%';}
      function finish(cancel){b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);b.removeEventListener('pointercancel',abort);if(cancel)c.start=start;else if(moved){save({kind:'audio'});if(o.onAudioChange)o.onAudioChange(m.audioClips);}if(moved)draw();}
      function up(){finish(false);}function abort(){finish(true);}b.addEventListener('pointermove',move);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',abort);
     };
    });
    lane.style.minHeight=audioExpanded?Math.max(43,recordingEnds.length*32+11)+'px':'36px';
   }else if(t.kind==="scene-range"){
    var begin=0;
    (film.scenes||[]).forEach(function(act){
     var nestedAct=Engine.readScene(o.wiki,act.source)||{},sceneList=nestedAct.scenes||[],actStart=begin;
     var nestedLocal=0;
     (sceneList.length?sceneList:[act]).forEach(function(sceneClip){
      var start=actStart+nestedLocal,length=Math.max(.125,num(sceneClip.duration,36)),name=displayName(sceneClip.name||"Scene"),sceneTitle=sceneClip.editor||sceneClip.source;
      var b=el(doc,"button","huw-musical-scene-clip",name,lane);b.type="button";
      b.style.left=(100*start/axis)+"%";b.style.width=(100*length/axis)+"%";
      b.title=name+" · "+round(start)+"–"+round(start+length)+"s · "+(da?"dobbeltklik for tiddler":ui("double click for tiddler"));
      b.onclick=function(ev){ev.stopPropagation();o.seek(start);};
      b.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();if(sceneTitle&&$tw.rootWidget)$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:sceneTitle,navigateFromTitle:o.sceneTitle});};
      nestedLocal+=length;
     });
     begin+=Math.max(.125,num(act.duration,nestedLocal));
    });
   }else if(t.kind==="animation"){
    var motionClip=animation(t),span=clipRange(motionClip);
    var block=el(doc,"div","huw-musical-motion-clip",displayName(motionClip.name||t.name),lane);
    block.setAttribute("role","button");block.tabIndex=0;
    block.style.left=(100*span.start/axis)+"%";
    block.style.width=(100*Math.max(.1,span.end-span.start)/axis)+"%";
    block.title=(displayName(motionClip.name||t.name))+" · "+round(span.start)+"–"+round(span.end)+"s · "+round(motionClip.beatsPerLoop)+(da?" slag pr. løkke · ":ui(" beats / loop · "))+(da?"Dobbeltklik for at redigere":ui("Double-click to edit"));
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
     accent.title=(da?"Solobevægelse":ui("Solo accent"))+" · "+round(k.t)+"s";
     accent.setAttribute("aria-label",accent.title);
     accent.onclick=function(ev){ev.stopPropagation();o.seek(k.t);choose("accent:"+motionClip.id,index);};
    });
   }else if(t.kind==="song-lane"){
    // A lane is a fixed channel; it can contain any number of independent clips.
    m.songs.forEach(function(s,i){
     if(s.lane!==t.lane)return;
     var clip=(typeof o.clips==="function"?o.clips():m.songs)
      .find(function(c){return c.id===s.id;})||s;
     var block=el(doc,"div","huw-musical-song-clip",String(i+1)+". "+displayName(s.score),lane);
     block.dataset.songId=s.id;
     block.setAttribute("role","button");block.setAttribute("tabindex","0");
     block.title=displayName(s.score)+" · "+round(s.start)+"–"+round(s.start+s.duration)+"s · "+(da?"Dobbeltklik for nodeeditor":ui("Double-click for score editor"));
     block.style.left=(100*clip.start/axis)+"%";block.style.width=(100*clip.duration/axis)+"%";
     if(choice.id==="song:"+s.id)block.classList.add("is-selected");
     if(t.lane==="B")block.classList.add("huw-musical-song-alt");
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
     function editSong(){
      if(o.onEditScore)o.onEditScore(s.score,s);
      else if($tw.rootWidget)$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:s.score,navigateFromTitle:o.sceneTitle});
     }
     block.addEventListener("keydown",function(ev){if(ev.key==="Enter"){ev.preventDefault();editSong();}
      else if(ev.key===" "){ev.preventDefault();choose("song:"+s.id,0);o.seek(s.start);}});
     block.onclick=function(ev){ev.stopPropagation();if(ev.detail>=2){editSong();return;}choose("song:"+s.id,0);o.seek(s.start);};
     block.addEventListener("dblclick",function(ev){ev.preventDefault();ev.stopPropagation();editSong();});
     // Double-tap support when iPad Safari replaces the clicked DOM on first tap.
     block.addEventListener("pointerup",function(ev){
      if(ev.button!==undefined&&ev.button!==0)return;
      var now=Date.now(),last=lastClipTap;
      if(last&&last.id==="song:"+s.id&&now-last.time<480&&
         Math.abs(ev.clientX-last.x)<30&&Math.abs(ev.clientY-last.y)<30){
       lastClipTap=null;ev.preventDefault();ev.stopPropagation();editSong();
      }else lastClipTap={id:"song:"+s.id,time:now,x:ev.clientX,y:ev.clientY};
     });
     block.onpointerdown=function(ev){
      if(ev.button!==undefined&&ev.button!==0)return;
      ev.stopPropagation();var rect=lane.getBoundingClientRect(),startX=ev.clientX,startY=ev.clientY,
       initial={start:s.start,fadeIn:s.fadeIn||0,fadeOut:s.fadeOut||0,lane:s.lane},moved=false,
       kind=ev.target===left?"fadeIn":ev.target===right?"fadeOut":"start";
      if(block.setPointerCapture)block.setPointerCapture(ev.pointerId);
      function move(e){
       var delta=(e.clientX-startX)*axis/Math.max(1,rect.width);
       if(Math.abs(delta)<.05&&Math.abs(e.clientY-startY)<12&&!moved)return;
       moved=true;
       if(kind==="start"){
        s.start=round(lim(initial.start+delta,0,21600));
        // Drop a clip onto A or B to change lane without an extra menu.
        var targetLane=["A","B"].find(function(which){var el=rows.querySelector('[data-track-id="music:'+which+'"] .huw-musical-lane');
         if(!el)return false;var r=el.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});
        if(targetLane)s.lane=targetLane;
       }else if(kind==="fadeIn")s.fadeIn=round(lim(initial.fadeIn+delta,0,s.duration));
       else s.fadeOut=round(lim(initial.fadeOut-delta,0,s.duration));
       block.style.left=(100*s.start/axis)+"%";
       fadeStyle();
      }
      function finish(cancelled){
       block.removeEventListener("pointermove",move);
       block.removeEventListener("pointerup",done);
       block.removeEventListener("pointercancel",cancel);
       if(cancelled)Object.assign(s,initial);
       else if(moved){
        var clash=function(){return m.songs.some(function(x){return x!==s&&x.lane===s.lane&&Playlist.overlap(x,s)>.005;});};
        if(clash()&&kind==="start"){
         s.lane=s.lane==="A"?"B":"A";
         if(clash()){
          Object.assign(s,initial);
          status.textContent=da?"Der er ikke plads på nogen af de to musikspor. Flyt et andet klip først.":ui("Both music lanes are occupied. Move another clip first.");
          draw();o.repaint();return;
         }
        }
        persistSongs(false);
       }else{choice.id="song:"+s.id;drawForm();}
      }
      function done(){finish(false);}function cancel(){finish(true);}
      block.addEventListener("pointermove",move);
      block.addEventListener("pointerup",done);
      block.addEventListener("pointercancel",cancel);
     };
    });
   }else{
    if(t.id==="stage"){
     var stageBlock=el(doc,"div","huw-musical-block","",lane);stageBlock.title=t.name;
    }
    keys(t).forEach(function(k,index){
     var point=el(doc,"button","huw-musical-key",undefined,lane);point.type="button";
     point.dataset.keyIndex=String(index);point.style.left=(100*toFilm(k.t,t)/axis)+"%";
     point.title=(k.label?k.label+" · ":"")+t.name+" · "+round(k.t)+"s";point.setAttribute("aria-label",point.title);
     if(t.kind==='face'){point.classList.add('huw-musical-face-key');point.dataset.faceActor=t.actorId;point.title=t.name+' · '+round(k.t)+'s · '+faceKeyLabel(k);point.setAttribute('aria-label',point.title);}
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
       if(Math.abs(value-start)<.02&&!moved)return;if(!moved&&t.kind==='face')rememberFace();moved=true;k.t=value;
       point.style.left=(100*toFilm(k.t,t)/axis)+"%";o.seek(toAudio(toFilm(k.t,t)));
      }
      function finish(cancelled){
       point.removeEventListener("pointermove",move);
       point.removeEventListener("pointerup",done);
       point.removeEventListener("pointercancel",abort);
       if(cancelled){k.t=start;if(moved&&t.kind==='face')faceUndo.pop();}
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
    el(doc,"div","huw-musical-loop-heading",(da?"Bevægelsesmønster":ui("Motion pattern"))+" · "+num(animation(t).beatsPerLoop,8)+" " +(da?"slag · følger ABC-tempo":ui("beats · follows ABC tempo")),expanded);
    var beatSpan=Math.max(.125,num(animation(t).beatsPerLoop,8));
    Object.keys(animation(t).motion||{}).forEach(function(partId){
     var p=source&&source.parts.find(function(item){return item.id===partId;});
     var child={id:"motion:"+animation(t).id+":"+partId,kind:"motion",clipId:animation(t).id,part:partId,name:"↳ "+displayName(p&&p.name||partId)};
     map[child.id]=child;
     var nestedRow=el(doc,"div","huw-musical-track huw-musical-motion-row",undefined,expanded);
     nestedRow.dataset.trackId=child.id;
     var nestedTitle=el(doc,"div","huw-musical-lane-title",child.name,nestedRow);
     nestedTitle.onclick=function(){choose(child.id,0);};addPreviewControl(nestedTitle,nestedRow,child);
     var nestedLane=el(doc,"div","huw-musical-lane huw-musical-beat-lane",undefined,nestedRow);
     (animation(t).motion[partId]||[]).forEach(function(k,index){
      var dot=el(doc,"button","huw-musical-key huw-musical-motion-key",undefined,nestedLane);
      dot.type="button";dot.style.left=(100*num(k.t,0)/beatSpan)+"%";
      dot.title=child.name+" · "+round(k.t)+(da?" slag":ui(" beats"));dot.setAttribute("aria-label",dot.title);
      if(choice.id===child.id&&choice.key===index)dot.classList.add("is-selected");
      dot.onclick=function(ev){ev.stopPropagation();choose(child.id,index);o.seek(animationTime(animation(t),num(k.t,0)));};
     });
    });
   }
  });
  if(layerIds.length&&all.some(function(t){return t.layerRoot;})){
   // Mount pointer listeners only on an interactive browser surface.
   if(doc.defaultView&&doc.defaultView.requestAnimationFrame)disposeLayerDrag=require('$:/plugins/huwiki/musical/layer-reorder.js').mount(rows,layerIds,function(order,moved,keyboard){
    if(currentStage().scene!==active.scene){draw();return;}
    if(o.wiki.getTiddlerText(active.scene._title,'')!==sceneText){status.textContent=da?'Scenen er ændret. Åbn editoren igen.':ui('The scene changed. Reopen the editor.');return;}
    var api=require('$:/plugins/huwiki/musical/layer-order.js'),index=0;
    var complete=active.scene.parts.filter(function(p){return !p.parent;}).slice().reverse().map(function(p){return layerIds.indexOf(p.id)>=0?order[index++]:p.id;});
    var title=active.scene._title;api.applyToViews(o.view,title,complete);var text=JSON.stringify(active.scene);o.markOwnWrite(title,text);o.wiki.addTiddler(new $tw.Tiddler(o.wiki.getTiddler(title),{title:title,text:text}));
    draw();o.repaint();if(keyboard){var movedRow=Array.prototype.find.call(rows.querySelectorAll('[data-layer-id]'),function(r){return r.dataset.layerId===moved;});if(movedRow)movedRow.querySelector('.huwrep-order-handle').focus({preventScroll:true});}
   });
  }
  rows.scrollTop=oldScroll;drawForm();
 }
 function selectPart(id,direct){
  if(detailClipId&&!direct){
   var own=activeDetail();if(!own||!own.motion||!own.motion[id])return false;
   var mt=detailTrack(own,id),index=0,minimum=Infinity;
   var phase=Motion.phase(own,playhead,o.beatClock&&o.beatClock())||0;
   keys(mt).forEach(function(k,i){var d=Math.abs(num(k.t,0)-phase);if(d<minimum){minimum=d;index=i;}});
   choose(mt.id,index);return true;
  }
  if(direct){
   var clock=o.beatClock&&o.beatClock()||{at:function(t){return t*2;}},activeMotion=null;
   // Motion.paint visits clips in array order; its last active definition wins.
   m.animationClips.forEach(function(c){if(c.motion&&Array.isArray(c.motion[id])&&c.motion[id].length&&Motion.phase(c,playhead,clock)!==null)activeMotion=c;});
   if(activeMotion){var mt=detailTrack(activeMotion,id),phase=Motion.phase(activeMotion,playhead,clock),index=0,minimum=Infinity;
    keys(mt).forEach(function(k,i){var distance=Math.abs(num(k.t,0)-phase);if(distance<minimum){minimum=distance;index=i;}});
    choose(mt.id,index);return true;
   }
  }else{
   var motionClip=m.animationClips.find(function(c){return c.target===id||(c.motion&&c.motion[id]);});
   if(motionClip){choose("animation:"+motionClip.id,0);return true;}
  }
  var resolved=sceneForPart(id,o.view,0);if(!resolved||!resolved.parts)return false;source=resolved;
  var p=source.parts.find(function(item){return item.id===id;});if(!p)return false;
  var t=tracks.find(function(t){return (t.kind==="part"||t.kind==='film-part')&&t.part===id;});
  if(!t){t={id:"part:"+id,kind:resolved===film?'film-part':'part',part:id,name:displayName(p.name||id)};tracks.splice(tracks.length-3,0,t);map[t.id]=t;}
  filter="all";
  var list=keys(t),at=fromFilm(playhead,t),index=0,nearest=Infinity;
  list.forEach(function(key,i){var delta=Math.abs(num(key.t,0)-at);if(delta<nearest){index=i;nearest=delta;}});
  choose(t.id,index);return true;
 }
 function beginPartMove(id,globalTime){
  var selectedTrack=track(),selectedMotion=selectedTrack&&selectedTrack.kind==='motion'&&selectedTrack.part===id?animation(selectedTrack):null;
  var sourceSelection=selectedTrack&&selectedTrack.part===id&&(selectedTrack.kind==='part'||selectedTrack.kind==='film-part');
  var c=selectedMotion||(!sourceSelection&&detailClipId?activeDetail():null);
  if(c){
   if(!c.motion||!c.motion[id])return null;
   var phase=Motion.phase(c,globalTime,o.beatClock&&o.beatClock()||{at:function(t){return t*2;}});if(phase===null)return null;
   var t=detailTrack(c,id),beat=round(phase);
   var list=keys(t),index=list.findIndex(function(k){return Math.abs(num(k.t,0)-beat)<.05;});
   var inserted=index<0,k=inserted?Object.assign({t:beat},Motion.sample(list,beat)||{x:0,y:0,r:0,sx:1,sy:1,opacity:1}):list[index];
   if(inserted)list.push(k);
   var before=Model.clone(k),oldX=num(k.x,0),oldY=num(k.y,0),oldR=num(k.r,0);
   return {update:function(dx,dy,dr){if(dr===undefined||dx||dy){k.x=round(oldX+num(dx,0));k.y=round(oldY+num(dy,0));}if(dr!==undefined)k.r=round(oldR+num(dr,0));o.repaint();},
    commit:function(){list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();},
    cancel:function(){if(inserted)list.splice(list.indexOf(k),1);else{Object.keys(k).forEach(function(field){delete k[field];});Object.assign(k,before);}draw();o.repaint();}};
  }
  var t=tracks.find(function(t){return (t.kind==="part"||t.kind==='film-part')&&t.part===id;});
  var context=partContext(id,o.view,globalTime,[],true,0),resolved=context&&context.view.scene;
  if(!t&&resolved&&resolved.parts){var candidate=resolved.parts.find(function(p){return p.id===id;});
   if(candidate){t={id:"part:"+id,kind:resolved===film?'film-part':'part',part:id,name:displayName(candidate.name||id)};tracks.splice(tracks.length-3,0,t);map[t.id]=t;}}
  if(!t||!part(t))return null;
  var at=round(fromFilm(globalTime,t)),list=keys(t),index=list.findIndex(function(k){return Math.abs(k.t-at)<.025;});
  var inserted=index<0;
  var k=inserted?Object.assign({t:at},Engine.state(part(t),at)):list[index];
  if(inserted){list.push(k);index=list.length-1;}
  var before=Model.clone(k),oldX=num(k.x,0),oldY=num(k.y,0),oldR=num(k.r,0);
  return {
   update:function(dx,dy,dr){if(dr===undefined||dx||dy){k.x=round(oldX+num(dx,0));k.y=round(oldY+num(dy,0));}if(dr!==undefined)k.r=round(oldR+num(dr,0));o.repaint();},
   commit:function(){list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();},
   cancel:function(){if(inserted)list.splice(list.indexOf(k),1);else{Object.keys(k).forEach(function(field){delete k[field];});Object.assign(k,before);}draw();o.repaint();}
  };
 }
 // Shared object-transform editor API, used by every Musical project.
 function figureState(time,id){var cfg=m.figureTransforms[id],list=cfg&&cfg.keys||[];
  return {x:interpolate(list,time,'x',0),y:interpolate(list,time,'y',0),r:interpolate(list,time,'r',0),
   sx:interpolate(list,time,'sx',1),sy:interpolate(list,time,'sy',1),
   skewX:interpolate(list,time,'skewX',0),skewY:interpolate(list,time,'skewY',0)};
 }
 function cameraStateFor(time,which){
  var cfg=which==='B'?m.cameraB:film.camera;
  var s=Engine.cameraState({width:film.width,height:film.height,camera:cfg},time),list=cfg&&cfg.keys||[];
  s.r=interpolate(list,time,'r',0);s.skewX=interpolate(list,time,'skewX',0);s.skewY=interpolate(list,time,'skewY',0);
  return s;
 }
 function ensureFigureTrack(id,passive){if(!id)return null;var name='figure:'+id,t=map[name];
  if(!passive&&!m.figureTransforms[id])m.figureTransforms[id]={keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,skewX:0,skewY:0,easing:'smooth'}]};
  if(!t){var original=partByDeepId(id),partName=displayName(original&&(original.name||original.id)||id);
   t={id:name,kind:'figure',part:id,name:(da?'Hele objekt · ':ui('Whole object · '))+partName};
   tracks.splice(Math.max(0,tracks.length-3),0,t);map[name]=t;
  }
  return t;
 }
 function selectFigure(id,quiet){var t=ensureFigureTrack(id);if(!t)return false;
  var list=keys(t),index=0,distance=Infinity;list.forEach(function(k,i){var d=Math.abs(num(k.t,0)-playhead);if(d<distance){index=i;distance=d;}});
  if(quiet){choice={id:t.id,key:index};draw();}
  else choose(t.id,index);
  return true;
 }
 function beginTransform(t,at,defaultState){var list=keys(t),index=list.findIndex(function(k){return Math.abs(num(k.t,0)-at)<.025;}),inserted=index<0;
  var k=inserted?Object.assign({t:at,easing:'smooth'},defaultState):list[index];if(inserted)list.push(k);
  var before=Object.assign({},k);return {initial:Object.assign({},k),
   update:function(changes){Object.keys(changes).forEach(function(field){if(Number.isFinite(Number(changes[field])))k[field]=round(Number(changes[field]));});o.repaint();},
   commit:function(){list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();},
   cancel:function(){if(inserted)list.splice(list.indexOf(k),1);else{Object.keys(k).forEach(function(field){if(!Object.prototype.hasOwnProperty.call(before,field))delete k[field];});Object.assign(k,before);}draw();o.repaint();}
  };
 }
 function beginFigureTransform(id,time){var t=map['figure:'+id];return t?beginTransform(t,round(time),figureState(time,id)):null;}
 function beginCameraTransform(which,time){var t=map['camera-'+which];return t?beginTransform(t,round(time),cameraStateFor(time,which)):null;}
 function chooseCamera(which){var id='camera-'+(which==='B'?'B':'A'),t=map[id];if(!t)return false;
  var list=keys(t),index=0,distance=Infinity;list.forEach(function(k,i){var d=Math.abs(num(k.t,0)-playhead);if(d<distance){distance=d;index=i;}});
  choose(id,index);return true;
 }
 // Resolve both the source and its local clock through the rendered hierarchy.
 // Prefer the active occurrence when a source scene is reused in a production.
 function partContext(id,view,local,path,active,depth){
  if(!view||depth>16)return null;
  var fallback=null;
  if(view.nodes&&view.nodes[id]){var own={view:view,time:local,path:path,active:active};if(active)return own;fallback=own;}
  var sequence=view.scene.scenes||[],at=Engine.clipAt(sequence,local),from=0;
  var clips=view.clips||[];
  for(var i=0;i<clips.length;i++){
   var c=clips[i],settings=c.settings||sequence[i]||{},duration=Math.max(.1,num(settings.duration,4)),input=lim(local-from,0,duration);
   if(c.view){var sourceDuration=num(c.duration,c.view.scene.duration),childTime=Engine.localTime(input,sourceDuration,settings);
    var edge={settings:settings,sourceDuration:sourceDuration,timelineStart:from,limit:duration,input:input,parentTime:local};
    var found=partContext(id,c.view,childTime,path.concat([edge]),active&&i===at.index,depth+1);
    if(found&&found.active)return found;if(found&&!fallback)fallback=found;
   }from+=duration;
  }
  var ids=Object.keys(view.nodes||{});
  for(var j=0;j<ids.length;j++){
   var node=view.nodes[ids[j]];if(!node.nested)continue;
   var nestedDuration=num(node.nested.duration,node.nested.scene.duration),timing=Engine.timing(local,nestedDuration,node.part);
   var nestedEdge={settings:node.part,sourceDuration:nestedDuration,timelineStart:0,limit:Math.max(0,num(view.scene.duration,film.duration)),input:local,parentTime:local};
   var nested=partContext(id,node.nested,timing.time,path.concat([nestedEdge]),active&&timing.active,depth+1);
   if(nested&&nested.active)return nested;if(nested&&!fallback)fallback=nested;
  }
  return fallback;
 }
 function sceneForPart(id,view,depth){var context=partContext(id,view,playhead,[],true,depth||0);return context&&context.view.scene;}
 function partByDeepId(id){var scene=sceneForPart(id,o.view,0);return scene&&scene.parts&&scene.parts.find(function(p){return p.id===id;});}
 function isJointMove(id){var selected=track(),clip=selected&&selected.kind==='motion'?animation(selected):null,p=partByDeepId(id);return !!(p&&p.parent&&(!clip||id!==clip.target));}
 function getPartPivot(id){var p=partByDeepId(id);return p&&p.pivot||{x:0,y:0};}
 function cameraMatrix(c){var r=num(c.r,0)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r),sx=Math.tan(lim(c.skewX,-35,35)*Math.PI/180),sy=Math.tan(lim(c.skewY,-35,35)*Math.PI/180);
  var a=cos-sin*sy,b=sin+cos*sy,cc=cos*sx-sin,d=sin*sx+cos,det=a*d-b*cc;
  return {a:d/det,b:-b/det,c:-cc/det,d:a/det};
 }
 // A single world wrapper lets the camera rotate/skew *all* stage contents.
 // Editing outlines stay outside it and never appear in the published show.
 var cameraWorld=doc.createElementNS(NS,'g');cameraWorld.setAttribute('class','huw-musical-camera-world');
 Array.prototype.slice.call(o.view.svg.childNodes).forEach(function(c){if(c===overlay||c.nodeName.toLowerCase()==='defs')return;cameraWorld.appendChild(c);});
 o.view.svg.insertBefore(cameraWorld,overlay);
 function paintFigures(time){
  // Apply the whole-figure transform to a *wrapper*, not the CutOut part.
  // Engine.paint rewrites the part transform every frame. Keeping those two
  // matrices separate prevents scale/position from compounding over time.
  function walk(view,local,depth){if(!view||depth>16)return;
   Object.keys(m.figureTransforms||{}).forEach(function(id){var node=view.nodes&&view.nodes[id],cfg=m.figureTransforms[id];
    if(!node||!node.el||!cfg||!cfg.keys||!cfg.keys.length)return;
    var wrap=node.el._musicalWholeWrapper;
    if(!wrap||wrap.parentNode!==node.el.parentNode){
     if(!wrap){wrap=doc.createElementNS(NS,'g');wrap.setAttribute('class','huw-musical-object-wrapper');node.el._musicalWholeWrapper=wrap;}
     if(node.el.parentNode!==wrap){var oldParent=node.el.parentNode;if(oldParent){oldParent.replaceChild(wrap,node.el);wrap.appendChild(node.el);}}
    }
    var k=figureState(time,id),base=(node.el.getAttribute('transform')||'').match(/^translate\(\s*([-+\d.eE]+)[, ]+([-+\d.eE]+)/),
     cx=base?num(base[1],0):0,cy=base?num(base[2],0):0;
    // Rotate/scale/skew around the selected object's own origin, not scene (0,0).
    wrap.setAttribute('transform','translate('+k.x+' '+k.y+') translate('+cx+' '+cy+') rotate('+k.r+') skewX('+k.skewX+') skewY('+k.skewY+') scale('+k.sx+' '+k.sy+') translate('+(-cx)+' '+(-cy)+')');
   });
   var active=Engine.clipAt(view.scene.scenes||[],local),start=0;
   (view.clips||[]).forEach(function(c,i){var d=Math.max(.1,num(c.settings&&c.settings.duration,4));
    if(i===active.index&&c.view&&c.el&&c.el.getAttribute('display')!=='none'){
     walk(c.view,Engine.localTime(Math.max(0,Math.min(d,local-start)),c.duration,c.settings),depth+1);
    }start+=d;
   });
   Object.keys(view.nodes||{}).forEach(function(k){var n=view.nodes[k];if(n.nested&&n.el&&n.el.getAttribute('display')!=='none')walk(n.nested,local,depth+1);});
  }
  walk(o.view,time,0);
 }
 function paintTransform(time){var c=preview.enabled("camera-"+activeCam(time))?cameraStateFor(time,activeCam(time)):{x:film.width/2,y:film.height/2,zoom:1},w=film.width/c.zoom,h=film.height/c.zoom,
  editing=!preview.exporting()&&cameraEditActive&&!(o.isPlaying&&o.isPlaying());
  if(editing){o.view.svg.setAttribute('viewBox',[(-film.width*.14),(-film.height*.14),film.width*1.28,film.height*1.28].join(' '));cameraWorld.removeAttribute('transform');
   if(overlay){overlay.setAttribute('x',0);overlay.setAttribute('y',0);overlay.setAttribute('width',film.width);overlay.setAttribute('height',film.height);}
  }else{var inv=cameraMatrix(c);
   cameraWorld.setAttribute('transform','translate('+c.x+' '+c.y+') matrix('+[inv.a,inv.b,inv.c,inv.d,0,0].join(' ')+') translate('+(-c.x)+' '+(-c.y)+')');
  }
  paintFigures(time);
 }
 function setFilter(value){filter=["all","music","camera","animation","scene"].indexOf(value)>=0?value:"all";draw();}
 function selectSong(id){if(!m.songs.some(function(s){return s.id===id;}))return false;
  if(choice.id!=="song:"+id){choice={id:"song:"+id,key:0};draw();}
  return true;
 }
 function setZoom(value){zoom=lim(value,1,5);rows.style.setProperty("--musical-zoom",String(zoom));draw();}
 function addKeyframe(){var t=track();if(t&&(t.kind==="sfx"||t.kind==="audio-fx"))return openEffects(t,null);if(t&&['song','scene-range','audio','audio-lane','object-browser','captions'].indexOf(t.kind)<0)newPoint(t,playhead);}
 function removeKeyframe(){var t=track();if(t&&['song','scene-range','audio','audio-lane','object-browser','captions'].indexOf(t.kind)<0)removePoint(t);}
 draw();return {paint:paint,redraw:draw,revealPlayhead:revealPlayhead,selectPart:selectPart,selectSong:selectSong,clearSelection:clearSelection,beginPartMove:beginPartMove,
  openAnimation:openAnimation,closeAnimation:closeAnimation,inClipDetail:function(){return !!detailClipId;},getDetailClip:activeDetail,
  addKeyframe:addKeyframe,removeKeyframe:removeKeyframe,setFilter:setFilter,getFilter:function(){return filter;},setZoom:setZoom,
  getZoom:function(){return zoom;},getSelection:track,openLayers:openLayers,
  faceContext:faceContext,chooseFace:chooseFace,faceHistory:faceHistory,selectFaceKey:selectFaceKey,undoFace:undoFace,canUndoFace:function(){return faceUndo.length>0;},
  selectFigure:selectFigure,ensureFigureTrack:ensureFigureTrack,beginFigureTransform:beginFigureTransform,figureStateFor:figureState,
  beginCameraTransform:beginCameraTransform,selectCamera:chooseCamera,activeCamera:activeCam,
  setCameraEdit:function(v){cameraEditActive=!!v;o.repaint();},cameraStateFor:cameraStateFor,
  isTrackVisible:preview.enabled,isSongAudible:preview.song,isAudioAudible:preview.audio,isSfxAudible:preview.effects,
  setTrackVisible:setPreviewEnabled,setTrackAudible:setPreviewEnabled,isExporting:preview.exporting,
  beginExport:function(){var restore=preview.beginExport();if(o.onPreviewChange)o.onPreviewChange();o.repaint();return function(){restore();previewControls.forEach(function(control){control.update();});if(o.onPreviewChange)o.onPreviewChange();o.repaint();};},
  getCaptionCues:function(){return captionCues.slice();},
  isJointMove:isJointMove,getPartPivot:getPartPivot,
  resolvePartScene:function(id){return sceneForPart(id,o.view,0);},
  dispose:function(){if(cancelHold)cancelHold();if(disposeLayerDrag)disposeLayerDrag();if(layerPanel)layerPanel.dispose();if(effectLibrary)effectLibrary.close();clearPreviewVisibility();if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
}
exports.attach=attach;exports.ensureMusical=ensureMusical;exports.interpolate=interpolate;
})();
