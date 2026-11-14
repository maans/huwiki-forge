import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const exports={};vm.runInNewContext(await readFile('plugins/instantwiki/src/model.js','utf8'),{exports,Set,Map,Date});
const plain=x=>JSON.parse(JSON.stringify(x));
test('InstantWiki unchecked boundaries merge without losing any source text',()=>{
 const sections=['Alpha','Beta','Gamma'].map(title=>({title,text:'<p>'+title+'</p>',mergeText:'<h2>'+title+'</h2>',path:[]}));
 const groups=plain(exports.applyPlan(sections,[{splitBefore:false,title:'Renamed'},{splitBefore:false},{splitBefore:true}]));
 assert.equal(groups.length,2);assert.equal(groups[0].outputTitle,'Renamed');assert.match(groups[0].text,/Alpha.*\n\n.*Beta/);assert.deepEqual(groups[0].sourceIndices,[0,1]);assert.match(groups[1].text,/Gamma/);
});
test('InstantWiki keeps hierarchy through renames and protects existing/system titles',()=>{
 const sections=[{title:'Parent',text:'<h1>Parent</h1>',tocType:'heading',path:[]},{title:'Child',text:'<h2>Child</h2>',tocType:'heading',path:['Parent']},{title:'Body',text:'<p>Body</p>',path:['Parent','Child']}];
 const result=plain(exports.createTiddlers({sections,plan:[{title:'Renamed'},{title:'$:/core'},{title:'Body'}],source:{name:'Document'},existing:['Document','Renamed','Body'],tag:'$:/tags/Stylesheet',id:'test'}));
 assert.equal(result.root,'Document (2)');assert.equal(result.tiddlers[2]['instant-parent'],'Renamed (2)');assert.equal(result.tiddlers[3]['instant-parent'],'Document core');assert.deepEqual(result.tiddlers[1].list,['Document core']);assert.equal(result.tiddlers[0].text,'{{||$:/Wiki/DocumentView}}');assert.ok(result.tiddlers.every(t=>!t.title.startsWith('$:/')&&!t.tags.includes('$:/tags/Stylesheet')));
});
test('InstantWiki splits headings and merges their paragraphs by default',()=>{
 const blocks=[{plain:'First',html:'<h1>First</h1>',level:1},{plain:'Body',html:'<p>Body</p>'},{plain:'Second',html:'<h2>Second</h2>',level:2},{plain:'Last',html:'<p>Last</p>'}];
 const result=plain(exports.split(blocks));assert.equal(result.sections.length,2);assert.match(result.sections[0].text,/Body/);assert.deepEqual(result.sections[1].path,['First']);assert.equal(exports.split(blocks,{splitMode:'detailed'}).sections.length,4);
});
test('InstantWiki literal source text cannot become HTML or TiddlyWiki widgets',()=>{
 const escaped=exports.escape('<$action-setfield $tiddler="$:/core"/> {{evil}} [[link]]');assert.doesNotMatch(escaped,/[<>\[\]{}]/);
});
