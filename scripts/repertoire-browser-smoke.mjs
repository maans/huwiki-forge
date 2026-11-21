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
 // A standalone score from an older import may still store abc-view:full.
 // Opening it must nonetheless start in the quiet, reversible minimal view.
 const oldScoreTitle="SilbaÄtno · Låt från Dalarne";
 const previouslySaved=await page.evaluate(id=>$tw.wiki.getTiddler(id).fields["abc-view"],oldScoreTitle);
 assert.equal(previouslySaved,"full","Fixture is an older advanced-view import");
 await page.locator(".silba-home").getByRole("link",{name:"Låt från Dalarne"}).click();
 const standalone=page.locator('.huwabc-standalone[data-huwabc-title="SilbaÄtno · Låt från Dalarne"]').first();
 await standalone.waitFor();
 assert.ok(await standalone.evaluate(node=>node.classList.contains("huwabc-minimal")),
  "Ordinary ABC scores should open in minimal view");
 await standalone.locator(".huwabc-mini-open").waitFor({state:"visible",timeout:30000});
 assert.equal(await page.locator(".huwabc-mini-mixer:visible").count(),0,
  "A minimal score must not automatically open a sidebar mixer");
 const advanced=standalone.locator(".huwabc-view-toggle");
 const advancedLabel=(await advanced.innerText()).trim();
 assert.ok(["Avanceret visning","Advanced view"].includes(advancedLabel),
  "The label must use Advanced view, localized to the wiki language: "+advancedLabel);
 await advanced.click();
 await page.waitForFunction(()=>
  [...document.querySelectorAll(".huwabc-standalone")].some(node=>
   node.getAttribute("data-huwabc-title")==="SilbaÄtno · Låt från Dalarne"&&!node.classList.contains("huwabc-minimal")));
 assert.equal((await standalone.locator(".huwabc-view-toggle").innerText()).trim(),
  advancedLabel==="Advanced view"?"Minimal view":"Minimal visning");
 assert.equal(await page.evaluate(id=>$tw.wiki.getTiddler(id).fields["abc-view"],oldScoreTitle),
  previouslySaved,"The display-only toggle must not rewrite the music");
 await page.locator(".silba-home").getByRole("link",{name:"Brudmarch från Jämtland"}).click();
 const nextStandalone=page.locator('.huwabc-standalone[data-huwabc-title="SilbaÄtno · Brudmarch från Jämtland"]').first();
 await nextStandalone.waitFor();
 assert.ok(await nextStandalone.evaluate(node=>node.classList.contains("huwabc-minimal")),
  "Each newly opened score must independently start minimal");
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
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
 const beforeMousePage=await page.evaluate(()=>window.scrollY);
 const grip=await order.locator(".huwrep-order-handle").first().boundingBox();
 const destination=await order.locator(".huwrep-order-row").nth(2).boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
 await page.mouse.down();
 await page.mouse.move(destination.x+40,destination.y+destination.height*.8,{steps:12});
 await page.mouse.up();
 await page.waitForFunction(text=>document.querySelector(".huwrep-order-title")?.textContent!==text,beforeMouse);
 const afterMousePage=await page.evaluate(()=>window.scrollY);
 assert.ok(Math.abs(afterMousePage-beforeMousePage)<3,
  "Mouse reorder must not scroll the outer TiddlyWiki story: "+beforeMousePage+" -> "+afterMousePage);
 // A Chrome touch stream exercises the iPad pathway and the same order persistence.
 const beforeTouch=await order.locator(".huwrep-order-title").first().innerText();
 await page.evaluate(()=>document.querySelector(".huwrep-order-handle")?.scrollIntoView({block:"center",behavior:"instant"}));
 const beforeTouchPage=await page.evaluate(()=>window.scrollY);
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
 const afterTouchPage=await page.evaluate(()=>window.scrollY);
 assert.ok(Math.abs(afterTouchPage-beforeTouchPage)<3,
  "iPad touch reorder must not scroll the page: "+beforeTouchPage+" -> "+afterTouchPage);
 await cdp.detach();
 // At the bottom edge the setlist should scroll internally, not move StoryView.
 await page.evaluate(()=>{
  const list=document.querySelector(".huwrep-order-list");
  list.scrollTop=0;
  list.scrollIntoView({block:"center",behavior:"instant"});
 });
 const local=await page.evaluate(()=>{
  const list=document.querySelector(".huwrep-order-list"),rect=list.getBoundingClientRect();
  const handle=list.querySelector(".huwrep-order-handle").getBoundingClientRect();
  return {pageY:window.scrollY,listTop:list.scrollTop,
   from:{x:handle.left+handle.width/2,y:handle.top+handle.height/2},
   to:{x:handle.left+handle.width/2,y:rect.bottom-7}};
 });
 assert.equal(local.listTop,0);
 await page.mouse.move(local.from.x,local.from.y);
 await page.mouse.down();
 await page.mouse.move(local.to.x,local.to.y,{steps:12});
 await page.waitForTimeout(240);
 const localEnd=await page.evaluate(()=>({
  listTop:document.querySelector(".huwrep-order-list").scrollTop,pageY:window.scrollY
 }));
 await page.mouse.up();
 assert.ok(localEnd.listTop>0,"Dragging towards the list edge must auto-scroll only the setlist");
 assert.ok(Math.abs(localEnd.pageY-local.pageY)<3,
  "The surrounding StoryView must remain stationary during local auto-scroll");
 // Live setlist notation and sound share the transformed ABC, without rewriting the source.
 await page.getByRole("button",{name:"Åbn nodebogen"}).click();
 const arrangementBook=page.locator(".huwrep-book").first();
 await arrangementBook.waitFor();
 const scoreDrawerButton=arrangementBook.locator(".huwabc-reader-list");
 await scoreDrawerButton.waitFor({state:"visible"});
 await scoreDrawerButton.click();
 await arrangementBook.locator(".huwrep-book-list-items button")
  .filter({hasText:"Brudmarch från Jämtland"}).click();
 await page.waitForFunction(()=>document.querySelector(".huwrep-book-heading h2")?.textContent
  .includes("Brudmarch från Jämtland"));
 await page.waitForFunction(()=>{
  const score=document.querySelector(".huwrep-book-score textarea.huwabc-readable-abc")?.value||"";
  return /^K:Dm$/m.test(score)&&/^Q:1\/4=118$/m.test(score);
 },undefined,{timeout:90000});
 const liveABC=await arrangementBook.locator("textarea.huwabc-readable-abc").inputValue();
 assert.notEqual(liveABC,uneditedScore,"Setlist renders the changed in-memory score");
 assert.match(liveABC,/^K:Dm$/m);
 assert.match(liveABC,/^Q:1\/4=118$/m);
 assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields["abc-source"],brudmarchTitle),
  uneditedScore,"Setlist transformation does not rewrite the original ABC");
 assert.equal(await arrangementBook.locator(".huwrep-book-stage").getByText(
  "Bemærk: Den aftalte toneart vises ovenfor; selve ABC-noderne transponeres endnu ikke automatisk."
 ).count(),0,"The obsolete message beside the nodes must be gone");
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
