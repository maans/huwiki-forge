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
 // Visit the workshop first: compact cards add/remove songs without a separate button.
 await page.getByRole("link",{name:"Åbn repertoireværksted"}).click();
 const grid=page.locator(".huwrep-repertoire .huwrep-song-grid");
 await grid.waitFor();
 const cards=grid.locator(".huwrep-song-card");
 assert.equal(await cards.count(),17,"Each score is a full-card tap target");
 assert.equal(await cards.first().getAttribute("aria-pressed"),"true");
 assert.ok(!(await cards.first().innerText()).includes("SilbaÄtno ·"),"No repeated orchestra prefix");
 await cards.first().click();
 await page.waitForFunction(()=>document.querySelector(".huwrep-song-card")?.getAttribute("aria-pressed")==="false");
 await grid.locator(".huwrep-song-card").first().click();
 await page.waitForFunction(()=>document.querySelector(".huwrep-song-card")?.getAttribute("aria-pressed")==="true");
 // Select a known score: the grid toggle above intentionally selected a different first item.
 await page.locator(".huwrep-order-title").filter({hasText:"Brudmarch från Jämtland"}).click();
 // The editor derives both values from the actual ABC header, including the beat unit.
 const keyInput=page.locator(".huwrep-editor-panel .huwrep-key-field select");
 const tempoInput=page.locator(".huwrep-editor-panel .huwrep-tempo-field input");
 await keyInput.waitFor();
 assert.equal(await keyInput.inputValue(),"Gm","K:Gm seeds the current key");
 assert.equal(await tempoInput.inputValue(),"100","Q:1/4=100 seeds the visible tempo");
 assert.ok((await page.locator(".huwrep-tempo-field .huwrep-field-help").innerText()).includes("fjerdedelsnode"));
 const brudmarchTitle="SilbaÄtno · Brudmarch från Jämtland";
 const uneditedScore=await page.evaluate(title=>$tw.wiki.getTiddler(title).fields["abc-source"],brudmarchTitle);
 await keyInput.selectOption("Dm");
 await tempoInput.fill("118");
 await page.getByRole("button",{name:"Gem kun i denne sætliste"}).click();
 await page.waitForFunction(()=>
  document.querySelector(".huwrep-key-field select")?.value==="Dm"&&
  document.querySelector(".huwrep-tempo-field input")?.value==="118");
 const changedOverrides=await page.evaluate(()=>{
  const t=$tw.wiki.allTitles().map(t=>$tw.wiki.getTiddler(t))
   .find(t=>t&&t.fields["repertoire-kind"]==="setlist");
  return JSON.parse(t.fields["repertoire-overrides"]);
 });
 assert.ok(Object.values(changedOverrides).some(v=>v.key==="Dm"&&v.tempo==="1/4=118"),
  "Only this setlist gets the edited tempo and key with original beat duration");
 assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields["abc-source"],brudmarchTitle),
  uneditedScore,"Original ABC notation must never be rewritten by rehearsal choices");
 const order=page.locator(".huwrep-order-list");
 const firstTitle=await order.locator(".huwrep-order-title").first().innerText();
 await order.locator(".huwrep-order-handle").first().focus();
 await page.keyboard.press("ArrowDown");
 await page.waitForFunction(text=>document.querySelector(".huwrep-order-title")?.textContent!==text,firstTitle);
 assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains("huwrep-order-handle")),true,
  "Keyboard reordering keeps the grab handle focused");
 // Pointer dragging is shared by mouse and iPad touch rather than HTML5 drag events.
 const beforeMouse=await order.locator(".huwrep-order-title").first().innerText();
 await page.evaluate(()=>document.querySelector(".huwrep-order-handle")?.scrollIntoView({block:"center",behavior:"instant"}));
 const grip=await order.locator(".huwrep-order-handle").first().boundingBox();
 const destination=await order.locator(".huwrep-order-row").nth(2).boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
 await page.mouse.down();
 await page.mouse.move(destination.x+40,destination.y+destination.height*.8,{steps:12});
 await page.mouse.up();
 await page.waitForFunction(text=>document.querySelector(".huwrep-order-title")?.textContent!==text,beforeMouse);
 // A Chrome touch stream exercises the iPad pathway and the same order persistence.
 const beforeTouch=await order.locator(".huwrep-order-title").first().innerText();
 await page.evaluate(()=>document.querySelector(".huwrep-order-handle")?.scrollIntoView({block:"center",behavior:"instant"}));
 const tg=await order.locator(".huwrep-order-handle").first().boundingBox();
 const dest=await order.locator(".huwrep-order-row").nth(2).boundingBox();
 const cdp=await context.newCDPSession(page);
 const sourcePoint={x:tg.x+tg.width/2,y:tg.y+tg.height/2,id:7};
 const destPoint={x:dest.x+40,y:dest.y+dest.height*.8,id:7};
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[sourcePoint]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...destPoint,y:sourcePoint.y+12}]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[destPoint]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await page.waitForFunction(text=>document.querySelector(".huwrep-order-title")?.textContent!==text,beforeTouch);
 await cdp.detach();
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
 await page.locator(".silba-home").waitFor();
 const homeLink=page.getByRole("link",{name:"Åbn nodebogen"});
 await homeLink.waitFor();
 await homeLink.click();
 const book=page.locator(".huwrep-book").first();
 await book.waitFor();
 await page.waitForFunction(()=>!!document.querySelector(".huwrep-book .huwabc-page-select"),
  undefined,{timeout:90000});
 const musicianReader=book.locator(".huwabc-reader-toolbar").first();
 await musicianReader.waitFor({state:"visible",timeout:20000});
 assert.equal(await musicianReader.isVisible(),true,"The book must open directly on the notation-first reader");
 assert.ok(await book.evaluate(el=>el.classList.contains("huwrep-book-fullscreen")),
  "The dedicated nodebook should start in full width, without the ordinary StoryList chrome.");
 await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-page-select")?.value==="spread");
 const toggle=book.locator(".huwabc-reader-list");
 await toggle.waitFor({state:"visible",timeout:20000});
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
 // The practice panel is a floating overlay only when the musician chooses Øv.
 await book.locator(".huwabc-reader-menu").click();
 await book.locator(".huwabc-reader-modes button").nth(1).click();
 await book.locator(".huwabc-reader-menu").click();
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
