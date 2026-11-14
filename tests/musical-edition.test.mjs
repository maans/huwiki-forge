import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import {loadEdition} from "../assembler/assemble.mjs";
import {checkShadowConflicts} from "../assembler/compose.mjs";

const root=path.resolve(import.meta.dirname,"..");
const read=p=>readFile(path.join(root,p),"utf8");
const json=async p=>JSON.parse(await read(p));
async function localFetch(url){
 const u=new URL(url);
 if(u.origin!=="https://forge.example"||!u.pathname.startsWith("/huwiki-forge/"))
  return {ok:false,status:403};
 try{
  const body=await read(u.pathname.slice("/huwiki-forge/".length));
  return {ok:true,status:200,json:async()=>JSON.parse(body)};
 }catch(_){return {ok:false,status:404};}
}

test("Musical combines the complete CutOut and Music toolchains without conflicts",async()=>{
 const {manifest,tiddlers}=await loadEdition("https://forge.example/huwiki-forge/editions/musical/manifest.json",localFetch);
 assert.equal(manifest.id,"musical");
 assert.equal(manifest.coreVersion,"5.4.1");
 assert.equal(manifest.tiddlers.filter(t=>t==="../shared/libraries.json").length,1);
 assert.ok(manifest.plugins.some(t=>t.includes("plugins/musical/")));
 assert.equal(manifest.plugins.filter(t=>t.includes("plugins/abc/")).length,1);
 assert.equal(manifest.plugins.filter(t=>t.includes("plugins/cutout/")).length,1);
 for(const name of ["basic","jazz","rhythm","balkan","india","folk"])
  assert.ok(manifest.plugins.some(x=>x.includes("plugins/lessons-"+name+"/")),name);
 const names=tiddlers.map(t=>t.title);
 assert.equal(names.length,new Set(names).size);
 checkShadowConflicts(tiddlers,"$:/themes/huwiki/modern");
 const byTitle=new Map(tiddlers.map(t=>[t.title,t]));
 for(const key of ["$:/plugins/huwiki/abc","$:/plugins/huwiki/cutout","$:/plugins/huwiki/musical","$:/plugins/huwiki/music","$:/themes/huwiki/modern","Musical – Start"])assert.ok(byTitle.has(key),key);
 assert.equal(byTitle.get("$:/DefaultTiddlers").text,"[[Musical – Start]]");
 assert.equal(byTitle.get("$:/plugins/huwiki/musical").dependents,"$:/plugins/huwiki/cutout $:/plugins/huwiki/abc");
});

test("Orchestra has animated players, original ABC score, and editable film camera",async()=>{
 const rows=await json("editions/musical/tiddlers/seed.json");
 const byTitle=new Map(rows.map(t=>[t.title,t]));
 const stage=JSON.parse(byTitle.get("Musical – Tændstikorkestret (scene)").text);
 const film=JSON.parse(byTitle.get("Musical – Tændstikorkestret (film)").text);
 const score=byTitle.get("Musical – Tændstikorkestret (ABC)");
 const actors=stage.parts.filter(p=>p.id.endsWith("-root"));
 assert.equal(actors.length,6);
 assert.ok(actors.every(p=>p.keys.length>=30));
 assert.equal(stage.kind,"scene");
 assert.equal(film.kind,"theatre");
 assert.equal(film.scenes.length,1);
 assert.equal(film.scenes[0].sourceId,stage.id);
 assert.equal(film.scenes[0].duration,16);
 assert.equal(film.camera.keys.length,9);
 assert.ok(film.camera.keys.every(k=>Number.isFinite(k.t)&&Number.isFinite(k.x)&&Number.isFinite(k.y)&&k.zoom>=.25&&k.zoom<=16));
 assert.ok(film.camera.keys.some(k=>k.zoom>1.8));
 assert.ok(film.camera.keys.some(k=>k.zoom===1));
 assert.ok(score["abc-source"].includes("V:1"));
 assert.ok(score["abc-source"].includes("V:2"));
 assert.ok(score["abc-source"].includes("V:3"));
 assert.match(byTitle.get("Musical – Start").text,/\$musical-stage/);
});

test("Musical clock follows audio callbacks; pause and tempo do not advance a second clock",async()=>{
 const plugin=await json("plugins/musical/dist/plugin.json");
 const shadows=JSON.parse(plugin.text).tiddlers;
 const p=shadows["$:/plugins/huwiki/musical/sync.js"].text;
 const w=shadows["$:/plugins/huwiki/musical/widget.js"].text;
 new vm.Script(p);new vm.Script(w);
 let millis=0,painted=-1;const ctx={exports:{}};
 new vm.Script(p).runInNewContext(ctx);
 const time=new ctx.exports.Timeline(16,v=>painted=v,()=>millis);
 time.play();millis=1000;
 assert.equal(time.value(),1);
 time.beat(2,32);
 assert.equal(time.value(),1);
 time.setRate(.75);millis=2000;assert.equal(time.value(),1.75);
 time.pause();millis=5000;assert.equal(time.value(),1.75);
 time.seek(12);assert.equal(painted,12);
 time.play();millis=6000;assert.equal(time.value(),12.75);
 time.finish();assert.equal(time.value(),16);
 assert.match(w,/Audio\.install/);
 assert.match(w,/Playback\.start/);
 assert.match(w,/timeline\.beat/);
 assert.match(w,/Engine\.paint/);
 assert.match(w,/fields\["abc-source"\]/);
});

test("Forge catalog, home card and native Plugin Library publish Musical",async()=>{
 const catalog=await json("catalog/editions.json");
 const manifest=await json("editions/musical/manifest.json");
 assert.equal(catalog.editions.find(e=>e.id==="musical").manifest,"../editions/musical/manifest.json");
 assert.equal(manifest.version,catalog.editions.find(e=>e.id==="musical").version);
 const cards=await json("editions/forge/tiddlers/edition-index.json");
 assert.ok(cards.some(x=>x["edition-id"]==="musical"&&x["heading-da"]&&x["heading-en"]));
 const registry=await json("library/plugins/registry.json");
 assert.ok(registry.items.some(x=>x.fields.title==="$:/plugins/huwiki/musical"));
});
