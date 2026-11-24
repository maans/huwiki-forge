/*\
title: $:/plugins/huwiki/abc/volta-layout.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// Bars per system is a target. A one-bar second ending must share its system
// with the previous measure instead of becoming a separate, nearly empty row.
// Extend the preceding system by that short ending: moving its first ending
// to the next system can leave a detached "1" bracket on the previous row.
function balance(voice,breaks){
 var bars=[],barIndex=0,hasNotes=false,ending=null;
 voice.forEach(function(e){
  if(e.el_type==='note')hasNotes=true;
  if(e.el_type!=='bar')return;
  if(hasNotes)bars.push({index:barIndex,ending:ending,end:!!e.endEnding});
  ending=e.startEnding;barIndex++;hasNotes=false;
 });
 var result=breaks.slice();
 result.forEach(function(at,i){
  var index=bars.findIndex(function(b){return b.index===at;}),next=bars[index+1];
  if(index<1||!next||!/(^|,)2(?:$|,|-)/.test(String(next.ending||'')))return;
  if(!next.end&&index+2<bars.length)return; // Multi-bar endings keep their layout.
  result[i]=next.index;
 });
 return result.filter(function(at,i){return bars.length&&at<bars[bars.length-1].index&&(i===0||at!==result[i-1]);});
}
exports.balance=balance;
})();
