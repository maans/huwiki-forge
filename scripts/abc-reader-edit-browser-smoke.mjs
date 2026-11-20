/**
 * Native acceptance for opening ABC's draft editor from the Repertoire reader.
 * Build ABC, Repertoire and the ordinary SilbaÄtno demo before running this file.
 * npm install --no-save --no-package-lock --ignore-scripts playwright@1.56.1
 * npx playwright install --with-deps webkit chromium
 * ABC_READER_BROWSER=webkit node scripts/abc-reader-edit-browser-smoke.mjs
 * ABC_READER_BROWSER=chromium node scripts/abc-reader-edit-browser-smoke.mjs
 *
 * The probes below only count calls; every shipped method still runs. Audio is
 * not stubbed or switched off. External sample/font downloads are blocked so
 * this lifecycle test does not depend on third-party servers.
 */
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium, webkit, devices} from "playwright";

const root=path.resolve(import.meta.dirname,"..");
const engineName=process.env.ABC_READER_BROWSER||"webkit";
const engine={webkit,chromium}[engineName];
assert.ok(engine,"ABC_READER_BROWSER must be webkit or chromium");
const url=process.env.ABC_READER_EDIT_URL||pathToFileURL(path.join(root,
 "editions/silva-ethno-repertoire/index.html")).href;
const resultsRoot=path.join(root,"test-results/abc-reader-edit",engineName);
await mkdir(resultsRoot,{recursive:true});
const ipad=devices["iPad Pro 11"];
assert.ok(ipad,"The pinned Playwright version must include the iPad Pro 11 profile");
const scenarios=engineName==="webkit"?[
 {name:"ipad-landscape",touch:true,context:{...ipad,viewport:{width:1194,height:834},screen:{width:1194,height:834}}},
 {name:"ipad-portrait",touch:true,context:{...ipad,viewport:{width:834,height:1194},screen:{width:834,height:1194}}}
]:[{name:"desktop",touch:false,context:{viewport:{width:1180,height:820}}}];
const launchOptions={headless:true};
if(engineName==="chromium"){
 launchOptions.args=["--no-sandbox","--disable-dev-shm-usage"];
 if(process.env.CHROME_BIN)launchOptions.executablePath=process.env.CHROME_BIN;
}
const browser=await engine.launch(launchOptions);
const allResults=[];

async function installProbe(page){
 await page.evaluate(()=>{
  const probe=window.__abcReaderEditProbe={
   scores:new Set(),editors:new Set(),players:new Set(),
   counts:{scoreMounts:0,scoreDisposals:0,editorMounts:0,editorDisposals:0,
    registrations:0,unregistrations:0,maxScores:0,maxPlayers:0,resizeEvents:0,mutations:0}
  };
  function trackWidget(moduleTitle,exportName,setName,mountName,disposeName){
   const proto=$tw.modules.execute(moduleTitle)[exportName].prototype;
   const render=proto.render,destroy=proto.onDestroy;
   proto.render=function(...args){
    const result=render.apply(this,args);
    probe[setName].add(this);probe.counts[mountName]++;
    if(setName==="scores")probe.counts.maxScores=Math.max(probe.counts.maxScores,probe.scores.size);
    return result;
   };
   proto.onDestroy=function(...args){
    if(probe[setName].delete(this))probe.counts[disposeName]++;
    return destroy.apply(this,args);
   };
  }
  trackWidget("$:/plugins/huwiki/abc/score-widget.js","huwiki-abc","scores","scoreMounts","scoreDisposals");
  trackWidget("$:/plugins/huwiki/abc/edit-widget.js","huwiki-abc-edit","editors","editorMounts","editorDisposals");
  const playback=$tw.modules.execute("$:/plugins/huwiki/abc/playback.js");
  const register=playback.register,unregister=playback.unregister;
  playback.register=function(player){
   probe.players.add(player);probe.counts.registrations++;
   probe.counts.maxPlayers=Math.max(probe.counts.maxPlayers,probe.players.size);
   return register.apply(this,arguments);
  };
  playback.unregister=function(player){
   probe.players.delete(player);probe.counts.unregistrations++;
   return unregister.apply(this,arguments);
  };
  window.addEventListener("resize",()=>probe.counts.resizeEvents++);
  new MutationObserver(records=>probe.counts.mutations+=records.length)
   .observe(document.body,{subtree:true,childList:true});
 });
}

async function snapshot(page){
 return page.evaluate(()=>{
  const p=window.__abcReaderEditProbe;
  const book=document.querySelector(".huwrep-book");
  const score=book?.querySelector(".huwabc-score");
  const paper=score?.querySelector(".huwabc-paper");
  const pager=paper?._huwabcPager;
  return {
   counts:{...p.counts},scores:p.scores.size,editors:p.editors.size,players:p.players.size,
   connectedScores:[...p.scores].filter(s=>s.host?.isConnected).length,
   connectedEditors:[...p.editors].filter(s=>s.host?.isConnected).length,
   bookHidden:!book||book.hidden||getComputedStyle(book).display==="none",
   bookFullscreen:!!book?.classList.contains("huwrep-book-fullscreen"),
   sourceTitle:score?.getAttribute("data-huwabc-title")||null,
   readerActive:!!score?.classList.contains("huwabc-reader-active"),
   page:pager?.info()||null,
   drafts:$tw.wiki.allTitles().filter(t=>$tw.wiki.getTiddler(t)?.fields["draft.of"]),
   sourceText:score?$tw.wiki.getTiddler(score.getAttribute("data-huwabc-title"))?.fields["abc-source"]:null
  };
 });
}

