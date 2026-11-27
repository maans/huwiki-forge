import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const moduleTitle="$:/plugins/huwiki/abc/search-widget.js";
const source=await read("plugins/abc/src/search-widget.js");

class FakeNode {
 constructor(tag){this.tag=tag;this.children=[];this.value="";this.attrs={};this._textContent="";this.classList={add(){}};}
 set textContent(value){this._textContent=String(value);this.children=[];}
 get textContent(){return this._textContent;}
 appendChild(child){this.children.push(child);return child;}
 append(...items){this.children.push(...items);}
 setAttribute(name,value){this.attrs[name]=value;}
 scrollIntoView(){}
}
function makeHarness(){
 const document={createElement:tag=>new FakeNode(tag)},records=new Map(),scores=[];
 class Tiddler {
  constructor(...fields){this.fields=Object.assign({},...fields.map(f=>f.fields||f));}
 }
 class Widget {
  initialise(tree,options){
   this.parseTreeNode=tree;this.wiki=options.wiki;this.document=options.document;
   this.parentWidget=options.parentWidget;this.children=[];this.domNodes=[];
  }
  computeAttributes(){return {};}
  getVariable(name,defaultValue){return defaultValue||"";}
 }
 class Score {
  constructor(tree,options){this.tree=tree;this.parentWidget=options.parentWidget;this.document=options.document;scores.push(this);}
  render(host){
   if(!this.document)throw new TypeError("Cannot read properties of undefined (reading 'isTiddlyWikiFakeDom')");
   this.rendered=true;host.appendChild(this.document.createElement("section"));
  }
  onDestroy(){this.destroyed=true;}
 }
 const deps={
  "$:/plugins/huwiki/abc/i18n.js":{},
  "$:/core/modules/widgets/widget.js":{widget:Widget},
  "$:/plugins/huwiki/abc/score-widget.js":{"huwiki-abc":Score},
  "$:/plugins/huwiki/abc/session-data.js":{uniqueTitle:(_,title)=>title},
  "$:/plugins/huwiki/abc/jazz-catalog.js":{},
  "$:/plugins/huwiki/abc/balkan-catalog.js":{},
  "$:/plugins/huwiki/abc/musescore-bank.js":{},
  "$:/plugins/huwiki/abc/repertoire-catalog.js":{},
  "$:/plugins/huwiki/abc/loader.js":{header:(abc,key)=>key==="T"?"Test tune":""}
 };
 const output={};
 runInNewContext(source,{document,exports:output,$tw:{Tiddler},require:name=>{
  if(!(name in deps))throw Error("Missing module stub: "+name);
  return deps[name];
 }},{filename:"search-widget.js"});
 const wiki={
  addTiddler(t){records.set(t.fields.title,t);},
  getTiddler(title){return records.get(title);},
  deleteTiddler(title){records.delete(title);}
 };
 const Search=output["huwiki-abc-search"];
 const search=new Search({type:"huwiki-abc-search"},{wiki,document,parentWidget:null});
 search.preview=document.createElement("section");search.status=document.createElement("p");
 return {search,document,records,scores,deps};
}

test("the maintained ABC collection search widget is bundled verbatim",async()=>{
 const plugin=JSON.parse(await read("plugins/abc/dist/plugin.json"));
 const pluginInfo=JSON.parse(await read("plugins/abc/plugin-info.json"));
 const modules=JSON.parse(plugin.text).tiddlers;
 assert.equal(modules[moduleTitle].text,source);
 assert.equal(plugin.version,pluginInfo.version);
});

test("opening a searched tune gives the score reader TiddlyWiki's document and shows notes",()=>{
 const {search,document,records,scores}=makeHarness();
 const fields={"abc-source":"X:1\nT:Kesh\nM:6/8\nK:G\nGAB cde|","abc-origin-library":"the-session"};
 search.openFields(fields,"Kesh","The Session");
 assert.equal(scores.length,1);
 assert.equal(scores[0].document,document);
 assert.equal(scores[0].parentWidget,search);
 assert.equal(scores[0].tree.attributes.tiddler.value,search.temp);
 assert.equal(scores[0].rendered,true);
 assert.equal(search.children[0],scores[0]);
 assert.equal(records.get(search.temp).fields["abc-source"],fields["abc-source"]);
 assert.match(search.status.textContent,/indlæst/);
});

test("switching search results retires the old score, and closing search cleans up",()=>{
 const {search,scores,records}=makeHarness();
 search.openFields({"abc-source":"X:1\nT:First\nK:C\nC|"},"First","Jazz");
 search.openFields({"abc-source":"X:1\nT:Second\nK:D\nD|"},"Second","Balkan");
 assert.equal(scores.length,2);
 assert.equal(scores[0].destroyed,true);
 assert.equal(scores[1].rendered,true);
 assert.equal(search.children.length,1);
 let observerDestroyed=0,aborted=0;
 search._localeObserver={destroy(){observerDestroyed++;}};
 search.pending.search={abort(){aborted++;}};
 search.onDestroy();
 assert.equal(observerDestroyed,1);
 assert.equal(aborted,1);
 assert.equal(records.has(search.temp),false);
});

test('shared-library ABC preview uses the existing player, retains provenance and ignores stale choices',async()=>{
 const {search,document,records,scores,deps}=makeHarness();
 search.host={isConnected:true};search.info=document.createElement('div');search.searchEpoch=1;
 const pending=[];deps['$:/plugins/huwiki/abc/repertoire-catalog.js'].load=v=>new Promise(resolve=>pending.push({v,resolve}));
 const group=title=>({title,collections:['Birdland'],variants:[{id:title,format:'abc',label:'Leadsheet (ABC)',collection:'Birdland',sourceURL:'https://example.test/#'+title}]});
 search.openRepertoire(group('First'));search.openRepertoire(group('Second'));
 pending[1].resolve({'abc-source':'X:1\nT:Second\nK:C\nC|'});await new Promise(r=>setImmediate(r));
 pending[0].resolve({'abc-source':'X:1\nT:First\nK:C\nC|'});await new Promise(r=>setImmediate(r));
 assert.equal(scores.length,1);assert.match(records.get(search.temp).fields['abc-source'],/T:Second/);
 assert.equal(records.get(search.temp).fields['abc-origin-library'],'repertoire');
 assert.equal(records.get(search.temp).fields['abc-origin-url'],'https://example.test/#Second');
 search.openRepertoire(group('Third'));search.onDestroy();pending[2].resolve({'abc-source':'X:1\nK:C\nC|'});await new Promise(r=>setImmediate(r));
 assert.equal(scores.length,1);assert.equal(records.has(search.temp),false);
});

