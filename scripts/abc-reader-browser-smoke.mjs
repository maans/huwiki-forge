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
const url=pathToFileURL(path.join(root,"editions/silva-ethno-repertoire/index.html")).href;
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
 await page.locator(".silba-home").getByRole("link",{name:"Låt från Dalarne"}).click();
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
 const score=page.locator(".huwrep-book .huwabc-score").first();
 await score.waitFor();
 // Repertoire opens directly on the notation, just like forScore.
 await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-score.huwabc-reader-active"),
  undefined,{timeout:20000});
 await page.waitForFunction(()=>document.querySelector(".huwabc-score.huwabc-reader-active"));
 assert.ok(await score.evaluate(el=>Math.abs(el.getBoundingClientRect().width-innerWidth)<5),"Reader must own the viewport");
 assert.equal(await score.locator(".huwabc-head").evaluate(el=>getComputedStyle(el).display),"none","Editor tools should disappear during performance");
 const debugLayers=await score.evaluate(el=>({
  children:Array.from(el.children).map(c=>({className:c.className,tag:c.tagName,display:getComputedStyle(c).display,rect:[c.offsetWidth,c.offsetHeight],outer:c.outerHTML.slice(0,230)})),
  sheets:Array.from(el.querySelectorAll(".huwabc-page-shell,.huwabc-page-select,.huwabc-paper")).slice(0,12).map(c=>({className:c.className,parent:c.parentElement?.className,display:getComputedStyle(c).display,rect:[c.offsetWidth,c.offsetHeight]}))
 }));
 console.log("ABC READER LAYERS",JSON.stringify(debugLayers));
 await score.locator(".huwabc-page-shell").first().waitFor({state:"visible",timeout:14000});
 await page.waitForFunction(()=>document.querySelector(".huwabc-reader-menu")?.offsetParent!==null);
 await score.locator(".huwabc-paper svg").first().waitFor({state:"attached",timeout:10000});
 await score.evaluate(el=>{window.__abcReaderOriginalSvg=el.querySelector(".huwabc-paper svg");});
 await score.locator(".huwabc-reader-menu").click();
 // The performance menu must leave room for the sheet: four small icon
 // actions in one row, with hover/screen-reader labels and no wide text bars.
 const controlLayout=await score.evaluate(el=>{
  const panel=el.querySelector(".huwabc-reader-menu-panel");
  const icons=Array.from(el.querySelectorAll(".huwabc-reader-modes button"));
  const list=el.querySelector(".huwabc-reader-list");
  return {
   panelWidth:panel.getBoundingClientRect().width,
   labels:icons.map(b=>b.getAttribute("aria-label")),
   icons:icons.map(b=>!!b.querySelector("svg")),
   tops:icons.map(b=>Math.round(b.getBoundingClientRect().top)),
   heights:icons.map(b=>b.getBoundingClientRect().height),
   listWidth:list&&list.getBoundingClientRect().width,
   fields:el.querySelectorAll(".huwabc-reader-options select").length
  };
 });
 assert.deepEqual(controlLayout.labels,["Vis","Øv","Redigér","Luk visning"]);
 assert.ok(controlLayout.icons.every(Boolean),"reader actions use actual monochrome icons");
 assert.equal(new Set(controlLayout.tops).size,1,"all four mode icons must share one row");
 assert.ok(controlLayout.heights.every(n=>n<=46&&n>=40),"icons stay compact and touch-friendly");
 assert.ok(controlLayout.panelWidth<=290,"the old dark menu must not cover a large score area");
 assert.ok(controlLayout.listWidth<=46,"the number list button is icon-sized");
 assert.equal(controlLayout.fields,2,"page layout and fit are the only remaining fields");
 await score.locator(".huwabc-reader-modes button").nth(1).click();
 assert.ok(await score.evaluate(el=>el.classList.contains("huwabc-reader-practice")),"Practice should keep the same score open");
 await score.locator(".huwabc-reader-modes button").nth(0).click();
 assert.ok(!await score.evaluate(el=>el.classList.contains("huwabc-reader-practice")),"Vis should restore notation-first reading");
 const unchanged=await score.evaluate(el=>window.__abcReaderOriginalSvg===el.querySelector(".huwabc-paper svg"));
 assert.ok(unchanged,"Switching Vis/Øv must not rerender or replace the notation SVG");
 const option=score.locator(".huwabc-reader-page-choice");
 await option.selectOption("single");
 await page.waitForFunction(()=>document.querySelector(".huwabc-page-select")?.value==="single");
 await option.selectOption("spread");
 await page.waitForFunction(()=>document.querySelector(".huwabc-page-select")?.value==="spread");
 await score.locator(".huwabc-reader-fit-choice").selectOption("width");
 assert.ok(await score.locator(".huwabc-page-viewport").evaluate(el=>Number(el.style.zoom)>0),"Width-fit sizes the existing score");
 await score.locator(".huwabc-reader-close").click();
 assert.ok(!await score.evaluate(el=>el.classList.contains("huwabc-reader-active")),"Normal ABC controls return on exit");
 assert.notEqual(await score.locator(".huwabc-head").evaluate(el=>getComputedStyle(el).display),"none");

 // The next-page gesture at the last staff must open the next setlist tune,
 // with the same immersive reader state; the ordinary Wiki story stays hidden.
 const book=page.locator(".huwrep-book").first();
 const heading=book.locator(".huwrep-book-heading h2");
 const firstTune=await heading.textContent();
 await score.locator(".huwabc-open-reader").click();
 let crossed=false;
 for(let attempt=0;attempt<10;attempt++){
  await score.locator(".huwabc-reader-next").click({timeout:18000});
  if((await heading.textContent())!==firstTune){crossed=true;break;}
 }
 assert.ok(crossed,"A page turn at the end of the tune must open the next setlist tune");
 assert.ok(await score.evaluate(el=>el.classList.contains("huwabc-reader-active")),
  "Turning to another tune must keep the full-screen reading mode");
 assert.ok(!runtimeErrors.some(e=>/reader-mode|ReaderMode|Cannot read properties of undefined/.test(e)),runtimeErrors.join("; "));
 console.log("ABC shared reader: fullscreen, editor hidden, Vis/Øv, page selection, fit and cross-tune turning verified");
 await context.close();
}finally{await browser.close();}
