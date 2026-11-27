/*\
title: $:/plugins/huwiki/abc/audio-controller.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// Keep ABCJS's controls and timing callbacks. Guard asynchronous preparation and
// resume so Stop, closing a tiddler, and changing tempo cannot restart old sound.
var Reserve=require('$:/plugins/huwiki/abc/reserve-mixer.js');
function cancelled(){var e=new Error('Afspilningen er annulleret.');e.name='AbortError';return e;}
exports.install=function(controller,ABC,options){
 options=options||{};
 var revision=0,pending=null,playPending=null,preparingOwner=null,playClickTarget=null;
 controller.isPreparing=false;
 function normalizeEngine(value){return ['auto','original','fluid','tiny'].indexOf(value)>=0?value:'auto';}
 var selectedEngine=normalizeEngine(options.engineMode||(options.wiki&&options.wiki.getTiddlerText&&options.wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto'))||'auto');
 var nativeSetTune=controller.setTune,nativeLoad=controller.load;
 function alive(stamp){return stamp===revision&&!controller._disposed&&(!options.isCurrent||options.isCurrent());}
 function check(stamp){if(!alive(stamp))throw cancelled();}
 function stopped(paused){if(options.onStop)options.onStop(!!paused);}
 function nativePreparingButton(value){
  if(!playClickTarget)return;
  if(playClickTarget.classList)playClickTarget.classList.toggle('abcjs-loading',value);
  if(playClickTarget.setAttribute&&playClickTarget.removeAttribute){if(value)playClickTarget.setAttribute('aria-busy','true');else playClickTarget.removeAttribute('aria-busy');}
 }
 function preparing(value){
  value=!!value;if(controller.isPreparing===value)return;
  controller.isPreparing=value;nativePreparingButton(value);if(options.onPreparing)options.onPreparing(value);
 }
 function beginPreparing(){var owner={};preparingOwner=owner;preparing(true);return owner;}
 function finishPreparing(owner){if(owner&&preparingOwner===owner){preparingOwner=null;preparing(false);}}
 function cancelPreparing(){preparingOwner=null;preparing(false);}
 function afterPaint(){
  // A resolved AudioContext promise can otherwise run sample/sequence work in
  // the same frame as the click. Let the new button state paint first.
  if(typeof requestAnimationFrame!=='function'||typeof setTimeout!=='function')return Promise.resolve();
  return new Promise(function(resolve){
   var done=false,fallback=setTimeout(finish,80);
   function finish(){if(done)return;done=true;clearTimeout(fallback);resolve();}
   requestAnimationFrame(function(){setTimeout(finish,0);});
  });
 }
 function context(){
  var ctx=ABC.synth.activeAudioContext();
  if(!ctx){var AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)throw new Error('Web Audio understøttes ikke i denne browser.');ctx=new AudioCtor();ABC.synth.registerAudioContext(ctx);}
  return ctx;
 }
 function stopTimer(reset){if(controller.timer){try{if(reset)controller.timer.reset();controller.timer.stop();}catch(_ignore){}}}
 function discard(){
  revision++;pending=null;playPending=null;cancelPreparing();controller.isLoading=false;controller.isLoaded=false;
  stopTimer(true);controller.timer=null;
  var buffer=controller.midiBuffer;controller.midiBuffer=null;
  if(buffer){if(buffer.cancel)buffer.cancel();try{buffer.stop();}catch(_ignore){}if(buffer.release)buffer.release();else if(buffer.disposeMixer)buffer.disposeMixer();}
  if(Reserve.stopAuditions)Reserve.stopAuditions();
  controller.isStarted=false;stopped(false);
 }
 function failure(error){if(error&&error.name!=='AbortError'&&options.onError)options.onError(error);}
 function syncWarp(){
  var control=controller.control;if(!control)return;
  // ABCJS's setWarp assumes its optional tempo input exists. HUWiki uses
  // its own tempo controls, so only update ABCJS's tempo label in that case.
  if(control.parent&&control.parent.querySelector('.abcjs-midi-tempo'))control.setWarp(controller.currentTempo,controller.warp);
  else control.setTempo(controller.currentTempo);
 }
 controller.go=function(){
  if(pending)return pending;
  if(!controller.visualObj)return Promise.reject(new Error('Der er ingen melodi at afspille.'));
  var stamp=revision,ctx,buffer,resumed,ownsPreparing=!preparingOwner;
  var preparation=preparingOwner||beginPreparing();
  try{
   check(stamp);ctx=context();
   buffer=controller.midiBuffer;
   if(!buffer){
    buffer=Reserve.createMixer(ABC,options.getConfig,{wiki:options.wiki,
     engineMode:function(){return selectedEngine;},isCancelled:function(){return controller._disposed||controller.midiBuffer!==buffer||(options.isCurrent&&!options.isCurrent());},
     onStatus:function(state){if(controller.midiBuffer===buffer&&(!options.isCurrent||options.isCurrent())&&options.onStatus)options.onStatus(state);},runtime:options.runtime});
    controller.midiBuffer=buffer;
   }
   controller.isLoading=true;controller.isLoaded=false;
   var ms=controller.visualObj.millisecondsPerMeasure()*100/controller.warp;
   controller.currentTempo=Math.round(controller.visualObj.getBeatsPerMeasure()/ms*60000);
   if(controller.control)controller.control.setTempo(controller.currentTempo);
   controller.percent=0;
   resumed=ctx.resume();
  }catch(error){controller.isLoading=false;if(ownsPreparing)finishPreparing(preparation);failure(error);return Promise.reject(error);}
  var response;
  var task=Promise.resolve(resumed).then(function(){check(stamp);return afterPaint();}).then(function(){
   check(stamp);
   return buffer.init({audioContext:ctx,visualObj:controller.visualObj,options:controller.options||{},millisecondsPerMeasure:ms});
  }).then(function(result){check(stamp);response=result;return buffer.prime();}).then(function(){
   check(stamp);
   var cursor=controller.cursorControl,subdivisions=16;
   if(cursor&&Number(cursor.beatSubdivisions)>=1&&Number(cursor.beatSubdivisions)<=64)subdivisions=parseInt(cursor.beatSubdivisions,10);
   controller.timer=new ABC.TimingCallbacks(controller.visualObj,{beatCallback:controller.beatCallback,eventCallback:controller.eventCallback,
    lineEndCallback:controller.lineEndCallback,qpm:controller.currentTempo,
    extraMeasuresAtBeginning:cursor?cursor.extraMeasuresAtBeginning:undefined,
    lineEndAnticipation:cursor?cursor.lineEndAnticipation:0,beatSubdivisions:subdivisions});
   if(cursor&&typeof cursor.onReady==='function')cursor.onReady(controller);
   controller.isLoaded=true;controller.isLoading=false;
   return {status:'created',notesStatus:response};
  }).catch(function(error){
   if(alive(stamp)){controller.isLoading=false;controller.isLoaded=false;failure(error);}
   throw error;
  }).finally(function(){if(pending===task)pending=null;if(ownsPreparing)finishPreparing(preparation);});
  pending=task;return task;
 };
 controller.runWhenReady=function(fn,arg){
  if(!controller.visualObj)return Promise.resolve({status:'loading'});
  var stamp=revision;
  return Promise.resolve(controller.isLoaded?null:controller.go()).then(function(){check(stamp);return fn(arg);}).catch(function(error){
   if(error&&error.name==='AbortError')return {status:'cancelled'};
   throw error;
  });
 };
 controller._play=function(){
  var stamp=revision,preparation=controller.isStarted?null:(preparingOwner||beginPreparing()),resumed;
  try{resumed=context().resume();}catch(error){finishPreparing(preparation);return Promise.reject(error);}
  return Promise.resolve(resumed).then(function(){
   check(stamp);
   if(controller.isStarted){controller.pause();return {status:'paused'};}
   if(!controller.isLoaded||!controller.timer||!controller.midiBuffer)throw cancelled();
   if(options.beforePlay)options.beforePlay();
   check(stamp);
   controller.isStarted=true;
   if(controller.cursorControl&&controller.cursorControl.onStart)controller.cursorControl.onStart();
   check(stamp);controller.midiBuffer.start();controller.timer.start(controller.percent);
   if(options.onStatus&&controller.midiBuffer.getState)options.onStatus(controller.midiBuffer.getState());
   if(controller.control)controller.control.pushPlay(true);
   finishPreparing(preparation);
   return {status:'ok'};
  }).catch(function(error){finishPreparing(preparation);throw error;});
 };
 controller.play=function(){
  if(playPending)return playPending;
  var stamp=revision,preparation=controller.isStarted?null:beginPreparing();
  var task;
  try{task=Promise.resolve(controller.runWhenReady(controller._play));}catch(error){task=Promise.reject(error);}
  task=task.catch(function(error){if(alive(stamp))failure(error);throw error;}).finally(function(){if(playPending===task)playPending=null;finishPreparing(preparation);});
  playPending=task;return task;
 };
 function playClicked(event){
  event.preventDefault();event.stopImmediatePropagation();
  // Native ABCJS waits for AudioContext.resume before invoking play(). Route
  // the gesture here so every button reports preparation before that wait.
  controller.play().catch(function(){});
 }
 if(typeof nativeLoad==='function')controller.load=function(){
  if(playClickTarget)playClickTarget.removeEventListener('click',playClicked,true);
  var result=nativeLoad.apply(controller,arguments);
  var parent=controller.control&&controller.control.parent||arguments[0];
  playClickTarget=parent&&parent.querySelector&&parent.querySelector('.abcjs-midi-start');
  if(playClickTarget){playClickTarget.addEventListener('click',playClicked,true);nativePreparingButton(controller.isPreparing);}
  return result;
 };
 controller.pause=function(){
  // Pausing a preparation cancels it. Pausing prepared audio retains its cursor.
  if(controller.isLoading){discard();return;}
  revision++;pending=null;playPending=null;cancelPreparing();
  if(Reserve.stopAuditions)Reserve.stopAuditions();
  if(controller.timer)controller.timer.pause();
  if(controller.midiBuffer)try{controller.midiBuffer.pause();}catch(_ignore){}
  controller.isStarted=false;if(controller.control)controller.control.pushPlay(false);stopped(true);
 };
 controller.huwikiStop=function(){
  discard();controller._huwabcStopGeneration=(controller._huwabcStopGeneration||0)+1;
  controller.isLooping=false;controller.setProgress(0,1);
  if(controller.control){controller.control.pushPlay(false);controller.control.pushLoop(false);}
  if(controller.cursorControl&&controller.cursorControl.onFinished)controller.cursorControl.onFinished();
 };
 controller.destroy=function(){
  discard();controller.setProgress(0,1);
  if(playClickTarget){playClickTarget.removeEventListener('click',playClicked,true);playClickTarget=null;}
  if(controller.control)controller.control.resetAll();
 };
 controller.setTune=function(tune,userAction,params){
  discard();return nativeSetTune.call(controller,tune,userAction,params);
 };
 controller.setWarp=function(value){
  var warp=parseInt(value,10);if(!(warp>0))return Promise.resolve();
  var wasPlaying=controller.isStarted,position=Number(controller.percent)||0,loop=controller.isLooping;
  var prepared=controller.isLoaded||controller.isLoading;
  controller.warp=warp;
  // Changing an unplayed tune's tempo must not download sounds without a gesture.
  if(!prepared){
   if(controller.visualObj)controller.currentTempo=Math.round(controller.visualObj.getBeatsPerMeasure()/controller.visualObj.millisecondsPerMeasure()*60000*warp/100);
   syncWarp();
   return Promise.resolve({status:'deferred'});
  }
  discard();controller.isLooping=loop;var stamp=revision;
  return controller.go().then(function(){
   check(stamp);controller.setProgress(position,controller.midiBuffer.duration*1000);
   syncWarp();if(controller.control)controller.control.pushLoop(loop);
   controller.seek(position);
   if(wasPlaying)return controller._play();
   return {status:'ready'};
  }).catch(function(error){if(error&&error.name==='AbortError')return {status:'cancelled'};failure(error);throw error;});
 };
 controller.setEngineMode=function(next){
  next=normalizeEngine(next);
  if(next===selectedEngine)return selectedEngine;
  selectedEngine=next;
  controller.huwikiStop();
  if(options.onStatus)options.onStatus({engine:next==='auto'?'original':next,mode:next,phase:'selected',reason:'manual',local:next==='tiny'});
  if(options.onEngineMode)options.onEngineMode(next);
  return selectedEngine;
 };
 controller.engineMode=function(){return selectedEngine;};
 // Backwards-compatible entry points for older macros and published sites.
 controller.setReserveMode=function(force){return controller.setEngineMode(force?'fluid':'auto')==='fluid';};
 controller.reserveMode=function(){return selectedEngine==='fluid';};
 controller.getAudioState=function(){return controller.midiBuffer&&controller.midiBuffer.getState?controller.midiBuffer.getState():{engine:selectedEngine==='auto'?'original':selectedEngine,mode:selectedEngine,phase:'idle'};};
 controller.audition=function(notes,tune){
  var stamp=revision;
  try{check(stamp);context();}catch(error){return Promise.reject(error);}
  var buffer=controller.midiBuffer;
  if(buffer&&buffer.audition)return buffer.audition(notes,tune);
  return Reserve.audition(ABC,notes,tune,{wiki:options.wiki,getConfig:options.getConfig,runtime:options.runtime,
   soundFontUrl:controller.options&&controller.options.soundFontUrl,engineMode:selectedEngine,onStatus:options.onStatus,
   isCancelled:function(){return !alive(stamp);}});
 };
 return controller;
};
})();
