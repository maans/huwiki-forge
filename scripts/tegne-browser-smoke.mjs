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
  const critical=[];
  page.on("pageerror",error=>critical.push(error.message));
  page.on("console",message=>{if(message.type()==="error")console.warn("browser console:",message.text().slice(0,300));});
  await page.goto(pathToFileURL(filename).href,{waitUntil:"load",timeout:120000});
  await page.waitForFunction(()=>window.$tw?.wiki?.getTiddler("Farvefigurer")&&document.querySelector(".hu-tegne-app"),null,{timeout:120000});
  console.log("Boot succeeded, HUWiki Draw visible");

  const action=page.locator(".hu-tegne-card").filter({hasText:"Farvefigurer"}).locator("button").first();
  await action.click({timeout:30000});
  await page.locator(".hu-tegne-editor").waitFor({timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".hu-tegne-editor .excalidraw"),null,{timeout:60000});
  console.log("Excalidraw editor visible on sample scene");

  // Startup message should open the same shared SitePublisher as other Editions.
  await page.evaluate(()=>window.$tw.rootWidget.dispatchEvent({type:"tm-huwiki-sitepublisher",param:"Farvefigurer"}));
  await page.locator(".husp-overlay").waitFor({timeout:30000});
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
  if(critical.some(message=>/TypeError|ReferenceError|RangeError|SyntaxError/.test(message)))throw Error("Unexpected browser JavaScript errors: "+critical.slice(0,5).join(" | "));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
