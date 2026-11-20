import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {svgDocument} from "./helpers/svg-test-dom.mjs";

const base=new URL("../plugins/repertoire/src/",import.meta.url);
const source=await readFile(new URL("book-widget.js",base),"utf8");
const practiceSource=await readFile(new URL("practice.js",base),"utf8");
const layoutSource=await readFile(new URL("book-layout.js",base),"utf8");
const SET="$:/temp/huwiki/repertoire/active-setlist";
const ITEM="$:/temp/huwiki/repertoire/active-item";
const copy=value=>JSON.parse(JSON.stringify(value));

function fixture({setlists={concert:["first","second"]},state={},attributes={}}={}){
 const modules={};
 for(const [name,text] of [["practice.js",practiceSource],["book-layout.js",layoutSource]]){
  const exports={};runInNewContext(text,{exports});modules[name]=exports;
 }
 const data=new Map(Object.entries(state)),events=[];
 class Tiddler{constructor(fields){this.fields=fields;}}
 const wiki={
  getTiddlerText(title){return data.get(title)||"";},
  addTiddler(tiddler){data.set(tiddler.fields.title,tiddler.fields.text);}
 };
 const model={entries(_wiki,title){return setlists[title]||[];}};
 const exports={};
 runInNewContext(source,{exports,$tw:{Tiddler},require(id){
  if(id==="$:/core/modules/widgets/widget.js")return {widget:function(){}};
  if(id.endsWith("/model.js"))return model;
  const module=modules[id.split("/").at(-1)];
  if(!module)throw Error("Unexpected dependency: "+id);
  return module;
 }});
 const doc=svgDocument();
 doc.defaultView={innerWidth:1180,innerHeight:820,addEventListener(){},removeEventListener(){}};
 const book=Object.create(exports["huwiki-repertoire-book"].prototype);
 Object.assign(book,{
  wiki,document:doc,domNodes:[],children:[],
  computeAttributes(){},
  getAttribute(key,fallback){return attributes[key]??fallback;},
  getVariable(key){return key==="currentTiddler"?"Repertoire – Nodebog":"";},
  dispatchEvent(event){events.push(event);},
  draw(){this.draws=(this.draws||0)+1;}
 });
 return {book,wiki,data,doc,events};
}

test("opening Nodebogen uses the workshop's selected setlist and piece",()=>{
 const {book,doc}=fixture({state:{[SET]:"concert",[ITEM]:"second"},attributes:{fullscreen:"yes"}});
 book.render(doc.body,null);
 assert.equal(book.setlistTitle,"concert");
 assert.equal(book.activeItem,"second");
 assert.equal(book.lastPage,false);
 assert.equal(book.host.hidden,false);
 assert.equal(book.host.classList.contains("huwrep-book-fullscreen"),true);
 assert.equal(book.draws,1);
});

test("returning to the workshop closes the dedicated book after disposing the score",()=>{
 const {book,doc,events}=fixture({state:{[SET]:"concert",[ITEM]:"second"},attributes:{fullscreen:"yes"}});
 book.render(doc.body,null);
 let stopped=0,disconnected=0;
 book._score={onDestroy(){stopped++;}};
 book._observer={disconnect(){disconnected++;}};
 book.children=[book._score];
 book.returnToWorkshop();
 assert.equal(stopped,1);
 assert.equal(disconnected,1);
 assert.equal(book._score,null);
 assert.equal(book.children.length,0);
 assert.equal(book.host.hidden,false,"an open tiddler must never be left with a hidden, inert host");
 assert.equal(book.host.classList.contains("huwrep-book-fullscreen"),false);
 assert.deepEqual(events.map(e=>[e.type,e.navigateTo||e.param]),[
  ["tm-navigate","HUWiki Repertoire – Start"],
  ["tm-close-tiddler","Repertoire – Nodebog"]
 ]);
 book.onDestroy();
 assert.equal(stopped,1,"normal TiddlyWiki removal must not dispose the same score twice");
});

test("an embedded book returns without closing its containing article",()=>{
 const {book,doc,events}=fixture({state:{[SET]:"concert"}});
 book.render(doc.body,null);
 book.getVariable=()=>"An article with music";
 book.returnToWorkshop();
 assert.equal(events.filter(e=>e.type==="tm-close-tiddler").length,0);
 assert.equal(book.draws,2,"the embedded reader remains usable after stopping its old score");
});

