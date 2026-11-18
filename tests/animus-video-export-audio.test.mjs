import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const RATE=48000;
function load(path,dependencies={}){
 const exports={};
 vm.runInNewContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{
  exports,Blob,Uint8Array,Float32Array,ArrayBuffer,DataView,Map,Math,Number,String,Object,JSON,setTimeout,
  require(name){if(name in dependencies)return dependencies[name];throw Error('Missing dependency '+name);}
 },{filename:path});
 return exports;
}
const wav=load('plugins/animus-video-export/src/wav.js');
const playlist=load('plugins/musical/src/playlist.js');
const narration=load('plugins/musical/src/narration-player.js');
// Exercise the actual shared mixer policy, including its voice routing and
// mute/solo rules, rather than replacing those rules with another test model.
const abcModules=JSON.parse(JSON.parse(readFileSync(new URL('../plugins/abc/dist/plugin.json',import.meta.url),'utf8')).text).tiddlers;
const abcCache=new Map();
function abcModule(title){
 if(abcCache.has(title))return abcCache.get(title);
 assert.ok(abcModules[title],'bundled ABC dependency '+title);
 const exports={};abcCache.set(title,exports);
 vm.runInNewContext(abcModules[title].text,{exports,require:abcModule},{filename:title});
 return exports;
}
const accompaniment=abcModule('$:/plugins/huwiki/abc/accompaniment.js');
function buffer(seconds,left=0,right=left){
 const frames=Math.ceil(seconds*RATE),arrays=[left,right].map(value=>{
  const data=new Float32Array(frames);
  if(typeof value==='function')for(let i=0;i<frames;i++)data[i]=value(i/RATE,i);
  else data.fill(value);
  return data;
 });
 return {sampleRate:RATE,duration:frames/RATE,length:frames,numberOfChannels:2,getChannelData(c){return arrays[c];}};
}
// A deterministic, sample-level OfflineAudioContext model exercises scheduling,
// source offsets, gain automation, overlaps, cropping and WAV output together.
function audioHarness(options={}){
 const contexts=[],decodes=[],synths=[],recordings=options.recordings||{};
 class OfflineAudioContext{
  constructor(channels,length,rate){this.numberOfChannels=channels;this.length=length;this.sampleRate=rate;this.sources=[];this.currentTime=0;this.destination={};contexts.push(this);}
  createGain(){return {events:[],gain:{setValueAtTime(value,time){this.owner.events.push({value,time});}},connect(){}};}
  createBufferSource(){
   const context=this;
   return {connect(gain){this.gain=gain;gain.gain.owner=gain;},start(at,offset,duration){this.at=at;this.offset=offset;this.duration=duration;context.sources.push(this);}};
  }
  async decodeAudioData(bytes){
   const key=new TextDecoder().decode(bytes);decodes.push(key);
   if(options.onDecode)options.onDecode();
   if(!recordings[key])throw Error('No decoded recording '+key);
   return recordings[key];
  }
  async startRendering(){
   const output=buffer(this.length/RATE);
   for(const source of this.sources){
    const start=Math.max(0,Math.ceil(source.at*RATE-1e-7));
    const end=Math.min(this.length,Math.ceil((source.at+source.duration)*RATE-1e-7));
    const events=source.gain.events.slice().sort((a,b)=>a.time-b.time);
    let ei=-1,gain=0;
    for(let frame=start;frame<end;frame++){
     const t=frame/RATE;
     while(ei+1<events.length&&events[ei+1].time<=t+1e-10)gain=events[++ei].value;
     const read=Math.floor((t-source.at+source.offset)*RATE+1e-7);
     for(let c=0;c<2;c++)output.getChannelData(c)[frame]+=(source.buffer.getChannelData(c)[read]||0)*gain;
    }
   }
   if(options.onRender)options.onRender(output);
   return output;
  }
 }
 function Fx(cues,{context}){this.context=context;}
 Fx.prototype.fire=function(cue,at){
  const source=this.context.createBufferSource(),gain=this.context.createGain();
  source.connect(gain);gain.connect(this.context.destination);
  source.buffer=buffer(cue.duration+.04,cue.volume??.2);gain.gain.setValueAtTime(1,at);
  source.start(at,0,cue.duration+.04);
 };
 function Synth(){synths.push(this);}
 Synth.prototype.init=async function(args){
  this.args=args;this.flattened={tracks:args.visualObj.tracks||[{buffer:args.visualObj.buffer}]};this.primedTracks=[];
  if(options.onSynthInit)options.onSynthInit();
 };
 Synth.prototype.prime=async function(){
  this.primed=true;this.primedTracks.push(...this.flattened.tracks);
  const inputs=this.flattened.tracks.map(track=>track.buffer);
  if(!inputs.length){this.rendered=null;return;}
  this.rendered=buffer(Math.max(...inputs.map(input=>input.duration)));
  for(const input of inputs)for(let c=0;c<2;c++){
   const output=this.rendered.getChannelData(c),source=input.getChannelData(c);
   for(let i=0;i<source.length;i++)output[i]+=source[i];
  }
 };
 Synth.prototype.getAudioBuffer=function(){return this.rendered;};
 const root={OfflineAudioContext,fetch:async source=>({ok:!options.fetchFails,status:404,arrayBuffer:async()=>new TextEncoder().encode(source).buffer})};
 const wiki={getTiddler(title){return {fields:{type:'audio/wav',_canonical_uri:'https://audio.test/'+title+'.wav'}};}};
 const audio=load('plugins/animus-video-export/src/audio.js',{
  '$:/plugins/huwiki/animus-video-export/wav.js':wav,
  '$:/plugins/huwiki/abc/accompaniment.js':accompaniment,
  '$:/plugins/huwiki/musical/playlist.js':playlist,
  '$:/plugins/huwiki/musical/narration-player.js':narration,
  '$:/plugins/huwiki/musical/sfx.js':{Fx}
 });
 return {audio,root,wiki,contexts,decodes,synths,ABC:{synth:{CreateSynth:Synth}}};
}
async function readWave(result){
 const bytes=Buffer.from(await result.blob.arrayBuffer());
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 assert.equal(bytes.readUInt32LE(4),bytes.length-8);
 assert.equal(bytes.toString('ascii',12,16),'fmt ');assert.equal(bytes.readUInt16LE(20),1);
 assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt32LE(24),RATE);
 assert.equal(bytes.readUInt32LE(28),RATE*4);assert.equal(bytes.readUInt16LE(32),4);assert.equal(bytes.readUInt16LE(34),16);
 assert.equal(bytes.toString('ascii',36,40),'data');assert.equal(bytes.readUInt32LE(40),bytes.length-44);
 assert.equal(bytes.length,44+result.frameCount*4);
 return {bytes,sample(frame,channel=0){return bytes.readInt16LE(44+frame*4+channel*2)/32768;},at(t,channel=0){return this.sample(Math.round(t*RATE),channel);}};
}
function closeTo(actual,expected,tolerance=2/32768){assert.ok(Math.abs(actual-expected)<tolerance,`${actual} expected ${expected}`);}

