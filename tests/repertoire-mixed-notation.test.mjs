import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root=new URL('../plugins/repertoire/src/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const json=value=>JSON.parse(JSON.stringify(value));
class Tiddler {constructor(...values){this.fields=Object.assign({},...values.map(v=>v?.fields||v));}}
const $tw={Tiddler,utils:{stringifyList:items=>items.map(x=>/\s/.test(x)?'[['+x+']]':x).join(' ')}};
function wikiFixture(records=[]){
 const rows=new Map(records.map(fields=>[fields.title,new Tiddler(fields)]));
 return {rows,allTitles:()=>[...rows.keys()],getTiddler:title=>rows.get(title),tiddlerExists:title=>rows.has(title),getCreationFields:()=>({}),
  addTiddler:t=>rows.set(t.fields.title,t),getTiddlerText:(title,fallback='')=>rows.get(title)?.fields.text??fallback,
  getTiddlerList:(title,field='list')=>Array.from(String(rows.get(title)?.fields[field]||'').matchAll(/\[\[([^\]]*)\]\]|([^\s]+)/g),m=>m[1]||m[2])};
}
async function libraries(){
 const model={},layout={};
 runInNewContext(await read('model.js'),{exports:model,$tw});
 runInNewContext(await read('book-layout.js'),{exports:layout});
 return {model,layout};
}

test('PDF, ABC and leadsheet views share one canonical song and preserve a mixed setlist',async()=>{
 const {model}=await libraries(),wiki=wikiFixture([
  {title:'PDF chart','repertoire-pdf':'pdf/chart.pdf'},
  {title:'ABC chart','abc-source':'X:1\nT:ABC chart\nK:C\nC4|'},
  {title:'Both versions','abc-source':'X:1\nK:F\nF4|','repertoire-pdf':'pdf/both.pdf','repertoire-category':'leadsheet','repertoire-abc-label':'Leadsheet'},
  {title:'Raw PDF',type:'application/pdf',_canonical_uri:'pdf/raw.pdf'},
  {title:'Extra leadsheet','repertoire-pdf':'pdf/lead.pdf','repertoire-has-leadsheet':'yes'},
  {title:'Unrelated note',text:'Not music'}
 ]);
 assert.deepEqual(Array.from(model.songs(wiki),t=>t.fields.title),['ABC chart','Both versions','Extra leadsheet','PDF chart','Raw PDF']);
 assert.equal(model.notation(wiki,'PDF chart').abc,false);assert.equal(model.notation(wiki,'PDF chart').pdf,'pdf/chart.pdf');
 assert.equal(model.notation(wiki,'Both versions').abc,true);assert.equal(model.notation(wiki,'Both versions').pdf,'pdf/both.pdf');
 assert.equal(model.notation(wiki,'Both versions').abcLabel,'Leadsheet');
 assert.equal(model.category(wiki.getTiddler('Both versions')),'leadsheet');assert.equal(model.category(wiki.getTiddler('Extra leadsheet')),'leadsheet');
 assert.ok(model.notation(wiki,'Raw PDF').pdf);
 const titles=()=>Array.from(model.songs(wiki),t=>t.fields.title);
 assert.deepEqual(titles().filter(title=>model.matches(wiki,title,{format:'abc',category:'all'})),['ABC chart','Both versions']);
 assert.deepEqual(titles().filter(title=>model.matches(wiki,title,{format:'pdf',category:'all'})),['Both versions','Extra leadsheet','PDF chart','Raw PDF']);
 assert.deepEqual(titles().filter(title=>model.matches(wiki,title,{format:'all',category:'leadsheet'})),['Both versions','Extra leadsheet']);
 const orch=model.orchestra(wiki,'Birdland'),items=['ABC chart','PDF chart','Both versions'].map(title=>model.addItem(wiki,orch,title).title),set=model.createSetlist(wiki,orch,'Mixed concert');
 model.setEntries(wiki,set,[...items,items[2]]);
 const before=JSON.stringify([...wiki.rows.values()].map(t=>t.fields));
 assert.deepEqual(Array.from(model.entries(wiki,set)),items);
 model.matches(wiki,'Both versions',{format:'pdf',category:'leadsheet'});model.notation(wiki,'Both versions');
 assert.equal(JSON.stringify([...wiki.rows.values()].map(t=>t.fields)),before,'view/filter resolution never copies or rewrites canonical songs');
});

