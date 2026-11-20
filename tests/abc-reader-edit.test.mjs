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
 const doc={defaultView:win,createElement(tag){
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
 }};
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
 return {reader,host,win,actions,click,counts:()=>({resizeCount,syntheticClicks})};
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
  assert.equal(h.host.listenerCount("keydown"),0);
 }
});

test("ordinary exit resizes once and repeated exit stays idle",()=>{
 const h=harness(()=>true);h.reader.enter();const before=h.counts().resizeCount;
 h.reader.exit();h.reader.exit();
 assert.equal(h.counts().resizeCount,before+1);
});
