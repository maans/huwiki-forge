import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {assembleHtml,loadEdition} from '../assembler/assemble.mjs';

// Exercise the music workshop's real ABCJS controller with native UI input.
// The only substituted input is a deterministic PCM sample bank; transport,
// notation, audio preparation and native Web Audio scheduling are unchanged.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus/score/',import.meta.url);
const projectTitle='AniMus score playback CI',draftTitle='Unsaved audible draft';
const originalMusic='X:1\nT:Saved silent score\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n'+('z4 | '.repeat(12));
const draftMusic='X:1\nT:'+draftTitle+'\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n'+('C D E F | '.repeat(12));
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core to run the score workshop acceptance');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const candidate of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(candidate);executablePath=candidate;break;}catch(_){}
const {manifest,tiddlers}=await loadEdition('http://localhost/editions/animus/manifest.json',async url=>{
 const value=JSON.parse(await readFile(new URL(new URL(url).pathname.slice(1),root),'utf8'));return {ok:true,json:async()=>value};
});
const initial=new Map(tiddlers.map(t=>[t.title,t]));
for(const t of [{title:'$:/language',text:'$:/languages/da-DK'},{title:'$:/DefaultTiddlers',text:'[[AniMus Forge I · Start]]'},
 {title:'$:/StoryList',list:'[[AniMus Forge I · Start]]',text:''},{title:'$:/config/huwiki/abc/audio-engine-mode',text:'original'}])initial.set(t.title,t);
