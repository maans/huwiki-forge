/*\
title: $:/plugins/huwiki/print-article/pdf-source.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Isolate the locally hosted PDF.js bundle from TiddlyWiki's module loader.
// One canvas is reused at a time; only compressed page images reach Publisher.
function renderer(){
 window.addEventListener("message",async function start(event){
  var data=event.data;
  if(event.source!==parent||!data||data.type!=="huprint-pdf:load")return;
  window.removeEventListener("message",start);
  var origin=event.origin,task=null,canvas=null;
  function send(type,values,transfer){parent.postMessage(Object.assign({type:"huprint-pdf:"+type},values||{}),origin,transfer||[]);}
  try{
   var source=new URL(data.source),apiUrl=new URL(data.api),workerUrl=new URL(data.worker);
   if([source,apiUrl,workerUrl].some(function(url){return url.origin!==origin||!/^https?:$/.test(url.protocol);}))throw Error("PDF-kilden skal ligge på samme websted som wikien.");
   window.module={exports:{}};
   await import(apiUrl.href);
   var api=window.pdfjsLib||window.module.exports;
   if(!api||!api.getDocument)throw Error("PDF-motoren kunne ikke indlæses.");
   api.GlobalWorkerOptions.workerSrc=workerUrl.href;
   task=api.getDocument({url:source.href,isEvalSupported:false});
   var pdf=await task.promise;
   if(!pdf.numPages)throw Error("PDF-filen indeholder ingen sider.");
   send("ready",{pages:pdf.numPages});
   if(data.countOnly)return;
   for(var number=1;number<=pdf.numPages;number++){
    var page=await pdf.getPage(number),original=page.getViewport({scale:1});
    canvas=document.createElement("canvas");canvas.width=1654;canvas.height=2339;
    var scale=Math.min(canvas.width/original.width,canvas.height/original.height),viewport=page.getViewport({scale:scale});
    var ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:viewport,transform:[1,0,0,1,(canvas.width-viewport.width)/2,(canvas.height-viewport.height)/2],background:"rgb(255,255,255)",intent:"print"}).promise;
    var blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/jpeg",.96);});
    if(!blob)throw Error("PDF-siden kunne ikke gengives.");
    var buffer=await blob.arrayBuffer();
    send("page",{page:number,pages:pdf.numPages,width:canvas.width,height:canvas.height,buffer:buffer},[buffer]);
    canvas.width=0;canvas.height=0;canvas=null;page.cleanup();
    await new Promise(function(resolve){setTimeout(resolve,0);});
   }
   send("done",{pages:pdf.numPages});
  }catch(error){send("error",{message:error&&error.message||String(error)});}
  finally{if(canvas){canvas.width=0;canvas.height=0;}if(task)await task.destroy();}
 });
}
exports.render=function(options){
 options=options||{};
 var doc=options.document||document,win=doc.defaultView,origin=win.location.origin;
 var source=new URL(String(options.source||""),win.location.href);
 var viewer=options.wiki.getTiddlerText("$:/config/maans/repertoire/pdf-viewer","");
 if(!viewer)throw Error("PDF-viseren er ikke konfigureret til samlet udskrift: "+options.title);
 var base=new URL(viewer,win.location.href);
 if(source.origin!==origin||base.origin!==origin||!/^https?:$/.test(source.protocol)||!/^https?:$/.test(base.protocol))throw Error("PDF-kilden skal ligge på samme websted som wikien: "+options.title);
 return new Promise(function(resolve,reject){
  var frame=doc.createElement("iframe"),timer,closed=false,images=[],pages=0;
  frame.title="Klargør PDF: "+options.title;
  frame.style.cssText="position:absolute;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden";
  function finish(error){
   if(closed)return;closed=true;win.clearTimeout(timer);win.removeEventListener("message",receive);frame.remove();
   if(error)reject(Error(options.title+": "+error));else resolve({images:images,pages:pages});
  }
  function timeout(){win.clearTimeout(timer);timer=win.setTimeout(function(){finish("PDF-indlæsningen tog for lang tid. Prøv igen.");},60000);}
  function receive(event){
   if(closed||event.source!==frame.contentWindow||event.origin!==origin)return;
   var data=event.data;if(!data||typeof data.type!=="string"||data.type.indexOf("huprint-pdf:")!==0)return;
   timeout();
   if(data.type==="huprint-pdf:error"){finish(data.message);return;}
   if(data.type==="huprint-pdf:ready"){
    if(!Number.isInteger(data.pages)||data.pages<1){finish("Ingen PDF-sider.");return;}
    pages=data.pages;if(options.countOnly)finish();return;
   }
   if(data.type==="huprint-pdf:page"){
    if(data.page!==images.length+1||data.pages!==pages||!data.buffer||!data.width||!data.height){finish("Ufuldstændig PDF-side.");return;}
    images.push({data:new Uint8Array(data.buffer),width:data.width,height:data.height});
    if(options.progress)options.progress("PDF "+options.title+" ("+data.page+" / "+pages+")");
   }
   if(data.type==="huprint-pdf:done")finish(images.length===pages?null:"Der mangler sider i PDF-filen.");
  }
  win.addEventListener("message",receive);
  frame.addEventListener("load",function(){if(!closed)frame.contentWindow.postMessage({type:"huprint-pdf:load",source:source.href,api:new URL("vendor/pdf.js",base).href,worker:new URL("pdf-worker.mjs",base).href,countOnly:!!options.countOnly},origin);},{once:true});
  frame.srcdoc="<!doctype html><meta charset=utf-8><script type=module>("+renderer.toString()+")();<"+"/script>";
  timeout();doc.body.appendChild(frame);
 });
};
})();
