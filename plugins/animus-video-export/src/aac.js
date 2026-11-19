/*\
title: $:/plugins/huwiki/animus-video-export/aac.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var MP4=require("$:/plugins/huwiki/animus-video-export/mp4.js");
var cache=new WeakMap();
// WebCodecs timestamps do not reliably expose native AAC encoder priming.
// Measure the exact configuration with inaudible, separately encoded probes.
// This calibration never enters the user's audio or changes its sample origin.
async function measure(root,config,options){
 var o=options||{},rate=config.sampleRate,channels=config.numberOfChannels;
 function cancelled(){if(o.cancelled&&o.cancelled())throw Error("Export cancelled");}
 if(!root.AudioEncoder||!root.AudioData||!root.OfflineAudioContext)
  throw Error("AAC timing cannot be verified in this browser; use separate WAV audio");
 if(rate!==48000||channels!==2)throw Error("Unsupported AAC calibration format");
 cancelled();
 var key=JSON.stringify(config),known=cache.get(root.AudioEncoder);
 if(known&&known.has(key))return known.get(key);
 if(o.progress)o.progress("Kontrollerer lydsynkronisering / Checking audio timing",0);
 var sound={sampleRate:rate,channels:channels,bitrate:config.bitrate,samples:[],description:null},failure=null;
 var encoder=new root.AudioEncoder({output:function(chunk,metadata){
  var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
  sound.samples.push({data:data,timestamp:chunk.timestamp});
  var decoder=metadata&&metadata.decoderConfig;
  if(decoder&&decoder.description)sound.description=new Uint8Array(decoder.description);
 },error:function(error){failure=error||Error("AAC timing calibration failed");}});
 try{
  encoder.configure(config);
  var expected=[8192,16384],frames=32768;
  for(var at=0;at<frames;at+=1024){
   cancelled();if(failure)throw failure;
   var data=new Float32Array(2048);
   for(var c=0;c<channels;c++)if(expected[c]>=at&&expected[c]<at+1024)data[c*1024+expected[c]-at]=.8;
   var frame=new root.AudioData({format:"f32-planar",sampleRate:rate,numberOfFrames:1024,
    numberOfChannels:channels,timestamp:Math.round(at*1000000/rate),data:data});
   try{encoder.encode(frame);}finally{frame.close();}
  }
  await encoder.flush();cancelled();if(failure)throw failure;
  if(!sound.samples.length)throw Error("AAC timing calibration returned no packets");
  // Explicit zero trim plus roll groups exposes the raw decoded priming; do
  // not let a container reader infer an Apple/platform-specific default delay.
  sound.frameCount=sound.samples.length*1024;sound.primingFrames=0;
  var bytes=MP4.muxAudio(sound),context=new root.OfflineAudioContext(channels,1,rate);
  var decoded=await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  cancelled();
  if(decoded.sampleRate!==rate||decoded.numberOfChannels!==channels)throw Error("AAC timing calibration changed the audio format");
  var delays=expected.map(function(position,channel){
   var values=decoded.getChannelData(channel),peak=0,index=-1;
   for(var i=position;i<Math.min(values.length,position+8193);i++){
    var value=Math.abs(values[i]);if(value>peak){peak=value;index=i;}
   }
   if(peak<.1||index<position)throw Error("AAC timing calibration could not locate its signal; use separate WAV audio");
   return index-position;
  });
  if(delays[0]!==delays[1])throw Error("AAC timing calibration is inconsistent; use separate WAV audio");
  if(!known){known=new Map();cache.set(root.AudioEncoder,known);}known.set(key,delays[0]);
  return delays[0];
 }finally{try{encoder.close();}catch(_){}}
}
exports.measure=measure;
})();
