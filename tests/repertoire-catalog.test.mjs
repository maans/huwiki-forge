import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../plugins/repertoire/src/model.js",import.meta.url),"utf8");

function setup(){
 const data=new Map();
 class Tiddler{
  constructor(...values){this.fields=Object.assign({},...values.map(v=>v instanceof Tiddler?v.fields:v));}
 }
 const wiki={
  allTitles:()=>[...data.keys()],
  getTiddler:title=>data.get(title),
  tiddlerExists:title=>data.has(title),
  getCreationFields:()=>({}),
  addTiddler:t=>data.set(t.fields.title,t),
  getTiddlerList(title,field){
   return Array.from(String(data.get(title)?.fields[field]||"").matchAll(/\[\[([\s\S]*?)\]\]|([^\s]+)/g),m=>m[1]||m[2]);
  }
 };
 const exports={};
 runInNewContext(source,{exports,$tw:{Tiddler,utils:{stringifyList:list=>list.map(s=>"[["+s+"]]").join(" ")}}});
 const add=fields=>wiki.addTiddler(new Tiddler(fields));
 const snapshot=()=>JSON.stringify([...data].map(([id,t])=>[id,t.fields]));
 return {model:exports,wiki,add,snapshot};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test("catalogue uses readable labels while retaining original source and membership references",()=>{
 const {model,wiki,add}=setup();
 const orchestra=model.orchestra(wiki,"SilbaÄtno"),other=model.orchestra(wiki,"Andet orkester");
 add({title:"SilbaÄtno · Brudmarch", "abc-source":"X:1\nT:Brudmarch från Jämtland\nQ:\"Andante\" 1/4=96\nK:Gm clef=treble\nGABc|"});
 add({title:"Original caption source",caption:"Mit synlige navn","abc-source":"T:En anden titel\nQ:120\nK:D\nDEF|"});
 add({title:"Ældre nodescan",type:"image/png"});
 add({title:"Gamle musiknoter",text:"Intro og form"});
 add({title:"Musik uden orkester","repertoire-kind":"piece"});
 const item=model.addItem(wiki,orchestra,"SilbaÄtno · Brudmarch").title;
 model.addItem(wiki,orchestra,"Original caption source");
 model.addItem(wiki,orchestra,"Ældre nodescan");
 model.addItem(wiki,other,"Gamle musiknoter");
 const rows=plain(model.catalog(wiki,orchestra));
 assert.deepEqual(rows.find(r=>r.title==="SilbaÄtno · Brudmarch"),{
  title:"SilbaÄtno · Brudmarch",label:"Brudmarch från Jämtland",itemTitle:item,key:"Gm",tempo:"96",kind:"abc",inSetlist:false
 });
 assert.equal(rows.find(r=>r.title==="Original caption source").label,"Mit synlige navn");
 assert.equal(rows.find(r=>r.title==="Ældre nodescan").kind,"image");
 assert.equal(rows.length,3,"default scope shows only the active orchestra");
 const library=plain(model.catalog(wiki,orchestra,{scope:"library"}));
 assert.equal(library.length,5,"all originals appear once, including older plain-text sources in another orchestra");
 assert.deepEqual(library.find(r=>r.title==="Gamle musiknoter"),{
  title:"Gamle musiknoter",label:"Gamle musiknoter",itemTitle:"",key:"",tempo:"",kind:"text",inSetlist:false
 });
});

test("catalogue applies only the selected orchestra and actual setlist membership agreements",()=>{
 const {model,wiki,add,snapshot}=setup();
 add({title:"Fælles original","abc-source":"T:Fælles melodi\nQ:1/4=100\nK:C\nCDEF|"});
 const a=model.orchestra(wiki,"Orkester A"),b=model.orchestra(wiki,"Orkester B");
 const ai=model.addItem(wiki,a,"Fælles original").title,bi=model.addItem(wiki,b,"Fælles original").title;
 model.saveArrangement(wiki,ai,"",{key:"Dm",tempo:"80",form:"A standard"},"orchestra");
 model.saveArrangement(wiki,bi,"",{key:"F",tempo:"110",form:"B standard"},"orchestra");
 const one=model.createSetlist(wiki,a,"Koncert"),two=model.createSetlist(wiki,a,"Prøve"),foreign=model.createSetlist(wiki,b,"Koncert");
 model.addEntry(wiki,one,ai);model.addEntry(wiki,two,ai);model.addEntry(wiki,foreign,bi);
 model.saveArrangement(wiki,ai,one,{key:"Gm",tempo:"160",form:"Koncert"},"setlist");
 model.saveArrangement(wiki,ai,two,{key:"D",tempo:"140",form:"Prøve"},"setlist");
 const before=snapshot();
 assert.equal(model.catalog(wiki,a,{setlistTitle:one})[0].key,"Gm");
 assert.equal(model.catalog(wiki,a,{setlistTitle:two})[0].tempo,"140");
 const wrong=model.catalog(wiki,a,{setlistTitle:foreign})[0];
 assert.equal(wrong.key,"Dm");assert.equal(wrong.inSetlist,false);
 assert.equal(model.catalog(wiki,b,{setlistTitle:one})[0].key,"F");
 assert.equal(snapshot(),before,"catalogue reads do not edit any source, orchestra or setlist");
 model.setEntries(wiki,one,[]);
 const removed=model.catalog(wiki,a,{setlistTitle:one})[0];
 assert.equal(removed.key,"Dm","an override left behind after removal must not leak into the orchestra view");
 assert.equal(removed.inSetlist,false);
 assert.equal(model.effective(wiki,one,ai).key,"Dm","agreement consumers outside the catalogue obey the same membership rule");
 const foreignFields=wiki.getTiddler(foreign).fields;
 add({...foreignFields,list:"[["+ai+"]]","repertoire-overrides":JSON.stringify({[ai]:{key:"Ab",tempo:"222",form:"Foreign override"}})});
 assert.equal(model.effective(wiki,foreign,ai).key,"Dm","a foreign orchestra may not override this orchestra's agreement even with a malformed reference");
});

test("search finds Unicode accents, Nordic letters and multiple metadata words",()=>{
 const {model,wiki,add}=setup();
 add({title:"Source 1","abc-source":"T:Brudmarch från Jämtland\nQ:1/4=96\nK:Gm\nGABc|"});
 add({title:"Source 2",caption:"Ærøvals fra Århus","repertoire-kind":"piece","repertoire-image":"image.png"});
 assert.deepEqual(plain(model.catalog(wiki,"",{scope:"library",query:"jamtland FRAN 96 gm"})).map(r=>r.title),["Source 1"]);
 assert.deepEqual(plain(model.catalog(wiki,"",{scope:"library",query:"aerovals arhus billede"})).map(r=>r.title),["Source 2"]);
 assert.equal(model.catalog(wiki,"",{scope:"library",query:"jamtland 120"}).length,0);
});

test("title sorting uses Danish natural order; numeric tempo sorting puts unknown values last",()=>{
 const {model,wiki,add}=setup();
 ["Åben","Øvelse","Æble","Zebra","Nummer 10","Nummer 2"].forEach(title=>add({title,"repertoire-kind":"piece"}));
 assert.deepEqual(plain(model.catalog(wiki,"",{scope:"library",sort:"title"})).map(r=>r.label),
  ["Nummer 2","Nummer 10","Zebra","Æble","Øvelse","Åben"]);
 const orchestra=model.orchestra(wiki,"Tempo"),names=["Slow","Quick","Unspecified","Descriptive"];
 ["Q:1/4=80","Q:1/4=120","","Q:\"Allegro\""].forEach((q,i)=>{
  add({title:names[i],"abc-source":"T:"+names[i]+"\n"+q+"\nK:C\nCDEF|"});
  model.addItem(wiki,orchestra,names[i]);
 });
 assert.deepEqual(plain(model.catalog(wiki,orchestra,{sort:"tempo"})).map(r=>r.title),
  ["Slow","Quick","Descriptive","Unspecified"]);
});

test("setlist sorting returns a pure scoped order and preserves unresolved references",()=>{
 const {model,wiki,add,snapshot}=setup();
 const orchestra=model.orchestra(wiki,"Dans"),ids=[];
 [{title:"A",tempo:120,key:"G"},{title:"B",tempo:90,key:"C"},{title:"C",tempo:60,key:"D"}].forEach(song=>{
  add({title:song.title,"abc-source":"T:"+song.title+"\nQ:1/4="+song.tempo+"\nK:"+song.key+"\nCDEF|"});
  ids.push(model.addItem(wiki,orchestra,song.title).title);
 });
 const list=model.createSetlist(wiki,orchestra,"Koncert");
 model.setEntries(wiki,list,[ids[1],ids[0]]);
 model.saveArrangement(wiki,ids[0],list,{key:"A",tempo:"70",form:""},"setlist");
 const before=snapshot();
 assert.deepEqual(plain(model.sortEntries(wiki,list,"tempo")),[ids[0],ids[1]],"sort uses the setlist's tempo override");
 assert.deepEqual(plain(model.sortEntries(wiki,list,"key")),[ids[0],ids[1]]);
 assert.deepEqual(plain(model.entries(wiki,list)),[ids[1],ids[0]],"previewing an order must not reorder the saved list");
 assert.equal(snapshot(),before);
 const fields=wiki.getTiddler(list).fields;
 add({...fields,list:fields.list+" [[Missing repertoire reference]]"});
 assert.deepEqual(plain(model.sortEntries(wiki,list,"title")),[ids[0],ids[1],"Missing repertoire reference"]);
 assert.deepEqual(plain(model.entries(wiki,list)),[ids[1],ids[0],"Missing repertoire reference"]);
});

test("applying a reordered setlist preserves unresolved references and all non-order fields",()=>{
 const {model,wiki,add,snapshot}=setup();
 const orchestra=model.orchestra(wiki,"Orkester"),a="Original A",b="Original B";
 add({title:a,"abc-source":"T:Alpha\nQ:1/4=100\nK:C\nCDEF|"});
 add({title:b,"abc-source":"T:Beta\nQ:1/4=80\nK:D\nDEFG|"});
 const ai=model.addItem(wiki,orchestra,a).title,bi=model.addItem(wiki,orchestra,b).title;
 const list=model.createSetlist(wiki,orchestra,"Koncert");
 model.setEntries(wiki,list,[bi,ai]);
 model.saveArrangement(wiki,ai,list,{key:"G",tempo:"110",form:"Solo"},"setlist");
 const initial=wiki.getTiddler(list).fields;
 add({...initial,list:"[["+bi+"]] [[Missing repertoire reference]] [["+ai+"]]",custom:"Preserve this"});
 const beforeFields=plain(wiki.getTiddler(list).fields),beforeSources=[wiki.getTiddler(a),wiki.getTiddler(b)];
 const sorted=plain(model.sortEntries(wiki,list,"title"));
 assert.deepEqual(sorted,[ai,bi,"Missing repertoire reference"]);
 const saved=model.reorderEntries(wiki,list,sorted);
 assert.deepEqual(plain(saved),sorted);
 assert.deepEqual(plain(model.entries(wiki,list)),sorted);
 const afterFields=plain(wiki.getTiddler(list).fields);
 delete beforeFields.list;delete afterFields.list;
 assert.deepEqual(afterFields,beforeFields,"only list order changes; custom fields and arrangements survive");
 assert.equal(wiki.getTiddler(a),beforeSources[0]);assert.equal(wiki.getTiddler(b),beforeSources[1]);
 const unchanged=snapshot();
 for(const bad of [[ai,bi],[ai,bi,"New foreign reference"],[ai,ai,"Missing repertoire reference"],sorted.concat([bi])]){
  assert.throws(()=>model.reorderEntries(wiki,list,bad),/samme numre/);
  assert.equal(snapshot(),unchanged,"a rejected reorder must not change any data");
 }
 // Even a legacy duplicate must be preserved by a permutation, never silently
 // deduplicated or replaced with a different entry while changing order.
 add({...wiki.getTiddler(list).fields,list:"[["+ai+"]] [["+bi+"]] [["+ai+"]]"});
 assert.deepEqual(plain(model.reorderEntries(wiki,list,[ai,ai,bi])),[ai,ai,bi]);
 assert.throws(()=>model.reorderEntries(wiki,list,[ai,bi,bi]),/samme numre/);
 assert.throws(()=>model.reorderEntries(wiki,"Missing setlist",[]),/findes ikke/);
});
