import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),"utf8"));
test("bilingual AniMus caption release covers all English dialogue and song cues",async()=>{
 const [data,manA,manT,pl]=await Promise.all([json("../editions/turn-around/tiddlers/captions-da.json"),json("../editions/animus/manifest.json"),json("../editions/turn-around/manifest.json"),json("../plugins/animus-caption-i18n/dist/plugin.json")]);
 assert.equal(data.length,1);
 const captions=JSON.parse(data[0].text);
 assert.equal(captions.targetLanguage,"da");
 const expected=[6,7,10,8,6,10,7,6,9,6,6,6,6,10];
 assert.deepEqual(Object.values(captions.scenes).map(x=>x.length),expected);
 assert.equal(Object.values(captions.scenes).flat().length,103);
 assert(Object.values(captions.scenes).flat().every(x=>typeof x==="string"&&x.trim()));
 assert(manA.plugins.some(p=>p.includes("animus-caption-i18n")));
 assert(manT.plugins.some(p=>p.includes("animus-caption-i18n")));
 assert(manT.tiddlers.some(p=>p.includes("captions-da")));
 assert(manT.tiddlers.some(p=>p.includes("layout-fix")));
 const nested=JSON.parse(pl.text).tiddlers;
 const entry=nested["$:/plugins/huwiki/animus-caption-i18n/startup.js"];
 assert.equal(entry["module-type"],"startup");
 assert(entry.text.includes("auto"));assert(entry.text.includes("Mut"+"ationObserver"));
 const src=await readFile(new URL("../plugins/animus-caption-i18n/src/startup.js",import.meta.url),"utf8");
 assert.equal(entry.text,src);
});

async function captionFixture({views=1}={}){
 const source=await readFile(new URL("../plugins/animus-caption-i18n/src/startup.js",import.meta.url),"utf8");
 class Element{
  constructor(tag,cls=""){this.tagName=tag;this.className=cls;this.nodeType=1;this.children=[];this._attrs={};this.events={};this._text="";this.reads=0;this.queries=0;this.classList={contains:name=>this.className.split(" ").includes(name)};if(tag==="select")this.options=[];}
  get textContent(){this.reads++;return this._text;}
  set textContent(value){this._text=String(value);}
  get isConnected(){return this.tagName==="body"||!!this.parentElement?.isConnected;}
  appendChild(child){child.parentElement=this;this.children.push(child);this.firstChild=this.children[0];if(this.tagName==="select")this.options.push(child);return child;}
  addEventListener(name,handler){this.events[name]=handler;}
  getAttribute(name){return this._attrs[name]||null;}
  setAttribute(name,value){this._attrs[name]=String(value);}
  matches(selector){return selector.split(",").some(s=>{s=s.trim();return s.startsWith(".")?this.classList.contains(s.slice(1)):this.tagName===s;});}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){this.queries++;const result=[];function visit(node){for(const child of node.children){if(child.matches(selector))result.push(child);visit(child);}}visit(this);return result;}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
 }
 const document={readyState:"complete",body:new Element("body"),documentElement:{lang:"en"},createElement:tag=>new Element(tag),queries:0,querySelectorAll(selector){this.queries++;return this.body.querySelectorAll(selector);}};
 function addView(editor=false){
  const host=new Element("section",editor?"huw-musical":"plato-player"),toolbar=new Element("div",editor?"huw-musical-transport":"plato-options");
  const caption=new Element("div",editor?"huw-musical-caption-line":"plato-caption-text"),speaker=new Element("div",editor?"huw-musical-caption-cue":"plato-caption-speaker");
  const clock=new Element("output",editor?"huw-musical-time":"plato-time");
  caption.textContent="You still there?";speaker.textContent="The Prisoner";
  host.appendChild(toolbar);host.appendChild(caption);host.appendChild(speaker);host.appendChild(clock);document.body.appendChild(host);
  return {host,toolbar,caption,speaker,clock};
 }
 const players=Array.from({length:views},(_,i)=>addView(i>0));
 const script={scenes:[{id:"s01",cues:[{text:"You still there?",start:10,end:13,visemes:[1,2]},{text:"Another line",start:14,end:17}]}]};
 const store={
  "$:/language":"$:/languages/en-GB",
  "fixture-timeline":JSON.stringify(script),
  "fixture-da":JSON.stringify({sourceTiddler:"fixture-timeline",targetLanguage:"da",scenes:{s01:["Er du der stadig?","En anden replik"]}})
 };
 let onWikiChange;
 const wiki={getTiddlerText:(key,def)=>store[key]??def,filterTiddlers:()=>["fixture-da"],addEventListener:(_,cb)=>onWikiChange=cb,
  addTiddler(t){store[t.title]=t.text;onWikiChange?.({[t.title]:true});},getTiddler:()=>({hasTag:()=>false})};
 let mutation;
 class Observer{constructor(callback){mutation=callback;}observe(){}}
 const $tw={wiki,Tiddler:class{constructor(fields){Object.assign(this,fields);}}};
 const exports={};vm.runInNewContext(source,{exports,$tw,document,MutationObserver:Observer,console});exports.startup();
 return {players,document,store,script,addView,Element,mutation,change:onWikiChange};
}

