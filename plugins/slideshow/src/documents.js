var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
'use strict';
exports.name='huwiki-slideshow-documents';exports.platforms=['browser'];exports.after=['startup'];exports.synchronous=true;
exports.startup=function(){
 const MAX=20*1024*1024;let connection=null;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error(ui.t('Dokumentets XML er beskadiget.'));return doc;};
 const all=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
 const content=node=>all(node,'t').map(t=>t.textContent).join('');
 function split(name,blocks,options){
  const groups=[];let group=null;const mode=options.splitMode||'auto';
  for(const block of blocks){
   const begin=!group||block.heading||mode==='detailed'||(mode==='semantic'&&group.text.length>1200)||(mode==='auto'&&group.text.length>2200);
   if(begin){group={title:block.heading||name+' '+(groups.length+1),text:'',type:'text/html'};groups.push(group);}
   group.text+=block.html+'\n';
  }
  if(groups.length>150)throw Error(ui.t('Dokumentet har mere end 150 afsnit. Del kilden op.'));
  return groups.filter(g=>g.text.trim());
 }
 function cleanHtml(text){const d=new DOMParser().parseFromString(text,'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,img,svg,video,audio,source').forEach(n=>n.remove());
  for(const el of d.body.querySelectorAll('*'))for(const a of Array.from(el.attributes)){if(a.name!=='href'||el.tagName!=='A'||!/^https?:\/\//i.test(a.value))el.removeAttribute(a.name);}
  return d.body;
 }
 async function prepare(file,options){
  if(file.size>MAX)throw Error(ui.t('Filen må højst være 20 MB.'));const ext=file.name.toLowerCase().split('.').pop();
  if(options.mode==='visual')return convert(file,options);
  if(['html','htm'].includes(ext)){
   const body=cleanHtml(await file.text());const blocks=Array.from(body.children).map(el=>({heading:/^H[1-6]$/.test(el.tagName)?el.textContent:'',html:el.outerHTML}));
   if(!blocks.length&&body.textContent.trim())blocks.push({html:'<p>'+esc(body.textContent)+'</p>'});
   return {kind:'sections',name:file.name,sections:split(file.name,blocks,options),warning:ui.t('Lokal tekstimport. Aktivt webindhold og billeder medtages ikke i teksttilstand.')};
  }
  if(!['docx','pptx','odt','odp'].includes(ext))return convert(file,options);
  await window.HUWikiSlideshowVendors.ensure(['jszip.js']);const Zip=require('$:/plugins/huwiki/slideshow/vendor/jszip.js');
  const zip=await Zip.loadAsync(await file.arrayBuffer());const entries=Object.values(zip.files);let size=0;
  for(const e of entries){size+=e._data?.uncompressedSize||0;if(size>150*1024*1024)throw Error(ui.t('Dokumentet bliver for stort efter udpakning.'));}
  const read=async name=>{const f=zip.file(name);if(!f)throw Error(ui.t('Dokumentet mangler ')+name);const s=await f.async('string');if(s.length>20*1024*1024)throw Error(ui.t('Dokumentets tekst er for stor.'));return xml(s);};
  let sections=[];
  if(ext==='docx'){
   const doc=await read('word/document.xml'),body=all(doc,'body')[0],blocks=[],links=new Map();
   if(zip.file('word/_rels/document.xml.rels'))for(const r of (await read('word/_rels/document.xml.rels')).documentElement.children){const target=r.getAttribute('Target');if(/^https?:\/\//i.test(target||''))links.set(r.getAttribute('Id'),target);}
   function inline(el){if(el.localName==='r'){let text=esc(content(el));if(all(el,'b').length)text='<strong>'+text+'</strong>';if(all(el,'i').length)text='<em>'+text+'</em>';return text;}const text=Array.from(el.children).map(inline).join('');const href=el.localName==='hyperlink'&&links.get(el.getAttribute('r:id'));return href?'<a href="'+esc(href)+'">'+text+'</a>':text;}
   for(const el of Array.from(body.children)){
    if(el.localName==='p'){
     const value=content(el);if(!value.trim())continue;const style=all(el,'pStyle')[0]?.getAttribute('w:val')||'';
     const heading=/heading|overskrift|title/i.test(style)?value:'';
     const runs=inline(el);
     const list=all(el,'numPr').length;blocks.push({heading,html:heading?'<h2>'+esc(value)+'</h2>':list?'<ul><li>'+runs+'</li></ul>':'<p>'+runs+'</p>'});
     if(list&&options.splitListItems)blocks.at(-1).heading=value.slice(0,100);
    }else if(el.localName==='tbl'){const rows=all(el,'tr').map(tr=>'<tr>'+Array.from(tr.children).filter(c=>c.localName==='tc').map(c=>'<td>'+esc(content(c))+'</td>').join('')+'</tr>');blocks.push({html:'<table>'+rows.join('')+'</table>'});}
   }
   sections=split(file.name,blocks,options);
  }else if(ext==='pptx'){
   // Follow presentation relationship order, not ZIP filename order.
   const presentation=await read('ppt/presentation.xml'),rels=await read('ppt/_rels/presentation.xml.rels');
   const relation=new Map(Array.from(rels.documentElement.children).filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
   for(const [i,id]of all(presentation,'sldId').entries()){
    const target=relation.get(id.getAttribute('r:id'));if(!target)throw Error(ui.t('Præsentationen mangler en slide-reference.'));
    const name=new URL(target,'https://zip.invalid/ppt/').pathname.slice(1);const doc=await read(name);
    const paragraphs=all(doc,'p').map(p=>content(p)).filter(t=>t.trim());sections.push({title:paragraphs[0]||'Slide '+(i+1),text:paragraphs.map(t=>'<p>'+esc(t)+'</p>').join('\n'),type:'text/html'});
   }
  }else{
   const doc=await read('content.xml');
   if(ext==='odp'){sections=all(doc,'page').map((page,i)=>{const paragraphs=all(page,'p').map(p=>p.textContent).filter(Boolean);return {title:paragraphs[0]||'Slide '+(i+1),text:paragraphs.map(t=>'<p>'+esc(t)+'</p>').join('\n'),type:'text/html'};});}
   else{const blocks=[];for(const el of all(doc,'text')[0]?.children||[]){if(el.localName==='h')blocks.push({heading:el.textContent,html:'<h2>'+esc(el.textContent)+'</h2>'});else if(el.localName==='p')blocks.push({html:'<p>'+esc(el.textContent)+'</p>'});else if(el.localName==='list'){for(const item of all(el,'list-item'))blocks.push({heading:options.splitListItems?item.textContent.slice(0,100):'',html:'<ul><li>'+esc(item.textContent)+'</li></ul>'});}else if(el.localName==='table'){blocks.push({html:'<table>'+all(el,'table-row').map(row=>'<tr>'+all(row,'table-cell').map(c=>'<td>'+esc(c.textContent)+'</td>').join('')+'</tr>').join('')+'</table>'});}}sections=split(file.name,blocks,options);}
  }
  if(sections.length>150)throw Error(ui.t('Dokumentet har mere end 150 afsnit. Del kilden op.'));
  return {kind:'sections',name:file.name,sections,warning:ui.t('Lokal tekstimport. Overskrifter, tekst og enkle lister/tabeller bevares; billeder, animationer og præcist layout kræver visuel import.')};
 }
 async function convert(file,options){
  if(!connection)throw Error(ui.t('Denne konvertering kræver den lokale LibreOffice-hjælper. Forbind den nedenfor, eller vælg en PDF eksporteret fra dit dokument.'));
  const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+16384));
  const r=await fetch(connection.url+'/convert',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+connection.token},body:JSON.stringify({name:file.name,base64:btoa(raw),mode:options.mode})});
  if(!r.ok)throw Error((await r.json()).error||ui.t('Konvertering mislykkedes.'));const result=await r.json();result.warning=ui.t('Konverteret lokalt med LibreOffice. Kontrollér skrifter, layout og sideskift i forhåndsvisningen. Office-animationer og talernoter importeres ikke.');return result;
 }
 function mount(panel){const box=document.createElement('details');box.innerHTML=ui.t('<summary>Valgfri lokal dokumentkonvertering</summary><p>Brug LibreOffice på din egen computer til visuel Word/PowerPoint-import og ældre dokumentformater. Filerne sendes kun til den lokale hjælper. Forbindelsen huskes kun, mens wikien er åben.</p><p><a href="https://github.com/maans/huwiki-forge/tree/main/tools/slideshow-converter" target="_blank" rel="noopener noreferrer">Installér den lokale hjælper</a></p><label>Hjælperens adresse<input data-url value="http://127.0.0.1:4977"></label><label>Midlertidig adgangskode<input data-token type="password" autocomplete="off"></label><button data-connect>Forbind lokal hjælper</button> <button data-disconnect>Afbryd</button><p data-status role="status"></p>');
  const e=k=>box.querySelector('[data-'+k+']');e('connect').onclick=async()=>{try{const u=new URL(e('url').value);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error(ui.t('Brug hjælperens lokale http-adresse.'));const token=e('token').value;if(!token)throw Error(ui.t('Indsæt hjælperens midlertidige adgangskode.'));const r=await fetch(u.origin+'/health',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error(ui.t('Forbindelsen blev afvist.'));connection={url:u.origin,token};e('token').value='';e('status').textContent=ui.t('Lokal hjælper forbundet.');}catch(error){connection=null;e('status').textContent=error.message;}};e('disconnect').onclick=()=>{connection=null;e('token').value='';e('status').textContent=ui.t('Forbindelsen er afbrudt.');};panel.appendChild(box);if(connection)e('status').textContent=ui.t('Lokal hjælper forbundet.');
 }
 window.HUWikiSlideshowDocuments={prepare,mount};
};
