import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(import.meta.dirname,"..");
const pkg=JSON.parse(await readFile(path.join(root,"plugins/repertoire/dist/plugin.json"),"utf8"));
const tiddlers=JSON.parse(pkg.text).tiddlers;

function makeWiki(){
 const data=new Map();
 class Tiddler{
  constructor(...fields){this.fields=Object.assign({},...fields.map(v=>v instanceof Tiddler?v.fields:v));this.title=this.fields.title;this.tags=this.fields.tags||[];}
 }
 const $tw={Tiddler,utils:{stringifyList(list){return list.map(x=>/\s/.test(x)?"[["+x+"]]":x).join(" ");}}};
 const wiki={
  allTitles(){return [...data.keys()];},
  getTiddler(title){return data.get(title);},
  tiddlerExists(title){return data.has(title);},
  getCreationFields(){return {};},
  addTiddler(t){data.set(t.fields.title,t);},
  getTiddlerList(title,field){return Array.from(String(data.get(title)?.fields[field]||"").matchAll(/\[\[([\s\S]*?)\]\]|([^\s]+)/g),m=>m[1]||m[2]);}
 };
 const context={exports:{},$tw};
 runInNewContext(tiddlers["$:/plugins/huwiki/repertoire/model.js"].text,context);
 return {model:context.exports,wiki,Tiddler};
}

test("Repertoire package is independent of the ABC plugin",()=>{
 assert.equal(pkg.title,"$:/plugins/huwiki/repertoire");
 assert.equal(pkg.version,"0.1.4-beta.3");
 assert.equal(pkg["plugin-type"],"plugin");
 assert.equal(pkg.dependents,undefined);
 assert.equal(tiddlers["$:/plugins/huwiki/repertoire/widget.js"]["module-type"],"widget");
 assert.match(tiddlers["HUWiki Repertoire – Start"].text,/<\$huwiki-repertoire\/>/);
});

test("Repertoire uses a responsive three-column, tap-to-toggle selection grid",()=>{
 const widget=tiddlers["$:/plugins/huwiki/repertoire/widget.js"].text;
 const css=tiddlers["$:/plugins/huwiki/repertoire/styles.css"].text;
 assert.ok(widget.includes("huwrep-song-grid"));
 assert.ok(widget.includes("huwrep-song-card"));
 assert.ok(widget.includes('tile.setAttribute("aria-pressed"'));
 assert.ok(widget.includes("model.addEntry(wiki,setTitle,id)"));
 assert.ok(widget.includes("model.setEntries(wiki,setTitle,current.filter"));
 assert.ok(!widget.includes('button(doc,"Tilføj til sætliste"'));
 assert.ok(css.includes("grid-template-columns:repeat(3,minmax(0,1fr))"));
 assert.ok(css.includes("@container (max-width:720px)"));
 assert.ok(css.includes("@container (max-width:450px)"));
});

test("multiple orchestras share one original score but keep their own agreements",()=>{
 const {model,wiki,Tiddler}=makeWiki();
 const original=new Tiddler({title:"SilbaÄtno · Brudmarch från Jämtland","abc-source":"K:Gm",text:"Original"});
 wiki.addTiddler(original);
 const orchestraA=model.orchestra(wiki,"SilbaÄtno"),orchestraB=model.orchestra(wiki,"Helles orkester");
 const imported=model.importTitles(wiki,orchestraA,"1. SilbaÄtno · Brudmarch från Jämtland\n• Testmelodi\nTestmelodi");
 assert.equal(imported.titles,2);
 assert.equal(imported.createdPieces,1);
 assert.equal(wiki.getTiddler(original.fields.title),original,"source score not overwritten");
 const a=model.addItem(wiki,orchestraA,original.fields.title).title;
 const b=model.addItem(wiki,orchestraB,original.fields.title).title;
 assert.notEqual(a,b);
 assert.equal(wiki.getTiddler(a).fields["abc-source"],undefined,"post does not copy notation");
 const setOne=model.createSetlist(wiki,orchestraA,"Øve");
 const setTwo=model.createSetlist(wiki,orchestraA,"Koncert");
 model.addEntry(wiki,setOne,a);model.addEntry(wiki,setOne,a);model.addEntry(wiki,setTwo,a);
 assert.equal(model.entries(wiki,setOne).length,1,"same song appears once within a setlist");
 model.saveArrangement(wiki,a,setOne,{key:"Dm",tempo:"95",form:"Intro 4 takter",instrumentation:"Fløjte på A, bas på B",cues:"Tegn til sidste A"},"setlist");
 assert.equal(model.effective(wiki,setOne,a).key,"Dm");
 assert.equal(model.effective(wiki,setOne,a).instrumentation,"Fløjte på A, bas på B");
 assert.equal(model.effective(wiki,setOne,a).cues,"Tegn til sidste A");
 assert.equal(model.effective(wiki,setTwo,a).key,"","other setlist must retain default");
 assert.equal(model.effective(wiki,setTwo,a).instrumentation,"");
 model.saveArrangement(wiki,b,"",{key:"Gm",tempo:"120",form:"Orkester B"},"orchestra");
 assert.equal(model.effective(wiki,"",b).key,"Gm");
 assert.equal(model.effective(wiki,setTwo,a).key,"");
});

