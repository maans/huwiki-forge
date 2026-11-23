import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseToolbarItem} from './helpers/animus-toolbar.mjs';
import {serveDemo} from './helpers/animus-demo-server.mjs';

test('Turn Around stays editable after touch, mouse, backward seeks and playback in mobile WebKit',
 {skip:process.env.ANIMUS_WEBKIT_TESTS!=='1',timeout:120000},async t=>{
 const {webkit,devices}=await import('playwright-core');
 const base=await serveDemo(t);
 const browser=await webkit.launch();
 t.after(()=>browser.close());
 const context=await browser.newContext(devices['iPad Pro 11 landscape']);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/demo/?edition=turn-around&lang=da');
 const wiki=page.frameLocator('#wiki');
 await wiki.locator('.plato-player').first().waitFor();
 // Recorded takes are detached media elements. Observe the native play calls
 // so a moving picture with a silent, failed soundtrack cannot pass.
 await wiki.locator('.plato-player').first().evaluate(()=>{
  const play=HTMLMediaElement.prototype.play;
  window.testRecordings=new Set();
  HTMLMediaElement.prototype.play=function(){
   if(this instanceof HTMLAudioElement)window.testRecordings.add(this);
   return play.call(this);
  };
 });
 await wiki.locator('.plato-home .plato-native-link a').click();
 const editor=wiki.locator('.plato-native-studio.huw-musical'),range=editor.locator('.huw-musical-range');
 const play=editor.locator('.huw-musical-play'),stop=editor.locator('.huw-musical-stop');
 await play.waitFor();
 assert.equal(await editor.getAttribute('data-preview-mode'),'split');
 await editor.locator('.huw-musical-score-page:not([hidden]) .abcjs-note').first().waitFor();
 const noteHead=editor.locator('.huw-musical-score-page:not([hidden]) .abcjs-l0.abcjs-v0.abcjs-m1.abcjs-n0 .abcjs-notehead').first();
 await noteHead.scrollIntoViewIfNeeded();
 const noteBox=await noteHead.boundingBox();
 await page.touchscreen.tap(noteBox.x-4,noteBox.y+noteBox.height/2);
 assert.equal(await editor.getAttribute('data-camera-time'),'2.67');
 const marker=editor.locator('.huw-musical-ruler-cursor');
 assert.ok(await marker.isVisible());
 assert.ok(Math.abs(await marker.evaluate(node=>parseFloat(node.style.left))*Number(await range.getAttribute('max'))/100-8/3)<.01);
 const lane=editor.locator('[data-track-id="lights"] .huw-musical-lane');
 const width=await lane.evaluate(node=>node.getBoundingClientRect().width);
 for(const [action,ratio] of [['tap',.18],['click',.76],['tap',.10]]){
  const x=Math.round(width*ratio);
  await lane[action]({position:{x,y:4},timeout:5000});
  const time=Number(await range.inputValue()),duration=Number(await range.getAttribute('max'));
  assert.ok(Math.abs(time/duration-ratio)<.015,'the cursor follows the point touched or clicked');
  assert.equal(await editor.getAttribute('data-camera-time'),time.toFixed(2));
  assert.ok(await editor.locator('.huw-musical-canvas [data-cutout-id="prisoner"]').count()<=1,'inactive copies stay offstage');
 }
 for(let run=0;run<2;run++){
  const start=Number(await range.inputValue());
  await play.tap({timeout:5000});
  await page.waitForFunction(start=>{
   const frame=document.querySelector('#wiki').contentDocument;
   return Number(frame.querySelector('.huw-musical-range').value)>start+.4;
  },start,{timeout:5000});
  await page.waitForFunction(()=>{
   const media=document.querySelector('#wiki').contentWindow.testRecordings;
   return [...media].some(a=>!a.paused&&!a.muted&&!a.error&&a.readyState>=2&&a.currentTime>.1);
  },null,{timeout:5000});
  await stop.click({timeout:5000});
  assert.equal(Number(await range.inputValue()),0);
  assert.equal(await editor.getAttribute('data-playing'),'false');
 }
 const header=editor.locator('.huw-musical-appbar'),tools=header.locator('[data-menu="tools"]');
 const workshops=header.getByRole('button',{name:'Værksteder',exact:true}),view=header.getByRole('button',{name:'Visning',exact:true});
 assert.equal(await header.getByRole('button').count(),3);
 assert.equal(await tools.textContent(),'Dele og led');
 await workshops.tap();assert.equal(await header.locator('.huw-musical-manuscript-button').isVisible(),true);
 await view.tap();assert.equal(await workshops.getAttribute('aria-expanded'),'false');
 await header.locator('[data-preview="split"]').click();assert.equal(await editor.getAttribute('data-preview-mode'),'split');
 assert.equal(await view.getAttribute('aria-expanded'),'false');
 await workshops.focus();await page.keyboard.press('Space');await page.keyboard.press('Tab');
 assert.equal(await header.locator('.huw-musical-manuscript-button').evaluate(b=>b===b.ownerDocument.activeElement),true);
 await page.keyboard.press('ArrowDown');
 assert.equal(await header.locator('.huw-musical-assets-button').evaluate(b=>b===b.ownerDocument.activeElement),true);
 await page.keyboard.press('ArrowDown');
 assert.equal(await header.locator('.huw-musical-scenes-button').evaluate(b=>b===b.ownerDocument.activeElement),true);
 await page.keyboard.press('Home');
 assert.equal(await header.locator('.huw-musical-manuscript-button').evaluate(b=>b===b.ownerDocument.activeElement),true);
 await page.keyboard.press('Escape');assert.equal(await workshops.getAttribute('aria-expanded'),'false');
 assert.equal(await workshops.evaluate(b=>b===b.ownerDocument.activeElement),true);
 assert.equal(await tools.textContent(),'Dele og led','Escape in a menu preserves the editing tool');
 await tools.tap();await page.keyboard.press('Escape');
 assert.equal(await tools.getAttribute('aria-expanded'),'false','a hardware keyboard can dismiss a menu opened by touch');
 await workshops.tap();await lane.tap({position:{x:Math.round(width*.2),y:4}});
 assert.equal(await workshops.getAttribute('aria-expanded'),'false');
 await tools.tap();await editor.locator('.huw-musical-parts-button').tap({timeout:5000});
 await lane.tap({position:{x:Math.round(width*.25),y:4},timeout:5000});
 assert.ok(Number(await range.inputValue())>100);
 await editor.locator('[data-track-id="lights"] .huw-musical-lane-title').click({timeout:5000});
 const intensity=editor.getByLabel('Lysstyrke',{exact:true});
 await intensity.fill('0.35');await intensity.press('Tab');
 assert.equal(await editor.evaluate(()=>JSON.parse(window.$tw.wiki.getTiddlerText('Turn Around · Complete performance (film)')).musical.lighting.keys[0].intensity),.35);
 // Exercise the compact controls in portrait with the same assembled wiki.
 await page.setViewportSize({width:834,height:1194});
 const playback=editor.locator('[data-menu="playback"]');
 await playback.tap();
 const options=editor.locator('.huw-musical-playback-options');
 await options.waitFor({state:'visible'});
 await playback.tap();await options.waitFor({state:'hidden',timeout:3000});
 await playback.tap();
 await options.locator('.huw-musical-speed').selectOption('125');
 await options.locator('[data-huw-animus-captions="language"]').selectOption('en');
 assert.equal(await options.locator('.huw-musical-speed').inputValue(),'125');
 await header.locator('.huw-musical-brand').tap();await options.waitFor({state:'hidden',timeout:3000});
 await editor.locator('.huw-musical-filter').selectOption('camera');
 const groups=await editor.locator('.huw-musical-track[data-group]').evaluateAll(rows=>rows.map(row=>row.dataset.group));
 assert.ok(groups.length>0&&groups.every(group=>group==='camera'));
 await editor.locator('.huw-musical-filter').selectOption('all');
 const stageZoom=editor.locator('[data-menu="stage-zoom"]');
 await stageZoom.tap();assert.equal(await editor.locator('.huw-musical-reset-preview-zoom').isVisible(),true);
 await page.keyboard.press('Escape');
 async function openWorkshop(selector){await chooseToolbarItem(editor,'workshops',selector,'tap');}
 const clip=editor.locator('.huw-musical-song-clip').first();
 await clip.press('Space');
 const clipOptions=editor.locator('.huw-musical-song-options');
 assert.equal(await editor.locator('.huw-musical-edit-score').isVisible(),true);
 await clipOptions.locator('summary').press('Space');
 assert.equal(await clipOptions.locator('button:visible').count(),5);
 assert.equal(await editor.getAttribute('data-playing'),'false');
 await editor.locator('.huw-musical-inspector-close').tap();
 await openWorkshop('.huw-musical-manuscript-button');
 const script=editor.locator('.huw-script-workshop');
 assert.equal(await script.locator('.huw-script-common').isVisible(),false);
 await script.locator('.huw-script-appearance summary').tap();
 assert.equal(await script.locator('.huw-script-common input:visible').count(),4);
 await script.locator('.huw-script-header-actions .huw-script-secondary').tap();
 await openWorkshop('.huw-musical-scenes-button');
 const scenes=editor.locator('.huw-scene-workshop');
 await scenes.locator('.huw-scene-order summary').tap();
 assert.equal(await scenes.locator('.huw-scene-order button:visible').count(),2);
 await scenes.getByRole('button',{name:'Annuller',exact:true}).tap();
 await openWorkshop('.huw-musical-draw-button');
 const drawing=editor.locator('.huw-svg-workshop');
 const tool=drawing.locator('.huw-svg-tool-select');
 assert.equal(await tool.locator('option').count(),7);
 await tool.selectOption('rect');assert.equal(await drawing.locator('.huw-svg-canvas').getAttribute('data-tool'),'rect');
 await drawing.locator('.huw-svg-frame-options summary').tap();
 assert.equal(await drawing.locator('.huw-svg-frame-options input:visible').count(),5);
 await drawing.getByRole('button',{name:'Annuller',exact:true}).tap();
 await openWorkshop('.huw-musical-score-button');
 const score=editor.locator('.huw-score-workshop');
 await score.locator('.huw-score-files summary').tap();
 assert.equal(await score.getByRole('button',{name:'Gem kopi',exact:true}).isVisible(),true);
 assert.equal(await score.locator('.huw-score-import input').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await score.locator('.huw-score-files').getAttribute('open'),null);
 await score.getByRole('button',{name:'Annuller',exact:true}).tap();
 await openWorkshop('.huw-musical-audio-button');
 const audio=editor.locator('.huw-narration-workshop');
 assert.equal(await audio.locator('.huw-narration-record-controls button:visible').count(),1);
 await audio.locator('.huw-narration-list button').first().tap();
 assert.equal(await audio.locator('.huw-narration-record-controls button:visible').count(),2,'selecting a take exposes re-record');
 await audio.getByRole('button',{name:'Annuller',exact:true}).tap();
 assert.deepEqual(errors,[]);
});

