import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root=new URL('../plugins/repertoire/src/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const performanceSurface={};runInNewContext(await read('performance-surface.js'),{exports:performanceSurface});
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
  if(name.endsWith('/performance-surface.js'))return performanceSurface;
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
 const video={};runInNewContext(await read('youtube-video.js'),{exports:video});
 const notation={title:'Four Brothers','abc-source':'X:1\nT:Four Brothers\nK:F\nF4|','repertoire-pdf':'pdf/four-brothers.pdf','repertoire-sheet-format':'pdf','repertoire-category':'leadsheet','repertoire-abc-label':'Leadsheet',text:'Keep notes'};
 f.wiki.addTiddler(new Tiddler(notation));
 const orch=f.model.orchestra(f.wiki,'Birdland'),item=f.model.addItem(f.wiki,orch,notation.title).title,set=f.model.createSetlist(f.wiki,orch,'Concert');f.model.setEntries(f.wiki,set,[item]);
 const instrumentView={};runInNewContext(await readFile(new URL('../plugins/abc/src/instrument-view.js',import.meta.url),'utf8'),{exports:instrumentView,require:()=>({language:()=> 'da'})});
 const mixerCalls=[],miniMixer={show(){mixerCalls.push('show');},selectTab(tab){mixerCalls.push(tab);},togglePlayback(){mixerCalls.push('play');},destroy(){}};
 const scoreInstances=[],bookExports={};function Widget(){}
 function Score(tree){this.title=tree.attributes.tiddler.value;scoreInstances.push(this);}
 Score.prototype.render=function(host){const body=f.doc.createElement('div');body.className='test-abc-score';body.textContent='ABC rendered from '+this.title;host.appendChild(body);this._pager={element:body,info:()=>({count:2,page:1,shown:2}),next(){},previous(){},go(){}};};
 Score.prototype.onDestroy=function(){this.destroyed=true;};
 runInNewContext(await read('book-widget.js'),{exports:bookExports,$tw,require(name){
  if(name==='$:/core/modules/widgets/widget.js')return {widget:Widget};
  if(name.endsWith('/performance-surface.js'))return performanceSurface;
  if(name.endsWith('/model.js'))return f.model;if(name.endsWith('/book-layout.js'))return f.layout;
  if(name.endsWith('/pdf-score.js'))return f.pdf;
  if(name.endsWith('/youtube-video.js'))return video;
  if(name.endsWith('/instrument-view.js'))return instrumentView;
  if(name.endsWith('/floating-mixer.js'))return {mount(){mixerCalls.push('mount');return miniMixer;}};
  if(name.endsWith('/score-widget.js'))return {'huwiki-abc':Score};
  if(name.endsWith('/print.js'))return {cueLabel:()=> 'Stiknoder'};
  if(name.endsWith('/live-score.js'))return {apply:(_ABC,source)=>({source})};
  return {};
 }});
 const book=Object.create(bookExports['huwiki-repertoire-book'].prototype);
 Object.assign(book,{wiki:f.wiki,document:f.doc,_win:f.win,host:f.host,children:[],activeItem:item,setlistTitle:set,preference:'spread',practiceEnabled:false,practiceMetronome:false,practiceMuteByItem:Object.create(null),practiceOpen:false});
 function state(data){const frame=f.host.querySelector('iframe');for(const fn of [...f.listeners.get('message')||[]])fn({data,source:frame?.contentWindow,origin:'https://example.test'});}
 return {...f,book,item,set,notation,scoreInstances,state,mixerCalls};
}

test('switching ABC to YouTube stops its audio engine and switching back unloads the video',async()=>{
 const f=await drawnBookFixture();f.model.setVideo(f.wiki,'Four Brothers','https://www.youtube.com/watch?v=8UNtQpMMSEM');
 f.book.changeItemView('leadsheet');const score=f.book._score;
 f.book.changeItemView('youtube');
 assert.equal(score.destroyed,true);assert.equal(f.book._score,null);assert.equal(f.host.querySelector('.test-abc-score'),null);
 const frame=f.host.querySelector('.huwrep-youtube-frame');assert.ok(frame);assert.equal(f.book._performance.element.hidden,true);
 const order=JSON.stringify(f.model.entries(f.wiki,f.set));
 f.book.changeItemView('leadsheet');assert.equal(frame.src,'about:blank');assert.equal(f.host.querySelector('.huwrep-youtube-frame'),null);assert.ok(f.book._score);
 assert.equal(JSON.stringify(f.model.entries(f.wiki,f.set)),order);f.book.disposeScore();
});

