import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../demo/demo.mjs",import.meta.url),"utf8");
const pageHtml=await readFile(new URL("../demo/index.html",import.meta.url),"utf8");

test("public demos fetch registry and frequently updated Edition packages without stale caches",()=>{
 assert.ok(source.includes("const isPluginRegistry="));
 assert.ok(source.includes("const isEditionCatalog="));
 assert.ok(source.includes("const isTurnAroundLayoutFix="));
 assert.ok(source.includes("const isGraphEditionTiddlers="));
 assert.ok(source.includes("const isGraphStudioPlugin="));
 assert.ok(source.includes("||isGraphEditionTiddlers||isGraphStudioPlugin"));
 assert.ok(source.includes("||isTurnAroundCaptions||isGraphEditionTiddlers"));
 assert.ok(source.includes("||isCutoutEditorPlugin||isTurnAroundLayoutFix"));
 assert.ok(source.includes("isEditionManifest||isPluginRegistry||isEditionCatalog"));
 assert.ok(source.includes("loadChoices(new URL('../assembler/',location.href).href,fetchFreshEditionManifest)"));
 // Both halves of the version comparison MUST be from the same release.
 assert.ok(source.includes("const isRepertoirePlugin="));
 assert.ok(source.includes("||isAbcAudioPlugin||isRepertoirePlugin||isSitePublisherPlugin"));
 assert.match(pageHtml,/\.\/demo\.mjs\?v=repertoire-cache-sync-20261120/);
});

test("a stale browser-cached Repertoire package cannot conflict with a fresh Forge registry",async()=>{
 const start=source.indexOf("const fetchFreshEditionManifest=");
 const end=source.indexOf("\n\nlet blobUrl;",start);
 assert.ok(start>=0&&end>start,"locate the actual browser fetch policy");
 const calls=[];
 const host="https://forge.xn--mns-ula.dk";
 const location={href:host+"/demo/?edition=silva-ethno-repertoire",origin:host};
 const outdated={title:"$:/plugins/huwiki/repertoire",version:"0.1.3-beta.1"};
 const newest={title:outdated.title,version:"0.1.3-beta.2"};
 const registry={items:[{fields:{title:outdated.title,version:newest.version}}]};
 const request=(resource,options={})=>{
  const url=new URL(resource,location.href);
  calls.push({url:url.href,options});
  if(url.pathname.endsWith("/library/plugins/registry.json"))return Promise.resolve({ok:true,json:async()=>registry});
  if(url.pathname.endsWith("/plugins/repertoire/dist/plugin.json")){
   return Promise.resolve({ok:true,json:async()=>options.cache==="no-store"?newest:outdated});
  }
  return Promise.resolve({ok:true,json:async()=>({})});
 };
 const context={location,URL,Date:{now:()=>123456789},fetch:request};
 runInNewContext(source.slice(start,end)+"\nthis.fetchTest=fetchFreshEditionManifest;",context);
 const fetchTest=context.fetchTest;
 const [registryResponse,packageResponse]=await Promise.all([
  fetchTest(host+"/library/plugins/registry.json"),
  fetchTest(host+"/plugins/repertoire/dist/plugin.json")
 ]);
 const [published,bundled]=await Promise.all([registryResponse.json(),packageResponse.json()]);
 assert.equal(published.items[0].fields.version,bundled.version);
 for(const call of calls){
  assert.equal(call.options.cache,"no-store",call.url);
  assert.ok(new URL(call.url).searchParams.has("_forge_demo"),"fresh URL must bypass stale network intermediaries");
 }
 const cachedLarge=host+"/plugins/large-media/dist/plugin.json";
 await fetchTest(cachedLarge);
 const last=calls.at(-1);
 assert.equal(last.url,cachedLarge,"the fix must not force cache busting for every heavy audio/video plugin");
});
