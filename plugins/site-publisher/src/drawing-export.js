/* HUWiki Forge SitePublisher: self-contained Excalidraw/SVG export adapter.
 * Ported from HUWiki OAuthLab SiteWorkshop.js:
 *   siteDrawingSource(), drawingSiteWiki(), siteDrawingBody().
 * Uses the installed drawing engine's existing huwikki/huwikiExportSvg bridge;
 * exports SVG as view-only data, not the editor/React runtime.
 * Preserve copyright and licensing of the separate Excalidraw plugin.
 */
var PUBLISHER_DRAWING_MIME="application/vnd.excalidraw+json";
var publicationDrawingCache=Object.create(null);
function publicationDrawingFields(title){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields;
 return f&&f.type===PUBLISHER_DRAWING_MIME?f:null;
}
function isDrawingTitle(title){return !!publicationDrawingFields(title);}
function publicationDrawingError(title,da,en){
 var error=publicationMediaError(title,(wikiLanguage()==="da"?da:en));
 error.siteDrawingFailure=true;return error;
}
function publicationDrawingAllowed(title,f){
 var tags=Array.isArray(f.tags)?f.tags:(typeof $tw.utils.parseStringArray==="function"?$tw.utils.parseStringArray(String(f.tags||"")):String(f.tags||"").split(/\s+/));
 if(Object.prototype.hasOwnProperty.call(f,"draft.of")||
    Object.prototype.hasOwnProperty.call(f,"draft.title")||
    f["pedia-private"]==="yes"||f.publish==="no"||
    tags.indexOf("$:/tags/Private")>=0)
  throw publicationDrawingError(title,"Tegningen er privat eller en kladde og kan ikke udgives.","Drawing is private or a draft and cannot be published.");
}
function publicationDrawingValidate(title,f){
 publicationDrawingAllowed(title,f);
 var scene;try{scene=JSON.parse(String(f.text||""));}catch(_){
  throw publicationDrawingError(title,"Tegningen indeholder ugyldig JSON.","Drawing has invalid JSON.");
 }
 if(!scene||typeof scene!=="object"||!Array.isArray(scene.elements))
  throw publicationDrawingError(title,"Tegningen mangler en liste over elementer.","Drawing elements are missing.");
 var visible=scene.elements.filter(function(e){return e&&!e.isDeleted;});
 if(!visible.length)throw publicationDrawingError(title,"Tegningen er tom. Tilføj indhold før udgivelse.","Drawing is empty; add an element before publishing.");
 visible.forEach(function(e){
  if(e.type==="embeddable"||e.type==="iframe"){
   throw publicationDrawingError(title,"Interaktive indlejringer kan ikke medtages i en offline SVG.","Interactive embedded frames cannot be included in offline SVG.");
  }
  if(e.type!=="image")return;
  var file=scene.files&&scene.files[e.fileId],data=String(file&&file.dataURL||"");
  if(!/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(data))
   throw publicationDrawingError(title,"Et indsat billede mangler sine data. Gem billedet i tegningen først.","An embedded image is missing; save the image in the drawing first.");
  if(/^data:image\/svg\+xml/i.test(data)){
   var urlBody=data.slice(data.indexOf(",")+1);
   try{if(!/;base64,/i.test(data))urlBody=decodeURIComponent(urlBody);}catch(_){}
   if(/<\s*(?:script|foreignObject)\b|\bonload\s*=/i.test(urlBody))
    throw publicationDrawingError(title,"Et indsat SVG-billede indeholder usikkert indhold.","An embedded SVG image contains unsafe content.");
  }
 });
 if(f["hu-transparent"]==="yes")scene.appState=Object.assign({},scene.appState,{exportBackground:false});
 return scene;
}
function publicationDrawingPending(title,promise){
 var e=publicationMediaError(title,wikiLanguage()==="da"?"Klargør SVG-tegningen …":"Preparing SVG drawing …");
 e.siteDrawingPending=true;e.promise=promise;e.drawingTitle=title;
 return e;
}
// A generated <svg> must not fetch fonts, pictures, or CSS from the editor's machine
// or a network endpoint. Embedded font/image data URLs and local #references are safe.
function publicationDrawingCheckSvg(svg,title){
 if(!svg||svg.nodeType!==1||svg.namespaceURI!=="http://www.w3.org/2000/svg"||String(svg.localName).toLowerCase()!=="svg")
  throw publicationDrawingError(title,"Tegnemotoren returnerede ikke et SVG-billede.","Drawing engine did not return an SVG image.");
 var nodes=[svg].concat(Array.prototype.slice.call(svg.querySelectorAll("*")));
 function checkCss(css){
  if(/@import\b|expression\s*\(|-moz-binding\s*:/i.test(css))
   throw publicationDrawingError(title,"SVG indeholder ekstern eller dynamisk CSS.","SVG contains imported or active CSS.");
  var urls=/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi,m;
  while((m=urls.exec(css))){
   var raw=m[2].trim();
   if(!/^(?:#[\w.:-]+|data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf)|application\/(?:font-woff2?|x-font-ttf|x-font-otf))[,;])/i.test(raw))
    throw publicationDrawingError(title,"SVG henviser til en ekstern skrifttype eller ressource.","SVG references a font or asset not embedded for offline use.");
  }
 }
 nodes.forEach(function(n){
  var tag=String(n.localName||n.tagName||"").toLowerCase();
  if(/^(?:script|foreignobject|iframe|object|embed|audio|video)$/.test(tag))
   throw publicationDrawingError(title,"SVG indeholder et aktivt eller ikke-understøttet element.","SVG contains an active or unsupported element.");
  if(tag==="style")checkCss(n.textContent||"");
  Array.prototype.slice.call(n.attributes||[]).forEach(function(a){
   var name=String(a.name||"").toLowerCase(),value=String(a.value||"").trim();
   if(name.indexOf("on")===0||/javascript:|vbscript:/i.test(value))
    throw publicationDrawingError(title,"SVG indeholder aktivt script.","SVG contains active script.");
   if(name==="style")checkCss(value);
   if(name==="href"||name==="xlink:href"){
    if(!/^(?:#[^\s]*|data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]|data:font\/(?:woff2?|ttf|otf)[;,])/i.test(value))
     throw publicationDrawingError(title,"SVG har en ekstern billedreference eller et link.","SVG has an external image or link reference.");
   }
  });
 });
 return svg;
}
function siteDrawingSource(title){
 var f=publicationDrawingFields(title);
 if(!f)throw publicationDrawingError(title,"Tiddleren er ikke en Excalidraw-tegning.","Tiddler is not an Excalidraw drawing.");
 // Privacy is checked on every attempt, including cached results.
 publicationDrawingAllowed(title,f);
 var key=String(f.text||"")+"\u0000"+String(f["hu-transparent"]||""),
  entry=publicationDrawingCache[title];
 if(entry&&entry.key===key){
  if(entry.src)return entry.src;
  if(entry.error)throw entry.error;
  throw publicationDrawingPending(title,entry.promise);
 }
 var scene=publicationDrawingValidate(title,f),Constructor;
 try{Constructor=$tw.modules.execute("$:/plugins/itw/tw-excalidraw/widget.js").excalidraw;}catch(_){}
 if(!Constructor||typeof Constructor.huwikiExportSvg!=="function")
  throw publicationDrawingError(title,
    "Excalidraw-tegnemotorens SVG-eksport mangler. Installér den opdaterede Tegne-motor og genindlæs wikien.",
    "Excalidraw drawing engine's SVG export is unavailable. Install the updated drawing engine and reload the wiki.");
 entry={key:key,promise:null,src:"",error:null};publicationDrawingCache[title]=entry;
 var timeout;
 entry.promise=Promise.race([
  Promise.resolve().then(function(){return Constructor.huwikiExportSvg(scene);}),
  new Promise(function(resolve,reject){
   timeout=setTimeout(function(){reject(new Error("Drawing renderer timeout (60 s)"));},60000);
  })
 ]).then(function(svg){
  clearTimeout(timeout);
  publicationDrawingCheckSvg(svg,title);
  var xml=new XMLSerializer().serializeToString(svg);
  if(!/<svg(?:\s|>)/i.test(xml)||/<!doctype|<!entity/i.test(xml))throw new Error("SVG export is malformed.");
  entry.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(xml);
  return entry.src;
 }).catch(function(err){
  clearTimeout(timeout);
  entry.error=err&&err.siteDrawingFailure?err:publicationDrawingError(title,
   "SVG-klargøringen mislykkedes: "+String(err&&err.message||err),
   "Could not prepare SVG: "+String(err&&err.message||err));
  throw entry.error;
 });
 // Avoid unhandled-rejection warnings when an article also throws during rendering.
 entry.promise.catch(function(){});
 throw publicationDrawingPending(title,entry.promise);
}
function siteDrawingBody(title,ctx){
 var src=siteDrawingSource(title);
 if(ctx)ctx.drawings=true;
 return '<figure class="huw-site-drawing"><img alt="'+safe(title)+'" src="'+safe(src)+'"></figure>';
}
function drawingSiteWiki(ctx){
 var normal=$tw.wiki,local=Object.create(normal);
 local.parseTiddler=function(title,options){
  if(!publicationDrawingFields(title))return normal.parseTiddler.call(this,title,options);
  var src=siteDrawingSource(title);
  if(ctx)ctx.drawings=true;
  return {tree:[{type:"element",tag:"figure",attributes:{class:{type:"string",value:"huw-site-drawing"}},children:[
   {type:"element",tag:"img",attributes:{alt:{type:"string",value:title},src:{type:"string",value:src}},children:[]}
  ]}]};
 };
 return local;
}
