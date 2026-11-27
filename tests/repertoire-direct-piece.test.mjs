import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
test('direct tune view opens the available leadsheet and switches to PDF without duplicate players',async()=>{
 const doc=svgDocument(),events=[];let views=[{role:'leadsheet',label:'Leadsheet (ABC)',sourceTitle:'Tune · Leadsheet',abc:true},{role:'guitar',label:'Guitar (PDF)',pdf:'pdf/tune.pdf'}];
 function Widget(){}Widget.prototype.initialise=function(tree,options){Object.assign(this,options);this.domNodes=[];this.children=[];this.attributes=tree.attributes;};
 Widget.prototype.computeAttributes=()=>({});Widget.prototype.getAttribute=function(key,fallback){return this.attributes[key]?.value||fallback;};Widget.prototype.getVariable=()=> 'Tune';Widget.prototype.refreshChildren=()=>false;
 class Score{constructor(tree){this.source=tree.attributes.tiddler.value;}render(host){events.push('abc:'+this.source);host.appendChild(doc.createElement('svg'));}onDestroy(){events.push('dispose-abc');}}
 const exports={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/piece-widget.js',import.meta.url),'utf8'),{exports,require:id=>id.includes('widgets/widget')?{widget:Widget}:id.endsWith('model.js')?{availableViews:()=>views}:id.endsWith('pdf-score.js')?{mount:(host,options)=>{events.push('pdf:'+options.source);assert.equal(options.spread,2);return {destroy(){events.push('dispose-pdf');}};}}:{'huwiki-abc':Score}});
 const piece=new exports['huwiki-repertoire-piece']({attributes:{}},{document:doc,wiki:{}});piece.render(doc.body,null);
 assert.equal(events[0],'abc:Tune · Leadsheet');
 const select=doc.body.querySelector('select');assert.equal(select.getAttribute('aria-label'),'Nodevisning for Tune');
 select.value='guitar';select.dispatch('change');assert.deepEqual(events.slice(-2),['dispose-abc','pdf:pdf/tune.pdf']);
 select.value='leadsheet';select.dispatch('change');assert.deepEqual(events.slice(-2),['dispose-pdf','abc:Tune · Leadsheet']);
 piece.onDestroy();assert.equal(events.at(-1),'dispose-abc');
});
