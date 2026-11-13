import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { assembleHtml } from "../assembler/assemble.mjs";

async function json(path) {
  return JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
}

const cases=[
  {id:"site-publisher",path:"plugins/site-publisher/dist/plugin.json",title:"$:/plugins/huwiki/site-publisher",version:"0.1.7-test.1"},
  {id:"pdf-publisher",path:"plugins/print-article/dist/plugin.json",title:"$:/plugins/huwiki/print-article",version:"0.2.8-test.1"}
];

for (const row of cases) {
  test(row.id + " is a valid standalone MIT-licensed TiddlyWiki plugin without mandatory Google endpoints", async () => {
    const plugin=await json(row.path);
    assert.equal(plugin.title,row.title);
    assert.equal(plugin.version,row.version);
    assert.equal(plugin.license,"MIT");
    assert.equal(plugin["plugin-type"],"plugin");
    assert.equal(plugin.type,"application/json");
    const sub=JSON.parse(plugin.text)?.tiddlers;
    assert.ok(sub && typeof sub==="object");
    assert.ok(Object.keys(sub).some(x=>x.endsWith("/startup.js")));
    const scripts=Object.values(sub).filter(t=>t.type==="application/javascript").map(t=>t.text).join("\n");
    assert.ok(scripts.includes('exports.platforms = ["browser"]') || scripts.includes('exports.platforms=["browser"]'));
    assert.doesNotMatch(scripts,/google\.script\.run|DriveApp\.|UrlFetchApp\.|FormApp\./);
    // Neither package may require ABC/Music to be installed. ABC support is optional.
    assert.ok(!plugin.dependents || !/\$\:\/plugins\/huwiki\/abc/.test(plugin.dependents));
  });
}

for (const row of cases) {
  test(row.id + " startup JavaScript compiles and includes edition-neutral preview controls", async () => {
    const plugin=await json(row.path);
    const entries=JSON.parse(plugin.text).tiddlers;
    const js=entries[Object.keys(entries).find(x=>x.endsWith("/startup.js"))].text;
    try { new Script(js,{filename:row.id+"/startup.js"}); } catch(err) { console.error(err.stack); throw err; }
    assert.ok(js.includes('Indstillinger'),"Collapsible configuration should be present");
    assert.ok(js.includes('Overblik'),"An overview-first preview should be present");
    if(row.id==="site-publisher"){
      assert.ok(js.includes('items.every(function(x){return x.kind==="article";})?word("Artikler")'));
      assert.ok(js.includes('getTiddlerText("$:/SiteTitle")'));
      assert.ok(js.includes("renderOverview(selected)"));
      assert.ok(js.includes('getTiddlerText("$:/language"'),"Must follow the wiki language");
      assert.ok(js.includes("function wikiLanguage()"));
      assert.ok(js.includes('Download HTML'),"English interface labels");
      const downloader=js.slice(js.indexOf("function downloadHtml("),js.indexOf("function shareHtml("));
      assert.ok(downloader.includes("link.download=filename"));
      assert.ok(downloader.includes("link.click()"));
      assert.doesNotMatch(downloader,/navigator\.share|showSaveFilePicker/,"Mac download cannot open the native share sheet");
      assert.ok(js.includes("function shareHtml("),"Native sharing remains a separate action");
    } else {
      assert.ok(js.includes("huprint-overview-grid"));
      assert.ok(js.includes('getTiddlerText("$:/language"'),"PDF Publisher must follow wiki language");
      assert.ok(js.includes("schedulePreview()"));
      assert.ok(js.includes('renderBookSpreads(lastPreviewImages)'));
      assert.ok(js.includes('if(previewMode==="overview")'));
      assert.ok(js.includes('if(previewMode==="page")'));
      assert.ok(js.includes('if(previewMode==="spreads"') || js.includes('paperWrap.appendChild(E("h3","huprint-spread-heading"'));
    }
  });
}

