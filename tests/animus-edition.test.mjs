import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const load=async name=>JSON.parse(await readFile(path.join(root,name),"utf8"));
const packages=[
 ["plugins/musical/dist/plugin.json","$:/plugins/huwiki/musical"],
 ["plugins/animus-example-orchestra/dist/plugin.json","$:/plugins/huwiki/animus-example-orchestra"],
 ["plugins/animus-example-fyrtoejet/dist/plugin.json","$:/plugins/huwiki/animus-example-fyrtoejet"]
];

test("AniMus Forge I is one shared editor with two optional show plugins",async()=>{
 const [core,orchestra,fyrtoejet]=await Promise.all(packages.map(async ([name,title])=>{
  const pkg=await load(name);
  assert.equal(pkg.title,title);
  assert.equal(pkg["plugin-type"],"plugin");
  assert.equal(pkg.type,"application/json");
  assert.equal(typeof pkg.text,"string");
  return {...pkg,shadow:JSON.parse(pkg.text).tiddlers};
 }));
 assert.ok(core.shadow["AniMus Forge I · Start"]);
 assert.ok(core.shadow["$:/plugins/huwiki/musical/manuscript.js"]);
 assert.ok(core.shadow["$:/plugins/huwiki/musical/sfx.js"]);
 assert.ok(orchestra.dependents.includes(core.title));
 assert.ok(fyrtoejet.dependents.includes(core.title));
 assert.ok(orchestra.shadow["Musical – Start"]);
 assert.ok(fyrtoejet.shadow["Fyrtøjet · Start"]);
 assert.ok(Object.keys(fyrtoejet.shadow).some(title=>title.includes("09")&&title.includes("ABC")));
});

test("AniMus Edition and plugin registry reference exact beta packages",async()=>{
 const manifest=await load("editions/animus/manifest.json");
 const cat=await load("catalog/editions.json");
 const index=await load("editions/forge/tiddlers/edition-index.json");
 const registry=await load("library/plugins/registry.json");
 const home=cat.editions.find(x=>x.id==="animus");
 assert.ok(home);
 assert.equal(home.version,manifest.version);
 assert.ok(index.some(x=>x["edition-id"]==="animus"&&x.version===manifest.version));
 for(const [filename,title] of packages.concat([["plugins/animus-video-export/dist/plugin.json","$:/plugins/huwiki/animus-video-export"]])){
  const pkg=await load(filename);
  const rel="../../"+filename;
  if(filename.includes('animus-example-'))assert.ok(!manifest.plugins.includes(rel),rel+' is only loaded by its separate show');else assert.ok(manifest.plugins.includes(rel),rel);
  const record=registry.items.find(x=>x.fields.title===title);
  assert.ok(record,title);
  assert.equal(record.path,rel);
  assert.equal(record.fields.version,pkg.version);
 }
 const exported=await load("plugins/animus-video-export/dist/plugin.json");
 assert.ok(JSON.parse(exported.text).tiddlers["$:/plugins/huwiki/animus-video-export/runtime.js"]);
 const gallery=await load("editions/animus/tiddlers/gallery.json");
 assert.ok(gallery.some(t=>t.title==="AniMus Forge I · Start"&&t.text.includes("Fyrtøjet")&&t.text.includes("Tændstikorkestret")));
});
