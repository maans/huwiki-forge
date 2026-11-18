/** Drive the existing SitePublisher in Chrome; do not replace its HTML generator. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
const root=path.resolve(import.meta.dirname,"..");
const folder=path.join(root,"editions/silva-ethno-repertoire");
const browser=await chromium.launch({
 executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]
});
try {
 const page=await browser.newPage({acceptDownloads:true});
 page.on("pageerror",error=>console.error("Browser error:",error.message));
 await page.goto(pathToFileURL(path.join(folder,"index.html")).href,{waitUntil:"load",timeout:120000});
 await page.waitForFunction(()=>window.$tw&&$tw.rootWidget&&$tw.wiki,undefined,{timeout:90000});
 await page.evaluate(()=>{
  $tw.rootWidget.dispatchEvent({type:"tm-huwiki-sitepublisher"});
 });
 await page.waitForSelector(".husp-overlay",{timeout:30000});
 await page.evaluate(()=>{
  const selectors=Array.from(document.querySelectorAll(".husp-fields select"));
  const source=selectors.find(s=>Array.from(s.options).some(o=>o.value==="list"));
  if(!source)throw Error("SitePublisher list source selector missing");
  source.value="list";source.dispatchEvent(new Event("change",{bubbles:true}));
  const box=document.querySelector('input[list="huw-sitepublisher-lists"]');
  if(!box)throw Error("SitePublisher list text input missing");
  box.value="Silba Etno Repertoire – Oversigt";
  box.dispatchEvent(new Event("change",{bubbles:true}));
 });
 await page.waitForFunction(()=>{
  const items=document.querySelectorAll(".husp-item");
  const btn=Array.from(document.querySelectorAll(".husp-panel button"))
    .find(b=>/Hent HTML|Download HTML/.test(b.textContent||""));
  return items.length===17&&btn&&!btn.disabled;
 },undefined,{timeout:120000});
 const chosen=await page.locator(".husp-item").count();
 if(chosen!==17)throw Error("Incorrect SitePublisher programme: "+chosen);
 const button=page.locator(".husp-panel button").filter({hasText:/Hent HTML|Download HTML/}).first();
 const pending=page.waitForEvent("download",{timeout:120000});
 await button.click();
 const download=await pending;
 const sitePath=path.join(folder,"site/index.html");
 await mkdir(path.dirname(sitePath),{recursive:true});
 await download.saveAs(sitePath);
 let html=await readFile(sitePath,"utf8");
 if(!html.includes("Silba Etno Repertoire"))throw Error("Site title missing");
 const entries=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire.json"),"utf8"));
 for(const song of entries)if(!html.includes(song.title)){
  throw Error("SitePublisher omitted "+song.title);
 }
 // Navigation only: retain SitePublisher's single-file player unchanged.
 const back='<a class="silba-return-to-wiki" href="../index.html" '+
  'style="position:fixed;bottom:10px;right:12px;z-index:2147483000;'+
  'background:#ffffffeb;border:1px solid #b5c2ba;border-radius:6px;'+
  'padding:6px 10px;font:13px sans-serif;color:#234;text-decoration:none">'+
  'Åbn den redigerbare wiki</a>';
 if(!html.includes('silba-return-to-wiki')){
  if(!html.includes("</body>"))throw Error("SitePublisher export lacks body");
  html=html.replace("</body>",back+"</body>");
  await writeFile(sitePath,html);
 }
 console.log("Published 17 scores via SitePublisher:",Buffer.byteLength(html),"bytes");
 await page.close();
}finally{await browser.close();}