// A quiet interval catches delayed observer/remount churn after the native
// transition. It is deliberately short and does not rely on heap/GC heuristics.
async function assertSettled(page,label){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,200)))));
 const before=await snapshot(page);
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,300)));
 const after=await snapshot(page);
 assert.equal(after.counts.scoreMounts,before.counts.scoreMounts,label+": no background score remounts");
 assert.equal(after.counts.editorMounts,before.counts.editorMounts,label+": no repeated draft editor mounts");
 assert.equal(after.counts.registrations,before.counts.registrations,label+": no repeated playback registration");
 assert.ok(after.counts.resizeEvents-before.counts.resizeEvents<6,label+": resize events settle");
 assert.ok(after.counts.mutations-before.counts.mutations<100,label+": DOM mutations settle");
 return after;
}

try{
 for(const scenario of scenarios){
  const out=path.join(resultsRoot,scenario.name);
  await mkdir(out,{recursive:true});
  const context=await browser.newContext(scenario.context);
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.route("**/*",route=>/^https?:/.test(route.request().url())&&
   !route.request().url().startsWith(new URL(url).origin+"/")?
   route.abort():route.continue());
  const page=await context.newPage();
  page.setDefaultTimeout(25000);
  const errors=[],dialogs=[],steps=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("crash",()=>errors.push("BROWSER PAGE CRASH"));
  page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  const activate=locator=>scenario.touch?locator.tap():locator.click();
  const step=message=>{steps.push(message);console.log(`[${engineName}/${scenario.name}] ${message}`);};
  try{
   await page.goto(url,{waitUntil:"domcontentloaded",timeout:90000});
   await page.waitForFunction(()=>window.$tw?.wiki&&$tw.rootWidget);
   await installProbe(page);
   await activate(page.getByRole("link",{name:"Åbn nodebogen",exact:true}));
   const book=page.locator(".huwrep-book").first();
   await book.locator(".huwabc-reader-toolbar").waitFor({state:"visible"});
   await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-paper")?._huwabcPager?.info().count>0);
   step("Opened the ordinary full-screen Nodebog");

   await activate(book.locator(".huwabc-reader-list"));
   const drawer=book.locator(".huwrep-book-list");
   await drawer.locator("input[type=search]").fill("Cocek Srece");
   const matches=drawer.locator(".huwrep-book-list-items button:visible");
   assert.equal(await matches.count(),1,"The stock multi-page score is found in the real setlist");
   await activate(matches.first());
   await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-score")?.getAttribute("data-huwabc-title")?.includes("Cocek Srece")&&
    document.querySelector(".huwrep-book .huwabc-paper")?._huwabcPager?.info().count>1);
   const menu=book.locator(".huwabc-reader-menu");
   await activate(menu);
   await book.locator(".huwabc-reader-page-choice").selectOption("single");
   await activate(menu);
   await activate(book.locator(".huwabc-reader-next"));
   await page.waitForFunction(()=>document.querySelector(".huwrep-book .huwabc-paper")?._huwabcPager?.info().page>1);
   let expected=await assertSettled(page,"Initial reader");
   assert.equal(expected.scores,1,"Exactly one source score is mounted before editing");
   assert.equal(expected.editors,0);
   assert.ok(expected.players<=1,"Only the visible score owns a player");
   const sourceTitle=expected.sourceTitle;
   let expectedSource=expected.sourceText;
   const expectedPage=expected.page.page;
   const expectedAnchor=expected.page.anchor.event;
   step(`Selected ${sourceTitle}, page ${expectedPage}, anchor ${expectedAnchor}`);

   for(const [cycle,operation] of ["cancel","save","cancel"].entries()){
    await activate(book.locator(".huwabc-reader-menu"));
    await activate(book.getByRole("button",{name:"Redigér",exact:true}));
    const frame=page.locator(".huwabc-edit-frame");
    await frame.waitFor({state:"visible"});
    await frame.locator(".huwabc-edit-preview svg").first().waitFor({state:"visible"});
    assert.equal(await frame.count(),1,"One native draft frame opens from one menu activation");
    const editing=await assertSettled(page,`Cycle ${cycle+1} open`);
    assert.equal(editing.scores,0,"The source reader is disposed before editing; hiding its controls is insufficient");
    assert.equal(editing.players,0,"The previous reader's playback controller is unregistered during editing");
    assert.equal(editing.connectedEditors,1,"Exactly one connected ABC draft is editable");
    assert.equal(editing.bookFullscreen,false,"The book cannot keep covering the draft editor");
    assert.equal(await book.locator(".huwabc-score").count(),0,"No embedded score DOM remains behind the editor");
    const draftTitle=await frame.getAttribute("data-tiddler-title");
    const original=await page.evaluate(title=>$tw.wiki.getTiddler(title).fields["abc-source"],sourceTitle);
    assert.equal(original,expectedSource,"Opening an editor must not change the source ABC");
    assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields["draft.of"],draftTitle),sourceTitle);
    assert.equal(editing.drafts.filter(t=>t===draftTitle).length,1);

    // Change the actual draft through its text input, then cause unrelated
    // wiki changes that previously could wake a hidden background reader.
    const draftSource=expectedSource+`\n% native reader edit cycle ${cycle+1}`;
    await frame.locator("textarea.huwabc-code").fill(draftSource);
    await page.waitForFunction(({title,text})=>$tw.wiki.getTiddler(title)?.fields["abc-source"]===text,
     {title:draftTitle,text:draftSource});
    await page.evaluate(index=>{
     $tw.wiki.addTiddler(new $tw.Tiddler({title:"Repertoire/Test/Reader editor activity",text:"unrelated book update "+index}));
     $tw.wiki.addTiddler(new $tw.Tiddler({title:"$:/temp/abc-reader-edit-test",text:"unrelated UI update "+index}));
    },cycle);
    const duringDraft=await assertSettled(page,`Cycle ${cycle+1} draft change`);
    assert.equal(duringDraft.scores,0,"Draft and unrelated wiki updates must not recreate the suspended score");
    assert.equal(duringDraft.players,0,"No hidden audio controller is recreated by wiki updates");
    assert.equal(duringDraft.editors,1,"Draft changes retain the same editor instance");

    const hint=await page.evaluate(action=>$tw.wiki.getTiddlerText(
     action==="save"?"$:/language/Buttons/Save/Hint":"$:/language/Buttons/Cancel/Hint"),operation);
    await activate(frame.getByRole("button",{name:hint,exact:true}));
    await frame.waitFor({state:"detached"});
    await book.locator(".huwabc-reader-toolbar").waitFor({state:"visible"});
    await page.waitForFunction(({title,pageNumber})=>{
     const score=document.querySelector(".huwrep-book .huwabc-score");
     return score?.getAttribute("data-huwabc-title")===title&&
      score?.querySelector(".huwabc-paper")?._huwabcPager?.info().page===pageNumber;
    },{title:sourceTitle,pageNumber:expectedPage});
    if(operation==="save")expectedSource=draftSource;
    expected=await assertSettled(page,`Cycle ${cycle+1} ${operation}`);
    assert.equal(expected.sourceText,expectedSource,operation==="save"?"Save retains the edited draft source":"Cancel preserves the source exactly");
    assert.equal(expected.page.anchor.event,expectedAnchor,"The same musical reading position is restored");
    assert.equal(expected.scores,1,"Return mounts one reader, with no hidden standalone duplicate");
    assert.equal(expected.editors,0,"The closed draft editor is disposed");
    assert.ok(expected.players<=1,"Returning from editing retains at most one playback registration");
    assert.equal(expected.bookFullscreen,true,"The full-screen book is restored");
    assert.equal(expected.readerActive,true,"Return restores the clean reader");
    assert.equal(expected.drafts.includes(draftTitle),false,"The completed draft is removed");
    step(`Cycle ${cycle+1}: native ${operation}, one restored reader, no retained draft/player`);
   }
   assert.ok(expected.counts.maxScores<=1,"Source readers never accumulate across edit cycles");
   assert.ok(expected.counts.maxPlayers<=1,"Playback controllers never accumulate across edit cycles");
   assert.equal(expected.counts.editorMounts,3,"Each native edit action creates exactly one draft editor");
   assert.equal(expected.counts.editorDisposals,3,"Every draft editor is disposed after save or cancel");
   assert.deepEqual(errors,[],"No browser/runtime errors occurred");
   await page.screenshot({path:path.join(out,"restored-reader.png")});
   allResults.push({scenario:scenario.name,success:true,steps,final:expected,dialogs,errors});
  }catch(error){
   let state;
   try{state=await snapshot(page);await page.screenshot({path:path.join(out,"failure.png")});}catch(snapshotError){state={snapshotError:String(snapshotError)};}
   await writeFile(path.join(out,"failure.json"),JSON.stringify({error:String(error),steps,state,errors,dialogs},null,2));
   throw error;
  }finally{
   await context.tracing.stop({path:path.join(out,"trace.zip")});
   await context.close();
  }
 }
 await writeFile(path.join(resultsRoot,"results.json"),JSON.stringify(allResults,null,2));
 console.log(`ABC reader → editor acceptance passed: ${engineName}, ${scenarios.length} viewport(s), native save/cancel and bounded lifecycle`);
}finally{await browser.close();}
