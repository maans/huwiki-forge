import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

class Tiddler {constructor(...values){this.fields=Object.assign({},...values.map(value=>value?.fields||value));}}
const $tw={Tiddler,utils:{stringifyList:list=>list.map(title=>/\s/.test(title)?'[['+title+']]':title).join(' ')}};
async function fixture(){
 const rows=new Map();
 const wiki={allTitles:()=>[...rows.keys()],getTiddler:title=>rows.get(title),tiddlerExists:title=>rows.has(title),getCreationFields:()=>({}),
  addTiddler:tiddler=>rows.set(tiddler.fields.title,tiddler),getTiddlerText:(title,fallback='')=>rows.get(title)?.fields.text??fallback,
  getTiddlerList:(title,field='list')=>Array.from(String(rows.get(title)?.fields[field]||'').matchAll(/\[\[([^\]]*)\]\]|([^\s]+)/g),m=>m[1]||m[2])};
 const model={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/model.js',import.meta.url),'utf8'),{exports:model,$tw});
 const canonical=[
  {title:'Four Brothers','abc-source':'X:1\nT:Four Brothers guitar stabs\nK:F\n[FAc]4|','repertoire-leadsheet-source':'Sources/Four Brothers · Leadsheet','repertoire-guitar-pdf':'pdf/four-brothers-guitar.pdf','repertoire-score-pdf':'pdf/four-brothers-score.pdf','repertoire-category':'leadsheet','repertoire-source-role':'chord-stabs','repertoire-sheet-format':'abc',text:'Keep guitar notes','abc-accompaniment':'{"style":"swing","reverb":42}'},
  {title:'Easy Money','abc-source':'X:1\nT:Easy Money guitar stabs\nK:C\n[CEG]4|','repertoire-leadsheet-source':'Sources/Easy Money · Leadsheet','repertoire-pdf':'pdf/easy-money-guitar.pdf',text:'Keep rehearsal notes'}
 ];
 for(const row of canonical)wiki.addTiddler(new Tiddler(row));
 for(const title of ['Four Brothers','Easy Money'])wiki.addTiddler(new Tiddler({title:'Sources/'+title+' · Leadsheet','abc-source':'X:1\nT:'+title+' melody\nK:Dm\nDEFG|','repertoire-work-title':title,'repertoire-abc-label':'Leadsheet'}));
 wiki.addTiddler(new Tiddler({title:'$:/config/maans/repertoire/default-source-role',text:'guitar'}));
 const orchestra=model.orchestra(wiki,'Birdland'),items=canonical.map(row=>model.addItem(wiki,orchestra,row.title).title),setlist=model.createSetlist(wiki,orchestra,'27. november 2026');model.setEntries(wiki,setlist,items);
 return {rows,wiki,model,orchestra,items,setlist,canonical,
  original:JSON.stringify(canonical.map(row=>wiki.getTiddler(row.title).fields)),
  snapshot:()=>JSON.stringify([...rows.values()].map(tiddler=>tiddler.fields)),
  patch(title,fields){wiki.addTiddler(new Tiddler(wiki.getTiddler(title),fields));}};
}

test('one dated folder changes among four notation views without copying its songs or order',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f,order=JSON.stringify(model.entries(wiki,setlist));
 const expected=[
  ['leadsheet','abc','Sources/Four Brothers · Leadsheet',null],
  ['guitar','pdf','Four Brothers','pdf/four-brothers-guitar.pdf'],
  ['chord-stabs','abc','Four Brothers',null],
  ['score','pdf','Four Brothers','pdf/four-brothers-score.pdf']
 ];
 for(const [role,format,source,pdf] of expected){
  model.setPresentation(wiki,setlist,null,role);
  const view=model.presentation(wiki,setlist,items[0]);
  assert.equal(view.role,role);assert.equal(view.format,format);assert.equal(view.sourceTitle,source);
  if(pdf)assert.equal(view.pdf,pdf);else assert.equal(view.abc,true);
  assert.equal(JSON.stringify(model.entries(wiki,setlist)),order);
  assert.equal(JSON.stringify(f.canonical.map(row=>wiki.getTiddler(row.title).fields)),f.original,'folder views cannot overwrite canonical guitar stabs, PDFs or notes');
 }
 assert.equal(model.setlists(wiki,f.orchestra).length,1,'four views do not create four cloned historical folders');
 assert.deepEqual(Array.from(model.songs(wiki),song=>song.fields.title),['Easy Money','Four Brothers'],'lead sources are available through their canonical song, not duplicate library cards');
 assert.deepEqual(Array.from(model.availableViews(wiki,items[0]),view=>view.role).sort(),['chord-stabs','guitar','leadsheet','score']);
 assert.deepEqual(Array.from(model.availableViews(wiki,items[1]),view=>view.role).sort(),['chord-stabs','guitar','leadsheet']);
});

