/*\
title: $:/plugins/huwiki/musical/motion.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Engine=require("$:/plugins/huwiki/cutout/engine.js");
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
var PROPERTIES=["x","y","r","sx","sy","opacity"];
function finite(n,f){n=Number(n);return Number.isFinite(n)?n:f;}
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function near(a,b){return Math.abs(a-b)<.00001;}
function normalize(keys){return (Array.isArray(keys)?keys:[]).filter(function(k){return k&&Number.isFinite(Number(k.t));}).slice().sort(function(a,b){return a.t-b.t;});}
function sample(keys,t){
 keys=normalize(keys);if(!keys.length)return null;
 var a=keys[0],b=a;
 if(t>=finite(keys[keys.length-1].t,0)){a=b=keys[keys.length-1];}
 else if(t>finite(a.t,0))for(var i=0;i<keys.length-1;i++)if(t>=keys[i].t&&t<=keys[i+1].t){a=keys[i];b=keys[i+1];break;}
 var span=finite(b.t,0)-finite(a.t,0),q=span>0?clamp((t-finite(a.t,0))/span,0,1):0;
 if(a.easing==="step")q=q>=1?1:0;
 else if(a.easing!=="linear")q=q*q*(3-2*q);
 var result={};
 PROPERTIES.forEach(function(p){var fallback=(p==="sx"||p==="sy"||p==="opacity")?1:0;var v=finite(a[p],fallback);result[p]=v+(finite(b[p],v)-v)*q;});
 return result;
}
// ABC Q: is converted to *quarter-note* beats per minute, for meter-independent motion.
function tempoFromAbc(text){
 var line=String(text||"").match(/^Q:\s*([^\r\n]+)/m);if(!line)return 120;
 var value=line[1],match=value.match(/(\d+)\s*\/\s*(\d+)\s*=\s*(\d+(?:\.\d+)?)/);
 if(match){var denominator=Number(match[2]);if(!denominator)return 120;return clamp(Number(match[3])*4*Number(match[1])/denominator,20,480);}
 var simple=value.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);return simple?clamp(Number(simple[1]),20,480):120;
}
function beatClock(songs,sourceFor){
 var clips=Array.isArray(songs)?songs:[];
 var events=[{t:0,bpm:clips.length?tempoFromAbc(sourceFor(clips[0].score)):120}];
 for(var i=1;i<clips.length;i++){
  var c=clips[i],prev=clips[i-1];
  var overlap=Math.max(0,Math.min(finite(prev.start,0)+finite(prev.duration,0),finite(c.start,0)+finite(c.fadeIn,0))-finite(c.start,0));
  var boundary=finite(c.start,0)+overlap/2;
  events.push({t:Math.max(0,boundary),bpm:tempoFromAbc(sourceFor(c.score))});
 }
 events.sort(function(a,b){return a.t-b.t;});
 function at(t){t=Math.max(0,finite(t,0));var beats=0,last=0,rate=events[0].bpm;
  for(var i=1;i<events.length;i++){var e=events[i];if(e.t>=t)break;
   beats+=(e.t-last)*rate/60;last=e.t;rate=e.bpm;
  }return beats+(t-last)*rate/60;
 }
 return {at:at,events:events};
}
function phase(clip,time,clock){
 var start=finite(clip.start,0),end=start+Math.max(0,finite(clip.duration,0));
 if(time<start||time>end)return null;
 var beats=Math.max(0,clock.at(time)-clock.at(start))*finite(clip.rate,1);
 var span=Math.max(.125,finite(clip.beatsPerLoop,8));
 return clip.loop===false?clamp(beats,0,span):((beats%span)+span)%span;
}
function animatedState(part,base,keys,beat){
 var pose=sample(keys,beat),first=sample(keys,0);
 if(!pose||!first)return base;
 var out={};PROPERTIES.forEach(function(k){
  if(k==="sx"||k==="sy"||k==="opacity")out[k]=base[k]*pose[k]/(Math.abs(first[k])>.00001?first[k]:1);
  else out[k]=base[k]+pose[k]-first[k];
 });return out;
}
// Reuse short beat-based animation loops inside a nested theatre
// (master -> acts -> scenes -> puppet parts). A puppet needs only one
// four-beat pattern, not hundreds of pre-generated keyframes.
function paint(view,film,time,clock){
 var motion=film&&film.musical&&film.musical.animationClips;
 if(!Array.isArray(motion)||!motion.length)return;
 function visit(nested,local){
  motion.forEach(function(clip){
   var beat=phase(clip,time,clock);if(beat===null)return;
   var motions=clip.motion||{};
   Object.keys(motions).forEach(function(id){
    var node=nested.nodes&&nested.nodes[id],part=node&&node.part;
    if(!node||!part)return;
    var base=Engine.state(part,local),pose=animatedState(part,base,motions[id],beat);
    if(id===clip.target&&Array.isArray(clip.accents)&&clip.accents.length){
     var accent=sample(clip.accents,time);if(accent){pose.x+=accent.x;pose.y+=accent.y;pose.r+=accent.r;}
    }
    var pv=part.pivot||{x:0,y:0};
    node.el.setAttribute("transform","translate("+pose.x+" "+pose.y+") rotate("+pose.r+") scale("+pose.sx+" "+pose.sy+") translate("+(-finite(pv.x,0))+" "+(-finite(pv.y,0))+")");
    node.el.setAttribute("opacity",String(pose.opacity));
   });
  });
  var children=nested.clips||[];
  if(children.length){
   var sequence=nested.scene.scenes||[],active=Engine.clipAt(sequence,local).index,from=0;
   children.forEach(function(child,index){
    var settings=child.settings||{},d=Math.max(.1,finite(settings.duration,4));
    if(index===active&&child.view&&child.el&&child.el.getAttribute("display")!=="none"){
     var ownTime=Engine.localTime(clamp(local-from,0,d),child.duration,settings);
     visit(child.view,ownTime);
    }
    from+=d;
   });
  }
 }
 visit(view,time);
}

exports.sample=sample;exports.tempoFromAbc=tempoFromAbc;exports.beatClock=beatClock;exports.phase=phase;exports.animatedState=animatedState;exports.paint=paint;
})();