test("Caption plugin can switch a mock DOM and preserve English source and lip-sync timing",async()=>{
 const {players:[{toolbar,caption,speaker}],store,script,mutation,change}=await captionFixture();
 const wrapper=toolbar.children[0],selector=wrapper.querySelector("select");
 assert.equal(selector.value,"auto");
 assert.equal(selector.options.length,3);
 assert.equal(caption.textContent,"You still there?");
 selector.value="da";selector.events.change();
 assert.equal(store["$:/config/huwiki/animus/caption-language"],"da");
 assert.equal(caption.textContent,"Er du der stadig?");
 assert.equal(speaker.textContent,"Fangen");
 selector.value="en";selector.events.change();
 assert.equal(caption.textContent,"You still there?");
 assert.equal(speaker.textContent,"The Prisoner");
 selector.value="auto";selector.events.change();store["$:/language"]="$:/languages/da-DK";change({"$:/language":true});
 assert.equal(caption.textContent,"Er du der stadig?");
 caption.textContent="Another line";mutation([{target:caption}]);
 assert.equal(caption.textContent,"En anden replik");
 assert.deepEqual(JSON.parse(store["fixture-timeline"]),script,"Source English cues, timestamps and visemes remain unchanged");
});

test("playing transport updates never rescan open players or the other editor's captions",async()=>{
 const {players:[audience,editor],document,store,mutation,change}=await captionFixture({views:2});
 store["$:/language"]="$:/languages/da-DK";change({"$:/language":true});
 const scans=document.queries,hostScans=[audience.host.queries,editor.host.queries],reads=[audience.caption.reads,editor.caption.reads];
 for(let frame=0;frame<120;frame++){
  audience.clock.textContent=String(frame);editor.clock.textContent=String(frame);
  mutation([{target:audience.clock,addedNodes:[{nodeType:3}]},{target:editor.clock,addedNodes:[{nodeType:3}]}]);
 }
 assert.equal(document.queries,scans,"animation frames must not scan the document");
 assert.deepEqual([audience.host.queries,editor.host.queries],hostScans,"transport changes must not rescan either player's descendants");
 assert.deepEqual([audience.caption.reads,editor.caption.reads],reads,"unrelated labels do not even read caption text");
 audience.caption.textContent="Another line";
 mutation([{target:{nodeType:3,parentElement:audience.caption}}]);
 assert.equal(audience.caption.textContent,"En anden replik");
 assert.equal(editor.caption.reads,reads[1],"a changed audience caption must not touch editor captions");
 mutation([{target:audience.caption,addedNodes:[{nodeType:3}]}]);
 assert.equal(document.queries,scans,"the translator's own mutation never causes a full scan");
});

test("newly mounted players and caption subtrees translate without rescanning existing views",async()=>{
 const {players:[first],document,store,mutation,change,addView,Element}=await captionFixture();
 store["$:/language"]="$:/languages/da-DK";change({"$:/language":true});
 const scans=document.queries,firstScans=first.host.queries,firstReads=first.caption.reads;
 const editor=addView(true);
 mutation([{target:document.body,addedNodes:[editor.host]}]);
 assert.equal(editor.caption.textContent,"Er du der stadig?");
 assert.equal(editor.toolbar.children.length,1,"the new editor receives one language selector");
 const wrapper=new Element("section"),caption=new Element("div","huw-musical-caption-line");
 caption.textContent="Another line";wrapper.appendChild(caption);editor.host.appendChild(wrapper);
 mutation([{target:editor.host,addedNodes:[wrapper]}]);
 assert.equal(caption.textContent,"En anden replik");
 assert.equal(document.queries,scans);
 assert.equal(first.host.queries,firstScans);
 assert.equal(first.caption.reads,firstReads);
});
