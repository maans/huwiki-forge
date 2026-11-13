import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script,createContext} from "node:vm";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const base="$:/plugins/huwiki/site-publisher";
const scene=(parts,scenes)=>JSON.stringify({version:1,width:800,height:450,duration:3,parts,...(scenes?{scenes}:{})});
const fixtures=()=>({
 "Film":{title:"Film",type:"application/json","cutout-id":"film-1",text:scene([{id:"nested",type:"animation",animationId:"child-1"},{id:"photo",type:"image",assetId:"img-1",keys:[{t:0,x:0},{t:2,x:200}]}])},
 "Child":{title:"Child",type:"application/json","cutout-id":"child-1",text:scene([{id:"square",type:"rect",geo:{w:30,h:50}}])},
 "Photo":{title:"Photo",type:"image/png","cutout-id":"img-1",text:"iVBORw0KGgoAAAANSUhEUg",_canonical_uri:"file:///Users/secret.png"},
 "Audio":{title:"Audio",type:"audio/mpeg",text:"SUQzBAA="},
 "Video":{title:"Video",type:"video/mp4",text:"AAAAIGZ0eXBtcDQy"},
 "Vector":{title:"Vector",type:"image/svg+xml",text:'<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'}
});
let adapter="";
test.before(async()=>{adapter=await read("plugins/site-publisher/src/media-export.js");});
function adapterFor(rows){
 const wiki={getTiddler(k){return rows[k]?{fields:rows[k]}:null;},getTiddlerText(k,f){return rows[k]?.text??f;},
  each(fn){Object.keys(rows).forEach(k=>fn({fields:rows[k]},k));}};
 const names="return {cutoutScene,isCutoutTitle,cutoutWidgetMarkup,cutoutWidgetPlaceholders,collectCutout,publicationDataUrl,publicationMediaArticle,publicationHtmlMedia};";
 const encode=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 return new Function("$tw","safe",adapter+"\n"+names)({wiki},encode);
}
test("SitePublisher packages readable media adapters, CutOut reader and CSS without a new UI",async()=>{
 const p=JSON.parse(await read("plugins/site-publisher/dist/plugin.json"));
 const t=JSON.parse(p.text).tiddlers,js=t[base+"/startup.js"].text;
 const viewer=await read("plugins/site-publisher/src/cutout-viewer.js");
 assert.equal(p.version,"0.1.14-test.1");
 assert.ok(js.includes(adapter.trim()),"Source adapter must match plugin package");
 assert.equal(t[base+"/cutout/viewer.js"].text,viewer);
 assert.equal(t[base+"/cutout/viewer.js"].type,"text/plain");
 assert.match(t[base+"/cutout/viewer.css"].text,/\.huw-site-cutout/);
 new Script(js);new Script(viewer);
 assert.match(js,/cutoutRows:publicationContext\.used\?publicationContext\.rows:null/);
 assert.match(js,/cutoutWidgetPlaceholders\(segments\[j\],exportContext,snippets\)/);
 assert.match(js,/HUWikiCutOutSite\.hydrate\(article,DATA\.cutoutRows\)/);
 assert.match(js,/data-huwiki-cutout-reader/);
 assert.match(js,/preview\.srcdoc=exported/);
 assert.match(js,/link\.download=filename/);
 assert.doesNotMatch(viewer,/createElement\(["']select["']\)|google\.script|DriveApp|window\.\$tw/);
});
test("CutOut recursively bundles scenes and inline image tiddlers, but not private URIs",()=>{
 const api=adapterFor(fixtures()),ctx={rows:{},used:false};
 const markup=api.cutoutWidgetMarkup("Film","no","yes",ctx);
 assert.match(markup,/data-loop="no"/);
 assert.match(markup,/data-autoplay="yes"/);
 assert.deepEqual(Object.keys(ctx.rows).sort(),["Film","Child","Photo"].sort());
 assert.equal(ctx.rows.Photo._canonical_uri,undefined);
 assert.doesNotMatch(JSON.stringify(ctx.rows),/file:\/\/\/Users\//);
 assert.equal(ctx.used,true);
 const bits=[];
 const rendered=api.cutoutWidgetPlaceholders('<$cutout-film tiddler="Film" loop="no"/>',ctx,bits);
 assert.match(rendered,/HUW_SITE_CUTOUT_0_HERE/);
 assert.match(bits[0].html,/data-cutout-title="Film"/);
 assert.throws(()=>api.cutoutWidgetPlaceholders('<$cutout autoplay="yes"/>',ctx,[]),/missing tiddler attribute/);
});
test("CutOut rejects missing image assets, circular scene references and unreadable image types",()=>{
 const rows=fixtures(),api=adapterFor(rows);
 rows.Film.text=scene([{id:"bad",type:"image",asset:"Gone"}]);
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/CutOut image is missing/);
 rows.Film.text=scene([{id:"loop",type:"animation",animation:"Film"}]);
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/circular animation reference/);
 rows.Film.text=scene([{id:"bad",type:"image",asset:"Photo"}]);
 rows.Photo.type="image/avif";
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/unsupported CutOut image format/);
 rows.Photo.type="image/png";delete rows.Photo.text;
 assert.throws(()=>api.publicationDataUrl("Photo","image"),/private file URI/);
});
test("Malformed CutOut part hierarchy is rejected rather than partially rendered",()=>{
 const rows=fixtures(),api=adapterFor(rows);
 rows.Film.text=scene([{id:"loop",type:"rect",parent:"loop"}]);
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/circular CutOut part hierarchy/);
 rows.Film.text=scene([{id:"missing",type:"rect",parent:"not-here"}]);
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/parent part is missing/);
 rows.Film.text=scene([{id:"duplicate",type:"rect"},{id:"duplicate",type:"rect"}]);
 assert.throws(()=>api.collectCutout("Film",{rows:{},used:false},[]),/duplicate part ID/);
});

