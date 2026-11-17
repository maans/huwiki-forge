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

// HTML audio keeps voices independent of the ABC sound engine. Every source
// is primed from the user's Play gesture, then follows the common time/rate.
function Player(o){
 o=o||{};this.wiki=o.wiki;this.doc=o.doc||(typeof document!=="undefined"?document:null);this.onError=o.onError||function(){};
 this.entries={};this.clips=[];this.time=0;this.rate=1;this.running=false;this.dead=false;this.setClips(o.clips||[]);
}
Player.prototype._report=function(entry,error){
 if(entry.reported)return;entry.reported=true;try{this.onError(error,entry.clip);}catch(_){}
};
Player.prototype._newEntry=function(clip){
 var self=this,a=this.doc&&this.doc.createElement("audio"),entry={clip:clip,audio:a,source:audioSource(this.wiki,clip.asset),blocked:false,reported:false,pending:false,wanted:false,token:0};
 if(!a)return entry;
 a.preload="metadata";a.setAttribute("playsinline","");a.setAttribute("aria-hidden","true");
 if(entry.source)a.src=entry.source;
 a.addEventListener("loadedmetadata",function(){if(!self.dead&&self.running)self._apply(entry);});
 a.addEventListener("error",function(){entry.blocked=true;if(entry.wanted)self._report(entry,Error("Audio unavailable: "+(clip.name||clip.asset)));});
 return entry;
};
Player.prototype.setClips=function(clips){
 var self=this,next={},normalized=normalizeClips(clips);
 normalized.forEach(function(c){var old=self.entries[c.id];
  if(old&&old.clip.asset===c.asset){old.clip=c;next[c.id]=old;}else{if(old)self._release(old);next[c.id]=self._newEntry(c);}
 });
 Object.keys(this.entries).forEach(function(id){if(!next[id])self._release(self.entries[id]);});
 this.entries=next;this.clips=normalized;if(this.running)this.sync(this.time,this.rate);
};
Player.prototype._release=function(e){e.token++;e.wanted=false;if(e.audio){try{e.audio.pause();e.audio.removeAttribute("src");e.audio.load();}catch(_){} }};
Player.prototype.unlock=function(){
 if(this.dead)return;var self=this;
 Object.keys(this.entries).forEach(function(id){var e=self.entries[id],a=e.audio;if(!a||!e.source)return;
  e.blocked=false;e.reported=false;a.muted=true;
  try{var p=a.play();
   var done=function(){if(self.dead)return;if(!e.wanted){try{a.pause();}catch(_){}}a.muted=e.clip.muted;};
   if(p&&typeof p.then==="function")p.then(done,function(){a.muted=e.clip.muted;});else done();
  }catch(_){a.muted=e.clip.muted;}
 });
};
Player.prototype._apply=function(e){
 var c=e.clip,a=e.audio,t=this.time,active=this.running&&!c.muted&&c.volume>0&&t>=c.start&&t<c.start+c.duration;
 e.wanted=active;
 if(!active){if(e.pending){e.token++;e.pending=false;}if(a&&!a.paused)try{a.pause();}catch(_){};return;}
 if(!a||!e.source){this._report(e,Error("Missing audio: "+c.asset));return;}
 if(e.blocked)return;
 var target=c.offset+Math.max(0,t-c.start);
 if(Number.isFinite(a.duration)&&target>=a.duration-.005){if(!a.paused)a.pause();return;}
 a.volume=c.volume;a.muted=false;
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
 var self=this;Object.keys(this.entries).forEach(function(id){self._apply(self.entries[id]);});
};
Player.prototype.pause=function(){this.running=false;var self=this;Object.keys(this.entries).forEach(function(id){var e=self.entries[id];e.wanted=false;e.token++;e.pending=false;if(e.audio)try{e.audio.pause();}catch(_){};});};
Player.prototype.seek=function(time){this.pause();this.time=Math.max(0,num(time,0));var self=this;Object.keys(this.entries).forEach(function(id){var e=self.entries[id];e.reported=false;e.blocked=false;});};
Player.prototype.dispose=function(){if(this.dead)return;this.dead=true;this.running=false;var self=this;Object.keys(this.entries).forEach(function(id){self._release(self.entries[id]);});this.entries={};};

exports.Player=Player;exports.normalizeClips=normalizeClips;exports.audioSource=audioSource;exports.total=total;
})();
