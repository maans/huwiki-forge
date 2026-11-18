import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {assembleHtml,loadEdition} from '../assembler/assemble.mjs';

// An end-to-end audio export check, deliberately independent of the CutOut
// gesture acceptance test and the host's optional H.264/AAC encoders.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus-stems/',import.meta.url);
const projectTitle='AniMus stems CI',startSeconds=1,endSeconds=2.01,fps=30,rate=48000;
const expectedFrames=Math.ceil((endSeconds-startSeconds)*fps)*(rate/fps);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core to run the AniMus stems browser check');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');
 try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const path of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(path);executablePath=path;break;}catch(_){}

const {manifest,tiddlers}=await loadEdition('http://localhost/editions/animus/manifest.json',async url=>{
 const file=new URL(new URL(url).pathname.slice(1),root);
 const value=JSON.parse(await readFile(file,'utf8'));return {ok:true,json:async()=>value};
});
const initial=new Map(tiddlers.map(t=>[t.title,t]));
for(const t of [
 {title:'$:/language',text:'$:/languages/da-DK'},
 {title:'$:/DefaultTiddlers',text:'[[AniMus Forge I · Start]]'},
 {title:'$:/StoryList',list:'[[AniMus Forge I · Start]]',text:''},
 {title:'$:/config/huwiki/abc/audio-engine-mode',text:'original'}
])initial.set(t.title,t);
const html=assembleHtml(await readFile(new URL('core/empty.html',root),'utf8'),[...initial.values()]);
await mkdir(out,{recursive:true});

function fixtureWav({seconds,frequency=440,amplitude=6000,soundStart=0,soundEnd=seconds}){
 const n=Math.round(seconds*rate),data=Buffer.alloc(44+n*2);
 data.write('RIFF');data.writeUInt32LE(36+n*2,4);data.write('WAVE',8);
 data.write('fmt ',12);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
 data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write('data',36);data.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++){
  const t=i/rate,fade=Math.max(0,Math.min(1,(t-soundStart)/.004,(soundEnd-t)/.004));
  data.writeInt16LE(Math.round(amplitude*Math.sin(t*frequency*2*Math.PI)*fade),44+i*2);
 }
 return data;
}
// A source offset of 0.25 s is necessary to reach the voice, so silently
// ignoring clip offsets cannot accidentally pass this test.
const voiceWav=fixtureWav({seconds:1,frequency:660,soundStart:.25,soundEnd:.45});
const instrumentWav=fixtureWav({seconds:.12,frequency:220,amplitude:4800});
const server=createServer((req,res)=>{
 if(req.url==='/'||req.url==='/animus.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
 }else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}
 else{res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base=`http://127.0.0.1:${server.address().port}`;
const errors=[],checks=[],sampleRequests=[];
let browser,context,page;
function passed(name){checks.push(name);console.log('PASS '+name);}

// Read the downloaded ZIP independently of the export implementation,
// including central-directory sizes and each entry's CRC.
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function unzip(bytes){
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 assert.ok(end>=0,'download has a ZIP central directory');
 const count=bytes.readUInt16LE(end+10),entries=new Map();let at=bytes.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  assert.equal(bytes.readUInt32LE(at),0x02014b50,'valid central directory record');
  const method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),compressed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24);
  const nameLength=bytes.readUInt16LE(at+28),extraLength=bytes.readUInt16LE(at+30),commentLength=bytes.readUInt16LE(at+32),local=bytes.readUInt32LE(at+42);
  const name=bytes.toString('utf8',at+46,at+46+nameLength);
  assert.equal(bytes.readUInt32LE(local),0x04034b50,'valid local record for '+name);
  const dataStart=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  assert.ok(dataStart+compressed<=bytes.length,'bounded ZIP entry '+name);
  const packed=bytes.subarray(dataStart,dataStart+compressed);
  assert.ok(method===0||method===8,'supported ZIP storage method');
  const data=method===8?inflateRawSync(packed):packed;
  assert.equal(data.length,size,'uncompressed size for '+name);assert.equal(crc32(data),crc,'CRC for '+name);
  assert.ok(!entries.has(name),'unique archive entry '+name);entries.set(name,data);
  at+=46+nameLength+extraLength+commentLength;
 }
 return entries;
}
function readPcmWav(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'RIFF size matches the actual file');
 let format,data;
 for(let at=12;at+8<=bytes.length;){
  const type=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+size);
  assert.equal(chunk.length,size,'bounded '+type+' WAV chunk');
  if(type==='fmt ')format=chunk;if(type==='data')data=chunk;at+=8+size+(size%2);
 }
 assert.ok(format&&data,'WAV has format and PCM chunks');
 const code=format.readUInt16LE(0),channels=format.readUInt16LE(2),sampleRate=format.readUInt32LE(4),align=format.readUInt16LE(12),bits=format.readUInt16LE(14);
 assert.equal(code,1,'integer PCM');assert.equal(channels,2);assert.equal(sampleRate,rate);assert.ok(bits===16||bits===24);
 assert.equal(align,channels*bits/8);assert.equal(format.readUInt32LE(8),rate*align);
 assert.equal(data.length%align,0);const frames=data.length/align,samples=new Float64Array(frames*channels);
 for(let i=0;i<samples.length;i++)samples[i]=data.readIntLE(i*bits/8,bits/8)/Math.pow(2,bits-1);
 return {channels,sampleRate,bits,frames,samples};
}
function rms(wav,start,end){
 const from=Math.max(0,Math.round(start*rate))*wav.channels,to=Math.min(wav.frames,Math.round(end*rate))*wav.channels;
 let sum=0;for(let i=from;i<to;i++)sum+=wav.samples[i]*wav.samples[i];return Math.sqrt(sum/Math.max(1,to-from));
}
function peak(wav,start=0,end=wav.frames/rate){
 const from=Math.max(0,Math.round(start*rate))*wav.channels,to=Math.min(wav.frames,Math.round(end*rate))*wav.channels;
 let max=0;for(let i=from;i<to;i++)max=Math.max(max,Math.abs(wav.samples[i]));return max;
}
async function download(button,file){
 const pending=page.waitForEvent('download');await button.click();const result=await pending;
 const path=fileURLToPath(new URL(file,out));await result.saveAs(path);return readFile(path);
}