async function pdfFixture(){
 const {model,layout}=await libraries(),pdf={},doc=svgDocument(),listeners=new Map(),posts=[],states=[],boundaries=[];
 const win=doc.defaultView;
 Object.assign(win,{location:new URL('https://example.test/wiki/birdland/guitar/'),URL,
  addEventListener(type,fn){const set=listeners.get(type)||new Set();set.add(fn);listeners.set(type,set);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  Event:class {constructor(type){this.type=type;}},innerWidth:1180,innerHeight:820});
 const create=doc.createElement;
 doc.createElement=tag=>{const node=create(tag);if(tag==='iframe')node.contentWindow={postMessage(message,origin){posts.push({message:json(message),origin});}};return node;};
 const wiki=wikiFixture([{'title':'$:/config/maans/repertoire/pdf-viewer',text:'/wiki/birdland/pdf-viewer/'}]);
 const host=doc.createElement('main');doc.body.appendChild(host);
 runInNewContext(await read('pdf-score.js'),{exports:pdf,URL,window:win,document:doc,console});
 const pager=pdf.mount(host,{wiki,source:'pdf/four-brothers.pdf',title:'Four Brothers',spread:2,onState:s=>states.push(json(s)),onBoundary:direction=>boundaries.push(direction)});
 const frame=host.querySelector('iframe');assert.ok(frame,'PDF source mounts a dedicated viewer frame');
 function emit(data,{origin='https://example.test',source=frame.contentWindow}={}){for(const fn of [...listeners.get('message')||[]])fn({data,origin,source});}
 return {model,layout,pdf,pager,frame,host,doc,win,wiki,posts,states,boundaries,listeners,emit};
}

test('PDF pager uses the song excerpt, accepts only its own viewer state and releases listeners',async()=>{
 const f=await pdfFixture(),address=new URL(f.frame.getAttribute('src')||f.frame.src);
 assert.equal(address.origin,'https://example.test');assert.equal(address.pathname,'/wiki/birdland/pdf-viewer/');
 assert.equal(address.searchParams.get('file'),'https://example.test/wiki/birdland/guitar/pdf/four-brothers.pdf');
 assert.equal(address.searchParams.get('spread'),'2');assert.equal(f.pager.info().count,0);
 assert.equal(f.pager.next(),false);assert.equal(f.posts.length,0,'no commands target an unready viewer');
 f.emit({type:'birdland-pdf:ready',pages:5,page:1,spread:2},{origin:'https://other.test'});
 f.emit({type:'birdland-pdf:ready',pages:5,page:1,spread:2},{source:{}});
 assert.equal(f.pager.info().count,0,'unrelated or cross-origin frames cannot steer the music stand');
 f.emit({type:'birdland-pdf:ready',pages:5,page:1,spread:2});
 assert.equal(f.pager.info().ready,true);assert.equal(f.pager.info().count,5);assert.equal(f.pager.info().page,1);assert.equal(f.pager.info().shown,2);
 f.pager.next();assert.equal(f.posts.at(-1).message.command,'next');assert.equal(f.posts.at(-1).origin,'https://example.test');
 f.emit({type:'birdland-pdf:state',pages:5,page:3,spread:2});assert.equal(f.pager.info().page,3);
 f.pager.go(4);assert.equal(f.posts.at(-1).message.page,5,'book pager API is zero based; viewer command is one based');
 f.pager.setSpread(1);assert.equal(f.posts.at(-1).message.spread,1);
 f.emit({type:'birdland-pdf:boundary',direction:'next'});f.emit({type:'birdland-pdf:boundary',direction:'previous'});
 assert.deepEqual(f.boundaries,[1,-1]);
 f.emit({type:'birdland-pdf:boundary',direction:'next'},{origin:'https://other.test'});assert.deepEqual(f.boundaries,[1,-1]);
 const before=f.states.length;f.pager.destroy();
 f.emit({type:'birdland-pdf:state',pages:100,page:99,spread:2});assert.equal(f.states.length,before);
 assert.equal(f.listeners.get('message')?.size||0,0);assert.equal(f.host.querySelector('iframe'),null);
});

async function bookFixture(){
 const f=await pdfFixture(),bookModule={};
 function Widget(){}
 runInNewContext(await read('book-widget.js'),{exports:bookModule,$tw,require(name){
  if(name==='$:/core/modules/widgets/widget.js')return {widget:Widget};
  if(name.endsWith('/model.js'))return f.model;if(name.endsWith('/book-layout.js'))return f.layout;
  return {};
 }});
 const book=Object.create(bookModule['huwiki-repertoire-book'].prototype),selections=[];
 const orch=f.model.orchestra(f.wiki,'Birdland');
 for(const title of ['ABC before','Four Brothers','ABC after'])f.wiki.addTiddler(new Tiddler({title,'repertoire-kind':'piece'}));
 const items=['ABC before','Four Brothers','ABC after'].map(title=>f.model.addItem(f.wiki,orch,title).title),set=f.model.createSetlist(f.wiki,orch,'Mixed');f.model.setEntries(f.wiki,set,items);
 Object.assign(book,{wiki:f.wiki,document:f.doc,_win:f.win,host:f.host,_score:null,_pdfPager:f.pager,activeItem:items[1],setlistTitle:set,preference:'spread'});
 book.selectItem=(title,lastPage)=>selections.push([title,!!lastPage]);
 return {...f,book,items,selections};
}

test('PDF spreads turn 1+2 to 3+4 to 5, then cross the mixed setlist boundary',async()=>{
 const f=await bookFixture();
 f.book.turn(1);assert.equal(f.selections.length,0,'an unready PDF must not skip a song');
 f.emit({type:'birdland-pdf:ready',pages:5,page:1,spread:2});
 f.book.turn(1);assert.equal(f.posts.at(-1).message.command,'next');assert.equal(f.selections.length,0);
 f.emit({type:'birdland-pdf:state',pages:5,page:3,spread:2});
 f.book.turn(1);assert.equal(f.posts.at(-1).message.command,'next');assert.equal(f.selections.length,0);
 f.emit({type:'birdland-pdf:state',pages:5,page:5,spread:2});
 const sent=f.posts.length;f.book.turn(1);assert.equal(f.posts.length,sent);assert.deepEqual(f.selections,[[f.items[2],false]]);
 f.emit({type:'birdland-pdf:state',pages:5,page:1,spread:2});f.book.turn(-1);
 assert.deepEqual(f.selections.at(-1),[f.items[0],true],'backwards across a song boundary enters its last spread');
 f.pager.destroy();
});

test('keyboard page turns use the same PDF spread navigation',async()=>{
 const f=await bookFixture();f.emit({type:'birdland-pdf:ready',pages:5,page:1,spread:2});
 let prevented=0;const event=key=>({key,target:f.host,preventDefault(){prevented++;},stopPropagation(){}});
 f.book._onKeyDown(event('ArrowRight'));assert.equal(f.posts.at(-1)?.message.command,'next');
 f.emit({type:'birdland-pdf:state',pages:5,page:3,spread:2});f.book._onKeyDown(event('PageUp'));
 assert.equal(f.posts.at(-1)?.message.command,'previous');assert.equal(prevented,2);
 const input=f.doc.createElement('input');const before=f.posts.length;
 f.book._onKeyDown({...event('ArrowRight'),target:input});assert.equal(f.posts.length,before,'typing/selection controls retain their arrow keys');
 f.pager.destroy();
});


async function drawnBookFixture(){
 const f=await pdfFixture();f.pager.destroy();
 const notation={title:'Four Brothers','abc-source':'X:1\nT:Four Brothers\nK:F\nF4|','repertoire-pdf':'pdf/four-brothers.pdf','repertoire-sheet-format':'pdf','repertoire-category':'leadsheet','repertoire-abc-label':'Leadsheet',text:'Keep notes'};
 f.wiki.addTiddler(new Tiddler(notation));
 const orch=f.model.orchestra(f.wiki,'Birdland'),item=f.model.addItem(f.wiki,orch,notation.title).title,set=f.model.createSetlist(f.wiki,orch,'Concert');f.model.setEntries(f.wiki,set,[item]);
 const scoreInstances=[],bookExports={};function Widget(){}
 function Score(tree){this.title=tree.attributes.tiddler.value;scoreInstances.push(this);}
 Score.prototype.render=function(host){const body=f.doc.createElement('div');body.className='test-abc-score';body.textContent='ABC rendered from '+this.title;host.appendChild(body);this._pager={element:body,info:()=>({count:2,page:1,shown:2}),next(){},previous(){},go(){}};};
 Score.prototype.onDestroy=function(){this.destroyed=true;};
 runInNewContext(await read('book-widget.js'),{exports:bookExports,$tw,require(name){
  if(name==='$:/core/modules/widgets/widget.js')return {widget:Widget};
  if(name.endsWith('/model.js'))return f.model;if(name.endsWith('/book-layout.js'))return f.layout;
  if(name.endsWith('/pdf-score.js'))return f.pdf;
  if(name.endsWith('/score-widget.js'))return {'huwiki-abc':Score};
  if(name.endsWith('/print.js'))return {cueLabel:()=> 'Stiknoder'};
  if(name.endsWith('/live-score.js'))return {apply:(_ABC,source)=>({source})};
  return {};
 }});
 const book=Object.create(bookExports['huwiki-repertoire-book'].prototype);
 Object.assign(book,{wiki:f.wiki,document:f.doc,_win:f.win,host:f.host,children:[],activeItem:item,setlistTitle:set,preference:'spread',practiceEnabled:false,practiceMetronome:false,practiceMuteByItem:Object.create(null),practiceOpen:false});
 function state(data){const frame=f.host.querySelector('iframe');for(const fn of [...f.listeners.get('message')||[]])fn({data,source:frame?.contentWindow,origin:'https://example.test'});}
 return {...f,book,item,set,notation,scoreInstances,state};
}

test('switching PDF and ABC inside one song disposes the old view and preserves notation and setlist identity',async()=>{
 const f=await drawnBookFixture(),before=JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),order=JSON.stringify(f.model.entries(f.wiki,f.set));
 f.book.draw();assert.ok(f.host.querySelector('iframe'));assert.equal(f.scoreInstances.length,0);
 const choose=value=>{const selection=f.host.querySelector('.huwrep-book-source');assert.ok(selection);selection.value=value;selection.dispatch('change');};
 assert.deepEqual(f.host.querySelector('.huwrep-book-source').children.map(option=>option.value),['abc','pdf']);
 for(let i=0;i<3;i++){
  choose('abc');assert.equal(f.host.querySelector('iframe'),null);assert.ok(f.host.querySelector('.test-abc-score'));
  assert.equal(f.listeners.get('message')?.size||0,0,'switching away releases old PDF message listener');
  assert.equal(f.book._score.title,'Four Brothers');
  choose('pdf');assert.ok(f.host.querySelector('iframe'));assert.equal(f.host.querySelector('.test-abc-score'),null);
  assert.equal(f.listeners.get('message')?.size,1,'repeated switching keeps exactly one active viewer');
  assert.equal(f.scoreInstances.at(-1).destroyed,true,'switching away releases ABC engine and audio');
 }
 assert.equal(f.book.activeItem,f.item);assert.equal(f.book.setlistTitle,f.set);
 assert.equal(JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),before);assert.equal(JSON.stringify(f.model.entries(f.wiki,f.set)),order);
 f.book.disposeScore();assert.equal(f.listeners.get('message')?.size||0,0);
});

