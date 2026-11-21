import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const pkg=JSON.parse(await readFile(path.join(root,"plugins/abc/dist/plugin.json"),"utf8"));
const tiddlers=JSON.parse(pkg.text).tiddlers;
const module={exports:{}};
runInNewContext(tiddlers["$:/plugins/huwiki/abc/floating-mixer.js"].text,{
 exports:module.exports,
 require(name){
  assert.ok(/^\$:\/plugins\/huwiki\/abc\//.test(name),"Mixer uses only ABC libraries");
  return {};
 }
});
const caption=module.exports.displayMusicTitle;

function makeWiki(records){
 return {getTiddler(title){return records[title];}};
}

test("Mini mixers show a melody without the verified orchestra prefix",()=>{
 const orchestra="SilbaÄtno",full="SilbaÄtno · Låt från Dalarne";
 const wiki=makeWiki({
  ["Repertoire/Orkestre/"+encodeURIComponent(orchestra)]:{fields:{"repertoire-kind":"orchestra",name:orchestra}},
  [full]:{fields:{title:full,tags:["ABC",orchestra,orchestra+"Track"]}}
 });
 assert.equal(caption(wiki,full),"Låt från Dalarne");
 assert.equal(caption(wiki,"SilbaÄtno · Brudmarch från Jämtland"),"Brudmarch från Jämtland");
 assert.equal(caption(wiki,"SilbaÄtno · Låt från Dalarne"),"Låt från Dalarne");
});

test("Mini mixer titles do not strip non-orchestra title prefixes",()=>{
 const wiki=makeWiki({
  "Balkan · 7/8":{fields:{title:"Balkan · 7/8",tags:["Balkan","ABC"]}},
  "SilbaÄtno · Title":{fields:{title:"SilbaÄtno · Title",tags:"ABC SilbaÄtno SilbaÄtnoTrack"}}
 });
 assert.equal(caption(wiki,"Balkan · 7/8"),"Balkan · 7/8");
 assert.equal(caption(null,"SilbaÄtno · Title"),"SilbaÄtno · Title");
 assert.equal(caption(wiki,"SilbaÄtno · Title"),"Title","serialized orchestra tags are supported");
 assert.equal(caption(wiki,"Englishman in New York"),"Englishman in New York");
});

test("Mixer retains full source identity, while visible title and play labels are short",()=>{
 const js=tiddlers["$:/plugins/huwiki/abc/floating-mixer.js"].text;
 assert.match(js,/storeKey='huwabc-mini-mixer-layout-v3-'\+musicTitle/);
 assert.match(js,/huwabc-mini-mixer-title',caption/);
 assert.match(js,/title\.setAttribute\('aria-label',caption/);
 assert.match(js,/play\.setAttribute\('aria-label',caption/);
 assert.doesNotMatch(js,/huwabc-mini-mixer-title',musicTitle/);
});
