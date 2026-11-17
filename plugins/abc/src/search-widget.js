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
var serial=0;
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn){var b=el('button','huwabc-btn',text);b.type='button';b.onclick=fn;return b;}
function link(text,url){var a=el('a','',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function Search(node,options){this.initialise(node,options);this.temp='$:/temp/huwiki/abc/search/'+(++serial);this.pending={};this.cache={};this.seq={};}
Search.prototype=new Widget();
Search.prototype.render=function(parent,next){
 this.parentDomNode=parent;this.computeAttributes();var self=this;
 var host=this.host=el('section','huwabc-search');parent.insertBefore(host,next);this.domNodes.push(host);
 host.appendChild(el('h2','','Find musik · ABC-biblioteker'));
 host.appendChild(el('p','huwabc-muted','Søg i The Session, Ian Haydens jazzsamling og Balkanbiblioteket. ABCnotation åbnes på kildens hjemmeside, hvorfra ABC-koden kan hentes ind i samme afspiller.'));
 var form=el('form','huwabc-search-form');
 var source=this.source=el('select','huwabc-select');source.setAttribute('aria-label','Musikbibliotek');
 [['session','The Session'],['ian','Ian Hayden · jazzstandards'],['balkan','Balkan, Klezmer & Østeuropa · JamBuddy'],['abcnotation','ABCnotation.com']].forEach(function(pair){var op=el('option','',pair[1]);op.value=pair[0];source.appendChild(op);});
 var q=this.query=el('input','huwabc-input');q.type='search';q.placeholder='Søg på titel, fx Kesh';q.setAttribute('aria-label','Søg efter melodititel');q.maxLength=150;
 var type=this.type=el('select','huwabc-select');type.setAttribute('aria-label','Meloditype');var all=el('option','','Alle typer');all.value='';type.appendChild(all);
 Object.keys(data.meters).sort().forEach(function(k){var o=el('option','',k);o.value=k;type.appendChild(o);});
 var go=el('button','huwabc-btn huwabc-primary','Søg');go.type='submit';form.append(source,q,type,go);host.appendChild(form);
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
 this.type.hidden=which!=='session';this.type.disabled=which!=='session';
 this.query.placeholder=which==='session'?'Søg på titel, fx Kesh':which==='ian'?'Søg på jazzstandard, fx Just Friends':which==='balkan'?'Søg på Balkanmelodi, fx Pajdusko':'Søg på ABCnotation, fx Autumn Leaves';
 this.results.textContent='';this.info.textContent='';this.status.textContent=which==='ian'?'Søg i Ian Haydens jazzsamling. Kataloget indlæses fra GitHub.':which==='balkan'?'Søg i JamBuddys Balkanindeks (Balkan, klezmer og østeuropæiske melodier). Importér én melodi ad gangen med kildeangivelse.':which==='abcnotation'?'Søg på ABCnotation.com og indsæt ABC-teksten fra den valgte melodi.':'Søg i The Sessions offentlige melodisamling.';
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
Search.prototype.onDestroy=function(){if(this._localeObserver){this._localeObserver.destroy();this._localeObserver=null;}var self=this;Object.keys(this.pending).forEach(function(k){self.seq[k]=(self.seq[k]||0)+1;self.pending[k].abort();});this.wiki.deleteTiddler(this.temp);};
Search.prototype.refresh=function(changes){return this.refreshChildren(changes);};
exports['huwiki-abc-search']=Search;
})();
