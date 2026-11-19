/*\
title: $:/plugins/huwiki/animus-video-export/wav.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Plain, interleaved PCM16 WAV for video editors. Blocks are kept as encoded
// bytes rather than retaining the whole production as floating-point audio.
function Writer(sampleRate,channels,frameCount){
 this.sampleRate=sampleRate;this.channels=channels;this.frameCount=frameCount;
 this.framesWritten=0;this.parts=[];this.peak=0;this.clippedSamples=0;this.invalidSamples=0;
 if(!Number.isInteger(sampleRate)||sampleRate<1||!Number.isInteger(channels)||channels<1||channels>2||
    !Number.isSafeInteger(frameCount)||frameCount<1)throw Error("Invalid WAV format or duration");
 this.dataBytes=frameCount*channels*2;
 if(this.dataBytes>0xffffffff-36)throw Error("WAV exceeds the 4 GB format limit; export a shorter interval");
}
Writer.prototype.append=function(planar,offset,count){
 if(this.finished)throw Error("WAV writer is already finished");
 if(!Array.isArray(planar)||planar.length!==this.channels||!Number.isInteger(offset)||offset<0||
    !Number.isInteger(count)||count<0||this.framesWritten+count>this.frameCount||
    planar.some(function(data){return !data||data.length<offset+count;}))throw Error("Invalid WAV audio block");
 var bytes=new Uint8Array(count*this.channels*2),view=new DataView(bytes.buffer),at=0;
 for(var i=0;i<count;i++)for(var c=0;c<this.channels;c++){
  var sample=planar[c][offset+i];
  if(!Number.isFinite(sample)){this.invalidSamples++;sample=0;}
  this.peak=Math.max(this.peak,Math.abs(sample));
  if(sample>1||sample<-1)this.clippedSamples++;
  sample=Math.max(-1,Math.min(1,sample));
  view.setInt16(at,Math.round(sample*(sample<0?32768:32767)),true);at+=2;
 }
 this.parts.push(bytes);this.framesWritten+=count;
};
Writer.prototype.finish=function(){
 if(this.finished)throw Error("WAV writer is already finished");
 if(this.framesWritten!==this.frameCount)throw Error("WAV output is incomplete");
 var header=new Uint8Array(44),view=new DataView(header.buffer);
 function text(at,value){for(var i=0;i<value.length;i++)header[at+i]=value.charCodeAt(i);}
 text(0,"RIFF");view.setUint32(4,this.dataBytes+36,true);text(8,"WAVE");text(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,this.channels,true);
 view.setUint32(24,this.sampleRate,true);view.setUint32(28,this.sampleRate*this.channels*2,true);
 view.setUint16(32,this.channels*2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,this.dataBytes,true);
 var blob=new Blob([header].concat(this.parts),{type:"audio/wav"});this.parts=[];this.finished=true;
 return {blob:blob,sampleRate:this.sampleRate,channels:this.channels,bitsPerSample:16,
  frameCount:this.frameCount,duration:this.frameCount/this.sampleRate,
  peak:this.peak,clippedSamples:this.clippedSamples,invalidSamples:this.invalidSamples};
};
exports.Writer=Writer;
})();
