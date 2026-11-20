import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const require=createRequire(import.meta.url);
const xml=require('tiddlywiki/plugins/tiddlywiki/xmldom/files/dom-parser.js');
const model={},workshop={};
const source=name=>readFileSync(new URL('../plugins/musical/src/'+name,import.meta.url),'utf8');
runInNewContext(source('svg-model.js'),{exports:model});
runInNewContext(source('svg-layers.js'),{exports:workshop,require:id=>id.endsWith('/svg-model.js')?model:{imageHref:()=>''}});
const plain=value=>JSON.parse(JSON.stringify(value));

// Reuse the editor's SVG/event surface, with real XML parsing/serialization
// from the existing TiddlyWiki dependency. Gesture geometry stays independent
// of the workshop implementation; these are interaction, not layout tests.
function drawingDocument(){
 const doc=svgDocument(),nativeParser=new xml.DOMParser();
 function convert(node){
  if(node.nodeType!==1)return doc.createTextNode(node.nodeValue||'');
  const result=doc.createElementNS(node.namespaceURI,node.localName);
  for(let i=0;i<node.attributes.length;i++){const attr=node.attributes[i];result.setAttribute(attr.name,attr.value);}
  result.attributes=new Proxy(result.attributes,{get(target,key){
   if(key==='length')return Object.keys(target).length;
   if(typeof key==='string'&&/^\d+$/.test(key)){const entry=Object.entries(target)[Number(key)];return entry?{name:entry[0],value:entry[1]}:undefined;}
   return target[key];
  }});
  for(let child=node.firstChild;child;child=child.nextSibling)result.appendChild(convert(child));
  return result;
 }
 function clone(node,deep){
  if(node.localName==='#text')return doc.createTextNode(node.textContent);
  const result=doc.createElementNS(node.namespaceURI,node.localName);
  for(const [name,value] of Object.entries(node.attributes))result.setAttribute(name,value);
  result._text=node._text;
  if(deep)for(const child of node.children)result.appendChild(clone(child,true));
  return result;
 }
 doc.importNode=clone;
 doc.defaultView.DOMParser=class {parseFromString(text,type){
  const documentElement=convert(nativeParser.parseFromString(text,type).documentElement);
  return {documentElement,querySelector:selector=>documentElement.matches(selector)?documentElement:documentElement.querySelector(selector)};
 }};
 doc.defaultView.XMLSerializer=class {serializeToString(node){
  const native=new xml.DOMImplementation().createDocument(null,null,null);
  function convertBack(item){
   if(item.localName==='#text')return native.createTextNode(item.textContent);
   const element=native.createElementNS(item.namespaceURI,item.localName);
   for(const [name,value] of Object.entries(item.attributes))element.setAttribute(name,value);
   if(item._text)element.appendChild(native.createTextNode(item._text));
   for(const child of item.children)element.appendChild(convertBack(child));
   return element;
  }
  return new xml.XMLSerializer().serializeToString(convertBack(node));
 }};
 return doc;
}

function fixture(){
 const doc=drawingDocument(),host=doc.createElement('section');doc.body.appendChild(host);
 const drawing=model.create({x:-100,y:-100,w:200,h:200},'Body'),first=drawing.layers[0],second=model.addLayer(drawing,'Face');
 drawing.frames[0].artwork[first.id].push({id:'shape-body',type:'rect',left:-25,top:10,width:50,height:65,fill:'#123456'});
 drawing.frames[0].artwork[second.id].push({id:'shape-face',type:'ellipse',cx:0,cy:-20,rx:20,ry:30,fill:'#f3c786'});
 const part={id:'actor-drawing',svgDrawing:plain(drawing)},sourceSnapshot=JSON.stringify(part);
 let closes=0,confirms=0,saves=0;
 doc.defaultView.confirm=()=>{confirms++;return true;};
 const api=workshop.open({doc,host,wiki:{},part,duration:3,da:true,onClose(){closes++;},onSave(){saves++;}});
 const canvas=host.querySelector('.huw-svg-canvas');
 function button(label,within=host){const result=within.querySelectorAll('button').find(node=>node.textContent===label);assert.ok(result,'button '+label);return result;}
 function shape(id){const result=canvas.querySelector('[data-svg-shape="'+id+'"]');assert.ok(result,'shape '+id);return result;}
 function select(id,x=0,y=0){button('Flyt').click();shape(id).dispatch('pointerdown',{pointerType:'touch',pointerId:4,clientX:x,clientY:y});canvas.dispatch('pointerup',{pointerType:'touch',pointerId:4,clientX:x,clientY:y});}
 const selection=()=>canvas.querySelector('.is-selected-shape')?.getAttribute('data-svg-shape')||'';
 const selectedLayer=()=>host.querySelector('.huw-svg-layers .is-active')?.dataset.layerId;
 return {doc,host,api,canvas,part,sourceSnapshot,first,second,button,shape,select,selection,selectedLayer,get closes(){return closes;},get confirms(){return confirms;},get saves(){return saves;}};
}

