/*\
title: $:/plugins/huwiki/animus-video-export/audio.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Soundtrack export uses AniMus' original ABCJS sample synthesis, recorded
// narration and generated theatre cues. No substitute synth is activated.
// Render in bounded offline chunks, then encode AAC for an MP4 audio track.
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
var Narration=require("$:/plugins/huwiki/musical/narration-player.js");
var SoundFx=require("$:/plugins/huwiki/musical/sfx.js");
function num(n,f){n=Number(n);return Number.isFinite(n)?n:f;}
function intersects(a,b,c,d){return a<d-1e-6&&c<b-1e-6;}
function progress(o,phase,value){if(o.progress)o.progress(phase,value);}
function cancelled(o){if(o.cancelled&&o.cancelled())throw Error("Export cancelled");}
function decodeData(context,source){
 if(!source)throw Error("A recording has no accessible audio data");
 return fetch(source).then(function(response){if(!response.ok)throw Error("Recording cannot be loaded: "+response.status);return response.arrayBuffer();})
  .then(function(data){return context.decodeAudioData(data);});
}
async function synthBuffer(ABC,song,soundfont){
 if(!song.tune)throw Error("ABC score was not ready for soundtrack export: "+(song.title||song.clip&&song.clip.score||""));
 if(!ABC||!ABC.synth||!ABC.synth.CreateSynth)throw Error("ABCJS sample synthesizer unavailable; use video-only export");
 var synth=new ABC.synth.CreateSynth(),params=Object.assign({},song.config||{});
 if(soundfont)params.soundFontUrl=soundfont;
 await synth.init({visualObj:song.tune,options:params});
 await synth.prime();
 var buffer=synth.getAudioBuffer&&synth.getAudioBuffer();
 if(!buffer)throw Error("The original sound library did not produce audio for "+(song.title||song.clip.score));
 return buffer;
}
function scheduleBuffer(context,buffer,clip,from,to,globalStart,sourceOffset,volume){
 var begin=Math.max(from,globalStart),finish=Math.min(to,globalStart+clip.duration),offset=sourceOffset+begin-globalStart;
 if(finish<=begin||offset>=buffer.duration-.001)return;
 var duration=Math.min(finish-begin,buffer.duration-offset);
 if(duration<=.002)return;
 var source=context.createBufferSource(),gain=context.createGain();
 source.buffer=buffer;source.connect(gain);gain.connect(context.destination);
 var at=Math.max(0,begin-from);
 gain.gain.setValueAtTime(0,0);
 if(typeof volume==="function"){
  var step=.05;
  gain.gain.setValueAtTime(Math.max(0,volume(begin)),at);
  for(var t=begin+step;t<begin+duration;t+=step)
   gain.gain.setValueAtTime(Math.max(0,volume(t)),t-from);
  gain.gain.setValueAtTime(Math.max(0,volume(begin+duration-.0001)),at+duration);
 }else gain.gain.setValueAtTime(Math.max(0,volume),at);
 source.start(at,offset,duration);
}
async function render(options){
 var o=options||{},root=o.window||window;
 if(!root.AudioEncoder||!root.AudioData||!root.OfflineAudioContext)throw Error("AAC offline encoding is unavailable in this browser. Choose video-only.");
 var rate=48000,channels=2,bitrate=192000;
 var config={codec:"mp4a.40.2",sampleRate:rate,numberOfChannels:channels,bitrate:bitrate};
 var support=await root.AudioEncoder.isConfigSupported(config);
 if(!support||!support.supported)throw Error("The browser does not support AAC audio encoding.");
 var musical=o.scene&&o.scene.musical||{},clips=Array.isArray(o.songs)?o.songs:[],
     recordings=Narration.normalizeClips(musical.audioClips||[]),fxCues=Array.isArray(musical.sfx)?musical.sfx:[];
 var music=o.music!==false,speech=o.speech!==false,effects=o.effects!==false;
 if(!music&&!speech&&!effects)return null;
 var from=Math.max(0,num(o.start,0)),to=Math.max(from,num(o.end,o.duration||0));
 if(to<=from)throw Error("Invalid soundtrack interval");
 var usedSongs=music?clips.filter(function(s){return s&&s.clip&&!s.clip.muted&&intersects(s.clip.start,s.clip.start+s.clip.duration,from,to);}):[];
 if(usedSongs.some(function(s){return !s.tune;}))throw Error("ABC score is still loading; wait for the score to appear before exporting its original music.");
 var usedRecordings=speech?recordings.filter(function(c){return !c.muted&&c.volume>0&&intersects(c.start,c.start+c.duration,from,to);}):[];
 var usedFx=effects?fxCues.filter(function(c){return c&&!c.muted&&num(c.t,-1)>=from-8&&num(c.t,-1)<to;}):[];
 var musicBuffers=new Map(),voiceBuffers=new Map(),decoder=null;
 var result={samples:[],description:null,sampleRate:rate,channels:2,bitrate:bitrate};
 var encodingFailure=null;
 var encoder=new root.AudioEncoder({output:function(chunk,metadata){
  var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
  result.samples.push({data:data,timestamp:chunk.timestamp});
  var cfg=metadata&&metadata.decoderConfig;if(cfg&&cfg.description)result.description=new Uint8Array(cfg.description);
 },error:function(error){encodingFailure=error||Error("AAC encoder failed");}});
 try{
  encoder.configure(support.config||config);
  if(usedRecordings.length){
   var AC=root.AudioContext||root.webkitAudioContext;
   if(!AC)throw Error("Audio decoder unavailable");
   decoder=new AC();
   for(var v=0;v<usedRecordings.length;v++){
    cancelled(o);
    var clip=usedRecordings[v];
    if(!voiceBuffers.has(clip.asset)){
     var source=Narration.audioSource(o.wiki,clip.asset);
     progress(o,"Indlæser indtaling / Loading recordings",0);
     voiceBuffers.set(clip.asset,await decodeData(decoder,source));
    }
   }
  }
  // 393216 samples = 8.192 seconds, an integer number of AAC frames.
  // A look-behind preserves the tails of effects crossing chunk boundaries.
  var totalSamples=Math.ceil((to-from)*rate),chunkFrames=393216,lookBehind=8.25,encoded=0;
  for(var i=0;i<totalSamples;i+=chunkFrames){
   cancelled(o);
   var count=Math.min(chunkFrames,totalSamples-i);
   var globalStart=from+i/rate,globalEnd=from+(i+count)/rate;
   var regionStart=Math.max(0,globalStart-lookBehind),regionEnd=globalEnd;
   var regionFrames=Math.ceil((regionEnd-regionStart)*rate);
   var context=new root.OfflineAudioContext(channels,regionFrames,rate);
   for(var s=0;s<usedSongs.length;s++){
    var song=usedSongs[s],sc=song.clip;
    if(!intersects(sc.start,sc.start+sc.duration,regionStart,regionEnd))continue;
    if(!musicBuffers.has(song)){
     cancelled(o);progress(o,"Bygger ABC-lyd / Rendering original ABC sound",i/totalSamples);
     musicBuffers.set(song,await synthBuffer(o.ABC,song,o.soundFont));
    }
    scheduleBuffer(context,musicBuffers.get(song),sc,regionStart,regionEnd,sc.start,0,function(t){return Playlist.gainAt(sc,t);});
   }
   for(var j=0;j<usedRecordings.length;j++){
    var rec=usedRecordings[j];
    if(!intersects(rec.start,rec.start+rec.duration,regionStart,regionEnd))continue;
    scheduleBuffer(context,voiceBuffers.get(rec.asset),rec,regionStart,regionEnd,rec.start,rec.offset,rec.volume);
   }
   if(usedFx.length){
    var effectsEngine=new SoundFx.Fx(usedFx,{context:context});
    usedFx.forEach(function(cue){var when=num(cue.t,-1);
     if(when>=regionStart&&when<regionEnd)effectsEngine.fire(cue,when-regionStart);
    });
   }
   progress(o,"Blander lyd / Mixing soundtrack",i/totalSamples);
   var rendered=await context.startRendering();
   var offset=Math.max(0,Math.round((globalStart-regionStart)*rate));
   var left=rendered.getChannelData(0),right=rendered.getChannelData(1);
   for(var sample=0;sample<count;sample+=1024){
    cancelled(o);
    var len=Math.min(1024,count-sample),data=new Float32Array(2048);
    data.set(left.subarray(offset+sample,offset+sample+len),0);
    data.set(right.subarray(offset+sample,offset+sample+len),1024);
    var frame=new root.AudioData({format:"f32-planar",sampleRate:rate,numberOfFrames:1024,
      numberOfChannels:2,timestamp:Math.round((i+sample)*1000000/rate),data:data});
    encoder.encode(frame);frame.close();encoded++;
    if(encoder.encodeQueueSize>100)await encoder.flush();
    if(encodingFailure)throw encodingFailure;
   }
   // Release rendered buffers as soon as they are no longer needed.
   musicBuffers.forEach(function(buffer,song){
    if(song.clip.start+song.clip.duration<=globalEnd-lookBehind)musicBuffers.delete(song);
   });
   progress(o,"Koder AAC / Encoding AAC",Math.min(1,(i+count)/totalSamples));
  }
  await encoder.flush();
  if(encodingFailure)throw encodingFailure;
  result.samples.sort(function(a,b){return a.timestamp-b.timestamp;});
  if(!result.samples.length)throw Error("The AAC encoder produced no samples");
  return result;
 }finally{
  try{encoder.close();}catch(_){}
  if(decoder)try{await decoder.close();}catch(_){}
  musicBuffers.clear();voiceBuffers.clear();
 }
}
exports.render=render;
})();
