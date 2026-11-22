/*\
title: $:/plugins/huwiki/musical/cue-score.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
function read(fields){
 try{var value=JSON.parse(fields["animus-cue-score"]||"null");return value&&Array.isArray(value.events)?value:null;}catch(_){return null;}
}
function clock(seconds){seconds=Math.max(0,Number(seconds)||0);return Math.floor(seconds/60)+":"+String(Math.floor(seconds%60)).padStart(2,"0");}
function resolve(score,film,clip){
 if(!score.live||!film||!clip)return score;
 var musical=film.musical||{},recordings=musical.audioClips||[],from=Number(clip.start)||0,to=from+Number(clip.duration||score.duration||0);
 var speech=recordings.filter(function(c){return c.kind==="speech";}),events=score.events.filter(function(e){
  if(e.kind==="effect")return false;
  return e.kind!=="speech"||!speech.some(function(c){return c.sceneTitle===score.sceneTitle&&c.cueId===e.id;});
 }).map(function(e){return Object.assign({},e);});
 function inside(time){return Number.isFinite(time)&&time>=from&&time<to;}
 speech.forEach(function(c){if(inside(c.start))events.push({id:"recording-"+c.id,start:c.start-from,kind:"speech",label:(c.speaker?c.speaker+": ":"")+(c.text||c.name||c.asset)});});
 (musical.sfx||[]).forEach(function(c){if(inside(c.t))events.push({id:"midi-"+c.id,start:c.t-from,kind:"effect",label:(c.icon||"🔊")+" "+(c.name||c.type)});});
 recordings.forEach(function(c){if((c.kind==="sfx"||c.kind==="effects")&&inside(c.start))events.push({id:"audio-"+c.id,start:c.start-from,kind:"effect",label:(c.icon||"🔊")+" "+(c.name||c.asset)});});
 return Object.assign({},score,{events:events.sort(function(a,b){return a.start-b.start;})});
}
function render(score,options){
 var doc=options.doc,page=options.page,events=[],group=doc.createElement("div");group.className="huw-musical-cue-score";group.setAttribute("role","group");group.setAttribute("aria-label",score.title||"Cue score");page.appendChild(group);
 var title=doc.createElement("h4");title.textContent=score.title;group.appendChild(title);
 (score.events||[]).slice().sort(function(a,b){return a.start-b.start;}).forEach(function(cue){
  if(!Number.isFinite(cue.start)||cue.start<0)return;
  var row=doc.createElement("button");row.type="button";row.className="huw-musical-cue-score-row";row.dataset.cueId=cue.id;row.dataset.cueTime=String(cue.start);
  var time=doc.createElement("span");time.className="huw-musical-cue-score-time";time.textContent=clock(cue.start);row.appendChild(time);
  var label=doc.createElement("span");label.textContent=cue.label||cue.text||cue.kind;row.appendChild(label);
  row.setAttribute("aria-label",clock(cue.start)+" · "+label.textContent);
  row.onclick=function(){options.seek([cue.start*1000]);};group.appendChild(row);
  events.push({milliseconds:cue.start*1000,elements:[[row]]});
 });return events;
}
exports.read=read;exports.render=render;exports.resolve=resolve;
})();
