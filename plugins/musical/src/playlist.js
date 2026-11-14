/*\
title: $:/plugins/huwiki/musical/playlist.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// One editable timeline row per complete ABC score, with absolute placement.
// Instrument voices remain inside each score and are mixed by ABC's synth.
function num(x,f){x=Number(x);return Number.isFinite(x)?x:f;}
function clamp(x,a,b){return Math.max(a,Math.min(b,num(x,a)));}
function round(x){return Math.round(x*1000)/1000;}
function reflow(songs,fallback){
 var rows=Array.isArray(songs)&&songs.length?songs:[{id:"song-1",score:fallback,start:0,duration:16,kind:"complete-abc"}];
 var prev=0,used={};return rows.slice(0,32).filter(function(x){return x&&typeof x.score==="string"&&x.score.trim();}).map(function(row,i){
  var a=Object.assign({},row),id=String(a.id||"song-"+(i+1));while(used[id])id+="-copy";used[id]=true;
  a.id=id;a.kind="complete-abc";a.duration=round(clamp(a.duration,.125,7200));
  a.start=round(clamp(a.start===undefined?prev:a.start,0,21600));
  a.fadeIn=round(clamp(a.fadeIn===undefined?0:a.fadeIn,0,a.duration));
  a.fadeOut=round(clamp(a.fadeOut===undefined?0:a.fadeOut,0,a.duration));
  // An overlap is not forced: tracks may be simultaneous, separated or muted.
  a.volume=round(clamp(a.volume===undefined?1:a.volume,0,1));
  a.muted=a.muted===true;prev=a.start+a.duration;return a;
 });
}
function total(clips){return clips.reduce(function(n,c){return Math.max(n,c.start+c.duration);},0);}
function isActive(c,t){return t>=c.start-1e-6&&t<c.start+c.duration-1e-6;}
function gainAt(c,t){
 if(!isActive(c,t)||c.muted)return 0;
 var local=clamp(t-c.start,0,c.duration);
 var enter=c.fadeIn>0?Math.sin(Math.PI*.5*clamp(local/c.fadeIn,0,1)):1;
 var leave=c.fadeOut>0?Math.sin(Math.PI*.5*clamp((c.duration-local)/c.fadeOut,0,1)):1;
 return round(clamp(c.volume,0,1)*enter*leave);
}
function activeAt(clips,t){
 return clips.map(function(c,i){return {index:i,clip:c,local:clamp(t-c.start,0,c.duration),gain:gainAt(c,t)};})
  .filter(function(x){return isActive(x.clip,t);});
}
function locate(clips,t){
 if(!clips.length)return {index:-1,local:0,start:0,duration:0,clip:null};
 var active=activeAt(clips,t);
 if(active.length){active.sort(function(a,b){return b.gain-a.gain||b.clip.start-a.clip.start;});var v=active[0];
  return {index:v.index,local:v.local,start:v.clip.start,duration:v.clip.duration,clip:v.clip};}
 var best=0,delta=Infinity;
 clips.forEach(function(c,i){var d=t<c.start?c.start-t:t>=c.start+c.duration?t-c.start-c.duration:0;if(d<delta){delta=d;best=i;}});
 var c=clips[best];return {index:best,local:clamp(t-c.start,0,c.duration),start:c.start,duration:c.duration,clip:c};
}
function at(clips,index,local){var c=clips[index];return c?clamp(c.start+num(local,0),c.start,c.start+c.duration):0;}
function overlap(a,b){return Math.max(0,Math.min(a.start+a.duration,b.start+b.duration)-Math.max(a.start,b.start));}
exports.reflow=reflow;exports.total=total;exports.isActive=isActive;exports.activeAt=activeAt;exports.gainAt=gainAt;exports.locate=locate;exports.at=at;exports.overlap=overlap;
})();