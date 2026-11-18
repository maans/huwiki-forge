/*\
title: $:/plugins/huwiki/musical/sfx.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// A genuine independent FX cue track. All sounds are locally generated with
// Web Audio; no remote samples or extra synthesizer instances are necessary.
var TYPES={curtain:"Tæppe / fabric",wind:"Vind / wind",steps:"Skridt / footsteps",
 coins:"Mønter / coins",magic:"Magi / magic",dog:"Hund / bark",thunder:"Torden / thunder",
 bell:"Klokke / bell",door:"Dør / door",gavel:"Dommerhammer / gavel",crowd:"Publikum / audience",
 sparkle:"Glitter / sparkle",drum:"Trommeslag / drum",applause:"Applaus / applause"};
function num(v,d){v=Number(v);return Number.isFinite(v)?v:d;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function Fx(cues,options){this.cues=Array.isArray(cues)?cues:[];this.ctx=options&&options.context||null;this.last=null;this.active=[];this.noise=null;this.bus=null;this.applauseBuffer=null;}
Fx.prototype.ensure=function(){
 if(this.ctx)return this.ctx;
 var C=typeof window!=="undefined"&&(window.AudioContext||window.webkitAudioContext);
 if(!C)return null;
 try{
  this.ctx=new C();
  // Raise theatrical effects relative to the orchestra, with a soft limiter
  // so applause and thunder do not clip on iPad speakers.
  var comp=this.ctx.createDynamicsCompressor();
  comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=5;
  comp.attack.value=.008;comp.release.value=.22;
  comp.connect(this.ctx.destination);this.bus=comp;
 }catch(_){return null;}
 return this.ctx;
};
Fx.prototype.unlock=function(){var ctx=this.ensure();if(ctx&&ctx.state==="suspended")try{ctx.resume();}catch(_){};};
Fx.prototype._noise=function(){var c=this.ctx;if(!this.noise){var b=c.createBuffer(1,c.sampleRate*2,c.sampleRate),a=b.getChannelData(0),seed=12347;
 for(var i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;a[i]=((seed/4294967296)*2-1)*.85;}this.noise=b;}return this.noise;};
Fx.prototype._tone=function(freq,start,len,level,type,endFreq){
 var c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type||"sine";
 o.frequency.setValueAtTime(Math.max(20,freq),start);
 if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),start+len);
 g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+Math.min(.025,len*.2));
 g.gain.exponentialRampToValueAtTime(.0001,start+len);
 o.connect(g);g.connect(this.bus||c.destination);o.start(start);o.stop(start+len+.02);this.active.push(g);
};
Fx.prototype._hush=function(start,len,level,freq,filterType){
 var c=this.ctx,src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
 src.buffer=this._noise();src.loop=true;f.type=filterType||"lowpass";f.frequency.value=freq||750;
 g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+Math.min(.12,len*.27));
 g.gain.exponentialRampToValueAtTime(.0001,start+len);
 src.connect(f);f.connect(g);g.connect(this.bus||c.destination);src.start(start);src.stop(start+len+.03);this.active.push(g);
};
// One reusable, layered applause texture: a single AudioBufferSource for
// each crowd wave, rather than dozens of individual WebAudio voices on iPad.
Fx.prototype._applause=function(start,len,level){
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
 var src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
 src.buffer=buffer;src.loop=true;f.type="bandpass";f.frequency.value=1650;f.Q.value=.48;
 g.gain.setValueAtTime(.0001,start);
 g.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+Math.min(.15,len*.14));
 g.gain.setValueAtTime(Math.max(.0002,level),start+Math.max(.15,len-.48));
 g.gain.exponentialRampToValueAtTime(.0001,start+len);
 src.connect(f);f.connect(g);g.connect(this.bus||c.destination);
 src.start(start);src.stop(start+len+.04);this.active.push(g);
};
Fx.prototype.fire=function(cue,at){
 if(!this.ensure())return;var c=this.ctx,now=Number.isFinite(Number(at))?Math.max(0,Number(at)):c.currentTime+.015;
 var type=String(cue.type||"magic"),vol=clamp(num(cue.volume,1),0,1),len=clamp(num(cue.duration,1),.08,8),gain=.36*vol;
 if(gain<.002)return;
 try{
  switch(type){
   case "curtain":this._hush(now,len,gain*.7,680);break;
   case "wind":this._hush(now,len,gain,350);break;
   case "thunder":this._hush(now,len,gain*1.2,180);this._tone(85,now,Math.min(len,1.8),gain*.4,"sawtooth",42);break;
   case "crowd":this._hush(now,len,gain*.9,1800,"bandpass");for(var k=0;k<7;k++)this._hush(now+k*.15,.09,gain*.36,950+120*k,"bandpass");break;
   case "applause":
    // A reusable crowd sample generated locally from claps, not a music synth.
    this._applause(now,len,gain*1.75);
    break;
   case "steps":for(var j=0;j<4;j++)this._hush(now+j*.24,.09,gain*.85,260);break;
   case "coins":for(var i=0;i<5;i++)this._tone(990+i*165,now+i*.11,.32,gain*.5,"sine");break;
   case "magic":for(var n=0;n<5;n++)this._tone(523*Math.pow(2,n*2/12),now+n*.15,.72,gain*.55,"sine");break;
   case "sparkle":for(var p=0;p<8;p++)this._tone(800+p*240,now+p*.08,.21,gain*.32,"sine");break;
   case "dog":for(var d=0;d<3;d++)this._tone(235,now+d*.38,.22,gain*.8,"sawtooth",105);break;
   case "bell":this._tone(620,now,Math.min(len,2),gain*.75);this._tone(930,now,Math.min(len,1.5),gain*.22);break;
   case "door":this._tone(160,now,Math.min(len,1.4),gain*.45,"sawtooth",330);break;
   case "gavel":this._tone(145,now,.17,gain,"triangle",65);this._hush(now,.11,gain*.35,600);break;
   case "drum":this._tone(110,now,.36,gain,"sine",50);this._hush(now,.12,gain*.3,480);break;
   default:this._tone(550,now,.25,gain,"sine");
  }
 }catch(_ignored){}
};
Fx.prototype.sync=function(t){
 t=Math.max(0,num(t,0));
 if(this.last===null){this.last=t-.045;}
 if(t<this.last-.04||t-this.last>1.2){this.last=t-.025;}
 var prev=this.last;
 this.cues.forEach(function(cue){var when=num(cue.t,-1);if(when>=prev-1e-5&&when<=t+1e-5)this.fire(cue);},this);
 this.last=t;
};
Fx.prototype.quiet=function(){var c=this.ctx;if(!c)return;var now=c.currentTime;this.active.forEach(function(g){try{g.gain.cancelScheduledValues(now);g.gain.setTargetAtTime(.0001,now,.012);}catch(_){}});this.active=[];};
Fx.prototype.seek=function(t){this.quiet();this.last=Math.max(0,num(t,0));};
Fx.prototype.dispose=function(){this.quiet();if(this.ctx)try{this.ctx.close();}catch(_){}this.ctx=null;};
exports.Fx=Fx;exports.TYPES=TYPES;
})();
