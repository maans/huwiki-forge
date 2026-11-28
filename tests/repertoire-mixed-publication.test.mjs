import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
class Tiddler{constructor(...args){this.fields=Object.assign({},...args.map(x=>x?.fields||x));}}
async function fixture(instrument){
 const rows=new Map(),$tw={Tiddler,utils:{stringifyList:list=>list.map(x=>'[['+x+']]').join(' ')}};
 const wiki={allTitles:()=>[...rows.keys()],getTiddler:t=>rows.get(t),tiddlerExists:t=>rows.has(t),getCreationFields:()=>({}),addTiddler:t=>rows.set(t.fields.title,t),getTiddlerText:(t,f='')=>rows.get(t)?.fields.text??f,getTiddlerList:(t,field='list')=>Array.from(String(rows.get(t)?.fields[field]||'').matchAll(/\[\[([^\]]+)\]\]|([^\s]+)/g),m=>m[1]||m[2])};
 const model={},printing={};runInNewContext(await read('plugins/repertoire/src/model.js'),{exports:model,$tw});
 runInNewContext(await read('plugins/repertoire/src/print.js'),{exports:printing,$tw,require:name=>name.endsWith('/instrument-view.js')?instrument:model});
 for(const t of [{title:'Song','repertoire-leadsheet-source':'Song lead','repertoire-guitar-pdf':'song.pdf'},{title:'Song lead','abc-source':'X:1\nK:C\nC4|','repertoire-work-title':'Song'},{title:'PDF only','repertoire-guitar-pdf':'original.pdf'},{title:'Words',text:'A verse and the agreed ending.'},{title:'Image','repertoire-image':'data:image/png;base64,AA=='},{title:'Missing'},{title:'$:/plugins/huwiki/print-article'}])wiki.addTiddler(new Tiddler(t));
 const orch=model.orchestra(wiki,'Helles'),titles=['Song','PDF only','Words','Image'],items=titles.map(t=>model.addItem(wiki,orch,t).title),set=model.createSetlist(wiki,orch,'Mixed');model.setEntries(wiki,set,items);model.setPresentation(wiki,set,null,'leadsheet');model.setPresentation(wiki,set,items[1],'guitar');
 return {rows,wiki,model,printing,orch,items,set,$tw};
}
test('one set hands off its selected ABC, original PDF, words and image in order without changing source records',async()=>{
 const f=await fixture(),before=JSON.stringify([...f.rows.values()].map(t=>t.fields)),events=[];
 const result=f.printing.open(f.wiki,f.set,{dispatchEvent:e=>events.push(e)},{scores:true});
 assert.equal(result.error,undefined);assert.equal(events.length,1);
 assert.deepEqual(Array.from(result.titles).slice(1),['Song','PDF only','Words','Image']);
 const sources=JSON.parse(f.wiki.getTiddler(result.summary).fields['repertoire-publication-sources']);
 assert.equal(sources.Song.format,'abc');assert.equal(sources.Song.sourceTitle,'Song lead');
 assert.equal(sources['PDF only'].pdf,'original.pdf');assert.equal(sources.Words.format,'tiddler');assert.equal(sources.Image.format,'image');
 assert.match(f.wiki.getTiddler(result.summary).fields.text,/Udskriftsudgave/);
 assert.equal(JSON.stringify([...f.rows.values()].filter(t=>!t.fields.title.startsWith('$:/temp/')).map(t=>t.fields)),before);
});
test('missing material blocks a partial PDF and names the missing number',async()=>{
 const f=await fixture(),id=f.model.addItem(f.wiki,f.orch,'Missing').title;f.model.addEntry(f.wiki,f.set,id);
 const result=f.printing.open(f.wiki,f.set,{dispatchEvent(){assert.fail('must not silently omit a song');}},{scores:true});
 assert.match(result.error,/Missing/);assert.match(result.error,/Ingen numre er udeladt/);
});
test('video viewing never replaces printable notation in a set',async()=>{
 const f=await fixture();f.model.setVideo(f.wiki,'Song','https://youtu.be/8UNtQpMMSEM');f.model.setPresentation(f.wiki,f.set,f.items[0],'youtube');
 const source=f.printing.printSource(f.wiki,f.set,f.items[0]);assert.equal(source.format,'abc');assert.equal(source.sourceTitle,'Song lead');
});
test('mixed publication keeps every PDF page, ABC page and text page in one physical PDF',async()=>{
 const js=await read('plugins/print-article/src/startup.js'),start=js.indexOf('async function createPublication('),end=js.indexOf('function buildPreview(',start);
 const pdfStart=js.indexOf('function pdfFromJpegs('),pdfEnd=js.indexOf('function isVisible(',pdfStart);
 const buildPdf=new Function('Blob','TextEncoder',js.slice(pdfStart,pdfEnd)+';return pdfFromJpegs;')(Blob,TextEncoder);
 const image=n=>({data:new Uint8Array([n]),width:100,height:140}),calls=[];
 const make=new Function('renderSelectedChapter','renderPages','pdfFromJpegs','linkAnnotation',js.slice(start,end)+';return createPublication;')(
  async(title,_p,offset)=>{calls.push([title,offset]);return title==='PDF'?{images:[image(1),image(2),image(3)],pages:3}:title==='ABC'?{images:[image(4),image(5)],pages:2}:null;},
  async()=>({images:[image(6)]}),buildPdf,()=>null);
 const result=await make(['PDF','ABC','Text'].map(title=>({kind:'chapter',title,section:{}})),null,[],null,{});
 assert.equal(result.pages,6);assert.deepEqual(result.images.map(x=>x.data[0]),[1,2,3,4,5,6]);
 assert.deepEqual(result.chapterStats.map(x=>x.startPage),[1,4,6]);assert.match(await result.blob.text(),/\/Count 6/);assert.deepEqual(calls,[['PDF',0],['ABC',3],['Text',5]]);
});
test('selected source routing uses the alternative ABC and retains canonical musical agreements',async()=>{
 const js=await read('plugins/print-article/src/startup.js'),start=js.indexOf('async function renderSelectedChapter('),end=js.indexOf('async function createPublication(',start),calls=[];
 const render=new Function('$tw','document','isAbcScoreTitle','renderAbcChapter',js.slice(start,end)+';return renderSelectedChapter;')({modules:{execute:()=>({render:async o=>({images:[],pages:2,source:o.source})})},wiki:{}},{},()=>true,async(...args)=>{calls.push(args);return {pages:1};});
 const sources={Song:{format:'abc',sourceTitle:'Song lead'},Original:{format:'pdf',pdf:'original.pdf'}};
 await render('Song',null,0,false,false,{Song:{key:'Bb',cues:'Last chorus'}},sources);
 assert.equal(calls[0][0],'Song lead');assert.deepEqual(calls[0][5],{'Song lead':{key:'Bb',cues:'Last chorus'}});
 const pdf=await render('Original',null,0,true,false,{},sources);assert.equal(pdf.source,'original.pdf');assert.equal(pdf.needsFacingBlank,true);
});

