import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";

const require=createRequire(import.meta.url);
const tw=require("tiddlywiki").TiddlyWiki();
tw.boot.argv=["--output","."];
await new Promise(resolve=>tw.boot.boot(resolve));
const Widget=tw.modules.execute("$:/core/modules/widgets/widget.js").widget;
const code=await readFile(new URL("../plugins/repertoire/src/book-widget.js",import.meta.url),"utf8");
const layoutCode=await readFile(new URL("../plugins/repertoire/src/book-layout.js",import.meta.url),"utf8");
const layout={};runInNewContext(layoutCode,{exports:layout});
const exports={};
runInNewContext(code,{exports,$tw:tw,require(name){
 if(name==="$:/core/modules/widgets/widget.js")return {widget:Widget};
 if(name.endsWith("/book-layout.js"))return layout;
 if(name.endsWith("/model.js")||name.endsWith("/practice.js")||name.endsWith("/print.js"))return {};
 if(name.endsWith("/live-score.js"))return {apply(_ABC,source){return {source};}};
 throw new Error("Unexpected module "+name);
}});
const Book=exports["huwiki-repertoire-book"];

// Exercise the real Book and TiddlyWiki event dispatch/draft lookup. Only DOM,
// score rendering/audio and the ancestor navigator's draft UI are replaced.
function fixture({readerActive=true,preexistingSource=false,createDraft=true}={}){
 const wiki=new tw.Wiki(),source="Cocek Srece",item="Repertoire/item/Cocek",setlist="Repertoire/setlist/Concert";
 const original=new tw.Tiddler({title:source,"abc-source":"X:1\nT:Cocek Srece\nK:Dm\nD E F G|",text:"Original notes"});
 wiki.addTiddler(original);
 const storyTitle="$:/temp/TestStory",story=["Nodebog"];
 if(preexistingSource)story.push(source);
 wiki.addTiddler(new tw.Tiddler({title:storyTitle,list:story}));
 const log=[],tasks=new Map();let serial=0,controllers=0,draws=0,standaloneReaders=0;
 const win={innerWidth:1180,innerHeight:820,
  setTimeout(fn){const id=++serial;tasks.set(id,fn);return id;},
  clearTimeout(id){tasks.delete(id);},removeEventListener(){},Event:class{constructor(type){this.type=type;}}};
 const addTiddler=wiki.addTiddler.bind(wiki);
 wiki.addTiddler=function(tiddler){
  const result=addTiddler(tiddler);
  if(tiddler.fields.title===storyTitle&&standaloneReaders&&!wiki.getTiddlerList(storyTitle).includes(source)){
   // Like TiddlyWiki, the store changes now but DOM disposal happens on refresh.
   win.setTimeout(()=>{standaloneReaders=0;log.push("standalone disposed");},0);
  }
  return result;
 };
 const classes=new Set(["huwrep-book-fullscreen","huwrep-reader-active"]);
 let dom="original score SVG and controls";
 const host={hidden:false,isConnected:true,
  classList:{contains(name){return classes.has(name);},remove(...names){for(const n of names)classes.delete(n);},toggle(name,yes){if(yes)classes.add(name);else classes.delete(name);}},
  get textContent(){return dom;},set textContent(value){dom=value;log.push("dom:"+value);},
  removeEventListener(){}};
 const parent=new Widget({type:"widget",attributes:{}},{wiki,document:{}});
 parent.setVariable("tv-story-list",storyTitle);
 const book=new Book({type:"huwiki-repertoire-book",attributes:{}},{wiki,parentWidget:parent,document:{}});
 Object.assign(book,{host,_win:win,activeItem:item,setlistTitle:setlist,preference:"auto",children:[]});
 book.addEventListener("tm-edit-tiddler","handleEditTiddler");
 const reader={active:readerActive,mode:"vis",fitMode:"width",controlsOpen:true};
 const pageCalls=[];
 function score(state=reader,count=4){
  controllers++;
  let alive=true;
  const selector={value:"spread",dispatchEvent(){}};
  const pager={element:{isConnected:true,querySelector(){return selector;}},count,
   anchor(){return {event:27,page:2};},info(){return {count:this.count,page:1};},
   revealOrdinal(n,scroll){pageCalls.push(["event",n,scroll]);return n===27;},
   go(n,manual){pageCalls.push(["page",n,manual]);return true;}};
  return {title:source,_reader:{snapshot(){return {...state};}},_pager:pager,
   onDestroy(){if(alive){alive=false;controllers--;log.push("score disposed");}}};
 }
 book._score=score();book.children=[book._score];
 book._observer={disconnect(){log.push("observer disconnected");}};
 book.draw=function(){
  if(!preexistingSource)assert.equal(standaloneReaders,0,"dispose temporary standalone score before returning");
  draws++;log.push("book restored");host.textContent="restored score";
  this._score=score(this._readerCarry,0);this.children=[this._score];
  this.updateMode();
 };
 const forwarded=[];
 parent.addEventListener("tm-edit-tiddler",event=>{
  forwarded.push(event);
  assert.equal(controllers,0,"old audio must be released before the navigator opens a draft");
  assert.equal(host.textContent,"","old score DOM must be released before draft render");
  assert.equal(book._score,null);
  assert.equal(host.hidden,true);
  assert.equal(classes.has("huwrep-book-fullscreen"),false);
  // A refresh triggered by the preceding temporary focus write is harmless.
  const before=draws;
  book.refresh({"$:/temp/huwiki/abc/edit-focus":{modified:true}});
  assert.equal(draws,before,"must not restore between edit request and draft creation");
  if(createDraft){
   const draft=wiki.findDraft(source)||wiki.generateDraftTitle(source);
   wiki.addTiddler(new tw.Tiddler(original,{title:draft,"draft.of":source,"draft.title":source}));
   wiki.addTiddler(new tw.Tiddler(wiki.getTiddler(storyTitle),{list:[draft,"Nodebog"]}));
  }
  return false;
 });
 function flushOne(){const batch=[...tasks.values()];tasks.clear();for(const fn of batch)fn();}
 function flush(){
  let turns=0;
  while(tasks.size){assert.ok(++turns<10,"editor handoff must settle");flushOne();}
 }
 function edit(){const event={type:"tm-edit-tiddler",param:source,tiddlerTitle:source};book.dispatchEvent(event);return event;}
 function finish(kind,flushReturn=true){
  const draft=wiki.findDraft(source);
  if(kind==="save")wiki.addTiddler(new tw.Tiddler(original,{"abc-source":original.fields["abc-source"]+" A2|"}));
  if(kind!=="close")wiki.deleteTiddler(draft);
  wiki.addTiddler(new tw.Tiddler(wiki.getTiddler(storyTitle),{list:kind==="close"?["Nodebog"]:[source,"Nodebog"]}));
  if(kind!=="close"){standaloneReaders=1;log.push("standalone mounted");}
  book.refresh({[draft]:{deleted:kind!=="close"},[source]:{modified:kind==="save"},[storyTitle]:{modified:true}});
  if(flushReturn)flush();
 }
 return {book,wiki,source,item,setlist,original,host,classes,storyTitle,log,forwarded,pageCalls,tasks,edit,finish,flush,flushOne,
  get controllers(){return controllers;},get draws(){return draws;},get standaloneReaders(){return standaloneReaders;}};
}