test('a cropped limb paints the same pixels on the stage and in the puppet workshop',
 {skip:process.env.ANIMUS_WEBKIT_TESTS!=='1',timeout:30000},async t=>{
 const {webkit,devices}=await import('playwright-core');
 const browser=await webkit.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage(devices['iPad Pro 11 landscape']);
 const styles=await readFile(new URL('../plugins/musical/src/styles.css',import.meta.url),'utf8');
 function puppet(id){
  return `<svg width="80" height="80" viewBox="0 0 80 80">
   <defs><g id="${id}"><rect width="10" height="10" fill="red"/>
    <rect y="10" width="10" height="10" fill="lime"/></g></defs>
   <rect width="80" height="80" fill="blue"/>
   <g data-cutout-id="shoulder"><svg x="10" y="10" width="10" height="10" overflow="hidden" viewBox="0 0 10 10">
    <use href="#${id}"/></svg>
    <g data-cutout-id="elbow"><svg x="30" y="10" width="10" height="10" overflow="hidden" viewBox="0 10 10 10">
     <use href="#${id}"/></svg></g></g></svg>`;
 }
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}
 .probe{position:relative!important;inset:auto!important;width:80px!important;height:80px!important;
 min-width:80px!important;min-height:80px!important;margin:0!important;border:0!important;padding:0!important}
 </style><div class="huw-musical--workspace"><div class="huw-musical-canvas probe">${puppet('stage-source')}</div></div>
 <div class="huw-puppet-workshop probe"><div class="huw-puppet-canvas probe">${puppet('workshop-source')}</div></div>`);
 for(const selector of ['.huw-musical-canvas','.huw-puppet-canvas']){
  const screenshot=await page.locator(selector+' > svg').screenshot({scale:'css'});
  const pixels=await page.evaluate(async data=>{
   const image=new Image();
   image.src='data:image/png;base64,'+data;
   await image.decode();
   const canvas=document.createElement('canvas');
   canvas.width=image.width;canvas.height=image.height;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   return [[15,15],[15,25],[35,15],[35,5]].map(([x,y])=>Array.from(context.getImageData(x,y,1,1).data));
  },screenshot.toString('base64'));
  assert.deepEqual(pixels,[[255,0,0,255],[0,0,255,255],[0,255,0,255],[0,0,255,255]],selector);
 }
});

test('a fitted workshop preview leaves the skeleton button reachable by touch in split view',
 {skip:process.env.ANIMUS_WEBKIT_TESTS!=='1',timeout:30000},async t=>{
 const {webkit,devices}=await import('playwright-core');
 const browser=await webkit.launch();
 t.after(()=>browser.close());
 const page=await browser.newPage(devices['iPad Pro 11 landscape']);
 const styles=await readFile(new URL('../plugins/musical/src/styles.css',import.meta.url),'utf8');
 // The stage-sized transparent background extends above a zoomed-in viewBox.
 await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
 <style>${styles}.huw-puppet-center{width:min(94vw,550px);height:580px}</style>
 <div class="huw-puppet-workshop"><main class="huw-puppet-center">
 <div class="huw-puppet-presets"><button>Flyt del</button><button>Vis skelet</button><button>Drej del</button></div>
 <div class="huw-puppet-canvas"><svg viewBox="377 141 246 351">
 <rect width="800" height="450" fill="transparent"/><circle cx="490" cy="350" r="50"/></svg></div>
 </main></div>`);
 const button=page.getByRole('button',{name:'Vis skelet'});
 await button.evaluate(b=>b.addEventListener('click',()=>b.dataset.clicked='yes'));
 for(const width of [700,1100]){
  await page.setViewportSize({width,height:850});
  await button.evaluate(b=>delete b.dataset.clicked);
  const receivesTap=await button.evaluate(b=>{
   const r=b.getBoundingClientRect();
   return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;
  });
  assert.ok(receivesTap,'the SVG must not cover the toolbar at width '+width);
  await button.tap();
  assert.equal(await button.getAttribute('data-clicked'),'yes');
 }
});

