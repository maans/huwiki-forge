import {createRequire} from 'node:module';
import {svgDocument} from './svg-test-dom.mjs';
const xml=createRequire(import.meta.url)('tiddlywiki/plugins/tiddlywiki/xmldom/files/dom-parser.js');

// Reuse the editor's SVG/event surface, with real XML parsing/serialization
// from the existing TiddlyWiki dependency. Gesture geometry stays independent
// of the workshop implementation; these are interaction, not layout tests.
export function drawingDocument(){
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

