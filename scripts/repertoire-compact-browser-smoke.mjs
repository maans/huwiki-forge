/** Verify the current book, toolbar and direct native editor as a musician. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});
 await context.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'editions/silba-atno-repertoire/index.html')).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.$tw&&$tw.rootWidget);
 const source=await page.evaluate(()=>{
  $tw.wiki.setText('$:/language','text',undefined,'$:/languages/da-DK');
  const title=$tw.wiki.allTitles().find(t=>!t.startsWith('$:/')&&$tw.wiki.getTiddler(t)?.fields['abc-source']);
  if(!title)throw Error('A real source score is required');
  const text=$tw.wiki.getTiddler(title).fields['abc-source'];
  $tw.wiki.addTiddler({title:'Compact Reader Acceptance',text:'<$huwiki-repertoire-book piece="'+title.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"/>'});
  $tw.wiki.addTiddler({title:'$:/StoryList',list:['Compact Reader Acceptance']});
  return {title,text};
 });
 const book=page.locator('.huwrep-book').first();
 await book.locator('.huwabc-page-shell').waitFor();
 await book.getByRole('button',{name:'Afspil / pause',exact:true}).waitFor();
 await book.locator('.huwrep-book-fullscreen-button').click();
 for(const width of [1180,768,414]){
  await page.setViewportSize({width,height:820});
  const measure=await book.evaluate(e=>{const h=e.querySelector('.huwrep-book-header').getBoundingClientRect(),s=e.querySelector('.huwrep-book-stage').getBoundingClientRect(),r=e.getBoundingClientRect();return {header:h.height,stageTop:s.top,headerBottom:h.bottom,width:r.width,height:r.height,overflow:e.querySelector('.huwrep-book-header').scrollWidth-h.width};});
  assert.ok(measure.header<=52,JSON.stringify(measure));
  assert.ok(Math.abs(measure.stageTop-measure.headerBottom)<=2,'only one line above the score');
  assert.ok(Math.abs(measure.width-width)<=2,'reader spans viewport');
  assert.ok(measure.overflow<=2,'buttons fit on one line: '+JSON.stringify({width,...measure}));
 }
 const before=await book.locator('.huwrep-book-stage').boundingBox();
 await book.locator('.huwrep-reading-controls').click();
 await book.locator('.huwrep-performance').waitFor({state:'visible'});
 const after=await book.locator('.huwrep-book-stage').boundingBox();
 assert.ok(Math.abs(before.height-after.height)<2,'sound settings overlay without shrinking the score');
 await book.locator('.huwrep-reading-controls').click();
 await book.locator('.huwrep-edit-score').click();
 await page.getByRole('heading',{name:'Redigér nodeark',exact:true}).waitFor();
 assert.equal(await page.evaluate(title=>$tw.wiki.findDraft(title)!==undefined,source.title),true);
 await page.getByRole('button',{name:'Fortryd redigering af denne tiddler',exact:true}).click();
 await book.locator('.huwabc-page-shell').waitFor();
 assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields['abc-source'],source.title),source.text);
 assert.deepEqual(errors,[]);
 console.log('Verified one toolbar at desktop, iPad and narrow widths, overlay settings and direct score edit/cancel');
} finally {await browser.close();}
