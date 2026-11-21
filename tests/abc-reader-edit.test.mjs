import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../plugins/abc/src/reader-mode.js",import.meta.url),"utf8");

function target(){
 const handlers=new Map();
 return {
  addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
  removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
  dispatchEvent(event){for(const fn of [...(handlers.get(event.type)||[])])fn(event);},
  listenerCount(type){return handlers.get(type)?.size||0;}
 };
}
function harness(onEdit){
 let resizeCount=0,syntheticClicks=0;
 const win=Object.assign(target(),{innerWidth:1180,innerHeight:820,
  localStorage:{getItem(){return null;}},Event:class{constructor(type){this.type=type;}}
 });
 win.addEventListener("resize",()=>resizeCount++);
 const doc=Object.assign(target(),{defaultView:win,createElement(tag){
  const classes=new Set(),n=Object.assign(target(),{tagName:tag.toUpperCase(),children:[],ownerDocument:doc,
   parentNode:null,attrs:{},hidden:false,disabled:false,value:"",
   classList:{add(...names){names.forEach(x=>classes.add(x));},remove(...names){names.forEach(x=>classes.delete(x));},
    toggle(name,on){if(on===undefined)on=!classes.has(name);on?classes.add(name):classes.delete(name);return on;},contains(name){return classes.has(name);}},
   appendChild(child){child.parentNode=this;this.children.push(child);return child;},
   append(...children){children.forEach(child=>this.appendChild(child));},
   insertBefore(child,next){child.parentNode=this;const i=this.children.indexOf(next);if(i<0)this.children.push(child);else this.children.splice(i,0,child);return child;},
   removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;},
   setAttribute(name,value){this.attrs[name]=String(value);},
   closest(){return null;},querySelector(){return null;}
  });return n;
 },createElementNS(_namespace,tag){return this.createElement(tag);}});
 const host=doc.createElement("section"),actions=doc.createElement("div"),paper=doc.createElement("div");
 host.append(actions,paper);
 // A presentation class must never be used to redispatch a synthetic click.
 actions.querySelector=()=>({click(){syntheticClicks++;}});
 const exports={};runInNewContext(source,{exports});
 const reader=exports.mount({host,actions,paper,pager:()=>null,onEdit});
 const click=()=>{
  const event={type:"click",preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  reader.edit.dispatchEvent(event);return event;
 };
 return {reader,host,doc,win,actions,click,counts:()=>({resizeCount,syntheticClicks})};
}

test("reader edit hands off once with the current reader state and without reflowing the old score",()=>{
 let opened=0,activeDuringHandoff=false;
 const h=harness(()=>{opened++;activeDuringHandoff=h.reader.active;return true;});
 h.reader.enter();
 const before=h.counts();
 const event=h.click();h.click();
 assert.equal(opened,1,"a queued second activation must not construct a second editor");
 assert.equal(activeDuringHandoff,true,"the owner captures the reading state before disposing its score");
 assert.equal(event.prevented,true);assert.equal(event.stopped,true);
 assert.equal(h.reader.edit.disabled,true);
 assert.deepEqual(h.counts(),before,"opening an editor must not synthesize a click or a global resize");
});

test("an editor handoff may dispose its reader synchronously",()=>{
 let opened=0;
 const h=harness(()=>{opened++;h.reader.destroy();return true;});
 h.reader.enter();const before=h.counts();
 assert.doesNotThrow(()=>h.click());h.click();
 assert.equal(opened,1);assert.equal(h.reader.host,null);
 assert.deepEqual(h.counts(),before);
 assert.equal(h.win.listenerCount("resize"),1,"only the unrelated window subscriber remains");
});

test("a declined or unavailable edit remains a usable reader",()=>{
 let attempts=0;
 const h=harness(()=>{attempts++;return false;});h.reader.enter();
 h.click();h.click();
 assert.equal(attempts,2);assert.equal(h.reader.edit.disabled,false);
 assert.equal(h.reader.active,true);
 const readonly=harness(null);
 assert.equal(readonly.reader.edit.disabled,true);
 readonly.click();assert.equal(readonly.counts().syntheticClicks,0);
});

test("destroying active or dormant readers does not resize other scores",()=>{
 for(const active of [false,true]){
  const h=harness(()=>true);if(active)h.reader.enter();
  const before=h.counts();h.reader.destroy();
  assert.deepEqual(h.counts(),before);
  assert.equal(h.win.listenerCount("resize"),1);
  assert.equal(h.doc.listenerCount("keydown"),0);
 }
});

test("ordinary exit resizes once and repeated exit stays idle",()=>{
 const h=harness(()=>true);h.reader.enter();const before=h.counts().resizeCount;
 h.reader.exit();h.reader.exit();
 assert.equal(h.counts().resizeCount,before+1);
});

