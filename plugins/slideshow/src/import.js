var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
"use strict";
exports.name="huwiki-slideshow-import";exports.platforms=["browser"];exports.after=["startup"];exports.synchronous=true;
exports.startup=function(){
 const W=$tw.wiki,base="$:/plugins/huwiki/slideshow/",MAX=20*1024*1024;
 let container,prepared=null,busy=false,pdfDocument=null,pdfTask=null,epoch=0,nextPageToken='',searchQuery='',searchType='all';
 function e(id){return container.querySelector('#huwi-'+id);}
 function status(s){e('status').textContent=s;}
 function from64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
 function to64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));return btoa(s);}
 function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function textSections(name,text){
  const parts=String(text).replace(/\r\n?/g,'\n').split(/\n(?=#{1,6} )|\n\s*---\s*\n|\f/).filter(x=>x.trim());
  if(parts.length>150)throw Error(ui.t('Filen har mere end 150 afsnit. Del den op.'));
  return parts.map((part,i)=>({title:part.split('\n')[0].replace(/^#+\s*/, '').slice(0,100)||name+' '+(i+1),text:part,type:'text/plain'}));
 }
 async function pdfPages(bytes,mode,report){
  report(ui.t('Indlæser PDF-værktøj…'));await window.HUWikiSlideshowVendors.ensure(['pdf.js','pdf-worker.js']);
  globalThis.pdfjsWorker=require(base+'vendor/pdf-worker.js');
  const api=require(base+'vendor/pdf.js');
  const task=pdfTask=api.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,useWasm:false,useWorkerFetch:false,stopAtErrors:true});
  task.onPassword=function(){task.destroy();};
  pdfDocument=await task.promise;
  if(pdfDocument.numPages>150)throw Error(ui.t('PDF har mere end 150 sider. Del den op.'));
  const pages=[];
  for(let n=1;n<=pdfDocument.numPages;n++){
   report(ui.t('Læser side ')+n+ui.t(' af ')+pdfDocument.numPages+'…');const page=await pdfDocument.getPage(n);
   const text=await page.getTextContent();let plain='';text.items.forEach(x=>{plain+=String(x.str||'')+(x.hasEOL?'\n':' ');});plain=plain.trim();
   const viewport=page.getViewport({scale:1}),ratio=viewport.width/viewport.height;if(!Number.isFinite(ratio)||viewport.width<=0||viewport.height<=0)throw Error(ui.t('Ugyldigt sideformat.'));
   const canvas=document.createElement('canvas'),preview=page.getViewport({scale:Math.min(240/viewport.width,180/viewport.height)});canvas.width=Math.ceil(preview.width);canvas.height=Math.ceil(preview.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:preview,annotationMode:0}).promise;
   pages.push({title:ui.t('Side ')+n+(plain?' – '+plain.split('\n')[0].slice(0,75):''),text:plain,type:'text/plain',page:n,ratio:ratio,preview:canvas.toDataURL('image/jpeg',.75),visual:mode==='visual'});canvas.width=canvas.height=0;
   await new Promise(r=>setTimeout(r,0));
  }return pages;
 }
 function validateBundle(data){
  if(!data||data.format!=='huwiki-slideshow'||data.schemaVersion!==1||!data.deck||!Array.isArray(data.deck.slides)||!Array.isArray(data.tiddlers))throw Error(ui.t('Vælg en HUWiki Slideshow-fil eksporteret fra værkstedet (.huwiki-slides.json).'));
  if(data.deck.slides.length<1||data.deck.slides.length>150||data.tiddlers.length>1500)throw Error(ui.t('Præsentationen er tom eller for stor.'));
  const seen=new Set();
  data.tiddlers.forEach(t=>{
   if(!t||typeof t.title!=='string'||!t.title||t.title.startsWith('$:/')||t.title.length>230||seen.has(t.title))throw Error(ui.t('Ugyldig eller gentaget tiddlertitel i importfilen.'));seen.add(t.title);
   if(t['module-type']||t['plugin-type']||t.type==='application/javascript'||(Array.isArray(t.tags)?t.tags:$tw.utils.parseStringArray(t.tags||'')).some(tag=>tag.startsWith('$:/tags/')))throw Error(ui.t('Importfilen må ikke installere kode eller plugins.'));
   if((t._canonical_uri&&!/^data:(image|audio|video)\/|^data:application\/pdf/.test(t._canonical_uri))||t['av-file-id']||t['source-file-id'])throw Error(ui.t('Importfilen har eksterne filreferencer. Brug komplet ZIP-backup eller indlejrede billeder.'));
   if(t.text!=null&&typeof t.text!=='string')throw Error(ui.t('Ugyldigt tiddlerindhold.'));
  });
  data.deck.slides.forEach(s=>{if(!s||!seen.has(s.title))throw Error(ui.t('En slide mangler sit indhold i importfilen.'));});
  const packageWiki=new $tw.Wiki();data.tiddlers.forEach(t=>packageWiki.addTiddler(new $tw.Tiddler(t)));const activeRefs=d=>window.HUWikiSlideshowPackage.references(d,packageWiki).map(r=>r.target);
  activeRefs(data.deck).forEach(t=>{if(!seen.has(t)&&! /^(https?:|data:|blob:|#)/i.test(t))throw Error(ui.t('Importfilen mangler aktivt indhold: ')+t);});
  if(data.entryTitle){if(!seen.has(data.entryTitle))throw Error(ui.t('Pakken mangler startpræsentationen.'));const byTitle=new Map(data.tiddlers.map(t=>[t.title,t]));data.tiddlers.filter(t=>(Array.isArray(t.tags)?t.tags:$tw.utils.parseStringArray(t.tags||'')).includes('HUWiki-Præsentation')).forEach(t=>{let d;try{d=JSON.parse(t.text);}catch(e){throw Error(ui.t('Ugyldig målpræsentation: ')+t.title);}if(!Array.isArray(d.slides)||d.slides.some(s=>!seen.has(s.title)))throw Error(ui.t('Målpræsentationen mangler slides: ')+t.title);activeRefs(d).filter(x=>! /^(https?:|data:|blob:|#)/i.test(x)).forEach(x=>{if(!seen.has(x))throw Error(ui.t('Målpræsentationen mangler indhold: ')+x);});});}
  if(data.entryTitle){const map=new Map(data.tiddlers.map(t=>[t.title,t]));data.tiddlers.forEach(t=>Object.values(t).forEach(value=>{if(typeof value!=='string')return;(value.match(/<\$action-sendmessage\b[^>]*>/g)||[]).forEach(tag=>{const a=window.HUWikiSlideshowPackage.attributes(tag);if(a.$message!=='tm-huwiki-slide-action')return;if(a.kind==='open'&&!map.has(a.target))throw Error(ui.t('Pakken mangler klikmål: ')+a.target);if(a.kind==='jump'&&a.deck){const target=map.get(a.deck);if(!target)throw Error(ui.t('Pakken mangler målpræsentationen: ')+a.deck);let d;try{d=JSON.parse(target.text);}catch(e){throw Error(ui.t('Ugyldig målpræsentation.'));}if(!Array.isArray(d.slides)||!d.slides.some(s=>s.title===a.target))throw Error(ui.t('Pakken mangler mål-slide: ')+a.target);}});}));}
  return data;
 }
 function portable(fields){const out=Object.create(null);Object.keys(fields).forEach(k=>{if(!/^(revision|_revision|wiki-id|file-id|server-id|_sync|_server|_conflict)$/i.test(k))out[k]=fields[k];});return out;}
 function comparable(fields){const out=Object.create(null);fields=portable(fields);Object.keys(fields).sort().forEach(k=>{if(!['created','modified','creator','modifier'].includes(k))out[k]=fields[k];});return JSON.stringify(out);}
 function validateExisting(bundle){bundle.tiddlers.forEach(t=>{const old=W.getTiddler(t.title);if(old&&comparable(old.getFieldStrings())!==comparable(new $tw.Tiddler(t).getFieldStrings()))throw Error('Titlen »'+t.title+ui.t('« findes allerede med andet indhold. Ingen tiddlers er ændret. Omdøb den eksisterende tiddler før import.'));});}
 async function releasePdf(){const task=pdfTask;pdfTask=null;pdfDocument=null;if(task){try{await task.destroy();}catch(ignored){}}}
 async function reset(){epoch++;prepared=null;e('preview').textContent='';e('selection').textContent='';e('commit').disabled=true;await releasePdf();}
 function setBusy(on){busy=on;container.querySelectorAll('[data-input]').forEach(x=>x.disabled=on);e('commit').disabled=on||!prepared;}
 async function prepare(){if(busy)return;setBusy(true);try{
   await reset();const mode=e('mode').value,splitMode=e('split').value,splitListItems=e('split-list').checked,pdfStructure=e('pdf-structure').checked;let response,name,bundle=null,sections;
   if(e('source').value==='file'){
    const file=e('file').files[0];if(!file)throw Error(ui.t('Vælg en fil.'));if(file.size>MAX)throw Error(ui.t('Filen må højst være 20 MB.'));name=file.name;
    const ext=name.toLowerCase().split('.').pop();
    if(ext==='json'){bundle=validateBundle(JSON.parse(await file.text()));validateExisting(bundle);sections=bundle.deck.slides.map(s=>({title:s.title,native:true}));}
    else if(ext==='pdf'){sections=await pdfPages(new Uint8Array(await file.arrayBuffer()),mode,status);}
    else if(['txt','md'].includes(ext)){if(mode==='visual')throw Error(ui.t('TXT og Markdown importeres som redigerbar tekst. Vælg tekstimport.'));sections=textSections(name,await file.text());}
    else{status(ui.t('Læser dokumentet lokalt…'));response=await window.HUWikiSlideshowDocuments.prepare(file,{mode,splitMode,splitListItems,pdfStructure});}
   }
   if(response&&response.kind==='native'){bundle=validateBundle(response.data);validateExisting(bundle);sections=bundle.deck.slides.map(s=>({title:s.title,native:true}));}
   else if(response){sections=response.kind==='pdf'?await pdfPages(from64(response.base64),mode,status):response.sections;}
   if(!sections||!sections.length)throw Error(ui.t('Kilden indeholder ingen sider eller afsnit.'));
   prepared={name:bundle?bundle.deck.name:name,sections:sections,bundle:bundle,mode:mode,splitMode:splitMode,splitListItems:splitListItems,pdfStructure:pdfStructure};e('name').value=prepared.name.replace(/\.[a-z0-9]+$/i,'');renderPreview();
   status((response&&response.warning?response.warning+' ':'')+(bundle?'HUWiki-format bevarer slideindstillinger og noter. Indhold med samme titel genbruges kun, hvis det er identisk.':mode==='visual'?ui.t('Billedimport bevarer udseendet. Tekst og figurer inde i billedet er ikke enkeltvis redigerbare.'):ui.t('Teksten bliver redigerbare tiddlers. Layout, animationer og medieelementer bevares ikke.'))+ui.t(' Vælg indholdet og klik Importér.'));
  }catch(error){prepared=null;await releasePdf();status(ui.t('Importen er ikke oprettet: ')+error.message);}finally{setBusy(false);}
 }
 function renderPreview(){const list=e('preview');list.textContent='';prepared.sections.forEach((s,i)=>{
   const label=document.createElement('label');label.className='huwi-preview-item';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.disabled=!!prepared.bundle;check.value=i;check.setAttribute('aria-label',ui.t('Medtag ')+s.title);label.appendChild(check);
   if(s.preview){const img=document.createElement('img');img.src=s.preview;img.alt=ui.t('Side ')+(i+1);label.appendChild(img);}
   const text=document.createElement('span');text.textContent=(i+1)+'. '+s.title+(s.text?' — '+s.text.slice(0,160):'');label.appendChild(text);list.appendChild(label);
 });updateSelection();}
 function updateSelection(){if(prepared&&prepared.bundle){e('preview').querySelectorAll('input').forEach(x=>x.checked=true);e('selection').textContent=ui.t('Én samlet pakke · ')+prepared.sections.length+' slides · '+(prepared.bundle.deck.author||ui.t('Forfatter ikke angivet'))+' · version '+(prepared.bundle.deck.version||'1.0.0');e('commit').textContent=ui.t('Importér præsentationspakken');return;}const n=e('preview').querySelectorAll('input:checked').length;e('selection').textContent=prepared?n+ui.t(' af ')+prepared.sections.length+ui.t(' slides valgt'):'';e('commit').textContent=ui.t('Importér ')+n+ui.t(' valgte slides');}
 function unique(title,used){let baseTitle=String(title||'Slide').replace(/^\$:\//,'').slice(0,205),candidate=baseTitle,n=2;while(W.tiddlerExists(candidate)||used.has(candidate))candidate=baseTitle+' ('+(n++)+')';used.add(candidate);return candidate;}
 async function commit(){if(busy||!prepared)return;setBusy(true);try{
   const indices=Array.from(e('preview').querySelectorAll('input:checked')).map(x=>Number(x.value));if(!indices.length)throw Error(ui.t('Vælg mindst ét slide.'));
   const name=e('name').value.trim().slice(0,130);if(!name)throw Error(ui.t('Skriv præsentationens navn.'));
   const used=new Set(),deckTitle=prepared.bundle&&prepared.bundle.entryTitle||unique('Præsentation – '+name,used);let pending=[],slides=[],deck={schema:3,name:name,theme:'paper',source:{mode:'manual',value:''},slides:slides};
   const now=$tw.utils.stringifyDate(new Date());
   if(prepared.bundle){validateExisting(prepared.bundle);deck=JSON.parse(JSON.stringify(prepared.bundle.deck));if(!prepared.bundle.entryTitle){deck.name=name;deck.source={mode:'manual',value:''};}if(prepared.bundle.entryTitle&&indices.length!==deck.slides.length)throw Error(ui.t('En sammenhængende pakke importeres med alle slides, så klikmål bevares. Vælg alle.'));deck.slides=indices.map(i=>deck.slides[i]);
    pending=prepared.bundle.tiddlers.filter(t=>!W.tiddlerExists(t.title)).map(t=>portable(new $tw.Tiddler(t).getFieldStrings()));
   }else{
    let total=0;
    for(const i of indices){const s=prepared.sections[i];if(s.page&&!s.visual&&!s.text.trim())throw Error(ui.t('Side ')+s.page+ui.t(' har intet tekstlag. Vælg billedimport.'));const title=unique(name+' – '+s.title,used);let fields={title:title,caption:s.title,created:now,modified:now,tags:['Slideshow','HUWiki-Import'],type:s.type||'text/plain',text:s.text||''};
     if(s.visual){status(ui.t('Klargør slide ')+(slides.length+1)+ui.t(' af ')+indices.length+'…');const page=await pdfDocument.getPage(s.page),viewport=page.getViewport({scale:1});
      const scale=Math.min(1600/viewport.width,1200/viewport.height),vp=page.getViewport({scale:scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp,annotationMode:0}).promise;const data=canvas.toDataURL('image/jpeg',.88).split(',')[1];canvas.width=canvas.height=0;
      const imageTitle=unique(title+' – billede',used);pending.push({title:imageTitle,type:'image/jpeg',text:data,tags:['HUWiki-Import'],created:now,modified:now});
      fields.type='text/vnd.tiddlywiki';fields.text='<div class="huws-imported-page"><$image source="'+esc(imageTitle)+'"/></div>';
     }
     total+=fields.text.length;pending.push(fields);slides.push({title:title,notes:'',displayMode:'standard',bindings:{titleField:'caption'}});
     await new Promise(r=>setTimeout(r,0));
    }
   }
   pending=pending.filter(t=>t.title!==deckTitle);
   const entry={title:deckTitle,type:'application/json',tags:['HUWiki-Præsentation'],created:now,modified:now,list:deck.slides.map(s=>s.title),text:JSON.stringify(deck)};
   if(!W.tiddlerExists(deckTitle))pending.push(entry);
   else if(!prepared.bundle)throw Error(ui.t('En titel blev oprettet under importen. Prøv igen.'));
   if(JSON.stringify(pending).length>25*1024*1024)throw Error(ui.t('Udvalget overstiger 25 MB. Importér færre sider ad gangen.'));
   // Prepare every tiddler before writing any. Never overwrite existing content.
   const ready=pending.map(t=>new $tw.Tiddler(t));ready.forEach(t=>{if(W.tiddlerExists(t.fields.title))throw Error(ui.t('En titel blev oprettet under importen. Prøv igen.'));});
   W.addTiddlers(ready);prepared=null;e('preview').textContent='';e('commit').disabled=true;status(ui.t('Præsentationen er oprettet. Gem hele wikien med TiddlyWikis Gem-knap.'));
   $tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-imported',param:deckTitle});
   await releasePdf();
  }catch(error){status(ui.t('Importen er ikke oprettet: ')+error.message);}finally{setBusy(false);}
 }
 function mount(panel){
  const snapshot={};panel.querySelectorAll('input[id],select[id]').forEach(el=>snapshot[el.id]={value:el.value,checked:el.checked,files:el.type==='file'?el.files:null});
  const included=Array.from(panel.querySelectorAll('#huwi-preview input:checked')).map(el=>el.value),hadPreview=!!panel.querySelector('#huwi-preview input');
  container=panel;
  panel.innerHTML=ui.t('<h3>Importér præsentation</h3><p>PDF, PowerPoint, Word, ODT/ODP, RTF, HTML, TXT, Markdown og HUWiki Slideshow. Eksportér Google Slides/Docs til en af disse filtyper først.</p><input id="huwi-source" type="hidden" value="file"><div class="huwi-grid"><label>Vælg fil<input id="huwi-file" data-input type="file" accept=".pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.rtf,.txt,.md,.html,.htm,.huwiki-slides.json"></label><label>Importér som<select id="huwi-mode" data-input><option value="visual">Bevar udseendet som billeder</option><option value="text">Redigerbar tekst</option></select></label></div><div id="huwi-split-wrap" hidden><label>Opdel dokumentet i slides<select id="huwi-split" data-input><option value="auto">Automatisk</option><option value="headings">Efter overskrifter</option><option value="semantic">Efter indhold og afsnit</option><option value="detailed">Detaljeret opdeling</option></select></label><label><input id="huwi-split-list" type="checkbox" data-input> Lav særskilte slides af listepunkter</label><input id="huwi-pdf-structure" type="hidden" value=""><p>Tekstimport bruger lokale læsere. Visuel Word/PowerPoint-import og ældre formater kan bruge den valgfrie LibreOffice-hjælper nedenfor. En PDF uden tekstlag kan importeres som billeder.</p></div><p>Højst 20 MB og 150 sider/afsnit. Forhåndsvisning ændrer ikke din wiki.</p><button id="huwi-prepare" data-input>Forhåndsvis</button><p id="huwi-status" role="status" aria-live="polite"></p><label>Navn på ny præsentation<input id="huwi-name" maxlength="130" data-input></label><div class="huws-inline-actions"><button id="huwi-all" data-input>Vælg alle</button><button id="huwi-none" data-input>Fravælg alle</button><span id="huwi-selection" role="status"></span></div><div id="huwi-preview"></div><button id="huwi-commit" disabled>Importér valgte slides</button>');
  function documentOptions(){e('split-wrap').hidden=e('mode').value!=='text';}
  e('mode').addEventListener('change',documentOptions);e('file').addEventListener('change',()=>{if(/\.(docx?|odt|rtf|txt|md|html?)$/i.test(e('file').files[0]?.name||'')){e('mode').value='text';documentOptions();}});
  ['file','mode','split','split-list'].forEach(id=>e(id).addEventListener('change',()=>{reset();status(ui.t('Klik Forhåndsvis for at læse den valgte kilde.'));}));
  e('preview').onchange=updateSelection;['all','none'].forEach(id=>e(id).onclick=()=>{e('preview').querySelectorAll('input').forEach(c=>c.checked=id==='all');updateSelection();});
  e('prepare').onclick=prepare;e('commit').onclick=commit;window.HUWikiSlideshowDocuments.mount(panel);
  Object.entries(snapshot).forEach(([id,s])=>{const el=panel.querySelector('#'+id);if(el){if(s.files)el.files=s.files;else el.value=s.value;el.checked=s.checked;}});documentOptions();
  if(prepared){renderPreview();if(hadPreview)e('preview').querySelectorAll('input').forEach(el=>el.checked=included.includes(el.value));updateSelection();}setBusy(busy);
 }
 function exportNative(deck,entryTitle,preparedPack){
  const pack=preparedPack||window.HUWikiSlideshowPackage.collect(deck,entryTitle),data=pack.data;data.tiddlers=data.tiddlers.map(portable);validateBundle(data);
  const json=JSON.stringify(data,null,2);if(json.length>20*1024*1024)throw Error(ui.t('Præsentationen overstiger 20 MB. Brug ZIP-backup.'));
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=String(deck.name||ui.t('Præsentation')).replace(/[\\/:*?"<>|]/g,'-')+'.huwiki-slides.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 window.HUWikiSlideshowImport={mount:mount,exportNative:exportNative,openDrive:function(){e('file').click();}};
};