test('per-number exceptions preserve musical overrides and clearing them follows the folder again',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 f.patch(setlist,{'repertoire-overrides':JSON.stringify({[items[1]]:{key:'Dm',tempo:'1/4=132',cues:'Solo on second A'}})});
 model.setPresentation(wiki,setlist,null,'leadsheet');
 model.setPresentation(wiki,setlist,items[1],'chord-stabs');
 assert.equal(model.presentation(wiki,setlist,items[0]).sourceTitle,'Sources/Four Brothers · Leadsheet');
 assert.equal(model.presentation(wiki,setlist,items[1]).sourceTitle,'Easy Money');
 assert.equal(model.presentation(wiki,setlist,items[1]).role,'chord-stabs');
 const overridden=JSON.parse(wiki.getTiddler(setlist).fields['repertoire-overrides'])[items[1]];
 assert.equal(overridden.key,'Dm');assert.equal(overridden.tempo,'1/4=132');assert.equal(overridden.cues,'Solo on second A');
 assert.equal(overridden.sourceRole,'chord-stabs');assert.equal(overridden.sheetFormat,'abc');
 model.setPresentation(wiki,setlist,null,'guitar');
 assert.equal(model.presentation(wiki,setlist,items[0]).role,'guitar');assert.equal(model.presentation(wiki,setlist,items[1]).role,'chord-stabs','song exception survives later folder default changes');
 model.setPresentation(wiki,setlist,items[1],'');
 assert.equal(model.presentation(wiki,setlist,items[1]).role,'guitar');
 assert.equal(model.presentation(wiki,setlist,items[1]).pdf,'pdf/easy-money-guitar.pdf','legacy repertoire-pdf remains a guitar-PDF fallback');
 const cleared=JSON.parse(wiki.getTiddler(setlist).fields['repertoire-overrides'])[items[1]];
 assert.deepEqual(cleared,{key:'Dm',tempo:'1/4=132',cues:'Solo on second A'});
 assert.equal(JSON.stringify(f.canonical.map(row=>wiki.getTiddler(row.title).fields)),f.original);
});

test('source selection precedence is entry, folder, orchestra item, then piece',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 assert.equal(model.presentation(wiki,setlist,items[0]).role,'chord-stabs','piece preference is used before any item or folder override');
 f.patch(items[0],{'repertoire-source-role':'guitar','repertoire-sheet-format':'pdf'});
 assert.equal(model.presentation(wiki,setlist,items[0]).role,'guitar');
 model.setPresentation(wiki,setlist,null,'leadsheet');assert.equal(model.presentation(wiki,setlist,items[0]).role,'leadsheet');
 model.setPresentation(wiki,setlist,items[0],'score');assert.equal(model.presentation(wiki,setlist,items[0]).role,'score');
 const before=f.snapshot();for(let n=0;n<5;n++)model.presentation(wiki,setlist,items[0]);assert.equal(f.snapshot(),before,'reading the effective source is side-effect free');
});

test('missing folder scores fall back to available notation and keep the saved preference',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 model.setPresentation(wiki,setlist,null,'score');
 const absent=model.presentation(wiki,setlist,items[1]);
 assert.equal(absent.role,'guitar');assert.equal(absent.format,'pdf');assert.equal(absent.pdf,'pdf/easy-money-guitar.pdf');assert.equal(absent.abc,false);
 assert.equal(absent.fallbackFrom,'score');assert.equal(absent.missing,false);
 assert.equal(wiki.getTiddler(setlist).fields['repertoire-source-role'],'score');
 assert.equal(model.presentation(wiki,setlist,items[0]).role,'score','the next available full score still wins');
 assert.ok(!Array.from(model.availableViews(wiki,items[1]),view=>view.role).includes('score'));
 const before=f.snapshot();assert.throws(()=>model.setPresentation(wiki,setlist,items[1],'invented-role'));assert.equal(f.snapshot(),before);
});


test('reviewed Birdland key and tempo remain authoritative when a different leadsheet source is selected',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 f.patch('Four Brothers',{'repertoire-key':'Bb','repertoire-tempo':'1/4=168'});
 f.patch('Sources/Four Brothers · Leadsheet',{'abc-source':'X:1\nT:Remote lead\nQ:1/4=80\nK:Dm\nDEFG|'});
 model.setPresentation(wiki,setlist,null,'leadsheet');
 const before=f.snapshot(),view=model.presentation(wiki,setlist,items[0]),agreement=model.effective(wiki,setlist,items[0]);
 assert.equal(view.sourceTitle,'Sources/Four Brothers · Leadsheet');
 assert.equal(agreement.key,'Bb');assert.equal(agreement.tempo,'1/4=168');
 assert.equal(model.sourceAgreement(wiki,items[0],setlist).key,'Bb');assert.equal(model.sourceAgreement(wiki,items[0],setlist).tempo,'1/4=168');
 assert.equal(f.snapshot(),before,'source selection cannot rewrite either canonical accompaniment or remote lead');
});


