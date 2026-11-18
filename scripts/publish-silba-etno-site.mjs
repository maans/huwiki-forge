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
 // Confirm the front page renders real list rows, not literal asterisks or inline widgets.
 await page.waitForSelector(".silba-home",{timeout:30000});
 const rows=await page.locator(".silba-track-list li").count();
 if(rows!==17)throw Error("Homepage malformed: expected 17 styled score rows, got "+rows);
 const photoStyle=await page.locator(".silba-photo-visual").evaluate(el=>getComputedStyle(el).backgroundImage);
 if(!photoStyle.includes("silbaaetno-2026.jpg"))throw Error("Orchestra image CSS missing");
 console.log("Photo uses source-site image with CSS fallback");
 await page.evaluate(()=>{
  $tw.rootWidget.dispatchEvent({type:"tm-huwiki-sitepublisher"});
 });
 await page.waitForSelector(".husp-overlay",{timeout:30000});
 await page.evaluate(()=>{
  const selectors=Array.from(document.querySelectorAll(".husp-fields select"));
  const source=selectors.find(s=>Array.from(s.options).some(o=>o.value==="list"));
  const desk=selectors.find(s=>Array.from(s.options).some(o=>o.value==="desk"));
  if(!desk)throw Error("Nodepult selection is absent");
  desk.value="desk";desk.dispatchEvent(new Event("change",{bubbles:true}));
  if(!source)throw Error("SitePublisher list source selector missing");
  source.value="list";source.dispatchEvent(new Event("change",{bubbles:true}));
  const box=document.querySelector('input[list="huw-sitepublisher-lists"]');
  if(!box)throw Error("SitePublisher list text input missing");
  box.value="SilbaÄtno Repertoire – Oversigt";
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
 if(!html.includes("SilbaÄtno Repertoire"))throw Error("Site title missing");
 const entries=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire.json"),"utf8"));
 const check=html.match(/<script[^>]*id=["\']publisher-data["\'][^>]*>([\s\S]*?)<\/script>/i);
 if(!check)throw Error("SitePublisher export has no publisher data");
 const siteData=JSON.parse(check[1]);
 if(siteData.startDesk!==true||siteData.entries?.length!==17||siteData.entries.some(e=>e.kind!=="score"))
  throw Error("Audience Site must start in nodepult with all 17 ABC scores");
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
 // Reopen the exported standalone file and verify that the first partiture opens in nodepult.
 const audience=await browser.newPage();
 try{
  await audience.goto(pathToFileURL(sitePath).href,{waitUntil:"load",timeout:90000});
  audience.on("pageerror",error=>console.error("Audience JavaScript:",error.message));
  await audience.waitForTimeout(1500);
  const detail=await audience.evaluate(()=>{
   const frame=document.getElementById("score-frame");
   let doc=null,err="";try{doc=frame?.contentDocument;}catch(e){err=String(e.message);}
   const data=document.getElementById("publisher-data");
   let settings={};try{const obj=JSON.parse(data?.textContent||"{}");settings={startDesk:obj.startDesk,count:obj.entries?.length,firstKind:obj.entries?.[0]?.kind};}catch(e){settings={error:String(e.message)};}
   const nodes=doc?.querySelectorAll("[class*=desk]")||[];
   return {title:document.title,frameExists:!!frame,frameHidden:frame?.hidden,srcdocLength:frame?.srcdoc?.length,frameReady:doc?.readyState,
    frameBodyLength:doc?.body?.innerHTML?.length,frameBodyStart:doc?.body?.innerHTML?.slice(0,700),deskClasses:Array.from(nodes).slice(0,8).map(x=>x.className),err,settings};
  });
  console.log("AUDIENCE DIAGNOSTIC",JSON.stringify(detail));
  await audience.waitForFunction(()=>{
   const frame=document.getElementById("score-frame");
   return !!(frame&&frame.contentDocument&&frame.contentDocument.querySelector(".huwabc-page-is-desk"));
  },undefined,{timeout:25000});
  const buttons=await audience.locator("#chapters .chapter").count();
  if(buttons!==17)throw Error("Site navigation does not contain 17 melodies: "+buttons);
 }finally{await audience.close();}
 console.log("Published 17 scores via SitePublisher:",Buffer.byteLength(html),"bytes");
 await page.close();
}finally{await browser.close();}
