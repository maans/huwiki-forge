/*\
title: $:/plugins/huwiki/tegne/startup.js
type: application/javascript
module-type: startup
\*/
(function(){
"use strict";
exports.name="huwiki-tegne";
exports.platforms=["browser"];
exports.after=["startup"];
exports.synchronous=true;
function isDanish(){
 return /^(?:\$:\/languages\/)?(?:huwiki-)?da(?:[-_]|$)/i.test(
  String($tw.wiki.getTiddlerText("$:/language","$:/languages/en-GB")));
}
function phrase(da,en){return isDanish()?da:en;}
function id(){
 if(typeof crypto!=="undefined"&&crypto.randomUUID)return "drawing-"+crypto.randomUUID();
 return "drawing-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}
function openDrawing(title){
 var t=$tw.wiki.getTiddler(title);
 if(!t||t.fields.type!=="application/vnd.excalidraw+json")return;
 $tw.wiki.setText("$:/temp/huwiki/tegne/selected","text",undefined,title);
 setTimeout(function(){
  var frame=document.querySelector(".hu-tegne-editor");
  if(frame&&frame.scrollIntoView)frame.scrollIntoView({behavior:"smooth",block:"nearest"});
 },120);
}
function blankScene(){
 return JSON.stringify({type:"excalidraw",version:2,source:"HUWiki Forge Tegne",
  elements:[],appState:{viewBackgroundColor:"#ffffff",exportBackground:true},files:{}});
}
function newDrawing(){
 var title=$tw.wiki.generateNewTitle(phrase("Min tegning","My drawing"));
 $tw.wiki.addTiddler(new $tw.Tiddler({
  title:title,type:"application/vnd.excalidraw+json",
  tags:["HUWiki/Tegning"],"hu-category":"Mine",
  "hu-drawing-id":id(),text:blankScene()
 },$tw.wiki.getCreationFields(),$tw.wiki.getModificationFields()));
 openDrawing(title);
}
function copyDrawing(title){
 var old=$tw.wiki.getTiddler(title);
 if(!old||old.fields.type!=="application/vnd.excalidraw+json")return;
 var clone=Object.assign({},old.fields);
 delete clone["draft.of"];delete clone["draft.title"];
 clone.title=$tw.wiki.generateNewTitle(title+phrase(" – kopi"," – copy"));
 clone["hu-category"]="Mine";
 clone["hu-drawing-id"]=id();
 if(old.fields["hu-drawing-id"])clone["hu-source-id"]=old.fields["hu-drawing-id"];
 $tw.wiki.addTiddler(new $tw.Tiddler(clone,$tw.wiki.getCreationFields(),$tw.wiki.getModificationFields()));
 openDrawing(clone.title);
}
function downloadDrawing(title){
 var t=$tw.wiki.getTiddler(title);
 if(!t||t.fields.type!=="application/vnd.excalidraw+json")return;
 var url=URL.createObjectURL(new Blob([t.fields.text||""],{type:"application/json"}));
 var link=document.createElement("a");
 link.href=url;link.download=String(title).replace(/[\\/:*?"<>|]/g,"-").slice(0,90)+".excalidraw";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(function(){URL.revokeObjectURL(url);},60000);
}
exports.startup=function(){
 $tw.rootWidget.addEventListener("hu-tegne-open",function(e){openDrawing(e.param);return false;});
 $tw.rootWidget.addEventListener("hu-tegne-new",function(){newDrawing();return false;});
 $tw.rootWidget.addEventListener("hu-tegne-copy",function(e){copyDrawing(e.param);return false;});
 $tw.rootWidget.addEventListener("hu-tegne-source",function(e){downloadDrawing(e.param);return false;});
 $tw.rootWidget.addEventListener("hu-tegne-close",function(){
  $tw.wiki.setText("$:/temp/huwiki/tegne/selected","text",undefined,"");return false;
 });
};
})();
