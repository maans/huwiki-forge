import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const exports={};vm.runInNewContext(fs.readFileSync(new URL('../plugins/musical/src/layer-order.js',import.meta.url),'utf8'),{exports,require:()=>({}),Set});
test('Front-to-back UI moves complete figure subtrees without changing their animation',()=>{const parts=[{id:'back'},{id:'actor'},{id:'arm',parent:'actor',keys:[{t:0,r:25}]},{id:'hand',parent:'arm'},{id:'tree'}];const result=exports.reorderRoots(parts,['actor','tree','back']);assert.deepEqual(Array.from(result,p=>p.id),['back','tree','actor','arm','hand']);assert.equal(result[3],parts[2]);assert.equal(parts[2].keys[0].r,25);assert.equal(result[4].parent,'arm');});
test('Invalid orders cannot drop, duplicate or detach figures',()=>{const parts=[{id:'a'},{id:'b'},{id:'hand',parent:'a'}];assert.throws(()=>exports.reorderRoots(parts,['a']),/Invalid/);assert.throws(()=>exports.reorderRoots(parts,['a','a']),/Invalid/);assert.throws(()=>exports.reorderRoots(parts,['a','hand']),/Invalid/);});

import {svgDocument} from './helpers/svg-test-dom.mjs';
test('layer reorder moves whole-object wrappers without nesting one figure inside another',()=>{
 const doc=svgDocument(),parent=doc.createElement('svg'),nodes={};
 for(const id of ['back','actor','table']){const el=doc.createElement('g');parent.appendChild(el);nodes[id]={el};}
 const wrap=doc.createElement('g'),actor=nodes.actor.el;parent.replaceChild(wrap,actor);wrap.appendChild(actor);actor._musicalWholeWrapper=wrap;wrap.setAttribute('transform','translate(40 20)');
 const view={scene:{_title:'Stage',parts:[{id:'back'},{id:'actor'},{id:'hand',parent:'actor'},{id:'table'}]},nodes};
 exports.applyToViews(view,'Stage',['actor','table','back']);
 assert.deepEqual(parent.children,[nodes.back.el,nodes.table.el,wrap]);assert.equal(actor.parentNode,wrap);assert.equal(wrap.getAttribute('transform'),'translate(40 20)');
 exports.applyToViews(view,'Stage',['table','actor','back']);assert.deepEqual(parent.children,[nodes.back.el,wrap,nodes.table.el]);assert.equal(nodes.table.el.parentNode,parent);
});
