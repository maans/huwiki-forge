import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Acceptance of the normal, assembled Turn Around demo. Edits use real touch
// input; assertions inspect the saved production and the actual SVG renderer.
// A short VTT export exercises the shared export lifecycle without re-encoding
// an unchanged MP4 implementation.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus/face/',import.meta.url);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core for face browser acceptance');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');
 try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const candidate of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(candidate);executablePath=candidate;break;}catch(_){}
await mkdir(out,{recursive:true});
const requestedPaths=new Set(),checks=[],errors=[];let savedHtml='';
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requestedPaths.add(pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 try{
  let body;
  if(pathname==='/saved-face.html'&&savedHtml)body=savedHtml;
  else{const file=new URL('.'+decodeURIComponent(pathname).replace(/\/$/,'/index.html'),root);
   if(!file.href.startsWith(root.href))throw Error('Outside repository');body=await readFile(file);}
  const type=/\.html$/.test(pathname)||pathname.endsWith('/')?'text/html; charset=utf-8':/\.m?js$/.test(pathname)?'text/javascript; charset=utf-8':/\.css$/.test(pathname)?'text/css':'application/json';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch(_){res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
let browser,context,page,wiki,editor,timeline,probes,finalKeys;
function passed(name){checks.push(name);console.log('PASS '+name);}
async function seek(time){await editor.locator('.huw-musical-range').evaluate((input,t)=>{input.value=String(t);input.dispatchEvent(new Event('input',{bubbles:true}));},time);}
async function position(){return Number(await editor.locator('.huw-musical-range').inputValue());}
async function keys(){return wiki.evaluate(title=>JSON.parse($tw.wiki.getTiddlerText(title)).musical.faceKeys||[],timeline.filmTitle);}
async function sourceSnapshot(){return wiki.evaluate(titles=>Object.fromEntries(titles.map(title=>[title,$tw.wiki.getTiddlerText(title)])),[timeline.filmTitle,...timeline.scenes.map(s=>s.source)]);}
async function openEditor(){
 const player=wiki.locator('.plato-player').first();await player.waitFor();
 editor=wiki.locator('.plato-native-studio.huw-musical');
 if(!await editor.count())await wiki.locator('.plato-home .plato-native-link a').click();
 await editor.locator('.huw-musical-play:enabled').waitFor();
 await editor.locator('.huw-musical-view-mode').selectOption('stage');
 const parts=editor.locator('.huw-musical-parts-button');if(await parts.getAttribute('aria-pressed')!=='true')await parts.click();
}
// Read only the active scene. Opacity-zero mouths still carry useful phoneme
// metadata; a hidden scene with identical actor IDs must never be mistaken for
// the current one. Shape transforms are separate from authored joint poses.
function renderedFace(host,actor){
 function shown(node){for(let n=node;n&&n!==host;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}
 function part(suffix){return [...host.querySelectorAll('[data-cutout-id="'+actor+suffix+'"]')].find(shown);}
 function shape(node){return node&&node.querySelector('image,path,ellipse,circle');}
 function attrs(node){return node?{opacity:node.getAttribute('opacity'),transform:node.getAttribute('transform')}:null;}
 const mouth=part('-mouth-open'),closed=part('-mouth-closed');
 return {viseme:mouth?.getAttribute('data-lipsync-viseme'),href:shape(mouth)?.getAttribute('href'),mouth:attrs(mouth),closed:attrs(closed),
  actor:attrs(part('')),head:attrs(part('-head')),jaw:attrs(part('-jaw')),eyes:attrs(part('-eyes')),lids:attrs(part('-eye-lids')),
  pupils:attrs(shape(part('-pupils'))),brows:attrs(shape(part('-brows')))};
}
async function face(actor='prisoner',scope=editor.locator('.huw-musical-canvas > svg')){return scope.evaluate(renderedFace,actor);}
async function tapPart(id,head=false){
 // Start each direct selection with the full scene, then enlarge the actual
 // head before touching a small eye or mouth. Palette thumbnails are excluded.
 const reset=editor.locator('.huw-musical-reset-preview-zoom');if(await reset.isEnabled())await reset.tap();
 if(!head){await tapPart('prisoner-head-drawing',true);await editor.locator('.huw-musical-zoom-selection:enabled').tap();}
 const part=editor.locator('.huw-musical-canvas > svg [data-cutout-id="'+id+'"]:visible').first();await part.scrollIntoViewIfNeeded();
 const painted=part.locator('image,path,ellipse,circle').first();
 if(head){
  const point=await painted.evaluate(node=>{const box=node.getBBox(),p=node.ownerSVGElement.createSVGPoint();p.x=box.x+box.width*.5;p.y=box.y+box.height*.17;
   const screen=p.matrixTransform(node.getScreenCTM()),bounds=node.getBoundingClientRect();return {x:screen.x-bounds.x,y:screen.y-bounds.y,
    hit:node.ownerDocument.elementFromPoint(screen.x,screen.y)?.closest('[data-cutout-id]')?.getAttribute('data-cutout-id')};});
  assert.equal(point.hit,id,'an exposed face region receives the touch');await painted.tap({position:{x:point.x,y:point.y}});
 }else await painted.tap();
 const panel=editor.locator('[data-face-panel]:visible').first();await panel.waitFor();
 assert.equal(await panel.getAttribute('data-face-target'),'prisoner','the face controls belong to the touched actor');return panel;
}
async function choose(panel,channel,value){
 const card=panel.locator('[data-face-channel="'+channel+'"][data-face-value="'+value+'"]');await card.waitFor();
 const box=await card.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'face choice is a usable touch target');
 assert.ok(await card.locator('img,svg,canvas').count()>0,'face choice contains a visual preview');await card.tap();
}
async function assertMapped(probe,variant){
 await seek(probe.time);const value=await face(probe.actor),expected=probe.variants[variant];
 assert.ok(expected,'the original scene has variant '+variant);assert.equal(value.href,expected,'the chosen mapping is visible at '+probe.time+' in '+probe.sceneTitle);
 assert.deepEqual(value.actor,probe.value.actor,'facial correction does not move the actor');assert.deepEqual(value.head,probe.value.head,'facial correction does not move the head');
 return value;
}
try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1540,height:1100},hasTouch:true,acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 await context.route('https://**/*',route=>route.abort());
 page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/demo/?edition=turn-around&lang=da',{waitUntil:'domcontentloaded'});
 await page.locator('#wiki').waitFor({state:'visible',timeout:90000});
 wiki=await (await page.locator('#wiki').elementHandle()).contentFrame();assert.ok(wiki);
 await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);
 timeline=await wiki.locator('.plato-player').first().evaluate(host=>host._platoPlayer.getTimeline());
 for(const path of ['/demo/demo.mjs','/assembler/compose.mjs','/library/plugins/registry.json','/editions/turn-around/manifest.json'])assert.ok(requestedPaths.has(path),'normal demo loaded '+path);
 await openEditor();

 // Locate useful *existing* speech moments. These are not replacement cues or
 // a mocked phoneme plan: each observation comes from an actual stage seek.
 const candidates=await wiki.evaluate(tl=>{
  const list=[];for(const scene of tl.scenes.slice(0,3)){
   const project=JSON.parse($tw.wiki.getTiddlerText(scene.source));
   for(const cue of project.parts||[]){const config=cue.lipSync;if(!config?.enabled||!['prisoner','elder'].includes(config.target))continue;
    const mouth=project.parts.find(p=>p.id===config.open),variants=Object.fromEntries((mouth?.variants||[]).map(v=>[v.id,v.imageData]));
    for(const clip of tl.audioClips.filter(c=>c.sceneTitle===scene.source&&c.cueId===cue.id))
     for(let i=1;i<40;i++)list.push({time:Math.round((clip.start+clip.duration*i/40)*100)/100,actor:config.target,sceneTitle:scene.source,variants});
   }
  }return list;
 },timeline);
 const samples=[];
 for(const candidate of candidates){await seek(candidate.time);samples.push({...candidate,time:await position(),value:await face(candidate.actor)});}
 const os=samples.filter(s=>s.actor==='prisoner'&&s.value.viseme==='O'&&Number(s.value.mouth?.opacity)>.2);
 const firstScene=timeline.scenes[0].source,firstOs=os.filter(s=>s.sceneTitle===firstScene);
 assert.ok(firstOs.length>=3,'the original first scene supplies multiple O speech frames');
 const current=firstOs[Math.floor(firstOs.length/2)],before=firstOs.find(s=>s.time<current.time-.015),later=firstOs.find(s=>s.time>current.time+.015);
 const cross=os.find(s=>s.sceneTitle!==firstScene&&s.time>current.time);
 const other=samples.find(s=>s.actor==='prisoner'&&s.time>current.time&&s.value.viseme==='C'&&Number(s.value.mouth?.opacity)>.2);
 const crossOther=samples.find(s=>s.actor==='prisoner'&&s.sceneTitle!==firstScene&&s.time>(cross?.time||current.time)&&s.value.viseme==='C'&&Number(s.value.mouth?.opacity)>.2);
 const elder=samples.find(s=>s.actor==='elder'&&s.time>current.time&&s.value.viseme==='O'&&Number(s.value.mouth?.opacity)>.2);
 assert.ok(before&&later&&cross&&other&&crossOther&&elder,'real speech covers earlier/later O, a later scene, other phonemes and another actor');
 probes={current,before,later,cross,other,crossOther,elder};

 await seek(current.time);const untouched=await sourceSnapshot();
 let panel=await tapPart('prisoner-mouth-open');
 assert.equal(await panel.locator('.huw-musical-face-context').getAttribute('data-face-viseme'),'O','the controls explain the current automatic speech shape');
 assert.ok((await panel.locator('.huw-musical-face-line').textContent()).trim(),'the current manuscript line is visible beside mouth choices');
 await panel.locator('[data-face-tab="mouth"]').tap();
 assert.deepEqual(await sourceSnapshot(),untouched,'opening face controls and changing tabs do not create keys or rewrite scenes');
 await choose(panel,'mouth','E');
 let stored=await keys(),correction=stored.find(k=>k.actor==='prisoner'&&Math.abs(k.t-current.time)<.001);
 assert.equal(correction?.mouthMap?.O,'E','a mouth choice teaches this phoneme at the global playhead');
 assert.notEqual(correction?.mouth?.mode,'fixed','the ordinary choice keeps automatic speech running');
 assert.equal(await panel.locator('.huw-musical-face-status').getAttribute('data-face-auto'),'custom');
 await assertMapped(current,'E');await assertMapped(later,'E');await assertMapped(cross,'E');
 for(const sample of [before,other,elder]){await seek(sample.time);assert.equal((await face(sample.actor)).href,sample.value.href,'earlier frames, other phonemes and other actors retain their original shapes');}
 passed('touching a real mouth teaches only the current phoneme from this time onward, including later scenes');

 const blinkTime=Math.round((current.time+1)*100)/100;
 await seek(blinkTime);panel=await tapPart('prisoner-pupils');await panel.locator('[data-face-tab="eyes"]').tap();
 const poseBefore=await face();await choose(panel,'eyes','blink');
 const blinkAfter=await face();assert.deepEqual(blinkAfter.actor,poseBefore.actor);assert.deepEqual(blinkAfter.head,poseBefore.head);
 assert.ok((await keys()).some(k=>k.actor==='prisoner'&&Math.abs(k.t-blinkTime)<.001&&k.eyes==='blink'),'blink is a visible time key');
 await seek(blinkTime+.14);assert.ok(Number((await face()).lids?.opacity)>.8,'blink closes the visible eyes');
 await seek(blinkTime+.35);assert.ok(Number((await face()).lids?.opacity)<.2,'blink releases without another authored key');
 const gazeTime=Math.round((blinkTime+.5)*100)/100;await seek(gazeTime);
 const gazeBefore=await face();panel=await tapPart('prisoner-pupils');await panel.locator('[data-face-tab="eyes"]').tap();await choose(panel,'eyes','left');
 const gazeAfter=await face();assert.notDeepEqual(gazeAfter.pupils,gazeBefore.pupils,'gaze changes the pupil artwork');assert.deepEqual(gazeAfter.actor,gazeBefore.actor);assert.deepEqual(gazeAfter.head,gazeBefore.head);
 const moodTime=Math.round((gazeTime+.5)*100)/100;await seek(moodTime);panel=await tapPart('prisoner-head-drawing',true);
 await panel.locator('[data-face-tab="expression"]').tap();
 const moodBefore=await face(),happy=panel.locator('[data-face-value="happy"][data-face-channel]');await happy.tap();
 const moodAfter=await face();assert.notDeepEqual(moodAfter.brows,moodBefore.brows,'expression changes the facial artwork');assert.deepEqual(moodAfter.actor,moodBefore.actor);assert.deepEqual(moodAfter.head,moodBefore.head);
 assert.ok((await keys()).some(k=>k.actor==='prisoner'&&Math.abs(k.t-moodTime)<.001&&k.mood==='happy'));
 await seek(blinkTime+.14);assert.ok(Number((await face()).lids?.opacity)>.8,'rewinding restores the blink rather than the later gaze');
 await seek(gazeTime);assert.deepEqual((await face()).pupils,gazeAfter.pupils,'gaze rendering is deterministic on rewind');
 passed('eyes, blink, gaze and expression have independent saved keys and deterministic rewind');

 await seek(moodTime);
 const beforeWorkshop=await sourceSnapshot();await editor.locator('.huw-musical-face-workshop-open:visible').first().tap();
 const workshop=wiki.locator('.huw-face-workshop:visible');await workshop.waitFor();
 assert.equal(await workshop.locator('[data-face-sound]').count(),7,'the face workshop presents the seven speech groups');
 await workshop.locator('[data-face-sound="C"]').tap();
 assert.deepEqual(await sourceSnapshot(),beforeWorkshop,'opening the face workshop and inspecting a sound do not save a correction');
 await choose(workshop,'mouth','A');
 assert.ok((await keys()).some(k=>k.actor==='prisoner'&&Math.abs(k.t-moodTime)<.001&&k.mouthMap?.C==='A'));
 assert.ok(await workshop.locator('[data-face-key-time]').count()>=3,'the workshop exposes saved face-key history');
 await workshop.locator('.huw-face-workshop-close').tap();await workshop.waitFor({state:'hidden'});
 await assertMapped(crossOther,'A');await assertMapped(cross,'E');
 const afterEdits=await sourceSnapshot();for(const [title,text] of Object.entries(untouched))if(title!==timeline.filmTitle)assert.equal(afterEdits[title],text,'face keys leave scene geometry, original speech and animation source unchanged');
 passed('the face workshop shows real choices and key history; inspecting sounds is read-only and corrections remain independent');

 // This route deliberately saves a manuscript-owned field and rebuilds the
 // workspace before opening the facial dialog. The selected cue and learned
 // mappings must survive that transition without an extra facial key.
 await seek(cross.time);panel=await tapPart('prisoner-mouth-open');
 const keysBeforeNavigation=await keys();await panel.locator('.huw-musical-face-script').tap();
 const manuscript=wiki.locator('.huw-script-workshop:visible');await manuscript.waitFor();
 assert.equal(await manuscript.locator('.huw-script-lipsync-actor').inputValue(),'prisoner');
 const notes=manuscript.locator('.huw-script-scene-notes'),savedNote=(await notes.inputValue())+'\nFace workshop browser acceptance.';
 await notes.fill(savedNote);await manuscript.getByRole('button',{name:'Gem og åbn ansigtsværksted',exact:true}).tap();
 await manuscript.waitFor({state:'hidden'});await workshop.waitFor();
 assert.equal(await workshop.locator('[data-face-panel]').getAttribute('data-face-target'),'prisoner');
 assert.ok(Math.abs(await position()-cross.time)<.001,'the manuscript opens the selected actor at the same global playhead');
 assert.deepEqual(await keys(),keysBeforeNavigation,'saving the manuscript and opening face choices do not add a key');
 assert.equal(await wiki.evaluate(title=>JSON.parse($tw.wiki.getTiddlerText(title)).sceneNotes,cross.sceneTitle),savedNote,'the manuscript draft is saved before the new workshop opens');
 assert.equal(await workshop.locator('[data-face-panel]').getAttribute('data-face-viseme'),'O');
 await workshop.locator('.huw-face-workshop-close').tap();await workshop.waitFor({state:'hidden'});
 await assertMapped(cross,'E');finalKeys=await keys();
 passed('saving the manuscript opens the correct face workshop after workspace reload with the cue and corrections intact');

 // Serialize the actual edited wiki through the native save template, then
 // hydrate a new document. This catches missing model fields and omitted
 // runtime modules that an in-memory close/reopen cannot expose.
 savedHtml=await wiki.evaluate(()=>$tw.wiki.renderTiddler('text/plain','$:/core/save/all'));
 assert.ok(savedHtml.includes('<html')&&savedHtml.length>1000000,'native save produces a complete reusable wiki');
 await writeFile(new URL('saved-face.html',out),savedHtml);
 const previousPage=page;page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/saved-face.html',{waitUntil:'domcontentloaded'});wiki=page;
 await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);await openEditor();await previousPage.close();
 assert.deepEqual(await keys(),finalKeys,'all facial keys survive saving and reopening the actual wiki');
 await assertMapped(cross,'E');await assertMapped(crossOther,'A');await seek(before.time);assert.equal((await face()).href,before.value.href);
 await seek(gazeTime);assert.deepEqual((await face()).pupils,gazeAfter.pupils);
 passed('native wiki save and reload preserve learned speech mappings, eyes and expressions without changing earlier frames');

 // The ordinary audience player builds scene views separately from the
 // editor. It must receive global face keys as well as its scene-local model.
 await wiki.locator('.plato-player').first().evaluate((host,t)=>host._platoPlayer.seek(t),cross.time);
 const audience=await face('prisoner',wiki.locator('.plato-scene').first());assert.equal(audience.href,cross.variants.E,'audience playback uses the same global learned mapping');
 await assertMapped(cross,'E');panel=await tapPart('prisoner-mouth-open');await editor.locator('.huw-musical-zoom-selection:enabled').tap();
 const stage=editor.locator('.huw-musical-canvas > svg'),zoom=await stage.getAttribute('viewBox'),captions=editor.locator('[data-preview-track="captions"]');
 if(await captions.getAttribute('aria-pressed')==='true')await captions.tap();
 await editor.evaluate(host=>{
  window.__faceExportFrames=[];const svg=host.querySelector('.huw-musical-canvas > svg');
  window.__faceExportObserver=new MutationObserver(()=>{
   if(!/Undertekster \/ Captions/.test(document.querySelector('.huw-video-status')?.textContent||''))return;
   function shown(node){for(let n=node;n&&n!==svg;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}
   const mouth=[...svg.querySelectorAll('[data-cutout-id="prisoner-mouth-open"]')].find(shown);
   window.__faceExportFrames.push({time:Number(host.dataset.cameraTime),href:mouth?.querySelector('image')?.getAttribute('href'),viseme:mouth?.getAttribute('data-lipsync-viseme'),viewBox:svg.getAttribute('viewBox'),hiddenNodes:svg.querySelectorAll('.huw-musical-preview-hidden').length,captionsHidden:host.querySelector('.huw-musical-caption-overlay').hidden});
  });window.__faceExportObserver.observe(svg,{attributes:true,attributeFilter:['viewBox']});
 });
 await editor.locator('.huw-video-export-button').tap();const dialog=wiki.locator('.huw-video-modal');await dialog.waitFor();
 for(const id of ['video','music','speech','effects','captions'])await dialog.locator('[data-export-file="'+id+'"]').setChecked(id==='captions');
 await dialog.locator('.huw-video-range input').nth(0).fill(String(cross.time));await dialog.locator('.huw-video-range input').nth(1).fill(String(cross.time+.1));
 await dialog.locator('.huw-video-primary').tap();
 await wiki.waitForFunction(()=>/Filer klar:|Files ready:|Eksportfejl:|Export error:/.test(document.querySelector('.huw-video-status')?.textContent||''));
 assert.match(await dialog.locator('.huw-video-status').textContent(),/Filer klar:|Files ready:/);
 const frames=await wiki.evaluate(()=>{window.__faceExportObserver.disconnect();return window.__faceExportFrames;});
 const mappedFrames=frames.filter(frame=>frame.viseme==='O');assert.ok(mappedFrames.length,'the real export renderer visits an O frame');
 assert.ok(mappedFrames.every(frame=>frame.href===cross.variants.E),'export keeps the learned mouth artwork');
 assert.ok(frames.every(frame=>!frame.hiddenNodes&&!frame.captionsHidden),'temporary editing visibility does not hide export content');
 await dialog.locator('.huw-video-close').tap();await dialog.waitFor({state:'detached'});
 assert.equal(await stage.getAttribute('viewBox'),zoom);assert.ok(Math.abs(await position()-cross.time)<.001);assert.equal(await captions.getAttribute('aria-pressed'),'false');
 assert.deepEqual(await keys(),finalKeys,'audience playback and export do not add facial keys');
 await editor.locator('.huw-musical-canvas').screenshot({path:fileURLToPath(new URL('face-correction-reloaded.png',out))});
 passed('audience and actual export rendering retain facial corrections and restore the hidden, zoomed editor');

 // Auto clears this sound's learned correction at this point, not a different
 // sound's correction and not any earlier part of the performance.
 panel=await tapPart('prisoner-mouth-open');await panel.locator('[data-face-tab="mouth"]').tap();
 await panel.locator('[data-face-channel="mouth"][data-face-value="auto"]').tap();
 const reset=(await keys()).find(k=>k.actor==='prisoner'&&Math.abs(k.t-cross.time)<.001);
 assert.equal(reset?.mouthMap?.O,null);assert.equal(reset?.mouth?.mode,'auto');
 await assertMapped(cross,'O');await assertMapped(crossOther,'A');await assertMapped(current,'E');
 passed('Auto restores the current speech group while preserving other learned groups and earlier corrections');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 await writeFile(new URL('result.json',out),JSON.stringify({ok:true,route:'/demo/?edition=turn-around&lang=da',checks,errors,probeTimes:Object.fromEntries(Object.entries(probes).map(([name,p])=>[name,{time:p.time,actor:p.actor,scene:p.sceneTitle,viseme:p.value.viseme}])),keys:await keys(),exportFrames:frames.map(({href,...frame})=>({...frame,mapped:href===cross.variants.E}))},null,2)+'\n');
 console.log('FACE ACCEPTANCE '+JSON.stringify({ok:true,checks:checks.length}));
}catch(error){
 let details=null;try{details=await (wiki||page)?.evaluate(()=>({face:document.querySelector('[data-face-panel]:not([hidden])')?.textContent,workshop:document.querySelector('.huw-face-workshop')?.textContent,status:document.querySelector('.huw-musical-status')?.textContent}));if(page)await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,details,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
