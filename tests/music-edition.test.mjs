import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {loadEdition,assembleHtml,CORE_LIBRARY_MARKER} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
async function localFetch(url){
 const {origin,pathname}=new URL(url);
 if(origin!=="https://forge.example"||!pathname.startsWith("/huwiki-forge/"))return {ok:false,status:403};
 try{
  const data=await readFile(path.join(root,pathname.slice("/huwiki-forge/".length)),"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(data)};
 }catch(err){return {ok:false,status:404};}
}

test("Music Edition bundles the importer and all six lessons with ABC in one dependency-safe manifest",async()=>{
 const {manifest,tiddlers}=await loadEdition("https://forge.example/huwiki-forge/editions/music/manifest.json",localFetch);
 assert.equal(manifest.id,"music");
 assert.equal(manifest.coreVersion,"5.4.1");
 assert.equal(manifest.version,"0.1.0-test.1");
 assert.equal(tiddlers.length,16);
 const byTitle=new Map(tiddlers.map(t=>[t.title,t]));
 assert.equal(byTitle.size,tiddlers.length);
 for(const title of [
 "$:/plugins/huwiki/abc",
 "$:/plugins/huwiki/music",
 "$:/plugins/huwiki/musescore-import",
 "$:/plugins/huwiki/lessons-basic",
 "$:/plugins/huwiki/lessons-jazz",
 "$:/plugins/huwiki/lessons-rhythm",
 "$:/plugins/huwiki/lessons-balkan",
 "$:/plugins/huwiki/lessons-india",
 "$:/plugins/huwiki/lessons-folk",
 "$:/plugins/huwiki/site-publisher",
 "$:/plugins/huwiki/print-article",
 "$:/themes/huwiki/modern",
 "$:/DefaultTiddlers",
 "$:/theme"
 ])assert.ok(byTitle.has(title),title);
 assert.equal(byTitle.get("$:/theme").text,"$:/themes/huwiki/modern");
 assert.equal(byTitle.get("$:/DefaultTiddlers").text,"[[HUWiki Musik – Start]]");
 assert.equal(byTitle.get("$:/plugins/huwiki/music").dependents,"$:/plugins/huwiki/abc");
 for(const t of tiddlers.filter(t=>t.title.startsWith("$:/plugins/huwiki/lessons-"))){
  assert.equal(t.dependents,"$:/plugins/huwiki/abc",t.title);
 }
 assert.equal(byTitle.get("$:/plugins/huwiki/abc").version,"0.3.31-test.8");
 const importer=byTitle.get("$:/plugins/huwiki/musescore-import");
 assert.equal(importer.version,"0.1.4-beta.1");
 const internal=JSON.parse(importer.text).tiddlers;
 assert.ok(internal[importer.title+"/converter.js"]);
 assert.ok(internal[importer.title+"/widget.js"]);
 assert.ok(internal[importer.title+"/abcjs.js"]);
 assert.ok(internal[importer.title+"/jszip.js"]);
 assert.ok(internal[importer.title+"/license"]);
 assert.ok(internal[importer.title+"/readme-en"]);
 assert.ok(internal[importer.title+"/readme-da"]);
 assert.ok(internal[importer.title+"/widget.js"].text.includes("tm-import-tiddlers"),"The importer must use TiddlyWiki's native import review");
 assert.ok(!internal[importer.title+"/widget.js"].text.includes("google.script.run"));
});

test("Music Edition plugin packages contain unique internal titles",async()=>{
 const {tiddlers}=await loadEdition("https://forge.example/huwiki-forge/editions/music/manifest.json",localFetch);
 const names=new Map();
 for(const plugin of tiddlers.filter(t=>t["plugin-type"]==="plugin"||t["plugin-type"]==="theme")){
  const content=JSON.parse(plugin.text).tiddlers;
  for(const title of Object.keys(content)){
    if(names.has(title))assert.fail(title+" is defined by "+names.get(title)+" and "+plugin.title);
    names.set(title,plugin.title);
  }
 }
 assert.ok(names.size>=200,"Edition should include the actual music interface and teaching material");
});

test("Music Edition can be assembled into one HTML wiki with its importer",async()=>{
 const {tiddlers}=await loadEdition("https://forge.example/huwiki-forge/editions/music/manifest.json",localFetch);
 const core=await readFile(path.join(root,"core/empty.html"),"utf8");
 const html=assembleHtml(core,tiddlers);
 const marker=html.indexOf(CORE_LIBRARY_MARKER);
 assert.ok(marker>0);
 for(const title of [
 "$:/plugins/huwiki/abc",
 "$:/plugins/huwiki/music",
 "$:/plugins/huwiki/musescore-import",
 "$:/plugins/huwiki/lessons-balkan",
 "$:/plugins/huwiki/site-publisher"
 ])assert.ok(html.indexOf('"title":"'+title+'"')<marker,title);
 assert.ok(html.length>core.length+2_000_000);
});
