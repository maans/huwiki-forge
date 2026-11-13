import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";
import {loadEdition,assembleHtml,CORE_LIBRARY_MARKER} from "../assembler/assemble.mjs";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const json=async path=>JSON.parse(await read(path));
const tiddlerMime="application/vnd.excalidraw+json";
const base="$:/plugins/huwiki/tegne";
async function localFetcher(url){
 const parsed=new URL(url);
 if(parsed.origin!=="https://forge.example"||!parsed.pathname.startsWith("/forge/"))
  return {ok:false,status:403};
 const path=parsed.pathname.slice("/forge/".length);
 try{
  const text=await read(path);
  return {ok:true,status:200,json:async()=>JSON.parse(text)};
 }catch(e){return {ok:false,status:404};}
}
let edition;
test.before(async()=>{
 edition=await loadEdition("https://forge.example/forge/editions/tegne/manifest.json",localFetcher);
});
test("Tegne Edition is listed as a test with offline vendor bundles and SitePublisher",async()=>{
 const cat=await json("catalog/editions.json"),item=cat.editions.find(x=>x.id==="tegne");
 const manifest=await json("editions/tegne/manifest.json");
 assert.ok(item);
 assert.equal(item.status,"test");
 assert.equal(item.version,manifest.version);
 assert.equal(manifest.coreVersion,"5.4.1");
 assert.deepEqual(item.bundledPlugins,["site-publisher"]);
 assert.equal(manifest.id,"tegne");
 assert.ok(manifest.plugins.includes("../../plugins/site-publisher/dist/plugin.json"));
 assert.ok(manifest.plugins.includes("../../plugins/tegne-react/dist/plugin.json"));
 assert.ok(manifest.plugins.includes("../../plugins/tegne-excalidraw/dist/plugin.json"));
 assert.ok(manifest.plugins.includes("../../plugins/tegne/dist/plugin.json"));
 assert.equal(edition.manifest.id,"tegne");
});
test("Vendor Excalidraw and React remain real self-contained plugins with their original authors and licenses",async()=>{
 const list=edition.tiddlers.filter(x=>x["plugin-type"]==="plugin");
 const names=new Map(list.map(x=>[x.title,x]));
 for(const name of ["$:/plugins/itw/tw-excalidraw","$:/plugins/linonetwo/tw-react",base,"$:/plugins/huwiki/site-publisher"])
  assert.ok(names.has(name),name);
 const editor=names.get("$:/plugins/itw/tw-excalidraw"),react=names.get("$:/plugins/linonetwo/tw-react");
 assert.equal(editor.author,"ItsTheWhale");
 assert.equal(react.author,"LinOnetwo");
 assert.equal(editor.version,"0.3.0");
 assert.equal(react.version,"1.0.0");
 assert.ok(editor.text.length>8_000_000,"Real Excalidraw engine, not a placeholder");
 assert.ok(react.text.length>200_000,"Real React widget, not an external CDN reference");
 const editorTiddlers=JSON.parse(editor.text).tiddlers,reactTiddlers=JSON.parse(react.text).tiddlers;
 assert.match(editorTiddlers["$:/plugins/itw/tw-excalidraw/license"].text,/MIT License/);
 assert.match(reactTiddlers["$:/plugins/linonetwo/tw-react/license"].text,/Copyright \(c\) 2020 lin onetwo/);
 assert.match(editorTiddlers["$:/plugins/itw/tw-excalidraw/widget.js"].text,/huwikiExportSvg/);
 assert.match(editorTiddlers["$:/plugins/itw/tw-excalidraw/widget.js"].text,/renderEmbeddables:false/);
 assert.ok(editorTiddlers["$:/plugins/itw/tw-excalidraw/widget.css"].text.length>100_000);
 assert.ok(!/google\.script\.run|DriveApp\.|UrlFetchApp\./.test(editorTiddlers["$:/plugins/itw/tw-excalidraw/widget.js"].text));
});
test("HUWiki Tegne standalone studio stays bilingual via the native $:/language without a custom selector",async()=>{
 const studio=edition.tiddlers.find(x=>x.title===base);
 assert.equal(studio.version,"1.1.0-test.1");
 assert.equal(studio.dependents,"$:/plugins/itw/tw-excalidraw $:/plugins/linonetwo/tw-react");
 const t=JSON.parse(studio.text).tiddlers;
 assert.equal(t[base+"/style.css"].type,"text/css");
 assert.ok(t[base+"/home"].text.includes("$:/language"));
 assert.ok(t[base+"/home"].text.includes("$:/plugins/huwiki/tegne/home-da"));
 assert.ok(t[base+"/home"].text.includes("$:/plugins/huwiki/tegne/home-en"));
 assert.match(t[base+"/home-da"].text,/Ny tegning/);
 assert.match(t[base+"/home-en"].text,/New drawing/);
 for(const language of ["da","en"]){
  const home=t[base+"/home-"+language].text;
  assert.match(home,/<\$excalidraw tiddler=<<drawing>>/);
  assert.ok(home.includes('tm-save-wiki'),"Native saver not replaced");
  assert.ok(home.includes('hu-tegne-copy'),"Should be able to duplicate drawing");
  assert.ok(home.includes('hu-tegne-new'),"Should be able to create drawing");
 }
 assert.ok(!Object.keys(t).some(title=>/language-selector|lang-picker/i.test(title)));
 assert.doesNotMatch(t[base+"/home-da"].text+t[base+"/home-en"].text,/hu-tegne-language|<select|chooseLanguage|languageToggle/);
 const js=t[base+"/startup.js"].text;
 new Script(js);
 assert.ok(js.includes("hu-tegne-source"));
 assert.ok(js.includes("generateNewTitle"));
 assert.ok(js.includes("$tw.wiki.getModificationFields()"));
 assert.doesNotMatch(js,/google\.script|DriveApp|eval\(/);
 const engine=JSON.parse(edition.tiddlers.find(x=>x.title==="$:/plugins/itw/tw-excalidraw").text).tiddlers;
 assert.match(engine["$:/plugins/itw/tw-excalidraw/lingo"].text,/match\[da-DK\]/);
 assert.match(engine["$:/plugins/itw/tw-excalidraw/language/da-DK/NewButtonCaption"].text,/Excalidraw/);
});
test("Tegne samples contain actual editable scenes, source article stays human-readable",async()=>{
 const files=await json("editions/tegne/tiddlers/seed.json"),cfg=await json("editions/tegne/tiddlers/config.json");
 const drawings=files.filter(x=>x.type===tiddlerMime);
 assert.ok(drawings.length>=2);
 for(const file of drawings){
  const source=JSON.parse(file.text);
  assert.equal(source.type,"excalidraw");
  assert.ok(Array.isArray(source.elements));
  assert.ok(source.elements.length>0);
  assert.equal(source.files&&typeof source.files,"object");
  assert.ok(file.tags.includes("HUWiki/Tegning"));
  for(const el of source.elements){
   assert.ok(el.id&&el.type&&Number.isFinite(el.width)&&Number.isFinite(el.height));
   assert.equal(el.isDeleted,false);
  }
 }
 const article=files.find(x=>x.title==="En tegning i en artikel");
 assert.ok(article?.text.includes("\n\n{{Farvefigurer}}\n\n"),"Readable WikiText has separate paragraphs");
 assert.ok(article["text-en"].includes("{{Farvefigurer}}"));
 assert.equal(cfg.find(x=>x.title==="$:/DefaultTiddlers")?.text,"[[HUWiki Tegne]]");
 assert.ok(!cfg.some(x=>x.title==="$:/language"),"Do not force wiki language or add a language selector");
});
test("All Edition plugin internal tiddler names are unique to avoid invisible overrides",()=>{
 const names=new Map();
 for(const plugin of edition.tiddlers.filter(x=>x["plugin-type"]==="plugin"||x["plugin-type"]==="theme")){
  const t=JSON.parse(plugin.text).tiddlers;
  for(const key of Object.keys(t)){
   if(names.has(key))assert.fail(key+" duplicated by "+plugin.title+" and "+names.get(key));
   names.set(key,plugin.title);
  }
 }
 assert.ok(names.size>120,"Actual editor, React and SitePublisher should be bundled");
});
test("Tegne can be assembled as a standalone offline HTML wiki with dependencies before bootstrap",async()=>{
 const core=await read("core/empty.html");
 const html=assembleHtml(core,edition.tiddlers),before=html.indexOf(CORE_LIBRARY_MARKER);
 assert.ok(before>0);
 for(const title of ["$:/plugins/itw/tw-excalidraw","$:/plugins/linonetwo/tw-react",base,"$:/plugins/huwiki/site-publisher"]){
  assert.ok(html.indexOf('"title":"'+title+'"')<before,title);
 }
 assert.ok(html.length>core.length+10_000_000,"Huge editor must really be present inside the file");
 assert.ok(html.includes("HUWiki Forge Edition"));
});