test('set PDF follows each entry’s capo/key/TAB instead of copying the open reader to every song',async()=>{
 for(const id of ['c','bb','eb','tenor']){
  const instrument={};runInNewContext(await read('plugins/abc/src/instrument-view.js'),{exports:instrument,require:()=>({language:()=> 'da'})});
  instrument.change(id);const state={id,capo:3,tab:'guitar',transpose:2};
  const f=await fixture(instrument),events=[],widget={dispatchEvent:e=>events.push(e)};
  f.model.setNotationSettings(f.wiki,f.set,f.items[0],state);
  widget._instrumentView=instrument.create(state);
  f.wiki.addTiddler(new Tiddler({title:'Another ABC','abc-source':'X:1\nK:C\nC4|'}));
  const another=f.model.addItem(f.wiki,f.orch,'Another ABC').title;f.model.addEntry(f.wiki,f.set,another);
  const result=f.printing.open(f.wiki,f.set,widget,{scores:true,instrumentId:'current'});
  assert.equal(events[0].paramObject.instrumentId,id);
  const sources=JSON.parse(f.wiki.getTiddler(result.summary).fields['repertoire-publication-sources']);
  assert.deepEqual(sources.Song.notation,state);
  assert.deepEqual(sources['Another ABC'].notation,{id,capo:null,tab:null,transpose:0});
  assert.match(f.wiki.getTiddler(result.summary).fields.text,/Capo 3/);
  assert.deepEqual(state,{id,capo:3,tab:'guitar',transpose:2});
  f.printing.open(f.wiki,f.set,widget,{scores:true,instrumentId:'c'});
  assert.equal(events[1].paramObject.instrumentId,'c');
  assert.equal(JSON.parse(f.wiki.getTiddler(result.summary).fields['repertoire-publication-sources']).Song.notation.capo,3);
 }
});

test('PDF chapters render their own notation even when another live score is already open',async()=>{
 const js=await read('plugins/print-article/src/startup.js'),instrument={};
 runInNewContext(await read('plugins/abc/src/instrument-view.js'),{exports:instrument,require:()=>({language:()=> 'da'})});
 const calls=[],labels=[],holders=[],renderedRoot={querySelectorAll:()=>[{}]},oldLiveRoot={querySelectorAll:()=>[{},{}]};let disposed=0;
 const modules={instrument,page:{geometry:()=>({name:'A4'}),safeClone:page=>page},jazz:{css:()=>''},pdf:{renderImages:async(pages,geom,label)=>{labels.push(label);return [{label}];}}};
 const $tw={wiki:{getTiddler:()=>({fields:{}}),parseText:(type,text)=>text,makeWidget:(parser,options)=>{
  calls.push({parser,options});return {render(holder){holder.root=renderedRoot;},onDestroy(){disposed++;}};
 }}};
 const E=()=>{const holder={style:{},remove(){this.removed=true;}};holders.push(holder);return holder;};
 const start=js.indexOf('async function renderAbcChapter('),end=js.indexOf('async function renderSelectedChapter(',start);
 const render=new Function('$tw','document','abcExportModules','findFrame','liveScoreRoot','E','attachScoreAgreements',js.slice(start,end)+';return renderAbcChapter;')($tw,{body:{appendChild(){}}},()=>modules,()=>({old:true}),scope=>scope.old?oldLiveRoot:scope.root,E,()=>{});
 await render('First',null,0,false,false,{}, {id:'c',capo:3,transpose:2,tab:'guitar'});
 await render('Second',null,1,false,false,{}, {id:'c',capo:null,transpose:0,tab:null});
 assert.equal(calls.length,2);assert.match(calls[0].parser,/view="full"/);
 assert.equal(JSON.parse(calls[0].options.variables['huwabc-notation-settings']).capo,3);
 assert.equal(JSON.parse(calls[1].options.variables['huwabc-notation-settings']).capo,null);
 assert.match(labels[0],/Capo 3/);assert.doesNotMatch(labels[1],/Capo/);
 assert.equal(disposed,2);assert.ok(holders.every(holder=>holder.removed));assert.equal(instrument.current().capo,null);
});