test("editing disposes the embedded reader before forwarding one native edit event",()=>{
 const f=fixture(),event=f.edit();
 assert.equal(f.forwarded.length,1);
 assert.equal(f.forwarded[0],event,"the same event is forwarded, not redispatched or replaced");
 assert.ok(f.log.indexOf("observer disconnected")<f.log.indexOf("score disposed"));
 assert.equal(f.book.children.length,0);
 assert.equal(f.controllers,0);
 f.edit();assert.equal(f.forwarded.length,1,"duplicate activation is consumed during handoff");
 f.flush();
 assert.ok(f.wiki.findDraft(f.source));
 assert.equal(f.draws,0);
 assert.equal(f.book._editReturn.item,f.item);
 assert.equal(f.book._editReturn.setlist,f.setlist);
 assert.equal(f.book._editReturn.draft,f.wiki.findDraft(f.source));
 f.book.refresh({"Unrelated tiddler":{modified:true}});
 assert.equal(f.tasks.size,0,"unrelated edits cannot rebuild or poll the hidden score");
 f.book.draw=Book.prototype.draw;f.book.draw();
 assert.equal(f.controllers,0,"direct draw requests also leave the old score suspended");
});

for(const kind of ["save","cancel","close"]){
 test(kind+" restores the same book, page and reader without a duplicate source view",()=>{
  const f=fixture();f.edit();f.flush();
  const draft=f.wiki.findDraft(f.source);
  f.finish(kind);
  assert.equal(f.draws,1);
  assert.equal(f.controllers,1);
  assert.equal(f.host.hidden,false);
  assert.equal(f.classes.has("huwrep-book-fullscreen"),true);
  assert.equal(f.book.activeItem,f.item);
  assert.equal(f.book.setlistTitle,f.setlist);
  assert.deepEqual({...f.book._readerCarry},{active:true,mode:"vis",fitMode:"width",controlsOpen:false});
  assert.equal(f.wiki.getTiddlerList(f.storyTitle).includes(f.source),false);
  assert.equal(f.wiki.getTiddlerList(f.storyTitle).includes(draft),false);
  assert.equal(!!f.wiki.getTiddler(draft),kind==="close","closing leaves a saved draft untouched");
  if(kind!=="save")assert.equal(f.wiki.getTiddler(f.source),f.original,"cancel/close do not write original notes");
  else assert.ok(f.wiki.getTiddler(f.source).fields["abc-source"].endsWith(" A2|"));
  assert.equal(f.pageCalls.length,0,"wait for asynchronous pagination before restoring position");
  f.book._score._pager.count=4;f.book.updateMode();
  assert.deepEqual(f.pageCalls,[["event",27,true]]);
  f.book.updateMode();assert.equal(f.pageCalls.length,1,"restoration happens once");
 });
}

