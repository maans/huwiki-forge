/*\
title: $:/plugins/huwiki/abc/slow-ballad.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// A restrained ballad: harmony changes and bar starts, never random pushes.
// Timings come from the unfolded score, including pickups and repeat endings.
var EPS=.00002;
function groups(events){var out=[];(events||[]).slice().sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;}).forEach(function(e){
 var g=out[out.length-1];if(!g||Math.abs(g.start-e.start)>EPS){g={start:e.start,notes:[]};out.push(g);}g.notes.push(e);
});return out;}
function at(items,time){var found=null;for(var i=0;i<items.length&&items[i].start<=time+EPS;i++)found=items[i];return found;}
function silent(h){return !h||/^(?:N\.?\s*C\.?|no\s*chord|tacet|break)$/i.test(String(h.name||'').trim());}
function level(c,time){return c.variation?1+Math.sin(time*7.13+(Number(c.seed)||1))*.05*Math.min(100,c.variation)/100:1;}
function events(seeds,timeline,c,bass){
 var source=groups(seeds),out=[],previous=43,harmony=timeline.chords||[];
 (timeline.bars||[]).forEach(function(bar){
  var points=[bar.start];harmony.forEach(function(h){if(h.start>bar.start+EPS&&h.start<bar.end-EPS)points.push(h.start);});
  points.forEach(function(start,i){var h=at(harmony,start),g=at(source,start);if(silent(h)||!g)return;
   // Do not borrow the previous harmony when a written change has no seed.
   if(g.start<h.start-EPS)return;
   var end=i+1<points.length?points[i+1]:bar.end;
   var duration=end-start-Math.min(.012,(end-start)*.04);if(duration<=EPS)return;
   var selected=bass?[g.notes[0]]:g.notes;
   selected.forEach(function(e){var pitch=e.pitch;
    if(bass){var name=String(h.name),slash=/\/([A-G])([#b]?)/i.exec(name),root=/^([A-G])([#b]?)/i.exec(name),pcs={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
     function tone(m){return pcs[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);}
     if(root&&slash)pitch+=tone(slash)-tone(root);
     var pc=((pitch%12)+12)%12,choices=[];for(var n=33;n<=52;n++)if(n%12===pc)choices.push(n);
     choices.sort(function(a,b){return Math.abs(a-previous)-Math.abs(b-previous)||a-b;});pitch=choices[0];previous=pitch;
    }
    out.push(Object.assign({},e,{start:start,pitch:pitch,duration:duration,volume:Math.max(1,Math.round(e.volume*(bass?.76:.77)*level(c,start)))}));
   });
  });
 });return out;
}
function drums(timeline,c){
 var out=[],volume=Number(c.drumVolume)||0;if(!volume)return out;
 (timeline.bars||[]).forEach(function(bar){
  var m=bar.meter,nominal=m.num/m.den,offset=(bar.index===0||bar.sourceBar===0)&&bar.duration<nominal-EPS?nominal-bar.duration:0;
  for(var beat=1;beat<nominal*4;beat+=2){var start=bar.start+beat/4-offset;if(start<bar.start-EPS||start>=bar.end-EPS)continue;
   var h=at(timeline.chords||[],start);if(h&&/^(?:tacet|break)$/i.test(h.name))continue;
   // Pedal hi-hat is an honest GM approximation; no simulated brush sample.
   out.push({cmd:'note',start:Math.max(bar.start,start),pitch:44,duration:Math.min(.045,bar.end-start),volume:Math.max(1,Math.round(volume*.26*level(c,start))),instrument:128});
  }
 });return out;
}
exports.bass=function(seeds,timeline,c){return events(seeds,timeline,c,true);};
exports.chords=function(seeds,timeline,c){return events(seeds,timeline,c,false);};
exports.drums=drums;
})();