test("a workshop selection updates an already-open book without resetting an unchanged score",()=>{
 const {book,doc,data}=fixture({state:{[SET]:"concert",[ITEM]:"first"}});
 book.render(doc.body,null);
 data.set(ITEM,"second");
 assert.equal(book.refresh({[ITEM]:{modified:true}}),true);
 assert.equal(book.activeItem,"second");
 assert.equal(book.draws,2);
 book.lastPage=true;
 assert.equal(book.refresh({[ITEM]:{modified:true}}),false);
 assert.equal(book.draws,2,"the book's own temporary state update must not recreate audio");
 assert.equal(book.lastPage,true,"an unchanged selection must not erase a backwards page target");
});

test("a new setlist cannot inherit an unrelated active item or backwards page target",()=>{
 const {book,doc,data}=fixture({setlists:{concert:["first","second"],rehearsal:["third","fourth"]},
  state:{[SET]:"concert",[ITEM]:"second"}});
 book.render(doc.body,null);book.lastPage=true;
 data.set(SET,"rehearsal");
 assert.equal(book.refresh({[SET]:{modified:true}}),true);
 assert.equal(book.setlistTitle,"rehearsal");
 assert.equal(book.activeItem,"third");
 assert.equal(book.lastPage,false);
});

test("turning to another piece records the active selection without a second rebuild",()=>{
 const {book,doc,data}=fixture({state:{[SET]:"concert",[ITEM]:"first"}});
 book.render(doc.body,null);
 book.selectItem("second",true);
 assert.equal(data.get(ITEM),"second");
 assert.equal(book.lastPage,true);
 assert.equal(book.draws,2);
 book.refresh({[ITEM]:{modified:true}});
 assert.equal(book.draws,2);
 book.selectSetlist("concert");
 assert.equal(data.get(ITEM),"first");
 assert.equal(book.lastPage,false);
});

test("practice captures the current ordinary mixer on entry and restores it only once",()=>{
 const {book}=fixture();
 let current={metronome:false,voiceSettings:{"0":{mode:"normal",volume:80},"1":{mode:"normal",volume:90}}};
 const writes=[];
 const control={config(){return current;},setConfig(config,persist){
  assert.equal(persist,false,"practice must not write the original score");
  current=copy(config);writes.push(copy(config));
 }};
 const controller={position:12.5};
 book._score={_accompControls:control,_audioController:controller};
 book.activeItem="first";book.practiceMuteByItem={first:"1"};
 book.practiceEnabled=false;
 book.applyPractice();
 assert.equal(writes.length,0,"ordinary playback must not receive a stale overlay");
 current.voiceSettings["0"].volume=63;
 const justBeforePractice=copy(current);
 book.practiceEnabled=true;book.practiceMetronome=true;book.applyPractice();
 assert.equal(current.voiceSettings["0"].volume,63);
 assert.equal(current.voiceSettings["1"].mode,"mute");
 assert.equal(current.metronome,true);
 assert.equal(book._score._audioController,controller);
 assert.equal(controller.position,12.5,"mix changes retain the score's playback clock");
 book.applyPractice();
 assert.equal(writes.length,1,"DOM updates must not repeatedly reapply the mix");
 book.practiceEnabled=false;book.applyPractice();
 assert.deepEqual(current,justBeforePractice);
 assert.equal(writes.length,2);
 current.voiceSettings["0"].volume=47;
 book.applyPractice();
 assert.equal(writes.length,2,"ordinary edits after leaving practice must survive observer updates");
 book.practiceEnabled=true;book.applyPractice();
 book.practiceEnabled=false;book.applyPractice();
 assert.equal(current.voiceSettings["0"].volume,47,"a later practice session uses the latest normal mix");
});

test("successive scores with the same voice names each populate Music Minus One choices",()=>{
 const {book,doc}=fixture();
 book.practiceEnabled=false;book.practiceMuteByItem={first:"1",second:"1"};
 function score(id){
  book.activeItem=id;
  book._practiceScoreHost=doc.createElement("section");
  for(const [index,name] of [[0,"Fløjte"],[1,"Bas"]]){
   const row=doc.createElement("div");row.className="huwabc-voice-row";
   row.setAttribute("data-voice-index",String(index));
   const label=doc.createElement("span");label.className="huwabc-voice-name";label.textContent=name;
   row.appendChild(label);book._practiceScoreHost.appendChild(row);
  }
  book._practiceControls={voice:doc.createElement("select")};
  book.syncPracticeVoices();
  assert.deepEqual(book._practiceControls.voice.children.map(n=>n.value),["","0","1"]);
  assert.equal(book._practiceControls.voice.value,"1");
 }
 score("first");book.disposeScore();score("second");
});
