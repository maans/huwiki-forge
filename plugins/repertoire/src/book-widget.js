/*\
title: $:/plugins/huwiki/repertoire/book-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var model=require("$:/plugins/huwiki/repertoire/model.js");
var Layout=require("$:/plugins/huwiki/repertoire/book-layout.js");
var TEMP="$:/temp/huwiki/repertoire/active-setlist";
var MODE="$:/temp/huwiki/repertoire/book-mode";
function el(doc,tag,cls,label){
 var n=doc.createElement(tag);
 if(cls)n.className=cls;
 if(label!==undefined)n.textContent=String(label);
 return n;
}
function btn(doc,label,onClick,css){
 var b=el(doc,"button","huwrep-button "+(css||""),label);
 b.type="button";b.addEventListener("click",onClick);return b;
}
function choice(doc,id,label){
 var o=el(doc,"option","",label);o.value=id;return o;
}
function name(wiki,item){
 var t=wiki.getTiddler(item);return t?t.fields["music-title"]||item:item;
}
function Book(parseTreeNode,options){this.initialise(parseTreeNode,options);}
Book.prototype=new Widget();
Book.prototype.disposeScore=function(){
 if(this._observer){this._observer.disconnect();this._observer=null;}
 if(this._score){
  try{this._score.onDestroy();}catch(_ignored){}
  this._score=null;
 }
 this.children=[];
};
Book.prototype.onDestroy=function(){
 this.disposeScore();
 if(this._win&&this._resize)this._win.removeEventListener("resize",this._resize);
 if(this._win&&this._orientation)this._win.removeEventListener("orientationchange",this._orientation);
 this._win=null;this._resize=null;this._orientation=null;
};
Book.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 var doc=this.document;
 var host=this.host=el(doc,"section","huwrep-book");
 parent.insertBefore(host,nextSibling);this.domNodes.push(host);
 if(doc.isTiddlyWikiFakeDom){
  host.appendChild(el(doc,"p","","Nodebogen er interaktiv. Åbn wikien i browseren for at bruge den."));
  return;
 }
 this._win=doc.defaultView;
 this.preference=this.wiki.getTiddlerText(MODE)||"auto";
 if(["auto","single","spread"].indexOf(this.preference)<0)this.preference="auto";
 this.setlistTitle=this.getAttribute("setlist","")||this.wiki.getTiddlerText(TEMP)||"";
 this.activeItem="";
 this._resize=this.updateMode.bind(this);
 this._orientation=this.updateMode.bind(this);
 if(this._win){
  this._win.addEventListener("resize",this._resize);
  this._win.addEventListener("orientationchange",this._orientation);
 }
 this.draw();
};
Book.prototype.navigate=function(title){
 this.dispatchEvent({type:"tm-navigate",navigateTo:title,
  navigateFromTitle:this.getVariable("currentTiddler"),navigateFromNode:this,
  navigateSuppressNavigation:false});
};
Book.prototype.selectSetlist=function(title){
 this.setlistTitle=title;this.activeItem="";
 this.wiki.addTiddler(new $tw.Tiddler({title:TEMP,type:"text/plain",text:title}));
 this.draw();
};
Book.prototype.selectItem=function(title,last){
 this.activeItem=title;this.lastPage=!!last;
 this.draw();
};
Book.prototype.pager=function(){
 return this._score&&this._score._pager&&this._score._pager.element&&this._score._pager.element.isConnected?
  this._score._pager:null;
};
Book.prototype.updateMode=function(){
 if(!this.host||!this.host.isConnected||!this._win)return;
 var width=this._win.innerWidth,height=this._win.innerHeight;
 var mode=Layout.mode(this.preference,width,height),selector;
 var pager=this.pager();
 if(!pager)return;
 selector=pager.element.querySelector(".huwabc-page-select");
 if(selector&&selector.value!==mode){
  selector.value=mode;
  selector.dispatchEvent(new this._win.Event("change",{bubbles:true}));
 }
 if(this._displayMode){
  this._displayMode.textContent=mode==="spread"?"To sider":"Én side";
 }
 if(this.lastPage&&pager.info().count>0){
  this.lastPage=false;
  pager.go(pager.info().count-1,false);
 }
};
Book.prototype.turn=function(delta){
 var all=model.entries(this.wiki,this.setlistTitle);
 var i=all.indexOf(this.activeItem),pager=this.pager();
 if(i<0)return;
 if(!pager){
  // No ABC pages (text or scanned artwork): turning means changing song.
  var sibling=i+delta;if(sibling>=0&&sibling<all.length)this.selectItem(all[sibling],delta<0);
  return;
 }
 var info=pager.info(),target=Layout.direction(info.page,info.count,info.shown,delta,i,all.length);
 if(target.kind==="page"){
  if(delta>0)pager.next();else pager.previous();
 }else if(target.kind==="song"){
  this.selectItem(all[target.index],target.lastPage);
 }else if(target.kind==="unready"){
  // A large ABC score may still be drawing: don't skip to the next tune.
  if(this._pageStatus)this._pageStatus.textContent="Noderne indlæses …";
 }
};
Book.prototype.draw=function(){
 var self=this,doc=this.document,wiki=this.wiki,host=this.host;
 if(!host)return;
 this.disposeScore();host.textContent="";
 var sets=model.orchestras(wiki).flatMap(function(o){return model.setlists(wiki,o.fields.title);});
 if(!sets.some(function(s){return s.fields.title===self.setlistTitle;}))
  this.setlistTitle=sets.length?sets[0].fields.title:"";
 var set=wiki.getTiddler(this.setlistTitle),all=set?model.entries(wiki,this.setlistTitle):[];
 if(all.indexOf(this.activeItem)<0)this.activeItem=all.length?all[0]:"";
 var index=all.indexOf(this.activeItem);
 var toolbar=el(doc,"header","huwrep-book-header");host.appendChild(toolbar);
 toolbar.appendChild(btn(doc,"← Repertoireværksted",function(){
  self.disposeScore();host.hidden=true;self.navigate("HUWiki Repertoire – Start");
 }));
 var selector=el(doc,"select","huwrep-input huwrep-book-select");
 selector.setAttribute("aria-label","Vælg sætliste");
 sets.forEach(function(s){
  var orch=wiki.getTiddler(s.fields["orchestra-title"]);
  selector.appendChild(choice(doc,s.fields.title,(orch?.fields.name||"Orkester")+" · "+(s.fields.name||s.fields.title)));
 });
 selector.value=this.setlistTitle;
 selector.addEventListener("change",function(){self.selectSetlist(this.value);});
 toolbar.appendChild(selector);
 var mode=el(doc,"select","huwrep-input huwrep-book-view");
 mode.setAttribute("aria-label","Visning på iPad");
 [["auto","Automatisk efter skærmretning"],["single","Én side"],["spread","To sider"]].forEach(function(x){mode.appendChild(choice(doc,x[0],x[1]));});
 mode.value=this.preference;
 mode.addEventListener("change",function(){
  self.preference=this.value;
  wiki.addTiddler(new $tw.Tiddler({title:MODE,type:"text/plain",text:this.value}));
  self.updateMode();
 });
 toolbar.appendChild(mode);
 this._displayMode=el(doc,"span","huwrep-muted huwrep-book-mode","");toolbar.appendChild(this._displayMode);
 var header=el(doc,"div","huwrep-book-heading");host.appendChild(header);
 if(!all.length){
  header.appendChild(el(doc,"h2","","Sætlisten er tom"));
  host.appendChild(el(doc,"p","huwrep-muted","Vælg en sætliste med numre i Repertoireværkstedet."));
  return;
 }
 header.appendChild(el(doc,"h2","",name(wiki,this.activeItem)));
 header.appendChild(el(doc,"span","huwrep-muted",(index+1)+" / "+all.length+" numre"));
 var listBox=el(doc,"details","huwrep-book-list");host.appendChild(listBox);
 listBox.appendChild(el(doc,"summary","","Vælg nummer fra sætlisten"));
 var list=el(doc,"div","huwrep-book-list-items");listBox.appendChild(list);
 all.forEach(function(id,i){
  var b=btn(doc,(i+1)+". "+name(wiki,id),function(){listBox.open=false;self.selectItem(id,false);},
   id===self.activeItem?"huwrep-primary":"");
  b.setAttribute("aria-current",id===self.activeItem?"true":"false");
  list.appendChild(b);
 });
 var row=el(doc,"div","huwrep-book-agreement"),agreement=model.effective(wiki,this.setlistTitle,this.activeItem);
 if(agreement.key)row.appendChild(el(doc,"span","","Aftalt toneart: "+agreement.key));
 if(agreement.tempo)row.appendChild(el(doc,"span","","Tempo: "+agreement.tempo));
 if(agreement.form)row.appendChild(el(doc,"span","huwrep-book-form",agreement.form));
 if(row.childNodes.length)host.appendChild(row);
 var stage=el(doc,"main","huwrep-book-stage");host.appendChild(stage);
 var source=wiki.getTiddler(name(wiki,this.activeItem)),f=source&&source.fields;
 if(f&&typeof f["abc-source"]==="string"){
  var scoreHost=el(doc,"div","huwrep-book-score");stage.appendChild(scoreHost);
  try {
   // The full notation engine (pagination, audio and page dots) is reused;
   // only the active score widget exists. No orchestral ABC is duplicated.
   var Score=require("$:/plugins/huwiki/abc/score-widget.js")["huwiki-abc"];
   var tree={type:"huwiki-abc",attributes:{
    tiddler:{type:"string",value:source.fields.title},
    view:{type:"string",value:"full"},
    embedded:{type:"string",value:"yes"},
    audio:{type:"string",value:"all"},
    "show-title":{type:"string",value:"no"}}};
   this._score=new Score(tree,{wiki:wiki,parentWidget:this,document:doc});
   this.children=[this._score];
   this._score.render(scoreHost,null);
   var win=this._win;
   if(win&&win.MutationObserver){
    this._observer=new win.MutationObserver(function(){self.updateMode();});
    this._observer.observe(scoreHost,{childList:true,subtree:true});
   }
   this.updateMode();
  }catch(error){
   this.disposeScore();
   scoreHost.appendChild(el(doc,"p","huwrep-muted","Noderne kunne ikke vises: "+error.message));
   stage.appendChild(btn(doc,"Åbn originalen",function(){self.navigate(source.fields.title);}));
  }
  if(agreement.key){
   stage.appendChild(el(doc,"p","huwrep-muted","Bemærk: Den aftalte toneart vises ovenfor; selve ABC-noderne transponeres endnu ikke automatisk."));
  }
 }else{
  var imageTitle=f&&f["repertoire-image"]||"";
  var image=wiki.getTiddler(imageTitle)||source;
  var imageFields=image&&image.fields||{};
  var imageSrc="";
  if(/^image\//.test(imageFields.type||"")){
   var data=imageFields.text||"";
   if(/^data:image\//.test(data))imageSrc=data;
   else if(imageFields._canonical_uri&&/^https?:\/\//.test(imageFields._canonical_uri))imageSrc=imageFields._canonical_uri;
   else if(data&&!/^image\/svg\+xml$/.test(imageFields.type))imageSrc="data:"+imageFields.type+";base64,"+data;
   else if(data)imageSrc="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data);
  }else if(imageTitle&&/^https?:\/\//.test(imageTitle)){imageSrc=imageTitle;}
  if(imageSrc){
   var img=el(doc,"img","huwrep-book-image");img.alt=name(wiki,this.activeItem);
   img.src=imageSrc;stage.appendChild(img);
  }else{
   stage.appendChild(el(doc,"p","huwrep-muted","Ingen ABC-noder eller scannet nodebillede knyttet til melodien. Aftalerne kan stadig læses her."));
  }
  if(source)stage.appendChild(btn(doc,"Åbn melodien",function(){self.navigate(source.fields.title);}));
 }
 var footer=el(doc,"footer","huwrep-book-footer");host.appendChild(footer);
 var prev=btn(doc,"‹ Forrige side / nummer",function(){self.turn(-1);});
 var next=btn(doc,"Næste side / nummer ›",function(){self.turn(1);});
 var songPrev=btn(doc,"⇤ Forrige nummer",function(){if(index>0)self.selectItem(all[index-1],false);});
 var songNext=btn(doc,"Næste nummer ⇥",function(){if(index<all.length-1)self.selectItem(all[index+1],false);});
 songPrev.disabled=index===0;songNext.disabled=index===all.length-1;
 this._pageStatus=el(doc,"span","huwrep-muted","Sidevisning følger iPadens skærmretning");
 footer.append(songPrev,prev,this._pageStatus,next,songNext);
 this.updateMode();
};
Book.prototype.refresh=function(changed){
 var titles=Object.keys(changed||{});
 if(titles.some(function(title){return title.indexOf("Repertoire/")===0;})){
  this.draw();return true;
 }
 if(this._score&&this._score.refresh){
  try{return !!this._score.refresh(changed);}catch(_ignored){return false;}
 }
 return false;
};
exports["huwiki-repertoire-book"]=Book;
})();