/* AniMus audience player. Uses the same scene, music, motion and recorded
 * audio modules as the editor, with one shared clock and no authoring UI. */
(function(){
"use strict";
var players=[];
function num(v,f){v=Number(v);return Number.isFinite(v)?v:f;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function label(da,en){return /^da/i.test(document.documentElement.lang||"en")?da:en;}
function el(doc,tag,cls,text,parent){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);if(parent)parent.appendChild(n);return n;}
function timeLabel(t){t=Math.max(0,num(t,0));return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");}
function contains(root,node){return root===node||!!(root&&root.contains&&root.contains(node));}
function selected(root){var out=[];if(root&&root.matches&&root.matches(".huw-site-animus[data-animus-title]"))out.push(root);return out.concat(Array.prototype.slice.call((root||document).querySelectorAll(".huw-site-animus[data-animus-title]")));}
function wikiFor(rows,config){
 var setting={"$:/config/huwiki/abc/soundfont":config.soundFont,"$:/config/huwiki/abc/reserve-base":config.reserveBase,"$:/config/huwiki/abc/audio-engine-mode":config.engineMode||"original"};
 return {getTiddler:function(title){return Object.prototype.hasOwnProperty.call(rows,title)?{fields:rows[title]}:null;},
  getTiddlerText:function(title,fallback){if(Object.prototype.hasOwnProperty.call(setting,title)&&setting[title]!==undefined)return String(setting[title]);return Object.prototype.hasOwnProperty.call(rows,title)?String(rows[title].text||""):(fallback===undefined?"":fallback);},
  each:function(callback){Object.keys(rows).forEach(function(title){callback({fields:rows[title]},title);});}};
}
function mount(host,rows,config){
 var doc=host.ownerDocument||document,Engine=window.HUWikiCutOutSite,registry=window.HUWikiAniMusModules;
 if(!Engine||!registry)throw Error("AniMus playback runtime is missing");
 function module(name){return registry.require("$:/plugins/huwiki/"+name+".js");}
 var Playlist=module("musical/playlist"),Motion=module("musical/motion"),Timeline=module("musical/sync").Timeline;
 var SoundFx=module("musical/sfx"),Narration=module("musical/narration-player"),Audio=module("abc/audio-controller"),Acc=module("abc/accompaniment"),Start=module("abc/start-position");
 var LipSync=module("musical/lipsync");
 var wiki=wikiFor(rows,config||{}),title=host.getAttribute("data-animus-title"),scene=Engine.readScene(wiki,title);
 if(!scene)throw Error(label("Forestillingen mangler: ","Production is missing: ")+title);
 var clips=Playlist.reflow(scene.musical&&scene.musical.songs,host.getAttribute("data-animus-score"));
 var recordings=scene.musical&&scene.musical.audioClips||[],fxCues=scene.musical&&scene.musical.sfx||[];
 var lipOptions={sceneTitle:title,audioClips:recordings};
 var duration=Math.max(.1,scene.duration,Playlist.total(clips));
 recordings.forEach(function(c){duration=Math.max(duration,num(c.start,0)+num(c.duration,0));});
 fxCues.forEach(function(c){duration=Math.max(duration,num(c.t,0)+num(c.duration,0));});
 var dead=false,frame=0,generation=0,ready=false,ABC=window.ABCJS,songs=[],lastGain=0;
 var beatClock=Motion.beatClock(clips,function(name){var tid=wiki.getTiddler(name);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
 var fx=new SoundFx.Fx(fxCues),voice;
 host.textContent="";host.setAttribute("tabindex","0");host.setAttribute("aria-label",scene.name||title);
 var stage=el(doc,"div","huw-animus-stage",undefined,host),view=Engine.build(doc,wiki,scene);stage.appendChild(view.svg);
 var overlay=el(doc,"div","huw-animus-captions",undefined,stage),cueText=el(doc,"div","huw-animus-cue","",overlay),lineText=el(doc,"div","huw-animus-line","",overlay);
 overlay.setAttribute("aria-live","off");var style=scene.musical&&scene.musical.captionStyle||{},scale=clamp(num(style.scale,1),.65,2.2);
 overlay.style.paddingBottom=clamp(num(style.bottom,5),1,30)+"%";
 lineText.style.fontSize="clamp(11px,"+(1.45*scale).toFixed(3)+"vw,"+Math.round(20*scale)+"px)";
 cueText.style.fontSize="clamp(10px,"+(1.15*scale).toFixed(3)+"vw,"+Math.round(15*scale)+"px)";
 lineText.style.maxWidth=clamp(num(style.width,98),45,100)+"%";
 lineText.style.backgroundColor="rgba(9,12,18,"+clamp(num(style.background,.66),0,1)+")";
 var controls=el(doc,"div","huw-animus-controls",undefined,host);
 function button(text,action,cls){var b=el(doc,"button",cls||"",text,controls);b.type="button";b.addEventListener("click",action);return b;}
 var play=button(label("▶ Afspil","▶ Play"),toggle,"huw-animus-play");play.setAttribute("aria-pressed","false");
 button(label("■ Stop","■ Stop"),stop,"huw-animus-stop");
 var range=el(doc,"input","huw-animus-range",undefined,controls);range.type="range";range.min="0";range.max=String(duration);range.step=".01";range.setAttribute("aria-label",label("Afspilningsposition","Playback position"));
 var clock=el(doc,"output","huw-animus-clock","",controls);
 var full=button(label("⛶ Fuld skærm","⛶ Full screen"),fullscreen,"huw-animus-fullscreen");full.setAttribute("aria-pressed","false");
 var status=el(doc,"p","huw-animus-status",label("Klar","Ready"),host);status.setAttribute("role","status");
 var musicHost=el(doc,"div","huw-animus-score-source",undefined,host);musicHost.setAttribute("aria-hidden","true");
 var timeline=new Timeline(duration,paint);
 voice=new Narration.Player({wiki:wiki,doc:doc,clips:recordings,onError:function(error){if(!dead)status.textContent=label("En optagelse kunne ikke afspilles. Forestillingen fortsætter. ","A recording could not play. The show continues. ")+String(error&&error.message||error).slice(0,100);}});
 function captionAt(outer,t,depth){
  if(!outer||depth>16)return null;
  var parts=(outer.scene.parts||[]).filter(function(p){return p.type==="text"&&/^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(p.id);});
  if(parts.length){parts.forEach(function(p){var n=outer.nodes[p.id];if(n&&n.el)n.el.style.display="none";});return {parts:parts,time:t};}
  var at=Engine.clipAt(outer.scene.scenes||[],t),offset=0,result=null;
  (outer.clips||[]).some(function(child,i){var d=Math.max(.1,num(child.settings&&child.settings.duration,4));
   if(i===at.index&&child.view){result=captionAt(child.view,Engine.localTime(clamp(t-offset,0,d),child.duration,child.settings),depth+1);return true;}offset+=d;return false;
  });return result;
 }
 function captions(t){var at=captionAt(view,t,0),cue="",line="";
  if(at)at.parts.forEach(function(p){if(Engine.state(p,at.time).opacity<.45)return;if(p.id==="sing-label")cue=String(p.text||"");else line+=(line?"\n":"")+String(p.text||"");});
  cueText.textContent=cue;lineText.textContent=line;cueText.hidden=!cue;lineText.hidden=!line;
 }
 function trackConfig(song){var c=Object.assign({},song.config||{}),gain=num(song.gain,0);
  ["melodyVolume","bassVolume","chordVolume","drumVolume","metronomeVolume","droneVolume"].forEach(function(k){if(Number.isFinite(Number(c[k])))c[k]=clamp(Math.round(Number(c[k])*gain),0,100);});return c;
 }
 function gains(t,force){var now=performance.now();if(!force&&now-lastGain<28)return;lastGain=now;
  songs.forEach(function(song){song.gain=Playlist.gainAt(song.clip,t);var c=song.controller;
   if(c&&c.isLoaded&&c.midiBuffer&&c.midiBuffer.setVolumes&&(force||Math.abs(song.gain-song.appliedGain)>.008)){song.appliedGain=song.gain;c.midiBuffer.setVolumes();}
  });
 }
 function problem(song,error){if(dead||error&&error.name==="AbortError")return;song.failed=true;song.pending=null;song.starting=false;
  if(song.controller&&song.controller.isStarted)song.controller.pause();
  host.setAttribute("data-audio-mode","stage-only");status.textContent=label("Musiklyden er ikke tilgængelig; forestillingen fortsætter. ","Music is unavailable; the show continues. ")+String(error&&error.message||error).slice(0,100);
 }
 function alive(){return !dead&&host.isConnected!==false;}
 function unlock(){
  fx.unlock();voice.unlock();if(!ABC||!ABC.synth)return false;
  try{var synth=ABC.synth,context=synth.activeAudioContext();if(!context){var Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)throw Error("Web Audio unavailable");context=new Constructor();synth.registerAudioContext(context);}
   if(context.state!=="running"&&context.resume)Promise.resolve(context.resume()).catch(function(e){if(!dead)status.textContent=label("Musikken kunne ikke startes: ","Music could not start: ")+String(e.message||e);});return true;
  }catch(_){return false;}
 }
 function install(song){
  if(song.controller)return Promise.resolve(song.controller);
  var native=el(doc,"div","",undefined,musicHost),c=Audio.install(new ABC.synth.SynthController(),ABC,{
   wiki:wiki,engineMode:config.engineMode||"original",getConfig:function(){return trackConfig(song);},isCurrent:alive,
   beforePlay:function(){if(dead||!timeline.running||song.startGeneration!==generation||!Playlist.isActive(song.clip,timeline.value())){var error=Error("Playback cancelled");error.name="AbortError";throw error;}
    if(c.timer)Start.seek(c,song.tune,clamp(timeline.value()-song.clip.start,0,song.clip.duration)*1000);},
   onError:function(e){problem(song,e);},onStop:function(){song.starting=false;}
  });
  song.controller=c;song.native=native;
  c.load(native,{onFinished:function(){song.finished=true;song.starting=false;},
   onBeat:function(beat,total){if(!dead&&timeline.running&&num(total,0)>0&&Playlist.locate(clips,timeline.value()).clip===song.clip)timeline.beatPosition(song.clip.start+song.clip.duration*Number(beat)/Number(total));}
  },{displayPlay:false,displayLoop:false,displayRestart:false,displayProgress:false,displayWarp:false});
  return Promise.resolve(c.setTune(song.tune,false,{soundFontUrl:config.soundFont||"https://paulrosen.github.io/midi-js-soundfonts/abcjs/"})).then(function(){return c;});
 }
 function prepare(song){if(!ready||!song.tune||song.failed||song.pending||song.controller&&song.controller.isLoaded)return;
  var task=Promise.resolve().then(function(){if(!alive())return null;return install(song);}).then(function(c){if(!c||!alive())return;return c.isLoaded?null:c.go();});
  song.pending=task;
  task.then(function(){if(song.pending===task)song.pending=null;if(alive()&&timeline.running)syncMusic(timeline.value());}).catch(function(error){if(song.pending===task)song.pending=null;problem(song,error);});
 }
 function release(song){var c=song.controller;song.controller=null;song.starting=false;song.appliedGain=-1;if(c){c._disposed=true;try{c.destroy();}catch(_){}}if(song.native){song.native.remove();song.native=null;}}
 function syncMusic(t){
  if(!timeline.running||!ready)return;
  songs.forEach(function(song){var c=song.controller,active=Playlist.isActive(song.clip,t);
   if(!active&&c&&c.isStarted)c.pause();
   if(!active&&c&&!song.pending&&t>song.clip.start+song.clip.duration+7){release(song);return;}
   if(active&&!song.failed){if(!c||!c.isLoaded)prepare(song);
    else if(!song.finished&&!song.starting&&!c.isStarted){song.starting=true;song.startGeneration=generation;var stamp=generation;
     Promise.resolve(c.play()).then(function(){if(song.startGeneration===stamp)song.starting=false;
      if(!alive()||stamp!==generation||!timeline.running||!Playlist.isActive(song.clip,timeline.value())){if(c.isStarted)c.pause();return;}
      if(c.isStarted){host.setAttribute("data-audio-mode","playing");status.textContent=label("Afspiller","Playing");}
     }).catch(function(error){if(song.startGeneration===stamp)song.starting=false;problem(song,error);});
    }
   }
  });
  if(!songs.some(function(song){return !!song.pending;})){
   var next=songs.filter(function(song){return song.tune&&!song.failed&&(!song.controller||!song.controller.isLoaded)&&song.clip.start>t&&song.clip.start-t<=20;}).sort(function(a,b){return a.clip.start-b.clip.start;})[0];
   if(next)prepare(next);
  }
 }
 function paint(t){if(dead)return;var visual=clamp(t,0,scene.duration);Engine.paint(view,visual);Motion.paint(view,scene,t,beatClock);LipSync.apply(view,visual,t,lipOptions);captions(visual);
  if(timeline&&timeline.running){fx.sync(t);voice.sync(t,timeline.rate);gains(t,false);syncMusic(t);}
  range.value=String(t);clock.textContent=timeLabel(t)+" / "+timeLabel(duration);host.setAttribute("data-time",t.toFixed(3));
 }
 function mark(playing){host.setAttribute("data-playing",String(playing));play.setAttribute("aria-pressed",String(playing));play.textContent=playing?label("Ⅱ Pause","Ⅱ Pause"):label("▶ Afspil","▶ Play");}
 function tick(){frame=0;if(!timeline.running||dead)return;if(!alive()||doc.hidden){pause();return;}
  var t=timeline.value();if(t>=duration-.001){pause();timeline.seek(duration);status.textContent=label("Færdig","Finished");return;}
  paint(t);frame=requestAnimationFrame(tick);
 }
 function pause(){generation++;timeline.pause();if(frame)cancelAnimationFrame(frame);frame=0;mark(false);fx.quiet();voice.pause();
  songs.forEach(function(song){song.starting=false;if(song.controller&&(song.controller.isStarted||song.controller.isLoading))song.controller.pause();});
 }
 function seek(t){var running=timeline.running;generation++;t=clamp(num(t,0),0,duration);
  songs.forEach(function(song){song.starting=false;song.finished=false;if(song.controller&&(song.controller.isStarted||song.controller.isLoading))song.controller.pause();});
  fx.seek(t);voice.seek(t);timeline.seek(t);gains(t,true);if(running)syncMusic(t);
 }
 function stop(){pause();seek(0);status.textContent=label("Klar","Ready");}
 function toggle(){if(timeline.running){pause();return;}
  players.forEach(function(p){if(p.host!==host)p.pause();});if(timeline.value()>=duration-.01)seek(0);generation++;
  songs.forEach(function(song){if(song.failed){release(song);song.failed=false;song.pending=null;}song.finished=false;});
  var sound=unlock();host.setAttribute("data-audio-mode",sound?"loading":"stage-only");
  status.textContent=sound?label("Klargør lyd …","Preparing sound …"):label("Musikken er ikke tilgængelig; forestillingen fortsætter.","Music is unavailable; the show continues.");
  fx.seek(Math.max(0,timeline.value()-.02));mark(true);timeline.play();gains(timeline.value(),true);if(!frame)frame=requestAnimationFrame(tick);
 }
 function focus(value){host.classList.toggle("huw-animus-focus",!!value);full.setAttribute("aria-pressed",String(!!value));full.textContent=value?label("✕ Luk fuld skærm","✕ Exit full screen"):label("⛶ Fuld skærm","⛶ Full screen");}
 function fullscreen(){if(doc.fullscreenElement===host){if(doc.exitFullscreen)Promise.resolve(doc.exitFullscreen()).catch(function(){});focus(false);return;}
  if(host.classList.contains("huw-animus-focus")){focus(false);return;}focus(true);
  if(host.requestFullscreen)Promise.resolve(host.requestFullscreen()).catch(function(){focus(true);});
 }
 function keydown(e){if(e.key==="Escape"&&host.classList.contains("huw-animus-focus")){e.preventDefault();focus(false);return;}
  if(e.target&&/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName))return;
  if(e.code==="Space"||e.key===" "){e.preventDefault();toggle();}
 }
 function fullChanged(){if(doc.fullscreenElement===host)focus(true);else if(!doc.fullscreenElement)focus(false);}
 range.addEventListener("input",function(){seek(Number(range.value));});host.addEventListener("keydown",keydown);doc.addEventListener("fullscreenchange",fullChanged);
 var player={host:host,pause:pause,seek:seek,play:toggle,stop:stop,value:function(){return timeline.value();},view:view,
  dispose:function(){if(dead)return;pause();dead=true;fx.dispose();voice.dispose();LipSync.reset(view);songs.forEach(release);doc.removeEventListener("fullscreenchange",fullChanged);host.removeEventListener("keydown",keydown);host.removeAttribute("data-animus-ready");focus(false);}}
 ;
 // The stage is usable immediately, even if the embedded score is invalid or
 // Web Audio is unavailable. Every late music start seeks to the shared clock.
 if(ABC&&typeof ABC.renderAbc==="function")clips.forEach(function(clip){var row=wiki.getTiddler(clip.score),fields=row&&row.fields||{},source=fields["abc-source"]||fields.text||"";
  var song={clip:clip,title:clip.score,tune:null,controller:null,native:null,pending:null,failed:false,starting:false,finished:false,gain:0,appliedGain:-1};songs.push(song);
  try{var page=el(doc,"div","",undefined,musicHost),rendered=ABC.renderAbc(page,source,{staffwidth:800});song.tune=rendered&&rendered[0];if(!song.tune)throw Error(label("Nodearket kunne ikke læses: ","Could not read score: ")+clip.score);
   var seconds=typeof song.tune.getTotalTime==="function"?Number(song.tune.getTotalTime()):NaN;if(!(seconds>0)&&song.tune.setTiming){song.tune.setTiming();var events=song.tune.noteTimings||[];if(events.length)seconds=Number(events[events.length-1].milliseconds)/1000;}
   if(seconds>0&&Number.isFinite(seconds))clip.duration=seconds;
   song.config=Acc.read(fields);Acc.prepare(ABC,song.tune,source,song.config,song.config.enabled===true,fields);
  }catch(error){problem(song,error);}
 });
 duration=Math.max(duration,Playlist.total(clips));timeline.duration=duration;range.max=String(duration);
 beatClock=Motion.beatClock(clips,function(name){var tid=wiki.getTiddler(name);return tid&&tid.fields&&(tid.fields["abc-source"]||tid.fields.text)||"";});
 ready=!!(ABC&&ABC.synth&&ABC.synth.supportsAudio&&ABC.synth.supportsAudio());
 host.setAttribute("data-animus-ready","1");paint(0);return player;
}
function prune(){players=players.filter(function(p){if(p.host.isConnected!==false)return true;p.dispose();return false;});}
function hydrate(root,rows,config){if(!rows)return;prune();selected(root).forEach(function(host){if(host.getAttribute("data-animus-ready"))return;
  try{players.push(mount(host,rows,config||{}));}catch(error){host.textContent=label("Forestillingen kunne ikke indlæses: ","Could not load production: ")+String(error.message||error);}
 });}
function dispose(root){players=players.filter(function(p){if(!root||contains(root,p.host)){p.dispose();return false;}return true;});}
function pause(){players.forEach(function(p){p.pause();});}
document.addEventListener("visibilitychange",function(){if(document.hidden)pause();});
window.addEventListener("pagehide",function(){dispose();});
window.HUWikiAniMusSite={hydrate:hydrate,mount:mount,dispose:dispose,pause:pause};
})();