test('PCM16 WAV has interleaved stereo, truthful levels and no normalization',async()=>{
 const writer=new wav.Writer(RATE,2,5);
 const samples=[Float32Array.from([0,.5,-.5,1.2,NaN]),Float32Array.from([-1,1,0,-1.3,Infinity])];
 writer.append(samples,0,3);writer.append(samples,3,2);
 const result=writer.finish(),out=await readWave(result);
 assert.equal(result.blob.type,'audio/wav');assert.equal(result.bitsPerSample,16);
 assert.equal(result.frameCount,5);assert.equal(result.duration,5/RATE);
 assert.equal(result.clippedSamples,2);assert.equal(result.invalidSamples,2);closeTo(result.peak,1.3);
 assert.deepEqual(Array.from({length:10},(_,i)=>out.bytes.readInt16LE(44+i*2)),[0,-32768,16384,32767,-16384,0,32767,-32768,0,0]);
 assert.throws(()=>writer.finish(),/already finished/);
 assert.throws(()=>new wav.Writer(RATE,2,0x40000000),/4 GB/);
 assert.throws(()=>new wav.Writer(RATE,2,3).finish(),/incomplete/);
});

test('separate stems preserve clip offsets, mute, overlap, silence and video-frame padding without AAC',async()=>{
 const h=audioHarness({recordings:{
  'https://audio.test/voice.wav':buffer(.5,t=>t<.1?.1:.6),
  'https://audio.test/second.wav':buffer(.2,.2)
 }});
 const result=await h.audio.renderStems({window:h.root,wiki:h.wiki,ABC:h.ABC,start:1,end:1.5,frameCount:24800,
  songs:[{clip:{start:1.1,duration:.15,volume:.5},config:{instrument:7},tune:{buffer:buffer(.15,.8,.4)}}],
  scene:{musical:{audioClips:[
   {asset:'voice',start:1.2,offset:.1,duration:.1,volume:.5},
   {asset:'second',start:1.25,offset:0,duration:.1,volume:.5},
   {asset:'muted',start:1,duration:.5,volume:1,muted:true}
  ],sfx:[{t:1.4,duration:.08,volume:.15}]}}
 });
 assert.deepEqual(Array.from(result,x=>x.id),['music','speech','effects']);
 for(const stem of result){assert.equal(stem.frameCount,24800);assert.equal(stem.duration,24800/RATE);assert.equal(stem.peak>0,true);assert.equal(stem.clippedSamples,0);}
 const [music,voice,effects]=await Promise.all(result.map(readWave));
 closeTo(music.at(.05),0);closeTo(music.at(.12),.4);closeTo(music.at(.12,1),.2);closeTo(music.at(.27),0);
 closeTo(voice.at(.1),0);closeTo(voice.at(.22),.3);closeTo(voice.at(.27),.4);closeTo(voice.at(.32),.1);closeTo(voice.at(.4),0);
 closeTo(effects.at(.39),0);closeTo(effects.at(.45),.15);closeTo(effects.at(.499),.15);
 for(const output of [music,voice,effects])for(let i=24000;i<24800;i++)assert.equal(output.sample(i),0);
 assert.deepEqual(h.decodes.sort(),['https://audio.test/second.wav','https://audio.test/voice.wav']);
 assert.equal(h.synths[0].args.options.instrument,7);assert.equal(h.synths[0].primed,true);
 assert.equal('AudioEncoder' in h.root,false);assert.equal('AudioContext' in h.root,false);
});

