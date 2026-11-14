var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
'use strict';
exports.name='huwiki-slideshow-package';exports.platforms=['browser'];exports.after=['startup'];exports.synchronous=true;
exports.startup=function(){
 const W=$tw.wiki,TAG='HUWiki-Præsentation';
 const decode=s=>{const t=document.createElement('textarea');t.innerHTML=s;return t.value;};
 function attributes(text){const a=Object.create(null);String(text).replace(/([\w$-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`{}]+))/g,(_,k,v,w,u)=>{a[k]=decode(v==null?(w==null?u:w):v);return '';});return a;}
 function readDeck(title,wiki=W){const t=wiki.getTiddler(title);if(!t||!(t.fields.tags||[]).includes(TAG))throw Error(ui.t('Målpræsentationen findes ikke: ')+title);let d;try{d=JSON.parse(t.fields.text);}catch(e){throw Error(ui.t('Ugyldig præsentation: ')+title);}if(!d||!Array.isArray(d.slides))throw Error(ui.t('Ugyldig præsentation: ')+title);d=JSON.parse(JSON.stringify(d));if(Array.isArray(t.fields.list))d.slides=t.fields.list.map(title=>d.slides.find(s=>s.title===title)||{title});return d;}
 function references(d,wiki=W){
  const result=[];
  function boardExists(title){const t=wiki.getTiddler(title);return !!(t&&(t.fields.tags||[]).includes('pasteup')&&wiki.getTiddler(title+'/Layout')&&wiki.getTiddler(title+'/Styles'));}
  for(const slide of d.slides||[]){
   const mode=slide.displayMode&&slide.displayMode!=='auto'?slide.displayMode:boardExists(slide.title)?'pasteup':slide.backgroundPasteUp?'background':d.defaultLayoutPasteUp?'layout':d.defaultBackgroundPasteUp?'background':'standard';
   const board=mode==='layout'?slide.layoutPasteUp||d.defaultLayoutPasteUp:mode==='background'?slide.backgroundPasteUp||d.defaultBackgroundPasteUp:['pasteup','element'].includes(mode)?slide.pasteUpTitle||(boardExists(slide.title)?slide.title:''):'';
   const add=(target,kind)=>{if(target)result.push({target,source:slide.title,kind});};add(slide.title,'slide');add(board,'aktivt PasteUp-layout');
   if(board){const root=wiki.getTiddler(board),layout=wiki.getTiddler(board+'/Layout'),b=slide.bindings||{},source=wiki.getTiddler(slide.title);const values=root?Object.keys(layout?layout.fields:root.fields).map(k=>root.fields[k]).filter(x=>typeof x==='string').join('\n'):'';
    const nativeSource=mode==='pasteup'&&root&&root.fields['huws-source']?wiki.getTiddler(root.fields['huws-source']):source;
    if(mode==='pasteup'&&root&&root.fields['huws-source'])add(root.fields['huws-source'],'indhold i PasteUp');
    if(/huwiki-slide-image|source=<<huwsImage>>|get\[image\]/.test(values))add(b.imageTitle||(root&&root.fields['huws-image'])||(nativeSource&&nativeSource.fields[b.imageField||'image']),'billede i aktivt layout');
    if(/get\[related\]/.test(values))add(nativeSource&&nativeSource.fields.related,'link fra design');
    if(/huwsSecondary/.test(values))add(b.secondaryTitle,'anden tiddler i aktivt layout');
   }
  }return result;
 }
 function collect(deck,entryTitle,options){return collectFrom(W,deck,entryTitle,options||{});}
 function collectFrom(W,deck,entryTitle,options){
  if(!entryTitle)throw Error(ui.t('Gem præsentationen før eksport.'));
  const decks=new Map([[entryTitle,JSON.parse(JSON.stringify(deck))]]),rows=new Map(),visited=new Set(),queue=[],warnings=new Set(),issues=[];let currentSource=entryTitle;
  function missing(target,kind,choices){if(!issues.some(x=>x.source===currentSource&&x.target===target&&x.kind===kind))issues.push({source:currentSource,target,kind:kind||"indhold",choices});}
  function add(t,owner){if(!t||/^(https?:|data:|blob:|#)/i.test(t))return;if(t.startsWith('$:/')){if(!/^\$:\/plugins\/huwiki\/pasteup\//.test(t))warnings.add('Systemreference: '+t);return;}queue.push([t,owner,currentSource]);}
  function addDeck(title){if(!W.getTiddler(title)){missing(title,ui.t("præsentation"));return;}if(!decks.has(title))decks.set(title,readDeck(title,W));add(title,title);}
  function deckRefs(d,owner){if(!d.slides.length||d.slides.length>150)throw Error(ui.t('Præsentationen er tom eller for stor: ')+owner);references(d,W).forEach(ref=>{currentSource=ref.source;add(ref.target,owner);});}

  addDeck(entryTitle);
  while(queue.length){const [title,owner,source]=queue.shift();currentSource=source;const key=JSON.stringify([title,owner,source]);if(visited.has(key))continue;visited.add(key);const t=W.getTiddler(title);if(!t){missing(title);continue;}currentSource=title;if(visited.size>6000||rows.size>=1500)throw Error(ui.t('Pakken er for stor. Brug komplet ZIP-backup.'));const f=t.getFieldStrings();
   if(title===entryTitle){f.text=JSON.stringify(deck);f.list=$tw.utils.stringifyList(deck.slides.map(s=>s.title));}
   rows.set(title,f);
   if(decks.has(title)){deckRefs(decks.get(title),title);continue;}
   else if((t.fields.tags||[]).includes(TAG)){addDeck(title);continue;}
   if(f['huw-design-styles'])add(f['huw-design-styles'],owner);
   if(options.followDesignFields)['huws-source','huws-image','image','related','design-layout','av-source','av-source-two','av-source-three'].forEach(field=>{if(typeof f[field]==='string'&&f[field])add(f[field],owner);});
   ['Layout','Styles','Actions'].forEach(s=>{if(W.getTiddler(title+'/'+s))add(title+'/'+s,owner);});
   if(W.getTiddlerTranscludes)W.getTiddlerTranscludes(title).forEach(x=>add(x,owner));
   if(W.getTiddlerLinks)W.getTiddlerLinks(title).forEach(x=>add(x,owner));
   Object.entries(f).forEach(([field,value])=>{if(typeof value!=='string')return;const nativeLayout=(t.fields.tags||[]).includes('HUWiki-Slideshow-Design');if(!nativeLayout&&/\{\{\{|<\$(?:list|macrocall)\b|<(?:script|iframe)\b|<\$button\b|<<[a-zA-Z]|<\$(?:image|transclude|link)\b[^>]*(?:=<<|=\{)/.test(value))warnings.add(ui.t('Dynamisk indhold kræver kontrol: ')+title);
    (value.match(/\[img\[[^\]]+\]\]/g)||[]).forEach(mark=>add(mark.slice(5,-2).split('|').pop(),owner));
    const tags=value.match(/<\$(?:transclude|image|link|action-sendmessage)\b[^>]*>/g)||[];
    tags.forEach(tag=>{const a=attributes(tag);if(tag.startsWith('<$action-sendmessage')){
      if(a.$message!=='tm-huwiki-slide-action'){warnings.add(ui.t('Specialhandling i ')+title);return;}
      if(a.kind==='open')add(a.target,owner);
      if(a.kind==='jump'){const destination=a.deck||owner;if(!decks.has(destination))addDeck(destination);const d=decks.get(destination);if(!d)return;if(!d.slides.some(s=>s.title===a.target)){missing(a.target,'slide i '+destination,d.slides.map(s=>s.title));return;}add(a.target,destination);}
    }else add(a.tiddler||a.source||a.to,owner);});
    if(/<\$action-(?!sendmessage\b)/.test(value))warnings.add(ui.t('Specialhandling i ')+title);
   });
  }
  if(issues.length&&!options.allowMissing){const x=issues[0];throw Error(ui.t('Pakken mangler indhold: ')+x.target+' (link fra '+x.source+')');}
  // Membership in other decks is local context, not an export dependency.
  // Keep tags only for decks actually included, and repair membership even if
  // the startup migration has not run yet.
  const deckTags=new Set(W.getTiddlersWithTag(TAG)||[]);
  if(options.membershipTags!==false)rows.forEach((row,title)=>{
   const tags=$tw.utils.parseStringArray(row.tags||'').filter(tag=>!deckTags.has(tag)||decks.has(tag));
   decks.forEach((d,tag)=>{if(d.slides.some(s=>s.title===title)&&!tags.includes(tag))tags.push(tag);});
   row.tags=$tw.utils.stringifyList(tags);
  });
  const data={package:{id:deck.packageId||entryTitle,title:deck.name,author:deck.author||'',version:deck.version||'1.0.0',description:deck.description||'',requires:['$:/plugins/huwiki/slideshow','$:/plugins/huwiki/pasteup']},format:'huwiki-slideshow',schemaVersion:1,entryTitle,createdAt:new Date().toISOString(),deck:decks.get(entryTitle),tiddlers:Array.from(rows.values())};
  return {data,issues,warnings:Array.from(warnings),summary:{presentations:decks.size,slides:Array.from(decks.values()).reduce((n,d)=>n+d.slides.length,0),tiddlers:rows.size,images:data.tiddlers.filter(t=>/^image\//.test(t.type||'')).length}};
 }
 function describe(p){const s=p.summary;return s.presentations+ui.t(' præsentationer, ')+s.slides+' slides, '+s.images+' billeder og '+s.tiddlers+' tiddlere i alt.';}
 function review(deck,entryTitle){return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(780px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #c7d7e8;border-radius:16px;font:16px system-ui;color:#203b59';let settled=false;
  function finish(pack){settled=true;dialog.close();dialog.remove();resolve(pack);}
  function cancel(){if(settled)return;settled=true;dialog.remove();reject(Error(ui.t('Eksport annulleret.')));
  }dialog.addEventListener('cancel',ev=>{ev.preventDefault();cancel();});
  function render(){dialog.textContent='';const heading=document.createElement('h2');heading.textContent=ui.t('Indhold der følger med');dialog.appendChild(heading);let pack;try{pack=collect(deck,entryTitle,{allowMissing:true});}catch(err){const p=document.createElement('p');p.textContent=err.message;dialog.appendChild(p);const close=document.createElement('button');close.textContent=ui.t('Luk');close.onclick=cancel;dialog.appendChild(close);return;}
   const summary=document.createElement('p');summary.textContent=describe(pack);dialog.appendChild(summary);const note=document.createElement('p');note.textContent=ui.t('Linkmål og deres nødvendige indhold følger med i pakken. Almindelige links åbnes i et læsepanel. Præsentationens rækkefølge og wikiens tiddlere ændres ikke.');dialog.appendChild(note);
   for(const issue of pack.issues){const box=document.createElement('p');box.textContent='Fra »'+issue.source+'« → »'+issue.target+ui.t('«: det præcise mål findes ikke i denne wiki (')+issue.kind+ui.t('). Gendan eller importér originalen, og prøv igen. Eksporten erstatter ikke indhold.');dialog.appendChild(box);}
   const roots=new Set([entryTitle,...deck.slides.map(s=>s.title)]),extra=pack.data.tiddlers.filter(t=>!roots.has(t.title));const details=document.createElement('details'),cap=document.createElement('summary');cap.textContent=ui.t('Ekstra indhold: ')+extra.length+' tiddlere (vis liste)';details.appendChild(cap);const list=document.createElement('ul');extra.forEach(t=>{const li=document.createElement('li');li.textContent=t.title;list.appendChild(li);});details.appendChild(list);dialog.appendChild(details);
   if(pack.warnings.length){const warning=document.createElement('p');warning.textContent=pack.warnings.join('\n');dialog.appendChild(warning);}
   const go=document.createElement('button');go.textContent=ui.t('Fortsæt med dette indhold');go.disabled=!!pack.issues.length;go.onclick=()=>finish(pack);dialog.appendChild(go);const close=document.createElement('button');close.textContent=ui.t('Annuller');close.onclick=cancel;dialog.appendChild(close);
  }render();document.body.appendChild(dialog);dialog.showModal();
 });}

 window.HUWikiSlideshowPackage={collect,collectFrom,review,describe,readDeck,attributes,references};
};
