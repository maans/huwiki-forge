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
 assert.equal(film.scenes.length,2);
 assert.equal(film.scenes[0].sourceId,stage.id);
 assert.equal(film.scenes[0].duration,16);
 assert.equal(film.camera.keys.length,15);
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
 assert.equal(shadows["$:/plugins/huwiki/musical/sync.js"]["module-type"],"library");
 assert.equal(shadows["$:/plugins/huwiki/musical/widget.js"]["module-type"],"widget");
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


test("Musical Studio supports live notes, whole songs, lighting and editable camera cuts",async()=>{
 const plugin=await json("plugins/musical/dist/plugin.json");
 const shadows=JSON.parse(plugin.text).tiddlers;
 const editor=shadows["$:/plugins/huwiki/musical/editor.js"];
 assert.equal(editor["module-type"],"library");
 const widget=shadows["$:/plugins/huwiki/musical/widget.js"].text;
 new vm.Script(editor.text);
 new vm.Script(widget);
 assert.match(widget,/onEvent:function\(evt\)/);
 assert.match(widget,/showNotes\(t\)/);
 assert.match(widget,/Editor\.attach/);
 assert.match(widget,/externalChange\(this\._stageTitle\)/);
 assert.match(editor.text,/setPointerCapture/);
 assert.match(editor.text,/wiki\.addTiddler/);
 assert.match(editor.text,/cameraState/);
 const ctx={exports:{},require:()=>({})};
 new vm.Script(editor.text).runInNewContext(ctx);
 const rows=await json("editions/musical/tiddlers/seed.json");
 const movie=JSON.parse(rows.find(t=>t.title==="Musical – Tændstikorkestret (film)").text);
 assert.equal(movie.musical.songs.length,2);
 assert.equal(movie.musical.songs[0].score,"Musical – Tændstikorkestret (ABC)");
 assert.match(editor.text,/markOwnWrite/);
 assert.match(widget,/this\._ownWritten/);
 assert.equal(movie.musical.songs[0].kind,"complete-abc");
 assert.equal(movie.musical.songs[1].score,"Musical – Tændstikorkestret (Finale ABC)");
 assert.equal(movie.musical.songs[1].start,16);
 assert.ok(movie.musical.cameraB.keys.length>=3);
 assert.ok(movie.musical.cuts.some(k=>k.camera==="A"));
 assert.ok(movie.musical.cuts.some(k=>k.camera==="B"));
 assert.ok(movie.musical.lighting.keys.length>=3);
 const model=ctx.exports.ensureMusical(movie);
 assert.equal(model.cuts.length,10);
 assert.equal(ctx.exports.interpolate([{t:0,intensity:0},{t:4,intensity:1}],2,"intensity",0),.5);
});

test("A single transport maps two complete ABC tunes to absolute global time",async()=>{
 const plugin=await json("plugins/musical/dist/plugin.json");
 const sh=JSON.parse(plugin.text).tiddlers;
 const source=sh["$:/plugins/huwiki/musical/playlist.js"];
 assert.equal(source["module-type"],"library");
 const context={exports:{}};
 new vm.Script(source.text).runInNewContext(context);
 const Playlist=context.exports;
 const items=Playlist.reflow([
  {id:"one",score:"First complete song",duration:16},
  {id:"two",score:"Second complete song",duration:11.5},
  {id:"three",score:"Third complete song",duration:8}
 ],"First complete song");
 assert.equal(Playlist.total(items),35.5);
 assert.equal(items[0].start,0);
 assert.equal(items[1].start,16);
 assert.equal(items[2].start,27.5);
 assert.equal(Playlist.locate(items,15.99).index,0);
 assert.equal(Playlist.locate(items,16).index,1);
 assert.equal(Playlist.locate(items,27.49).index,1);
 assert.equal(Playlist.locate(items,27.5).index,2);
 assert.equal(Playlist.locate(items,35.5).local,8);
 assert.equal(Playlist.at(items,1,3.5),19.5);
 const widget=sh["$:/plugins/huwiki/musical/widget.js"].text;
 const editor=sh["$:/plugins/huwiki/musical/editor.js"].text;
 new vm.Script(widget);new vm.Script(editor);
 assert.match(widget,/switchSong\(index\+1,clips\[index\+1\]\.start,true\)/);
 assert.match(widget,/StartPosition\.seek\(c,song\.tune/);
 assert.match(widget,/timeline\.beatPosition\(Playlist\.at/);
 assert.match(widget,/data-song-index/);
 assert.match(editor,/huw-musical-add-song/);
 assert.match(editor,/huw-musical-remove-song/);
 assert.match(editor,/huw-musical-move-song-earlier/);
 assert.match(editor,/huw-musical-move-song-later/);
 const rows=await json("editions/musical/tiddlers/seed.json");
 const titles=new Set(rows.filter(x=>x["abc-source"]).map(x=>x.title));
 const movie=JSON.parse(rows.find(x=>x.title==="Musical – Tændstikorkestret (film)").text);
 assert.equal(movie.scenes.length,2);
 for(const song of movie.musical.songs)assert.ok(titles.has(song.score));
 assert.equal(movie.scenes.reduce((sum,x)=>sum+x.duration,0),32);
 assert.equal(movie.musical.songs.reduce((sum,x)=>sum+x.duration,0),32);
});
