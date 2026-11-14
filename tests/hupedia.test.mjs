import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {loadEdition,assembleHtml,CORE_LIBRARY_MARKER} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
async function localFetch(url) {
  const source=new URL(url);
  const prefix="/huwiki-forge/";
  if(source.origin!=="https://forge.example"||!source.pathname.startsWith(prefix)) {
    return {ok:false,status:403};
  }
  const relative=source.pathname.slice(prefix.length);
  try {
    const data=await readFile(path.join(root,relative),"utf8");
    return {ok:true,status:200,json:async()=>JSON.parse(data)};
  } catch {
    return {ok:false,status:404};
  }
}

test("HUPedia Edition retains canonical articles and has working bilingual plugin templates", async()=>{
  const {manifest,tiddlers}=await loadEdition(
    "https://forge.example/huwiki-forge/editions/hupedia/manifest.json",localFetch);
  assert.equal(manifest.id,"hupedia");
  assert.equal(tiddlers.length,18); // 14 original components + 4 shared Forge links
  const byTitle=new Map(tiddlers.map(item=>[item.title,item]));
  for(const title of ["$:/config/HUWikiPluginLibrary","$:/config/HUWikiCommunity","HUWiki Community","$:/huwiki/forge/page-control"])assert.ok(byTitle.has(title),title+" missing from Edition");
  for(const title of [
    "HUPedia · Start","Carl Nielsen","Symfoni","Romantikken","Søren Kierkegaard",
    "$:/plugins/huwiki/hupedia","$:/themes/huwiki/hupedia",
    "$:/theme","$:/DefaultTiddlers"
  ])assert.ok(byTitle.has(title),title+" is missing");
  assert.equal(byTitle.get("$:/theme").text,"$:/themes/huwiki/hupedia");
  assert.equal(byTitle.get("$:/DefaultTiddlers").text,"[[HUPedia · Start]]");
  const plugin=byTitle.get("$:/plugins/huwiki/hupedia");
  const theme=byTitle.get("$:/themes/huwiki/hupedia");
  assert.equal(plugin["plugin-type"],"plugin");
  assert.equal(theme["plugin-type"],"theme");
  const pluginTiddlers=JSON.parse(plugin.text).tiddlers;
  const themeTiddlers=JSON.parse(theme.text).tiddlers;
  assert.ok(Object.keys(pluginTiddlers).length>=21,"Keep the original plugin components");
  assert.ok(Object.keys(themeTiddlers).length>=2,"Keep the original theme components");
  for(const title of [
    "$:/plugins/huwiki/hupedia/forms/Person",
    "$:/plugins/huwiki/hupedia/infoboxes/Person",
    "$:/plugins/huwiki/hupedia/article-view",
    "$:/plugins/huwiki/hupedia/body-filter",
    "$:/plugins/huwiki/hupedia/localized-body",
    "$:/plugins/huwiki/hupedia/english-editor"
  ])assert.ok(pluginTiddlers[title],title+" must remain available");
  assert.ok(themeTiddlers["$:/themes/huwiki/hupedia/sidebar/da"]);
  assert.ok(themeTiddlers["$:/themes/huwiki/hupedia/sidebar/en"]);
  assert.ok(!plugin.text.includes("google.script.run"));
  assert.ok(!theme.text.includes("google.script.run"));
  assert.ok(!plugin.text.includes("DriveApp"));
});

test("HUPedia builds as a self-contained TiddlyWiki file before boot",async()=>{
  const {tiddlers}=await loadEdition(
    "https://forge.example/huwiki-forge/editions/hupedia/manifest.json",localFetch);
  const core=await readFile(path.join(root,"core/empty.html"),"utf8");
  const html=assembleHtml(core,tiddlers);
  const marker=html.indexOf(CORE_LIBRARY_MARKER);
  assert.ok(marker>0);
  assert.ok(html.indexOf('"title":"$:/plugins/huwiki/hupedia"')<marker);
  assert.ok(html.indexOf('"title":"$:/themes/huwiki/hupedia"')<marker);
  assert.ok(html.indexOf('"title":"HUPedia · Start"')<marker);
  assert.ok(html.length>core.length);
});

test("the Edition catalog only references existing manifests",async()=>{
  const catalog=JSON.parse(await readFile(path.join(root,"catalog/editions.json"),"utf8"));
  assert.equal(catalog.schemaVersion,1);
  for(const edition of catalog.editions) {
    const m=JSON.parse(await readFile(path.join(root,"editions",edition.id,"manifest.json"),"utf8"));
    assert.equal(m.id,edition.id);
  }
});


test("standalone HUWiki Trim plugin is intact and independent of Apps Script",async()=>{
  const item=JSON.parse(await readFile(path.join(root,"plugins/trim/dist/plugin.json"),"utf8"));
  assert.equal(item.title,"$:/plugins/huwiki/trim");
  assert.equal(item.version,"0.1.5");
  assert.equal(item.license,"MIT");
  assert.equal(item["plugin-type"],"plugin");
  assert.equal(Object.keys(JSON.parse(item.text).tiddlers).length,3);
  assert.ok(!item.text.includes("google.script.run"));
});

test("optional plugin catalog points only to existing standalone plugin bundles",async()=>{
  const catalog=JSON.parse(await readFile(path.join(root,"catalog/editions.json"),"utf8"));
  for(const item of catalog.plugins||[]) {
    assert.match(item.id,/^[a-z0-9-]+$/);
    const url=new URL(item.file,"https://test.example/catalog/editions.json");
    assert.equal(url.origin,"https://test.example");
    const file=path.join(root,url.pathname.slice(1));
    const payload=JSON.parse(await readFile(file,"utf8"));
    assert.equal(payload["plugin-type"],"plugin");
  }
});

test("browser Assembler module has syntactically valid JavaScript",async()=>{
  const html=await readFile(path.join(root,"assembler/index.html"),"utf8");
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const body=match[1].replace(/^\s*import\s+[^;]+;\s*/,"");
  assert.doesNotThrow(()=>new Function(body));
});
