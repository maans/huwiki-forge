/*\
title: $:/plugins/huwiki/musical/widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Language=require("$:/plugins/huwiki/musical/language.js");
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
var VideoExport=null;try{VideoExport=require("$:/plugins/huwiki/animus-video-export/runtime.js");}catch(_optionalExport){}
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
var CueScore=require("$:/plugins/huwiki/musical/cue-score.js");
var SoundFx=require("$:/plugins/huwiki/musical/sfx.js");
var Narration=require("$:/plugins/huwiki/musical/narration.js");
var LipSync=require("$:/plugins/huwiki/musical/lipsync.js");
var languagePositions=new WeakMap();
var ACTIVE_PAINT={activeOnly:true};
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
function labels(da,ui){
 return !da?ui.labels({
  play:"▶ Play",pause:"Ⅱ Pause",stop:"■ Stop",loading:"Preparing sound …",
  error:"Playback unavailable: ",scene:"Scene",score:"Score",camera:"Camera shots",
  timeline:"Playback position",tempo:"Tempo",editScene:"Edit scene and camera in CutOut",
  editScore:"Edit ABC music",missing:"The scene or score is missing.",
  ready:"Ready · camera and animation follow the music",noAudio:"Music unavailable; the show continues without sound",finish:"Finished"
 }):{
  play:"▶ Afspil",pause:"Ⅱ Pause",stop:"■ Stop",loading:"Klargør lyd …",
  error:"Afspilning ikke mulig: ",scene:"Scene",score:"Noder",camera:"Kameraindstillinger",
  timeline:"Afspilningsposition",tempo:"Tempo",editScene:"Redigér scene og kamera i CutOut",
  editScore:"Redigér ABC-musik",missing:"Scenen eller noderne mangler.",
  ready:"Klar · kamera og animation følger musikken",noAudio:"Musiklyden er ikke tilgængelig; forestillingen fortsætter lydløst",finish:"Færdig"
 };
}
Musical.prototype.render=function(parent,next){
 this.parentDomNode=parent;this.computeAttributes();this.execute();
 var self=this,doc=this.document,da=Language.isDanish(this.wiki),ui=Language.translator(this.wiki),L=labels(da,ui),displayName=Language.projectLabels(this.wiki,this.sceneTitle);
 var host=node(doc,"section","huw-musical");
 this._language=this.wiki.getTiddlerText("$:/language","");
 this._positionKey=JSON.stringify([this.getVariable("currentTiddler"),this.sceneTitle,this.scoreTitle,this.getAttribute("workshop","")]);
 this._danish=da;this._timeline=null;this.host=host;host._animusFilm=this.sceneTitle;this._dead=false;this._frame=0;this._audio=null;this._pendingSeek=null;this._ownWritten={};this._editor=null;
 parent.insertBefore(host,next);this.domNodes.push(host);
 var scene=Engine.readScene(this.wiki,this.sceneTitle);
 if(!scene){node(doc,"p","huw-musical-error",L.missing,host);return;}
 var sfx=new SoundFx.Fx(scene.musical&&scene.musical.sfx,{onError:function(){if(state)state.textContent=da?'En effekt kunne ikke afspilles; forestillingen fortsætter.':ui('An effect could not play; the performance continues.');}});
 var lipOptions={sceneTitle:this.sceneTitle,audioClips:scene.musical&&scene.musical.audioClips||[],film:scene};
 var voice=new Narration.Player({wiki:this.wiki,doc:doc,clips:scene.musical&&scene.musical.audioClips||[],
  isAudible:function(clip){return !editor||!editor.isAudioAudible||editor.isAudioAudible(clip);},onError:function(message){
  if(state)state.textContent=(da?'Lydspor: ':ui('Audio track: '))+String(message&&message.message||message);
 }});
 function fullDuration(){return Math.max(.1,Playlist.total(clips),Number(scene.duration)||0,
  (scene.musical&&scene.musical.audioClips||[]).reduce(function(end,c){return Math.max(end,(Number(c.start)||0)+(Number(c.duration)||0));},0));}
 var clips=Playlist.reflow(scene.musical&&scene.musical.songs,this.scoreTitle);
 var beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
 var songs=clips.map(function(c){
  var item=self.wiki.getTiddler(c.score),fields=item?item.fields:{};
  var source=fields["abc-source"]||fields.text||"";
  return {clip:c,title:c.score,source:source,fields:fields,cueScore:CueScore.read(fields),guideTiming:c.muted,config:Accompaniment.read(fields),events:[],tune:null,controller:null,page:null,pending:null,settingUp:null,audioFailed:false};
 });
 this._playlistTitles=songs.map(function(s){return s.title;});
 this._songStates=songs;
 if(!songs.length||songs.some(function(s){return !s.source.trim()&&!s.cueScore;})){
  node(doc,"p","huw-musical-error","En scene eller et nodeark mangler. / Missing scene or score.",host);return;
 }
 var layout=node(doc,"div","huw-musical-layout",host);
 var stagePanel=node(doc,"div","huw-musical-stage",layout);
 node(doc,"h3","huw-musical-subtitle",L.scene,stagePanel);
 var stage=node(doc,"div","huw-musical-canvas",stagePanel);
 var view=Engine.build(doc,this.wiki,scene);
 this._view=view;Engine.paint(view,0,undefined,ACTIVE_PAINT);stage.appendChild(view.svg);
 // Captions belong to the audience's camera view, not to scenery SVG.
 // The CutOut source stays editable and unchanged; only this performance
 // hides its scene-space subtitle glyphs and displays a fixed overlay.
 var captionBelow=scene.musical&&scene.musical.captionStyle&&scene.musical.captionStyle.placement==="below";
 var captionOverlay=node(doc,"div","huw-musical-caption-overlay"+(captionBelow?" is-below":""),undefined,captionBelow?host:stage);
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
   return {parts:matches,time:seconds,scene:outer.scene.id||outer.scene._title||self.sceneTitle};
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
  var captionsVisible=!editor||!editor.isTrackVisible||editor.isTrackVisible("captions");
  if(captionOverlay.hidden!==!captionsVisible)captionOverlay.hidden=!captionsVisible;
  var at=captionForTime(view,timeValue,0),cue="",line="",cueId="",lineId="";
  if(at){at.parts.forEach(function(p){var opacity=Engine.state(p,at.time).opacity;
   if(opacity<.45)return;
   if(p.id==="sing-label"){cue=String(p.text||"");cueId=p.id;}
   else if(!line||p.id.indexOf("spoken-")===0){line=String(p.text||"");lineId=p.id;}
  });}
  var key=[at&&at.scene,cueId,cue,lineId,line].join("\u0000");
  if(key!==lastCaption){
   captionCue._animusCue={film:self.sceneTitle,scene:at&&at.scene,id:cueId,source:cue};
   captionLine._animusCue={film:self.sceneTitle,scene:at&&at.scene,id:lineId,source:line};
   captionCue.textContent=cue;captionLine.textContent=line;
   captionCue.hidden=!cue;captionLine.hidden=!line;lastCaption=key;}
 }

 var scorePanel=node(doc,"div","huw-musical-score",layout);
 node(doc,"h3","huw-musical-subtitle",L.score,scorePanel);
 var cueIndex=null;
 if(songs.some(function(song){return !!song.cueScore;})){
  cueIndex=node(doc,"select","huw-musical-cue-score-index",undefined,scorePanel);
  cueIndex.setAttribute("aria-label",da?"Partiturafsnit":"Score section");
  songs.forEach(function(song,index){if(song.cueScore){var option=node(doc,"option","",song.cueScore.title,cueIndex);option.value=String(index);}});
  cueIndex.onchange=function(){var clip=clips[Number(cueIndex.value)];if(clip)seek(clip.start);};
 }
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
 function timeLabel(n,precise){
  var hundredths=Math.round(Math.max(0,n)*100),s=precise?Math.floor(hundredths/100):Math.floor(Math.max(0,n));
  var label=Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
  return precise&&hundredths%100?label+(da?",":".")+String(hundredths%100).padStart(2,"0"):label;
 }
 var duration=fullDuration(),timeline=null,ready=false,controller=null,activeIndex=0,stopping=false,changingSpeed=false;
 var editor=null,workspace=null,session=null,preparing=false,generation=0,lastGainUpdate=0,visibleKey="",ABCObject=null,soundReady=false,soundfont="";
 // Resolve export inputs before ABC arrives; loading notation must not make
 // an unchanged recorded soundtrack appear to change during an export.
 soundfont=self.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim();
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
  if(!events.length||song.page.hidden||host.dataset.previewMode==='stage')return;
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
   if(!song.page.hidden){
    var scroller=host.classList.contains('huw-musical--workspace')?paper:scorePanel;
    var panel=scroller.getBoundingClientRect();
    if(rect.top<panel.top+8||rect.bottom>panel.bottom-8)scroller.scrollTop+=rect.top-panel.top-Math.min(64,panel.height/3);
   }
  }
 }
 function showSong(t){
  var active=Playlist.activeAt(clips,t),primary=Playlist.locate(clips,t),i=primary.index;
  if(i<0)return;
  activeIndex=i;controller=songs[i].controller||null;self._audio=controller;
  if(cueIndex&&songs[i].cueScore)cueIndex.value=String(i);
  var visible=active.length?active.map(function(v){return v.index;}):[i],key=visible.join(",");
  if(key!==visibleKey){visibleKey=key;songs.forEach(function(song,j){song.page.hidden=visible.indexOf(j)<0;});}
  host.dataset.activeSong=songs[i].title;
  host.dataset.activeSongCount=String(visible.length);
  if(scoreLink){scoreLink.setAttribute("href","#"+encodeURIComponent(songs[i].title));
   scoreLink.setAttribute("data-tiddler-title",songs[i].title);}
  // In stage-only editing there is no visible notation to render. ABCJS
  // renderAbc can block the iPad main thread during an otherwise simple seek.
  // Switching to split/score view prepares the selected score on demand.
  if(host.dataset.previewMode!=='stage')visible.forEach(function(j){ensureNotation(songs[j]);showNotes(j,t);});
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
  // ABCJS can draw chord text outside its note group. Associate the label
  // with its written note so another staff or repeat cannot steal the click.
  (song.tune.engraver&&song.tune.engraver.staffgroups||[]).forEach(function(system){
   system.voices.forEach(function(voice){voice.children.forEach(function(note){
    if(!note.abcelem||!note.abcelem.chord)return;
    var owner=(note.elemset||[]).find(function(n){return map.has(n);});
    if(owner)(note.children||[]).forEach(function(child){
     if(child.type==="chord"&&child.graphelem)map.set(child.graphelem,map.get(owner));
    });
   });});
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
  if(!times){
   // At split-view scale a notehead can be only a few pixels across.
   // A tap between the head and stem, or inside a chord letter, can hit
   // the SVG background. Limit the search to the nearby printed system.
   var x=event.clientX,y=event.clientY,radius=event.pointerType==='touch'?12:8;
   var best=Infinity;
   svg.querySelectorAll('.abcjs-staff-wrapper').forEach(function(system){
    var bounds=system.getBoundingClientRect();
    if(y<bounds.top-radius||y>bounds.bottom+radius||x<bounds.left-radius||x>bounds.right+radius)return;
    system.querySelectorAll('.abcjs-notehead,.abcjs-stem,.abcjs-chord,.abcjs-chord-symbol,.abcjs-chord-text').forEach(function(glyph){
     var owner=glyph.closest('.huw-musical-score-note-target'),candidate=map.get(glyph)||(owner&&map.get(owner));
     if(!candidate)return;
     var r=glyph.getBoundingClientRect();
     var dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);
     var distance=dx*dx+dy*dy;
     if(distance<=radius*radius&&distance<best){best=distance;times=candidate;}
    });
   });
  }
  if(!times||!times.length)return;
  seekScore(index,times);event.preventDefault();
 }
 function seekScore(index,times){
  var clip=clips[index],localNow=(timeline.value()-clip.start)*1000;
  // For a repeat, seek to the performance nearest the current playhead.
  var ms=times.reduce(function(best,t){
   var delta=Math.abs(t-localNow),previous=Math.abs(best-localNow);
   return delta<previous||(delta===previous&&t>best)?t:best;
  });
  var selected=editor&&editor.getSelection();
  if(selected&&selected.kind==="song")editor.selectSong(clip.id);
  seek(Playlist.at(clips,index,ms/1000));
  if(editor)editor.revealPlayhead();
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
 function authoredAudibleClip(clip){return !!clip&&!clip.muted&&clip.volume>0;}
 function audibleClip(clip){return authoredAudibleClip(clip)&&(!editor||!editor.isSongAudible||editor.isSongAudible(clip));}
 function applyGains(t,force){
  // Existing ABC mixers smooth GainNode changes with setTargetAtTime.
  // Throttled gain updates avoid per-frame reallocation on mobile Safari.
  var now=performance.now();
  if(!force&&now-lastGainUpdate<28)return;lastGainUpdate=now;
  songs.forEach(function(song,i){
   var gain=audibleClip(clips[i])?Playlist.gainAt(clips[i],t):0;
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
  var message=String(error&&error.message||error||(da?'Lyden kunne ikke indlæses':ui('Audio could not be loaded')));
  host.dataset.audioMode='stage-only';host.dataset.audioFailureSong=song.title;host.dataset.audioFailureMessage=message.substring(0,160);
  state.textContent=L.noAudio+' ('+message.substring(0,90)+')';
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
  if(!audibleClip(song.clip))return;
  ensureNotation(song);
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
   if(audibleClip(c)&&!song.audioFailed&&(!song.controller||!song.controller.isLoaded)&&
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
  Engine.paint(view,visualTime,undefined,ACTIVE_PAINT);
  Motion.paint(view,scene,t,beatClock);
  if(editor)editor.paint(t);
  LipSync.apply(view,visualTime,t,lipOptions);
  // The workshop clones the rendered character. Copy after speech and face
  // overrides, including same-time repaints such as resetting preview zoom.
  if(workspace&&workspace.paintPreview)workspace.paintPreview();
  updateCaptions(visualTime);
  // Seeking also updates the selection frame; playing never spends time
  // recalculating its SVG bounds when the frame is hidden.
  if(workspace&&!(timeline&&timeline.running)){
   if(workspace.requestHandleRefresh)workspace.requestHandleRefresh();
   else if(workspace.refreshHandles)workspace.refreshHandles();
  }
  showSong(t);applyGains(t,false);
  if(timeline&&timeline.running){
   if(!editor||!editor.isSfxAudible||editor.isSfxAudible())sfx.sync(t);
   else sfx.last=t;
   voice.sync(t,timeline.rate);syncAudio(t);
  }
  if(scrubTime==null&&Number(time.value)!==t)time.value=String(t);
  var clockLabel=timeLabel(t,!timeline||!timeline.running)+" / "+timeLabel(duration);
  if(clock.textContent!==clockLabel)clock.textContent=clockLabel;
  host.dataset.cameraTime=visualTime.toFixed(2);
 }
 timeline=new Timeline(duration,paint);
 this._timeline=timeline;
 function frame(){
  self._frame=0;if(!alive()||!timeline.running)return;
  paint(timeline.value());
  if(timeline.running)startFrames();
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
   var c=song.controller,clip=clips[index],within=audibleClip(clip)&&Playlist.isActive(clip,t);
   if(!c){if(within&&!song.audioFailed)prepareSong(index);return;}
   if(within&&!c.isLoaded&&!song.audioFailed)prepareSong(index);
   if(within&&c.isLoaded&&!song.audioFailed&&!song.finished&&!song.starting&&!c.isStarted){
    song.starting=true;var stamp=generation;
    if(c.timer)StartPosition.seek(c,song.tune,Math.max(0,t-clip.start)*1000);
    Promise.resolve(c.play()).then(function(){
     song.starting=false;
     if(alive()&&c.isStarted){host.dataset.audioMode="playing";state.textContent=L.ready;}
     if(!alive()||stamp!==generation||!timeline.running||!audibleClip(clips[index])||!Playlist.isActive(clips[index],timeline.value())){
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
  generation++;stopping=true;timeline.running=false;setPlaying(false);sfx.seek(0);voice.pause();voice.seek(0);
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
  var hasMusic=clips.some(audibleClip),audioActivated=hasMusic&&unlockMusicAudio();
  if(hasMusic)retryFailedAudio();
  sfx.seek(timeline.value()-.02);
  preparing=true;state.textContent=L.loading;
  // Start the theatrical clock immediately. Missing or offline SoundFonts
  // must not block scene animation, camera, light, or curtains.
  preparing=false;Playback.start(session);
  timeline.play();setPlaying(true);applyGains(timeline.value(),true);
  state.textContent=hasMusic?(audioActivated?L.loading:L.noAudio):L.ready;
  syncAudio(timeline.value());
 };
 // Native sliders can emit several inputs before Safari paints. Show the
 // last position of each frame, and commit the release even outside the range.
 var scrubPointer=null,scrubFrame=0,scrubTime=null;
 function flushScrub(){
  if(scrubFrame)cancelAnimationFrame(scrubFrame);
  scrubFrame=0;
  if(scrubTime!==null){var target=scrubTime;scrubTime=null;seek(target);}
 }
 function endScrub(event){
  if(event.pointerId!==scrubPointer)return;
  scrubPointer=null;flushScrub();
  doc.removeEventListener("pointerup",endScrub);doc.removeEventListener("pointercancel",endScrub);
 }
 time.addEventListener("pointerdown",function(event){
  if(event.button!==0||scrubPointer!==null)return;
  scrubPointer=event.pointerId;
  doc.addEventListener("pointerup",endScrub);doc.addEventListener("pointercancel",endScrub);
 });
 time.addEventListener("input",function(){
  scrubTime=Number(time.value);
  if(scrubPointer===null)flushScrub();
  else if(!scrubFrame)scrubFrame=requestAnimationFrame(flushScrub);
 });
 time.addEventListener("change",flushScrub);
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
  if(scrubFrame)cancelAnimationFrame(scrubFrame);
  doc.removeEventListener("pointerup",endScrub);doc.removeEventListener("pointercancel",endScrub);
  self._dead=true;generation++;stopFrames();if(self._videoExporter)self._videoExporter.dispose();sfx.dispose();voice.dispose();LipSync.reset(view);clearNotes();if(workspace)workspace.dispose();if(editor)editor.dispose();
  if(session)Playback.unregister(session);
  songs.forEach(function(song){
   var c=song.controller;if(!c)return;c._disposed=true;
   try{c.destroy();}catch(_ignored){}
  });controller=null;
 };
 // Script edits may rebuild this widget. Open the face workspace after that
 // queued rebuild so the saved line and its character remain the context.
 function openFace(details){
  self._pendingFaceOpen=details;
  Promise.resolve().then(function(){
   var pending=self._pendingFaceOpen,current=self._workspace;
   if(self._dead||!pending||!current||!current.openFace)return;
   self._pendingFaceOpen=null;current.openFace(pending);
  });
 }
 editor=Editor.attach({displayName:displayName,doc:doc,host:host,wiki:this.wiki,film:scene,view:view,
  sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,scoreTitle:this.scoreTitle,
  duration:function(){return duration;},clips:function(){return clips;},beatClock:function(){return beatClock;},
  updateClips:function(updated){
   clips=Playlist.reflow(updated,self.scoreTitle);
   beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
   songs.forEach(function(song,i){if(clips[i]&&clips[i].id===song.clip.id)song.clip=clips[i];
    else{var match=clips.find(function(c){return c.id===song.clip.id;});if(match)song.clip=match;}});
   duration=fullDuration();
   timeline.duration=duration;time.max=String(duration);applyGains(timeline.value(),true);
   // A user's unmute gesture can unlock a previously unused ABC context.
   if(timeline.running){if(clips.some(audibleClip))unlockMusicAudio();syncAudio(timeline.value());}
  },
  seek:seek,repaint:function(){paint(timeline.value());},
  pause:function(){if(timeline.running)pauseAll();},isPlaying:function(){return timeline.running;},
  onEditScore:function(title,clip){if(workspace)workspace.openScore(title,clip);},
  onEditAudio:function(details){if(workspace)workspace.openNarration(details);},
  onEditScenes:function(){if(workspace)workspace.openScenes();},
  onEditCaptions:function(details){if(workspace&&workspace.openManuscript)workspace.openManuscript(details);},
  onEditFace:openFace,
  onPreviewChange:function(){
   if(!timeline)return;
   var position=timeline.value();applyGains(position,true);
   if(editor&&editor.isSfxAudible&&!editor.isSfxAudible())sfx.quiet();
   sfx.last=position;
   // This callback runs on the actual speaker-button gesture, so resuming a
   // muted lane can unlock its existing media without changing stored clips.
   if(timeline.running){
    voice.sync(position,timeline.rate);
    if(clips.some(audibleClip))unlockMusicAudio();
    syncAudio(position);
   }
  },
  onAudioChange:function(updated){scene.musical.audioClips=updated;refreshCueScores();voice.setClips(updated);lipOptions.audioClips=updated;LipSync.invalidate(view);duration=fullDuration();timeline.duration=duration;time.max=String(duration);paint(timeline.value());},
  onFxChange:function(cues){scene.musical.sfx=cues;refreshCueScores();sfx.cues=cues;if(timeline.running)sfx.seek(timeline.value());paint(timeline.value());},
  previewFx:function(cue){pauseAll();sfx.quiet();sfx.unlock();sfx.fire(cue);},
  stopPreviewFx:function(){sfx.quiet();},
  onSelect:function(t){if(workspace)workspace.selectTrack(t);},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._editor=editor;
 workspace=Workspace.mount({
  displayName:displayName,previewPreference:this._previewPreference,rememberPreview:function(mode){self._previewPreference=mode;},
  doc:doc,host:host,wiki:this.wiki,parentWidget:this,project:displayName(scene.name||"Musical"),film:scene,sceneTitle:this.sceneTitle,stageTitle:this._stageTitle,
  scoreTitle:function(){return songs[activeIndex]&&songs[activeIndex].title||self.scoreTitle;},
  activeScoreClip:function(){return clips[activeIndex];},
  seekScore:function(id,times){
   var index=clips.findIndex(function(clip){return clip.id===id;});
   if(index>=0&&times.length)seekScore(index,times);
  },
  onAudioChange:function(updated){scene.musical.audioClips=updated;refreshCueScores();voice.setClips(updated);lipOptions.audioClips=updated;LipSync.invalidate(view);duration=fullDuration();timeline.duration=duration;time.max=String(duration);if(editor)editor.redraw();paint(timeline.value());},
  markOwnWrite:function(title,body){self._ownWritten[title]=body;},repaint:function(){paint(timeline.value());},
  openFace:openFace,
  layout:layout,transport:transport,play:play,view:view,editor:editor,
  refreshScore:function(){showSong(timeline.value());},
  seek:seek,position:function(){return timeline.value();},
  pause:function(){if(timeline.running)pauseAll();},
  reload:function(){Promise.resolve().then(function(){if(alive())self.refreshSelf();});}
 });
 this._workspace=workspace;
 if(VideoExport&&VideoExport.attach)this._videoExporter=VideoExport.attach({
  host:host,controls:transport,stage:stage,scene:scene,wiki:this.wiki,
  beginExport:function(){
   var restoreWorkspace=workspace&&workspace.beginExport?workspace.beginExport():null;
   var restoreEditor=editor&&editor.beginExport?editor.beginExport():null;
   return function(){try{if(restoreEditor)restoreEditor();}finally{if(restoreWorkspace)restoreWorkspace();}};
  },
  seek:seek,position:function(){return timeline.value();},duration:function(){return duration;},
  pause:function(){if(timeline.running)pauseAll();},getABC:function(){return ABCObject;},
  getSongs:function(){return songs.map(function(s){if(authoredAudibleClip(s.clip))ensureNotation(s);return {clip:s.clip,title:s.title,tune:s.tune,config:s.config||{}};});},
  getDependencyTitles:function(){
   var visual=Engine.dependencies?Object.keys(Engine.dependencies(view)):[self.sceneTitle],audio=[self.sceneTitle],captions=visual.slice();
   songs.forEach(function(song){audio.push(song.title);visual.push(song.title);});
   (scene.musical&&scene.musical.audioClips||[]).forEach(function(clip){audio.push(clip.asset);});
   // Translation tables also depend on the original timeline they translate.
   (self.wiki.filterTiddlers?self.wiki.filterTiddlers("[tag[$:/tags/HUW/CaptionTranslations]]"):[]).forEach(function(title){
    captions.push(title);try{captions.push(JSON.parse(self.wiki.getTiddlerText(title,"{}")).sourceTiddler);}catch(_){}
   });
   function titles(values){return values.filter(function(title,index){return typeof title==="string"&&title&&values.indexOf(title)===index;}).sort();}
   return {visual:titles(visual),audio:titles(audio),captions:titles(captions)};
  },
  getLiveExportState:function(){
   function lipState(clip){var value={};["id","cueId","sceneTitle","start","offset","duration","sourceDuration","text"].forEach(function(key){if(clip[key]!==undefined)value[key]=clip[key];});return value;}
   var selector=host.querySelector('[data-huw-animus-captions="language"]');
   // Exclude tune/controller objects and the time-dependent playback gain.
   return JSON.parse(JSON.stringify({
    visual:{faceKeys:scene.musical&&scene.musical.faceKeys||[],songs:clips.map(function(clip){return {id:clip.id,score:clip.score,start:clip.start,duration:clip.duration};}),lipSync:(scene.musical&&scene.musical.audioClips||[]).map(lipState)},
    audio:{songs:songs.map(function(song){return {clip:song.clip,config:song.config||{}};}),recordings:scene.musical&&scene.musical.audioClips||[],effects:scene.musical&&scene.musical.sfx||[],soundFont:soundfont},
    captions:{language:selector?selector.value:"auto"}
   }));
  },
  soundFont:function(){return soundfont;}
 });
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
     if(!alive()||!timeline.running||!audibleClip(clips[index])||!Number.isFinite(Number(beat))||!(Number(total)>0))return;
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
 // Scene animation and recorded takes are usable before notation finishes.
 // A pending ABC library must never disable their shared Play gesture.
 var positions=languagePositions.get(this.wiki);
 if(positions&&positions.has(this._positionKey)){
  seek(positions.get(this._positionKey));positions.delete(this._positionKey);
 }
 Playback.register(session);ready=true;play.disabled=false;state.textContent=L.ready;
 // A long production can contain many muted guide scores. Only draw the
 // visible guide; drawing all of them at once blocks the editor's main thread.
 // Audible scores are still prepared up front so their performed lengths are
 // known, while muted guides keep the film's authored timing.
 function refreshCueScores(){
  songs.forEach(function(song,index){if(song.cueScore){clearNotes(index);song.cueReady=false;song.page.textContent="";song.events=[];}});
 }
 function ensureNotation(song){
  if(song&&song.cueScore){
   if(!song.cueReady){
    var index=songs.indexOf(song);
    song.events=CueScore.render(CueScore.resolve(song.cueScore,scene,song.clip),{doc:doc,page:song.page,seek:function(times){seekScore(index,times);}});song.cueReady=true;
   }return;
  }
  if(!ABCObject||!song||song.tune||song.notationFailed)return;
  try{
   var parsed=ABCObject.renderAbc(song.page,song.source,{responsive:"resize",add_classes:true});
   song.tune=parsed&&parsed[0];
   if(!song.tune)throw Error("ABC notation could not be rendered: "+song.title);
   if(song.page.querySelectorAll)Array.prototype.forEach.call(song.page.querySelectorAll("text, tspan"),function(label){
    if(label.childElementCount)return;
    var original=label.textContent,translated=displayName(original);
    if(translated!==original)label.textContent=translated;
   });
   var seconds=typeof song.tune.getTotalTime==="function"?Number(song.tune.getTotalTime()):NaN;
   if(!(seconds>0)){
    if(typeof song.tune.setTiming==="function")song.tune.setTiming();
    var ev=song.tune.noteTimings||[];
    if(ev.length)seconds=Number(ev[ev.length-1].milliseconds)/1000;
   }
   // Muted guide notation belongs to the authored film timeline. Its ABC
   // rendition may be longer than the recorded take it accompanies. Keep
   // that authored spacing if a guide is subsequently unmuted.
   if(!song.guideTiming&&!song.clip.muted&&seconds>0&&Number.isFinite(seconds))song.clip.duration=seconds;
   try{if(!song.tune.noteTimings&&typeof song.tune.setTiming==="function")song.tune.setTiming();}catch(_ignored){}
   song.events=(song.tune.noteTimings||[]).filter(function(ev){
    return ev&&Number.isFinite(Number(ev.milliseconds))&&ev.elements&&ev.elements.length;
   }).slice().sort(function(a,b){return a.milliseconds-b.milliseconds;});
    indexScoreNotes(song);
   if(typeof Accompaniment.prepare==="function")
    // 'live=true' in ABC forces bass, chords, drums and metronome ON for
    // synthesis even when the score has enabled:false. That silently loads
    // extra SoundFont instruments in every AniMus scene and can exhaust
    // iPad/Safari audio resources. Use live mode only when backing is enabled.
    // With enabled:false the written ABC voices still use ABC's shared mixer.
    Accompaniment.prepare(ABCObject,song.tune,song.source,song.config,song.config.enabled===true,song.fields);
   var heading=node(doc,"div","huw-musical-score-label",displayName(song.title));
   song.page.insertBefore(heading,song.page.firstChild);
  }catch(error){
   song.notationFailed=true;song.tune=null;
   song.page.textContent=L.error+String(error&&error.message||error);
   song.page.classList.add("huw-musical-error");
  }
 }
 Loader.load().then(function(ABC){
  if(!alive())return;
  var canAudio=!!(ABC.synth&&ABC.synth.supportsAudio&&ABC.synth.supportsAudio());
  ABCObject=ABC;soundReady=canAudio;
  // Audible scores determine timing. Muted guides only need engraving when the score is visible.
  songs.forEach(function(song){if(!song.clip.muted||(!song.page.hidden&&host.dataset.previewMode!=="stage"))ensureNotation(song);});
  clips=Playlist.reflow(songs.map(function(song){return song.clip;}),self.scoreTitle);
  beatClock=Motion.beatClock(clips,function(title){var tid=self.wiki.getTiddler(title);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
  songs.forEach(function(song,i){song.clip=clips[i];});
  duration=fullDuration();timeline.duration=duration;
  // The editor may already have sought past an opening fade while ABC loaded.
  // Preserve that cursor instead of repainting an unrelated first frame.
  var position=timeline.value();
  time.max=String(duration);paint(position);
  // The notes and visual master clock are ready before samples finish loading.
  // Audio remains optional; no missing SoundFont can block the theatre.
  state.textContent=canAudio||!clips.some(audibleClip)?L.ready:L.noAudio;
  applyGains(position,true);

 }).catch(function(error){
  // ABC can be unavailable offline; the visual stage and timeline still run.
  if(!alive())return;
  host.dataset.audioMode="stage-only";
  state.textContent=!clips.some(audibleClip)?L.ready:L.noAudio+" ("+String(error&&error.message||error).slice(0,100)+")";
 });
};
Musical.prototype.onDestroy=function(){
 if(!this._shutdown)return;
 if(this._timeline&&(this._refreshLanguagePack||this._language!==this.wiki.getTiddlerText("$:/language",""))){
  // A language change can rebuild an enclosing page template and create a new widget.
  var positions=languagePositions.get(this.wiki)||new Map(),key=this._positionKey;
  positions.set(key,this._timeline.value());languagePositions.set(this.wiki,positions);
  Promise.resolve().then(function(){positions.delete(key);});
 }
 this._shutdown();this._shutdown=null;
};
Musical.prototype.removeChildDomNodes=function(){
 this.onDestroy();
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
 this._refreshLanguagePack=!!changed[Language.packTitle(this.wiki)];
 var languageChanged=changed["$:/language"]&&this._language!==this.wiki.getTiddlerText("$:/language","")||this._refreshLanguagePack;
 if(Object.keys(attributes).length||externalChange(this.sceneTitle)||externalChange(this._stageTitle)||changed[this.scoreTitle]||languageChanged||(this._playlistTitles||[]).some(function(t){return changed[t];})){
  this.refreshSelf();
  return true;
 }
 return false;
};
exports["musical-stage"]=Musical;
})();