test('the workshop changes folder view and a per-number exception while keeping one ordered set',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f,doc=svgDocument(),host=doc.createElement('section');doc.body.appendChild(host);
 const createElement=doc.createElement.bind(doc);
 doc.createElement=tag=>{
  const element=createElement(tag);
  if(tag==='select')Object.defineProperty(element,'type',{get:()=> 'select-one'});
  return element;
 };
 f.patch(setlist,{'repertoire-overrides':JSON.stringify({[items[1]]:{key:'Dm',tempo:'1/4=132',cues:'Keep my cue'}})});
 const exports={};function Widget(){}
 runInNewContext(await readFile(new URL('../plugins/repertoire/src/widget.js',import.meta.url),'utf8'),{exports,$tw,require(name){
  if(name==='$:/core/modules/widgets/widget.js')return {widget:Widget};
  if(name.endsWith('/model.js'))return model;
  if(name.endsWith('/print.js'))return {cueLabel:()=> 'Stiknoder'};
  if(name.endsWith('/reorder.js'))return {mount:()=>()=>{}};
  return {};
 }});
 const workshop=Object.create(exports['huwiki-repertoire'].prototype);
 Object.assign(workshop,{wiki,document:doc,host,orchestraTitle:f.orchestra,setlistTitle:setlist,activeItem:items[1],categoryFilter:'all',formatFilter:'all'});
 const order=JSON.stringify(model.entries(wiki,setlist));workshop.draw();
 const folder=host.querySelector('.huwrep-setlist-view');assert.ok(folder);folder.value='leadsheet';folder.dispatch('change');
 assert.equal(wiki.getTiddler(setlist).fields['repertoire-source-role'],'leadsheet');assert.equal(wiki.getTiddler(setlist).fields['repertoire-sheet-format'],'abc');
 const number=host.querySelector('.huwrep-item-view');assert.ok(number);assert.ok(!number.children.some(option=>option.value==='score'),'a missing full score is not an available choice for this number');
 number.value='chord-stabs';number.dispatch('change');
 const override=JSON.parse(wiki.getTiddler(setlist).fields['repertoire-overrides'])[items[1]];
 assert.deepEqual(override,{key:'Dm',tempo:'1/4=132',cues:'Keep my cue',sourceRole:'chord-stabs',sheetFormat:'abc'});
 assert.equal(workshop.activeItem,items[1]);assert.equal(JSON.stringify(model.entries(wiki,setlist)),order);assert.equal(model.setlists(wiki,f.orchestra).length,1);
 assert.equal(JSON.stringify(f.canonical.map(row=>wiki.getTiddler(row.title).fields)),f.original);
 workshop.onDestroy();
});


test('saving musical agreements preserves the same per-number source exception, including an unchanged save',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 model.setPresentation(wiki,setlist,null,'guitar');model.setPresentation(wiki,setlist,items[0],'leadsheet');
 model.saveArrangement(wiki,items[0],setlist,{key:'Bb',tempo:'1/4=142',form:'AABA',instrumentation:'Guitar and sax',cues:'One chorus'},'setlist');
 let override=JSON.parse(wiki.getTiddler(setlist).fields['repertoire-overrides'])[items[0]];
 assert.equal(override.sourceRole,'leadsheet');assert.equal(override.sheetFormat,'abc');assert.equal(override.key,'Bb');assert.equal(override.tempo,'1/4=142');
 const baseline=model.baseline(wiki,items[0],setlist);
 model.saveArrangement(wiki,items[0],setlist,{...baseline},'setlist');
 override=JSON.parse(wiki.getTiddler(setlist).fields['repertoire-overrides'])[items[0]];
 assert.deepEqual(override,{sourceRole:'leadsheet',sheetFormat:'abc'},'clearing musical differences cannot erase the independent notation choice');
 assert.equal(model.presentation(wiki,setlist,items[0]).role,'leadsheet');
 assert.equal(JSON.stringify(f.canonical.map(row=>wiki.getTiddler(row.title).fields)),f.original);
});



test('the whole repertoire uses the same fallback without changing songs or order',async()=>{
 const f=await fixture(),{model,wiki,orchestra,items}=f;
 f.patch('Easy Money',{'repertoire-pdf':'','repertoire-guitar-pdf':'pdf/easy-money-guitar.pdf'});
 f.patch('$:/config/maans/repertoire/default-source-role',{text:'score'});
 const before=f.snapshot(),view=model.presentation(wiki,orchestra,items[1]);
 assert.equal(view.role,'guitar');assert.equal(view.missing,false);assert.equal(view.fallbackFrom,'score');
 assert.equal(model.presentation(wiki,orchestra,items[0]).role,'chord-stabs','an available song preference remains authoritative');
 assert.equal(f.snapshot(),before);
});

test('a missing PDF uses ABC, and a missing YouTube view never starts unrelated audio',async()=>{
 const f=await fixture(),{model,wiki,setlist,items}=f;
 f.patch('Easy Money',{'repertoire-pdf':'','repertoire-guitar-pdf':''});
 model.setPresentation(wiki,setlist,null,'score');
 const before=f.snapshot(),view=model.presentation(wiki,setlist,items[1]);
 assert.equal(view.role,'leadsheet');assert.equal(view.abc,true);assert.equal(view.missing,false);assert.equal(f.snapshot(),before);
 model.setPresentation(wiki,setlist,null,'youtube');
 assert.equal(model.presentation(wiki,setlist,items[1]).missing,true);assert.equal(model.presentation(wiki,setlist,items[1]).role,'youtube');
});
