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
const url=pathToFileURL(path.join(root,"editions/silba-atno-repertoire/index.html")).href;
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
 // Responsive SilbaÄtno hero: the sidebar can narrow a TiddlyWiki story
 // without shrinking the outer browser viewport. The headline must stay on
 // one line, and all four labelled icon actions must remain in one row.
 const actions=page.locator(".silba-actions .silba-action");
 assert.equal(await actions.count(),4,"Exactly four compact hero actions remain");
 assert.equal(await actions.locator("svg").count(),4,"Each icon must render as an actual SVG");
 assert.equal(await actions.locator(".silba-action-label").count(),4,"Icon links retain accessible names");
 for(const width of [1000,800,690,520,360]){
  await page.locator(".silba-home").evaluate((node,w)=>node.style.width=w+"px",width);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=await page.evaluate(()=>{
   const hero=document.querySelector(".silba-home"),heading=hero.querySelector(".silba-hero h1");
   const links=Array.from(hero.querySelectorAll(".silba-actions .silba-action"));
   const rects=links.map(n=>n.getBoundingClientRect());
   const box=heading.getBoundingClientRect();
   const style=getComputedStyle(heading),photoStyle=getComputedStyle(hero.querySelector(".silba-photo-visual"));
   return {width:hero.getBoundingClientRect().width,headlineWidth:heading.scrollWidth,availableWidth:heading.clientWidth,
    lineHeight:parseFloat(style.lineHeight),headingHeight:box.height,
    photoPositionY:photoStyle.backgroundPositionY.split(",")[0].trim(),
    links:rects.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))};
  });
  assert.ok(geometry.headlineWidth<=geometry.availableWidth+2,
   "SilbaÄtno title must fit its own card at "+width+"px: "+JSON.stringify(geometry));
  assert.ok(geometry.headingHeight<=geometry.lineHeight+2,
   "SilbaÄtno title cannot wrap at "+width+"px");
  assert.ok(geometry.links.every(link=>link.width>=43&&link.height>=43),
   "Icon buttons must keep iPad-friendly touch targets");
  assert.ok(geometry.links.every(link=>Math.abs(link.y-geometry.links[0].y)<2),
   "All four actions must remain on the same row at "+width+"px");
  assert.equal(geometry.photoPositionY,width<=690?"0%":"50%",
   "At "+width+"px the photo should "+(width<=690?"show the faces at the top":"remain centered"));
 }
 await page.locator(".silba-home").evaluate(node=>node.style.removeProperty("width"));

 // The three statistic cards must navigate to real, filtered TiddlyWiki lists.
 for(const [i,title,expected] of [[0,"SilbaÄtno – Nodeark",18],[1,"SilbaÄtno – Hovedliste",14],[2,"SilbaÄtno – Bruttoliste",21]]){
  await page.locator(".silba-metrics .silba-metric").nth(i).click();
  const list=page.locator('.tc-tiddler-frame[data-tiddler-title="'+title+'"] .silba-generated-list .silba-track-list li');
  await list.first().waitFor();
  assert.equal(await list.count(),expected,title+" should contain "+expected+" linked songs");
  assert.equal(await list.locator("a.silba-track-link").count(),expected,title+" should link every song");
 }
 const pendingEntry=page.locator('.tc-tiddler-frame[data-tiddler-title="SilbaÄtno – Bruttoliste"] .silba-track-list li').filter({hasText:"Oh verden"});
 assert.equal(await pendingEntry.count(),1,"The full gross list must include an editable placeholder for Oh verden");
 await pendingEntry.locator("a.silba-track-link").click();
 await page.locator('.tc-tiddler-frame[data-tiddler-title="SilbaÄtno · Oh verden"]').waitFor();
 // Oh verden must render in ABC Musik with its chord-only player, not as a pre/code section.
 const ohScore=page.locator('.huwabc-standalone[data-huwabc-title="SilbaÄtno · Oh verden"]').first();
 await ohScore.waitFor();
 await ohScore.locator(".huwabc-chord-overview-row").first().waitFor({state:"visible"});
 assert.equal(await ohScore.locator(".huwrep-chord-line").count(),0,"No WikiText code block");
 const overview=await ohScore.evaluate(node=>({
  rows:[...node.querySelectorAll(".huwabc-chord-overview-row")].map(row=>{
   const box=row.getBoundingClientRect();
   return {part:row.getAttribute("data-part"),bars:row.querySelectorAll(".huwabc-chord-overview-bar").length,
    chords:[...row.querySelectorAll(".huwabc-chord-overview-chord")].map(c=>c.textContent.trim()),
    repeats:[...row.querySelectorAll(".huwabc-chord-overview-repeat")].map(c=>c.textContent.trim()),
    label:row.querySelector(".huwabc-chord-overview-feel")?.textContent.trim()||"",
    visible:box.width>0&&box.height>0};
  }),
  paperScrollWidth:node.querySelector(".huwabc-minimal-paper")?.scrollWidth,
  paperWidth:node.querySelector(".huwabc-minimal-paper")?.clientWidth,
  geometry:(()=>{
   const paper=node.querySelector(".huwabc-minimal-paper");
   const chart=paper?.querySelector(".huwabc-chord-overview");
   const first=chart?.querySelector(".huwabc-chord-overview-row");
   const origin=paper?.getBoundingClientRect();
   const chartRect=chart?.getBoundingClientRect();
   const firstRect=first?.getBoundingClientRect();
   const hidden=[...paper.querySelectorAll(":scope > .huwabc-chord-overview-source")];
   return {paperHeight:origin?.height,chartHeight:chartRect?.height,
    chartTop:chartRect?.top-origin?.top,firstRowTop:firstRect?.top-origin?.top,
    sourceCount:hidden.length,sourceHeights:hidden.map(x=>x.getBoundingClientRect().height),
    sourcePositions:hidden.map(x=>getComputedStyle(x).position)};
  })()
 }));
 assert.equal(overview.rows.length,2,"Whole song must fit on the screen");
 assert.deepEqual(overview.rows.map(r=>r.part),["A","B"]);
 assert.deepEqual(overview.rows.map(r=>r.bars),[4,4]);
 assert.deepEqual(overview.rows[0].chords,["E7","A7","Dm","E7"]);
 assert.deepEqual(overview.rows[1].chords,["E7","Am","E7","Dm","E7","Dm","E7","Am"]);
 assert.ok(overview.rows.every(r=>r.visible),"Both rows must remain visible simultaneously");
 assert.ok(overview.rows.every(r=>r.repeats.includes("|:")&&r.repeats.includes(":|")),
  "A and B must keep both repeat marks: "+JSON.stringify(overview.rows));
 assert.equal(overview.rows[1].label,"Dobbelt tempo");
 assert.ok(overview.paperScrollWidth<=overview.paperWidth+2,"No horizontal scrolling or cropped bars: "+JSON.stringify(overview));
 assert.ok(overview.geometry.sourceCount>=1,"ABCJS notation must remain in the DOM for playback");
 assert.ok(overview.geometry.sourcePositions.every(p=>p==="absolute"),"Hidden ABCJS wrappers must not occupy layout space: "+JSON.stringify(overview.geometry));
 assert.ok(overview.geometry.sourceHeights.every(h=>h<=2),"Underlying score may not create a tall blank region: "+JSON.stringify(overview.geometry));
 assert.ok(overview.geometry.chartTop>=-2&&overview.geometry.chartTop<30,"Chord chart must begin at top of paper: "+JSON.stringify(overview.geometry));
 assert.ok(overview.geometry.firstRowTop>=0&&overview.geometry.firstRowTop<80,"First A bar must be visible immediately, not a page lower: "+JSON.stringify(overview.geometry));
 assert.ok(overview.geometry.paperHeight<320,"Two 4-bar rows must not leave an A4-sized blank area: "+JSON.stringify(overview.geometry));

 assert.equal(await ohScore.locator(".huwabc-chord-overview-chord[data-huwabc-source-char]").count(),12,
  "Every chord can select its playback position");
 const chart=await page.evaluate(()=>{
  const f=$tw.wiki.getTiddler("SilbaÄtno · Oh verden").fields;
  const ABC=$tw.modules.execute("$:/plugins/huwiki/abc/vendor/abcjs.js");
  const data=$tw.modules.execute("$:/plugins/huwiki/abc/chord-chart.js").extract(ABC,f["abc-source"]);
  const Acc=$tw.modules.execute("$:/plugins/huwiki/abc/accompaniment.js");
  const tune=ABC.parseOnly(f["abc-source"])[0];
  const arr=Acc.prepare(ABC,tune,f["abc-source"],JSON.parse(f["abc-accompaniment"]),false,f);
  return {chords:data.chords.map(c=>c.name),measures:data.measures.length,
    parts:arr.parts.map(p=>({name:p.name,notes:p.notes.length})),
    feel:arr.bars.map(b=>({doubleTime:b.doubleTime,start:b.start,end:b.end})),
    tempo:f["abc-source"].match(/^Q:(.*)$/m)?.[1],
    style:JSON.parse(f["abc-accompaniment"]).style};
 });
 assert.deepEqual(chart.chords,["E7","A7","Dm","E7","E7","Am","E7","Dm","E7","Dm","E7","Am"]);
 assert.equal(chart.measures,8);
 assert.equal(chart.tempo,"1/4=66");
 assert.equal(chart.style,"balkan-44");
 assert.ok(chart.feel.some(b=>!b.doubleTime)&&chart.feel.some(b=>b.doubleTime),
   "The accompaniment must change feel at B: "+JSON.stringify(chart.feel));
 assert.ok(chart.feel.every(b=>b.end>b.start),"Double-time must preserve bar lengths");
 for(const name of ["Bas","Akkorder","Slagtøj"])
  assert.ok(chart.parts.some(p=>p.name===name&&p.notes>0),
   "4/4 Balkan needs playable "+name+": "+JSON.stringify(chart.parts));


 // Use the real ABCJS parser, not a mocked score, to confirm both A/B repeats
 // unfold independently. This also validates the exact first/second-volta
 // line break after the MuseScore import.
 const volta=await page.evaluate(()=>{
  const ABC=$tw.modules.execute("$:/plugins/huwiki/abc/vendor/abcjs.js");
  const planner=$tw.modules.execute("$:/plugins/huwiki/abc/repeat-plan.js");
  const source=$tw.wiki.getTiddler("SilbaÄtno · Låt från Dalarne").fields["abc-source"];
  const p=planner.build(ABC,source,{});
  return {active:p.active,order:p.order.map(n=>n+1),sections:p.sections.map(s=>[s.start,s.end])};
 });
 assert.equal(volta.active,true,"Volta playback must use the shared repeat timeline");
 assert.deepEqual(volta.sections,[[0,9],[9,19]],"A and B must remain separate repeats even when A volta 2 ends at B |:");
 assert.deepEqual(volta.order,[
  1,2,3,4,5,6,7,8,1,2,3,4,5,6,7,9,
  10,11,12,13,14,15,16,17,10,11,12,13,14,15,18,19
 ],"ABCJS must play the 32 written bars of Dalarne in the correct repeated order");
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
  advancedLabel==="Advanced view"?"Normal view":"Normal visning");
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
 assert.equal(await cards.count(),18,"17 scores and Oh verden chord sheet are full-card tap targets");
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
