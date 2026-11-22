/*\
title: $:/plugins/huwiki/animus-video-export/audio.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// AAC soundtracks and separate PCM WAV stems share the original AniMus sources
// and sample clock. No substitute synthesizer or live playback is activated.
var Playlist=require("$:/plugins/huwiki/musical/playlist.js");
var Accompaniment=require("$:/plugins/huwiki/abc/accompaniment.js");
var Narration=require("$:/plugins/huwiki/musical/narration-player.js");
var SoundFx=require("$:/plugins/huwiki/musical/sfx.js");
var WAV=require("$:/plugins/huwiki/animus-video-export/wav.js");
var AAC=require("$:/plugins/huwiki/animus-video-export/aac.js");
var RATE=48000,CHANNELS=2,CHUNK_FRAMES=393216,LOOK_BEHIND_FRAMES=396000;
function num(n,f){n=Number(n);return Number.isFinite(n)?n:f;}
function intersects(a,b,c,d){return a<d&&c<b;}
function progress(o,phase,value){if(o.progress)o.progress(phase,value);}
function cancelled(o){if(o.cancelled&&o.cancelled())throw Error("Export cancelled");}
function pause(){return new Promise(function(resolve){setTimeout(resolve,0);});}
function environment(o){return o.window||(typeof window!=="undefined"?window:{});}
function selection(o){return {music:o.music!==false,speech:o.speech!==false,effects:o.effects!==false};}
function recordingStem(clip){
 var kind=String(clip.kind||"").toLowerCase();
 return kind==="music"?"music":kind==="sfx"||kind==="effects"?"effects":"speech";
}
function specification(o){
 var from=Math.max(0,num(o.start,0)),to=num(o.end,o.duration||0);
 if(to<=from)throw Error("Invalid soundtrack interval");
 // Match whole-frame export rounding without adding a spurious sample for
 // binary floating-point intervals such as 0.7 to 0.8 seconds.
 var contentFrames=Math.max(1,Math.ceil((to-from)*RATE-1e-5)),frameCount=o.frameCount===undefined?contentFrames:Number(o.frameCount);
 if(!Number.isSafeInteger(frameCount)||frameCount<contentFrames)throw Error("Invalid soundtrack frame count");
 return {from:from,to:to,contentFrames:contentFrames,frameCount:frameCount};
}
async function decodeData(context,source,o,root){
 if(!source)throw Error("A recording has no accessible audio data");
 var fetcher=root.fetch?root.fetch.bind(root):fetch;
 var response=await fetcher(source);cancelled(o);
 if(!response.ok)throw Error("Recording cannot be loaded: "+response.status);
 var bytes=await response.arrayBuffer();cancelled(o);
 var buffer=await context.decodeAudioData(bytes);cancelled(o);return buffer;
}
async function synthBuffers(ABC,song,soundfont,o){
 if(!song.tune)throw Error("ABC score was not ready for soundtrack export: "+(song.title||song.clip&&song.clip.score||""));
 if(!ABC||!ABC.synth||!ABC.synth.CreateSynth)throw Error("ABCJS sample synthesizer unavailable; use video-only export");
 var synth=new ABC.synth.CreateSynth(),params=Object.assign({},song.config||{});
 if(soundfont)params.soundFontUrl=soundfont;
 await synth.init({visualObj:song.tune,options:params});cancelled(o);
 var full=synth.flattened,groups=Object.create(null),buffers=[];
 if(!full||!Array.isArray(full.tracks))throw Error("The original ABC mixer tracks are unavailable for "+(song.title||song.clip.score));
 // Match Accompaniment.createMixer's source buses. Mixer volumes and mute/solo
 // are GainNode controls in AniMus, not options understood by plain ABCJS.
 // Keep the prepared notes and original sample renderer, applying each bus
 // gain separately from the whole clip's gain and fade below.
 full.tracks.forEach(function(track){
  var key=track.huwabcVoice!==undefined?"voice:"+track.huwabcVoice:(track.huwabcPart||"melodyVolume");
  (groups[key]||(groups[key]=[])).push(track);
 });
 try{
  var keys=Object.keys(groups);
  for(var i=0;i<keys.length;i++){
   cancelled(o);var key=keys[i],gain=Accompaniment.channelGain(key,song.config||{});
   if(gain<=0)continue;
   synth.flattened=Object.assign({},full,{tracks:groups[key]});
   await synth.prime();cancelled(o);
   var buffer=synth.getAudioBuffer&&synth.getAudioBuffer();
   if(!buffer)throw Error("The original sound library did not produce audio for "+(song.title||song.clip.score));
   buffers.push({buffer:buffer,gain:gain});
  }
  return buffers;
 }finally{synth.flattened=full;}
}
function scheduleBuffer(context,buffer,clip,from,to,globalStart,sourceOffset,volume,send){
 var begin=Math.max(from,globalStart),finish=Math.min(to,globalStart+clip.duration),offset=sourceOffset+begin-globalStart;
 if(finish<=begin||offset>=buffer.duration)return;
 var duration=Math.min(finish-begin,buffer.duration-offset);
 if(duration<=0)return;
 var source=context.createBufferSource(),gain=context.createGain();
 source.buffer=buffer;source.connect(gain);gain.connect(context.destination);if(send)gain.connect(send);
 var at=Math.max(0,begin-from);
 gain.gain.setValueAtTime(0,0);
 if(typeof volume==="function"){
  var step=.05;
  gain.gain.setValueAtTime(Math.max(0,volume(begin)),at);
  // Anchor envelope updates to the source clip, rather than each render chunk.
  for(var n=Math.floor((begin-globalStart)/step)+1,t=globalStart+n*step;t<begin+duration;n++,t=globalStart+n*step)
   gain.gain.setValueAtTime(Math.max(0,volume(t)),Math.max(at,t-from));
 }else gain.gain.setValueAtTime(Math.max(0,volume),at);
 source.start(at,offset,duration);
}
// The consumer receives exactly frameCount output samples in bounded chunks.
// Extra output frames (for a video-frame boundary) remain silent after o.end.
async function renderPCM(o,enabled,consume){
 var root=environment(o),spec=specification(o);
 if(!root.OfflineAudioContext)throw Error("Offline audio rendering is unavailable in this browser.");
 cancelled(o);
 var musical=o.scene&&o.scene.musical||{},clips=Array.isArray(o.songs)?o.songs:[];
 var usedSongs=enabled.music?clips.filter(function(s){return s&&s.clip&&!s.clip.muted&&num(s.clip.volume,1)>0&&intersects(s.clip.start,s.clip.start+s.clip.duration+(s.config&&s.config.reverb?Accompaniment.roomSeconds:0),spec.from,spec.to);}):[];
 if(usedSongs.some(function(s){return !s.tune;}))throw Error("ABC score is still loading; wait for the score to appear before exporting its original music.");
 var usedRecordings=Narration.normalizeClips(musical.audioClips||[]).filter(function(c){
  return enabled[recordingStem(c)]&&!c.muted&&c.volume>0&&intersects(c.start,c.start+c.duration+(c.reverb?Accompaniment.roomSeconds:0),spec.from,spec.to);
 });
 var fxCues=Array.isArray(musical.sfx)?musical.sfx:[];
 var usedFx=enabled.effects?fxCues.filter(function(c){return c&&!c.muted&&num(c.t,-1)>=0&&num(c.t,-1)+Math.max(.08,num(c.duration,1))+.05+(c.reverb?Accompaniment.roomSeconds:0)>=spec.from&&num(c.t,-1)<spec.to;}):[];
 var musicBuffers=new Map(),voiceBuffers=new Map(),decoder=null;
 try{
  for(var i=0;i<spec.frameCount;i+=CHUNK_FRAMES){
   cancelled(o);
   var count=Math.min(CHUNK_FRAMES,spec.frameCount-i),contentCount=Math.max(0,Math.min(count,spec.contentFrames-i));
   var globalStart=spec.from+i/RATE,globalEnd=spec.from+(i+count)/RATE,regionEnd=Math.min(globalEnd,spec.to);
   // An integer prefix keeps the cropped result on the exact same sample grid
   // even if the selected starting time is between two timeline samples.
   var prefix=Math.min(LOOK_BEHIND_FRAMES,Math.ceil(globalStart*RATE));
   var regionStart=globalStart-prefix/RATE,left,right,offset=prefix;
   if(contentCount&&(usedSongs.length||usedRecordings.length||usedFx.length)){
    var context=new root.OfflineAudioContext(CHANNELS,prefix+count,RATE);
    for(var s=0;s<usedSongs.length;s++){
     var song=usedSongs[s],sc=song.clip;
     var amount=num(song.config&&song.config.reverb,0)/100;
     if(!intersects(sc.start,sc.start+sc.duration+(amount?Accompaniment.roomSeconds:0),globalStart,regionEnd))continue;
     var send=null;
     if(amount&&context.createConvolver){
      send=context.createGain();send.gain.value=amount;send.connect(Accompaniment.createRoom(context).input());
     }
     if(!musicBuffers.has(song)){
      progress(o,"Bygger ABC-lyd / Rendering original ABC sound",i/spec.frameCount);
      musicBuffers.set(song,await synthBuffers(o.ABC,song,o.soundFont,o));cancelled(o);
     }
     musicBuffers.get(song).forEach(function(bus){
      scheduleBuffer(context,bus.buffer,sc,regionStart,regionEnd,sc.start,0,function(t){return bus.gain*Playlist.gainAt(sc,t);},send);
     });
    }
    for(var j=0;j<usedRecordings.length;j++){
     var rec=usedRecordings[j];
     if(!intersects(rec.start,rec.start+rec.duration+(rec.reverb?Accompaniment.roomSeconds:0),globalStart,regionEnd))continue;
     if(!voiceBuffers.has(rec.asset)){
      if(!decoder){
       // decodeAudioData works on OfflineAudioContext too, without creating a
       // live audio session or requiring an audio-unlock gesture on the device.
       decoder=new root.OfflineAudioContext(CHANNELS,1,RATE);
      }
      progress(o,"Indlæser indtaling / Loading recordings",i/spec.frameCount);
      voiceBuffers.set(rec.asset,await decodeData(decoder,Narration.audioSource(o.wiki,rec.asset),o,root));cancelled(o);
     }
     var recSend=null;
     if(rec.reverb>0&&context.createConvolver){
      recSend=context.createGain();recSend.gain.value=Math.min(1,rec.reverb);recSend.connect(Accompaniment.createRoom(context).input());
     }
     scheduleBuffer(context,voiceBuffers.get(rec.asset),rec,regionStart,regionEnd,rec.start,rec.offset,(function(clip){return function(t){return Narration.gainAt(clip,t);};})(rec),recSend);
    }
    if(usedFx.length){
     var effectsEngine=new SoundFx.Fx(usedFx,{context:context,strict:true});
     usedFx.forEach(function(cue){var when=num(cue.t,-1);
      if(when<regionEnd&&when+Math.max(.08,num(cue.duration,1))>=regionStart)effectsEngine.fire(cue,Math.max(0,when-regionStart),Math.max(0,regionStart-when));
     });
    }
    cancelled(o);progress(o,"Beregner lyd / Rendering audio",i/spec.frameCount);
    var rendered=await context.startRendering();cancelled(o);
    left=rendered.getChannelData(0);right=rendered.getChannelData(1);
    if(contentCount<count){left.fill(0,prefix+contentCount);right.fill(0,prefix+contentCount);}
   }else{left=new Float32Array(count);right=new Float32Array(count);offset=0;}
   // A failed graph must never become a successful, silent AAC soundtrack.
   // Check only the selected output samples; discarded look-behind and end
   // padding are not part of this export.
   for(var channel=0;channel<CHANNELS;channel++){
    var pcm=channel===0?left:right;
    for(var sample=offset;sample<offset+count;sample++)if(!Number.isFinite(pcm[sample]))
     throw Error("The "+Object.keys(enabled).filter(function(id){return enabled[id];}).join("/")+" audio contains invalid samples; check its source recordings and export again.");
   }
   await consume([left,right],offset,count,i,spec);cancelled(o);
   left=null;right=null;pcm=null;rendered=null;context=null;effectsEngine=null;
   musicBuffers.forEach(function(buffer,song){if(song.clip.start+song.clip.duration+(song.config&&song.config.reverb?Accompaniment.roomSeconds:0)<=globalEnd)musicBuffers.delete(song);});
   voiceBuffers.forEach(function(buffer,asset){if(!usedRecordings.some(function(rec){return rec.asset===asset&&rec.start+rec.duration>globalEnd;}))voiceBuffers.delete(asset);});
   progress(o,"Lyd klar / Audio rendered",Math.min(1,(i+count)/spec.frameCount));
   // Silent stems have no async browser rendering work. Yield a real task so
   // Cancel and paint events still run while long, empty tracks are written.
   await pause();cancelled(o);
  }
  return spec;
 }finally{musicBuffers.clear();voiceBuffers.clear();decoder=null;}
}
async function render(options){
 var o=options||{},root=environment(o),enabled=selection(o);
 if(!enabled.music&&!enabled.speech&&!enabled.effects)return null;
 cancelled(o);
 if(!root.AudioEncoder||!root.AudioData||!root.OfflineAudioContext)throw Error("AAC offline encoding is unavailable in this browser. Choose video-only or separate WAV audio.");
 var bitrate=192000,config={codec:"mp4a.40.2",sampleRate:RATE,numberOfChannels:CHANNELS,bitrate:bitrate};
 var support=await root.AudioEncoder.isConfigSupported(config);cancelled(o);
 if(!support||!support.supported)throw Error("The browser does not support AAC audio encoding. Separate WAV audio is available without AAC.");
 var result={samples:[],description:null,sampleRate:RATE,channels:CHANNELS,bitrate:bitrate},encodingFailure=null;
 var encoder=new root.AudioEncoder({output:function(chunk,metadata){
  var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);result.samples.push({data:data,timestamp:chunk.timestamp});
  var cfg=metadata&&metadata.decoderConfig;if(cfg&&cfg.description)result.description=new Uint8Array(cfg.description);
 },error:function(error){encodingFailure=error||Error("AAC encoder failed");}});
 try{
  encoder.configure(support.config||config);
  var spec=await renderPCM(o,enabled,async function(planar,offset,count,index){
   for(var sample=0;sample<count;sample+=1024){
    cancelled(o);if(encodingFailure)throw encodingFailure;
    var len=Math.min(1024,count-sample),data=new Float32Array(2048);
    data.set(planar[0].subarray(offset+sample,offset+sample+len),0);
    data.set(planar[1].subarray(offset+sample,offset+sample+len),1024);
    var frame=new root.AudioData({format:"f32-planar",sampleRate:RATE,numberOfFrames:1024,
     numberOfChannels:CHANNELS,timestamp:Math.round((index+sample)*1000000/RATE),data:data});
    try{encoder.encode(frame);}finally{frame.close();}
    // flush() may finalize a codec segment and add encoder padding. Keep one
    // continuous AAC stream and wait for queue capacity without flushing it.
    while(encoder.encodeQueueSize>100){await pause();cancelled(o);if(encodingFailure)throw encodingFailure;}
    if(encodingFailure)throw encodingFailure;
   }
  });
  await encoder.flush();cancelled(o);if(encodingFailure)throw encodingFailure;
  // Preserve the encoder's output order and timestamps. The muxer uses them
  // to retain priming information and detect discontinuous encoded audio.
  if(!result.samples.length)throw Error("The AAC encoder produced no samples");
  result.primingFrames=await AAC.measure(root,support.config||config,o);cancelled(o);
  result.frameCount=spec.frameCount;result.duration=spec.frameCount/RATE;return result;
 }finally{try{encoder.close();}catch(_){}}
}
async function renderStems(options){
 var o=options||{},enabled=selection(o),ids=["music","speech","effects"].filter(function(id){return enabled[id];}),results=[];
 var names={music:"Musik / Music",speech:"Tale / Voice",effects:"Effekter / Effects"};
 if(!ids.length)return results;
 var spec=specification(o);
 for(var i=0;i<ids.length;i++){
  cancelled(o);var id=ids[i],writer=new WAV.Writer(RATE,CHANNELS,spec.frameCount),selected={music:false,speech:false,effects:false};selected[id]=true;
  var settings=Object.assign({},o,{progress:function(phase,value){progress(o,names[id]+": "+phase,(i+value)/ids.length);}});
  await renderPCM(settings,selected,function(planar,offset,count){writer.append(planar,offset,count);});cancelled(o);
  var result=writer.finish();
  if(result.invalidSamples)throw Error("The "+id+" audio contains invalid samples; check its source recordings and export again.");
  result.id=id;results.push(result);
 }
 return results;
}
exports.render=render;exports.renderStems=renderStems;
})();
