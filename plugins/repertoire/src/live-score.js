/*\
title: $:/plugins/huwiki/repertoire/live-score.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Repertoire must still load without ABC installed; resolve the transposer on demand.
var Transpose=null;
var PITCH={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function keyOf(name){
 var match=/^([A-Ga-g])([#b]?)(m?)$/.exec(String(name||"").trim());
 if(!match)return null;
 var root=PITCH[match[1].toUpperCase()]+(match[2]==="#"?1:match[2]==="b"?-1:0);
 // Minor uses the relative-major signature so K:F -> K:Dm is not a pitch shift.
 return {name:match[0],pc:(root+(match[3]==="m"?3:0)+12)%12};
}
function header(source,letter){
 var m=new RegExp("^\\s*"+letter+":\\s*(.*)$","m").exec(String(source||""));
 return m?m[1].trim():"";
}
function stepsBetween(sourceKey,targetKey){
 var from=keyOf(sourceKey),to=keyOf(targetKey);
 if(!from||!to)throw new Error("Tonearten kan ikke transponeres automatisk.");
 var n=(to.pc-from.pc+12)%12;return n>6?n-12:n;
}
// A global ABC MIDI transposition records the difference between the written
// part and sounding pitch. Keep arrangement keys in concert pitch throughout.
function soundingOffset(source){
 var head=String(source||"").split(/^\s*K:/m)[0];
 var values=Array.from(head.matchAll(/^%%MIDI\s+transpose\s+([+-]?\d+)[ \t]*(?:%[^\n]*)?$/gmi));
 return values.length?Number(values[values.length-1][1]):0;
}
function shiftKey(key,steps){
 if(!steps||steps%12===0)return key;
 var parsed=/^([A-Ga-g])([b#]?)(.*)$/.exec(key);
 if(!parsed)return key;
 var suffix=parsed[3],mode=suffix.toLowerCase();
 var modes={"":0,maj:0,major:0,ion:0,ionian:0,m:3,min:3,minor:3,aeo:3,aeolian:3,
  dor:-2,dorian:-2,phr:-4,phrygian:-4,lyd:-5,lydian:-5,mix:5,mixolydian:5,loc:1,locrian:1};
 if(!Object.prototype.hasOwnProperty.call(modes,mode))return key;
 var tonic=PITCH[parsed[1].toUpperCase()]+(parsed[2]==="#"?1:parsed[2]==="b"?-1:0);
 var pc=((tonic+steps)%12+12)%12,major=(pc+modes[mode]+12)%12;
 var names=(major===1||major===3||major===5||major===8||major===10)?
  ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"]:
  ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
 return names[pc]+suffix;
}
function putHeader(source,letter,value){
 var pattern=new RegExp("^(\\s*"+letter+":)\\s*[^\\r\\n]*$","m");
 if(pattern.test(source))return source.replace(pattern,function(_,prefix){return prefix+value;});
 if(letter==="Q"){
  var at=source.search(/^\s*K:/m);
  if(at>=0)return source.slice(0,at)+"Q:"+value+"\n"+source.slice(at);
 }
 return source;
}
// A modulation is arrangement metadata, not one unusually named key.
// Validate every listed key before applying one uniform concert-pitch shift.
function sequenceTarget(source,requested,offset){
 var text=String(requested||'').trim().replace(/♭/g,'b').replace(/♯/g,'#');
 var keys=text.split(/\s*(?:\+|→|->)\s*/);
 if(keys.length<2)return text;
 if(keys.some(function(k){return !keyOf(k);}))throw Error('Toneartsforløbet kan ikke læses.');
 var sourceKeys=[];
 Array.from(String(source).matchAll(/(?:^[ \t]*K:\s*|\[K:\s*)([^\s\]]+)/gm)).forEach(function(m){
  var key=m[1];if(sourceKeys[sourceKeys.length-1]!==key)sourceKeys.push(key);
 });
 if(sourceKeys.length!==keys.length)throw Error('Det aftalte toneartsforløb findes ikke i ABC-noden.');
 var shifts=keys.map(function(k,i){return stepsBetween(shiftKey(sourceKeys[i],offset),k);});
 if(shifts.some(function(n){return n!==shifts[0];}))throw Error('Toneartsforløbet kræver forskellige skift. Redigér selve arrangementet.');
 return keys[0];
}
function apply(ABC,source,agreement){
 var original=String(source||""),requested=agreement||{},keyName=header(original,"K").split(/\s+/)[0];
 if(!keyName)return {source:original,transposed:false,tempoChanged:false};
 var offset=soundingOffset(original),concertKey=shiftKey(keyName,offset);
 var target=sequenceTarget(original,requested.key||concertKey,offset);
 var wanted=target===concertKey?keyName:shiftKey(target,-offset);
 var semitones=wanted===keyName?0:stepsBetween(keyName,wanted);
 var out=semitones?(Transpose||(Transpose=require("$:/plugins/huwiki/abc/transpose.js"))).apply(ABC,original,semitones):original;
 if(wanted!==keyName){
  // ABCJS transposes chords and melody first. Preserve optional clef settings.
  out=out.replace(/^(\s*K:\s*)\S+([^\r\n]*)/m,function(_,prefix,suffix){return prefix+wanted+suffix;});
 }
 var originalTempo=header(original,"Q"),targetTempo=String(requested.tempo||originalTempo).trim();
 if(targetTempo&&targetTempo!==originalTempo)out=putHeader(out,"Q",targetTempo);
 return {source:out,transposed:!!semitones,keyChanged:wanted!==keyName,tempoChanged:targetTempo!==originalTempo};
}
exports.shiftKey=shiftKey;exports.soundingOffset=soundingOffset;
exports.keyOf=keyOf;
exports.stepsBetween=stepsBetween;
exports.apply=apply;
})();