try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.route('https://**/*',route=>{
  const url=route.request().url();
  if(/midi-js-soundfonts\/abcjs\//.test(url)){
   sampleRequests.push(url);return route.fulfill({status:200,contentType:'audio/wav',body:instrumentWav});
  }
  return route.abort();
 });
 page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{errors.push('Unexpected '+dialog.type()+': '+dialog.message());await dialog.dismiss();});
 await page.goto(base+'/animus.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.huw-animus-new-project input'));
 await page.locator('.huw-animus-new-project input').fill(projectTitle);
 await page.locator('.huw-animus-new-project button').click();
 const show=page.locator('.tc-tiddler-frame[data-tiddler-title="'+projectTitle+'"]');
 await show.locator('.huw-musical-play:enabled').waitFor();
 const originalHost=await show.locator('.huw-musical').elementHandle();
 await page.evaluate(({title,voice})=>{
  const fields=$tw.wiki.getTiddler(title).fields,filmTiddler=$tw.wiki.getTiddler(fields['animus-scene']);
  const film=JSON.parse(filmTiddler.fields.text),stageTitle=film.scenes[0].source,stageTiddler=$tw.wiki.getTiddler(stageTitle),stage=JSON.parse(stageTiddler.fields.text);
  const key=(t,x,opacity=1)=>({t,x,y:170,r:0,sx:1,sy:1,opacity,easing:'linear'});
  stage.parts=[
   {id:'stem-test-box',name:'Export fixture',type:'rect',parent:null,geo:{x:0,y:0,w:90,h:60},fill:'#27556b',keys:[key(0,80),key(4,580)]},
   {id:'spoken-0',name:'Caption',type:'text',parent:null,geo:{},text:'STEM TEST: Stemmer og musik hver for sig.',fontSize:18,fill:'#fff',align:'middle',keys:[
    {...key(0,400,0),easing:'step'}, {...key(.9,400,1),easing:'step'}, {...key(1.7,400,0),easing:'step'}
   ]}
  ];
  film.musical.songs[0].volume=.5;
  film.musical.audioClips=[{id:'stem-test-voice',name:'Speech offset fixture',asset:'AniMus stems CI · voice.wav',start:1.5,offset:.25,duration:.2,sourceDuration:1,volume:.6,muted:false}];
  film.musical.sfx=[{id:'tail',t:.95,type:'bell',duration:.15,volume:.4},{id:'late',t:1.85,type:'bell',duration:.15,volume:.4}];
  $tw.wiki.addTiddler(new $tw.Tiddler({title:'AniMus stems CI · voice.wav',type:'audio/wav',text:voice}));
  $tw.wiki.addTiddler(new $tw.Tiddler(stageTiddler,{text:JSON.stringify(stage)}));
  $tw.wiki.addTiddler(new $tw.Tiddler(filmTiddler,{text:JSON.stringify(film)}));
  $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(fields['animus-score']),{
   'abc-source':'X:1\nT:Stems fixture\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nz2 C/2 z3/2 | C z3 |',
   'abc-accompaniment':'{"enabled":false}'
  }));
 },{title:projectTitle,voice:voiceWav.toString('base64')});
 await page.waitForFunction(element=>!element.isConnected,originalHost);
 await show.locator('.huw-musical-play:enabled').waitFor();
 await show.locator('[data-cutout-id="stem-test-box"]').waitFor();
 await show.locator('.huw-musical-range').evaluate(input=>{input.value='.35';input.dispatchEvent(new Event('input',{bubbles:true}));});
 const savedTime=Number(await show.locator('.huw-musical-range').inputValue());
 const savedTransform=await show.locator('[data-cutout-id="stem-test-box"]').first().getAttribute('transform');
 passed('loads real AniMus/ABC player with isolated music, trimmed speech, effects and captions');

 // No fake encoder is used: the codec globals are absent while real Web
 // Audio decodes the fixture and renders the three independent stems.
 await page.evaluate(()=>{
  Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true});
  Object.defineProperty(window,'AudioEncoder',{value:undefined,configurable:true});
 });
 await show.locator('.huw-video-export-button').click();
 const dialog=page.locator('.huw-video-modal');await dialog.waitFor();
 await dialog.locator('.huw-video-mode').selectOption('stems');
 await dialog.locator('.huw-video-range input').nth(0).fill(String(startSeconds));
 await dialog.locator('.huw-video-range input').nth(1).fill(String(endSeconds));
 await dialog.locator('select').filter({has:page.locator('option[value="30"]')}).selectOption('30');
 await dialog.locator('.huw-video-primary').click();
 await page.waitForFunction(()=>/Lydpakke klar:|Audio package ready:|Eksportfejl:|Export error:/.test(document.querySelector('.huw-video-status')?.textContent||''),null,{timeout:60000});
 const status=await dialog.locator('.huw-video-status').innerText();
 assert.match(status,/Lydpakke klar:|Audio package ready:/,'actual WAV package export succeeds without video/audio encoders: '+status);
 assert.ok(sampleRequests.length>0,'real ABCJS synthesis requested the original sample bank');
 passed('WAV-only export works with H.264 and AAC encoders absent');

 const archive=await download(dialog.locator('.huw-video-download'),'animus-stems-smoke.zip'),files=unzip(archive);
 assert.deepEqual([...files.keys()].sort(),['README.txt','captions.vtt','effects.wav','manifest.json','music.wav','speech.wav'].sort());
 const packageData=JSON.parse(files.get('manifest.json').toString('utf8'));
 assert.equal(packageData.format,'animus-editing-bundle');assert.equal(packageData.video,null);
 assert.deepEqual(packageData.sourceRange,{startSeconds,endSeconds});
 assert.equal(packageData.timeline.startSeconds,0);assert.equal(packageData.timeline.frameRate,fps);
 assert.equal(packageData.timeline.videoFrames,31);assert.equal(packageData.timeline.sampleRate,rate);
 assert.equal(packageData.timeline.audioFrames,expectedFrames);
 assert.ok(Math.abs(packageData.timeline.durationSeconds-expectedFrames/rate)<1e-9);
 assert.ok(Math.abs(packageData.timeline.endPaddingSeconds-(expectedFrames/rate-(endSeconds-startSeconds)))<1e-9);
 const stems=Object.fromEntries(['music','speech','effects'].map(id=>[id,readPcmWav(files.get(id+'.wav'))]));
 for(const [id,wav] of Object.entries(stems)){
  assert.equal(wav.frames,expectedFrames,id+' has the common frame-aligned duration');
  const metadata=packageData.audio.find(item=>item.id===id);assert.ok(metadata,'manifest lists '+id);
  assert.equal(metadata.file,id+'.wav');assert.equal(metadata.startSeconds,0);assert.equal(metadata.sampleRate,rate);
  assert.equal(metadata.frames,wav.frames);assert.equal(metadata.channels,wav.channels);assert.equal(metadata.bitsPerSample,wav.bits);
  assert.equal(metadata.normalized,false);assert.equal(metadata.clippedSamples,0);
  assert.equal(peak(wav,1.015,expectedFrames/rate),0,id+' padding after the requested end is silent');
 }
 assert.match(files.get('README.txt').toString('utf8'),/same|SAME/);
 passed('downloaded ZIP and PCM headers are valid; stems share zero and 49,600 audio frames');

 assert.ok(rms(stems.music,.015,.08)>1e-4,'ABC music at the selected range start is audible');
 assert.ok(rms(stems.music,.5,.8)<1e-5,'speech does not leak into the music stem');
 assert.ok(rms(stems.speech,.05,.45)<1e-5,'speech retains its leading silence');
 assert.ok(rms(stems.speech,.53,.66)>.03,'trimmed voice offset contains the expected speech');
 assert.ok(rms(stems.speech,.75,1)<1e-5,'music and effects do not leak into speech');
 assert.ok(Math.abs(peak(stems.speech)-6000/32768*.6)<.002,'speech keeps its original 0.6 gain without normalization');
 assert.ok(rms(stems.effects,.005,.045)>1e-4,'an effect that began before the clip retains its carry-in tail');
 assert.ok(rms(stems.effects,.35,.7)<1e-5,'music and speech do not leak into effects');
 assert.ok(rms(stems.effects,.88,.94)>1e-4,'late effect has the expected local offset');
 passed('audio content is isolated, source offsets/gains are preserved and pre-cut effects keep their tails');

 const captions=files.get('captions.vtt').toString('utf8');
 assert.match(captions,/^WEBVTT\n/);assert.match(captions,/00:00:00\.000 --> 00:00:00\.700/);
 assert.match(captions,/Stemmer og musik hver for sig\./);
 assert.equal(packageData.captions.startSeconds,0);assert.equal(packageData.captions.directLumaFusionImportVerified,false);
 passed('captions spanning the cut start are rebased to the same local zero');

 const speechButton=dialog.locator('.huw-video-files button').filter({hasText:'speech.wav'});
 assert.equal(await speechButton.count(),1,'individual speech file is available');
 const directSpeech=await download(speechButton,'speech-individual.wav');
 assert.deepEqual(directSpeech,files.get('speech.wav'),'individual download matches the ZIP entry');
 assert.ok(Math.abs(Number(await show.locator('.huw-musical-range').inputValue())-savedTime)<.001,'player position restored');
 assert.equal(await show.locator('[data-cutout-id="stem-test-box"]').first().getAttribute('transform'),savedTransform,'stage pose restored');
 await page.screenshot({path:fileURLToPath(new URL('stems-complete.png',out)),fullPage:false});
 await dialog.locator('.huw-video-close').click();await dialog.waitFor({state:'detached'});
 const stoppedTime=await show.locator('.huw-musical-range').inputValue();
 await page.waitForTimeout(120);assert.equal(await show.locator('.huw-musical-range').inputValue(),stoppedTime,'export leaves the player paused');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 passed('individual downloads match the archive and the player returns to its paused original pose');
 const result={ok:true,editionVersion:manifest.version,checks,sampleRequests:sampleRequests.length,archiveBytes:archive.length,frames:expectedFrames,errors};
 await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){
 let details=null;if(page)try{
  details=await page.evaluate(()=>({status:document.querySelector('.huw-video-status')?.textContent||'',player:document.querySelector('.huw-musical-state')?.textContent||''}));
  await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});
  await writeFile(new URL('failure.html',out),await page.content());
 }catch(_){}
 const result={ok:false,checks,errors,details,failure:String(error.stack||error)};
 await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');console.error('STEMS BROWSER FAILURE '+JSON.stringify(result));throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
