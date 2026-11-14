/*\
title: $:/plugins/huwiki/musical/editor.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Engine=require("$:/plugins/huwiki/cutout/engine.js"),NS="http://www.w3.org/2000/svg";
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
 var root=el(doc,"section","huw-musical-editor",undefined,o.host),head=el(doc,"div","huw-musical-editor-header",undefined,root);
 el(doc,"h3","",L.title,head);el(doc,"p","",L.help,root);
 var cameraLabel=el(doc,"span","huw-musical-active-camera","",head);
 var rows=el(doc,"div","huw-musical-tracks",undefined,root),inspector=el(doc,"div","huw-musical-inspector",undefined,root),status=el(doc,"output","huw-musical-edited-status","",root);
 var playhead=0,choice={id:"camera-A",key:0},playheads=[];
 var tracks=[{id:"song",kind:"song",name:L.song},{id:"backdrop",kind:"part",part:"stage-back",name:L.backdrop},{id:"stage",kind:"part",part:"stage-floor",name:L.stage},{id:"foreground",kind:"part",part:"foreground-flags",name:L.foreground},{id:"lights",kind:"light",name:L.light}];
 if(source)source.parts.filter(function(p){return /-root$/.test(p.id)&&p.keys&&p.keys.length>1;}).forEach(function(p){tracks.push({id:p.id,kind:"part",part:p.id,name:p.name||p.id});});
 tracks.push({id:"camera-A",kind:"camera",name:L.cameraA},{id:"camera-B",kind:"camera",name:L.cameraB},{id:"cuts",kind:"cut",name:L.cuts});
 var map={};tracks.forEach(function(t){map[t.id]=t;});
 function track(){return map[choice.id]||tracks[0];}
 function part(t){return source&&source.parts.find(function(p){return p.id===t.part;});}
 function target(t){if(t.kind==="part")return part(t);if(t.id==="camera-A")return film.camera;if(t.id==="camera-B")return m.cameraB;if(t.kind==="light")return m.lighting;if(t.kind==="cut")return m;return null;}
 function keys(t){var v=target(t);return v?(t.kind==="cut"?v.cuts:(v.keys||(v.keys=[]))):[];}
 function toFilm(time,t){if(t.kind!=="part")return lim(time,0,film.duration);var c=film.scenes&&film.scenes[0]||{};return lim((time-num(c.offset,0))/Math.max(.01,num(c.speed,1))+num(c.start,0),0,film.duration);}
 function fromFilm(time,t){if(t.kind!=="part")return time;var c=film.scenes&&film.scenes[0]||{};return Engine.localTime(time,source?source.duration:film.duration,c);}
 function toAudio(time){return lim(time/film.duration*o.duration(),0,o.duration());}
 function activeCam(time){var c="A";m.cuts.slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(num(k.t,0)<=time+1e-6)c=k.camera==="B"?"B":"A";});return c;}
 function cameraState(time){return Engine.cameraState({width:film.width,height:film.height,camera:activeCam(time)==="B"?m.cameraB:film.camera},time);}
 function illumination(time){return lim(interpolate(m.lighting.keys,time,"intensity",1),0,1);}
 var overlay=doc.createElementNS(NS,"rect");overlay.setAttribute("class","huw-musical-light-overlay");overlay.setAttribute("pointer-events","none");o.view.svg.appendChild(overlay);
 function paint(time){var c=cameraState(time),w=film.width/c.zoom,h=film.height/c.zoom,box={x:c.x-w/2,y:c.y-h/2,width:w,height:h};
  o.view.svg.setAttribute("viewBox",[box.x,box.y,box.width,box.height].join(" "));
  Object.keys(box).forEach(function(k){overlay.setAttribute(k,box[k]);});overlay.setAttribute("fill","#040716");overlay.setAttribute("opacity",round((1-illumination(time))*.78));
  cameraLabel.textContent=L.camera+" "+activeCam(time);playhead=time;
  playheads.forEach(function(e){e.style.left=(100*time/film.duration)+"%";});
 }
 function save(t){var isPart=t.kind==="part",name=isPart?o.stageTitle:o.sceneTitle,value=isPart?source:film,old=o.wiki.getTiddler(name);if(!old||!value)return;
  var json=JSON.stringify(value);o.markOwnWrite(name,json);o.wiki.addTiddler(new $tw.Tiddler(old,{title:name,text:json}));status.textContent=L.saved;
 }
 function choose(id,key){choice={id:id,key:key};draw();}
 function selected(){return keys(track())[choice.key];}
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
 function formSelect(k,label,field,options){var p=el(doc,"label","huw-musical-property",undefined,inspector);el(doc,"span","",label,p);
  var select=el(doc,"select","",undefined,p);options.forEach(function(option){var x=el(doc,"option","",option[1],select);x.value=option[0];});
  select.value=k[field]||options[0][0];select.onchange=function(){k[field]=select.value;save(track());draw();o.repaint();};
 }
 function drawForm(){inspector.textContent="";var t=track(),k=selected();el(doc,"strong","",t.name,inspector);
  if(t.kind==="song"){el(doc,"p","",L.readonly,inspector);return;}
  var actions=el(doc,"div","huw-musical-key-actions",undefined,inspector),add=el(doc,"button","",L.add,actions),del=el(doc,"button","",L.remove,actions);
  add.type=del.type="button";add.onclick=function(){newPoint(t,playhead);};del.disabled=!k;del.onclick=function(){removePoint(t);};
  if(!k){el(doc,"p","",L.empty,inspector);return;}
  formNumber(k,L.time,"t",.05,0,film.duration);
  if(t.kind==="part"){
   formNumber(k,L.x,"x",1,-10000,10000);formNumber(k,L.y,"y",1,-10000,10000);formNumber(k,L.r,"r",1,-3600,3600);
   formNumber(k,L.opacity,"opacity",.05,0,1);formNumber(k,"Scale X","sx",.05,.01,16);formNumber(k,"Scale Y","sy",.05,.01,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="camera"){
   formNumber(k,L.x,"x",1,-5000,5000);formNumber(k,L.y,"y",1,-5000,5000);formNumber(k,L.zoom,"zoom",.1,.25,16);
   formSelect(k,L.easing,"easing",[["smooth",L.smooth],["linear",L.linear],["step",L.step]]);
  }else if(t.kind==="light")formNumber(k,L.intensity,"intensity",.05,0,1);
  else if(t.kind==="cut")formSelect(k,L.camera,"camera",[["A",L.cameraA],["B",L.cameraB]]);
 }
 function draw(){rows.textContent="";playheads=[];
  tracks.forEach(function(t){var row=el(doc,"div","huw-musical-track",undefined,rows);if(t.id===choice.id)row.classList.add("is-selected");
   var title=el(doc,"div","huw-musical-lane-title",t.name,row);title.onclick=function(){choose(t.id,t.id===choice.id?choice.key:0);};
   var lane=el(doc,"div","huw-musical-lane",undefined,row);
   lane.onclick=function(ev){if(ev.target.closest&&ev.target.closest(".huw-musical-key"))return;
    var rect=lane.getBoundingClientRect(),u=lim((ev.clientX-rect.left)/Math.max(1,rect.width),0,1);
    o.seek(toAudio(u*film.duration));if(choice.id!==t.id)choose(t.id,0);
   };
   if(t.kind==="song"||t.id==="stage"){
    var block=el(doc,"div","huw-musical-block",t.kind==="song"?o.scoreTitle:"",lane);block.title=t.name;
   }
   keys(t).forEach(function(k,index){var point=el(doc,"button","huw-musical-key",undefined,lane);point.type="button";
    point.style.left=(100*toFilm(k.t,t)/film.duration)+"%";
    point.title=t.name+" · "+round(k.t)+"s";point.setAttribute("aria-label",point.title);
    if(t.id===choice.id&&index===choice.key)point.classList.add("is-selected");
    point.onclick=function(ev){ev.stopPropagation();ev.preventDefault();choose(t.id,index);o.seek(toAudio(toFilm(k.t,t)));};
    point.onpointerdown=function(ev){if(ev.button!==undefined&&ev.button!==0)return;ev.stopPropagation();
     var start=num(k.t,0),rect=lane.getBoundingClientRect(),moved=false;
     if(point.setPointerCapture)point.setPointerCapture(ev.pointerId);
     function move(e){var u=lim((e.clientX-rect.left)/Math.max(1,rect.width),0,1);var v=round(fromFilm(u*film.duration,t));
      if(Math.abs(v-start)<.02&&!moved)return;moved=true;k.t=v;point.style.left=(100*toFilm(k.t,t)/film.duration)+"%";
      o.seek(toAudio(toFilm(k.t,t)));
     }
     function finish(cancel){point.removeEventListener("pointermove",move);point.removeEventListener("pointerup",done);point.removeEventListener("pointercancel",abort);
      if(cancel)k.t=start;else if(moved){var list=keys(t);list.sort(function(a,b){return a.t-b.t;});choice={id:t.id,key:list.indexOf(k)};save(t);}
      if(moved)draw();o.repaint();
     }
     function done(){finish(false);}function abort(){finish(true);}
     point.addEventListener("pointermove",move);point.addEventListener("pointerup",done);point.addEventListener("pointercancel",abort);
    };
   });
   var cursor=el(doc,"div","huw-musical-lane-cursor",undefined,lane);cursor.style.left=(100*playhead/film.duration)+"%";playheads.push(cursor);
  });
  drawForm();
 }
 draw();return {paint:paint,redraw:draw,dispose:function(){if(overlay.parentNode)overlay.parentNode.removeChild(overlay);}};
}
exports.attach=attach;exports.ensureMusical=ensureMusical;exports.interpolate=interpolate;
})();