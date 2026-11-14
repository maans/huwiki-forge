/*\
title: $:/plugins/huwiki/musical/editor.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Playlist=require("$:/plugins/huwiki/musical/playlist.js"),Engine=require("$:/plugins/huwiki/cutout/engine.js"),NS="http://www.w3.org/2000/svg";
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
 var rows=el(doc,"div","huw-musical-tracks",undefined,root),inspector=el(doc,"div","huw-musical-inspector",undefined,root),status=el(doc,"output","huw-musical-edited-status","",root);
 var playhead=0,choice={id:"song:"+m.songs[0].id,key:0},playheads=[],filter="all",zoom=1;
 var tracks=[{id:"song",kind:"song",name:L.song},{id:"backdrop",kind:"part",part:"stage-back",name:L.backdrop},{id:"stage",kind:"part",part:"stage-floor",name:L.stage},{id:"foreground",kind:"part",part:"foreground-flags",name:L.foreground},{id:"lights",kind:"light",name:L.light}];
 if(source)source.parts.filter(function(p){return /-root$/.test(p.id)&&p.keys&&p.keys.length>1;}).forEach(function(p){tracks.push({id:p.id,kind:"part",part:p.id,name:p.name||p.id});});
 tracks.push({id:"camera-A",kind:"camera",name:L.cameraA},{id:"camera-B",kind:"camera",name:L.cameraB},{id:"cuts",kind:"cut",name:L.cuts});
 var map={};tracks.forEach(function(t){map[t.id]=t;});
 function songTracks(){return m.songs.map(function(s,i){return {id:"song:"+s.id,kind:"song",index:i,name:"♫ "+(i+1)+". "+s.score};});}
 function group(t){return t.kind==="song"?"music":(t.kind==="camera"||t.kind==="cut")?"camera":(t.id==="lights"||["backdrop","stage","foreground"].indexOf(t.id)>=0)?"scene":"animation";}
 function track(){return songTracks().find(function(s){return s.id===choice.id;})||map[choice.id]||songTracks()[0]||tracks[0];}
 function axisDuration(){return Math.max(1,o.duration(),film.duration,Playlist.total(m.songs));}
 function part(t){return source&&source.parts.find(function(p){return p.id===t.part;});}
 function target(t){if(t.kind==="part")return part(t);if(t.id==="camera-A")return film.camera;if(t.id==="camera-B")return m.cameraB;if(t.kind==="light")return m.lighting;if(t.kind==="cut")return m;return null;}
 function keys(t){var v=target(t);return v?(t.kind==="cut"?v.cuts:(v.keys||(v.keys=[]))):[];}
 function toFilm(time,t){if(t.kind!=="part")return lim(time,0,film.duration);var c=film.scenes&&film.scenes[0]||{};return lim((time-num(c.offset,0))/Math.max(.01,num(c.speed,1))+num(c.start,0),0,film.duration);}
 function fromFilm(time,t){if(t.kind!=="part")return time;var c=film.scenes&&film.scenes[0]||{};return Engine.localTime(time,source?source.duration:film.duration,c);}
 function toAudio(time){return lim(time,0,o.duration());}
 function activeCam(time){var c="A";m.cuts.slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(num(k.t,0)<=time+1e-6)c=k.camera==="B"?"B":"A";});return c;}
 function cameraState(time){return Engine.cameraState({width:film.width,height:film.height,camera:activeCam(time)==="B"?m.cameraB:film.camera},time);}
 function illumination(time){return lim(interpolate(m.lighting.keys,time,"intensity",1),0,1);}
 var overlay=doc.createElementNS(NS,"rect");overlay.setAttribute("class","huw-musical-light-overlay");overlay.setAttribute("pointer-events","none");o.view.svg.appendChild(overlay);
 function paint(time){var c=cameraState(time),w=film.width/c.zoom,h=film.height/c.zoom,box={x:c.x-w/2,y:c.y-h/2,width:w,height:h};
  o.view.svg.setAttribute("viewBox",[box.x,box.y,box.width,box.height].join(" "));
  Object.keys(box).forEach(function(k){overlay.setAttribute(k,box[k]);});overlay.setAttribute("fill","#040716");overlay.setAttribute("opacity",round((1-illumination(time))*.78));
  cameraLabel.textContent=L.camera+" "+activeCam(time);playhead=time;
  playheads.forEach(function(e){e.style.left=(100*time/axisDuration())+"%";});
 }
 function save(t){var isPart=t.kind==="part",name=isPart?o.stageTitle:o.sceneTitle,value=isPart?source:film,old=o.wiki.getTiddler(name);if(!old||!value)return;
  var json=JSON.stringify(value);o.markOwnWrite(name,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:name,text:json}));status.textContent=L.saved;
 }
 function choose(id,key){choice={id:id,key:key};draw();if(o.onSelect)o.onSelect(track());}
 function selected(){return track().kind==="song"?m.songs[track().index]:keys(track())[choice.key];}
 function newPoint(t,time){if(t.kind==="song")return;var at=round(fromFilm(time,t)),list=keys(t),known=list.findIndex(function(k){return Math.abs(k.t-at)<.02;});if(known>=0){choose(t.id,known);return;}
  var k={t:at};if(t.kind==="part"){
   var state=Engine.state(part(t),at);["x","y","r","sx","sy","opacity"].forEach(function(field){k[field]=round(num(state[field],1));});
  }else if(t.kind==="camera"){
   var cam=Engine.cameraState({width:film.width,height:film.height,camera:target(t)},at);k.x=round(cam.x);k.y=round(cam.y);k.zoom=round(cam.zoom);k.easing="smooth";
  }else if(t.kind==="light")k.intensity=round(illumination(at));else if(t.kind==="cut")k.camera=activeCam(at);
  list.push(k);list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);draw();o.repaint();
 }
 function removePoint(t){var list=keys(t);if(!list[choice.key])return;list.splice(choice.key,1);choice.key=Math.max(0,Math.min(choice.key,list.length-1));save(t);draw();o.repaint();}
 function formNumber(k,label,field,step,min,max){var p=el(doc,"label","huw-musical-property",undefined,inspector);el(doc,"span","",label,p);
  var input=el(doc,"input","",undefined,p);input.type="number";input.step=step;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
  input.value=round(num(k[field],0));input.onchange=function(){var value=Number(input.value);if(!Number.isFinite(value))return;
   if(min!==undefined)value=Math.max(min,value);if(max!==undefined)value=Math.min(max,value);k[field]=field==="t"?round(value):value;
   var t=track();if(field==="t"){var list=keys(t);list.sort(function(a,b){return a.t-b.t;});choice.key=list.indexOf(k);}
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
  var actions=el(doc,"div","huw-musical-key-actions",undefined,inspector),add=el(doc,"button","",L.add,actions),del=el(doc,"button","",L.remove,actions);
  add.type=del.type="button";add.onclick=function(){newPoint(t,playhead);};del.disabled=!k;del.onclick=function(){removePoint(t);};
  if(!k){el(doc,"p","",L.empty,inspector);return;}
  formNumber(k,L.time,"t",.05,0,film.duration);
  if(t.kind==="part"){
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
 function draw(){rows.textContent="";playheads=[];
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
   if(t.kind==="song"){
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
  });
  drawForm();
 }
 function selectPart(id){
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
  var t=tracks.find(function(t){return t.kind==="part"&&t.part===id;});
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
 function setFilter(value){filter=["all","music","camera","animation","scene"].indexOf(value)>=0?value:"all";draw();}
 function setZoom(value){zoom=lim(value,1,5);rows.style.setProperty("--musical-zoom",String(zoom));draw();}
 function addKeyframe(){var t=track();if(t&&t.kind!=="song")newPoint(t,playhead);}
 function removeKeyframe(){var t=track();if(t&&t.kind!=="song")removePoint(t);}
 draw();return {paint:paint,redraw:draw,selectPart:selectPart,beginPartMove:beginPartMove,
  addKeyframe:addKeyframe,removeKeyframe:removeKeyframe,setFilter:setFilter,setZoom:setZoom,
  getZoom:function(){return zoom;},getSelection:track,
  dispose:function(){if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
}
exports.attach=attach;exports.ensureMusical=ensureMusical;exports.interpolate=interpolate;
})();