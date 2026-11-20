/*\
title: $:/plugins/huwiki/musical/score-playback.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Loader=require('$:/plugins/huwiki/abc/loader.js');
var Audio=require('$:/plugins/huwiki/abc/audio-controller.js');
var Accompaniment=require('$:/plugins/huwiki/abc/accompaniment.js');
var Playback=require('$:/plugins/huwiki/abc/playback.js');
var ScoreView=require('$:/plugins/huwiki/abc/score-view.js');

// A workshop owns one temporary player. Its inputs are the unsaved score,
// never the show's muted guide track or a separately saved score tiddler.
exports.mount=function(o){
 var doc=o.doc,wiki=o.wiki,host=o.host,da=o.da,ABC=null,controller=null,drone=null;
 var closed=false,revision=0,phase='library',signature='',renderHost=null,nativeHost=null;
 function alive(){return !closed&&host.isConnected!==false;}
 function startExclusive(c){if(o.startExclusive)o.startExclusive(c);else Playback.start(c);}
 function report(next,message){phase=next;if(alive()&&o.onState)o.onState({phase:next,message:message||''});}
 function snapshot(){
  var draft=o.getDraft();if(!draft)return null;
  var fields=draft.fields||{},source=String(draft.source||''),config=Accompaniment.read(fields);
  var soundfont=wiki.getTiddlerText('$:/config/huwiki/abc/soundfont','https://paulrosen.github.io/midi-js-soundfonts/abcjs/').trim();
  var swing=ScoreView.swingValue(fields,''),engine=wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto');
  return {fields:fields,source:source,config:config,soundfont:soundfont,swing:swing,
   signature:JSON.stringify([source,config,soundfont,swing,engine])};
 }
 function release(){
  var previous=controller;controller=null;signature='';
  if(drone){drone.stop();drone=null;}
  if(previous){previous._disposed=true;Playback.unregister(previous);previous.destroy();}
  if(nativeHost)nativeHost.remove();if(renderHost)renderHost.remove();nativeHost=renderHost=null;
 }
 function stop(){revision++;release();report('idle');return true;}
 function failure(error,stamp){
  if(!alive()||stamp!==revision||error&&error.name==='AbortError')return false;
  revision++;release();report('error',(da?'Musikken kunne ikke afspilles: ':'The music could not be played: ')+(error&&error.message||String(error)));return false;
 }
 function changed(){
  if(!alive()||!signature)return;
  var next=snapshot();if(next&&next.signature===signature)return;
  stop();report('idle',da?'Musikken er ændret. Tryk Afspil for at høre den nye udgave.':'The music has changed. Press Play to hear the new version.');
 }
 function unlock(){
  if(!ABC.synth||!ABC.synth.supportsAudio||!ABC.synth.supportsAudio())throw Error(da?'Lydafspilning er ikke tilgængelig i denne browser.':'Audio playback is not available in this browser.');
  var ctx=ABC.synth.activeAudioContext(),win=doc.defaultView;
  if(!ctx){var Constructor=win.AudioContext||win.webkitAudioContext;if(!Constructor)throw Error(da?'Web Audio er ikke tilgængelig.':'Web Audio is unavailable.');ctx=new Constructor();ABC.synth.registerAudioContext(ctx);}
  // Safari must receive resume in the actual Play gesture, before setTune or
  // soundfont preparation can yield. Reuse ABC's registered audio context.
  return Promise.resolve(ctx.resume());
 }
 function prepare(input){
  release();signature=input.signature;
  renderHost=doc.createElement('div');renderHost.className='huw-score-audio-preview';renderHost.hidden=true;renderHost.setAttribute('aria-hidden','true');host.appendChild(renderHost);
  nativeHost=doc.createElement('div');nativeHost.className='huw-score-audio-native';nativeHost.hidden=true;host.appendChild(nativeHost);
  var tunes=ABC.renderAbc(renderHost,input.source,{add_classes:true}),tune=tunes&&tunes[0];
  if(!tune)throw Error(da?'Kontrollér ABC-koden. Der blev ikke fundet en melodi.':'Check the ABC source. No tune was found.');
  // Silent show tracks must not silence this audition; the score's own
  // accompaniment switch still controls whether extra backing is generated.
  Accompaniment.prepare(ABC,tune,input.source,input.config,input.config.enabled===true,input.fields);
  var c,active=false;
  drone=Accompaniment.createDrone(function(){return input.config;},function(){return input.source;});
  c=Audio.install(new ABC.synth.SynthController(),ABC,{
   wiki:wiki,getConfig:function(){return input.config;},
   isCurrent:function(){return alive()&&controller===c;},
   onStatus:function(state){if(alive()&&controller===c&&state&&state.phase==='loading')report('loading',da?'Indlæser lyd …':'Loading sound …');},
   onStop:function(paused){if(active&&alive()&&controller===c){if(drone)drone.stop();report(paused?'paused':'idle');}}
  });
  controller=c;c._huwabcStopDrone=function(){if(drone)drone.stop();};Playback.register(c);
  c.load(nativeHost,{
   onStart:function(){if(!alive()||controller!==c)return;startExclusive(c);report('playing');if(drone&&input.config.droneEnabled)drone.start();},
   onFinished:function(){if(alive()&&controller===c)stop();}
  },{displayPlay:false,displayLoop:false,displayRestart:false,displayProgress:false,displayWarp:false});
  return Promise.resolve(c.setTune(tune,false,{soundFontUrl:input.soundfont,swing:input.swing})).then(function(){active=true;return c;});
 }
 function toggle(){
  if(!alive())return Promise.resolve(false);
  if(phase==='loading'){stop();return Promise.resolve(false);}
  if(controller&&controller.isStarted){revision++;controller.pause();return Promise.resolve(true);}
  if(!ABC)return load();
  var stamp=++revision,input,unlocked,prepared;
  try{
   input=snapshot();if(!input||!/^\s*X:\s*\d+/m.test(input.source)||!/^\s*K:/m.test(input.source))throw Error(da?'Musikken skal have X: og K: i ABC-koden.':'The ABC music needs X: and K: fields.');
   if(o.pause)o.pause();unlocked=unlock();
   prepared=controller&&signature===input.signature?Promise.resolve(controller):prepare(input);
   report('loading',da?'Klargør musik …':'Preparing music …');
  }catch(error){if(unlocked)unlocked.catch(function(){});return Promise.resolve(failure(error,stamp));}
  return Promise.all([unlocked,prepared]).then(function(values){
   if(!alive()||stamp!==revision)return false;
   var latest=snapshot();if(!latest||latest.signature!==input.signature){changed();return false;}
   var c=values[1];if(c!==controller)return false;
   startExclusive(c);return c.play();
  }).catch(function(error){return failure(error,stamp);});
 }
 function load(){
  report('library',da?'Indlæser nodebibliotek …':'Loading notation …');
  var stamp=revision;
  return Loader.load().then(function(lib){if(!alive())return false;ABC=lib;if(phase==='library')report('idle');return true;}).catch(function(error){return failure(error,stamp);});
 }
 function hidden(){if(doc.hidden)stop();}
 function destroy(){if(closed)return;closed=true;revision++;release();if(wiki.removeEventListener)wiki.removeEventListener('change',changed);if(doc.removeEventListener)doc.removeEventListener('visibilitychange',hidden);if(doc.defaultView.removeEventListener)doc.defaultView.removeEventListener('pagehide',stop);}
 if(wiki.addEventListener)wiki.addEventListener('change',changed);
 if(doc.addEventListener)doc.addEventListener('visibilitychange',hidden);
 if(doc.defaultView.addEventListener)doc.defaultView.addEventListener('pagehide',stop);
 return {toggle:toggle,stop:stop,destroy:destroy,ready:load()};
};
})();
