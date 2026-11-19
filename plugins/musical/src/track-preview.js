/*\
title: $:/plugins/huwiki/musical/track-preview.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var CAPTION=/^(?:spoken-\d+|song-line-\d+|sing-label)$/;
function number(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function create(){
 var disabled=Object.create(null),exportsInProgress=0;
 function enabled(id){return exportsInProgress>0||!disabled[id];}
 return {
  enabled:enabled,
  set:function(id,value){if(value)delete disabled[id];else disabled[id]=true;},
  disabled:function(){return exportsInProgress?[]:Object.keys(disabled);},
  song:function(clip){return enabled("music:"+(clip.lane==="B"?"B":"A"))&&enabled("song:"+clip.id);},
  audio:function(clip){return enabled("audio-lane")&&enabled("audio:"+clip.id);},
  effects:function(){return enabled("sfx");},
  exporting:function(){return exportsInProgress>0;},
  beginExport:function(){exportsInProgress++;var restored=false;return function(){if(!restored){restored=true;exportsInProgress=Math.max(0,exportsInProgress-1);}};}
 };
}
// The visibility threshold is the same one used by the performance caption
// overlay. Split at opacity crossings so fades and hard cuts yield real cues.
function visibleRanges(part,duration,engine){
 var keys=(part.keys||[]).slice().sort(function(a,b){return a.t-b.t;}),cuts=[0,duration];
 keys.forEach(function(key,index){
  var start=Math.max(0,Math.min(duration,number(key.t,0)));cuts.push(start);
  var next=keys[index+1];if(!next||key.easing==="step"||part.easing==="step")return;
  var a=number(key.opacity,1),b=number(next.opacity,a),end=Math.max(0,Math.min(duration,number(next.t,start)));
  if((a<.45)===(b<.45)||end<=start||a===b)return;
  var lo=start,hi=end;
  for(var i=0;i<24;i++){var mid=(lo+hi)/2;if((engine.state(part,mid).opacity<.45)===(a<.45))lo=mid;else hi=mid;}
  cuts.push((lo+hi)/2);
 });
 cuts=cuts.sort(function(a,b){return a-b;}).filter(function(value,i,list){return !i||Math.abs(value-list[i-1])>1e-7;});
 var ranges=[];
 for(var i=0;i<cuts.length-1;i++)if(engine.state(part,(cuts[i]+cuts[i+1])/2).opacity>=.45){
  var previous=ranges[ranges.length-1];if(previous&&Math.abs(previous.end-cuts[i])<1e-6)previous.end=cuts[i+1];
  else ranges.push({start:cuts[i],end:cuts[i+1]});
 }
 return ranges;
}
function intersect(segment,start,end){
 if(Math.abs(segment.speed)<1e-10)return segment.local>=start&&segment.local<end?{start:segment.start,end:segment.end}:null;
 var a=segment.start+(start-segment.local)/segment.speed,b=segment.start+(end-segment.local)/segment.speed;
 a=Math.max(segment.start,Math.min(a,b));b=Math.min(segment.end,Math.max(segment.start+(start-segment.local)/segment.speed,segment.start+(end-segment.local)/segment.speed));
 return b-a>1e-7?{start:a,end:b}:null;
}
// Map a scene clip into master time once, including speed, offset and loops.
// This is metadata work when opening the editor, never part of frame painting.
function childSegments(segments,from,length,duration,settings){
 settings=settings||{};var result=[],delay=number(settings.start,0),speed=number(settings.speed,1),offset=number(settings.offset,0);
 segments.forEach(function(parent){
  var range=intersect(parent,from+Math.max(0,delay),from+length);if(!range)return;
  var rate=parent.speed*speed,raw=(parent.local+(range.start-parent.start)*parent.speed-from-delay)*speed+offset,cuts=[range.start,range.end];
  function cut(value){if(Math.abs(rate)<1e-10)return;var at=range.start+(value-raw)/rate;if(at>range.start+1e-7&&at<range.end-1e-7)cuts.push(at);}
  if(settings.loop&&duration>0){
   var finish=raw+(range.end-range.start)*rate,low=Math.floor(Math.min(raw,finish)/duration),high=Math.ceil(Math.max(raw,finish)/duration);
   for(var cycle=low;cycle<=high&&cuts.length<4096;cycle++)cut(cycle*duration);
  }else{cut(0);cut(duration);}
  cuts.sort(function(a,b){return a-b;});
  for(var i=0;i<cuts.length-1;i++){
   var start=cuts[i],end=cuts[i+1],at=raw+(start-range.start)*rate,mid=at+(end-start)*rate/2,local,childRate=rate;
   if(settings.loop&&duration>0){var turn=Math.floor(mid/duration);local=at-turn*duration;}
   else if(mid<0){local=0;childRate=0;}else if(mid>=duration){local=Math.max(0,duration-1e-9);childRate=0;}else local=at;
   result.push({start:start,end:end,local:local,speed:childRate});
  }
 });
 return result;
}
function captions(view,engine){
 var cues=[];
 function walk(current,segments,depth,path){
  if(!current||!segments.length||depth>16)return;
  var scene=current.scene||{},duration=Math.max(.1,number(scene.duration,4));
  (scene.parts||[]).forEach(function(part){if(!CAPTION.test(part.id)||!String(part.text||"").trim())return;
   visibleRanges(part,duration,engine).forEach(function(range){segments.forEach(function(segment){var at=intersect(segment,range.start,range.end);if(!at)return;
    cues.push({id:path+":"+part.id+":"+cues.length,partId:part.id,sceneTitle:scene._title||"",part:part,scene:scene,start:at.start,end:at.end,text:String(part.text),label:part.name||part.id,role:part.id==="sing-label"?"cue":"line"});
   });});
  });
  var from=0;
  (current.clips||[]).forEach(function(clip,index){var settings=clip.settings||{},length=Math.max(.1,number(settings.duration,4));
   if(clip.view)walk(clip.view,childSegments(segments,from,length,number(clip.duration,clip.view.scene.duration),settings),depth+1,path+"/"+index);
   from+=length;
  });
  Object.keys(current.nodes||{}).forEach(function(id){var node=current.nodes[id];if(node.nested)walk(node.nested,childSegments(segments,0,duration,number(node.nested.duration,node.nested.scene.duration),node.part),depth+1,path+"/"+id);});
 }
 var duration=Math.max(.1,number(view&&view.scene&&view.scene.duration,4));
 walk(view,[{start:0,end:duration,local:0,speed:1}],0,"caption");
 return cues.sort(function(a,b){return a.start-b.start||a.end-b.end;});
}
exports.create=create;exports.captions=captions;exports.visibleRanges=visibleRanges;
})();
