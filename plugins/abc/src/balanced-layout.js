/*\
title: $:/plugins/huwiki/abc/balanced-layout.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// Work with written measures, never the repeated playback order. Empty repeat
// and volta bar events still count in ABCJS's raw lineBreaks indices.
function measures(voice,pickup){
 var out=[],raw=0,start=0,notes=0,duration=0,multiplier=1,part='',ending='',recordPart='',recordEnding='';
 voice.forEach(function(e){
  if(e.el_type==='part')part=e.title||'';
  if(e.el_type==='note'){
   if(!notes){recordPart=part;recordEnding=ending;}
   notes++;
   if(e.startTriplet)multiplier=Number(e.tripletMultiplier)||1;
   duration+=(Number(e.duration)||0)*multiplier;
   if(e.endTriplet)multiplier=1;
  }
  if(e.el_type!=='bar')return;
  if(notes){out.push({start:start,end:raw,notes:notes,duration:duration,part:recordPart,ending:recordEnding});start=raw+1;notes=0;duration=0;}
  if(e.endEnding)ending='';
  if(e.startEnding)ending=String(e.startEnding);
  raw++;
 });
 // A final measure is legal without a closing bar. Its metrics are not always
 // exposed by ABCJS; the caller falls back to ordinary wrapping in that case.
 if(notes)out.push({start:start,end:raw,notes:notes,duration:duration,part:recordPart,ending:recordEnding,unclosed:true});
 if(pickup&&out.length>1){out[0].pickup=true;out[0].part=out[1].part;}
 return out;
}
function plan(voice,widths,left,settings){
 settings=settings||{};
 var bars=measures(voice,settings.pickup),limit=(720-Math.max(0,Number(left)||0))/1.15;
 if(!bars.length||limit<80||!Array.isArray(widths)||bars.some(function(b){return b.unclosed||b.end>=widths.length;}))return null;
 var sum=[0];
 for(var i=0;i<bars.length;i++){
  var width=0;for(var r=bars[i].start;r<=bars[i].end;r++)width+=Number(widths[r])||0;
  if(!(width>0))return null;
  bars[i].width=width;sum.push(sum[i]+width);
 }
 var mandatory={},protectedBreak={},voltaPair={},runs=[];
 for(i=1;i<bars.length;i++)if(settings.parts!==false&&bars[i].part!==bars[i-1].part)mandatory[i]=true;
 // Keep every ending intact when it fits. A pair of endings is a preference,
 // not a new system: preceding body measures may share that system too.
 for(i=0;i<bars.length;){
  if(!bars[i].ending){i++;continue;}
  var first=i,label=bars[i].ending,section=bars[i].part;
  while(i<bars.length&&bars[i].ending===label&&bars[i].part===section)i++;
  runs.push({start:first,end:i,label:label,part:section});
  if(sum[i]-sum[first]<=limit)for(var p=first+1;p<i;p++)protectedBreak[p]=true;
 }
 for(i=1;i<runs.length;i++){
  var a=runs[i-1],b=runs[i];
  if(a.end===b.start&&a.part===b.part&&/^1(?:$|[, -])/.test(a.label)&&/^2(?:$|[, -])/.test(b.label))voltaPair[b.start]=true;
 }
 var best=Array(bars.length+1).fill(null);best[0]={cost:0,previous:-1};
 for(var end=1;end<=bars.length;end++){
  if(end<bars.length&&protectedBreak[end])continue;
  for(var begin=end-1;begin>=0;begin--){
   if(begin<end-1&&mandatory[begin+1])break;
   if(!best[begin]||begin===1&&bars[0].pickup)continue;
   var width=sum[end]-sum[begin];
   if(width>limit&&end-begin>1)break;
   var fullness=Math.min(1,width/limit),cost=8+3*Math.pow(1-fullness,2);
   // Penalise a short ending alone, rather than prescribing a bar count.
   var onlyEnding=bars[begin].ending&&bars.slice(begin,end).every(function(m){return m.ending===bars[begin].ending;});
   if(onlyEnding&&end-begin<=2)cost+=8;
   if(voltaPair[end])cost+=2;
   if(end<bars.length&&!mandatory[end]&&end-begin===1&&!bars[begin].pickup)cost+=3;
   cost+=best[begin].cost;
   if(!best[end]||cost<best[end].cost)best[end]={cost:cost,previous:begin};
  }
 }
 if(!best[bars.length])return null;
 var breaks=[],rows=[],at=bars.length;
 while(at>0){var from=best[at].previous;rows.unshift({from:from,to:at,width:sum[at]-sum[from]});if(at<bars.length)breaks.unshift(bars[at-1].end);at=from;}
 return {breaks:breaks,rows:rows,measures:bars,limit:limit};
}
exports.measures=measures;exports.plan=plan;
})();