test("arrows work without score focus, but text fields keep their own arrows",()=>{
 const h=harness(()=>true),moves=[];
 h.reader.turn=delta=>moves.push(delta);
 h.reader.enter();
 const press=(key,target)=>{
  const event={type:"keydown",key,target:target||{closest(){return null;}},
   preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
  h.doc.dispatchEvent(event);return event;
 };
 const right=press("ArrowRight");
 assert.deepEqual(moves,[1]);
 assert.equal(right.prevented,true);
 press("ArrowLeft");
 assert.deepEqual(moves,[1,-1]);
 press("ArrowRight",{closest(){return {tagName:"INPUT"};}});
 assert.deepEqual(moves,[1,-1],"Text fields must retain arrow keys");
 h.reader.exit();press("ArrowRight");
 assert.deepEqual(moves,[1,-1],"Inactive readers must not capture keys");
 h.reader.destroy();
 assert.equal(h.doc.listenerCount("keydown"),0);
});


test("standalone score releases audio and SVG before the native editor opens",async()=>{
 const scoreCode=await readFile(new URL("../plugins/abc/src/score-widget.js",import.meta.url),"utf8");
 const out={};
 runInNewContext(scoreCode,{exports:out,require(id){
  return id==="$:/core/modules/widgets/widget.js"?{widget:function(){}}:{};
 }});
 const prepare=out.prepareEditorHandoff;
 assert.equal(typeof prepare,"function");
 let disposed=0;
 function fixture(standalone,book){
  const host={isConnected:true,hidden:false,textContent:"Large ABC score",
   closest(selector){return book&&selector===".huwrep-book"?{}:null;}};
  return {host,_standaloneView:standalone,onDestroy(){disposed++;}};
 }
 const direct=fixture(true,false);
 assert.equal(prepare(direct),true);
 assert.equal(disposed,1);
 assert.equal(direct.host.hidden,true);
 assert.equal(direct.host.textContent,"");
 const embedded=fixture(false,false),repertoire=fixture(true,true);
 assert.equal(prepare(embedded),false);
 assert.equal(prepare(repertoire),false);
 assert.equal(disposed,1,"Repertoire's own stateful edit handoff remains in charge");
 assert.match(scoreCode,/prepareEditorHandoff\(self\);\s*self\.dispatchEvent\(\{type:"tm-edit-tiddler"/,
  "source reader must be disposed before the native edit event");
 assert.match(scoreCode,/self\._editorHandoff\)return false/,
  "multiple taps must not open overlapping editors");
});

test("iPad editor keeps one visible score and avoids redraw storms",async()=>{
 const code=await readFile(new URL("../plugins/abc/src/edit-widget.js",import.meta.url),"utf8");
 assert.match(code,/preview\.style\.visibility='hidden'/,"retire the old SVG compositor layer");
 assert.match(code,/preview\.style\.visibility=oldVisibility/,"restore visibility even after a parse error");
 assert.match(code,/mobileWebKit\?420:130/,"iPad typing redraw is throttled");
 assert.match(code,/this\._cancelPreview/,"pending redraws are cancelled on editor teardown");
});

test("Nodebog offers four compact icon tools in one row with accessible names",()=>{
 const h=harness(()=>true),r=h.reader;
 assert.equal(r.panel.children[1].className,"huwabc-reader-modes","icons share one toolbar row");
 const controls=r.panel.children[1].children;
 assert.equal(controls.length,4,"Vis, Øv, Redigér and Luk remain four independent actions");
 for(const [button,name] of [[r.vis,"Vis"],[r.practice,"Øv"],[r.edit,"Redigér"],[r.close,"Luk visning"]]){
  assert.equal(button.attrs["aria-label"],name,"icon has a readable screen reader name");
  assert.equal(button.attrs.title,name,"mouse hover explains the icon");
  assert.equal(button.children.length,1,"icon replaces the oversized text label");
  assert.equal(button.children[0].tagName,"SVG");
  assert.equal(button.children[0].attrs["aria-hidden"],"true");
 }
 assert.equal(r.listButton,null,"standalone reader has no duplicate setlist button");
 assert.equal(r.menu.attrs["aria-label"],"Vis eller skjul nodemenu");
 h.reader.enter();
 r.practice.dispatchEvent({type:"click"});
 assert.equal(r.mode,"practice");
 assert.equal(r.practice.attrs["aria-pressed"],"true");
 r.vis.dispatchEvent({type:"click"});
 assert.equal(r.mode,"vis");
 r.close.dispatchEvent({type:"click"});
 assert.equal(r.active,false,"close icon returns to the normal score view");
 r.destroy();
});

test("Reader palette places compact icons and fit selectors without covering the page",async()=>{
 const css=await readFile(new URL("../plugins/abc/src/ReaderMode.tid",import.meta.url),"utf8");
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,"four icons must stay side by side");
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,"two size fields remain on one row");
 assert.match(css,/\.huwabc-reader-menu-panel\{\s*position:absolute/,"menu floats below toolbar icons");
 assert.match(css,/\.huwabc-reader-toolbar>\.huwabc-reader-list/,"number list is a small icon");
 assert.match(css,/\.huwabc-reader-icon-button svg/,"vector icons are styled consistently");
});
