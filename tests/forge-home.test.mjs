import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildForgeHome,editionIndex} from '../scripts/build-forge-home.mjs';
import {readSavedTiddlers,importTextFields} from '../scripts/import-forge-home.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('Public Forge and downloadable Edition cards match the same catalog and sources',async()=>{
 assert.equal(await read('index.html'),await buildForgeHome());
 const cards=await editionIndex();assert.deepEqual(JSON.parse(await read('editions/forge/tiddlers/edition-index.json')),cards);
 const catalog=JSON.parse(await read('catalog/editions.json'));
 assert.deepEqual(cards.map(c=>c['edition-id']),catalog.editions.map(e=>e.id));
 for(const c of cards){assert.equal(c.status,catalog.editions.find(e=>e.id===c['edition-id']).status);assert.ok(c['note-da']);assert.ok(c['note-en']);}
 const saved=readSavedTiddlers(await read('index.html'));
 assert.equal(saved.get('$:/languages/da-DK')['plugin-type'],'language');
 assert.ok(saved.has('$:/config/HUWikiPluginLibrary'));
 assert.ok(saved.has('HUWiki Community'));
 assert.ok(saved.has('$:/plugins/huwiki/author-reading/button'));
});
test('Owner import only copies text of known page/design tiddlers, never plugins or session data',()=>{
 const source=[{title:'Welcome',text:'old',tags:'public',type:'text/vnd.tiddlywiki'}];
 const saved=new Map([['Welcome',{title:'Welcome',text:'new',tags:'evil',type:'application/javascript'}],['secret',{title:'secret',text:'private'}]]);
 assert.deepEqual(importTextFields(source,saved),[{...source[0],text:'new'}]);
 assert.throws(()=>importTextFields(source,new Map()),/Missing saved text/);
 assert.throws(()=>readSavedTiddlers('<html>not a wiki</html>'),/Not a saved Forge/);
});