test('entering a PDF song backwards waits for ready and opens the final complete spread',async()=>{
 const f=await drawnBookFixture();f.book.lastPage=true;f.book.draw();
 assert.equal(f.posts.length,0,'no page command is lost before the child is ready');
 f.state({type:'birdland-pdf:ready',pages:4,page:1,spread:2});
 assert.deepEqual(f.posts.at(-1)?.message,{type:'birdland-pdf:command',command:'go',page:3});
 f.state({type:'birdland-pdf:state',pages:4,page:3,spread:2});
 assert.match(f.host.querySelector('.huwrep-book-page-status').textContent,/3–4.*4/);
 assert.equal(f.book.lastPage,false);f.book.disposeScore();
});

test('a PDF boundary carries current child state before changing songs, even when the last render state was older',async()=>{
 const f=await drawnBookFixture(),sourceBefore=JSON.stringify(f.wiki.getTiddler('Four Brothers').fields);
 const orch=f.wiki.getTiddler(f.item).fields['orchestra-title'];
 f.wiki.addTiddler(new Tiddler({title:'Next ABC tune','abc-source':'X:1\nT:Next ABC tune\nK:C\nC4|'}));
 const next=f.model.addItem(f.wiki,orch,'Next ABC tune').title;f.model.setEntries(f.wiki,f.set,[f.item,next]);
 f.book.draw();f.state({type:'birdland-pdf:ready',pages:5,page:1,spread:2});
 assert.equal(f.book.activeItem,f.item);assert.equal(f.posts.length,0);
 // The viewer can reach its final spread before an expensive page render has
 // posted the corresponding state message. Boundary state is authoritative.
 f.state({type:'birdland-pdf:boundary',direction:'next',pages:5,page:5,spread:2});
 assert.equal(f.book.activeItem,next,'the current boundary page selects the adjacent song');
 assert.equal(f.posts.length,0,'a boundary cannot recursively request next from stale page one');
 assert.equal(f.book._pdfPager,null);assert.ok(f.host.querySelector('.test-abc-score'));
 assert.equal(JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),sourceBefore);
 f.book.disposeScore();
});
