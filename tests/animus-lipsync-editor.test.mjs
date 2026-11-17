import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../plugins/musical/src/manuscript.js',import.meta.url),'utf8');
class Tiddler {constructor(...values){this.fields=Object.assign({},...values.filter(Boolean).map(value=>value.fields||value));}}
function wiki(initial={}){
 const records=structuredClone(initial),writes=[];
 return {records,writes,getTiddler:title=>records[title]?new Tiddler(records[title]):null,
  getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,
  addTiddler(tiddler){records[tiddler.fields.title]=structuredClone(tiddler.fields);writes.push(tiddler.fields.title);}
 };
}
// The matching algorithm has separate runtime tests. Here deterministic actor
// suggestions isolate the editor's event handlers, draft boundaries and writes.
const matching={
 actors(scene){return scene.parts.filter(p=>p.type==='group'&&p.id.startsWith('actor-')).map(p=>({id:p.id,label:p.name,open:p.id+'-mouth-open',closed:p.id+'-mouth-closed'}));},
 suggest(scene,text){const prefix=/^\s*([^:]+):/.exec(text)?.[1]?.trim().toLowerCase();return prefix?this.actors(scene).filter(a=>a.label.toLowerCase()===prefix):[];}
};
function api(matcher=matching){const exports={};runInNewContext(source,{exports,$tw:{Tiddler},require:id=>{assert.equal(id,'$:/plugins/huwiki/musical/lipsync.js');return matcher;}});return exports;}

class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.className='';this.parentNode=null;this.attributes={};this._text='';this.listeners={};this.style={};
  this.classList={add:(...xs)=>{for(const x of xs)this.classList.toggle(x,true);},remove:(...xs)=>{for(const x of xs)this.classList.toggle(x,false);},toggle:(x,on)=>{let values=this.className.split(/\s+/).filter(Boolean);if(on===undefined)on=!values.includes(x);values=values.filter(v=>v!==x);if(on)values.push(x);this.className=values.join(' ');return on;}};
 }
 appendChild(child){child.parentNode=this;this.children.push(child);return child;}
 set textContent(text){this._text=String(text);for(const child of this.children)child.parentNode=null;this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 setAttribute(name,value){this.attributes[name]=String(value);}
 addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
 dispatch(type){if(this.disabled)return;const event={target:this,currentTarget:this,preventDefault(){},stopPropagation(){}};for(const listener of this.listeners[type]||[])listener(event);}
 focus(){}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){
  const result=[],tokens=selector.replaceAll('>',' ').trim().split(/\s+/);
  function simple(node,token){
   const tag=/^[\w-]+/.exec(token)?.[0];if(tag&&node.tagName!==tag.toUpperCase())return false;
   for(const [,cls] of token.matchAll(/\.([\w-]+)/g))if(!node.className.split(/\s+/).includes(cls))return false;
   for(const [,key,,value] of token.matchAll(/\[([^=\]]+)(=([^\]]+))?\]/g))if(value!==undefined&&String(node[key]??node.attributes[key])!==value.replace(/^['"]|['"]$/g,''))return false;
   return true;
  }
  function matches(node){if(!simple(node,tokens.at(-1)))return false;let ancestor=node.parentNode;for(let i=tokens.length-2;i>=0;i--){while(ancestor&&!simple(ancestor,tokens[i]))ancestor=ancestor.parentNode;if(!ancestor)return false;ancestor=ancestor.parentNode;}return true;}
  function walk(node){for(const child of node.children){if(matches(child))result.push(child);walk(child);}}walk(this);return result;
 }
}
function doc(){let confirms=0,answer=true;return {createElement:tag=>new Node(tag),defaultView:{confirm(){confirms++;return answer;}},setConfirm(value){answer=value;},get confirms(){return confirms;}};}
function click(root,caption){const button=root.querySelectorAll('button').find(n=>n.textContent===caption);assert.ok(button,'Missing button: '+caption);button.dispatch('click');}
function control(f,cls){const node=f.host.querySelector('.huw-script-lipsync-'+cls);assert.ok(node,'Missing lip sync control: '+cls);return node;}
function change(f,cls,value,event='change'){const node=control(f,cls);if(cls==='enable')node.checked=value;else node.value=String(value);node.dispatch(event);}
function chooseCue(f,index=0){const cue=f.host.querySelectorAll('.huw-script-cue')[index];assert.ok(cue,'Missing cue '+index);cue.dispatch('click');}
function text(f,value){const node=f.host.querySelector('.huw-script-line-input');node.value=value;node.dispatch('input');}
function actor(id,name){return [{id,name,type:'group',parent:null,keys:[]},{id:id+'-mouth-open',name:'Mund åben',type:'ellipse',parent:id,keys:[]},{id:id+'-mouth-closed',name:'Mund lukket',type:'path',parent:id,keys:[]}];}
function line(id,text){return {id,name:id,type:'text',text,parent:null,keys:[{t:0,opacity:0},{t:1,opacity:1},{t:5,opacity:0}]};}
function fixture({nested=false,parts,language='da-DK',matcher=matching}={}){
 const scene={name:'Scene',duration:8,parts:parts||[...actor('actor-alma','Alma'),...actor('actor-bo','Bo'),line('spoken-0','ALMA: Aaaaaa.')]};
 const film=nested?{name:'Show',duration:8,parts:[],scenes:[{id:'scene-clip',source:'Scene',duration:8}],musical:{audioClips:[]}}:{...scene,musical:{audioClips:[]}};
 const initial={Film:{title:'Film',type:'application/json',text:JSON.stringify(film)},'$:/language':{title:'$:/language',text:'$:/languages/'+language}};
 if(nested)initial.Scene={title:'Scene',type:'application/json',text:JSON.stringify(scene)};
 const w=wiki(initial),d=doc(),host=new Node('main'),writes=[];let reloads=0,position=0;
 const options={doc:d,host,wiki:w,film,sceneTitle:'Film',pause(){},position:()=>position,seek:t=>{position=t;},markOwnWrite:(title,value)=>writes.push({title,value}),reload(){reloads++;},repaint(){}};
 const editor=api(matcher),ui=editor.mount(options);
 return {ui,editor,host,w,d,options,writes,get reloads(){return reloads;},get saved(){return JSON.parse(w.records[nested?'Scene':'Film'].text);},get film(){return JSON.parse(w.records.Film.text);}};
}
function config(f,id='spoken-0'){return f.saved.parts.find(p=>p.id===id).lipSync;}
function save(f){click(f.host,'Gem og tilbage');}

