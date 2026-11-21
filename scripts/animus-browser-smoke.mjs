import {chooseToolbarItem} from '../tests/helpers/animus-toolbar.mjs';
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
const audiencePages=new Map();
const server=createServer((req,res)=>{if(req.url==='/animus.html'||req.url==='/'||audiencePages.has(req.url)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(audiencePages.get(req.url)||html);}else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}else{res.writeHead(404);res.end('Not found');}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const address=server.address(),base=`http://127.0.0.1:${address.port}`;
let browser,context,page,expectedConfirm=false;
const errors=[],checks=[],sampleRequests=[];
function passed(name){checks.push(name);console.log('PASS '+name);}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:false});}
async function openTiddler(title){
 // tm-navigate bubbles to a parent navigator; dispatching it from rootWidget
 // has no navigator above it and never opens a tiddler. Install this test
 // fixture in the native story list and wait for its frame before editing.
 await page.evaluate(title=>{
  const story=$tw.wiki.getTiddlerList('$:/StoryList');
  $tw.wiki.setText('$:/StoryList','list',undefined,[title,...story.filter(item=>item!==title)]);
 },title);
 await page.locator('.tc-tiddler-frame[data-tiddler-title="'+title+'"]').waitFor();
}
async function savedProduction(){return page.evaluate(name=>{const f=$tw.wiki.getTiddler(name).fields,film=JSON.parse($tw.wiki.getTiddlerText(f['animus-scene']));return {title:name,filmTitle:f['animus-scene'],scoreTitle:f['animus-score'],stageTitle:film.scenes[0].source,film,stage:JSON.parse($tw.wiki.getTiddlerText(film.scenes[0].source)),score:$tw.wiki.getTiddler(f['animus-score']).fields['abc-source']};},'AniMus CI production');}
function actorFixture(id,name,x){const pose=(opacity=1)=>({t:0,x:0,y:0,r:0,sx:1,sy:1,opacity});return [
 {id,name,type:'group',parent:null,keys:[{...pose(),x,y:180}]},
 {id:id+'-head',name:'Head',type:'circle',parent:id,geo:{r:40},fill:'#e4bc8b',keys:[pose()]},
 {id:id+'-mouth-closed',name:'Mund lukket',type:'path',parent:id,geo:{d:'M -16 12 Q 0 20 16 12'},fill:'none',stroke:'#4c2929',strokeWidth:3,keys:[pose()]},
 {id:id+'-mouth-open',name:'Mund åben',type:'ellipse',parent:id,geo:{rx:13,ry:10,cy:14},fill:'#4c2929',keys:[pose(0)]}
];}
async function assertMouth(scope,talking){
 const opacity=async id=>Number(await scope.locator(`[data-cutout-id="${id}"]`).getAttribute('opacity'));
 if(talking)assert.ok(await opacity('ci-alma-mouth-open')>0,'the bound actor opens her mouth during the line');else assert.equal(await opacity('ci-alma-mouth-open'),0,'the bound actor closes her mouth outside the line');
 assert.equal(await opacity('ci-alma-mouth-closed'),talking?0:1);assert.equal(await opacity('ci-bo-mouth-open'),0,'the other actor stays silent');assert.equal(await opacity('ci-bo-mouth-closed'),1);
}
async function stagePoint(part,x,y){return part.evaluate((node,p)=>{const point=node.ownerSVGElement.createSVGPoint();point.x=p.x;point.y=p.y;const screen=point.matrixTransform(node.getScreenCTM());return {x:screen.x,y:screen.y};},{x,y});}
async function clickExposedArm(scope){
 const arm=scope.locator('[data-cutout-id="ci-alma-arm"]').first();let point=null,previous=null,candidates=[];
 // The preceding freehand image has transparent margins that overlap the
 // distal arm. Reopening also animates the TiddlyWiki story cards, so wait
 // for an exposed arm point to settle before sending ordinary pointer input.
 for(let attempt=0;attempt<80;attempt++){
  await arm.scrollIntoViewIfNeeded();
  candidates=await arm.evaluate(node=>[20,12,6,34].map(x=>{
   const point=node.ownerSVGElement.createSVGPoint();point.x=x;point.y=0;const screen=point.matrixTransform(node.getScreenCTM());
   const hit=node.ownerDocument.elementFromPoint(screen.x,screen.y);return {x:screen.x,y:screen.y,localX:x,part:hit?.closest('[data-cutout-id]')?.getAttribute('data-cutout-id'),tag:hit?.tagName,className:hit?.getAttribute('class')};
  }));
  const current=candidates.find(p=>p.part==='ci-alma-arm');
  if(current&&previous&&Math.hypot(current.x-previous.x,current.y-previous.y)<.5){point=current;break;}
  previous=current;await page.waitForTimeout(50);
 }
 assert.ok(point,'a stable exposed painted arm receives the click: '+JSON.stringify(candidates));
 await page.mouse.click(point.x,point.y);
}
async function rotatePart(scope,id,handle,degrees){
 const part=scope.locator('[data-cutout-id="'+id+'"]').first();await handle.scrollIntoViewIfNeeded();
 const hand=scope.locator('[data-cutout-id="ci-alma-hand"]').first(),handBefore=await stagePoint(hand,0,0);
 const start=await handle.evaluate(node=>{const box=node.getBBox(),point=node.ownerSVGElement.createSVGPoint();point.x=box.x+box.width/2;point.y=box.y+box.height/2;const screen=point.matrixTransform(node.getScreenCTM());return {x:screen.x,y:screen.y};});
 // Follow a parent-local arc with real pointer input. Screen-space angles are
 // deliberately insufficient here: the parent is rotated and scaled unevenly.
 const geometry=await part.evaluate((node,opts)=>{
  const svg=node.ownerSVGElement;
  const parent=node.parentNode.getScreenCTM(),inverse=parent.inverse(),point=(x,y,matrix)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(matrix);};
  const pivot=point(4,2,node.getScreenCTM()),anchor=point(pivot.x,pivot.y,inverse),first=point(opts.start.x,opts.start.y,inverse),dx=first.x-anchor.x,dy=first.y-anchor.y;
  const path=Array.from({length:12},(_,i)=>{const angle=opts.degrees*Math.PI/180*(i+1)/12;const p=point(anchor.x+dx*Math.cos(angle)-dy*Math.sin(angle),anchor.y+dx*Math.sin(angle)+dy*Math.cos(angle),parent);return {x:p.x,y:p.y};});
  return {start:opts.start,pivot:{x:pivot.x,y:pivot.y},path};
 },{start,degrees});
 await page.mouse.move(geometry.start.x,geometry.start.y);await page.mouse.down();for(const point of geometry.path)await page.mouse.move(point.x,point.y);await page.mouse.up();
 const after=await stagePoint(part,4,2);assert.ok(Math.hypot(after.x-geometry.pivot.x,after.y-geometry.pivot.y)<1,'rotating the arm must keep its world-space joint fixed');
 const handAfter=await stagePoint(hand,0,0);assert.ok(Math.hypot(handAfter.x-handBefore.x,handAfter.y-handBefore.y)>3,'the attached hand follows the arm rotation');
}
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

 // Real WebCodecs export: a short silent 720p MP4, with no transport controls.
 // Keep this test deterministic and small so it can run on every PR.
 const videoExport=show.locator('.huw-video-export-button');
 await videoExport.waitFor();await videoExport.click();
 const exportDialog=page.locator('.huw-video-modal');await exportDialog.waitFor();
 await exportDialog.locator('.huw-video-range input').nth(0).fill('0');
 await exportDialog.locator('.huw-video-range input').nth(1).fill('0.4');
 await exportDialog.locator('.huw-video-audio').selectOption('silent');
 for(const id of ['music','speech','effects'])await exportDialog.locator('[data-export-file="'+id+'"]').uncheck();
 const canEncodeAvc=await page.evaluate(async()=>{
  if(!window.VideoEncoder?.isConfigSupported)return false;
  for(const codec of ['avc1.4d401f','avc1.42e01f']){
   const config={codec,width:1280,height:720,bitrate:5000000,framerate:30,
    latencyMode:'realtime',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'}};
   try{if((await VideoEncoder.isConfigSupported(config))?.supported)return true;}catch(_){}
  }
  return false;
 });
 await exportDialog.locator('.huw-video-primary').click();
 await page.waitForFunction(()=>/Filer klar:|Files ready:|Eksportfejl:|Export error:|Export cancelled/.test(document.querySelector('.huw-video-status')?.textContent||''),null,{timeout:45000});
 const videoExportStatus=await exportDialog.locator('.huw-video-status').innerText();
 if(canEncodeAvc){
 assert.match(videoExportStatus,/Filer klar:|Files ready:/,'A real AVC output must be generated; status: '+videoExportStatus);
 const pendingVideoDownload=page.waitForEvent('download');
 await exportDialog.getByRole('button',{name:'Hent video.mp4',exact:true}).click();
 const videoDownload=await pendingVideoDownload,videoPath=fileURLToPath(new URL('animus-video-smoke.mp4',out));
 await videoDownload.saveAs(videoPath);
 const movie=await readFile(videoPath),atoms=[];for(let offset=0;offset+8<=movie.length;){
  const length=movie.readUInt32BE(offset),type=movie.toString('ascii',offset+4,offset+8);
  assert.ok(length>=8&&offset+length<=movie.length,'valid '+type+' MP4 atom');
  atoms.push(type);offset+=length;
 }
 assert.deepEqual(atoms,['ftyp','moov','mdat']);assert.ok(movie.length>1500,'nonempty AVC video payload');

 passed('original AniMus stage exports a real H.264 MP4 without a screen recording');
 }else{
  assert.match(videoExportStatus,/No H\.264 MP4 encoder is supported/,'Unsupported AVC must be reported without altering the performance');
  passed('unsupported headless Linux AVC encoder yields a clear export error');
 }
 await exportDialog.locator('.huw-video-close').click();await exportDialog.waitFor({state:'detached'});


 // Exercise the actual ABC editing widget mounted inside the AniMus draft.
 const music='X:1\nT:AniMus CI melody\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nC D E F | G A B c |';
 await chooseToolbarItem(show,'workshops','.huw-musical-score-button');let score=show.locator('.huw-score-workshop');await score.locator('.huwabc-edit-workshop').waitFor();
 await score.locator('.huwabc-code').fill(music);await score.locator('.huwabc-code').blur();
 await page.waitForFunction(text=>$tw.wiki.filterTiddlers('[prefix[$:/temp/animus-score/]]').some(title=>$tw.wiki.getTiddler(title)?.fields['abc-source']===text),music);
 assert.notEqual((await savedProduction()).score,music,'draft must not overwrite the saved score');await score.locator('.huw-score-save').click();await score.waitFor({state:'detached'});
 await page.waitForFunction(({title,text})=>$tw.wiki.getTiddler(title)?.fields['abc-source']===text,{title:production.scoreTitle,text:music});
 await chooseToolbarItem(show,'workshops','.huw-musical-score-button');score=show.locator('.huw-score-workshop');assert.equal(await score.locator('.huwabc-code').inputValue(),music);
 await score.locator('.huwabc-code').fill(music.replace('K:C','K:G'));expectedConfirm=true;await score.getByRole('button',{name:'Annuller',exact:true}).click();await score.waitFor({state:'detached'});assert.equal(expectedConfirm,false,'cancel asks before discarding edited music');assert.equal((await savedProduction()).score,music);
 passed('native ABC editor saves and reopens, while Cancel preserves the score');

 await chooseToolbarItem(show,'workshops','.huw-musical-draw-button');let drawing=show.locator('.huw-svg-workshop');await drawing.waitFor();
 await drawing.locator('button[title="Nyt lag"]').click();assert.equal(await drawing.locator('.huw-svg-layer-row').count(),2);
 async function stroke(x1,y1,x2,y2){const r=await drawing.locator('.huw-svg-canvas').boundingBox();assert.ok(r&&r.width>50&&r.height>50,'SVG canvas must be usable');await page.mouse.move(r.x+r.width*x1,r.y+r.height*y1);await page.mouse.down();await page.mouse.move(r.x+r.width*x2,r.y+r.height*y2,{steps:14});await page.mouse.up();}
 await stroke(.28,.3,.7,.65);assert.ok(await drawing.locator('.huw-svg-art path').count()>0);
 await drawing.getByRole('button',{name:'Kopiér billede',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.getByRole('button',{name:'Fortryd',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),1);
 await drawing.getByRole('button',{name:'Gentag',exact:true}).click();assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.locator('.huw-svg-frame-options summary').click();
 await drawing.getByLabel('Gentag',{exact:true}).check();await stroke(.3,.65,.65,.3);await screenshot('svg-drawing');
 await drawing.getByRole('button',{name:'Gem tegning',exact:true}).click();await drawing.waitFor({state:'detached'});
 production=await savedProduction();const rootPart=production.stage.parts.find(p=>p.svgDrawing);assert.ok(rootPart,'editable SVG model must be persisted');assert.equal(rootPart.svgDrawing.layers.length,2);assert.equal(rootPart.svgDrawing.frames.length,2);
 const layerPart=production.stage.parts.find(p=>p.parent===rootPart.id&&p.type==='image'&&p.variants?.length>1);assert.ok(layerPart,'drawn frames must be playable image variants');assert.ok(layerPart.keys.some(k=>k.variantId!==layerPart.keys[0].variantId));
 await show.locator(`[data-cutout-id="${rootPart.id}"] image`).last().click();await chooseToolbarItem(show,'workshops','.huw-musical-draw-button');drawing=show.locator('.huw-svg-workshop');assert.equal(await drawing.locator('.huw-svg-layer-row').count(),2);assert.equal(await drawing.locator('.huw-svg-frame').count(),2);
 await drawing.getByRole('button',{name:'Annuller',exact:true}).click();await drawing.waitFor({state:'detached'});passed('SVG freehand, layers, animation frames, undo, save and reopen');

 // A named, prepared CutOut cast is test input. All speech bindings below
 // are created through the manuscript UI and rendered by the real runtime.
 const actorParts=[...actorFixture('ci-alma','Alma',260),...actorFixture('ci-bo','Bo',540)];
 Object.assign(actorParts.find(p=>p.id==='ci-alma').keys[0],{r:30,sx:1.5,sy:.8});
 actorParts.push({id:'ci-alma-arm',name:'Almas arm',type:'rect',parent:'ci-alma',pivot:{x:4,y:2},geo:{x:0,y:-6,w:48,h:12},fill:'#e4bc8b',stroke:'#4c2929',strokeWidth:2,keys:[{t:0,x:20,y:5,r:12,sx:1,sy:1,opacity:1}]},
  {id:'ci-alma-hand',name:'Almas hånd',type:'circle',parent:'ci-alma-arm',geo:{r:7},fill:'#e4bc8b',keys:[{t:0,x:48,y:2,r:0,sx:1,sy:1,opacity:1}]});
 const armClip={id:'ci-arm-loop',name:'Almas armbevægelse',target:'ci-alma',start:0,duration:16,beatsPerLoop:8,rate:1,loop:true,motion:{'ci-alma-arm':[{t:0,r:0},{t:8,r:0}]}};
 await page.evaluate(({title,filmTitle,parts,clip})=>{const t=$tw.wiki.getTiddler(title),scene=JSON.parse(t.fields.text);scene.parts.push(...parts);$tw.wiki.addTiddler(new $tw.Tiddler(t,{text:JSON.stringify(scene)}));const ft=$tw.wiki.getTiddler(filmTitle),film=JSON.parse(ft.fields.text);film.musical.animationClips.push(clip);$tw.wiki.addTiddler(new $tw.Tiddler(ft,{text:JSON.stringify(film)}));},{title:production.stageTitle,filmTitle:production.filmTitle,parts:actorParts,clip:armClip});
 await show.locator('[data-cutout-id="ci-alma-mouth-open"]').waitFor({state:'attached'});

 // Use the real CutOut scene widget for the same scene, with a rotated,
 // non-uniformly scaled figure and an arm whose pivot is not (0,0).
 const sceneEditorTitle='AniMus CI · CutOut scene editor';
 await page.evaluate(({title,scene})=>{$tw.wiki.addTiddler(new $tw.Tiddler({title,type:'text/vnd.tiddlywiki',text:'<$cutout-studio mode="scene" tiddler="'+scene+'"/>'}));},{title:sceneEditorTitle,scene:production.stageTitle});
 await openTiddler(sceneEditorTitle);
 const cutoutFrame=page.locator('.tc-tiddler-frame[data-tiddler-title="'+sceneEditorTitle+'"]'),cutout=cutoutFrame.locator('.co-studio');await cutout.locator('.co-direct-toolbar').waitFor();
 const originalAlma=actorParts.find(p=>p.id==='ci-alma'),originalArm=actorParts.find(p=>p.id==='ci-alma-arm');
 const workingScene=()=>page.evaluate(title=>JSON.parse($tw.wiki.getTiddlerText('$:/CutOut/Drafts/'+title)||$tw.wiki.getTiddlerText(title)),production.stageTitle);
 async function selectCutoutArm(){
  await cutout.locator('.co-timeline input[type="range"]').evaluate(input=>{input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await clickExposedArm(cutout);
  await cutout.locator('.co-direct-figure-box').waitFor();assert.notEqual(await cutout.locator('.co-direct-figure-box').evaluate(node=>getComputedStyle(node).strokeDasharray),'none','the selected figure has a dashed frame');
  await cutout.locator('.co-direct-toolbar [data-direct-scope="part"]').click();
  const partPicker=cutout.locator('.co-direct-part-select'),options=await partPicker.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.ok(options.includes('ci-alma-arm'),'the clicked figure offers its arm for joint editing: '+JSON.stringify({options,selection:await cutout.locator('.co-stage').getAttribute('data-direct-selection')}));
  await partPicker.selectOption('ci-alma-arm');await cutout.locator('.co-direct-part-box').waitFor();await cutout.locator('.co-direct-pivot').waitFor();
 }
 await selectCutoutArm();await rotatePart(cutout,'ci-alma-arm',cutout.locator('[data-direct-action="rotate"]'),35);
 let editedScene=await workingScene(),editedArm=editedScene.parts.find(p=>p.id==='ci-alma-arm'),atTwo=editedArm.keys.find(k=>Math.abs(k.t-2)<.001);assert.ok(atTwo,'a gesture inserts a key at the cursor');assert.ok(Math.abs(atTwo.r-47)<1,'rotation is measured in the parent coordinate system');assert.deepEqual(editedScene.parts.find(p=>p.id==='ci-alma').keys,originalAlma.keys);assert.deepEqual(editedArm.pivot,originalArm.pivot);assert.deepEqual(editedArm.geo,originalArm.geo);
 assert.deepEqual((await savedProduction()).stage.parts.find(p=>p.id==='ci-alma-arm').keys,originalArm.keys,'a CutOut draft is applied only with Gem projekt');
 await cutout.locator('.co-direct-undo').click();assert.deepEqual((await workingScene()).parts.find(p=>p.id==='ci-alma-arm').keys,originalArm.keys,'Undo removes the gesture and the inserted key');
 await cutout.locator('.co-direct-toolbar [data-direct-scope="part"]').click();await cutout.locator('.co-direct-part-select').selectOption('ci-alma-arm');await rotatePart(cutout,'ci-alma-arm',cutout.locator('[data-direct-action="rotate"]'),35);await screenshot('direct-cutout-rotation');
 await cutout.getByRole('button',{name:'Gem projekt',exact:true}).click();await page.waitForFunction(title=>!$tw.wiki.getTiddler('$:/CutOut/Drafts/'+title),production.stageTitle);
 const savedArm=(await savedProduction()).stage.parts.find(p=>p.id==='ci-alma-arm');assert.ok(savedArm.keys.some(k=>Math.abs(k.t-2)<.001&&Math.abs(k.r-47)<1));
 await cutoutFrame.locator('.tc-tiddler-controls button').filter({has:page.locator('svg.tc-image-close-button')}).click();await cutoutFrame.waitFor({state:'detached'});
 await openTiddler(sceneEditorTitle);await cutout.locator('.co-direct-toolbar').waitFor();await selectCutoutArm();assert.deepEqual((await workingScene()).parts.find(p=>p.id==='ci-alma-arm').keys,savedArm.keys);assert.equal(await cutout.locator('.co-key-strip [data-key-time="2"]').count(),1,'the saved key is present after reopening');
 await cutoutFrame.locator('.tc-tiddler-controls button').filter({has:page.locator('svg.tc-image-close-button')}).click();await cutoutFrame.waitFor({state:'detached'});

 // Continue directly on the AniMus stage: the same hand gesture now writes
 // the arm's beat-loop key, using the soundtrack's 120 BPM clock.
 await show.locator('.huw-musical-range').evaluate(input=>{input.value='1.75';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await clickExposedArm(show);
 await show.locator('.huw-musical-transform-overlay[data-mode="figure"]').waitFor();await chooseToolbarItem(show,'tools','.huw-musical-parts-button');await show.locator('.huw-musical-transform-overlay[data-mode="parts"]').waitFor();await show.locator('.huw-musical-part-pivot').waitFor();
 assert.equal(await show.locator('.huw-musical-transform-label').textContent(),'Almas arm','Parts and joints keeps the clicked arm selected after selecting its containing figure');
 await rotatePart(show,'ci-alma-arm',show.locator('.huw-musical-transform-overlay[data-mode="parts"] [data-transform-action="rotate"]'),25);
 production=await savedProduction();const motionKey=production.film.musical.animationClips.find(c=>c.id==='ci-arm-loop').motion['ci-alma-arm'].find(k=>Math.abs(k.t-3.5)<.01);assert.ok(motionKey,'1.75 seconds at 120 BPM inserts the arm key at beat 3.5');assert.ok(Math.abs(motionKey.r-25)<1);assert.equal(motionKey.x,0);assert.equal(motionKey.y,0);assert.deepEqual(production.stage.parts.find(p=>p.id==='ci-alma-arm').keys,savedArm.keys,'editing a motion clip preserves the scene keys');assert.deepEqual(production.stage.parts.find(p=>p.id==='ci-alma').keys,originalAlma.keys);await screenshot('direct-animus-rotation');
 const actorSource=JSON.stringify(production.stage.parts.filter(p=>/^ci-(alma|bo)(?:-|$)/.test(p.id)));await show.locator('.huw-musical-stop').click();
 passed('direct figure/part rotation preserves the joint, inserts cursor keys, supports Undo and saves/reopens in CutOut and AniMus');

 await chooseToolbarItem(show,'workshops','.huw-musical-audio-button');let audio=show.locator('.huw-narration-workshop');await audio.locator('input[type=file]').setInputFiles({name:'dialogue.wav',mimeType:'audio/wav',buffer:voiceWav});
 await audio.locator('.huw-narration-clip').waitFor();await page.waitForFunction(()=>{const b=document.querySelector('.huw-narration-primary');return b&&!b.disabled;});
 for(const [label,value] of [['Placering i forestillingen (s)','1'],['Klip begyndelsen fra (s)','0.25'],['Slut i lydfil (s)','1.5']]){await audio.getByLabel(label,{exact:true}).fill(value);await audio.getByLabel(label,{exact:true}).blur();}
 await screenshot('narration-trim');await audio.locator('.huw-narration-primary').click();await audio.waitFor({state:'detached'});
 production=await savedProduction();assert.equal(production.film.musical.audioClips.length,1);let voice=production.film.musical.audioClips[0];assert.equal(voice.start,1);assert.equal(voice.offset,.25);assert.equal(voice.duration,1.25);assert.equal(voice.sourceDuration,2);
 const stored=await page.evaluate(asset=>$tw.wiki.getTiddler(asset).fields,voice.asset);assert.equal(stored.type,'audio/wav');assert.equal(stored.text,voiceWav.toString('base64'));
 await chooseToolbarItem(show,'workshops','.huw-musical-audio-button');audio=show.locator('.huw-narration-workshop');await audio.locator('.huw-narration-clip').click();assert.equal(await audio.getByLabel('Klip begyndelsen fra (s)',{exact:true}).inputValue(),'0.25');assert.equal(await audio.getByLabel('Slut i lydfil (s)',{exact:true}).inputValue(),'1.5');
 await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});
 const laneClip=show.locator('.huw-musical-recorded-clip');await laneClip.click();assert.equal(await laneClip.getAttribute('aria-pressed'),'true','a single click selects the recorded clip');
 // The first selection redraws the timeline. Real double-click events must
 // still find the replacement clip, including its pointer-capture handlers.
 await page.waitForTimeout(500);await laneClip.dblclick();audio=show.locator('.huw-narration-workshop');await audio.waitFor();
 assert.equal(await audio.getByLabel('Klip begyndelsen fra (s)',{exact:true}).inputValue(),'0.25');await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});
 passed('WAV import, trim, save, embedded media, reopen and timeline double-click');

 const line='ALMA: Aaaaaa.';
 await chooseToolbarItem(show,'workshops','.huw-musical-manuscript-button');const manuscript=show.locator('.huw-script-workshop');await manuscript.getByRole('button',{name:'+ Ny replik',exact:true}).click();
 await manuscript.getByLabel('Tekst, som publikum ser',{exact:true}).fill(line);
 for(const [label,value] of [['Start (s)','1'],['Slut (s)','5']]){await manuscript.getByLabel(label,{exact:true}).fill(value);await manuscript.getByLabel(label,{exact:true}).blur();}
 await manuscript.locator('.huw-script-lipsync-enable').check();await manuscript.locator('.huw-script-lipsync-actor').selectOption('ci-alma');await manuscript.locator('.huw-script-lipsync-open').selectOption('ci-alma-mouth-open');await manuscript.locator('.huw-script-lipsync-closed').selectOption('ci-alma-mouth-closed');await manuscript.locator('.huw-script-lipsync-timing').selectOption('script');
 await manuscript.getByRole('button',{name:'Indtal replik',exact:true}).click();audio=show.locator('.huw-narration-workshop');await audio.waitFor();
 assert.equal(await audio.locator('.huw-narration-reading-text').inputValue(),line);
 assert.equal(await audio.locator('.huw-narration-reading-text').evaluate(input=>{const r=input.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&!!hit.closest('.huw-narration-workshop');}),true,'recording editor is above the open manuscript and receives pointer events');
 await audio.getByLabel('Rolle / stemme',{exact:true}).click();await screenshot('manuscript-narration');
 await audio.getByRole('button',{name:'Annuller',exact:true}).click();await audio.waitFor({state:'detached'});assert.equal(await manuscript.getByLabel('Tekst, som publikum ser',{exact:true}).inputValue(),line);
 await manuscript.locator('.huw-script-header-actions').getByRole('button',{name:'Gem og tilbage',exact:true}).click();await manuscript.waitFor({state:'detached'});
 production=await savedProduction();const savedCue=production.stage.parts.find(p=>p.id==='spoken-0');assert.equal(savedCue.text,line);assert.deepEqual(savedCue.lipSync,{enabled:true,target:'ci-alma',open:'ci-alma-mouth-open',closed:'ci-alma-mouth-closed',timing:'script',offset:0,strength:1});
 await chooseToolbarItem(show,'workshops','.huw-musical-manuscript-button');await manuscript.locator('.huw-script-cue').filter({hasText:line}).click();assert.equal(await manuscript.locator('.huw-script-lipsync-enable').isChecked(),true);assert.equal(await manuscript.locator('.huw-script-lipsync-actor').inputValue(),'ci-alma');assert.equal(await manuscript.locator('.huw-script-lipsync-open').inputValue(),'ci-alma-mouth-open');assert.equal(await manuscript.locator('.huw-script-lipsync-closed').inputValue(),'ci-alma-mouth-closed');assert.equal(await manuscript.locator('.huw-script-lipsync-timing').inputValue(),'script');await screenshot('manuscript-lipsync');
 await manuscript.locator('.huw-script-header-actions').getByRole('button',{name:'Annuller',exact:true}).click();await manuscript.waitFor({state:'detached'});
 passed('manuscript dialogue opens recording above the script and saves/reopens the actor mouth binding');

 const editorRange=show.locator('.huw-musical-range');async function seekEditor(time){await editorRange.evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},time);}
 await seekEditor(.5);await assertMouth(show,false);await seekEditor(1.4);await assertMouth(show,true);await screenshot('editor-lipsync');
 await show.locator('.huw-musical-play').click();await page.waitForFunction(()=>Number(document.querySelector('.tc-tiddler-frame[data-tiddler-title="AniMus CI production"] .huw-musical-range')?.value)>1.6);await show.locator('.huw-musical-play').click();await seekEditor(1.4);await assertMouth(show,true);
 const pausedEditorTime=await editorRange.inputValue();await page.waitForTimeout(100);assert.equal(await editorRange.inputValue(),pausedEditorTime);
 await seekEditor(4.8);await assertMouth(show,false);await screenshot('editor-lipsync-rest');await seekEditor(5.5);await assertMouth(show,false);await show.locator('.huw-musical-stop').click();await assertMouth(show,false);
 assert.equal(JSON.stringify((await savedProduction()).stage.parts.filter(p=>/^ci-(alma|bo)(?:-|$)/.test(p.id))),actorSource,'mouth playback must preserve source geometry and animation keys');passed('editor lipsync follows play/seek/pause, leaves the other actor silent and preserves the source shapes');

 await chooseToolbarItem(show,'view','.huw-musical-site-button');const publisher=page.locator('.husp-overlay');await publisher.waitFor();
 assert.equal(await publisher.locator('.husp-preview-switch').getByRole('button',{name:'Program',exact:true}).count(),1);assert.match(await publisher.locator('.husp-settings-button').innerText(),/Publikumsvisning/);
 await page.waitForFunction(()=>{const status=document.querySelector('.husp-status')?.textContent||'',frame=document.querySelector('iframe.husp-preview');return status.startsWith('SitePublisher:')||!!frame?.srcdoc;},null,{timeout:30000});
 const publicationStatus=await publisher.locator('.husp-status').innerText();assert.doesNotMatch(publicationStatus,/^SitePublisher:/,'publication failed: '+publicationStatus);
 assert.equal(await publisher.getByRole('button',{name:'Hent HTML',exact:true}).isEnabled(),true,'publication must produce a downloadable site');
 const preview=publisher.locator('iframe.husp-preview');await preview.waitFor();
 const site=await (await preview.elementHandle()).contentFrame();assert.ok(site,'Site preview iframe must be available');
 await site.waitForSelector('.huw-site-animus[data-animus-ready="1"]',{timeout:30000});
 assert.match(await site.locator('.huw-animus-play').innerText(),/Afspil|Play/);assert.match(await site.locator('.huw-animus-stop').innerText(),/Stop/);assert.match(await site.locator('.huw-animus-fullscreen').innerText(),/Fuld skærm|Full screen/);
 assert.equal(await site.locator('.huw-video-export-button').count(),1,'Site view also offers the independent video-export action');
 const audienceLayer=site.locator(`[data-cutout-id="${layerPart.id}"] image`);assert.equal(await audienceLayer.getAttribute('href'),layerPart.variants[0].imageData,'Site renders the SVG frame without a base image');
 await assertMouth(site,false);
 assert.equal(await site.locator('.huw-musical-workspace,.huwabc-edit-workshop,.huw-svg-workshop,.huw-narration-workshop,.co-direct-toolbar,.co-direct-overlay,.huw-musical-transform-overlay,.huw-musical-part-pivot').count(),0,'Site view must not show editors or direct-edit handles');
 const exported=await site.evaluate(()=>JSON.parse(document.getElementById('publisher-data').textContent));assert.equal(exported.presentation,'animus');assert.equal(exported.startView,'performance','one musical opens the player directly by default');assert.ok(exported.cutoutRows[voice.asset]);assert.ok(!JSON.stringify(exported.cutoutRows).includes('svgDrawing'));
 await site.locator('.huw-animus-play').click();await site.waitForFunction(()=>document.querySelector('.huw-site-animus')?.getAttribute('data-audio-mode')==='playing',null,{timeout:30000});
 await site.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>.2);
 assert.ok(sampleRequests.length>0,'real ABC sample engine must prepare the edited music');
 await site.locator('.huw-animus-play').click();const paused=Number(await site.locator('.huw-site-animus').getAttribute('data-time'));await page.waitForTimeout(150);assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),paused);
 await site.locator('.huw-animus-range').evaluate(input=>{input.value='1.4';input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),1.4);assert.equal(await site.locator('.huw-animus-line').innerText(),line);
 await assertMouth(site,true);await screenshot('site-lipsync');
 const frameAtSeek=layerPart.keys.filter(k=>k.t<=1.4).sort((a,b)=>a.t-b.t).at(-1).variantId;assert.equal(await audienceLayer.getAttribute('href'),layerPart.variants.find(v=>v.id===frameAtSeek).imageData,'seek selects the matching SVG frame');
 await site.locator('.huw-animus-play').click();await site.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>1.65);
 await site.locator('.huw-animus-stop').click();assert.equal(Number(await site.locator('.huw-site-animus').getAttribute('data-time')),0);assert.equal(await site.locator('.huw-site-animus').getAttribute('data-playing'),'false');
 await assertMouth(site,false);assert.equal(JSON.stringify((await savedProduction()).stage.parts.filter(p=>/^ci-(alma|bo)(?:-|$)/.test(p.id))),actorSource);
 await screenshot('site-preview');
 passed('Site preview exports assets and plays, pauses, seeks, resumes and stops with the same script lipsync');

 await publisher.locator('.husp-preview-switch').getByRole('button',{name:'Program',exact:true}).click();const overview=publisher.locator('.husp-overview');await overview.waitFor();const programCard=overview.locator('.husp-program-card');assert.equal(await programCard.count(),1);
 assert.equal(await programCard.locator('.huw-animus-program-title').innerText(),production.film.name);assert.match(await programCard.locator('.huw-animus-program-duration').innerText(),/0:16/);assert.match(await programCard.locator('.huw-animus-program-scenes').innerText(),/Scene 1/);
 assert.doesNotMatch(await overview.innerText(),/"(?:parts|musical|version|scenes)"\s*:|data:image\//,'Program must present the show instead of its JSON');await screenshot('publication-program');
 await publisher.locator('.husp-settings-button').click();const publicationSettings=publisher.locator('.husp-config');await publicationSettings.waitFor();assert.doesNotMatch(await publicationSettings.innerText(),/Nodepult|Normal nodevisning|Vælg tag|Vælg liste/,'audience settings must not expose unrelated ABC and tag controls');
 const startView=publisher.locator('.husp-program-start');assert.equal(await startView.inputValue(),'performance');assert.deepEqual(await startView.locator('option').allTextContents(),['Forestillingen','Programmet']);await startView.selectOption('program');
 await publisher.locator('.husp-settings-button').click();await publisher.locator('.husp-preview-switch').getByRole('button',{name:'Sitevisning',exact:true}).click();
 const previewProgram=site.locator('#animus-program');await previewProgram.waitFor({timeout:30000});assert.equal(await site.evaluate(()=>JSON.parse(document.getElementById('publisher-data').textContent).startView),'program');assert.equal(await site.locator('.huw-site-animus').isVisible(),false);assert.match(await previewProgram.innerText(),/AniMus CI production/);
 await previewProgram.locator('.husp-program-open[data-entry-index="0"]').click();await site.waitForSelector('.huw-site-animus[data-animus-ready="1"]');assert.notEqual(await site.locator('.huw-site-animus').getAttribute('data-playing'),'true','opening the show from its program waits for Play');

 // Download the real publication after navigating its preview. Opening those
 // exact bytes afresh must still honour the saved Program start setting.
 const pendingDownload=page.waitForEvent('download');await publisher.getByRole('button',{name:'Hent HTML',exact:true}).click();const download=await pendingDownload,downloadPath=fileURLToPath(new URL('audience-program.html',out));await download.saveAs(downloadPath);
 const audienceHtml=await readFile(downloadPath,'utf8'),audiencePayload=audienceHtml.match(/<script\b[^>]*\bid="publisher-data"[^>]*>([\s\S]*?)<\/script>/);assert.ok(audiencePayload,'downloaded HTML must contain its publication settings');const audienceData=JSON.parse(audiencePayload[1]);assert.equal(audienceData.presentation,'animus');assert.equal(audienceData.startView,'program');audiencePages.set('/audience-program.html',audienceHtml);
 const audience=await context.newPage();audience.on('pageerror',error=>errors.push(error.message));await audience.goto(base+'/audience-program.html',{waitUntil:'domcontentloaded'});const downloadedProgram=audience.locator('#animus-program');await downloadedProgram.waitFor();assert.equal(await audience.locator('.huw-site-animus').isVisible(),false);assert.match(await downloadedProgram.locator('.huw-animus-program-duration').innerText(),/0:16/);assert.match(await downloadedProgram.locator('.huw-animus-program-scenes').innerText(),/Scene 1/);
 assert.doesNotMatch(await downloadedProgram.innerText(),/"(?:parts|musical|version|scenes)"\s*:|data:image\//);await audience.screenshot({path:fileURLToPath(new URL('downloaded-program.png',out)),fullPage:false});
 await downloadedProgram.locator('.husp-program-open[data-entry-index="0"]').click();await audience.waitForSelector('.huw-site-animus[data-animus-ready="1"]');assert.notEqual(await audience.locator('.huw-site-animus').getAttribute('data-playing'),'true');await audience.close();
 await publisher.locator('.husp-head').getByRole('button',{name:'✕ Luk',exact:true}).click();await publisher.waitFor({state:'detached'});passed('Program overview and audience settings control the preview and the downloaded HTML start view');

 // This real example has both abc-source and an explicit reader in its body.
 // The former ViewAddon rendered a second player, hence a second live mixer.
 const readerTitle='Fyrtøjet · 02 · Træets tre rum (ABC)';
 const readerFrame=page.locator('.tc-tiddler-frame[data-tiddler-title="'+readerTitle+'"]');
 const mixers=page.locator('.huwabc-mini-mixer').filter({has:page.locator('.huwabc-mini-mixer-title',{hasText:readerTitle})});
 for(let attempt=0;attempt<2;attempt++){
  await openTiddler(readerTitle);
  await readerFrame.locator('.huwabc-score').waitFor();
  assert.equal(await readerFrame.locator('.huwabc-score').count(),1,'the score must mount one actual reader, not hide a duplicate');
  await mixers.locator('.huwabc-mini-mixer-row').first().waitFor();
  assert.equal(await mixers.count(),1,'there must be only one mixer in the DOM, including hidden panels');assert.equal(await mixers.locator('.huwabc-mini-mixer-row').count(),3);
  if(attempt===1)await screenshot('abc-single-mixer');
  await readerFrame.locator('.tc-tiddler-controls button').filter({has:page.locator('svg.tc-image-close-button')}).click();
  await readerFrame.waitFor({state:'detached'});await mixers.waitFor({state:'detached'});
 }
 passed('Fyrtøjet score mounts one reader and one mixer, then cleans up across close and reopen');
 assert.deepEqual(errors,[],'no uncaught browser errors');await screenshot('production-complete');
 await writeFile(new URL('result.json',out),JSON.stringify({ok:true,manifest:manifest.version,checks,sampleRequests:sampleRequests.length,errors},null,2)+'\n');
 console.log(JSON.stringify({ok:true,manifest:manifest.version,checks,errors}));
}catch(error){
 let publisher=null,selection=null;if(page)try{const details=await page.evaluate(()=>({publisher:{status:document.querySelector('.husp-status')?.textContent||'',text:document.querySelector('.husp-overlay')?.innerText||''},selection:{cutoutRoot:document.querySelector('.co-stage')?.getAttribute('data-direct-selection'),cutoutLabel:document.querySelector('.co-direct-selection')?.textContent,cutoutParts:[...document.querySelectorAll('.co-direct-part-select option')].map(n=>n.value),animusLabel:document.querySelector('.huw-musical-transform-label')?.textContent}}));publisher=details.publisher;selection=details.selection;}catch(_){}
 console.error('BROWSER FAILURE '+JSON.stringify({failure:String(error.message||error),publisher,selection,errors}));
 if(page)try{await screenshot('failure');await writeFile(new URL('failure.html',out),await page.content());}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,publisher,selection,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