const html=assembleHtml(await readFile(new URL('core/empty.html',root),'utf8'),[...initial.values()]);
await mkdir(out,{recursive:true});
function sampleWav(){
 const rate=16000,n=rate,bytes=Buffer.alloc(44+n*2);bytes.write('RIFF');bytes.writeUInt32LE(36+n*2,4);bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)bytes.writeInt16LE(Math.round(4800*Math.sin(i*440*2*Math.PI/rate)*Math.min(1,i/100,(n-i)/100)),44+i*2);
 return bytes;
}
const sample=sampleWav(),checks=[],errors=[],sampleRequests=[];
const server=createServer((req,res)=>{if(req.url==='/'||req.url==='/animus.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}else{res.writeHead(404);res.end('Not found');}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
let browser,context,page,show,workshop,production,playhead,confirmDiscard=false;
function passed(name){checks.push(name);console.log('PASS '+name);}
async function originals(){return page.evaluate(({scoreTitle,filmTitle})=>({source:$tw.wiki.getTiddler(scoreTitle).fields['abc-source'],film:$tw.wiki.getTiddlerText(filmTitle)}),production);}
async function assertPlayhead(){assert.ok(Math.abs(Number(await show.locator('.huw-musical-range').inputValue())-playhead)<.001,'music workshop actions preserve the film playhead');assert.ok(Math.abs(Number(await show.locator('.huw-musical').getAttribute('data-camera-time'))-playhead)<.001,'music workshop actions preserve the film frame');}
async function openWorkshop(){await show.locator('.huw-musical-score-button').click();workshop=show.locator('.huw-score-workshop');await workshop.locator('.huwabc-edit-workshop').waitFor();await workshop.locator('.huw-score-play:enabled').waitFor();}
async function writeDraft(source){await workshop.locator('.huwabc-code').fill(source);await workshop.locator('.huwabc-code').blur();await page.waitForFunction(text=>$tw.wiki.filterTiddlers('[prefix[$:/temp/animus-score/]]').some(title=>$tw.wiki.getTiddler(title)?.fields['abc-source']===text),source);}
async function phase(value){await page.waitForFunction(value=>document.querySelector('.huw-score-workshop')?.dataset.scorePlayback===value,value);}
async function audioState(){return page.evaluate(()=>({
 controllers:window.__scoreControllers.map((r,index)=>({index,title:r.title,started:!!r.c.isStarted,disposed:!!r.c._disposed,buffer:!!r.c.midiBuffer,engine:r.c.getAudioState?.().engine,percent:Number(r.c.percent)||0})),
 sources:window.__scoreAudioSources.map((r,index)=>({index,ended:r.ended,stopped:r.stopAt!==null&&r.context.currentTime>=r.stopAt,peak:r.peak,time:r.context.currentTime,at:r.at})),
 active:window.__scoreControllers.filter(r=>r.c.isStarted&&!r.c._disposed).length
}));}
async function waitForSound(){await phase('playing');await page.waitForFunction(()=>window.__scoreAudioSources.some(r=>r.peak>1e-4&&!r.ended&&(r.stopAt===null||r.context.currentTime<r.stopAt)&&r.context.currentTime>=r.at));}
async function assertSilent(){await page.waitForFunction(()=>window.__scoreAudioSources.every(r=>r.peak<=1e-4||r.ended||(r.stopAt!==null&&r.context.currentTime>=r.stopAt)));assert.equal((await audioState()).active,0,'no controller continues playing');}

try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1280,height:1000}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.route('https://**/*',route=>{const url=route.request().url();if(/midi-js-soundfonts\/abcjs\//.test(url)){sampleRequests.push(url);return route.fulfill({status:200,contentType:'audio/wav',body:sample});}return route.abort();});
 // Observe native source scheduling without replacing the controller or
 // audio graph. Offline synthesis sources are excluded from live playback.
 await context.addInitScript(()=>{
  window.__scoreAudioSources=[];
  window.__scoreDroneContexts=[];
  const createOscillator=BaseAudioContext.prototype.createOscillator;
  BaseAudioContext.prototype.createOscillator=function(...args){
   const oscillator=createOscillator.apply(this,args);
   if(typeof this.startRendering!=='function'&&!window.__scoreDroneContexts.includes(this))window.__scoreDroneContexts.push(this);
   return oscillator;
  };
  const records=new WeakMap(),proto=AudioBufferSourceNode.prototype,start=proto.start,stop=proto.stop;
  proto.start=function(...args){
   const result=start.apply(this,args);
   if(typeof this.context.startRendering!=='function'){
    let peak=0;if(this.buffer)for(let c=0;c<this.buffer.numberOfChannels;c++){const pcm=this.buffer.getChannelData(c),step=Math.max(1,Math.floor(pcm.length/4096));for(let i=0;i<pcm.length;i+=step)peak=Math.max(peak,Math.abs(pcm[i]));}
    const record={context:this.context,at:Math.max(this.context.currentTime,Number(args[0])||0),peak,stopAt:null,ended:false};records.set(this,record);window.__scoreAudioSources.push(record);this.addEventListener('ended',()=>{record.ended=true;},{once:true});
   }
   return result;
  };
  proto.stop=function(...args){const result=stop.apply(this,args),record=records.get(this);if(record)record.stopAt=Math.max(this.context.currentTime,Number(args[0])||0);return result;};
 });
 page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{if(confirmDiscard&&dialog.type()==='confirm'){confirmDiscard=false;await dialog.accept();}else{errors.push('Unexpected '+dialog.type()+': '+dialog.message());await dialog.dismiss();}});
 await page.goto(base+'/animus.html',{waitUntil:'domcontentloaded'});await page.locator('.huw-animus-new-project input').fill(projectTitle);await page.locator('.huw-animus-new-project button').click();
 show=page.locator('.tc-tiddler-frame[data-tiddler-title="'+projectTitle+'"]');await show.locator('.huw-musical-play:enabled').waitFor();
 const initialHost=await show.locator('.huw-musical').elementHandle();
 production=await page.evaluate(({title,source})=>{
  const fields=$tw.wiki.getTiddler(title).fields,filmTitle=fields['animus-scene'],scoreTitle=fields['animus-score'],t=$tw.wiki.getTiddler(filmTitle),film=JSON.parse(t.fields.text);
  film.duration=80;film.scenes[0].duration=80;film.musical.songs[0].muted=true;
  const stageTiddler=$tw.wiki.getTiddler(film.scenes[0].source),stage=JSON.parse(stageTiddler.fields.text);stage.duration=80;
  $tw.wiki.addTiddler(new $tw.Tiddler(stageTiddler,{text:JSON.stringify(stage)}));
  $tw.wiki.addTiddler(new $tw.Tiddler(t,{text:JSON.stringify(film)}));
  $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(scoreTitle),{'abc-source':source,'abc-accompaniment':'{"enabled":false}'}));
  return {scoreTitle,filmTitle};
 },{title:projectTitle,source:originalMusic});
 await page.waitForFunction(host=>!host.isConnected,initialHost);await show.locator('.huw-musical-play:enabled').waitFor();
 const musicSwitch=show.locator('[data-preview-track="music:A"]');await musicSwitch.click();assert.equal(await musicSwitch.getAttribute('aria-pressed'),'false');
 const seek=show.locator('.huw-musical-range');await seek.scrollIntoViewIfNeeded();const seekBox=await seek.boundingBox();assert.ok(seekBox);await page.mouse.click(seekBox.x+seekBox.width*.75,seekBox.y+seekBox.height/2);playhead=Number(await seek.inputValue());assert.ok(playhead>50&&playhead<70,'the native slider seeks to a nonzero film position near 60 seconds');
 const saved=await originals();assert.equal(saved.source,originalMusic);assert.equal(JSON.parse(saved.film).musical.songs[0].muted,true);
 await page.evaluate(()=>{
  const audio=$tw.modules.execute('$:/plugins/huwiki/abc/audio-controller.js'),install=audio.install;window.__scoreControllers=[];
  audio.install=function(...args){const c=install.apply(this,args),record={c,title:''},setTune=c.setTune;window.__scoreControllers.push(record);c.setTune=function(...values){record.title=values[0]?.metaText?.title||'';return setTune.apply(this,values);};return c;};
 });
 await openWorkshop();await writeDraft(draftMusic);assert.deepEqual(await originals(),saved,'editing the draft preserves the saved score and muted film');
 assert.equal(await workshop.getByRole('button',{name:'Afspil',exact:true}).isVisible(),true);assert.equal(await workshop.locator('.huw-score-stop').isDisabled(),true);
 await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();
 let state=await audioState(),current=state.controllers.findLast(c=>c.title===draftTitle&&!c.disposed);
 assert.ok(current?.started&&current.buffer,'the unsaved draft uses a prepared real controller');assert.equal(current.engine,'original');assert.equal(state.active,1,'only the music workshop is playing');
 assert.equal(await show.locator('.huw-musical').getAttribute('data-playing'),'false');assert.equal(await musicSwitch.getAttribute('aria-pressed'),'false');assert.ok(sampleRequests.length>0,'the existing ABC sample engine supplies the audible draft');
 const timeBefore=state.sources.at(-1).time;await page.waitForFunction(start=>window.__scoreAudioSources.some(r=>r.context.currentTime>start+.2),timeBefore);
 assert.deepEqual(await originals(),saved);await assertPlayhead();await page.screenshot({path:fileURLToPath(new URL('unsaved-music-playing.png',out)),fullPage:false});
 passed('native Play audibly schedules the unsaved ABC draft while the saved score and film music are muted');

 const firstController=current.index;
 await workshop.getByRole('button',{name:'Pause',exact:true}).click();await phase('paused');await assertSilent();await assertPlayhead();
 assert.equal((await audioState()).controllers[firstController].disposed,false,'Pause retains the prepared draft controller');
 await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();state=await audioState();
 assert.equal(state.controllers.findLast(c=>c.title===draftTitle&&!c.disposed).index,firstController,'Resume reuses the same controller');assert.equal(state.active,1);
 await workshop.locator('.huw-score-stop').click();await phase('idle');await assertSilent();state=await audioState();
 assert.ok(state.controllers[firstController].disposed&&!state.controllers[firstController].buffer,'Stop releases the prepared player');
 assert.equal(await workshop.locator('.huw-score-audio-preview,.huw-score-audio-native').count(),0,'Stop removes temporary notation and controller DOM');
 await assertPlayhead();
 passed('native Pause silences sound, Resume reuses the player, and Stop disposes its audio and temporary DOM');

 await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();
 const revisedTitle='Revised unsaved draft',revised=draftMusic.replace(draftTitle,revisedTitle).replace(/C D E F/g,'G A B c');
 await writeDraft(revised);await phase('idle');await assertSilent();
 await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();state=await audioState();
 assert.equal(state.controllers.findLast(c=>c.started&&!c.disposed).title,revisedTitle,'Play uses the latest edited draft');assert.equal(state.active,1);assert.deepEqual(await originals(),saved);
 confirmDiscard=true;await workshop.getByRole('button',{name:'Annuller',exact:true}).click();await workshop.waitFor({state:'detached'});assert.equal(confirmDiscard,false);await assertSilent();
 assert.deepEqual(await originals(),saved,'Cancel preserves the exact original score and film');await assertPlayhead();assert.equal(await page.evaluate(()=>$tw.wiki.filterTiddlers('[prefix[$:/temp/animus-score/]]').length),0);
 assert.ok((await audioState()).controllers.every(c=>c.disposed&&!c.buffer),'closing leaves no old workshop player or buffer');
 passed('editing stops old sound; replay uses the revised unsaved music; Cancel preserves originals and releases the draft');

 await openWorkshop();assert.equal(await workshop.locator('.huwabc-code').inputValue(),originalMusic);await assertSilent();
 await writeDraft(draftMusic);await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();state=await audioState();assert.equal(state.active,1,'reopening never restarts a previous player');
 confirmDiscard=true;await workshop.press('Escape');await workshop.waitFor({state:'detached'});assert.equal(confirmDiscard,false);await assertSilent();assert.deepEqual(await originals(),saved);await assertPlayhead();
 assert.ok((await audioState()).controllers.every(c=>c.disposed&&!c.buffer));passed('reopening starts only one fresh player, and Escape also clears its sound without saving');

 await openWorkshop();await workshop.locator('.huwabc-edit-options > summary').click();
 await workshop.locator('.huwabc-drone-toggle').click();
 await page.waitForFunction(()=>window.__scoreDroneContexts.some(context=>context.state==='running'));
 assert.equal(await workshop.locator('.huwabc-drone-toggle').getAttribute('aria-pressed'),'true');
 assert.deepEqual(await originals(),saved,'the manually started drone changes only the isolated draft');
 confirmDiscard=true;await workshop.getByRole('button',{name:'Annuller',exact:true}).click();await workshop.waitFor({state:'detached'});
 assert.equal(confirmDiscard,false);await page.waitForFunction(()=>window.__scoreDroneContexts.length>0&&window.__scoreDroneContexts.every(context=>context.state==='closed'));
 await assertSilent();assert.deepEqual(await originals(),saved);await assertPlayhead();
 passed('Cancel closes the manually started editor drone AudioContext and preserves the original score');

 const savedMusic=draftMusic.replace(draftTitle,'Saved workshop take');
 await openWorkshop();await writeDraft(savedMusic);await workshop.getByRole('button',{name:'Afspil',exact:true}).click();await waitForSound();
 assert.deepEqual(await originals(),saved,'the playing take remains isolated until Save');await assertPlayhead();
 const hostBeforeSave=await show.locator('.huw-musical').elementHandle(),controllersBeforeSave=(await audioState()).controllers.map(c=>c.index);
 await workshop.getByRole('button',{name:'Gem og tilbage',exact:true}).click();await workshop.waitFor({state:'detached'});
 await page.waitForFunction(host=>!host.isConnected,hostBeforeSave);await show.locator('.huw-musical-play:enabled').waitFor();
 assert.deepEqual(await originals(),{source:savedMusic,film:saved.film},'Save updates the score and preserves the film');
 await assertSilent();await assertPlayhead();assert.equal(await show.locator('.huw-musical').getAttribute('data-playing'),'false','returning from Save leaves the animation paused');
 assert.equal(await page.evaluate(()=>$tw.wiki.filterTiddlers('[prefix[$:/temp/animus-score/]]').length),0,'Save removes the isolated draft');
 assert.equal(await show.locator('.huw-score-audio-preview,.huw-score-audio-native').count(),0,'Save removes temporary playback DOM');
 state=await audioState();assert.ok(controllersBeforeSave.every(index=>state.controllers[index].disposed&&!state.controllers[index].buffer),'Save disposes every previous workshop player and audio buffer');
 passed('native Save and return stores the edited music, releases its playback, and restores the paused animation playhead and frame');
 assert.deepEqual(errors,[],'no uncaught browser errors');await writeFile(new URL('result.json',out),JSON.stringify({ok:true,editionVersion:manifest.version,checks,sampleRequests:sampleRequests.length,audio:await audioState(),errors},null,2)+'\n');console.log('SCORE ACCEPTANCE '+JSON.stringify({ok:true,checks:checks.length}));
}catch(error){
 let details=null;try{details={audio:await audioState(),phase:await workshop?.getAttribute('data-score-playback'),status:await workshop?.locator('.huw-score-playback-status').textContent()};await page?.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,details,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
