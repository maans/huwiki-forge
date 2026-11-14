/*\
title: $:/plugins/huwiki/musical/playlist.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// One music track with consecutive *complete* ABC tunes. ABC voices remain
// inside each tune. No fabricated silence or simultaneous playback.
function number(x,f){x=Number(x);return Number.isFinite(x)?x:f;}
function clamp(x,a,b){return Math.min(b,Math.max(a,number(x,a)));}
function reflow(songs,fallbackScore){
 var rows=Array.isArray(songs)&&songs.length?songs:[{id:"song-1",score:fallbackScore,duration:16,kind:"complete-abc"}];
 var pos=0,seen={};
 return rows.slice(0,20).filter(function(row){return row&&typeof row.score==="string"&&row.score.trim();}).map(function(row,i){
  var clip=Object.assign({},row),id=String(clip.id||"song-"+(i+1));
  if(seen[id])id+="-"+(i+1);seen[id]=true;
  clip.id=id;clip.kind="complete-abc";
  clip.start=Math.round(pos*1000)/1000;
  clip.duration=clamp(clip.duration,.125,3600);
  pos+=clip.duration;return clip;
 });
}
function total(clips){var last=clips[clips.length-1];return last?last.start+last.duration:0;}
function locate(clips,t){
 if(!clips.length)return {index:-1,local:0,start:0,duration:0};
 t=clamp(t,0,total(clips));
 var i=clips.length-1;
 for(var j=0;j<clips.length;j++){if(t<clips[j].start+clips[j].duration-.000001){i=j;break;}}
 var clip=clips[i];
 return {index:i,local:clamp(t-clip.start,0,clip.duration),start:clip.start,duration:clip.duration,clip:clip};
}
function at(clips,index,local){var c=clips[index];return c?clamp(c.start+number(local,0),c.start,c.start+c.duration):0;}
exports.reflow=reflow;exports.total=total;exports.locate=locate;exports.at=at;
})();