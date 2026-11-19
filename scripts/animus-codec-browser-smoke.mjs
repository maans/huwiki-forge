import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Encode known PCM with the browser's real AAC encoder, package its actual
// timestamps with our MP4 muxer, and measure the decoded transient positions.
// No codec is mocked. Linux without AAC reports UNVERIFIED, never a codec pass.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus-codec/',import.meta.url);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core to run the native AniMus codec check');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');
 try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const path of ['/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])try{await access(path);executablePath=path;break;}catch(_){}
const source=await readFile(new URL('plugins/animus-video-export/src/mp4.js',root),'utf8');
const aacSource=await readFile(new URL('plugins/animus-video-export/src/aac.js',root),'utf8');
await mkdir(out,{recursive:true});
const server=createServer((req,res)=>{
 if(req.url==='/mp4.js'){
  res.writeHead(200,{'Content-Type':'text/javascript'});
  res.end('(function(){var exports={};\n'+source+'\nwindow.AniMusMP4=exports;})();');
 }else if(req.url==='/aac.js'){
  res.writeHead(200,{'Content-Type':'text/javascript'});
  res.end('(function(){var exports={};function require(){return window.AniMusMP4;}\n'+aacSource+'\nwindow.AniMusAAC=exports;})();');
 }else{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><html><head><meta charset="utf-8"><script src="/mp4.js"></script><script src="/aac.js"></script></head><body>Native AniMus codec alignment test</body></html>');
 }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port,errors=[];let browser,page;
try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'load'});
 const result=await page.evaluate(async()=>{
  const rate=48000,frames=49600,fps=30,videoFrames=31;
  const audioConfig={codec:'mp4a.40.2',sampleRate:rate,numberOfChannels:2,bitrate:192000};
  const availability={h264:false,aac:false};let videoConfig=null;
  if(window.VideoEncoder&&window.VideoFrame)for(const codec of ['avc1.4d401f','avc1.42e01f'])try{
   const candidate={codec,width:1280,height:720,bitrate:5000000,framerate:fps,latencyMode:'realtime',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}};
   const supported=await VideoEncoder.isConfigSupported(candidate);
   if(supported.supported){videoConfig=supported.config||candidate;availability.h264=true;break;}
  }catch(_){}
  if(window.AudioEncoder&&window.AudioData)try{availability.aac=!!(await AudioEncoder.isConfigSupported(audioConfig)).supported;}catch(_){}
  if(!availability.h264||!availability.aac)return {verified:false,availability,reason:'Native H.264/AAC encoder unavailable on this runner'};
  let issue=null;
  const sound={sampleRate:rate,channels:2,frameCount:frames,duration:frames/rate,bitrate:192000,description:null,samples:[]};
  const video={width:1280,height:720,fps,description:null,samples:[]};
  function collect(target,chunk,metadata){
   const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
   target.samples.push({data,timestamp:chunk.timestamp,key:chunk.type==='key'});
   if(metadata?.decoderConfig?.description)target.description=new Uint8Array(metadata.decoderConfig.description);
  }
  const ae=new AudioEncoder({output:(c,m)=>collect(sound,c,m),error:e=>{issue=e;}});
  const ve=new VideoEncoder({output:(c,m)=>collect(video,c,m),error:e=>{issue=e;}});
  try{
   ae.configure(audioConfig);ve.configure(videoConfig);
   const impulse=(sample,channel)=>(sample===12000&&channel===0||sample===24000&&channel===1||sample===40800)?0.8:0;
   for(let at=0;at<frames;at+=1024){
    const data=new Float32Array(2048);
    for(let c=0;c<2;c++)for(let i=0;i<Math.min(1024,frames-at);i++)data[c*1024+i]=impulse(at+i,c);
    const frame=new AudioData({format:'f32-planar',sampleRate:rate,numberOfFrames:1024,numberOfChannels:2,timestamp:Math.round(at*1e6/rate),data});
    try{ae.encode(frame);}finally{frame.close();}
    while(ae.encodeQueueSize>100&&!issue)await new Promise(r=>setTimeout(r,0));
    if(issue)throw issue;
   }
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const context=canvas.getContext('2d');
   for(let i=0;i<videoFrames;i++){
    context.fillStyle=i<15?'#102030':'#708090';context.fillRect(0,0,1280,720);
    const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
    try{ve.encode(frame,{keyFrame:i===0});}finally{frame.close();}
    while(ve.encodeQueueSize>8&&!issue)await new Promise(r=>setTimeout(r,0));
    if(issue)throw issue;
   }
   await ae.flush();await ve.flush();if(issue)throw issue;
   if(video.samples.length!==videoFrames||video.samples.some((s,i)=>Math.abs(s.timestamp-Math.round(i*1e6/fps))>1))throw Error('Native H.264 did not preserve the requested frame order/count');
   sound.primingFrames=await window.AniMusAAC.measure(window,audioConfig);
   const bytes=window.AniMusMP4.mux(video,sound);
   const decoded=await new OfflineAudioContext(2,1,rate).decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
   const probes=[{channel:0,expected:12000},{channel:1,expected:24000},{channel:0,expected:40800}].map(probe=>{
    const values=decoded.getChannelData(probe.channel);let peak=0,at=-1;
    for(let i=Math.max(0,probe.expected-6000);i<Math.min(values.length,probe.expected+6000);i++)if(Math.abs(values[i])>peak){peak=Math.abs(values[i]);at=i;}
    return {...probe,observed:at,errorSamples:at-probe.expected,amplitude:peak};
   });
   let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
   return {verified:true,availability,bytes:btoa(binary),frameCount:frames,videoFrames,firstAudioTimestamp:sound.samples[0]?.timestamp,measuredPrimingFrames:sound.primingFrames,
    encodedAudioPackets:sound.samples.length,decoded:{frames:decoded.length,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels,duration:decoded.duration},probes};
  }finally{try{ae.close();}catch(_){}try{ve.close();}catch(_){}}
 });
 const mp4=result.bytes?Buffer.from(result.bytes,'base64'):null;delete result.bytes;
 if(mp4)await writeFile(new URL('native-alignment.mp4',out),mp4);
 if(!result.verified){
  await writeFile(new URL('result.json',out),JSON.stringify({...result,ok:true,errors},null,2)+'\n');
  console.log('UNVERIFIED native codec alignment: '+result.reason+' '+JSON.stringify(result.availability));
  if(process.env.ANIMUS_REQUIRE_NATIVE_CODECS==='1')throw Error('This validation job requires real H.264 and AAC encoders');
 }else{
  // Persist diagnostic positions before asserting so an encoder's hidden
  // priming remains inspectable even when this gate correctly rejects it.
  await writeFile(new URL('result.json',out),JSON.stringify({...result,ok:false,errors},null,2)+'\n');
  assert.equal(result.decoded.channels,2);assert.equal(result.decoded.sampleRate,48000);
  assert.ok(Math.abs(result.decoded.frames-result.frameCount)<=1024,'native decoder returns the whole cut with at most one padded AAC packet');
  for(const probe of result.probes){
   assert.ok(probe.amplitude>.1,'the real AAC signal retains each test transient');
   assert.ok(Math.abs(probe.errorSamples)<=48,'native AAC hidden priming shifted channel '+probe.channel+' transient by '+probe.errorSamples+' samples');
  }
  if(['ffmpeg','ffprobe'].every(name=>spawnSync(name,['-version'],{stdio:'ignore'}).status===0)){
   const path=fileURLToPath(new URL('native-alignment.mp4',out));
   const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,start_time,duration','-of','json',path],{encoding:'utf8'});
   assert.equal(probe.status,0,probe.stderr);result.ffprobe=JSON.parse(probe.stdout);
   for(const stream of result.ffprobe.streams){assert.equal(Number(stream.start_time),0);assert.ok(Math.abs(Number(stream.duration)-result.frameCount/48000)<1/48000);}
   const decode=spawnSync('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','-'],{maxBuffer:8*1024*1024});
   assert.equal(decode.status,0,decode.stderr?.toString());const pcm=decode.stdout;
   result.ffmpegProbes=result.probes.map(({channel,expected})=>{
    let amplitude=0,observed=-1;
    for(let i=Math.max(0,expected-6000);i<Math.min(pcm.length/8,expected+6000);i++){
     const value=Math.abs(pcm.readFloatLE(i*8+channel*4));if(value>amplitude){amplitude=value;observed=i;}
    }
    assert.ok(Math.abs(observed-expected)<=48,'independent decoder confirms AAC alignment, observed shift '+(observed-expected));
    return {channel,expected,observed,errorSamples:observed-expected,amplitude};
   });
  }
  assert.deepEqual(errors,[]);
  const report={...result,ok:true,errors};await writeFile(new URL('result.json',out),JSON.stringify(report,null,2)+'\n');
  console.log('PASS native AAC impulses remain at 250, 500 and 850 ms after MP4 mux/decode');console.log(JSON.stringify(report));
 }
}catch(error){
 await writeFile(new URL('failure.json',out),JSON.stringify({ok:false,errors,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
