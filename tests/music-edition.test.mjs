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
 assert.equal(manifest.version,"0.1.1-test.2");
 assert.equal(tiddlers.length,28); // 16 existing + 10 shared Forge tiddlers + Jingle and its example
 const byTitle=new Map(tiddlers.map(t=>[t.title,t]));
  for(const title of ["$:/config/HUWikiPluginLibrary","$:/config/HUWikiCommunity","HUWiki Community","$:/huwiki/forge/page-control"])assert.ok(byTitle.has(title),title+" missing from Edition");
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
 assert.equal(byTitle.get("$:/DefaultTiddlers").text,"[[HUWiki Musik – Start]] [[TiddlyWiki Jingle – Følgeafspiller]]");
 assert.equal(byTitle.get("$:/plugins/huwiki/music").dependents,"$:/plugins/huwiki/abc");
 for(const t of tiddlers.filter(t=>t.title.startsWith("$:/plugins/huwiki/lessons-"))){
  assert.equal(t.dependents,"$:/plugins/huwiki/abc",t.title);
 }
 assert.equal(byTitle.get("$:/plugins/huwiki/abc").version,"0.3.32-test.2");
 const jingle=byTitle.get("TiddlyWiki Jingle");
 assert.ok(jingle,"TiddlyWiki Jingle must be shipped as an editable tiddler");
 assert.equal(jingle["abc-swing"],"66");
 assert.equal(jingle["abc-font"],"petaluma");
 const voices=JSON.parse(jingle["abc-accompaniment"]).voiceSettings;
 assert.deepEqual([voices["0"].instrument,voices["0"].volume],[11,80],"vibraphone lead at 80 percent");
 assert.deepEqual([voices["1"].instrument,voices["1"].volume],[57,65],"second voice trombone");
 assert.deepEqual([voices["2"].instrument,voices["2"].volume],[57,65],"third voice trombone");
 assert.deepEqual([voices["3"].instrument,voices["3"].volume],[26,23],"fourth voice jazz guitar");
 assert.equal(voices["4"].volume,12,"fifth voice soft bass doubling");
 assert.match(jingle["abc-source"],/^V:5 clef=bass-8$/m,"fifth voice in octave-transposing bass clef");
 assert.match(byTitle.get("TiddlyWiki Jingle – Følgeafspiller").text,/abc-player/);
 const abc=JSON.parse(byTitle.get("$:/plugins/huwiki/abc").text).tiddlers;
 assert.ok(abc["$:/plugins/huwiki/abc/follow-viewport.js"]);
 assert.match(abc["$:/plugins/huwiki/abc/follow-viewport.js"].text,/querySelectorAll\('\.huwabc-follow-chord-label'\)/);
 assert.ok(!abc["$:/plugins/huwiki/abc/accompaniment.js"].text.includes("Dronen holder fast Sa/Pa"));
 assert.match(abc["$:/plugins/huwiki/abc/accompaniment.js"].text,/mixer\.appendChild\(voiceHost\)/,"notated voices must be inside mixer");
 assert.match(abc["$:/plugins/huwiki/abc/minimal-player.css"].text,/huwabc-follow-backdrop/,"protect score camera background");
 assert.match(abc["$:/plugins/huwiki/abc/ExampleMacros"].text,/\\procedure abc-player/);
 const importer=byTitle.get("$:/plugins/huwiki/musescore-import");
 assert.equal(importer.version,"0.1.5-beta.1");
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
