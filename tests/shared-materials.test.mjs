import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const catalogPath=path.join(root,"catalog/materials.json");
async function readJson(file){return JSON.parse(await readFile(file,"utf8"));}
test("shared material catalog is a small, static index and never preloads plugins",async()=>{
 const source=await readFile(catalogPath,"utf8");
 const catalog=JSON.parse(source);
 assert.equal(catalog.schemaVersion,1);
 assert.ok(source.length<12000,"Materials catalog must remain lightweight");
 assert.ok(catalog.items.length>=16);
 const ids=new Set();
 for(const item of catalog.items){
  assert.ok(!ids.has(item.id),"Duplicate material id "+item.id);
  ids.add(item.id);
  assert.ok(item.label_da&&item.label_en);
  assert.ok(["plugin","theme","plugin-collection","tiddler-collection"].includes(item.kind));
  assert.equal(typeof item.source,"string");
  assert.ok(!item.source.includes("script.google.com"));
  assert.ok(!item.source.includes("drive.google.com"));
  const url=new URL(item.source,"https://forge.example/huwiki-forge/catalog/materials.json");
  assert.equal(url.origin,"https://forge.example");
  assert.ok(url.pathname.startsWith("/huwiki-forge/"),"Do not leave static Forge origin");
  const data=await readJson(path.join(root,url.pathname.slice("/huwiki-forge/".length)));
  if(item.kind==="tiddler-collection"){
   assert.ok(Array.isArray(data)&&data.length,"Selected source must be an actual array of tiddlers");
   assert.ok(data.every(t=>typeof t.title==="string"&&!t.title.startsWith("$:/")));
  } else {
   assert.equal(data.type,"application/json");
   assert.ok(data.title.startsWith(item.kind==="theme"?"$:/themes/":"$:/plugins/"));
   const contents=JSON.parse(data.text).tiddlers;
   assert.ok(Object.keys(contents).length>0);
   if(item.kind==="plugin-collection"){
    assert.ok(item.requires?.includes("$:/plugins/huwiki/abc"));
    assert.equal(data.dependents,"$:/plugins/huwiki/abc");
    assert.ok(Object.keys(contents).some(title=>!title.startsWith("$:/")),"Collection needs user-visible articles");
   }
  }
 }
});