test('ABC stem uses original fade and volume at a nonzero export start',async()=>{
 const h=audioHarness(),clip={start:0,duration:2,volume:.8,fadeIn:2,fadeOut:0};
 const [stem]=await h.audio.renderStems({window:h.root,ABC:h.ABC,start:1,end:1.3,music:true,speech:false,effects:false,
  songs:[{clip,tune:{buffer:buffer(2,.5)}}],soundFont:'https://soundbank.test/'});
 const out=await readWave(stem);
 closeTo(out.at(0),playlist.gainAt(clip,1)*.5);closeTo(out.at(.1),playlist.gainAt(clip,1.1)*.5);
 assert.equal(h.synths[0].args.options.soundFontUrl,'https://soundbank.test/');
});

test('ABC export honors voice mute and all mixer levels before applying the clip fade once',async()=>{
 const h=audioHarness(),clip={start:0,duration:2,volume:.8,fadeIn:2,fadeOut:0};
 const tracks=[
  {huwabcVoice:0,buffer:buffer(2,.8,.4)},
  {huwabcVoice:1,buffer:buffer(2,.7,.7)},
  {huwabcPart:'bassVolume',buffer:buffer(2,.4,.2)},
  {huwabcPart:'chordVolume',buffer:buffer(2,.4,.4)},
  {huwabcPart:'drumVolume',buffer:buffer(2,.2,.2)},
  {huwabcPart:'metronomeVolume',buffer:buffer(2,.9,.9)}
 ];
 const config={enabled:true,melodyVolume:60,bassVolume:25,chordVolume:0,drumVolume:50,metronome:false,
  voiceSettings:{'0':{volume:50,mode:'normal'},'1':{volume:100,mode:'mute'}}};
 const [stem]=await h.audio.renderStems({window:h.root,ABC:h.ABC,start:1,end:1.3,music:true,speech:false,effects:false,
  songs:[{clip,config,tune:{tracks}}]});
 const out=await readWave(stem);
 // Voice 0: .8 * .60 * .50; bass: .4 * .25; drums: .2 * .50.
 // The other voice, zero-level chords and disabled metronome stay silent.
 const left=.24+.1+.1,right=.12+.05+.1;
 for(const time of [0,.1,.2]){
  const fade=playlist.gainAt(clip,1+time);
  closeTo(out.at(time),left*fade);closeTo(out.at(time,1),right*fade);
 }
 assert.equal(h.synths.length,1,'reuse the original sample synthesizer for all buses');
 assert.deepEqual(h.synths[0].primedTracks,[tracks[0],tracks[2],tracks[4]],'muted or zero-gain buses cannot leak into the mix');
 assert.equal(h.synths[0].flattened.tracks,tracks,'restore the prepared source after bus rendering');
});

