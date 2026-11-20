/*\
title: $:/plugins/huwiki/abc/reader-mode.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";

// A presentation-only layer. Never change source ABC, player configuration,
// saved page preferences or the currently running audio controller.
function node(doc,tag,cls,text){
 var n=doc.createElement(tag);
 if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);
 return n;
}
function action(doc,label,cls,fn){
 var b=node(doc,"button",cls,label);
 b.type="button";b.addEventListener("click",fn);return b;
}
function pageAction(info,delta){
 if(!info||!Number(info.count))return "unready";
 var current=Math.max(1,Number(info.page)||1);
 var shown=Math.max(1,Number(info.shown)||1);
 if(delta<0)return current>1?"page":"boundary";
 return current+shown-1<Number(info.count)?"page":"boundary";
}
function Reader(options){
 this.host=options.host;this.paper=options.paper;this.actions=options.actions;
 this.getPager=options.pager;this.title=options.title||"Nodeark";
 this.doc=this.host.ownerDocument;this.win=this.doc.defaultView;
 this.book=this.host.closest(".huwrep-book");
 this.mode="vis";this.controlsOpen=false;this.fitMode="fit";this.active=false;
 this.cleanup=[];this._touch=null;
 this.create();
 // Repertoire already owns a reading preference. Show the same selected mode
 // instead of silently resetting it when a musician enters ABC's reader.
 var book=this.host.closest(".huwrep-book"),outerChoice=book&&book.querySelector(".huwrep-book-view");
 if(outerChoice&&/^(auto|single|spread)$/.test(outerChoice.value))this.pageChoice.value=outerChoice.value;
 if(options.state&&options.state.active)this.enter(options.state);
 else this.sync(); // The dormant overlay must not intercept repertoire controls.
}
Reader.prototype.listen=function(target,type,handler,opts){
 if(!target)return;
 target.addEventListener(type,handler,opts);
 this.cleanup.push(function(){target.removeEventListener(type,handler,opts);});
};
Reader.prototype.snapshot=function(){
 return {active:this.active,mode:this.mode,controlsOpen:this.controlsOpen,fitMode:this.fitMode};
};
Reader.prototype.create=function(){
 var self=this,doc=this.doc;
 this.entry=action(doc,"Vis noder","huwabc-open-reader",function(){self.enter();});
 this.entry.setAttribute("title","Åbn ren nodevisning i hele vinduet");
 this.actions.insertBefore(this.entry,this.actions.firstChild);
 var toolbar=node(doc,"div","huwabc-reader-toolbar");
 toolbar.setAttribute("role","toolbar");toolbar.setAttribute("aria-label","Nodevisning");
 this.toolbar=toolbar;
 this.menu=action(doc,"☰","huwabc-reader-menu",function(){self.controlsOpen=!self.controlsOpen;self.sync();});
 this.menu.setAttribute("aria-label","Vis eller skjul nodemenu");
 toolbar.appendChild(this.menu);
 // In a setlist, keep the familiar searchable number drawer accessible
 // without exposing Repertoire's outer six rows of editing controls.
 if(this.book){
  this.listButton=action(doc,"☷ Nummerliste","huwabc-reader-list",function(){
   var list=self.book.querySelector(".huwrep-book-list");
   if(!list)return;
   list.hidden=!list.hidden;
   var existing=self.book.querySelector(".huwrep-book-header button[aria-expanded]");
   if(existing)existing.setAttribute("aria-expanded",String(!list.hidden));
  });
  toolbar.appendChild(this.listButton);
 }
 this.panel=node(doc,"div","huwabc-reader-menu-panel");
 toolbar.appendChild(this.panel);
 this.panel.appendChild(node(doc,"strong","huwabc-reader-title",this.title));
 var modes=node(doc,"div","huwabc-reader-modes");
 this.vis=action(doc,"Vis","huwabc-reader-mode-button",function(){self.mode="vis";self.sync();});
 this.practice=action(doc,"Øv","huwabc-reader-mode-button",function(){self.mode="practice";self.sync();});
 this.edit=action(doc,"Redigér","huwabc-reader-mode-button",function(){
  self.exit();
  var editor=self.actions.querySelector(".huwabc-primary");
  if(editor)editor.click();
 });
 this.vis.setAttribute("aria-pressed","true");
 this.practice.setAttribute("aria-pressed","false");
 modes.append(this.vis,this.practice,this.edit);
 this.panel.appendChild(modes);
 var options=node(doc,"div","huwabc-reader-options");
 var pages=node(doc,"label","huwabc-reader-field");
 pages.appendChild(node(doc,"span","","Visning"));
 this.pageChoice=node(doc,"select","huwabc-reader-page-choice");
 [["auto","Automatisk"],["single","Én side"],["spread","To sider"]].forEach(function(pair){
  var o=node(doc,"option","",pair[1]);o.value=pair[0];self.pageChoice.appendChild(o);
 });
 this.pageChoice.value="auto";
 this.listen(this.pageChoice,"change",function(){self.applyPages();});
 pages.appendChild(this.pageChoice);options.appendChild(pages);
 var fitField=node(doc,"label","huwabc-reader-field");
 fitField.appendChild(node(doc,"span","","Størrelse"));
 this.fitChoice=node(doc,"select","huwabc-reader-fit-choice");
 [["fit","Tilpas skærm"],["width","Fyld bredden"],["original","Original størrelse"]].forEach(function(pair){var o=node(doc,"option","",pair[1]);o.value=pair[0];self.fitChoice.appendChild(o);});
 this.fitChoice.value="fit";
 this.listen(this.fitChoice,"change",function(){self.fitMode=self.fitChoice.value;self.updateScale();});
 fitField.appendChild(this.fitChoice);options.appendChild(fitField);
 options.appendChild(action(doc,"Luk visning","huwabc-reader-close",function(){self.exit();}));
 this.panel.appendChild(options);
 this.status=node(doc,"span","huwabc-reader-counter");
 this.panel.appendChild(this.status);
 this.host.appendChild(toolbar);
 var edges=node(doc,"div","huwabc-reader-edges");
 this.prev=action(doc,"‹","huwabc-reader-prev",function(){self.turn(-1);});
 this.next=action(doc,"›","huwabc-reader-next",function(){self.turn(1);});
 this.prev.setAttribute("aria-label","Forrige nodeside");
 this.next.setAttribute("aria-label","Næste nodeside");
 edges.append(this.prev,this.next);this.host.appendChild(edges);
 this.edges=edges;
 this.listen(this.win,"resize",function(){if(self.active){self.update();self.updateScale();}});
 this.listen(this.host,"keydown",function(e){
  if(!self.active||e.altKey||e.metaKey||e.ctrlKey||e.shiftKey)return;
  if(e.target&&e.target.closest&&e.target.closest("input,select,textarea,[contenteditable=true]"))return;
  if(e.key==="Escape"){self.exit();e.preventDefault();e.stopPropagation();}
  else if(e.key==="ArrowLeft"){self.turn(-1);e.preventDefault();e.stopPropagation();}
  else if(e.key==="ArrowRight"){self.turn(1);e.preventDefault();e.stopPropagation();}
 });
 this.listen(this.paper,"pointerdown",function(e){
  if(!self.active||e.pointerType!=="touch"||!e.isPrimary)return;
  self._touch={id:e.pointerId,x:e.clientX,y:e.clientY};
 },{passive:true});
 this.listen(this.paper,"pointerup",function(e){
  var start=self._touch;self._touch=null;
  if(!self.active||!start||start.id!==e.pointerId)return;
  var dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(Math.abs(dx)>85&&Math.abs(dx)>Math.abs(dy)*1.4)self.turn(dx>0?-1:1);
 },{passive:true});
 // A background tap reveals navigation, without stealing taps on ABC notes.
 this.listen(this.paper,"click",function(e){
  if(!self.active||!e.target||e.target.closest("button,a,select,input,svg"))return;
  if(e.target===self.paper){self.controlsOpen=!self.controlsOpen;self.sync();}
 });
};
Reader.prototype.enter=function(state){
 if(state){this.mode=state.mode==="practice"?"practice":"vis";this.fitMode=["fit","width","original"].includes(state.fitMode)?state.fitMode:(state.fill?"width":"fit");this.controlsOpen=!!state.controlsOpen;}
 else {this.mode="vis";this.controlsOpen=false;}
 this.active=true;this.fitChoice.value=this.fitMode;this.sync();this.applyPages();this.update();this.updateScale();
 if(this.win)this.win.dispatchEvent(new this.win.Event("resize"));
};
Reader.prototype.exit=function(){
 this.active=false;this._touch=null;this.controlsOpen=false;
 if(this.book){
  var list=this.book.querySelector(".huwrep-book-list");
  if(list)list.hidden=true;
  var toggle=this.book.querySelector(".huwrep-book-header button[aria-expanded]");
  if(toggle)toggle.setAttribute("aria-expanded","false");
 }
 this.clearScale();
 this.host.classList.remove("huwabc-reader-active","huwabc-reader-practice","huwabc-reader-controls-open","huwabc-reader-fill");
 this.sync();if(this.win)this.win.dispatchEvent(new this.win.Event("resize"));
};
Reader.prototype.applyPages=function(){
 var pager=this.getPager(),select=pager&&pager.element&&pager.element.querySelector(".huwabc-page-select");
 if(!select||!this.win)return;
 var choice=this.pageChoice.value;
 // Repertoire's parent book also watches the page layout. Keep its selector
 // synchronized or it can undo the new ABC choice on the next DOM mutation.
 var book=this.host.closest(".huwrep-book"),outerChoice=book&&book.querySelector(".huwrep-book-view");
 if(outerChoice&&outerChoice.value!==choice){
  outerChoice.value=choice;
  outerChoice.dispatchEvent(new this.win.Event("change",{bubbles:true}));
 }
 if(choice==="auto")choice=this.win.innerWidth>=900&&this.win.innerWidth>this.win.innerHeight?"spread":"single";
 if(select.value!==choice){
  select.value=choice;
  select.dispatchEvent(new this.win.Event("change",{bubbles:true}));
 }
 this.update();this.updateScale();
};
Reader.prototype.turn=function(delta){
 var pager=this.getPager(),info=pager&&pager.info&&pager.info();
 var target=pageAction(info,delta);
 if(target==="page"){
  if(delta<0)pager.previous();
  else pager.next();
 }else if(target==="boundary"){
  // Optional host integrations (such as Repertoire) may cross to another tune.
  this.host.dispatchEvent(new this.win.CustomEvent("huwabc-reader-boundary",
   {bubbles:true,detail:{direction:delta,title:this.title}}));
 }
 this.update();
};
Reader.prototype.update=function(){
 var pager=this.getPager(),info=pager&&pager.info&&pager.info();
 if(info&&Number(info.count)){
  this.status.textContent="Side "+(info.page||1)+" af "+info.count;
  this.prev.disabled=pageAction(info,-1)==="unready";
  this.next.disabled=pageAction(info,1)==="unready";
 }else{
  this.status.textContent="Indlæser sider …";
  this.prev.disabled=true;this.next.disabled=true;
 }
 if(this.pageChoice.value==="auto"&&this.active)this.applyAutoChoice();
 if(this.active)this.updateScale();
};
Reader.prototype.applyAutoChoice=function(){
 var pager=this.getPager(),select=pager&&pager.element&&pager.element.querySelector(".huwabc-page-select");
 if(!select||!this.win)return;
 var choice=this.win.innerWidth>=900&&this.win.innerWidth>this.win.innerHeight?"spread":"single";
 if(select.value!==choice){select.value=choice;select.dispatchEvent(new this.win.Event("change",{bubbles:true}));}
};
Reader.prototype.sync=function(){
 this.host.classList.toggle("huwabc-reader-active",this.active);
 this.host.classList.toggle("huwabc-reader-practice",this.active&&this.mode==="practice");
 this.host.classList.toggle("huwabc-reader-controls-open",this.active&&this.controlsOpen);

 if(this.book){
  this.book.classList.toggle("huwrep-reader-active",this.active);
  this.book.classList.toggle("huwrep-reader-practice",this.active&&this.mode==="practice");
 }
 this.toolbar.hidden=!this.active;this.edges.hidden=!this.active;
 this.panel.hidden=!this.controlsOpen;
 this.menu.setAttribute("aria-expanded",String(!!this.controlsOpen));
 this.vis.setAttribute("aria-pressed",String(this.mode==="vis"));
 this.practice.setAttribute("aria-pressed",String(this.mode==="practice"));

 if(this.active)this.update();
};
// Layout-only zoom. Never rerender ABC notation or restart audio.
Reader.prototype.clearScale=function(){
 if(this._scaledViewport){this._scaledViewport.style.removeProperty("zoom");this._scaledViewport=null;}
};
Reader.prototype.updateScale=function(){
 if(!this.active||!this.host)return;
 var viewport=this.host.querySelector(".huwabc-page-viewport");
 var shell=this.host.querySelector(".huwabc-page-shell");
 if(!viewport||!shell)return;
 if(this._scaling)return;
 this._scaling=true;
 try{
  if(this._scaledViewport&&this._scaledViewport!==viewport)this.clearScale();
  viewport.style.zoom="1";
  // The page viewport contains the existing rendered notation, with its
  // intrinsic width; its parent is the scrollable screen-sized shell.
  var bounds=viewport.getBoundingClientRect();
  var width=Math.max(viewport.scrollWidth,bounds.width,1);
  var height=Math.max(viewport.scrollHeight,bounds.height,1);
  var availableWidth=Math.max(1,shell.clientWidth-16);
  var availableHeight=Math.max(1,shell.clientHeight-16);
  var choice=this.fitMode||"fit";
  var ratio=choice==="original"?1:choice==="width"?availableWidth/width:Math.min(availableWidth/width,availableHeight/height);
  // Avoid pathological magnification of tiny or not-yet-rendered scores.
  ratio=Math.max(.3,Math.min(2.5,Number.isFinite(ratio)?ratio:1));
  viewport.style.zoom=String(Math.round(ratio*1000)/1000);
  this._scaledViewport=viewport;
 }finally{this._scaling=false;}
};
Reader.prototype.destroy=function(){
 this.exit();
 this.cleanup.splice(0).forEach(function(fn){fn();});
 if(this.entry&&this.entry.parentNode)this.entry.parentNode.removeChild(this.entry);
 if(this.toolbar&&this.toolbar.parentNode)this.toolbar.parentNode.removeChild(this.toolbar);
 if(this.edges&&this.edges.parentNode)this.edges.parentNode.removeChild(this.edges);
 this.host=null;this.paper=null;
};
exports.mount=function(options){return new Reader(options);};
exports.pageAction=pageAction;
})();
