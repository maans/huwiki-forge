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

test("the extracted HUPedia Edition has intact original plugin, theme and seeds", async()=>{
  const {manifest,tiddlers}=await loadEdition(
    "https://forge.example/huwiki-forge/editions/hupedia/manifest.json",localFetch);
  assert.equal(manifest.id,"hupedia");
  assert.equal(tiddlers.length,14); // 8 source tiddlers, 4 configuration, plugin, theme
  const byTitle=new Map(tiddlers.map(item=>[item.title,item]));
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
  assert.equal(Object.keys(JSON.parse(plugin.text).tiddlers).length,21);
  assert.equal(Object.keys(JSON.parse(theme.text).tiddlers).length,2);
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