test('YouTube follows next, previous, keyboard and list selection without overwriting notation choices',async()=>{
 const f=await drawnBookFixture(),orch=f.wiki.getTiddler(f.item).fields['orchestra-title'];
 f.model.setVideo(f.wiki,'Four Brothers','https://youtu.be/8UNtQpMMSEM');
 f.wiki.addTiddler(new Tiddler({title:'Next tune','abc-source':'X:1\nK:C\nC4|','repertoire-pdf':'pdf/next.pdf','repertoire-youtube':'https://youtu.be/YUeuU9mu8mU'}));
 f.wiki.addTiddler(new Tiddler({title:'No video','abc-source':'X:1\nK:C\nC4|'}));
 const next=f.model.addItem(f.wiki,orch,'Next tune').title,missing=f.model.addItem(f.wiki,orch,'No video').title;
 f.model.setEntries(f.wiki,f.set,[f.item,next,missing]);
 f.model.setPresentation(f.wiki,f.set,f.item,'leadsheet');f.model.setPresentation(f.wiki,f.set,next,'pdf');
 const before=JSON.stringify([...f.wiki.rows.values()].map(t=>t.fields));
 const choose=value=>{const select=f.host.querySelector('.huwrep-book-source');select.value=value;select.dispatch('change');};
 f.book.draw();choose('youtube');
 const firstFrame=f.host.querySelector('.huwrep-youtube-frame');f.book.turn(1);
 assert.equal(firstFrame.src,'about:blank');assert.equal(f.book.activeItem,next);assert.equal(f.book._selectedNotation.role,'youtube');
 assert.match(f.host.querySelector('.huwrep-youtube-frame').src,/YUeuU9mu8mU/);
 assert.equal(f.host.querySelector('.huwrep-book-source').value,'youtube');
 let prevented=0;f.book._onKeyDown({key:'ArrowLeft',target:f.host,preventDefault(){prevented++;},stopPropagation(){}});
 assert.equal(prevented,1);assert.equal(f.book.activeItem,f.item);assert.equal(f.book._selectedNotation.role,'youtube');
 f.book.selectItem(missing,false);
 assert.equal(f.book._selectedNotation.role,'youtube');assert.equal(f.book._selectedNotation.missing,true);
 assert.equal(f.host.querySelector('iframe'),null);assert.match(f.host.textContent,/findes endnu ikke/);
 f.book.turn(-1);assert.equal(f.book.activeItem,next);assert.equal(f.book._selectedNotation.role,'youtube');
 assert.equal(JSON.stringify([...f.wiki.rows.values()].map(t=>t.fields)),before,'reading in video mode preserves scores, set order and saved notation overrides');
 choose('pdf');assert.equal(f.book._selectedNotation.role,'pdf');
 f.book.selectItem(f.item,false);assert.equal(f.book._selectedNotation.role,'leadsheet','choosing notation ends the video session');
 f.book.changeFolderView('youtube');assert.equal(f.book._selectedNotation.role,'youtube','folder video mode also overrides a saved per-song notation choice');
 f.book.selectSetlist(f.set);assert.equal(f.book._selectedNotation.role,'leadsheet','opening a set anew restores its saved per-song choice');
 f.book.disposeScore();
});

test('adding a video to an already open ABC original refreshes its presentation choices',async()=>{
 const f=await drawnBookFixture();f.book.changeItemView('leadsheet');
 const original=f.book._score;
 assert.equal(f.host.querySelector('.huwrep-book-source').children.some(o=>o.value==='youtube'),false);
 f.model.setVideo(f.wiki,'Four Brothers','https://www.youtube.com/watch?v=8UNtQpMMSEM');
 assert.equal(f.book.refresh({'Four Brothers':{modified:true}}),true);
 assert.ok(f.host.querySelector('.huwrep-book-source').children.some(o=>o.value==='youtube'));
 assert.equal(original.destroyed,true);assert.equal(f.scoreInstances.filter(s=>!s.destroyed).length,1);
 f.book.disposeScore();
});