test("reordering does not mutate the orchestra repertoire",()=>{
 const {model,wiki}=makeWiki();
 const orch=model.orchestra(wiki,"Et orkester");
 model.importTitles(wiki,orch,"Første\nAnden\nTredje");
 const items=model.items(wiki,orch);
 const set=model.createSetlist(wiki,orch,"Koncert");
 model.setEntries(wiki,set,items.map(t=>t.fields.title));
 const before=model.entries(wiki,set);
 model.setEntries(wiki,set,[before[2],before[0],before[1],before[2]]);
 const after=model.entries(wiki,set);
 assert.equal(after.length,3);
 assert.equal(after[0],before[2]);
 assert.equal(model.items(wiki,orch).length,3);
});

test("SilbaÄtno Edition links all 17 scores and leaves their ABC bodies untouched",async()=>{
 const folder=path.join(root,"editions/silva-ethno-repertoire");
 const manifest=JSON.parse(await readFile(path.join(folder,"manifest.json"),"utf8"));
 const sources=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire.json"),"utf8"));
 const workspace=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire-workspace.json"),"utf8"));
 assert.ok(manifest.plugins.includes("../../plugins/repertoire/dist/plugin.json"));
 assert.ok(manifest.tiddlers.includes("tiddlers/repertoire-workspace.json"));
 assert.equal(sources.length,17);
 const records=workspace.filter(t=>t["repertoire-kind"]==="orchestra-item");
 assert.equal(records.length,17);
 assert.deepEqual(records.map(t=>t["music-title"]),sources.map(t=>t.title));
 assert.ok(workspace.every(t=>!Object.hasOwn(t,"abc-source")));
 const set=workspace.find(t=>t["repertoire-kind"]==="setlist");
 const orch=workspace.find(t=>t["repertoire-kind"]==="orchestra");
 assert.ok(orch&&set);
 assert.equal((set.list.match(/\[\[/g)||[]).length,17);
 for(const r of records)assert.ok(set.list.includes("[["+r.title+"]]"));
});

test("Repertoire Nodebog ships its live reader and link in the workshop",()=>{
 const book=tiddlers["$:/plugins/huwiki/repertoire/book-widget.js"];
 const layout=tiddlers["$:/plugins/huwiki/repertoire/book-layout.js"];
 assert.equal(book["module-type"],"widget");
 assert.equal(layout["module-type"],"library");
 assert.ok(tiddlers["Repertoire – Nodebog"].text.includes("<$huwiki-repertoire-book"));
 assert.match(tiddlers["$:/plugins/huwiki/repertoire/widget.js"].text,/Åbn nodebogen/);
 assert.ok(book.text.includes(".huwabc-page-select"));
 assert.match(book.text,/huwrep-book-fullscreen/);
 assert.match(book.text,/huwabc-reader-boundary/,"the reader arrows must cross song boundaries");
 assert.match(book.text,/this\._readerCarry/,"the immersive view must remain open across tunes");
 assert.match(book.text,/this\.disposeScore\(\);host\.textContent="";/,"destroy the previous score before loading another");
 assert.match(tiddlers["$:/plugins/huwiki/repertoire/styles.css"].text,/huwrep-book-fullscreen/);
});

test("Nodebogen adapts page pairs to iPad rotation and crosses song boundaries",()=>{
 const source=tiddlers["$:/plugins/huwiki/repertoire/book-layout.js"].text;
 const exports={};runInNewContext(source,{exports});
 const b=exports;
 assert.equal(b.mode("auto",820,1180),"single");
 assert.equal(b.mode("auto",1180,820),"spread");
 assert.equal(b.mode("single",1180,820),"single");
 assert.equal(b.mode("spread",820,1180),"spread");
 assert.deepEqual({...b.direction(1,3,1,1,0,17)},{kind:"page",delta:1});
 assert.deepEqual({...b.direction(1,3,2,1,0,17)},{kind:"page",delta:1});
 assert.deepEqual({...b.direction(3,3,2,1,0,17)},{kind:"song",index:1});
 assert.deepEqual({...b.direction(1,3,1,-1,3,17)},{kind:"song",index:2,lastPage:true});
 assert.equal(b.direction(3,3,1,1,16,17).kind,"end");
 assert.equal(b.direction(1,3,1,-1,0,17).kind,"start");
 assert.equal(b.direction(1,0,1,1,0,17).kind,"unready");
});

test("The built SilbaÄtno manifest retains all 17 scores and Repertoire Nodebog plugin",async()=>{
 const file=JSON.parse(await readFile(path.join(root,"editions/silva-ethno-repertoire/manifest.json"),"utf8"));
 assert.ok(file.plugins.includes("../../plugins/repertoire/dist/plugin.json"));
 assert.equal(file.tiddlers.filter(x=>x==="tiddlers/repertoire-workspace.json").length,1);
});

test("Music Minus One uses the ABC mixer as a temporary overlay without rewriting score data",()=>{
 const key="$:/plugins/huwiki/repertoire/practice.js";
 assert.ok(tiddlers[key],"Music Minus One library must be packaged");
 const module={};runInNewContext(tiddlers[key].text,{exports:module});
 const base={metronome:false,backingModes:{metronome:"mute",bass:"normal"},
  voiceSettings:{"0":{mode:"solo",volume:75},"1":{mode:"normal",volume:90}}};
 const original=JSON.stringify(base);
 const one=module.overlay(base,{enabled:true,metronome:true,voice:"1"});
 assert.equal(one.metronome,true);
 assert.equal(one.backingModes.metronome,"normal");
 assert.equal(one.voiceSettings["1"].mode,"mute");
 assert.equal(module.isAudible(base,{enabled:true,metronome:true,voice:"1"},1),false);
 assert.equal(module.isAudible(base,{enabled:true,metronome:true,voice:"1"},0),true);
 assert.equal(one.voiceSettings["0"].mode,"solo");
 assert.equal(JSON.stringify(base),original,"base orchestral arrangement must remain untouched");
 assert.equal(JSON.stringify(module.overlay(base,{enabled:false,metronome:true,voice:"1"})),original,
  "exiting practice must restore the original mixer");
 const book=tiddlers["$:/plugins/huwiki/repertoire/book-widget.js"].text;
 assert.match(book,/control\.setConfig\(next,false\)/,"practice settings may not persist into ABC score");
 assert.match(book,/\.huwabc-voice-row\[data-voice-index\]/,"reuse actual ABC written voice labels");
 assert.match(book,/Music Minus One/);
 assert.match(book,/huwrep-book-list-search/,"song picker must be searchable");
 assert.doesNotMatch(book,/listBox\.open=false/,"no long unfolding button grid");
});
test("SilbaÄtno homepage links straight to the setlist book",async()=>{
 const config=JSON.parse(await readFile(path.join(root,"editions/silva-ethno-repertoire/tiddlers/config.json"),"utf8"));
 const home=config.find(x=>x.title==="SilbaÄtno Repertoire – Oversigt");
 assert.ok(home);
 assert.match(home.text,/<\$link to="Repertoire – Nodebog" class="silba-primary">Åbn nodebogen<\/\$link>/);
});

test("Nodebog prints PDF scores and cues with hidden-safe editor state",()=>{
 const printing=tiddlers["$:/plugins/huwiki/repertoire/print.js"];
 assert.equal(printing["module-type"],"library");
 assert.match(printing.text,/tm-huwiki-print-article/);
 assert.match(printing.text,/tm-huwiki-sitepublisher/);
 assert.doesNotMatch(printing.text,/window\.open|owner\.open|win\.print/);
 assert.match(tiddlers["$:/plugins/huwiki/repertoire/book-widget.js"].text,/Hele nodebogen med noder/);
 assert.match(tiddlers["$:/plugins/huwiki/repertoire/widget.js"].text,/Instrumentering: hvem spiller hvad/);
 assert.match(tiddlers["$:/plugins/huwiki/repertoire/styles.css"].text,/\.huwrep-book\[hidden\]\{display:none!important\}/);
});

test("Repertoire Publisher prepares instrument-specific collections without replacing concert scores",()=>{
 const {model,wiki,Tiddler}=makeWiki(),source=new Tiddler({title:"Melodi","abc-source":"X:1\nT:Melodi\nK:Gm\nG A|",text:"Original"});
 wiki.addTiddler(source);wiki.addTiddler(new Tiddler({title:"$:/plugins/huwiki/print-article"}));wiki.addTiddler(new Tiddler({title:"$:/plugins/huwiki/site-publisher"}));
 const orchestra=model.orchestra(wiki,"Silba"),item=model.addItem(wiki,orchestra,"Melodi").title,set=model.createSetlist(wiki,orchestra,"Aftener");model.addEntry(wiki,set,item);
 model.saveArrangement(wiki,item,set,{key:"Gm",form:"AABB",instrumentation:"Fløjte og guitar",cues:"Tegn ved coda"},"setlist");
 const printing=tiddlers["$:/plugins/huwiki/repertoire/print.js"],out={};
 runInNewContext(printing.text,{exports:out,$tw:{Tiddler,utils:{$dummy:null,stringifyList(titles){return titles.map(t=>"[[ "+t+" ]]").join(" ");}}},require(name){if(name.endsWith("/model.js"))return model;throw Error(name);}});
 const events=[],widget={dispatchEvent(e){events.push(e);}};
 const pdf=out.open(wiki,set,widget,{scores:true,instrumentId:"bb"});
 assert.equal(pdf.instrumentId,"bb");assert.equal(pdf.titles.length,2);
 assert.match(wiki.getTiddler(pdf.summary).fields.text,/Klingende toneart: Gm/);
 assert.match(wiki.getTiddler(pdf.summary).fields.text,/B♭/);
 assert.match(wiki.getTiddler(pdf.summary).fields.text,/Fløjte og guitar/);
 assert.equal(events[0].type,"tm-huwiki-print-article");
 assert.equal(events[0].paramObject.instrumentId,"bb");
 const site=out.open(wiki,set,widget,{scores:true,site:true,instrumentId:"ebalto"});
 assert.equal(site.instrumentId,"ebalto");assert.equal(events[1].type,"tm-huwiki-sitepublisher");
 assert.doesNotMatch(wiki.getTiddler(site.summary).fields.text,/altsaxofon/,"Site index should not repeat instrument already shown in the site header");
 assert.match(events[1].paramObject.siteTitle,/altsaxofon/,"The chosen instrument remains visible in the publication title");
 assert.equal(wiki.getTiddler("Melodi"),source);
});

test("Publisher setlist handoff prints the selected list, shareable PDF and correctly titled site",async()=>{
 const pdf=JSON.parse(await readFile(path.join(root,"plugins/print-article/dist/plugin.json"),"utf8"));
 const pdfJs=JSON.parse(pdf.text).tiddlers[pdf.title+"/startup.js"].text;
 assert.match(pdfJs,/listInput\.value=preset\.listTitle/,"PDF must select the actual setlist, not the summary tiddler");
 assert.match(pdfJs,/navigator\.share\(\{files:\[file\]/,"iPad must share a File, never navigate to blob");
 assert.match(pdfJs,/publicationPdfTitle\(title,orchestra\)/,"TOC labels omit orchestra prefixes");
 const site=JSON.parse(await readFile(path.join(root,"plugins/site-publisher/dist/plugin.json"),"utf8"));
 const siteJs=JSON.parse(site.text).tiddlers[site.title+"/startup.js"].text;
 assert.match(siteJs,/listInput\.value=preset\.listTitle/);
 assert.match(siteJs,/score\.instrumentId=opts\.instrumentId/,"Site should publish the requested transposed instrument");
 const source=await readFile(path.join(root,"plugins/site-publisher/src/publisher.js"),"utf8");
 assert.equal(source,siteJs,"SitePublisher source and bundled startup must remain identical");
});

test("Repertoire site generates clickable, uncluttered titles and retains arrangements without repeating instrument",()=>{
 const {model,wiki,Tiddler}=makeWiki(),source=new Tiddler({title:"SilbaÄtno · Brudmarch från Jämtland","abc-source":"X:1\nT:Brudmarch\nK:Gm\nG A|"});
 wiki.addTiddler(source);wiki.addTiddler(new Tiddler({title:"$:/plugins/huwiki/site-publisher"}));
 const orchestra=model.orchestra(wiki,"SilbaÄtno"),item=model.addItem(wiki,orchestra,source.fields.title).title,set=model.createSetlist(wiki,orchestra,"Øverepertoire");
 model.addEntry(wiki,set,item);model.saveArrangement(wiki,item,set,{key:"Gm",form:"AABB",instrumentation:"Første violin",cues:"Afslut på tegn"},"setlist");
 const module={};runInNewContext(tiddlers["$:/plugins/huwiki/repertoire/print.js"].text,{exports:module,$tw:{Tiddler,utils:{stringifyList:n=>n.map(x=>"\[\["+x+"\]\]").join(" ")}},require:()=>model});
 const events=[],result=module.open(wiki,set,{dispatchEvent(e){events.push(e);}},{site:true,scores:true,instrumentId:"c"});
 const summary=wiki.getTiddler(result.summary).fields;
 assert.match(summary.text,/\[\[1\. Brudmarch från Jämtland\|SilbaÄtno · Brudmarch från Jämtland\]\]/);
 assert.doesNotMatch(summary.text,/Nodebog til C/);
 assert.equal(summary["repertoire-publication-orchestra"],"SilbaÄtno");
 assert.equal(JSON.parse(summary["repertoire-publication-agreements"])[source.fields.title].cues,"Afslut på tegn");
 assert.equal(events[0].paramObject.repertoireOrchestra,"SilbaÄtno");
 assert.equal(wiki.getTiddler(source.fields.title),source);
});

test("PDF Publisher fills free space beneath scores and creates an overflow page when needed",async()=>{
 const pdf=JSON.parse(await readFile(path.join(root,"plugins/print-article/dist/plugin.json"),"utf8"));
 const js=JSON.parse(pdf.text).tiddlers[pdf.title+"/startup.js"].text;
 const start=js.indexOf("function wrapAgreement("),end=js.indexOf("async function renderAbcChapter(",start);
 assert.ok(start>0&&end>start,"An isolated score agreement renderer must be available");
 function element(tag){return {tag,children:[],className:"",style:{},attributes:{},
  appendChild(x){this.children.push(x);return x;},
  setAttribute(k,v){this.attributes[k]=String(v);},
  get textContent(){return this._text||"";},set textContent(v){this._text=String(v);}
 };}
 const document={createElement:element,createElementNS:(_ns,tag)=>element(tag)};
 const helpers=new Function("document",js.slice(start,end)+"\nreturn {wrapAgreement,scoreAgreementRows,attachScoreAgreements};")(document);
 function fixture(height){const added=[],staff={viewBox:{baseVal:{width:720,height}}};
  const body={style:{width:"84%"},children:added,querySelectorAll(){return [staff];},appendChild(x){added.push(x);return x;}};
  return {body,pages:[{querySelector(){return body;}}]};
 }
 const agreements={form:"AABB",instrumentation:"Violin og bas",cues:"Afslutning på tegn"};
 const short=fixture(200);
 helpers.attachScoreAgreements(short.pages,{width:210,height:297,margin:14},agreements);
 assert.equal(short.pages.length,1,"The existing page should be reused when there is space");
 assert.equal(short.body.children.length,1);
 assert.match(short.body.children[0].children[0].children.map(n=>n.textContent).join(" "),/AFTALER/);
 const long=fixture(1000);
 helpers.attachScoreAgreements(long.pages,{width:210,height:297,margin:14},agreements);
 assert.equal(long.pages.length,2,"Do not overlap music when there is no space below the last system");
 assert.equal(long.pages[1].children[0].children.length,1);
 assert.match(js,/navigator\.share\(\{files:\[file\]/,"Quine-compatible file sharing remains intact");
});
