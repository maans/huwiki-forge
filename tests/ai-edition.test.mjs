import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEdition,assembleHtml} from '../assembler/assemble.mjs';
import {composeWiki,loadChoices,checkShadowConflicts} from '../assembler/compose.mjs';

const read=async p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const json=async p=>JSON.parse(await read(p));
const fetcher=async url=>{
 try{return {ok:true,json:async()=>JSON.parse(await readFile(new URL('../'+new URL(url).pathname,import.meta.url),'utf8'))};}
 catch{return {ok:false,status:404};}
};

test('AI Edition keeps existing versioned plugins, bilingual start and TiddlyWiki native save',async()=>{
 const manifest=await json('editions/ai/manifest.json');
 assert.equal(manifest.coreVersion,'5.4.1');
 assert.equal(manifest.id,'ai');
 const {tiddlers}=await loadEdition('https://forge.test/editions/ai/manifest.json',fetcher);
 const plugin=tiddlers.find(t=>t.title==='$:/plugins/huwiki/ai');
 const share=tiddlers.find(t=>t.title==='$:/plugins/huwiki/forgeshare');
 assert.equal(plugin.version,'0.4.0');
 assert.ok(share);
 const children=JSON.parse(plugin.text).tiddlers;
 assert.ok(Object.keys(children).filter(k=>k.startsWith('AI-opgave · ')).length>=23);
 for(const title of ['HUWiki AI · Værksted','HUWiki AI · Chatbibliotek','HUWiki AI · Forbindelser','HUWiki AI · Opgaver'])assert.ok(children[title],title);
 const landing=tiddlers.find(t=>t.title==='AI Edition');
 assert.match(landing.text,/\$:\/languages\/da/);
 assert.match(landing.text,/\[\[Open the AI workbench/);
 assert.match(landing.text,/\[\[Åbn AI-værkstedet/);
 assert.equal(tiddlers.find(t=>t.title==='$:/DefaultTiddlers').text,'[[AI Edition]]');
 assert.doesNotMatch(tiddlers.find(t=>t.title==='$:/SiteTitle').text,/^HUWiki/);
 checkShadowConflicts(tiddlers,'$:/themes/huwiki/modern');
 const composed=await composeWiki({choices:await loadChoices('https://forge.test/assembler/',fetcher),editionId:'ai',language:'da-DK'},fetcher);
 assert.equal(composed.manifest.id,'ai');
 assert.equal(composed.tiddlers.find(t=>t.title==='$:/language').text,'$:/languages/da-DK');
 const html=assembleHtml(await read('core/empty.html'),composed.tiddlers);
 assert.match(html,/<!-- HUWiki Forge Edition -->/);
});

test('AI Edition uses the existing Forge catalog and native plugin registry',async()=>{
 const catalogue=await json('catalog/editions.json');
 const entry=catalogue.editions.find(x=>x.id==='ai');
 assert.equal(entry.manifest,'../editions/ai/manifest.json');
 assert.equal(entry.status,'test');
 assert.ok(entry.home.headingDa&&entry.home.headingEn&&entry.home.noteDa&&entry.home.noteEn);
 const registry=await json('library/plugins/registry.json');
 for(const title of ['$:/plugins/huwiki/ai','$:/plugins/huwiki/forgeshare'])assert.ok(registry.items.some(x=>x.fields.title===title),title);
});
