import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function load(path) {
  return JSON.parse(await readFile(new URL("../"+path,import.meta.url),"utf8"));
}

const base="$:/plugins/huwiki/hupedia/";
const modeBlock='$mode="block"';
const locale='[{$:/language}else[$:/languages/en-GB]';
const directive=String.fromCharCode(92)+"whitespace trim";

test("plain article WikiText remains readable in editing mode with blank lines",async()=>{
  const seed=await load("editions/hupedia/tiddlers/seed.json");
  assert.equal(seed.length,8);
  for(const entry of seed) {
    for(const field of ["text","text-en"]) {
      const text=entry[field];
      assert.equal(typeof text,"string",entry.title+" "+field);
      assert.ok(text.includes("\n\n"),entry.title+" "+field+" should have separated paragraphs");
      assert.doesNotMatch(text,/<\$list filter="\[\{\$:\/language\}/,entry.title+" "+field+" must not contain UI language logic");
      assert.ok(!text.startsWith(directive),"Article text must not start with parser pragmas");
    }
  }
  const start=seed.find(t=>t.title==="HUPedia · Start");
  assert.match(start.text,/^! HUPedia · Leksikon\n\n/);
  assert.match(start["text-en"],/^! HUPedia · Encyclopedia\n\n/);
  const redaction=seed.find(t=>t.title==="HUPedia · Redaktion");
  for(const lang of ["text","text-en"]) {
    assert.ok(redaction[lang].includes("<li><$link/></li>"));
    assert.doesNotMatch(redaction[lang],/<br\/>/,"Editorial list items must not be flat lines with HTML breaks");
  }
  const nielsen=seed.find(t=>t.title==="Carl Nielsen");
  assert.match(nielsen.text,/!! Liv og karriere\n\n/);
  assert.match(nielsen["text-en"],/!! Life and career\n\n/);
  assert.ok(nielsen.tags.includes("HUPedia/Person"));
});

test("HUPedia uses block-mode transclusion for article text and optional English field",async()=>{
  const plugin=await load("plugins/hupedia/dist/plugin.json");
  assert.equal(plugin.version,"0.2.4-test.1");
  const tiddlers=JSON.parse(plugin.text).tiddlers;
  const body=tiddlers[base+"localized-body"];
  assert.equal(body.type,"text/vnd.tiddlywiki");
  assert.ok(body.text.includes(locale));
  assert.ok(body.text.includes('$field="text-en"'));
  assert.ok(body.text.includes('$type="text/vnd.tiddlywiki"'));
  assert.ok(body.text.includes(modeBlock));
  assert.ok(body.text.includes('!has[text-en]'),"Missing translations should fall back to the original article");
  assert.ok(body.text.includes('$:/core/ui/ViewTemplate/body/default'));
  const article=tiddlers[base+"article-view"].text;
  assert.ok(article.includes(base+"localized-body"));
  const filter=tiddlers[base+"body-filter"].text;
  assert.ok(filter.includes("HUPedia/Localized"));
  assert.ok(filter.includes(base+"article-view"));

  const editor=tiddlers[base+"english-editor"];
  assert.equal(editor.type,"text/vnd.tiddlywiki");
  assert.ok(editor.tags.includes("$:/tags/EditTemplate"));
  assert.ok(editor.text.includes('<$edit-text field="text-en" tag="textarea" rows="16"'));
  assert.ok(editor.text.includes("<summary>"));
  assert.ok(editor.text.includes("WikiText"));
});

test("every HUPedia editor/infobox language is independently editable source, not a duplicated widget body",async()=>{
  const plugin=await load("plugins/hupedia/dist/plugin.json");
  const tiddlers=JSON.parse(plugin.text).tiddlers;
  const originalNames=Object.keys(tiddlers).filter(n=>/^(\$:\/plugins\/huwiki\/hupedia\/)(forms|infoboxes)\/[^/]+$/.test(n));
  assert.equal(originalNames.length,14);
  for(const title of [...originalNames,base+"README",base+"article-footer"]){
    const source=tiddlers[title].text;
    assert.ok(source.includes(locale),title);
    assert.ok(source.includes(modeBlock),title);
    assert.ok(source.length<650,title+" dispatcher should remain short");
    for(const lang of ["da","en"]){
      const translation=tiddlers[title+"/"+lang];
      assert.equal(translation.type,"text/vnd.tiddlywiki",title+" "+lang);
      assert.ok(translation.text.startsWith(directive+"\n\n"),title+" "+lang);
      assert.ok(!translation.text.includes(locale),title+" "+lang+" should be plain source");
      if(title.includes("/forms/")||title.includes("/infoboxes/")){
        assert.ok(translation.text.includes("pedia-subtitle"),title+" "+lang);
      }
    }
  }
  assert.match(tiddlers[base+"infoboxes/Person/da"].text,/>Beskrivelse<\/dt>/);
  assert.match(tiddlers[base+"infoboxes/Person/en"].text,/>Description<\/dt>/);
});

test("HUPedia sidebar has separate WikiText source files, and language is only selected by TiddlyWiki",async()=>{
  const theme=await load("themes/hupedia/dist/theme.json");
  assert.equal(theme.version,"0.2.4-test.1");
  const sidebar=JSON.parse(theme.text).tiddlers;
  const base="$:/themes/huwiki/hupedia/sidebar";
  assert.ok(sidebar[base].text.includes(locale));
  assert.ok(sidebar[base].text.includes(modeBlock));
  assert.ok(sidebar[base+"/en"].text.includes("New article"));
  assert.ok(sidebar[base+"/da"].text.includes("Ny artikel"));
  assert.ok(sidebar[base+"/en"].text.includes('pedia-status="kladde"'));
  const config=await load("editions/hupedia/tiddlers/config.json");
  assert.equal(config.find(t=>t.title==="$:/theme")?.text,"$:/themes/huwiki/hupedia");
  const manifest=await load("editions/hupedia/manifest.json");
  assert.equal(manifest.version,"0.2.4-test.1");
  const catalog=await load("catalog/editions.json");
  assert.equal(catalog.editions.find(t=>t.id==="hupedia")?.version,"0.2.4-test.1");
});
