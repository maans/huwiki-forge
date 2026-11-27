import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
const source=await readFile(new URL('../plugins/abc/src/repertoire-catalog.js',import.meta.url),'utf8');
function module(fetch=()=>{throw Error('No network expected');}){const exports={};runInNewContext(source,{exports,URL,fetch,AbortSignal});return exports;}
const abc='X:1\nT:Čik Čik\nC:Composer\nM:9/8\nK:Dm\nD2 E2|';
const rows=[{title:'Čik Čik','repertoire-kind':'piece','repertoire-leadsheet-source':'Lead','repertoire-guitar-pdf':'pdf/cik.pdf'},
 {title:'Lead','abc-source':abc,'repertoire-work-title':'Čik Čik','repertoire-abc-label':'Leadsheet (ABC)','source-url':'https://original.test/score',text:'Do not export arbitrary wiki text'},
 {title:'Čik Čik · Guitar','abc-source':abc.replace('D2 E2','"Dm"x4'),'repertoire-work-title':'Čik Čik','repertoire-sheet-format':'chords'},
 {title:'Only PDF','repertoire-kind':'piece','repertoire-pdf':'pdf/only.pdf'},
 {title:'$:/hidden','abc-source':abc},{title:'Draft','draft.of':'Lead','abc-source':abc}];
test('all originals and variants are grouped, with leadsheet ABC first and explicit PDF roles',()=>{
 const c=module(),index=c.merge([c.fromRows(rows,{name:'Birdland',url:'https://example.test/wiki/'})]);
 assert.equal(index.entries.length,2);const tune=c.filter(index,'cik')[0];
 assert.equal(tune.title,'Čik Čik');assert.equal(tune.variants[0].role,'leadsheet');
 assert.equal(tune.variants[1].role,'chord-stabs');assert.equal(tune.variants[2].role,'guitar');
 assert.equal(tune.variants[2].url,'https://example.test/wiki/pdf/cik.pdf');
 assert.equal(tune.variants[0].originalURL,'https://original.test/score');assert.equal(tune.variants[0].fields.text,'<$huwiki-abc/>');
 assert.equal(c.filter(index,'composer dm','leadsheet').length,1);assert.equal(c.filter(index,'','pdf').length,2);assert.equal(c.filter(index,'','abc').length,1);
 assert.equal(c.filter(index,'birdland').length,2);
});
test('identical ABC from several wikis is shared, and a local copy opens without downloading it again',async()=>{
 const c=module(),remote=c.fromRows(rows,{name:'Birdland',url:'https://example.test/wiki/'});
 const lead=remote.entries.find(e=>e.title==='Čik Čik').variants.find(v=>v.role==='leadsheet');delete lead.fields;lead.abcPath='abc/'+('a'.repeat(64))+'.json';
 const combined=c.merge([remote,c.fromRows(rows,{name:'Denne wiki'})]),entry=c.filter(combined,'cik')[0];
 assert.equal(entry.variants.length,3);assert.equal(entry.collections.length,2);
 assert.equal((await c.load(entry.variants[0]))['abc-source'],abc);assert.match(entry.variants[0].sourceURL,/example.test/);
});
test('shared index is metadata only and only the chosen ABC file is fetched',async()=>{
 const paths=[],c=module(async url=>{paths.push(url);return {ok:true,json:async()=>url.endsWith('index.json')?{schemaVersion:1,entries:[]}:{'abc-source':abc}};});
 await c.index({allTitles:()=>[]});assert.equal(paths.length,1);assert.match(paths[0],/catalog\/repertoire\/index.json$/);
 const fields=await c.load({abcPath:'abc/'+('a'.repeat(64))+'.json'});assert.equal(paths.length,2);assert.equal(fields['abc-source'],abc);
 await assert.rejects(c.load({abcPath:'https://evil.test/file.json'}),/Ugyldig/);assert.equal(paths.length,2);
});
test('offline search keeps local ABC available and never writes to the wiki',async()=>{
 const c=module(),map=new Map(rows.map(r=>[r.title,{fields:r}]));
 const index=await c.index({allTitles:()=>[...map.keys()],getTiddler:t=>map.get(t),addTiddler(){throw Error('Must not save during search');}});
 assert.match(index.warning,/fælles bibliotek/);assert.equal(c.filter(index,'cik').length,1);
});
test('catalogue builder extracts published stores, preserves originals and emits separate ABC files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'repertoire-catalogue-'));
 try{
  await mkdir(join(dir,'wiki/birdland'),{recursive:true});
  const html='<script class="tiddlywiki-tiddler-store" type="application/json">'+JSON.stringify(rows)+'</script>';
  const file=join(dir,'wiki/birdland/index.html');await writeFile(file,html);
  execFileSync(process.execPath,[new URL('../scripts/build-repertoire-catalogue.mjs',import.meta.url).pathname,'--source',dir,'--output',join(dir,'catalog/repertoire')]);
  const index=JSON.parse(await readFile(join(dir,'catalog/repertoire/index.json'),'utf8'));
  assert.equal(index.entries.length,2);assert.equal(index.sources.length,1);assert.equal(await readFile(file,'utf8'),html);
  assert.equal(JSON.stringify(index).includes('abc-source'),false);assert.equal((await readdir(join(dir,'catalog/repertoire/abc'))).length,2);
  for(const v of index.entries.flatMap(e=>e.variants).filter(v=>v.format==='abc')){assert.match(v.abcPath,/^abc\/[a-f0-9]{64}\.json$/);assert.ok(JSON.parse(await readFile(join(dir,'catalog/repertoire',v.abcPath),'utf8'))['abc-source']);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
