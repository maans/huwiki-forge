/*\
title: $:/plugins/huwiki/musical/editor.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Sfx=require("$:/plugins/huwiki/musical/sfx.js");
var Model=require("$:/plugins/huwiki/cutout/model.js");
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
 L.help=L===translations.da?"To musikspor og ét effektspor. Flere musikklip kan ligge på samme spor. Træk klip for at flytte dem, og lav crossfades mellem musik A og B. Dobbeltklik på et musikklip for at åbne nodeeditoren.":"Two reusable music lanes and one SFX lane. Place multiple clips on either lane; crossfade between A and B. Double-click a music clip to edit its ABC notation.";

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
 var rows=el(doc,"div","huw-musical-tracks",undefined,root),inspector=el(doc,"div","huw-musical-inspector",undefined,root),status=el(doc,"output","huw-musical-edited-status","",root);
 var cameraEditActive=false,playhead=0,choice={id:"song:"+m.songs[0].id,key:0},playheads=[],filter="all",zoom=1,expandedClipId="",detailClipId="",detailReturn=null,lastClipTap=null,isolation="";
 var tracks=[{id:"song",kind:"song",name:L.song},{id:"scenes",kind:"scene-range",name:L===translations.da?"Akter og scener":"Acts and scenes"},
  {id:"scene-objects",kind:"object-browser",name:L===translations.da?"Objekter i scenen":"Objects in scene"},
  {id:"backdrop",kind:"part",part:"stage-back",name:L.backdrop},{id:"stage",kind:"part",part:"stage-floor",name:L.stage},{id:"foreground",kind:"part",part:"foreground-flags",name:L.foreground},{id:"lights",kind:"light",name:L.light}];
 if((film.parts||[]).some(function(p){return p.id==="curtain-left";}))tracks.push({id:"curtain-left-track",kind:"film-part",part:"curtain-left",name:L===translations.da?"Venstre fortæppe":"Left curtain"});
 if((film.parts||[]).some(function(p){return p.id==="curtain-right";}))tracks.push({id:"curtain-right-track",kind:"film-part",part:"curtain-right",name:L===translations.da?"Højre fortæppe":"Right curtain"});
 if(Array.isArray(m.animationClips)&&m.animationClips.length){
  m.animationClips.forEach(function(c){tracks.push({id:"animation:"+c.id,kind:"animation",clipId:c.id,target:c.target,name:c.name||c.id});});
 }else if(source)source.parts.filter(function(p){return /-root$/.test(p.id)&&p.keys&&p.keys.length>1;}).forEach(function(p){tracks.push({id:p.id,kind:"part",part:p.id,name:p.name||p.id});});
 // Whole-object tracks are separate from limb/loop animation, so movement of
 // a puppet does not overwrite the animation of its arms, legs or instrument.
 var knownFigures={};m.animationClips.forEach(function(c){if(!c.target||knownFigures[c.target])return;knownFigures[c.target]=true;
  if(!m.figureTransforms[c.target])m.figureTransforms[c.target]={keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,skewX:0,skewY:0,easing:'smooth'}]};
  tracks.push({id:'figure:'+c.target,kind:'figure',part:c.target,name:(L===translations.da?'Hele objekt · ':'Whole object · ')+(c.name||c.target)});
 });
 tracks.push({id:"sfx",kind:"sfx",name:L===translations.da?"Lydeffekter (SFX)":"Sound effects (SFX)"});
 tracks.push({id:"audio-lane",kind:"audio-lane",name:L===translations.da?"Indtaling og lydfiler":"Voice and audio files"});
 tracks.push({id:"camera-A",kind:"camera",name:L.cameraA},{id:"camera-B",kind:"camera",name:L.cameraB},{id:"cuts",kind:"cut",name:L.cuts});
 tracks=tracks.filter(function(t){return t.kind!=='part'||!!sceneForPart(t.part,o.view,0);});
 var map={};tracks.forEach(function(t){map[t.id]=t;});
 m.animationClips.forEach(function(c){map["accent:"+c.id]={id:"accent:"+c.id,kind:"accent",clipId:c.id,name:(c.name||c.id)+" · solo"};});
 function songTracks(){return m.songs.map(function(s,i){return {id:"song:"+s.id,kind:"song",index:i,name:"♫ "+(i+1)+". "+s.score};});}
 function audioTracks(){return m.audioClips.map(function(c,i){return {id:'audio:'+c.id,kind:'audio',index:i,name:c.name||c.role||c.id};});}
 function musicLanes(){return [{id:"music:A",kind:"song-lane",lane:"A",name:L===translations.da?"♫ Musik A":"♫ Music A"},
  {id:"music:B",kind:"song-lane",lane:"B",name:L===translations.da?"♫ Musik B":"♫ Music B"}];}
 function group(t){return (t.kind==="song"||t.kind==="song-lane"||t.kind==="sfx"||t.kind==='audio'||t.kind==='audio-lane')?"music":(t.kind==="camera"||t.kind==="cut")?"camera":(t.id==="lights"||["backdrop","stage","foreground"].indexOf(t.id)>=0)?"scene":"animation";}
 function track(){return songTracks().concat(audioTracks()).find(function(s){return s.id===choice.id;})||map[choice.id]||songTracks()[0]||tracks[0];}
 function axisDuration(){return Math.max(1,o.duration(),film.duration,Playlist.total(m.songs));}
 function part(t){var scene=t.kind==='film-part'?film:sceneForPart(t.part,o.view,0)||source;return scene&&(scene.parts||[]).find(function(p){return p.id===t.part;});}
 function animation(t){return m.animationClips.find(function(c){return c.id===t.clipId;});}
 function activeDetail(){return m.animationClips.find(function(c){return c.id===detailClipId;});}
 function detailTrack(clip,partId){
  var p=source&&source.parts.find(function(k){return k.id===partId;});
  var id="motion:"+clip.id+":"+partId;
  return map[id]||(map[id]={id:id,kind:"motion",clipId:clip.id,part:partId,name:p&&p.name||partId});
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
 function keys(t){var v=target(t);if(!v)return [];
  if(t.kind==="motion")return (v.motion||{})[t.part]||[];
  if(t.kind==="accent")return v.accents||(v.accents=[]);
  if(t.kind==="animation")return [];
  return t.kind==="cut"?v.cuts:t.kind==="sfx"?v.sfx:(v.keys||(v.keys=[]));}
 function toFilm(time,t){if(t.kind!=="part")return lim(time,0,film.duration);var c=film.scenes&&film.scenes[0]||{};return lim((time-num(c.offset,0))/Math.max(.01,num(c.speed,1))+num(c.start,0),0,film.duration);}
 function fromFilm(time,t){if(t.kind!=="part")return time;var c=film.scenes&&film.scenes[0]||{};return Engine.localTime(time,source?source.duration:film.duration,c);}
 function toAudio(time){return lim(time,0,o.duration());}
 function activeCam(time){var c="A";m.cuts.slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(num(k.t,0)<=time+1e-6)c=k.camera==="B"?"B":"A";});return c;}
 function cameraState(time){return Engine.cameraState({width:film.width,height:film.height,camera:activeCam(time)==="B"?m.cameraB:film.camera},time);}
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
  mask.setAttribute("maskUnits","userSpaceOnUse");
  mask.setAttribute("x","-10000");mask.setAttribute("y","-10000");mask.setAttribute("width","20000");mask.setAttribute("height","20000");
  var back=doc.createElementNS(NS,"rect");["x","y","width","height"].forEach(function(k,i){back.setAttribute(k,[-10000,-10000,20000,20000][i]);});
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
  paintTransform(time);
  cameraLabel.textContent=detail?(L===translations.da?"Animation: ":"Animation: ")+detail.name:L.camera+" "+activeCam(time);playhead=time;
  playheads.forEach(function(e){
   if(e.dataset.cursorMode==="beat"){
    var phase=detail&&Motion.phase(detail,time,o.beatClock&&o.beatClock());
    e.style.display=phase===null?"none":"";
    e.style.left=phase===null?"0%":(100*phase/Math.max(.125,num(detail.beatsPerLoop,8)))+"%";
   }else e.style.left=(100*time/axisDuration())+"%";
  });
 }
 function save(t){var isPart=t.kind==="part",partScene=isPart&&(sceneForPart(t.part,o.view,0)||source),name=isPart?(partScene&&partScene._title||o.stageTitle):o.sceneTitle,value=isPart?partScene:film,old=o.wiki.getTiddler(name);if(!old||!value)return;
  var json=JSON.stringify(value);o.markOwnWrite(name,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:name,text:json}));status.textContent=L.saved;
  if(t.kind==='audio'&&o.onAudioChange)o.onAudioChange(m.audioClips);
 }
 function choose(id,key){choice={id:id,key:key};var t=track();
  if(t.kind==="animation")expandedClipId=t.id;
  if(t.kind==="motion"||t.kind==="accent")expandedClipId="animation:"+t.clipId;
  draw();if(o.onSelect)o.onSelect(track());}
 function selected(){return track().kind==="song"?m.songs[track().index]:track().kind==='audio'?m.audioClips[track().index]:track().kind==="animation"?animation(track()):keys(track())[choice.key];}
 function newPoint(t,time){if(t.kind==="song"||((t.kind==='part'||t.kind==='film-part')&&!part(t)))return;
  if(t.kind==="animation"){
   var c=animation(t);if(!c)return;
   var accents=c.accents||(c.accents=[]),key={t:round(time),x:0,y:0,r:0};
   accents.push(key);accents.sort(function(a,b){return a.t-b.t;});
   choose("accent:"+c.id,accents.indexOf(key));save({kind:"animation"});return;
  }
  var at=round(t.kind==="motion"?(Motion.phase(animation(t),time,o.beatClock())||0):t.kind==="accent"?time:fromFilm(time,t));
  var list=keys(t),known=list.findIndex(function(k){return Math.abs(k.t-at)<.02;});if(known>=0){choose(t.id,known);return;}
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
  else if(t.kind==="sfx")Object.assign(k,{id:"fx-"+Date.now()+"-"+Math.floor(Math.random()*100000),type:"magic",volume:.7,duration:1,label:"Magi"});
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
  var laneLabel=el(doc,"label","huw-musical-property",undefined,inspector);
  el(doc,"span","",L===translations.da?"Musikspor":"Music lane",laneLabel);
  var laneSelect=el(doc,"select","huw-musical-song-select",undefined,laneLabel);
  [["A",L===translations.da?"Musik A":"Music A"],["B",L===translations.da?"Musik B":"Music B"]].forEach(function(entry){var option=el(doc,"option","",entry[1],laneSelect);option.value=entry[0];});
  laneSelect.value=k.lane||"A";
  laneSelect.onchange=function(){var old=k.lane;k.lane=laneSelect.value;
   if(m.songs.some(function(s){return s!==k&&s.lane===k.lane&&Playlist.overlap(s,k)>.005;})){
    k.lane=old;laneSelect.value=old;status.textContent=L===translations.da?"To klip kan ikke overlappe på samme musikspor.":"Clips cannot overlap on the same music lane.";return;
   }
   persistSongs(false);
  };
  function button(cls,title,fn,disabled){
   var b=el(doc,"button",cls,title,actions);b.type="button";b.disabled=!!disabled;b.onclick=fn;return b;
  }
  button('huw-musical-edit-score',L===translations.da?'Redigér noder':'Edit notation',function(){if(o.onEditScore)o.onEditScore(k.score);});
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
 function drawForm(){inspector.textContent="";var t=track(),k=selected();
  var da=L===translations.da;
  var kindNames={"figure":da?"Hele objekt":"Whole object","animation":da?"Animationsklip":"Animation clip",
   "song":da?"Musikklip":"Music clip","part":da?"Kulisse / del":"Scenery / part",
   "film-part":da?"Sceneobjekt / rekvisit":"Stage object / prop","camera":da?"Kamera":"Camera",
   "motion":da?"Ledbevægelse":"Limb motion","accent":da?"Bevægelsesaccent":"Motion accent",
   "light":da?"Lys":"Lighting","sfx":da?"Lydeffekt":"Sound effect","cut":da?"Kameraklip":"Camera cut",
   "scene-range":da?"Scene":"Scene","object-browser":da?"Objektvælger":"Object picker"};
  el(doc,"span","huw-musical-inspector-type",kindNames[t.kind]||(da?"Egenskaber":"Properties"),inspector);
  el(doc,"strong","huw-musical-inspector-selection",t.name,inspector);
  var explanation=t.kind==="figure"?(da?"Flyt, drej, skalér eller skævvrid hele objektet. Ændringer kan gemmes som nøglebilleder; dukkeleddene bevares.":"Move, rotate, scale or skew the whole object. Changes are keyframed; the puppet joints are preserved."):
   t.kind==="animation"?(da?"Du redigerer bevægelsesklippets tid og gentagelse – ikke figurens størrelse. Dobbeltklik på klippet for ledbevægelser.":"You are editing the clip timing and repetition, not the whole figure's size. Double-click the clip for limb motion."):
   t.kind==="song"?(da?"Her redigeres musikklippets start, fade, lydstyrke og mute. Dobbeltklik på klippet for at åbne ABC.":"Edit the music clip's start, fades, volume and mute. Double-click the clip to open ABC."):
   t.kind==="camera"?(da?"Kameraets udsnit og nøglebilleder. Træk den stiplede kameraramme for at panorere, zoome eller dreje.":"Camera framing and keyframes. Drag the dashed camera frame to pan, zoom or rotate."):
   t.kind==="film-part"||t.kind==="part"?(da?"Redigér den valgte kulisse eller rekvisit. SVG-knappen åbner dens tegning og lag.":"Edit the selected scenery or prop. Open its drawing and layers with the SVG button."):
   t.kind==="motion"?(da?"Dette punkt ændrer én del af figurens bevægelsesløkke.":"This point changes one part of the figure's motion loop."):
   t.kind==="sfx"?(da?"Redigér én lydeffekt og dens tidspunkt i forestillingen.":"Edit one sound effect cue and its timing in the show."):"";
  if(explanation)el(doc,"p","huw-musical-inspector-help",explanation,inspector);
  if(t.kind==="scene-range"){
   var sceneButton=el(doc,'button','huw-musical-edit-scenes',da?'Redigér scener og rækkefølge':'Edit scenes and order',inspector);sceneButton.type='button';sceneButton.onclick=function(){if(o.onEditScenes)o.onEditScenes();};return;}
  if(t.kind==='audio-lane'||t.kind==='audio'){
   var audioButton=el(doc,'button','huw-musical-edit-audio',da?'Åbn lydværksted':'Open audio workshop',inspector);audioButton.type='button';audioButton.onclick=function(){if(o.onEditAudio)o.onEditAudio(k?{clipId:k.id}:{});};
   if(k){formNumber(k,L.start,'start',.1,0,21600);formNumber(k,da?'Lydstyrke (0–1)':'Volume (0–1)','volume',.05,0,1);
    el(doc,'p','huw-musical-song-info',(k.role?k.role+' · ':'')+(k.text||k.name||'')+' · '+round(k.duration)+'s',inspector);
    var muteAudio=el(doc,'button','',k.muted?(da?'Slå lyd til':'Unmute'):(da?'Slå lyd fra':'Mute'),inspector);muteAudio.type='button';muteAudio.onclick=function(){k.muted=!k.muted;save(t);if(o.onAudioChange)o.onAudioChange(m.audioClips);draw();};
   }return;
  }
  if(t.kind==="song"){drawSongForm();return;}
  if(t.kind==="animation"){
   if(!k){el(doc,"p","",L.empty,inspector);return;}
   var hint=L===translations.da?"Bevægelsesklip: ét mønster gentages i takt med ABC-tempoet. Klik klippet for at åbne dets indre nøglepunkter.":"Motion clip: one pattern repeats in time with the ABC tempo. Open the clip to edit its inner keyframes.";
   el(doc,"p","huw-musical-song-info",hint,inspector);
   if(t.target){var whole=el(doc,"button","huw-musical-select-whole",da?"↗ Vælg hele figuren":"↗ Select whole figure",inspector);
    whole.type="button";whole.onclick=function(){selectFigure(t.target);};}
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
  }else if(t.kind==="part"||t.kind==="film-part"){
   var item=part(t),nested=o.view.clips&&o.view.clips[0]&&o.view.clips[0].view,
    visual=t.kind==="film-part"?(o.view.nodes[t.part]&&o.view.nodes[t.part].shape):nested&&nested.nodes&&nested.nodes[t.part]&&nested.nodes[t.part].shape;
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
    // Props and scenery use exactly the same lightweight SVG layer editor as puppets.
    var drawVisual=el(doc,"button","huw-musical-edit-svg",L===translations.da?"✎ SVG-lag / rekvisit":"✎ SVG layers / prop",inspector);
    drawVisual.type="button";drawVisual.onclick=function(){
     if(o.pause)o.pause();
     var SvgLayers=optionalSvgLayers();
     if(!SvgLayers){status.textContent=L===translations.da?"SVG-lagværkstedet mangler i denne betaversion. Musik og forestilling fungerer stadig.":"The SVG layer workshop is unavailable in this beta. Music and the show still work.";return;}
     var destination=t.kind==='film-part'?film:sceneForPart(item.id,o.view,0)||source;if(!destination)return;
     SvgLayers.open({doc:doc,wiki:o.wiki,host:o.host,part:item,duration:destination.duration||film.duration,da:L===translations.da,onSave:function(layers,settings){
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
  else if(t.kind==="sfx"){
   formText(k,L===translations.da?"Cue-navn":"Cue name","label");
   formSelect(k,L===translations.da?"Effekt":"Effect","type",Object.keys(Sfx.TYPES).map(function(key){return [key,Sfx.TYPES[key]];}));
   formNumber(k,L.volume,"volume",.05,0,1);
   formNumber(k,L===translations.da?"Varighed (sek.)":"Duration (sec)","duration",.1,.1,8);
  }else if(t.kind==="cut")formSelect(k,L.camera,"camera",[["A",L.cameraA],["B",L.cameraB]]);
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
  var all=musicLanes().concat(tracks.filter(function(t){return t.kind==="sfx";}))
   .concat(tracks.filter(function(t){return t.kind!=="song"&&t.kind!=="sfx";}))
   .filter(function(t){return filter==="all"||group(t)===filter;});
  all.forEach(function(t){
   var row=el(doc,"div","huw-musical-track",undefined,rows);
   row.dataset.group=group(t);row.dataset.trackId=t.id;
   if(t.id===choice.id||(t.kind==="song-lane"&&m.songs.some(function(s){return s.lane===t.lane&&choice.id==="song:"+s.id;})))row.classList.add("is-selected");
   var title=el(doc,"div","huw-musical-lane-title",t.name,row);
   var selectableObject=!!(t.kind==="figure"||t.kind==="animation"||t.kind==="part"||t.kind==="film-part"||t.kind==="camera");
   if(selectableObject){title.setAttribute('role','button');title.setAttribute('tabindex','0');
    title.setAttribute('aria-label',(L===translations.da?'Markér på scenen: ':'Select on stage: ')+t.name);
    title.title=L===translations.da?'Klik eller dobbeltklik for at markere objektet på scenen':'Click or double-click to select the object on stage';
    title.classList.add('huw-musical-select-object-title');
   }
   function selectTrackTitle(){if(t.kind==="song-lane"){
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
   var lane=el(doc,"div","huw-musical-lane",undefined,row);
   lane.onclick=function(ev){
    if(ev.target.closest&&ev.target.closest(".huw-musical-key,.huw-musical-song-clip"))return;
    var rect=lane.getBoundingClientRect(),u=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
    o.seek(toAudio(u*axis));if(t.kind!=="song-lane"&&choice.id!==t.id)choose(t.id,0);
   };
   if(t.kind==="object-browser"){
    // This single compact lane is a fast selector for *untracked* props and
    // scenery as well as puppets. It does not create 40 extra timeline rows.
    function activeRoots(v,depth){if(!v||depth>16)return [];
     var result=[];
     (v.clips||[]).some(function(c){if(c.view&&(!c.el||c.el.getAttribute('display')!=='none')){
      var child=activeRoots(c.view,depth+1);if(child.length){result=child;return true;}}
      return false;});
     if(result.length)return result;
     var parts=v.scene&&v.scene.parts||[];
     return parts.filter(function(p){return !p.parent&&p.id;}).map(function(p){return {id:p.id,name:p.name||p.id};});
    }
    var picker=el(doc,'select','huw-musical-object-picker',undefined,lane);
    picker.setAttribute('aria-label',L===translations.da?'Vælg figur eller rekvisit på scenen':'Select figure or prop on stage');
    function populateObjects(){var objects=activeRoots(o.view,0),selected=picker.value;
     picker.textContent='';var hint=el(doc,'option','',L===translations.da?'Vælg figur, rekvisit eller kulisse…':'Select figure, prop or scenery…',picker);hint.value='';
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
   }else if(t.kind==='audio-lane'){
    m.audioClips.forEach(function(c){
     var b=el(doc,'button','huw-musical-recorded-clip',(c.role?c.role+': ':'')+(c.name||c.text||'Audio'),lane);b.type='button';
     b.style.left=(100*c.start/axis)+'%';b.style.width=(100*Math.max(.1,c.duration)/axis)+'%';b.classList.toggle('is-muted',!!c.muted);b.setAttribute('aria-pressed',String(choice.id==='audio:'+c.id));
     b.title=(c.name||'Audio')+' · '+round(c.start)+'–'+round(c.start+c.duration)+'s';
     b.onclick=function(ev){ev.stopPropagation();var now=Date.now(),last=lastClipTap,isDouble=last&&last.id==='audio:'+c.id&&now-last.time<480&&Math.abs(ev.clientX-last.x)<30&&Math.abs(ev.clientY-last.y)<30;
      lastClipTap=isDouble?null:{id:'audio:'+c.id,time:now,x:ev.clientX,y:ev.clientY};choose('audio:'+c.id,0);o.seek(c.start);if(isDouble&&o.onEditAudio)o.onEditAudio({clipId:c.id});};
     b.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();if(o.onEditAudio)o.onEditAudio({clipId:c.id});};
     b.onkeydown=function(ev){if(ev.key==='Enter'){ev.preventDefault();if(o.onEditAudio)o.onEditAudio({clipId:c.id});}};
     b.onpointerdown=function(ev){if(ev.button!==undefined&&ev.button!==0)return;ev.stopPropagation();var rect=lane.getBoundingClientRect(),x=ev.clientX,start=c.start,moved=false;
      if(b.setPointerCapture)b.setPointerCapture(ev.pointerId);
      function move(e){var dx=e.clientX-x;if(!moved&&Math.abs(dx)<4)return;if(!moved&&o.pause)o.pause();moved=true;lastClipTap=null;c.start=round(Math.max(0,start+dx/Math.max(1,rect.width)*axis));b.style.left=(100*c.start/axis)+'%';}
      function finish(cancel){b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',up);b.removeEventListener('pointercancel',abort);if(cancel)c.start=start;else if(moved){save({kind:'audio'});if(o.onAudioChange)o.onAudioChange(m.audioClips);}if(moved)draw();}
      function up(){finish(false);}function abort(){finish(true);}b.addEventListener('pointermove',move);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',abort);
     };
    });
   }else if(t.kind==="scene-range"){
    var begin=0;
    (film.scenes||[]).forEach(function(act){
     var nestedAct=Engine.readScene(o.wiki,act.source)||{},sceneList=nestedAct.scenes||[],actStart=begin;
     var nestedLocal=0;
     (sceneList.length?sceneList:[act]).forEach(function(sceneClip){
      var start=actStart+nestedLocal,length=Math.max(.125,num(sceneClip.duration,36)),name=sceneClip.name||"Scene",sceneTitle=sceneClip.editor||sceneClip.source;
      var b=el(doc,"button","huw-musical-scene-clip",name,lane);b.type="button";
      b.style.left=(100*start/axis)+"%";b.style.width=(100*length/axis)+"%";
      b.title=name+" · "+round(start)+"–"+round(start+length)+"s · "+(L===translations.da?"dobbeltklik for tiddler":"double click for tiddler");
      b.onclick=function(ev){ev.stopPropagation();o.seek(start);};
      b.ondblclick=function(ev){ev.preventDefault();ev.stopPropagation();if(sceneTitle&&$tw.rootWidget)$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:sceneTitle,navigateFromTitle:o.sceneTitle});};
      nestedLocal+=length;
     });
     begin+=Math.max(.125,num(act.duration,nestedLocal));
    });
   }else if(t.kind==="animation"){
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
   }else if(t.kind==="song-lane"){
    // A lane is a fixed channel; it can contain any number of independent clips.
    m.songs.forEach(function(s,i){
     if(s.lane!==t.lane)return;
     var clip=(typeof o.clips==="function"?o.clips():m.songs)
      .find(function(c){return c.id===s.id;})||s;
     var block=el(doc,"div","huw-musical-song-clip",String(i+1)+". "+s.score,lane);
     block.dataset.songId=s.id;
     block.setAttribute("role","button");block.setAttribute("tabindex","0");
     block.title=s.score+" · "+round(s.start)+"–"+round(s.start+s.duration)+"s · "+(L===translations.da?"Dobbeltklik for nodeeditor":"Double-click for score editor");
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
          status.textContent=L===translations.da?"Der er ikke plads på nogen af de to musikspor. Flyt et andet klip først.":"Both music lanes are occupied. Move another clip first.";
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
     point.style.left=(100*toFilm(k.t,t)/axis)+"%";
     point.title=(k.label?k.label+" · ":"")+t.name+" · "+round(k.t)+"s";point.setAttribute("aria-label",point.title);
     if(t.kind==="cut"){point.classList.add("huw-musical-cut-point");point.textContent=k.camera||"A";}
     if(t.kind==="sfx"){point.classList.add("huw-musical-sfx-key");point.textContent="✦";point.title=(k.label||Sfx.TYPES[k.type]||"FX")+" · "+round(k.t)+"s";}
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
   var own=activeDetail();if(!own||!own.motion||!own.motion[id])return false;
   var mt=detailTrack(own,id),index=0,minimum=Infinity;
   var phase=Motion.phase(own,playhead,o.beatClock&&o.beatClock())||0;
   keys(mt).forEach(function(k,i){var d=Math.abs(num(k.t,0)-phase);if(d<minimum){minimum=d;index=i;}});
   choose(mt.id,index);return true;
  }
  var motionClip=m.animationClips.find(function(c){return c.target===id||(c.motion&&c.motion[id]);});
  if(motionClip){choose("animation:"+motionClip.id,0);return true;}
  var resolved=sceneForPart(id,o.view,0);if(!resolved||!resolved.parts)return false;source=resolved;
  var p=source.parts.find(function(item){return item.id===id;});if(!p)return false;
  var t=tracks.find(function(t){return (t.kind==="part"||t.kind==='film-part')&&t.part===id;});
  if(!t){t={id:"part:"+id,kind:resolved===film?'film-part':'part',part:id,name:p.name||id};tracks.splice(tracks.length-3,0,t);map[t.id]=t;}
  filter="all";
  var list=keys(t),at=fromFilm(playhead,t),index=0,nearest=Infinity;
  list.forEach(function(key,i){var delta=Math.abs(num(key.t,0)-at);if(delta<nearest){index=i;nearest=delta;}});
  choose(t.id,index);return true;
 }
 function beginPartMove(id,globalTime){
  if(detailClipId){
   var c=activeDetail();if(!c||!c.motion||!c.motion[id])return null;
   var t=detailTrack(c,id),beat=round(Motion.phase(c,globalTime,o.beatClock&&o.beatClock())||0);
   var list=keys(t),index=list.findIndex(function(k){return Math.abs(num(k.t,0)-beat)<.05;});
   var inserted=index<0,k=inserted?Object.assign({t:beat},Motion.sample(list,beat)||{x:0,y:0,r:0,sx:1,sy:1,opacity:1}):list[index];
   if(inserted)list.push(k);
   var oldX=num(k.x,0),oldY=num(k.y,0);
   return {update:function(dx,dy){k.x=round(oldX+dx);k.y=round(oldY+dy);o.repaint();},
    commit:function(){list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();},
    cancel:function(){if(inserted)list.splice(list.indexOf(k),1);else{k.x=oldX;k.y=oldY;}draw();o.repaint();}};
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
 function ensureFigureTrack(id){if(!id)return null;var name='figure:'+id,t=map[name];
  if(!t){if(!m.figureTransforms[id])m.figureTransforms[id]={keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,skewX:0,skewY:0,easing:'smooth'}]};
   var original=partByDeepId(id),displayName=original&&(original.name||original.id)||id;
   t={id:name,kind:'figure',part:id,name:(L===translations.da?'Hele objekt · ':'Whole object · ')+displayName};
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
 // Parts are nested (film -> act -> scene -> puppet), not only in clip 0.
 function sceneForPart(id,view,depth){if(!view||depth>16)return null;
  if(view.nodes&&view.nodes[id])return view.scene;
  var nested=null;Object.keys(view.nodes||{}).some(function(k){var n=view.nodes[k];if(n.nested){nested=sceneForPart(id,n.nested,depth+1);return !!nested;}return false;});
  if(nested)return nested;
  (view.clips||[]).some(function(c){nested=sceneForPart(id,c.view,depth+1);return !!nested;});return nested;
 }
 function partByDeepId(id){var scene=sceneForPart(id,o.view,0);return scene&&scene.parts&&scene.parts.find(function(p){return p.id===id;});}
 function isJointMove(id){var clip=activeDetail(),p=partByDeepId(id);return !!(clip&&p&&id!==clip.target);}
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
 function paintTransform(time){var c=cameraStateFor(time,activeCam(time)),w=film.width/c.zoom,h=film.height/c.zoom,
  editing=cameraEditActive&&!(o.isPlaying&&o.isPlaying());
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
 function addKeyframe(){var t=track();if(t&&['song','scene-range','audio','audio-lane','object-browser'].indexOf(t.kind)<0)newPoint(t,playhead);}
 function removeKeyframe(){var t=track();if(t&&['song','scene-range','audio','audio-lane','object-browser'].indexOf(t.kind)<0)removePoint(t);}
 draw();return {paint:paint,redraw:draw,selectPart:selectPart,selectSong:selectSong,beginPartMove:beginPartMove,
  openAnimation:openAnimation,closeAnimation:closeAnimation,inClipDetail:function(){return !!detailClipId;},getDetailClip:activeDetail,
  addKeyframe:addKeyframe,removeKeyframe:removeKeyframe,setFilter:setFilter,setZoom:setZoom,
  getZoom:function(){return zoom;},getSelection:track,
  selectFigure:selectFigure,ensureFigureTrack:ensureFigureTrack,beginFigureTransform:beginFigureTransform,figureStateFor:figureState,
  beginCameraTransform:beginCameraTransform,selectCamera:chooseCamera,activeCamera:activeCam,
  setCameraEdit:function(v){cameraEditActive=!!v;o.repaint();},cameraStateFor:cameraStateFor,
  isJointMove:isJointMove,getPartPivot:getPartPivot,
  resolvePartScene:function(id){return sceneForPart(id,o.view,0);},
  dispose:function(){if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
}
exports.attach=attach;exports.ensureMusical=ensureMusical;exports.interpolate=interpolate;
})();
