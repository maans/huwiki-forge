/**
 * Browser-level compatibility test for TiddlyWiki's native plugin library.
 * A file:// TiddlyWiki talks to a read-only library hosted by a local static
 * HTTP server. No CDN, GitHub API, Tailscale, Google or mutable backend.
 *
 * Optional dependency: playwright-core (installed by GitHub Actions).
 */
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {createServer} from "node:http";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
import {assembleHtml,loadEdition} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
async function localFetch(url){
 const u=new URL(url);
 if(u.origin!=="https://forge.test"||!u.pathname.startsWith("/repo/"))return {ok:false,status:403};
 try{
  const result=await readFile(path.join(root,u.pathname.slice("/repo/".length)),"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(result)};
 }catch(_){return {ok:false,status:404};}
}
async function main(){
 const {tiddlers}=await loadEdition("https://forge.test/repo/editions/demo/manifest.json",localFetch);
 const core=await readFile(path.join(root,"core/empty.html"),"utf8");
 const html=assembleHtml(core,tiddlers);
 const dest=path.join(await mkdtemp(path.join(tmpdir(),"forge-library-")),"demo.html");
 await writeFile(dest,html);
 const server=createServer(async(req,res)=>{
  const u=new URL(req.url,"http://localhost");
  const filename=path.resolve(root,"."+u.pathname+(u.pathname.endsWith("/")?"index.html":""));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
   const contents=await readFile(filename);
   res.setHeader("Content-Type",filename.endsWith(".html")?"text/html; charset=utf-8":"application/json; charset=utf-8");
   res.setHeader("Access-Control-Allow-Origin","*");
   res.writeHead(200).end(contents);
  }catch(_){res.writeHead(404).end("Not found");}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address(),base="http://127.0.0.1:"+address.port;
 const lib=base+"/library/plugins/index.html";
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const page=await browser.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",route=>{
   const url=route.request().url();
   if(url.startsWith("file:")||url.startsWith(base+"/"))return route.continue();
   return route.abort("blockedbyclient");
  });
  await page.goto(pathToFileURL(dest).href,{waitUntil:"load",timeout:45000});
  await page.waitForFunction(()=>window.$tw?.browserMessaging?.iframeInfoMap&&window.$tw?.wiki?.getTiddler("HUWiki Community"),null,{timeout:60000});
  const config=await page.evaluate(()=>({
   plugin:$tw.wiki.getTiddler("$:/config/HUWikiPluginLibrary")?.fields,
   community:$tw.wiki.getTiddler("$:/config/HUWikiCommunity")?.fields,
   official:!!$tw.wiki.getTiddler("$:/config/OfficialPluginLibrary")
  }));
  if(!config.plugin||!config.community||!config.official)throw Error("Missing Forge or native TiddlyWiki library configuration");
  if(config.community.url!=="https://tiddlywiki.com/#Community")throw Error("Wrong community destination");
  if(await page.locator('[data-tab-title="HUWiki Community"]').count())throw Error("Community sidebar tab must not be shipped");
  console.log("Native libraries retained; Community points to TiddlyWiki without a sidebar tab");

  await page.evaluate(url=>$tw.rootWidget.dispatchEvent({type:"tm-load-plugin-library",paramObject:{url}}),lib);
  const pluginTitle="$:/plugins/huwiki/trim";
  await page.waitForFunction(({url,title})=>{
   return !!$tw.wiki.getTiddler("$:/temp/RemoteAssetInfo/"+url+"/"+title);
  },{url:lib,title:pluginTitle},{timeout:60000});
  console.log("Native TiddlyWiki library metadata loaded from static HTTP-over-postMessage");

  await page.evaluate(({url,title})=>$tw.rootWidget.dispatchEvent({type:"tm-load-plugin-from-library",paramObject:{url,title}}),{url:lib,title:pluginTitle});
  await page.waitForFunction(title=>!!$tw.wiki.getTiddler(title),pluginTitle,{timeout:60000});
  const installed=await page.evaluate(title=>$tw.wiki.getTiddler(title)?.fields,pluginTitle);
  if(installed.version!=="0.1.5"||installed["plugin-type"]!=="plugin")throw Error("Unexpected imported plugin identity");
  console.log("Native TiddlyWiki installed an original Forge plugin package on demand");

  await page.route("https://tiddlywiki.com/**",route=>route.fulfill({contentType:"text/html",body:"<title>Community redirect target</title>"}));
  await page.goto(base+"/community/",{waitUntil:"load",timeout:30000});
  await page.waitForURL("https://tiddlywiki.com/#Community");
  console.log("Old Community address redirects to TiddlyWiki's community");
  if(errors.some(x=>/TypeError|ReferenceError|SyntaxError/.test(x)))throw Error("Browser JavaScript errors: "+errors.slice(0,5).join(" | "));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
