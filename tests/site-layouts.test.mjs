import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

async function getJson(path){
  return JSON.parse(await readFile(new URL("../"+path,import.meta.url),"utf8"));
}
const base="$:/plugins/huwiki/site-publisher";
const modes=["modern","retro","vanilla","hupedia"];
test("SitePublisher bundles readable, self-contained stylesheet per legacy design",async()=>{
  const plugin=await getJson("plugins/site-publisher/dist/plugin.json");
  assert.equal(plugin.version,"0.1.12-test.1");
  const t=JSON.parse(plugin.text).tiddlers;
  for(const id of modes){
    const src=t[base+"/layouts/"+id+".css"];
    assert.ok(src,"Missing "+id+" design");
    assert.equal(src.type,"text/css");
    assert.ok(src.text.startsWith("/* HUWiki Forge"),"CSS should be a human-readable source tiddler");
    assert.match(src.text,new RegExp("body\\.husp-layout-"+id));
    assert.ok(src.text.length>500,"Design should contain meaningful styling");
    assert.doesNotMatch(src.text,/https?:|@import|<script/i,"Offline layout CSS must not fetch remote resources");
  }
  assert.match(t[base+"/layouts/hupedia.css"].text,/\.hupedia-infobox/);
  assert.match(t[base+"/layouts/retro.css"].text,/Georgia/);
  assert.match(t[base+"/layouts/modern.css"].text,/#edf3f9/);
});
test("Auto follows the selected TiddlyWiki theme and manual design overrides it",async()=>{
  const plugin=await getJson("plugins/site-publisher/dist/plugin.json");
  const t=JSON.parse(plugin.text).tiddlers;
  const js=t[base+"/startup.js"].text;
  const from=js.indexOf("function resolveSiteLayout(choice) {");
  const to=js.indexOf("\nfunction makeSite(entries,opts){",from);
  assert.ok(from>0&&to>from);
  let theme="";
  const wiki={
    getTiddlerText(name,fallback){
      if(name==="$:/theme")return theme;
      return t[name]?.text??fallback;
    }
  };
  const api=new Function("$tw",js.slice(from,to)+"\nreturn {resolveSiteLayout,publicationLayoutCss};")({wiki});
  const cases=[
    ["$:/themes/huwiki/hupedia","hupedia"],
    ["$:/themes/huwiki/retro","retro"],
    ["$:/themes/huwiki/modern","modern"],
    ["$:/themes/tiddlywiki/vanilla","vanilla"],
    ["$:/themes/tiddlywiki/snowwhite","standard"]
  ];
  for(const [selected,expected] of cases){
    theme=selected;
    assert.equal(api.resolveSiteLayout("auto"),expected,selected);
    assert.equal(api.resolveSiteLayout("standard"),"standard","Manual Standard must override any theme");
    for(const id of modes)assert.equal(api.resolveSiteLayout(id),id);
  }
  assert.equal(api.publicationLayoutCss("standard"),"");
  for(const id of modes){
    const css=api.publicationLayoutCss(id);
    assert.match(css,new RegExp("body\\.husp-layout-"+id));
  }
  delete t[base+"/layouts/retro.css"];
  assert.throws(()=>api.publicationLayoutCss("retro"),/layout CSS missing/,"Never export a selected style silently without CSS");
});
test("SitePublisher uses one localized layout field for both preview and downloaded HTML",async()=>{
  const plugin=await getJson("plugins/site-publisher/dist/plugin.json");
  const js=JSON.parse(plugin.text).tiddlers[base+"/startup.js"].text;
  assert.match(js,/option\(layoutSelect,"auto",word\("Automatisk/);
  for(const id of ["auto","standard",...modes])assert.ok(js.includes('option(layoutSelect,"'+id+'"'),"Layout option "+id);
  assert.ok(js.includes('top.appendChild(label(word("Sitelayout"),layoutSelect))'));
  assert.ok(js.includes("layoutSelect.onchange=invalid;"),"Changing the design must trigger a new preview");
  assert.ok(js.includes("layout:layoutSelect.value"),"Selected design must reach the HTML builder");
  assert.ok(js.includes("css+=publicationLayoutCss(layout);"),"Generated HTML must embed the selected CSS");
  assert.ok(js.includes('body class="husp-layout-'),"Site body must declare its chosen design");
  assert.ok(js.includes("preview.srcdoc=exported"),"The site preview should display the same HTML as download");
  assert.match(js,/"Sitelayout":"Site layout"/);
  assert.doesNotMatch(js,/languageToggle|languageSwitch|langSelector/);
});
