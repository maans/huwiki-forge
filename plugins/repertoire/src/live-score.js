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
function putHeader(source,letter,value){
 var pattern=new RegExp("^(\\s*"+letter+":)\\s*[^\\r\\n]*$","m");
 if(pattern.test(source))return source.replace(pattern,function(_,prefix){return prefix+value;});
 if(letter==="Q"){
  var at=source.search(/^\s*K:/m);
  if(at>=0)return source.slice(0,at)+"Q:"+value+"\n"+source.slice(at);
 }
 return source;
}
function apply(ABC,source,agreement){
 var original=String(source||""),requested=agreement||{},keyName=header(original,"K").split(/\s+/)[0];
 if(!keyName)return {source:original,transposed:false,tempoChanged:false};
 var wanted=String(requested.key||keyName).trim();
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
exports.keyOf=keyOf;
exports.stepsBetween=stepsBetween;
exports.apply=apply;
})();