test('opening a suggested line and saving without opting in never enables lip sync',()=>{
 const f=fixture();f.ui.open();chooseCue(f);
 assert.equal(control(f,'enable').checked,false);assert.equal(control(f,'actor').value,'actor-alma');assert.equal(control(f,'actor').disabled,true);
 save(f);assert.equal(config(f),undefined);assert.equal(f.w.writes.length,0);
});

test('enable, actor, mouth and timing controls persist together and reopen faithfully',()=>{
 const f=fixture({nested:true});f.ui.open();chooseCue(f);change(f,'enable',true);
 assert.equal(control(f,'actor').disabled,false);assert.equal(control(f,'open').value,'actor-alma-mouth-open');
 change(f,'actor','actor-bo');change(f,'open','actor-bo-mouth-open');change(f,'closed','actor-bo-mouth-closed');change(f,'timing','script');change(f,'offset',.25);change(f,'strength',60,'input');save(f);
 assert.deepEqual(config(f),{enabled:true,target:'actor-bo',open:'actor-bo-mouth-open',closed:'actor-bo-mouth-closed',timing:'script',offset:.25,strength:.6});
 assert.deepEqual(f.w.writes,['Scene']);assert.equal(f.reloads,1);
 f.ui.open();chooseCue(f);assert.equal(control(f,'enable').checked,true);assert.equal(control(f,'actor').value,'actor-bo');assert.equal(control(f,'timing').value,'script');assert.equal(control(f,'offset').value,'0.25');assert.equal(control(f,'strength').value,'60');
});

test('cancel keeps original scene intact and asks only while an edited draft exists',()=>{
 const f=fixture(),original=f.w.records.Film.text;f.ui.open();chooseCue(f);change(f,'enable',true);text(f,'ALMA: Edited draft.');
 assert.equal(f.w.records.Film.text,original);f.d.setConfirm(false);click(f.host,'Annuller');assert.equal(f.ui.isOpen(),true);
 f.d.setConfirm(true);click(f.host,'Annuller');assert.equal(f.ui.isOpen(),false);assert.equal(f.w.records.Film.text,original);assert.equal(f.w.writes.length,0);
 f.ui.open();chooseCue(f);assert.equal(control(f,'enable').checked,false);assert.equal(f.host.querySelector('.huw-script-line-input').value,'ALMA: Aaaaaa.');
 const prior=f.d.confirms;f.ui.dispose();assert.equal(f.d.confirms,prior);assert.equal(f.ui.isOpen(),false);
});

test('explicitly disabling survives text edits, role assignment, save and reopening',()=>{
 const f=fixture();f.ui.open();chooseCue(f);change(f,'enable',true);save(f);f.ui.open();chooseCue(f);change(f,'enable',false);text(f,'ALMA: A new line.');
 click(f.host,'Fordel taleroller');assert.equal(control(f,'enable').checked,false);save(f);
 assert.equal(config(f).enabled,false);assert.equal(config(f).target,'actor-alma');f.ui.open();chooseCue(f);assert.equal(control(f,'enable').checked,false);
});

