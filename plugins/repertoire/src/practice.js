/*\
title: $:/plugins/huwiki/repertoire/practice.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Music Minus One is a *listening overlay*, not a new arrangement. Its settings
// must never be written to the original ABC score or any orchestra's repertoire.
function clone(value){return JSON.parse(JSON.stringify(value||{}));}
function overlay(original,options){
 var base=clone(original),state=options||{};
 if(!state.enabled)return base;
 base.metronome=state.metronome===true;
 base.backingModes=Object.assign({},base.backingModes||{},
  {metronome:base.metronome?"normal":"mute"});
 var voice=String(state.voice===undefined||state.voice===null?"":state.voice);
 if(/^(?:0|[1-9]\d*)$/.test(voice)){
  base.voiceSettings=Object.assign({},base.voiceSettings||{});
  base.voiceSettings[voice]=Object.assign({},base.voiceSettings[voice]||{},
   {mode:"mute",muted:true});
 }
 return base;
}
function isAudible(original,options,voice){
 var selected=overlay(original,options).voiceSettings||{};
 return !selected[String(voice)]||selected[String(voice)].mode!=="mute";
}
exports.overlay=overlay;
exports.isAudible=isAudible;
})();