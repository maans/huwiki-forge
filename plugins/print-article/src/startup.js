/*\
title: $:/plugins/huwiki/print-article/startup.js
type: application/javascript
module-type: startup
\*/
(function() {
"use strict";
exports.name = "huwiki-print-article";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;
var active = null;
function isAppleTouch() {
 var ua = String(navigator.userAgent || "");
 return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(navigator.maxTouchPoints) > 1);
}
function language() {
 var t = $tw.wiki.getTiddlerText("$:/language", "");
 if (/\b(da|dansk)\b|da[-_]/i.test(t)) return "da";
 if (/\b(en|english)\b|en[-_]/i.test(t)) return "en";
 return /^da\b/i.test(document.documentElement.lang || navigator.language || "") ? "da" : "en";
}
var strings = {
 da: {
  print: "Udskriv artikel", close: "Tilbage til wikien", share: "Del / udskriv PDF",
  save: "Gem PDF", working: "Forbereder PDF …", ready: "PDF klar. Vælg Del / udskriv PDF og derefter Udskriv eller Gem i Arkiver.",
  readyDesktop: "PDF klar. Vælg Gem PDF.", unsupported: "PDF'en er klar, men Quine kan ikke dele den. Prøv Safari.",
  missing: "Kunne ikke finde denne tiddler i den åbne visning.", failure: "PDF kunne ikke dannes: ", shareFailure: "Deling mislykkedes: ",
  noContent: "Tiddleren har intet synligt indhold til udskrift."
 },
 en: {
  print: "Print article", close: "Back to wiki", share: "Share / print PDF", save: "Save PDF",
  working: "Preparing PDF …", ready: "PDF ready. Choose Share / print PDF, then Print or Save to Files.",
  readyDesktop: "PDF ready. Choose Save PDF.", unsupported: "PDF created, but app cannot share it. Try Safari.",
  missing: "Could not find this tiddler in the open story.", failure: "Could not create PDF: ", shareFailure: "Sharing failed: ",
  noContent: "The tiddler has no visible content to print."
 }
};
function E(name,cls,text) { var n=document.createElement(name); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
function bytes(b64) { var a=atob(b64), result=new Uint8Array(a.length); for(var i=0;i<a.length;i++)result[i]=a.charCodeAt(i); return result; }
function pdfFromJpegs(images,links) {
 // All pages use A4 and each image is placed edge to edge. Link annotations
 // refer to page objects rather than external/blob URLs: they work offline.
 links=links||[];
 var enc=new TextEncoder(),chunks=[],position=0,offsets=[0];
 function put(v){var b=typeof v==="string"?enc.encode(v):v;chunks.push(b);position+=b.byteLength;}
 function begin(n){offsets[n]=position;put(n+" 0 obj\n");}
 function end(){put("\nendobj\n");}
 var nImages=images.length,linkStart=4+3*nImages,byPage={};
 links.forEach(function(link,i){(byPage[link.fromPage]||(byPage[link.fromPage]=[])).push(linkStart+i);});
 put("%PDF-1.4\n%\x80\x81\x82\x83\n");
 begin(1);put("<< /Type /Catalog /Pages 2 0 R >>");end();
 begin(2);put("<< /Type /Pages /Kids ["+images.map(function(_,i){return(4+3*i)+" 0 R";}).join(" ")+"] /Count "+nImages+" >>");end();
 begin(3);put("<< /Producer (HUWiki Publisher) /Creator (TiddlyWiki) >>");end();
 var width=210*72/25.4,height=297*72/25.4;
 images.forEach(function(im,i){
  var p=4+i*3,s=p+1,j=p+2,annots=(byPage[i]||[]);
  if(im.blank) {
   // A real, fully blank PDF page. No page number or image is printed,
   // but it counts for folio parity and PDF link targets.
   begin(p);put("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+width.toFixed(4)+" "+height.toFixed(4)+"] /Contents "+s+" 0 R >>");end();
   begin(s);put("<< /Length 0 >>\nstream\nendstream");end();
   begin(j);put("<< >>");end();
   return;
  }
  begin(p);put("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+width.toFixed(4)+" "+height.toFixed(4)+"] /Resources << /XObject << /Im0 "+j+" 0 R >> >> /Contents "+s+" 0 R"+(annots.length?" /Annots ["+annots.map(function(id){return id+" 0 R";}).join(" ")+"]":"")+" >>");end();
  var command="q "+width.toFixed(4)+" 0 0 "+height.toFixed(4)+" 0 0 cm /Im0 Do Q\n";
  begin(s);put("<< /Length "+enc.encode(command).length+" >>\nstream\n"+command+"endstream");end();
  begin(j);put("<< /Type /XObject /Subtype /Image /Width "+im.width+" /Height "+im.height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+im.data.byteLength+" >>\nstream\n");put(im.data);put("\nendstream");end();
 });
 links.forEach(function(link,i){
  var target=4+3*link.targetPage,r=link.rect.map(function(n){return Number(n).toFixed(2);});
  begin(linkStart+i);put("<< /Type /Annot /Subtype /Link /Rect ["+r.join(" ")+"] /Border [0 0 0] /A << /S /GoTo /D ["+target+" 0 R /XYZ 0 "+height.toFixed(4)+" 0] >> >>");end();
 });
 var last=linkStart+links.length-1,xref=position;
 put("xref\n0 "+(last+1)+"\n0000000000 65535 f \n");
 for(var j=1;j<=last;j++)put(String(offsets[j]).padStart(10,"0")+" 00000 n \n");
 put("trailer\n<< /Size "+(last+1)+" /Root 1 0 R /Info 3 0 R >>\nstartxref\n"+xref+"\n%%EOF");
 return new Blob(chunks,{type:"application/pdf"});
}
function isVisible(el){var cs=getComputedStyle(el);return cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity)!==0;}
function safeName(title){return String(title||"Tiddler").replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").slice(0,90).trim()+".pdf";}
function rectInfo(el,rootRect) {var r=el.getBoundingClientRect(); return {x:r.left-rootRect.left,y:r.top-rootRect.top,w:r.width,h:r.height};}
function intersects(r,from,to){return r.y+r.h>=from && r.y<=to;}
function color(value) {return value&&value!=="transparent"&&value!=="rgba(0, 0, 0, 0)" ? value : null;}
function rangesToText(root,baseRect) {
 var list=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),node;
 while((node=walker.nextNode())){
  if(!node.nodeValue || !node.nodeValue.trim())continue;
  var parent=node.parentElement;if(!parent || !isVisible(parent) || parent.closest("svg,script,style,button,input,select,textarea,.huprint-noexport"))continue;
  var style=getComputedStyle(parent),size=parseFloat(style.fontSize)||16,fill=color(style.color)||"#222";
  var str=node.nodeValue,re=/\S+/g, match, count=0;
  while((match=re.exec(str))){
   var range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
   var rects=range.getClientRects();
   // A long token may wrap across lines. Drawing the full token in each
   // fragment would shrink and duplicate its text; render each character
   // at the actual DOM range position in that case.
   var parts=[];
   if(rects.length===1){parts.push({word:match[0],rect:rects[0]});}
   else {
    for(var letter=match.index;letter<match.index+match[0].length;letter++){
     var cr=document.createRange();cr.setStart(node,letter);cr.setEnd(node,letter+1);
     var rr=cr.getBoundingClientRect();
     if(rr.width&&rr.height)parts.push({word:str.charAt(letter),rect:rr});
    }
   }
   for(var q=0;q<parts.length;q++){
    var r=parts[q].rect;if(!r.width||!r.height)continue;
    list.push({type:"text",word:parts[q].word,x:r.left-baseRect.left,y:r.top-baseRect.top,w:r.width,h:r.height,font:style.font||((style.fontWeight||"400")+" "+size+"px "+(style.fontFamily||"sans-serif")),size:size,fill:fill});
   }
   if(++count>30000)break;
  }
 }
 return list;
}
async function loadSvg(el){
 var r=el.getBoundingClientRect();if(r.width<4||r.height<4)return null;
 var svg=el.cloneNode(true),width=Math.max(1,Math.round(r.width)),height=Math.max(1,Math.round(r.height));
 svg.setAttribute("xmlns","http://www.w3.org/2000/svg");svg.setAttribute("width",String(width));svg.setAttribute("height",String(height));
 if(!svg.getAttribute("viewBox")) svg.setAttribute("viewBox","0 0 "+width+" "+height);
 var style=document.createElementNS("http://www.w3.org/2000/svg","style");
 style.textContent="text,tspan{fill:#20252b} svg{overflow:visible} ";svg.insertBefore(style,svg.firstChild);
 var xml=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml;charset=utf-8"}));
 return await new Promise(function(resolve){
  var image=new Image(),settled=false;
  function end(ok){if(settled)return;settled=true;URL.revokeObjectURL(url);resolve(ok?image:null);}
  image.onload=function(){end(true);};image.onerror=function(){end(false);};
  image.src=url;
 });
}
async function commandsFor(root) {
 var baseRect=root.getBoundingClientRect(),items=[],backgrounds=[],lines=[],nodes=root.querySelectorAll("*");
 Array.prototype.forEach.call(nodes,function(el){
  if(!isVisible(el)||el.closest(".huprint-noexport"))return;
  var style=getComputedStyle(el),c=color(style.backgroundColor),r=rectInfo(el,baseRect);
  if(c&&c!=="rgb(255, 255, 255)"){
   if(r.w&&r.h && r.h<5000 && r.w<2000)backgrounds.push({type:"background",x:r.x,y:r.y,w:r.w,h:r.h,fill:c});
  }
  // Simple table cell and horizontal-rule strokes. They are drawn under text.
  if(/^(TD|TH|HR)$/.test(el.tagName)&&r.w&&r.h){
   var borderColor=color(style.borderTopColor)||"#bbc1c8";
   var borderWidth=parseFloat(style.borderTopWidth)||0;
   if(el.tagName==="HR"||borderWidth>0)lines.push({type:"line",x:r.x,y:r.y,w:r.w,h:r.h,fill:borderColor,weight:Math.max(1,borderWidth)});
  }
  if(el.tagName==="LI" && r.h>0){
   var listStyle=style.listStyleType||"";
   if(listStyle==="disc"||listStyle==="circle"||listStyle==="square"){
    lines.push({type:"bullet",x:r.x-13,y:r.y+Math.min(10,r.h*.45),fill:color(style.color)||"#222"});
   }
  }
 });
 items=backgrounds.concat(lines,rangesToText(root,baseRect));
 var illustrations=root.querySelectorAll("svg,img");
 for(var i=0;i<illustrations.length;i++){
  var el=illustrations[i];if(!isVisible(el)||el.closest(".huprint-noexport"))continue;
  var r=rectInfo(el,baseRect);if(r.w<12||r.h<12)continue;
  var im=null;
  if(el.localName==="svg")im=await loadSvg(el);
  else if(el.complete&&el.naturalWidth&&(/^(data:|blob:)/i.test(el.src)||new URL(el.src,location.href).origin===location.origin))im=el;
  if(im)items.push({type:"image",x:r.x,y:r.y,w:r.w,h:r.h,image:im});
 }
 return items;
}
function pageBreaks(root,height,pageHeight){
 var out=[0],start=0,blocks=root.querySelectorAll("p,blockquote,pre,li,table,tr,h1,h2,h3,h4,h5,h6,svg,.huwabc-system-block,.huwabc-page,.huwabc-score-system");
 var br=root.getBoundingClientRect(),positions=[];
 Array.prototype.forEach.call(blocks,function(el){if(!isVisible(el))return;var r=el.getBoundingClientRect();if(r.height>0&&r.height<pageHeight*.92)positions.push({start:r.top-br.top,end:r.bottom-br.top,height:r.height});});
 while(start+pageHeight<height-5){
  var natural=start+pageHeight,cut=natural;
  // Prefer the last complete block near the page edge. Never split a
  // line merely because the canvas page has ended.
  var finished=positions.filter(function(x){return x.end>start+pageHeight*.65&&x.end<natural-20;});
  if(finished.length)cut=Math.max.apply(null,finished.map(function(x){return x.end+7;}));
  else {
   var crossing=positions.filter(function(x){return x.start<natural-5&&x.end>natural-5&&x.start>start+pageHeight*.60;});
   if(crossing.length)cut=Math.min.apply(null,crossing.map(function(x){return x.start-7;}));
  }
  if(cut<=start+80)cut=natural;
  // Avoid dangling half-lines from a paragraph at the bottom of a page.
  for(var guard=0;guard<4;guard++){
   var straddlers=positions.filter(function(x){return x.start<cut-2&&x.end>cut+2&&x.start>start+pageHeight*.42;});
   if(!straddlers.length)break;
   var smaller=Math.min.apply(null,straddlers.map(function(x){return x.start-8;}));
   if(smaller>start+pageHeight*.42)cut=smaller;else break;
  }
  out.push(cut);start=cut;
  if(out.length>100)throw new Error("Article too long to export in one PDF.");
 }
 out.push(height);return out;
}
var publicationText={
 da:{source:"Udskriftsgrundlag",single:"Denne tiddler",tag:"Alle med tag",list:"Liste i en tiddler",story:"Åbne tiddlere (StoryList)",tagLabel:"Vælg tag",listLabel:"Vælg listetiddler",include:"Medtag",up:"Flyt op",down:"Flyt ned",settings:"Udgivelsesvalg",header:"Bogtitel / ekstra overskrift",none:"Ingen",current:"Brug titel",custom:"Egen tekst",customHint:"Skriv din overskrift",toc:"Indholdsfortegnelse med klikbare PDF-links",titles:"Vis tiddlertitler som kapiteloverskrifter",prepare:"Opdater PDF",tocTitle:"Indhold",autoFacing:"Tilpas automatisk tosiders melodier til opslag",autoFacingTip:"Publisher beregner de faktiske nodesider og indsætter kun blanke sider, når en tosiders melodi ellers ikke ville ligge på samme opslag.",tocChapters:"kapitler",noneSelected:"Vælg mindst én tiddler",noTag:"Ingen tiddlere med dette tag",noList:"Ingen tiddlerlinks eller list-felt blev fundet",images:"Kun åbne tiddlere garanterer færdigrenderede, interaktive SVG-eksempler",contents:"Valgt til PDF",pending:"Valget er ændret. Tryk Opdater PDF",pdfDone:"PDF klar",noPages:"Ingen synligt indhold",emptyTag:"Vælg et tag",loading:"Danner PDF …",print:"HUWiki Publisher",chapter:"Kapitler",addBlankAfter:"Tom side efter",scoreNotReady:"ABC-noder kunne ikke klargøres med alle nodesider. Åbn melodien i wikien og prøv igen: ",blank:"Tom side",addBlank:"＋ Indsæt tom side",removeBlank:"Fjern",facing:"Start på venstreside",facingTip:"Brug ved en melodi på to nodesider, der skal stå overfor hinanden",saveOrder:"Gem rækkefølge i list-felt",savedOrder:"Rækkefølgen er gemt i list-feltet (tomme sider gemmes ikke)",saveOrderFail:"Kunne ikke gemme rækkefølge: ",spreadPreview:"Opslag i sangbogen",autoBlank:"Automatisk til opslag",manualBlank:"Manuel tom side",confirmSave:"Gem rækkefølgen i tiddlerens list-felt? PDF-valg og tomme sider gemmes ikke.",page:"side",pages:"sider",calculating:"beregner…",pageAfter:"vises efter PDF",starts:"starter s.",blankBefore:"automatisk tom side før",autoSummary:"automatisk",manualSummary:"manuel"},
 en:{source:"Print source",single:"Current tiddler",tag:"Tagged tiddlers",list:"List in a tiddler",story:"Open tiddlers (StoryList)",tagLabel:"Choose tag",listLabel:"Choose list tiddler",include:"Include",up:"Move up",down:"Move down",settings:"Publication settings",header:"Book title / extra heading",none:"None",current:"Use title",custom:"Custom text",customHint:"Enter heading",toc:"Table of contents with clickable PDF links",titles:"Show tiddler titles as chapter headings",prepare:"Update PDF",tocTitle:"Contents",autoFacing:"Automatically arrange two-page tunes as facing spreads",autoFacingTip:"Uses the actual score-page count and inserts blank pages only where required to keep a two-page tune on one spread.",tocChapters:"chapters",noneSelected:"Select at least one tiddler",noTag:"No tiddlers have this tag",noList:"No tiddler links or list field found",images:"Only open tiddlers guarantee fully rendered interactive SVG examples",contents:"Selected for PDF",pending:"Selection changed. Choose Update PDF",pdfDone:"PDF ready",noPages:"Nothing visible to export",emptyTag:"Choose a tag",loading:"Generating PDF …",print:"HUWiki Publisher",chapter:"Chapters",addBlankAfter:"Blank after",scoreNotReady:"Could not prepare all ABC score pages. Open this tune in the wiki and try again: ",blank:"Blank page",addBlank:"＋ Insert blank page",removeBlank:"Remove",facing:"Start on left page",facingTip:"Use for a two-page tune that should be viewed facing each other",saveOrder:"Save order to list field",savedOrder:"Order saved to the list field (blank pages are not saved)",saveOrderFail:"Could not save order: ",spreadPreview:"Book spreads",autoBlank:"Automatically inserted for facing pages",manualBlank:"Inserted blank",confirmSave:"Save this order in the tiddler list field? PDF selections and blank pages will not be saved.",page:"page",pages:"pages",calculating:"calculating…",pageAfter:"after PDF update",starts:"starts p.",blankBefore:"automatic blank before",autoSummary:"automatic",manualSummary:"manual"}
};
function cleanTitleList(value){
 if(Array.isArray(value))return value.slice();
 if(!value)return [];
 return $tw.utils.parseStringArray(String(value));
}
function titleFieldList(title){var t=$tw.wiki.getTiddler(title);if(!t)return [];return typeof t.getFieldList==="function"?t.getFieldList("list"):cleanTitleList(t.fields.list);}
function ordinary(title){return !!(title&&(title.indexOf("$:/")!==0||title.indexOf("$:/temp/huwiki/repertoire/publication/")===0)&&$tw.wiki.getTiddler(title));}
function uniqueTitles(v){var used={};return v.filter(function(s){if(!ordinary(s)||used[s])return false;used[s]=true;return true;});}
function allOrdinary(){
 var found={};$tw.wiki.getTiddlers().forEach(function(t){found[t]=true;});
 var map=$tw.wiki.getTagMap();Object.keys(map).forEach(function(tag){(map[tag]||[]).forEach(function(t){found[t]=true;});});
 return Object.keys(found).filter(ordinary).sort(function(a,b){return a.localeCompare(b);});
}
function allTags(){
 return Object.keys($tw.wiki.getTagMap()).filter(function(t){return t.indexOf("$:/")!==0;}).sort(function(a,b){return a.localeCompare(b);});
}
function findFrame(title){
 var frames=document.querySelectorAll(".tc-tiddler-frame[data-tiddler-title]");
 for(var i=frames.length-1;i>=0;i--)if(frames[i].getAttribute("data-tiddler-title")===title)return frames[i];
 return null;
}
function getRenderedBody(title){
 var frame=findFrame(title),live=frame&&frame.querySelector(".tc-tiddler-body");
 if(live)return live.cloneNode(true);
 var t=$tw.wiki.getTiddler(title);if(!t)return null;
 var holder=E("div","tc-tiddler-body");
 try{holder.innerHTML=$tw.wiki.renderTiddler("text/html",title,{variables:{currentTiddler:title}})||"";}
 catch(e){holder.textContent=String(t.fields.text||"");}
 return holder;
}
function targetOfLink(el){
 var target=el.getAttribute("data-tiddler-title")||"",href=el.getAttribute("href")||"";
 if(!target&&href.charAt(0)==="#"){
  try{target=decodeURIComponent(href.slice(1));}catch(ignore){}
 }
 if(!target){var text=(el.textContent||"").trim();if(ordinary(text))target=text;}
 return ordinary(target)?target:"";
}
function titlesInListTiddler(title){
 var raw=titleFieldList(title),body=getRenderedBody(title);
 if(body)Array.prototype.forEach.call(body.querySelectorAll("a.tc-tiddlylink,a[href^='#']"),function(a){var target=targetOfLink(a);if(target)raw.push(target);});
 return uniqueTitles(raw.filter(function(x){return x!==title;}));
}
function storyTitles(){return uniqueTitles(titleFieldList("$:/StoryList"));}
function tagTitles(tag){return tag?uniqueTitles($tw.wiki.getTiddlersWithTag(tag)||[]):[];}
function EButton(label,fn){var b=E("button","huprint-btn",label);b.type="button";b.addEventListener("click",fn);return b;}
function stripControls(clone){
 clone.classList.add("huprint-body");
 Array.prototype.forEach.call(clone.querySelectorAll("button,input,textarea,select,.huwabc-minimal-controls,.huwabc-print-actions,.huwabc-instrument-bar,.tc-tiddler-controls,.huprint-noexport"),function(el){el.remove();});
 return clone;
}
function makeChapter(title,withTitle,orchestra,sources){
 var selected=sources&&sources[title],node=E("section","huprint-stage"),body=null;
 if(selected&&selected.format==="image"){
  body=E("div");var image=E("img");image.src=selected.image;image.alt=publicationPdfTitle(title,orchestra);image.style.cssText="max-width:100%;height:auto";body.appendChild(image);
 }else if(!selected||selected.format==="tiddler")body=getRenderedBody(selected&&selected.sourceTitle||title);
 if(withTitle)node.appendChild(E("h2","huprint-chapter-title",publicationPdfTitle(title,orchestra)));
 if(body)node.appendChild(stripControls(body));
 return node;
}
function addTopHeading(section,text){
 if(!text)return;
 if(section.classList.contains("huprint-contents")){
  section.insertBefore(E("h1","huprint-book-title",text),section.querySelector(".huprint-toc-title"));
 } else section.insertBefore(E("h1","huprint-title",text),section.firstChild);
}
function publicationPdfTitle(title,orchestra){
 var fields=($tw.wiki.getTiddler(title)||{}).fields||{},label=String(fields.caption||title);
 var prefix=String(orchestra||"").trim()+" · ";
 return orchestra&&label.indexOf(prefix)===0?label.slice(prefix.length):label;
}
function buildContents(ordered,listSource,listTitle,lang,orchestra){
 // A purpose-built, stable two-column contents page, instead of cloning an
 // arbitrary list tiddler. The source list still determines exact order.
 var w=publicationText[lang],section=E("section","huprint-stage huprint-contents");
 section.appendChild(E("p","huprint-toc-eyebrow",lang==="da"?"SAMLING":"COLLECTION"));
 section.appendChild(E("h2","huprint-toc-title",w.tocTitle));
 section.appendChild(E("p","huprint-toc-subtitle",ordered.length+" "+w.tocChapters));
 section.appendChild(E("hr","huprint-toc-rule"));
 var list=E("div","huprint-toc-list");
 ordered.forEach(function(title){
  var a=E("a","huprint-toc-link huprint-toc-row");
  a.href="#";a.dataset.huprintTarget=title;
  var display=($tw.wiki.getTiddler(title)||{}).fields||{};
  a.appendChild(E("span","huprint-toc-entry-title",publicationPdfTitle(title,orchestra)));
  // SVG dotted leader is intentionally included in the export engine's
  // SVG capture, unlike CSS borders which are not rendered in the JPEG PDF.
  var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','huprint-toc-leader');svg.setAttribute('viewBox','0 0 100 4');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
  var line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1','0');line.setAttribute('y1','2');line.setAttribute('x2','100');line.setAttribute('y2','2');line.setAttribute('stroke','#a4adb9');line.setAttribute('stroke-width','1.4');line.setAttribute('stroke-dasharray','1.2 3.2');
  svg.appendChild(line);a.appendChild(svg);
  var folio=E("span","huprint-toc-page","000");folio.dataset.huprintTarget=title;a.appendChild(folio);
  list.appendChild(a);
 });
 section.appendChild(list);
 return section;
}
async function renderPages(root,globalOffset,progress){
 var width=1240,height=1754,margin=88,scale=(width-2*margin)/root.getBoundingClientRect().width,pageHeight=(height-2*margin)/scale;
 var sourceHeight=Math.max(1,Math.ceil(root.getBoundingClientRect().height)),breaks=pageBreaks(root,sourceHeight,pageHeight),items=await commandsFor(root),images=[];
 for(var page=0;page<breaks.length-1;page++){
  if(progress)progress(globalOffset+page+1);
  var canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  var ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Canvas unavailable");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.save();ctx.translate(margin,margin);ctx.scale(scale,scale);
  ctx.beginPath();ctx.rect(0,0,root.getBoundingClientRect().width,(height-2*margin)/scale);ctx.clip();ctx.translate(0,-breaks[page]);
  var from=breaks[page],to=breaks[page+1];
  items.forEach(function(it){if(it.type!=="background"||!intersects(it,from,to))return;ctx.fillStyle=it.fill;ctx.fillRect(it.x,it.y,it.w,it.h);});
  items.forEach(function(it){if(!intersects(it,from,to))return;ctx.strokeStyle=it.fill;ctx.fillStyle=it.fill;
   if(it.type==="line"){ctx.lineWidth=it.weight;ctx.strokeRect(it.x,it.y,it.w,it.h);}
   if(it.type==="bullet"){ctx.beginPath();ctx.arc(it.x,it.y,2.8,0,2*Math.PI);ctx.fill();}
  });
  items.forEach(function(it){if(it.type!=="image"||!intersects(it,from,to))return;try{ctx.drawImage(it.image,it.x,it.y,it.w,it.h);}catch(ignore){}});
  items.forEach(function(it){if(it.type!=="text"||!intersects(it,from,to))return;ctx.fillStyle=it.fill;ctx.font=it.font;ctx.textBaseline="alphabetic";ctx.fillText(it.word,it.x,it.y+Math.min(it.h*.82,it.size*.92),it.w+Math.max(3,it.size*.16));});
  ctx.restore();ctx.fillStyle="#777";ctx.font="17px sans-serif";ctx.textAlign="right";ctx.fillText(String(globalOffset+page+1),width-margin,height-35);
  var jpg=canvas.toDataURL("image/jpeg",.91);images.push({data:bytes(jpg.slice(jpg.indexOf(",")+1)),width:width,height:height});canvas.width=0;canvas.height=0;
  // Let iPad Safari/Quine process UI before the next large canvas.
  if(page%2===1)await new Promise(function(resolve){setTimeout(resolve,0);});
 }
 return {images:images,breaks:breaks,scale:scale,margin:margin,width:width,height:height,root:root};
}
function linkAnnotation(rendered,el,globalOffset,targetPage){
 var rootRect=rendered.root.getBoundingClientRect(),r=el.getBoundingClientRect(),top=r.top-rootRect.top,bottom=r.bottom-rootRect.top;
 var local=rendered.breaks.findIndex(function(_,i){return i<rendered.breaks.length-1&&top>=rendered.breaks[i]-1&&top<rendered.breaks[i+1];});
 if(local<0)return null;
 var scale=rendered.scale,margin=rendered.margin,w=rendered.width,h=rendered.height;
 var leftX=margin+(r.left-rootRect.left)*scale,rightX=margin+(r.right-rootRect.left)*scale;
 var topY=margin+(top-rendered.breaks[local])*scale,bottomY=margin+(bottom-rendered.breaks[local])*scale;
 return {fromPage:globalOffset+local,targetPage:targetPage,rect:[leftX*595.2756/w,841.8898-bottomY*841.8898/h,rightX*595.2756/w,841.8898-topY*841.8898/h]};
}
// Optional ABC bridge. Music Edition supplies a page-image API based on its
// existing PDF engine, while Publisher remains standalone in ordinary wikis.
function abcExportModules(){
 try{
  var p=$tw.modules.execute('$:/plugins/huwiki/abc/print-export.js');
  if(!p||typeof p.renderImages!=='function')return null;
  return {pdf:p,page:$tw.modules.execute('$:/plugins/huwiki/abc/page-view.js'),
   instrument:$tw.modules.execute('$:/plugins/huwiki/abc/instrument-view.js'),
   jazz:$tw.modules.execute('$:/plugins/huwiki/abc/jazz-font.js')};
 }catch(ignore){return null;}
}
function isAbcScoreTitle(title){
 var t=$tw.wiki.getTiddler(title);if(!t)return false;
 return !!(t.fields['abc-source']||
  ((t.fields.type==='text/vnd.abc'||t.fields.type==='text/plain')&&/(^|\n)X:\s*\d+/m.test(t.fields.text||'')));
}
function liveScoreRoot(scope){
 if(!scope)return null;
 var roots=scope.querySelectorAll('.huwabc-score .huwabc-paginated');
 for(var i=0;i<roots.length;i++)if(roots[i]._huwabcPager && roots[i].querySelectorAll('.huwabc-page').length)return roots[i];
 return null;
}
function nextPaint(){return new Promise(function(resolve){requestAnimationFrame(resolve);});}
function wrapAgreement(value,width){
 var result=[],line="";
 String(value||"").replace(/\r/g,"").split("\n").forEach(function(part){
  part.trim().split(/\s+/).filter(Boolean).forEach(function(word){
   while(word.length>width){if(line){result.push(line);line="";}result.push(word.slice(0,width));word=word.slice(width);}
   if(!word)return;
   if(line&&line.length+word.length+1>width){result.push(line);line=word;}else line+=(line?" ":"")+word;
  });
  if(line){result.push(line);line="";}
 });
 return result;
}
function scoreAgreementRows(fields){
 if(!fields||typeof fields!=="object")return [];
 var result=[];
 [["Klingende toneart",fields.key],["Tempo",fields.tempo],["Form",fields.form],["Instrumentering",fields.instrumentation],["Indsatser og tegn",fields.cues]].forEach(function(row){
  if(row[1])result=result.concat(wrapAgreement(row[0]+": "+String(row[1]),75));
 });
 return result;
}
function attachScoreAgreements(pages,geom,details){
 // ABC's print renderer collects the SVG systems of cloned pages. Add a
 // small SVG system after the music, leaving original ABC and audio untouched.
 var lines=scoreAgreementRows(details);
 if(!lines.length||!pages.length)return;
 var last=pages[pages.length-1],body=last.querySelector(".huwabc-page-body");
 if(!body)return;
 var percent=parseFloat(body.style.width)||100*(geom.width-2*geom.margin)/geom.width;
 var contentMm=geom.width*percent/100,usableMm=geom.height-2*geom.margin-8,usedMm=0;
 Array.prototype.forEach.call(body.querySelectorAll(".huwabc-system-block svg"),function(svg){
  var vb=svg.viewBox&&svg.viewBox.baseVal;
  if(vb&&vb.width)usedMm+=contentMm*vb.height/vb.width;
 });
 var maximum=Math.max(1,Math.floor((usableMm*720/contentMm-55)/21));
 var spare=Math.floor(((usableMm-usedMm)*720/contentMm-55)/21),groups=[];
 if(lines.length<=spare)groups.push({body:body,rows:lines});
 else {
  // If a complete block does not fit, place it on its own agreement page(s).
  for(var offset=0;offset<lines.length;offset+=maximum){
   var newPage=document.createElement("div");newPage.className="huwabc-page";
   var newBody=document.createElement("div");newBody.className="huwabc-page-body";
   newBody.style.width=body.style.width;newPage.appendChild(newBody);pages.push(newPage);
   groups.push({body:newBody,rows:lines.slice(offset,offset+maximum)});
  }
 }
 groups.forEach(function(group,index){
  var height=55+group.rows.length*21,ns="http://www.w3.org/2000/svg";
  var wrap=document.createElement("div");wrap.className="huwabc-system-block";
  var svg=document.createElementNS(ns,"svg");
  svg.setAttribute("xmlns",ns);svg.setAttribute("viewBox","0 0 720 "+height);
  svg.setAttribute("width","720");svg.setAttribute("height",String(height));
  var rule=document.createElementNS(ns,"line");
  [["x1","14"],["x2","706"],["y1","8"],["y2","8"],["stroke","#bdccc4"],["stroke-width","1.4"]].forEach(function(pair){rule.setAttribute(pair[0],pair[1]);});svg.appendChild(rule);
  function label(value,y,size,weight){
   var t=document.createElementNS(ns,"text");t.setAttribute("x","14");t.setAttribute("y",String(y));
   t.setAttribute("fill","#253d35");t.setAttribute("font-family","Arial, Helvetica, sans-serif");
   t.setAttribute("font-size",String(size));t.setAttribute("font-weight",String(weight||400));
   t.textContent=value;svg.appendChild(t);
  }
  label(index?"AFTALER – FORTSAT":"AFTALER",33,18,700);
  group.rows.forEach(function(value,i){label(value,56+21*i,15,400);});
  wrap.appendChild(svg);group.body.appendChild(wrap);
 });
}
async function renderAbcChapter(title,progress,pageOffset,autoFacing,countOnly,repertoireAgreements,notation){
 var modules=abcExportModules();if(!modules)return null;
 var frame=findFrame(title),root=notation?null:liveScoreRoot(frame),holder=null,widget=null;
 var written=notation&&modules.instrument.create?modules.instrument.create(notation):modules.instrument;
 try{
  if(!root){
   // The score may be closed. Render a full score offscreen, not static
   // WikiText (which may contain only an article paragraph).
   holder=E('div','huprint-offscreen-score');
   holder.style.cssText='position:absolute;left:-10000px;top:0;width:950px;visibility:hidden;pointer-events:none;z-index:-1';
   document.body.appendChild(holder);
   var safe=String(title).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   var parser=$tw.wiki.parseText('text/vnd.tiddlywiki','<$huwiki-abc tiddler="'+safe+'" view="full"/>');
   widget=$tw.wiki.makeWidget(parser,{document:document,parentWidget:$tw.rootWidget,variables:{currentTiddler:title,storyTiddler:title,'huwabc-notation-settings':notation?JSON.stringify(notation):'','huwabc-repertoire-agreement':repertoireAgreements&&repertoireAgreements[title]?JSON.stringify(repertoireAgreements[title]):''}});
   widget.render(holder,null);
   // The ABC widget finishes rendering asynchronously. Never fall back to
   // a screenshot of just its first visible page if the full pages fail.
   for(var retries=0;retries<28;retries++){
    root=liveScoreRoot(holder);
    if(root)break;
    await new Promise(function(resolve){setTimeout(resolve,120);});
   }
  }
  if(!root)throw new Error(publicationText[language()].scoreNotReady+title);
  var t=$tw.wiki.getTiddler(title),geom=modules.page.geometry(t?t.fields:{});
  if(geom.name!=='A4')throw new Error('Publisher expects A4 music pages: '+title+' ('+geom.name+')');
  var pageNodes=Array.prototype.map.call(root.querySelectorAll('.huwabc-page'),function(p){return modules.page.safeClone(p);});
  if(!pageNodes.length)throw new Error('No score pages: '+title);
  attachScoreAgreements(pageNodes,geom,repertoireAgreements&&repertoireAgreements[title]);
  // The arranger can read the real number of score pages without creating a PDF.
  if(countOnly)return {images:[],pages:pageNodes.length,needsFacingBlank:false};
  if(progress)progress('ABC '+title+' ('+pageNodes.length+')');
  var label=root._huwabcPager&&root._huwabcPager.printLabel?root._huwabcPager.printLabel():written.printLabel($tw.wiki),fontCss=modules.jazz.css();
  var needsFacingBlank=!!autoFacing && pageNodes.length===2 && pageOffset%2===0;
  var folioOffset=pageOffset+(needsFacingBlank?1:0);
  return {images:await modules.pdf.renderImages(pageNodes,geom,label,fontCss,folioOffset),
   pages:pageNodes.length,needsFacingBlank:needsFacingBlank};
 }finally{if(widget)(function dispose(node){(node.children||[]).forEach(dispose);if(node.onDestroy)node.onDestroy();})(widget);if(holder)holder.remove();}
}
async function renderSelectedChapter(title,progress,pageOffset,autoFacing,countOnly,agreements,sources){
 var selected=sources&&sources[title];
 if(selected&&selected.missing)throw Error("Ingen udskriftskilde: "+title);
 if(selected&&selected.format==="pdf"){
  var renderer=$tw.modules.execute("$:/plugins/huwiki/print-article/pdf-source.js");
  var pdf=await renderer.render({wiki:$tw.wiki,document:document,source:selected.pdf,title:title,countOnly:countOnly,progress:progress});
  pdf.needsFacingBlank=!!autoFacing&&pdf.pages===2&&pageOffset%2===0;
  return pdf;
 }
 if(selected&&selected.format!=="abc")return null;
 var sourceTitle=selected&&selected.sourceTitle||title;
 if(!isAbcScoreTitle(sourceTitle)){
  if(selected)throw Error("ABC-kilden mangler: "+title);
  return null;
 }
 var mapped={};if(agreements&&agreements[title])mapped[sourceTitle]=agreements[title];
 return renderAbcChapter(sourceTitle,progress,pageOffset,autoFacing,countOnly,mapped,selected&&selected.notation);
}
async function createPublication(sections,contentsSection,ordered,progress,options){
 options=options||{};
 var images=[],table={},tocRender=null,tocOffset=0,automaticBlanks=0,manualBlanks=0,spreadWarnings=[],chapterStats=[];
 for(var i=0;i<sections.length;i++){
  var entry=sections[i];
  if(entry.kind==="blank"){
   images.push({blank:true,reason:"manual"});manualBlanks++;
   continue;
  }
  var beforeAutomatic=automaticBlanks;
  // Physical PDF page 1 is a recto (right page). Even page numbers are left.
  // If a two-page score must open together, page one of its chapter must be
  // even, i.e. its zero-based PDF index must be odd.
  if(entry.startLeft && images.length%2===0){
   images.push({blank:true,reason:"auto"});automaticBlanks++;
  }
  table[entry.title]=images.length;
  // A tune is an indivisible group of score pages. ABC prepares every page,
  // including pages hidden by the pager's dots; no blank is inserted inside.
  if(entry.kind==='chapter'){
   var score=await renderSelectedChapter(entry.title,progress,images.length,options.autoFacing&&!entry.startLeft,false,options.repertoireAgreements,options.repertoireSources);
   if(score){
    if(score.needsFacingBlank){images.push({blank:true,reason:"auto"});automaticBlanks++;}
    if(entry.startLeft&&score.pages!==2)spreadWarnings.push({title:entry.title,pages:score.pages});
    // The TOC must link to the score's actual page, not an auto blank.
    table[entry.title]=images.length;
    chapterStats.push({title:entry.title,pages:score.pages,startPage:images.length+1,autoBefore:automaticBlanks-beforeAutomatic});
    images=images.concat(score.images);continue;
   }
  }
  var render=await renderPages(entry.section,images.length,progress);
  if(entry.toc){tocRender=render;tocOffset=images.length;}
  if(entry.startLeft && render.images.length!==2)spreadWarnings.push({title:entry.title,pages:render.images.length});
  if(entry.kind==='chapter')chapterStats.push({title:entry.title,pages:render.images.length,startPage:images.length+1,autoBefore:automaticBlanks-beforeAutomatic});
  images=images.concat(render.images);
 }
 // Fill the index with real folio numbers *after* all blank-page and
 // chapter decisions. Fixed-width folio columns keep its pagination stable.
 if(tocRender){
  Array.prototype.forEach.call(tocRender.root.querySelectorAll('.huprint-toc-page[data-huprint-target]'),function(el){
   var target=el.dataset.huprintTarget;
   el.textContent=table[target]===undefined?'–':String(table[target]+1);
  });
  var updated=await renderPages(tocRender.root,tocOffset,progress);
  if(updated.images.length!==tocRender.images.length){
   throw new Error('Index pagination changed after page numbers. Please shorten the contents page.');
  }
  for(var ti=0;ti<updated.images.length;ti++)images[tocOffset+ti]=updated.images[ti];
  tocRender=updated;
 }
 // TOC annotations always point to physical PDF pages, including blanks.
 var links=[];
 if(tocRender){Array.prototype.forEach.call(tocRender.root.querySelectorAll("a.huprint-toc-link[data-huprint-target]"),function(el){
  var target=el.dataset.huprintTarget;
  if(table[target]===undefined)return;
  var link=linkAnnotation(tocRender,el,tocOffset,table[target]);if(link)links.push(link);
 });}
 return {blob:pdfFromJpegs(images,links),pages:images.length,links:links.length,
  automaticBlanks:automaticBlanks,manualBlanks:manualBlanks,spreadWarnings:spreadWarnings,chapterStats:chapterStats,images:images};
}
function buildPreview(title,preset) {
 if(active&&active.close)active.close();
 var lang=language(),tr=strings[lang],w=publicationText[lang],frame=findFrame(title),t=$tw.wiki.getTiddler(title),restoreInstrument=null;
 var repertoireAgreements={},repertoireSources={};
 try{repertoireAgreements=JSON.parse(t&&t.fields["repertoire-publication-agreements"]||"{}");}catch(_){repertoireAgreements={};}
 try{repertoireSources=JSON.parse(t&&t.fields["repertoire-publication-sources"]||"{}");}catch(_){repertoireSources={};}
  if(preset&&preset.instrumentId){try{var instrument=$tw.modules.execute("$:/plugins/huwiki/abc/instrument-view.js");
   if(instrument.profiles[preset.instrumentId]){var oldId=instrument.current().id;instrument.change(preset.instrumentId);restoreInstrument=function(){instrument.change(oldId);};}
  }catch(_ignored){}}
 if(!t){alert(tr.missing);return;}
 var docBody=document.body,overflow=docBody.style.overflow,prevFocus=document.activeElement;
 var overlay=E("section","huprint-overlay");overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label",w.print);
 var bar=E("header","huprint-bar"),label=E("strong","huprint-label",w.print),back=EButton(tr.close,close),prepare=EButton(w.prepare,prepareNow),share=EButton(isAppleTouch()?tr.share:lang==="da"?"Udskriv PDF":"Print PDF",shareNow),save=E("a","huprint-btn",tr.save),status=E("div","huprint-status","");
 share.classList.add("huprint-primary");share.disabled=true;save.hidden=true;status.setAttribute("role","status");
 var optionsBtn=EButton(lang==="da"?"⚙ Indstillinger":"⚙ Settings",function(){settings.hidden=!settings.hidden;optionsBtn.setAttribute("aria-expanded",String(!settings.hidden));optionsBtn.textContent=settings.hidden?(lang==="da"?"⚙ Indstillinger":"⚙ Settings"):(lang==="da"?"✕ Skjul indstillinger":"✕ Hide settings");});
 optionsBtn.setAttribute("aria-expanded","false");
 bar.appendChild(label);bar.appendChild(optionsBtn);bar.appendChild(back);bar.appendChild(prepare);bar.appendChild(share);bar.appendChild(save);bar.appendChild(status);
 var settings=E("section","huprint-settings"),controls=E("div","huprint-controls"),sourceLabel=E("label","huprint-setting"),sourceSelect=E("select","huprint-select"),specificLabel=E("label","huprint-setting"),tagSelect=E("select","huprint-select"),listInput=E("input","huprint-input"),listHints=E("datalist"),headerLabel=E("label","huprint-setting"),headerSelect=E("select","huprint-select"),headerText=E("input","huprint-input"),tocLabel=E("label","huprint-setting"),tocCheck=E("input"),titlesLabel=E("label","huprint-setting"),titlesCheck=E("input"),autoFacingLabel=E("label","huprint-setting huprint-auto-facing"),autoFacingCheck=E("input"),selection=E("div","huprint-selection"),selectionHeading=E("strong","huprint-selection-heading",w.contents),selectionActions=E("div","huprint-selection-actions"),paperWrap=E("div","huprint-paper-wrap");
 var output=$tw.modules.execute("$:/plugins/huwiki/print-article/output-actions.js").mount({document:document,window:window,navigator:navigator,language:lang,preferShare:isAppleTouch(),title:w.print,onError:function(error){if(pdfUrl)save.hidden=false;status.textContent=tr.failure+(error.message||error);}});
 var file=null,pdfUrl=null,previewUrls=[],closed=false,busy=false,entries=[{kind:"tiddler",title:title,checked:true,startLeft:false}],source="single",settingsVersion=0,automatic=false,refreshTimer=null,refreshQueued=false,previewMode="overview",focusedPage=0,lastPreviewImages=null;
 var pageCounts=Object.create(null),printedPlan=Object.create(null),countGeneration=0;
 function opt(select,key,name){var o=E("option",null,name);o.value=key;select.appendChild(o);}
 opt(sourceSelect,"single",w.single);opt(sourceSelect,"list",w.list);opt(sourceSelect,"story",w.story);opt(sourceSelect,"tag",w.tag);
 opt(headerSelect,"none",w.none);opt(headerSelect,"title",w.current);opt(headerSelect,"custom",w.custom);
 sourceLabel.appendChild(E("span",null,w.source));sourceLabel.appendChild(sourceSelect);
 specificLabel.appendChild(E("span",null,w.tagLabel));specificLabel.appendChild(tagSelect);
 opt(tagSelect,"",w.emptyTag);allTags().forEach(function(tag){opt(tagSelect,tag,tag);});
 tagSelect.value=(cleanTitleList(t.fields.tags).filter(function(tag){return tag.indexOf("$:/")!==0;})[0])||allTags()[0]||"";
 var listId="huprint-list-"+Date.now();listHints.id=listId;listInput.setAttribute("list",listId);listInput.value=preset&&preset.listTitle||title;listInput.setAttribute("placeholder",w.listLabel);
 allOrdinary().forEach(function(a){var o=E("option");o.value=a;listHints.appendChild(o);});
 headerLabel.appendChild(E("span",null,w.header));headerLabel.appendChild(headerSelect);
 headerText.placeholder=w.customHint;headerText.hidden=true;
 tocCheck.type="checkbox";tocCheck.checked=true;tocLabel.appendChild(tocCheck);tocLabel.appendChild(E("span",null,w.toc));
 titlesCheck.type="checkbox";titlesCheck.checked=true;titlesLabel.appendChild(titlesCheck);titlesLabel.appendChild(E("span",null,w.titles));
 autoFacingCheck.type="checkbox";autoFacingCheck.checked=true;autoFacingLabel.title=w.autoFacingTip;autoFacingLabel.appendChild(autoFacingCheck);autoFacingLabel.appendChild(E("span",null,w.autoFacing));
 controls.appendChild(sourceLabel);controls.appendChild(specificLabel);controls.appendChild(listInput);controls.appendChild(listHints);controls.appendChild(headerLabel);controls.appendChild(headerText);controls.appendChild(tocLabel);controls.appendChild(titlesLabel);controls.appendChild(autoFacingLabel);
 settings.appendChild(controls);settings.appendChild(selectionHeading);settings.appendChild(selectionActions);settings.appendChild(selection);
 var viewBar=E("nav","huprint-view-bar"),overviewBtn=EButton(lang==="da"?"Overblik":"Overview",function(){setPreviewMode("overview");}),spreadsBtn=EButton(lang==="da"?"Bogopslag":"Facing pages",function(){setPreviewMode("spreads");}),viewHint=E("span","huprint-view-hint","");
 overviewBtn.setAttribute("aria-pressed","true");spreadsBtn.setAttribute("aria-pressed","false");
 viewBar.setAttribute("aria-label",lang==="da"?"Forhåndsvisning":"Preview");
 viewBar.appendChild(overviewBtn);viewBar.appendChild(spreadsBtn);viewBar.appendChild(viewHint);
 overlay.appendChild(bar);overlay.appendChild(settings);overlay.appendChild(viewBar);overlay.appendChild(paperWrap);settings.hidden=true;
 var style=E("style");style.textContent=[
 ".huprint-overlay{position:fixed!important;inset:0!important;z-index:2147483000!important;overflow:auto!important;background:#e7eaee!important;color:#1b2737!important;font:15px system-ui,sans-serif!important}",
 ".huprint-bar{position:sticky;top:0;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #cbd5e1;box-shadow:0 2px 4px #0001}",
 ".huprint-label{flex:1;min-width:140px;font-size:15px;color:#1c334d}.huprint-btn{font:600 14px system-ui,sans-serif!important;background:white;color:#223044!important;border:1px solid #94a3b8!important;border-radius:6px;padding:9px 12px;cursor:pointer;text-decoration:none!important}",
 ".huprint-primary{background:#17634f!important;color:#fff!important;border-color:#17634f!important}.huprint-btn[disabled],.huprint-reorder[disabled]{opacity:.45}.huprint-btn[hidden]{display:none!important}",
 ".huprint-status{font-size:12px;flex-basis:100%;color:#555}.huprint-settings{background:white!important;border-bottom:1px solid #d1d5db;padding:12px 16px;max-height:43vh;overflow:auto}.huprint-settings[hidden]{display:none!important}.huprint-view-bar{position:relative;z-index:3;display:flex;align-items:center;flex-wrap:wrap;gap:7px;padding:8px 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1}.huprint-view-bar .huprint-btn{font-size:12px!important;padding:6px 11px}.huprint-view-bar .huprint-btn[aria-pressed=true]{background:#205a50!important;border-color:#205a50!important;color:#fff!important}.huprint-view-hint{font-size:12px;color:#526477;margin-left:auto}",
 ".huprint-controls{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.huprint-setting{display:flex;align-items:center;gap:6px;font-size:13px}.huprint-setting:has(select){flex-direction:column;align-items:flex-start}",
 ".huprint-select,.huprint-input{font:14px system-ui,sans-serif!important;max-width:260px;width:auto;min-width:130px;padding:7px;border:1px solid #94a3b8;border-radius:5px;background:white!important;color:#222!important}.huprint-input[hidden],.huprint-setting[hidden]{display:none!important}",
 ".huprint-selection-heading{display:block;font-size:13px;margin-top:10px}.huprint-selection{display:flex;flex-direction:column;gap:3px;max-height:190px;overflow:auto;border:1px solid #e2e8f0;margin-top:5px;border-radius:5px;padding:4px}",
 ".huprint-row{display:flex;align-items:center;gap:7px;padding:6px;border:1px solid transparent;border-radius:4px;background:#f8fafc;touch-action:pan-y}.huprint-row[draggable=true]{cursor:grab}.huprint-row.huprint-dragover{border-color:#1b7b63;background:#e1f2ea}",
 ".huprint-row-label{flex:1;min-width:60px;overflow-wrap:anywhere;font-size:13px}.huprint-pagecount{flex:0 0 auto;max-width:33%;white-space:normal;font:600 11px/1.2 system-ui,sans-serif!important;color:#476176;background:#e8f1f7;padding:4px 6px;border-radius:5px}.huprint-pagecount-auto{color:#0b5f4c!important;background:#e1f4e9}.huprint-auto-plan{padding:4px 10px;margin:3px 0 0 12px;border-left:3px solid #0d876e;background:#e8f5ee;color:#0a644d;font:600 11px system-ui,sans-serif!important}.huprint-reorder{border:1px solid #cbd5e1!important;background:white!important;border-radius:5px;padding:5px 9px;font-size:14px;color:#334155!important}.huprint-face{display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap}.huprint-blank-row{background:#f0f4f8;border:1px dashed #b6c3d2}.huprint-selection-actions{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.huprint-selection-actions .huprint-btn{font-size:12px!important;padding:6px 9px}",
 ".huprint-spread-heading{text-align:center;margin:8px auto 16px;font-weight:700;color:#334155}.huprint-spread{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 auto 24px;max-width:950px}.huprint-sheet{min-width:0;text-align:center}.huprint-sheet-paper{width:100%;aspect-ratio:210 / 297;background:#fff;box-shadow:0 2px 8px #0002;border:1px solid #d5dde7;display:flex;align-items:center;justify-content:center}.huprint-sheet-paper img{display:block;width:100%;height:100%;object-fit:contain}.huprint-sheet-note{font:12px system-ui,sans-serif;color:#64748b;margin-top:4px}.huprint-blank-marker{font:12px system-ui,sans-serif;color:#8994a3}.huprint-cover-space{background:transparent!important;border:1px dashed #c2cbd5!important;box-shadow:none!important}.huprint-overview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));max-width:1260px;gap:16px;margin:0 auto;align-items:start}.huprint-thumb{display:block;min-width:0;border:0;padding:0;background:none;color:inherit;text-align:center;cursor:zoom-in}.huprint-thumb .huprint-sheet-paper{transition:box-shadow .15s,border-color .15s}.huprint-thumb:hover .huprint-sheet-paper,.huprint-thumb:focus-visible .huprint-sheet-paper{border-color:#237e69;box-shadow:0 4px 16px #1b644444}.huprint-focused-page{max-width:min(850px,94vw);margin:0 auto}.huprint-focus-nav{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 auto 16px;flex-wrap:wrap}.huprint-focus-nav .huprint-btn{min-height:36px}.huprint-first-gap{color:#687a88;font:12px/1.4 system-ui;text-align:center;padding:10px}.huprint-paper-wrap{padding:16px 12px 34px;overflow:auto}.huprint-paper{box-sizing:border-box!important;display:block!important;width:min(100%,790px)!important;max-width:790px!important;margin:0 auto 16px!important;padding:26px 30px!important;background:#fff!important;color:#20252b!important;box-shadow:0 3px 18px #0002!important;border:0!important;border-radius:0!important}",
 ".huprint-stage{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;color:#20252b!important;background:#fff!important;overflow:visible!important}",
 ".huprint-title{font:700 26px/1.3 system-ui,sans-serif!important;margin:0 0 22px!important;color:#17243b!important}",
 ".huprint-chapter-title{font:700 22px/1.35 system-ui,sans-serif!important;margin:0 0 14px!important;color:#17243b!important}",
  ".huprint-contents{padding:3px 0!important}.huprint-book-title{font:700 29px/1.3 system-ui,sans-serif!important;letter-spacing:-.3px;color:#17243b!important;margin:0 0 20px!important}.huprint-contents:has(.huprint-book-title) .huprint-toc-title{font-size:25px!important}.huprint-toc-eyebrow{font:600 12px/1.5 system-ui,sans-serif!important;letter-spacing:2.2px;color:#697b8b;margin:6px 0 14px!important}.huprint-toc-title{font:700 36px/1.15 system-ui,sans-serif!important;letter-spacing:-.6px;color:#183552;margin:0 0 10px!important}.huprint-toc-subtitle{font:400 16px/1.5 system-ui,sans-serif!important;color:#687d8d;margin:0 0 20px!important}.huprint-toc-rule{border:0!important;border-top:1px solid #aebdca!important;margin:0 0 20px!important}.huprint-toc-list{display:flex;flex-direction:column;gap:3px;margin:0}.huprint-toc-row{width:100%;box-sizing:border-box!important;display:flex!important;align-items:baseline;min-height:33px;gap:10px;padding:5px 2px!important;text-decoration:none!important;font:500 17px/1.35 system-ui,sans-serif!important;color:#17486e!important}.huprint-toc-entry-title{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}.huprint-toc-leader{flex:1 1 35px;min-width:15px;height:16px;align-self:center}.huprint-toc-page{flex:0 0 3ch;min-width:3ch;text-align:right;color:#213b4f!important;font-variant-numeric:tabular-nums;font-weight:700}",
 ".huprint-body{overflow:visible!important;max-height:none!important;color:#222!important;font-size:16px!important;line-height:1.48!important}.huprint-body svg{max-width:100%!important;height:auto!important}.huprint-body img{max-width:100%!important}",
 ".huprint-body .huwabc-minimal-controls,.huprint-body .huwabc-instrument-bar,.huprint-body button,.huprint-body input,.huprint-body textarea,.huprint-body select{display:none!important}",
 "@media(max-width:650px){.huprint-bar{padding:8px}.huprint-settings{padding:8px;max-height:50vh}.huprint-paper{padding:14px!important}.huprint-label{font-size:13px}}",
 "@media print{body.huprint-printing>:not(.huprint-overlay){display:none!important}.huprint-bar,.huprint-settings{display:none!important}.huprint-overlay{position:static!important;overflow:visible!important}.huprint-paper{padding:0!important;width:100%!important;box-shadow:none!important}}"
 ].join("\n");
 document.head.appendChild(style);docBody.appendChild(overlay);docBody.style.overflow="hidden";
 function revokePreviews(){previewUrls.forEach(function(url){URL.revokeObjectURL(url);});previewUrls=[];}
 function schedulePreview(){clearTimeout(refreshTimer);if(closed)return;status.textContent=lang==="da"?"Forhåndsvisningen opdateres automatisk …":"Preview updating automatically …";refreshTimer=setTimeout(function(){refreshTimer=null;if(busy){refreshQueued=true;return;}prepareNow();},750);}
 function resetFile(skipAuto){output.reset();printedPlan=Object.create(null);Array.prototype.forEach.call(selection.querySelectorAll(".huprint-auto-plan"),function(n){n.remove();});updatePageBadges();file=null;share.disabled=true;save.hidden=true;if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}settingsVersion++;status.textContent=w.pending;if(automatic&&!skipAuto)schedulePreview();}
 function close(){if(closed)return;closed=true;output.destroy();clearTimeout(refreshTimer);lastPreviewImages=null;if(restoreInstrument)restoreInstrument();docBody.style.overflow=overflow;overlay.remove();style.remove();revokePreviews();if(pdfUrl)URL.revokeObjectURL(pdfUrl);document.removeEventListener("keydown",keys,true);if(active&&active.close===close)active=null;try{if(prevFocus&&prevFocus.isConnected)prevFocus.focus();}catch(ignore){}}
 function keys(ev){if(ev.key==="Escape"){ev.preventDefault();close();}}
 function currentTitles(){return entries.filter(function(e){return e.kind==="tiddler"&&e.checked;}).map(function(e){return e.title;});}
 function updatePageBadges(){
  Array.prototype.forEach.call(selection.querySelectorAll('.huprint-pagecount'),function(n){
   var title=n.getAttribute('data-huprint-title'),count=pageCounts[title],plan=printedPlan[title];
   var countText=typeof count==='number'?(count+' '+(count===1?w.page:w.pages)):(isAbcScoreTitle(title)?w.calculating:w.pageAfter);
   n.textContent=countText+(plan?' · '+w.starts+' '+plan.startPage+(plan.autoBefore?' · +'+plan.autoBefore+' '+w.blankBefore:''):'');
   n.classList.toggle('huprint-pagecount-auto',!!(plan&&plan.autoBefore));
  });
 }
 async function probePageCounts(){
  var generation=++countGeneration;
  var titles=entries.filter(function(e){return e.kind==='tiddler'&&isAbcScoreTitle(e.title);}).map(function(e){return e.title;});
  for(var i=0;i<titles.length;i++){
   if(closed||generation!==countGeneration)return;
   var title=titles[i];if(typeof pageCounts[title]==='number')continue;
   try{var x=await renderSelectedChapter(title,null,0,false,true,repertoireAgreements,repertoireSources);if(x)pageCounts[title]=x.pages;}
   catch(ignore){/* The publication generator will report the real error. */}
   if(closed||generation!==countGeneration)return;
   updatePageBadges();
  }
 }
 function renderSelection(){
  selection.textContent="";
  addBlankButton.disabled=entries.filter(function(e){return e.kind==='tiddler'&&e.checked;}).length<2;
  if(!entries.length){selection.appendChild(E("p",null,source==="tag"?w.noTag:w.noList));return;}
  entries.forEach(function(e,i){
   if(e.kind==='tiddler'&&printedPlan[e.title]&&printedPlan[e.title].autoBefore){
    selection.appendChild(E('div','huprint-auto-plan',printedPlan[e.title].autoBefore+' × '+w.blankBefore+' '+e.title));
   }
   var row=E("div","huprint-row"+(e.kind==="blank"?" huprint-blank-row":""));row.draggable=true;row.dataset.index=String(i);
   if(e.kind==="blank"){
    row.appendChild(E("span","huprint-row-label","□ "+w.blank));
    var remove=EButton(w.removeBlank,function(){entries.splice(i,1);renderSelection();resetFile();});remove.className="huprint-reorder";row.appendChild(remove);
   } else {
    var check=E("input");check.type="checkbox";check.checked=e.checked;check.setAttribute("aria-label",w.include+" "+e.title);
    check.addEventListener("change",function(){e.checked=check.checked;resetFile();});
    row.appendChild(check);row.appendChild(E("span","huprint-row-label",publicationPdfTitle(e.title,preset&&preset.repertoireOrchestra)));
    var countBadge=E("span","huprint-pagecount","");countBadge.setAttribute("data-huprint-title",e.title);row.appendChild(countBadge);
    var face=E("label","huprint-face"),faceCheck=E("input");faceCheck.type="checkbox";faceCheck.checked=!!e.startLeft;
    faceCheck.title=w.facingTip;faceCheck.addEventListener("change",function(){e.startLeft=faceCheck.checked;resetFile();});
    face.appendChild(faceCheck);face.appendChild(E("span",null,w.facing));face.hidden=!isAbcScoreTitle(e.title);row.appendChild(face);
    if(entries.slice(i+1).some(function(n){return n.kind==='tiddler'&&n.checked;})){
     var addAfter=EButton('＋ '+w.addBlankAfter,function(){entries.splice(i+1,0,{kind:'blank'});renderSelection();resetFile();});
     addAfter.className='huprint-reorder';row.appendChild(addAfter);
    }
   }
   var up=EButton("↑",function(){move(i,-1);}),down=EButton("↓",function(){move(i,1);});up.className="huprint-reorder";down.className="huprint-reorder";up.disabled=i===0;down.disabled=i===entries.length-1;up.title=w.up;down.title=w.down;
   row.appendChild(up);row.appendChild(down);selection.appendChild(row);
   row.addEventListener("dragstart",function(ev){ev.dataTransfer.setData("text/plain",String(i));ev.dataTransfer.effectAllowed="move";});
   row.addEventListener("dragover",function(ev){ev.preventDefault();row.classList.add("huprint-dragover");});
   row.addEventListener("dragleave",function(){row.classList.remove("huprint-dragover");});
   row.addEventListener("drop",function(ev){ev.preventDefault();row.classList.remove("huprint-dragover");var from=Number(ev.dataTransfer.getData("text/plain"));if(from>=0&&from<entries.length&&from!==i){var item=entries.splice(from,1)[0];entries.splice(i,0,item);renderSelection();resetFile();}});
  });
  updatePageBadges();
  probePageCounts();
 }
 function move(i,n){var j=i+n;if(j<0||j>=entries.length)return;var item=entries.splice(i,1)[0];entries.splice(j,0,item);renderSelection();resetFile();}
 function saveOrderToList(){
  var target=source==="tag"?tagSelect.value:listInput.value.trim();
  if(!target||!confirm(w.confirmSave))return;
  try{
   var t=$tw.wiki.getTiddler(target);
   if(source==="list"&&!t)throw new Error("Tiddler not found: "+target);
   var newList=entries.filter(function(e){return e.kind==="tiddler";}).map(function(e){return e.title;});
   // This explicit button writes only the list field. PDF selections, facing
   // preferences and blank pages remain purely local to the publication.
   $tw.wiki.addTiddler(new $tw.Tiddler(t||{title:target,type:"text/vnd.tiddlywiki",text:""},{title:target,list:$tw.utils.stringifyList(newList)}));
   status.textContent=w.savedOrder;
  }catch(err){status.textContent=w.saveOrderFail+(err.message||err);}
 }
 var addBlankButton=EButton(w.addBlank,function(){
  var positions=entries.map(function(e,i){return e.kind==='tiddler'&&e.checked?i:-1;}).filter(function(i){return i>=0;});
  if(positions.length<2)return;
  entries.splice(positions[positions.length-1],0,{kind:'blank'});renderSelection();resetFile();
 });
 var saveOrderButton=EButton(w.saveOrder,saveOrderToList);
 selectionActions.appendChild(addBlankButton);selectionActions.appendChild(saveOrderButton);
 function setSource(next){source=next;entries=(source==="single"?[title]:source==="story"?storyTitles():source==="tag"?tagTitles(tagSelect.value):titlesInListTiddler(listInput.value.trim())).map(function(t){return{kind:"tiddler",title:t,checked:true,startLeft:false};});specificLabel.hidden=source!=="tag";listInput.hidden=source!=="list";tocLabel.hidden=source==="single";titlesLabel.hidden=source==="single";autoFacingLabel.hidden=source==="single"||!entries.some(function(e){return e.kind==="tiddler"&&isAbcScoreTitle(e.title);});saveOrderButton.hidden=!(source==="tag"||source==="list");selectionHeading.hidden=false;selection.hidden=false;renderSelection();resetFile();}
 function makeSections(){
  var titles=currentTitles();if(!titles.length)throw new Error(w.noneSelected);
  paperWrap.textContent="";revokePreviews();
  var multi=source!=="single",toc=multi&&tocCheck.checked,withTitle=multi&&titlesCheck.checked,sections=[];
  if(toc){var contents=buildContents(titles,source==="list",listInput.value.trim(),lang,preset&&preset.repertoireOrchestra);sections.push({kind:"toc",title:"__toc__",section:contents,toc:true});}
  entries.forEach(function(e){
   if(e.kind==="blank"){
    // Only between two selected chapters; never in a score or at the edge.
    var before=entries.slice(0,entries.indexOf(e)).some(function(x){return x.kind==='tiddler'&&x.checked;});
    var after=entries.slice(entries.indexOf(e)+1).some(function(x){return x.kind==='tiddler'&&x.checked;});
    if(before&&after)sections.push({kind:'blank'});
    return;
   }
   if(!e.checked)return;
   sections.push({kind:"chapter",title:e.title,section:makeChapter(e.title,withTitle,preset&&preset.repertoireOrchestra,repertoireSources),toc:false,startLeft:!!e.startLeft});
  });
  var topText=headerSelect.value==="title"?(multi?source==="tag"?tagSelect.value:source==="list"?listInput.value:source==="story"?w.story:title:title):headerSelect.value==="custom"?headerText.value.trim():"";
  if(topText){var first=sections.filter(function(e){return !!e.section;})[0];if(first)addTopHeading(first.section,topText);}
  sections.forEach(function(e){if(!e.section)return;var p=E("article","huprint-paper tc-tiddler-frame");p.appendChild(e.section);paperWrap.appendChild(p);});
  return sections;
 }
 function setPreviewMode(mode){previewMode=mode;overviewBtn.setAttribute("aria-pressed",String(mode==="overview"));spreadsBtn.setAttribute("aria-pressed",String(mode==="spreads"));if(lastPreviewImages)renderBookSpreads(lastPreviewImages);}
 function renderBookSpreads(images){
  revokePreviews();paperWrap.textContent="";
  viewHint.textContent=images.length+" "+(lang==="da"?"sider":"pages")+(previewMode==="overview"?(lang==="da"?" · klik på en side for at forstørre":" · click a page to enlarge"):"");
  function putPage(paper,im,number){
   if(im.blank){paper.appendChild(E("span","huprint-blank-marker",im.reason==="auto"?w.autoBlank:w.manualBlank));}
   else{var url=URL.createObjectURL(new Blob([im.data],{type:"image/jpeg"}));previewUrls.push(url);var img=E("img");img.src=url;img.alt=(lang==="da"?"Side ":"Page ")+number;paper.appendChild(img);}
  }
  if(previewMode==="overview"){
   var grid=E("div","huprint-overview-grid");
   images.forEach(function(im,i){var card=E("button","huprint-thumb");card.type="button";var sheet=E("div","huprint-sheet-paper");card.appendChild(sheet);putPage(sheet,im,i+1);card.appendChild(E("div","huprint-sheet-note",(lang==="da"?"Side ":"Page ")+(i+1)+(im.blank?" · "+w.blank:"")));card.onclick=function(){focusedPage=i;setPreviewMode("page");};grid.appendChild(card);});
   paperWrap.appendChild(grid);return;
  }
  if(previewMode==="page"){
   var nav=E("div","huprint-focus-nav"),prev=EButton("←",function(){focusedPage=Math.max(0,focusedPage-1);renderBookSpreads(images);}),next=EButton("→",function(){focusedPage=Math.min(images.length-1,focusedPage+1);renderBookSpreads(images);}),back=EButton(lang==="da"?"Alle sider":"All pages",function(){setPreviewMode("overview");});
   prev.disabled=focusedPage===0;next.disabled=focusedPage>=images.length-1;nav.appendChild(back);nav.appendChild(prev);nav.appendChild(E("strong",null,(lang==="da"?"Side ":"Page ")+(focusedPage+1)+" / "+images.length));nav.appendChild(next);paperWrap.appendChild(nav);
   var focused=E("div","huprint-focused-page"),page=E("div","huprint-sheet-paper");putPage(page,images[focusedPage],focusedPage+1);focused.appendChild(page);paperWrap.appendChild(focused);return;
  }
  paperWrap.appendChild(E("h3","huprint-spread-heading",w.spreadPreview));
  var shelves={};
  function slot(shelf,side){
   var node=E("div","huprint-sheet");node.dataset.side=side;var paper=E("div","huprint-sheet-paper");node.appendChild(paper);node.appendChild(E("div","huprint-sheet-note",""));shelf.appendChild(node);return node;
  }
  for(var i=0;i<images.length;i++){
   var number=i+1,index=Math.floor(number/2);
   if(!shelves[index]){
    var shelf=E("div","huprint-spread");shelf.dataset.spread=String(index);
    shelves[index]={wrap:shelf,left:slot(shelf,"left"),right:slot(shelf,"right")};
    paperWrap.appendChild(shelf);
   }
   var node=number%2?shelves[index].right:shelves[index].left,paper=node.querySelector(".huprint-sheet-paper"),im=images[i];
   putPage(paper,im,number);
   node.querySelector(".huprint-sheet-note").textContent="Side "+number+(im.blank?" · "+w.blank:"");
  }
  Array.prototype.forEach.call(paperWrap.querySelectorAll(".huprint-sheet"),function(node){
   if(!node.querySelector(".huprint-sheet-note").textContent){node.querySelector(".huprint-sheet-paper").classList.add("huprint-cover-space");if(node.dataset.side==="left"&&images.length){node.querySelector(".huprint-sheet-paper").appendChild(E("span","huprint-first-gap",lang==="da"?"Første side ligger til højre i et bogopslag":"First page starts on the right in a facing spread"));}}
  });
 }
 async function prepareNow(){
  if(closed||busy){if(busy)refreshQueued=true;return;}clearTimeout(refreshTimer);refreshTimer=null;resetFile(true);busy=true;prepare.disabled=true;status.textContent=w.loading;
  var version=settingsVersion;
  try{
   var sections=makeSections();
   // Wait for layout to settle before collecting SVG, text positions and links.
   await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});
   await Promise.all(Array.from(paperWrap.querySelectorAll("img")).map(function(image){return image.complete?image.naturalWidth?Promise.resolve():Promise.reject(Error("Billedet kunne ikke indlæses: "+image.alt)):new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(Error("Billedet kunne ikke indlæses: "+image.alt));};});}));
   var result=await createPublication(sections,sections.length>1?sections[0].section:null,currentTitles(),function(page){if(!closed)status.textContent=w.loading+" ("+page+")";},{autoFacing:source!=="single"&&autoFacingCheck.checked,repertoireAgreements:repertoireAgreements,repertoireSources:repertoireSources});
   if(closed||version!==settingsVersion)return;
   var fname=preset&&preset.siteTitle?preset.siteTitle:(source==="single"?title:source==="tag"?tagSelect.value:source==="list"?listInput.value:source==="story"?"StoryList":title);
   file=new File([result.blob],safeName(fname),{type:"application/pdf"});
   printedPlan=Object.create(null);
   result.chapterStats.forEach(function(stat){pageCounts[stat.title]=stat.pages;printedPlan[stat.title]=stat;});
   lastPreviewImages=result.images;renderSelection();
   renderBookSpreads(result.images);
   await output.prepare(result.images);
   if(closed||version!==settingsVersion)return;
   var canShare=isAppleTouch()&&output.canShare(file);
   share.hidden=false;share.disabled=false;
   share.textContent=canShare?tr.share:lang==='da'?'Udskriv PDF':'Print PDF';
   pdfUrl=URL.createObjectURL(result.blob);save.href=pdfUrl;save.download=safeName(fname);save.hidden=!!canShare;
   status.textContent=(canShare?tr.ready:lang==="da"?"PDF klar. Vælg Udskriv PDF eller Gem PDF.":"PDF ready. Choose Print PDF or Save PDF.")+" · "+result.pages+" "+(lang==="da"?"PDF-sider":"PDF pages")+" · "+result.links+" "+(lang==="da"?"links":"links")+
    " · "+result.automaticBlanks+" "+w.autoSummary+" "+w.blank.toLowerCase()+" · "+result.manualBlanks+" "+w.manualSummary+" "+w.blank.toLowerCase()+
    (result.spreadWarnings.length?" · "+result.spreadWarnings.map(function(e){return e.title+": "+e.pages+" sider";}).join(", "):"");
  }catch(e){if(!closed)status.textContent=tr.failure+(e&&e.message||e);}
  finally{busy=false;prepare.disabled=false;if(refreshQueued&&!closed){refreshQueued=false;schedulePreview();}}
 }
 function shareNow(){if(file)output.activate(file);}
 function changed(){resetFile();}
 sourceSelect.addEventListener("change",function(){setSource(sourceSelect.value);});tagSelect.addEventListener("change",function(){setSource(source);});listInput.addEventListener("change",function(){if(source==="list")setSource(source);});
 headerSelect.addEventListener("change",function(){headerText.hidden=headerSelect.value!=="custom";changed();});headerText.addEventListener("input",changed);tocCheck.addEventListener("change",changed);titlesCheck.addEventListener("change",changed);autoFacingCheck.addEventListener("change",changed);
 back.focus();document.addEventListener("keydown",keys,true);active={close:close};
  if(preset&&preset.listTitle&&$tw.wiki.getTiddler(preset.listTitle)){listInput.value=preset.listTitle;sourceSelect.value="list";setSource("list");}
  else setSource("single");automatic=true;
 // Preserve the existing single-tiddler workflow: the first PDF is generated automatically.
 requestAnimationFrame(function(){prepareNow();});
}
exports.startup=function(){
 $tw.rootWidget.addEventListener("tm-huwiki-print-article",function(event){
  var title=event.param||event.tiddlerTitle||event.paramObject&&event.paramObject.title;
  if(!title)return false;buildPreview(title,event.paramObject||{});return false;
 });
};
})();
