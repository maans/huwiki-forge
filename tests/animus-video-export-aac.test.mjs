import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const config={codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000};
function fixture({delay=2112,secondDelay=delay,silent=false,onDecode}={}){
 const exports={},instances=[],frames=[],encoded=[];let calibration;
 class AudioData{constructor(options){Object.assign(this,options);frames.push(this);}close(){this.closed=true;}}
 class AudioEncoder{
  constructor(callbacks){this.callbacks=callbacks;this.frames=[];instances.push(this);}
  configure(settings){this.config=settings;}
  encode(frame){this.frames.push(frame);encoded.push(frame);}
  async flush(){
   for(let i=0;i<Math.ceil((32768+delay)/1024);i++)this.callbacks.output({
    byteLength:1,timestamp:Math.round(i*1024e6/48000),copyTo(target){target[0]=1;}
   },{decoderConfig:{description:Uint8Array.of(0x11,0x90)}});
  }
  close(){this.closed=true;}
 }
 class OfflineAudioContext{
  async decodeAudioData(){
   if(onDecode)onDecode();
   const planes=[new Float32Array(calibration.frameCount),new Float32Array(calibration.frameCount)];
   if(!silent)for(const frame of instances.at(-1).frames)for(let c=0;c<2;c++)for(let i=0;i<1024;i++){
    const at=Math.round(frame.timestamp*48000/1e6)+i+(c?secondDelay:delay);
    if(at<planes[c].length)planes[c][at]=frame.data[c*1024+i];
   }
   return {sampleRate:48000,numberOfChannels:2,getChannelData:c=>planes[c]};
  }
 }
 vm.runInNewContext(readFileSync(new URL('../plugins/animus-video-export/src/aac.js',import.meta.url),'utf8'),{
  exports,Uint8Array,Float32Array,WeakMap,Map,JSON,Math,
  require(){return {muxAudio(sound){
   calibration=sound;assert.equal(sound.primingFrames,0);assert.equal(sound.frameCount,sound.samples.length*1024);
   return new Uint8Array(8);
  }};}
 });
 return {measure:exports.measure,root:{AudioEncoder,AudioData,OfflineAudioContext},instances,frames,encoded};
}

test('AAC calibration measures actual delay, including zero and non-packet-aligned native priming',async()=>{
 for(const delay of [0,1024,2112,4096]){
  const f=fixture({delay});
  assert.equal(await f.measure(f.root,config),delay);
  assert.equal(f.instances.length,1);assert.equal(f.instances[0].closed,true);
  assert.ok(f.frames.every(frame=>frame.closed));assert.equal(f.frames.length,32,'bounded calibration duration');
 }
});

test('AAC timing cache is scoped to exact encoder configuration and retains only reliable results',async()=>{
 const f=fixture();
 assert.equal(await f.measure(f.root,config),2112);
 assert.equal(await f.measure(f.root,{...config}),2112);
 assert.equal(f.instances.length,1,'same config reuses measured timing');
 assert.equal(await f.measure(f.root,{...config,bitrate:128000}),2112);
 assert.equal(f.instances.length,2,'different encoder configuration is calibrated separately');
 await assert.rejects(f.measure(f.root,config,{cancelled:()=>true}),/cancelled/);
});

test('AAC calibration rejects missing or inconsistent probes and closes the encoder',async()=>{
 for(const options of [{silent:true},{secondDelay:2113}]){
  const f=fixture(options);
  await assert.rejects(f.measure(f.root,config),/AAC timing calibration/);
  assert.equal(f.instances[0].closed,true);
  await assert.rejects(f.measure(f.root,config),/AAC timing calibration/);
  assert.equal(f.instances.length,2,'unreliable calibration is never cached');
 }
 let cancel=false;const f=fixture({onDecode(){cancel=true;}});
 await assert.rejects(f.measure(f.root,config,{cancelled:()=>cancel}),/cancelled/);
 assert.equal(f.instances[0].closed,true);
});
