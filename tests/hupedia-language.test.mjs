import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

async function read(path) {
  return JSON.parse(await readFile(new URL("../"+path,import.meta.url),"utf8"));
}
const pluginPath="plugins/hupedia/dist/plugin.json";
const themePath="themes/hupedia/dist/theme.json";
const required=String.raw`[{$:/language}else[$:/languages/en-GB]`;
const localeVar='variable="hupediaLocale"';

test("HUPedia forms and infoboxes keep their original data field IDs while translating interface text",async()=>{
 const p=await read(pluginPath),t=JSON.parse(p.text).tiddlers;
 assert.equal(p.version,"0.2.3-test.1");
 const names=Object.keys(t).filter(n=>/\/(forms|infoboxes)\//.test(n));
 assert.equal(names.length,14);
 for(const name of names){
  const text=t[name].text;
  assert.ok(text.startsWith(String.fromCharCode(92)+"whitespace trim"),name);
  assert.equal(text.split(String.fromCharCode(92)+"whitespace trim").length-1,1,name);
  assert.ok(text.includes(required),name);
  assert.equal(text.split(localeVar).length-1,2,name);
  assert.ok(text.includes("Beskrivelse")&&text.includes("Description"),name);
  assert.ok(text.includes('field="pedia-subtitle"'),name);
  assert.ok(!text.includes('field="pedia-subtitle-en"'),"Translations must not invent replacement fields");
 }
});
test("HUPedia theme sidebar and demo preserve canonical TiddlyWiki links/tags and use native locale",async()=>{
 const theme=await read(themePath);
 const sidebar=JSON.parse(theme.text).tiddlers["$:/themes/huwiki/hupedia/sidebar"].text;
 assert.equal(theme.version,"0.2.3-test.1");
 assert.ok(sidebar.includes("New article")&&sidebar.includes("Ny artikel"));
 assert.ok(sidebar.includes(localeVar));
 assert.ok(sidebar.includes('pedia-status="kladde"'),"Status field values must stay stable");
 const seed=await read("editions/hupedia/tiddlers/seed.json");
 assert.equal(seed.length,8);
 for(const row of seed){
  assert.ok(row.text.includes(localeVar),row.title);
  assert.ok(row.text.includes(required),row.title);
 }
 const nielsen=seed.find(t=>t.title==="Carl Nielsen");
 assert.ok(nielsen.text.includes("Liv og karriere")&&nielsen.text.includes("Life and career"));
 const config=await read("editions/hupedia/tiddlers/config.json");
 assert.ok(config.find(t=>t.title==="$:/SiteSubtitle").text.includes("An independent encyclopedia"));
 assert.equal(config.find(t=>t.title==="$:/theme").text,"$:/themes/huwiki/hupedia");
 const manifest=await read("editions/hupedia/manifest.json");
 assert.equal(manifest.version,"0.2.3-test.1");
});
