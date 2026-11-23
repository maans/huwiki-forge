import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {loadChoices,composeWiki,resolveEditionId} from '../assembler/compose.mjs';
const root=path.resolve(import.meta.dirname,'..');
const base='https://local.invalid/forge/';
async function fetcher(url){
 const u=new URL(url);assert.equal(u.origin,'https://local.invalid');assert.ok(u.pathname.startsWith('/forge/'));
 try{const value=JSON.parse(await readFile(path.join(root,u.pathname.slice(7)),'utf8'));return {ok:true,json:async()=>value};}
 catch(e){if(e.code!=='ENOENT')throw e;return {ok:false,status:404};}
}
test('A blank wiki selecting only Repertoire receives ABC and both print entry pages',async()=>{
 const choices=await loadChoices(base+'assembler/',fetcher);
 const built=await composeWiki({choices,packageTitles:['$:/plugins/huwiki/repertoire'],language:'da-DK'},fetcher);
 assert.ok(built.tiddlers.some(t=>t.title==='$:/plugins/huwiki/abc'));
 const rep=built.tiddlers.find(t=>t.title==='$:/plugins/huwiki/repertoire');
 const pages=JSON.parse(rep.text).tiddlers;
 for(const title of ['Repertoire – Stiknoder','Repertoire – Cue sheets and parts'])assert.match(pages[title].text,/huwiki-abc-cues setlist=/);
 assert.match(pages['$:/plugins/huwiki/repertoire/Sidebar'].text,/Repertoire – Stiknoder/);
});
test('Workshop and tune book print entry preserve the selected set list in both languages',async()=>{
 const source=await readFile(path.join(root,'plugins/repertoire/src/print.js'),'utf8');
 for(const [language,title] of [['$:/languages/da-DK','Repertoire – Stiknoder'],['$:/languages/en-GB','Repertoire – Cue sheets and parts']]){
  const written=new Map(),exports={};let navigated;
  runInNewContext(source,{exports,require:()=>({})});
  exports.cues({getTiddlerText:()=>language,setText:(key,field,index,value)=>written.set(key,value)},'My concert',{navigate:t=>navigated=t});
  assert.equal(navigated,title);
  assert.equal(written.get('$:/temp/huwiki/repertoire/active-setlist'),'My concert');
  assert.equal(written.get('$:/temp/huwiki/abc/cue-selection'),'My concert');
 }
});
test('Silba Ätno uses the canonical address, exact requested text and legacy demo aliases',async()=>{
 const choices=await loadChoices(base+'assembler/',fetcher);
 assert.equal(resolveEditionId(choices,'silva-ethno-repertoire'),'silba-atno-repertoire');
 const built=await composeWiki({choices,editionId:'silva-ethno-repertoire',language:'da-DK'},fetcher);
 assert.equal(built.manifest.id,'silba-atno-repertoire');
 const home=built.tiddlers.find(t=>t.title==='SilbaÄtno Repertoire – Oversigt');
 assert.ok(home.text.includes('Åbn nodebogen for at bladre gennem den aktuelle sætliste. Vælg én eller to nodesider og brug Music Minus One. Site-visningen er en særskilt offentliggjort HTML-afspiller.'));
 assert.match(home.text,/<h1>Silba Ätno<\/h1>/);
 assert.doesNotMatch(home.text,/silva-ethno/);
 for(const file of ['index.html','site/index.html'])assert.match(await readFile(path.join(root,'editions/silva-ethno-repertoire',file),'utf8'),/silba-atno-repertoire/);
});
