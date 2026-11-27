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
Piece.prototype.onDestroy=function(){if(this._book){this._book.onDestroy();this._book=null;}this.children=[];};
Piece.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 this.title=this.getAttribute("tiddler",this.getVariable("currentTiddler"));
 var original=this.wiki.getTiddler(this.title),f=original&&original.fields||{},canonical=f["repertoire-work-title"]||this.title;
 var role=this.getAttribute("role","");
 if(!role&&f["repertoire-work-title"]){var matching=model.availableViews(this.wiki,canonical).find(function(v){return v.sourceTitle===f.title;});role=matching&&matching.role||"";}
 var Book=require("$:/plugins/huwiki/repertoire/book-widget.js")["huwiki-repertoire-book"];
 var attributes={piece:{type:"string",value:canonical},role:{type:"string",value:role}};
 this._book=new Book({type:"huwiki-repertoire-book",attributes:attributes},{wiki:this.wiki,parentWidget:this,document:this.document});
 this.children=[this._book];this._book.render(parent,nextSibling);this.domNodes=this._book.domNodes;
};
Piece.prototype.refresh=function(changed){var a=this.computeAttributes();if(a.tiddler||a.role){this.onDestroy();this.refreshSelf();return true;}return this.refreshChildren(changed);};
exports["huwiki-repertoire-piece"]=Piece;
})();
