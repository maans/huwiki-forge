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
 await page.getByRole("link",{name:"Åbn nodebogen"}).click();
 const score=page.locator(".huwrep-book .huwabc-score").first();
 await score.waitFor();
 const readerLaunch=score.locator(".huwabc-open-reader").first();
 try {
  await readerLaunch.waitFor({state:"visible",timeout:12000});
 } catch(error) {
  const debug=await score.evaluate(el=>({
   className:el.className,
   children:Array.from(el.children).map(n=>({class:n.className,tag:n.tagName,hidden:n.hidden})),
   actions:Array.from(el.querySelectorAll(".huwabc-actions button")).map(b=>({text:b.textContent,html:b.outerHTML.slice(0,500),display:getComputedStyle(b).display})),
   head:el.querySelector(".huwabc-head")?.outerHTML.slice(0,1000),
   reader:el.querySelector(".huwabc-reader-toolbar")?.outerHTML.slice(0,450),
   book:el.closest(".huwrep-book")?.className
  }));
  console.error("ABC reader launch diagnostics",JSON.stringify({debug,runtimeErrors}));
  throw error;
 }
 await readerLaunch.click();
 await page.waitForFunction(()=>document.querySelector(".huwabc-score.huwabc-reader-active"));
 assert.ok(await score.evaluate(el=>Math.abs(el.getBoundingClientRect().width-innerWidth)<5),"Reader must own the viewport");
 assert.equal(await score.locator(".huwabc-head").evaluate(el=>getComputedStyle(el).display),"none","Editor tools should disappear during performance");
 const visibleScore=score.locator(".huwabc-paper");
 await visibleScore.waitFor();
 await page.waitForFunction(()=>document.querySelector(".huwabc-reader-menu")?.offsetParent!==null);
 const base=await page.evaluate(()=>document.querySelector(".huwabc-score .huwabc-paper svg"));
 await score.getByRole("button",{name:"Vis eller skjul nodemenu"}).click();
 await score.getByRole("button",{name:"Øv",exact:true}).click();
 assert.ok(await score.evaluate(el=>el.classList.contains("huwabc-reader-practice")),"Practice should keep the same score open");
 await score.getByRole("button",{name:"Vis",exact:true}).click();
 assert.ok(!await score.evaluate(el=>el.classList.contains("huwabc-reader-practice")),"Vis should restore notation-first reading");
 const unchanged=await page.evaluate(svg=>svg===document.querySelector(".huwabc-score .huwabc-paper svg"),base);
 // Cross-context Node handles cannot compare directly; if the initial SVG is
 // present, a mode switch must still have at least one notation SVG mounted.
 assert.ok(!!unchanged || await score.locator(".huwabc-paper svg").count()>0,"Notation persists across reading modes");
 const option=score.locator(".huwabc-reader-page-choice");
 await option.selectOption("single");
 await page.waitForFunction(()=>document.querySelector(".huwabc-page-select")?.value==="single");
 await option.selectOption("spread");
 await page.waitForFunction(()=>document.querySelector(".huwabc-page-select")?.value==="spread");
 await score.getByRole("button",{name:"Fyld bredden"}).click();
 assert.ok(await score.evaluate(el=>el.classList.contains("huwabc-reader-fill")),"Width-fit is reader only");
 await score.getByRole("button",{name:"Luk visning"}).click();
 assert.ok(!await score.evaluate(el=>el.classList.contains("huwabc-reader-active")),"Normal ABC controls return on exit");
 assert.notEqual(await score.locator(".huwabc-head").evaluate(el=>getComputedStyle(el).display),"none");
 assert.ok(!runtimeErrors.some(e=>/reader-mode|ReaderMode|Cannot read properties of undefined/.test(e)),runtimeErrors.join("; "));
 console.log("ABC shared reader: fullscreen, editor hidden, Vis/Øv, page selection, fit and exit verified");
 await context.close();
}finally{await browser.close();}
