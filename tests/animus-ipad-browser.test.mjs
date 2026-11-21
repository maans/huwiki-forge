import test from 'node:test';
import assert from 'node:assert/strict';
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
  await stop.click({timeout:5000});
  assert.equal(Number(await range.inputValue()),0);
  assert.equal(await editor.getAttribute('data-playing'),'false');
 }
 await editor.locator('.huw-musical-parts-button').click({timeout:5000});
 await lane.tap({position:{x:Math.round(width*.25),y:4},timeout:5000});
 assert.ok(Number(await range.inputValue())>100);
 await editor.locator('[data-track-id="lights"] .huw-musical-lane-title').click({timeout:5000});
 const intensity=editor.getByLabel('Lysstyrke',{exact:true});
 await intensity.fill('0.35');await intensity.press('Tab');
 assert.equal(await editor.evaluate(()=>JSON.parse(window.$tw.wiki.getTiddlerText('Turn Around · Complete performance (film)')).musical.lighting.keys[0].intensity),.35);
 assert.deepEqual(errors,[]);
});
