import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {Script} from "node:vm";
import {loadEdition,assembleHtml} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
async function json(file) {
 return JSON.parse(await readFile(path.join(root,file),"utf8"));
}
async function localFetch(url) {
 const parsed=new URL(url),prefix="/huwiki-forge/";
 if(parsed.origin!=="https://forge.example"||!parsed.pathname.startsWith(prefix))return {ok:false,status:403};
 try {
  const data=await readFile(path.join(root,parsed.pathname.slice(prefix.length)),"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(data)};
 } catch (_) {return {ok:false,status:404};}
}
test("HUPin uses the unchanged OAuthLab plugin package with native widgets",async()=>{
 const p=await json("plugins/hupin/dist/plugin.json");
 assert.equal(p.title,"$:/plugins/huwiki/hupin");
 assert.equal(p["plugin-type"],"plugin");
 assert.equal(p.version,"0.3.3");
 const t=JSON.parse(p.text).tiddlers;
 assert.equal(Object.keys(t).length,7);
 const js=Object.values(t).filter(v=>v.type==="application/javascript");
 assert.equal(js.length,6);
 for(const item of js)assert.doesNotThrow(()=>new Script(item.text,{filename:item.title}),item.title);
 assert.ok(t["$:/plugins/huwiki/hupin/router-widget.js"].text.includes('exports["huwiki-hupin"]'));
 assert.ok(t["$:/plugins/huwiki/hupin/new-widget.js"].text.includes('exports["huwiki-hupin-new"]'));
 assert.match(t["$:/plugins/huwiki/hupin/geo-widget.js"].text,/OpenStreetMap \(uden Google-nøgle\)/);
 assert.match(t["$:/plugins/huwiki/hupin/image-widget.js"].text,/\$:\x2fplugins\x2fhuwiki\x2fpasteup/);
 assert.doesNotMatch(p.text,/google\.script\.run|\bDriveApp\b|\bSpreadsheetApp\b/);
 assert.ok(!p.license,"Original author license is not declared; do not invent one");
});

test("HUPin demo keeps an editable original SVG and opens ordinary tiddlers from hotspots",async()=>{
 const seed=await json("editions/hupin/tiddlers/seed.json");
 const titles=new Set(seed.map(t=>t.title));
 assert.equal(seed.length,5);
 const picture=seed.find(t=>t.title==="HUPin · Demobillede");
 assert.equal(picture.type,"image/svg+xml");
 assert.match(picture.text,/<svg\b/);
 assert.doesNotMatch(picture.text,/<script\\b|onload=|<image[^>]+(?:https?:|javascript:)|(?:href|src)="https?:/i,"SVG is self-contained apart from its namespace URI");
 const project=seed.find(t=>t.title==="HUPin · Interaktivt billede");
 assert.equal(project.text,"<$huwiki-hupin project=<<currentTiddler>>/>");
 assert.ok(project.tags.includes("HUPin"));
 const data=JSON.parse(project["billedlink-data"]);
 assert.equal(data.source,picture.title);
 assert.equal(data.kind,"image");
 assert.equal(data.sourceKind,"image");
 assert.equal(data.hotspots.length,2);
 for(const spot of data.hotspots) {
  assert.ok(titles.has(spot.title),"Linked hotspot target is missing: "+spot.title);
  assert.equal(spot.shape,"rect");
  assert.equal(spot.points.length,2);
  for(const coord of spot.points.flat())assert.ok(coord>=0&&coord<=1000);
 }
 const start=seed.find(t=>t.title==="HUPin · Start");
 assert.match(start.text,/^\! Velkommen til HUPin\n\n/);
 assert.ok(start.text.includes("<$huwiki-hupin-new/>"));
 assert.match(start.text,/PasteUp.*kræver/);
});
test("HUPin Edition is assembled using only public local files",async()=>{
 const {manifest,tiddlers}=await loadEdition("https://forge.example/huwiki-forge/editions/hupin/manifest.json",localFetch);
 assert.equal(manifest.id,"hupin");
 assert.equal(manifest.version,"0.1.0-test.1");
 assert.equal(tiddlers.length,21); // 11 existing + 10 shared Forge tiddlers
 const byTitle=new Map(tiddlers.map(t=>[t.title,t]));
  for(const title of ["$:/config/HUWikiPluginLibrary","$:/config/HUWikiCommunity","HUWiki Community","$:/huwiki/forge/page-control"])assert.ok(byTitle.has(title),title+" missing from Edition");
 assert.ok(byTitle.has("$:/plugins/huwiki/hupin"));
 assert.ok(byTitle.has("$:/themes/huwiki/modern"));
 assert.ok(byTitle.has("HUPin · Demobillede"));
 assert.equal(byTitle.get("$:/DefaultTiddlers").text,"[[HUPin · Start]]");
 const core=await readFile(path.join(root,"core/empty.html"),"utf8");
 const html=assembleHtml(core,tiddlers);
 assert.ok(html.includes('"title":"$:/plugins/huwiki/hupin"'));
 assert.ok(html.includes('"title":"HUPin · Demobillede"'));
});
test("HUPin appears as a standalone plugin, a test Edition and deferred materials",async()=>{
 const catalog=await json("catalog/editions.json"),materials=await json("catalog/materials.json");
 const edition=catalog.editions.find(x=>x.id==="hupin");
 assert.equal(edition.version,"0.1.0-test.1");
 assert.ok(edition.bundledPlugins.includes("hupin"));
 assert.equal(catalog.plugins.find(x=>x.id==="hupin").version,"0.3.3");
 const items=materials.items.filter(x=>x.id==="hupin"||x.id==="hupin-demo");
 assert.equal(items.length,2);
 for(const item of items) {
  assert.ok(item.source.startsWith("../"));
  const local=new URL(item.source,"https://forge.example/huwiki-forge/catalog/materials.json");
  assert.equal(local.origin,"https://forge.example");
  assert.ok(local.pathname.startsWith("/huwiki-forge/"));
  await readFile(path.join(root,local.pathname.slice("/huwiki-forge/".length)),"utf8");
 }
 assert.ok(JSON.stringify(materials).length<12000,"Materials index must remain small");
});
