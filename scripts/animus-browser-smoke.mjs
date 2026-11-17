import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {assembleHtml,loadEdition} from '../assembler/assemble.mjs';

const root=new URL('../',import.meta.url),out=new URL('../test-results/animus/',import.meta.url);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core to run AniMus browser acceptance');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const path of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(path);executablePath=path;break;}catch(_){}
const {manifest,tiddlers}=await loadEdition('http://localhost/editions/animus/manifest.json',async url=>{
 const file=new URL(new URL(url).pathname.slice(1),root);const value=JSON.parse(await readFile(file,'utf8'));return {ok:true,json:async()=>value};
});
const initial=new Map(tiddlers.map(t=>[t.title,t]));
for(const t of [{title:'$:/language',text:'$:/languages/da-DK'},{title:'$:/DefaultTiddlers',text:'[[AniMus Forge I · Start]]'},{title:'$:/StoryList',list:'[[AniMus Forge I · Start]]',text:''},{title:'$:/config/huwiki/abc/audio-engine-mode',text:'original'}])initial.set(t.title,t);
const html=assembleHtml(await readFile(new URL('core/empty.html',root),'utf8'),[...initial.values()]);
await mkdir(out,{recursive:true});

// Deterministic real PCM data: Chrome decodes both imported dialogue and the
// original ABC sample requests. No network, microphone mock or extra synth.
function wav(seconds=2){const rate=8000,n=Math.round(seconds*rate),data=Buffer.alloc(44+n*2);data.write('RIFF');data.writeUInt32LE(36+n*2,4);data.write('WAVE',8);data.write('fmt ',12);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)data.writeInt16LE(Math.round(2400*Math.sin(i*440*2*Math.PI/rate)*Math.min(1,i/80,(n-i)/80)),44+i*2);return data;}
const voiceWav=wav(2),instrumentWav=wav(.8);
const server=createServer((req,res)=>{if(req.url==='/animus.html'||req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}else{res.writeHead(404);res.end('Not found');}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address=server.address(),base=`http://127.0.0.1:${address.port}`;
let browser,context,page,expectedConfirm=false;
const errors=[],checks=[],sampleRequests=[];
function passed(name){checks.push(name);console.log('PASS '+name);}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:false});}
async function savedProduction(){return page.evaluate(name=>{const f=$tw.wiki.getTiddler(name).fields,film=JSON.parse($tw.wiki.getTiddlerText(f['animus-scene']));return {title:name,filmTitle:f['animus-scene'],scoreTitle:f['animus-score'],stageTitle:film.scenes[0].source,film,stage:JSON.parse($tw.wiki.getTiddlerText(film.scenes[0].source)),score:$tw.wiki.getTiddler(f['animus-score']).fields['abc-source']};},'AniMus CI production');}
try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1500,height:1050},acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.route('https://**/*',route=>{const url=route.request().url();if(/midi-js-soundfonts\/abcjs\//.test(url)){sampleRequests.push(url);return route.fulfill({status:200,contentType:'audio/wav',body:instrumentWav});}return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{if(expectedConfirm&&dialog.type()==='confirm'){expectedConfirm=false;await dialog.accept();}else{errors.push('Unexpected '+dialog.type()+': '+dialog.message());await dialog.dismiss();}});
 await page.goto(base+'/animus.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.huw-animus-new-project input'));
 await page.locator('.huw-animus-new-project input').fill('AniMus CI production');await page.locator('.huw-animus-new-project button').click();
 const show=page.locator('.tc-tiddler-frame[data-tiddler-title="AniMus CI production"]');await show.locator('.huw-musical').waitFor();
 await page.waitForFunction(()=>{const p=document.querySelector('.tc-tiddler-frame[data-tiddler-title="AniMus CI production"] .huw-musical-play');return p&&!p.disabled;});
 let production=await savedProduction();assert.equal(production.stage.parts.length,0);assert.equal(production.film.scenes.length,1);assert.match(production.score,/z4/);passed('create a complete editable project through its UI');

 // Exercise the actual ABC editing widget mounted inside the AniMus draft.
 const music='X:1\nT:AniMus CI melody\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nC D E F | G A B c |';
 await show.locator('.huw-musical-score-button').click();let score=show.locator('.huw-score-workshop');await score.locator('.huwabc-edit-workshop').waitFor();
 await score.locator('.huwabc-code').fill(music);await score.locator('.huwabc-code').blur();
 await page.waitForFunction(text=>$tw.wiki.filterTiddlers('[prefix[$:/temp/animus-score/]]').some(title=>$tw.wiki.getTiddler(title)?.fields['abc-source']===text),music);
 assert.notEqual((await savedProduction()).score,music,'draft must not overwrite the saved score');await score.locator('.huw-score-save').click();await score.waitFor({state:'detached'});
 await page.waitForFunction(({title,text})=>$tw.wiki.getTiddler(title)?.fields['abc-source']===text,{title:production.scoreTitle,text:music});
 await show.locator('.huw-musical-score-button').click();score=show.locator('.huw-score-workshop');assert.equal(await score.locator('.huwabc-code').inputValue(),music);
 await score.locator('.huwabc-code').fill(music.replace('K:C','K:G'));expectedConfirm=true;await score.getByRole('button',{name:'Annuller',exact:true}).click();await score.waitFor({state:'detached'});assert.equal(expectedConfirm,false,'cancel asks before discarding edited music');assert.equal((await savedProduction()).score,music);
 passed('native ABC editor saves and reopens, while Cancel preserves the score');

 await show.locator('.huw-musical-draw-button').click();let drawing=show.locator('.huw-svg-workshop');await drawing.waitFor();
 await drawing.locator('button[title="Nyt lag"]').click();assert.equal(await drawing.locator('.huw-svg-layer-row').count(),2);
 async function stroke(x1,y1,x2,y2){const r=await drawing.locator('.huw-svg-canvas').boundingBox();assert.ok(r&&r.width>50&&r.height>50,'SVG canvas must be usable');await page.mouse.move(r.x+r.width*x1,r.y+r.height*y1);await page.mouse.down();await page.mouse.move(r.x+r.width*x2,r.y+r.height*y2,{steps:14});await page.mouse.up();}
 await stroke(.28,.3,.7,.65);assert.ok(await drawing.locator('.huw-svg-art path').count()>0);
 await drawing.getByRole('button',{name:'Kopiér billede',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.getByRole('button',{name:'Fortryd',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),1);
 await drawing.getByRole('button',{name:'Gentag',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.getByLabel('Gentag',{exact:true}).check();await stroke(.3,.65,.65,.3);await screenshot('svg-drawing');
 await drawing.getByRole('button',{name:'Gem tegning',exact:true}).click();await drawing.waitFor({state:'detached'});
 production=await savedProduction();const rootPart=production.stage.parts.find(p=>p.svgDrawing);assert.ok(rootPart,'editable SVG model must be persisted');assert.equal(rootPart.svgDrawing.layers.length,2);assert.equal(rootPart.svgDrawing.frames.length,2);
 const layerPart=production.stage.parts.find(p=>p.parent===rootPart.id&&p.type==='image'&&p.variants?.length>1);assert.ok(layerPart,'drawn frames must be playable image variants');assert.ok(layerPart.keys.some(k=>k.variantId!==layerPart.keys[0].variantId));
 await show.locator(`[data-cutout-id="${rootPart.id}"] image`).last().click();await show.locator('.huw-musical-draw-button').click();drawing=show.locator('.huw-svg-workshop');assert.equal(await drawing.locator('.huw-svg-layer-row').count(),2);assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.getByRole('button',{name:'Annuller',exact:true}).click();await drawing.waitFor({state:'detached'});passed('SVG freehand, layers, animation frames, undo, save and reopen');

 await show.locator('.huw-musical-audio-button').click();let audio=show.locator('.huw-narration-workshop');await audio.locator('input[type=file]').setInputFiles({name:'dialogue.wav',mimeType:'audio/wav',buffer:voiceWav});
 await audio.locator('.huw-narration-clip').waitFor();await page.waitForFunction(()=>{const b=document.querySelector('.huw-narration-primary');return b&&!b.disabled;});
 for(const [label,value] of [['Placering i forestillingen (s)','1'],['Klip begyndelsen fra (s)','0.25'],['Slut i lydfil (s)','1.5']]){await audio.getByLabel(label,{exact:true}).fill(value);await audio.getByLabel(label,{exact:true}).blur();}
 await screenshot('narration-trim');await audio.locator('.huw-narration-primary').click();await audio.waitFor({state:'detached'});
 production=await savedProduction();assert.equal(production.film.musical.audioClips.length,1);let voice=production.film.musical.audioClips[0];assert.equal(voice.start,1);assert.equal(voice.offset,.25);assert.equal(voice.duration,1.25);assert.equal(voice.sourceDuration,2);
 const stored=await page.evaluate(asset=>$tw.wiki.getTiddler(asset).fields,voice.asset);assert.equal(stored.type,'audio/wav');assert.equal(stored.text,voiceWav.toString('base64'));
 await show.locator('.huw-musical-audio-button').click();audio=show.locator('.huw-narration-workshop');await audio.locator('.huw-narration-clip').click();assert.equal(await audio.getByLabel('Klip begyndelsen fra (s)',{exact:true}).inputValue(),'0.25');assert.equal(await audio.getByLabel('Slut i lydfil (s)',{exact:true}).inputValue(),'1.5');
 await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});
 const laneClip=show.locator('.huw-musical-recorded-clip');await laneClip.click();assert.equal(await laneClip.getAttribute('aria-pressed'),'true','a single click selects the recorded clip');
 // The first selection redraws the timeline. Real double-click events must
 // still find the replacement clip, including its pointer-capture handlers.
 await page.waitForTimeout(500);await laneClip.dblclick();audio=show.locator('.huw-narration-workshop');await audio.waitFor();
 assert.equal(await audio.getByLabel('Klip begyndelsen fra (s)',{exact:true}).inputValue(),'0.25');await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});
 passed('WAV import, trim, save, embedded media, reopen and timeline double-click');

 const line='FORTÆLLER: Nu begynder vores musical.';
 await show.locator('.huw-musical-manuscript-button').click();const manuscript=show.locator('.huw-script-workshop');await manuscript.getByRole('button',{name:'+ Ny replik',exact:true}).click();
 await manuscript.getByLabel('Tekst, som publikum ser',{exact:true}).fill(line);
 for(const [label,value] of [['Start (s)','1'],['Slut (s)','2.25']]){await manuscript.getByLabel(label,{exact:true}).fill(value);await manuscript.getByLabel(label,{exact:true}).blur();}
 await manuscript.getByRole('button',{name:'Indtal replik',exact:true}).click();audio=show.locator('.huw-narration-workshop');await audio.waitFor();
 assert.equal(await audio.locator('.huw-narration-reading-text').inputValue(),line);
 assert.equal(await audio.locator('.huw-narration-reading-text').evaluate(input=>{const r=input.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&!!hit.closest('.huw-narration-workshop');}),true,'recording editor is above the open manuscript and receives pointer events');
 await audio.getByLabel('Rolle / stemme',{exact:true}).click();await screenshot('manuscript-narration');
 await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});assert.equal(await manuscript.getByLabel('Tekst, som publikum ser',{exact:true}).inputValue(),line);
 await manuscript.locator('.huw-script-header-actions').getByRole('button',{name:'Gem og tilbage',exact:true}).click();await manuscript.waitFor({state:'detached'});
 assert.equal((await savedProduction()).stage.parts.find(p=>p.id==='spoken-0')?.text,line);passed('manuscript dialogue opens recording above the script, retains text and saves captions');

 await show.locator('.huw-musical-site-button').click();const publisher=page.locator('.husp-overlay');await publisher.waitFor();
 await publisher.locator('.husp-preview-switch').getByRole('button',{name:'Sitevisning',exact:true}).click();
 await page.waitForFunction(()=>{const status=document.querySelector('.husp-status')?.textContent||'',frame=document.querySelector('iframe.husp-preview');return status.startsWith('SitePublisher:')||!!frame?.srcdoc;},null,{timeout:30000});
 const publicationStatus=await publisher.locator('.husp-status').innerText();assert.doesNotMatch(publicationStatus,/^SitePublisher:/,'publication failed: '+publicationStatus);
 assert.equal(await publisher.getByRole('button',{name:'Hent HTML',exact:true}).isEnabled(),true,'publication must produce a downloadable site');
 const preview=publisher.locator('iframe.husp-preview');await preview.waitFor();
 const site=await (await preview.elementHandle()).contentFrame();assert.ok(site,'Site preview iframe must be available');
 await site.waitForSelector('.huw-site-animus[data-animus-ready="1"]',{timeout:30000});
 assert.match(await site.locator('.huw-animus-play').innerText(),/Afspil|Play/);assert.match(await site.locator('.huw-animus-stop').innerText(),/Stop/);assert.match(await site.locator('.huw-animus-fullscreen').innerText(),/Fuld skærm|Full screen/);
 const audienceLayer=site.locator(`[data-cutout-id="${layerPart.id}"] image`);assert.equal(await audienceLayer.getAttribute('href'),layerPart.variants[0].imageData,'Site renders the SVG frame without a base image');
 assert.equal(await site.locator('.huw-musical-workspace,.huwabc-edit-workshop,.huw-svg-workshop,.huw-narration-workshop').count(),0,'Site view must not show editors');
 const exported=await site.evaluate(()=>JSON.parse(document.getElementById('publisher-data').textContent));assert.ok(exported.cutoutRows[voice.asset]);assert.ok(!JSON.stringify(exported.cutoutRows).includes('svgDrawing'));
 await site.locator('.huw-animus-play').click();await site.waitForFunction(()=>document.querySelector('.huw-site-animus')?.getAttribute('data-audio-mode')==='playing',null,{timeout:30000});
 await site.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>.2);
 assert.ok(sampleRequests.length>0,'real ABC sample engine must prepare the edited music');
 await site.locator('.huw-animus-play').click();const paused=Number(await site.locator('.huw-site-animus').getAttribute('data-time'));await page.waitForTimeout(150);assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),paused);
 await site.locator('.huw-animus-range').evaluate(input=>{input.value='1.4';input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),1.4);assert.equal(await site.locator('.huw-animus-line').innerText(),line);
 const frameAtSeek=layerPart.keys.filter(k=>k.t<=1.4).sort((a,b)=>a.t-b.t).at(-1).variantId;assert.equal(await audienceLayer.getAttribute('href'),layerPart.variants.find(v=>v.id===frameAtSeek).imageData,'seek selects the matching SVG frame');
 await site.locator('.huw-animus-play').click();await site.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>1.65);
 await site.locator('.huw-animus-stop').click();assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),0);assert.equal(await site.locator('.huw-site-animus').getAttribute('data-playing'),'false');
 await screenshot('site-preview');await page.locator('.husp-head').getByRole('button',{name:'✕ Luk',exact:true}).click();await page.locator('.husp-overlay').waitFor({state:'detached'});
 passed('Site preview exports assets and plays, pauses, seeks, resumes and stops');
 assert.deepEqual(errors,[],'no uncaught browser errors');await screenshot('production-complete');
 await writeFile(new URL('result.json',out),JSON.stringify({ok:true,manifest:manifest.version,checks,sampleRequests:sampleRequests.length,errors},null,2)+'\n');
 console.log(JSON.stringify({ok:true,manifest:manifest.version,checks,errors}));
}catch(error){
 let publisher=null;if(page)try{publisher=await page.evaluate(()=>({status:document.querySelector('.husp-status')?.textContent||'',text:document.querySelector('.husp-overlay')?.innerText||''}));}catch(_){}
 console.error('BROWSER FAILURE '+JSON.stringify({failure:String(error.message||error),publisher,errors}));
 if(page)try{await screenshot('failure');await writeFile(new URL('failure.html',out),await page.content());}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,publisher,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
