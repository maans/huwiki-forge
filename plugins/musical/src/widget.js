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
var Editor=require("$:/plugins/huwiki/musical/editor.js"),Motion=require("$:/plugins/huwiki/musical/motion.js");
var Workspace=require("$:/plugins/huwiki/musical/workspace.js");
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
var SoundFx=require("$:/plugins/huwiki/musical/sfx.js");
var Narration=require("$:/plugins/huwiki/musical/narration.js");
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
  ready:"Ready · camera and animation follow the music",noAudio:"Music unavailable; the show continues without sound",finish:"Finished"
 }:{
  play:"▶ Afspil",pause:"Ⅱ Pause",stop:"■ Stop",loading:"Klargør lyd …",
  error:"Afspilning ikke mulig: ",scene:"Scene",score:"Noder",camera:"Kameraindstillinger",
  timeline:"Afspilningsposition",tempo:"Tempo",editScene:"Redigér scene og kamera i CutOut",
  editScore:"Redigér ABC-musik",missing:"Scenen eller noderne mangler.",
  ready:"Klar · kamera og animation følger musikken",noAudio:"Musiklyden er ikke tilgængelig; forestillingen fortsætter lydløst",finish:"Færdig"
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
 var sfx=new SoundFx.Fx(scene.musical&&scene.musical.sfx);
 var voice=new Narration.Player({wiki:this.wiki,doc:doc,clips:scene.musical&&scene.musical.audioClips||[],onError:function(message){
  if(state)state.textContent=(L.scene==='Scene'?'Lydspor: ':'Audio track: ')+String(message&&message.message||message);
 }});
 function fullDuration(){return Math.max(.1,Playlist.total(clips),Number(scene.duration)||0,
  (scene.musical&&scene.musical.audioClips||[]).reduce(function(end,c){return Math.max(end,(Number(c.start)||0)+(Number(c.duration)||0));},0));}
 var clips=Playlist.reflow(scene.musical&&scene.musical.songs,this.scoreTitle);
 var beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
 var songs=clips.map(function(c){
  var item=self.wiki.getTiddler(c.score),fields=item?item.fields:{};
  var source=fields["abc-source"]||fields.text||"";
  return {clip:c,title:c.score,source:source,fields:fields,events:[],tune:null,controller:null,page:null,pending:null,settingUp:null,audioFailed:false};
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
 // Captions belong to the audience's camera view, not to scenery SVG.
 // The CutOut source stays editable and unchanged; only this performance
 // hides its scene-space subtitle glyphs and displays a fixed overlay.
 var captionOverlay=node(doc,"div","huw-musical-caption-overlay",undefined,stage);
 captionOverlay.setAttribute("aria-live","off");
 var captionCue=node(doc,"div","huw-musical-caption-cue","",captionOverlay);
 var captionLine=node(doc,"div","huw-musical-caption-line","",captionOverlay);
 // One shared caption appearance for the entire show, independent of camera.
 var captionStyle=scene.musical&&scene.musical.captionStyle||{};
 function capNum(value,fallback,min,max){var n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
 var capScale=capNum(captionStyle.scale,1,.65,2.2);
 captionOverlay.style.paddingBottom=capNum(captionStyle.bottom,5,1,30)+"%";
 captionLine.style.fontSize="clamp(10px,"+(1.45*capScale).toFixed(3)+"vw,"+Math.round(20*capScale)+"px)";
 captionCue.style.fontSize="clamp(9px,"+(1.15*capScale).toFixed(3)+"vw,"+Math.round(15*capScale)+"px)";
 captionLine.style.maxWidth=capNum(captionStyle.width,98,45,100)+"%";
 captionLine.style.backgroundColor="rgba(9,12,18,"+capNum(captionStyle.background,.66,0,1)+")";

 var lastCaption="";
 function captionForTime(outer,seconds,depth){
  if(!outer||depth>16)return null;
  var matches=(outer.scene.parts||[]).filter(function(part){return /^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(part.id);});
  if(matches.length){
   matches.forEach(function(part){var shape=outer.nodes&&outer.nodes[part.id];
    if(shape&&shape.el)shape.el.style.display="none";
   });
   return {parts:matches,time:seconds};
  }
  var current=Engine.clipAt(outer.scene.scenes||[],seconds),elapsed=0,answer=null;
  (outer.clips||[]).some(function(c,i){
   var d=Math.max(.1,Number(c.settings&&c.settings.duration)||4);
   if(i===current.index&&c.view){
    var local=Math.max(0,Math.min(d,seconds-elapsed));
    answer=captionForTime(c.view,Engine.localTime(local,c.duration,c.settings),depth+1);
    return true;
   }
   elapsed+=d;return false;
  });
  return answer;
 }
 function updateCaptions(timeValue){
  var at=captionForTime(view,timeValue,0),cue="",line="";
  if(at){at.parts.forEach(function(p){var opacity=Engine.state(p,at.time).opacity;
   if(opacity<.45)return;
   if(p.id==="sing-label")cue=String(p.text||"");
   else if(!line||p.id.indexOf("spoken-")===0)line=String(p.text||"");
  });}
  var key=cue+"\u0000"+line;
  if(key!==lastCaption){captionCue.textContent=cue;captionLine.textContent=line;
   captionCue.hidden=!cue;captionLine.hidden=!line;lastCaption=key;}
 }

 var scorePanel=node(doc,"div","huw-musical-score",layout);
 node(doc,"h3","huw-musical-subtitle",L.score,scorePanel);
 var paper=node(doc,"div","huw-musical-paper",scorePanel);
 songs.forEach(function(song,i){
  song.page=node(doc,"div","huw-musical-score-page",undefined,paper);
  song.page.hidden=i!==0;song.page.setAttribute("data-song-index",String(i));
  song.page.addEventListener("click",function(event){clickScore(i,event);});
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
 var duration=fullDuration(),timeline=null,ready=false,controller=null,activeIndex=0,stopping=false,changingSpeed=false;
 var editor=null,workspace=null,session=null,preparing=false,generation=0,lastGainUpdate=0,visibleKey="",ABCObject=null,soundReady=false,soundfont="";
 var audioUnlockFailure="";
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
 // A click on ABC notation navigates the *master* musical timeline.
 // ABCJS provides performed timings, including expanded repeat passages.
 function indexScoreNotes(song){
  var map=new WeakMap();song.noteClickTimes=map;
  song.events.forEach(function(event){
   (event.elements||[]).forEach(function(group){
    (Array.isArray(group)?group:[group]).forEach(function(n){
     if(!n||!n.nodeType)return;
     var times=map.get(n);
     if(!times){times=[];map.set(n,times);if(n.classList)n.classList.add("huw-musical-score-note-target");}
     if(times.indexOf(event.milliseconds)<0)times.push(event.milliseconds);
    });
   });
  });
 }
 function clickScore(index,event){
  var song=songs[index],page=song&&song.page;
  if(!song||!song.events.length||!timeline||!page||page.hidden)return;
  var target=event.target;if(!target||!target.closest)return;
  var svg=target.closest("svg");if(!svg||!page.contains(svg))return;
  var map=song.noteClickTimes,hit=target,times=null;
  while(hit&&hit!==page){
   if(map&&(times=map.get(hit))&&times.length)break;
   hit=hit.parentNode;
  }
  // Chord symbols often live above the staff, outside noteTimings.elements.
  // Map the selected chord to the closest timed note on its staff.
  if(!times||!times.length){
   var chord=target.closest(".abcjs-chord,.abcjs-chord-symbol,.abcjs-chord-text");
   if(!chord)return;
   var box=chord.getBoundingClientRect(),cx=(box.left+box.right)*.5,cy=(box.top+box.bottom)*.5,
    distance=Infinity,nearest=null;
   song.events.forEach(function(ev){
    (ev.elements||[]).forEach(function(group){
     (Array.isArray(group)?group:[group]).forEach(function(n){
      if(!n||!n.getBoundingClientRect)return;
      var r=n.getBoundingClientRect();if(!r.width||!r.height)return;
      var d=Math.abs((r.left+r.right)*.5-cx)+Math.abs((r.top+r.bottom)*.5-cy)*1.4;
      if(d<distance){distance=d;nearest=n;}
     });
    });
   });
   times=nearest&&map&&map.get(nearest);
  }
  if(!times||!times.length)return;
  var clip=clips[index],localNow=Math.max(0,(timeline.value()-clip.start)*1000);
  // One written note may be heard twice via repeats and voltas.
  var ms=times.slice().sort(function(a,b){
   return Math.abs(a-localNow)-Math.abs(b-localNow)||(a>=localNow?-1:1);
  })[0];
  if(!Number.isFinite(Number(ms)))return;
  if(editor&&editor.selectSong)editor.selectSong(clip.id);
  seek(Playlist.at(clips,index,Number(ms)/1000));
  event.preventDefault();
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
 // Safari and iPad require the existing ABC audio context to be unlocked from
 // the actual play gesture, BEFORE any asynchronous sample preparation begins.
 // Share ABC's own mixer; never introduce a separate backup synthesizer.
 function unlockMusicAudio(){
  audioUnlockFailure="";
  if(!soundReady||!ABCObject||!ABCObject.synth){
   host.dataset.audioMode="stage-only";
   return false;
  }
  try{
   var synth=ABCObject.synth,ctx=synth.activeAudioContext&&synth.activeAudioContext();
   if(!ctx){
    var AudioCtor=typeof window!=="undefined"&&(window.AudioContext||window.webkitAudioContext);
    if(!AudioCtor||typeof synth.registerAudioContext!=="function")throw Error("Web Audio unavailable");
    ctx=new AudioCtor();
    synth.registerAudioContext(ctx);
   }
   // Call resume synchronously in the play handler, not in an asynchronous continuation.
   if(ctx.state!=="running"&&typeof ctx.resume==="function"){
    Promise.resolve(ctx.resume()).catch(function(error){
     if(!alive())return;
     audioUnlockFailure=String(error&&error.message||error);
     host.dataset.audioMode="stage-only";
     state.textContent=L.noAudio+" ("+audioUnlockFailure.slice(0,100)+")";
    });
   }
   host.dataset.audioContextState=String(ctx.state||"unknown");
   return true;
  }catch(error){
   audioUnlockFailure=String(error&&error.message||error);
   host.dataset.audioMode="stage-only";
   state.textContent=L.noAudio+" ("+audioUnlockFailure.slice(0,100)+")";
   return false;
  }
 }
 // Native audio is optional for the stage. Audio errors may never stop a CutOut show.
 function retryFailedAudio(){
  var hadFailure=false;
  songs.forEach(function(song){
   if(!song.audioFailed)return;
   hadFailure=true;
   if(song.controller)try{song.controller.destroy();}catch(_ignored){}
   song.controller=null;song.pending=null;song.settingUp=null;
   song.audioFailed=false;song.starting=false;song.finished=false;song.appliedGain=-1;
  });
  if(hadFailure){
   delete host.dataset.audioFailureSong;
   delete host.dataset.audioFailureMessage;
  }
 }
 function audioProblem(song,error){
  if(!song||!alive())return;
  song.audioFailed=true;song.pending=null;
  var message=String(error&&error.message||error||'Lyd kunne ikke indlæses');
  host.dataset.audioMode='stage-only';host.dataset.audioFailureSong=song.title;host.dataset.audioFailureMessage=message.substring(0,160);
  state.textContent='Scenen fortsætter uden musiklyd ('+message.substring(0,90)+')';
  state.classList.remove('huw-musical-error');
 }
 // Controllers are intentionally lazy. Nine simultaneously initialised ABCJS
 // synths can exhaust the audio resources of iPad/Safari before the finale.
 // Keep only active/next scores prepared; dispose older ones after crossfades.
 function releaseOld(t){
  songs.forEach(function(song,index){
   var clip=clips[index],c=song.controller;
   if(!c||song.pending||song.settingUp||t<clip.start+clip.duration+7)return;
   try{c._disposed=true;c.destroy();}catch(_ignored){}
   song.controller=null;song.starting=false;song.finished=false;
   song.appliedGain=-1;
  });
 }
 function prepareSong(index){
  var song=songs[index];if(!song||song.audioFailed||song.pending||song.settingUp)return;
  if(song.controller&&song.controller.isLoaded)return;
  if(!soundReady||!ABCObject)return;
  var task=Promise.resolve().then(function(){
   return installSongController(song,index);
  }).then(function(c){
   if(!c||!alive()||song.audioFailed)return;
   return c.isLoaded?null:c.go();
  });
  song.pending=task;
  task.then(function(){
   if(song.pending===task)song.pending=null;
   if(!alive())return;
   if(timeline&&timeline.running&&Playlist.isActive(clips[index],timeline.value()))syncAudio(timeline.value());
  }).catch(function(error){
   if(song.pending===task)song.pending=null;
   if(error&&error.name==='AbortError')return;
   audioProblem(song,error);
  });
 }
 function prepareUpcoming(t){
  // One preparation at a time: no nine-song soundfont stampede.
  // Do not pre-load the next 36-second scene from the start of the
  // current one. Loading unrelated instrument samples during playback
  // can starve Web Audio on memory-constrained mobile devices.
  releaseOld(t);
  if(songs.some(function(song){return !!song.pending||!!song.settingUp;}))return;
  var candidates=[];
  songs.forEach(function(song,i){var c=clips[i];
   if(!song.audioFailed&&(!song.controller||!song.controller.isLoaded)&&
      c.start+c.duration>t&&c.start-t<=20)candidates.push(i);
  });
  candidates.sort(function(a,b){var x=clips[a],y=clips[b];
   var xa=Playlist.isActive(x,t)?0:1,ya=Playlist.isActive(y,t)?0:1;
   return xa-ya||x.start-y.start;
  });
  if(candidates.length)prepareSong(candidates[0]);
 }
 function paint(t){
  var visualTime=Math.max(0,Math.min(scene.duration,t));
  Engine.paint(view,visualTime);
  Motion.paint(view,scene,t,beatClock);
  if(editor)editor.paint(t);
  updateCaptions(visualTime);
  // Seeking also updates the selection frame; playing never spends time
  // recalculating its SVG bounds when the frame is hidden.
  if(workspace&&workspace.refreshHandles&&!(timeline&&timeline.running))workspace.refreshHandles();
  showSong(t);applyGains(t,false);
  if(timeline&&timeline.running){sfx.sync(t);voice.sync(t,timeline.rate);syncAudio(t);}
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
  host.dataset.playing=String(!!yes);
  if(yes)startFrames();else stopFrames();
  if(workspace&&workspace.refreshHandles)workspace.refreshHandles();
 }
 function fail(e){if(!alive())return;state.textContent=L.error+(e&&e.message||String(e));state.classList.add("huw-musical-error");play.disabled=!ready;}
 function pauseAll(){
  generation++;timeline.pause();setPlaying(false);sfx.quiet();voice.pause();
  songs.forEach(function(song){
   if(song.controller&&song.controller.isStarted)song.controller.pause();
   song.starting=false;
  });
  applyGains(timeline.value(),true);
 }
 function syncAudio(t){
  if(!ready||preparing||stopping||changingSpeed||!timeline.running)return;
  if(t>=duration-.012){timeline.finish();setPlaying(false);voice.pause();sfx.quiet();
   songs.forEach(function(song){if(song.controller&&song.controller.isStarted)song.controller.pause();});
   state.textContent=L.finish;return;}
  prepareUpcoming(t);
  songs.forEach(function(song,index){
   var c=song.controller,clip=clips[index],within=Playlist.isActive(clip,t);
   if(!c){if(within&&!song.audioFailed)prepareSong(index);return;}
   if(within&&!c.isLoaded&&!song.audioFailed)prepareSong(index);
   if(within&&c.isLoaded&&!song.audioFailed&&!song.finished&&!song.starting&&!c.isStarted){
    song.starting=true;var stamp=generation;
    if(c.timer)StartPosition.seek(c,song.tune,Math.max(0,t-clip.start)*1000);
    Promise.resolve(c.play()).then(function(){
     song.starting=false;
     if(alive()&&c.isStarted){host.dataset.audioMode="playing";state.textContent=L.ready;}
     if(!alive()||stamp!==generation||!timeline.running||!Playlist.isActive(clips[index],timeline.value())){
      if(c.isStarted)c.pause();
     }
    }).catch(function(error){song.starting=false;
     if(error&&error.name==='AbortError')return;audioProblem(song,error);
    });
   }else if(!within&&c.isStarted){c.pause();}
   if(t<clip.start-.05)song.finished=false;
  });
 }
 function seek(seconds){
  seconds=Math.max(0,Math.min(duration,Number(seconds)||0));
  generation++;var running=timeline.running;sfx.seek(seconds);voice.seek(seconds);
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
  generation++;stopping=true;timeline.pause();setPlaying(false);sfx.seek(0);voice.pause();voice.seek(0);
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
  sfx.unlock();
  voice.unlock();
  var audioActivated=unlockMusicAudio();
  retryFailedAudio();
  sfx.seek(timeline.value()-.02);
  preparing=true;state.textContent=L.loading;
  // Start the theatrical clock immediately. Missing or offline SoundFonts
  // must not block scene animation, camera, light, or curtains.
  preparing=false;Playback.start(session);
  timeline.play();setPlaying(true);applyGains(timeline.value(),true);
  state.textContent=audioActivated?L.loading:L.noAudio;
  syncAudio(timeline.value());
 };
 time.addEventListener("input",function(){seek(Number(time.value));});
 speed.addEventListener("change",function(){
  if(!ready)return;
  var wasRunning=timeline.running,position=timeline.value();
  timeline.pause();setPlaying(false);
  voice.pause();sfx.quiet();
  songs.forEach(function(song){song.starting=false;if(song.controller&&song.controller.isStarted)song.controller.pause();});
  timeline.setRate(Number(speed.value)/100);
  songs.forEach(function(song){if(song.controller&&song.controller.isLoaded&&!song.audioFailed){
   Promise.resolve(song.controller.setWarp(Number(speed.value))).catch(function(error){audioProblem(song,error);});
  }});
  timeline.seek(position);applyGains(position,true);
  if(wasRunning){timeline.play();setPlaying(true);syncAudio(position);}
 });
 this._shutdown=function(){
  self._dead=true;generation++;stopFrames();sfx.dispose();voice.dispose();clearNotes();if(workspace)workspace.dispose();if(editor)editor.dispose();
  if(session)Playback.unregister(session);
  songs.forEach(function(song){
   var c=song.controller;if(!c)return;c._disposed=true;
   try{c.destroy();}catch(_ignored){}
  });controller=null;
 };
 editor=Editor.attach({doc:doc,host:host,wiki:this.wiki,film:scene,view:view,
  sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,scoreTitle:this.scoreTitle,
  duration:function(){return duration;},clips:function(){return clips;},beatClock:function(){return beatClock;},
  updateClips:function(updated){
   clips=Playlist.reflow(updated,self.scoreTitle);
   beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
   songs.forEach(function(song,i){if(clips[i]&&clips[i].id===song.clip.id)song.clip=clips[i];
    else{var match=clips.find(function(c){return c.id===song.clip.id;});if(match)song.clip=match;}});
   duration=fullDuration();
   timeline.duration=duration;time.max=String(duration);applyGains(timeline.value(),true);
  },
  seek:seek,repaint:function(){paint(timeline.value());},
  pause:function(){if(timeline.running)pauseAll();},isPlaying:function(){return timeline.running;},
  onEditScore:function(title){if(workspace)workspace.openScore(title);},
  onEditAudio:function(details){if(workspace)workspace.openNarration(details);},
  onEditScenes:function(){if(workspace)workspace.openScenes();},
  onAudioChange:function(updated){voice.setClips(updated);duration=fullDuration();timeline.duration=duration;time.max=String(duration);},
  onSelect:function(t){if(workspace)workspace.selectTrack(t);},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._editor=editor;
 workspace=Workspace.mount({
  doc:doc,host:host,wiki:this.wiki,parentWidget:this,project:scene.name||"Musical",film:scene,sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,
  scoreTitle:function(){return songs[activeIndex]&&songs[activeIndex].title||self.scoreTitle;},
  onAudioChange:function(updated){voice.setClips(updated);duration=fullDuration();timeline.duration=duration;time.max=String(duration);if(editor)editor.redraw();},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},repaint:function(){paint(timeline.value());},
  layout:layout,transport:transport,play:play,view:view,editor:editor,
  seek:seek,position:function(){return timeline.value();},
  pause:function(){if(timeline.running)pauseAll();},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._workspace=workspace;
 function installSongController(song,index){
  if(!soundReady||!ABCObject)return Promise.reject(Error("ABC audio unavailable"));
  if(song.controller)return Promise.resolve(song.controller);
  if(song.settingUp)return song.settingUp;
  var ABC=ABCObject;
  var task=Promise.resolve().then(function(){
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
    onError:function(error){audioProblem(song,error);},
    onStatus:function(info){
     if(!alive()||!info)return;
     if(info.phase==="loading"&&!songs.some(function(s){return s.controller&&s.controller.isStarted;})){
      host.dataset.audioMode="loading";state.textContent=L.loading;
     }else if(info.phase==="ready"){
      host.dataset.audioMode=info.engine||"ready";
      if(timeline&&timeline.running)state.textContent=L.ready;
     }
    },
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
   return Promise.resolve(c.setTune(song.tune,false,{soundFontUrl:soundfont})).then(function(){return c;});
  });
  song.settingUp=task;
  return task.then(function(c){if(song.settingUp===task)song.settingUp=null;return c;},function(error){
   if(song.settingUp===task)song.settingUp=null;
   throw error;
  });
 }
 Loader.load().then(function(ABC){
  if(!alive())return;
  var canAudio=!!(ABC.synth&&ABC.synth.supportsAudio&&ABC.synth.supportsAudio());
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
    indexScoreNotes(song);
   song.config=Accompaniment.read(song.fields);
   if(typeof Accompaniment.prepare==="function")
    // 'live=true' in ABC forces bass, chords, drums and metronome ON for
    // synthesis even when the score has enabled:false. That silently loads
    // extra SoundFont instruments in every AniMus scene and can exhaust
    // iPad/Safari audio resources. Use live mode only when backing is enabled.
    // With enabled:false the written ABC voices still use ABC's shared mixer.
    Accompaniment.prepare(ABC,song.tune,song.source,song.config,song.config.enabled===true,song.fields);
   var heading=node(doc,"div","huw-musical-score-label",song.title);
   song.page.insertBefore(heading,song.page.firstChild);
  });
  clips=Playlist.reflow(songs.map(function(song){return song.clip;}),self.scoreTitle);
  beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
  songs.forEach(function(song,i){song.clip=clips[i];});
  duration=fullDuration();timeline.duration=duration;
  time.max=String(duration);showSong(0);paint(0);
  soundfont=self.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim();
  ABCObject=ABC;soundReady=canAudio;
  // The notes and visual master clock are ready before samples finish loading.
  // Audio remains optional; no missing SoundFont can block the theatre.
  Playback.register(session);ready=true;play.disabled=false;state.textContent=canAudio?L.ready:L.noAudio;
  applyGains(0,true);

 }).catch(function(error){
  // ABC can be unavailable offline; the visual stage and timeline still run.
  if(!alive())return;
  Playback.register(session);ready=true;play.disabled=false;
  host.dataset.audioMode="stage-only";
  state.textContent=L.noAudio+" ("+String(error&&error.message||error).slice(0,100)+")";
 });
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
