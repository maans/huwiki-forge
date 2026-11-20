import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const source=await readFile(new URL('../plugins/abc/src/edit-widget.js',import.meta.url),'utf8');
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
class Tiddler{constructor(...values){this.fields=Object.assign({},...values.map(value=>value.fields||value));}}

// Mount the actual editor, keeping only its dependent panels and device
// boundary small. A mounted accompaniment panel owns its own manual drone;
// destroying a score preview cannot release that separate resource for it.
function fixture({fontPending=false}={}){
 const doc=svgDocument(),notation=deferred(),font=deferred(),timers=new Map();
 let timerId=0,fontRequests=0,notationRenders=0,dronePlaying=false,accompanimentDisposals=0;
 const records={Draft:{title:'Draft','draft.of':'Score','abc-source':'X:1\nK:C\nC D E F|'},Score:{title:'Score','abc-source':'X:1\nK:C\nC D E F|'}},writes=[];
 const wiki={getTiddler:title=>records[title]?new Tiddler(records[title]):null,getTiddlerText:(_title,fallback='')=>fallback,addTiddler(t){records[t.fields.title]={...t.fields};writes.push(t.fields.title);}};
 function Widget(){}
 Widget.prototype.initialise=function(_tree,options){this.wiki=options.wiki;this.domNodes=[];};
 Widget.prototype.computeAttributes=()=>({});
 Widget.prototype.getAttribute=()=> 'Draft';
 Widget.prototype.getVariable=()=> 'Draft';
 Widget.prototype.removeChildDomNodes=function(){this.domNodes.forEach(node=>node.remove());this.domNodes=[];};
 const ABC={parseOnly:()=>[{warnings:[]}],renderAbc(stage){notationRenders++;stage.appendChild(doc.createElement('svg'));return [{warnings:[]}];}};
 const tools={getSource:(w,title)=>w.getTiddler(title).fields['abc-source'],header:(text,key)=>new RegExp('^'+key+':(.*)$','m').exec(text)?.[1]||'',load:()=>notation.promise};
 const tabs={mount:()=>({enabled:()=>false,config:()=>({}),availability(){}}),options:()=>({options:[]}),notation:{link:value=>value}};
 const deps={
  '$:/core/modules/widgets/widget.js':{widget:Widget},
  '$:/plugins/huwiki/abc/i18n.js':{language:()=> 'da',noteName:()=> 'C',observe:()=>({destroy(){}})},
  '$:/plugins/huwiki/abc/score-text.js':{bind:()=>[]},
  '$:/plugins/huwiki/abc/selection-popover.js':{mount:()=>({hide(){},destroy(){}})},
  '$:/plugins/huwiki/abc/page-view.js':{mount:preview=>({viewport:preview.parentNode,layout(){},destroy(){}})},
  '$:/plugins/huwiki/abc/view-state.js':{mount:()=>({destroy(){}})},
  '$:/plugins/huwiki/abc/loader.js':tools,
  '$:/plugins/huwiki/abc/editor-model.js':{build:()=>({events:[],items:[]})},
  '$:/plugins/huwiki/abc/entry-model.js':{},
  '$:/plugins/huwiki/abc/piano.js':{mountKeyboard:()=>({clear(){}})},
  '$:/plugins/huwiki/abc/tabs.js':tabs,
  '$:/plugins/huwiki/abc/transpose.js':{mount:()=>({sync(){}})},
  '$:/plugins/huwiki/abc/source-assist.js':{mount:()=>({setSelection(){},update(){}})},
  '$:/plugins/huwiki/abc/jazz-font.js':{ready(){fontRequests++;return fontPending?font.promise:Promise.resolve();},render:(_lib,_jazz,draw)=>draw(),formatFonts:(_jazz,format)=>format},
  '$:/plugins/huwiki/abc/sheet-layout.js':{mount(){},options:()=>({})},
  '$:/plugins/huwiki/abc/voice-names.js':{mount:()=>({update(){}}),scan:()=>[]},
  '$:/plugins/huwiki/abc/accompaniment.js':{mount(host){
   const element=doc.createElement('section'),button=doc.createElement('button');button.className='huwabc-drone-toggle';button.textContent='Start drone';
   button.addEventListener('click',()=>{dronePlaying=true;});element.appendChild(button);host.appendChild(element);
   return {element,destroy(){accompanimentDisposals++;dronePlaying=false;}};
  }},
  '$:/plugins/huwiki/abc/keyboard-shortcuts.js':{register:()=>()=>{}}
 };
 const api={};runInNewContext(source,{exports:api,require:name=>{assert.ok(deps[name],name);return deps[name];},document:doc,window:doc.defaultView,$tw:{Tiddler},
  setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const Editor=api['huwiki-abc-edit'],editor=new Editor({}, {wiki});editor.render(doc.body,null);
 return {editor,doc,notation,font,ABC,timers,records,writes,
  get fontRequests(){return fontRequests;},get notationRenders(){return notationRenders;},get dronePlaying(){return dronePlaying;},get accompanimentDisposals(){return accompanimentDisposals;},
  async load(){notation.resolve(ABC);await flush();},
  edit(value){const input=editor.host.querySelector('.huwabc-code');input.value=value;input.dispatch('input');}
 };
}

test('closing the editor releases a manually started accompaniment drone exactly once',async()=>{
 const f=fixture();await f.load();assert.equal(f.notationRenders,1);
 f.editor.host.querySelector('.huwabc-drone-toggle').click();assert.equal(f.dronePlaying,true);
 f.editor.onDestroy();assert.equal(f.dronePlaying,false);assert.equal(f.accompanimentDisposals,1);
 f.editor.removeChildDomNodes();f.editor.onDestroy();
 assert.equal(f.accompanimentDisposals,1,'explicit workshop teardown and normal widget removal can both run safely');
 assert.equal(f.doc.querySelector('.huwabc-edit-workshop'),null);assert.deepEqual(f.writes,[],'teardown never saves a draft');
});

test('removing a pending editor cancels its redraw and does not load fonts or render after close',async()=>{
 const f=fixture(),original=f.records.Score['abc-source'];
 f.edit('X:1\nK:D\nD E F G|');assert.equal(f.timers.size,1,'typing queues one redraw');
 f.editor.host.querySelector('.huwabc-drone-toggle').click();f.editor.removeChildDomNodes();
 assert.equal(f.timers.size,0);assert.equal(f.dronePlaying,false);assert.equal(f.accompanimentDisposals,1);
 const writesBefore=[...f.writes];await f.load();
 assert.equal(f.fontRequests,0);assert.equal(f.notationRenders,0);assert.deepEqual(f.writes,writesBefore);
 assert.equal(f.records.Score['abc-source'],original,'edits and teardown affect only the draft');
});

test('a font response after explicit workshop teardown cannot render into its still-connected editor',async()=>{
 const f=fixture({fontPending:true});await f.load();assert.equal(f.fontRequests,1);assert.equal(f.notationRenders,0);
 const host=f.editor.host;f.editor.onDestroy();assert.equal(host.isConnected,true,'the workshop removes its DOM after calling onDestroy');
 f.font.resolve();await flush();
 assert.equal(f.notationRenders,0);assert.deepEqual(f.writes,[]);f.editor.removeChildDomNodes();
});