test('SVG Escape releases shape selection but retains the workshop, current layer and committed undo history',()=>{
 const h=fixture(),before=JSON.stringify(h.api.getModel());
 h.select('shape-face');assert.equal(h.selection(),'shape-face');assert.equal(JSON.stringify(h.api.getModel()),before,'a tap must not materialize default transforms');
 h.shape('shape-face').dispatch('pointerdown',{pointerId:7,clientX:0,clientY:0});
 h.canvas.dispatch('pointermove',{pointerId:7,clientX:12,clientY:9});
 h.canvas.dispatch('pointerup',{pointerId:7,clientX:12,clientY:9});
 const changed=JSON.stringify(h.api.getModel());assert.notEqual(changed,before);
 const escape=h.api.element.dispatch('keydown',{key:'Escape'});
 assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);
 assert.equal(h.api.element.isConnected,true);assert.equal(h.selection(),'');assert.equal(h.selectedLayer(),h.second.id);
 assert.equal(h.canvas.dataset.tool,'select');assert.equal(JSON.stringify(h.api.getModel()),changed);
 assert.equal(h.closes,0);assert.equal(h.confirms,0);assert.equal(h.saves,0);
 h.button('Fortryd').click();assert.equal(JSON.stringify(h.api.getModel()),before,'Escape adds no undo entry');
 h.button('Gentag').click();assert.equal(JSON.stringify(h.api.getModel()),changed,'redo still holds the completed edit');
 assert.equal(JSON.stringify(h.part),h.sourceSnapshot,'the draft is only persisted by explicit Save');
 h.api.close(true);
});

test('SVG Escape rolls back an unfinished drag and pen stroke, without accepting a later pointerup',()=>{
 const h=fixture();h.select('shape-face');const before=JSON.stringify(h.api.getModel());
 h.shape('shape-face').dispatch('pointerdown',{pointerType:'touch',pointerId:5,clientX:0,clientY:0});
 h.canvas.dispatch('pointermove',{pointerType:'touch',pointerId:5,clientX:30,clientY:20});
 assert.notEqual(JSON.stringify(h.api.getModel()),before);
 h.api.element.dispatch('keydown',{key:'Escape'});
 assert.equal(JSON.stringify(h.api.getModel()),before);assert.equal(h.canvas.hasPointerCapture(5),false);assert.equal(h.selection(),'');
 h.canvas.dispatch('pointerup',{pointerType:'touch',pointerId:5,clientX:60,clientY:50});
 assert.equal(JSON.stringify(h.api.getModel()),before);assert.equal(h.button('Fortryd').disabled,true);
 h.button('Frihånd').click();h.canvas.dispatch('pointerdown',{pointerId:9,clientX:40,clientY:35});h.canvas.dispatch('pointermove',{pointerId:9,clientX:50,clientY:55});
 assert.notEqual(JSON.stringify(h.api.getModel()),before);
 h.host.querySelector('[data-svg-action="deselect"]').click();
 assert.equal(JSON.stringify(h.api.getModel()),before);assert.equal(h.canvas.dataset.tool,'select');assert.equal(h.selection(),'');
 h.canvas.dispatch('pointerup',{pointerId:9,clientX:60,clientY:60});assert.equal(JSON.stringify(h.api.getModel()),before);
 assert.equal(h.api.element.isConnected,true);assert.equal(h.confirms,0);assert.equal(h.closes,0);
 h.api.close(true);
});

test('SVG blank completed taps clear selection, cancellation or motion does not, and another shape selects in one tap',()=>{
 const h=fixture();h.select('shape-body');const before=JSON.stringify(h.api.getModel());
 h.canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:1,clientX:90,clientY:90});
 assert.equal(h.selection(),'shape-body','blank pointerdown alone retains selection');
 h.canvas.dispatch('pointercancel',{pointerType:'touch',pointerId:1});assert.equal(h.selection(),'shape-body');
 h.canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:2,clientX:90,clientY:90});
 h.canvas.dispatch('pointermove',{pointerType:'touch',pointerId:2,clientX:110,clientY:90});h.canvas.dispatch('pointerup',{pointerType:'touch',pointerId:2,clientX:110,clientY:90});
 assert.equal(h.selection(),'shape-body','blank drags are not taps');
 h.canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:3,clientX:90,clientY:90});h.canvas.dispatch('pointerup',{pointerType:'touch',pointerId:8,clientX:90,clientY:90});
 assert.equal(h.selection(),'shape-body','a second finger cannot complete the first tap');
 h.canvas.dispatch('pointerup',{pointerType:'touch',pointerId:3,clientX:90,clientY:90});assert.equal(h.selection(),'');
 h.select('shape-body');h.select('shape-face');assert.equal(h.selection(),'shape-face');assert.equal(h.selectedLayer(),h.second.id);
 assert.equal(JSON.stringify(h.api.getModel()),before);assert.equal(h.button('Fortryd').disabled,true);
 h.api.close(true);
});

test('SVG drawing on blank space still creates a committed shape and Escape only disarms the drawing tool',()=>{
 const h=fixture(),before=JSON.stringify(h.api.getModel());
 assert.equal(h.canvas.dataset.tool,'pen');
 h.canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:1,clientX:55,clientY:55});h.canvas.dispatch('pointermove',{pointerType:'touch',pointerId:1,clientX:70,clientY:75});h.canvas.dispatch('pointerup',{pointerType:'touch',pointerId:1,clientX:70,clientY:75});
 const changed=JSON.stringify(h.api.getModel());assert.notEqual(changed,before);assert.ok(h.selection());
 h.api.element.dispatch('keydown',{key:'Escape'});
 assert.equal(h.canvas.dataset.tool,'select');assert.equal(h.selection(),'');assert.equal(JSON.stringify(h.api.getModel()),changed);
 h.button('Fortryd').click();assert.equal(JSON.stringify(h.api.getModel()),before);
 h.button('Gentag').click();assert.equal(JSON.stringify(h.api.getModel()),changed);
 h.button('Annuller').click();assert.equal(h.closes,1);assert.equal(h.confirms,1);assert.equal(h.api.element.isConnected,false);
});
