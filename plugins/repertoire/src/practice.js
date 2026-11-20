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
function otherSolo(config){
 var voices=config.voiceSettings||{},modes=config.backingModes||{};
 if(Object.keys(voices).some(function(id){return voices[id]&&voices[id].mode==="solo";}))return true;
 if(modes.drone==="solo"&&config.droneEnabled===true)return true;
 var bass=config.bassSource||"style";
 if(modes.bass==="solo"&&bass!=="none"&&(bass!=="style"||config.enabled===true))return true;
 return config.enabled===true&&(modes.chords==="solo"||modes.drums==="solo");
}
function overlay(original,options){
 var base=clone(original),state=options||{};
 if(!state.enabled)return base;
 base.metronome=state.metronome===true;
 base.backingModes=Object.assign({},base.backingModes||{});
 var voice=String(state.voice===undefined||state.voice===null?"":state.voice);
 if(/^(?:0|[1-9]\d*)$/.test(voice)){
  base.voiceSettings=Object.assign({},base.voiceSettings||{});
  base.voiceSettings[voice]=Object.assign({},base.voiceSettings[voice]||{},
   {mode:"mute",muted:true});
 }
 // ABC's solo bus includes the metronome. Join an existing solo mix, but do
 // not create one: muting the only solo voice must let the other voices play.
 // Decide after the Music Minus One mute, and never count the metronome itself.
 base.backingModes.metronome=base.metronome?(otherSolo(base)?"solo":"normal"):"mute";
 return base;
}
function isAudible(original,options,voice){
 var selected=overlay(original,options).voiceSettings||{};
 return !selected[String(voice)]||selected[String(voice)].mode!=="mute";
}
exports.overlay=overlay;
exports.isAudible=isAudible;
})();
