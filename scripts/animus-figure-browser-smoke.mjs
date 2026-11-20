import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Exercise the ordinary assembled demo, including the repeated actor IDs in
// different scenes. Selection and joint editing use native pointer input.
// Read-only source/SVG observations verify what the actual user gesture saves.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus/figure/',import.meta.url);
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core for figure browser acceptance');
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
  if(pathname==='/saved-figure.html'&&savedHtml)body=savedHtml;
  else{const file=new URL('.'+decodeURIComponent(pathname).replace(/\/$/,'/index.html'),root);
   if(!file.href.startsWith(root.href))throw Error('Outside repository');body=await readFile(file);}
  const type=/\.html$/.test(pathname)||pathname.endsWith('/')?'text/html; charset=utf-8':/\.m?js$/.test(pathname)?'text/javascript; charset=utf-8':/\.css$/.test(pathname)?'text/css':'application/json';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch(_){res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port;
const actor='prisoner',joint='prisoner-forearm-right',drawing=joint+'-drawing',hand='prisoner-hand-right';
let browser,context,page,wiki,editor,timeline,selectedScene,currentTime,localTime,finalSources;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function passed(name){checks.push(name);console.log('PASS '+name);}
async function seek(time){await editor.locator('.huw-musical-range').evaluate((input,t)=>{input.value=String(t);input.dispatchEvent(new Event('input',{bubbles:true}));},time);}
async function position(){return Number(await editor.locator('.huw-musical-range').inputValue());}
async function touchTimeline(time){
 const ruler=editor.locator('.huw-musical-ruler-lane').first();await ruler.scrollIntoViewIfNeeded();
 const duration=Number(await editor.locator('.huw-musical-range').getAttribute('max'));
 const point=await ruler.evaluate((node,{time,duration})=>{
  const rect=node.getBoundingClientRect(),x=rect.left+rect.width*time/duration,y=rect.top+rect.height/2;
  return {x,y,tolerance:Math.max(.8,duration/rect.width),hit:node.contains(node.ownerDocument.elementFromPoint(x,y))};
 },{time,duration});
 assert.ok(point.hit,'the visible timeline ruler receives the native touch');
 await touchPoint(point);
 assert.ok(Math.abs(await position()-time)<=point.tolerance,'a native timeline touch moves the playhead to '+time+'s');
}
async function sources(){return wiki.evaluate(titles=>Object.fromEntries(titles.map(title=>[title,$tw.wiki.getTiddlerText(title)])),[timeline.filmTitle,...timeline.scenes.map(scene=>scene.source)]);}
function sourceHashes(values){return Object.fromEntries(Object.entries(values).map(([title,text])=>[title,hash(text)]));}
async function assertSources(expected,message){assert.deepEqual(sourceHashes(await sources()),sourceHashes(expected),message);}
async function openEditor(){
 const player=wiki.locator('.plato-player').first();await player.waitFor();
 editor=wiki.locator('.plato-native-studio.huw-musical');
 if(!await editor.count())await wiki.locator('.plato-home .plato-native-link a').click();
 await editor.locator('.huw-musical-play:enabled').waitFor();await editor.locator('.huw-musical-view-mode').selectOption('stage');
}
async function assertResponsiveControls(){
 const originalViewport=page.viewportSize(),sidebar=await wiki.evaluate(()=>$tw.wiki.getTiddlerText('$:/state/sidebar','yes'));
 try{
  // The sidebar narrows the tiddler while the browser remains wide. This is
  // the iPad failure that viewport-only media queries did not catch.
  await wiki.evaluate(()=>$tw.wiki.setText('$:/state/sidebar','text',undefined,'yes'));
  for(const viewport of [{width:1366,height:1024},{width:1024,height:768}]){
   await page.setViewportSize(viewport);
   await editor.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await editor.evaluate(host=>{
    const bounds=host.getBoundingClientRect(),clipped=[];
    for(const selector of ['.huw-musical-appbar','.huw-musical-transport']){
     const row=host.querySelector(selector),box=row.getBoundingClientRect();
     for(const control of row.querySelectorAll('button,select,input,a')){
      const r=control.getBoundingClientRect();if(!r.width||!r.height)continue;
      if(r.left<Math.max(bounds.left,box.left)-1||r.right>Math.min(bounds.right,box.right)+1||r.top<box.top-1||r.bottom>box.bottom+1)
       clipped.push({row:selector,label:control.textContent||control.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,rowBounds:{left:box.left,right:box.right,top:box.top,bottom:box.bottom}});
     }
    }
    return {width:bounds.width,clipped,stageHeight:host.querySelector('.huw-musical-canvas').getBoundingClientRect().height,timelineHeight:host.querySelector('.huw-musical-workbench').getBoundingClientRect().height};
   });
   assert.deepEqual(layout.clipped,[],'every editor and transport control fits with the sidebar open at '+viewport.width+'px: '+JSON.stringify(layout));
   assert.ok(layout.stageHeight>=120&&layout.timelineHeight>=60,'wrapping retains a usable stage and timeline: '+JSON.stringify(layout));
  }
 }finally{
  await page.setViewportSize(originalViewport);
  await wiki.evaluate(value=>$tw.wiki.setText('$:/state/sidebar','text',undefined,value),sidebar);
  await editor.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 }
 passed('iPad landscape widths keep all toolbar and transport controls inside the editor with the sidebar open');
}
async function observeAudioCreations(){
 await wiki.evaluate(()=>{
  const original=document.createElement,created=[];
  document.createElement=function(name,...args){const element=original.call(this,name,...args);if(String(name).toLowerCase()==='audio')created.push(element);return element;};
  window.__animusMediaProbe={created,restore(){document.createElement=original;}};
 });
}
async function assertBoundedRecordedAudio(){
 // Use the real embedded recordings and a native Play gesture. This checks
 // media loading/source reuse which the unit test's FakeAudio cannot cover.
 const state=()=>wiki.evaluate(()=>{const list=window.__animusMediaProbe.created;return {created:list.length,loaded:list.filter(a=>a.getAttribute('src')).length,playing:list.filter(a=>!a.paused).length,errors:list.filter(a=>a.error).map(a=>a.error.message)};});
 try{
  assert.equal((await state()).created,0,'opening the editor creates no recording decoders');
  for(const time of [38,110,290,186])await touchTimeline(time);
  assert.equal((await state()).created,0,'repeated native paused timeline touches do not allocate media');
  assert.equal(await editor.locator('.huw-musical-score-page svg').count(),0,'scene-only navigation does not retain hidden scores');
  await editor.locator('.huw-musical-play').tap();
  const ready=()=>window.__animusMediaProbe.created.filter(a=>!a.paused&&a.readyState>=2&&a.currentSrc).length===3;
  await wiki.waitForFunction(ready,null,{timeout:15000});
  let result=await state();assert.equal(result.created,4,'the three overlapping real recordings share four gesture-primed elements');assert.equal(result.playing,3);assert.deepEqual(result.errors,[]);
  await touchTimeline(450);
  await wiki.waitForFunction(ready,null,{timeout:15000});
  result=await state();assert.equal(result.created,4,'a distant running seek reuses the primed elements');assert.equal(result.playing,3);assert.ok(result.loaded<=4);assert.deepEqual(result.errors,[]);
  await editor.locator('.huw-musical-play').tap();
  result=await state();assert.equal(result.playing,0,'native Pause stops all voices');
  assert.equal(await editor.getAttribute('data-playing'),'false');
  const paused=await position();
  await editor.locator('.huw-musical-play').tap();await wiki.waitForFunction(ready,null,{timeout:15000});
  assert.ok(await position()>=paused,'native Play resumes the current position');
  await editor.locator('.huw-musical-stop').tap();
  result=await state();assert.equal(result.playing,0);assert.equal(result.loaded,0,'Stop releases every encoded recording source');
  assert.equal(await position(),0,'native Stop returns to the beginning');
  passed('native timeline, Play, Pause and Stop remain responsive with real overlaps and four reusable media elements');
 }finally{
  await editor.locator('.huw-musical-stop').click();
  await wiki.evaluate(()=>{window.__animusMediaProbe.restore();delete window.__animusMediaProbe;});
 }
}
async function pageOffset(){
 if(wiki===page)return {x:0,y:0};
 const frame=await wiki.frameElement(),bounds=await frame.boundingBox(),border=await frame.evaluate(node=>({x:node.clientLeft,y:node.clientTop}));
 assert.ok(bounds,'the ordinary demo iframe has a visible viewport');return {x:bounds.x+border.x,y:bounds.y+border.y};
}
// Read only the active scene. Hidden scenes deliberately contain identical
// actor IDs; workshop thumbnails also carry those IDs outside the stage.
function renderedActor(host,id){
 function shown(node){for(let n=node;n&&n!==host;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}
 const root=[...host.querySelectorAll('[data-cutout-id="'+id+'"]')].find(shown);if(!root)return null;
 const nodes=[root,...root.querySelectorAll('[data-cutout-id]')];
 return Object.fromEntries(nodes.map(node=>{
  const part=node.getAttribute('data-cutout-id'),shape=[...node.children].find(child=>['image','path','ellipse','circle','rect','line','polygon','polyline'].includes(child.localName));
  const attributes=element=>element?Object.fromEntries(['transform','opacity','href','d','fill','stroke','stroke-width','x','y','width','height','cx','cy','r','rx','ry'].map(name=>[name,element.getAttribute(name)])):null;
  return [part,{parent:node===root?null:node.parentElement.closest('[data-cutout-id]')?.getAttribute('data-cutout-id'),transform:node===root?null:node.getAttribute('transform'),opacity:node.getAttribute('opacity'),shape:attributes(shape)}];
 }));
}
async function actorPose(scope){
 const value=await scope.evaluate(renderedActor,actor);assert.ok(value,'the current rendered actor exists');
 for(const part of Object.values(value))if(part.shape?.href)part.shape.href=hash(part.shape.href);
 return value;
}
function stage(){return editor.locator('.huw-musical-canvas > svg');}
function figurePanel(){return editor.locator('[data-figure-panel]:visible');}
function figurePreview(){return figurePanel().locator('[data-figure-preview]');}
async function nativePoint(locator,allowed,localPoints,{avoidControls=false,minClearance=12}={}){
 await locator.scrollIntoViewIfNeeded();let previous=null,point=null,last=[];
 for(let attempt=0;attempt<60;attempt++){
  last=await locator.evaluate((node,{points,avoidControls})=>{
   const bb=node.getBBox(),matrix=node.getScreenCTM();
   const candidates=points||(avoidControls?[.1,.2,.3,.4,.5,.6,.7,.8,.9]:[.25,.5,.75]).flatMap(y=>[.35,.5,.65].map(x=>({x:bb.x+bb.width*x,y:bb.y+bb.height*y})));
   const scope=node.closest('[data-figure-preview],.huw-musical-canvas'),controls=avoidControls&&scope?[...scope.querySelectorAll('[data-figure-action],[data-transform-action],.huw-musical-figure-overlay [role="button"],.huw-musical-transform-overlay [role="button"]')].map(control=>control.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0):[];
   return candidates.map(local=>{const p=node.ownerSVGElement.createSVGPoint();p.x=local.x;p.y=local.y;const screen=p.matrixTransform(matrix),hit=node.ownerDocument.elementFromPoint(screen.x,screen.y);
    const clearance=controls.length?Math.min(...controls.map(rect=>Math.hypot(Math.max(rect.left-screen.x,0,screen.x-rect.right),Math.max(rect.top-screen.y,0,screen.y-rect.bottom)))):1e9;
    return {x:screen.x,y:screen.y,hit:hit?.closest('[data-cutout-id]')?.getAttribute('data-cutout-id'),tag:hit?.tagName,className:hit?.getAttribute('class'),clearance};});
  },{points:localPoints,avoidControls});
  const exposed=last.filter(point=>allowed.includes(point.hit)&&(!avoidControls||point.clearance>=minClearance));if(avoidControls)exposed.sort((a,b)=>b.clearance-a.clearance);
  const current=exposed[0];
  if(current&&previous&&Math.hypot(current.x-previous.x,current.y-previous.y)<.5){point=current;break;}
  previous=current;await page.waitForTimeout(50);
 }
 assert.ok(point,'a stable exposed painted region'+(avoidControls?' at least '+minClearance+'px away from editing controls':'')+' receives native input: '+JSON.stringify(last));return point;
}
async function touchPoint(point){const offset=await pageOffset();await page.touchscreen.tap(point.x+offset.x,point.y+offset.y);}
async function blankPoint(locator){
 await locator.scrollIntoViewIfNeeded();
 const point=await locator.evaluate(node=>{
  const rect=node.getBoundingClientRect(),left=Math.max(rect.left+12,12),right=Math.min(rect.right-12,innerWidth-12),top=Math.max(rect.top+12,12),bottom=Math.min(rect.bottom-12,innerHeight-12);
  for(const y of [top,bottom,(top+bottom)/2])for(const x of [left,right,left+(right-left)*.2,left+(right-left)*.8]){
   const hit=node.ownerDocument.elementFromPoint(x,y);
   if(hit&&node.contains(hit)&&!hit.closest('[data-cutout-id],[data-figure-action],[data-transform-action],button,input,select,textarea'))return {x,y,tag:hit.tagName,className:hit.getAttribute('class')};
  }return null;
 });
 assert.ok(point,'a visible empty canvas region receives a native tap, without selecting the painted backdrop');return point;
}
async function tapFigurePart(id){
 await wiki.evaluate(()=>{
  if(window.__figureInputEvents)return;window.__figureInputEvents=[];window.__figureTapTargets=[];
  for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{
   const target=event.target,canvas=document.querySelector('.huw-musical-figure-canvas');if(!canvas?.contains(target))return;
   window.__figureInputEvents.push({type,time:performance.now(),pointerId:event.pointerId,pointerType:event.pointerType,primary:event.isPrimary,x:event.clientX,y:event.clientY,tag:target.tagName,part:target.closest('[data-cutout-id]')?.getAttribute('data-cutout-id'),action:target.closest('[data-figure-action]')?.getAttribute('data-figure-action'),captured:canvas.hasPointerCapture(event.pointerId),selected:document.querySelector('[data-figure-panel]')?.getAttribute('data-figure-selected')});
   if(window.__figureInputEvents.length>80)window.__figureInputEvents.shift();
  },true);
 });
 const painting=figurePreview().locator('[data-cutout-id="'+(id===joint?drawing:id)+'"] image').first();
 // A touch near a blue handle can be adjusted to that interactive control
 // by the browser. Aim at visibly exposed artwork with a measured margin.
 const point=await nativePoint(painting,[id===joint?drawing:id],undefined,{avoidControls:true});
 await wiki.evaluate(target=>window.__figureTapTargets.push(target),{id,...point});await touchPoint(point);
 assert.equal(await figurePanel().getAttribute('data-figure-selected'),id,'one native tap selects '+id);
}
async function assertFigureCleared(pose,time,zoom,message){
 const panel=figurePanel();await panel.waitFor();
 assert.equal(await panel.getAttribute('data-figure-actor'),actor,message+': the same actor remains open');
 assert.equal(await panel.getAttribute('data-figure-selected'),'',message+': no body part remains selected');
 assert.equal(await panel.locator('.huw-musical-figure-overlay').isVisible(),false,message+': workshop handles are hidden');
 assert.equal(await panel.locator('[data-figure-action="rotate"]').getAttribute('tabindex'),'-1',message+': hidden rotation is not keyboard focusable');
 assert.equal(await stage().locator('.huw-musical-transform-overlay').isVisible(),false,message+': stage handles are hidden');
 assert.equal(await stage().locator('.huw-musical-selected-element').count(),0,message+': stage selection styling is cleared');
 assert.deepEqual(await actorPose(stage()),pose,message+': stage pose stays unchanged');
 assert.deepEqual(await actorPose(figurePreview()),pose,message+': workshop pose stays unchanged');
 assert.ok(Math.abs(await position()-time)<.001,message+': playhead stays unchanged');
 assert.equal(await stage().getAttribute('viewBox'),zoom,message+': selection zoom stays unchanged');
}
async function openForearm(){
 // Use the ordinary object picker and selection zoom to expose the entire
 // actor when the authored camera currently frames only the face.
 const picker=editor.locator('.huw-musical-object-picker');await picker.focus();await picker.selectOption(actor);
 await editor.locator('.huw-musical-zoom-selection:enabled').tap();
 const parts=editor.locator('.huw-musical-parts-button');if(await parts.getAttribute('aria-pressed')!=='true')await parts.tap();
 const image=stage().locator('[data-cutout-id="'+drawing+'"]:visible image').first();
 await touchPoint(await nativePoint(image,[drawing],[-2,4,9].flatMap(x=>[25,42,58].map(y=>({x,y})))));
 const panel=figurePanel();await panel.waitFor();
 assert.equal(await panel.getAttribute('data-figure-actor'),actor,'the workshop belongs to the touched actor');
 assert.equal(await panel.getAttribute('data-figure-selected'),joint,'touching artwork selects the anatomical forearm joint');
 return panel;
}
async function actorPoint(scope,id,pivot){return scope.evaluate((host,arg)=>{
 function shown(node){for(let n=node;n&&n!==host;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}
 const root=[...host.querySelectorAll('[data-cutout-id="'+arg.actor+'"]')].find(shown),node=root?.querySelector('[data-cutout-id="'+arg.id+'"]');
 if(!node)return null;const p=node.ownerSVGElement.createSVGPoint();p.x=arg.pivot.x;p.y=arg.pivot.y;
 const at=p.matrixTransform(root.getScreenCTM().inverse().multiply(node.getScreenCTM()));return {x:at.x,y:at.y};
 },{actor,id,pivot});}
async function rotateForearm(degrees,pivot,{cancel=false}={}){
 const preview=figurePreview(),part=preview.locator('[data-cutout-id="'+joint+'"]'),handle=figurePanel().locator('[data-figure-action="rotate"]');
 const before=await part.getAttribute('transform');
 await handle.scrollIntoViewIfNeeded();
 const start=await handle.evaluate(node=>{const box=node.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;return {x,y,hit:node.ownerDocument.elementFromPoint(x,y)?.closest('[data-figure-action]')?.getAttribute('data-figure-action')};});
 assert.equal(start.hit,'rotate','the visible rotation handle receives ordinary input');
 const geometry=await part.evaluate((node,o)=>{
  const svg=node.ownerSVGElement,parent=node.parentNode.getScreenCTM(),inverse=parent.inverse(),point=(x,y,m)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(m);};
  const screen=point(o.pivot.x,o.pivot.y,node.getScreenCTM()),anchor=point(screen.x,screen.y,inverse),first=point(o.start.x,o.start.y,inverse),dx=first.x-anchor.x,dy=first.y-anchor.y;
  return Array.from({length:16},(_,i)=>{const angle=o.degrees*Math.PI/180*(i+1)/16,p=point(anchor.x+dx*Math.cos(angle)-dy*Math.sin(angle),anchor.y+dx*Math.sin(angle)+dy*Math.cos(angle),parent);return {x:p.x,y:p.y};});
 },{start,pivot,degrees});
 const offset=await pageOffset();await page.mouse.move(start.x+offset.x,start.y+offset.y);await page.mouse.down();
 for(const point of geometry)await page.mouse.move(point.x+offset.x,point.y+offset.y);
 if(cancel){assert.notEqual(await part.getAttribute('transform'),before,'the native gesture changed the live pose before cancellation');await page.keyboard.press('Escape');}
 await page.mouse.up();
}

try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1540,height:1100},hasTouch:true,acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});await context.route('https://**/*',route=>route.abort());
 page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/demo/?edition=turn-around&lang=da',{waitUntil:'domcontentloaded'});
 await page.locator('#wiki').waitFor({state:'visible',timeout:90000});wiki=await (await page.locator('#wiki').elementHandle()).contentFrame();assert.ok(wiki);
 await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);
 timeline=await wiki.locator('.plato-player').first().evaluate(host=>host._platoPlayer.getTimeline());
 for(const path of ['/demo/demo.mjs','/assembler/compose.mjs','/library/plugins/registry.json','/editions/turn-around/manifest.json'])assert.ok(requestedPaths.has(path),'normal demo loaded '+path);
 await observeAudioCreations();await openEditor();await assertResponsiveControls();await assertBoundedRecordedAudio();selectedScene=timeline.scenes[1];assert.ok(selectedScene&&selectedScene.start>0,'the test edits a later scene with repeated actor IDs');
 const originalSources=await sources(),originalScene=JSON.parse(originalSources[selectedScene.source]),originalPart=originalScene.parts.find(part=>part.id===joint);
 const originalFilm=JSON.parse(originalSources[timeline.filmTitle]);
 assert.equal(originalFilm.musical.animationClips.length,0,'the ordinary demo uses scene keys rather than a synthetic motion clip');
 assert.ok(originalPart&&originalPart.parent==='prisoner-arm-right');
 assert.ok(originalScene.parts.find(part=>part.id===actor).keys[0].sx<0,'the original actor is mirrored, exercising parent-local rotation');
 const cue=originalScene.parts.find(part=>part.lipSync?.enabled&&part.lipSync.target===actor),clip=timeline.audioClips.find(item=>item.sceneTitle===selectedScene.source&&item.cueId===cue?.id);
 assert.ok(clip,'the current pose is observed during a real recorded line');
 await seek(selectedScene.start+.05);const openingPose=await actorPose(stage());
 await seek(clip.start+Math.min(.4,clip.duration*.35));currentTime=await position();localTime=currentTime-selectedScene.start;
 const initialPose=await actorPose(stage());assert.notDeepEqual(initialPose,openingPose,'the selected time has a real animated pose, distinct from the opening frame');
 const pivot=originalPart.pivot||{x:0,y:0};
 const jointBefore=await actorPoint(stage(),joint,pivot),handBefore=await actorPoint(stage(),hand,{x:0,y:0});
 await openForearm();
 const dock=editor.locator('[data-animus-workshop]');
 assert.equal(await dock.getAttribute('data-animus-workshop'),'figure');
 assert.ok(await dock.evaluate(node=>{const stage=node.closest('.huw-musical').querySelector('.huw-musical-stage');return !stage.contains(node)&&!!(stage.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);}), 'the shared workshop is below the stage');
 assert.ok(Math.abs(await position()-currentTime)<.001);await assertSources(originalSources,'selecting and opening the figure workshop do not save a key');
 assert.deepEqual(await actorPose(figurePreview()),initialPose,'the preview contains the whole active actor in its current rendered pose');
 assert.deepEqual(await actorPose(stage()),initialPose,'opening the workshop does not alter the stage pose');
 const orientation=svg=>{const root=[...svg.querySelectorAll('[data-cutout-id="prisoner"]')].find(node=>{for(let n=node;n&&n!==svg;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}),m=root.getScreenCTM(),scale=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));return [m.a,m.b,m.c,m.d].map(value=>value/scale);};
 const stageOrientation=await stage().evaluate(orientation),previewOrientation=await figurePreview().evaluate(orientation);
 assert.ok(stageOrientation.every((value,index)=>Math.abs(value-previewOrientation[index])<1e-5),'the whole-figure preview preserves the original mirror, rotation and proportions');
 const fit=await figurePreview().evaluate(svg=>{
  const box=svg.getBoundingClientRect(),root=svg.querySelector('[data-cutout-id="prisoner"]'),actor=root.getBoundingClientRect();
  const ids=['prisoner-head-drawing','prisoner-shin-left-drawing','prisoner-shin-right-drawing'];
  return {width:box.width,height:box.height,actorHeight:actor.height,other:!!svg.querySelector('[data-cutout-id="elder"]'),parts:ids.map(id=>{const part=root.querySelector('[data-cutout-id="'+id+'"]'),r=part?.getBoundingClientRect();return {id,inside:!!r&&r.left>=box.left-2&&r.top>=box.top-2&&r.right<=box.right+2&&r.bottom<=box.bottom+2};})};
 });
 assert.ok(fit.width>=300&&fit.height>=300&&fit.actorHeight>=200,'the whole figure has a large editing preview: '+JSON.stringify(fit));
 assert.equal(fit.other,false,'the figure preview does not include the other actor');
 assert.ok(fit.parts.every(part=>part.inside),'head and both lower legs fit inside the figure preview');
 const sharedFaceTab=dock.locator('[data-workshop-mode="face"]');
 assert.equal(await sharedFaceTab.isEnabled(),true,'a selected forearm offers its owning actor\'s Face tab');
 await sharedFaceTab.tap();
 const initialFaceWorkshop=editor.locator('.huw-face-workshop--inline:visible');await initialFaceWorkshop.waitFor();
 assert.equal(await initialFaceWorkshop.locator('[data-face-panel]').getAttribute('data-face-target'),actor);
 await initialFaceWorkshop.locator('[data-face-back="figure"]').tap();await figurePanel().waitFor();
 assert.equal(await figurePanel().getAttribute('data-figure-selected'),joint,'Face and Whole figure retain the original anatomical forearm selection');
 assert.ok(Math.abs(await position()-currentTime)<.001);await assertSources(originalSources,'the shared Face tab and Back do not add a key');
 assert.deepEqual(await actorPose(figurePreview()),initialPose,'the shared Face tab preserves the complete current pose');
 passed('a native forearm selection opens the whole current actor below the stage, without creating a key');

 let selectionZoom=await stage().getAttribute('viewBox');
 await editor.focus();await page.keyboard.press('Escape');
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'Escape from the scene');
 await tapFigurePart(hand);await tapFigurePart(joint);
 selectionZoom=await stage().getAttribute('viewBox');
 await touchPoint(await blankPoint(figurePanel().locator('.huw-musical-figure-canvas')));
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'a blank touch in the figure workshop');
 await tapFigurePart(joint);selectionZoom=await stage().getAttribute('viewBox');
 await figurePanel().focus();await page.keyboard.press('Escape');
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'Escape from the figure workshop');
 await tapFigurePart(joint);
 // The zoomed cave backdrop is real selectable artwork. Return to the
 // authored framing before tapping the genuinely empty stage letterbox.
 const resetZoom=editor.locator('.huw-musical-reset-preview-zoom');if(await resetZoom.isEnabled())await resetZoom.tap();selectionZoom=await stage().getAttribute('viewBox');
 await touchPoint(await blankPoint(editor.locator('.huw-musical-canvas')));
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'a blank touch in the scene letterbox');
 // The object dropdown is rebuilt by its change handler. Use the native
 // popup and send Escape immediately afterwards, without repairing focus.
 const objectPicker=editor.locator('.huw-musical-object-picker');await objectPicker.tap();
 const actorOption=await objectPicker.locator('option').evaluateAll((options,id)=>options.findIndex(option=>option.value===id),actor);assert.ok(actorOption>0);
 await page.keyboard.press('Home');for(let i=0;i<actorOption;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 assert.equal(await figurePanel().getAttribute('data-figure-selected'),actor,'the object dropdown selected the character before Escape');
 selectionZoom=await stage().getAttribute('viewBox');await page.keyboard.press('Escape');
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'Escape immediately after choosing an object in the rebuilt dropdown');
 await assertSources(originalSources,'dropdown selection and immediate Escape leave every saved source unchanged');
 await tapFigurePart(joint);selectionZoom=await stage().getAttribute('viewBox');
 await dock.locator('[data-action="clear-selection"]').tap();
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'the shared Clear selection button');
 await tapFigurePart(joint);const fullscreenButton=editor.locator('.huw-musical-stage-fullscreen');await fullscreenButton.tap();
 await wiki.waitForFunction(()=>document.querySelector('.huw-musical-stage-fullscreen')?.getAttribute('aria-pressed')==='true');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const fullscreenState=await editor.locator('.huw-musical-stage').evaluate(node=>({native:node.ownerDocument.fullscreenElement===node,fallback:node.classList.contains('huw-musical-stage--expanded')}));
 assert.ok(fullscreenState.native||fullscreenState.fallback,'the stage entered its supported fullscreen mode');selectionZoom=await stage().getAttribute('viewBox');
 await dock.locator('[data-action="clear-selection"]').tap();
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'Clear selection in fullscreen');
 assert.deepEqual(await editor.locator('.huw-musical-stage').evaluate(node=>({native:node.ownerDocument.fullscreenElement===node,fallback:node.classList.contains('huw-musical-stage--expanded')})),fullscreenState,'clearing selection leaves the active fullscreen mode intact');
 await fullscreenButton.tap();await wiki.waitForFunction(()=>document.querySelector('.huw-musical-stage-fullscreen')?.getAttribute('aria-pressed')==='false');
 await assertSources(originalSources,'deselection and one-tap reselection never save a key');
 await dock.screenshot({path:fileURLToPath(new URL('figure-workshop-deselected.png',out))});
 passed('Escape, empty scene/figure taps and Clear selection preserve pose and zoom; fullscreen stays open and another part takes one tap');

 await tapFigurePart(joint);selectionZoom=await stage().getAttribute('viewBox');
 await figurePanel().focus();await rotateForearm(19,pivot,{cancel:true});
 await assertFigureCleared(initialPose,currentTime,selectionZoom,'Escape during native forearm rotation');
 await assertSources(originalSources,'Escape rolls back the live rotation before pointer release can save a key');
 await tapFigurePart(joint);
 passed('Escape during native rotation cancels the pending pose, clears both selections and saves no key');

 const degrees=23,initialRotation=Number(/rotate\(([-+\d.eE]+)/.exec(initialPose[joint].transform)?.[1]);assert.ok(Number.isFinite(initialRotation));
 await rotateForearm(degrees,pivot);
 const movedSources=await sources(),changedScene=JSON.parse(movedSources[selectedScene.source]),changedPart=changedScene.parts.find(part=>part.id===joint);
 const keyTime=Math.round(localTime*100)/100,key=changedPart.keys.find(key=>Math.abs(key.t-keyTime)<.001);
 assert.ok(key,'the gesture inserts a key at scene-local time '+keyTime+' rather than global time '+currentTime);
 assert.ok(Math.abs(key.r-(initialRotation+degrees))<.6,'the mirrored actor rotates by the requested parent-local angle');
 assert.equal(key.x,originalPart.keys[0].x);assert.equal(key.y,originalPart.keys[0].y);
 assert.deepEqual(changedPart.pivot,originalPart.pivot);assert.deepEqual(changedPart.geo,originalPart.geo);assert.equal(changedPart.parent,originalPart.parent);
 assert.equal(changedPart.keys.length,originalPart.keys.length+1,'one completed gesture writes exactly one key');
 assert.deepEqual(changedPart.keys.filter(item=>item!==key),originalPart.keys,'existing forearm keys remain intact');
 const sceneWithoutEdit=structuredClone(changedScene);sceneWithoutEdit.parts.find(part=>part.id===joint).keys=originalPart.keys;
 assert.equal(hash(sceneWithoutEdit),hash(originalScene),'only the intended joint keys change in the scene source');
 for(const [title,text] of Object.entries(originalSources))if(title!==selectedScene.source)assert.equal(hash(movedSources[title]),hash(text),'the film and every other scene remain unchanged: '+title);
 const movedPose=await actorPose(stage());assert.notEqual(movedPose[joint].transform,initialPose[joint].transform);
 assert.deepEqual(await actorPose(figurePreview()),movedPose,'the workshop and stage render the same edited pose');
 for(const scope of [stage(),figurePreview()]){
  const jointAfter=await actorPoint(scope,joint,pivot),handAfter=await actorPoint(scope,hand,{x:0,y:0});
  assert.ok(Math.hypot(jointAfter.x-jointBefore.x,jointAfter.y-jointBefore.y)<.01,'the mounted joint stays fixed in actor coordinates');
  assert.ok(Math.hypot(handAfter.x-handBefore.x,handAfter.y-handBefore.y)>5,'the attached hand follows the anatomical forearm');
 }
 assert.deepEqual(movedPose['prisoner-arm-right'],initialPose['prisoner-arm-right'],'the upper-arm pose remains intact');
 assert.ok(Math.abs(await position()-currentTime)<.001);
 passed('native rotation preserves the joint and attached hand, mirrors on stage and saves only the correct later-scene key');

 const eye=figurePreview().locator('[data-cutout-id="prisoner-pupils"] image');
 await touchPoint(await nativePoint(eye,['prisoner-pupils','prisoner-eyes','prisoner-brows','prisoner-eye-lids'],[{x:-14,y:-58}]));
 const faceWorkshop=editor.locator('.huw-face-workshop--inline:visible');await faceWorkshop.waitFor();
 assert.equal(await dock.getAttribute('data-animus-workshop'),'face');
 assert.equal(await faceWorkshop.locator('[data-face-panel]').getAttribute('data-face-target'),actor);
 assert.equal(await faceWorkshop.locator('[data-face-tab="eyes"]').getAttribute('aria-selected'),'true','touching a visible eye opens its choices in the same area');
 assert.ok(await faceWorkshop.evaluate(node=>!!node.closest('[data-animus-workshop]')));await assertSources(movedSources,'opening eye choices does not create a key');
 await faceWorkshop.locator('[data-face-channel="eyes"][data-face-value="left"]').tap();
 const eyePose=await actorPose(stage());assert.notDeepEqual(eyePose['prisoner-pupils'],movedPose['prisoner-pupils'],'the eye choice changes the visible pupil artwork');
 await faceWorkshop.locator('[data-face-back="figure"]').tap();await figurePanel().waitFor();
 assert.equal(await figurePanel().getAttribute('data-figure-actor'),actor);assert.equal(await figurePanel().getAttribute('data-figure-selected'),joint);
 assert.ok(Math.abs(await position()-currentTime)<.001);assert.deepEqual(await actorPose(figurePreview()),eyePose,'returning to the whole actor retains its current limb and eye pose');

 const beforeMouth=await sources(),mouth=figurePreview().locator('[data-cutout-id="prisoner-mouth-open"] image');
 await touchPoint(await nativePoint(mouth,['prisoner-mouth-open']));await faceWorkshop.waitFor();
 assert.equal(await faceWorkshop.locator('[data-face-tab="mouth"]').getAttribute('aria-selected'),'true');
 await assertSources(beforeMouth,'opening mouth choices is read-only');
 const rawViseme=await faceWorkshop.locator('[data-face-panel]').getAttribute('data-face-viseme');assert.ok(rawViseme);
 await faceWorkshop.locator('[data-face-channel="mouth"][data-face-value="E"]').tap();
 const faceFilm=JSON.parse((await sources())[timeline.filmTitle]),faceKey=faceFilm.musical.faceKeys.find(key=>key.actor===actor&&Math.abs(key.t-currentTime)<.001);
 assert.equal(faceKey?.eyes,'left');assert.equal(faceKey?.mouthMap?.[rawViseme],'E');
 await faceWorkshop.locator('[data-face-back="figure"]').tap();await figurePanel().waitFor();
 assert.equal(await figurePanel().getAttribute('data-figure-actor'),actor);assert.equal(await figurePanel().getAttribute('data-figure-selected'),joint);
 assert.ok(Math.abs(await position()-currentTime)<.001);
 const finalPose=await actorPose(stage());assert.deepEqual(finalPose[joint],movedPose[joint]);assert.deepEqual(await actorPose(figurePreview()),finalPose);
 finalSources=await sources();assert.equal(hash(finalSources[selectedScene.source]),hash(movedSources[selectedScene.source]),'face choices retain the committed body animation');
 passed('native eye and mouth touches share the workshop; Whole figure restores actor, selected joint, playhead and edited pose');

 await sharedFaceTab.tap();await faceWorkshop.waitFor();await faceWorkshop.locator('[data-face-tab="mouth"]').tap();
 const selectedFaceCards=await faceWorkshop.locator('[data-face-value][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(node=>({channel:node.dataset.faceChannel,value:node.dataset.faceValue}))),selectedSound=await faceWorkshop.locator('[data-face-sound][aria-pressed="true"]').getAttribute('data-face-sound');
 assert.ok(selectedFaceCards.some(card=>card.channel==='mouth'&&card.value==='E'),'the saved learned mouth is visibly selected before Escape');
 selectionZoom=await stage().getAttribute('viewBox');await faceWorkshop.focus();await page.keyboard.press('Escape');
 assert.equal(await faceWorkshop.isVisible(),true,'Escape keeps the inline face workshop open');assert.equal(await dock.getAttribute('data-animus-workshop'),'face');
 assert.equal(await faceWorkshop.locator('[data-face-tab="mouth"]').getAttribute('aria-selected'),'true');
 assert.deepEqual(await faceWorkshop.locator('[data-face-value][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(node=>({channel:node.dataset.faceChannel,value:node.dataset.faceValue}))),selectedFaceCards,'clearing selection preserves the saved expression/mouth indication');
 assert.equal(await faceWorkshop.locator('[data-face-sound][aria-pressed="true"]').getAttribute('data-face-sound'),selectedSound,'Escape preserves the letter group being edited');
 await assertSources(finalSources,'Escape in the face workshop changes no saved face or body key');
 await faceWorkshop.locator('[data-face-back="figure"]').tap();await figurePanel().waitFor();
 await assertFigureCleared(finalPose,currentTime,selectionZoom,'returning from the deselected face workshop');
 await sharedFaceTab.tap();await faceWorkshop.locator('[data-face-back="figure"]').tap();
 await assertFigureCleared(finalPose,currentTime,selectionZoom,'switching the two workshop tabs after clearing');
 await tapFigurePart(joint);await assertSources(finalSources,'returning and choosing a body part again adds no key');
 passed('Escape in the face workshop retains saved cards and sound group; returning to the figure keeps selection cleared');

 savedHtml=await wiki.evaluate(()=>$tw.wiki.renderTiddler('text/plain','$:/core/save/all'));
 assert.ok(savedHtml.includes('<html')&&savedHtml.length>1000000,'native save contains a complete reusable wiki');
 const previousPage=page;page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/saved-figure.html',{waitUntil:'domcontentloaded'});wiki=page;
 await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);await openEditor();await previousPage.close();
 await assertSources(finalSources,'native wiki save and a new document retain the complete edited sources');
 await seek(currentTime);assert.deepEqual(await actorPose(stage()),finalPose,'the saved scene resumes with the identical limb and face pose');
 await openForearm();assert.deepEqual(await actorPose(figurePreview()),finalPose,'reopening the workshop uses the saved current pose');
 await seek(timeline.scenes[0].start+.1);await seek(currentTime);assert.deepEqual(await actorPose(stage()),finalPose,'rewinding across a scene boundary returns to the edited later-scene pose');
 await openForearm();await assertSources(finalSources,'reopening and scrubbing the workshop create no additional keys');
 await editor.locator('[data-animus-workshop]').screenshot({path:fileURLToPath(new URL('figure-workshop-reloaded.png',out))});
 passed('native save, a new page and cross-scene rewind preserve the body key and facial choices');

 const captions=editor.locator('[data-preview-track="captions"]');if(await captions.getAttribute('aria-pressed')==='true')await captions.tap();
 await editor.locator('.huw-musical-zoom-selection:enabled').tap();
 const zoom=await stage().getAttribute('viewBox'),beforeExport=await sources();
 await editor.evaluate(host=>{
  window.__figureExportFrames=[];const svg=host.querySelector('.huw-musical-canvas > svg');
  window.__figureExportObserver=new MutationObserver(()=>{
   if(!/Undertekster \/ Captions/.test(document.querySelector('.huw-video-status')?.textContent||''))return;
   function shown(node){for(let n=node;n&&n!==svg;n=n.parentElement)if(n.hidden||getComputedStyle(n).display==='none')return false;return true;}
   const part=[...svg.querySelectorAll('[data-cutout-id="prisoner-forearm-right"]')].find(shown);
   window.__figureExportFrames.push({time:Number(host.dataset.cameraTime),transform:part?.getAttribute('transform'),workshopHidden:host.querySelector('[data-animus-workshop]').hidden,hiddenNodes:svg.querySelectorAll('.huw-musical-preview-hidden').length,captionsHidden:host.querySelector('.huw-musical-caption-overlay').hidden,previewNodes:svg.querySelectorAll('[data-figure-preview]').length});
  });window.__figureExportObserver.observe(svg,{attributes:true,attributeFilter:['viewBox']});
 });
 await editor.locator('.huw-video-export-button').tap();const dialog=wiki.locator('.huw-video-modal');await dialog.waitFor();
 for(const id of ['video','music','speech','effects','captions'])await dialog.locator('[data-export-file="'+id+'"]').setChecked(id==='captions');
 await dialog.locator('.huw-video-range input').nth(0).fill(String(currentTime));await dialog.locator('.huw-video-range input').nth(1).fill(String(currentTime+.12));
 await dialog.locator('.huw-video-primary').tap();await wiki.waitForFunction(()=>/Filer klar:|Files ready:|Eksportfejl:|Export error:/.test(document.querySelector('.huw-video-status')?.textContent||''));
 assert.match(await dialog.locator('.huw-video-status').textContent(),/Filer klar:|Files ready:/);
 const frames=await wiki.evaluate(()=>{window.__figureExportObserver.disconnect();return window.__figureExportFrames;});
 assert.ok(frames.length,'the actual shared export renderer visits the edited pose');
 // Each export frame has its own clock. The editor rounds a new scene key
 // to .01 s, so the initial cursor can still lie just before that key while
 // subsequent export frames have reached it. Check the saved source at each
 // observed frame time, retaining exact restoration checks below.
 const expectedFrames=await wiki.evaluate(({title,id,start,times})=>{
  const Engine=$tw.modules.execute('$:/plugins/huwiki/cutout/engine.js'),scene=JSON.parse($tw.wiki.getTiddlerText(title)),part=scene.parts.find(part=>part.id===id),pivot=part.pivot||{x:0,y:0};
  return times.map(time=>{const state=Engine.state(part,time-start);return [state.x,state.y,state.r,state.sx,state.sy,-(pivot.x||0),-(pivot.y||0)];});
 },{title:selectedScene.source,id:joint,start:selectedScene.start,times:frames.map(frame=>frame.time)});
 frames.forEach((frame,index)=>{const values=(frame.transform?.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)||[]).map(Number),expected=expectedFrames[index];
  assert.equal(values.length,expected.length,'the export frame has a complete joint transform');
  assert.ok(values.every((value,i)=>Math.abs(value-expected[i])<1e-8),'export renders the saved forearm pose at frame time '+frame.time+': '+JSON.stringify({actual:values,expected}));
 });
 assert.ok(frames.every(frame=>frame.workshopHidden&&!frame.hiddenNodes&&!frame.captionsHidden&&!frame.previewNodes),'export suspends the workshop and temporary preview hiding');
 await dialog.locator('.huw-video-close').tap();await dialog.waitFor({state:'detached'});await figurePanel().waitFor();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await editor.locator('[data-animus-workshop]').getAttribute('data-animus-workshop'),'figure');
 assert.equal(await figurePanel().getAttribute('data-figure-actor'),actor);assert.equal(await figurePanel().getAttribute('data-figure-selected'),joint);
 assert.equal(await stage().getAttribute('viewBox'),zoom);assert.equal(await captions.getAttribute('aria-pressed'),'false');assert.ok(Math.abs(await position()-currentTime)<.001);
 assert.deepEqual(await actorPose(stage()),finalPose);assert.deepEqual(await actorPose(figurePreview()),finalPose);await assertSources(beforeExport,'export and restoration do not change any animation source');
 passed('actual export rendering suspends the workshop and restores its selection, pose, playhead, zoom and hidden captions');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 await writeFile(new URL('result.json',out),JSON.stringify({ok:true,route:'/demo/?edition=turn-around&lang=da',checks,errors,actor,joint,scene:selectedScene.source,currentTime,localTime,key,faceKey,sourceHashes:sourceHashes(finalSources),exportFrames:frames},null,2)+'\n');
 console.log('FIGURE ACCEPTANCE '+JSON.stringify({ok:true,checks:checks.length}));
}catch(error){
 let details=null;try{details=await (wiki||page)?.evaluate(()=>({workshop:document.querySelector('[data-animus-workshop]')?.getAttribute('data-animus-workshop'),figure:document.querySelector('[data-figure-panel]')?.textContent,actor:document.querySelector('[data-figure-panel]')?.getAttribute('data-figure-actor'),part:document.querySelector('[data-figure-panel]')?.getAttribute('data-figure-selected'),status:document.querySelector('.huw-musical-status')?.textContent,inputEvents:window.__figureInputEvents||[],tapTargets:window.__figureTapTargets||[]}));if(page)await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,details,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{
 if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}

