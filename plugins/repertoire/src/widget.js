/*\
title: $:/plugins/huwiki/repertoire/widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var model=require("$:/plugins/huwiki/repertoire/model.js");
var Printing=require("$:/plugins/huwiki/repertoire/print.js");
var Reorder=require("$:/plugins/huwiki/repertoire/reorder.js");
var scoreQueuesByWiki=new WeakMap();
function el(doc,tag,cls,text) {
 var n=doc.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);return n;
}
function button(doc,label,action,cls) {
 var b=el(doc,"button","huwrep-button "+(cls||""),label);
 b.type="button";b.addEventListener("click",action);return b;
}
function labelled(doc,title,value,tag) {
 var l=el(doc,"label","huwrep-field"),caption=el(doc,"span","",title),
  input=el(doc,tag||"input","huwrep-input");
 if(tag!=="textarea")input.type="text";
 input.value=value||"";l.append(caption,input);return {wrap:l,input:input};
}
function option(doc,select,title,label) {
 var op=el(doc,"option","",label||title);op.value=title;select.appendChild(op);
}
function sheetName(wiki,itemTitle){
 var item=wiki.getTiddler(itemTitle);return item?item.fields["music-title"]||itemTitle:itemTitle;
}
function shortSheetName(wiki,itemTitle){
 var full=sheetName(wiki,itemTitle),item=wiki.getTiddler(itemTitle);
 var orchestra=item&&wiki.getTiddler(item.fields["orchestra-title"]),name=orchestra&&(orchestra.fields.name||orchestra.fields.title)||"";
 return name&&full.indexOf(name+" · ")===0?full.slice(name.length+3):full;
}
function keyField(doc,value){
 var wrap=el(doc,"label","huwrep-field huwrep-key-field");
 wrap.appendChild(el(doc,"span","","Klingende toneart (klang C)"));
 var input=el(doc,"select","huwrep-input");
 var keys=["C","Cm","C#","C#m","Db","Dbm","D","Dm","Eb","Ebm","E","Em","F","Fm","F#","F#m","Gb","Gbm","G","Gm","Ab","Abm","A","Am","Bb","Bbm","B","Bm"];
 if(value&&keys.indexOf(value)<0)keys.unshift(value);
 if(!value)keys.unshift("");
 keys.forEach(function(key){option(doc,input,key,key||"— Ikke angivet —");});
 input.value=value||"";
 wrap.appendChild(input);return {wrap:wrap,input:input};
}
function tempoParts(value){
 var original=String(value||"").trim(),pattern=/^(\S+)\s*=\s*(\d+(?:\.\d+)?)$/;
 var match=pattern.exec(original);
 return match?{unit:match[1],number:match[2]}:
  /^\d+(?:\.\d+)?$/.test(original)?{unit:"",number:original}:{unit:"",number:""};
}
function tempoForSave(value,unit,fallback){
 var bpm=String(value||"").trim();
 return !bpm?fallback:unit?unit+"="+bpm:bpm;
}
function Repertoire(parseTreeNode,options){this.initialise(parseTreeNode,options);}
Repertoire.prototype=new Widget();
Repertoire.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 this.orchestraTitle=this.orchestraTitle||this.getAttribute("orchestra","");
 this.setlistTitle=this.setlistTitle||this.getAttribute("setlist","");
 this.activeItem=this.activeItem||"";
 this.categoryFilter=this.categoryFilter||this.getAttribute("category","all");
 this.formatFilter=this.formatFilter||this.getAttribute("format","all");
 var host=this.host=el(this.document,"section","huwrep");
 parent.insertBefore(host,nextSibling);this.domNodes.push(host);this.draw();
};
Repertoire.prototype.onDestroy=function(){
 if(this._orderDispose){this._orderDispose();this._orderDispose=null;}
};
Repertoire.prototype.alert=function(message){this.message=message;this.draw();};
Repertoire.prototype.navigate=function(title){
 this.dispatchEvent({type:"tm-navigate",navigateTo:title,
  navigateFromTitle:this.getVariable("currentTiddler"),navigateFromNode:this,
  navigateSuppressNavigation:false});
};
Repertoire.prototype.addScorePicker=function(panel,orch,setTitle){
 var self=this,doc=this.document,wiki=this.wiki;
 var Banks,Importer;
 try{
  Banks=require("$:/plugins/huwiki/abc/musescore-bank.js");
  Importer=require("$:/plugins/huwiki/musescore-import/widget.js")["huwiki-ms-import"];
 }catch(error){return;}
 if(!Importer||!Importer.prototype.openCatalogueFiles)return;
 this.scoreQueues=scoreQueuesByWiki.get(wiki)||new Map();
 scoreQueuesByWiki.set(wiki,this.scoreQueues);
 var queue=this.scoreQueues.get(setTitle)||new Map();
 this.scoreQueues.set(setTitle,queue);
 var search=labelled(doc,"Find nummer","","input");
 search.input.type="search";
 search.input.autocomplete="off";
 var results=el(doc,"div","huwrep-inline"),chosen=el(doc,"div","huwrep-inline");
 var status=el(doc,"p","huwrep-muted"),preview=el(doc,"div","");
 status.setAttribute("role","status");
 var catalogues=Banks.list(wiki),indexes=null,loading=null;
 var songs=model.songs(wiki).filter(function(song){
  var n=model.notation(wiki,song);return (n.abc||!!n.pdf)&&model.matches(wiki,song,{category:self.categoryFilter,format:self.formatFilter});
 });
 function renderQueue(){
  chosen.textContent="";
  queue.forEach(function(item,key){
   chosen.appendChild(button(doc,item.entry.title+" ×",function(){queue.delete(key);renderQueue();}));
  });
  run.disabled=!queue.size;
  run.hidden=!queue.size;
  run.textContent="Importér valgte noder ("+Math.min(queue.size,20)+")";
 }
 var run=button(doc,"",async function(){
  if(run.disabled)return;
  run.disabled=true;
  status.textContent="Henter de valgte nodefiler …";
  var files=[],errors=[];
  for(var item of Array.from(queue.values()).slice(0,20)){
   try{
    var file=await Banks.file(item.entry);
    files.push({file:file,title:item.entry.title,provenance:Banks.provenance(item.bank,item.entry)});
   }catch(error){errors.push(item.entry.title+": "+error.message);}
  }
  if(!preview.isConnected)return;
  try{
   if(files.length){
    preview.textContent="";
    var importer=new Importer({type:"huwiki-ms-import",attributes:{}},{wiki:wiki,parentWidget:self,document:doc});
    importer.render(preview,null);
    await importer.openCatalogueFiles(files);
   }
   status.textContent=errors.join(" · ");
  }catch(error){status.textContent=errors.concat(error.message).join(" · ");}
  renderQueue();
 },"huwrep-primary");
 panel.append(search.wrap,results,chosen,run,status,preview);
 renderQueue();
 function complete(){
  var query=Banks.normalize(search.input.value).trim();
  results.textContent="";
  if(query.length<2)return;
  if(!loading){
   loading=Promise.allSettled(catalogues.map(function(bank){return Banks.index(bank.id,wiki);}));
   loading.then(function(loaded){
    indexes=loaded;
    if(search.input.isConnected)complete();
   });
  }
  var matches=songs.filter(function(song){return Banks.normalize(song.fields.title).includes(query);});
  matches.slice(0,8).forEach(function(song){
   results.appendChild(button(doc,song.fields.title+" · Wiki",function(){
    self.activeItem=model.addItem(wiki,orch,song.fields.title).title;
    model.addEntry(wiki,setTitle,self.activeItem);
    self.draw();
    if(self.scoreSearch)self.scoreSearch.focus();
   }));
  });
  var count=matches.length;
  if(self.formatFilter==="pdf"||self.categoryFilter==="leadsheet"){if(!count)results.appendChild(el(doc,"span","huwrep-muted","Ingen forslag i den valgte visning"));return;}
  (indexes||[]).forEach(function(index,i){
   if(index.status!=="fulfilled")return;
   Banks.filter(index.value,query).forEach(function(group){
    group.matched.filter(function(entry){return /^(mscz|mscx|musicxml|mxl)$/.test(entry.format);}).forEach(function(entry){
     if(count>=12)return;
     var bank=catalogues[i],key=bank.id+":"+entry.id;
     var alreadyImported=songs.some(function(song){
      return song.fields["abc-origin-library"]==="musescore-bank:"+bank.id&&song.fields["abc-origin-entry"]===entry.id;
     });
     if(queue.has(key)||alreadyImported)return;
     count++;
     var label=entry.title+" · "+bank.name+[entry.arrangement,entry.date].filter(Boolean).map(function(part){return " · "+part;}).join("");
     results.appendChild(button(doc,label,function(){
      queue.set(key,{bank:bank,entry:entry});
      search.input.value="";
      results.textContent="";
      renderQueue();
      search.input.focus();
     }));
    });
   });
  });
  if(!results.children.length)results.appendChild(el(doc,"span","huwrep-muted",!indexes?"Søger i Nodearkivet …":"Ingen forslag"));
 }
 this.scoreSearch=search.input;
 search.input.addEventListener("input",complete);
};
Repertoire.prototype.draw=function(){
 var self=this,doc=this.document,host=this.host,wiki=this.wiki;
 if(!host)return;
 if(this._orderDispose){this._orderDispose();this._orderDispose=null;}
 host.textContent="";
 host.appendChild(el(doc,"h2","","Repertoire"));
 host.appendChild(el(doc,"p","huwrep-muted","Musikbibliotek → orkester → repertoire → sætlister. Noderne bliver i deres oprindelige tiddlers."));
 if(this.message){var status=el(doc,"p","huwrep-status",this.message);status.setAttribute("role","status");host.appendChild(status);}
 var orchList=model.orchestras(wiki);
 if(!orchList.some(function(t){return t.fields.title===self.orchestraTitle;})){
  this.orchestraTitle=orchList.length?orchList[0].fields.title:"";
  this.setlistTitle="";this.activeItem="";
 }
 var top=el(doc,"div","huwrep-controls");host.appendChild(top);
 var orchestraLabel=el(doc,"label","huwrep-field"),orchestraSel=el(doc,"select","huwrep-input");
 orchestraLabel.appendChild(el(doc,"span","","Orkester"));
 option(doc,orchestraSel,"","Vælg orkester");
 orchList.forEach(function(t){option(doc,orchestraSel,t.fields.title,t.fields.name||t.fields.title);});
 orchestraSel.value=this.orchestraTitle;
 orchestraSel.addEventListener("change",function(){
  self.orchestraTitle=this.value;self.setlistTitle="";self.activeItem="";self.message="";self.selectionMessage="";self.draw();
 });
 orchestraLabel.appendChild(orchestraSel);top.appendChild(orchestraLabel);
 var fresh=labelled(doc,"Nyt orkester","","input");top.appendChild(fresh.wrap);
 top.appendChild(button(doc,"Opret orkester",function(){
  try{self.orchestraTitle=model.orchestra(wiki,fresh.input.value);self.setlistTitle="";self.activeItem="";self.selectionMessage="";
   self.alert("Orkester oprettet.");}catch(e){self.alert(e.message);}
 },"huwrep-primary"));
 if(!this.orchestraTitle)return;
 var orch=this.orchestraTitle;
 var importPanel=el(doc,"div","huwrep-panel");host.appendChild(importPanel);
 importPanel.appendChild(el(doc,"h3","","Tilføj musik"));
 importPanel.appendChild(el(doc,"p","huwrep-muted","Indsæt én titel pr. linje fra et dokument eller regneark. Eksisterende titler bliver genbrugt, aldrig overskrevet."));
 var paste=labelled(doc,"Indsæt sangtitler","","textarea");paste.input.rows=4;
 paste.input.placeholder="Brudmarch från Jämtland\nCupria Express\n...";
 importPanel.appendChild(paste.wrap);
 importPanel.appendChild(button(doc,"Indlæs titler",function(){
  try{var r=model.importTitles(wiki,orch,paste.input.value);
   self.alert(r.titles+" titler behandlet · "+r.createdItems+" tilføjet repertoiret · "+r.createdPieces+" nye biblioteksposter.");}
  catch(e){self.alert(e.message);}
 }));
 var filters=el(doc,"div","huwrep-inline huwrep-library-filters");importPanel.appendChild(filters);
 var categoryFilter=el(doc,"select","huwrep-input");categoryFilter.setAttribute("aria-label","Nodekategori");
 [["all","Alle kategorier"],["leadsheet","Leadsheets"]].forEach(function(p){option(doc,categoryFilter,p[0],p[1]);});categoryFilter.value=this.categoryFilter||"all";
 var formatFilter=el(doc,"select","huwrep-input");formatFilter.setAttribute("aria-label","Nodeformat");
 [["all","PDF og ABC"],["pdf","PDF-noder"],["abc","ABC-noder"]].forEach(function(p){option(doc,formatFilter,p[0],p[1]);});formatFilter.value=this.formatFilter||"all";
 filters.append(categoryFilter,formatFilter);
 categoryFilter.addEventListener("change",function(){self.categoryFilter=this.value;self.draw();});formatFilter.addEventListener("change",function(){self.formatFilter=this.value;self.draw();});
 var songList=model.songs(wiki),known=model.items(wiki,orch),
  owned=Object.create(null);
 known.forEach(function(t){owned[t.fields["music-title"]]=true;});
 this._sourceTitles=Object.create(null);songList.forEach(function(s){self._sourceTitles[s.fields.title]=true;});
 var available=songList.filter(function(s){return !owned[s.fields.title]&&model.matches(wiki,s,{category:self.categoryFilter,format:self.formatFilter});});
 if(available.length){
  var chooser=el(doc,"div","huwrep-inline"),source=el(doc,"select","huwrep-input");
  source.setAttribute("aria-label","Eksisterende melodi i musikbiblioteket");
  available.forEach(function(s){option(doc,source,s.fields.title,s.fields.title);});
  chooser.append(source,button(doc,"Hent fra musikbibliotek",function(){
   try{var r=model.addItem(wiki,orch,source.value);
    self.alert(r.created?"Melodien blev føjet til orkestret.":"Melodien er allerede i repertoiret.");}
   catch(e){self.alert(e.message);}
  }));importPanel.appendChild(chooser);
 }
 var currentSets=model.setlists(wiki,orch);
 if(!currentSets.some(function(s){return s.fields.title===self.setlistTitle;})){
  this.setlistTitle=currentSets.length?currentSets[0].fields.title:"";this.activeItem="";
 }
 var setPanel=el(doc,"div","huwrep-panel");host.appendChild(setPanel);
 setPanel.appendChild(el(doc,"h3","","Sætlister"));
 var row=el(doc,"div","huwrep-inline"),setSel=el(doc,"select","huwrep-input");
 setSel.setAttribute("aria-label","Aktuel sætliste");
 option(doc,setSel,"","Vælg sætliste");
 currentSets.forEach(function(s){option(doc,setSel,s.fields.title,s.fields.name||s.fields.title);});
 setSel.value=this.setlistTitle;
 setSel.addEventListener("change",function(){self.setlistTitle=this.value;self.activeItem="";self.message="";self.selectionMessage="";self.draw();});
 row.appendChild(setSel);
 var newSet=labelled(doc,"Ny sætliste","","input");
 row.appendChild(newSet.wrap);
 row.appendChild(button(doc,"Opret sætliste",function(){
  try{self.setlistTitle=model.createSetlist(wiki,orch,newSet.input.value);self.activeItem="";self.selectionMessage="";
   self.alert("Sætlisten er oprettet. Tilføj numre fra orkestrets repertoire.");}
  catch(e){self.alert(e.message);}
 },"huwrep-primary"));
 setPanel.appendChild(row);
 if(this.setlistTitle){
  var viewSetTitle=this.setlistTitle,viewSet=wiki.getTiddler(viewSetTitle),viewItems=model.entries(wiki,viewSetTitle);
  if(!viewItems.length)viewItems=known.map(function(item){return item.fields.title;});
  var folderViews=Object.create(null),viewOrder=["leadsheet","guitar","chord-stabs","score","abc","pdf"];
  viewItems.forEach(function(id){model.availableViews(wiki,id).forEach(function(view){folderViews[view.role]=view;});});
  var defaultViewRole=viewSet&&viewSet.fields["repertoire-source-role"]||"";
  if(!defaultViewRole)defaultViewRole=wiki.getTiddlerText("$:/config/maans/repertoire/default-source-role","")||"";
  var folderView=labelled(doc,"Visning for hele nodemappen",defaultViewRole,"select");
  folderView.input.classList.add("huwrep-setlist-view");folderView.input.setAttribute("aria-label","Visning for hele nodemappen");
  if(!defaultViewRole){var automatic=el(doc,"option","","Automatisk efter nummerets noder");automatic.value="";automatic.disabled=true;folderView.input.appendChild(automatic);}
  Object.keys(folderViews).sort(function(a,b){return viewOrder.indexOf(a)-viewOrder.indexOf(b);}).forEach(function(role){option(doc,folderView.input,role,folderViews[role].label);});
  if(defaultViewRole&&!folderViews[defaultViewRole]){
   var unavailable=el(doc,"option","",(model.viewLabels&&model.viewLabels[defaultViewRole]||defaultViewRole)+" · mangler i denne mappe");unavailable.value=defaultViewRole;unavailable.disabled=true;folderView.input.appendChild(unavailable);
  }
  folderView.input.value=defaultViewRole;
  folderView.input.disabled=!Object.keys(folderViews).length;
  folderView.input.addEventListener("change",function(){
   try{model.setPresentation(wiki,viewSetTitle,null,folderView.input.value);self.message="";self.draw();}
   catch(error){self.alert(error.message);}
  });
  setPanel.appendChild(folderView.wrap);
  setPanel.appendChild(el(doc,"p","huwrep-muted","Visningen følger den samme nummerliste. Et særskilt nodevalg pr. nummer bevares."));
  var publishInstrument=el(doc,"select","huwrep-input");publishInstrument.setAttribute("aria-label","Instrument til udgivelse");
  [["c","C"],["bb","B♭"],["eb","E♭ sopranino"],["ebalto","E♭ altsaxofon"]].forEach(function(x){option(doc,publishInstrument,x[0],x[1]);});
  setPanel.appendChild(publishInstrument);
  if(wiki.getTiddler("$:/plugins/huwiki/site-publisher"))setPanel.appendChild(button(doc,"Udgiv repertoire-site",function(){
   var result=Printing.open(wiki,self.setlistTitle,self,{scores:true,site:true,instrumentId:publishInstrument.value});
   if(result&&result.error)self.alert(result.error);
  }));
 setPanel.appendChild(button(doc,Printing.cueLabel(wiki),function(){Printing.cues(wiki,self.setlistTitle,self);}));
  setPanel.appendChild(button(doc,"Udskriv sætliste / PDF",function(){
   var result=Printing.open(wiki,self.setlistTitle,self,{scores:false});
   if(result&&result.error)self.alert(result.error);
  }));
  setPanel.appendChild(button(doc,"Åbn nodebogen",function(){
   wiki.addTiddler(new $tw.Tiddler({title:"$:/temp/huwiki/repertoire/active-setlist",type:"text/plain",text:self.setlistTitle}));
   self.navigate("Repertoire – Nodebog");
  },"huwrep-primary"));
 }
 var setTitle=this.setlistTitle,list=setTitle?model.entries(wiki,setTitle):[];
 var repertoire=el(doc,"section","huwrep-panel huwrep-repertoire");host.appendChild(repertoire);
 var heading=el(doc,"div","huwrep-repertoire-heading");repertoire.appendChild(heading);
 heading.appendChild(el(doc,"h3","","Orkestrets repertoire"));
 heading.appendChild(el(doc,"span","huwrep-repertoire-count",known.length+" numre · "+list.length+" valgt"));
 var hint=el(doc,"p","huwrep-repertoire-hint",
  this.selectionMessage||(setTitle?"Tryk på en titel for at vælge nummeret. Tryk igen for at fjerne det fra sætlisten.":"Vælg eller opret en sætliste ovenfor for at vælge numre."));
 hint.setAttribute("role","status");repertoire.appendChild(hint);
 var ul=el(doc,"ul","huwrep-song-grid");repertoire.appendChild(ul);
 var visibleKnown=known.filter(function(item){return model.matches(wiki,item.fields["music-title"],{category:self.categoryFilter,format:self.formatFilter});});
 visibleKnown.forEach(function(item){
  var id=item.fields.title,title=shortSheetName(wiki,id),selected=list.indexOf(id)>=0;
  var li=el(doc,"li","huwrep-song-item");
  var tile=button(doc,"",function(){
   if(!setTitle)return;
   try{
    var current=model.entries(wiki,setTitle),included=current.indexOf(id)>=0;
    if(included){
     model.setEntries(wiki,setTitle,current.filter(function(x){return x!==id;}));
     if(self.activeItem===id)self.activeItem="";
    }else{
     model.addEntry(wiki,setTitle,id);self.activeItem=id;
    }
    self.selectionMessage=(included?"Fjernet: ":"Tilføjet: ")+title;
    self.message="";self.draw();
   }catch(e){self.alert(e.message);}
  },"huwrep-song-card"+(selected?" is-in-setlist":""));
  tile.disabled=!setTitle;
  tile.setAttribute("aria-pressed",String(selected));
  tile.setAttribute("aria-label",(selected?"Fjern ":"Tilføj ")+title+(selected?" fra sætlisten":" til sætlisten"));
  tile.appendChild(el(doc,"span","huwrep-song-title",title));
  var notation=model.notation(wiki,item.fields["music-title"]),badges=[notation.category==="leadsheet"?"Leadsheet":"",notation.pdf?"PDF":"",notation.abc?"ABC":""].filter(Boolean);
  if(badges.length)tile.appendChild(el(doc,"span","huwrep-song-formats",badges.join(" · ")));
  var details=[item.fields["repertoire-key"],item.fields["repertoire-tempo"]].filter(Boolean).join(" · ");
  if(details)tile.appendChild(el(doc,"span","huwrep-song-detail",details));
  var indicator=el(doc,"span","huwrep-song-indicator",selected?"✓":"+");
  indicator.setAttribute("aria-hidden","true");tile.appendChild(indicator);
  li.appendChild(tile);ul.appendChild(li);
 });
 if(known.length&&!visibleKnown.length)repertoire.appendChild(el(doc,"p","huwrep-muted","Ingen numre i denne visning. Hele repertoiret og sætlisterne er bevaret."));
 if(!known.length)repertoire.appendChild(el(doc,"p","huwrep-muted","Orkestret har endnu ingen melodier."));
 if(!setTitle)return;
 var stand=el(doc,"div","huwrep-panel huwrep-stand");host.appendChild(stand);
 stand.appendChild(el(doc,"h3","","Aktuel sætliste · "+list.length+" numre"));
 this.addScorePicker(stand,orch,setTitle);
 if(!list.length){
  stand.appendChild(el(doc,"p","huwrep-muted","Tilføj numre fra repertoiret ovenfor."));
  if(known.length)stand.appendChild(button(doc,"Tilføj alle",function(){
   model.setEntries(wiki,setTitle,known.map(function(t){return t.fields.title;}));
   self.alert("Orkestrets repertoire er tilføjet sætlisten.");
  }));return;
 }
 if(list.indexOf(this.activeItem)<0)this.activeItem=list[0];
 var activeIndex=list.indexOf(this.activeItem);
 var workspace=el(doc,"div","huwrep-stand-layout");stand.appendChild(workspace);
 var orderPanel=el(doc,"section","huwrep-order-panel");workspace.appendChild(orderPanel);
 var orderHeader=el(doc,"div","huwrep-order-heading");orderPanel.appendChild(orderHeader);
 orderHeader.appendChild(el(doc,"h4","","Rækkefølge"));
 orderHeader.appendChild(el(doc,"span","huwrep-muted",list.length+" numre"));
 orderPanel.appendChild(el(doc,"p","huwrep-order-hint","Træk i grebet for at flytte et nummer. Brug piletaster på grebet, hvis du har tastatur."));
 var editorPanel=el(doc,"section","huwrep-editor-panel");workspace.appendChild(editorPanel);
 editorPanel.appendChild(el(doc,"div","huwrep-editor-position","NUMMER "+(activeIndex+1)+" AF "+list.length));
 editorPanel.appendChild(el(doc,"h4","huwrep-editor-title",shortSheetName(wiki,this.activeItem)));
 var itemViews=model.availableViews(wiki,this.activeItem),itemView=labelled(doc,"Noder til dette nummer","","select"),itemRole="";
 try{var savedViews=JSON.parse(wiki.getTiddler(setTitle).fields["repertoire-overrides"]||"{}");itemRole=savedViews[this.activeItem]&&savedViews[this.activeItem].sourceRole||"";}catch(_invalidViews){}
 itemView.input.classList.add("huwrep-item-view");itemView.input.setAttribute("aria-label","Noder til dette nummer i den aktuelle mappe");
 option(doc,itemView.input,"","Følg mappens visning");
 itemViews.forEach(function(view){option(doc,itemView.input,view.role,view.label);});
 if(itemRole&&!itemViews.some(function(view){return view.role===itemRole;})){
  var missingView=el(doc,"option","",(model.viewLabels&&model.viewLabels[itemRole]||itemRole)+" · ikke tilgængelig");missingView.value=itemRole;missingView.disabled=true;itemView.input.appendChild(missingView);
 }
 itemView.input.value=itemRole;
 itemView.input.addEventListener("change",function(){
  try{model.setPresentation(wiki,setTitle,self.activeItem,itemView.input.value);self.message="";self.draw();}
  catch(error){self.alert(error.message);}
 });editorPanel.appendChild(itemView.wrap);
 var sourceTitle=sheetName(wiki,this.activeItem),sourceRecord=wiki.getTiddler(sourceTitle),sourceFields=sourceRecord&&sourceRecord.fields||{};
 var sourceOptions=el(doc,"details","huwrep-source-options");sourceOptions.appendChild(el(doc,"summary","","Nodekilder og kategori"));
 var pdfSource=labelled(doc,"PDF-fil (adresse eller PDF-tiddler)",sourceFields["repertoire-pdf"]||""),category=labelled(doc,"Kategori",model.category(sourceRecord),"select");
 option(doc,category.input,"","Almindeligt repertoire");option(doc,category.input,"leadsheet","Leadsheet (også i hele repertoiret)");category.input.value=model.category(sourceRecord);
 sourceOptions.append(pdfSource.wrap,category.wrap,button(doc,"Gem nodekilder og kategori",function(){
  try{
   var current=wiki.getTiddler(sourceTitle);if(!current)throw Error("Melodien findes ikke.");
   wiki.addTiddler(new $tw.Tiddler(current,{"repertoire-pdf":pdfSource.input.value.trim(),"repertoire-category":category.input.value,"repertoire-has-leadsheet":category.input.value==="leadsheet"?"yes":""}));self.draw();
  }catch(error){self.alert(error.message);}
 }));editorPanel.appendChild(sourceOptions);
 var effective=model.effective(wiki,setTitle,this.activeItem),original=model.sourceAgreement(wiki,this.activeItem,setTitle);
 var originalLabel=[original.writtenKey?"Skrevet "+original.writtenKey+" · Klang C "+original.key:original.key?"ABC K:"+original.key:"Ingen ABC-toneart",original.tempo?"Q:"+original.tempo:"Intet ABC-tempo"].join(" · ");
 editorPanel.appendChild(el(doc,"p","huwrep-source-hint","Oprindelige noder: "+originalLabel));
 var tempoCurrent=tempoParts(effective.tempo),tempoOriginal=tempoParts(original.tempo);
 var beat=tempoCurrent.unit||tempoOriginal.unit;
 var beatName={"1/4":"♩ (fjerdedelsnode)","1/2":"𝅗𝅥 (halvnode)","1/8":"♪ (ottendedelsnode)","3/8":"♩. (punkteret fjerdedel)"}[beat]||beat||"slag";
 var form=el(doc,"div","huwrep-form huwrep-editor-fields");
 var key=keyField(doc,effective.key),tempo=labelled(doc,"Tempo (slag/min)",tempoCurrent.number);
 tempo.input.type="number";tempo.input.min="1";tempo.input.max="400";tempo.input.step="1";
 tempo.input.setAttribute("inputmode","numeric");
 tempo.wrap.classList.add("huwrep-tempo-field");
 tempo.wrap.appendChild(el(doc,"small","huwrep-field-help","Taktslag: "+beatName));
 var arrangement=labelled(doc,"Form: intro, dele, soloer og afslutning",effective.form,"textarea");
 var instrumentation=labelled(doc,"Instrumentering: hvem spiller hvad?",effective.instrumentation,"textarea");
 var cues=labelled(doc,"Indsatser, tegn og andre aftaler",effective.cues,"textarea");
 arrangement.input.rows=3;instrumentation.input.rows=2;cues.input.rows=2;
 form.append(key.wrap,tempo.wrap,arrangement.wrap,instrumentation.wrap,cues.wrap);
 function agreementValues(){return {key:key.input.value,
  tempo:tempoForSave(tempo.input.value,beat,effective.tempo),
  form:arrangement.input.value,instrumentation:instrumentation.input.value,cues:cues.input.value};}
 editorPanel.appendChild(form);
 var actions=el(doc,"div","huwrep-inline huwrep-editor-actions");editorPanel.appendChild(actions);
 actions.appendChild(button(doc,"Gem kun i denne sætliste",function(){
  try{model.saveArrangement(wiki,self.activeItem,setTitle,
   agreementValues(),"setlist");
   self.alert("Aftalen gælder kun denne sætliste.");}
  catch(e){self.alert(e.message);}
 },"huwrep-primary"));
 actions.appendChild(button(doc,"Gem som orkestrets standard",function(){
  try{model.saveArrangement(wiki,self.activeItem,setTitle,
   agreementValues(),"orchestra");
   self.alert("Orkestrets standard er opdateret. Særskilte sætlisteaftaler bevares.");}
  catch(e){self.alert(e.message);}
 }));
 actions.appendChild(button(doc,"Åbn originalnode / billede",function(){
  self.navigate(sheetName(wiki,self.activeItem));
 }));
 var order=el(doc,"ol","huwrep-order-list tc-links-draggable-list");orderPanel.appendChild(order);
 list.forEach(function(id,index){
  var selected=id===self.activeItem,title=shortSheetName(wiki,id);
  var li=el(doc,"li","huwrep-order-row tc-droppable"+(selected?" is-active":""));
  li.setAttribute("data-repertoire-item",id);
  var grip=button(doc,"⠿",function(){},"huwrep-order-handle tc-draggable");
  grip.setAttribute("aria-label","Flyt "+title+" med træk eller pil op/ned");
  grip.title="Træk eller brug ↑ og ↓ på tastaturet";
  li.appendChild(grip);
  li.appendChild(el(doc,"span","huwrep-order-position",String(index+1).padStart(2,"0")));
  var pick=button(doc,title,function(){self.activeItem=id;self.draw();},"huwrep-order-title");
  pick.setAttribute("aria-current",selected?"true":"false");
  li.appendChild(pick);
  var remove=button(doc,"×",function(){
   model.setEntries(wiki,setTitle,model.entries(wiki,setTitle).filter(function(x){return x!==id;}));
   if(self.activeItem===id)self.activeItem="";
   self.draw();
  },"huwrep-order-remove");
  remove.setAttribute("aria-label","Fjern "+title+" fra sætlisten");
  li.appendChild(remove);order.appendChild(li);
 });
 // StoryView-inspired stable rows: reorder the existing DOM nodes in place.
 // Rebuilding the entire TiddlyWiki story after every drop changes page height
 // and Safari then scroll-anchors the outer viewport unexpectedly.
 function onReorder(next,id,keyboard){
  var scrollTop=order.scrollTop,win=doc.defaultView;
  var pageY=win&&win.scrollY;
  var current=wiki.getTiddler(setTitle);
  var safe=model.setEntries(wiki,setTitle,next);
  self._ownReorder={title:setTitle,list:wiki.getTiddler(setTitle).fields.list};
  // Reuse the exact same interactive rows, preserving editor inputs and focus.
  if(self._orderDispose){self._orderDispose();self._orderDispose=null;}
  var byId=Object.create(null);
  Array.prototype.forEach.call(order.children,function(row){
   byId[row.getAttribute("data-repertoire-item")]=row;
  });
  safe.forEach(function(itemTitle,index){
   var row=byId[itemTitle];if(!row)return;
   order.appendChild(row);
   var number=row.querySelector(".huwrep-order-position");
   if(number)number.textContent=String(index+1).padStart(2,"0");
   row.classList.toggle("is-active",itemTitle===self.activeItem);
   var select=row.querySelector(".huwrep-order-title");
   if(select)select.setAttribute("aria-current",String(itemTitle===self.activeItem));
  });
  order.scrollTop=scrollTop;
  var position=editorPanel.querySelector(".huwrep-editor-position");
  if(position)position.textContent="NUMMER "+(safe.indexOf(self.activeItem)+1)+" AF "+safe.length;
  self._orderDispose=Reorder.mount(order,safe,onReorder);
  if(keyboard){
   var grip=byId[id]&&byId[id].querySelector(".huwrep-order-handle");
   if(grip&&grip.focus){
    try{grip.focus({preventScroll:true});}catch(_error){grip.focus();}
   }
  }
  // Guard against the browser's automatic scroll anchoring on DOM moves.
  if(win&&typeof win.scrollTo==="function"&&Number.isFinite(pageY)&&Math.abs(win.scrollY-pageY)>1){
   win.scrollTo(win.scrollX,pageY);
  }
 }
 this._orderDispose=Reorder.mount(order,list,onReorder);
};
Repertoire.prototype.refresh=function(changedTiddlers){
 var keys=Object.keys(changedTiddlers||{}),pending=this._ownReorder;
 if(this.scoreQueues){
  var wiki=this.wiki,imported=new Map();
  keys.forEach(function(title){
   var t=wiki.getTiddler(title),fields=t&&t.fields;
   if(fields&&fields["abc-source"]&&fields["abc-origin-entry"]){
    imported.set(fields["abc-origin-library"]+":"+fields["abc-origin-entry"],title);
   }
  });
  this.scoreQueues.forEach(function(queue,setTitle){
   var set=wiki.getTiddler(setTitle);
   if(!set||!imported.size)return;
   var additions=[];
   queue.forEach(function(item,key){
    var title=imported.get("musescore-bank:"+key);
    if(!title)return;
    additions.push(model.addItem(wiki,set.fields["orchestra-title"],title).title);
    queue.delete(key);
   });
   if(additions.length)model.setEntries(wiki,setTitle,model.entries(wiki,setTitle).concat(additions));
  });
 }
 // Reorder has already updated the existing rows; ignore only this exact
 // internal list write. Other edits or external changes must refresh normally.
 if(pending&&keys.length===1&&keys[0]===pending.title){
  var actual=this.wiki.getTiddler(pending.title);
  if(actual&&actual.fields.list===pending.list){this._ownReorder=null;return false;}
 }
 if(pending&&keys.indexOf(pending.title)>=0)this._ownReorder=null;
 var sourceTitles=this._sourceTitles||{};
 var affected=keys.some(function(title){return title.indexOf("Repertoire/")===0||sourceTitles[title];});
 if(affected){
  var keepFocus=this.document.activeElement===this.scoreSearch;
  this.refreshSelf();
  if(keepFocus&&this.scoreSearch)this.scoreSearch.focus();
  return true;
 }
 return false;
};
exports["huwiki-repertoire"]=Repertoire;
})();
