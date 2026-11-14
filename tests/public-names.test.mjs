import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {publicWikiText,renamePackage} from '../scripts/public-names.mjs';
test('Display names preserve canonical targets, code examples, technical fields and authorship',()=>{
 const source='! HUWiki CutOut\n[[HUWiki CutOut – Studio]]\n[[HUWiki Musik|HUWiki Musik – Start]]\n<$link to="HUWiki CutOut – Studio"/>\n```\n<<include "HUWiki ABC – Nodeværksted">>\n```\nCopyright HUWiki CutOut authors';
 const actual=publicWikiText(source);
 assert.match(actual,/! CutOut/);assert.match(actual,/\[\[CutOut – Studio\|HUWiki CutOut – Studio\]\]/);assert.match(actual,/\[\[Musik\|HUWiki Musik – Start\]\]/);
 assert.ok(actual.includes('<$link to="HUWiki CutOut – Studio"/>'));assert.ok(actual.includes('<<include "HUWiki ABC – Nodeværksted">>'));assert.ok(actual.includes('Copyright HUWiki CutOut authors'));
 const p={title:'$:/plugins/huwiki/example',name:'HUWiki CutOut',author:'HUWiki',license:'original license',dependents:'$:/plugins/huwiki/abc',text:JSON.stringify({tiddlers:{'HUWiki CutOut – Studio':{title:'HUWiki CutOut – Studio',text:source},'$:/config/entry':{title:'$:/config/entry',text:'HUWiki CutOut – Studio'},'$:/plugins/huwiki/example/OriginalREADME':{title:'$:/plugins/huwiki/example/OriginalREADME',text:source}}})};
 const renamed=renamePackage(structuredClone(p));for(const f of ['title','author','license','dependents'])assert.equal(renamed[f],p[f]);const rows=JSON.parse(renamed.text).tiddlers;assert.equal(rows['HUWiki CutOut – Studio'].title,'HUWiki CutOut – Studio');assert.equal(rows['HUWiki CutOut – Studio']['forge-display-name'],'CutOut – Studio');assert.equal(rows['$:/config/entry'].text,'HUWiki CutOut – Studio');assert.equal(rows['$:/plugins/huwiki/example/OriginalREADME'].text,source);assert.deepEqual(renamePackage(structuredClone(renamed)),renamed);
});
test('Every published package and Edition uses public names without the HUWiki prefix',async()=>{
 const root=new URL('../',import.meta.url);const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
 for(const base of ['plugins','themes'])for(const dir of await readdir(new URL(base+'/',root))){let p;try{p=await read(`${base}/${dir}/dist/${base==='themes'?'theme':'plugin'}.json`);}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))continue;throw e;}assert.doesNotMatch(p.name||'',/^HUWiki\b/i,p.title);}
 const pasteup=await read('plugins/pasteup/dist/plugin.json');assert.equal(pasteup.name,'PasteUp Forge');assert.equal(pasteup.author,'Eric L. Shulman; dansk tilpasning: HUWiki');assert.equal(pasteup.license,'CC-BY-NC-SA-4.0');
 const catalog=await read('catalog/editions.json');for(const e of catalog.editions)assert.doesNotMatch(e.name,/^HUWiki\b/i,e.id);
 const shared=await read('editions/shared/libraries.json');assert.equal(shared.find(t=>t.title==='$:/config/HUWikiPluginLibrary').caption,'Plugin Library');assert.match(shared.find(t=>t.title==='$:/huwiki/forge/page-control').text,/aria-label="TiddlyWiki Forge"/);
});
