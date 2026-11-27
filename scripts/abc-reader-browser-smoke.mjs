/**
 * Touch-sized browser acceptance of ABC's shared distraction-free reader.
 * Test against the published-ready SilbaÄtno wiki assembled from the same
 * package used by Music Edition, not a mock score or a second player.
 */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
const root=path.resolve(import.meta.dirname,"..");
const url=pathToFileURL(path.join(root,"editions/silba-atno-repertoire/index.html")).href;
const browser=await chromium.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]
});
try{
 const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});
 await context.route("**/*",route=>route.request().url().startsWith("file:")?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(90000);
 const runtimeErrors=[];page.on("pageerror",e=>runtimeErrors.push(e.message));
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
 await page.waitForFunction(()=>window.$tw&&$tw.rootWidget&&$tw.wiki);
 // Normal is the default article view; Advanced exposes the former extras.
 await page.evaluate(()=>{
  $tw.wiki.addTiddler({title:'Standalone ABC acceptance','music-template':'off',text:'<div class="huw-music-view"><section class="huw-music-media huw-music-media-abc"><div class="huw-music-section-label">ABC</div><$huwiki-abc tiddler="Låt från Dalarne"/></section></div>'});
  $tw.wiki.addTiddler({title:'$:/StoryList',list:['Standalone ABC acceptance']});
 });
 let article=page.locator(".huw-music-media-abc>.huwabc-score.huwabc-standalone").first();
 await article.waitFor();
 assert.equal(await article.evaluate(el=>el.classList.contains("huwabc-minimal")),true);
 await article.locator(".huwabc-page-shell").waitFor();
 assert.equal(await article.locator(".huwabc-instrument-bar").count(),0,"No instrument toolbar in Normal");
 assert.equal(await article.locator(".huwabc-instrument-print").count(),0,"No PDF in Normal");
 assert.equal(await article.locator(".huwabc-page-toolbar").evaluate(el=>getComputedStyle(el).display),"none",
  "Zoom, pages configuration and stand toolbar should be hidden");
 assert.equal(await page.locator(".huw-music-media-abc>.huw-music-section-label")
  .evaluate(el=>getComputedStyle(el).display),"none","No redundant ABC heading");
 const viewSwitch=article.locator(".huwabc-view-toggle");
 assert.equal(await viewSwitch.count(),1,"Normal view needs an Advanced toggle");
 assert.equal(await viewSwitch.isVisible(),true,"Advanced toggle must be visible");
 await viewSwitch.click();
 await page.waitForFunction(()=>!!document.querySelector(".huwabc-score.huwabc-standalone:not(.huwabc-minimal)"));
 article=page.locator(".huwabc-score.huwabc-standalone:not(.huwabc-minimal)").first();
 assert.equal(await article.locator(".huwabc-instrument-group").isVisible(),true);
 const pdfButton=article.locator(".huwabc-actions button").filter({hasText:"PDF"}).first();
 assert.equal(await pdfButton.count(),1,"Advanced mode retains its PDF action");
 assert.equal(await pdfButton.isVisible(),true,"PDF action must be visible in Advanced mode");
 const normalSwitch=article.locator(".huwabc-view-toggle");
 assert.equal(await normalSwitch.count(),1);
 assert.equal(await normalSwitch.isVisible(),true);
 await normalSwitch.click();
 await page.waitForFunction(()=>!!document.querySelector(".huwabc-score.huwabc-standalone.huwabc-minimal"));
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
 await page.locator(".silba-home").waitFor();
 await page.getByRole("link",{name:"Åbn nodebogen"}).click();
 const book=page.locator('.huwrep-book').first();
 await book.locator('.huwabc-page-shell').waitFor();
 const heading=await book.locator('.huwrep-book-heading h2').textContent();
 const original=await page.evaluate(title=>$tw.wiki.getTiddler(title)?.fields['abc-source'],heading);
 assert.ok(original,'Acceptance uses the existing original score');
 if(!await book.evaluate(el=>el.classList.contains('huwrep-book-fullscreen')))await book.locator('.huwrep-book-fullscreen-button').click();
 const layout=await book.evaluate(el=>{const r=el.getBoundingClientRect(),h=el.querySelector('.huwrep-book-header').getBoundingClientRect(),s=el.querySelector('.huwrep-book-stage').getBoundingClientRect();return {width:r.width,height:r.height,header:h.height,gap:s.top-h.bottom,nested:el.querySelectorAll('.huwabc-reader-active').length};});
 assert.ok(Math.abs(layout.width-1180)<3&&Math.abs(layout.height-820)<3,JSON.stringify(layout));
 assert.ok(layout.header<=52&&Math.abs(layout.gap)<=2,'The book owns one compact toolbar');
 assert.equal(layout.nested,0,'No second fullscreen controller inside the book');
 await page.evaluate(title=>$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(title),{'repertoire-youtube':'https://www.youtube.com/watch?v=8UNtQpMMSEM'})),heading);
 await book.locator('.huwrep-session-settings>summary').click();
 await book.locator('.huwrep-book-source').selectOption('youtube');
 await book.locator('.huwrep-youtube-frame').waitFor({state:'attached'});
 assert.equal(await book.locator('.huwabc-score').count(),0,'No hidden ABC player continues behind YouTube');
 assert.match(await book.locator('.huwrep-youtube-frame').getAttribute('src'),/autoplay=0/);
 assert.ok(await book.evaluate(el=>el.classList.contains('huwrep-book-fullscreen')),'View changes preserve fullscreen');
 await book.locator('.huwrep-session-settings>summary').click();
 await book.locator('.huwrep-book-source').selectOption('');
 await book.locator('.huwabc-page-shell').waitFor();
 assert.equal(await book.locator('.huwrep-youtube-frame').count(),0,'Switching back unloads the video');
 assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields['abc-source'],heading),original,'Video choices leave ABC music unchanged');
 assert.deepEqual(runtimeErrors,[]);
 console.log('Standalone Normal/Advanced controls and one fullscreen book toolbar, ABC/YouTube lifecycle and original-score preservation verified');
 await context.close();
}finally{await browser.close();}
