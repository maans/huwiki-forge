import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { assembleHtml } from "../assembler/assemble.mjs";

async function json(path) {
  return JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
}

const cases=[
  {id:"site-publisher",path:"plugins/site-publisher/dist/plugin.json",title:"$:/plugins/huwiki/site-publisher",version:"0.1.15-test.1"},
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
      assert.ok(js.includes('chosenTitle=title&&$tw.wiki.getTiddler(title)?title:""'),"Selected shadow tiddlers must not silently fall back to an unrelated tag");
      assert.ok(js.includes('Download HTML'),"English interface labels");
      const downloader=js.slice(js.indexOf("function downloadHtml("),js.indexOf("function shareFile("));
      assert.ok(downloader.includes("link.download=filename"));
      assert.ok(downloader.includes("link.click()"));
      assert.doesNotMatch(downloader,/navigator\.share|showSaveFilePicker/,"Mac download cannot open the native share sheet");
      assert.ok(js.includes("function shareHtml("),"Native sharing remains a separate action");
      assert.ok(js.includes("function canShareHtml("),"Sharing must test browser support for HTML files");
      assert.ok(js.includes("shareBtn.hidden=!canShareHtml(exported"),"Hide unsupported native share instead of showing an error");
      assert.ok(js.includes("Systemdelingen blev afvist."),"Failed native sharing should offer a file-download fallback");
      assert.ok(js.includes("downloadHtml(html,name);"),"Share failures should try the normal HTML download");
      const toolbar=entries[plugin.title+"/Toolbar"].text;
      const pageControl=entries[plugin.title+"/PageControl"].text;
      for(const source of [toolbar,pageControl]) {
        assert.ok(source.includes("<tv-config-toolbar-text>match[yes]"),"Toolbar must show its text when configured");
        assert.ok(source.includes("tc-btn-text"),"Toolbar text must have the TiddlyWiki standard markup");
        assert.ok(source.includes("huwikiLocale"),"Toolbar must follow built-in wiki language");
      }
      assert.ok(toolbar.includes("Publish HTML site"));
      assert.ok(toolbar.includes("Udgiv HTML-site"));
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
    assert.ok(tool.text.includes('variable="huwikiLocale"'),"Locale wrapper cannot replace currentTiddler");
    assert.ok(tool.description.includes('variable="huwikiLocale"'),"Description locale wrapper must be explicit");
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

test("SitePublisher exported HTML has a touch-accessible, always-recoverable focus mode", async()=>{
  const p=await json("plugins/site-publisher/dist/plugin.json");
  const js=JSON.parse(p.text).tiddlers[p.title+"/startup.js"].text;
  assert.ok(js.includes('id="focus-exit"'),"Export must have an escape-free exit button");
  assert.ok(js.includes("body.husp-focus .husp-focus-exit{display:inline-flex"),"Exit button must appear even while the header is hidden");
  assert.ok(js.includes("env(safe-area-inset-right)"),"The exit button must respect iPad safe areas");
  assert.ok(js.includes("min-height:46px"),"Touch target should have usable size");
  assert.ok(js.includes('exitBtn.onclick=function(){focus(false);};'),"Touch exit button must exit focus");
  assert.ok(js.includes('e.data.type==="husp-toggle-controls"'),"Score blank-area tap must reveal the controls");

  // Execute the exported site runtime using a small fake browser DOM.
  const elements={};
  const documentListeners={};
  const windowListeners={};
  const classes=()=>({
    values:new Set(),
    toggle(name,force){ if(force===undefined)force=!this.values.has(name); if(force)this.values.add(name);else this.values.delete(name); },
    add(name){this.values.add(name);},
    contains(name){return this.values.has(name);}
  });
  function element(id){
    return elements[id]||(elements[id]={
      id,
      classList:classes(),attributes:{},children:[],listeners:{},
      setAttribute(k,v){this.attributes[k]=v;},
      removeAttribute(k){delete this.attributes[k];},
      addEventListener(k,fn){this.listeners[k]=fn;},
      appendChild(child){this.children.push(child);},
      querySelectorAll(){return [];},
      getAttribute(k){return this.attributes[k]||"";}
    });
  }
  element("publisher-data").textContent=JSON.stringify({
    lang:"en",entries:[{title:"Example",kind:"article",html:"<p>Text</p>"}],
    siteTitle:"Example",showTitle:true,startDesk:false,playerTemplate:""
  });
  element("score-frame").contentWindow={postMessage(){}};
  const doc={
    body:element("body"),
    activeElement:null,
    getElementById:element,
    querySelectorAll(selector){return selector===".chapter"?element("chapters").children:[];},
    createElement(tag){return element("created-"+tag+"-"+Object.keys(elements).length);},
    addEventListener(type,listener){documentListeners[type]=listener;}
  };
  const win={addEventListener(type,listener){windowListeners[type]=listener;},getSelection(){return "";}};
  const start=js.indexOf("function siteRuntime(){");
  const end=js.indexOf("\nfunction decoratePlayerTemplate",start);
  assert.ok(start>=0&&end>start);
  const runtime=js.slice(start,end);
  const context={
    document:doc,window:win,
    location:{hash:""},history:{replaceState(){}},
    decodeURIComponent,encodeURIComponent
  };
  const {createContext}=await import("node:vm");
  new Script(runtime+";siteRuntime();").runInContext(createContext(context));

  element("focus-toggle").onclick();
  assert.ok(doc.body.classList.contains("husp-focus"));
  assert.ok(!doc.body.classList.contains("husp-controls-visible"));

  const click=element("article-view").listeners.click;
  assert.equal(typeof click,"function");
  click({detail:1,target:{closest(){return null;}}});
  assert.ok(doc.body.classList.contains("husp-controls-visible"),"Tapping an article must reveal its controls");
  click({detail:1,target:{closest(){return {tagName:"A"};}}});
  assert.ok(doc.body.classList.contains("husp-controls-visible"),"Article links must not toggle controls");
  click({detail:1,target:{closest(){return null;}}});
  assert.ok(!doc.body.classList.contains("husp-controls-visible"));

  windowListeners.message({source:element("score-frame").contentWindow,data:{type:"husp-toggle-controls"}});
  assert.ok(doc.body.classList.contains("husp-controls-visible"),"Score tap must still toggle the controls");
  element("focus-exit").onclick();
  assert.ok(!doc.body.classList.contains("husp-focus"),"A touch exit must work without Escape");
  assert.ok(!doc.body.classList.contains("husp-controls-visible"));
});

test("SitePublisher exports the source matching TiddlyWiki language for HUPedia and legacy HUWiki articles",async()=>{
  const p=await json("plugins/site-publisher/dist/plugin.json");
  const source=JSON.parse(p.text).tiddlers[p.title+"/startup.js"].text;
  const begin=source.indexOf("function articleSource(title,lang){");
  const end=source.indexOf("\nfunction embeddedArticle(",begin);
  assert.ok(begin>=0&&end>begin,"A shared article-source resolver is required");
  assert.ok(source.includes("embeddedArticle(title,opts.lang||wikiLanguage(),publicationContext)"),"HTML export must pass the selected language");
  assert.ok(source.includes("articleSource(e.title,lang)"),"The overview must use the same language as the HTML export");
  assert.ok(source.includes("articleSource(title,wikiLanguage())"),"Source-list selection must use the current wiki language");

  const seed=await json("editions/hupedia/tiddlers/seed.json");
  const article=seed.find(t=>t.title==="Carl Nielsen");
  assert.ok(article&&article["text-en"]);
  const legacy={title:"Teaching",text:"Fallback", "huwiki-text-da":"Dansk undervisning", "huwiki-text-en":"English teaching notes"};
  const plain={title:"No translation",text:"Untranslated article"};
  const records=[...seed,legacy,plain];
  const tw={wiki:{getTiddler(title){
    const fields=records.find(t=>t.title===title);
    return fields?{fields}:null;
  }}};
  const select=new Function("$tw",source.slice(begin,end)+"\nreturn articleSource;")(tw);
  assert.equal(select("Carl Nielsen","en"),article["text-en"]);
  assert.equal(select("Carl Nielsen","da"),article.text);
  assert.match(select("Carl Nielsen","en"),/!! Life and career/);
  assert.match(select("Carl Nielsen","da"),/!! Liv og karriere/);
  assert.equal(select("Teaching","en"),legacy["huwiki-text-en"]);
  assert.equal(select("Teaching","da"),legacy["huwiki-text-da"]);
  assert.equal(select("No translation","en"),plain.text,"An untranslated article must still be published");
  assert.equal(select("Missing","en"),"");
});

test("SitePublisher reuses the HUPedia article template and original styling",async()=>{
 const p=await json("plugins/site-publisher/dist/plugin.json");
 const source=JSON.parse(p.text).tiddlers[p.title+"/startup.js"].text;
 const start=source.indexOf("function isHupediaArticle(title){");
 const end=source.indexOf("function embeddedArticle(title,lang,exportContext){",start);
 assert.ok(start>=0&&end>start,"HUPedia publication helpers must exist");
 assert.ok(source.includes('renderedPedia||drawingRenderer.renderText('),"Pedia render must be preferred over bare source text");
 assert.ok(source.includes("css+=publicationComponentsCss(entries);"),"Article component CSS must be bundled into exported HTML");
 const rendered='<div class="hupedia-article"><aside class="hupedia-infobox"><h3>Carl Nielsen</h3><dl><dt>Born</dt><dd>1865</dd></dl></aside><div class="hupedia-article-text"><p>English article</p></div></div>';
 const pedia=await json("plugins/hupedia/dist/plugin.json");
 const css=JSON.parse(pedia.text).tiddlers["$:/plugins/huwiki/hupedia/style.css"].text;
 const values={
  "Carl Nielsen":{title:"Carl Nielsen",tags:["PediaArtikel","HUPedia/Person"]},
  "HUPedia Start":{title:"HUPedia Start",tags:["HUPedia/Localized"]},
  "Plain":{title:"Plain",tags:[]}
 };
 const calls=[];
 const tw={wiki:{
  getTiddler(title){return values[title]?{fields:values[title]}:null;},
  getTiddlerText(title,fallback){
   if(title==="$:/plugins/huwiki/hupedia/article-view")return "<div class='hupedia-article'></div>";
   if(title==="$:/plugins/huwiki/hupedia/style.css")return css;
   return fallback;
  },
  renderTiddler(outputType,title,options){
   calls.push({outputType,title,options});
   return rendered;
  }
 }};
 const helpers=new Function("$tw","namesOf",source.slice(start,end)+"\nreturn {isHupediaArticle,hupediaArticleHtml,publicationComponentsCss};")(tw,x=>x);
 assert.equal(helpers.isHupediaArticle("Carl Nielsen"),true);
 assert.equal(helpers.isHupediaArticle("HUPedia Start"),false,"Static guide tiddlers should not acquire an infobox");
 assert.equal(helpers.isHupediaArticle("Plain"),false);
 assert.equal(helpers.hupediaArticleHtml("Carl Nielsen"),rendered);
 assert.equal(calls[0].title,"$:/plugins/huwiki/hupedia/article-view");
 assert.equal(calls[0].options.variables.currentTiddler,"Carl Nielsen");
 assert.match(helpers.publicationComponentsCss([{title:"Carl Nielsen"}]),/\.hupedia-infobox/);
 assert.equal(helpers.publicationComponentsCss([{title:"Plain"}]),"");
 assert.equal(helpers.hupediaArticleHtml("Plain"),"");
 tw.wiki.renderTiddler=()=>"<div>No infobox</div>";
 assert.throws(()=>helpers.hupediaArticleHtml("Carl Nielsen"),/infobox was not rendered/,"Never silently drop an infobox");
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
