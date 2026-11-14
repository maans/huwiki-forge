'use strict';
const Widget=require('$:/core/modules/widgets/widget.js').widget;
const model=require('$:/plugins/huwiki/instantwiki/model.js');
const readers=require('$:/plugins/huwiki/instantwiki/readers.js');
const PLUGIN='$:/plugins/huwiki/instantwiki';
function Instant(parseTreeNode,options){this.initialise(parseTreeNode,options);this.options={splitMode:'auto',sheetMode:'auto',pdfMode:'auto'};this.plan=[];this.epoch=0;}
Instant.prototype=Object.create(Widget.prototype);
Instant.prototype.lang=function(){return this.wiki.getTiddlerText('$:/language','').startsWith('$:/languages/da')?'da':'en';};
Instant.prototype.t=function(da,en){return this.lang()==='da'?da:en;};
Instant.prototype.el=function(tag,text,parent,attrs={}){const e=this.document.createElement(tag);if(text!==undefined)e.textContent=text;for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);(parent||this.box).appendChild(e);return e;};
Instant.prototype.button=function(da,en,fn,parent){const b=this.el('button',this.t(da,en),parent,{type:'button'});b.disabled=!!this.busy;b.addEventListener('click',fn);return b;};
Instant.prototype.field=function(da,en,value,change,parent,type='text'){const l=this.el('label',this.t(da,en),parent),i=this.el('input',undefined,l,{type});i.value=value||'';i.disabled=!!this.busy;i.addEventListener('change',()=>change(i.value));return i;};
Instant.prototype.select=function(da,en,values,value,change,parent){const l=this.el('label',this.t(da,en),parent),s=this.el('select',undefined,l,{'aria-label':this.t(da,en)});for(const [v,a,b]of values)this.el('option',this.t(a,b||a),s,{value:v});s.value=value;s.disabled=!!this.busy;s.addEventListener('change',()=>change(s.value));return s;};
Instant.prototype.check=function(da,en,value,change,parent){const l=this.el('label','',parent,{class:'iw-check'}),i=this.el('input',undefined,l,{type:'checkbox'});i.checked=value;i.disabled=!!this.busy;i.addEventListener('change',()=>change(i.checked));l.appendChild(this.document.createTextNode(this.t(da,en)));return i;};
Instant.prototype.render=function(parent,nextSibling){this.parentDomNode=parent;this.computeAttributes();this.box=this.document.createElement('div');this.box.className='forge-instantwiki';parent.insertBefore(this.box,nextSibling);this.domNodes.push(this.box);this.draw();};
Instant.prototype.refresh=function(changed){if(changed['$:/language']){this.draw();return true;}return false;};
Instant.prototype.message=function(error){const messages={
 'unsupported':['Vælg PDF, DOCX, ODT, HTML, TXT, Markdown, XLSX, XLS, ODS, CSV eller TSV. Gamle .doc-filer skal først gemmes som DOCX eller PDF.','Choose PDF, DOCX, ODT, HTML, TXT, Markdown, XLSX, XLS, ODS, CSV or TSV. First save legacy .doc files as DOCX or PDF.'],
 'link-failed':['Linket kunne ikke hentes. Det skal være et offentligt dokumentlink, hvis vært tillader browseradgang (CORS). Download filen og vælg den her, hvis linket kræver login eller er blokeret.','Could not fetch the link. Use a public document URL whose host allows browser access (CORS). If login is required or access is blocked, download the file and select it here.'],
 'https-url':['Brug et offentligt HTTPS-link uden loginoplysninger.','Use a public HTTPS URL without credentials.'],
 'too-large':['Filen er tom eller overstiger grænsen: 20 MB fil / 5 MB tekst.','The file is empty or exceeds the limit: 20 MB file / 5 MB text.'],
 'zip-too-large':['Det udpakkede dokument er for stort (100 MB).','The expanded document is too large (100 MB).'],
 'too-many-sections':['Der er mere end 500 afsnit. Vælg en grovere opdeling eller et mindre dokument.','More than 500 sections. Choose a coarser split or a smaller document.'],
 'sheet-too-large':['Arket er større end 1.000 rækker eller 100 kolonner. Vælg et mindre ark.','The sheet exceeds 1,000 rows or 100 columns. Choose a smaller sheet.'],
 'empty-document':['Ingen læsbar tekst fundet. Kontrollér filen eller vælg originalvisning for PDF.','No readable text found. Check the file or choose the original PDF view.'],
 'pdf-too-many-pages':['PDF må højst have 150 sider.','PDF files may contain up to 150 pages.'],
 'invalid-document':['Dokumentet kunne ikke læses. Prøv at eksportere det igen.','The document could not be read. Try exporting it again.']};
 return (messages[error.message]||["Kunne ikke gennemføre: "+error.message,'Could not complete: '+error.message])[this.lang()==='da'?0:1];
};
Instant.prototype.run=async function(fn){if(this.busy)return;this.busy=true;this.error='';this.notice='';this.draw();try{await fn();}catch(e){this.error=this.message(e);}finally{this.busy=false;this.draw();}};
Instant.prototype.analyse=async function(){const epoch=++this.epoch;this.result=null;this.plan=[];this.options.en=this.lang()==='en';const result=await readers.read(this.file,{...this.options,sourceUrl:this.sourceUrl},p=>{if(this.status)this.status.textContent=this.t('Læser ','Reading ')+p;});if(epoch!==this.epoch)return;this.result=result;this.plan=result.sections.map(s=>({title:s.title,splitBefore:true}));if(result.requireSource)this.attach=true;};
Instant.prototype.warnings=function(){const w=this.result.warning,da=this.lang()==='da';return ({
 'office-text':['Overskrifter, tekst, lister og tabeller er med. Billeder vises som markører; layout, noter og indlejrede objekter genskabes ikke. Behold originalen for at se dem.','Headings, text, lists and tables are included. Images become placeholders; layout, notes and embedded objects are not recreated. Keep the original to view them.'],
 'html-images':['Tekst og struktur importeres. Billeder bliver til tekstmarkører. Scripts, formularer og indlejret aktivt indhold fjernes.','Text and structure are imported. Images become text placeholders. Scripts, forms and embedded active content are removed.'],
 'local-text':['Gennemse opdelingen før du opretter wikien. Markdown læses som tekst med overskrifter.','Review the split before creating your wiki. Markdown is read as text with headings.'],
 'sheet-values':['Vælg ark og kolonner nedenfor. Kun celleværdier importeres; formler, diagrammer og formatering følger ikke med.','Choose a sheet and columns below. Only cell values are imported; formulas, charts and formatting are not included.'],
 'pdf-text':['Én tiddler pr. side. PDF-tekst kan have forkert læserækkefølge, især i spalter. Billeder findes i originalen.','One tiddler per page. PDF reading order can be imperfect, especially in columns. Images remain in the original.'],
 'pdf-missing-text':['Nogle sider mangler læsbar tekst. Der udføres ikke OCR. Behold originalen og kontrollér siderne.','Some pages have no readable text. No OCR is performed. Keep the original and check the pages.'],
 'pdf-source':['Original PDF bevares. Der udføres ikke OCR; skannede sider bliver ikke til redigerbar tekst.','The original PDF is retained. No OCR is performed; scanned pages do not become editable text.']})[w]?.[da?0:1]||'';};
