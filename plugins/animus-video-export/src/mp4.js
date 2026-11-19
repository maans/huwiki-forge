/*\
title: $:/plugins/huwiki/animus-video-export/mp4.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Small ISO BMFF muxer for WebCodecs AVC (avc format) and optional AAC-LC.
// Samples are in decode order. Currently supports constant-frame-rate video,
// AAC-LC without B-frame reordering, and files smaller than 4 GiB. AAC packet
// timestamps locate encoder priming; an edit list removes it and end padding
// without shifting the original audio against the video.
function u8(){return new Uint8Array(Array.prototype.slice.call(arguments));}
function u16(n){return u8(n>>>8,n);}
function u32(n){return u8(n>>>24,n>>>16,n>>>8,n);}
function ascii(s){return Uint8Array.from(String(s),function(c){return c.charCodeAt(0)&255;});}
function join(parts){
 var count=parts.reduce(function(n,p){return n+p.length;},0),out=new Uint8Array(count),i=0;
 parts.forEach(function(p){out.set(p,i);i+=p.length;});return out;
}
function box(type){var parts=Array.prototype.slice.call(arguments,1),size=8+parts.reduce(function(n,p){return n+p.length;},0);
 if(size>4294967295)throw Error("MP4 box too large");
 return join([u32(size),ascii(type)].concat(parts));
}
function full(type,version,flags){return box.apply(null,[type,u8(version,(flags>>16)&255,(flags>>8)&255,flags&255)].concat(Array.prototype.slice.call(arguments,3)));}
function matrix(){return join([u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(1073741824)]);}
function zeros(n){return new Uint8Array(n);}
function presentationDuration(track){return track.presentationFrames===undefined?track.samples.length*track.step:track.presentationFrames;}
function audioTrack(audio){
 var rate=Number(audio.sampleRate),samples=audio.samples,rawFrames=samples.length*1024;
 if(!Number.isInteger(rate)||rate<=0||rate>65535)throw Error("Invalid AAC sample rate");
 var hasTimestamps=samples.some(function(s){return s.timestamp!==undefined;}),first=0;
 if(hasTimestamps){
  if(!Number.isFinite(samples[0].timestamp))throw Error("AAC packet timestamp is missing");
  first=Math.round(samples[0].timestamp*rate/1000000);
  // The export starts at zero. Positive time would require a deliberate empty
  // edit; do not silently close that gap or invent samples in this exporter.
  if(first>0)throw Error("AAC output begins after the requested start; use separate WAV audio");
  samples.forEach(function(sample,index){
   if(!Number.isFinite(sample.timestamp)||Math.abs(Math.round(sample.timestamp*rate/1000000)-(first+index*1024))>1)
    throw Error("AAC encoder returned discontinuous timestamps; use separate WAV audio");
  });
 }
 // Some native AAC encoders start timestamps at zero while still inserting
 // priming samples. The encoder calibration may supply their measured count.
 var priming=audio.primingFrames===undefined?-first:Number(audio.primingFrames);
 var frames=audio.frameCount===undefined?rawFrames-priming:Number(audio.frameCount);
 if(!Number.isSafeInteger(priming)||!Number.isSafeInteger(frames)||frames<=0||priming<0||priming+frames>rawFrames)
  throw Error("AAC encoder did not provide the complete requested audio interval");
 return Object.assign({},audio,{kind:"audio",timescale:rate,step:1024,
  presentationFrames:frames,primingFrames:priming});
}
function descriptor(tag,data){
 var n=data.length,parts=[n&127];n>>>=7;
 while(n){parts.unshift((n&127)|128);n>>>=7;}
 return join([u8(tag),Uint8Array.from(parts),data]);
}
function videoEntry(v){
 var avcc=v.description;if(!avcc||!avcc.length)throw Error("H.264 decoder configuration is missing");
 return box("avc1",zeros(6),u16(1),zeros(16),u16(v.width),u16(v.height),
  u32(0x00480000),u32(0x00480000),zeros(4),u16(1),zeros(32),u16(24),u16(65535),
  box("avcC",avcc),box("btrt",u32(0),u32(v.bitrate||8000000),u32(v.bitrate||8000000)));
}
function audioEntry(a){
 var freq=a.sampleRate||48000,asc=a.description;
 if(!asc||!asc.length){var index={96000:0,88200:1,64000:2,48000:3,44100:4,32000:5,24000:6,22050:7,16000:8}[freq];
  if(index===undefined)throw Error("Unsupported AAC sample rate: "+freq);
  var channels=a.channels||2;asc=u8((2<<3)|(index>>1),((index&1)<<7)|(channels<<3));
 }
 var dsi=descriptor(5,asc),dec=descriptor(4,join([u8(0x40,0x15,0,0,0),u32(a.bitrate||192000),u32(a.bitrate||192000),dsi]));
 var es=descriptor(3,join([u16(1),u8(0),dec,descriptor(6,u8(2))]));
 return box("mp4a",zeros(6),u16(1),zeros(8),u16(a.channels||2),u16(16),zeros(4),u32(freq*65536),full("esds",0,0,es));
}
function sampleTable(track,offset){
 var samples=track.samples,count=samples.length,entry=track.kind==="video"?videoEntry(track):audioEntry(track);
 var stsd=full("stsd",0,0,u32(1),entry);
 var stts=full("stts",0,0,u32(1),u32(count),u32(track.step));
 var stsc=full("stsc",0,0,u32(1),u32(1),u32(count),u32(1));
 var sizes=full.apply(null,["stsz",0,0,u32(0),u32(count)].concat(samples.map(function(s){return u32(s.data.length);})));
 var stco=full("stco",0,0,u32(1),u32(offset));
 var children=[stsd,stts,stsc,sizes,stco];
 if(track.kind==="video"){var keys=[],i;
  for(i=0;i<count;i++)if(samples[i].key)keys.push(u32(i+1));
  if(!keys.length)throw Error("Video has no keyframes");
  children.push(full("stss",0,0,u32(keys.length),join(keys)));
 }else{
  // AAC-LC needs the preceding packet to decode a seek position. These roll
  // groups also tell Apple readers that the edit list explicitly describes
  // priming, rather than asking them to assume a fixed 2112-sample delay.
  children.push(full("sgpd",1,0,ascii("roll"),u32(2),u32(1),u16(65535)));
  children.push(full("sbgp",0,0,ascii("roll"),u32(1),u32(count),u32(1)));
 }
 return box("stbl",join(children));
}
function trackBox(track,id,offset,movieScale){
 var isAudio=track.kind==="audio",duration=track.samples.length*track.step,seconds=presentationDuration(track)/track.timescale;
 var td=Math.round(seconds*movieScale),width=track.width||0,height=track.height||0;
 var tkhd=full("tkhd",0,7,u32(0),u32(0),u32(id),u32(0),u32(td),zeros(8),
  u16(0),u16(0),u16(isAudio?256:0),u16(0),matrix(),u32(width*65536),u32(height*65536));
 var mdhd=full("mdhd",0,0,u32(0),u32(0),u32(track.timescale),u32(duration),u16(0x55c4),u16(0));
 var hdlr=full("hdlr",0,0,u32(0),ascii(isAudio?"soun":"vide"),zeros(12),ascii(isAudio?"SoundHandler\0":"VideoHandler\0"));
 var mediaHeader=isAudio?full("smhd",0,0,u16(0),u16(0)):full("vmhd",0,1,u16(0),u16(0),u16(0),u16(0));
 var dinf=box("dinf",full("dref",0,0,u32(1),full("url ",0,1)));
 var minf=box("minf",mediaHeader,dinf,sampleTable(track,offset));
 var media=box("mdia",mdhd,hdlr,minf);
 if(isAudio){
  // segment_duration uses movie units; media_time uses audio sample units.
  // Even a zero-priming edit records the exact cut, excluding AAC end padding.
  var edit=box("edts",full("elst",0,0,u32(1),u32(td),u32(track.primingFrames||0),u16(1),u16(0)));
  return box("trak",tkhd,edit,media);
 }
 return box("trak",tkhd,media);
}
function movieBox(tracks,offsets){
 // 48 kHz represents every PCM sample and all supported video-frame rates
 // exactly, unlike millisecond movie units which round a 24/30 fps cut.
 var timescale=48000,max=0;
 tracks.forEach(function(t){max=Math.max(max,Math.round(presentationDuration(t)/t.timescale*timescale));});
 var mvhd=full("mvhd",0,0,u32(0),u32(0),u32(timescale),u32(max),u32(65536),u16(256),
  zeros(10),matrix(),zeros(24),u32(tracks.length+1));
 return box.apply(null,["moov",mvhd].concat(tracks.map(function(t,i){return trackBox(t,i+1,offsets[i],timescale);})));
}
function mux(video,audio){
 if(!video||!video.samples||!video.samples.length)throw Error("No video frames encoded");
 if(!Number.isInteger(video.width)||!Number.isInteger(video.height)||!video.description)throw Error("Invalid H.264 video metadata");
 var fps=video.fps||30;
 if(fps!==24&&fps!==25&&fps!==30&&fps!==60)throw Error("Unsupported frame rate");
 var tracks=[Object.assign({kind:"video",timescale:90000,step:90000/fps},video)];
 if(audio&&audio.samples&&audio.samples.length){
  var sound=audioTrack(audio);
  if(audio.frameCount!==undefined&&Math.abs(sound.presentationFrames/sound.timescale-video.samples.length/fps)>1/sound.timescale)
   throw Error("Encoded video and audio durations do not match the requested export");
  tracks.push(sound);
 }
 return pack(tracks);
}
function muxAudio(audio){
 if(!audio||!audio.samples||!audio.samples.length)throw Error("No audio frames encoded");
 return pack([audioTrack(audio)]);
}
function pack(tracks){
 var ft=box("ftyp",ascii("isom"),u32(512),ascii("isom"),ascii("iso2"),ascii("avc1"),ascii("mp41"));
 var lengths=tracks.map(function(t){return t.samples.reduce(function(n,s){return n+s.data.length;},0);});
 var offsets=tracks.map(function(){return 0;}),moov=movieBox(tracks,offsets);
 var start=ft.length+moov.length+8;
 for(var i=0,p=start;i<lengths.length;i++){offsets[i]=p;p+=lengths[i];}
 if(p>4294967295)throw Error("MP4 exceeds 4 GiB; export a shorter scene");
 moov=movieBox(tracks,offsets);
 var size=ft.length+moov.length+8+lengths.reduce(function(n,v){return n+v;},0);
 var result=new Uint8Array(size),at=0;
 result.set(ft,at);at+=ft.length;result.set(moov,at);at+=moov.length;
 result.set(u32(8+lengths.reduce(function(n,v){return n+v;},0)),at);result.set(ascii("mdat"),at+4);at+=8;
 tracks.forEach(function(t){t.samples.forEach(function(s){result.set(s.data,at);at+=s.data.length;});});
 return result;
}
exports.mux=mux;
exports.muxAudio=muxAudio;
exports.box=box;
})();