test('Kenney activity blocks follow the time ruler and drag between figures in iPad WebKit',
 {skip:process.env.ANIMUS_WEBKIT_TESTS!=='1',timeout:90000},async t=>{
 const {webkit,devices}=await import('playwright-core');
 const {assembleHtml}=await import('../assembler/assemble.mjs');
 const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
 const packages=await Promise.all(['cutout','abc','musical','animus-starter-kenney'].map(async n=>JSON.parse(await read('plugins/'+n+'/dist/plugin.json'))));
 const html=assembleHtml(await read('core/empty.html'),packages.concat([
  {title:'$:/DefaultTiddlers',text:'[[Activity test]]'},{title:'Activity test',text:'<$animus-new-project/>'},{title:'$:/language',text:'$:/languages/en-GB'}]));
 const browser=await webkit.launch();t.after(()=>browser.close());
 const page=await browser.newPage(devices['iPad Pro 11 landscape']);
 await page.route('http://animus.test/',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://animus.test/');
 await page.getByRole('combobox',{name:'Starting scene',exact:true}).selectOption('$:/plugins/huwiki/animus-starter-kenney/template');
 await page.getByRole('textbox',{name:'Name of your show',exact:true}).fill('Two figures');
 await page.getByRole('button',{name:'+ New show',exact:true}).click();
 const editor=page.locator('.huw-musical--workspace').last();
 const rows=editor.locator('[data-layer-id*="female-"][data-layer-id$="-actor"]');
 assert.equal(await rows.count(),2);
 const from=rows.first(),to=rows.nth(1),targetId=await to.getAttribute('data-layer-id');
 await from.locator('.huw-musical-lane-title').click({button:'right'});
 const form=editor.locator('.huw-musical-rig-controls').last();
 await form.locator('select').filter({has:page.locator('option[value="wheel"]')}).selectOption('wheel');
 await form.locator('input.huw-rig-duration').fill('4.5');
 await form.getByRole('button',{name:'Insert at playhead',exact:true}).click();
 const cover=form.getByRole('button',{name:'Use movement here',exact:true});if(await cover.isVisible())await cover.click();
 const block=from.locator('[data-rig-move]');await block.waitFor();const id=await block.getAttribute('data-rig-move');
 await form.locator('select').filter({has:page.locator('option[value="wave"]')}).selectOption('wave');
 await form.locator('input.huw-rig-duration').fill('1.5');
 await form.getByRole('button',{name:'Insert at playhead',exact:true}).click();
 const blocks=from.locator('[data-rig-move]');await blocks.nth(1).waitFor();
 const a=await blocks.first().boundingBox(),b=await blocks.nth(1).boundingBox();
 assert.ok(Math.abs(a.width-3*b.width)<1,'4.5 seconds is three times the width of 1.5 seconds');
 assert.ok(Math.abs(a.x+a.width-b.x)<1,'the clips meet on the real timeline');
 const toLane=to.locator('.huw-musical-lane');await toLane.scrollIntoViewIfNeeded();
 const first=from.locator('[data-rig-move="'+id+'"]'),box=await first.boundingBox(),dest=await toLane.boundingBox();
 const x=box.x+box.width*.72,y=box.y+box.height*.55;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,dest.y+dest.height/2,{steps:12});await page.mouse.up();
 const transferred=to.locator('[data-rig-move="'+id+'"]');await transferred.waitFor();
 assert.equal(await from.locator('[data-rig-move]').count(),1);
 assert.equal(await transferred.getAttribute('data-start'),'0');
 assert.ok(Math.abs((await transferred.boundingBox()).width-a.width)<1);
 const saved=await page.evaluate(()=>{
  const film=JSON.parse($tw.wiki.getTiddlerText($tw.wiki.getTiddler('Two figures').fields['animus-scene']));
  return JSON.parse($tw.wiki.getTiddlerText(film.scenes[0].source));
 });
 assert.equal(saved.parts.find(p=>p.id===targetId).animusMoves[0].end,4.5);
});
