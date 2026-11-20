import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {svgDocument} from "./helpers/svg-test-dom.mjs";

const base=new URL("../plugins/repertoire/src/",import.meta.url);
const modelSource=await readFile(new URL("model.js",base),"utf8");
const widgetSource=await readFile(new URL("widget.js",base),"utf8");
const TEMP="$:/temp/huwiki/repertoire/";
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(){
 const data=new Map(),events=[];
 class Tiddler{
  constructor(...parts){this.fields=Object.assign({},...parts.map(p=>p instanceof Tiddler?p.fields:p));}
 }
 const wiki={
  allTitles:()=>[...data.keys()],getTiddler:title=>data.get(title),
  getTiddlerText:title=>data.get(title)?.fields.text||"",tiddlerExists:title=>data.has(title),
  getCreationFields:()=>({}),addTiddler:t=>data.set(t.fields.title,t),
  getTiddlerList(title,field){
   return Array.from(String(data.get(title)?.fields[field]||"").matchAll(/\[\[([\s\S]*?)\]\]|([^\s]+)/g),m=>m[1]||m[2]);
  }
 };
 const $tw={Tiddler,utils:{stringifyList:items=>items.map(s=>"[["+s+"]]").join(" ")}};
 const model={};runInNewContext(modelSource,{exports:model,$tw});
 const add=fields=>wiki.addTiddler(new Tiddler(fields));
 add({title:"Archive/Original A","abc-source":"T:Melodi A\nQ:1/4=100\nK:C\nCDEF|"});
 add({title:"Archive/Legacy score",caption:"Ældre nodeark",text:"Intro og form"});
 add({title:"Archive/Original C","repertoire-kind":"piece"});
 const orchestra=model.orchestra(wiki,"Orkester A"),otherOrchestra=model.orchestra(wiki,"Orkester B");
 const a=model.addItem(wiki,orchestra,"Archive/Original A").title;
 const b=model.addItem(wiki,orchestra,"Archive/Legacy score").title;
 const c=model.addItem(wiki,otherOrchestra,"Archive/Original C").title;
 model.saveArrangement(wiki,a,"",{key:"Dm",tempo:"80",form:"Orkestrets intro"},"orchestra");
 const setlist=model.createSetlist(wiki,orchestra,"Koncert"),anotherSet=model.createSetlist(wiki,orchestra,"Prøve"),
  otherSet=model.createSetlist(wiki,otherOrchestra,"Koncert");
 model.setEntries(wiki,setlist,[a,b]);model.setEntries(wiki,anotherSet,[a]);model.setEntries(wiki,otherSet,[c]);
 add({title:TEMP+"active-setlist",text:setlist});add({title:TEMP+"active-item",text:a});
 const exports={};
 runInNewContext(widgetSource,{exports,$tw,require(id){
  if(id==="$:/core/modules/widgets/widget.js")return {widget:function(){}};
  if(id.endsWith("/model.js"))return model;
  throw Error("Unexpected dependency "+id);
 }});
 const doc=svgDocument(),create=doc.createElement;
 // The shared event helper is primarily for SVG callbacks. Browser DOM event
 // listeners also receive the element as `this`; preserve that contract here.
 doc.createElement=tag=>{
  const node=create(tag),addListener=node.addEventListener.bind(node);
  node.addEventListener=(type,fn,options)=>addListener(type,event=>fn.call(node,event),options);
  return node;
 };
 const widget=Object.create(exports["huwiki-repertoire"].prototype);
 Object.assign(widget,{wiki,document:doc,domNodes:[],children:[],
  computeAttributes:()=>({}),getAttribute:(_key,fallback)=>fallback,
  getVariable:()=>"HUWiki Repertoire – Start",dispatchEvent:e=>events.push(e)});
 widget.render(doc.body,null);
 const snapshot=()=>JSON.stringify([...data].map(([title,t])=>[title,t.fields]));
 return {widget,doc,wiki,model,data,add,snapshot,events,orchestra,otherOrchestra,setlist,anotherSet,otherSet,a,b,c};
}
function field(widget,label){
 const node=widget.host.querySelectorAll("input,select,textarea").find(n=>n.getAttribute("aria-label")===label);
 assert.ok(node,"Field is available: "+label);return node;
}
function button(widget,label){
 const node=widget.host.querySelectorAll("button").find(n=>n.textContent===label);
 assert.ok(node,"Button is available: "+label);return node;
}
function tab(widget,prefix){
 const node=widget.host.querySelectorAll("button").find(n=>n.getAttribute("role")==="tab"&&n.textContent.startsWith(prefix));
 assert.ok(node,"Tab is available: "+prefix);return node;
}
function type(node,value){node.value=value;node.dispatch("input");}

