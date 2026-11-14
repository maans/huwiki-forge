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
var Workspace=require("$:/plugins/huwiki/musical/workspace.js");
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
 this._songStates=songs;
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
 var links=node(doc,"div","huw-musical-links",host),scoreLink=null;
 [[L.editScene,"HUWiki CutOut – Studio"],[L.editScore,this.scoreTitle]].forEach(function(row){
  var a=node(doc,"a","",row[0],links);if(row[1]===self.scoreTitle)scoreLink=a;
  a.setAttribute("href","#"+encodeURIComponent(row[1]));
  a.setAttribute("data-tiddler-title",row[1]);
  a.addEventListener("click",function(event){
   event.preventDefault();
   var title=row[1]===self.scoreTitle?songs[activeIndex].title:row[1];
   if($tw.rootWidget)$tw.rootWidget.dispatchEvent({type:"tm-navigate",navigateTo:title,navigateFromTitle:self.scoreTitle});
  });
 });
 function alive(){return !self._dead&&host.isConnected!==false;}
 function timeLabel(n){var s=Math.floor(Math.max(0,n));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
 var duration=Math.max(.1,Playlist.total(clips),Number(scene.duration)||0),timeline=null,ready=false,controller=null,activeIndex=0,stopping=false,changingSpeed=false;
 var editor=null,workspace=null,session=null,preparing=false,generation=0,lastGainUpdate=0,visibleKey="";
 this._stageTitle=scene.scenes&&scene.scenes[0]&&scene.scenes[0].source||null;
 songs.forEach(function(s){s.cursor={index:-1,notes:[],line:null};s.gain=0;s.appliedGain=-1;s.starting=false;s.finished=false;});
 function clearNotes(index){
  (index===undefined?songs:[songs[index]]).forEach(function(song){
   if(!song)return;
   var c=song.cursor;
   c.notes.forEach(function(n){if(n&&n.classList)n.classList.remove("huw-musical-note-active");});
   c.notes=[];
   if(c.line&&c.line.parentNode)c.line.parentNode.removeChild(c.line);c.line=null;c.index=-1;
  });
 }
 function showNotes(index,t){
  var song=songs[index],events=song&&song.events||[],local=Number(t)-clips[index].start;
  if(!events.length)return;
  var ms=Math.max(0,local)*1000,lo=0,hi=events.length;
  while(lo<hi){var mid=(lo+hi)>>1;if(events[mid].milliseconds<=ms+3)lo=mid+1;else hi=mid;}
  var pos=Math.max(0,lo-1),cursor=song.cursor;
  if(pos===cursor.index)return;
  clearNotes(index);cursor.index=pos;
  (events[pos].elements||[]).forEach(function(group){(Array.isArray(group)?group:[group]).forEach(function(n){
   if(n&&n.classList){n.classList.add("huw-musical-note-active");cursor.notes.push(n);}
  });});
  var first=cursor.notes.find(function(n){return n.getBoundingClientRect&&n.getBoundingClientRect().height>0;});
  var svg=first&&first.ownerSVGElement;
  if(svg){
   var rect=first.getBoundingClientRect(),staff=first.closest&&first.closest(".abcjs-staff-wrapper"),
    bounds=staff?staff.getBoundingClientRect():rect,ctm=svg.getScreenCTM&&svg.getScreenCTM();
   if(ctm){
    var a=svg.createSVGPoint(),b=svg.createSVGPoint();a.x=b.x=rect.left-4;a.y=bounds.top-6;b.y=bounds.bottom+6;
    a=a.matrixTransform(ctm.inverse());b=b.matrixTransform(ctm.inverse());
    cursor.line=doc.createElementNS("http://www.w3.org/2000/svg","line");cursor.line.setAttribute("class","huw-musical-note-cursor");
    cursor.line.setAttribute("x1",a.x);cursor.line.setAttribute("x2",b.x);
    cursor.line.setAttribute("y1",a.y);cursor.line.setAttribute("y2",b.y);svg.appendChild(cursor.line);
   }
   // Keep the score readable but never steal scroll from a hidden score.
   if(!song.page.hidden){var panel=scorePanel.getBoundingClientRect();
    if(rect.top<panel.top+35||rect.bottom>panel.bottom-16)scorePanel.scrollTop+=rect.top-panel.top-90;}
  }
 }
 function showSong(t){
  var active=Playlist.activeAt(clips,t),primary=Playlist.locate(clips,t),i=primary.index;
  if(i<0)return;
  activeIndex=i;controller=songs[i].controller||null;self._audio=controller;
  var visible=active.length?active.map(function(v){return v.index;}):[i],key=visible.join(",");
  if(key!==visibleKey){visibleKey=key;songs.forEach(function(song,j){song.page.hidden=visible.indexOf(j)<0;});}
  host.dataset.activeSong=songs[i].title;
  host.dataset.activeSongCount=String(visible.length);
  if(scoreLink){scoreLink.setAttribute("href","#"+encodeURIComponent(songs[i].title));
   scoreLink.setAttribute("data-tiddler-title",songs[i].title);}
  visible.forEach(function(j){showNotes(j,t);});
 }
 function trackConfig(song){
  // ABCJS' original synth and FluidSynth fallback both expose mixer
  // GainNodes through midiBuffer.setVolumes(). Multiply *all* parts:
  // the clip is an entire musical number, never one instrument voice.
  var config=Object.assign({},song.config||{}),scale=typeof song.gain==="number"?song.gain:0;
  ["melodyVolume","bassVolume","chordVolume","drumVolume","metronomeVolume","droneVolume"].forEach(function(key){
   var v=Number(config[key]);if(Number.isFinite(v))config[key]=Math.max(0,Math.min(100,Math.round(v*scale)));
  });
  return config;
 }
 function applyGains(t,force){
  // Existing ABC mixers smooth GainNode changes with setTargetAtTime.
  // Throttled gain updates avoid per-frame reallocation on mobile Safari.
  var now=performance.now();
  if(!force&&now-lastGainUpdate<28)return;lastGainUpdate=now;
  songs.forEach(function(song,i){
   var gain=Playlist.gainAt(clips[i],t);
   song.gain=gain;
   if(song.controller&&song.controller.isLoaded&&song.controller.midiBuffer&&
      typeof song.controller.midiBuffer.setVolumes==="function"&&
      (force||Math.abs(gain-song.appliedGain)>.008)){
    song.appliedGain=gain;
    song.controller.midiBuffer.setVolumes();
   }
  });
 }
 function paint(t){
  var visualTime=Math.max(0,Math.min(scene.duration,t));
  Engine.paint(view,visualTime);
  if(editor)editor.paint(t);
  showSong(t);applyGains(t,false);
  if(timeline&&timeline.running)syncAudio(t);
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
 function pauseAll(){
  generation++;timeline.pause();setPlaying(false);
  songs.forEach(function(song){
   if(song.controller&&song.controller.isStarted)song.controller.pause();
   song.starting=false;
  });
  applyGains(timeline.value(),true);
 }
 function syncAudio(t){
  if(!ready||preparing||stopping||changingSpeed||!timeline.running)return;
  if(t>=duration-.012){timeline.finish();setPlaying(false);
   songs.forEach(function(song){if(song.controller&&song.controller.isStarted)song.controller.pause();});
   state.textContent=L.finish;return;}
  songs.forEach(function(song,index){
   var c=song.controller,clip=clips[index],within=Playlist.isActive(clip,t);
   if(!c)return;
   if(within&&!song.finished&&!song.starting&&!c.isStarted){
    song.starting=true;var stamp=generation;
    if(c.isLoaded&&c.timer)StartPosition.seek(c,song.tune,Math.max(0,t-clip.start)*1000);
    c.play().then(function(){
     song.starting=false;
     if(!alive()||stamp!==generation||!timeline.running||!Playlist.isActive(clips[index],timeline.value())){
      if(c.isStarted)c.pause();return;
     }
     // A delayed synth starts from the current global playhead.
    }).catch(function(err){song.starting=false;if(err&&err.name==="AbortError")return;fail(err);});
   }else if(!within&&c.isStarted){c.pause();}
   if(t<clip.start-.05)song.finished=false;
  });
 }
 function seek(seconds){
  seconds=Math.max(0,Math.min(duration,Number(seconds)||0));
  generation++;var running=timeline.running;
  songs.forEach(function(song){song.starting=false;if(seconds<song.clip.start+song.clip.duration-.05)song.finished=false;});
  timeline.seek(seconds);
  songs.forEach(function(song,index){
   var c=song.controller,clip=clips[index];if(!c)return;
   var active=Playlist.isActive(clip,seconds);
   if(!active&&c.isStarted)c.pause();
   if(active&&c.isLoaded&&c.timer)StartPosition.seek(c,song.tune,Math.max(0,seconds-clip.start)*1000);
  });
  if(running)syncAudio(seconds);
  applyGains(seconds,true);
 }
 function stopAll(){
  generation++;stopping=true;timeline.pause();setPlaying(false);
  songs.forEach(function(song){
   song.starting=false;song.finished=false;song.gain=0;song.appliedGain=-1;
   if(song.controller)Playback.stopOne(song.controller);
  });
  timeline.seek(0);clearNotes();self._pendingSeek=0;
  showSong(0);state.textContent=L.ready;stopping=false;
 }
 stop.onclick=stopAll;
 session={huwikiStop:stopAll};
 play.onclick=function(){
  if(!ready||preparing)return;
  if(timeline.running){pauseAll();return;}
  if(timeline.value()>=duration-.01)seek(0);
  var stamp=++generation;
  preparing=true;state.textContent=L.loading;
  // Prepare all scores *during the user gesture*, before reaching a fade.
  // This avoids starting the incoming track several seconds late.
  Promise.all(songs.map(function(song){
   return song.controller.isLoaded?Promise.resolve():song.controller.go();
  })).then(function(){
   if(!alive()||stamp!==generation)return;
   preparing=false;Playback.start(session);
   timeline.play();setPlaying(true);applyGains(timeline.value(),true);
   syncAudio(timeline.value());state.textContent=L.ready;
  }).catch(function(err){if(stamp!==generation)return;preparing=false;fail(err);});
 };
 time.addEventListener("input",function(){seek(Number(time.value));});
 speed.addEventListener("change",function(){
  if(!ready||preparing)return;
  var wasRunning=timeline.running,position=timeline.value(),stamp=++generation;
  changingSpeed=true;timeline.pause();setPlaying(false);
  songs.forEach(function(song){song.starting=false;if(song.controller&&song.controller.isStarted)song.controller.pause();});
  timeline.setRate(Number(speed.value)/100);
  Promise.all(songs.map(function(song){
   return song.controller? song.controller.setWarp(Number(speed.value)):Promise.resolve();
  })).then(function(){
   if(!alive()||stamp!==generation)return;
   changingSpeed=false;timeline.seek(position);
   songs.forEach(function(song,i){
    var c=song.controller,clip=clips[i];
    if(c&&c.isLoaded&&c.timer&&Playlist.isActive(clip,position))
     StartPosition.seek(c,song.tune,Math.max(0,position-clip.start)*1000);
   });
   applyGains(position,true);
   if(wasRunning){timeline.play();setPlaying(true);syncAudio(position);}
  }).catch(function(err){if(stamp!==generation)return;changingSpeed=false;fail(err);});
 });
 this._shutdown=function(){
  self._dead=true;generation++;stopFrames();clearNotes();if(workspace)workspace.dispose();if(editor)editor.dispose();
  if(session)Playback.unregister(session);
  songs.forEach(function(song){
   var c=song.controller;if(!c)return;c._disposed=true;
   try{c.destroy();}catch(_ignored){}
  });controller=null;
 };
 editor=Editor.attach({doc:doc,host:host,wiki:this.wiki,film:scene,view:view,
  sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,scoreTitle:this.scoreTitle,
  duration:function(){return duration;},clips:function(){return clips;},
  updateClips:function(updated){
   clips=Playlist.reflow(updated,self.scoreTitle);
   songs.forEach(function(song,i){if(clips[i]&&clips[i].id===song.clip.id)song.clip=clips[i];
    else{var match=clips.find(function(c){return c.id===song.clip.id;});if(match)song.clip=match;}});
   duration=Math.max(.1,Playlist.total(clips),scene.duration);
   timeline.duration=duration;time.max=String(duration);applyGains(timeline.value(),true);
  },
  seek:seek,repaint:function(){paint(timeline.value());},
  onSelect:function(){if(workspace)workspace.showInspector();},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._editor=editor;
 workspace=Workspace.mount({
  doc:doc,host:host,wiki:this.wiki,project:scene.name||"Musical",
  layout:layout,transport:transport,play:play,view:view,editor:editor,
  seek:seek,position:function(){return timeline.value();},
  pause:function(){if(timeline.running)pauseAll();}
 });
 this._workspace=workspace;
 Loader.load().then(function(ABC){
  if(!alive())return;
  if(!ABC.synth||!ABC.synth.supportsAudio||!ABC.synth.supportsAudio())
   throw Error("Web Audio is not available in this browser.");
  songs.forEach(function(song){
   var parsed=ABC.renderAbc(song.page,song.source,{responsive:"resize",add_classes:true});
   song.tune=parsed&&parsed[0];
   if(!song.tune)throw Error("ABC notation could not be rendered: "+song.title);
   var seconds=typeof song.tune.getTotalTime==="function"?Number(song.tune.getTotalTime()):NaN;
   if(!(seconds>0)){
    if(typeof song.tune.setTiming==="function")song.tune.setTiming();
    var ev=song.tune.noteTimings||[];
    if(ev.length)seconds=Number(ev[ev.length-1].milliseconds)/1000;
   }
   if(seconds>0&&Number.isFinite(seconds))song.clip.duration=seconds;
   try{if(!song.tune.noteTimings&&typeof song.tune.setTiming==="function")song.tune.setTiming();}catch(_ignored){}
   song.events=(song.tune.noteTimings||[]).filter(function(ev){
    return ev&&Number.isFinite(Number(ev.milliseconds))&&ev.elements&&ev.elements.length;
   }).slice().sort(function(a,b){return a.milliseconds-b.milliseconds;});
   song.config=Accompaniment.read(song.fields);
   if(typeof Accompaniment.prepare==="function")
    Accompaniment.prepare(ABC,song.tune,song.source,song.config,true,song.fields);
   var heading=node(doc,"div","huw-musical-score-label",song.title);
   song.page.insertBefore(heading,song.page.firstChild);
  });
  clips=Playlist.reflow(songs.map(function(song){return song.clip;}),self.scoreTitle);
  songs.forEach(function(song,i){song.clip=clips[i];});
  duration=Math.max(.1,Playlist.total(clips),scene.duration);timeline.duration=duration;
  time.max=String(duration);showSong(0);paint(0);
  var soundfont=self.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim();
  return Promise.all(songs.map(function(song,index){
   var native=node(doc,"div","huw-musical-native",undefined,host);
   var c=Audio.install(new ABC.synth.SynthController(),ABC,{
    wiki:self.wiki,getConfig:function(){return trackConfig(song);},isCurrent:alive,
    beforePlay:function(){
     // A renderer may finish preparing after the global clock has moved;
     // seek just before audio actually starts, including on overlap.
     if(!timeline||!c.timer)return;
     var position=timeline.value(),clip=clips[index];
     StartPosition.seek(c,song.tune,Math.max(0,Math.min(clip.duration,position-clip.start))*1000);
    },
    onError:fail,
    onStop:function(){song.starting=false;}
   });
   song.controller=c;
   c.load(native,{
    onStart:function(){
     if(!alive()||stopping)return;
     song.starting=false;
     // Every controller belongs to the *same* playback session.
     // Calling Playback.start(c) would stop the other song mid-crossfade.
    },
    onFinished:function(){
     if(!alive()||stopping)return;
     song.finished=true;song.starting=false;
     if(song.controller&&song.controller.midiBuffer)try{song.controller.midiBuffer.setVolumes();}catch(_ignored){}
    },
    onBeat:function(beat,total){
     if(!alive()||!timeline.running||!Number.isFinite(Number(beat))||!(Number(total)>0))return;
     // Only the currently louder song corrects the visual master clock.
     // Both synths play independently; secondary beats cannot fight it.
     var chosen=Playlist.locate(clips,timeline.value());
     if(chosen.index===index)timeline.beatPosition(Playlist.at(clips,index,clips[index].duration*Number(beat)/Number(total)));
    },
    onEvent:function(evt){
     if(!alive()||!evt)return;
     if(Number.isFinite(Number(evt.milliseconds)))
      showNotes(index,clips[index].start+Number(evt.milliseconds)/1000);
    }
   },{displayPlay:false,displayLoop:false,displayRestart:false,displayProgress:false,displayWarp:false});
   return c.setTune(song.tune,false,{soundFontUrl:soundfont});
  })).then(function(){
   if(!alive())return;
   controller=songs[0].controller;self._audio=controller;
   Playback.register(session);ready=true;play.disabled=false;state.textContent=L.ready;
   applyGains(0,true);
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