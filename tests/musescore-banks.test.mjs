import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const json=async p=>JSON.parse(await read(p));
const bankSource=await read('plugins/abc/src/musescore-bank.js');
const widgetSource=await read('plugins/musescore-import/src/widget.js');
const ae=await json('catalog/musescore/akustisk-elektrisk.json'),silba=await json('catalog/musescore/silba-atno.json');
function bankHarness(fetcher){const exports={};runInNewContext(bankSource,{exports,fetch:fetcher,File,Uint8Array,crypto:webcrypto,AbortController});return exports;}
function installed(index){return {filterTiddlers:()=>['$:/index'],getTiddler:()=>({fields:{text:JSON.stringify(index)}})};}
function importerHarness(){
 const records=new Map(),events=[];
 class Widget{initialise(tree,options){this.wiki=options.wiki;this.children=[];this.domNodes=[];}dispatchEvent(e){events.push(e);}}
 const exports={};
 runInNewContext(widgetSource,{exports,console,WeakMap,setTimeout,clearTimeout,document:{},$tw:{browser:true,wiki:{getTiddlerText:()=>'$:/languages/da-DK'}},require:name=>name==='$:/core/modules/widgets/widget.js'?{widget:Widget}:{} });
 const wiki={getTiddler:title=>records.get(title),addTiddler(){throw Error('Permanent writes forbidden in the review flow');}};
 const widget=new exports['huwiki-ms-import']({}, {wiki});widget.status={};widget.page={appendChild(){return {addEventListener(){}};}};
 widget.readModel=async file=>({name:file.name,title:'Source title',totalMeasures:8,staves:[{name:'Flute',voices:[{id:'1:0',count:20}]}]});
 widget.showStep2=function(){this.stage=2;};widget.showBatchStep2=function(){this.stage=2;};
 return {widget,records,events};
}
test('search groups historical files by tune and preserves diacritic-free metadata search',()=>{
 const bank=bankHarness(()=>{throw Error('No network during filtering');});
 const groups=bank.filter(ae,'cik');assert.equal(groups.length,1);assert.match(groups[0].title,/Čik/);assert.ok(groups[0].versions.length>1);
 assert.equal(groups[0].versions.filter(v=>v.preferred).length,1);
 const cuprija=bank.filter(silba,'cuprija');assert.equal(cuprija.length,1);assert.equal(cuprija[0].preferred.date,'2026-05-05');
 assert.ok(bank.filter(silba,'americano').some(g=>/Intrigas/.test(g.title)));
 assert.ok(bank.filter(ae,'capo 2026').length>0);
});
test('an installed catalogue can be searched offline without fetching any original',async()=>{
 let requests=0;const bank=bankHarness(async()=>{requests++;throw Error('offline');});
 const index=await bank.index('silba-atno',installed(silba));assert.equal(requests,0);assert.ok(bank.filter(index,'Loro').length);
});
test('a selected original is fetched alone and checked against its recorded hash',async()=>{
 const entry=silba.entries.find(e=>e.sourceFile==='oxe-stor-cbb.mscz'),bytes=await readFile(new URL('../'+entry.sourcePath,import.meta.url)),requested=[];
 const bank=bankHarness(async url=>{requested.push(url);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};});
 const file=await bank.file(entry);assert.equal(file.name,entry.sourceFile);assert.equal(requested.length,1);assert.ok(requested[0].endsWith(entry.sourcePath));
 const broken=bankHarness(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array(entry.bytes).buffer}));await assert.rejects(broken.file(entry),/passer ikke/);
 assert.throws(()=>bank.sourceURL({sourcePath:'https://untrusted.invalid/file.mscz'}),/Ugyldig/);
});
test('the archives contain originals and metadata, with one preferred version and no hidden ABC imports',async()=>{
 for(const id of ['akustisk-elektrisk','silba-atno']){
  const index=id==='akustisk-elektrisk'?ae:silba,pkg=await json('plugins/musescore-bank-'+id+'/dist/plugin.json'),payload=JSON.parse(pkg.text);
  assert.equal(Object.keys(payload.tiddlers).length,2);assert.ok(!pkg.text.includes('abc-source'));assert.match(payload.tiddlers[pkg.title+'/browse'].text,/huwiki-abc-search source="bank:/);
  for(const group of bankHarness().filter(index,'')){assert.equal(group.versions.filter(v=>v.preferred).length,1);const dates=group.versions.map(v=>v.date).sort().reverse();assert.equal(group.preferred.date,dates[0]);}
  assert.ok(index.entries.every(e=>e.format!=='pdf'));assert.ok(!bankHarness().filter(index,'Those Who Were').length);
 }
 assert.ok(ae.entries.some(e=>e.title==='Sat'&&e.sourceFile==='sat-bojan-krstic.mscz'&&e.dateKind==='unknown'));
 assert.equal(new Set(ae.entries.filter(e=>e.repertoireSet&&e.format!=='pending').map(e=>e.family)).size,36);
 assert.ok(silba.entries.some(e=>e.sourceFile==='om-dagen-cbb.mscz'&&e.date==='2026-11-11'));
});
test('catalogue handoff uses the existing voice and range review without saving ABC',async()=>{
 const {widget,records}=importerHarness(),before=records.size;
 const provenance={'abc-collection':'Silba Ätno','abc-origin-sha256':'abc','huwiki-source-date':'2026-11-11'};
 assert.equal(await widget.openCatalogueFiles([{file:{name:'oxe-stor-cbb.mscz'},title:'Oxe stor',provenance}]),true);
 assert.equal(widget.stage,2);assert.equal(widget.state.title,'Oxe stor');assert.equal(records.size,before);
 const fields=widget.createAbcFields(widget.model,widget.state,'X:1\nT:Oxe stor\nK:C\nC|');assert.equal(fields.title,'Oxe stor');assert.equal(fields['abc-origin-sha256'],'abc');assert.equal(fields['abc-collection'],'Silba Ätno');
});
test('several selected originals enter the existing batch preview and native import review',async()=>{
 const {widget,records,events}=importerHarness();records.set('Existing',{fields:{title:'Existing','abc-source':'unchanged'}});
 await widget.openCatalogueFiles([{file:{name:'a.mscz'},title:'Existing'},{file:{name:'b.mscz'},title:'Second'}]);
 assert.equal(widget.batchItems.length,2);assert.equal(widget.stage,2);
 const fields=widget.batchItems.map(it=>widget.createAbcFields(it.model,it.state,'X:1\nT:Tune\nK:C\nC|'));
 assert.equal(widget.stageForCoreImport(fields),true);assert.equal(events[0].type,'tm-import-tiddlers');assert.equal(records.size,1);assert.equal(records.get('Existing').fields['abc-source'],'unchanged');
 assert.equal(JSON.parse(events[0].param)[0].title,'Existing','the native importer owns overwrite/rename confirmation');
});
test('closing a catalogue preview invalidates an in-flight source parse',async()=>{
 const {widget}=importerHarness();let release;widget.readModel=()=>new Promise(resolve=>{release=resolve;});
 const loading=widget.openCatalogueFiles([{file:{name:'a.mscz'}}]);widget.onDestroy();release({staves:[],totalMeasures:0});assert.equal(await loading,false);assert.equal(widget.stage,undefined);
});
test('the maintained importer widget is bundled verbatim',async()=>{
 const pkg=await json('plugins/musescore-import/dist/plugin.json'),payload=JSON.parse(pkg.text);assert.equal(payload.tiddlers[pkg.title+'/widget.js'].text,widgetSource);assert.equal(pkg.version,'0.1.8');
});

function archiveImporterHarness(contents){
 const exports={},reads=[],parsed=[];
 class Widget{initialise(tree,options){this.wiki=options.wiki;}}
 const files=Object.fromEntries(Object.entries(contents).map(([name,text])=>[name,{dir:false,async:async()=>{reads.push(name);return text;}}]));
 const zipped={files,file:name=>files[name]};
 const converter={parseMuse:(text,name)=>{parsed.push({kind:'muse',text,name});return {title:'Muse score'};},parseMusicXML:(text,name)=>{parsed.push({kind:'musicxml',text,name});return {title:'MusicXML score'};}};
 runInNewContext(widgetSource,{exports,WeakMap,require:name=>name==='$:/core/modules/widgets/widget.js'?{widget:Widget}:name.endsWith('/jszip.js')?{loadAsync:async()=>zipped}:name.endsWith('/converter.js')?converter:{}});
 return {widget:new exports['huwiki-ms-import']({}, {wiki:{}}),reads,parsed};
}
test('MuseScore 4 container style roots do not replace the MSCX score',async()=>{
 const {widget,reads,parsed}=archiveImporterHarness({
  'other.mscx':'unused score',
  'score_style.mss':'style settings',
  'Pictures/cover.png':'cover image',
  'om-dagen.mscx':'selected MuseScore notation',
  'META-INF/container.xml':'<container><rootfiles><rootfile full-path="score_style.mss"/><rootfile full-path="Pictures/cover.png"/><rootfile full-path="om-dagen.mscx"/></rootfiles></container>'
 });
 const model=await widget.readModel({name:'om-dagen.mscz',size:100,arrayBuffer:async()=>new ArrayBuffer(0)});
 assert.equal(model.name,'om-dagen.mscz');
 assert.deepEqual(reads,['META-INF/container.xml','om-dagen.mscx']);
 assert.deepEqual(parsed,[{kind:'muse',text:'selected MuseScore notation',name:'om-dagen.mscz'}]);
});
test('MusicXML container metadata roots are ignored before selecting the declared score',async()=>{
 const {widget,reads,parsed}=archiveImporterHarness({
  'other.xml':'unused score',
  'META-INF/metadata.xml':'archive metadata',
  'score_style.mss':'style settings',
  'scores/main.musicxml':'selected MusicXML notation',
  'META-INF/container.xml':"<container><rootfiles><rootfile full-path='META-INF/metadata.xml'/><rootfile full-path='score_style.mss'/><rootfile full-path='scores/main.musicxml'/></rootfiles></container>"
 });
 const model=await widget.readModel({name:'score.mxl',size:100,arrayBuffer:async()=>new ArrayBuffer(0)});
 assert.equal(model.name,'score.mxl');
 assert.deepEqual(reads,['META-INF/container.xml','scores/main.musicxml']);
 assert.deepEqual(parsed,[{kind:'musicxml',text:'selected MusicXML notation',name:'score.mxl'}]);
});

test('both repertoire homepages expose their own installed archive',async()=>{
 for(const [id,home] of [['akustisk-elektrisk','Akustisk-Elektrisk · Kaffepausen'],['silba-atno','SilbaÄtno Repertoire – Oversigt']]){
  const config=await json('editions/'+id+'-repertoire/tiddlers/config.json');
  const page=config.find(t=>t.title===home);assert.ok(page,'repertoire homepage must exist');
  assert.ok(page.text.includes('to="$:/plugins/huwiki/musescore-bank-'+id+'/browse"'),'homepage links to its own catalogue');
  assert.match(page.text,/Nodearkiv/,'archive entry is visible and recognizable');
  const manifest=await json('editions/'+id+'-repertoire/manifest.json');
  assert.ok(JSON.stringify(manifest).includes('plugins/musescore-bank-'+id+'/dist/plugin.json'),'linked archive is installed');
 }
});