test("both publishers are discoverable as optional add-ons and not mandatory in Edition manifests", async () => {
  const catalog=await json("catalog/editions.json");
  for (const row of cases) {
    const item=catalog.plugins.find(x=>x.id===row.id);
    assert.ok(item,"Missing catalog entry for "+row.id);
    assert.equal(item.status,"test");
    assert.equal(item.file,"../"+row.path);
  }
  for (const edition of catalog.editions) {
    const manifest=await json("editions/"+edition.id+"/manifest.json");
    for (const row of cases)assert.ok(!manifest.plugins.includes("../"+row.path));
  }
});


test("Publisher toolbar descriptions follow TiddlyWiki language without an extra selector",async()=>{
  for(const row of cases) {
    const p=await json(row.path);
    const entries=JSON.parse(p.text).tiddlers;
    const suffix=row.id==="site-publisher"?"Toolbar":"Toolbar";
    const toolbar=entries[p.title+"/"+suffix];
    assert.ok(toolbar,"Toolbar tiddler missing");
    for(const field of ["description","text"]){
      assert.match(toolbar[field],/\$:\/language/,"Language must come from TiddlyWiki");
      assert.match(toolbar[field],/\$:\/languages\/da/);
    }
    const tool=entries[p.title+"/Toolbar"];
    assert.equal(tool.type,"text/vnd.tiddlywiki");
    assert.ok(tool.description.includes("else[$:/languages/en-GB]"),"Toolbar descriptions must fall back to English");
    assert.equal(tool.text.split(String.fromCharCode(92)+"whitespace trim").length-1,1,"Only the initial whitespace pragma is valid");
    assert.ok(!tool.text.includes("\n"+String.fromCharCode(92)+"whitespace trim\n<" ));
    assert.ok(entries[p.title+"/readme"],"Internal README must be included");
    assert.ok(entries[p.title+"/readme-en"],"English README must be included");
    assert.ok(entries[p.title+"/readme-da"],"Danish README must be included");
    const script=entries[p.title+"/startup.js"].text;
    assert.doesNotMatch(script,/<select[^>]*(?:language|sprog)|lang(?:uage)?Switch|languageToggle/i);
  }
});

test("both Publisher versions match catalog metadata",async()=>{
  const catalog=await json("catalog/editions.json");
  for(const row of cases) {
    const entry=catalog.plugins.find(p=>p.id===row.id);
    assert.equal(entry?.version,row.version);
  }
});

test("HUPedia no longer refers users to the obsolete site template files", async () => {
  const seed=await json("editions/hupedia/tiddlers/seed.json");
  const initial=seed.find(x=>x.title==="HUPedia · Start");
  const publish=seed.find(x=>x.title==="HUPedia · Udgivelse");
  assert.ok(initial && publish);
  assert.doesNotMatch(initial.text,/For at aktivere temaet/);
  assert.ok(initial.text.includes("HUPedia-temaet er allerede aktiveret"));
  assert.doesNotMatch(publish.text,/02-Site-Skabelon|ÅBN-SITE-EKSEMPEL\.html/);
  assert.ok(publish.text.includes("SitePublisher") && publish.text.includes("PDF"));
  const config=await json("editions/hupedia/tiddlers/config.json");
  assert.equal(config.find(t=>t.title==="$:/theme")?.text,"$:/themes/huwiki/hupedia");
});

test("publisher add-on tiddlers can be embedded before TiddlyWiki bootstrap", async () => {
  const core=await readFile(new URL("../core/empty.html",import.meta.url),"utf8");
  const seed=await json("editions/hupedia/tiddlers/seed.json");
  const config=await json("editions/hupedia/tiddlers/config.json");
  const addon=await Promise.all(cases.map(row=>json(row.path)));
  const html=assembleHtml(core,[...seed,...config,...addon]);
  assert.ok(html.includes("<!-- HUWiki Forge Edition -->"));
  assert.ok(html.indexOf('"title":"$:/plugins/huwiki/site-publisher"') < html.indexOf("<!--~~ Library modules ~~-->"));
  assert.ok(html.indexOf('"title":"$:/plugins/huwiki/print-article"') < html.indexOf("<!--~~ Library modules ~~-->"));
});
