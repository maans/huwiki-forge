import test from 'node:test';
import assert from 'node:assert/strict';
import {serveDemo} from './helpers/animus-demo-server.mjs';
import {chooseToolbarItem} from './helpers/animus-toolbar.mjs';

test('Split keeps visible notation and animated artwork while editing in wide and narrow desktop windows',
 {skip:process.env.ANIMUS_SPLIT_TESTS!=='1',timeout:120000},async t=>{
 const {chromium}=await import('playwright-core');
 const base=await serveDemo(t);
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(base+'/demo/?edition=turn-around&lang=da');
 const wiki=page.frameLocator('#wiki');
 await wiki.locator('.plato-home .plato-native-link a').click();
 const editor=wiki.locator('.plato-native-studio.huw-musical');
 const stage=editor.locator('.huw-musical-canvas > svg');
 const score=editor.locator('.huw-musical-paper');
 const notes=score.locator('.huw-musical-score-page:not([hidden]) .abcjs-note');
 async function chooseView(mode){await chooseToolbarItem(editor,'view','[data-preview="'+mode+'"]');}
 async function checkSplit(stacked){
  assert.equal(await editor.getAttribute('data-preview-mode'),'split');
  await notes.first().waitFor();await stage.locator('[data-cutout-id="prisoner"]').first().waitFor();
  const a=await stage.boundingBox(),b=await score.boundingBox();
  assert.ok(a&&b&&a.width>100&&a.height>40&&b.width>100&&b.height>60,'both panes have room for their contents');
  assert.ok(await notes.evaluateAll(items=>{
   const bounds=items[0].closest('.huw-musical-paper').getBoundingClientRect();
   return items.some(item=>{const r=item.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<bounds.bottom&&r.bottom>bounds.top&&r.left<bounds.right&&r.right>bounds.left;});
  }),'the visible part of the score contains engraved notes');
  if(stacked)assert.ok(a.y+a.height<=b.y+2,'the score is beneath the scene');
  else assert.ok(a.x+a.width<=b.x+2,'the score is beside the scene');
 }
 await editor.locator('.huw-musical-play:enabled').waitFor();
 await checkSplit(false); // The editor opens with both panes before any menu choice.
 await chooseToolbarItem(editor,'tools','.huw-musical-figure-button');await checkSplit(false);
 await chooseToolbarItem(editor,'tools','.huw-musical-parts-button');await checkSplit(false);
 await editor.locator('.huw-musical-play').click();
 await wiki.locator('.huw-musical-range').evaluate(input=>new Promise((resolve,reject)=>{
  const start=Number(input.value),deadline=performance.now()+8000;
  function check(){if(Number(input.value)>start+.4)resolve();else if(performance.now()>deadline)reject(Error('playhead stalled'));else requestAnimationFrame(check);}
  check();
 }));
 await checkSplit(false);await editor.locator('.huw-musical-play').click();
 for(const width of [1024,640,480,1440]){
  await page.setViewportSize({width,height:900});
  await checkSplit(width===480);
 }
 await chooseView('score');assert.equal(await stage.isVisible(),false);assert.equal(await notes.first().isVisible(),true);
 await chooseView('stage');assert.equal(await score.isVisible(),false);assert.equal(await stage.isVisible(),true);
 await chooseView('split');await checkSplit(false);
 const activeScore=score.locator('.huw-musical-score-page:not([hidden])');
 const playhead=editor.locator('.huw-musical-range');
 async function clickNote(system,bar,expected){
  const note=activeScore.locator('.abcjs-note.abcjs-v0.abcjs-l'+system+'.abcjs-m'+bar).first();
  await note.locator('path').first().click();
  assert.ok(Math.abs(Number(await playhead.inputValue())-expected)<.02,'a note click seeks the master clock to '+expected);
 }
 await clickNote(1,0,8*60/90); // Bar 3, across the opening clef change.
 await clickNote(2,2,32*60/90); // Bar 9, directly on a ledger line.
 await playhead.evaluate(input=>{
  input.value='26';input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await activeScore.locator('.huw-musical-score-label').filter({hasText:'Voices on the Wall'}).waitFor();
 await clickNote(0,1,25.854+4*60/104); // Scene 2, after a tempo change.
});
