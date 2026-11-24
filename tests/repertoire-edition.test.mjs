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

test('The whole repertoire is a live reading collection without storing another setlist',()=>{
 const {wiki,model,Tiddler}=makeWiki();
 const orchestra=model.orchestra(wiki,'Silba Ätno');
 for(const title of ['Tune B','Tune A']){model.addPiece(wiki,title);model.addItem(wiki,orchestra,title);}
 const set=model.createSetlist(wiki,orchestra,'Koncert');model.addEntry(wiki,set,model.items(wiki,orchestra)[0].fields.title);
 const before=JSON.stringify(wiki.allTitles().map(t=>wiki.getTiddler(t).fields));
 assert.equal(model.collection(wiki,orchestra).fields.name,'Hele repertoiret');
 assert.equal(model.collections(wiki).length,2);
 assert.equal(model.entries(wiki,orchestra).length,2);assert.equal(model.entries(wiki,set).length,1);
 assert.equal(JSON.stringify(wiki.allTitles().map(t=>wiki.getTiddler(t).fields)),before);
});

test("Repertoire installs its shared ABC print engine automatically",async()=>{
 assert.equal(pkg.title,"$:/plugins/huwiki/repertoire");
 assert.equal(pkg.version,JSON.parse(await readFile(new URL("../plugins/repertoire/plugin-info.json",import.meta.url),"utf8")).version);
 assert.equal(pkg["plugin-type"],"plugin");
 assert.equal(pkg.dependents,"$:/plugins/huwiki/abc");
 assert.equal(tiddlers["$:/plugins/huwiki/repertoire/widget.js"]["module-type"],"widget");
 assert.match(tiddlers["HUWiki Repertoire – Start"].text,/<\$huwiki-repertoire\/>/);
});