test('ABC export preserves backing solo and written-bass routing with the shared mixer policy',async()=>{
 const tracks=[
  {huwabcVoice:0,buffer:buffer(.2,.8,.6)},
  {huwabcVoice:1,buffer:buffer(.2,.4,.2)},
  {huwabcPart:'bassVolume',buffer:buffer(.2,.3,.1)},
  {huwabcPart:'chordVolume',buffer:buffer(.2,.2,.4)}
 ];
 const cases=[
  {config:{enabled:true,bassVolume:40,backingModes:{bass:'solo'}},left:.3*.4,right:.1*.4},
  {config:{enabled:true,bassSource:'voice:1',bassVolume:40,backingModes:{bass:'solo'},voiceSettings:{'1':{volume:50}}},
   tracks:tracks.filter(track=>track.huwabcPart!=='bassVolume'),left:.4*.5*.4,right:.2*.5*.4},
  {config:{enabled:true,melodyVolume:60,voiceSettings:{'0':{mode:'solo',volume:50}}},left:.8*.6*.5,right:.6*.6*.5},
  {config:{enabled:false,melodyVolume:0},left:0,right:0}
 ];
 for(const {config,left,right,tracks:sourceTracks=tracks} of cases){
  const h=audioHarness();
  const [stem]=await h.audio.renderStems({window:h.root,ABC:h.ABC,start:0,end:.1,music:true,speech:false,effects:false,
   songs:[{clip:{start:0,duration:.2,volume:.5},config,tune:{tracks:sourceTracks}}]});
  const out=await readWave(stem);
  closeTo(out.at(.05),left*.5);closeTo(out.at(.05,1),right*.5);
  assert.equal(stem.clippedSamples,0);
 }
});

test('effects retain pre-range tails and cross a render-chunk boundary continuously',async()=>{
 const h=audioHarness();
 const [tail]=await h.audio.renderStems({window:h.root,start:8.02,end:8.07,music:false,speech:false,effects:true,
  scene:{musical:{sfx:[{t:0,duration:8,volume:.25}]}}});
 const tailOut=await readWave(tail);closeTo(tailOut.at(0),.25);closeTo(tailOut.at(.015),.25);closeTo(tailOut.at(.03),0);
 const [across]=await h.audio.renderStems({window:h.root,start:.123,end:8.4,music:false,speech:false,effects:true,
  scene:{musical:{sfx:[{t:8.1,duration:.4,volume:.3}]}}});
 const out=await readWave(across);
 closeTo(out.at(7.97),0);closeTo(out.at(7.99),.3);
 closeTo(out.sample(393215),.3);closeTo(out.sample(393216),.3);
 closeTo(out.sample(across.frameCount-1),.3);
});

test('enabled but empty stems preserve the selected duration as exact silence',async()=>{
 const h=audioHarness();
 const [stem]=await h.audio.renderStems({window:h.root,start:12.123,end:12.155,music:false,speech:true,effects:false});
 const out=await readWave(stem);
 assert.equal(stem.frameCount,1536);assert.equal(stem.peak,0);
 assert.equal(out.bytes.subarray(44).some(n=>n!==0),false);
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:1,frameCount:47999}),/frame count/);
 assert.deepEqual(Array.from(await h.audio.renderStems({window:{},music:false,speech:false,effects:false})),[]);
});

