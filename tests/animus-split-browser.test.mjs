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
  await checkPictureAndRuler(editor,expected);
 }
 await clickNote(1,0,8*60/90); // Bar 3, across the opening clef change.
 await clickNote(2,2,32*60/90); // Bar 9, directly on a ledger line.
 await playhead.evaluate(input=>{
  input.value='26';input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await activeScore.locator('.huw-musical-score-label').filter({hasText:'Stemmer på væggen'}).waitFor();
 await clickNote(0,1,25.854+4*60/104); // Scene 2, after a tempo change.
});

async function checkPictureAndRuler(editor,expected){
 const picture=Number(await editor.getAttribute('data-camera-time'));
 assert.ok(Math.abs(picture-expected)<.02,'the animation paints the selected time');
 const position=await editor.locator('.huw-musical-ruler-cursor[data-cursor-mode="seconds"]').evaluate(cursor=>{
  const ruler=cursor.parentElement.getBoundingClientRect(),head=cursor.getBoundingClientRect();
  const duration=Number(cursor.closest('.huw-musical').querySelector('.huw-musical-range').max);
  return {time:(head.left-ruler.left)*duration/ruler.width,visible:head.width>0&&head.height>0};
 });
 assert.ok(position.visible&&Math.abs(position.time-expected)<.03,'the visible ruler marker is at the same time');
}

test('score taps, written chords and workshop selections seek the picture and ruler in the current clip',
 {skip:process.env.ANIMUS_SPLIT_TESTS!=='1',timeout:120000},async t=>{
 const {chromium}=await import('playwright-core'),base=await serveDemo(t);
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true});
 await page.route('**/turn-around/tiddlers/scores.json*',async route=>{
  const response=await route.fetch(),scores=await response.json();
  scores.find(row=>row.title.includes(' · Score · 02 · '))['abc-source']=
   'X:1\nT:Repeat and chord selection\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n|: "Am"[CE]2 D2 | "G7"[GBd]2 E2 :| "F"F4 |]';
  await route.fulfill({response,json:scores});
 });
 await page.goto(base+'/demo/?edition=turn-around&lang=da');
 const wiki=page.frameLocator('#wiki');
 await wiki.locator('.plato-native-link a').first().click();
 const editor=wiki.locator('.plato-native-studio.huw-musical');
 const active=editor.locator('.huw-musical-score-page:not([hidden])');
 const head=active.locator('.abcjs-note.abcjs-v0.abcjs-l0.abcjs-m1.abcjs-n0 .abcjs-notehead').first();
 // A score seek must reveal an offscreen playhead without scrolling the wiki.
 await editor.locator('.huw-musical-zoom-in').click();
 const tracks=editor.locator('.huw-musical-tracks');
 await tracks.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 assert.ok(await tracks.evaluate(el=>el.scrollLeft>0));
 const captions=editor.locator('.huw-musical-caption-line');
 const before=await captions.textContent();
 await head.scrollIntoViewIfNeeded();
 const b=await head.boundingBox();
 // Hit the paper just beside a notehead, as happens on a small split screen.
 await page.touchscreen.tap(b.x-4,b.y+b.height/2);
 await checkPictureAndRuler(editor,4*60/90);
 assert.notEqual(await captions.textContent(),before,'the selected frame displays the opening speech');
 const visible=await tracks.evaluate(el=>{
  const marker=el.querySelector('.huw-musical-ruler-cursor').getBoundingClientRect();
  const rail=el.querySelector('.huw-musical-ruler-label').getBoundingClientRect();
  return marker.left>=rail.right-1&&marker.left<el.getBoundingClientRect().right;
 });
 assert.ok(visible,'the selected time is visible even when the timeline was scrolled away');
 const clipStart=25.854;
 const playhead=editor.locator('.huw-musical-range');
 async function scrub(time){
  await playhead.evaluate((input,time)=>{input.value=time;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},time);
 }
 await scrub(clipStart+.1);
 const chord=active.locator('.abcjs-chord').filter({hasText:'G7'});
 // Some ABC layouts put a chord label in the system, outside its note group.
 await chord.evaluate(label=>label.closest('.abcjs-staff-wrapper').appendChild(label));
 await chord.tap();await checkPictureAndRuler(editor,clipStart+2);
 await scrub(clipStart+5.5);
 await active.locator('.abcjs-m1.abcjs-n0 .abcjs-notehead').last().click();
 await checkPictureAndRuler(editor,clipStart+6); // same chord notes on the second pass
 await chooseToolbarItem(editor,'workshops','.huw-musical-score-button');
 const workshop=editor.locator('.huw-score-workshop');
 await workshop.locator('.huwabc-edit-preview .abcjs-notehead[data-huwabc-item]').first().waitFor();
 await workshop.locator('.abcjs-chord[data-huwabc-item]').filter({hasText:/^F$/}).click();
 await checkPictureAndRuler(editor,clipStart+8);
 await workshop.getByRole('button',{name:'Annuller',exact:true}).click();
 await checkPictureAndRuler(editor,clipStart+8);
});

test('changing the open wiki language updates the page, player and editor at the same score position',
 {skip:process.env.ANIMUS_SPLIT_TESTS!=='1',timeout:120000},async t=>{
 const base=await serveDemo(t);
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.goto(base+'/demo/?edition=turn-around&lang=da');
 const wiki=page.frameLocator('#wiki');
 await wiki.locator('.plato-native-link a').click();
 const editor=wiki.locator('.plato-native-studio');
 const position=editor.locator('.huw-musical-range');
 await position.evaluate(input=>{input.value='32';input.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const [locale,danish] of [['en-GB',false],['fr-FR',false],['da-DK',true]]){
  await wiki.locator('body').evaluate((body,code)=>body.ownerDocument.defaultView.$tw.wiki.setText('$:/language','text',undefined,'$:/languages/'+code),locale);
  await editor.getByRole('button',{name:danish?'Værksteder':'Workshops',exact:true}).waitFor();
  const show=wiki.locator('.plato-home');
  await show.getByRole('link',{name:danish?'Åbn i AniMus':'Open in AniMus',exact:true}).waitFor();
  assert.match(await show.locator('.plato-chapters option').first().textContent(),danish?/Hele verden/:/The Whole World/);
  assert.match(await editor.locator('.huw-musical-score-label:visible').textContent(),danish?/Stemmer på væggen/:/Voices on the Wall/);
  assert.ok(Math.abs(Number(await position.inputValue())-32)<.02);
 }
});
