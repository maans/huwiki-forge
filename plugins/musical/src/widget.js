/*\
title: $:/plugins/huwiki/musical/widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var Engine=require("$:/plugins/huwiki/cutout/engine.js");
var Loader=require("$:/plugins/huwiki/abc/loader.js");
var Audio=require("$:/plugins/huwiki/abc/audio-controller.js");
var Playback=require("$:/plugins/huwiki/abc/playback.js");
var Accompaniment=require("$:/plugins/huwiki/abc/accompaniment.js");
var StartPosition=require("$:/plugins/huwiki/abc/start-position.js");
var Timeline=require("$:/plugins/huwiki/musical/sync.js").Timeline;
var Editor=require("$:/plugins/huwiki/musical/editor.js");
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
function Musical(tree,options){this.initialise(tree,options);}
Musical.prototype=new Widget();
Musical.prototype.execute=function(){
 this.sceneTitle=this.getAttribute("scene","Musical – Tændstikorkestret (film)");
 this.scoreTitle=this.getAttribute("score","Musical – Tændstikorkestret (ABC)");
};
function node(doc,tag,cls,text,parent){
 if(text&&typeof text==="object"&&text.nodeType===1&&parent===undefined){parent=text;text=undefined;}
 var el=doc.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 if(parent)parent.appendChild(el);return el;
}
function labels(wiki){
 var code=wiki.getTiddlerText("$:/language","");
 var en=/\/en(?:-|$)/i.test(code);
 return en?{
  play:"▶ Play",pause:"Ⅱ Pause",stop:"■ Stop",loading:"Preparing sound …",
  error:"Playback unavailable: ",scene:"Scene",score:"Score",camera:"Camera shots",
  timeline:"Playback position",tempo:"Tempo",editScene:"Edit scene and camera in CutOut",
  editScore:"Edit ABC music",missing:"The scene or score is missing.",
  ready:"Ready · camera and animation follow the music",finish:"Finished"
 }:{
  play:"▶ Afspil",pause:"Ⅱ Pause",stop:"■ Stop",loading:"Klargør lyd …",
  error:"Afspilning ikke mulig: ",scene:"Scene",score:"Noder",camera:"Kameraindstillinger",
  timeline:"Afspilningsposition",tempo:"Tempo",editScene:"Redigér scene og kamera i CutOut",
  editScore:"Redigér ABC-musik",missing:"Scenen eller noderne mangler.",
  ready:"Klar · kamera og animation følger musikken",finish:"Færdig"
 };
}
Musical.prototype.render=function(parent,next){
 this.parentDomNode=parent;this.computeAttributes();this.execute();
 var self=this,doc=this.document,L=labels(this.wiki);
 var host=node(doc,"section","huw-musical");
 this.host=host;this._dead=false;this._frame=0;this._audio=null;this._pendingSeek=null;this._ownWritten={};this._editor=null;
 parent.insertBefore(host,next);this.domNodes.push(host);
 var scene=Engine.readScene(this.wiki,this.sceneTitle);
 if(!scene){node(doc,"p","huw-musical-error",L.missing,host);return;}
 var clips=Playlist.reflow(scene.musical&&scene.musical.songs,this.scoreTitle);
 var songs=clips.map(function(c){
  var item=self.wiki.getTiddler(c.score),fields=item?item.fields:{};
  var source=fields["abc-source"]||fields.text||"";
  return {clip:c,title:c.score,source:source,fields:fields,events:[],tune:null,controller:null,page:null};
 });
 this._playlistTitles=songs.map(function(s){return s.title;});
 if(!songs.length||songs.some(function(s){return !s.source.trim();})){
  node(doc,"p","huw-musical-error","En scene eller et nodeark mangler. / Missing scene or score.",host);return;
 }
 var layout=node(doc,"div","huw-musical-layout",host);
 var stagePanel=node(doc,"div","huw-musical-stage",layout);
 node(doc,"h3","huw-musical-subtitle",L.scene,stagePanel);
 var stage=node(doc,"div","huw-musical-canvas",stagePanel);
 var view=Engine.build(doc,this.wiki,scene);
 this._view=view;stage.appendChild(view.svg);Engine.paint(view,0);
 var scorePanel=node(doc,"div","huw-musical-score",layout);
 node(doc,"h3","huw-musical-subtitle",L.score,scorePanel);
 var paper=node(doc,"div","huw-musical-paper",scorePanel);
 songs.forEach(function(song,i){
  song.page=node(doc,"div","huw-musical-score-page",undefined,paper);
  song.page.hidden=i!==0;song.page.setAttribute("data-song-index",String(i));
 });
 var transport=node(doc,"div","huw-musical-transport",host);
 var play=node(doc,"button","huw-musical-play",L.play,transport);play.type="button";play.disabled=true;
 var stop=node(doc,"button","huw-musical-stop",L.stop,transport);stop.type="button";
 var time=node(doc,"input","huw-musical-range",undefined,transport);
 time.type="range";time.min="0";time.max=String(Playlist.total(clips));time.step=".01";
 time.value="0";time.setAttribute("aria-label",L.timeline);
 var clock=node(doc,"output","huw-musical-time","0:00",transport);
 var speed=node(doc,"select","huw-musical-speed",undefined,transport);
 speed.setAttribute("aria-label",L.tempo);
 [["75","75 %"],["100","100 %"],["125","125 %"]].forEach(function(row){
  var option=node(doc,"option","",row[1],speed);option.value=row[0];
 });speed.value="100";
 var state=node(doc,"p","huw-musical-status",L.loading,host);
 state.setAttribute("role","status");state.setAttribute("aria-live","polite");
 var shots=node(doc,"div","huw-musical-shots",host);
 node(doc,"strong","",L.camera+": ",shots);
 var links=node(doc,"div","huw-musical-links",host);
 [[L.editScene,"HUWiki CutOut – Studio"],[L.editScore,this.scoreTitle]].forEach(function(row){
  var a=node(doc,"a","",row[0],links);
  a.setAttribute("href","#"+encodeURIComponent(row[1]));
  a.setAttribute("data-tiddler-title",row[1]);
  a.addEventListener("click",function(event){
   event.preventDefault();
   if($tw.rootWidget)$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:row[1],navigateFromTitle:self.scoreTitle});
  });
 });
 function alive(){return !self._dead&&host.isConnected!==false;}
 function timeLabel(n){var s=Math.floor(Math.max(0,n));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
 var duration=Math.max(.1,Playlist.total(clips)),timeline=null,ready=false,controller=null,activeIndex=0,stopping=false;
 var editor=null,noteIndex=-1,notes=[],cursorLine=null;
 this._stageTitle=scene.scenes&&scene.scenes[0]&&scene.scenes[0].source||null;
 function clearNotes(){
  notes.forEach(function(n){if(n.classList)n.classList.remove("huw-musical-note-active");});notes=[];
  if(cursorLine&&cursorLine.parentNode)cursorLine.parentNode.removeChild(cursorLine);cursorLine=null;
 }
 function showNotes(t){
  var noteEvents=songs[activeIndex].events||[];
  if(!noteEvents.length)return;
  var ms=Math.max(0,(Number(t)-clips[activeIndex].start)||0)*1000,lo=0,hi=noteEvents.length;
  while(lo<hi){var mid=(lo+hi)>>1;if(noteEvents[mid].milliseconds<=ms+3)lo=mid+1;else hi=mid;}
  var index=Math.max(0,lo-1);if(index===noteIndex)return;noteIndex=index;clearNotes();
  (noteEvents[index].elements||[]).forEach(function(group){(Array.isArray(group)?group:[group]).forEach(function(n){
   if(n&&n.classList){n.classList.add("huw-musical-note-active");notes.push(n);}
  });});
  var first=notes.find(function(n){return n.getBoundingClientRect&&n.getBoundingClientRect().height>0;});
  var svg=first&&first.ownerSVGElement;
  if(svg){
   var rect=first.getBoundingClientRect(),staff=first.closest&&first.closest(".abcjs-staff-wrapper"),box=staff?staff.getBoundingClientRect():rect,matrix=svg.getScreenCTM&&svg.getScreenCTM();
   if(matrix){
    var x=svg.createSVGPoint(),y=svg.createSVGPoint();x.x=y.x=rect.left-4;x.y=box.top-6;y.y=box.bottom+6;
    x=x.matrixTransform(matrix.inverse());y=y.matrixTransform(matrix.inverse());
    cursorLine=doc.createElementNS("http://www.w3.org/2000/svg","line");cursorLine.setAttribute("class","huw-musical-note-cursor");
    cursorLine.setAttribute("x1",x.x);cursorLine.setAttribute("x2",y.x);cursorLine.setAttribute("y1",x.y);cursorLine.setAttribute("y2",y.y);svg.appendChild(cursorLine);
   }
   var panel=scorePanel.getBoundingClientRect();
   if(rect.top<panel.top+35||rect.bottom>panel.bottom-16)scorePanel.scrollTop+=rect.top-panel.top-90;
  }
 }
 function showSong(index){
  songs.forEach(function(song,i){song.page.hidden=i!==index;});
  host.dataset.activeSong=songs[index].title;
  noteIndex=-1;clearNotes();showNotes(timeline?timeline.value():0);
 }
 function paint(t){
  var visualTime=Math.max(0,Math.min(scene.duration,t/Math.max(.1,duration)*scene.duration));
  Engine.paint(view,visualTime);
  if(editor)editor.paint(visualTime);
  showNotes(t);
  if(doc.activeElement!==time)time.value=String(t);
  clock.textContent=timeLabel(t)+" / "+timeLabel(duration);
  host.dataset.cameraTime=visualTime.toFixed(2);
 }
 timeline=new Timeline(duration,paint);
 function frame(){
  self._frame=0;if(!alive()||!timeline.running)return;
  paint(timeline.value());
  self._frame=requestAnimationFrame(frame);
 }
 function startFrames(){if(!self._frame&&alive())self._frame=requestAnimationFrame(frame);}
 function stopFrames(){if(self._frame)cancelAnimationFrame(self._frame);self._frame=0;}
 function setPlaying(yes){
  play.textContent=yes?L.pause:L.play;play.setAttribute("aria-pressed",String(yes));
  if(yes)startFrames();else stopFrames();
 }
 function fail(e){if(!alive())return;state.textContent=L.error+(e&&e.message||String(e));state.classList.add("huw-musical-error");play.disabled=!ready;}
 function switchSong(index,target,autoplay){
  if(index<0||index>=songs.length)return;
  if(index!==activeIndex){
   var prior=controller;
   activeIndex=index;controller=songs[index].controller;
   if(prior){Playback.unregister(prior);if(prior.isStarted)prior.pause();}
   if(controller)Playback.register(controller);
   noteIndex=-1;clearNotes();
  }
  if(timeline.running){timeline.pause();setPlaying(false);}
  timeline.seek(target);self._pendingSeek=target;
  showSong(index);paint(target);
  if(controller&&controller.isLoaded&&controller.timer){
   if(StartPosition.seek(controller,songs[index].tune,Math.max(0,target-clips[index].start)*1000))self._pendingSeek=null;
  }
  if(autoplay&&controller){state.textContent=L.loading;controller.play().catch(fail);}
 }
 function seek(seconds){
  seconds=Math.max(0,Math.min(duration,Number(seconds)||0));
  var at=Playlist.locate(clips,seconds),wasPlaying=!!(controller&&controller.isStarted);
  if(at.index<0)return;
  if(at.index!==activeIndex)switchSong(at.index,seconds,wasPlaying);
  else{
   timeline.seek(seconds);self._pendingSeek=seconds;showNotes(seconds);
   if(controller&&controller.isLoaded&&controller.timer&&songs[activeIndex].tune){
    if(StartPosition.seek(controller,songs[activeIndex].tune,at.local*1000))self._pendingSeek=null;
   }
  }
 }
 function stopAll(){
  stopping=true;
  songs.forEach(function(song){if(song.controller)Playback.stopOne(song.controller);});
  if(controller)Playback.unregister(controller);
  activeIndex=0;controller=songs[0].controller;if(controller)Playback.register(controller);
  timeline.pause();timeline.seek(0);self._pendingSeek=0;
  noteIndex=-1;clearNotes();showSong(0);setPlaying(false);state.textContent=L.ready;
  stopping=false;
 }
 stop.onclick=stopAll;
 play.onclick=function(){
  if(!ready||!controller)return;
  if(controller.isStarted){controller.pause();return;}
  if(timeline.value()>=duration-.001)seek(0);
  state.textContent=L.loading;
  controller.play().then(function(){if(alive()&&controller&&controller.isStarted)state.textContent=L.ready;}).catch(fail);
 };
 time.addEventListener("input",function(){seek(Number(time.value));});
 speed.addEventListener("change",function(){
  var rate=Number(speed.value)/100;
  timeline.setRate(rate);
  songs.forEach(function(song){if(song.controller)song.controller.setWarp(Number(speed.value)).catch(fail);});
 });
 (scene.camera&&scene.camera.keys||[]).forEach(function(key,i){
  var at=Math.max(0,Math.min(scene.duration,Number(key.t)||0));
  var btn=node(doc,"button","huw-musical-shot",key.label||("◆ "+(i+1)),shots);
  btn.type="button";btn.title=at.toFixed(2)+" s";
  btn.onclick=function(){seek(at/scene.duration*duration);};
 });
 this._shutdown=function(){
  self._dead=true;stopFrames();clearNotes();if(editor)editor.dispose();
  songs.forEach(function(song){
   var c=song.controller;if(!c)return;c._disposed=true;Playback.unregister(c);
   try{c.destroy();}catch(_ignored){}
  });controller=null;
 };
 editor=Editor.attach({doc:doc,host:host,wiki:this.wiki,film:scene,view:view,sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,scoreTitle:this.scoreTitle,
  duration:function(){return duration;},clips:function(){return clips;},seek:seek,
  repaint:function(){paint(timeline.value());},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._editor=editor;
 Loader.load().then(function(ABC){
  if(!alive())return;
  if(!ABC.synth||!ABC.synth.supportsAudio||!ABC.synth.supportsAudio())
   throw Error("Web Audio is not available in this browser.");
  songs.forEach(function(song){
   var parsed=ABC.renderAbc(song.page,song.source,{responsive:"resize",add_classes:true});
   song.tune=parsed&&parsed[0];
   if(!song.tune)throw Error("ABC notation could not be rendered: "+song.title);
   var seconds=typeof song.tune.getTotalTime==="function"?Number(song.tune.getTotalTime()):NaN;
   if(!(seconds>0)){if(typeof song.tune.setTiming==="function")song.tune.setTiming();
    var ev=song.tune.noteTimings||[];
    if(ev.length)seconds=Number(ev[ev.length-1].milliseconds)/1000;
   }
   if(seconds>0&&Number.isFinite(seconds))song.clip.duration=seconds;
   try{if(!song.tune.noteTimings&&typeof song.tune.setTiming==="function")song.tune.setTiming();}catch(_ignored){}
   song.events=(song.tune.noteTimings||[]).filter(function(e){return e&&Number.isFinite(Number(e.milliseconds))&&e.elements&&e.elements.length;})
    .slice().sort(function(a,b){return a.milliseconds-b.milliseconds;});
   var config=Accompaniment.read(song.fields);
   if(typeof Accompaniment.prepare==="function")Accompaniment.prepare(ABC,song.tune,song.source,config,true,song.fields);
  });
  clips=Playlist.reflow(songs.map(function(song){return song.clip;}),self.scoreTitle);
  songs.forEach(function(song,i){song.clip=clips[i];});
  duration=Math.max(.1,Playlist.total(clips));timeline.duration=duration;time.max=String(duration);
  showSong(0);paint(0);
  var soundfont=self.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim();
  return Promise.all(songs.map(function(song,index){
   var config=Accompaniment.read(song.fields);
   var native=node(doc,"div","huw-musical-native",undefined,host);
   var c=Audio.install(new ABC.synth.SynthController(),ABC,{
    wiki:self.wiki,getConfig:function(){return config;},isCurrent:alive,
    beforePlay:function(){
     if(self._pendingSeek===null||index!==activeIndex)return;
     var pos=Playlist.locate(clips,self._pendingSeek);
     if(pos.index===index&&StartPosition.seek(c,song.tune,pos.local*1000))self._pendingSeek=null;
    },
    onError:fail,
    onStop:function(paused){
     if(!alive()||stopping||index!==activeIndex)return;
     timeline.pause();setPlaying(false);
     if(!paused){timeline.seek(0);noteIndex=-1;clearNotes();}
    }
   });
   song.controller=c;
   c.load(native,{
    onStart:function(){
     if(!alive()||stopping||index!==activeIndex)return;
     Playback.start(c);timeline.play();setPlaying(true);
     state.textContent=L.ready;
    },
    onFinished:function(){
     if(!alive()||stopping||index!==activeIndex)return;
     if(index<songs.length-1){
      timeline.pause();setPlaying(false);
      switchSong(index+1,clips[index+1].start,true);
     }else{timeline.finish();setPlaying(false);state.textContent=L.finish;}
    },
    onBeat:function(beat,total){
     if(!alive()||index!==activeIndex)return;
     if(Number.isFinite(Number(beat))&&Number(total)>0){
      timeline.beatPosition(Playlist.at(clips,index,clips[index].duration*Number(beat)/Number(total)));
     }
    },
    onEvent:function(evt){
     if(!alive()||index!==activeIndex||!evt)return;
     if(Number.isFinite(Number(evt.milliseconds)))showNotes(clips[index].start+Number(evt.milliseconds)/1000);
    }
   },{displayPlay:false,displayLoop:false,displayRestart:false,displayProgress:false,displayWarp:false});
   return c.setTune(song.tune,false,{soundFontUrl:soundfont});
  })).then(function(){
   if(!alive())return;
   controller=songs[0].controller;self._audio=controller;Playback.register(controller);
   ready=true;play.disabled=false;state.textContent=L.ready;
  });
 }).catch(fail);
};
Musical.prototype.removeChildDomNodes=function(){
 if(this._shutdown)this._shutdown();
 Widget.prototype.removeChildDomNodes.call(this);
};
Musical.prototype.refresh=function(changed){
 var attributes=this.computeAttributes();
 var own=this._ownWritten||{},self=this;
 function externalChange(title){
  if(!title||!changed[title])return false;
  if(Object.prototype.hasOwnProperty.call(own,title)&&own[title]===self.wiki.getTiddlerText(title,"")){delete own[title];return false;}
  delete own[title];return true;
 }
 if(Object.keys(attributes).length||externalChange(this.sceneTitle)||externalChange(this._stageTitle)||changed[this.scoreTitle]||changed["$:/language"]||(this._playlistTitles||[]).some(function(t){return changed[t];})){
  this.refreshSelf();return true;
 }
 return false;
};
exports["musical-stage"]=Musical;
})();