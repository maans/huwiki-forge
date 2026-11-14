var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
"use strict";
exports.name="huwiki-slideshow-exports";exports.platforms=["browser"];exports.after=["startup"];exports.synchronous=true;
exports.startup=function(){
 var W=$tw.wiki,base="$:/plugins/huwiki/slideshow/vendor/";
 function basename(s){return String(s||"HUWiki").replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").slice(0,90)||"HUWiki";}
 function wikiList(v){if(Array.isArray(v))return v.slice();return String(v||"").match(/\[\[[^\]]+\]\]|[^\s]+/g)||[];}
 function wikiListTitle(v){return String(v||"").replace(/^\[\[|\]\]$/g,"");}
 function pluginDependencies(rows){var present={},wanted={};rows.forEach(function(row){if(row&&row["plugin-type"])present[String(row.title||"")]=true;});rows.forEach(function(row){if(!row)return;if(row["plugin-type"])wikiList(row.dependents).forEach(function(title){title=wikiListTitle(title);if(title)wanted[title]=true;});var tags=wikiList(row.tags).map(wikiListTitle),text=String(row.text||"");if(tags.indexOf("pasteup")>=0||text.indexOf("$:/plugins/huwiki/pasteup/")>=0)wanted["$:/plugins/huwiki/pasteup"]=true;if(tags.indexOf("HUWiki-Præsentation")>=0)wanted["$:/plugins/huwiki/slideshow"]=true;});return Object.keys(wanted).filter(function(title){return !present[title];});}
 function assertDependencies(rows){const missing=pluginDependencies(rows).filter(t=>!W.getTiddler(t));if(missing.length)throw Error(ui.t('Installér først de manglende afhængigheder: ')+missing.join(', '));}
 function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function embeddedOnly(rows){const unresolved=[];rows.forEach(t=>{if(t['plugin-type']||t.title.startsWith('$:/'))return;if(t._canonical_uri&&!/^data:/.test(t._canonical_uri)||/<(?:iframe|img|video|audio|source)\b[^>]*\bsrc\s*=\s*["'](?:https?:|file:)/i.test(t.text||'')||/\[img\[[^\]]*https?:\/\//i.test(t.text||''))unresolved.push(t.title);});if(unresolved.length)throw Error(ui.t('Indlejr først eksterne medier i disse tiddlere: ')+Array.from(new Set(unresolved)).join(', '));}
 async function backup(report){
  await window.HUWikiSlideshowVendors.ensure(['jszip.js']);report(ui.t('Samler den lokale wiki…'));
  const rows=[];W.each(t=>{if(!/^\$:\/(?:temp|state)\//.test(t.fields.title)&&t.fields.title!=='$:/HistoryList')rows.push(t.getFieldStrings());});
  assertDependencies(rows);embeddedOnly(rows);
  const wiki=new $tw.Wiki();wiki.addTiddlers(rows);wiki.readPluginInfo();wiki.registerPluginTiddlers('plugin');wiki.unpackPluginTiddlers();
  wiki.addTiddler({title:'$:/config/SaveWikiButton/Template',text:'$:/core/save/all'});
  const html=wiki.renderTiddler('text/plain','$:/core/save/all',{variables:{wikiTitle:W.getTiddlerText('$:/SiteTitle','HUWiki'),publishFilter:''}});
  if(!html.includes('$:/boot/boot.js'))throw Error(ui.t('Den selvstændige wiki kunne ikke dannes.'));
  const Zip=require(base+'jszip.js'),zip=new Zip();zip.file('index.html',html);zip.file('HUWiki-backup/tiddlers.json',JSON.stringify(rows,null,2));
  zip.file('HUWiki-backup/manifest.json',JSON.stringify({format:'huwiki-portable-backup',schemaVersion:2,title:W.getTiddlerText('$:/SiteTitle'),files:[],createdAt:new Date().toISOString()}));
  zip.file('README.txt','HUWiki Slideshow — local editable backup. Unzip and open index.html. Edit normally and save with TiddlyWiki. All embedded data and original plugin licenses are included.');
  report('Pakker ZIP…');downloadBlob(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),basename(W.getTiddlerText('$:/SiteTitle'))+'-HUWiki-backup.zip');
 }
 async function pdf(deck,render,report){
   report(ui.t("Indlæser PDF-værktøj…"));await window.HUWikiSlideshowVendors.ensure(["html2canvas.js","jspdf.js"]);
   var html2canvas=require(base+"html2canvas.js"),jsPDF=require(base+"jspdf.js").jsPDF;
   var pdf=new jsPDF({orientation:"landscape",unit:"pt",format:[960,540],compress:true});
   var stage=document.createElement("div");stage.className="huws-stage huws-pdf-capture";stage.setAttribute("data-theme",deck.theme);
   stage.style.cssText="position:fixed;inset:auto;left:-20000px;top:0;width:1600px;height:900px;right:auto;bottom:auto;display:block;overflow:hidden;z-index:-1";
   var content=document.createElement("div");content.className="huws-stage-content";content.style.cssText="width:1600px;height:900px;max-width:none;padding:70px;overflow:hidden;font-size:40px";stage.appendChild(content);document.body.appendChild(stage);
   try{for(var i=0;i<deck.slides.length;i++){
     report("Danner PDF-side "+(i+1)+ui.t(" af ")+deck.slides.length+"…");var slide=render(deck.slides[i],deck);
     content.innerHTML=slide.html;content.classList.toggle("huws-stage-pasteup",slide.visual);content.classList.toggle("huws-stage-composed",slide.composed);content.style.padding=slide.visual?"0":"70px";
     if(content.querySelector("iframe,video,audio,canvas"))throw Error("Slide "+(i+1)+ui.t(" indeholder levende medier. Erstat dem med et billede til PDF-eksport."));
     await document.fonts.ready;
     await Promise.all(Array.from(content.querySelectorAll("img")).map(async function(img){
       if(!img.complete)await new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(Error(ui.t("Et billede kunne ikke indlæses.")));},15000);img.onload=function(){clearTimeout(timer);resolve();};img.onerror=function(){clearTimeout(timer);reject(Error(ui.t("Et billede kunne ikke indlæses.")));};});
       if(!img.naturalWidth)throw Error(ui.t("Et billede mangler på slide ")+(i+1));
       if(/^https?:/.test(img.src)&&new URL(img.src).origin!==location.origin){
         // Read pixels first: otherwise html2canvas silently drops CORS-blocked images.
         var response=await fetch(img.src,{mode:"cors"});if(!response.ok)throw Error(ui.t("Et billede kan ikke læses til PDF."));
         var blob=await response.blob();img.src=await new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(r.result);};r.onerror=reject;r.readAsDataURL(blob);});await img.decode();
       }
       // Bake object-fit and SVG into pixels; html2canvas does not preserve object-fit.
       var fit=getComputedStyle(img).objectFit,rect=img.getBoundingClientRect();
       if(rect.width>0&&rect.height>0&&(fit==='contain'||fit==='cover'||/^data:image\/svg\+xml/.test(img.src))){
         var raster=document.createElement('canvas');raster.width=Math.ceil(rect.width);raster.height=Math.ceil(rect.height);
         var iw=img.naturalWidth,ih=img.naturalHeight,ratio=fit==='cover'?Math.max(raster.width/iw,raster.height/ih):Math.min(raster.width/iw,raster.height/ih);
         var dw=fit==='fill'?raster.width:iw*ratio,dh=fit==='fill'?raster.height:ih*ratio;
         raster.getContext('2d').drawImage(img,(raster.width-dw)/2,(raster.height-dh)/2,dw,dh);
         img.style.width=rect.width+'px';img.style.height=rect.height+'px';img.style.objectFit='fill';img.src=raster.toDataURL('image/png');await img.decode();
       }
     }));
     if(content.scrollHeight>content.clientHeight+2||content.scrollWidth>content.clientWidth+2)throw Error("Slide "+(i+1)+ui.t(" er større end PDF-siden. Forkort indholdet eller brug PasteUp-layout."));
     var canvas=await html2canvas(stage,{scale:1,backgroundColor:null,logging:false,useCORS:true,width:1600,height:900,windowWidth:1600,windowHeight:900});
     if(i)pdf.addPage([960,540],"landscape");pdf.addImage(canvas.toDataURL("image/jpeg",0.92),"JPEG",0,0,960,540);canvas.width=canvas.height=0;
   }
   var blob=pdf.output('blob');if(blob.size>20*1024*1024)throw Error(ui.t('PDF er for stor. Del præsentationen op.'));
   var filename=basename(deck.name)+'.pdf';downloadBlob(blob,filename);return {downloaded:true,name:filename};
   }finally{stage.remove();}
 }
 async function portablePackage(pack,report){
  const result=JSON.parse(JSON.stringify(pack));
  for(const row of result.data.tiddlers){
   const uri=String(row._canonical_uri||'');
   if(!uri){if((row['av-file-id']||row['source-file-id'])&&!row.text)throw Error(ui.t('Indlejr først mediefilen: ')+row.title);delete row['av-file-id'];delete row['source-file-id'];delete row['av-url'];continue;}
   if(!/^data:(image|audio|video)\/|^data:application\/pdf/.test(uri))throw Error(ui.t('Indlejr først mediefilen: ')+row.title);
   delete row['av-file-id'];delete row['source-file-id'];delete row['av-url'];
  }
  embeddedOnly(result.data.tiddlers);
  if(JSON.stringify(result.data).length>20*1024*1024)throw Error(ui.t('Pakken overstiger 20 MB. Brug komplet ZIP-backup.'));return result;
 }

 window.HUWikiSlideshowExports={backup:backup,pdf:pdf,portablePackage:portablePackage};
};
