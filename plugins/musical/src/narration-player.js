/*\
title: $:/plugins/huwiki/musical/narration-player.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Read-only audio-clip playback, shared by the editor and published Site view.
function num(v,f){var n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function round(v){return Math.round(v*1000)/1000;}
function normalizeClips(rows){
 var ids={};return (Array.isArray(rows)?rows:[]).filter(function(c){return c&&typeof c.asset==="string"&&c.asset.trim();}).map(function(c,i){
  var out=Object.assign({},c),id=String(c.id||"voice-"+(i+1));while(ids[id])id+="-copy";ids[id]=true;
  out.id=id;out.start=round(clamp(num(c.start,0),0,86400));out.offset=round(clamp(num(c.offset,0),0,86400));
  out.sourceDuration=Math.max(0,num(c.sourceDuration,0));
  if(out.sourceDuration>0)out.offset=Math.min(out.offset,Math.max(0,out.sourceDuration-.02));
  out.duration=round(clamp(num(c.duration,out.sourceDuration-out.offset||1),.02,86400));
  if(out.sourceDuration>0)out.duration=Math.min(out.duration,out.sourceDuration-out.offset);
  out.volume=clamp(num(c.volume,1),0,1);out.muted=c.muted===true;
  return out;
 });
}
function audioSource(wiki,title){
 var t=wiki&&wiki.getTiddler(title);if(!t)return "";var f=t.fields||t,type=String(f.type||"");
 if(!/^audio\/[a-z0-9.+-]+(?:;|$)/i.test(type))return "";
 if(f._canonical_uri){var uri=String(f._canonical_uri).trim();return /^(?:https?:|data:audio\/)/i.test(uri)||!/^[a-z][a-z0-9+.-]*:/i.test(uri)?uri:"";}
 var raw=String(f.text||"").trim();if(/^data:audio\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(raw))return raw;
 if(raw&&/^[a-zA-Z0-9+/=\s]+$/.test(raw))return "data:"+type+";base64,"+raw.replace(/\s/g,"");
 return "";
}
function total(clips){return normalizeClips(clips).reduce(function(v,c){return Math.max(v,c.start+c.duration);},0);}

// Keep real media resources bounded by simultaneous playback, not by the
// length of the show. Reusing gesture-primed elements also preserves mobile
// autoplay permission when their source changes for the next recording.
var SILENCE="data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
function poolSize(clips){
 var events=[],active=0,peak=0;
 clips.forEach(function(c){events.push({t:c.start,n:1},{t:c.start+c.duration,n:-1});});
 events.sort(function(a,b){return a.t-b.t||a.n-b.n;}).forEach(function(e){active+=e.n;peak=Math.max(peak,active);});
 // One spare can preload the next nearby recording without evicting a voice
 // which is still playing. Muted lanes remain included so they can be unmuted.
 return Math.min(clips.length,peak+1);
}
function Player(o){
 o=o||{};this.wiki=o.wiki;this.doc=o.doc||(typeof document!=="undefined"?document:null);this.onError=o.onError||function(){};
 this.isAudible=typeof o.isAudible==="function"?o.isAudible:function(){return true;};
 this.entries={};this.clips=[];this.pool=[];this.capacity=0;this.time=0;this.rate=1;this.running=false;this.dead=false;this.setClips(o.clips||[]);
}
Player.prototype._report=function(entry,error){
 if(entry.reported)return;entry.reported=true;try{this.onError(error,entry.clip);}catch(_){}
};
Player.prototype._newEntry=function(clip){
 return {clip:clip,audio:null,slot:null,source:null,blocked:false,reported:false,pending:false,wanted:false,token:0};
};
Player.prototype._newSlot=function(){
 var self=this,a=this.doc&&this.doc.createElement("audio");if(!a)return null;
 var slot={audio:a,entry:null,token:0};
 a.preload="none";a.setAttribute("playsinline","");a.setAttribute("aria-hidden","true");
 slot.metadata=function(){if(!self.dead&&self.running&&slot.entry)self._apply(slot.entry);};
 slot.error=function(){var e=slot.entry;if(self.dead||!e||!e.source)return;e.blocked=true;if(e.wanted)self._report(e,Error("Audio unavailable: "+(e.clip.name||e.clip.asset)));};
 a.addEventListener("loadedmetadata",slot.metadata);a.addEventListener("error",slot.error);
 this.pool.push(slot);return slot;
};
Player.prototype._clearSlot=function(slot){
 slot.token++;slot.entry=null;var a=slot.audio;
 try{a.pause();a.removeAttribute("src");a.preload="none";a.load();}catch(_){}
};
Player.prototype._acquire=function(e){
 if(e.audio)return true;
 if(e.source===null)e.source=audioSource(this.wiki,e.clip.asset);
 if(!e.source)return false;
 var slot=this.pool.find(function(s){return !s.entry;})||this._newSlot();if(!slot)return false;
 slot.token++;slot.entry=e;e.slot=slot;e.audio=slot.audio;
 e.audio.preload="metadata";e.audio.src=e.source;return true;
};
Player.prototype._window=function(){
 var self=this,time=this.time,desired=[],upcoming=null;
 this.clips.forEach(function(c){
  if(c.muted||c.volume<=0||!self.isAudible(c))return;
  if(time>=c.start&&time<c.start+c.duration)desired.push(self.entries[c.id]);
  else if(c.start>time&&c.start<=time+2&&(!upcoming||c.start<upcoming.start))upcoming=c;
 });
 if(upcoming)desired.push(this.entries[upcoming.id]);
 this.pool.forEach(function(slot){if(slot.entry&&desired.indexOf(slot.entry)<0)self._release(slot.entry);});
 desired.forEach(function(e){self._acquire(e);});return desired;
};
Player.prototype.setClips=function(clips){
 var self=this,next={},normalized=normalizeClips(clips);
 normalized.forEach(function(c){var old=self.entries[c.id];
  if(old&&old.clip.asset===c.asset){old.clip=c;next[c.id]=old;}else{if(old)self._release(old);next[c.id]=self._newEntry(c);}
 });
 Object.keys(this.entries).forEach(function(id){if(!next[id])self._release(self.entries[id]);});
 this.entries=next;this.clips=normalized;this.capacity=poolSize(normalized);
 if(this.running)this.sync(this.time,this.rate);
 else this.pool.forEach(function(slot){if(slot.entry)self._release(slot.entry);});
 // Removed tracks do not leave spare decoders or references behind.
 for(var i=this.pool.length-1;i>=0&&this.pool.length>this.capacity;i--){
  var slot=this.pool[i];if(slot.entry)continue;this._clearSlot(slot);
  if(slot.audio.removeEventListener){slot.audio.removeEventListener("loadedmetadata",slot.metadata);slot.audio.removeEventListener("error",slot.error);}
  this.pool.splice(i,1);
 }
};
Player.prototype._release=function(e){
 e.token++;e.wanted=false;e.pending=false;if(e.slot)this._clearSlot(e.slot);
 e.slot=null;e.audio=null;e.source=null;
};
Player.prototype.unlock=function(){
 if(this.dead)return;var self=this;
 this._window();
 while(this.pool.length<this.capacity){if(!this._newSlot())break;}
 this.pool.forEach(function(slot){var a=slot.audio,e=slot.entry,token=++slot.token;
  if(e){e.blocked=false;e.reported=false;}else{a.preload="auto";a.src=SILENCE;}
  a.muted=true;
  var done=function(){
   if(self.dead||token!==slot.token)return;
   var current=slot.entry;
   if(!current){self._clearSlot(slot);return;}
   if(!current.wanted)try{a.pause();}catch(_){}
   a.muted=current.clip.muted||!self.isAudible(current.clip);
  };
  try{var p=a.play();
   if(p&&typeof p.then==="function")p.then(done,done);else done();
  }catch(_){done();}
 });
};
Player.prototype._apply=function(e){
 var c=e.clip,a=e.audio,t=this.time,active=this.running&&!c.muted&&this.isAudible(c)&&c.volume>0&&t>=c.start&&t<c.start+c.duration;
 e.wanted=active;
 if(!active){if(e.pending){e.token++;e.pending=false;}if(a&&!a.paused)try{a.pause();}catch(_){};return;}
 if(!a||!e.source){this._report(e,Error("Missing audio: "+c.asset));return;}
 if(e.blocked)return;
 var target=c.offset+Math.max(0,t-c.start);
 if(Number.isFinite(a.duration)&&target>=a.duration-.005){if(!a.paused)a.pause();return;}
 a.preload="auto";a.volume=c.volume;a.muted=false;
 try{a.playbackRate=this.rate;}catch(_){}
 try{if(Math.abs(num(a.currentTime,0)-target)>.16||a.paused)a.currentTime=target;}catch(_){}
 if(!a.paused||e.pending)return;
 var self=this,token=++e.token;e.pending=true;
 try{var play=a.play();
  var done=function(){if(token!==e.token)return;e.pending=false;if(self.dead||!e.wanted)try{a.pause();}catch(_){};};
  var failed=function(err){if(token!==e.token)return;e.pending=false;if(err&&err.name==="AbortError")return;if(!self.dead&&e.wanted){e.blocked=true;self._report(e,err||Error("Audio playback failed"));}};
  if(play&&typeof play.then==="function")play.then(done,failed);else done();
 }catch(err){e.pending=false;e.blocked=true;self._report(e,err);}
};
Player.prototype.sync=function(time,rate){
 if(this.dead)return;this.time=Math.max(0,num(time,0));this.rate=clamp(num(rate,1),.25,4);this.running=true;
 var self=this;this._window().forEach(function(e){self._apply(e);});
};
Player.prototype.pause=function(){this.running=false;this.pool.forEach(function(slot){var e=slot.entry;if(e){e.wanted=false;e.token++;e.pending=false;}try{slot.audio.pause();}catch(_){};});};
Player.prototype.seek=function(time){
 this.pause();this.time=Math.max(0,num(time,0));var self=this;
 // A paused visual seek must not start loading every recording it passes.
 this.pool.forEach(function(slot){if(slot.entry)self._release(slot.entry);});
 Object.keys(this.entries).forEach(function(id){var e=self.entries[id];e.reported=false;e.blocked=false;e.source=null;});
};
Player.prototype.dispose=function(){
 if(this.dead)return;this.dead=true;this.running=false;var self=this;
 this.pool.forEach(function(slot){
  if(slot.entry)self._release(slot.entry);else self._clearSlot(slot);
  if(slot.audio.removeEventListener){slot.audio.removeEventListener("loadedmetadata",slot.metadata);slot.audio.removeEventListener("error",slot.error);}
 });
 this.entries={};this.clips=[];this.pool=[];
};

exports.Player=Player;exports.normalizeClips=normalizeClips;exports.audioSource=audioSource;exports.total=total;
})();