test("Setlist score changes notes, chords, key and tempo without changing original score",async()=>{
 const module={};let shifts=[];
 runInNewContext(tiddlers["$:/plugins/huwiki/repertoire/live-score.js"].text,{
  exports:module,require(name){
   assert.ok(name.endsWith("/transpose.js"));
   return {apply(_ABC,abc,steps){shifts.push(steps);return abc.replace("K:Gm","K:Dm").replace("G2 A2","D2 E2");}};
  }
 });
 const abc="X:1\nT:Test\nM:2/4\nL:1/8\nQ:1/4=100\nK:Gm\nG2 A2 |";
 const effective=module.apply({},abc,{key:"Dm",tempo:"1/4=118"});
 assert.equal(shifts[0],-5,"Gm -> Dm is five semitones down");
 assert.match(effective.source,/^K:Dm$/m);
 assert.match(effective.source,/^Q:1\/4=118$/m);
 assert.match(effective.source,/D2 E2/);
 assert.match(abc,/^K:Gm$/m);
 assert.match(abc,/^Q:1\/4=100$/m);
 assert.equal(module.stepsBetween("F","Dm"),0,"relative major and minor share a key signature");
 assert.equal(module.stepsBetween("Ab","Fm"),0,"Ab and Fm share the same signature");
 assert.equal(module.stepsBetween("F","Gm"),5);
 const modal=module.apply({},abc.replace("K:Gm","K:F"),{key:"Dm",tempo:"1/4=100"});
 assert.equal(modal.transposed,false);
 assert.match(modal.source,/^K:Dm$/m);
 const unaltered=module.apply({},abc,{key:"Gm",tempo:"1/4=100"});
 assert.equal(unaltered.source,abc);
 const book=tiddlers["$:/plugins/huwiki/repertoire/book-widget.js"].text;
 assert.ok(book.includes("_repertoireScore=function"));
 assert.ok(book.includes("LiveScore.apply(ABC,abcSource,agreement)"));
 assert.doesNotMatch(book,/Bemærk: Den aftalte toneart/);
 const score=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
 assert.ok(score.includes("self._repertoireScore(ABC,current)"));
 assert.ok(score.includes("self._repertoireScore(ABC,raw)"));
 assert.ok(score.includes("visual=drawScore(working,score)"));
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

test("ABC K and Q headers seed the fields without mutating the original score",()=>{
 const {model,wiki,Tiddler}=makeWiki();
 const source=new Tiddler({title:"Hjemlig vals","abc-source":"X:1\nT:Hjemlig vals\nM:2/2\nQ:1/2=70\nK:Gm\nG A |"});
 wiki.addTiddler(source);
 const orch=model.orchestra(wiki,"Prøveorkester"),item=model.addItem(wiki,orch,source.fields.title).title;
 const rehearsal=model.createSetlist(wiki,orch,"Øve"),concert=model.createSetlist(wiki,orch,"Koncert");
 model.addEntry(wiki,rehearsal,item);model.addEntry(wiki,concert,item);
 assert.deepEqual({...model.sourceAgreement(wiki,item)},{key:"Gm",tempo:"1/2=70"});
 assert.equal(model.effective(wiki,rehearsal,item).key,"Gm");
 assert.equal(model.effective(wiki,rehearsal,item).tempo,"1/2=70");
 model.saveArrangement(wiki,item,rehearsal,{key:"Dm",tempo:"1/2=84",form:"AABB"},"setlist");
 assert.equal(model.effective(wiki,rehearsal,item).key,"Dm");
 assert.equal(model.effective(wiki,rehearsal,item).tempo,"1/2=84");
 assert.equal(model.effective(wiki,concert,item).key,"Gm");
 assert.equal(model.effective(wiki,concert,item).tempo,"1/2=70");
 assert.equal(wiki.getTiddler(source.fields.title),source);
 model.saveArrangement(wiki,item,rehearsal,{key:"Gm",tempo:"1/2=70",form:""},"setlist");
 assert.equal(JSON.parse(wiki.getTiddler(rehearsal).fields["repertoire-overrides"])[item],undefined);
 model.saveArrangement(wiki,item,"",{key:"Fm",tempo:"1/2=90"},"orchestra");
 assert.equal(model.effective(wiki,rehearsal,item).key,"Fm");
 assert.equal(model.effective(wiki,concert,item).tempo,"1/2=90");
 assert.equal(model.sourceAgreement(wiki,item).key,"Gm");
 assert.equal(wiki.getTiddler(source.fields.title),source);
});

test("SilbaÄtno score headers preserve relative minor vs key signatures and tempo beat values",async()=>{
 const scores=JSON.parse(await readFile(path.join(root,"editions/silba-atno-repertoire/tiddlers/repertoire.json"),"utf8"));
 const {model,wiki,Tiddler}=makeWiki(),orch=model.orchestra(wiki,"SilbaÄtno");
 const pick=title=>scores.find(x=>x.title.includes(title));
 const samples=[pick("Brudmarch från Jämtland"),pick("Ålidhems höjder"),pick("Cupria Express")];
 const items=samples.map(song=>{wiki.addTiddler(new Tiddler(song));return model.addItem(wiki,orch,song.title).title;});
 assert.deepEqual({...model.sourceAgreement(wiki,items[0])},{key:"Gm",tempo:"1/4=100"});
 assert.deepEqual({...model.sourceAgreement(wiki,items[1])},{key:"Gm",tempo:"1/2=70"});
 assert.deepEqual({...model.sourceAgreement(wiki,items[2])},{key:"Fm",tempo:"1/4=100"});
});

test("Repertoire sorting supports pointer and keyboard with TiddlyWiki drag-highlight classes",()=>{
 const reorderTiddler=tiddlers["$:/plugins/huwiki/repertoire/reorder.js"];
 assert.ok(reorderTiddler,"Repertoire drag implementation must be packaged");
 const exports={};runInNewContext(reorderTiddler.text,{exports});
 const move=exports.move;
 assert.deepEqual([...move(["a","b","c","d"],0,4)],["b","c","d","a"]);
 assert.deepEqual([...move(["a","b","c","d"],3,1)],["a","d","b","c"]);
 assert.deepEqual([...move(["a","b","c","d"],1,2)],["a","b","c","d"]);
 const widget=tiddlers["$:/plugins/huwiki/repertoire/widget.js"].text;
 const css=tiddlers["$:/plugins/huwiki/repertoire/styles.css"].text;
 assert.match(widget,/Reorder\.mount\(order,list/);
 assert.match(widget,/model\.sourceAgreement\(wiki,this\.activeItem\)/);
 assert.match(widget,/tempoForSave\(tempo\.input\.value,beat,effective\.tempo\)/);
 assert.match(widget,/keyField\(doc,effective\.key\)/);
 assert.match(css,/\.huwrep-order-row\.tc-dragover/);
 assert.match(css,/\.huwrep-order-handle\{touch-action:none/);
 assert.match(reorderTiddler.text,/pointercancel/);
 assert.match(reorderTiddler.text,/ArrowDown/);
 assert.ok(!reorderTiddler.text.includes("win.scrollBy"),"never scroll the whole StoryView");
 assert.ok(reorderTiddler.text.includes("order.scrollTop=before+delta"),"edge scroll belongs to local list");
 assert.ok(css.includes("overscroll-behavior:contain"),"setlist stops scroll chaining");
 assert.ok(css.includes("overflow-anchor:none"),"drag keeps the local scroll position");
 assert.ok(widget.includes("order.appendChild(row)"),"move existing rows, do not reconstruct story DOM");
 assert.match(widget,/_ownReorder/,"local list updates do not trigger a story rebuild");
 assert.doesNotMatch(widget,/button\(doc,"↑"/);
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
 assert.equal(model.effective(wiki,setTwo,a).key,"Gm","other setlist uses original ABC K");
 assert.equal(model.effective(wiki,setTwo,a).instrumentation,"");
 model.saveArrangement(wiki,b,"",{key:"Gm",tempo:"120",form:"Orkester B"},"orchestra");
 assert.equal(model.effective(wiki,"",b).key,"Gm");
 assert.equal(model.effective(wiki,setTwo,a).key,"Gm");
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

test("SilbaÄtno importer keeps technical conversion diagnostics in the report, not the score article",async()=>{
 const base=path.join(root,"editions/silba-atno-repertoire");
 const scores=JSON.parse(await readFile(path.join(base,"tiddlers/repertoire.json"),"utf8"));
 const report=JSON.parse(await readFile(path.join(base,"conversion-report.json"),"utf8"));
 const converter=await readFile(path.join(root,"scripts/build-silba-etno-repertoire.mjs"),"utf8");
 assert.equal(scores.length,17);
 assert.equal(report.entries.length,17);
 assert.ok(scores.every(song=>song.text===""&&song["abc-source"]&&song["huwiki-import-source"]));
 assert.ok(report.entries.every(entry=>typeof entry.duplicateRemoved==="boolean"&&Array.isArray(entry.warnings)));
 const example=report.entries.find(entry=>entry.source==="laat-fraan-dalarna-cbb.mscz");
 assert.ok(example&&example.duplicateRemoved,"Original duplicate-removal information is preserved");
 assert.ok(converter.includes('"text":""'),"Rebuild must not recreate technical prose");
 assert.doesNotMatch(converter,/var statusNote=/);
});

test("SilbaÄtno Edition links all 17 scores and leaves their ABC bodies untouched",async()=>{
 const folder=path.join(root,"editions/silba-atno-repertoire");
 const manifest=JSON.parse(await readFile(path.join(folder,"manifest.json"),"utf8"));
 const sources=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire.json"),"utf8"));
 const workspace=JSON.parse(await readFile(path.join(folder,"tiddlers/repertoire-workspace.json"),"utf8"));
 assert.ok(manifest.plugins.includes("../../plugins/repertoire/dist/plugin.json"));
 assert.ok(manifest.tiddlers.includes("tiddlers/repertoire-workspace.json"));
 assert.equal(sources.length,17);
 const records=workspace.filter(t=>t["repertoire-kind"]==="orchestra-item");
 assert.equal(records.length,18);
 const expectedTitles=sources.map(t=>t.title);
 expectedTitles.splice(4,0,"SilbaÄtno · Oh verden");
 assert.deepEqual(records.map(t=>t["music-title"]),expectedTitles);
 assert.ok(workspace.every(t=>!Object.hasOwn(t,"abc-source")));
 const set=workspace.find(t=>t["repertoire-kind"]==="setlist");
 const orch=workspace.find(t=>t["repertoire-kind"]==="orchestra");
 assert.ok(orch&&set);
 assert.equal((set.list.match(/\[\[/g)||[]).length,18);
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
 const file=JSON.parse(await readFile(path.join(root,"editions/silba-atno-repertoire/manifest.json"),"utf8"));
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
test("SilbaÄtno heading and icon actions respond to the actual wiki article width",async()=>{
 const config=JSON.parse(await readFile(path.join(root,"editions/silba-atno-repertoire/tiddlers/config.json"),"utf8"));
 const home=config.find(x=>x.title==="SilbaÄtno Repertoire – Oversigt");
 const sheet=config.find(x=>x.title==="$:/silbaatno/repertoire/home.css");
 assert.ok(home&&sheet);
 assert.match(sheet.text,/container-name:silba-copy/,"heading uses its own content width, not viewport units");
 assert.match(sheet.text,/font-size:clamp\(1\.45rem,16cqi,4\.9rem\)/);
 assert.match(sheet.text,/white-space:nowrap/);
 assert.match(sheet.text,/@container silba-home \(max-width:690px\)/,
  "hero should stack when the wiki story gets narrow, regardless of viewport");
 assert.match(sheet.text,/\.silba-photo-visual \{width:100%;height:100%;[^\n]*background-position:center;background-size:cover;/,
  "The wide hero keeps the photo centered");
 assert.equal((sheet.text.match(/\.silba-photo-visual \{min-height:190px;max-height:(?:300|260)px;background-position:center top;\}/g)||[]).length,2,
  "Both a narrow article and a narrow browser prioritize the faces at the top");
 assert.equal((home.text.match(/class="silba-(?:primary|secondary) silba-action"/g)||[]).length,4);
 assert.equal((home.text.match(/class="silba-action-label"/g)||[]).length,4);
 assert.equal((home.text.match(/<svg viewBox=/g)||[]).length,4);
});

test("SilbaÄtno homepage links straight to the setlist book",async()=>{
 const config=JSON.parse(await readFile(path.join(root,"editions/silba-atno-repertoire/tiddlers/config.json"),"utf8"));
 const home=config.find(x=>x.title==="SilbaÄtno Repertoire – Oversigt");
 assert.ok(home);
 assert.match(home.text,/<\$link to="Repertoire – Nodebog" class="silba-primary silba-action" tooltip="Åbn nodebogen">/);
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


test("SilbaÄtno statistic cards open auto-generated native TiddlyWiki lists",async()=>{
 const base=path.join(root,"editions/silba-atno-repertoire");
 const config=JSON.parse(await readFile(path.join(base,"tiddlers/config.json"),"utf8"));
 const manifest=JSON.parse(await readFile(path.join(base,"manifest.json"),"utf8"));
 const scores=JSON.parse(await readFile(path.join(base,"tiddlers/repertoire.json"),"utf8"));
 const pending=JSON.parse(await readFile(path.join(base,"tiddlers/pending.json"),"utf8"));
 const home=config.find(t=>t.title==="SilbaÄtno Repertoire – Oversigt");
 const template=config.find(t=>t.title==="$:/silbaatno/repertoire/list-row");
 assert.ok(home&&template);
 assert.ok(manifest.tiddlers.includes("tiddlers/pending.json"));
 assert.equal(scores.length,17);
 assert.equal(pending.length,4);
 const titles=[...scores,...pending].map(t=>t.title);
 assert.equal(new Set(titles).size,21,"No duplicate tiddlers in assembled edition");
 assert.equal(scores.filter(t=>t["silba-section"]==="hovedliste").length,13);
 assert.equal(pending.filter(t=>t["silba-section"]==="hovedliste").length,1);
 assert.equal(pending.filter(t=>t["silba-section"]==="usikre").length,1);
 assert.equal(pending.filter(t=>t["silba-section"]==="ude").length,2);
 assert.ok(pending.every(t=>t.tags.includes("SilbaÄtnoTrack")));
 assert.equal(pending.filter(t=>!!t["abc-source"]).length,1);
 assert.equal(pending.filter(t=>!t["abc-source"]).length,3);
 for(const title of ["SilbaÄtno – Nodeark","SilbaÄtno – Hovedliste","SilbaÄtno – Bruttoliste"]){
  assert.match(home.text,new RegExp('to="'+title+'".*class="silba-metric"'));
  const page=config.find(t=>t.title===title);
  assert.ok(page,"Missing clickable destination: "+title);
  assert.ok(page.text.includes("<$list filter="));
  assert.ok(page.text.includes('template="$:/silbaatno/repertoire/list-row"'));
 }
 assert.equal((home.text.match(/class="silba-metric"/g)||[]).length,3);
 assert.ok(home.text.includes("<$count filter="));
 assert.equal((home.text.match(/class="silba-track-list"/g)||[]).length,3);
 assert.doesNotMatch(home.text,/<li>/,"Homepage lists must be data-driven rather than hardcoded");
 assert.ok(template.text.includes("removeprefix[SilbaÄtno · "));
 assert.match(template.text,/Afventer nodeark/);
});


test("SitePublisher uses a generated 17-title list, independently of the gross-list dashboard",async()=>{
 const base=path.join(root,"editions/silba-atno-repertoire");
 const listFile=JSON.parse(await readFile(path.join(base,"tiddlers/site-export-list.json"),"utf8"));
 const manifest=JSON.parse(await readFile(path.join(base,"manifest.json"),"utf8"));
 const scores=JSON.parse(await readFile(path.join(base,"tiddlers/repertoire.json"),"utf8"));
 const publisher=await readFile(path.join(root,"scripts/publish-silba-etno-site.mjs"),"utf8");
 assert.ok(manifest.tiddlers.includes("tiddlers/site-export-list.json"));
 assert.equal(listFile.length,1);
 assert.equal(listFile[0].title,"SilbaÄtno – Site-eksport (nodeark)");
 const listed=listFile[0].list.slice(2,-2).split("]] [[");
 assert.deepEqual(listed,scores.map(score=>score.title));
 assert.ok(publisher.includes('box.value='+JSON.stringify("SilbaÄtno – Site-eksport (nodeark)")+';'));
 assert.ok(publisher.includes('if(rows!==21)'));
});


test("Oh verden is a playable slow 4/4 Balkan ABC chord chart, not a WikiText code block",async()=>{
 const base=path.join(root,"editions/silba-atno-repertoire/tiddlers");
 const source=JSON.parse(await readFile(path.join(base,"songs.json"),"utf8")).find(t=>t.title==="SilbaÄtno · Oh verden");
 const sheet=JSON.parse(await readFile(path.join(base,"pending.json"),"utf8")).find(t=>t.title==="SilbaÄtno · Oh verden");
 const item=JSON.parse(await readFile(path.join(base,"repertoire-workspace.json"),"utf8"))
  .find(t=>t["repertoire-kind"]==="orchestra-item"&&t["music-title"]===sheet?.title);
 assert.ok(source&&sheet&&item);
 assert.equal(source["abc-source"],sheet["abc-source"]);
 assert.equal(sheet["repertoire-sheet-format"],"chords");
 assert.equal(sheet["abc-view"],"chords");
 assert.equal(sheet["abc-chords-overview"],"yes");
 assert.equal(sheet["abc-double-time-section"],"B");
 assert.equal(sheet["abc-bars-per-line"],"4");
 assert.equal(source["abc-bars-per-line"],"4");
 assert.ok(sheet.tags.split(" ").includes("ABC"));
 assert.ok(sheet["abc-source"].includes("M:4/4"));
 assert.ok(sheet["abc-source"].includes("Q:1/4=66"));
 assert.ok(sheet["abc-source"].includes('|: "E7"z4 | "A7"z4 | "Dm"z4 | "E7"z4 :|'));
 assert.ok(sheet["abc-source"].includes('|: "E7"z2 "Am"z2 | "E7"z2 "Dm"z2 | "E7"z2 "Dm"z2 | "E7"z2 "Am"z2 :|'));
 assert.ok(!sheet["abc-source"].includes("[1")&&!sheet["abc-source"].includes("[2"));
 assert.match(sheet.text,/B-stykket spilles med dobbelt rytmisk puls/);
 assert.match(sheet.text,/endnu ikke verificeret/);
 const a=JSON.parse(sheet["abc-accompaniment"]);
 assert.equal(a.style,"balkan-44");assert.equal(a.enabled,true);assert.equal(a.metronome,false);
 assert.equal(item["repertoire-cues"],"Steen spiller melodien solo på harmonika.");
 const book=await readFile(path.join(root,"plugins/repertoire/src/book-widget.js"),"utf8");
 assert.ok(book.includes('value:f["repertoire-sheet-format"]==="chords"?"chords":"full"'));
 const style=await readFile(path.join(root,"plugins/abc/src/meter-arranger.js"),"utf8");
 assert.ok(style.includes("'balkan-44'"));
 assert.ok(style.includes("bassTicks=[0,2];roles=[0,7];compTicks=[1,3]"));
});