test('cancellation is checked before work and after asynchronous decoding or rendering',async()=>{
 const early=audioHarness();
 await assert.rejects(early.audio.renderStems({window:early.root,start:0,end:1,cancelled:()=>true}),/cancelled/);
 assert.equal(early.contexts.length,0);
 let abort=false;
 const h=audioHarness({onRender(){abort=true;}});
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:.1,music:false,speech:false,effects:true,
  cancelled:()=>abort,scene:{musical:{sfx:[{t:0,duration:.1,volume:.2}]}}}),/cancelled/);
 abort=false;
 const decoding=audioHarness({recordings:{'https://audio.test/voice.wav':buffer(.1,.5)},onDecode(){abort=true;}});
 await assert.rejects(decoding.audio.renderStems({window:decoding.root,wiki:decoding.wiki,start:0,end:.1,
  music:false,speech:true,effects:false,cancelled:()=>abort,scene:{musical:{audioClips:[{asset:'voice',start:0,duration:.1}]}}}),/cancelled/);
});

test('missing selected ABC or recordings fail explicitly instead of substituting sound',async()=>{
 const h=audioHarness();
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:.1,music:true,speech:false,effects:false,
  songs:[{clip:{start:0,duration:.1}}]}),/still loading/);
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:.1,music:true,speech:false,effects:false,
  songs:[{clip:{start:0,duration:.1},tune:{}}]}),/sample synthesizer unavailable/);
 const missing=audioHarness({fetchFails:true});
 await assert.rejects(missing.audio.renderStems({window:missing.root,wiki:missing.wiki,start:0,end:.1,music:false,speech:true,effects:false,
  scene:{musical:{audioClips:[{asset:'voice',start:0,duration:.1}]}}}),/Recording cannot be loaded/);
});

test('AAC still encodes the shared mix at the same sample origin and closes audio frames',async()=>{
 const h=audioHarness(),encoded=[],encoders=[];
 class AudioData{constructor(data){Object.assign(this,data);}close(){this.closed=true;}}
 class AudioEncoder{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){this.callbacks=callbacks;this.encodeQueueSize=0;encoders.push(this);}
  configure(config){this.config=config;}
  encode(frame){encoded.push(frame);this.callbacks.output({byteLength:2,timestamp:frame.timestamp,copyTo(bytes){bytes.set([1,2]);}},{decoderConfig:{description:Uint8Array.from([0x11,0x90])}});}
  async flush(){}
  close(){this.closed=true;}
 }
 Object.assign(h.root,{AudioData,AudioEncoder});
 const result=await h.audio.render({window:h.root,ABC:h.ABC,start:1,end:1.02,frameCount:1600,music:true,speech:false,effects:false,
  songs:[{clip:{start:0,duration:2,volume:.5},tune:{buffer:buffer(2,.4,.2)}}]});
 assert.equal(encoded.length,2);assert.equal(encoded[0].timestamp,0);assert.equal(encoded[1].timestamp,Math.round(1024e6/RATE));
 closeTo(encoded[0].data[0],.2);closeTo(encoded[0].data[1024],.1);
 assert.equal(encoded[1].data.some(value=>value!==0),false);
 assert.equal(encoded.every(frame=>frame.closed),true);assert.equal(encoders[0].closed,true);
 assert.equal(result.frameCount,1600);assert.equal(result.samples.length,2);
});


test('frame-aligned ranges tolerate floating-point subtraction without adding a sample',async()=>{
 const h=audioHarness();
 const [stem]=await h.audio.renderStems({window:h.root,start:.7,end:.8,frameCount:4800,music:false,speech:true,effects:false});
 assert.equal(stem.frameCount,4800);assert.equal(stem.duration,.1);await readWave(stem);
});

test('recorded music and effects follow their stem kind while speech and songs share the voice stem',async()=>{
 const recordings={};
 for(const [id,level] of Object.entries({music:.2,speech:.3,song:.4,default:.1,sfx:.5,effects:.05}))
  recordings['https://audio.test/'+id+'.wav']=buffer(.2,level);
 const h=audioHarness({recordings});
 const clips=Object.keys(recordings).map(url=>{
  const id=url.match(/\/([^/]+)\.wav$/)[1];
  return {asset:id,kind:id==='default'?undefined:id,start:.5,offset:.05,duration:.1,volume:.5};
 });
 const stems=await h.audio.renderStems({window:h.root,wiki:h.wiki,ABC:h.ABC,start:.5,end:.6,
  songs:[{clip:{start:.5,duration:.1,muted:true}}],scene:{musical:{audioClips:clips,sfx:[{t:.5,duration:.1,volume:.1}]}}});
 const [music,voice,effects]=await Promise.all(stems.map(readWave));
 closeTo(music.at(.05),.1);closeTo(voice.at(.05),.4);closeTo(effects.at(.05),.375);
 assert.equal(h.synths.length,0);assert.equal(h.decodes.length,6);
 const musicOnly=await h.audio.renderStems({window:h.root,wiki:h.wiki,start:.5,end:.6,music:true,speech:false,effects:false,
  scene:{musical:{audioClips:clips}}});
 assert.equal(musicOnly.length,1);assert.equal(musicOnly[0].id,'music');
 closeTo((await readWave(musicOnly[0])).at(.05),.1);
});


