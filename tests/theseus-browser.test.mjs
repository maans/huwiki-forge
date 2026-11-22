import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {serveDemo} from './helpers/animus-demo-server.mjs';

const enabled=process.env.THESEUS_BROWSER_TESTS==='1';
for(const language of ['da','en'])test(`Theseus ${language}: recorded sound, transport, song seek, language switch and editor`,{skip:!enabled,timeout:120000},async t=>{
 const {chromium,webkit,devices}=await import('playwright-core');
 const mobile=process.env.THESEUS_BROWSER==='webkit';
 const browser=await (mobile?webkit:chromium).launch();t.after(()=>browser.close());
 const context=await browser.newContext(mobile?devices['iPad Pro 11 landscape']:{});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.testAudioStarts=[];
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  const create=C.prototype.createBufferSource;
  C.prototype.createBufferSource=function(){
   const source=create.call(this),start=source.start,context=this;
   source.start=function(when=0,...args){
    const samples=source.buffer?.getChannelData(0);let energy=0;
    if(samples)for(let i=0;i<samples.length;i+=257)energy+=samples[i]*samples[i];
    window.testAudioStarts.push({context,when,energy});return start.call(this,when,...args);
   };return source;
  };
 });
 const base=await serveDemo(t);await page.goto(base+`/demo/?edition=theseus-ship&lang=${language}`);
 const wiki=page.frameLocator('#wiki'),player=wiki.locator('.plato-player');
 await player.waitFor({timeout:60000});assert.equal(await player.count(),1);
 assert.equal(await player.locator('.plato-chapters option').count(),14);
 assert.equal(await player.locator('.plato-caption-dock').count(),1);
 const play=player.locator('.plato-play');await play.click();
 await page.waitForFunction(()=>{
  const w=document.querySelector('#wiki').contentWindow,p=w.document.querySelector('.plato-player');
  return p?.getAttribute('data-plato-playing')==='true'&&p._platoPlayer.time()>.5&&w.testAudioStarts.some(a=>a.energy>1e-7&&a.context.state==='running'&&a.context.currentTime>a.when+.2);
 },null,{timeout:15000});
 await play.click();const paused=await player.evaluate(p=>p._platoPlayer.time());
 await page.waitForTimeout(200);assert.equal(await player.evaluate(p=>p._platoPlayer.time()),paused);
 await player.locator('.plato-chapters').selectOption('3');
 const songTime=await player.evaluate(p=>p._platoPlayer.time());assert(songTime>30);
 await play.click();await page.waitForFunction(start=>document.querySelector('#wiki').contentDocument.querySelector('.plato-player')._platoPlayer.time()>start+.5,songTime,{timeout:5000});
 await play.click();
 await player.locator('.animus-audio-language select').selectOption(language==='da'?'en':'da');
 assert.equal(await player.getAttribute('data-animus-audio-language'),language==='da'?'en':'da');
 assert.equal(await player.locator('.plato-chapters option').count(),14);
 await player.locator('.plato-chapters').selectOption('0');await player.locator('.plato-play').click();
 await page.waitForFunction(()=>document.querySelector('#wiki').contentDocument.querySelector('.plato-player')._platoPlayer.time()>.4,null,{timeout:5000});
 await player.locator('.plato-play').click();
 await mkdir('test-results/theseus',{recursive:true});await page.screenshot({path:`test-results/theseus/${mobile?'webkit':'chromium'}-${language}.png`});
 const studioLink=wiki.locator('a').filter({hasText:/Åbn i AniMus|Open in AniMus/}).last();await studioLink.click();
 const editor=wiki.locator('.huw-musical').filter({has:wiki.locator('.huw-musical-play')}).last();
 await editor.locator('.huw-musical-play').waitFor({timeout:15000});
 const range=editor.locator('.huw-musical-range');await range.fill('18');await range.press('ArrowRight');
 assert(Number(await range.inputValue())>=18);
 await editor.locator('.huw-musical-play').click();
 await page.waitForFunction(()=>Number(document.querySelector('#wiki').contentDocument.querySelector('.huw-musical-range').value)>18.5,null,{timeout:5000});
 await editor.locator('.huw-musical-stop').click();assert.deepEqual(errors,[]);
});
