import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=(await readFile(new URL('../demo/demo.mjs',import.meta.url),'utf8')).replace(/^import .+;\s*$/mg,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('returning to the demo keeps the live editable iframe and its object URL',async()=>{
 const liveUrls=new Set(),revoked=[],frames=[],nodes=new Map();let builds=0;
 class DemoURL extends URL {
  static createObjectURL(){const value='blob:demo-'+liveUrls.size;liveUrls.add(value);return value;}
  static revokeObjectURL(value){liveUrls.delete(value);revoked.push(value);}
 }
 class Element extends EventTarget {
  constructor(){super();this.style={};}
  set src(value){this.url=value;frames.push(value);queueMicrotask(()=>this.dispatchEvent(new Event('load')));}
  get src(){return this.url;}
 }
 for(const id of ['status','note','customize','name','wiki','error'])nodes.set(id,new Element());
 const window=new EventTarget();
 runInNewContext(source,{
  URL:DemoURL,Blob,window,
  location:{href:'https://forge.example.test/demo/?edition=turn-around&lang=da'},
  navigator:{languages:['da-DK']},
  document:{documentElement:{},getElementById:id=>nodes.get(id)},
  fetch(){throw Error('Unexpected network access');},
  loadChoices:async()=>({editions:[{id:'turn-around',name:'Turn Around'}]}),
  loadOfficialCore:async()=>({html:'core'}),
  composeWiki:async()=>({manifest:{id:'turn-around'},tiddlers:[]}),
  assembleHtml:()=>{builds++;return '<p>Editable wiki</p>';}
 });
 await tick();
 const frame=nodes.get('wiki'),initial=frame.src;frame.unsavedEdits={title:'My scene'};
 assert.ok(liveUrls.has(initial));assert.equal(nodes.get('status').textContent,'Demo klar');
 for(let i=0;i<3;i++){
  const hide=new Event('pagehide');hide.persisted=true;window.dispatchEvent(hide);
  const show=new Event('pageshow');show.persisted=true;window.dispatchEvent(show);
 }
 assert.ok(liveUrls.has(initial),'page-cache return still has a loadable iframe URL');
 assert.deepEqual(revoked,[]);assert.deepEqual(frames,[initial]);assert.equal(builds,1);
 assert.deepEqual(frame.unsavedEdits,{title:'My scene'});
});
