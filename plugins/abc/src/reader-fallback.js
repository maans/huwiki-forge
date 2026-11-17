/*\
title: $:/plugins/huwiki/abc/reader-fallback.js
type: application/javascript
module-type: filteroperator
\*/
(function(){
"use strict";

// ViewAddon supplies the ordinary reader when a score's body contains prose.
// Some imported and AniMus scores already contain their own reader. Rendering
// both creates two real players and two sidebar mixers for the same score.
// Inspect parsed widgets, rather than matching examples/comments in raw text.
function attributeValue(attribute,current,wiki){
 if(!attribute)return current;
 if(attribute.type==='string')return attribute.value;
 if(attribute.type==='macro'){
  var value=attribute.value,variable=value&&value.attributes&&value.attributes.$variable;
  if(variable&&variable.type==='string'&&variable.value==='currentTiddler')return current;
  if(value&&value.name==='currentTiddler')return current;
 }
 if(attribute.type==='indirect'&&current&&/^!![^!]+$/.test(attribute.textReference||'')){
  var t=wiki.getTiddler(current);return t&&t.fields[attribute.textReference.slice(2)];
 }
 return undefined;
}
function containsReader(nodes,title,current,wiki){
 return (nodes||[]).some(function(node){
  var attributes=node.attributes||{},next=current;
  if(node.type==='huwiki-abc')return attributeValue(attributes.tiddler,current,wiki)===title;
  if(node.type==='tiddler')next=attributeValue(attributes.tiddler,current,wiki);
  else if(node.type==='set'){
   var name=attributeValue(attributes.name,undefined,wiki);
   if(name==='currentTiddler')next=attributeValue(attributes.value,current,wiki);
   else if(name===undefined)return false;
  }else if(node.type==='let'||node.type==='vars'){
   if(attributes.currentTiddler)next=attributeValue(attributes.currentTiddler,current,wiki);
  }else if(node.type!=='element'){
   // Lists, reveals and transclusions can change context or hide their body.
   // An uncertain, conditional reader must not suppress the reliable fallback.
   return false;
  }
  return containsReader(node.children,title,next,wiki);
 });
}
exports['huwiki-abc-needs-reader']=function(source,operator,options){
 var result=[],wiki=options.wiki;
 source(function(tiddler,title){
  if(!tiddler)return;
  var parser;
  try{parser=wiki.parseTiddler(title);}catch(_ignored){}
  if(!parser||!containsReader(parser.tree,title,title,wiki))result.push(title);
 });
 return result;
};
})();