test('role assignment is explicit and resolves only a single matching figure with a mouth',()=>{
 const kept={enabled:false,target:'actor-bo',open:'actor-bo-mouth-open',closed:'',timing:'script',offset:1,strength:.5};
 const parts=[...actor('actor-alma','Alma'),...actor('actor-bo','Bo'),...actor('actor-twin1','Twin'),...actor('actor-twin2','Twin'),...actor('actor-chorus','Kor'),line('spoken-0','ALMA: Hello.'),line('spoken-1','TWIN: Which one?'),line('spoken-2','KOR: Everyone.'),line('spoken-3','UNKNOWN: Unknown.'),{...line('spoken-4','BO: Leave this.'),lipSync:kept},line('song-line-0','ALMA: A song.')];
 const f=fixture({parts});f.ui.open();assert.equal(config(f),undefined);click(f.host,'Fordel taleroller');assert.match(f.host.querySelector('.huw-script-status').textContent,/Replikker fordelt: 1/);save(f);
 assert.equal(config(f).target,'actor-alma');for(const id of ['spoken-1','spoken-2','spoken-3','song-line-0'])assert.equal(config(f,id),undefined,id);assert.deepEqual(config(f,'spoken-4'),kept);
});

test('custom SVG groups and unnamed mouth layers can be manually bound',()=>{
 const parts=[{id:'drawing',name:'Imported figure',type:'group',parent:null,keys:[]},{id:'layer-7',name:'Shape 7',type:'ellipse',parent:'drawing',keys:[]},{id:'layer-8',name:'Shape 8',type:'path',parent:'drawing',keys:[]},line('spoken-0','SOMEONE: Hello.')];
 const f=fixture({parts});f.ui.open();chooseCue(f);change(f,'enable',true);change(f,'actor','drawing');change(f,'open','layer-7');change(f,'closed','layer-8');save(f);
 assert.equal(f.ui.isOpen(),false);assert.equal(config(f).target,'drawing');assert.equal(config(f).open,'layer-7');assert.equal(config(f).closed,'layer-8');
});

test('invalid duplicate mouths prevent save and keep the draft available to repair',()=>{
 const f=fixture();f.ui.open();chooseCue(f);change(f,'enable',true);change(f,'closed','actor-alma-mouth-open');save(f);
 assert.equal(f.ui.isOpen(),true);assert.equal(f.w.writes.length,0);assert.match(f.host.querySelector('.huw-script-status').textContent,/lukkede mund skal være en anden/);
 change(f,'closed','');save(f);assert.equal(config(f).closed,'');assert.equal(f.ui.isOpen(),false);
});

test('a single-root scene saves lip sync and common caption style in one write',()=>{
 const f=fixture();f.ui.open();chooseCue(f);change(f,'enable',true);const size=f.host.querySelector('.huw-script-common').querySelector('input');size.value='130';size.dispatch('input');save(f);
 assert.equal(config(f).enabled,true);assert.equal(f.film.musical.captionStyle.scale,1.3);assert.deepEqual(f.w.writes,['Film']);assert.equal(f.writes.length,1);assert.equal(f.options.film.parts.find(p=>p.id==='spoken-0').lipSync.enabled,true);
});

test('saving script edits retains a recording made while the manuscript was open',()=>{
 const f=fixture();f.ui.open();chooseCue(f);change(f,'enable',true);text(f,'ALMA: Newly recorded words.');
 const current=f.film;current.musical.audioClips.push({id:'voice',asset:'Audio/voice',cueId:'spoken-0',sceneTitle:'Film',start:1,offset:0,duration:4,volume:1});current.musical.someOtherSetting='keep';f.w.records.Film.text=JSON.stringify(current);
 save(f);assert.equal(config(f).enabled,true);assert.equal(f.film.musical.audioClips.length,1);assert.equal(f.film.musical.audioClips[0].asset,'Audio/voice');assert.equal(f.film.musical.someOtherSetting,'keep');
});

test('scene changes from another editor cannot be silently overwritten by a stale script draft',()=>{
 const f=fixture();f.ui.open();chooseCue(f);change(f,'enable',true);const current=f.film;current.parts[0].name='A renamed figure';f.w.records.Film.text=JSON.stringify(current);save(f);
 assert.equal(f.ui.isOpen(),true);assert.equal(f.w.writes.length,0);assert.equal(f.film.parts[0].name,'A renamed figure');assert.match(f.host.querySelector('.huw-script-status').textContent,/Scener ændret andetsteds/);
});