test("Direct images, scalable SVG, audio and video are embedded as data URLs",()=>{
 const api=adapterFor(fixtures());
 assert.match(api.publicationMediaArticle("Vector"),/data:image\/svg\+xml;charset=utf-8/);
 assert.match(api.publicationMediaArticle("Photo"),/data:image\/png;base64/);
 assert.match(api.publicationMediaArticle("Audio"),/<audio controls preload="metadata" src="data:audio\/mpeg;base64,SUQzBAA="/);
 assert.match(api.publicationMediaArticle("Video"),/<video controls preload="metadata" src="data:video\/mp4;base64/);
 assert.equal(api.publicationMediaArticle("Film"),"");
 const evil=adapterFor({"Bad":{title:"Bad",type:"image/svg+xml",text:'<svg><image href="https://example.com/a.png"/></svg>'}});
 assert.throws(()=>evil.publicationDataUrl("Bad","image"),/external image reference/);
});
test("Rendered article media resolve local attachments, not file or network URLs",()=>{
 const api=adapterFor(fixtures());
 function media(src){
  const node={tagName:"IMG",attrs:{src},getAttribute(k){return this.attrs[k]||"";},
    setAttribute(k,v){this.attrs[k]=v;},hasAttribute(k){return k in this.attrs;},closest(){return null;}};
  const div={querySelectorAll(s){return s.startsWith("img[src]")?[node]:[];}};
  return {div,node};
 }
 const local=media("Photo");
 api.publicationHtmlMedia(local.div,"Article");
 assert.match(local.node.attrs.src,/^data:image\/png;base64,iVBOR/);
 assert.throws(()=>api.publicationHtmlMedia(media("https://example.com/a.jpg").div,"Article"),/external or private URL/);
 assert.throws(()=>api.publicationHtmlMedia(media("file:///Users/a.jpg").div,"Article"),/external or private URL/);
 assert.throws(()=>api.publicationHtmlMedia(media("Missing.jpg").div,"Article"),/missing local media tiddler/);
});
test("Read-only CutOut hydrates SVG, time slider and playback, without extra language selector",async()=>{
 const source=await read("plugins/site-publisher/src/cutout-viewer.js");
 const api=adapterFor(fixtures()),ctx={rows:{},used:false};
 api.collectCutout("Film",ctx,[]);
 function el(tag){const attributes={},children=[],listeners={};
  return {tagName:tag,attributes,children,listeners,isConnected:true,textContent:"",
   setAttribute(k,v){attributes[k]=String(v);},getAttribute(k){return attributes[k]||"";},
   appendChild(n){children.push(n);return n;},addEventListener(k,fn){listeners[k]=fn;}};}
 const host=el("div");host.setAttribute("data-cutout-title","Film");
 const doc={documentElement:{lang:"en"},hidden:false,createElement:el,createElementNS:(ns,tag)=>el(tag)};
 const win={matchMedia:()=>({matches:false})};
 const context=createContext({window:win,document:doc,requestAnimationFrame:()=>1,cancelAnimationFrame(){},encodeURIComponent,decodeURIComponent});
 new Script(source).runInContext(context);
 win.HUWikiCutOutSite.hydrate({querySelectorAll:()=>[host]},ctx.rows);
 assert.equal(host.getAttribute("data-cutout-ready"),"1");
 assert.equal(host.children[0].tagName,"svg");
 assert.match(host.children[0].getAttribute("viewBox"),/800/);
 const controls=host.children[1];
 assert.equal(controls.children.filter(x=>x.tagName==="select").length,0);
 assert.equal(controls.children.filter(x=>x.tagName==="button").length,2);
 const play=controls.children[0];
 assert.equal(play.textContent,"▶ Play");
 play.listeners.click();assert.equal(play.textContent,"Ⅱ Pause");
 play.listeners.click();assert.equal(play.textContent,"▶ Play");
 assert.equal(controls.children[2].getAttribute("aria-label"),"Animation time");
});
