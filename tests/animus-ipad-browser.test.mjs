import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseToolbarItem} from './helpers/animus-toolbar.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
test('Turn Around stays editable after touch, mouse, backward seeks and playback in mobile WebKit',
 {skip:process.env.ANIMUS_WEBKIT_TESTS!=='1',timeout:120000},async t=>{
 const {webkit,devices}=await import('playwright-core');
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');
   const file=new URL('.'+decodeURIComponent(path),root);
   if(!file.href.startsWith(root.href))throw Error('Outside repository');
   const contents=await readFile(file);
   const type=path.endsWith('.html')?'text/html':/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':'application/json';
   res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(contents);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>server.close());
 const browser=await webkit.launch();
 t.after(()=>browser.close());
 const context=await browser.newContext(devices['iPad Pro 11 landscape']);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/demo/?edition=turn-around&lang=da');
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
 await options.locator('.huw-musical-speed').selectOption('125');
 await options.locator('[data-huw-animus-captions="language"]').selectOption('en');
 assert.equal(await options.locator('.huw-musical-speed').inputValue(),'125');
 await playback.tap();assert.equal(await options.isVisible(),false);
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
