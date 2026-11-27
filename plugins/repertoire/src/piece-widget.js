/*\
title: $:/plugins/huwiki/repertoire/piece-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var model=require("$:/plugins/huwiki/repertoire/model.js");
function Piece(tree,options){this.initialise(tree,options);}
Piece.prototype=new Widget();
Piece.prototype.cleanup=function(){
 if(this._pdf){this._pdf.destroy();this._pdf=null;}
 if(this._score){this._score.onDestroy();this._score=null;}
 this.children=[];
};
Piece.prototype.onDestroy=function(){this.cleanup();};
Piece.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 this.title=this.getAttribute("tiddler",this.getVariable("currentTiddler"));
 var self=this,doc=this.document,host=doc.createElement("section");
 host.className="huwrep-piece";parent.insertBefore(host,nextSibling);this.domNodes.push(host);this.host=host;
 if(doc.isTiddlyWikiFakeDom){host.textContent="Åbn wikien for at vælge mellem leadsheet og PDF.";return;}
 var views=model.availableViews(this.wiki,this.title);
 if(!views.length){host.textContent="Der er endnu ingen nodeudgave til dette nummer.";return;}
 var label=doc.createElement("label");label.textContent="Visning ";
 var select=doc.createElement("select");select.className="huwrep-select";select.setAttribute("aria-label","Nodevisning for "+this.title);
 views.forEach(function(v){var o=doc.createElement("option");o.value=v.role;o.textContent=v.label;select.appendChild(o);});
 var initial=views.find(function(v){return v.role===self._role;})||views.find(function(v){return v.role==="leadsheet";})||views[0];
 this._role=initial.role;select.value=initial.role;label.appendChild(select);host.appendChild(label);
 var stage=doc.createElement("div");stage.className="huwrep-piece-stage";host.appendChild(stage);
 function draw(){
  self.cleanup();stage.textContent="";
  var view=views.find(function(v){return v.role===select.value;});self._role=view.role;
  if(view.pdf){
   stage.style.minHeight="650px";
   self._pdf=require("$:/plugins/huwiki/repertoire/pdf-score.js").mount(stage,{wiki:self.wiki,source:view.pdf,title:self.title,spread:2});
  }else{
   stage.style.minHeight="";
   var Score=require("$:/plugins/huwiki/abc/score-widget.js")["huwiki-abc"];
   var tree={type:"huwiki-abc",attributes:{tiddler:{type:"string",value:view.sourceTitle},view:{type:"string",value:"full"},embedded:{type:"string",value:"yes"},audio:{type:"string",value:"all"},"show-title":{type:"string",value:"no"}}};
   self._score=new Score(tree,{wiki:self.wiki,parentWidget:self,document:doc});self.children=[self._score];self._score.render(stage,null);
  }
 }
 select.addEventListener("change",draw);draw();
};
Piece.prototype.refresh=function(changed){
 var a=this.computeAttributes(),views=model.availableViews(this.wiki,this.title);
 if(a.tiddler||changed[this.title]||views.some(function(v){return changed[v.sourceTitle];})){
  this.cleanup();this.refreshSelf();return true;
 }
 return this.refreshChildren(changed);
};
exports["huwiki-repertoire-piece"]=Piece;
})();
