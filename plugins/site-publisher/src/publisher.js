/*\
title: $:/plugins/huwiki/site-publisher/startup.js
type: application/javascript
module-type: startup
\*/
(function(){
"use strict";
exports.name="huwiki-sitepublisher";
exports.platforms=["browser"];
exports.after=["startup"];
exports.synchronous=true;
var current=null;
function wikiLanguage(){var v=String($tw.wiki.getTiddlerText("$:/language","")||"");if(/(?:^|\/)da(?:-|_|$)/i.test(v))return "da";if(/(?:^|\/)en(?:-|_|$)/i.test(v))return "en";return /^da(?:-|_|$)/i.test(document.documentElement.lang||navigator.language||"")?"da":"en";}
var englishSite={"⚙ Indstillinger":"⚙ Settings","Sitelayout":"Site layout","Automatisk (følg wikiens tema)":"Automatic (follow wiki theme)","Standard (nuværende)":"Standard (current)","Vanilla (klassisk)":"Vanilla (classic)","HUPedia (leksikon)":"HUPedia (encyclopedia)","Overblik":"Overview","Sitevisning":"Site preview","Én HTML-fil · lokale sites":"One HTML file · local sites","✕ Luk":"✕ Close","✕ Skjul indstillinger":"✕ Hide settings", "✕ Afslut fokus":"✕ Exit focus","Vælg tiddler med liste":"Choose a tiddler with a list","Mit TiddlyWiki-site":"My TiddlyWiki site","Denne tiddler":"This tiddler","Alle med tag":"All with tag","Liste i en tiddler":"List in a tiddler","Åbne tiddlere (StoryList)":"Open tiddlers (StoryList)","Nodepult · start her":"Music stand · start here","Normal nodevisning":"Normal score view","Indhold":"Contents","Vælg tag":"Choose tag","Vælg liste":"Choose list","Siteoverskrift":"Site title","Startvisning":"Starting view","Vis siteoverskrift":"Show site title","Valgt til sitet":"Selected for publication","Gem rækkefølge i list-felt":"Save order in list field","Opdater forhåndsvisning":"Refresh preview","Hent HTML":"Download HTML","Del HTML":"Share HTML","Ingen tiddlere fundet. Vælg et andet tag eller en liste.":"No tiddlers found. Choose another tag or list.","♫ Noder":"♫ Music","Artikel":"Article","♫ Nodeark":"♫ Score","Åbn nodearket i sitevisning for at teste noder og lyd.":"Open the score in the site preview to test notation and playback.","Ændringerne opdateres automatisk …":"Updating the preview automatically …","Vælg mindst én tiddler.":"Select at least one tiddler.","Bygger site og kontrollerer indhold …":"Building site and checking content …","Forhåndsvisning klar":"Preview ready","tiddlere":"tiddlers","Eksportér som én HTML-fil.":"Export as one HTML file.","HTML-download startet.":"HTML download started.","HTML-filen kunne ikke hentes: ":"Could not download the HTML file: ","Filen kunne ikke deles: ":"Could not share the file: ","Vælg et tag eller en tiddler med liste.":"Choose a tag or a list tiddler.","Gem tiddlernes rækkefølge i list-feltet for «":"Save the tiddler order to the list field for «","»?\nDette ændrer ikke selve tiddlernes indhold.":"»?\nThis does not change the tiddlers' content.","Rækkefølgen er gemt i list-feltet for «":"Order saved to the list field for «","». Eksporten har fortsat sit eget udvalg.":"». The export still has its own selection.","Kunne ikke gemme list-feltet: ":"Could not save the list field: ","Repertoire":"Repertoire","Artikler":"Articles","numre":"tunes","artikler":"articles","elementer":"items","Fokus: Tryk på et tomt område af nodearket for at vise/skjule betjeningen":"Focus: click an empty area of the score to show or hide the controls","⛶ Fokus":"⛶ Focus","Lad indholdslisten forblive synlig":"Keep contents list visible","📌 Fastgør":"📌 Pin","Interaktiv nodevisning":"Interactive score", "Deling er ikke tilgængelig her. HTML-download er startet.":"Sharing is unavailable here. An HTML download has been started.", "Systemdelingen blev afvist. HTML-download er forsøgt i stedet. Brug Hent HTML, hvis filen ikke vises.":"The system rejected sharing. An HTML download was attempted instead. Use Download HTML if the file does not appear.", "Deling og download mislykkedes: ":"Sharing and download failed: "};
function word(danish){return wikiLanguage()==="da"?danish:(englishSite[danish]||danish);}

function el(tag,cls,txt){var x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
function safe(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function namesOf(value){if(Array.isArray(value))return value.slice();if(!value)return [];return $tw.utils.parseStringArray(String(value));}
function unique(values){var used=Object.create(null);return values.filter(function(t){if(!t||t.indexOf("$:/")===0||used[t]||!$tw.wiki.getTiddler(t))return false;used[t]=true;return true;});}
function listField(title){var t=$tw.wiki.getTiddler(title);return t?(typeof t.getFieldList==="function"?t.getFieldList("list"):namesOf(t.fields.list)):[];}
function sourceList(title){
 var t=$tw.wiki.getTiddler(title),names=listField(title);if(!t)return unique(names);
 var text=articleSource(title,wikiLanguage()),re=/\[\[(?:([^\]|]+)\|)?([^\]]+)\]\]/g,m;
 while((m=re.exec(text)))names.push(m[2]);
 try{
  var frame=Array.prototype.find.call(document.querySelectorAll(".tc-tiddler-frame[data-tiddler-title]"),function(n){return n.getAttribute("data-tiddler-title")===title;});
  var holder=frame&&frame.querySelector(".tc-tiddler-body");
  if(!holder){holder=el("div");holder.innerHTML=$tw.wiki.renderText("text/html","text/vnd.tiddlywiki",text)||"";}
  holder.querySelectorAll("a.tc-tiddlylink,a[href^='#']").forEach(function(a){var target=a.getAttribute("data-tiddler-title")||"",href=a.getAttribute("href")||"";if(!target&&href.charAt(0)==="#")try{target=decodeURIComponent(href.slice(1));}catch(_){}if(target)names.push(target);});
 }catch(_){}
 return unique(names.filter(function(n){return n!==title;}));
}
function listOfTags(){var keys=Object.keys($tw.wiki.getTagMap()||{});return keys.filter(function(s){return s.indexOf("$:/")!==0;}).sort(function(a,b){return a.localeCompare(b);});}
function tagList(tag){return unique(tag?($tw.wiki.getTiddlersWithTag(tag)||[]):[]);}
function storyList(){return unique(listField("$:/StoryList"));}
function allOrdinary(){return unique($tw.wiki.getTiddlers().concat(Object.keys($tw.wiki.getTagMap()||{}).reduce(function(out,k){return out.concat($tw.wiki.getTiddlersWithTag(k)||[]);},[])));}
function hasAbc(title){try{var m=$tw.modules.execute("$:/plugins/huwiki/abc/site-publisher.js");return !!(m&&m.hasScore&&m.hasScore($tw.wiki,title));}catch(_){return false;}}
function siteModule(){try{return $tw.modules.execute("$:/plugins/huwiki/abc/site-publisher.js");}catch(_){return null;}}
// Select the readable article source in the current TiddlyWiki language.
// HUPedia stores its optional translation in text-en; HUWiki teaching pages
// previously used huwiki-text-en. Neither format changes the normal text field.
function articleSource(title,lang){
 var t=$tw.wiki.getTiddler(title);
 if(!t)return "";
 var f=t.fields||{};
 var english=lang==="en";
 var selected=english?(f["huwiki-text-en"]||f["text-en"]):(f["huwiki-text-da"]||f.text);
 var fallback=f["huwiki-text-da"]||f.text||f["huwiki-text-en"]||f["text-en"]||"";
 return String(selected||fallback);
}
// Preserve the existing HUPedia ViewTemplate and infobox instead of
// rebuilding its fields inside SitePublisher. Future Editions may supply
// similar rendering adapters without changing the Publisher's controls.
function isHupediaArticle(title){
 var t=$tw.wiki.getTiddler(title);
 if(!t)return false;
 var tags=namesOf(t.fields.tags);
 return tags.some(function(tag){
  return tag==="PediaArtikel"||/^HUPedia\/(?:Person|Sted|Place|Begivenhed|Event|Organisation|Organization|Musikværk|MusicalWork|Begreb|Concept|Artikel|Article)$/.test(tag);
 });
}
function hupediaArticleHtml(title,renderer){
 if(!isHupediaArticle(title))return "";
 var template="$:/plugins/huwiki/hupedia/article-view";
 if(!$tw.wiki.getTiddlerText(template,""))throw Error("HUPedia template is missing; cannot publish the infobox for: "+title);
 var html=(renderer||$tw.wiki).renderTiddler("text/html",template,{variables:{currentTiddler:title}});
 if(!/class=["'][^"']*\bhupedia-infobox\b/.test(html))throw Error("HUPedia infobox was not rendered for: "+title);
 return html;
}
function publicationComponentsCss(entries){
 if(!entries.some(function(e){return isHupediaArticle(e.title);}))return "";
 var styles=$tw.wiki.getTiddlerText("$:/plugins/huwiki/hupedia/style.css","");
 if(!styles)throw Error("HUPedia stylesheet is missing; cannot publish the infobox.");
 return "\n/* HUPedia article components, supplied by HUPedia */\n"+styles+"\n";
}
/* HUWiki Forge SitePublisher: shared local media + CutOut export adapters.
 * Adapted from OAuthLab SiteWorkshop.js (siteCutoutWidgets/cutoutAssets/cutoutTitle).
 * This source is bundled into startup.js; no editor/Google code reaches readers.
 * No external or private media dependencies may be silently emitted. */
var PUBLISHER_CUTOUT_BASE="$:/plugins/huwiki/site-publisher/cutout/";
function publicationMediaError(owner,detail){
 return new Error("SitePublisher · "+owner+": "+detail);
}
function cutoutScene(title){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields;
 if(!f||f.type!=="application/json")return null;
 try{
  var scene=JSON.parse(String(f.text||""));
  if(scene&&scene.version===1&&(Array.isArray(scene.parts)||Array.isArray(scene.scenes)))return scene;
 }catch(_){}
 return null;
}
function isCutoutTitle(title){return !!cutoutScene(title);}
function cutoutReference(id,title){
 var found="";
 var scan=$tw.wiki.eachShadowPlusTiddlers||$tw.wiki.each;
 if(id&&typeof scan==="function")scan.call($tw.wiki,function(t,key){if(t.fields["cutout-id"]===id)found=key;});
 return found||title||"";
}
function publicationDataUrl(title,expectedType){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields;
 if(!f)throw publicationMediaError(title,"medietiddleren findes ikke / media tiddler is missing.");
 var type=String(f.type||""),valid=/^(?:image\/(?:png|jpeg|gif|webp|svg\+xml|avif)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm|aac|flac)|video\/(?:mp4|webm|ogg|quicktime))$/i;
 if(!valid.test(type)||(expectedType&&!new RegExp("^"+expectedType+"/","i").test(type)))
  throw publicationMediaError(title,"medietypen kan ikke indlejres offline / unsupported offline media type: "+type);
 var data=String(f.text||"").trim(),match=/^data:([^;,]+)(?:;[^,]*)?,/i.exec(data);
 if(match){
  if(match[1].toLowerCase()!==type.toLowerCase())
   throw publicationMediaError(title,"data-URL og tiddlerens medietype stemmer ikke overens / data URL MIME mismatch.");
  if(!data.slice(match[0].length))throw publicationMediaError(title,"medieindholdet er tomt / media is empty.");
  return data;
 }
 if(!data)throw publicationMediaError(title,"kun en ekstern/privat filadresse findes; gem mediet i wikien før eksport / only an external or private file URI is available.");
 if(type==="image/svg+xml"){
  if(/<\s*(?:script|foreignObject)\b|@import\b|url\(\s*['"]?\s*(?:https?:|file:|blob:|\/)/i.test(data))
   throw publicationMediaError(title,"SVG indeholder script eller ekstern afhængighed / SVG contains scripts or external references.");
  if(/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i.test(data))
   throw publicationMediaError(title,"SVG indeholder en ekstern billedreference / SVG has an external image reference.");
  if(!/<svg(?:\s|>)/i.test(data))throw publicationMediaError(title,"SVG-data mangler <svg>.");
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data);
 }
 if(!/^[A-Za-z0-9+/=\s]+$/.test(data))
  throw publicationMediaError(title,"mediet er ikke gemt som gyldige Base64-data / invalid embedded Base64.");
 return "data:"+type+";base64,"+data.replace(/\s/g,"");
}
function cutoutAsset(title,ctx){
 var row=$tw.wiki.getTiddler(title),f=row&&row.fields;
 if(!f)throw publicationMediaError(title,"CutOut-billedet mangler / CutOut image is missing.");
 if(!/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/.test(String(f.type||"")))throw publicationMediaError(title,"billedformatet understøttes ikke af CutOut / unsupported CutOut image format.");
 var url=publicationDataUrl(title,"image");
 var text=f.type==="image/svg+xml"?
  String(f.text||""):(/^data:/i.test(String(f.text||""))?url:String(f.text||""));
 var copy={title:title,type:f.type,text:text};
 if(f["cutout-id"])copy["cutout-id"]=f["cutout-id"];
 // Never copy _canonical_uri: it might point to an editor-only drive/file.
 if(f.type==="image/svg+xml"&&!/^data:/i.test(text))copy.text=String(f.text||"");
 ctx.rows[title]=copy;
}
function validateCutoutParts(title,scene){
 var parts=scene.parts||[],byId={};
 if(parts.length>300)throw publicationMediaError(title,"mere end 300 CutOut-dele / over 300 CutOut parts.");
 parts.forEach(function(p){
  if(!p||!p.id||byId[p.id])throw publicationMediaError(title,"manglende eller dubleret del-ID / missing or duplicate part ID.");
  byId[p.id]=p;
 });
 function ancestor(id,seen,depth){
  if(depth>10)throw publicationMediaError(title,"hierarkiet er dybere end læseren understøtter / part hierarchy exceeds reader depth.");
  if(seen[id])throw publicationMediaError(title,"cirkulær delstruktur / circular CutOut part hierarchy.");
  var part=byId[id];
  if(part.parent){
   if(!byId[part.parent])throw publicationMediaError(title,"overdelen findes ikke / parent part is missing.");
   var next=Object.assign({},seen);next[id]=true;ancestor(part.parent,next,depth+1);
  }
 }
 Object.keys(byId).forEach(function(id){ancestor(id,{},0);});
}
function collectCutout(title,ctx,stack){
 stack=stack||[];
 if(stack.indexOf(title)!==-1)throw publicationMediaError(title,"cirkulær animationsreference / circular animation reference.");
 if(stack.length>=16)throw publicationMediaError(title,"animationer er indlejret for dybt / nested CutOut animation exceeds reader depth.");
 if(ctx.rows[title])return;
 var scene=cutoutScene(title),t=$tw.wiki.getTiddler(title);
 if(!scene)throw publicationMediaError(title,"CutOut-animationen findes ikke eller er ugyldig / missing or invalid CutOut scene.");
 validateCutoutParts(title,scene);
 var next=stack.concat(title),f=t.fields,copy={title:title,type:"application/json",text:String(f.text||"")};
 if(f["cutout-id"])copy["cutout-id"]=f["cutout-id"];
 if(f["cutout-kind"])copy["cutout-kind"]=f["cutout-kind"];
 ctx.rows[title]=copy;
 function addImage(p,required){
  if(!p){if(required)throw publicationMediaError(title,"en billedvariant mangler sin billedkilde / image variant lacks an image source.");return;}
  var inline=p.imageData||p.src||"";
  if(inline&&!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i.test(inline))
   throw publicationMediaError(title,"billedkilden er ikke indlejret / non-embedded image source: "+String(inline).slice(0,90));
  var ref=cutoutReference(p.assetId,p.asset);
  if(ref&&!p.imageData)cutoutAsset(ref,ctx);
  if(required&&!inline&&!ref)
   throw publicationMediaError(title,"en billeddel mangler sin billedkilde / image part lacks an image source.");
 }
 (scene.parts||[]).forEach(function(part){
  if(!part)return;
  if(part.type==="animation"){
   var child=cutoutReference(part.animationId,part.animation);
   if(!child)throw publicationMediaError(title,"en indlejret animation mangler reference / nested animation has no reference.");
   collectCutout(child,ctx,next);
  }
  var variants=Array.isArray(part.variants)?part.variants:[];
  // The reader selects the active variant (or the first one) before looking
  // for an image. Animated SVG layers therefore need no duplicate base image.
  if(part.type==="image"||part.asset||part.assetId)addImage(part,part.type==="image"&&!variants.length);
  variants.forEach(function(variant){addImage(variant,part.type==="image");});
 });
 (scene.scenes||[]).forEach(function(clip){
  var child=cutoutReference(clip.sourceId,clip.source||clip.animation||clip.theatre);
  if(!child)throw publicationMediaError(title,"en teaterscene mangler reference / theatre scene has no reference.");
  collectCutout(child,ctx,next);
 });
 ctx.used=true;
}
function cutoutWidgetMarkup(title,loop,autoplay,ctx){
 collectCutout(title,ctx,[]);
 return '<div class="huw-site-cutout" data-cutout-title="'+safe(title)+'" data-loop="'+safe(loop||"yes")+'" data-autoplay="'+safe(autoplay||"no")+'"></div>';
}
function cutoutWidgetPlaceholders(text,ctx,snippets){
 var unmatched=false,result=String(text||"").replace(/<\$(cutout|cutout-film|cutout-theatre)(?=\s|\/>)([^>]*?)\/>/gi,function(_,kind,attributes){
  function value(key){
   var match=attributes.match(new RegExp("\\b"+key+"\\s*=\\s*([\"'])((?:(?!\\1).)*)\\1","i"));
   return match&&match[2]||"";
  }
  var title=value("tiddler");
  if(!title)throw publicationMediaError(kind,"CutOut-widget mangler tiddler-navn / missing tiddler attribute.");
  var markup=cutoutWidgetMarkup(title,value("loop"),value("autoplay"),ctx);
  var token="HUW_SITE_CUTOUT_"+snippets.length+"_HERE";
  snippets.push({tag:token,html:markup});return token;
 });
 if(/<\$(?:cutout|cutout-film|cutout-theatre)(?=\s|>)/i.test(result))
  throw publicationMediaError("CutOut","en CutOut-widget kan ikke gengives / unsupported CutOut widget syntax.");
 return result;
}
function publicationHtmlMedia(div,owner){
 function mediaUrl(value,expected){
  value=String(value||"").trim();
  if(!value)throw publicationMediaError(owner,"et medie mangler src / a media source is missing.");
  if(/^data:/i.test(value)){
   if(!new RegExp("^data:"+expected+"/","i").test(value)||/^\s*data:text\/html/i.test(value))
    throw publicationMediaError(owner,"medieformatet i data-URL understøttes ikke / unsupported data URL: "+value.slice(0,80));
   return value;
  }
  if(/^(?:https?:|blob:|file:|filesystem:|\/\/|\/|[a-z][a-z0-9+.-]*:)/i.test(value))
   throw publicationMediaError(owner,"mediet bruger en ekstern eller privat adresse / media refers to external or private URL: "+value.slice(0,100));
  var title=value;try{title=decodeURIComponent(value);}catch(_){}
  if(!$tw.wiki.getTiddler(title))throw publicationMediaError(owner,"det lokale medie findes ikke i wikien / missing local media tiddler: "+value);
  return publicationDataUrl(title,expected);
 }
 div.querySelectorAll("iframe,object,embed").forEach(function(n){
  throw publicationMediaError(owner,"indlejret iframe/object kan ikke pakkes som én offlinefil / iframe or object would be lost.");
 });
 div.querySelectorAll("img[src],audio[src],video[src],source[src],video[poster],image[href],image[xlink\\:href]").forEach(function(n){
  var type=n.tagName.toLowerCase(),key=type==="video"&&n.hasAttribute("poster")?"poster":(n.hasAttribute("href")?"href":n.hasAttribute("xlink:href")?"xlink:href":"src");
  var expected=(type==="img"||type==="image"||key==="poster")?"image":(type==="audio"?"audio":(type==="video"?"video":(n.closest("video")?"video":"audio")));
  n.setAttribute(key,mediaUrl(n.getAttribute(key),expected));
 });
 div.querySelectorAll("[srcset]").forEach(function(n){
  throw publicationMediaError(owner,"srcset med mulige eksterne billeder understøttes endnu ikke / srcset needs a dedicated offline adapter.");
 });
 div.querySelectorAll("[style]").forEach(function(n){
  if(/url\s*\(\s*['"]?\s*(?:https?:|file:|blob:|\/)/i.test(n.getAttribute("style")))
   throw publicationMediaError(owner,"CSS-stilen indeholder en ekstern ressource / external resource in inline CSS.");
 });
 return div;
}
function publicationMediaArticle(title){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields||{},type=String(f.type||"");
 if(!/^(?:image|audio|video)\//.test(type))return "";
 var kind=type.split("/")[0],src=publicationDataUrl(title,kind);
 if(kind==="image")return '<figure class="husp-site-image"><img alt="'+safe(title)+'" src="'+safe(src)+'"></figure>';
 return '<figure class="husp-site-media"><'+kind+' controls preload="metadata" src="'+safe(src)+'"></'+kind+'><figcaption>'+safe(title)+'</figcaption></figure>';
}

/* HUWiki Forge SitePublisher: self-contained Excalidraw/SVG export adapter.
 * Ported from HUWiki OAuthLab SiteWorkshop.js:
 *   siteDrawingSource(), drawingSiteWiki(), siteDrawingBody().
 * Uses the installed drawing engine's existing huwikiExportSvg bridge;
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
// Preflight only explicitly transcluded drawings, ignoring code spans/fences.
function publicationDrawingReferences(source){
 var refs=[],fenced=false;
 String(source||"").split(/\n/).forEach(function(line){
  if(/^\s*`{3}/.test(line)){fenced=!fenced;return;}
  if(fenced)return;
  var parts=line.split(/(`[^`]*`)/g);
  for(var i=0;i<parts.length;i+=2){
   parts[i].replace(/\{\{([^{}\n]+)\}\}/g,function(_,body){
    var title=body.split("||")[0].split("##")[0].trim();
    if(isDrawingTitle(title))refs.push(title);
    return _;
   });
   parts[i].replace(/<\$transclude\b([^>]*?)\/>/gi,function(_,attrs){
    var m=attrs.match(/(?:^|\s)(?:\$tiddler|tiddler)\s*=\s*(["'])(.*?)\1/i);
    if(m&&isDrawingTitle(m[2]))refs.push(m[2]);
    return _;
   });
  }
 });
 return refs;
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
  if(publicationDrawingCache[title]===entry)delete publicationDrawingCache[title];
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
// A live editor is not a reader view. Do not mark a site successful when
// the drawing canvas disappears during static WikiText rendering.
// Guard original WikiText: the active editor is not an exportable SVG reader.
function publicationRejectLiveDrawingSource(title,source){
 var fenced=false,hasEditor=false,tick=String.fromCharCode(96);
 String(source||"").split(/\n/).forEach(function(line){
  if(line.trim().slice(0,3)===tick+tick+tick){fenced=!fenced;return;}
  if(fenced)return;
  var parts=line.split(new RegExp("("+tick+"[^"+tick+"]*"+tick+")","g"));
  for(var i=0;i<parts.length;i+=2){
   if(/<\$excalidraw(?=[\s/>])/i.test(parts[i])||
      /<\$transclude\b[^>]*\$:\/plugins\/huwiki\/tegne\/home(?=["'\s/>])/i.test(parts[i]))hasEditor=true;
  }
 });
 if(hasEditor)publicationRejectLiveDrawingUi({querySelector:function(){return true;}},title);
}
function publicationRejectLiveDrawingUi(root,title){
 if(!root||!root.querySelector||!root.querySelector(".hu-tegne-app,.hu-tegne-editor,.excalidraw"))return;
 throw publicationDrawingError(title,
  "Dette er tegnestudiets redigeringsside, ikke en tegning. Vælg Udgiv tegning i Tegne Edition, eller vælg selve tegningens tiddler i SitePublisher.",
  "This is the drawing studio, not a drawing. Choose Publish drawing in Tegne Edition, or select the drawing tiddler in SitePublisher.");
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

/* AniMus publication adapters. Bundled into the SitePublisher startup module.
 * Only the selected production and its referenced scenes, scores and media
 * are exported. The audience runtime contains no authoring widgets. */
var PUBLISHER_ANIMUS_BASE="$:/plugins/huwiki/site-publisher/animus/";
function isAnimusTitle(title){var scene=cutoutScene(title);return !!(scene&&scene.musical&&typeof scene.musical==="object");}
function collectAnimus(title,fallback,ctx){
 var scene=cutoutScene(title);if(!scene)throw publicationMediaError(title,"AniMus-forestillingen mangler / missing AniMus production.");
 collectCutout(title,ctx,[]);ctx.animus=true;
 // Scene notes are editing material, never audience content.
 Object.keys(ctx.rows).forEach(function(key){var row=ctx.rows[key];if(row.type!=="application/json")return;
  try{var data=JSON.parse(row.text);if(data.version===1){delete data.sceneNotes;
   (data.parts||[]).forEach(function(part){delete part.svgDrawing;delete part.svgLayerIds;delete part.svgLayerOwner;delete part.svgLayerId;});
   row.text=JSON.stringify(data);
  }}catch(_){}
 });
 var musical=scene.musical||{},songs=Array.isArray(musical.songs)?musical.songs:[];
 if(!songs.length&&fallback)songs=[{score:fallback}];
 songs.forEach(function(clip){
  var name=String(clip&&clip.score||""),t=$tw.wiki.getTiddler(name),f=t&&t.fields,source=f&&(f["abc-source"]||f.text);
  if(!name||!source)throw publicationMediaError(title,"nodearket mangler / missing score: "+name);
  var copy={title:name,type:f.type||"text/vnd.abc",text:String(source),"abc-source":String(source)};
  Object.keys(f).forEach(function(k){if(/^abc-[a-z0-9-]+$/.test(k))copy[k]=f[k];});
  ctx.rows[name]=copy;
 });
 (Array.isArray(musical.audioClips)?musical.audioClips:[]).forEach(function(clip){
  var asset=String(clip&&clip.asset||"");if(!asset)throw publicationMediaError(title,"et lydklip mangler lydfil / recorded clip has no audio asset.");
  var t=$tw.wiki.getTiddler(asset),f=t&&t.fields;
  if(!f)throw publicationMediaError(title,"optagelsen mangler / recorded audio is missing: "+asset);
  var url=publicationDataUrl(asset,"audio");
  ctx.rows[asset]={title:asset,type:String(f.type),text:url};
 });
 return scene;
}
function animusWidgetMarkup(title,score,ctx){
 collectAnimus(title,score,ctx);
 return '<section class="huw-site-animus" data-animus-title="'+safe(title)+'" data-animus-score="'+safe(score||"")+'"></section>';
}
function animusWidgetPlaceholders(text,ctx,snippets,ownerTitle){
 var result=String(text||"").replace(/<\$musical-stage(?=\s|\/>)([^>]*?)\/>/gi,function(_,attrs){
  function value(name){
   var match=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|\\{\\{!!([a-z0-9_-]+)\\}\\})','i').exec(attrs);
   if(!match)return "";
   if(match[3]){var owner=ownerTitle&&$tw.wiki.getTiddler(ownerTitle);return owner&&typeof owner.fields[match[3]]==="string"?owner.fields[match[3]]:"";}
   return match[1]===undefined?match[2]:match[1];
  }
  var title=value("scene"),score=value("score");
  if(!title)throw publicationMediaError("AniMus","widget mangler scene-navn / missing scene attribute.");
  var token="HUW_SITE_ANIMUS_"+snippets.length+"_HERE";
  snippets.push({tag:token,html:animusWidgetMarkup(title,score,ctx)});return token;
 });
 if(/<\$musical-stage(?=\s|>)/i.test(result))throw publicationMediaError("AniMus","widget-syntaks kan ikke udgives / unsupported musical-stage widget syntax.");
 return result;
}
function animusBundle(ctx){
 if(!ctx.animus)return {script:"",css:"",config:null};
 function source(title){var text=$tw.wiki.getTiddlerText(title,"");if(!text)throw publicationMediaError("AniMus","afspillermodulet mangler / playback module is missing: "+title);return text;}
 function json(value){return JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");}
 var names=["musical/playlist","musical/motion","musical/sync","musical/sfx","musical/lipsync","musical/narration-player","abc/audio-controller","abc/accompaniment","abc/start-position"],queue=names.map(function(n){return "$:/plugins/huwiki/"+n+".js";}),sources=Object.create(null),seen=Object.create(null);
 queue.forEach(function(title){seen[title]=true;});
 for(var i=0;i<queue.length;i++){
  var title=queue[i];if(title==="$:/plugins/huwiki/cutout/engine.js"||title==="$:/plugins/huwiki/abc/vendor/abcjs.js")continue;
  var code=source(title);sources[title]=code;
  var re=/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,match;
  while((match=re.exec(code))){var dependency=match[1];
   if(!/^\$:\/plugins\/huwiki\/(?:abc|musical|cutout)\/[a-z0-9/-]+\.(?:js|json)$/i.test(dependency))throw publicationMediaError("AniMus","unsupported runtime dependency: "+dependency);
   if(!seen[dependency]){seen[dependency]=true;queue.push(dependency);}
  }
 }
 var definitions=Object.keys(sources).map(function(title){var content=sources[title];if(/\.json$/.test(title))content="module.exports="+JSON.stringify(JSON.parse(content))+";";
  return "definitions["+json(title)+"]=function(module,exports,require){\n"+content+"\n};";
 }).join("\n");
 var bootstrap="(function(){var definitions=Object.create(null),cache=Object.create(null);\n"+definitions+"\n"+
  'cache["$:/plugins/huwiki/cutout/engine.js"]={exports:window.HUWikiCutOutSite};\n'+
  'cache["$:/plugins/huwiki/abc/vendor/abcjs.js"]={exports:window.ABCJS};\n'+
  'function require(title){if(cache[title])return cache[title].exports;if(!definitions[title])throw new Error("AniMus module missing: "+title);var module={exports:{}};cache[title]=module;try{definitions[title](module,module.exports,require);}catch(error){delete cache[title];throw error;}return module.exports;}\n'+
  'window.HUWikiAniMusModules={require:require};})();';
 var license=$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/vendor/abcjs-LICENSE","")+"\n"+$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/vendor/abcjs-bundled-LICENSE","")+"\n"+$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/tinysynth-LICENSE","");
 var mode=$tw.wiki.getTiddlerText("$:/config/huwiki/abc/audio-engine-mode","auto");
 // The publication keeps an explicit engine choice. The default requests the
 // normal sample engine; failure does not activate another synthesizer.
 if(["original","fluid","tiny"].indexOf(mode)<0)mode="original";
 return {script:source("$:/plugins/huwiki/abc/vendor/abcjs.js")+"\n"+bootstrap+"\n"+source(PUBLISHER_ANIMUS_BASE+"viewer.js"),
  css:source(PUBLISHER_ANIMUS_BASE+"viewer.css"),license:license,
  config:{soundFont:$tw.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim(),
   reserveBase:$tw.wiki.getTiddlerText("$:/config/huwiki/abc/reserve-base","").trim(),engineMode:mode}};
}

function embeddedArticle(title,lang,exportContext){
 var t=$tw.wiki.getTiddler(title);if(!t)return "";
 // Keep the same language as the export; do not silently revert to Danish.
 var source=articleSource(title,lang||wikiLanguage()),snippets=[],inFence=false;
 publicationRejectLiveDrawingSource(title,source);
 var drawingReferences=publicationDrawingReferences(source);
 drawingReferences.forEach(function(ref){siteDrawingSource(ref);});
 exportContext=exportContext||{rows:{},used:false};
 var drawingRenderer=drawingSiteWiki(exportContext);
 var renderedPedia=isHupediaArticle(title)?hupediaArticleHtml(title,drawingRenderer):"";
 if(isAnimusTitle(title))return animusWidgetMarkup(title,"",exportContext);
 if(isCutoutTitle(title))return cutoutWidgetMarkup(title,"yes","no",exportContext);
 if(isDrawingTitle(title))return siteDrawingBody(title,exportContext);
 var publicationMedia=publicationMediaArticle(title);if(publicationMedia)return publicationMedia;
 var Loader,Excerpt,ABC;
 try{Loader=$tw.modules.execute("$:/plugins/huwiki/abc/loader.js");Excerpt=$tw.modules.execute("$:/plugins/huwiki/abc/score-excerpt.js");ABC=$tw.modules.execute("$:/plugins/huwiki/abc/vendor/abcjs.js");}catch(_){}
 function sample(title,attrs){
  var tag="HUW_SITE_EXAMPLE_"+snippets.length+"_HERE",scoreHTML="";
  try{
   if(!Loader||!Excerpt||!ABC)throw new Error("ABC-plugin mangler");
   var src=Loader.getSource($tw.wiki,title);if(!src)throw new Error("Melodien findes ikke");
   var bars=/\bbars:\"(\d+)-(\d+)\"/.exec(attrs),first=bars?Number(bars[1]):Number((/\bfrom:\"(\d+)\"/.exec(attrs)||[])[1]||1);
   var last=bars?Number(bars[2]):first+Number((/\bcount:\"(\d+)\"/.exec(attrs)||[])[1]||4)-1;
   var excerpt=Excerpt.build(ABC,src,{start:first,end:last}),tmp=el("div");
   ABC.renderAbc(tmp,excerpt.source,{responsive:"resize",staffwidth:680,scale:0.90});
   scoreHTML='<figure class="husp-excerpt"><figcaption>'+safe(title)+' · takt '+first+'–'+last+'</figcaption>'+tmp.innerHTML+'</figure>';
  }catch(error){scoreHTML='<aside class="husp-excerpt husp-excerpt-missing">Nodeeksempel '+safe(title)+': '+safe(error.message)+'</aside>';}
  snippets.push({tag:tag,html:scoreHTML});return tag;
 }
 var lines=source.split(/\n/).map(function(line){
  if(/^\s*```/.test(line)){inFence=!inFence;return line;}
  if(inFence)return line;
  var segments=line.split(/(`[^`]*`)/g);
  for(var j=0;j<segments.length;j+=2){
   segments[j]=segments[j].replace(/<<abc-example\s+"([^"]+)"([^>]*?)>>/g,function(_,title,attrs){return sample(title,attrs);});
   segments[j]=animusWidgetPlaceholders(segments[j],exportContext,snippets,title);
   segments[j]=cutoutWidgetPlaceholders(segments[j],exportContext,snippets);
  }
  return segments.join("");
 });
 var wikiText=lines.join("\n"),html="";
 try{html=renderedPedia||drawingRenderer.renderText("text/html","text/vnd.tiddlywiki",wikiText)||"";}catch(error){if(renderedPedia||error.siteDrawingPending||error.siteDrawingFailure)throw error;html="<p>"+safe(error.message)+"</p>";}
 if(drawingReferences.length){
  var exportedFigures=(html.match(/<figure\b[^>]*class=["'][^"']*\bhuw-site-drawing\b/gi)||[]).length;
  if(exportedFigures<drawingReferences.length)
   throw publicationDrawingError(title,"Mindst én indlejret tegning mangler i HTML-artiklen.","At least one embedded drawing was not rendered in the article.");
 }
 snippets.forEach(function(s){html=html.replace(s.tag,s.html);});
 if(renderedPedia&&/<\$(?:cutout|cutout-film|cutout-theatre)\b/i.test(source))throw publicationMediaError(title,"CutOut i HUPedia-skabelonen kræver en eksport-adapter / CutOut within HUPedia template needs an adapter.");
 var div=el("div");div.innerHTML=html;
 publicationRejectLiveDrawingUi(div,title);
 if(div.querySelector(".huw-musical"))throw publicationMediaError(title,"AniMus must be published as a production or a musical-stage widget.");
 div.querySelectorAll(".huw-site-animus[data-animus-title]").forEach(function(node){node.outerHTML=animusWidgetMarkup(node.getAttribute("data-animus-title"),node.getAttribute("data-animus-score"),exportContext);});
 div.querySelectorAll(".huw-site-cutout[data-cutout-title]").forEach(function(node){var name=node.getAttribute("data-cutout-title");node.outerHTML=cutoutWidgetMarkup(name,node.getAttribute("data-loop"),node.getAttribute("data-autoplay"),exportContext);});
 publicationHtmlMedia(div,title);
 div.querySelectorAll("script,iframe,object,embed,.tc-tiddler-controls").forEach(function(n){n.remove();});
 div.querySelectorAll("*").forEach(function(node){Array.prototype.slice.call(node.attributes||[]).forEach(function(a){if(/^on/i.test(a.name))node.removeAttribute(a.name);});});
 div.querySelectorAll("a").forEach(function(a){var target=a.getAttribute("data-tiddler-title")||"",href=a.getAttribute("href")||"";if(!target&&href.charAt(0)==="#")try{target=decodeURIComponent(href.slice(1));}catch(_){}if(target){a.setAttribute("data-site-tiddler",target);a.removeAttribute("href");}});
 div.querySelectorAll("button,input,textarea,select").forEach(function(n){if(n.closest(".huwabc-score,.huwabc-page-shell,.huwabc-paginated"))n.remove();});
 return div.innerHTML;
}
function siteRuntime(){
 "use strict";
 var DATA=JSON.parse(document.getElementById("publisher-data").textContent),$=function(id){return document.getElementById(id);};
 var nav=$("chapters"),frame=$("score-frame"),article=$("article-view"),button=$("nav-toggle"),currentIndex=-1;
 var pin=$("nav-pin"),focusBtn=$("focus-toggle"),exitBtn=$("focus-exit"),pinned=false,focused=false,controlsVisible=false;
 function wl(da,en){return DATA.lang==="da"?da:en;}
 function setMenu(open){nav.classList.toggle("open",!!open);button.setAttribute("aria-expanded",String(!!open));nav.setAttribute("aria-hidden",String(!open));}
 function syncFocus(){document.body.classList.toggle("husp-focus",focused);document.body.classList.toggle("husp-controls-visible",focused&&controlsVisible);focusBtn.textContent=focused?wl("✕ Afslut fokus","✕ Exit focus"):wl("⛶ Fokus","⛶ Focus");focusBtn.setAttribute("aria-pressed",String(focused));
  if(frame.contentWindow)try{frame.contentWindow.postMessage({type:"husp-set-focus",focus:focused,controls:controlsVisible},"*");}catch(e){}
 }
 function controls(show){controlsVisible=!!show;document.body.classList.toggle("husp-controls-visible",focused&&controlsVisible);
  if(frame.contentWindow)try{frame.contentWindow.postMessage({type:"husp-set-controls",controls:controlsVisible},"*");}catch(e){}
 }
 function focus(value){focused=!!value;if(focused){setMenu(false);if(document.activeElement===focusBtn)focusBtn.blur();}else setMenu(pinned);controls(false);syncFocus();}
 function toggleControls(){if(focused)controls(!controlsVisible);}
 function setPinned(value){pinned=!!value;document.body.classList.toggle("husp-index-pinned",pinned);pin.setAttribute("aria-pressed",String(pinned));pin.textContent=pinned?wl("📌 Frigør","📌 Unpin"):wl("📌 Fastgør","📌 Pin");pin.title=pinned?wl("Frigør indholdslisten","Unpin contents"):wl("Lad indholdslisten forblive synlig","Keep contents visible");setMenu(pinned);}
 frame.addEventListener("load",syncFocus);
 window.addEventListener("message",function(e){if(e.source!==frame.contentWindow||!e.data)return;
  if(e.data.type==="husp-toggle-controls")toggleControls();
  else if(e.data.type==="husp-exit-focus")focus(false);
  else if(e.data.type==="husp-player-ready")syncFocus();
 });
 focusBtn.onclick=function(){focus(!focused);};exitBtn.onclick=function(){focus(false);};pin.onclick=function(){setPinned(!pinned);};
 // Tapping blank article area acts like tapping a blank area of the score.
 // Preserve normal links, interactive elements, and text selection.
 article.addEventListener("click",function(event){
  if(!focused||event.detail>1)return;
  var target=event.target;
  if(target&&typeof target.closest==="function"&&target.closest("a,button,input,textarea,select,summary,label,[role=button],[contenteditable],audio,video"))return;
  var selected=window.getSelection&&window.getSelection();
  if(selected&&String(selected).trim())return;
  toggleControls();
 });
 function name(entry){return entry.label||entry.title;}
 function show(i){
  if(i<0||i>=DATA.entries.length||i===currentIndex)return;
  if(window.HUWikiAniMusSite)window.HUWikiAniMusSite.dispose(article);
  currentIndex=i;var item=DATA.entries[i];
  document.querySelectorAll(".chapter").forEach(function(n,j){n.classList.toggle("selected",j===i);n.setAttribute("aria-current",j===i?"page":"false");});
  if(!pinned||focused)setMenu(false);
  $("current-title").textContent=name(item);
  if(frame.contentWindow)try{frame.contentWindow.postMessage({type:"huwiki-sitepublisher-stop"},"*");}catch(_){}
  if(item.kind==="score"&&DATA.playerTemplate){
   article.hidden=true;frame.hidden=false;
   // The ABC runtime is embedded only once in this HTML file; score data is swapped on navigation.
   var datum=Object.assign({},item.data,{startDesk:DATA.startDesk,siteHeading:DATA.siteTitle,showSiteHeading:false,embedded:false,preview:false});
   var value=JSON.stringify(datum).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
   frame.srcdoc=DATA.playerTemplate.replace("const DATA=__HUW_SITE_DATA__;","const DATA="+value+";");
  }else{
   frame.hidden=true;frame.removeAttribute("srcdoc");article.hidden=false;
   article.innerHTML=(/^\s*<h1(?:\s|>)/i.test(item.html||'')?'':'<h1>'+escapeHtml(name(item))+'</h1>')+'<div class="prose">'+(item.html||"")+'</div>';
   article.querySelectorAll("[data-site-tiddler]").forEach(function(a){var title=a.getAttribute("data-site-tiddler"),j=DATA.entries.findIndex(function(e){return e.title===title;});if(j>=0){a.setAttribute("href","#"+encodeURIComponent(title));a.addEventListener("click",function(e){e.preventDefault();show(j);});}else a.removeAttribute("data-site-tiddler");});
   if(DATA.cutoutRows&&window.HUWikiCutOutSite&&typeof window.HUWikiCutOutSite.hydrate==="function")window.HUWikiCutOutSite.hydrate(article,DATA.cutoutRows);
   if(DATA.cutoutRows&&window.HUWikiAniMusSite)window.HUWikiAniMusSite.hydrate(article,DATA.cutoutRows,DATA.animusConfig||{});
  }
  try{history.replaceState(null,"","#"+encodeURIComponent(item.title));}catch(_){}
 }
 function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
 if(DATA.entries.length===1)document.body.classList.add("single");
 DATA.entries.forEach(function(t,i){var n=document.createElement("button");n.type="button";n.className="chapter";n.textContent=name(t);n.setAttribute("title",(t.kind==="score"?wl("Nodeark: ","Score: "):wl("Artikel: ","Article: "))+name(t));n.onclick=function(){show(i);};nav.appendChild(n);});
 button.onclick=function(){if(pinned&&!focused){setPinned(false);setMenu(true);}else{setMenu(!nav.classList.contains("open"));}};
 document.addEventListener("pointerdown",function(e){if(nav.classList.contains("open")&&(!pinned||focused)&&!nav.contains(e.target)&&!button.contains(e.target)){setMenu(false);}});
 document.addEventListener("keydown",function(e){if(e.key==="Escape"&&focused){focus(false);return;}if(e.key==="Escape"&&nav.classList.contains("open")){if(pinned)setPinned(false);else setMenu(false);}});
 var target="";try{target=decodeURIComponent(location.hash.slice(1));}catch(_){}
 var first=DATA.entries.findIndex(function(t){return t.title===target;});show(first>=0?first:0);
 // Focus starts off, but all settings survive song changes without recreating the parent UI.
 syncFocus();
}

function decoratePlayerTemplate(template){
 var css="body.husp-focus .huwabc-page-shell.huwabc-page-is-desk{inset:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}\nbody.husp-focus .huwabc-page-is-desk .huwabc-page-toolbar{position:absolute!important;top:0;left:0;right:0;z-index:90;background:#f6faf7f5;box-shadow:0 6px 18px #143a3026;flex:none!important}\nbody.husp-focus .huwabc-page-is-desk .huwabc-page-transport{position:absolute!important;bottom:0;left:0;right:0;z-index:90;background:#f5faf5f5;box-shadow:0 -6px 18px #143a3026;flex:none!important}\nbody.husp-focus:not(.husp-controls-visible) .huwabc-page-is-desk .huwabc-page-toolbar,body.husp-focus:not(.husp-controls-visible) .huwabc-page-is-desk .huwabc-page-transport{display:none!important}\nbody.husp-focus .huwabc-page-is-desk .huwabc-page-viewport{flex:1 1 auto!important;min-height:0!important}\nbody.husp-focus .huwabc-page-is-desk .huwabc-pages-track{padding:0!important}\n@media(prefers-reduced-motion:reduce){body.husp-focus .huwabc-page-is-desk .huwabc-page-toolbar,body.husp-focus .huwabc-page-is-desk .huwabc-page-transport{transition:none!important}}\n";
 var script="(function(){\n \"use strict\";\n var focused=false,visible=false;\n function send(type){try{window.parent.postMessage({type:type},\"*\");}catch(e){}}\n function mark(){document.body.classList.toggle(\"husp-focus\",focused);document.body.classList.toggle(\"husp-controls-visible\",focused&&visible);}\n window.addEventListener(\"message\",function(e){\n  if(e.source!==window.parent||!e.data)return;\n  if(e.data.type===\"husp-set-focus\"){\n   focused=!!e.data.focus;visible=!!e.data.controls;mark();\n   requestAnimationFrame(function(){window.dispatchEvent(new Event(\"resize\"));});\n  }else if(e.data.type===\"husp-set-controls\"){\n   visible=!!e.data.controls;mark();\n  }\n });\n // Toggle ONLY after an intentional click on a blank part of a score page.\n // Ignore noteheads, stems, chord symbols, text, and other playable SVG objects.\n function isBlankPageSpot(target){\n  if(!target||typeof target.closest!==\"function\")return false;\n  var page=target.closest(\".huwabc-page\");\n  if(!page||!page.classList.contains(\"huwabc-page-active\"))return false;\n  if(target===page)return true;\n  if(target.classList&&(\n      target.classList.contains(\"huwabc-page-body\")||\n      target.classList.contains(\"huwabc-system-block\")))return true;\n  return String(target.tagName||\"\").toLowerCase()===\"svg\";\n }\n document.addEventListener(\"click\",function(e){\n  if(focused&&isBlankPageSpot(e.target))send(\"husp-toggle-controls\");\n },true);\n document.addEventListener(\"keydown\",function(e){\n  if(!focused||e.key!==\"Escape\")return;\n  e.preventDefault();e.stopImmediatePropagation();send(\"husp-exit-focus\");\n },true);\n send(\"husp-player-ready\");\n})();";;
 var p=template.lastIndexOf("</body>");
 if(p<0)throw new Error("Siteafspilleren mangler </body>.");
 template=template.replace("</head>","<style>"+css+"</style></head>");
 p=template.lastIndexOf("</body>");
 return template.slice(0,p)+"<script>"+script+"</"+"script>"+template.slice(p);
}

// The SitePublisher settings remain unchanged except for one layout selector.
// These are the four OAuthLab designs plus the current Forge standard.
function resolveSiteLayout(choice) {
 var allowed={standard:true,modern:true,retro:true,hupedia:true,vanilla:true};
 if(allowed[choice])return choice;
 var theme=String($tw.wiki.getTiddlerText("$:/theme","")||"");
 if(theme==="$:/themes/huwiki/hupedia")return "hupedia";
 if(theme==="$:/themes/huwiki/retro")return "retro";
 if(theme==="$:/themes/huwiki/modern")return "modern";
 if(theme==="$:/themes/tiddlywiki/vanilla")return "vanilla";
 return "standard";
}
function publicationLayoutCss(layout) {
 if(layout==="standard")return "";
 var title="$:/plugins/huwiki/site-publisher/layouts/"+layout+".css";
 var styles=$tw.wiki.getTiddlerText(title,"");
 if(!styles)throw new Error("SitePublisher layout CSS missing: "+layout);
 return "\n"+styles+"\n";
}
function makeSite(entries,opts){
 if(!entries.length)throw new Error("Vælg mindst én tiddler.");
 var layout=resolveSiteLayout(opts.layout),songs=entries.filter(function(e){return hasAbc(e.title);}),scoreMod=songs.length?siteModule():null,template="";
 if(songs.length&&!scoreMod)throw new Error("ABC-pluginnets siteafspiller er ikke tilgængelig.");
 if(songs.length){
  var first=songs[0].title,t=$tw.wiki.getTiddler(first),source=$tw.modules.execute("$:/plugins/huwiki/abc/loader.js").getSource($tw.wiki,first);
  var full=scoreMod.build($tw.wiki,source,t.fields,first,{siteHeading:opts.title,showSiteHeading:false,startDesk:opts.startDesk,view:"full"});
  var match=full.match(/const DATA=\{[^\n]*?\};/);
  if(!match)throw new Error("Kunne ikke finde ABC-afspillerens data i site-skabelonen.");
  template=decoratePlayerTemplate(full.replace(match[0],"const DATA=__HUW_SITE_DATA__;"));
 }
 var publicationContext={rows:{},used:false,drawings:false,animus:false};
 var awaitingDrawings=[];
 var items=entries.map(function(e){var title=e.title;if(hasAbc(title))return {title:title,label:title,kind:"score",data:scoreMod.data($tw.wiki,title,{siteHeading:opts.title,showSiteHeading:false,startDesk:opts.startDesk})};
  try{return {title:title,label:title,kind:"article",html:embeddedArticle(title,opts.lang||wikiLanguage(),publicationContext)};}
  catch(error){if(error.siteDrawingPending){awaitingDrawings.push(error);return {title:title,label:title,kind:"article",html:""};}throw error;}
 });
 if(awaitingDrawings.length)throw publicationDrawingPending(awaitingDrawings[0].drawingTitle,Promise.all(awaitingDrawings.map(function(item){return item.promise;})));
 var navLabel=items.every(function(x){return x.kind==="score";})?word("Repertoire"):items.every(function(x){return x.kind==="article";})?word("Artikler"):word("Indhold");
 var unit=navLabel===word("Repertoire")?word("numre"):navLabel===word("Artikler")?word("artikler"):word("elementer");
 var animus=animusBundle(publicationContext);
 var payload={animusConfig:animus.config,layout:layout,lang:opts.lang||wikiLanguage(),siteTitle:opts.title||$tw.wiki.getTiddlerText("$:/SiteTitle")||word("Mit TiddlyWiki-site"),showTitle:opts.showTitle!==false,startDesk:opts.startDesk!==false,entries:items,playerTemplate:template,cutoutRows:publicationContext.used?publicationContext.rows:null};
 var json=JSON.stringify(payload).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
 var css=':root{--ink:#173f32;--line:#d9e8df;--sea:#146e5b;--background:#f0f7f2;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--background)}*{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 18px;border-bottom:1px solid var(--line);background:#fff}.hamb{border:1px solid var(--line);border-radius:9px;background:#f8fcf9;padding:8px 12px;font-weight:700;color:var(--sea);cursor:pointer;display:inline-flex;align-items:center;gap:6px}.booktitle{font-size:17px;font-weight:750}.now{color:#6a8276;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.layout{display:block;position:relative}nav{position:fixed;top:calc(64px + 8px);left:12px;z-index:90;width:min(350px,calc(100vw - 24px));height:max-content;max-height:min(72dvh,650px);overflow-y:auto;background:#f9fcf9;border:1px solid var(--line);border-radius:13px;padding:12px 10px;box-shadow:0 15px 34px #0a30202b;transform:translateX(calc(-100% - 30px));opacity:0;visibility:hidden;pointer-events:none;transition:transform .2s ease,opacity .2s ease,visibility .2s}nav.open{transform:translateX(0);opacity:1;visibility:visible;pointer-events:auto}nav h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#648074;padding:0 12px;margin:10px 0 14px}nav button.chapter{width:100%;display:block;text-align:left;border:0;background:transparent;border-radius:9px;padding:11px 12px;font-size:14px;line-height:1.4;color:var(--ink);cursor:pointer}nav button.chapter:hover{background:#e6f3ea}nav button.chapter.selected{background:#d7f0e3;font-weight:750;color:#145946}main{height:calc(100dvh - 64px);min-width:0;overflow:hidden;background:var(--background)}#score-frame{height:100%;width:100%;border:0;background:#fff}#article-view{height:100%;overflow:auto;max-width:1050px;margin:auto;padding:clamp(18px,4vw,42px);background:white}#article-view h1{margin:0 0 22px;font-size:clamp(25px,3vw,36px)}.prose{font-size:16px;line-height:1.7}.prose p{margin:0 0 16px}.prose img,.prose svg{max-width:100%;height:auto}.husp-excerpt{border:1px solid #dce9df;background:#f9fcfa;border-radius:12px;padding:12px;margin:18px 0;overflow:auto}.husp-excerpt figcaption{font-size:12px;color:#4a7162;font-weight:650;margin-bottom:10px}.husp-excerpt svg{display:block;width:100%;max-width:900px!important;height:auto}.husp-excerpt-missing{font-size:13px;color:#9d5b26}.prose table{border-collapse:collapse;max-width:100%}.prose td,.prose th{border:1px solid #dce7df;padding:7px}.prose a{color:#08785e}.empty{margin:30px;color:#61766b}body.single nav,body.single #nav-toggle{display:none!important}@media(max-width:850px){nav{left:8px;top:calc(64px + 6px);width:min(320px,calc(100vw - 16px));max-height:min(72dvh,600px)}.booktitle{font-size:15px}.now{font-size:12px}}body.husp-index-pinned:not(.husp-focus) .layout{padding-left:min(270px,38vw)}body.husp-index-pinned:not(.husp-focus) nav{left:8px;top:calc(64px + 8px);width:calc(min(270px,38vw) - 16px);transform:none;opacity:1;visibility:visible;pointer-events:auto;box-shadow:none}nav .nav-head{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:0 8px}nav .nav-head h2{margin:8px 0}#nav-pin{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 8px;color:var(--sea);font-size:11px;cursor:pointer;white-space:nowrap}#nav-pin[aria-pressed=true]{background:#d7f0e3;border-color:#9bcab3}.top #focus-toggle{margin-left:auto;border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;color:var(--sea);font-weight:700;cursor:pointer;white-space:nowrap}body.husp-focus main{height:100dvh}body.husp-focus .layout{padding-left:0!important}body.husp-focus .top{position:fixed;z-index:100;top:0;left:0;right:0;background:#fffffff0;min-height:52px;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease,visibility .18s}body.husp-focus.husp-controls-visible .top,body.husp-focus .top:focus-within{opacity:1;visibility:visible;pointer-events:auto;transform:none}body.husp-focus nav{top:58px!important;left:8px!important;width:min(350px,calc(100vw - 16px))!important;transform:translateX(calc(-100% - 30px))!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;box-shadow:0 15px 34px #0a30202b}body.husp-focus nav.open{transform:translateX(0)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}body.husp-focus #article-view{max-width:none;min-height:100dvh}body.single #nav-pin{display:none}body.single #nav-toggle{display:none!important}.husp-focus-exit{display:none;position:fixed;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:120;min-height:46px;min-width:46px;padding:9px 14px;border:1px solid #abcbbd;border-radius:999px;background:#ffffffed;color:#175b47;box-shadow:0 3px 14px #102e2440;font:700 14px/1.3 system-ui,sans-serif;cursor:pointer;touch-action:manipulation;opacity:.88}body.husp-focus .husp-focus-exit{display:inline-flex;align-items:center;justify-content:center}body.husp-focus.husp-controls-visible .husp-focus-exit{display:none}.husp-focus-exit:focus-visible{outline:3px solid #1e9371;outline-offset:3px}@media(pointer:coarse){.husp-focus-exit{min-height:48px;padding:12px 16px}}@media(prefers-reduced-motion:reduce){nav,.top{transition:none!important}}';
 css+="\n"+animus.css+"\n";
 css+=publicationComponentsCss(entries);
 if(publicationContext.drawings){
  var drawingCss=$tw.wiki.getTiddlerText("$:/plugins/huwiki/site-publisher/drawings/view.css","");
  if(!drawingCss)throw publicationMediaError("Excalidraw","SVG display stylesheet is missing.");
  css+="\n"+drawingCss+"\n";
 }
 css+=publicationLayoutCss(layout);
 var cutoutScript="";
 if(publicationContext.used){
  var cutoutCss=$tw.wiki.getTiddlerText(PUBLISHER_CUTOUT_BASE+"viewer.css","");
  cutoutScript=$tw.wiki.getTiddlerText(PUBLISHER_CUTOUT_BASE+"viewer.js","");
  if(!cutoutCss||!cutoutScript)throw publicationMediaError("CutOut","den selvstændige læser mangler / read-only viewer bundle is missing.");
  css+="\n"+cutoutCss+"\n";
 }
 var html='<!doctype html><html lang="'+payload.lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>'+safe(payload.siteTitle)+'</title><style>'+css+'</style></head><body class="husp-layout-'+safe(layout)+'"><header class="top"><button id="nav-toggle" class="hamb" type="button" aria-expanded="false" aria-controls="chapters">☰ '+safe(navLabel)+'</button><strong class="booktitle" '+(payload.showTitle?'':'hidden')+'>'+safe(payload.siteTitle)+'</strong><span class="now" id="current-title"></span><button type="button" id="focus-toggle" aria-pressed="false" title="'+safe(word("Fokus: Tryk på et tomt område af nodearket for at vise/skjule betjeningen"))+'">'+safe(word("⛶ Fokus"))+'</button></header><button id="focus-exit" class="husp-focus-exit" type="button" title="'+safe(word("✕ Afslut fokus"))+'" aria-label="'+safe(word("✕ Afslut fokus"))+'">'+safe(word("✕ Afslut fokus"))+'</button><div class="layout"><nav id="chapters" aria-label="'+safe(navLabel)+'" aria-hidden="true"><div class="nav-head"><h2>'+safe(word("Indhold"))+' · '+items.length+' '+safe(unit)+'</h2><button id="nav-pin" type="button" aria-pressed="false" title="'+safe(word("Lad indholdslisten forblive synlig"))+'">'+safe(word("📌 Fastgør"))+'</button></div></nav><main><iframe id="score-frame" title="'+safe(word("Interaktiv nodevisning"))+'" allow="autoplay" sandbox="allow-scripts" hidden></iframe><section id="article-view" hidden></section></main></div><script id="publisher-data" type="application/json">'+json+'</script>'+(cutoutScript?'<script data-huwiki-cutout-reader="1">'+cutoutScript.replace(/<\/script/gi,'<\\/script')+'</script>':'')+(animus.script?'<script type="text/plain" data-huwiki-animus-license="1">'+String(animus.license||'').replace(/<\/script/gi,'<\\/script')+'</script><script data-huwiki-animus-reader="1">'+animus.script.replace(/<\/script/gi,'<\\/script')+'</script>':'')+'<script>('+siteRuntime.toString()+')();</script></body></html>';
 return html;
}
function siteFileName(name) {
 var filename=String(name||"HUWiki-Site").replace(/[\\/:*?"<>|]+/g,"-").trim().slice(0,90)||"HUWiki-Site";
 return filename+(filename.toLowerCase().endsWith(".html")?"":".html");
}
function downloadHtml(html,name) {
 var filename=siteFileName(name),blob=new Blob([html],{type:"text/html;charset=utf-8"});
 var url=URL.createObjectURL(blob),link=el("a");
 link.href=url;link.download=filename;link.style.display="none";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(function(){URL.revokeObjectURL(url);},60000);
}
function shareFile(html,name) {
 var filename=siteFileName(name);
 return new File([html],filename,{type:"text/html;charset=utf-8"});
}
function canShareHtml(html,name) {
 if(typeof navigator.share!=="function" || typeof File!=="function")return false;
 try {
  var file=shareFile(html,name);
  return typeof navigator.canShare!=="function"||navigator.canShare({files:[file]});
 } catch (_) { return false; }
}
function shareHtml(html,name) {
 if(!canShareHtml(html,name))return Promise.reject(new Error("Native HTML sharing is unavailable"));
 var file=shareFile(html,name);
 // Keep navigator.share synchronous with the click: browsers require user activation.
 try { return Promise.resolve(navigator.share({files:[file],title:file.name})); }
 catch(err){return Promise.reject(err);}
}
function openPublisher(title){
 if(current){current.close();}
 var lang=wikiLanguage(),chosenTitle=title&&$tw.wiki.getTiddler(title)?title:"",overlay=el("div","husp-overlay"),panel=el("div","husp-panel"),head=el("header","husp-head"),body=el("div","husp-body"),top=el("div","husp-fields"),row=el("div","husp-arrange"),toolbar=el("div","husp-tools"),preview=el("iframe","husp-preview"),status=el("p","husp-status"),config=el("div","husp-config"),overview=el("div","husp-overview"),previewSwitch=el("div","husp-preview-switch"),settingsBtn=el("button",null,word("⚙ Indstillinger")),overviewBtn=el("button",null,word("Overblik")),siteBtn=el("button",null,word("Sitevisning")),entries=[],exported=null,source="single",active=false,initialized=false,revision=0,pending=false,refreshTimer=null,previewMode="overview";
 overlay.appendChild(panel);panel.appendChild(head);panel.appendChild(body);
 head.appendChild(el("strong",null,"HUWiki SitePublisher"));head.appendChild(el("span",null,word("Én HTML-fil · lokale sites")));var closeBtn=el("button",null,word("✕ Luk"));head.appendChild(settingsBtn);head.appendChild(closeBtn);settingsBtn.setAttribute("aria-expanded","false");config.hidden=true;settingsBtn.onclick=function(){config.hidden=!config.hidden;settingsBtn.setAttribute("aria-expanded",String(!config.hidden));settingsBtn.textContent=config.hidden?word("⚙ Indstillinger"):word("✕ Skjul indstillinger");};
 function label(text,control){var l=el("label","husp-field");l.appendChild(el("span",null,text));l.appendChild(control);return l;}
 function option(select,value,text){var o=el("option",null,text);o.value=value;select.appendChild(o);}
 var sourceSelect=el("select"),tagSelect=el("select"),listInput=el("input"),listHints=el("datalist"),pubTitle=el("input"),showTitle=el("input"),deskSelect=el("select"),layoutSelect=el("select");
 listInput.type="text";listInput.placeholder=word("Vælg tiddler med liste");listHints.id="huw-sitepublisher-lists";listInput.setAttribute("list",listHints.id);body.appendChild(listHints);
 pubTitle.type="text";pubTitle.maxLength=180;pubTitle.value=$tw.wiki.getTiddlerText("$:/SiteTitle")||word("Mit TiddlyWiki-site");showTitle.type="checkbox";showTitle.checked=true;
 option(sourceSelect,"single",word("Denne tiddler"));option(sourceSelect,"tag",word("Alle med tag"));option(sourceSelect,"list",word("Liste i en tiddler"));option(sourceSelect,"story",word("Åbne tiddlere (StoryList)"));
 option(layoutSelect,"auto",word("Automatisk (følg wikiens tema)"));
 option(layoutSelect,"standard",word("Standard (nuværende)"));
 option(layoutSelect,"modern","Modern");
 option(layoutSelect,"retro","Retro");
 option(layoutSelect,"vanilla",word("Vanilla (klassisk)"));
 option(layoutSelect,"hupedia",word("HUPedia (leksikon)"));
 layoutSelect.value="auto";
 option(deskSelect,"desk",word("Nodepult · start her"));option(deskSelect,"normal",word("Normal nodevisning"));
 listOfTags().forEach(function(t){option(tagSelect,t,t);});
 allOrdinary().forEach(function(t){option(listHints,t,t);});
 if(tagSelect.querySelector('option[value="Nordisk folkemusik"]'))tagSelect.value="Nordisk folkemusik";
 top.appendChild(label(word("Sitelayout"),layoutSelect));top.appendChild(label(word("Indhold"),sourceSelect));top.appendChild(label(word("Vælg tag"),tagSelect));top.appendChild(label(word("Vælg liste"),listInput));top.appendChild(label(word("Siteoverskrift"),pubTitle));top.appendChild(label(word("Startvisning"),deskSelect));
 var showLabel=el("label","husp-check");showLabel.appendChild(showTitle);showLabel.appendChild(document.createTextNode(word("Vis siteoverskrift")));top.appendChild(showLabel);config.appendChild(top);body.appendChild(config);
 var selectionHeader=el("div","husp-selection-title");selectionHeader.appendChild(el("strong",null,word("Valgt til sitet")));var saveOrder=el("button",null,word("Gem rækkefølge i list-felt"));selectionHeader.appendChild(saveOrder);config.appendChild(selectionHeader);config.appendChild(row);
 var renderBtn=el("button","husp-primary",word("Opdater forhåndsvisning")),exportBtn=el("button",null,word("Hent HTML")),shareBtn=el("button",null,word("Del HTML"));exportBtn.disabled=true;shareBtn.disabled=true;shareBtn.hidden=!(navigator.share&&typeof File==="function");toolbar.appendChild(renderBtn);toolbar.appendChild(exportBtn);toolbar.appendChild(shareBtn);toolbar.appendChild(status);body.appendChild(toolbar);previewSwitch.appendChild(overviewBtn);previewSwitch.appendChild(siteBtn);body.appendChild(previewSwitch);body.appendChild(overview);body.appendChild(preview);
 var css='.husp-overlay{position:fixed;z-index:39000;inset:0;background:#143629aa;display:flex;align-items:center;justify-content:center;padding:12px;font:14px/1.5 system-ui;color:#1b493b}.husp-panel{background:#fff;display:flex;flex-direction:column;width:min(1330px,99vw);height:96dvh;overflow:hidden;border-radius:15px;box-shadow:0 28px 70px #09251a55}.husp-head{display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid #d9e8df}.husp-head strong{font-size:18px}.husp-head span{font-size:12px;color:#628374}.husp-head button{margin-left:auto}.husp-panel button,.husp-panel select,.husp-panel input{font:inherit;border:1px solid #bfd4c7;border-radius:8px;padding:7px 9px;color:#164e3a;background:#fff}.husp-panel button{cursor:pointer}.husp-panel button:disabled{opacity:.55;cursor:default}.husp-panel .husp-primary{background:#176d5c;color:#fff;border-color:#176d5c}.husp-body{overflow:auto;display:flex;flex-direction:column;padding:13px 18px;gap:10px;flex:1}.husp-fields{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}.husp-field{font-size:12px;font-weight:650;display:flex;flex-direction:column;gap:3px}.husp-field select,.husp-field input{min-width:145px;max-width:270px}.husp-field input{width:180px}.husp-check{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600}.husp-check input{width:16px;height:16px}.husp-selection-title{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.husp-selection-title button{font-size:12px}.husp-arrange{max-height:255px;overflow:auto;border:1px solid #e0eae4;border-radius:10px;padding:5px;background:#f6faf7}.husp-item{display:flex;align-items:center;gap:8px;padding:6px 7px;border:1px solid #e3eee7;border-radius:7px;background:#fff;margin-bottom:3px}.husp-item .title{flex:1;min-width:0;overflow-wrap:anywhere}.husp-item small{color:#5d8173}.husp-item button{padding:3px 8px}.husp-item input{width:16px;height:16px}.husp-tools{display:flex;flex-wrap:wrap;align-items:center;gap:9px}.husp-status{font-size:12px;color:#517766;flex:1;margin:0}.husp-preview{flex:1;min-height:300px;border:1px solid #d9e8df;border-radius:10px;background:#eef5ee;width:100%}@media(max-width:650px){.husp-panel{height:98dvh}.husp-head{padding:8px 12px}.husp-head span{display:none}.husp-body{padding:8px}.husp-fields{gap:6px}.husp-field{flex:1 1 130px}.husp-field select,.husp-field input{min-width:0;max-width:100%;width:100%}.husp-arrange{max-height:230px}.husp-preview{min-height:200px}}';
 css+='.husp-config[hidden],.husp-overview[hidden],.husp-preview[hidden]{display:none!important}.husp-config{max-height:38dvh;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:8px;border:1px solid #e2ebe5;border-radius:10px;background:#f9fcfa}.husp-preview-switch{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.husp-preview-switch button[aria-pressed=true]{background:#176d5c;color:white;border-color:#176d5c}.husp-overview{flex:1;min-height:300px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;align-content:start;padding:8px}.husp-overview-card{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-height:164px;padding:17px!important;text-align:left;white-space:normal;background:#fff!important;border:1px solid #d4e5db!important;border-radius:10px!important;box-shadow:0 2px 9px #142d2111}.husp-overview-card strong{font-size:17px}.husp-overview-card small{color:#557b6a}.husp-overview-card p{font:13px/1.5 system-ui;margin:0;color:#53665b;overflow-wrap:anywhere}.husp-overview-card:hover{border-color:#237d68!important;background:#f3faf5!important}.husp-preview{flex:1;min-height:330px}.husp-head button{flex:none}.husp-head button:not(:last-child){margin-left:auto}.husp-head button:last-child{margin-left:0}@media(max-width:650px){.husp-config{max-height:55dvh}.husp-overview{grid-template-columns:repeat(auto-fill,minmax(155px,1fr));min-height:230px}.husp-overview-card{min-height:140px;padding:11px!important}}';
 var style=el("style");style.textContent=css;overlay.appendChild(style);document.body.appendChild(overlay);
 function tell(text,error){status.textContent=text;status.style.color=error?"#b32626":"#517766";}
 function setPreviewMode(mode){previewMode=mode;overview.hidden=mode!=="overview";preview.hidden=mode!=="site";overviewBtn.setAttribute("aria-pressed",String(mode==="overview"));siteBtn.setAttribute("aria-pressed",String(mode==="site"));}
 function renderOverview(selected){overview.replaceChildren();selected.forEach(function(e,i){var card=el("button","husp-overview-card"),heading=el("strong",null,e.title),kind=hasAbc(e.title)?word("♫ Nodeark"):word("Artikel"),hint=el("small",null,kind+" · "+(i+1)+" / "+selected.length),info=el("p");var t=articleSource(e.title,lang);info.textContent=kind===word("Artikel")?t.replace(/\[\[|\]\]|''|!!+|<[^>]*>|\$:[^\s]+/g," ").replace(/\s+/g," ").trim().slice(0,190):word("Åbn nodearket i sitevisning for at teste noder og lyd.");card.type="button";card.append(heading,hint,info);card.onclick=function(){setPreviewMode("site");function jump(){try{var win=preview.contentWindow,btn=win&&win.document.querySelectorAll("#chapters .chapter")[i];if(btn){btn.click();return true;}}catch(ignore){}return false;}if(!jump())preview.addEventListener("load",jump,{once:true});};overview.appendChild(card);});}
 overviewBtn.onclick=function(){setPreviewMode("overview");};siteBtn.onclick=function(){setPreviewMode("site");};setPreviewMode("overview");
 function invalid(){revision++;exported=null;exportBtn.disabled=true;shareBtn.disabled=true;tell(word("Ændringerne opdateres automatisk …"));if(initialized){clearTimeout(refreshTimer);refreshTimer=setTimeout(prepare,450);}}
 function rowRender(){row.textContent="";if(!entries.length){row.appendChild(el("p",null,word("Ingen tiddlere fundet. Vælg et andet tag eller en liste.")));return;}entries.forEach(function(item,i){var r=el("div","husp-item"),chk=el("input"),name=el("span","title",item.title),type=el("small",null,hasAbc(item.title)?word("♫ Noder"):word("Artikel")),up=el("button",null,"↑"),dn=el("button",null,"↓");chk.type="checkbox";chk.checked=item.checked;chk.onchange=function(){item.checked=chk.checked;invalid();};r.appendChild(chk);r.appendChild(name);r.appendChild(type);r.appendChild(up);r.appendChild(dn);up.disabled=i===0;dn.disabled=i===entries.length-1;up.onclick=function(){if(i>0){var a=entries.splice(i,1)[0];entries.splice(i-1,0,a);rowRender();invalid();}};dn.onclick=function(){if(i<entries.length-1){var a=entries.splice(i,1)[0];entries.splice(i+1,0,a);rowRender();invalid();}};r.draggable=true;r.ondragstart=function(e){e.dataTransfer.setData("text/plain",String(i));};r.ondragover=function(e){e.preventDefault();};r.ondrop=function(e){e.preventDefault();var j=Number(e.dataTransfer.getData("text/plain"));if(Number.isInteger(j)&&j!==i&&j>=0&&j<entries.length){var a=entries.splice(j,1)[0];entries.splice(i,0,a);rowRender();invalid();}};row.appendChild(r);});deskSelect.parentElement.hidden=!entries.some(function(e){return e.checked&&hasAbc(e.title);});}
 function setSource(next){source=next;tagSelect.parentElement.hidden=source!=="tag";listInput.parentElement.hidden=source!=="list";saveOrder.hidden=!(source==="tag"||source==="list");var names=source==="single"?(chosenTitle?[chosenTitle]:[]):source==="tag"?tagList(tagSelect.value):source==="list"?sourceList(listInput.value.trim()):storyList();entries=names.map(function(name){return {title:name,checked:true};});rowRender();invalid();}
 function prepare(){var selected=entries.filter(function(e){return e.checked;});if(!selected.length){tell(word("Vælg mindst én tiddler."),true);return;}if(active){pending=true;return;}active=true;renderBtn.disabled=true;var builtRevision=revision;tell(word("Bygger site og kontrollerer indhold …"));setTimeout(function(){try{var candidate=makeSite(selected,{title:pubTitle.value.trim()||$tw.wiki.getTiddlerText("$:/SiteTitle")||word("Mit TiddlyWiki-site"),showTitle:showTitle.checked,startDesk:deskSelect.value==="desk",lang:lang,layout:layoutSelect.value});if(builtRevision===revision){exported=candidate;preview.srcdoc=exported;renderOverview(selected);if(selected.length===1)setPreviewMode("site");else if(previewMode!=="site")setPreviewMode("overview");exportBtn.disabled=false;shareBtn.hidden=!canShareHtml(exported,pubTitle.value.trim()||"HUWiki-Site");shareBtn.disabled=shareBtn.hidden;tell(word("Forhåndsvisning klar")+" · "+selected.length+" "+word("tiddlere")+" · "+Math.round(exported.length/1024)+" KB. "+word("Eksportér som én HTML-fil."));}else pending=true;}catch(err){exported=null;exportBtn.disabled=true;shareBtn.disabled=true;
  if(err.siteDrawingPending&&err.promise){
   tell(err.message);
   err.promise.then(function(){if(builtRevision!==revision||!overlay.isConnected)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(prepare,60);},
    function(error){if(builtRevision===revision&&overlay.isConnected)tell("SitePublisher: "+String(error&&error.message||error),true);});
  }else tell("SitePublisher: "+err.message,true);
 }finally{active=false;renderBtn.disabled=false;if(pending){pending=false;clearTimeout(refreshTimer);refreshTimer=setTimeout(prepare,80);}}},30);}
 function close(){clearTimeout(refreshTimer);overlay.remove();document.removeEventListener("keydown",keydown,true);if(current&&current.close===close)current=null;}
 function keydown(e){if(e.key==="Escape"&&e.target===document.body){e.preventDefault();close();}}
 closeBtn.onclick=close;renderBtn.onclick=prepare;exportBtn.onclick=function(){if(!exported)return;try{downloadHtml(exported,pubTitle.value.trim()||"HUWiki-Site");tell(word("HTML-download startet."));}catch(err){tell(word("HTML-filen kunne ikke hentes: ")+(err.message||err),true);}};shareBtn.onclick=function(){
 if(!exported)return;
 var html=exported,name=pubTitle.value.trim()||"HUWiki-Site";
 if(!canShareHtml(html,name)){
  // Validation happens on the direct user click, so download keeps user activation.
  try {downloadHtml(html,name);tell(word("Deling er ikke tilgængelig her. HTML-download er startet."));}
  catch(err){tell(word("HTML-filen kunne ikke hentes: ")+(err.message||err),true);}
  return;
 }
 shareHtml(html,name).catch(function(err){
  if(err&&err.name==="AbortError")return;
  // A browser can reject a share even after canShare returned true.
  // Offer a direct download rather than leaving the user with a dead end.
  try {
   downloadHtml(html,name);
   tell(word("Systemdelingen blev afvist. HTML-download er forsøgt i stedet. Brug Hent HTML, hvis filen ikke vises."));
  }catch(downloadErr){
   tell(word("Deling og download mislykkedes: ")+(downloadErr.message||downloadErr),true);
  }
 });
};
 sourceSelect.onchange=function(){setSource(sourceSelect.value);};tagSelect.onchange=function(){setSource(source);};listInput.onchange=function(){setSource(source);};pubTitle.oninput=invalid;showTitle.onchange=invalid;deskSelect.onchange=invalid;layoutSelect.onchange=invalid;
 saveOrder.onclick=function(){var target=source==="tag"?tagSelect.value:listInput.value.trim();if(!target){tell(word("Vælg et tag eller en tiddler med liste."),true);return;}if(!confirm(word("Gem tiddlernes rækkefølge i list-feltet for «") +target+word("»?\nDette ændrer ikke selve tiddlernes indhold.")))return;try{var old=$tw.wiki.getTiddler(target),values=entries.map(function(e){return e.title;});$tw.wiki.addTiddler(new $tw.Tiddler(old||{title:target},{title:target,list:values,modified:$tw.utils.stringifyDate(new Date())}));tell(word("Rækkefølgen er gemt i list-feltet for «")+target+word("». Eksporten har fortsat sit eget udvalg."));}catch(err){tell(word("Kunne ikke gemme list-feltet: ")+err.message,true);}};
 document.addEventListener("keydown",keydown,true);current={close:close};
 if(chosenTitle){sourceSelect.value="single";setSource("single");}else{sourceSelect.value="tag";setSource("tag");}
 initialized=true;if(entries.length)prepare();
}
exports.startup=function(){
 $tw.rootWidget.addEventListener("tm-huwiki-sitepublisher",function(event){try{openPublisher(event.param||event.paramObject&&event.paramObject.title||event.tiddlerTitle);}catch(error){console.error("SitePublisher:",error);alert("SitePublisher: "+(error.message||error));}return false;});
};
})();

