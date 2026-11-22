/*\
title: $:/plugins/huwiki/musical/sfx.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// A genuine independent FX cue track. All sounds are locally generated with
// Web Audio; no remote samples or extra synthesizer instances are necessary.
var PRESETS={
 curtain:["🎭","Tæppe","Curtain"],wind:["🌬️","Vind","Wind"],steps:["👣","Skridt","Footsteps"],
 coins:["🪙","Mønter","Coins"],magic:["🪄","Magi","Magic"],dog:["🐕","Hund","Dog"],
 thunder:["⛈️","Torden","Thunder"],bell:["🔔","Klokke","Bell"],door:["🚪","Dør","Door"],
 gavel:["🔨","Hammerslag","Hammer"],crowd:["👥","Publikum","Crowd"],sparkle:["✨","Glitter","Sparkle"],
 drum:["🥁","Trommeslag","Drum"],applause:["👏","Applaus","Applause"]
};
var TYPES={};Object.keys(PRESETS).forEach(function(key){TYPES[key]=PRESETS[key][2];});
function num(v,d){v=Number(v);return Number.isFinite(v)?v:d;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function Fx(cues,options){
 this.cues=Array.isArray(cues)?cues:[];this.ctx=options&&options.context;
 this.destination=options&&options.destination;this.owned=false;this.last=null;
 this.active=new Set();this.bus=null;this.room=null;
 this.strict=!!(options&&options.strict);this.onError=options&&options.onError;this.failures=Object.create(null);
}
Fx.prototype.report=function(error,cue){
 if(this.strict)throw error;
 var key=String(cue&&(cue.id||cue.type)||"audio")+":"+String(error&&error.message||error);
 if(this.failures[key])return;this.failures[key]=true;
 if(this.onError)try{this.onError(error,cue);}catch(_){}
};
Fx.prototype.ensure=function(){
 if(!this.ctx){
  var C=typeof window!=="undefined"&&(window.AudioContext||window.webkitAudioContext);
  if(!C)return null;
  try{this.ctx=new C();this.owned=true;}catch(error){this.report(error);return null;}
 }
 if(!this.bus&&!this.compressorFailed&&this.ctx.createDynamicsCompressor)try{
  var comp=this.ctx.createDynamicsCompressor();
  comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=5;comp.attack.value=.008;comp.release.value=.22;
  comp.connect(this.destination||this.ctx.destination);this.bus=comp;
 }catch(error){if(comp)try{comp.disconnect();}catch(_){}this.compressorFailed=true;this.report(error);}
 return this.ctx;
};
Fx.prototype.unlock=function(){var self=this;try{var c=this.ensure();if(c&&c.state==="suspended")Promise.resolve(c.resume()).catch(function(error){self.report(error);});}catch(error){this.report(error);}};
Fx.prototype._noise=function(){var c=this.ctx;if(!this.noise){var b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),a=b.getChannelData(0),seed=12347;
 for(var i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;a[i]=((seed/4294967296)*2-1)*.85;}this.noise=b;}return this.noise;};

Fx.prototype._claps=function(){
 var c=this.ctx,rate=c.sampleRate,buffer=this.applauseBuffer;
 if(!buffer){
  var sec=5.6,n=Math.ceil(sec*rate),arr;
  buffer=c.createBuffer(1,n,rate);arr=buffer.getChannelData(0);
  var seed=473891;
  function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
  // Each clap contains a sharp transient and a warmer, short hand resonance.
  for(var t=.01;t<sec-.12;t+=.041){
   var hit=t+(rand()-.5)*.034,intensity=.14+.26*rand();
   if(rand()<.13)continue;
   var off=Math.floor(Math.max(0,hit)*rate),samples=Math.ceil(.11*rate);
   for(var i=0;i<samples&&off+i<n;i++){
    var d=i/rate,env=Math.exp(-75*d)+.25*Math.exp(-25*d);
    arr[off+i]+=(rand()*2-1)*intensity*env;
   }
  }
  for(var j=0;j<n;j++)arr[j]=Math.max(-1,Math.min(1,arr[j]+(rand()*2-1)*.005));
  this.applauseBuffer=buffer;
 }
 return buffer;
};
// Each event is placed within the clip. Starting playback inside an effect
// resumes its envelope and texture at the elapsed time.
Fx.prototype.fire=function(cue,at,offset){
 var nodes=[],self=this;
 try{this._fire(cue,at,offset,nodes);}catch(error){
  // Dispose only this cue's partial graph. Other effects and recordings keep
  // playing, and a later cue can still start after an isolated failure.
  nodes.forEach(function(node){self.active.delete(node);try{if(node.stop)node.stop();}catch(_){}try{node.disconnect();}catch(_){} });
  this.report(error,cue);
 }
};
Fx.prototype._fire=function(cue,at,offset,nodes){
 var volume=clamp(num(cue.volume,1),0,1),duration=Math.max(.08,num(cue.duration,1));
 var skip=Math.max(0,num(offset,0));
 if(cue.muted||!volume||skip>=duration||!this.ensure())return;
 var self=this,c=this.ctx,now=at==null?c.currentTime+.008:Math.max(0,at);
 var destination=this.bus||this.destination||c.destination,send=null,count=0;
 var amount=clamp(num(cue.reverb,0),0,1);
 if(amount&&c.createConvolver){
  try{
   if(!this.room)this.room=require("$:/plugins/huwiki/abc/accompaniment.js").createRoom(c,destination);
   send=c.createGain();nodes.push(send);send.gain.value=amount;send.connect(this.room.input());
  }catch(error){if(send)try{send.disconnect();}catch(_){}send=null;this.report(error,cue);}
 }
 function note(kind,position,length,level,freq,endFreq,shape){
  var start=position*duration,len=length*duration,elapsed=Math.max(0,skip-start);
  if(elapsed>=len)return;
  var t=now+Math.max(0,start-skip),remaining=len-elapsed,src,filter;
  if(kind==="tone"){
   src=c.createOscillator();nodes.push(src);src.type=shape||"sine";
   src.frequency.setValueAtTime(freq*Math.pow((endFreq||freq)/freq,elapsed/len),t);
   if(endFreq)src.frequency.exponentialRampToValueAtTime(endFreq,t+remaining);
  }else{
   src=c.createBufferSource();nodes.push(src);src.buffer=kind==="claps"?self._claps():self._noise();src.loop=true;
   filter=c.createBiquadFilter();nodes.push(filter);filter.type=shape||"lowpass";filter.frequency.value=freq;
   if(kind==="claps")filter.Q.value=.48;
   src.connect(filter);
  }
  var gain=c.createGain(),peak=Math.max(.0002,.36*level*volume),floor=.0001;nodes.push(gain);
  var attack=Math.min(kind==="tone"?.025:.10,len*.20);
  var release=kind==="claps"?Math.max(attack,len-.45):attack;
  function envelope(x){
   if(x<attack)return floor*Math.pow(peak/floor,x/attack);
   return peak*Math.pow(floor/peak,Math.max(0,x-release)/Math.max(.001,len-release));
  }
  gain.gain.setValueAtTime(envelope(elapsed),t);
  if(elapsed<attack)gain.gain.exponentialRampToValueAtTime(peak,t+attack-elapsed);
  if(release>Math.max(elapsed,attack))gain.gain.setValueAtTime(peak,t+release-elapsed);
  gain.gain.exponentialRampToValueAtTime(floor,t+remaining);
  (filter||src).connect(gain);gain.connect(destination);if(send)gain.connect(send);
  count++;self.active.add(src);
  src.onended=function(){self.active.delete(src);[gain,src,filter].forEach(function(node){if(node)try{node.disconnect();}catch(_){} });if(--count===0&&send)try{send.disconnect();}catch(_){} };
  if(filter)src.start(t,elapsed%src.buffer.duration);else src.start(t);
  src.stop(t+remaining);
 }
 switch(cue.type){
 case "curtain": note("noise",0,1,.7,680);break;
 case "wind": note("noise",0,1,1,350);break;
 case "thunder": note("noise",0,1,1.2,180);note("tone",0,.78,.4,85,42,"sawtooth");break;
 case "crowd": note("noise",0,1,.9,1800,0,"bandpass");for(var k=0;k<7;k++)note("noise",k*.14,.08,.36,950+120*k,0,"bandpass");break;
 case "applause": note("claps",0,1,1.75,1650,0,"bandpass");break;
 case "steps": for(var j=0;j<4;j++)note("noise",j*.25,.23,.85,260);break;
 case "coins": for(var i=0;i<5;i++)note("tone",i*.15,.4,.5,990+i*165);break;
 case "sparkle": for(var p=0;p<8;p++)note("tone",p*.11,.23,.32,800+p*240);break;
 case "dog": for(var d=0;d<3;d++)note("tone",d*.39,.22,.8,235,105,"sawtooth");break;
 case "bell": note("tone",0,1,.75,620);note("tone",0,.75,.22,930);break;
 case "door": note("tone",0,1,.45,160,330,"sawtooth");break;
 case "gavel": note("tone",0,1,1,145,65,"triangle");note("noise",0,.45,.35,600);break;
 case "drum": note("tone",0,1,1,110,50);note("noise",0,.33,.3,480);break;
 default: for(var n=0;n<5;n++)note("tone",n*.13,.48,.55,523*Math.pow(2,n*2/12));
 }
 if(!count&&send)send.disconnect();
};
Fx.prototype.sync=function(t){
 t=Math.max(0,num(t,0));
 var resume=this.last===null||t<this.last||t-this.last>1.2;
 if(resume&&this.last!==null)this.quiet();
 var previous=this.last;
 this.cues.forEach(function(cue){
  var start=num(cue.t,-1),elapsed=t-start;
  if(start>=0&&elapsed>=0&&(resume||start>previous)&&elapsed<Math.max(.08,num(cue.duration,1)))this.fire(cue,null,elapsed);
 },this);
 this.last=t;
};
Fx.prototype.quiet=function(){
 this.active.forEach(function(src){try{src.stop();}catch(_){}});
 this.active.clear();if(this.room){try{this.room.dispose();}catch(error){this.report(error);}this.room=null;}
 this.last=null;
};
Fx.prototype.seek=function(){this.quiet();};
Fx.prototype.dispose=function(){this.quiet();if(this.bus&&this.bus.disconnect)try{this.bus.disconnect();}catch(_){}if(this.owned&&this.ctx)try{Promise.resolve(this.ctx.close()).catch(function(){});}catch(_){}this.ctx=null;this.bus=null;};
exports.Fx=Fx;exports.TYPES=TYPES;exports.PRESETS=PRESETS;
})();
