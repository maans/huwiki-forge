import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";

const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");
const base="$:/plugins/huwiki/site-publisher";
const mime="application/vnd.excalidraw+json";
const svgNs="http://www.w3.org/2000/svg";
const makeScene=(elements,files={})=>JSON.stringify({
 type:"excalidraw",version:2,
 elements,files,appState:{exportBackground:true,viewBackgroundColor:"#eee"}
});
const rectangle={id:"rect",type:"rectangle",x:20,y:30,width:100,height:60,isDeleted:false};
const image={id:"img",type:"image",fileId:"image-file",x:0,y:0,width:30,height:20,isDeleted:false};
const dataUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";
const records=()=>({
 Diagram:{title:"Diagram",type:mime,text:makeScene([rectangle]),"hu-transparent":"yes"},
 Media:{title:"Media",type:mime,text:makeScene([rectangle,image],{"image-file":{mimeType:"image/png",dataURL:dataUrl}})},
 Article:{title:"Article",type:"text/vnd.tiddlywiki",text:"Figure: {{Diagram}}"}
});
function svgNode(extraNodes=[]){
 return {
  nodeType:1,localName:"svg",namespaceURI:svgNs,attributes:[{name:"viewBox",value:"0 0 400 200"}],
  querySelectorAll:()=>extraNodes
 };
}
const attr=(name,value)=>({name,value});
let code="";
test.before(async()=>{code=await read("plugins/site-publisher/src/drawing-export.js");});
function createDrawingAdapter(rows,options={}){
 let seen=[],calls=0,svg=options.svg||svgNode();
 const wiki={
  getTiddler(title){return rows[title]?{fields:rows[title]}:null;},
  parseTiddler(title){return {tree:[{type:"text",text:"original "+title}]};},
  renderText(){
   // Simulates the TiddlyWiki renderer looking up an embedded drawing through
   // this.parseTiddler. The actual parser remains TiddlyWiki's own implementation.
   if((rows.Article?.text||"").includes("{{Diagram}}")){
    let tree=this.parseTiddler("Diagram").tree;
    seen.push(tree);
    const a=tree[0].children?.[0]?.attributes?.src?.value||"";
    return '<p>Figure</p><figure class="huw-site-drawing"><img src="'+a+'"></figure>';
   }
   return "<p>ordinary article</p>";
  }
 };
 let module=options.module;
 if(!module && !options.noModule)module={excalidraw:{huwikiExportSvg:async scene=>{calls++;seen.push(scene);return svg;}}};
 const tw={wiki,utils:{parseStringArray:x=>x.split(/\s+/)},modules:{execute(){
  if(options.noModule)throw Error("not installed");
  return module;
 }}};
 const serializer=function(){this.serializeToString=()=>options.xml||'<svg xmlns="'+svgNs+'" viewBox="0 0 400 200"><rect width="20"/></svg>';};
 const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const publicationMediaError=(title,detail)=>new Error("SitePublisher · "+title+": "+detail);
 const api=new Function("$tw","publicationMediaError","wikiLanguage","safe","XMLSerializer","setTimeout","clearTimeout",
  code+"\nreturn {publicationDrawingFields,publicationDrawingAllowed,publicationDrawingValidate,publicationDrawingCheckSvg,siteDrawingSource,siteDrawingBody,drawingSiteWiki,isDrawingTitle};"
 )(tw,publicationMediaError,()=>options.lang||"en",safe,serializer,setTimeout,clearTimeout);
 return {api,rows,wiki,seen,calls:()=>calls};
}
function initialPending(api,title){
 let pending;try{api.siteDrawingSource(title);}catch(err){pending=err;}
 assert.equal(pending?.siteDrawingPending,true,"First SVG conversion must report asynchronous preparation");
 return pending;
}
test("Drawing SVG adapter is separate readable code bundled in one shared SitePublisher",async()=>{
 const plugin=JSON.parse(await read("plugins/site-publisher/dist/plugin.json"));
 const items=JSON.parse(plugin.text).tiddlers;
 const js=items[base+"/startup.js"].text;
 assert.equal(plugin.version,"0.1.14-test.1");
 assert.ok(js.includes(code.trim()));
 new Script(js);new Script(code);
 assert.equal(items[base+"/drawings/view.css"].type,"text/css");
 assert.match(items[base+"/drawings/view.css"].text,/\.huw-site-drawing img/);
 assert.match(js,/if\(isDrawingTitle\(title\)\)return siteDrawingBody\(title,exportContext\)/);
 assert.match(js,/drawingRenderer\.renderText\("text\/html","text\/vnd\.tiddlywiki"/);
 assert.match(js,/if\(publicationContext\.drawings\)/);
 assert.match(js,/if\(err\.siteDrawingPending&&err\.promise\)/);
 assert.match(js,/err\.promise\.then\(function\(\)/);
 assert.match(js,/preview\.srcdoc=exported/);
 assert.match(js,/function downloadHtml\(/);
 assert.doesNotMatch(code,/google\.script\.run|DriveApp|navigator\.share|createElement\(["']select["']\)/);
});
test("Drawing scene is validated, privacy kept, and images must be actually embedded",()=>{
 const rows=records(),{api}=createDrawingAdapter(rows);
 assert.equal(api.isDrawingTitle("Diagram"),true);
 assert.equal(api.isDrawingTitle("Article"),false);
 assert.equal(api.publicationDrawingValidate("Diagram",rows.Diagram).elements.length,1);
 assert.throws(()=>api.publicationDrawingValidate("Article",rows.Article),/Drawing elements are missing|cannot|invalid/i);
 rows.Diagram.publish="no";
 assert.throws(()=>api.siteDrawingSource("Diagram"),/private or a draft/);
 delete rows.Diagram.publish;
 rows.Diagram["draft.of"]="Original";
 assert.throws(()=>api.siteDrawingSource("Diagram"),/private or a draft/);
 delete rows.Diagram["draft.of"];
 rows.Diagram.text=makeScene([{...rectangle,isDeleted:true}]);
 assert.throws(()=>api.siteDrawingSource("Diagram"),/Drawing is empty/);
 rows.Diagram.text=makeScene([image]);
 assert.throws(()=>api.siteDrawingSource("Diagram"),/embedded image is missing/);
 rows.Diagram.text=makeScene([{id:"iframe",type:"embeddable",url:"https://example.com"}]);
 assert.throws(()=>api.siteDrawingSource("Diagram"),/Interactive embedded frames/);
 rows.Diagram.text="{ broken JSON";
 assert.throws(()=>api.siteDrawingSource("Diagram"),/invalid JSON/);
});
test("Asynchronous Excalidraw exporter yields a scalable SVG data URI and preserves transparency",async()=>{
 const rows=records(),{api,seen,calls}=createDrawingAdapter(rows);
 const pending=initialPending(api,"Diagram");
 const data=await pending.promise;
 assert.match(data,/^data:image\/svg\+xml;charset=utf-8,/);
 assert.match(decodeURIComponent(data),/<svg xmlns=/);
 assert.equal(api.siteDrawingSource("Diagram"),data,"Completed SVG must be cached");
 assert.equal(calls(),1,"Successful SVG should not be re-rendered");
 const drawingScene=seen[0];
 assert.equal(drawingScene.appState.exportBackground,false);
 assert.equal(JSON.parse(rows.Diagram.text).appState.exportBackground,true,"Original article text must not be modified");
 const ctx={drawings:false};
 assert.match(api.siteDrawingBody("Diagram",ctx),/<figure class="huw-site-drawing"><img alt="Diagram"/);
 assert.equal(ctx.drawings,true);
 rows.Diagram.text=makeScene([{...rectangle,id:"new"}]);
 const next=initialPending(api,"Diagram");
 await next.promise;
 assert.equal(calls(),2,"Editing drawing text invalidates the cached SVG");
});
test("The Excalidraw adapter uses the existing widget's SVG bridge, not an editor in exported HTML",async()=>{
 const rows=records(),{api}=createDrawingAdapter(rows,{noModule:true});
 assert.throws(()=>api.siteDrawingSource("Diagram"),/SVG export is unavailable/);
 const broken=createDrawingAdapter(rows,{svg:{nodeType:1,localName:"div",namespaceURI:"http://www.w3.org/1999/xhtml",querySelectorAll:()=>[]}});
 const pending=initialPending(broken.api,"Diagram");
 await assert.rejects(pending.promise,/Drawing engine did not return an SVG/);
 assert.throws(()=>broken.api.siteDrawingSource("Diagram"),/Drawing engine did not return an SVG/);
});
test("SVG dependency sanitizer accepts embedded images/fonts but rejects external files and scripts",()=>{
 const {api}=createDrawingAdapter(records());
 api.publicationDrawingCheckSvg(svgNode([
  {localName:"image",attributes:[attr("href","data:image/png;base64,iVBORw0KGgo")]},
  {localName:"style",textContent:"@font-face{src:url(data:font/woff2;base64,AA==)} .a{clip-path:url(#shape)}",attributes:[]}
 ]),"Diagram");
 for(const node of [
  {localName:"image",attributes:[attr("href","https://example.com/private.png")]},
  {localName:"image",attributes:[attr("href","file:///Users/private.png")]},
  {localName:"style",textContent:"@import url('https://fonts.googleapis.com/css')",attributes:[]},
  {localName:"style",textContent:"@font-face{src:url(../fonts/myfont.woff2)}",attributes:[]},
  {localName:"rect",attributes:[attr("onclick","alert(1)")]}
 ]){
  assert.throws(()=>api.publicationDrawingCheckSvg(svgNode([node]),"Diagram"),/SVG/);
 }
 assert.throws(()=>api.publicationDrawingCheckSvg(svgNode([{localName:"foreignObject",attributes:[]}]),"Diagram"),/unsupported element/);
});
test("A transcluded Excalidraw drawing uses TiddlyWiki's article renderer via parseTiddler",async()=>{
 const rows=records(),{api,seen,wiki}=createDrawingAdapter(rows);
 const ctx={drawings:false};
 const shadow=api.drawingSiteWiki(ctx);
 assert.notEqual(shadow,wiki);
 assert.equal(wiki.parseTiddler("Diagram").tree[0].text,"original Diagram");
 let pending;try{shadow.renderText("text/html","text/vnd.tiddlywiki","Figure: {{Diagram}}");}catch(error){pending=error;}
 assert.equal(pending?.siteDrawingPending,true);
 await pending.promise;
 const rendered=shadow.renderText("text/html","text/vnd.tiddlywiki","Figure: {{Diagram}}");
 assert.match(rendered,/<figure class="huw-site-drawing">/);
 assert.match(rendered,/data:image\/svg\+xml/);
 assert.equal(ctx.drawings,true);
 assert.ok(seen.some(x=>Array.isArray(x)&&x[0]?.tag==="figure"),"An existing transclusion must become a static drawing");
});
test("The exporter refuses invalid image dependencies from saved Excalidraw files",()=>{
 const rows=records(),{api}=createDrawingAdapter(rows);
 rows.Media.text=makeScene([image],{"image-file":{mimeType:"image/png",dataURL:"https://private-files.example/img.jpg"}});
 assert.throws(()=>api.siteDrawingSource("Media"),/embedded image is missing/);
 rows.Media.text=makeScene([image],{"image-file":{mimeType:"image/png",dataURL:"file:///Users/mac/Pictures/img.jpg"}});
 assert.throws(()=>api.siteDrawingSource("Media"),/embedded image is missing/);
 rows.Media.text=makeScene([image],{"image-file":{mimeType:"image/png",dataURL:"data:text/html,<script>alert(1)</script>"}});
 assert.throws(()=>api.siteDrawingSource("Media"),/embedded image is missing/);
});
