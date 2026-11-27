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
// A small, monochrome icon set. Keep readable accessible names and tooltips:
// musicians need four buttons in one row rather than four large text bars.
function icon(doc,kind){
 var ns="http://www.w3.org/2000/svg",svg=doc.createElementNS(ns,"svg");
 svg.setAttribute("viewBox","0 0 24 24");
 svg.setAttribute("width","20");svg.setAttribute("height","20");
 svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");
 svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");
 svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
 var shapes={
  view:[["path",{d:"M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"}],["circle",{cx:12,cy:12,r:3}]],
  practice:[["path",{d:"M9 18V5l12-2v12"}],["ellipse",{cx:6,cy:18,rx:3,ry:2}],["ellipse",{cx:18,cy:15,rx:3,ry:2}]],
  edit:[["path",{d:"M12 20h9"}],["path",{d:"m16.5 3.5 4 4L8.5 19.5l-5 1 1-5L16.5 3.5Z"}]],
  close:[["path",{d:"M18 6 6 18M6 6l12 12"}]],
  list:[["path",{d:"M8 6h13M8 12h13M8 18h13"}],["path",{d:"M3 6h.01M3 12h.01M3 18h.01"}]],
  menu:[["path",{d:"M4 7h16M4 12h16M4 17h16"}]]
 };
 (shapes[kind]||shapes.menu).forEach(function(pair){
  var el=doc.createElementNS(ns,pair[0]);Object.keys(pair[1]).forEach(function(name){el.setAttribute(name,String(pair[1][name]));});svg.appendChild(el);
 });
 return svg;
}
function iconAction(doc,label,cls,kind,fn){
 var b=action(doc,"",cls+" huwabc-reader-icon-button",fn);
 b.appendChild(icon(doc,kind));
 b.setAttribute("aria-label",label);b.setAttribute("title",label);
 return b;
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
 this.onEdit=options.onEdit;
 this.getPager=options.pager;this.title=options.title||"Nodeark";
 this.doc=this.host.ownerDocument;this.win=this.doc.defaultView;
 this.book=this.host.closest(".huwrep-book");
 this.mode="vis";this.controlsOpen=false;this.fitMode="fit";this.active=false;
 try{var remembered=this.win.localStorage.getItem("huwabc-reader-fit-mode");if(["fit","width","original"].includes(remembered))this.fitMode=remembered;}catch(_ignored){}
 this.cleanup=[];this._touch=null;
 var self=this;
 this.fullscreen=this.book?null:require("$:/plugins/huwiki/abc/fullscreen.js").mount({host:this.host,onExit:function(){self.exit();}});
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
 this.menu=iconAction(doc,"Vis eller skjul nodemenu","huwabc-reader-menu","menu",function(){self.controlsOpen=!self.controlsOpen;if(self.controlsOpen&&self.book){var list=self.book.querySelector(".huwrep-book-list");if(list)list.hidden=true;}self.sync();});
 this.menu.setAttribute("aria-label","Vis eller skjul nodemenu");
 toolbar.appendChild(this.menu);
 // In a setlist, keep the familiar searchable number drawer accessible
 // without exposing Repertoire's outer six rows of editing controls.
 if(this.book){
  this.listButton=iconAction(doc,"Nummerliste","huwabc-reader-list","list",function(){
   var list=self.book.querySelector(".huwrep-book-list");
   if(!list)return;
   list.hidden=!list.hidden;
   if(!list.hidden){self.controlsOpen=false;self.sync();}
   var existing=self.book.querySelector(".huwrep-book-header button[aria-expanded]");
   if(existing)existing.setAttribute("aria-expanded",String(!list.hidden));
  });
  toolbar.appendChild(this.listButton);
 }
 this.panel=node(doc,"div","huwabc-reader-menu-panel");
 toolbar.appendChild(this.panel);
 this.panel.appendChild(node(doc,"strong","huwabc-reader-title",this.title));
 var modes=node(doc,"div","huwabc-reader-modes");
 this.vis=iconAction(doc,"Vis","huwabc-reader-mode-button","view",function(){self.mode="vis";self.sync();});
 this.practice=iconAction(doc,"Øv","huwabc-reader-mode-button","practice",function(){self.mode="practice";self.sync();});
 this.edit=iconAction(doc,"Redigér","huwabc-reader-mode-button","edit",function(event){self.openEditor(event);});
 this.edit.disabled=typeof this.onEdit!=="function";
 this.vis.setAttribute("aria-pressed","true");
 this.practice.setAttribute("aria-pressed","false");
 this.close=iconAction(doc,"Luk visning","huwabc-reader-mode-button huwabc-reader-close","close",function(){self.exit();});
 modes.append(this.vis,this.practice,this.edit,this.close);
 this.panel.appendChild(modes);
 var options=node(doc,"div","huwabc-reader-options");
 var pages=node(doc,"label","huwabc-reader-field");
 this.pageField=pages;
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
 this.fitChoice.value=this.fitMode;
 this.listen(this.fitChoice,"change",function(){self.fitMode=self.fitChoice.value;try{self.win.localStorage.setItem("huwabc-reader-fit-mode",self.fitMode);}catch(_ignored){}self.updateScale();});
 fitField.appendChild(this.fitChoice);options.appendChild(fitField);
 // Closing is the fourth icon in the same row as Vis, Øv and Redigér.
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
 this.listen(this.doc,"keydown",function(e){
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
Reader.prototype.openEditor=function(event){
 if(event){event.preventDefault();event.stopPropagation();}
 if(!this.host||this._openingEditor||typeof this.onEdit!=="function")return false;
 // Keep the current page/reader state until the owning widget hands it to
 // TiddlyWiki's draft editor. Exiting first would resize the old score and
 // leave an embedded Repertoire player running underneath the new editor.
 this._openingEditor=true;this.edit.disabled=true;
 try{
  if(this.onEdit()!==false)return true;
 }catch(error){
  this._openingEditor=false;this.edit.disabled=false;throw error;
 }
 this._openingEditor=false;this.edit.disabled=false;
 return false;
};
Reader.prototype.enter=function(state){
 if(state){this.mode=state.mode==="practice"?"practice":"vis";this.fitMode=["fit","width","original"].includes(state.fitMode)?state.fitMode:(state.fill?"width":this.fitMode);this.controlsOpen=!!state.controlsOpen;}
 else {this.mode="vis";this.controlsOpen=false;}
 this.active=true;
 if(this.fullscreen)this.fullscreen.enter(!state);
 this.fitChoice.value=this.fitMode;if(this.book){var list=this.book.querySelector(".huwrep-book-list");if(list)list.hidden=true;}this.sync();this.applyPages();this.update();this.updateScale();
 if(this.win)this.win.dispatchEvent(new this.win.Event("resize"));
};
Reader.prototype.exit=function(options){
 var wasActive=this.active;
 this.active=false;this._touch=null;this.controlsOpen=false;
 if(this.fullscreen)this.fullscreen.exit();
 if(this.book){
  var list=this.book.querySelector(".huwrep-book-list");
  if(list)list.hidden=true;
  var toggle=this.book.querySelector(".huwrep-book-header button[aria-expanded]");
  if(toggle)toggle.setAttribute("aria-expanded","false");
 }
 this.clearScale();
 this.host.classList.remove("huwabc-reader-active","huwabc-reader-practice","huwabc-reader-controls-open","huwabc-reader-fill");
 this.sync();
 if(wasActive&&(!options||options.notify!==false)&&this.win)this.win.dispatchEvent(new this.win.Event("resize"));
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
  var single=Number(info.count)===1;
  this.pageField.hidden=single;this.status.hidden=single;this.edges.hidden=!this.active||single&&!this.book;
  this.status.textContent="Side "+(info.page||1)+" af "+info.count;
  this.prev.disabled=pageAction(info,-1)==="unready"||!this.book&&pageAction(info,-1)==="boundary";
  this.next.disabled=pageAction(info,1)==="unready"||!this.book&&pageAction(info,1)==="boundary";
  this.prev.setAttribute('aria-label',single&&this.book?'Forrige nummer':'Forrige nodeside');
  this.next.setAttribute('aria-label',single&&this.book?'Næste nummer':'Næste nodeside');
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
  // A percentage-wide page viewport can include empty space. Prefer the
  // intrinsic paper bounds, but keep the surrounding viewport as fallback.
  var pages=Array.from(viewport.querySelectorAll(".huwabc-page"));
  var visible=pages.filter(function(page){return page.getClientRects().length>0;});
  var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  visible.forEach(function(page){
   var b=page.getBoundingClientRect();
   if(b.width>0&&b.height>0){left=Math.min(left,b.left);top=Math.min(top,b.top);right=Math.max(right,b.right);bottom=Math.max(bottom,b.bottom);}
  });
  var paperWidth=right>left?right-left:0;
  var paperHeight=bottom>top?bottom-top:0;
  var width=Math.max(paperWidth||viewport.scrollWidth,bounds.width>shell.clientWidth?bounds.width:0,1);
  var height=Math.max(paperHeight||viewport.scrollHeight,1);
  var availableWidth=Math.max(1,shell.clientWidth-16);
  var caption=shell.querySelector('.huwabc-notation-status');
  var availableHeight=Math.max(1,shell.clientHeight-16-(caption&&!caption.hidden?caption.offsetHeight:0));
  var choice=this.fitMode||"fit";
  var ratio=choice==="original"?1:choice==="width"?availableWidth/width:Math.min(availableWidth/width,availableHeight/height);
  // Avoid pathological magnification of tiny or not-yet-rendered scores.
  ratio=Math.max(.3,Math.min(2.5,Number.isFinite(ratio)?ratio:1));
  viewport.style.zoom=String(Math.round(ratio*1000)/1000);
  this._scaledViewport=viewport;
 }finally{this._scaling=false;}
};
Reader.prototype.destroy=function(){
 // Teardown must not wake every other score's resize listeners while the
 // old DOM and audio resources are being removed for an editor transition.
 this.exit({notify:false});
 if(this.fullscreen){this.fullscreen.destroy();this.fullscreen=null;}
 this.cleanup.splice(0).forEach(function(fn){fn();});
 if(this.entry&&this.entry.parentNode)this.entry.parentNode.removeChild(this.entry);
 if(this.toolbar&&this.toolbar.parentNode)this.toolbar.parentNode.removeChild(this.toolbar);
 if(this.edges&&this.edges.parentNode)this.edges.parentNode.removeChild(this.edges);
 this.onEdit=null;this.host=null;this.paper=null;
};
exports.mount=function(options){return new Reader(options);};
exports.pageAction=pageAction;
})();