test('switching PDF and ABC inside one song disposes the old view and preserves notation and setlist identity',async()=>{
 const f=await drawnBookFixture(),before=JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),order=JSON.stringify(f.model.entries(f.wiki,f.set));
 f.book.draw();assert.ok(f.host.querySelector('iframe'));assert.equal(f.scoreInstances.length,1,'PDF can use its associated ABC as one sound source');
 const choose=value=>{const selection=f.host.querySelector('.huwrep-book-source');assert.ok(selection);selection.value=value;selection.dispatch('change');};
 assert.deepEqual(f.host.querySelector('.huwrep-book-source').children.map(option=>option.value),['','leadsheet','pdf']);
 for(let i=0;i<3;i++){
  choose('leadsheet');assert.equal(f.host.querySelector('iframe'),null);assert.ok(f.host.querySelector('.test-abc-score'));
  assert.equal(f.listeners.get('message')?.size||0,0,'switching away releases old PDF message listener');
  assert.equal(f.book._score.title,'Four Brothers');
  choose('pdf');assert.ok(f.host.querySelector('iframe'));assert.equal(f.host.querySelector('.test-abc-score').closest('.huwrep-audio-only').hidden,true,'PDF keeps its one ABC sound source out of the notation stage');
  assert.equal(f.listeners.get('message')?.size,1,'repeated switching keeps exactly one active viewer');
  assert.equal(f.scoreInstances.at(-2).destroyed,true,'switching away releases the previous ABC engine and audio');assert.equal(f.scoreInstances.filter(score=>!score.destroyed).length,1);
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
 assert.equal(f.book.activeItem,f.item);assert.equal(f.posts.filter(p=>p.message.command!=='fullscreen-state').length,0);
 // The viewer can reach its final spread before an expensive page render has
 // posted the corresponding state message. Boundary state is authoritative.
 f.state({type:'birdland-pdf:boundary',direction:'next',pages:5,page:5,spread:2});
 assert.equal(f.book.activeItem,next,'the current boundary page selects the adjacent song');
 assert.equal(f.posts.filter(p=>p.message.command==='next').length,0,'a boundary cannot recursively request next from stale page one');
 assert.equal(f.book._pdfPager,null);assert.ok(f.host.querySelector('.test-abc-score'));
 assert.equal(JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),sourceBefore);
 f.book.disposeScore();
});

