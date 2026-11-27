/*\
title: $:/plugins/huwiki/abc/search-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
'use strict';
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var Widget=require('$:/core/modules/widgets/widget.js').widget;
var Score=require('$:/plugins/huwiki/abc/score-widget.js')['huwiki-abc'];
var data=require('$:/plugins/huwiki/abc/session-data.js');
var jazz=require('$:/plugins/huwiki/abc/jazz-catalog.js');
var balkan=require('$:/plugins/huwiki/abc/balkan-catalog.js');
var loader=require('$:/plugins/huwiki/abc/loader.js');
var banks=require('$:/plugins/huwiki/abc/musescore-bank.js');
var repertoire=require('$:/plugins/huwiki/abc/repertoire-catalog.js');
var serial=0;
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn){var b=el('button','huwabc-btn',text);b.type='button';b.onclick=fn;return b;}
function link(text,url){var a=el('a','',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function bankText(wiki,da,en){var language=wiki.getTiddlerText?wiki.getTiddlerText('$:/language',''):'';return /\/en(?:-|$)/i.test(language)?en:da;}
function Search(node,options){this.initialise(node,options);this.temp='$:/temp/huwiki/abc/search/'+(++serial);this.pending={};this.cache={};this.seq={};this.bankSelection={};}
Search.prototype=new Widget();
Search.prototype.render=function(parent,next){
 this.parentDomNode=parent;this.computeAttributes();var self=this;
 var host=this.host=el('section','huwabc-search');parent.insertBefore(host,next);this.domNodes.push(host);
 var initial=this.getAttribute('source','repertoire');
 if(initial.indexOf('bank:')!==0)host.appendChild(el('h2','',bankText(this.wiki,'Find musik','Find music')));
 host.appendChild(el('p','huwabc-search-intro',bankText(this.wiki,'Find originalnoder, sammenlign versioner og vælg de stemmer, du vil bruge.','Find original scores, compare versions and choose the parts you need.')));
 var form=el('form','huwabc-search-form');
 var source=this.source=el('select','huwabc-select');source.setAttribute('aria-label','Musikbibliotek');
 [['repertoire',bankText(this.wiki,'Fælles nodebibliotek · Leadsheets og repertoire','Shared score library · Leadsheets and repertoire')],['session','The Session'],['ian','Ian Hayden · jazzstandards'],['balkan','Balkan, Klezmer & Østeuropa · JamBuddy'],['abcnotation','ABCnotation.com']].forEach(function(pair){var op=el('option','',pair[1]);op.value=pair[0];source.appendChild(op);});
 banks.list(this.wiki).forEach(function(bank){var op=el('option','',bank.name+' · MuseScore');op.value='bank:'+bank.id;source.appendChild(op);});
 if(Array.from(source.options).some(function(op){return op.value===initial;}))source.value=initial;
 var q=this.query=el('input','huwabc-input');q.type='search';q.placeholder='Søg på titel, fx Kesh';q.setAttribute('aria-label','Søg efter melodititel');q.maxLength=150;
 var type=this.type=el('select','huwabc-select');type.setAttribute('aria-label','Meloditype');var all=el('option','','Alle typer');all.value='';type.appendChild(all);
 Object.keys(data.meters).sort().forEach(function(k){var o=el('option','',k);o.value=k;type.appendChild(o);});
 var libraryField=el('label','huwabc-library-field');libraryField.append(el('span','',bankText(this.wiki,'Samling','Collection')),source);
 var typeField=this.typeField=el('label','huwabc-type-field');typeField.append(el('span','','Meloditype'),type);
 var libraryKind=this.libraryKind=el('select','huwabc-select');libraryKind.setAttribute('aria-label','Nodeformat i biblioteket');
 [['all','Alle numre'],['leadsheet','Leadsheets (ABC)'],['abc','Alle ABC-udgaver'],['pdf','Numre med PDF']].forEach(function(p){var o=el('option','',p[1]);o.value=p[0];libraryKind.appendChild(o);});libraryKind.value='all';libraryKind.hidden=true;libraryKind.onchange=function(){self.search(1);};
 var queryRow=el('div','huwabc-search-query'),go=el('button','huwabc-btn huwabc-primary','Søg');go.type='submit';queryRow.append(q,go);form.append(libraryField,typeField,libraryKind,queryRow);host.appendChild(form);
 this.overview=el('section','huwabc-collection-overview');host.appendChild(this.overview);
 this.bankCart=el('div','huwabc-search-save');this.bankCart.hidden=true;
 this.bankImport=button('',function(){self.loadBankItems(Object.keys(self.bankSelection).map(function(k){return self.bankSelection[k];}));});
 this.bankClear=button(bankText(this.wiki,'Ryd valg','Clear selection'),function(){self.bankSelection={};self.updateBankSelection();if(self.source.value.indexOf('bank:')===0)self.searchBank();});
 this.bankCart.append(this.bankImport,this.bankClear);host.appendChild(this.bankCart);this.updateBankSelection();
 this.status=el('p','huwabc-status');this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');host.appendChild(this.status);
 this.results=el('div','huwabc-search-results');this.results.setAttribute('aria-label','Søgeresultater');host.appendChild(this.results);
 this.info=el('div','huwabc-search-info');host.appendChild(this.info);
 this.preview=el('div','huwabc-search-preview');host.appendChild(this.preview);
 form.onsubmit=function(e){e.preventDefault();self.search(1);};
 source.onchange=function(){self.sourceChanged();};this.sourceChanged();this._localeObserver=I18n.observe(host,this.wiki);
};
Search.prototype.get=async function(kind,path){
 if(this.pending[kind])this.pending[kind].abort();var controller=new AbortController(),self=this,n=(this.seq[kind]||0)+1;this.seq[kind]=n;this.pending[kind]=controller;
 var timeout=setTimeout(function(){controller.abort();},15000);
 try{var result=await data.request(path,controller.signal);if(this.seq[kind]!==n||!this.host.isConnected)return null;return result;}
 catch(e){if(this.seq[kind]===n&&this.host.isConnected)throw new Error(e.name==='AbortError'?'Forbindelsen tog for lang tid. Prøv igen.':e.message==='Failed to fetch'?'Kan ikke hente fra The Session. Kontrollér internetforbindelsen og prøv igen.':e.message);return null;}
 finally{clearTimeout(timeout);if(self.pending[kind]===controller)delete self.pending[kind];}
};
Search.prototype.search=async function(page){
 if(this.host)this.host.classList.add('huwabc-has-results');
 if(this.source.value==='repertoire')return this.searchRepertoire(page||1);
 if(this.source.value.indexOf('bank:')===0)return this.searchBank(page||1);
 if(this.source.value==='ian')return this.searchIan();
 if(this.source.value==='balkan')return this.searchBalkan();
 if(this.source.value==='abcnotation')return this.searchABCNotation();
 var self=this,q=this.query.value.trim();if(!q){this.status.textContent='Skriv en titel for at søge.';this.query.focus();return;}
 if(page===1){this.searchQuery=q;this.searchType=this.type.value;}
 this.status.textContent='Søger i The Session …';this.results.setAttribute('aria-busy','true');
 try{var d=await this.get('search','/tunes/search?format=json&q='+encodeURIComponent(this.searchQuery)+'&type='+encodeURIComponent(this.searchType)+'&page='+page);if(!d)return;
 if(!Array.isArray(d.tunes))throw new Error('Svaret fra The Session kunne ikke læses. Prøv igen.');
 this.results.textContent='';this.status.textContent=d.tunes.length?d.total+(Number(d.total)===1?' resultat · side ':' resultater · side ')+d.page+' af '+d.pages:'Ingen melodier fundet. Prøv en anden titel.';
 d.tunes.forEach(function(t){var row=el('div','huwabc-search-row'),label=el('div');label.appendChild(el('strong','',t.name));label.appendChild(el('div','huwabc-muted',t.type+' · The Session'+(t.alias?' · også kendt som '+t.alias:'')));row.append(label,button('Info',function(){self.detail(t.id);}));self.results.appendChild(row);});
 if(d.pages>1){var nav=el('div','huwabc-search-nav'),prev=button('Forrige side',function(){self.search(page-1);}),next=button('Næste side',function(){self.search(page+1);});prev.disabled=page<=1;next.disabled=page>=d.pages;nav.append(prev,next);this.results.appendChild(nav);}
 }catch(e){this.status.textContent=e.message;}finally{this.results.removeAttribute('aria-busy');}
};
Search.prototype.detail=async function(id){
 var self=this;this.status.textContent='Henter oplysninger …';
 // A new selection invalidates a pending previous detail, including cache hits.
 if(this.pending.detail)this.pending.detail.abort();this.seq.detail=(this.seq.detail||0)+1;
 try{var t=this.cache[id]||await this.get('detail','/tunes/'+encodeURIComponent(id)+'?format=json');if(!t)return;
 if(!Array.isArray(t.settings))throw new Error('Melodiens versioner kunne ikke læses.');this.cache[id]=t;this.info.textContent='';
 this.info.appendChild(el('h3','',t.name));this.info.appendChild(el('p','huwabc-muted',t.type+' · '+t.settings.length+' versioner'));
 if(t.aliases&&t.aliases.length){var aliases=el('details','huwabc-muted');aliases.appendChild(el('summary','','Andre titler ('+t.aliases.length+')'));aliases.appendChild(el('p','',t.aliases.join(' · ')));this.info.appendChild(aliases);}
 this.info.appendChild(link('Se melodien på The Session',data.source(t)));
 if(!t.settings.length){this.status.textContent='Melodien har ingen versioner med ABC-noder.';return;}
 var label=el('label','huwabc-field'),select=el('select','huwabc-select');label.appendChild(el('span','','Version'));select.setAttribute('aria-label','Version fra The Session');
 t.settings.forEach(function(s,i){var o=el('option','',(i+1)+' · '+s.key+' · '+((s.member||{}).name||'Ukendt bidragyder'));o.value=i;select.appendChild(o);});label.appendChild(select);this.info.appendChild(label);
 var meta=el('p','huwabc-muted'),source=el('div'),open=button('Åbn i afspilleren',function(){self.load(t,t.settings[+select.value]);});open.classList.add('huwabc-primary');
 function update(){var s=t.settings[+select.value];meta.textContent='Taktart: '+(data.meters[t.type]||'ukendt')+' · Toneart: '+s.key+' · Indsendt: '+data.oneLine(s.date);source.textContent='';source.appendChild(link('Kilde til denne version',data.source(t,s)));}
 select.onchange=update;update();this.info.append(meta,source,open);this.status.textContent='Vælg en version og åbn den i afspilleren.';this.info.scrollIntoView({block:'nearest'});
 }catch(e){this.status.textContent=e.message;}
};
Search.prototype.load=function(t,s){
 try{this.openFields(data.fields(t,s),t.name+' · '+s.key,'The Session · version '+s.id+' af '+((s.member||{}).name||'ukendt'));}
 catch(e){this.status.textContent=e.message;}
};
Search.prototype.openFields=function(fields,heading,description){
 var self=this;try{
  if(this.score)this.score.onDestroy();this.preview.textContent='';this.children=[];
  this.wiki.addTiddler(new $tw.Tiddler(fields,{title:this.temp}));
  this.preview.appendChild(el('h3','',heading));this.preview.appendChild(el('p','huwabc-muted','Forhåndsvisning · '+description+'. Gem som tiddler for at redigere.'));
  var saveRow=el('div','huwabc-search-save'),name=el('input','huwabc-input');name.value=loader.header(fields['abc-source'],'T')||heading.split(' · ')[0];name.setAttribute('aria-label','Navn på den nye tiddler');
  var saved=el('p','huwabc-status'),save=button('Gem som tiddler',function(){
   var title=data.uniqueTitle(self.wiki,name.value),current=self.wiki.getTiddler(self.temp);if(!current)return;
   self.wiki.addTiddler(new $tw.Tiddler(current,self.wiki.getCreationFields(),self.wiki.getModificationFields(),{title:title}));name.value=title;save.disabled=true;saved.textContent='Gemt som “'+title+'”. Husk at gemme HTML-filen.';
   saved.appendChild(button('Åbn gemt tiddler',function(){self.dispatchEvent({type:'tm-navigate',navigateTo:title,navigateFromTitle:self.getVariable('currentTiddler'),navigateFromNode:self});}));
  });saveRow.append(name,save);this.preview.append(saveRow,saved);
  var scoreHost=el('div');this.preview.appendChild(scoreHost);
  this.score=new Score({type:'huwiki-abc',attributes:{tiddler:{type:'string',value:this.temp},preview:{type:'string',value:'yes'}}},{wiki:this.wiki,parentWidget:this,document:this.document});this.children=[this.score];this.score.render(scoreHost,null);
  this.status.textContent='Melodien er indlæst. Tryk Afspil nedenfor.';this.preview.scrollIntoView({block:'start'});
 }catch(e){this.status.textContent=e.message;}
};
Search.prototype.sourceChanged=function(){
 var which=this.source.value;
 if(this.pending.search)this.pending.search.abort();if(this.pending.detail)this.pending.detail.abort();
 this.seq.search=(this.seq.search||0)+1;this.seq.detail=(this.seq.detail||0)+1;
 this.searchEpoch=(this.searchEpoch||0)+1;
 this.type.hidden=which!=='session';this.type.disabled=which!=='session';if(this.typeField)this.typeField.hidden=which!=='session';
 if(this.libraryKind)this.libraryKind.hidden=which!=='repertoire';
 this.query.placeholder=which==='session'?'Søg på titel, fx Kesh':which==='ian'?'Søg på jazzstandard, fx Just Friends':which==='balkan'?'Søg på Balkanmelodi, fx Pajdusko':'Søg på ABCnotation, fx Autumn Leaves';
 this.results.textContent='';this.info.textContent='';this.status.textContent=which==='ian'?'Søg i Ian Haydens jazzsamling. Kataloget indlæses fra GitHub.':which==='balkan'?'Søg i JamBuddys Balkanindeks (Balkan, klezmer og østeuropæiske melodier). Importér én melodi ad gangen med kildeangivelse.':which==='abcnotation'?'Søg på ABCnotation.com og indsæt ABC-teksten fra den valgte melodi.':'Søg i The Sessions offentlige melodisamling.';
 if(which.indexOf('bank:')===0){this.query.placeholder=bankText(this.wiki,'Søg i nodearkivet …','Search the score archive …');this.status.textContent='';}
 if(which==='repertoire'){this.query.placeholder=bankText(this.wiki,'Søg på tværs af repertoire, titel eller komponist …','Search repertoire, title or composer …');this.status.textContent='';}
 if(this.pending.catalogue)this.pending.catalogue.abort();
 this.bankLoadEpoch=(this.bankLoadEpoch||0)+1;
 if(this.bankImporter){this.bankImporter.onDestroy();this.bankImporter=null;this.children=[];this.preview.textContent='';}
 if(this.host)this.host.classList.remove('huwabc-has-results');
 this.bankSort='title';this.showCollectionOverview();
};
Search.prototype.showCollectionOverview=async function(){
 var self=this,which=this.source.value,epoch=this.searchEpoch;if(!this.overview)return;
 this.overview.textContent='';
 if(which==='repertoire'){
  this.overview.appendChild(el('p','huwabc-muted',bankText(this.wiki,'Alle publicerede repertoirer og numrene i denne wiki. Åbn en færdig ABC-udgave, eller vælg original-PDF.','All published repertoires and the tunes in this wiki. Open a converted ABC version or choose the original PDF.')));
  var browse=button(bankText(this.wiki,'Vis alle numre','Browse all tunes'),function(){self.query.value='';self.search(1);});this.overview.appendChild(browse);
  return this.searchRepertoire(1);
 }
 if(which==='session'||which==='abcnotation'){
  this.overview.appendChild(el('p','huwabc-muted',bankText(this.wiki,'Du behøver ikke kende en titel. Åbn kildens melodioversigt for at finde titler, og søg derefter her.','You do not need to know a title. Browse the source collection to discover tunes, then search here.')));
  this.overview.appendChild(link(bankText(this.wiki,'Gennemse samlingen','Browse the collection'),which==='session'?'https://thesession.org/tunes':'https://abcnotation.com/'));
  if(which==='session')this.overview.appendChild(el('p','huwabc-muted',bankText(this.wiki,'Irsk og beslægtet folkemusik: jigs, reels, hornpipes, polkaer og valse. Vælg meloditype i feltet ovenfor for at afgrænse en titelsøgning.','Irish and related traditional music: jigs, reels, hornpipes, polkas and waltzes. Use the tune-type selector above to narrow a title search.')));
  return;
 }
 this.overview.appendChild(el('p','huwabc-muted',bankText(this.wiki,'Henter katalogoversigt …','Loading catalogue overview …')));
 try{
  var index,groups,facets={},examples=[],count=0;
  if(which.indexOf('bank:')===0){
   index=await banks.index(which.slice(5),this.wiki);groups=banks.filter(index,'');count=groups.length;
   groups.forEach(function(g){var e=g.preferred;['composer','meter','key'].forEach(function(k){var value=e[k];if(value)facets[value]=(facets[value]||0)+1;});(e.instruments||[]).forEach(function(value){if(value&&value!=='.')facets[value]=(facets[value]||0)+1;});});
   examples=groups.slice().sort(function(a,b){return String(b.preferred.date).localeCompare(String(a.preferred.date));}).slice(0,6).map(function(g){return {title:g.title,date:g.preferred.date};});
  }else if(which==='ian'){
   var jazzItems=await jazz.list();count=jazzItems.length;examples=jazzItems.filter(function(_,i){return i%Math.max(1,Math.floor(count/6))===0;}).slice(0,6).map(function(e){return {title:e.title};});
  }else if(which==='balkan'){
   var balkanItems=await balkan.list();count=balkanItems.length;
   balkanItems.forEach(function(e){[e.category,e.meter,e.key].forEach(function(value){if(value)facets[value]=(facets[value]||0)+1;});});
   examples=balkanItems.filter(function(_,i){return i%Math.max(1,Math.floor(count/6))===0;}).slice(0,6).map(function(e){return {title:e.titles[0]};});
  }
  if(epoch!==this.searchEpoch||which!==this.source.value||!this.host.isConnected)return;
  this.overview.textContent='';var bar=el('div','huwabc-overview-bar'),actions=el('div','huwabc-browse-actions');
  bar.appendChild(el('span','huwabc-collection-count',count+' '+bankText(this.wiki,'numre i samlingen','tunes in the collection')));
  var allButton=button(bankText(this.wiki,'Vis alle numre','Browse all tunes'),function(){self.query.value='';self.bankSort='title';self.search(1);});allButton.classList.add('huwabc-browse-action');actions.appendChild(allButton);
  if(groups){var recentButton=button(bankText(this.wiki,'Senest opdaterede','Recently updated'),function(){self.query.value='';self.bankSort='recent';self.search(1);});recentButton.classList.add('huwabc-browse-action');actions.appendChild(recentButton);}
  bar.appendChild(actions);this.overview.appendChild(bar);
  if(Object.keys(facets).length){
   var filters=el('details','huwabc-filters'),chips=el('div','huwabc-filter-chips');filters.appendChild(el('summary','',bankText(this.wiki,'Filtre','Filters')));
   Object.keys(facets).sort(function(a,b){return facets[b]-facets[a];}).slice(0,12).forEach(function(value){var chip=button('',function(){self.query.value=value;self.search(1);});chip.classList.add('huwabc-filter-chip');chip.append(el('span','',value),el('span','huwabc-chip-count',String(facets[value])));chips.appendChild(chip);});filters.appendChild(chips);this.overview.appendChild(filters);
  }
  var suggestions=el('section','huwabc-collection-suggestions'),suggestionList=el('div','huwabc-suggestion-list');suggestions.appendChild(el('h3','',groups?bankText(this.wiki,'Seneste tilføjelser','Recent additions'):bankText(this.wiki,'Prøv et nummer','Try a tune')));
  examples.forEach(function(example){var pick=button('',function(){self.query.value=example.title;self.search(1);});pick.classList.add('huwabc-suggestion');pick.appendChild(el('span','huwabc-suggestion-title',example.title));if(example.date)pick.appendChild(el('span','huwabc-suggestion-date',example.date));suggestionList.appendChild(pick);});suggestions.appendChild(suggestionList);this.overview.appendChild(suggestions);
 }catch(e){if(epoch===this.searchEpoch)this.overview.textContent=bankText(this.wiki,'Oversigten kunne ikke hentes: ','Could not load the overview: ')+e.message;}
};
Search.prototype.searchRepertoire=async function(page){
 var self=this,epoch=++this.searchEpoch,query=this.query.value.trim(),kind=this.libraryKind&&this.libraryKind.value||'all';
 this.results.textContent='';this.info.textContent='';this.status.textContent=bankText(this.wiki,'Henter det fælles nodebibliotek …','Loading the shared score library …');this.results.setAttribute('aria-busy','true');
 try{
  var index=await repertoire.index(this.wiki);if(epoch!==this.searchEpoch||this.source.value!=='repertoire'||!this.host.isConnected)return;
  var found=repertoire.filter(index,query,kind),pages=Math.max(1,Math.ceil(found.length/50));page=Math.max(1,Math.min(page,pages));
  this.status.textContent=found.length+' '+bankText(this.wiki,'numre fundet','tunes found')+(index.warning?' · '+index.warning:'');
  found.slice((page-1)*50,page*50).forEach(function(group){
   var row=el('div','huwabc-search-row'),info=el('div');info.appendChild(el('strong','',group.title));
   var abc=group.variants.filter(function(v){return v.format==='abc';}),pdf=group.variants.filter(function(v){return v.format==='pdf';});
   info.appendChild(el('div','huwabc-muted',group.collections.join(' · ')+' · '+(abc.length?abc.length+' ABC':'')+(pdf.length?' · '+pdf.length+' PDF':'')));
   row.appendChild(info);row.appendChild(button(abc.length?bankText(self.wiki,'Åbn ABC / vælg udgave','Open ABC / choose version'):bankText(self.wiki,'Se nodekilder','View score sources'),function(){self.openRepertoire(group);}));self.results.appendChild(row);
  });
  if(!found.length)this.results.appendChild(el('p','huwabc-muted',bankText(this.wiki,'Prøv en anden titel eller vælg Alle numre. De øvrige samlinger findes i samlingsvælgeren.','Try another title or select All tunes. Other collections are available in the collection selector.')));
  if(pages>1){var nav=el('div','huwabc-search-nav'),previous=button('Forrige side',function(){self.searchRepertoire(page-1);}),next=button('Næste side',function(){self.searchRepertoire(page+1);});previous.disabled=page===1;next.disabled=page===pages;nav.append(previous,el('span','',page+' / '+pages),next);this.results.appendChild(nav);}
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent=e.message;}
 finally{if(epoch===this.searchEpoch)this.results.removeAttribute('aria-busy');}
};
Search.prototype.openRepertoire=function(group){
 var self=this,epoch=this.searchEpoch,variants=group.variants.filter(function(v){return v.format==='abc';});
 this.repertoireSelection=(this.repertoireSelection||0)+1;var selection=this.repertoireSelection;
 if(this.score){this.score.onDestroy();this.score=null;}this.preview.textContent='';this.children=[];this.info.textContent='';this.info.appendChild(el('h3','',group.title));
 var choose=el('select','huwabc-select');choose.setAttribute('aria-label','ABC-udgave af nummeret');
 variants.forEach(function(v,i){var o=el('option','',[v.label,v.collection,v.key,v.meter].filter(Boolean).join(' · '));o.value=String(i);choose.appendChild(o);});choose.value='0';
 async function open(){
  var variant=variants[+choose.value],request=++self.repertoireLoad;self.status.textContent='Henter ABC-udgaven …';
  try{var fields=await repertoire.load(variant);if(epoch!==self.searchEpoch||selection!==self.repertoireSelection||request!==self.repertoireLoad||!self.host.isConnected)return;
   fields['abc-origin-library']='repertoire';fields['abc-origin-entry']=variant.id;fields['abc-collection']=group.collections.join(' · ');if(variant.sourceURL)fields['abc-origin-url']=variant.sourceURL;
   self.openFields(fields,group.title,variant.label+(variant.collection?' · '+variant.collection:''));
  }catch(e){if(epoch===self.searchEpoch&&selection===self.repertoireSelection)self.status.textContent=e.message;}
 }
 this.repertoireLoad=0;
 if(variants.length){this.info.append(choose,button(bankText(this.wiki,'Åbn ABC-udgaven','Open ABC version'),open));choose.onchange=open;open();}
 group.variants.forEach(function(v){if(v.format==='pdf'&&/^https?:\/\//.test(v.url||''))self.info.appendChild(el('p')).appendChild(link(v.label+' · '+(v.collection||''),v.url));});
 var source=group.sourceURL||group.variants.map(function(v){return v.sourceURL;}).find(Boolean);if(source&&/^https?:\/\//.test(source))this.info.appendChild(el('p')).appendChild(link(bankText(this.wiki,'Åbn nummeret i repertoirewikien','Open tune in its repertoire wiki'),source));
 if(!variants.length)this.status.textContent=bankText(this.wiki,'Ingen færdig ABC-udgave endnu. Vælg en af originalkilderne.','No converted ABC version yet. Choose one of the original sources.');
 this.info.scrollIntoView({block:'nearest'});
};
Search.prototype.updateBankSelection=function(){
 var n=Object.keys(this.bankSelection||{}).length;if(!this.bankCart)return;
 this.bankCart.hidden=!n;this.bankImport.disabled=!n;
 this.bankImport.textContent=bankText(this.wiki,'Åbn valgte i MuseScore-importeren','Open selected in the MuseScore importer')+' ('+n+')';
};
Search.prototype.searchBank=async function(page){
 page=page||1;
 var self=this,id=this.source.value.slice(5),epoch=++this.searchEpoch;
 if(this.pending.search)this.pending.search.abort();var controller=new AbortController();this.pending.search=controller;
 this.host.classList.add('huwabc-has-results');this.results.textContent='';this.info.textContent='';this.results.setAttribute('aria-busy','true');this.status.textContent=bankText(this.wiki,'Henter oplysninger om numrene …','Loading tune metadata …');
 try{
  var index=await banks.index(id,this.wiki,controller.signal);if(epoch!==this.searchEpoch||!this.host.isConnected)return;
  var groups=banks.filter(index,this.query.value),all=banks.filter(index,''),bank={id:index.id,name:index.name};
  if(this.bankSort==='recent')groups.sort(function(a,b){return String(b.preferred.date).localeCompare(String(a.preferred.date))||a.title.localeCompare(b.title);});
  this.status.textContent=groups.length+' / '+all.length+' '+bankText(this.wiki,'numre · vælg oplysninger eller markér de ønskede numre.','tunes · view details or select the tunes you want.');
  groups.slice((page-1)*100,page*100).forEach(function(group){
   var entry=group.matched.find(function(e){return e.preferred;})||group.matched[0],row=el('div','huwabc-search-row'),label=el('label'),check=el('input'),text=el('span'),key=bank.id+':'+group.id;
   check.type='checkbox';check.setAttribute('aria-label',bankText(self.wiki,'Vælg ','Select ')+group.title);check.checked=!!self.bankSelection[key];check.disabled=!/^(mscz|mscx|musicxml|mxl)$/.test(entry.format)||entry.compatibility==='legacy';
   check.onchange=function(){if(check.checked)self.bankSelection[key]={bank:bank,entry:entry};else delete self.bankSelection[key];self.updateBankSelection();};
   text.appendChild(el('strong','',group.title));text.appendChild(el('div','huwabc-muted',[entry.composer,entry.key,entry.meter,entry.voices?entry.voices+' '+bankText(self.wiki,'stemmer','voices'):'',entry.date,group.versions.length+' '+bankText(self.wiki,'version(er)','version(s)'),entry.status].filter(Boolean).join(' · ')));
   label.append(check,text);row.append(label,button(bankText(self.wiki,'Se detaljer','View details'),function(){self.bankChoiceKey=key;self.openBankDetail(bank,group,entry,check);}));self.results.appendChild(row);
  });
  if(groups.length>100){var pages=Math.ceil(groups.length/100),nav=el('div','huwabc-search-nav'),prev=button(bankText(this.wiki,'Forrige side','Previous page'),function(){self.searchBank(page-1);}),next=button(bankText(this.wiki,'Næste side','Next page'),function(){self.searchBank(page+1);});prev.disabled=page<=1;next.disabled=page>=pages;nav.append(prev,el('span','',(page)+' / '+pages),next);this.results.appendChild(nav);}
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent=e.name==='AbortError'?bankText(this.wiki,'Søgningen blev afbrudt.','Search cancelled.'):e.message;}
 finally{if(epoch===this.searchEpoch)this.results.removeAttribute('aria-busy');if(this.pending.search===controller)delete this.pending.search;}
};
Search.prototype.openBankDetail=function(bank,group,initial,checkbox){
 var self=this,key=bank.id+':'+group.id;this.info.textContent='';
 this.info.appendChild(el('h3','',group.title));var choice=el('select','huwabc-select');choice.setAttribute('aria-label',bankText(this.wiki,'Version af nummeret','Tune version'));
 group.versions.forEach(function(entry){var op=el('option','',[entry.date||bankText(self.wiki,'Dato ukendt','Unknown date'),entry.arrangement,entry.contributor,entry.olderVersion?bankText(self.wiki,'tidligere variant','earlier variant'):''].filter(Boolean).join(' · '));op.value=entry.id;choice.appendChild(op);});choice.value=initial.id;
 if(group.versions.length>1)this.info.appendChild(choice);var details=el('div');this.info.appendChild(details);
 function update(){
  var entry=group.versions.find(function(e){return e.id===choice.value;})||initial;details.textContent='';
  var dl=el('dl');
  [[bankText(self.wiki,'Komponist','Composer'),entry.composer],[bankText(self.wiki,'Arrangør','Arranger'),entry.arranger],[bankText(self.wiki,'Toneart i filen','Key in the file'),entry.key],[bankText(self.wiki,'Taktart','Meter'),entry.meter],[bankText(self.wiki,'Stemmer og kildeinstrumenter','Voices and source instruments'),[entry.voices,(entry.instruments||[]).join(' / ')].filter(Boolean).join(' · ')],[bankText(self.wiki,'Kilde og versionsdato','Source and version date'),[entry.sourceFile,entry.date,entry.contributor].filter(Boolean).join(' · ')],[bankText(self.wiki,'Status','Status'),entry.status]].forEach(function(pair){if(pair[1])dl.append(el('dt','',pair[0]),el('dd','',String(pair[1])));});details.appendChild(dl);
  if(entry.warnings&&entry.warnings.length){var warnings=el('details');warnings.appendChild(el('summary','',bankText(self.wiki,'Bemærkninger ved kilden','Source notes')+' ('+entry.warnings.length+')'));entry.warnings.forEach(function(w){warnings.appendChild(el('p','huwabc-muted',w));});details.appendChild(warnings);}
  var supported=/^(mscz|mscx|musicxml|mxl)$/.test(entry.format)&&entry.compatibility!=='legacy';
  if(self.bankSelection[key]){if(supported)self.bankSelection[key]={bank:bank,entry:entry};else delete self.bankSelection[key];self.updateBankSelection();}
  checkbox.checked=!!self.bankSelection[key];checkbox.disabled=!supported;
  checkbox.onchange=function(){if(checkbox.checked)self.bankSelection[key]={bank:bank,entry:entry};else delete self.bankSelection[key];self.updateBankSelection();};
  if(entry.sourcePath)details.appendChild(link(bankText(self.wiki,'Hent originalfil','Download original file'),banks.sourceURL(entry)));
  if(supported){
   details.appendChild(el('p','huwabc-muted',bankText(self.wiki,'Vælg stemmer og takter, kontrollér nodeeksemplet, og godkend derefter i TiddlyWikis importliste.','Choose voices and measures, review the notation, then confirm in TiddlyWiki’s import list.')));
   details.appendChild(button(bankText(self.wiki,'Vælg stemmer og se noder','Choose voices and preview score'),function(){self.loadBankItems([{bank:bank,entry:entry}]);}));
  }else details.appendChild(el('p','huwabc-muted',bankText(self.wiki,'Der er endnu ikke fundet en MuseScore-kilde, som kan åbnes i importeren.','A MuseScore source supported by the importer has not been found yet.')));
  if(self.wiki.filterTiddlers&&entry.sha256){var existing=self.wiki.filterTiddlers('[all[tiddlers]has[abc-origin-sha256]]').filter(function(title){return self.wiki.getTiddler(title).fields['abc-origin-sha256']===entry.sha256;});if(existing.length)details.appendChild(el('p','huwabc-muted',bankText(self.wiki,'Denne kildeversion er allerede importeret som: ','This source version is already imported as: ')+existing.join(', ')));}
 }
 choice.onchange=update;update();this.info.scrollIntoView({block:'nearest'});
};
Search.prototype.loadBankItems=async function(items){
 var self=this,seen=Object.create(null);items=items.filter(function(item){if(seen[item.entry.sha256])return false;seen[item.entry.sha256]=true;return true;});
 if(!items.length||items.length>20){this.status.textContent=bankText(this.wiki,'Vælg mellem 1 og 20 nodefiler.','Choose between 1 and 20 score files.');return;}
 var Importer;try{Importer=require('$:/plugins/huwiki/musescore-import/widget.js')['huwiki-ms-import'];if(typeof Importer!=='function'||!Importer.prototype.openCatalogueFiles)throw Error();}
 catch(_){this.status.textContent=bankText(this.wiki,'Installér eller opdatér MuseScore → ABC Importer (0.1.7 eller nyere) fra Forge Plugin Library, og genindlæs wikien.','Install or update MuseScore → ABC Importer (0.1.7 or later) from Forge Plugin Library and reload the wiki.');return;}
 if(this.pending.catalogue)this.pending.catalogue.abort();var controller=new AbortController(),epoch=this.bankLoadEpoch=(this.bankLoadEpoch||0)+1;this.pending.catalogue=controller;
 this.status.textContent=bankText(this.wiki,'Henter kun de valgte originalfiler …','Fetching only the selected original files …');
 try{
  var files=[];for(var i=0;i<items.length;i++){
   var item=items[i],file=await banks.file(item.entry,controller.signal);if(epoch!==this.bankLoadEpoch||!this.host.isConnected)return;
   files.push({file:file,title:item.entry.title,provenance:banks.provenance(item.bank,item.entry)});
  }
  if(this.score){this.score.onDestroy();this.score=null;}if(this.bankImporter)this.bankImporter.onDestroy();this.preview.textContent='';this.children=[];
  var importer=this.bankImporter=new Importer({type:'huwiki-ms-import',attributes:{}},{wiki:this.wiki,parentWidget:this,document:this.document});this.children=[importer];importer.render(this.preview,null);
  var opened=await importer.openCatalogueFiles(files);if(!opened||epoch!==this.bankLoadEpoch)return;
  this.status.textContent=bankText(this.wiki,'Originalerne er åbnet i importeren. Ingen numre er gemt endnu.','The originals are open in the importer. No tunes have been saved.');this.preview.scrollIntoView({block:'start'});
 }catch(e){if(epoch===this.bankLoadEpoch)this.status.textContent=e.name==='AbortError'?bankText(this.wiki,'Indlæsningen blev afbrudt.','Loading cancelled.'):e.message;}
 finally{if(this.pending.catalogue===controller)delete this.pending.catalogue;}
};
Search.prototype.searchIan=async function(){
 var self=this,q=this.query.value.trim(),epoch=++this.searchEpoch;
 this.results.textContent='';this.info.textContent='';this.status.textContent='Henter jazzkataloget fra GitHub …';
 this.results.setAttribute('aria-busy','true');
 try{
  var all=await jazz.list();if(epoch!==this.searchEpoch||!this.host.isConnected)return;
  var matching=jazz.filter(all,q);this.status.textContent=matching.length+' af '+all.length+' jazznumre matcher søgningen.';
  if(!matching.length){this.results.appendChild(el('p','huwabc-muted','Prøv en anden titel. Se også hele samlingen på GitHub.'));}
  matching.slice(0,80).forEach(function(item){var row=el('div','huwabc-search-row'),info=el('div');info.appendChild(el('strong','',item.title));info.appendChild(el('div','huwabc-muted','Ian Hayden · Jazz songs · ABC'));var action=button('Åbn i afspilleren',function(){self.loadIan(item);});row.append(info,action);self.results.appendChild(row);});
  if(matching.length>80)this.results.appendChild(el('p','huwabc-muted','Viser de første 80 resultater. Skriv mere af titlen for at indsnævre.'));
  this.results.appendChild(link('Se hele samlingen på GitHub','https://github.com/ian-hayden/abc-music-files/tree/main/Jazz%20songs'));
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent=e.name==='AbortError'?'Forespørgslen blev afbrudt.':e.message;}
 finally{this.results.removeAttribute('aria-busy');}
};
Search.prototype.loadIan=async function(item){
 var self=this,epoch=this.searchEpoch;this.status.textContent='Henter ABC-nodearket fra GitHub …';
 try{var abc=await jazz.fetchTune(item);if(epoch!==this.searchEpoch||!this.host.isConnected)return;
  var book=await loader.load().then(function(ABC){return new ABC.TuneBook(abc);});
  var tunes=(book.tunes||[]).filter(function(t){return t.abc&&/K:\s*\S/m.test(t.abc);});
  if(!tunes.length)throw Error('Filen indeholder ingen ABC-melodier, som kan åbnes.');
  this.info.textContent='';this.info.appendChild(el('h3','',item.title));this.info.appendChild(link('Kilde på GitHub',item.html_url||'https://github.com/ian-hayden/abc-music-files'));
  var choose=el('select','huwabc-select');tunes.forEach(function(t,i){var op=el('option','',loader.header(t.abc,'T')||t.title||('Melodi '+(i+1)));op.value=i;choose.appendChild(op);});
  if(tunes.length>1){this.info.appendChild(el('span','huwabc-muted','Vælg melodi i filen: '));this.info.appendChild(choose);}
  function open(){var tune=tunes[+choose.value],text=tune.abc,title=loader.header(text,'T')||item.title;
   var fields={type:'text/vnd.tiddlywiki',tags:['ABC','Musik','Jazz'], 'abc-source':text,'abc-collection':'Ian Hayden · Jazz songs','abc-origin-library':'ian-hayden-jazz','abc-origin-url':item.html_url||'https://github.com/ian-hayden/abc-music-files','abc-rhythm':loader.header(text,'R')||'Jazz','abc-layout':'jazz','abc-accompaniment':JSON.stringify({enabled:true,style:'auto',melodyVolume:100,bassVolume:65,chordVolume:48,drumVolume:38}),text:'Importeret fra Ian Haydens offentlige ABC-samling. Kilde: '+(item.html_url||'https://github.com/ian-hayden/abc-music-files')};
   self.openFields(fields,title,'Ian Hayden · ABC-jazzsamling');
  }
  var openButton=button('Åbn i afspilleren',open);openButton.classList.add('huwabc-primary');this.info.appendChild(openButton);open();
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent=e.message==='Failed to fetch'?'Kunne ikke hente fra GitHub (netværk eller CORS). Prøv igen.':e.message;}
};
// JamBuddy publishes a searchable index, and retains every original source link.
Search.prototype.searchBalkan=async function(){
 var self=this,query=this.query.value.trim(),epoch=++this.searchEpoch;
 this.results.textContent='';this.info.textContent='';this.status.textContent='Henter Balkanbibliotekets søgeindeks …';
 this.results.setAttribute('aria-busy','true');
 try{
  var all=await balkan.list();if(epoch!==this.searchEpoch||!this.host.isConnected)return;
  var matching=balkan.filter(all,query);
  this.status.textContent=matching.length+' af '+all.length+' Balkan-, klezmer- og østeuropæiske versioner matcher.';
  matching.slice(0,100).forEach(function(item){
   var row=el('div','huwabc-search-row'),info=el('div');
   info.appendChild(el('strong','',item.titles[0]));
   info.appendChild(el('div','huwabc-muted',[item.category,item.meter,item.key,'Kilde: '+item.source].filter(Boolean).join(' · ')));
   row.append(info,button('Åbn i afspilleren',function(){self.loadBalkan(item);}));self.results.appendChild(row);
  });
  if(matching.length>100)this.results.appendChild(el('p','huwabc-muted','Viser de første 100. Indsnævr søgningen for at finde flere.'));
  this.results.appendChild(link('Se hele Balkanbiblioteket på JamBuddy','https://jambuddy.live/abc/library/balkan/'));
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent='Balkanbiblioteket kunne ikke hentes: '+(e.name==='AbortError'?'Netværkstimeout.':e.message)+'. Du kan også åbne JamBuddy direkte.';}
 finally{this.results.removeAttribute('aria-busy');}
};
Search.prototype.loadBalkan=async function(item){
 var self=this,epoch=this.searchEpoch;
 this.status.textContent='Henter kun den valgte melodi fra det oprindelige ABC-arkiv …';
 try{
  var source=await balkan.fetchTune(item);if(epoch!==this.searchEpoch||!this.host.isConnected)return;
  var title=loader.header(source,'T')||item.titles[0];
  var meter=loader.header(source,'M')||item.meter||'';
  var rhythm=loader.header(source,'R')||item.category||'';
  var fields={type:'text/vnd.tiddlywiki',tags:['ABC','Musik','Balkan'],
   'abc-source':source,'abc-collection':'JamBuddy · Balkan, Klezmer & Østeuropa',
   'abc-origin-library':'jambuddy-balkan','abc-origin-url':item.url,
   'abc-source-id':item.source||'','abc-meter':meter,'abc-rhythm':rhythm,
   'abc-accompaniment':JSON.stringify({enabled:false,metronome:false,style:'auto'}),
   text:'Importeret fra JamBuddys åbne Balkanindeks. Original ABC-kilde: '+item.url+'\n\nKilde og ophavsret bør kontrolleres inden offentlig deling. Akkompagnement til skæve eller skiftende taktarter er endnu under udvikling.'};
  this.info.textContent='';this.info.appendChild(el('h3','',title));
  this.info.appendChild(el('p','huwabc-muted','Kilde: '+(item.source||'ukendt')+' · Taktart: '+(meter||'ikke angivet')+'. Kun den valgte melodi importeres.'));
  this.info.appendChild(link('Vis ABC-kildefilen',item.url));
  this.info.appendChild(el('p','huwabc-muted','Bemærk: Mange af disse melodier har asymmetriske taktarter. Den nuværende akkompagnementsmotor kan endnu ikke følge dem korrekt. Melodi og nodevisning er stadig tilgængelige.'));
  this.openFields(fields,title,'JamBuddy · kilde '+(item.source||'ukendt'));
 }catch(e){if(epoch===this.searchEpoch)this.status.textContent='Kunne ikke importere ABC fra Balkanarkivet: '+e.message;}
};
Search.prototype.searchABCNotation=function(){
 var self=this,q=this.query.value.trim();if(!q){this.status.textContent='Skriv en titel for at søge på ABCnotation.';return;}
 this.results.textContent='';this.info.textContent='';
 var url='https://abcnotation.com/search?q='+encodeURIComponent(q);
 this.results.appendChild(el('h3','','ABCnotation.com · søgning'));
 this.results.appendChild(el('p','huwabc-muted','ABCnotation tilbyder ikke en dokumenteret browser-API til direkte søgning. Åbn resultaterne, vælg en melodi og kopiér dens ABC-kode fra nodesiden. Den kan derefter åbnes her.'));
 this.results.appendChild(link('Åbn søgeresultater på ABCnotation.com',url));
 var label=el('label','huwabc-field');label.appendChild(el('span','','Indsæt ABC-notationen fra den valgte melodi'));
 var textarea=el('textarea','huwabc-code');textarea.rows=7;textarea.placeholder='X:1\nT:...\nM:4/4\nK:C\n...';label.appendChild(textarea);this.results.appendChild(label);
 var action=button('Åbn ABC-koden i HUWiki',async function(){
  try{
   var raw=textarea.value.trim();if(!raw||!/K:\s*\S/m.test(raw))throw Error('Indsæt ABC-koden med mindst K: (toneart) og selve melodien.');
   if(!/^X:\s*\d+/m.test(raw))raw='X:1\n'+raw;
   var ABC=await loader.load(),book=new ABC.TuneBook(raw),tune=(book.tunes||[])[0];if(!tune||!tune.abc)throw Error('ABC-koden kunne ikke læses.');
   var source=tune.abc,title=loader.header(source,'T')||q;
   var fields={type:'text/vnd.tiddlywiki',tags:['ABC','Musik'],'abc-source':source,'abc-collection':'ABCnotation.com','abc-origin-library':'abcnotation','abc-origin-url':url,'abc-rhythm':loader.header(source,'R'),'abc-layout':'standard',text:'Importeret via ABCnotation.com · søgning: '+url};
   self.openFields(fields,title,'ABCnotation.com · kode indsat af brugeren');
  }catch(e){self.status.textContent=e.message;}
 });action.classList.add('huwabc-primary');this.results.appendChild(action);this.status.textContent='Åbn søgeresultaterne, kopiér ABC-koden, og indsæt den her.';
};
Search.prototype.onDestroy=function(){this.searchEpoch=(this.searchEpoch||0)+1;if(this.score){this.score.onDestroy();this.score=null;}if(this._localeObserver){this._localeObserver.destroy();this._localeObserver=null;}if(this.bankImporter){this.bankImporter.onDestroy();this.bankImporter=null;}this.bankLoadEpoch=(this.bankLoadEpoch||0)+1;var self=this;Object.keys(this.pending).forEach(function(k){self.seq[k]=(self.seq[k]||0)+1;self.pending[k].abort();});this.wiki.deleteTiddler(this.temp);};
Search.prototype.refresh=function(changes){return this.refreshChildren(changes);};
exports['huwiki-abc-search']=Search;
})();

