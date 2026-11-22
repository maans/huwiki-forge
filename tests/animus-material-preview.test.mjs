import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
function moduleAt(path,require=()=>({})){const exports={};vm.runInNewContext(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{exports,require,JSON,Number,setTimeout,clearTimeout});return exports;}
const Engine=moduleAt('plugins/cutout/src/engine.js',name=>name.endsWith('i18n.js')?{t:s=>s}:{resolve:(_w,_id,title)=>title});
const Preview=moduleAt('plugins/musical/src/material-preview.js',()=>Engine);
const wiki={getTiddler:()=>undefined,getTiddlerText:(_t,f)=>f};
test('composite preview shows body and head together and preserves the authored model',()=>{
 const doc=svgDocument(),host=doc.createElement('div');doc.body.appendChild(host);
 const parts=[{id:'actor',type:'group',keys:[{t:0,x:0,y:0}]},{id:'body',parent:'actor',type:'rect',geo:{x:-20,y:0,w:40,h:70},fill:'#123456'},{id:'head',parent:'actor',type:'circle',geo:{r:15,cy:-20},fill:'#abcdef'}];
 const before=JSON.stringify(parts),view=Preview.render(doc,wiki,host,{assets:[]},parts,Engine);
 assert.equal(Object.keys(view.nodes).length,3);assert.equal(view.nodes.body.shape.getAttribute('fill'),'#123456');
 const [,y,,h]=view.svg.getAttribute('viewBox').split(' ').map(Number);assert(y<=-35);assert(y+h>=70);assert(h<150);assert.equal(JSON.stringify(parts),before);assert.equal(view.back.parentNode,null);
});
test('cropped image previews use the authored crop, rather than the entire source atlas',()=>{
 const doc=svgDocument(),host=doc.createElement('div'),create=doc.createElementNS;
 doc.createElementNS=(ns,tag)=>{const node=create(ns,tag);if(tag==='svg')node.getBBox=()=>({x:0,y:0,width:400,height:500});return node;};
 const part={id:'eye',type:'image',asset:'atlas',geo:{x:0,y:0,w:20,h:10,crop:{x:30,y:40,w:20,h:10,sourceWidth:400,sourceHeight:500}}};
 const view=Preview.render(doc,wiki,host,{assets:[{id:'atlas',url:'https://forge.xn--mns-ula.dk/atlas.png'}]},[part],Engine);
 assert.equal(view.nodes.eye.shape.getAttribute('viewBox'),'30 40 20 10');
 const [,,width,height]=view.svg.getAttribute('viewBox').split(' ').map(Number);assert(width<30);assert(height<20);
 assert.equal(view.imageContext.defs.firstChild.getAttribute('href'),'https://forge.xn--mns-ula.dk/atlas.png');
});
test('local composite artwork is resolved from every dependency, without changing the wiki',()=>{
 const doc=svgDocument(),host=doc.createElement('div'),local={fields:{type:'image/png',text:'local-image'}};
 const w={...wiki,getTiddler:title=>title==='saved'?local:undefined};
 const view=Preview.render(doc,w,host,{assets:[{id:'body',title:'saved',url:'https://forge.xn--mns-ula.dk/body.png'}]},[{id:'body',type:'image',asset:'body',geo:{w:20,h:30}}],Engine);
 assert.equal(view.nodes.body.shape.getAttribute('href'),'data:image/png;base64,local-image');
});
test('model loading is limited to two requests and closing drops the pending cards',async()=>{
 const pending=[],signals=[],seen=[];const work=Preview.queue((_url,{signal})=>{signals.push(signal);return new Promise(resolve=>pending.push(resolve));},AbortController);
 for(let i=0;i<5;i++)work.add('model-'+i,()=>seen.push(i),()=>seen.push('error'));
 assert.equal(pending.length,2);pending[0]({ok:true,text:async()=>JSON.stringify({parts:[{id:'body'}]})});
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pending.length,3);assert.deepEqual(seen,[0]);
 work.close();assert(signals.slice(1).every(signal=>signal.aborted));
 pending.slice(1).forEach(resolve=>resolve({ok:true,text:async()=>JSON.stringify({parts:[{id:'body'}]})}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(seen,[0]);assert.equal(pending.length,3);
});
test('a missing preview is labelled instead of being replaced by unrelated artwork',()=>{
 const doc=svgDocument(),card=doc.createElement('article');const host=Preview.mount(doc,wiki,card,{assets:[]},{},true);
 assert.equal(host.textContent,'Forhåndsvisning mangler');assert.equal(host.getAttribute('data-preview-state'),'unavailable');
});