Instant.prototype.draw=function(){
 this.box.replaceChildren();this.el('h2',this.t('Fra dokument til din egen wiki','From document to your own wiki'));
 this.el('p',this.t('Vælg et dokument, gennemse afsnittene og hent en rigtig TiddlyWiki. Filen behandles på din computer — den uploades ikke til Forge.','Choose a document, review its sections and download a real TiddlyWiki. The file is processed on your computer — it is not uploaded to Forge.'));
 this.el('p',this.t('Testudgave · PDF, Word (DOCX), ODT, tekst, HTML og regneark · Højst 20 MB.','Test release · PDF, Word (DOCX), ODT, text, HTML and spreadsheets · Up to 20 MB.'),null,{class:'iw-note'});
 this.status=this.el('p',this.busy?this.t('Arbejder…','Working…'):this.notice||'',null,{role:'status','aria-live':'polite'});
 if(this.error)this.el('p',this.error,null,{role:'alert'});
 const sources=this.el('fieldset');this.el('legend',this.t('1 · Vælg dokument','1 · Choose a document'),sources);
 const label=this.el('label',this.t('Fil fra din computer','File from your computer'),sources),input=this.el('input',undefined,label,{type:'file',accept:'.pdf,.docx,.odt,.txt,.md,.html,.htm,.xlsx,.xls,.ods,.csv,.tsv'});input.disabled=!!this.busy;
 input.addEventListener('change',()=>{if(input.files[0])this.run(async()=>{this.file=input.files[0];this.sourceUrl='';this.name=this.file.name.replace(/\.[^.]+$/,'');this.attach=true;await this.analyse();});});
 this.field('Eller et offentligt dokumentlink','Or a public document URL',this.url,v=>{this.url=v;},sources,'url');
 this.button('Hent dokument','Fetch document',()=>this.run(async()=>{this.result=null;const got=await readers.fetchDocument(this.url||'');this.file=got.file;this.sourceUrl=got.url;this.name=this.file.name.replace(/\.[^.]+$/,'');this.attach=true;await this.analyse();}),sources);
 if(!this.result)return;
 this.el('p',this.file.name+' · '+this.warnings());
 const settings=this.el('fieldset');this.el('legend',this.t('2 · Gennemse og tilpas','2 · Review and adjust'),settings);
 this.field('Dokumentets navn','Document name',this.name,v=>{this.name=v;},settings);
 this.field('Fælles tag (valgfrit)','Shared tag (optional)',this.tag,v=>{this.tag=v;},settings);
 const reparse=(key,value)=>this.run(async()=>{this.options[key]=value;await this.analyse();});
 if(this.result.sheet){const sh=this.result.sheet;
  this.select('Ark','Sheet',sh.names.map(n=>[n,n]),sh.name,v=>reparse('sheetName',v),settings);
  this.select('Opdeling','Split',[['auto','Automatisk','Automatic'],['rows','Én tiddler pr. række','One tiddler per row'],['table','Hele arket som tabel','Whole sheet as a table']],this.options.sheetMode,v=>reparse('sheetMode',v),settings);
  this.field('Række med kolonnenavne (1–1000)','Header row (1–1000)',sh.headerRow,v=>reparse('headerRow',v),settings,'number');
  this.select('Kolonne til titel','Title column',sh.headers.map((h,i)=>[String(i),h]),String(sh.titleColumn),v=>reparse('titleColumn',v),settings);
  this.select('Kolonne til tags','Tag column',[['-1','Ingen','None'],...sh.headers.map((h,i)=>[String(i),h])],String(sh.tagColumn),v=>reparse('tagColumn',v),settings);
  const cols=this.el('div','',settings);this.el('p',this.t('Indholdskolonner','Content columns'),cols);sh.headers.forEach((h,i)=>this.check(h,h,sh.textColumns.includes(i),v=>reparse('textColumns',v?[...sh.textColumns,i]:sh.textColumns.filter(c=>c!==i)),cols));
 }else if(this.result.source.type==='pdf')this.select('PDF','PDF',[['auto','Automatisk','Automatic'],['text','Tekst pr. side','Text per page'],['source','Behold kun originalen','Keep only the original']],this.options.pdfMode,v=>reparse('pdfMode',v),settings);
 else {this.select('Opdeling','Split',[['auto','Automatisk','Automatic'],['headings','Overskrifter','Headings'],['semantic','Afsnit og fremhævede indledninger','Sections and bold leads'],['detailed','Hver tekstblok','Every text block']],this.options.splitMode,v=>reparse('splitMode',v),settings);this.check('Del også listepunkter','Split list items too',!!this.options.splitListItems,v=>reparse('splitListItems',v),settings);}
 this.el('p',this.t('Et flueben starter en ny tiddler. Fjern det for at samle afsnittet med det foregående. Teksten bevares. Ændring af opdelingen nulstiller titelrettelserne.','A checkmark starts a new tiddler. Clear it to merge with the previous section. Text is retained. Changing split settings resets title edits.'),settings);
 this.button('Alle forslag','All suggestions',()=>{this.plan.forEach(p=>p.splitBefore=true);this.draw();},settings);
 this.button('Saml i én','Merge into one',()=>{this.plan.forEach((p,i)=>p.splitBefore=i===0);this.draw();},settings);
 const preview=this.el('ol','',settings,{class:'iw-preview'});
 this.result.sections.forEach((s,i)=>{const row=this.el('li','',preview),check=this.check('Ny tiddler','New tiddler',this.plan[i].splitBefore,v=>{this.plan[i].splitBefore=v;},row);if(i===0)check.disabled=true;
  this.field('Titel '+(i+1),'Title '+(i+1),this.plan[i].title,v=>{this.plan[i].title=v;},row);
  const details=this.el('details','',row);this.el('summary',this.t('Se afsnit','View section'),details);
  // Preview is plain text, never executable source HTML or WikiText.
  const d=this.document.createElement('template');d.innerHTML=s.text;this.el('pre',d.content.textContent||this.t('Se originalfilen.','See the original file.'),details);
 });
 const attach=this.check('Medtag originalfilen i wikien','Include the original file in the wiki',!!this.attach,v=>{this.attach=v;},settings);if(this.result.requireSource)attach.disabled=true;
 this.el('p',this.t('Originalen kan indeholde flere eller private oplysninger, som ikke ses i uddraget. Del kun en wiki med originalen, hvis hele dokumentet må deles.','The original may contain additional or private information absent from the excerpt. Share a wiki with the original only if the whole document may be shared.'),settings,{class:'iw-note'});
 const output=this.el('fieldset');this.el('legend',this.t('3 · Opret eller importér','3 · Create or import'),output);
 if(this.choices)this.select('Edition','Edition',[['','En enkel TiddlyWiki','A simple TiddlyWiki'],...this.choices.editions.map(e=>[e.id,e.name+' · '+e.status])],this.edition||'',v=>{this.edition=v;},output);
 else this.button('Vælg en Edition (kræver internet)','Choose an Edition (requires internet)',()=>this.run(()=>this.loadChoices()),output);
 this.button('Skab og hent wiki','Create and download wiki',()=>this.run(()=>this.createWiki()),output);
 this.button('Importér i denne wiki…','Import into this wiki…',()=>this.run(()=>this.importHere()),output);
 this.el('p',this.t('Import åbner TiddlyWikis egen kontrol, før noget tilføjes. Gem bagefter med wikiens almindelige Gem-knap. En ny wiki kræver adgang til Forge; import i denne wiki virker også offline.','Import opens TiddlyWiki’s own review before anything is added. Afterwards use the wiki’s normal Save button. Creating a new wiki needs access to Forge; importing here also works offline.'),output);
};
Instant.prototype.base=function(){return 'https://forge.xn--mns-ula.dk/assembler/';};
Instant.prototype.loadChoices=async function(){this.composer=await import(new URL('compose.mjs',this.base()).href);this.assembler=await import(new URL('assemble.mjs',this.base()).href);this.choices=await this.composer.loadChoices(this.base());};
Instant.prototype.documentTiddlers=async function(existing){let sourceAsset=null;if(this.attach){const bytes=new Uint8Array(await this.file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));sourceAsset={name:this.file.name,type:this.result.source.type==='pdf'?'application/pdf':'application/octet-stream',text:btoa(binary)};}
 const output=model.createTiddlers({sections:this.result.sections,plan:this.plan,source:this.result.source,name:this.name,tag:this.tag,existing,sourceAsset,now:$tw.utils.stringifyDate(new Date()),id:crypto.randomUUID()});
 if(this.result.requireSource){const doc=output.tiddlers[0],part=output.tiddlers[1];part['instant-source-file']=doc['instant-source-file'];part.text='<$transclude tiddler={{!!instant-source-file}}/>';}
 return output;
};
// TiddlyWiki's JSON importer only normalizes built-in list fields. Serialize
// custom lists too, so titles containing spaces survive native import.
function stringifyFields(t){return Object.fromEntries(Object.entries(t).filter(([,v])=>v!==undefined).map(([k,v])=>[k,Array.isArray(v)?$tw.utils.stringifyList(v):String(v)]));}
Instant.prototype.importHere=async function(){const output=await this.documentTiddlers(this.wiki.filterTiddlers('[all[tiddlers+shadows]]'));this.dispatchEvent({type:'tm-import-tiddlers',param:JSON.stringify(output.tiddlers.map(stringifyFields)),autoOpenOnImport:'yes'});this.notice=this.t('Kontrollér tiddlerne i importvinduet.','Review the tiddlers in the import window.');};
Instant.prototype.createWiki=async function(){
 if(!this.choices)await this.loadChoices();
 const composed=await this.composer.composeWiki({choices:this.choices,editionId:this.edition||'',packageTitles:[PLUGIN],name:this.name,language:this.lang()==='da'?'da-DK':'en-GB'});
 const titles=new Set(composed.tiddlers.map(t=>t.title));for(const p of composed.tiddlers.filter(t=>t['plugin-type']))for(const t of Object.keys(JSON.parse(p.text).tiddlers||{}))titles.add(t);
 const output=await this.documentTiddlers([...titles]);
 composed.tiddlers.push(...output.tiddlers.map(stringifyFields));
 const defaults=composed.tiddlers.find(t=>t.title==='$:/DefaultTiddlers');defaults.text=$tw.utils.stringifyList([output.root]);
 const core=await this.assembler.loadOfficialCore(this.base());const html=this.assembler.assembleHtml(core.html,composed.tiddlers);
 const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const a=this.el('a','',null,{href:url,download:(this.name||'InstantWiki').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)+'.html'});a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 this.notice=this.t('Wikien er hentet. Åbn HTML-filen, kontrollér indholdet, og brug wikiens Gem-knap efter ændringer.','Your wiki has downloaded. Open the HTML file, check its contents, and use its Save button after editing.');
};
exports['forge-instantwiki']=Instant;