test('one book switches its dated-folder defaults and per-number source roles without replacing guitar stabs',async()=>{
 const f=await drawnBookFixture(),canonical=f.wiki.getTiddler('Four Brothers');
 f.wiki.addTiddler(new Tiddler(canonical,{'repertoire-leadsheet-source':'Sources/Four Brothers · Lead','repertoire-guitar-pdf':'pdf/four-brothers-guitar.pdf','repertoire-score-pdf':'pdf/four-brothers-score.pdf'}));
 f.wiki.addTiddler(new Tiddler({title:'Sources/Four Brothers · Lead','abc-source':'X:1\nT:Four Brothers melody\nQ:1/4=125\nK:F\nFGA_B|','repertoire-work-title':'Four Brothers'}));
 f.wiki.addTiddler(new Tiddler({title:'$:/config/maans/repertoire/default-source-role',text:'guitar'}));
 const original=JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),order=JSON.stringify(f.model.entries(f.wiki,f.set)),orch=f.wiki.getTiddler(f.item).fields['orchestra-title'];
 f.model.setPresentation(f.wiki,f.set,null,'leadsheet');f.book.draw();
 assert.equal(f.book._score.title,'Sources/Four Brothers · Lead');assert.equal(f.host.querySelector('iframe'),null);
 const folder=value=>{const select=f.host.querySelector('.huwrep-book-folder-view');assert.ok(select);select.value=value;select.dispatch('change');};
 const number=value=>{const select=f.host.querySelector('.huwrep-book-source');assert.ok(select);select.value=value;select.dispatch('change');};
 const pdf=()=>new URL((f.host.querySelector('iframe').getAttribute('src')||f.host.querySelector('iframe').src)).searchParams.get('file');
 folder('guitar');assert.match(pdf(),/four-brothers-guitar\.pdf$/);assert.equal(f.book._score.title,'Four Brothers','guitar PDF prefers its matching arrangement ABC over an alternative leadsheet');
 number('chord-stabs');assert.equal(f.book._score.title,'Four Brothers');assert.equal(f.host.querySelector('iframe'),null);
 folder('score');assert.equal(f.book._score.title,'Four Brothers','the per-number exception survives changes to folder default');
 number('');assert.match(pdf(),/four-brothers-score\.pdf$/);
 folder('leadsheet');assert.equal(f.book._score.title,'Sources/Four Brothers · Lead');
 number('guitar');assert.match(pdf(),/four-brothers-guitar\.pdf$/);
 assert.equal(f.model.setlists(f.wiki,orch).length,1,'four views keep the same dated folder');assert.equal(JSON.stringify(f.model.entries(f.wiki,f.set)),order);
 // A second historical date is a different folder, not a view clone. It must
 // not inherit the first date's per-number choice for the same song.
 const another=f.model.createSetlist(f.wiki,orch,'28. november 2026');f.model.setEntries(f.wiki,another,[f.item]);f.model.setPresentation(f.wiki,another,null,'leadsheet');
 f.book.selectSetlist(another);assert.equal(f.book._score.title,'Sources/Four Brothers · Lead');
 f.book.selectSetlist(f.set);assert.match(pdf(),/four-brothers-guitar\.pdf$/,'returning restores only that historical folder\'s exception');
 assert.equal(f.book.activeItem,f.item);assert.equal(JSON.stringify(f.wiki.getTiddler('Four Brothers').fields),original);
 assert.ok(f.wiki.getTiddler('Four Brothers').fields['abc-source'].includes('F4|'),'canonical accompaniment survives all source choices');
 f.book.disposeScore();
});

test('PDF fullscreen belongs to the stable book and survives PDF to ABC to PDF navigation',async()=>{
 const f=await drawnBookFixture(),host=f.host;
 const orch=f.wiki.getTiddler(f.item).fields['orchestra-title'];
 f.wiki.addTiddler(new Tiddler({title:'Next ABC tune','abc-source':'X:1\nT:Next\nK:C\nC4|'}));
 const next=f.model.addItem(f.wiki,orch,'Next ABC tune').title;f.model.setEntries(f.wiki,f.set,[f.item,next]);
 f.book.draw();f.state({type:'birdland-pdf:ready',pages:2,page:1,spread:2});
 assert.match(host.querySelector('iframe').src,/fullscreen-owner=book/);
 f.state({type:'birdland-pdf:fullscreen'});
 assert.equal(host.classList.contains('huwrep-book-fullscreen'),true);
 f.state({type:'birdland-pdf:boundary',direction:'next',pages:2,page:1,spread:2});
 assert.equal(f.book.activeItem,next);assert.equal(f.host,host);
 assert.equal(host.classList.contains('huwrep-book-fullscreen'),true);
 f.book.selectItem(f.item);f.state({type:'birdland-pdf:ready',pages:2,page:1,spread:2});
 assert.equal(host.classList.contains('huwrep-book-fullscreen'),true);
 f.state({type:'birdland-pdf:fullscreen',exit:true});
 assert.equal(host.classList.contains('huwrep-book-fullscreen'),false);
 f.book.disposeScore();
});

test('a standalone number uses the same source choices without saving a synthetic folder or losing fullscreen',async()=>{
 const f=await drawnBookFixture();f.book.pieceTitle='Four Brothers';f.book.singleRole='leadsheet';
 const before=JSON.stringify([...f.wiki.rows.values()].map(t=>t.fields));f.book.draw();
 assert.equal(f.book.activeItem,'Four Brothers');assert.equal(f.host.querySelector('iframe'),null);
 f.host.querySelector('.huwrep-book-fullscreen-button').click();
 const view=f.host.querySelector('.huwrep-book-source');view.value='pdf';view.dispatch('change');
 assert.ok(f.host.querySelector('iframe'));assert.equal(f.host.classList.contains('huwrep-book-fullscreen'),true);
 assert.equal(JSON.stringify([...f.wiki.rows.values()].map(t=>t.fields)),before,'reading a single title cannot change setlists, musical agreements or source data');
 f.book.disposeScore();
});