test('stem export rejects invalid source PCM rather than delivering substituted silence',async()=>{
 const h=audioHarness({onRender(output){output.getChannelData(0)[42]=NaN;}});
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:.1,music:false,speech:false,effects:true,
  scene:{musical:{sfx:[{t:0,duration:.1,volume:.2}]}}}),/effects audio contains invalid samples/);
});

test('a long silent stem yields to Cancel before allocating the entire output',async()=>{
 const h=audioHarness(),completed=[];
 let abort=false;
 await assert.rejects(h.audio.renderStems({window:h.root,start:0,end:25,music:false,speech:true,effects:false,
  cancelled:()=>abort,progress(phase,value){
   if(/Audio rendered/.test(phase)){completed.push(value);setTimeout(()=>{abort=true;},0);}
  }}),/Export cancelled/);
 assert.equal(completed.length,1);
 assert.ok(completed[0]>0&&completed[0]<1,'cancellation happens after the first bounded block');
 assert.equal(h.contexts.length,0,'silence does not create an audio context');
});

test('AAC refuses invalid mixed PCM before feeding any frames to the encoder',async()=>{
 const h=audioHarness({onRender(output){output.getChannelData(1)[42]=NaN;}}),encoders=[];
 let encoded=0;
 class AudioEncoder{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(){encoders.push(this);this.encodeQueueSize=0;}
  configure(){}
  encode(){encoded++;}
  async flush(){}
  close(){this.closed=true;}
 }
 Object.assign(h.root,{AudioEncoder,AudioData:class{close(){}}});
 await assert.rejects(h.audio.render({window:h.root,start:0,end:.1,music:false,speech:false,effects:true,
  scene:{musical:{sfx:[{t:0,duration:.1,volume:.2}]}}}),/effects audio contains invalid samples/);
 assert.equal(encoded,0);assert.equal(encoders[0].closed,true);
});

test('AAC queue backpressure does not flush intermediate segments or sort output timestamps',async()=>{
 const h=audioHarness(),encoders=[],encoded=[];
 class AudioData{constructor(data){Object.assign(this,data);}close(){this.closed=true;}}
 class AudioEncoder{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){this.callbacks=callbacks;this.encodeQueueSize=0;this.flushes=0;this.maximumQueue=0;encoders.push(this);}
  configure(){}
  encode(frame){
   encoded.push(frame);this.encodeQueueSize++;this.maximumQueue=Math.max(this.maximumQueue,this.encodeQueueSize);
   // The muxer, rather than a sort in the renderer, must see and reject any
   // actual discontinuity. Include a negative priming timestamp too.
   const timestamp=encoded.length===1?-21333:encoded.length===2?21333:encoded.length===3?0:frame.timestamp;
   this.callbacks.output({byteLength:1,timestamp,copyTo(bytes){bytes[0]=1;}},{});
   setTimeout(()=>{this.encodeQueueSize--;},0);
  }
  async flush(){this.flushes++;while(this.encodeQueueSize)await new Promise(resolve=>setTimeout(resolve,0));}
  close(){this.closed=true;}
 }
 Object.assign(h.root,{AudioData,AudioEncoder});
 const result=await h.audio.render({window:h.root,start:0,end:3,music:false,speech:true,effects:false});
 assert.equal(encoders[0].flushes,1,'only the end of the complete AAC stream is flushed');
 assert.ok(encoders[0].maximumQueue<=101,'input memory stays bounded while encoding catches up');
 assert.deepEqual(Array.from(result.samples.slice(0,3),sample=>sample.timestamp),[-21333,21333,0]);
 assert.equal(result.samples.length,Math.ceil(3*RATE/1024));
 assert.equal(encoded.every(frame=>frame.closed),true);assert.equal(encoders[0].closed,true);
});
