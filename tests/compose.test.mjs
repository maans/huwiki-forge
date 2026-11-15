import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadChoices,composeWiki,resolvePackages,mergeTiddlers,sameOriginUrl,checkShadowConflicts} from '../assembler/compose.mjs';
const root=new URL('../',import.meta.url);
const fetcher=async url=>{try{const data=await readFile(new URL('.'+new URL(url).pathname,root),'utf8');return {ok:true,json:async()=>JSON.parse(data)};}catch{return {ok:false,status:404};}};
const choices=await loadChoices('https://forge.example/assembler/',fetcher);
const title=id=>'$:/plugins/huwiki/'+id;
test('Assembler has complete separate Danish/English labels for all current Editions, plugins and themes',async()=>{
 const raw=JSON.parse(await readFile(new URL('../catalog/assembler-i18n.json',import.meta.url),'utf8'));
 assert.equal(raw.schemaVersion,1);
 assert.deepEqual(new Set(Object.keys(raw.editions)),new Set(choices.editions.map(e=>e.id)));
 assert.deepEqual(new Set(Object.keys(raw.packages)),new Set(choices.packages.map(p=>p.title)));
 for(const e of choices.editions){
  assert.deepEqual(e.display,raw.editions[e.id]);
  for(const language of ['da','en'])assert.ok(e.display[language].name.trim(),e.id+' '+language);
 }
 for(const p of choices.packages){
  assert.deepEqual(p.display,raw.packages[p.title]);
  for(const language of ['da','en']){
   const fields=p.display[language];
   assert.ok(fields.name.trim(),p.title+' '+language+' name');
   assert.ok(fields.description.trim(),p.title+' '+language+' description');
   assert.doesNotMatch(fields.description,/(^|\\s)(?:DA:|EN:)/i,p.title+' '+language);
  }
 }
 const importer=choices.packages.find(p=>p.title===title('musescore-import'));
 assert.match(importer.display.da.description,/Importér MuseScore/);
 assert.match(importer.display.en.description,/Import MuseScore/);
 assert.ok(importer.description.includes('DA:'),'Canonical registry metadata remains unchanged');
});
test('Composer includes dependency closure, native language, F and the native plugin library in a blank wiki',async()=>{
 const {tiddlers,added}=await composeWiki({choices,packageTitles:[title('music'),title('lessons-jazz')],language:'da-DK',name:'Mit værksted'},fetcher);
 assert.ok(added.find(p=>p.title===title('abc')));
 assert.equal(tiddlers.find(t=>t.title==='$:/SiteTitle').text,'Mit værksted');
 assert.equal(tiddlers.find(t=>t.title==='$:/language').text,'$:/languages/da-DK');
 for(const key of ['$:/config/HUWikiPluginLibrary','HUWiki Community','$:/languages/da-DK'])assert.ok(tiddlers.some(t=>t.title===key),key);
 assert.ok(tiddlers.some(t=>t.text.includes('https://forge.måns.dk/')));
});
test('Drawing material automatically adds Tegne, Excalidraw and React with original licenses',async()=>{
 const {tiddlers}=await composeWiki({choices,contentIds:['tegne-examples']},fetcher);
 for(const id of [title('tegne'),'$:/plugins/itw/tw-excalidraw','$:/plugins/linonetwo/tw-react']){
  const p=tiddlers.find(t=>t.title===id);assert.ok(p,id);assert.ok(p.license||JSON.parse(p.text).tiddlers[id+'/license']?.text,id+' license');
 }
});
test('Every existing Edition remains buildable through the composer',async()=>{
 for(const e of choices.editions){
  const result=await composeWiki({choices,editionId:e.id},fetcher);
  assert.equal(result.manifest.id,e.id);
  assert.equal(new Set(result.tiddlers.map(t=>t.title)).size,result.tiddlers.length);
 }
});
test('Themes are selectable without inactive-theme collisions',async()=>{
 const theme=choices.packages.find(p=>p['plugin-type']==='theme').title;
 const result=await composeWiki({choices,editionId:'hupedia',theme,packageTitles:[title('music')]},fetcher);
 assert.equal(result.tiddlers.find(t=>t.title==='$:/theme').text,theme);
});
test('Missing dependencies, cycles, foreign paths and conflicting titles are rejected',()=>{
 assert.throws(()=>resolvePackages(['a'],[{title:'a',dependents:'b'}]),/Missing dependency/);
 assert.throws(()=>resolvePackages(['a'],[{title:'a',dependents:'b'},{title:'b',dependents:'a'}]),/Circular/);
 assert.throws(()=>sameOriginUrl('https://elsewhere.test/plugin.json','https://forge.test/library/',['/plugins/']),/outside Forge/);
 assert.throws(()=>sameOriginUrl('../private.json','https://forge.test/plugins/',['/plugins/']),/outside Forge/);
 assert.throws(()=>mergeTiddlers([{title:'x',text:'old'}],[{title:'x',text:'new'}]),/Conflicting/);
 const plugin=(title,text)=>({title,'plugin-type':'plugin',text:JSON.stringify({tiddlers:{x:{text}}})});
 assert.throws(()=>checkShadowConflicts([plugin('a','one'),plugin('b','two')]),/Conflicting plugin/);
});
