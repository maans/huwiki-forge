/*\
title: $:/plugins/huwiki/abc/print-export.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// Print is deliberately prepared INSIDE the current document: Quine/WKWebView
// may reject window.open('_blank') without surfacing a popup-blocked warning.
// A real PDF can also be generated locally from the notated SVG pages, without
// a network service, popup or dependency on window.print().
var current=null;
// On iPad/Quine, sending blob: URLs to the host opens the "No App found" dialog.
// File sharing works: generate first, then share during a separate user tap.
function isAppleTouch(){
 var ua=String(navigator.userAgent||'');
 return /iPad|iPhone|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&Number(navigator.maxTouchPoints)>1);
}
function el(d,tag,cls,text){var n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function text(da,en,language){return language==='da'?da:en;}
function css(geom,additional){
 var w=geom.width,h=geom.height;
 return (additional||'')+'\n'+[
 '.huwabc-print-overlay{position:fixed!important;inset:0!important;z-index:2147483000!important;overflow:auto!important;background:#e6e8eb!important;color:#1c293c!important;overscroll-behavior:contain!important;}',
 '.huwabc-print-actions{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#fff;padding:12px 16px;border-bottom:1px solid #c5cbd3;font:14px system-ui,sans-serif;}',
 '.huwabc-print-actions button,.huwabc-print-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #8594a7;border-radius:7px;background:#fff;color:#1c293c;padding:9px 12px;font:600 14px system-ui,sans-serif;text-decoration:none;cursor:pointer;}',
 '.huwabc-print-actions .huwabc-print-primary{background:#17477c;color:white;border-color:#17477c;}',
 '.huwabc-print-actions [hidden]{display:none!important}',
 '.huwabc-print-status{width:100%;font-size:12px;line-height:1.4;color:#4b5563;}',
 '.huwabc-print-header{flex:1;min-width:130px;font-weight:700}',
 '.huwabc-print-pages{padding:12px 0 24px;}',
 '.huwabc-print-overlay .huwabc-page{display:block!important;position:relative!important;box-sizing:border-box!important;width:'+w+'mm!important;height:'+h+'mm!important;max-width:none!important;aspect-ratio:auto!important;padding:0!important;margin:8mm auto!important;background:white!important;box-shadow:0 3px 16px #7773;overflow:hidden!important;break-after:page;page-break-after:always;}',
 '.huwabc-print-overlay .huwabc-page:last-child{break-after:auto;page-break-after:auto;}',
 '.huwabc-print-overlay .huwabc-page-body{display:flow-root;}',
 '.huwabc-print-overlay .huwabc-system-block{line-height:0;break-inside:avoid;}',
 '.huwabc-print-overlay .huwabc-system-block svg{display:block;width:100%!important;height:auto!important;overflow:visible!important;}',
 '.huwabc-print-overlay .huwabc-page-folio{position:absolute;right:8mm;bottom:3mm;color:#777;font:9pt system-ui,sans-serif;}',
 '.huwabc-print-overlay .huwabc-print-instrument{position:absolute;top:3mm;right:8mm;z-index:1;font:8pt system-ui,sans-serif;color:#555;letter-spacing:.025em;white-space:nowrap;}',
 '@page{size:'+w+'mm '+h+'mm;margin:0}',
 '@media print{',
 ' body.huwabc-printing{background:#fff!important;margin:0!important;padding:0!important;}',
 ' body.huwabc-printing > :not(.huwabc-print-overlay){display:none!important;}',
 ' body.huwabc-printing .huwabc-print-overlay{position:static!important;inset:auto!important;overflow:visible!important;background:white!important;z-index:auto!important;}',
 ' body.huwabc-printing .huwabc-print-actions{display:none!important;}',
 ' body.huwabc-printing .huwabc-print-pages{padding:0!important;margin:0!important;}',
 ' body.huwabc-printing .huwabc-page{margin:0!important;box-shadow:none!important;}',
 '}'
 ].join('\n');
}
function base64Bytes(b64){var raw=atob(b64),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function pdfFromJpegs(images,geom){
 var enc=new TextEncoder(),chunks=[],position=0,offsets=[0],objects=3+3*images.length;
 function put(s){var x=typeof s==='string'?enc.encode(s):s;chunks.push(x);position+=x.byteLength;}
 function begin(id){offsets[id]=position;put(id+' 0 obj\n');}
 function end(){put('\nendobj\n');}
 put('%PDF-1.4\n%\x80\x81\x82\x83\n');
 begin(1);put('<< /Type /Catalog /Pages 2 0 R >>');end();
 begin(2);put('<< /Type /Pages /Kids ['+images.map(function(_,i){return (4+3*i)+' 0 R';}).join(' ') +'] /Count '+images.length+' >>');end();
 begin(3);put('<< /Producer (HUWiki ABC) /Creator (HUWiki Music Edition) >>');end();
 var ptW=+(geom.width*72/25.4).toFixed(4),ptH=+(geom.height*72/25.4).toFixed(4);
 images.forEach(function(img,i){
  var page=4+3*i,stream=page+1,jpg=page+2;
  begin(page);put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+ptW+' '+ptH+'] /Resources << /XObject << /Im0 '+jpg+' 0 R >> >> /Contents '+stream+' 0 R >>');end();
  var code='q '+ptW+' 0 0 '+ptH+' 0 0 cm /Im0 Do Q\n';
  begin(stream);put('<< /Length '+enc.encode(code).length+' >>\nstream\n'+code+'endstream');end();
  begin(jpg);put('<< /Type /XObject /Subtype /Image /Width '+img.width+' /Height '+img.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.bytes.byteLength+' >>\nstream\n');put(img.bytes);put('\nendstream');end();
 });
 var xref=position;put('xref\n0 '+(objects+1)+'\n0000000000 65535 f \n');
 for(var j=1;j<=objects;j++)put(String(offsets[j]).padStart(10,'0')+' 00000 n \n');
 put('trailer\n<< /Size '+(objects+1)+' /Root 1 0 R /Info 3 0 R >>\nstartxref\n'+xref+'\n%%EOF');
 return new Blob(chunks,{type:'application/pdf'});
}
function toSvgImage(svg,doc,extraCss){
 return new Promise(function(resolve,reject){
  var x=svg.cloneNode(true);x.setAttribute('xmlns','http://www.w3.org/2000/svg');
  x.removeAttribute('width');x.removeAttribute('height');
  x.setAttribute('width',String(svg.viewBox.baseVal.width));x.setAttribute('height',String(svg.viewBox.baseVal.height));
  var s=doc.createElementNS('http://www.w3.org/2000/svg','style');
  s.textContent=(extraCss||'')+'\ntext,tspan{fill:#222}';x.insertBefore(s,x.firstChild);
  var markup=new XMLSerializer().serializeToString(x),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
  var img=new Image(),done=false;
  function finish(error){if(done)return;done=true;URL.revokeObjectURL(url);if(error)reject(error);else resolve(img);}
  img.onload=function(){finish();};img.onerror=function(){finish(new Error('Kunne ikke omdanne node-SVG til PDF-billede.'));};
  img.src=url;
 });
}
async function renderImages(pages,geom,label,extraCss,pageOffset){
 // 150 DPI is enough for A4 scores while keeping memory and file sizes modest.
 var dpi=200,pxPerMm=dpi/25.4,width=Math.round(geom.width*pxPerMm),height=Math.round(geom.height*pxPerMm),images=[];
 for(var i=0;i<pages.length;i++){
  var p=pages[i],canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  var ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Lærred til PDF er ikke tilgængeligt.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.textBaseline='alphabetic';
  var body=p.querySelector('.huwabc-page-body'),systems=Array.from(body.querySelectorAll('.huwabc-system-block svg'));
  var contentWidthPercent=parseFloat(body.style.width)||100*(geom.width-2*geom.margin)/geom.width;
  var bodyWidthPx=width*contentWidthPercent/100;
  var x=(width-bodyWidthPx)/2,y=geom.margin*pxPerMm;
  for(var k=0;k<systems.length;k++){
   var svg=systems[k],vb=svg.viewBox.baseVal;if(!vb||!vb.width)continue;
   var drawnHeight=bodyWidthPx*vb.height/vb.width;
   var image=await toSvgImage(svg,document,extraCss);ctx.drawImage(image,x,y,bodyWidthPx,drawnHeight);y+=drawnHeight;
  }
  ctx.fillStyle='#666';ctx.font=Math.round(8*pxPerMm*.352778)+'px sans-serif';
  if(label){ctx.textAlign='right';ctx.fillText(label,width-8*pxPerMm,5.8*pxPerMm);}
  ctx.fillStyle='#777';ctx.font=Math.round(9*pxPerMm*.352778)+'px sans-serif';ctx.textAlign='right';ctx.fillText(String((Number(pageOffset)||0)+i+1),width-8*pxPerMm,height-4.7*pxPerMm);
  var jpg=canvas.toDataURL('image/jpeg',.89),bytes=base64Bytes(jpg.substring(jpg.indexOf(',')+1));
  images.push({bytes:bytes,width:width,height:height});
  canvas.width=0;canvas.height=0;
 }
 return images.map(function(im){return {data:im.bytes,width:im.width,height:im.height};});
}
async function makePdf(pages,geom,label,extraCss){
 var images=await renderImages(pages,geom,label,extraCss);
 return pdfFromJpegs(images.map(function(im){return {bytes:im.data,width:im.width,height:im.height};}),geom);
}
function makeFilename(s,label){
 var instrument=label&&label.indexOf('B♭')!==-1?'-Bb-sopransax':label&&label.indexOf('E♭')!==-1?'-Eb-sopranino':'-C';
 return String(s||'HUWiki Nodeark').replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,90)+instrument+'.pdf';
}
function open(options){
 options=options||{};var d=options.doc||document,body=d.body,lang=options.language||'da';
 if(!options.pages||!options.pages.length)return false;
 if(current&&current.close)current.close();
 var oldOverflow=body.style.overflow,oldFocus=d.activeElement;
 var overlay=el(d,'section','huwabc-print-overlay'),bar=el(d,'header','huwabc-print-actions');
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',text('Udskriftsvisning','Print preview',lang));
 var filename=options.filename||makeFilename(options.title,options.instrumentLabel);
 var heading=el(d,'div','huwabc-print-header',(options.title||text('Nodeark','Sheet music',lang))+(options.instrumentLabel?' · '+options.instrumentLabel:''));
 var closeButton=el(d,'button','',text('Tilbage til wikien','Back to wiki',lang));closeButton.type='button';
 var printButton=el(d,'button','huwabc-print-primary',text('Udskriv herfra','Print this view',lang));printButton.type='button';if(isAppleTouch())printButton.hidden=true;
 // The PDF is prepared automatically while the preview is shown. On Quine the
 // actual navigator.share() MUST run directly in a later user click to retain
 // iPadOS transient user activation. There is no separate 'Make PDF' button.
 var shareButton=el(d,'button','huwabc-print-primary',text('Del / udskriv PDF','Share / print PDF',lang));shareButton.type='button';shareButton.hidden=!isAppleTouch();shareButton.disabled=true;
 var downloadLink=el(d,'a','',text('Gem PDF','Save PDF',lang));downloadLink.hidden=true;downloadLink.setAttribute('download',filename);
 var status=el(d,'div','huwabc-print-status',text('Forbereder PDF automatisk …','Preparing the PDF automatically …',lang));status.setAttribute('role','status');
 [heading,closeButton,printButton,shareButton,downloadLink,status].forEach(function(n){bar.appendChild(n);});
 var list=el(d,'main','huwabc-print-pages'),pages=options.pages;
 pages.forEach(function(p){p.hidden=false;if(options.instrumentLabel){var mark=el(d,'div','huwabc-print-instrument',options.instrumentLabel);p.appendChild(mark);}list.appendChild(p);});
 overlay.appendChild(bar);overlay.appendChild(list);
 var style=el(d,'style');style.textContent=css(options.geom,options.css);d.head.appendChild(style);
 var url=null,file=null,finished=false;
 function close(){if(finished)return;finished=true;body.classList.remove('huwabc-printing');body.style.overflow=oldOverflow;overlay.remove();style.remove();if(url)URL.revokeObjectURL(url);d.removeEventListener('keydown',esc,true);if(current&&current.close===close)current=null;try{if(oldFocus&&oldFocus.isConnected)oldFocus.focus({preventScroll:true});}catch(ignore){}}
 function esc(ev){if(ev.key==='Escape'){ev.preventDefault();close();}}
 closeButton.addEventListener('click',close);d.addEventListener('keydown',esc,true);
 printButton.addEventListener('click',function(){
  status.textContent=text('Åbner udskrivningsdialog …','Opening the print dialog …',lang);
  try{(d.defaultView||window).print();}catch(e){status.textContent=text('Udskrivning er blokeret: ','Print blocked: ',lang)+e.message;}
 });
 async function preparePdf(){
  if(finished)return;
  status.textContent=text('Forbereder PDF automatisk …','Preparing the PDF automatically …',lang);
  try{
   var blob=await makePdf(pages,options.geom,options.instrumentLabel,options.css);
   // The preview may have been closed before the PDF was ready.
   if(finished)return;
   if(url){URL.revokeObjectURL(url);url=null;}
   file=new File([blob],filename,{type:'application/pdf'});
   var canFileShare=!!(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})));
   shareButton.hidden=!canFileShare;
   shareButton.disabled=!canFileShare;
   // Never navigate to or download a blob: URL in Quine/iPad Safari.
   // Ordinary desktop browsers retain their download link.
   if(isAppleTouch()){
    downloadLink.removeAttribute('href');downloadLink.hidden=true;
   }else{
    url=URL.createObjectURL(blob);downloadLink.href=url;downloadLink.hidden=false;
   }
   status.textContent=canFileShare?
     text('PDF klar! Vælg Del / udskriv PDF og derefter Udskriv eller Gem i Arkiver.','PDF ready! Tap Share / print PDF, then choose Print or Save to Files.',lang):
     isAppleTouch()?text('PDF dannet, men appen understøtter ikke delingsark. Åbn wikien i Safari for eksport.','PDF created, but the app has no file sharing. Use Safari to export.',lang):
     text('PDF klar! Brug Gem PDF.','PDF ready! Use Save PDF.',lang);
  }catch(e){
   if(!finished)status.textContent=text('PDF kunne ikke dannes: ','PDF could not be created: ',lang)+(e&&e.message||String(e));
  }
 }
 shareButton.addEventListener('click',function(){if(!file||!navigator.share)return;navigator.share({files:[file],title:options.title||'HUWiki ABC'}).catch(function(e){if(e.name!=='AbortError')status.textContent=text('Deling mislykkedes: ','Sharing failed: ',lang)+e.message;});});
 body.appendChild(overlay);body.classList.add('huwabc-printing');body.style.overflow='hidden';
 current={close:close};closeButton.focus({preventScroll:true});
 // Render the preview before preparing its PDF; the enabled Share button then
 // opens iPadOS's native share sheet synchronously from a single user tap.
 var view=d.defaultView||window;
 if(view.requestAnimationFrame)view.requestAnimationFrame(function(){if(!finished)preparePdf();});
 else view.setTimeout(function(){if(!finished)preparePdf();},0);
 return true;
}
exports.open=open;exports.pdfFromJpegs=pdfFromJpegs;exports.makePdf=makePdf;exports.renderImages=renderImages;
})();
