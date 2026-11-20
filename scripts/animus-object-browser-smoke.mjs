import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// The ordinary assembled demo must offer the same current-time editing for
// scenery and props as for characters. Use its real horse shadow, touch UI,
// native pointer gestures and appearance file input; observe saved sources.
const root=new URL('../',import.meta.url),out=new URL('../test-results/animus/object/',import.meta.url),objectId='shadow-horse';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright-core');}catch(_){try{playwright=require('playwright');}catch(_){
 if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install playwright-core for object browser acceptance');
 const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
}}
let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath)for(const candidate of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(candidate);executablePath=candidate;break;}catch(_){}
await mkdir(out,{recursive:true});
const requestedPaths=new Set(),checks=[],errors=[];let savedHtml='';
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;requestedPaths.add(pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 try{
  let body;if(pathname==='/saved-object.html'&&savedHtml)body=savedHtml;else{const file=new URL('.'+decodeURIComponent(pathname).replace(/\/$/,'/index.html'),root);if(!file.href.startsWith(root.href))throw Error('Outside repository');body=await readFile(file);}
  const type=/\.html$/.test(pathname)||pathname.endsWith('/')?'text/html; charset=utf-8':/\.m?js$/.test(pathname)?'text/javascript; charset=utf-8':/\.css$/.test(pathname)?'text/css':'application/json';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch(_){res.writeHead(404);res.end('Not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const base='http://127.0.0.1:'+server.address().port,hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
let browser,context,page,wiki,editor,timeline,sceneTitle,currentTime;
function passed(name){checks.push(name);console.log('PASS '+name);}
function sourceHashes(values){return Object.fromEntries(Object.entries(values).map(([title,text])=>[title,hash(text)]));}
async function sources(){return wiki.evaluate(titles=>Object.fromEntries(titles.map(title=>[title,$tw.wiki.getTiddlerText(title)])),[timeline.filmTitle,...timeline.scenes.map(scene=>scene.source)]);}
async function assertSources(expected,message){assert.deepEqual(sourceHashes(await sources()),sourceHashes(expected),message);}
async function position(){return Number(await editor.locator('.huw-musical-range').inputValue());}
async function seek(time){await editor.locator('.huw-musical-range').evaluate((input,t)=>{input.value=String(t);input.dispatchEvent(new Event('input',{bubbles:true}));},time);}
function stage(){return editor.locator('.huw-musical-canvas > svg');}
function dock(){return editor.locator('[data-animus-workshop]');}
function panel(){return editor.locator('[data-figure-panel]:visible');}
function preview(){return panel().locator('[data-figure-preview]');}
function appearance(){return editor.locator('.huw-puppet-workshop');}
async function openEditor(){
 await wiki.locator('.plato-player').first().waitFor();editor=wiki.locator('.plato-native-studio.huw-musical');
 if(!await editor.count())await wiki.locator('.plato-home .plato-native-link a').click();
 await editor.locator('.huw-musical-play:enabled').waitFor();await editor.locator('.huw-musical-view-mode').selectOption('stage');
}
async function chooseObject(){const picker=editor.locator('.huw-musical-object-picker');await picker.focus();await picker.selectOption(objectId);await panel().waitFor();assert.equal(await panel().getAttribute('data-figure-actor'),objectId);assert.equal(await panel().getAttribute('data-figure-kind'),'object');}
async function offset(){if(wiki===page)return {x:0,y:0};const frame=await wiki.frameElement(),box=await frame.boundingBox(),border=await frame.evaluate(node=>({x:node.clientLeft,y:node.clientTop}));assert.ok(box);return {x:box.x+border.x,y:box.y+border.y};}
async function touch(point){const frame=await offset();await page.touchscreen.tap(point.x+frame.x,point.y+frame.y);}
async function paintedPoint(locator){
 await locator.scrollIntoViewIfNeeded();let previous=null,last=[];
 for(let attempt=0;attempt<60;attempt++){
  last=await locator.evaluate(node=>{
   const bb=node.getBBox(),matrix=node.getScreenCTM(),scope=node.closest('[data-figure-preview]'),controls=scope?[...scope.querySelectorAll('[data-figure-action]')].map(control=>control.getBoundingClientRect()).filter(box=>box.width&&box.height):[];
   return [.15,.3,.45,.6,.75,.85].flatMap(y=>[.2,.35,.5,.65,.8].map(x=>{
    const p=node.ownerSVGElement.createSVGPoint();p.x=bb.x+bb.width*x;p.y=bb.y+bb.height*y;const screen=p.matrixTransform(matrix),hit=node.ownerDocument.elementFromPoint(screen.x,screen.y);
    const clearance=controls.length?Math.min(...controls.map(box=>Math.hypot(Math.max(box.left-screen.x,0,screen.x-box.right),Math.max(box.top-screen.y,0,screen.y-box.bottom)))):1e9;
    return {x:screen.x,y:screen.y,hit:hit?.closest('[data-cutout-id]')?.getAttribute('data-cutout-id'),clearance};
   }));
  });
  const point=last.filter(point=>point.hit===objectId&&point.clearance>=16).sort((a,b)=>b.clearance-a.clearance)[0];
  if(point&&previous&&Math.hypot(point.x-previous.x,point.y-previous.y)<.5)return point;previous=point;await page.waitForTimeout(50);
 }
 assert.fail('the actual horse artwork offers a stable native input point away from its handle: '+JSON.stringify(last));
}
async function rendered(scope){return scope.evaluate((host,id)=>{
 function shown(node){for(let parent=node;parent&&parent!==host;parent=parent.parentElement)if(parent.hidden||getComputedStyle(parent).display==='none')return false;return true;}
 const node=[...host.querySelectorAll('[data-cutout-id="'+id+'"]')].find(shown);if(!node)return null;const shape=[...node.children].find(child=>['path','image','rect','ellipse','circle'].includes(child.localName));
 return {transform:node.getAttribute('transform'),opacity:node.getAttribute('opacity'),shape:shape?.localName,d:shape?.getAttribute('d'),fill:shape?.getAttribute('fill'),href:shape?.getAttribute('href')};
},objectId);}
async function moveObject(dx,dy){
 const target=preview().locator('[data-cutout-id="'+objectId+'"] > path'),start=await paintedPoint(target),end=await target.evaluate((node,arg)=>{const matrix=node.parentNode.parentNode.getScreenCTM(),p=node.ownerSVGElement.createSVGPoint();p.x=arg.start.x;p.y=arg.start.y;const local=p.matrixTransform(matrix.inverse());p.x=local.x+arg.dx;p.y=local.y+arg.dy;const at=p.matrixTransform(matrix);return {x:at.x,y:at.y};},{start,dx,dy}),frame=await offset();
 await page.mouse.move(start.x+frame.x,start.y+frame.y);await page.mouse.down();for(let step=1;step<=12;step++)await page.mouse.move(start.x+(end.x-start.x)*step/12+frame.x,start.y+(end.y-start.y)*step/12+frame.y);await page.mouse.up();
}
async function rotateObject(degrees,pivot){
 const handle=panel().locator('[data-figure-action="rotate"]');await handle.scrollIntoViewIfNeeded();const start=await handle.evaluate(node=>{const box=node.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;return {x,y,action:node.ownerDocument.elementFromPoint(x,y)?.getAttribute('data-figure-action')};});assert.equal(start.action,'rotate');
 const points=await preview().locator('[data-cutout-id="'+objectId+'"]').first().evaluate((node,arg)=>{
  const matrix=node.parentNode.getScreenCTM(),inverse=matrix.inverse(),point=(x,y,m)=>{const p=node.ownerSVGElement.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(m);},screen=point(arg.pivot.x,arg.pivot.y,node.getScreenCTM()),center=point(screen.x,screen.y,inverse),first=point(arg.start.x,arg.start.y,inverse),dx=first.x-center.x,dy=first.y-center.y;
  return Array.from({length:16},(_,index)=>{const angle=arg.degrees*Math.PI/180*(index+1)/16,p=point(center.x+dx*Math.cos(angle)-dy*Math.sin(angle),center.y+dx*Math.sin(angle)+dy*Math.cos(angle),matrix);return {x:p.x,y:p.y};});
 },{start,pivot,degrees});
 const frame=await offset();await page.mouse.move(start.x+frame.x,start.y+frame.y);await page.mouse.down();for(const point of points)await page.mouse.move(point.x+frame.x,point.y+frame.y);await page.mouse.up();
}

try{
 browser=await playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});context=await browser.newContext({viewport:{width:1540,height:1100},hasTouch:true,acceptDownloads:true});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});await context.route('https://**/*',route=>route.abort());page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/demo/?edition=turn-around&lang=da',{waitUntil:'domcontentloaded'});await page.locator('#wiki').waitFor({state:'visible',timeout:90000});wiki=await (await page.locator('#wiki').elementHandle()).contentFrame();assert.ok(wiki);
 await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);timeline=await wiki.locator('.plato-player').first().evaluate(host=>host._platoPlayer.getTimeline());
 for(const path of ['/demo/demo.mjs','/assembler/compose.mjs','/library/plugins/registry.json','/editions/turn-around/manifest.json'])assert.ok(requestedPaths.has(path),'the ordinary demo loads '+path);
 await openEditor();sceneTitle=timeline.scenes[0].source;assert.equal(timeline.scenes[0].start,0);const originalSources=await sources(),originalScene=JSON.parse(originalSources[sceneTitle]),originalObject=originalScene.parts.find(part=>part.id===objectId);assert.ok(originalObject&&originalObject.type==='path');assert.equal(originalObject.keys[0].opacity,0);
 await seek(1);currentTime=await position();assert.equal(currentTime,1);const initialPose=await rendered(stage());assert.ok(initialPose&&Number(initialPose.opacity)>0,'the real horse is visible at the selected time, unlike its first key');
 await chooseObject();assert.equal(await dock().getAttribute('data-workshop-kind'),'object');assert.equal((await dock().locator('[data-workshop-mode="figure"]').textContent()).trim(),'Objekt');assert.equal(await dock().locator('[data-workshop-mode="face"]').isVisible(),false,'a plain shadow does not offer facial controls');assert.deepEqual(await rendered(preview()),initialPose);
 const fitted=await preview().evaluate((svg,id)=>{const canvas=svg.getBoundingClientRect(),node=svg.querySelector('[data-cutout-id="'+id+'"]'),box=node.getBoundingClientRect();return {width:canvas.width,height:canvas.height,objectWidth:box.width,objectHeight:box.height,inside:box.left>=canvas.left-2&&box.top>=canvas.top-2&&box.right<=canvas.right+2&&box.bottom<=canvas.bottom+2};},objectId);
 assert.ok(fitted.width>=400&&fitted.height>=300&&fitted.objectHeight>=180&&fitted.inside,'the full shadow is large and framed for editing: '+JSON.stringify(fitted));
 await touch(await paintedPoint(preview().locator('[data-cutout-id="'+objectId+'"] > path')));assert.equal(await panel().getAttribute('data-figure-selected'),objectId);await assertSources(originalSources,'opening and touching the live object creates no key');
 await panel().locator('[data-object-appearance]').tap();await appearance().waitFor();const structural=appearance().locator('.huw-puppet-canvas > svg');assert.equal(await structural.getAttribute('data-preview-time'),'1');assert.equal(await structural.getAttribute('data-preview-revealed'),'false');assert.deepEqual(await rendered(structural),initialPose,'the appearance draft opens the current pose instead of the invisible first frame');
 await appearance().locator('.huw-puppet-cancel').tap();await appearance().waitFor({state:'detached'});await assertSources(originalSources,'cancelling an untouched appearance draft leaves all source data unchanged');assert.equal(await position(),currentTime);
 await dock().screenshot({path:fileURLToPath(new URL('horse-object-current-pose.png',out))});passed('the real horse opens large at the current time, and its appearance draft cancels without writing a key');

 const initialState=await wiki.evaluate(({title,id,time})=>{const Engine=$tw.modules.execute('$:/plugins/huwiki/cutout/engine.js'),part=JSON.parse($tw.wiki.getTiddlerText(title)).parts.find(part=>part.id===id);return Engine.state(part,time);},{title:sceneTitle,id:objectId,time:currentTime});
 await moveObject(48,-20);await rotateObject(23,originalObject.pivot||{x:0,y:0});const movedSources=await sources(),movedScene=JSON.parse(movedSources[sceneTitle]),movedObject=movedScene.parts.find(part=>part.id===objectId),key=movedObject.keys.find(key=>Math.abs(key.t-currentTime)<.001);assert.ok(key);
 assert.ok(Math.abs(key.x-(Math.round((initialState.x+48)*100)/100))<.1);assert.ok(Math.abs(key.y-(Math.round((initialState.y-20)*100)/100))<.1);assert.ok(Math.abs(key.r-(initialState.r+23))<.5);assert.equal(key.opacity,initialState.opacity);assert.equal(movedObject.keys.length,originalObject.keys.length+1,'both gestures edit the same current-time key');
 assert.deepEqual(movedObject.keys.filter(item=>item!==key),originalObject.keys);assert.equal(movedObject.id,originalObject.id);assert.deepEqual(movedObject.parent,originalObject.parent);assert.deepEqual(movedObject.pivot,originalObject.pivot);
 const unchanged=structuredClone(movedScene);unchanged.parts.find(part=>part.id===objectId).keys=originalObject.keys;assert.deepEqual(unchanged,originalScene,'only the horse key changes; camera and other parts stay intact');for(const [title,text] of Object.entries(originalSources))if(title!==sceneTitle)assert.equal(hash(movedSources[title]),hash(text));
 assert.deepEqual(await rendered(preview()),await rendered(stage()));assert.equal(await position(),currentTime);
 await panel().locator('[data-object-properties]').tap();const properties=editor.locator('.huw-musical-inspector-drawer');assert.equal(await properties.isVisible(),true);
 await properties.locator('.huw-musical-key-actions button').first().tap();assert.equal(await properties.isVisible(),true,'choosing the existing playhead key from Properties keeps the numeric controls open');await assertSources(movedSources,'choosing an existing object key does not create a duplicate or alter its values');await properties.locator('.huw-musical-inspector-close').tap();
 passed('native object movement and rotation save one current-time key while preserving camera, other objects and opacity');

 await panel().locator('[data-object-appearance]').tap();await appearance().waitFor();const replacement='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -85 162 151"><path fill="#6e2b26" d="'+originalObject.geo.d+'"/></svg>';
 await appearance().locator('input[type="file"]').setInputFiles({name:'horse-shadow-replacement.svg',mimeType:'image/svg+xml',buffer:Buffer.from(replacement)});await appearance().locator('.huw-puppet-canvas [data-cutout-id="'+objectId+'"] > image').waitFor();
 await assertSources(movedSources,'replacement stays in the appearance draft until Save');await appearance().locator('.huw-puppet-save').tap();await appearance().waitFor({state:'detached'});
 const finalSources=await sources(),finalScene=JSON.parse(finalSources[sceneTitle]),finalObject=finalScene.parts.find(part=>part.id===objectId);assert.equal(finalObject.type,'image');assert.equal(finalObject.id,movedObject.id);assert.deepEqual(finalObject.parent,movedObject.parent);assert.deepEqual(finalObject.pivot,movedObject.pivot);assert.deepEqual(finalObject.keys,movedObject.keys,'appearance replacement preserves every animation key');
 const withoutAppearance=structuredClone(finalScene);withoutAppearance.parts[withoutAppearance.parts.findIndex(part=>part.id===objectId)]=movedObject;assert.deepEqual(withoutAppearance,movedScene);for(const [title,text] of Object.entries(movedSources))if(title!==sceneTitle)assert.equal(hash(finalSources[title]),hash(text));
 const variant=finalObject.variants.find(variant=>variant.id===finalObject.variantId);assert.ok(variant?.asset,'Save installs the imported artwork as a reusable asset');const asset=await wiki.evaluate(title=>{const t=$tw.wiki.getTiddler(title);return t?{type:t.fields.type,text:t.fields.text}:null;},variant.asset);assert.equal(asset?.type,'image/svg+xml');assert.ok(decodeURIComponent(asset.text).includes(replacement));
 await panel().locator('[data-object-appearance]').tap();await appearance().waitFor();assert.equal(await appearance().locator('.huw-puppet-canvas > svg').getAttribute('data-preview-time'),'1');assert.equal((await rendered(appearance().locator('.huw-puppet-canvas > svg'))).shape,'image');await appearance().locator('.huw-puppet-cancel').tap();await appearance().waitFor({state:'detached'});await assertSources(finalSources,'reopening and cancelling the saved replacement creates no further edit');
 savedHtml=await wiki.evaluate(()=>$tw.wiki.renderTiddler('text/plain','$:/core/save/all'));assert.ok(savedHtml.length>1000000&&savedHtml.includes('<html'));
 const previous=page;page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/saved-object.html',{waitUntil:'domcontentloaded'});wiki=page;await wiki.waitForFunction(()=>window.$tw?.wiki&&document.querySelector('.plato-player')?._platoPlayer);await openEditor();await previous.close();await seek(currentTime);await chooseObject();await assertSources(finalSources,'a saved complete wiki retains the replacement and the exact object animation');assert.equal((await rendered(preview())).shape,'image');assert.deepEqual(await rendered(preview()),await rendered(stage()));
 passed('real SVG replacement preserves object identity and animation through appearance Save/reopen and a saved wiki');

 const beforeEscape=await rendered(preview()),viewBox=await stage().getAttribute('viewBox');await panel().focus();await page.keyboard.press('Escape');assert.equal(await panel().getAttribute('data-figure-selected'),'');assert.equal(await panel().getAttribute('data-figure-actor'),objectId);assert.equal(await panel().locator('.huw-musical-figure-overlay').isVisible(),false);assert.equal(await stage().locator('.huw-musical-transform-overlay').isVisible(),false);assert.deepEqual(await rendered(preview()),beforeEscape);assert.equal(await position(),currentTime);assert.equal(await stage().getAttribute('viewBox'),viewBox);
 await seek(0);assert.equal((await rendered(stage())).opacity,'0');assert.equal((await rendered(preview())).opacity,'0');assert.equal(await panel().locator('[data-object-visibility]').isVisible(),true);const guide=panel().locator('[data-figure-ghost]');assert.equal(await guide.isVisible(),false);await panel().locator('[data-object-reveal]').tap();assert.equal(await guide.isVisible(),true);assert.equal((await rendered(preview())).opacity,'0');assert.equal((await rendered(stage())).opacity,'0');assert.match(await panel().locator('[data-object-visibility]').textContent(),/stadig usynligt i animationen/);await assertSources(finalSources,'Escape and the optional zero-opacity guide never change saved visibility or animation');
 await seek(currentTime);assert.equal(await guide.isVisible(),false);await chooseObject();await dock().screenshot({path:fileURLToPath(new URL('horse-object-saved-replacement.png',out))});passed('Escape keeps the object dock open, and an explicit guide reveals an invisible object without changing its saved opacity');
 assert.deepEqual(errors,[],'no uncaught browser errors');await writeFile(new URL('result.json',out),JSON.stringify({ok:true,route:'/demo/?edition=turn-around&lang=da',checks,errors,objectId,sceneTitle,currentTime,key,asset:variant.asset,sourceHashes:sourceHashes(finalSources)},null,2)+'\n');console.log('OBJECT ACCEPTANCE '+JSON.stringify({ok:true,checks:checks.length}));
}catch(error){
 let details=null;try{details=await (wiki||page)?.evaluate(()=>({workshop:document.querySelector('[data-animus-workshop]')?.getAttribute('data-workshop-kind'),actor:document.querySelector('[data-figure-panel]')?.getAttribute('data-figure-actor'),selected:document.querySelector('[data-figure-panel]')?.getAttribute('data-figure-selected'),time:document.querySelector('.huw-musical-range')?.value,appearance:document.querySelector('.huw-puppet-workshop')?.textContent.slice(0,2500)}));if(page)await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:false});}catch(_){}
 await writeFile(new URL('result.json',out),JSON.stringify({ok:false,checks,errors,details,failure:String(error.stack||error)},null,2)+'\n');throw error;
}finally{if(context)try{await context.tracing.stop({path:fileURLToPath(new URL('trace.zip',out))});}catch(_){}if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