test("removing a setlist item exposes orchestra agreements without copying a stale setlist draft into the orchestra",()=>{
 const f=fixture(),{widget,wiki,model,a,b,setlist}=f;
 model.saveArrangement(wiki,a,setlist,{key:"Gm",tempo:"144",form:"Kun koncert"},"setlist");
 widget.refresh({[setlist]:{modified:true}});
 type(field(widget,"Aftalt toneart"),"Bb");
 type(field(widget,"Aftalt tempo"),"190");
 model.setEntries(wiki,setlist,[b]);widget.refresh({[setlist]:{modified:true}});
 tab(widget,"Orkestrets repertoire").click();button(widget,"Melodi A").click();
 assert.equal(field(widget,"Aftalt toneart").value,"Dm");
 assert.equal(field(widget,"Aftalt tempo").value,"80");
 assert.equal(field(widget,"Form, intro, soloer og afslutning").value,"Orkestrets intro");
 assert.equal(button(widget,"Gem kun i denne sætliste").disabled,true);
 const source=wiki.getTiddler("Archive/Original A");
 button(widget,"Gem som orkestrets standard").click();
 assert.deepEqual(plain(model.effective(wiki,"",a)),{key:"Dm",tempo:"80",form:"Orkestrets intro"});
 assert.equal(JSON.parse(wiki.getTiddler(setlist).fields["repertoire-overrides"])[a].key,"Gm");
 assert.equal(wiki.getTiddler("Archive/Original A"),source,"saving an agreement never rewrites ABC");
});

test("draft agreement edits survive search and view changes until explicitly saved to one setlist",()=>{
 const {widget,wiki,model,a,setlist,anotherSet}=fixture();
 type(field(widget,"Aftalt tempo"),"177");
 type(field(widget,"Form, intro, soloer og afslutning"),"Ny intro til koncerten");
 type(field(widget,"Søg efter titel, toneart eller tempo"),"melodi");
 tab(widget,"Musikbibliotek").click();tab(widget,"Sætliste").click();
 assert.equal(field(widget,"Aftalt tempo").value,"177");
 assert.equal(field(widget,"Form, intro, soloer og afslutning").value,"Ny intro til koncerten");
 button(widget,"Gem kun i denne sætliste").click();
 assert.equal(model.effective(wiki,setlist,a).tempo,"177");
 assert.equal(model.effective(wiki,anotherSet,a).tempo,"80");
 assert.equal(model.effective(wiki,"",a).form,"Orkestrets intro");
});

test("Nodebog temporary selection updates an already-open workshop, including another orchestra",()=>{
 const {widget,add,snapshot,b,c,setlist,otherSet,otherOrchestra}=fixture();
 add({title:TEMP+"active-item",text:b});
 assert.equal(widget.refresh({[TEMP+"active-item"]:{modified:true}}),true);
 assert.equal(widget.activeItem,b);assert.equal(widget.setlistTitle,setlist);
 assert.equal(widget.host.querySelector(".huwrep-selected").getAttribute("data-item-title"),b);
 add({title:TEMP+"active-setlist",text:otherSet});add({title:TEMP+"active-item",text:c});
 const before=snapshot();
 assert.equal(widget.refresh({[TEMP+"active-setlist"]:{modified:true},[TEMP+"active-item"]:{modified:true}}),true);
 assert.equal(widget.orchestraTitle,otherOrchestra);assert.equal(widget.setlistTitle,otherSet);assert.equal(widget.activeItem,c);
 assert.equal(field(widget,"Orkester").value,otherOrchestra);
 assert.equal(field(widget,"Aktuel sætliste").value,otherSet);
 assert.equal(snapshot(),before,"selection synchronisation is read-only");
});

test("library counts and source refresh include older linked scores without writing catalogue views",()=>{
 const {widget,wiki,add,data,snapshot}=fixture();
 const before=snapshot();tab(widget,"Musikbibliotek").click();
 assert.equal(tab(widget,"Musikbibliotek").textContent,"Musikbibliotek (3)");
 assert.equal(widget.host.querySelectorAll("tbody tr").length,3);
 const sort=field(widget,"Vis rækkefølge");sort.value="type";sort.dispatch("change");
 type(field(widget,"Søg efter titel, toneart eller tempo"),"aeldre");
 assert.equal(widget.host.querySelectorAll("tbody tr").length,1);
 assert.equal(snapshot(),before,"searching and display sorting cannot change lists or source data");
 type(field(widget,"Søg efter titel, toneart eller tempo"),"");
 add({...wiki.getTiddler("Archive/Legacy score").fields,caption:"Opdateret nodeark"});
 assert.equal(widget.refresh({"Archive/Legacy score":{modified:true}}),true);
 assert.ok(button(widget,"Opdateret nodeark"));
 data.delete("Archive/Legacy score");
 assert.equal(widget.refresh({"Archive/Legacy score":{deleted:true}}),true);
 assert.equal(tab(widget,"Musikbibliotek").textContent,"Musikbibliotek (2)");
 assert.equal(widget.host.querySelectorAll("tbody tr").length,2);
});
