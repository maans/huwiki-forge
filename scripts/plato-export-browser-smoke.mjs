import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {assembleHtml,loadEdition} from '../assembler/assemble.mjs';

// Exercise the actual Turn Around audience player, embedded recordings,
// Danish captions and live mixer. No replacement music, voice or codec.
const root=new URL('../',import.meta.url),out=new URL('../test-results/plato-export/',import.meta.url);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core to run the Turn Around export browser check');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');
 try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const path of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(path);executablePath=path;break;}catch(_){}
const {manifest,tiddlers}=await loadEdition('http://localhost/editions/turn-around/manifest.json',async url=>{
 const file=new URL(new URL(url).pathname.slice(1),root),value=JSON.parse(await readFile(file,'utf8'));
 return {ok:true,json:async()=>value};
});
const initial=new Map(tiddlers.map(t=>[t.title,t]));
for(const t of [
 {title:'$:/language',text:'$:/languages/da-DK'},
 {title:'$:/DefaultTiddlers',text:'[[Turn Around]]'},
 {title:'$:/StoryList',list:'[[Turn Around]]',text:''},
 {title:'$:/config/huwiki/animus/caption-language',text:'da'}
])initial.set(t.title,t);
const html=assembleHtml(await readFile(new URL('core/empty.html',root),'utf8'),[...initial.values()]);
await mkdir(out,{recursive:true});
// Keep an editable, self-contained test wiki with the evidence so the same
// reviewed build can be opened on iPad without replacing the public demo.
await writeFile(new URL('turn-around-export-test.html',out),html);
const server=createServer((req,res)=>{
 if(req.url==='/'||req.url==='/turn-around.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
 }else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}
 else{res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`,errors=[],checks=[],skipped=[],externalRequests=[];
const mp4Verification={video:false,mixedAudio:false,codecs:null};
let browser,context,page;
function passed(name){checks.push(name);console.log('PASS '+name);}
function zipFiles(bytes){
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 assert.ok(end>=0,'valid ZIP directory');
 const files=new Map(),count=bytes.readUInt16LE(end+10);let at=bytes.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  assert.equal(bytes.readUInt32LE(at),0x02014b50);
  const method=bytes.readUInt16LE(at+10),size=bytes.readUInt32LE(at+20),length=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28);
  const name=bytes.toString('utf8',at+46,at+46+nameLength),local=bytes.readUInt32LE(at+42);
  assert.equal(bytes.readUInt32LE(local),0x04034b50);
  const dataStart=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),packed=bytes.subarray(dataStart,dataStart+size);
  assert.ok(method===0||method===8);const data=method===8?inflateRawSync(packed):packed;
  assert.equal(data.length,length);files.set(name,data);
  at+=46+nameLength+bytes.readUInt16LE(at+30)+bytes.readUInt16LE(at+32);
 }
 return files;
}
function pcm(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 let format,data;
 for(let at=12;at+8<=bytes.length;){
  const name=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+size);
  assert.equal(chunk.length,size);if(name==='fmt ')format=chunk;if(name==='data')data=chunk;at+=8+size+(size%2);
 }
 assert.ok(format&&data);assert.equal(format.readUInt16LE(0),1);
 const channels=format.readUInt16LE(2),sampleRate=format.readUInt32LE(4),bits=format.readUInt16LE(14),bytesPerSample=bits/8;
 assert.equal(channels,2);assert.equal(sampleRate,48000);assert.ok(bits===16||bits===24);
 const samples=new Float64Array(data.length/bytesPerSample);let square=0,max=0;
 for(let i=0;i<samples.length;i++){
  const value=data.readIntLE(i*bytesPerSample,bytesPerSample)/Math.pow(2,bits-1);
  samples[i]=value;square+=value*value;max=Math.max(max,Math.abs(value));
 }
 return {samples,channels,sampleRate,bits,frames:samples.length/channels,rms:Math.sqrt(square/samples.length),peak:max};
}
try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.route('https://**/*',route=>{externalRequests.push(route.request().url());return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{errors.push('Unexpected '+dialog.type()+': '+dialog.message());await dialog.dismiss();});
 await page.goto(base+'/turn-around.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);
 const player=page.locator('.plato-player').first();
 await player.locator('.plato-options .huw-video-export-button').waitFor();
 assert.equal(await player.locator('.huw-video-export-button').count(),1,'one export action on the actual audience player');
 const timeline=await player.evaluate(host=>host._platoPlayer.getTimeline());
 assert.ok(timeline.duration>480&&timeline.duration<482,'the complete 8-minute performance is loaded');
 assert.ok(timeline.audioClips.some(clip=>clip.kind==='music')&&timeline.audioClips.some(clip=>clip.kind==='speech')&&timeline.audioClips.some(clip=>clip.kind==='sfx'));
 await player.locator('select[data-huw-animus-captions="language"]').selectOption('da');
 await player.locator('.plato-scrub').evaluate(input=>{
  input.value='12.34';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 const savedTime=await player.evaluate(host=>host._platoPlayer.time());
 const savedScene=await player.locator('.plato-chapters').inputValue();
 passed('actual Turn Around audience player exposes one export button and the canonical recorded timeline');

 if(process.env.ANIMUS_SKIP_HEADLESS_FULLSCREEN==='1'){
  // The macOS CI runner supplies real native codecs, but its headless window
  // cannot enter native fullscreen. Ubuntu retains the strict UI acceptance.
  const reason='fullscreen UI acceptance: headless macOS runner cannot enter native fullscreen; not verified on this runner';
  skipped.push(reason);console.log('SKIP '+reason);
 }else{
  await player.getByRole('button',{name:'Show the performance in full screen',exact:true}).click();
  await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('.plato-player'));
  await player.locator('.huw-video-export-button').click();
  const fullscreenDialog=player.locator('.huw-video-modal');await fullscreenDialog.waitFor();
  assert.equal(await fullscreenDialog.isVisible(),true,'export dialog is visible in the fullscreen player');
  await fullscreenDialog.locator('.huw-video-close').click();await fullscreenDialog.waitFor({state:'detached'});
  assert.equal(await player.evaluate(host=>document.fullscreenElement===host),true,'closing export preserves fullscreen playback view');
  await player.getByRole('button',{name:'Exit full screen',exact:true}).click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  passed('fullscreen export controls stay visible and clickable without leaving the performance');
 }

 const nativeEncoders=await page.evaluateHandle(()=>({
  VideoEncoder:Object.getOwnPropertyDescriptor(window,'VideoEncoder'),
  AudioEncoder:Object.getOwnPropertyDescriptor(window,'AudioEncoder')
 }));
 // Deliberately remove optional encoders to verify the unsupported path and
 // to prove WAV export does not depend on H.264 or AAC on the same device.
 await page.evaluate(()=>{
  Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true});
  Object.defineProperty(window,'AudioEncoder',{value:undefined,configurable:true});
 });
 await player.locator('.huw-video-export-button').click();
 let dialog=page.locator('.huw-video-modal');await dialog.waitFor();
 assert.equal(await dialog.evaluate(element=>element.parentNode===document.body),true,'normal view keeps its dialog outside the stage');
 await selectFiles(['video']);
 await dialog.locator('.huw-video-audio').selectOption('silent');
 await dialog.locator('.huw-video-range input').nth(0).fill('5');
 await dialog.locator('.huw-video-range input').nth(1).fill('5.1');
 await dialog.locator('.huw-video-primary').click();
 await page.waitForFunction(()=>/Eksportfejl:|Export error:/.test(document.querySelector('.huw-video-status')?.textContent||''));
 assert.match(await dialog.locator('.huw-video-status').innerText(),/H\.264|WebCodecs/);
 assert.equal(await dialog.getByRole('button',{name:'Hent video.mp4',exact:true}).isDisabled(),true,'failed MP4 export produces no misleading download');
 assert.ok(Math.abs((await player.evaluate(host=>host._platoPlayer.time()))-savedTime)<.001);
 await dialog.locator('.huw-video-close').click();await dialog.waitFor({state:'detached'});
 passed('missing H.264 encoder reports a useful error and restores the audience player');

 async function selectFiles(ids){
  for(const id of ['video','music','speech','effects','captions'])await dialog.locator('[data-export-file="'+id+'"]').setChecked(ids.includes(id));
 }
 async function createSelectedFiles(){
  const create=dialog.locator('.huw-video-primary');
  if(await create.isEnabled())await create.click();
  await page.waitForFunction(()=>/Filer klar:|Files ready:|allerede klar|already ready|Eksportfejl:|Export error:/.test(document.querySelector('.huw-video-status')?.textContent||''),null,{timeout:90000});
  const status=await dialog.locator('.huw-video-status').innerText();
  assert.match(status,/Filer klar:|Files ready:|allerede klar|already ready/,'the selected files are ready: '+status);
  assert.doesNotMatch(await create.innerText(),/Opret igen|Create again/i,'the action never invites unnecessary regeneration');
  assert.equal(await create.isDisabled(),true,'all checked files are current');
 }

 async function exportPackage(filename,{start=5,end=10,tracks=['speech','music','effects'],captionText}={}){
  await player.locator('.huw-video-export-button').click();dialog=page.locator('.huw-video-modal');await dialog.waitFor();
  await selectFiles([...tracks,'captions']);
  await dialog.locator('.huw-video-range input').nth(0).fill(String(start));
  await dialog.locator('.huw-video-range input').nth(1).fill(String(end));
  await dialog.locator('.huw-video-fps').selectOption('30');
  await createSelectedFiles();
  for(const name of [...tracks.map(id=>id+'.wav'),'captions.vtt']){
   const button=dialog.getByRole('button',{name:'Hent '+name,exact:true});
   assert.equal(await button.count(),1,name+' has an individual accessible download');
   assert.match(await button.innerText(),/↓/);
  }
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Hent alle valgte filer',exact:true}).click();
  const download=await pending,path=fileURLToPath(new URL(filename,out));await download.saveAs(path);
  const files=zipFiles(await readFile(path)),metadata=JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.deepEqual([...files.keys()].sort(),[...tracks.map(id=>id+'.wav'),'captions.vtt','manifest.json','README.txt'].sort(),'all-files ZIP contains precisely the selected outputs');
  if(filename==='turn-around-original-levels.zip')for(const name of ['speech.wav','captions.vtt']){
   const pendingFile=page.waitForEvent('download');await dialog.getByRole('button',{name:'Hent '+name,exact:true}).click();
   const item=await pendingFile,itemPath=fileURLToPath(new URL('individual-'+name,out));await item.saveAs(itemPath);
   assert.deepEqual(await readFile(itemPath),files.get(name),'individual '+name+' equals its ZIP entry');
  }
  const duration=end-start,frames=Math.ceil(duration*30-1e-8)*1600;
  assert.deepEqual(metadata.sourceRange,{startSeconds:start,endSeconds:end});assert.equal(metadata.video,null);
  assert.equal(metadata.timeline.durationSeconds,frames/48000);assert.equal(metadata.timeline.audioFrames,frames);
  assert.deepEqual(metadata.audio.map(stem=>stem.id).sort(),[...tracks].sort());
  const audio={};
  for(const id of tracks){
   audio[id]=pcm(files.get(id+'.wav'));assert.equal(audio[id].frames,frames,id+' has exact shared duration');
   const record=metadata.audio.find(stem=>stem.id===id);assert.equal(record.startSeconds,0);assert.equal(record.normalized,false);
   assert.equal(record.clippedSamples,0);
   // The original first-scene Foley recording is exactly silent at 5–10 s.
   // Preserve that pause; an audible slice below independently proves that
   // the effects stem still carries its source and follows the Music bus.
   if(id==='effects'&&start===5&&end===10)assert.equal(audio[id].peak,0,'the original Foley pause remains silent');
   else assert.ok(audio[id].rms>1e-5,id+' contains original non-silent audio');
  }
  const captions=files.get('captions.vtt').toString('utf8');
  assert.match(captions,/^WEBVTT\n/);assert.match(captions,/00:00:00\.000 -->/);
  if(captionText)assert.match(captions,captionText);
  else if(start===5&&end===10){
   assert.match(captions,/De kan tale, men de kan hverken dreje hovedet eller bevæge benene\./);
   assert.doesNotMatch(captions,/They can speak, but their necks and legs cannot move/);
  }
  assert.ok(Math.abs((await player.evaluate(host=>host._platoPlayer.time()))-savedTime)<.001,'original timeline cursor restored');
  assert.equal(await player.locator('.plato-chapters').inputValue(),savedScene,'original scene restored');
  assert.equal(await player.getAttribute('data-plato-playing'),'false');
  await page.screenshot({path:fileURLToPath(new URL(filename.replace(/\.zip$/,'.png'),out)),fullPage:false});
  await dialog.locator('.huw-video-close').click();await dialog.waitFor({state:'detached'});
  return {audio,metadata};
 }
 const full=await exportPackage('turn-around-original-levels.zip');
 const fullFoley=await exportPackage('turn-around-foley-original-level.zip',{start:4,end:5,tracks:['effects']});
 passed('real speech, recorded music and an audible Foley slice export separately with Danish captions and common timing; the original Foley pause stays silent');

 await player.getByRole('button',{name:'Adjust sound levels',exact:true}).click();
 for(const [name,value]of [['Speech, volume',.5],['Music, volume',.25]]){
  await player.locator('.plato-level[aria-label="'+name+'"]').evaluate((input,level)=>{
   input.value=String(level);input.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 }
 const reduced=await exportPackage('turn-around-reduced-levels.zip');
 const reducedFoley=await exportPackage('turn-around-foley-reduced-level.zip',{start:4,end:5,tracks:['effects']});
 for(const [id,gain]of [['speech',.5],['music',.25],['effects',.25]]){
  const before=(id==='effects'?fullFoley:full).audio[id],after=(id==='effects'?reducedFoley:reduced).audio[id];
  assert.equal(before.samples.length,after.samples.length);
  let error=0;for(let i=0;i<before.samples.length;i++)error=Math.max(error,Math.abs(after.samples[i]-before.samples[i]*gain));
  assert.ok(error<3/32768,id+' mixer gain is applied exactly once (maximum sample error '+error+')');
 }
 passed('live speech/music mixer levels are applied exactly once, including Foley on the music bus');

 // The performance has a separate Singing fader. Muting spoken dialogue must
 // not mute a sung take, and only selected stems should enter the package.
 async function level(name,value){
  await player.locator('.plato-level[aria-label="'+name+', volume"]').evaluate((input,gain)=>{
   input.value=String(gain);input.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 }
 await level('Speech',0);await level('Music',0);await level('Singing',1);
 const sung=await exportPackage('turn-around-singing.zip',{start:83,end:84,tracks:['speech']});
 await level('Singing',.5);
 const quietSinging=await exportPackage('turn-around-singing-half-level.zip',{start:83,end:84,tracks:['speech']});
 let singingError=0;
 for(let i=0;i<sung.audio.speech.samples.length;i++)singingError=Math.max(singingError,
  Math.abs(quietSinging.audio.speech.samples[i]-sung.audio.speech.samples[i]*.5));
 assert.ok(singingError<3/32768,'Singing gain is independent of the muted Speech and Music buses');
 passed('original sung takes use the voice stem and their own Singing fader without leaking other selected-out stems');

 // Restore the real browser encoders. The negative-path test above must never
 // turn a supported machine into an apparent unsupported one for the real test.
 await page.evaluate(descriptors=>{
  for(const [name,descriptor]of Object.entries(descriptors)){
   if(descriptor)Object.defineProperty(window,name,descriptor);else delete window[name];
  }
 },nativeEncoders);await nativeEncoders.dispose();
 mp4Verification.codecs=await page.evaluate(async()=>{
  const result={h264:false,aac:false};
  if(window.VideoEncoder&&window.VideoFrame)for(const codec of ['avc1.4d401f','avc1.42e01f']){
   try{
    const supported=await VideoEncoder.isConfigSupported({codec,width:1280,height:720,bitrate:5000000,framerate:30,
     latencyMode:'realtime',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}});
    if(supported.supported){result.h264=true;break;}
   }catch(_){}
  }
  if(window.AudioEncoder&&window.AudioData)try{
   result.aac=!!(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})).supported;
  }catch(_){}
  return result;
 });
 if(mp4Verification.codecs.h264){
  // Count actual native encoders without replacing encoding behavior. The
  // follow-up file selection below must reuse the completed MP4 byte-for-byte.
  await page.evaluate(()=>{
   const NativeVideoEncoder=window.VideoEncoder;window.__animusNativeVideoEncoders=0;
   window.VideoEncoder=class extends NativeVideoEncoder{
    constructor(...args){super(...args);window.__animusNativeVideoEncoders++;}
   };
  });
  async function exportMovie(withSound){
   await player.locator('.huw-video-export-button').click();dialog=page.locator('.huw-video-modal');await dialog.waitFor();
   await selectFiles(['video']);
   await dialog.locator('.huw-video-audio').selectOption(withSound?'playback':'silent');
   await dialog.locator('.huw-video-captions').selectOption('none');
   await dialog.locator('.huw-video-range input').nth(0).fill('5');
   await dialog.locator('.huw-video-range input').nth(1).fill('10');
   const countBefore=await page.evaluate(()=>window.__animusNativeVideoEncoders);
   await createSelectedFiles();
   const encodedCount=await page.evaluate(()=>window.__animusNativeVideoEncoders);
   assert.equal(encodedCount,countBefore+1,'creating a new movie uses one native video encoder');
   assert.equal(await dialog.getByRole('button',{name:'Hent video.mp4',exact:true}).count(),1,'finished MP4 has its own download arrow');
   const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Hent video.mp4',exact:true}).click();
   const download=await pending,filename=withSound?'turn-around-mixed.mp4':'turn-around-video-only.mp4',path=fileURLToPath(new URL(filename,out));
   await download.saveAs(path);const bytes=await readFile(path);
   assert.equal(bytes.toString('ascii',4,8),'ftyp');assert.ok(bytes.length>1000,'real encoded MP4 payload');
   await dialog.locator('.huw-video-close').click();await dialog.waitFor({state:'detached'});
   await player.locator('.huw-video-export-button').click();dialog=page.locator('.huw-video-modal');await dialog.waitFor();
   assert.equal(await dialog.locator('.huw-video-audio').inputValue(),withSound?'playback':'silent','close/reopen retains movie audio setting');
   assert.equal(await dialog.getByRole('button',{name:'Hent video.mp4',exact:true}).isEnabled(),true,'close/reopen retains the finished movie');
   await dialog.locator('[data-export-file="captions"]').check();
   if(withSound)await dialog.locator('[data-export-file="music"]').check();
   await createSelectedFiles();
   assert.equal(await page.evaluate(()=>window.__animusNativeVideoEncoders),encodedCount,'adding VTT/WAV does not encode the movie again');
   assert.equal(await dialog.getByRole('button',{name:'Hent captions.vtt',exact:true}).isEnabled(),true,'the new selected caption file is downloadable');
   const pendingBundle=page.waitForEvent('download');await dialog.getByRole('button',{name:'Hent alle valgte filer',exact:true}).click();
   const allDownload=await pendingBundle,allPath=fileURLToPath(new URL(filename.replace(/\.mp4$/,'.zip'),out));await allDownload.saveAs(allPath);
   const allFiles=zipFiles(await readFile(allPath));assert.deepEqual([...allFiles.keys()].sort(),
    (withSound?['README.txt','captions.vtt','manifest.json','music.wav','video.mp4']:['captions.vtt','video.mp4']).sort());
   assert.deepEqual(allFiles.get('video.mp4'),bytes,'all-files saves the completed movie without re-encoding');
   assert.match(allFiles.get('captions.vtt').toString('utf8'),/De kan tale, men de kan hverken dreje hovedet eller bevæge benene\./);
   if(withSound){
    assert.ok(pcm(allFiles.get('music.wav')).rms>1e-5,'new music.wav contains the original recorded music');
    assert.equal(JSON.parse(allFiles.get('manifest.json')).video.audio,true,'package metadata accurately says the reused MP4 still contains playback audio');
   }
   // The native decoder must open and seek the actual downloaded file. Merely
   // detecting VideoEncoder or inspecting an MP4 header is not export proof.
   const decoded=await page.evaluate(async ({data,withSound})=>{
    const video=document.createElement('video');video.muted=true;video.preload='auto';
    const url=URL.createObjectURL(new Blob([new Uint8Array(data)],{type:'video/mp4'}));
    try{
     await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Exported MP4 decoding timed out')),15000);
      video.onloadeddata=()=>{clearTimeout(timer);resolve();};
      video.onerror=()=>{clearTimeout(timer);reject(Error('Exported MP4 cannot be decoded: '+(video.error&&video.error.message)));};
      video.src=url;video.load();
     });
     await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Exported MP4 seek timed out')),15000);
      video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=2.5;
     });
     const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
     const context=canvas.getContext('2d');context.drawImage(video,0,0);
     const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let min=765,max=0;
     for(let i=0;i<pixels.length;i+=400){const value=pixels[i]+pixels[i+1]+pixels[i+2];min=Math.min(min,value);max=Math.max(max,value);}
     let sound=null;
     if(withSound){
      const context=new OfflineAudioContext(2,1,48000),buffer=await context.decodeAudioData(new Uint8Array(data).buffer);
      let square=0,count=0;
      for(let channel=0;channel<buffer.numberOfChannels;channel++)for(const sample of buffer.getChannelData(channel)){square+=sample*sample;count++;}
      sound={sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,duration:buffer.duration,rms:Math.sqrt(square/count)};
     }
     return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,seek:video.currentTime,pixelRange:max-min,sound};
    }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
   },{data:Array.from(bytes),withSound});
   assert.equal(decoded.width,1280);assert.equal(decoded.height,720);assert.ok(Math.abs(decoded.duration-5)<1/30);
   assert.ok(decoded.pixelRange>20,'the downloaded film contains the rendered Plato scene, not a flat frame');
   if(withSound){
    assert.equal(decoded.sound.channels,2);assert.equal(decoded.sound.sampleRate,48000);
    assert.ok(Math.abs(decoded.sound.duration-5)<.05,'decoded AAC duration stays within one AAC packet of the clip');
    assert.ok(decoded.sound.rms>1e-5,'the downloaded MP4 decodes real non-silent soundtrack samples');
   }
   await writeFile(new URL(filename+'.json',out),JSON.stringify(decoded,null,2)+'\n');
   assert.ok(Math.abs((await player.evaluate(host=>host._platoPlayer.time()))-savedTime)<.001);
   await dialog.locator('.huw-video-close').click();await dialog.waitFor({state:'detached'});
  }
  await exportMovie(false);mp4Verification.video=true;
  passed('native H.264 export from the actual Plato scene downloads and decodes at 720p with exact clip duration');
  if(mp4Verification.codecs.aac){
   await level('Speech',1);await level('Singing',1);await level('Music',1);
   await exportMovie(true);mp4Verification.mixedAudio=true;
   passed('native H.264/AAC MP4 retains playback audio with WAV boxes off; adding music.wav and VTT after close/reopen reuses the exact finished movie');
  }else console.log('UNVERIFIED native AAC export: this browser has no supported AAC encoder.');
 }else console.log('UNVERIFIED native MP4 export: this browser has no supported H.264 encoder; WAV tests remain valid.');

 if(process.env.ANIMUS_REQUIRE_NATIVE_CODECS==='1'){
  assert.equal(mp4Verification.video,true,'this validation job must decode the actual five-second silent film');
  assert.equal(mp4Verification.mixedAudio,true,'this validation job must decode the actual five-second film with its recorded soundtrack');
 }

 assert.deepEqual(externalRequests,[],'Turn Around exports embedded media without external services or a second ABC soundtrack');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 const result={ok:true,editionVersion:manifest.version,checks,skipped,frames:240000,mp4Verification,errors,externalRequests};
 await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){
 let details=null;if(page)try{
  details=await page.evaluate(()=>({status:document.querySelector('.huw-video-status')?.textContent||'',player:document.querySelector('.plato-status')?.textContent||''}));
  await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});
  await writeFile(new URL('failure.html',out),await page.content());
 }catch(_){}
 const result={ok:false,checks,skipped,mp4Verification,errors,details,failure:String(error.stack||error)};
 await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');console.error('PLATO EXPORT FAILURE '+JSON.stringify(result));throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
