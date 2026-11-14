/*\
title: $:/plugins/huwiki/musical/sync.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Music is the master. requestAnimationFrame only interpolates the picture
// between beat callbacks; it never schedules or starts the sound.
function Timeline(duration,paint,now){
 this.duration=Math.max(.1,Number(duration)||1);
 this.paint=paint;
 this.now=now||function(){return performance.now();};
 this.position=0;this.rate=1;this.running=false;this.anchor=this.now();
}
Timeline.prototype.value=function(){
 if(!this.running)return this.position;
 return Math.max(0,Math.min(this.duration,this.position+(this.now()-this.anchor)/1000*this.rate));
};
Timeline.prototype.seek=function(t){
 this.position=Math.max(0,Math.min(this.duration,Number(t)||0));
 this.anchor=this.now();this.paint(this.position);
};
Timeline.prototype.play=function(){
 this.position=this.value();
 if(this.position>=this.duration)this.position=0;
 this.anchor=this.now();this.running=true;this.paint(this.position);
};
Timeline.prototype.pause=function(){
 this.position=this.value();this.running=false;this.anchor=this.now();this.paint(this.position);
};
Timeline.prototype.finish=function(){
 this.running=false;this.seek(this.duration);
};
Timeline.prototype.setRate=function(rate){
 var position=this.value();
 this.rate=Math.max(.25,Math.min(2,Number(rate)||1));
 this.position=position;this.anchor=this.now();this.paint(this.position);
};
Timeline.prototype.beatPosition=function(actual){
 if(!Number.isFinite(Number(actual)))return;
 actual=Math.max(0,Math.min(this.duration,Number(actual)));
 var predicted=this.value(),delta=actual-predicted;
 this.position=Math.max(0,Math.min(this.duration,
   Math.abs(delta)>.09?actual:predicted+.3*delta));
 this.anchor=this.now();this.paint(this.position);
};
Timeline.prototype.beat=function(beat,total){
 if(!Number.isFinite(beat)||!Number.isFinite(total)||total<=0)return;
 this.beatPosition(this.duration*beat/total);
};
exports.Timeline=Timeline;
})();