test('touch page turns remain available without entering a second reader mode',async()=>{
 const f=await drawnBookFixture();f.book.pieceTitle='Four Brothers';f.book.singleRole='leadsheet';f.book.draw();
 const turns=[];f.book.turn=delta=>turns.push(delta);const target=f.host.querySelector('.huwrep-book-stage');
 const touch={pointerType:'touch',isPrimary:true,pointerId:1,target,clientX:220,clientY:80};
 f.book.onSwipeStart(touch);f.book.onSwipeEnd({...touch,clientX:100,clientY:85});assert.deepEqual(turns,[1]);
 f.book.onSwipeStart(touch);f.book.onSwipeEnd({...touch,clientX:200,clientY:200});assert.deepEqual(turns,[1],'vertical scrolling does not change a page');
 f.book.disposeScore();
});




test('historical folders and the whole repertoire render existing charts under a missing score preference',async()=>{
 const f=await drawnBookFixture(),orch=f.wiki.getTiddler(f.item).fields['orchestra-title'];
 f.wiki.addTiddler(new Tiddler(f.wiki.getTiddler('Four Brothers'),{'repertoire-pdf':'','repertoire-guitar-pdf':'pdf/four-brothers-guitar.pdf'}));
 f.wiki.addTiddler(new Tiddler({title:'$:/config/maans/repertoire/default-source-role',text:'score'}));
 f.model.setPresentation(f.wiki,f.set,null,'score');
 const saved=()=>JSON.stringify([...f.wiki.rows.values()].map(t=>t.fields).filter(t=>!t.title.startsWith('$:/temp/')));
 const before=saved();
 f.book.draw();assert.equal(f.book._selectedNotation.role,'guitar');assert.ok(f.host.querySelector('iframe'));assert.equal(f.host.querySelector('.huwrep-book-source-unavailable'),null);
 f.book.selectSetlist(orch);assert.equal(f.book._selectedNotation.role,'guitar');assert.ok(f.host.querySelector('iframe'));
 assert.equal(f.host.querySelector('.huwrep-book-source-unavailable'),null);
 assert.equal(saved(),before);
 f.book.disposeScore();
});



test('notation settings stay behind one icon, offer capo/key/TAB, and replace the separate mixer button',async()=>{
 const f=await drawnBookFixture();f.book.singleRole='abc';f.book.pieceTitle='Four Brothers';f.book.draw();
 const menu=f.host.querySelector('.huwrep-note-settings');assert.ok(menu);assert.ok(!menu.open);
 assert.equal(f.host.querySelector('.huwrep-open-minimixer'),null);
 assert.ok(menu.querySelector('.huwabc-key-select'));assert.ok(menu.querySelector('.huwabc-capo-select'));assert.ok(menu.querySelector('.huwabc-tab-select'));
 assert.ok(menu.textContent.includes('Udskriv de viste noder'));
 const before=f.wiki.getTiddler('Four Brothers').fields['abc-source'];
 const capo=menu.querySelector('.huwabc-capo-select');capo.value='4';capo.dispatch('change');
 const key=menu.querySelector('.huwabc-key-select');key.value='2';key.dispatch('change');
 assert.equal(capo.value,'4');assert.equal(key.value,'2');assert.equal(f.wiki.getTiddler('Four Brothers').fields['abc-source'],before);
 const controls=f.book._notationControls;f.book.disposeScore();assert.equal(controls.element.parentNode,null);
});


test('PDF play always selects YouTube before toggling, including after inspecting empty ABC tabs',async()=>{
 const f=await drawnBookFixture(),t=f.wiki.getTiddler('Four Brothers');
 f.wiki.addTiddler(new Tiddler({...t.fields,'abc-source':'','repertoire-youtube':'https://youtu.be/abcdefghijk'}));
 f.book.draw();const play=f.host.querySelector('.huwrep-video-play');assert.ok(play);
 play.click();assert.deepEqual(f.mixerCalls.slice(-2),['youtube','play']);
 f.book._videoMixer.selectTab('voices');play.click();assert.deepEqual(f.mixerCalls.slice(-2),['youtube','play']);
 f.book.disposeScore();
});
