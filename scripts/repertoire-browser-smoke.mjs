/**
 * Browser acceptance for the editable Repertoire demo.
 * Run after assembling the wiki:
 * npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
 * CHROME_BIN=/usr/bin/google-chrome node scripts/repertoire-browser-smoke.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
const root=path.resolve(import.meta.dirname,"..");
const url=pathToFileURL(path.join(root,"editions/silva-ethno-repertoire/index.html")).href;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
 const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});
 // Avoid network sound/font downloads during a visual and mixer state test.
 await context.route("**/*",route=>route.request().url().startsWith("file:")?
  route.continue():route.abort());
 const page=await context.newPage();
 page.setDefaultTimeout(90000);
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
 await page.waitForFunction(()=>window.$tw&&$tw.wiki&&$tw.rootWidget);
 await page.locator(".silba-home").waitFor();
 const homeLink=page.getByRole("link",{name:"Åbn nodebogen"});
 await homeLink.waitFor();
 await homeLink.click();
 const book=page.locator(".huwrep-book").first();
 await book.waitFor();
 await page.waitForFunction(()=>!!document.querySelector(".huwrep-book .huwabc-page-select"),
  undefined,{timeout:90000});
 const dormantReader=book.locator(".huwabc-reader-toolbar").first();
 await dormantReader.waitFor({state:"hidden"});
 assert.equal(await dormantReader.isVisible(),false,"The ABC reader must not cover repertoire navigation before activation");
 assert.ok(await book.evaluate(el=>el.classList.contains("huwrep-book-fullscreen")),
  "The dedicated nodebook should start in full width, without the ordinary StoryList chrome.");
 await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-page-select")?.value==="spread");
 const toggle=book.getByRole("button",{name:/Nummerliste/});
 await toggle.click();
 const drawer=book.locator(".huwrep-book-list");
 assert.equal(await drawer.isVisible(),true,"The number list opens as a side drawer");
 await drawer.locator("input[type=search]").fill("Cupria Express");
 const matches=drawer.locator(".huwrep-book-list-items button:visible");
 assert.equal(await matches.count(),1,"Searching does not expand a long button grid");
 await matches.first().click();
 await page.waitForFunction(()=>
  document.querySelector(".huwrep-book-heading h2")?.textContent?.includes("Cupria Express"));
 const title="SilbaÄtno · Cupria Express (Fm)";
 const original=await page.evaluate(t=>$tw.wiki.getTiddler(t).fields["abc-accompaniment"],title);
 const practice=book.locator(".huwrep-book-practice");
 await practice.locator("summary").click();
 await practice.locator("input[type=checkbox]").first().check();
 await practice.locator("input[type=checkbox]").nth(1).check();
 const voice=practice.locator("select");
 await page.waitForFunction(()=>
  document.querySelector('.huwrep-book-practice select option[value="1"]'),undefined,{timeout:90000});
 await voice.selectOption("1");
 await page.waitForFunction(()=>
  document.querySelector('.huwrep-book .huwabc-voice-row[data-voice-index="1"]')
   ?.classList.contains("huwabc-voice-is-muted"),undefined,{timeout:15000});
 // Music Minus One must not delete the selected voice's notation or modify ABC.
 assert.ok(await book.locator(".huwabc-page-shell").count()>0,
  "Muted voice keeps the score, page plan and follow cursor available.");
 const current=await page.evaluate(t=>$tw.wiki.getTiddler(t).fields["abc-accompaniment"],title);
 assert.equal(current,original,"Practice is a live mixer overlay, not a change to the original score");
 await practice.locator("input[type=checkbox]").first().uncheck();
 await page.waitForFunction(()=>
  !document.querySelector('.huwrep-book .huwabc-voice-row[data-voice-index="1"]')
   ?.classList.contains("huwabc-voice-is-muted"),undefined,{timeout:15000});
 await page.setViewportSize({width:820,height:1180});
 await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-page-select")?.value==="single");
 await page.setViewportSize({width:1180,height:820});
 await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-page-select")?.value==="spread");
 assert.ok(!errors.some(e=>/huwiki-repertoire-book|repertoire\/book-widget|Repertoire/.test(e)),
  "No Repertoire runtime errors: "+errors.join("; "));
 console.log("Repertoire browser acceptance: direct Nodebog, searchable drawer, Music Minus One, metronome, one/two-page rotation");
 await context.close();
}finally{await browser.close();}
