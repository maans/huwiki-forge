/**
 * Optional Chromium smoke test, not a substitute for Mac/iPad acceptance.
 * The assembled edition is opened as a local file with network disabled.
 * Requires playwright-core, installed only in the dedicated CI workflow.
 */
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
import {assembleHtml,loadEdition} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
async function localFetch(url){
 const u=new URL(url);
 if(u.origin!=="https://forge.test"||!u.pathname.startsWith("/repo/"))return {ok:false,status:403};
 try {
  const value=await readFile(path.join(root,u.pathname.slice(6)),"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(value)};
 } catch(_){return {ok:false,status:404};}
}
async function main(){
 const {tiddlers}=await loadEdition("https://forge.test/repo/editions/tegne/manifest.json",localFetch);
 const empty=await readFile(path.join(root,"core/empty.html"),"utf8");
 const output=assembleHtml(empty,tiddlers);
 const folder=await mkdtemp(path.join(tmpdir(),"huwiki-tegne-smoke-"));
 const filename=path.join(folder,"tegne.html");
 await writeFile(filename,output);
 console.log("Tegne HTML bytes",Buffer.byteLength(output));
 const executablePath=process.env.CHROME_BIN||"/usr/bin/google-chrome";
 const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"});
  await context.setOffline(true);
  const page=await context.newPage();
  const critical=[],networkFailures=[];
  page.on("pageerror",error=>critical.push(error.message));
  page.on("requestfailed",request=>{
   const url=request.url();
   networkFailures.push(url);
   console.warn("browser failed request:",url,request.failure()?.errorText||"");
  });
  page.on("console",message=>{if(message.type()==="error")console.warn("browser console:",message.text().slice(0,300));});
  await page.goto(pathToFileURL(filename).href,{waitUntil:"load",timeout:120000});
  await page.waitForFunction(()=>window.$tw?.wiki?.getTiddler("Farvefigurer")&&document.querySelector(".hu-tegne-app"),null,{timeout:120000});
  console.log("Boot succeeded, HUWiki Draw visible");
  const studioText=await page.locator(".hu-tegne-app").innerText();
  if(/Filter error|Missing closing bracket/i.test(studioText))
    throw Error("Tegne studio displays an invalid TiddlyWiki filter: "+studioText.slice(0,400));
  if(await page.locator(".hu-tegne-editor").count())
    throw Error("Drawing editor must stay closed before a drawing is selected");
  const introButtons=await page.locator(".hu-tegne-intro button").allTextContents();
  if(introButtons.some(x=>/^(?:save wiki|gem wikien)$/i.test(x.trim())))
    throw Error("Tegne duplicates TiddlyWiki's native Save button");
  console.log("Tegne UI has no filter error or duplicate save control");
  const beforeNew=await page.evaluate(()=>window.$tw.wiki.getTiddlersWithTag("HUWiki/Tegning").length);
  const newButton=page.locator(".hu-tegne-intro .hu-tegne-primary").first();
  await newButton.click({timeout:30000});
  const afterNew=await page.evaluate(()=>window.$tw.wiki.getTiddlersWithTag("HUWiki/Tegning").length);
  if(afterNew!==beforeNew+1)throw Error("New drawing button did not create a TiddlyWiki drawing tiddler");
  console.log("Native new-drawing action creates an editable tiddler");
  await page.locator(".hu-tegne-editor").waitFor({timeout:30000});
  const newlyOpened=await page.locator(".hu-tegne-app").innerText();
  if(/Filter error|Missing closing bracket/i.test(newlyOpened))
    throw Error("Selecting a drawing triggered a TiddlyWiki filter error");


  const action=page.locator(".hu-tegne-card").filter({hasText:"Farvefigurer"}).locator("button").first();
  await action.click({timeout:30000});
  await page.locator(".hu-tegne-editor").waitFor({timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".hu-tegne-editor .excalidraw"),null,{timeout:60000});
  console.log("Excalidraw editor visible on sample scene");

  // Reproduce the user's report: exporting the interactive Tegne home must
  // NOT claim success after losing the live Excalidraw canvas.
  await page.evaluate(()=>window.$tw.rootWidget.dispatchEvent({type:"tm-huwiki-sitepublisher",param:"HUWiki Tegne"}));
  await page.locator(".husp-overlay").waitFor({timeout:30000});
  await page.waitForFunction(()=>/drawing studio, not a drawing|tegnestudiets redigeringsside/i.test(document.querySelector(".husp-status")?.textContent||""),null,{timeout:30000});
  if(!await page.locator(".husp-tools button").nth(1).isDisabled())
    throw Error("Download must be disabled when live editor cannot be published");
  console.log("Publishing live editor is rejected with an explicit error");
  await page.locator(".husp-head button").last().click();
  await page.locator(".husp-overlay").waitFor({state:"detached",timeout:10000});

  // Use the actual editor's Publish drawing action (not a synthetic message).
  await page.locator(".hu-tegne-editor button.hu-tegne-publish").click({timeout:30000});
  await page.locator(".husp-overlay").waitFor({timeout:30000});
  const selectedNames=await page.locator(".husp-item .title").allTextContents();
  if(selectedNames.length!==1||selectedNames[0]!=="Farvefigurer")
    throw Error("Publish drawing must select only the active drawing: "+selectedNames.join(" | "));
  await page.waitForFunction(()=>{
   const text=document.querySelector(".husp-status")?.textContent||"";
   return /(preview ready|forhåndsvisning klar|sitepublisher:)/i.test(text);
  },null,{timeout:120000});
  const text=await page.locator(".husp-status").innerText();
  console.log("SitePublisher:",text);
  if(/SitePublisher:/i.test(text))throw Error(text);
  const html=await page.locator(".husp-preview").evaluate(el=>el.srcdoc);
  if(!html.includes("data:image/svg+xml"))throw Error("SitePublisher SVG was not embedded in the offline site");
  if(/file:\/\/\/Users\//.test(html))throw Error("Editor private filesystem leaked into site");
  console.log("Offline SVG export verified in real Chromium renderer");
  console.log("Publish drawing button selected the active drawing, not the editor");
  await page.evaluate(()=>window.$tw.rootWidget.dispatchEvent({type:"tm-huwiki-sitepublisher",param:"En tegning i en artikel"}));
  await page.waitForFunction(()=>{
   const el=document.querySelector(".husp-preview");
   const text=document.querySelector(".husp-status")?.textContent||"";
   return el?.srcdoc.includes("data:image/svg+xml") && /(preview ready|forhåndsvisning klar|sitepublisher:)/i.test(text);
  },null,{timeout:120000});
  const articleStatus=await page.locator(".husp-status").innerText();
  if(/sitepublisher:/i.test(articleStatus))throw Error(articleStatus);
  const articleHtml=await page.locator(".husp-preview").evaluate(el=>el.srcdoc);
  if(!articleHtml.includes("huw-site-drawing"))throw Error("Embedded article SVG was silently omitted");
  console.log("WikiText-transcluded drawing is also published as offline SVG");
  const forbidden=networkFailures.filter(url=>/^(https?:|blob:)/i.test(url));
  if(forbidden.length)throw Error("Offline editor attempted forbidden runtime network requests: "+forbidden.join(", "));

  if(critical.some(message=>/TypeError|ReferenceError|RangeError|SyntaxError/.test(message)))throw Error("Unexpected browser JavaScript errors: "+critical.slice(0,5).join(" | "));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
