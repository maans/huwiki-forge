/**
 * Browser acceptance for the editable Repertoire demo.
 * Run after assembling the wiki:
 * npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
 * CHROME_BIN=/usr/bin/google-chrome node scripts/repertoire-browser-smoke.mjs
 */
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
const root=path.resolve(import.meta.dirname,"..");
const url=pathToFileURL(path.join(root,"editions/silva-ethno-repertoire/index.html")).href;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
let page;
try{
 const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true});
 // Avoid network sound/font downloads during a visual and mixer state test.
 await context.route("**/*",route=>route.request().url().startsWith("file:")?
  route.continue():route.abort());
 page=await context.newPage();
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

 // Work from the same open book, as a player returning to prepare a setlist.
 await book.getByRole("button",{name:"← Repertoireværksted",exact:true}).click();
 const workshop=page.locator(".huwrep").first();
 await workshop.waitFor();
 assert.equal(await workshop.getByRole("button",{name:"Åbn nodebogen",exact:true}).count(),1,
  "The workshop has one clear action for opening the nodebook");
 for(const name of ["Sætliste (17)","Orkestrets repertoire (17)","Musikbibliotek (17)"])
  assert.equal(await workshop.getByRole("tab",{name,exact:true}).count(),1,name);
 const screenshots=path.join(root,"test-results/repertoire");
 await mkdir(screenshots,{recursive:true});
 await workshop.screenshot({path:path.join(screenshots,"repertoire-workshop-landscape.png"),animations:"disabled"});
 await page.setViewportSize({width:820,height:1180});
 await workshop.screenshot({path:path.join(screenshots,"repertoire-workshop-portrait.png"),animations:"disabled"});
 await page.setViewportSize({width:1180,height:820});

 const snapshot=()=>page.evaluate(()=>{
  const wiki=$tw.wiki;
  const all=wiki.allTitles().map(t=>wiki.getTiddler(t)).filter(Boolean);
  const set=all.find(t=>t.fields["repertoire-kind"]==="setlist");
  return {
   setlistTitle:set.fields.title,
   order:wiki.getTiddlerList(set.fields.title,"list"),
   agreements:set.fields["repertoire-overrides"],
   sources:all.filter(t=>typeof t.fields["abc-source"]==="string")
    .map(t=>({title:t.fields.title,abc:t.fields["abc-source"],mix:t.fields["abc-accompaniment"]}))
    .sort((a,b)=>a.title.localeCompare(b.title)),
   items:all.filter(t=>t.fields["repertoire-kind"]==="orchestra-item")
    .map(t=>({...t.fields})).sort((a,b)=>a.title.localeCompare(b.title))
  };
 });
 const beforeBrowse=await snapshot();
 await workshop.getByRole("tab",{name:"Musikbibliotek (17)",exact:true}).click();
 const search=workshop.locator(".huwrep-catalog-search");
 await search.fill("Alidhems");
 await search.pressSequentially(" hojder");
 const rows=workshop.locator(".huwrep-table tbody tr[data-music-title]");
 assert.equal(await rows.count(),1,"Accented titles can be found with ordinary keyboard letters");
 assert.equal(await rows.first().getAttribute("data-music-title"),"SilbaÄtno · Ålidhems höjder");
 assert.equal(await search.evaluate(input=>document.activeElement===input),true,
  "Typing in the catalog preserves keyboard focus between keystrokes");
 assert.equal(await search.inputValue(),"Alidhems hojder");
 await search.fill("");
 await workshop.locator(".huwrep-catalog-sort").selectOption("tempo");
 const sortedTitles=await rows.evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-music-title")));
 assert.equal(sortedTitles.length,17);
 const sortedTempos=await page.evaluate(titles=>titles.map(t=>{
  const abc=$tw.wiki.getTiddler(t).fields["abc-source"];
  const tempo=/^Q:[^\n]*=\s*(\d+(?:\.\d+)?)/m.exec(abc);
  return tempo?Number(tempo[1]):null;
 }),sortedTitles);
 const knownTempos=sortedTempos.filter(n=>n!==null);
 assert.ok(new Set(knownTempos).size>1,"The seed repertoire exercises multiple numeric tempos");
 assert.deepEqual(knownTempos,[...knownTempos].sort((a,b)=>a-b),
  "Tempo sorting places 70/80 before 100/110, instead of sorting their text");
 assert.deepEqual(await snapshot(),beforeBrowse,
  "Searching and sorting the library do not reorder a setlist or alter scores, mixes or orchestra agreements");

 await workshop.getByRole("tab",{name:"Sætliste (17)",exact:true}).click();
 assert.equal(await workshop.getByRole("tab",{name:"Sætliste (17)",exact:true}).getAttribute("aria-selected"),"true");
 const sortPanel=workshop.locator(".huwrep-set-sort");
 await sortPanel.locator("summary").click();
 await sortPanel.locator(".huwrep-set-sort-select").selectOption("tempo");
 await sortPanel.getByRole("button",{name:"Sortér sætlisten",exact:true}).click();
 const reordered=await snapshot();
 assert.notDeepEqual(reordered.order,beforeBrowse.order,"Sorting the setlist changes its saved playing order");
 assert.equal(reordered.order.length,17);
 assert.deepEqual([...reordered.order].sort(),[...beforeBrowse.order].sort(),"Sorting preserves all setlist entries");
 const reorderedSources=await page.evaluate(ids=>ids.map(id=>$tw.wiki.getTiddler(id).fields["music-title"]),reordered.order);
 assert.deepEqual(reorderedSources,sortedTitles,"Saved setlist order matches the selected numeric sort");
 assert.deepEqual(reordered.sources,beforeBrowse.sources,"Setlist sorting keeps original scores intact");
 assert.deepEqual(reordered.items,beforeBrowse.items,"Setlist sorting keeps orchestra defaults intact");
 assert.equal(reordered.agreements,beforeBrowse.agreements,"Setlist sorting keeps its arrangements intact");
 await workshop.getByRole("button",{name:"Fortryd sortering",exact:true}).click();
 assert.deepEqual(await snapshot(),beforeBrowse,"Undo restores the exact previous playing order");

 const selectedTitle="SilbaÄtno · Mita, Barfly (Gm)";
 await workshop.locator('.huwrep-table tbody tr[data-music-title="'+selectedTitle+'"] .huwrep-title-button').click();
 await workshop.getByRole("button",{name:"Åbn nodebogen",exact:true}).click();
 await book.waitFor({state:"visible"});
 await page.waitForFunction(t=>
  document.querySelector(".huwrep-book-heading h2")?.textContent?.includes(t),selectedTitle);
 await page.waitForFunction(()=>!!document.querySelector(".huwrep-book .huwabc-page-select"));
 // A second round-trip must resume the chosen song even though the tiddler
 // remains in TiddlyWiki's StoryList and might not receive a fresh render.
 await book.getByRole("button",{name:"← Repertoireværksted",exact:true}).click();
 await workshop.waitFor({state:"visible"});
 await workshop.getByRole("button",{name:"Åbn nodebogen",exact:true}).click();
 await book.waitFor({state:"visible"});
 await page.waitForFunction(t=>
  document.querySelector(".huwrep-book-heading h2")?.textContent?.includes(t),selectedTitle);
 await page.waitForFunction(()=>!!document.querySelector(".huwrep-book .huwabc-page-select"));

 assert.ok(!errors.some(e=>/huwiki-repertoire-book|repertoire\/book-widget|Repertoire/.test(e)),
  "No Repertoire runtime errors: "+errors.join("; "));
 console.log("Repertoire browser acceptance: direct Nodebog, searchable drawer, Music Minus One, metronome, one/two-page rotation, library search/sort, saved setlist order/undo, selected-song round trips");
 await context.close();
}catch(error){
 if(page&&!page.isClosed()){
  const screenshotDir=path.join(root,"test-results/repertoire");
  await mkdir(screenshotDir,{recursive:true});
  await page.screenshot({path:path.join(screenshotDir,"repertoire-failure.png"),timeout:5000})
   .catch(()=>{});
 }
 throw error;
}finally{await browser.close();}