test('English lip sync labels and save action are available',()=>{
 const f=fixture({language:'en-GB'});f.ui.open();chooseCue(f);assert.ok(f.host.textContent.includes('Lip sync'));assert.ok(f.host.textContent.includes('Linked recording, otherwise script'));change(f,'enable',true);click(f.host,'Save and return');assert.equal(config(f).enabled,true);
});

test('the real runtime actor suggestions produce a valid editor binding without manual mouth selection',async()=>{
 const runtimeSource=await readFile(new URL('../plugins/musical/src/lipsync.js',import.meta.url),'utf8'),runtime={};
 runInNewContext(runtimeSource,{exports:runtime,require:id=>{assert.equal(id,'$:/plugins/huwiki/cutout/engine.js');return {};}});
 const f=fixture({matcher:runtime});f.ui.open();chooseCue(f);change(f,'enable',true);save(f);
 assert.deepEqual(config(f),{enabled:true,target:'actor-alma',open:'actor-alma-mouth-open',closed:'actor-alma-mouth-closed',timing:'auto',offset:0,strength:1});
 const isolated=fixture({matcher:runtime,parts:[{id:'mouth-sprite',name:'Mund åben',type:'image',parent:null,variants:[],keys:[]},line('spoken-0','MUND ÅBEN: Hello.')]});
 isolated.ui.open();chooseCue(isolated);change(isolated,'enable',true);save(isolated);
 assert.equal(isolated.ui.isOpen(),false);assert.equal(config(isolated).open,'mouth-sprite');assert.equal(config(isolated).target,'mouth-sprite');
 const chorus=fixture({matcher:runtime,parts:[...actor('actor-alma','Alma'),line('spoken-0','KOR (alle): Together.')]});
 chorus.ui.open();click(chorus.host,'Fordel taleroller');chooseCue(chorus);change(chorus,'enable',true);
 assert.equal(control(chorus,'actor').value,'','Even a single actor does not automatically represent a chorus');assert.equal(chorus.w.writes.length,0);
});

for(const heading of ['!!!','#!!'])test('scene notes use '+heading+' manuscript headings and keep identically named scenes in their own acts',()=>{
 const f=fixture(),names=['Fyrtøjet · Akt 1 scene 1 · Hallen','Fyrtøjet · Akt 1 scene 2 · Haven','Fyrtøjet · Akt 2 scene 1 · Hallen'];
 f.options.film.scenes=names.map(source=>({source,duration:8}));f.options.film.parts=[];f.options.film.duration=24;
 names.forEach(title=>{f.w.records[title]={title,type:'application/json',text:JSON.stringify({name:'Fyrtøjet · '+title.split(' · ').at(-1),duration:8,parts:[]})};});
 f.w.records['Fyrtøjet · Manuskript']={title:'Fyrtøjet · Manuskript',text:[
  '!! AKT 1 — Begyndelsen',heading+' Scene 1.1 — Hallen',"''Handling:'' Første møde.","''Instruktion:'' Kig mod døren.","''Lydeffekter:'' Fodtrin.",
  heading+' Scene 1.2 — Haven',"''Handling:'' En tur i haven.",
  '!! AKT 2 — Hjemkomsten',"''Instruktion:'' Dette er en aktinstruktion, ikke havens note.",heading+' Scene 2.1 — Hallen',"''Handling:'' Nu er hallen tom.","''Instruktion:'' Luk døren.","''Lydeffekter:'' Stilhed."
 ].join('\r\n\r\n')};
 f.ui.open();const expected=['Handling: Første møde.\n\nInstruktion: Kig mod døren.\n\nLydeffekter: Fodtrin.','Handling: En tur i haven.','Handling: Nu er hallen tom.\n\nInstruktion: Luk døren.\n\nLydeffekter: Stilhed.'];
 for(let i=0;i<names.length;i++){f.host.querySelectorAll('.huw-script-scene')[i].dispatch('click');assert.equal(f.host.querySelector('.huw-script-scene-notes').value,expected[i]);}
 assert.equal(f.w.writes.length,0,'Reading existing manuscript notes does not save or overwrite scenes');
});

test('explicit saved scene notes take precedence over manuscript fallback text',()=>{
 const f=fixture();f.options.film.name='Fyrtøjet · Hallen';f.options.film.sceneNotes='My saved direction';
 f.w.records['Fyrtøjet · Manuskript']={title:'Fyrtøjet · Manuskript',text:"!!! Scene 1.1 — Hallen\n\n''Handling:'' Original direction."};
 f.ui.open();assert.equal(f.host.querySelector('.huw-script-scene-notes').value,'My saved direction');
});
