var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
'use strict';
exports.name='huwiki-slideshow-site';exports.platforms=['browser'];exports.after=['startup'];exports.synchronous=true;
exports.startup=function(){
 const W=$tw.wiki;
 function html(pack){
  if(typeof pack.outputHtml==="string")return pack.outputHtml;
  if(pack.warnings.length)throw Error(ui.t('Site-eksport kræver afklaring af disse afhængigheder: ')+pack.warnings.join(', '));
  const rows=pack.data.tiddlers.map(t=>{const f={...t};if(Object.values(f).some(v=>typeof v==='string'&&/url\(\s*["']?https?:/i.test(v)))throw Error(ui.t('Ekstern baggrund skal indlejres før Site-eksport: ')+f.title);if((f._canonical_uri&&!/^data:(?:image|audio|video)\/|^data:application\/pdf/.test(f._canonical_uri))||f['av-file-id']||f['source-file-id'])throw Error(ui.t('Indlejr filen før Site-eksport: ')+f.title);if(/<(?:iframe|img|video|audio|source)\b[^>]*\bsrc\s*=\s*["']https?:/i.test(f.text||'')||/<\$image\b[^>]*source=["']https?:/i.test(f.text||'')||/\[img\[[^\]]*https?:\/\//i.test(f.text||''))throw Error(ui.t('Eksternt medie skal indlejres før Site-eksport: ')+f.title);if((Array.isArray(f.tags)?f.tags:$tw.utils.parseStringArray(f.tags||'')).includes('HUWiki-Præsentation')){const d=JSON.parse(f.text);d.slides.forEach(s=>{delete s.notes;});f.text=JSON.stringify(d);}return f;});
  const wiki=new $tw.Wiki();
  ['$:/core','$:/boot/boot.js','$:/boot/bootprefix.js','$:/plugins/huwiki/pasteup','$:/plugins/huwiki/slideshow'].forEach(title=>{const t=W.getTiddler(title);if(!t)throw Error('Site-motoren mangler '+title);if(title==='$:/plugins/huwiki/slideshow'){const data=JSON.parse(t.fields.text);Object.keys(data.tiddlers).forEach(key=>{if(data.tiddlers[key]['huwiki-example-resource']==='yes')delete data.tiddlers[key];});wiki.addTiddler(new $tw.Tiddler(t,{text:JSON.stringify(data)}));}else wiki.addTiddler(t);});
  W.each(t=>{if(t.fields['plugin-type']==='theme')wiki.addTiddler(t);});
  ['$:/language','$:/languages/da-DK'].forEach(title=>{const t=W.getTiddler(title);if(t)wiki.addTiddler(t);});
  ['$:/plugins/huwiki/cutout','$:/plugins/huwiki/theatre'].forEach(title=>{const t=W.getTiddler(title);if(t)wiki.addTiddler(t);});
  wiki.addTiddlers(rows);
  const entry=pack.data.entryTitle;
  wiki.addTiddlers([{title:'$:/config/AutoSave',text:'no'},{title:'$:/config/SaveWikiButton/Template',text:''},{title:'$:/DefaultTiddlers',text:''},{title:'$:/SiteTitle',text:pack.data.deck.name},{title:'$:/HUWiki/Slideshow/Site',text:entry},{title:'$:/core/ui/PageTemplate',text:ui.t('<div style="padding:3em;text-align:center;font-family:system-ui"><h1><$text text={{$:/SiteTitle}}/></h1><$button message="tm-huwiki-slideshow-view" param={{$:/HUWiki/Slideshow/Site}}>Åbn præsentationen</$button></div>')}]);
  wiki.addTiddler({title:'$:/HUWiki/Slideshow/SiteStartup',type:'application/javascript','module-type':'startup',text:"exports.name='huwiki-slideshow-site-start';exports.platforms=['browser'];exports.after=['huwiki-slideshow-startup'];exports.synchronous=true;exports.startup=function(){var entry=$tw.wiki.getTiddlerText('$:/HUWiki/Slideshow/Site');['tm-edit-tiddler','tm-new-tiddler','tm-save-wiki','tm-huwiki-slideshow-open'].forEach(function(type){$tw.rootWidget.addEventListener(type,function(){return false;});});$tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-view',param:entry});};"});
  wiki.readPluginInfo();wiki.registerPluginTiddlers('plugin');wiki.unpackPluginTiddlers();
  // Disable editor shortcuts; interaction widgets still use their normal runtime events.
  wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/KeyboardShortcut]]').forEach(title=>wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler(title),{tags:[]})));
  const output=wiki.renderTiddler('text/plain','$:/core/save/all',{variables:{wikiTitle:pack.data.deck.name,publishFilter:''}});
  if(!output.includes('$:/boot/boot.js'))throw Error('Site-motoren kunne ikke dannes.');return output.replace('<head>','<head><meta name="huwiki-interactive-site" content="slideshow-v1">');
 }
 async function download(pack){await window.HUWikiSlideshowVendors.ensure(["jszip.js"]);const output=html(pack),Zip=require('$:/plugins/huwiki/slideshow/vendor/jszip.js'),zip=new Zip();zip.file('index.html',output);zip.file('LAES_MIG.txt','HUWiki Slideshow Site\n\nPak ZIP-filen ud og åbn index.html. Afspilleren fungerer uden Drev og uden redigeringsflade. Upload index.html til en webserver for at dele Sitet.\n\n'+(pack.outputHtml?'CutOut':window.HUWikiSlideshowPackage.describe(pack))+ui.t('\nForedragsnoter er udeladt.\n'));const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(pack.data.deck.name||ui.t('Præsentation')).replace(/[\\/:*?"<>|]/g,'-')+'-Site.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 // A user-selected publication folder replaces the old account-specific server.
 // Handles stay in this browser session and never enter a saved wiki.
 let folder=null;
 const marker='forge-site.json';
 const safeName=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80).toLowerCase();
 async function listSites(){const result=[];if(!folder)return result;for await(const [name,dir]of folder.entries()){if(dir.kind!=='directory')continue;try{const meta=JSON.parse(await(await(await dir.getFileHandle(marker)).getFile()).text());if(meta.format==='huwiki-slideshow-site'&&meta.folder===name)result.push(meta);}catch{}}return result;}
 async function writeFile(dir,name,text){const file=await dir.getFileHandle(name,{create:true}),stream=await file.createWritable();try{await stream.write(text);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}}
 async function saveSite(pack,name,mode,expected){
  if(!folder)throw Error(ui.t('Vælg først en udgivelsesmappe.'));const slug=safeName(name);if(!slug)throw Error(ui.t('Skriv et filnavn med bogstaver eller tal.'));
  let dir,old;try{dir=await folder.getDirectoryHandle(slug);try{old=JSON.parse(await(await(await dir.getFileHandle(marker)).getFile()).text());}catch{throw Error(ui.t('Mappen findes, men er ikke oprettet af Slideshow. Vælg et andet navn.'));}}catch(e){if(e.name!=='NotFoundError')throw e;}
  if(mode==='create'&&dir)throw Error(ui.t('Navnet findes allerede. Vælg Opdater eller et nyt navn.'));
  if(mode==='update'&&(!old||old.format!=='huwiki-slideshow-site'||old.entryTitle!==pack.data.entryTitle||old.updatedAt!==expected))throw Error(ui.t('Udgivelsen er ændret eller tilhører en anden præsentation. Genindlæs oversigten.'));
  const output=html(pack);dir=dir||await folder.getDirectoryHandle(slug,{create:true});
  if(old){const previous=await(await(await dir.getFileHandle('index.html')).getFile()).text();await writeFile(dir,'previous.html',previous);}
  await writeFile(dir,'index.html',output);
  const record={format:'huwiki-slideshow-site',folder:slug,title:pack.data.deck.name,entryTitle:pack.data.entryTitle,updatedAt:new Date().toISOString()};await writeFile(dir,marker,JSON.stringify(record,null,2));
  window.dispatchEvent(new CustomEvent('huwiki-slideshow-sites-changed'));return record;
 }
 async function deleteSite(record){
  const dir=await folder.getDirectoryHandle(record.folder);const current=JSON.parse(await(await(await dir.getFileHandle(marker)).getFile()).text());
  if(current.format!==record.format||current.updatedAt!==record.updatedAt||current.entryTitle!==record.entryTitle)throw Error(ui.t('Udgivelsen er ændret. Genindlæs oversigten.'));
  const names=[];for await(const [name,entry]of dir.entries()){if(entry.kind!=='file'||!['index.html','previous.html',marker].includes(name))throw Error(ui.t('Mappen indeholder andre filer. Slet den selv, hvis det er tilsigtet.'));names.push(name);}
  for(const name of names)await dir.removeEntry(name);await folder.removeEntry(record.folder);window.dispatchEvent(new CustomEvent('huwiki-slideshow-sites-changed'));
 }
 async function publishDialog(pack,options){
  options=options||{};const dialog=document.createElement('dialog');dialog.className='huws-folder-dialog';dialog.style.cssText='max-width:650px;padding:24px;border-radius:12px';
  dialog.innerHTML=ui.t('<h2>Gem eller opdater et interaktivt site</h2><p>Vælg en mappe, som du selv udgiver på en webserver, eller hent en ZIP. Dette trin ændrer ikke adgangsrettigheder på en server.</p><button data-folder>Vælg udgivelsesmappe</button><label>Mappenavn<input data-name></label><p data-status role="status"></p><button data-save>Gem site i mappen</button> <button data-zip>Hent ZIP</button> <button data-close>Luk</button>');
  const e=k=>dialog.querySelector('[data-'+k+']');e('name').value=options.folder||safeName(pack.data.deck.name);if(options.mode==='update')e('name').disabled=true;
  const report=s=>e('status').textContent=s;
  e('folder').hidden=typeof window.showDirectoryPicker!=='function';e('save').disabled=!folder;
  if(!window.showDirectoryPicker)report(ui.t('Denne browser kan hente ZIP. Mappeopdatering kræver en browser med mappeadgang.'));
  e('folder').onclick=async()=>{try{folder=await window.showDirectoryPicker({mode:'readwrite'});report(ui.t('Valgt mappe: ')+folder.name);e('save').disabled=false;}catch(err){if(err.name!=='AbortError')report(err.message);}};
  e('save').onclick=async()=>{e('save').disabled=true;try{const record=await saveSite(pack,e('name').value,options.mode||'create',options.expected);report(ui.t('Gemt i ')+record.folder+ui.t('/index.html. Udgiv mappen via din egen webserver.'));}catch(err){report(err.message);}finally{e('save').disabled=!folder;}};
  e('zip').onclick=async()=>{try{await download(pack);report(ui.t('ZIP hentet. Pak ud og åbn index.html.'));}catch(err){report(err.message);}};
  e('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
 }
 async function renderManagement(container,entry,onPublish){
  container.textContent='';const heading=document.createElement('h3');heading.textContent=ui.t('Sites i din udgivelsesmappe');container.appendChild(heading);
  const status=document.createElement('p');status.textContent=folder?ui.t('Valgt mappe: ')+folder.name:ui.t('Vælg en mappe via Gem eller opdater site. ZIP fungerer uden mappeadgang.');container.appendChild(status);
  const sites=(await listSites()).filter(s=>s.entryTitle===entry);
  for(const s of sites){const row=document.createElement('div'),title=document.createElement('strong');title.textContent=s.title+' · '+s.folder+'/index.html';row.appendChild(title);
   const update=document.createElement('button');update.textContent='Opdater';update.onclick=()=>onPublish({mode:'update',folder:s.folder,expected:s.updatedAt});row.appendChild(update);
   const remove=document.createElement('button');remove.textContent='Slet';remove.onclick=()=>{const yes=document.createElement('button');yes.textContent=ui.t('Bekræft sletning af ')+s.folder;yes.onclick=async()=>{try{await deleteSite(s);await renderManagement(container,entry,onPublish);}catch(e){status.textContent=e.message;}};row.appendChild(yes);remove.disabled=true;};row.appendChild(remove);container.appendChild(row);
  }
 }
 window.HUWikiSlideshowSite={html,download,publishDialog,renderManagement,publishHtml:function(output,name){return publishDialog({outputHtml:output,warnings:[],data:{entryTitle:"CutOut – "+name,deck:{name:name},tiddlers:[]}});}};
};
