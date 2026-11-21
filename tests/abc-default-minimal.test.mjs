import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const plugin=JSON.parse(await readFile(path.join(root,"plugins/abc/dist/plugin.json"),"utf8"));
const packed=JSON.parse(plugin.text).tiddlers;
const viewCode=await readFile(path.join(root,"plugins/abc/src/score-view.js"),"utf8");
const widgetCode=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
const view={};
runInNewContext(viewCode,{exports:view});

function fixture(language="da"){
 const tiddlers={
  "A · Old import":{fields:{title:"A · Old import","abc-source":"X:1\nT:Melody\nK:G\nG |","abc-view":"full"}},
  "Second tune":{fields:{title:"Second tune","abc-source":"X:1\nT:Second tune\nK:D\nD |","abc-view":"full"}}
 };
 const writes=[];
 const wiki={getTiddler(title){return tiddlers[title];},addTiddler(tiddler){writes.push(tiddler);}};
 function Widget(){}
 Widget.prototype.initialise=function(){};
 Widget.prototype.computeAttributes=function(){return {};};
 const makeNode=(tag)=>{
  const node={tagName:tag,className:"",children:[],attributes:{},listeners:{},textContent:"",title:"",
   addEventListener(name,handler){this.listeners[name]=handler;},
   setAttribute(name,value){this.attributes[name]=value;},
   appendChild(child){this.children.push(child);return child;},
   focus(){},
   click(){this.listeners.click?.();}};
  return node;
 };
 const doc={createElement:makeNode};
 const exports={};
 runInNewContext(widgetCode,{
  exports,document:doc,
  require(name){
   if(name==="$:/core/modules/widgets/widget.js")return {widget:Widget};
   if(name==="$:/plugins/huwiki/abc/score-view.js")return view;
   if(name==="$:/plugins/huwiki/abc/i18n.js")return {language(){return language;}};
   if(name==="$:/plugins/huwiki/abc/playback.js")return {stopOne(){}};
   return {};
  }
 });
 const ABC=exports["huwiki-abc"];
 const reader=Object.create(ABC.prototype);
 reader.attrs={tiddler:"A · Old import"};
 reader.wiki=wiki;
 reader.getAttribute=function(name,fallback){return this.attrs[name]??fallback;};
 reader.getVariable=function(name,fallback){
  if(name==="currentTiddler"||name==="storyTiddler")return this.attrs.tiddler;
  return fallback;
 };
 reader.host=makeNode("section");
 reader.refreshSelf=function(){this.execute();this.drawViewToggle();};
 return {reader,ABC,wiki,writes,tiddlers};
}

test("Unconfigured ABC widgets default to minimal but explicit full views still work",()=>{
 assert.equal(view.resolve({},{}).view,"minimal");
 assert.equal(view.resolve({},{}).audio,true);
 assert.equal(view.resolve({view:"full"},{}).view,"full");
 assert.equal(view.resolve({view:"full",embedded:"yes"},{"abc-view":"minimal"}).view,"full");
 assert.equal(view.resolve({},{"abc-view":"full"}).view,"full","explicitly stored full view is still supported for non-standalone widgets");
 assert.equal(packed["$:/plugins/huwiki/abc/score-view.js"].text,viewCode);
});

test("Ordinary opened scores start minimal despite older abc-view:full field",()=>{
 const {reader,tiddlers}=fixture();
 reader.execute();
 assert.equal(reader._standaloneView,true);
 assert.equal(reader._scoreView.view,"minimal");
 assert.equal(reader._scoreView.audio,true);
 assert.equal(reader._scoreView.showTitle,true);
 assert.equal(tiddlers["A · Old import"].fields["abc-view"],"full","original source field remains intact");
 reader.attrs.tiddler="Second tune";
 reader.execute();
 assert.equal(reader._scoreView.view,"minimal","another tune must start minimized");
});

test("Advanced mode only lasts in the current reader and does not write original ABC",()=>{
 const {reader,writes,tiddlers}=fixture();
 reader.execute();
 reader.drawViewToggle();
 let control=reader.host.children.at(-1).children.at(-1);
 assert.equal(control.textContent,"Avanceret visning");
 assert.equal(control.attributes["aria-label"],"Skift til avanceret visning");
 control.click();
 assert.equal(reader._manualMode,"full");
 assert.equal(reader._scoreView.view,"full");
 assert.equal(reader.host.children.at(-1).children.at(-1).textContent,"Normal visning");
 assert.equal(reader.host.children.at(-1).children.at(-1).attributes["aria-label"],"Skift til normal visning");
 reader.host.children.at(-1).children.at(-1).click();
 assert.equal(reader._scoreView.view,"minimal");
 assert.equal(writes.length,0,"changing the view must not create or edit a tiddler");
 assert.equal(tiddlers["A · Old import"].fields["abc-view"],"full");
});

test("English interface uses Advanced view rather than Normal view",()=>{
 const {reader}=fixture("en");
 reader.execute();reader.drawViewToggle();
 assert.equal(reader.host.children.at(-1).children.at(-1).textContent,"Advanced view");
 reader.host.children.at(-1).children.at(-1).click();
 assert.equal(reader.host.children.at(-1).children.at(-1).textContent,"Normal view");
});

test("Explicit full embedded nodebooks stay in full notation mode",()=>{
 const {reader}=fixture();
 reader.attrs={tiddler:"A · Old import",view:"full",embedded:"yes"};
 reader.execute();
 assert.equal(reader._standaloneView,false);
 assert.equal(reader._scoreView.view,"full");
 assert.equal(reader._scoreView.minimal,false);
 assert.ok(widgetCode.includes("view:this._manualMode||'minimal'"));
 assert.ok(!widgetCode.includes("new $tw.Tiddler(current,{'abc-view':next})"));
});

test("Page-count picker is reserved for Nodepult, with the editor unaffected",async()=>{
 const source=await readFile(path.join(root,"plugins/abc/src/ReaderMode.tid"),"utf8");
 assert.ok(source.includes(".huwabc-page-shell:not(.huwabc-page-is-desk):not(.huwabc-page-editor)"));
 assert.ok(source.includes(".huwabc-page-choice:first-child"));
 assert.equal(packed["$:/plugins/huwiki/abc/ReaderMode"].text,source.slice(source.indexOf("\n\n")+2));
});

test("ABC Musik resolves a saved chord-only mode with audio enabled",()=>{
 const result=view.resolve({},{"abc-view":"chords","abc-source":"X:1\\nK:Am\\n\"E7\"z2 \"Am\"z2 |"});
 assert.equal(result.view,"chords");
 assert.equal(result.minimal,true);
 assert.equal(result.audio,true);
});


test("Standalone chord-only charts preserve their initial view while ordinary full imports remain minimal",()=>{
 assert.ok(widgetCode.includes("t.fields['abc-view']==='chords'?'chords':'minimal'"));
 assert.ok(widgetCode.includes("current.fields['abc-view']==='chords'?'chords':'minimal'"));
 assert.ok(widgetCode.includes("self.wiki.getTiddler(self.title)?.fields['abc-view']==='chords'?'chords':'minimal'"));
});
