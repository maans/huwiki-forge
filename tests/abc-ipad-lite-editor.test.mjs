import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(import.meta.dirname,"..");
const code=await readFile(path.join(root,"plugins/abc/src/edit-widget.js"),"utf8");
const css=await readFile(path.join(root,"plugins/abc/src/CompactEditor.tid"),"utf8");
const draftTitle="Draft of 'Brudmarch'";
const songTitle="Brudmarch från Jämtland";
const focusTitle="$:/temp/huwiki/abc/edit-focus";

function element(tag){
 const events=new Map(),names=new Set();
 return {tagName:tag.toUpperCase(),className:"",children:[],attrs:{},value:"",
  isConnected:true,rows:0,spellcheck:true,
  classList:{add(k){names.add(k);},remove(k){names.delete(k);},contains(k){return names.has(k);}},
  appendChild(item){this.children.push(item);item.parentNode=this;return item;},
  append(...items){items.forEach(item=>this.appendChild(item));},
  setAttribute(k,v){this.attrs[k]=String(v);},
  get textContent(){return this._text||"";},
  set textContent(v){this._text=String(v);this.children=[];},
  addEventListener(type,fn){events.set(type,fn);},
  removeEventListener(type,fn){if(events.get(type)===fn)events.delete(type);},
  dispatch(type){events.get(type)?.({type});},
  querySelectorAll(){return [];}
 };
}
function setup(){
 const doc={createElement:element,defaultView:{navigator:{userAgent:"Mozilla/5.0 (iPad; CPU OS 18_0)",platform:"iPad",maxTouchPoints:5}}};
 const fields={title:draftTitle,"draft.of":songTitle,"abc-source":"X:1\nT:Brudmarch\nM:2/4\nK:Gm\nC D E F |"};
 const store=new Map([[draftTitle,{fields}], [songTitle,{fields:{title:songTitle,"abc-source":fields["abc-source"]}}],
  [focusTitle,{fields:{text:JSON.stringify({title:songTitle,fromNodebog:true,focus:"notes"})}}]]);
 const wiki={getTiddler(name){return store.get(name);},
  getTiddlerText(name,fallback){return store.get(name)?.fields.text??fallback;},
  deleteTiddler(name){store.delete(name);},
  addTiddler(t){store.set(t.fields.title,t);}
 };
 function Widget(){}
 const exports={};
 runInNewContext(code,{exports,document:doc,$tw:{Tiddler:class{
  constructor(old,delta){this.fields={...old.fields,...delta};}
 }},require(name){
  if(name==="$:/core/modules/widgets/widget.js")return {widget:Widget};
  if(name.endsWith("/i18n.js"))return {language(){return "da";}};
  if(name.endsWith("/loader.js"))return {getSource(w,id){return w.getTiddler(id)?.fields["abc-source"]||"";},
   header(text,key){return new RegExp("^"+key+":(.*)$","m").exec(text)?.[1]||"";}};
  return {};
 }});
 const host=element("div");
 return {doc,host,wiki,store,api:exports};
}

test("Only physical iPad Nodebog drafts use the compact editor",()=>{
 const f=setup();
 const widget={document:f.doc,wiki:f.wiki,title:draftTitle};
 assert.equal(f.api['huwiki-abc-edit'].useCompactNodebogEditor(widget),true);
 f.doc.defaultView.navigator={userAgent:"Mozilla/5.0 (Macintosh)",platform:"MacIntel",maxTouchPoints:5};
 assert.equal(f.api['huwiki-abc-edit'].useCompactNodebogEditor(widget),true,"desktop-style iPadOS UA still recognized");
 f.doc.defaultView.navigator.maxTouchPoints=0;
 assert.equal(f.api['huwiki-abc-edit'].useCompactNodebogEditor(widget),false,"ordinary Mac keeps full graphical editor");
 f.doc.defaultView.navigator.userAgent="Mozilla/5.0 (iPad)";
 f.wiki.addTiddler({fields:{title:focusTitle,text:JSON.stringify({title:songTitle,fromNodebog:false})}});
 assert.equal(f.api['huwiki-abc-edit'].useCompactNodebogEditor(widget),false,"standalone score editing remains unchanged");
 f.wiki.addTiddler({fields:{title:focusTitle,text:JSON.stringify({title:"other",fromNodebog:true})}});
 assert.equal(f.api['huwiki-abc-edit'].useCompactNodebogEditor(widget),false,"never misroute another score's draft");
});

test("Compact editor mounts no SVG/piano/audio and writes only the native draft",()=>{
 const f=setup(),Editor=f.api["huwiki-abc-edit"];
 const editor={document:f.doc,wiki:f.wiki,title:draftTitle,host:f.host};
 Editor.prototype.startLite.call(editor);
 assert.equal(f.store.has(focusTitle),false,"handoff focus hint consumed");
 assert.equal(f.host.classList.contains("huwabc-edit-lite"),true);
 const field=f.host.children.find(x=>x.className==="huwabc-edit-lite-field");
 const codeArea=field.children.find(x=>x.tagName==="TEXTAREA");
 assert.ok(codeArea,"actual ABC source textarea is shown");
 assert.equal(f.host.children.flatMap(x=>x.children).some(x=>x.tagName==="SVG"),false);
 assert.ok(!editor._pager,"no page renderer is allocated on entry");
 const original=f.store.get(songTitle).fields["abc-source"];
 codeArea.value+="\nG A B c |";
 codeArea.dispatch("input");
 assert.match(f.wiki.getTiddler(draftTitle).fields["abc-source"],/G A B c \|$/);
 assert.equal(f.wiki.getTiddler(songTitle).fields["abc-source"],original,"source saved only through native Save");
 assert.equal(f.wiki.getTiddler(draftTitle).fields["abc-key"],"Gm");
 assert.equal(f.wiki.getTiddler(draftTitle).fields["abc-meter"],"2/4");
 assert.match(css,/huwabc-edit-lite-code/);
 assert.equal(f.host.children.some(n=>n.className==="huwabc-edit-lite-actions"),true);
 editor._liteDetach();const current=f.wiki.getTiddler(draftTitle).fields["abc-source"];
 codeArea.value+="\nz4|";codeArea.dispatch("input");
 assert.equal(f.wiki.getTiddler(draftTitle).fields["abc-source"],current,
  "disposed editor detaches input listeners");
});

test("Bundler picks up the compact editor and its CSS without modifying source tiddlers",async()=>{
 const build=await readFile(path.join(root,"scripts/build-abc-ui.mjs"),"utf8");
 assert.match(build,/readdir\(path\.join\(directory,'src'\)\)/);
 assert.ok(build.includes("if(!/\\.(?:js|tid)$/.test(name))continue;"),"builder reads js and tid source modules");
 const widget=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
 assert.ok(widget.includes("fromNodebog:!!(self.host&&self.host.closest"),"Nodebog handoff is explicitly identified");
 assert.match(code,/self\.wiki\.addTiddler\(new \$tw\.Tiddler\(old,\{/);
 assert.ok(code.includes('useCompactNodebogEditor'),"compact draft gate is compiled into the editor module");
});