test("return waits for StoryList DOM disposal instead of overlapping two full score readers",()=>{
 const f=fixture();f.edit();f.flush();f.finish("cancel",false);
 assert.equal(f.standaloneReaders,1);assert.equal(f.controllers,0);
 f.flushOne();
 assert.equal(f.book._editReturn.returning,true);
 assert.equal(f.host.hidden,true);
 assert.equal(f.draws,0,"updating StoryList must not remount the book in the same turn");
 assert.equal(f.standaloneReaders,1,"the previous standalone view still exists until root refresh");
 f.flush();
 assert.equal(f.standaloneReaders,0);assert.equal(f.controllers,1);assert.equal(f.draws,1);
 assert.ok(f.log.indexOf("standalone disposed")<f.log.indexOf("book restored"));
});

test("an explicit reader exit and a previously open original stay preserved",()=>{
 const f=fixture({readerActive:false,preexistingSource:true});
 f.edit();f.flush();f.finish("cancel");
 assert.equal(f.book._readerCarry.active,false);
 assert.equal(f.wiki.getTiddlerList(f.storyTitle).includes(f.source),true);
});

test("page fallback handles notes removed by editing and repeated cycles stay bounded",()=>{
 const f=fixture();
 for(let i=0;i<3;i++){
  f.edit();f.flush();assert.equal(f.controllers,0);
  f.finish("cancel");assert.equal(f.controllers,1);
  f.book._score._pager.count=2;
  f.book._score._pager.revealOrdinal=()=>false;
  f.book.updateMode();
 }
 assert.deepEqual(f.pageCalls,[["page",2,false],["page",2,false],["page",2,false]]);
 assert.equal(f.forwarded.length,3);
 assert.equal(f.draws,3);
 assert.equal(f.tasks.size,0);
});

test("declined editor requests restore, while destroying the book cancels pending restoration",()=>{
 const declined=fixture({createDraft:false});declined.edit();declined.flush();
 assert.equal(declined.draws,1);assert.equal(declined.controllers,1);
 const removed=fixture();removed.edit();removed.book.onDestroy();removed.flush();
 assert.equal(removed.draws,0);assert.equal(removed.controllers,0);
 assert.equal(removed.book._editReturn,null);
});
