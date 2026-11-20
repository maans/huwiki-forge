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
 this.mode="vis";this.controlsOpen=false;this.fill=false;this.active=false;
 this.cleanup=[];this._touch=null;
 this.create();
 if(options.state&&options.state.active)this.enter(options.state);
 else this.sync(); // The dormant overlay must not intercept repertoire controls.
}
Reader.prototype.listen=function(target,type,handler,opts){
 if(!target)return;
 target.addEventListener(type,handler,opts);
 this.cleanup.push(function(){target.removeEventListener(type,handler,opts);});
};
Reader.prototype.snapshot=function(){
 return {active:this.active,mode:this.mode,controlsOpen:this.controlsOpen,fill:this.fill};
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
 this.fit=action(doc,"Fyld bredden","huwabc-reader-fit",function(){self.fill=!self.fill;self.sync();});
 this.fit.setAttribute("aria-pressed","false");
 options.appendChild(this.fit);
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
 this.listen(this.win,"resize",function(){if(self.active)self.update();});
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
 if(state){this.mode=state.mode==="practice"?"practice":"vis";this.fill=!!state.fill;this.controlsOpen=!!state.controlsOpen;}
 else {this.mode="vis";this.controlsOpen=false;}
 this.active=true;this.sync();this.applyPages();this.update();
 if(this.win)this.win.dispatchEvent(new this.win.Event("resize"));
};
Reader.prototype.exit=function(){
 this.active=false;this._touch=null;this.controlsOpen=false;
 this.host.classList.remove("huwabc-reader-active","huwabc-reader-practice","huwabc-reader-controls-open","huwabc-reader-fill");
 this.sync();if(this.win)this.win.dispatchEvent(new this.win.Event("resize"));
};
Reader.prototype.applyPages=function(){
 var pager=this.getPager(),select=pager&&pager.element&&pager.element.querySelector(".huwabc-page-select");
 if(!select||!this.win)return;
 var choice=this.pageChoice.value;
 if(choice==="auto")choice=this.win.innerWidth>=900&&this.win.innerWidth>this.win.innerHeight?"spread":"single";
 if(select.value!==choice){
  select.value=choice;
  select.dispatchEvent(new this.win.Event("change",{bubbles:true}));
 }
 this.update();
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
 this.host.classList.toggle("huwabc-reader-fill",this.active&&this.fill);
 this.toolbar.hidden=!this.active;this.edges.hidden=!this.active;
 this.panel.hidden=!this.controlsOpen;
 this.menu.setAttribute("aria-expanded",String(!!this.controlsOpen));
 this.vis.setAttribute("aria-pressed",String(this.mode==="vis"));
 this.practice.setAttribute("aria-pressed",String(this.mode==="practice"));
 this.fit.setAttribute("aria-pressed",String(this.fill));
 if(this.active)this.update();
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
