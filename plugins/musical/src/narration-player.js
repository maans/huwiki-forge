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
  out.fadeIn=clamp(num(c.fadeIn,0),0,out.duration);out.fadeOut=clamp(num(c.fadeOut,0),0,out.duration);
  out.reverb=clamp(num(c.reverb,0),0,1);
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
function gainAt(clip,time){
 var elapsed=time-clip.start,remaining=clip.duration-elapsed;
 if(clip.muted||elapsed<0||remaining<=0)return 0;
 return clamp(num(clip.volume,1),0,1)*Math.max(0,Math.min(1,clip.fadeIn>0?elapsed/clip.fadeIn:1,clip.fadeOut>0?remaining/clip.fadeOut:1));
}
function total(clips){return normalizeClips(clips).reduce(function(v,c){return Math.max(v,c.start+c.duration);},0);}

// Reuse one media element per simultaneous recording. Keep each element
// unlocked for subsequent sources on browsers that require a user gesture.
function Player(o){
 o=o||{};this.wiki=o.wiki;this.doc=o.doc||(typeof document!=="undefined"?document:null);this.onError=o.onError||function(){};
 this.isAudible=typeof o.isAudible==="function"?o.isAudible:function(){return true;};
 this.context=null;this.room=null;this.lanes=[];this.clips=[];this.time=0;this.rate=1;this.running=false;this.dead=false;this.setClips(o.clips||[]);
}
Player.prototype._report=function(entry,error){
 if(entry.reported)return;entry.reported=true;try{this.onError(error,entry.clip);}catch(_){}
};
Player.prototype._newLane=function(){
 var self=this,a=this.doc&&this.doc.createElement("audio"),lane={clips:[],clip:null,audio:a,source:"",blocked:false,reported:false,pending:false,wanted:false,token:0};
 if(!a)return lane;
 a.preload="none";a.setAttribute("playsinline","");a.setAttribute("aria-hidden","true");
 a.addEventListener("loadedmetadata",function(){if(!self.dead&&self.running&&lane.wanted)self._safeApply(lane);});
 a.addEventListener("error",function(){if(!lane.clip)return;lane.blocked=true;if(lane.wanted)self._report(lane,Error("Audio unavailable: "+(lane.clip.name||lane.clip.asset)));});
 return lane;
};
function pauseLane(lane){
 lane.token++;lane.wanted=false;
 if(lane.audio&&(lane.pending||!lane.audio.paused))try{lane.audio.pause();}catch(_){}
 lane.pending=false;
}
Player.prototype._assign=function(lane,clip){
 if(lane.clip&&clip&&lane.clip.id===clip.id&&lane.clip.asset===clip.asset){lane.clip=clip;return;}
 var previousSource=lane.source;
 pauseLane(lane);lane.clip=clip;lane.blocked=false;lane.reported=false;
 lane.source=clip?audioSource(this.wiki,clip.asset):"";
 if(!lane.audio)return;
 if(lane.source)lane.audio.src=lane.source;
 else if(previousSource){
  lane.audio.removeAttribute("src");lane.audio.load();
 }
};
Player.prototype.setClips=function(clips){
 var self=this,ends=[],groups=[];
 this.clips=normalizeClips(clips);
 this.clips.slice().sort(function(a,b){return a.start-b.start;}).forEach(function(clip){
  var i=ends.findIndex(function(end){return end<=clip.start;});
  if(i<0){i=groups.length;groups.push([]);}
  groups[i].push(clip);ends[i]=clip.start+clip.duration;
 });
 while(this.lanes.length>groups.length){var stale=this.lanes.pop();try{this._assign(stale,null);}catch(_){}disconnect(stale.node);disconnect(stale.send);}
 groups.forEach(function(group,i){
  var lane=self.lanes[i]||(self.lanes[i]=self._newLane());lane.clips=group;
  if(lane.clip)self._assign(lane,group.find(function(c){return c.id===lane.clip.id&&c.asset===lane.clip.asset;})||null);
 });
 if(this.running)this.sync(this.time,this.rate);
};
// First clip whose end lies after the requested time. Lanes never overlap internally.
function nextClip(lane,time){
 var clips=lane.clips,lo=0,hi=clips.length;
 while(lo<hi){var mid=(lo+hi)>>1,c=clips[mid];if(c.start+c.duration<=time)lo=mid+1;else hi=mid;}
 return clips[lo];
}
Player.prototype._prepareRoom=function(){
 if(!this.clips.some(function(c){return Number(c.reverb)>0;}))return;
 var win=this.doc&&this.doc.defaultView,C=win&&(win.AudioContext||win.webkitAudioContext);
 if(!C)return;
 try{
  if(!this.context){this.context=new C();this.room=require("$:/plugins/huwiki/abc/accompaniment.js").createRoom(this.context);}
  if(this.context.state==="suspended")Promise.resolve(this.context.resume()).catch(function(){});
 }catch(error){
  // A room is optional. Leave unconnected media elements on their normal
  // dry output if the browser or the shared room module is unavailable.
  if(this.context&&!this.room){closeContext(this.context);this.context=null;}
  this.lanes.forEach(function(lane){this._report(lane,error);},this);
 }
};
function disconnect(node){if(node&&node.disconnect)try{node.disconnect();}catch(_){} }
function closeContext(context){if(context&&context.close)try{Promise.resolve(context.close()).catch(function(){});}catch(_){} }
Player.prototype._level=function(lane,clip){
 var c=this.context;
 if(lane.roomBlocked||!c||!this.room)return;
 try{
  if(!lane.node&&Number(clip.reverb)>0&&lane.audio){
   // A media element can be attached only once. Retain its source before
   // attempting the optional send, even if a later connection fails.
   lane.node=c.createMediaElementSource(lane.audio);lane.node.connect(c.destination);
  }
  if(lane.node&&!lane.send&&Number(clip.reverb)>0){
   lane.send=c.createGain();lane.send.gain.value=0;lane.node.connect(lane.send);lane.send.connect(this.room.input());
  }
  if(lane.send)lane.send.gain.value=clip.reverb;
 }catch(error){disconnect(lane.send);lane.send=null;lane.roomBlocked=true;this._report(lane,error);}
};
Player.prototype.unlock=function(){
 if(this.dead)return;var self=this;this._prepareRoom();
 this.lanes.forEach(function(e){try{
  var clip=nextClip(e,self.time)||e.clips[0],a=e.audio;
  self._assign(e,clip);if(!a||!e.source)return;
  e.blocked=false;e.reported=false;a.muted=true;
  var token=e.token;
  function done(){if(self.dead||token!==e.token)return;if(!e.wanted&&!a.paused)try{a.pause();}catch(_){}a.muted=clip.muted||!self.isAudible(clip);}
  try{var p=a.play();if(p&&typeof p.then==="function")p.then(done,done).catch(function(){});else done();}catch(_){done();}
 }catch(error){self._report(e,error);}
 });
};
Player.prototype._safeApply=function(lane){
 try{this._apply(lane);}catch(error){pauseLane(lane);lane.blocked=true;this._report(lane,error);}
};
Player.prototype._apply=function(e){
 var c=e.clip,a=e.audio,t=this.time,active=this.running&&!c.muted&&this.isAudible(c)&&c.volume>0&&t>=c.start&&t<c.start+c.duration;
 e.wanted=active;
 if(!active){if(e.pending){e.token++;e.pending=false;}if(a&&!a.paused)try{a.pause();}catch(_){};return;}
 if(!a||!e.source){this._report(e,Error("Missing audio: "+c.asset));return;}
 if(e.blocked)return;
 var target=c.offset+Math.max(0,t-c.start);
 if(Number.isFinite(a.duration)&&target>=a.duration-.005){if(!a.paused)a.pause();return;}
 this._level(e,c);a.volume=gainAt(c,t);a.muted=false;
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
 var self=this;
 this.lanes.forEach(function(lane){try{
  var clip=nextClip(lane,self.time);
  if(clip&&clip.start<=self.time){
   self._assign(lane,clip);self._safeApply(lane);
  }else if(lane.wanted||lane.pending||lane.audio&&!lane.audio.paused)pauseLane(lane);
 }catch(error){pauseLane(lane);lane.blocked=true;self._report(lane,error);}
 });
};
Player.prototype.pause=function(){this.running=false;this.lanes.forEach(pauseLane);};
Player.prototype.seek=function(time){
 if(this.running)this.pause();
 this.time=Math.max(0,num(time,0));
 this.lanes.forEach(function(lane){lane.reported=false;lane.blocked=false;});
};
Player.prototype.dispose=function(){if(this.dead)return;this.dead=true;this.running=false;this.setClips([]);if(this.room)try{this.room.dispose();}catch(_){}closeContext(this.context);this.room=null;this.context=null;};

exports.gainAt=gainAt;exports.Player=Player;exports.normalizeClips=normalizeClips;exports.audioSource=audioSource;exports.total=total;
})();
