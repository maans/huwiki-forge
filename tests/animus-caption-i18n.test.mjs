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

test("Caption plugin can switch a mock DOM and preserve English source and lip-sync timing",async()=>{
 const source=await readFile(new URL("../plugins/animus-caption-i18n/src/startup.js",import.meta.url),"utf8");
 class Element{
  constructor(tag,cls=""){this.tagName=tag;this.className=cls;this.nodeType=1;this.children=[];this._attrs={};this.events={};this._text="";this.classList={contains:name=>this.className.split(" ").includes(name)};if(tag==="select")this.options=[];}
  get textContent(){return this._text;}
  set textContent(value){this._text=String(value);}
  appendChild(child){this.children.push(child);this.firstChild=this.children[0];if(this.tagName==="select")this.options.push(child);return child;}
  addEventListener(name,handler){this.events[name]=handler;}
  getAttribute(name){return this._attrs[name]||null;}
  setAttribute(name,value){this._attrs[name]=String(value);}
  querySelector(selector){if(selector==="select")return this.children.find(e=>e.tagName==="select")||null;return null;}
  querySelectorAll(){return []}
  closest(){return host;}
 }
 const host=new Element("section","plato-player"),toolbar=new Element("div","plato-options");
 const caption=new Element("div","plato-caption-text"),speaker=new Element("div","plato-caption-speaker");
 caption.textContent="You still there?";speaker.textContent="The Prisoner";
 host.querySelector=selector=>selector===".plato-options"?toolbar:null;
 host.querySelectorAll=selector=>selector.includes(".plato-caption-text")?[caption,speaker]:[];
 const document={readyState:"complete",body:new Element("body"),documentElement:{lang:"en"},createElement:tag=>new Element(tag),querySelectorAll:()=>[host]};
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
 selector.value="auto";selector.events.change();store["$:/language"]="$:/languages/da-DK";onWikiChange({"$:/language":true});
 assert.equal(caption.textContent,"Er du der stadig?");
 caption.textContent="Another line";mutation([{target:caption}]);
 assert.equal(caption.textContent,"En anden replik");
 assert.deepEqual(JSON.parse(store["fixture-timeline"]),script,"Source English cues, timestamps and visemes remain unchanged");
});
