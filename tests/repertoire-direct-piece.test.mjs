import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
test('a direct piece and a source deep link use the same book, with an explicit source role',async()=>{
 const doc=svgDocument(),events=[],rows={'Tune · Leadsheet':{fields:{title:'Tune · Leadsheet','repertoire-work-title':'Tune'}}};
 function Widget(){}Widget.prototype.initialise=function(tree,options){Object.assign(this,options);this.domNodes=[];this.children=[];this.attributes=tree.attributes;};
 Widget.prototype.computeAttributes=()=>({});Widget.prototype.getAttribute=function(key,fallback){return this.attributes[key]?.value||fallback;};Widget.prototype.getVariable=()=> 'Tune';Widget.prototype.refreshChildren=()=>false;
 class Book{constructor(tree){this.attributes=tree.attributes;this.domNodes=[];events.push(tree.attributes);}render(host){const node=doc.createElement('main');this.domNodes.push(node);host.appendChild(node);}onDestroy(){events.push('disposed');}}
 const exports={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/piece-widget.js',import.meta.url),'utf8'),{exports,require:id=>id.includes('widgets/widget')?{widget:Widget}:id.endsWith('model.js')?{availableViews:()=>[{role:'leadsheet',sourceTitle:'Tune · Leadsheet'}]}:{'huwiki-repertoire-book':Book}});
 const wiki={getTiddler:title=>rows[title]};
 const direct=new exports['huwiki-repertoire-piece']({attributes:{}},{document:doc,wiki});direct.render(doc.body,null);
 assert.equal(events[0].piece.value,'Tune');assert.equal(events[0].role.value,'');direct.onDestroy();assert.equal(events.at(-1),'disposed');
 const source=new exports['huwiki-repertoire-piece']({attributes:{tiddler:{value:'Tune · Leadsheet'}}},{document:doc,wiki});source.render(doc.body,null);
 assert.equal(events.at(-1).piece.value,'Tune');assert.equal(events.at(-1).role.value,'leadsheet');
});
