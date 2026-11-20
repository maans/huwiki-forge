/*\
title: $:/plugins/huwiki/repertoire/widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var model=require("$:/plugins/huwiki/repertoire/model.js");
var TEMP="$:/temp/huwiki/repertoire/";
function el(doc,tag,cls,text){
 var n=doc.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=String(text);return n;
}
function button(doc,label,action,cls){
 var b=el(doc,"button","huwrep-button "+(cls||""),label);
 b.type="button";b.addEventListener("click",action);return b;
}
function labelled(doc,title,value,tag){
 var l=el(doc,"label","huwrep-field"),input=el(doc,tag||"input","huwrep-input");
 if(!tag||tag==="input")input.type="text";
 input.value=value||"";input.setAttribute("aria-label",title);
 l.append(el(doc,"span","",title),input);return {wrap:l,input:input};
}
function option(doc,select,value,label){
 var o=el(doc,"option","",label||value);o.value=value;select.appendChild(o);
}
function sortOptions(doc,select){
 [["title","Titel A–Å"],["key","Toneart"],["tempo","Tempo – langsom først"],["type","Nodetype"]]
  .forEach(function(x){option(doc,select,x[0],x[1]);});
}
function sameOrder(a,b){return a.length===b.length&&a.every(function(x,i){return x===b[i];});}
function Repertoire(parseTreeNode,options){this.initialise(parseTreeNode,options);}
Repertoire.prototype=new Widget();
Repertoire.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 this.orchestraTitle=this.orchestraTitle||this.getAttribute("orchestra","");
 this.setlistTitle=this.setlistTitle||this.getAttribute("setlist","")||this.wiki.getTiddlerText(TEMP+"active-setlist")||"";
 this.activeItem=this.activeItem||this.wiki.getTiddlerText(TEMP+"active-item")||"";
 this.view=this.view||"setlist";this.queries=this.queries||{};this.sorts=this.sorts||{};
 this.drafts=this.drafts||Object.create(null);
 this.host=el(this.document,"section","huwrep");
 parent.insertBefore(this.host,nextSibling);this.domNodes.push(this.host);
 if(this.document.isTiddlyWikiFakeDom){
  this.host.appendChild(el(this.document,"p","","Åbn wikien i browseren for at arbejde med repertoiret."));return;
 }
 this.draw();
};
Repertoire.prototype.navigate=function(title){
 this.dispatchEvent({type:"tm-navigate",navigateTo:title,navigateFromTitle:this.getVariable("currentTiddler"),
  navigateFromNode:this,navigateSuppressNavigation:false});
};
Repertoire.prototype.alert=function(message){this.message=message;this.draw();};
Repertoire.prototype.attempt=function(action){try{action();}catch(e){this.alert(e.message);}};
Repertoire.prototype.openBook=function(){
 var list=model.entries(this.wiki,this.setlistTitle);if(!list.length)return;
 var item=list.indexOf(this.activeItem)>=0?this.activeItem:list[0];
 this.wiki.addTiddler(new $tw.Tiddler({title:TEMP+"active-setlist",type:"text/plain",text:this.setlistTitle}));
 this.wiki.addTiddler(new $tw.Tiddler({title:TEMP+"active-item",type:"text/plain",text:item}));
 this.navigate("Repertoire – Nodebog");
};
Repertoire.prototype.draw=function(){
 var self=this,doc=this.document,wiki=this.wiki,host=this.host;if(!host)return;
 host.textContent="";
 var orchestras=model.orchestras(wiki),savedSet=wiki.getTiddler(this.setlistTitle);
 if(!this.orchestraTitle&&savedSet)this.orchestraTitle=savedSet.fields["orchestra-title"]||"";
 if(!orchestras.some(function(t){return t.fields.title===self.orchestraTitle;})){
  this.orchestraTitle=orchestras.length?orchestras[0].fields.title:"";this.setlistTitle="";this.activeItem="";
 }
 var sets=model.setlists(wiki,this.orchestraTitle);
 if(!sets.some(function(t){return t.fields.title===self.setlistTitle;})){
  this.setlistTitle=sets.length?sets[0].fields.title:"";this.activeItem="";
 }
 var entries=this.setlistTitle?model.entries(wiki,this.setlistTitle):[];
 if(!this.activeItem&&entries.length)this.activeItem=entries[0];
 host.appendChild(el(doc,"h2","","Repertoire"));
 host.appendChild(el(doc,"p","huwrep-muted","Find musik, sammensæt en sætliste, og åbn den i Nodebogen."));
 if(this.message){var status=el(doc,"p","huwrep-status",this.message);status.setAttribute("role","status");host.appendChild(status);}
 var top=el(doc,"div","huwrep-controls");host.appendChild(top);
 var orch=labelled(doc,"Orkester","","select");option(doc,orch.input,"","Vælg orkester");
 orchestras.forEach(function(t){option(doc,orch.input,t.fields.title,t.fields.name||t.fields.title);});
 orch.input.value=this.orchestraTitle;
 orch.input.addEventListener("change",function(){
  self.orchestraTitle=this.value;self.setlistTitle="";self.activeItem="";self.message="";self.draw();
 });top.appendChild(orch.wrap);
 var set=labelled(doc,"Aktuel sætliste","","select");option(doc,set.input,"","Vælg sætliste");
 sets.forEach(function(t){option(doc,set.input,t.fields.title,t.fields.name||t.fields.title);});
 set.input.value=this.setlistTitle;set.input.disabled=!sets.length;
 set.input.addEventListener("change",function(){self.setlistTitle=this.value;self.activeItem="";self.message="";self.draw();});
 top.appendChild(set.wrap);
 var open=button(doc,"Åbn nodebogen",function(){self.openBook();},"huwrep-primary huwrep-open-book");
 open.disabled=!entries.length;top.appendChild(open);
 this.drawManage(host);
 if(!this.orchestraTitle){host.appendChild(el(doc,"p","huwrep-muted","Opret et orkester for at samle dets repertoire."));return;}
 var known=model.items(wiki,this.orchestraTitle),songs=model.catalog(wiki,this.orchestraTitle,{scope:"library"});
 this.trackedSources=Object.create(null);songs.forEach(function(t){self.trackedSources[t.title]=true;});
 if(!this.setlistTitle&&this.view==="setlist")this.view="orchestra";
 var tabs=el(doc,"div","huwrep-tabs");tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Repertoirevisning");
 [["setlist","Sætliste",entries.length],["orchestra","Orkestrets repertoire",known.length],["library","Musikbibliotek",songs.length]]
  .forEach(function(x){
   var tab=button(doc,x[1]+" ("+x[2]+")",function(){self.view=x[0];self.draw();},self.view===x[0]?"huwrep-primary":"");
   tab.setAttribute("role","tab");tab.setAttribute("aria-selected",String(self.view===x[0]));
   tab.disabled=x[0]==="setlist"&&!self.setlistTitle;tabs.appendChild(tab);
  });host.appendChild(tabs);
 var panel=el(doc,"section","huwrep-catalog");panel.setAttribute("role","tabpanel");
 panel.setAttribute("aria-label",this.view==="setlist"?"Aktuel sætliste":this.view==="library"?"Musikbibliotek":"Orkestrets repertoire");
 host.appendChild(panel);
 var filters=el(doc,"div","huwrep-catalog-controls");panel.appendChild(filters);
 var search=labelled(doc,"Søg efter titel, toneart eller tempo",this.queries[this.view]||"");
 search.input.type="search";search.input.classList.add("huwrep-catalog-search");search.input.placeholder="Find et nummer …";
 search.input.addEventListener("input",function(){self.queries[self.view]=this.value;self.drawRows();});filters.appendChild(search.wrap);
 if(this.view!=="setlist"){
  var sorting=labelled(doc,"Vis rækkefølge","","select");sorting.input.classList.add("huwrep-catalog-sort");
  sortOptions(doc,sorting.input);sorting.input.value=this.sorts[this.view]||"title";
  sorting.input.addEventListener("change",function(){self.sorts[self.view]=this.value;self.drawRows();});filters.appendChild(sorting.wrap);
 }else this.drawSetSort(filters,entries);
 this._count=el(doc,"p","huwrep-muted huwrep-count");this._count.setAttribute("role","status");panel.appendChild(this._count);
 var scroll=el(doc,"div","huwrep-table-scroll"),table=el(doc,"table","huwrep-table");
 table.appendChild(el(doc,"caption","huwrep-sr-only",panel.getAttribute("aria-label")));
 var head=el(doc,"thead"),tr=el(doc,"tr");
 ["Titel","Toneart","Tempo","Noder","Handlinger"].forEach(function(t,i){
  var h=el(doc,"th",i===4?"huwrep-row-actions":"",t);h.setAttribute("scope","col");tr.appendChild(h);
 });head.appendChild(tr);table.appendChild(head);this._tbody=el(doc,"tbody");table.appendChild(this._tbody);
 scroll.appendChild(table);panel.appendChild(scroll);
 this._empty=el(doc,"p","huwrep-muted huwrep-empty");panel.appendChild(this._empty);
 if(this.view==="setlist")panel.appendChild(el(doc,"p","huwrep-muted huwrep-order-hint",
  "Flyt numre med pilene eller træk en række til en ny plads. Nodebogen følger denne rækkefølge."));
 else panel.appendChild(el(doc,"p","huwrep-muted","Sorteringen gælder kun oversigten. Sætlistens rækkefølge bevares."));
 this.drawRows();this.drawArrangement(host);
};
Repertoire.prototype.drawManage=function(host){
 var self=this,doc=this.document,wiki=this.wiki;
 var box=el(doc,"details","huwrep-manage");box.open=!!this.manageOpen||!this.orchestraTitle;
 box.appendChild(el(doc,"summary","","Tilføj musik, orkester eller sætliste"));
 box.addEventListener("toggle",function(){self.manageOpen=box.open;});host.appendChild(box);
 var row=el(doc,"div","huwrep-inline"),fresh=labelled(doc,"Nyt orkester",this.newOrchestra||"");
 fresh.input.addEventListener("input",function(){self.newOrchestra=this.value;});row.appendChild(fresh.wrap);
 row.appendChild(button(doc,"Opret orkester",function(){self.attempt(function(){
  self.orchestraTitle=model.orchestra(wiki,fresh.input.value);self.setlistTitle="";self.activeItem="";
  self.newOrchestra="";self.view="orchestra";self.alert("Orkester oprettet.");
 });}));box.appendChild(row);
 if(!this.orchestraTitle)return;
 var setRow=el(doc,"div","huwrep-inline"),set=labelled(doc,"Ny sætliste",this.newSet||"");
 set.input.addEventListener("input",function(){self.newSet=this.value;});setRow.appendChild(set.wrap);
 setRow.appendChild(button(doc,"Opret sætliste",function(){self.attempt(function(){
  self.setlistTitle=model.createSetlist(wiki,self.orchestraTitle,set.input.value);self.activeItem="";
  self.newSet="";self.view="setlist";self.alert("Sætlisten er oprettet. Tilføj numre fra orkestrets repertoire.");
 });}));box.appendChild(setRow);
 var paste=labelled(doc,"Indsæt sangtitler",this.pasteText||"","textarea");paste.input.rows=3;
 paste.input.placeholder="Én titel pr. linje";paste.input.addEventListener("input",function(){self.pasteText=this.value;});
 box.appendChild(paste.wrap);
 box.appendChild(el(doc,"p","huwrep-muted","Titlerne føjes til orkestrets repertoire. Eksisterende musik genbruges."));
 box.appendChild(button(doc,"Indlæs titler",function(){self.attempt(function(){
  var r=model.importTitles(wiki,self.orchestraTitle,paste.input.value);self.pasteText="";self.view="orchestra";
  self.alert(r.titles+" titler behandlet · "+r.createdItems+" føjet til repertoiret · "+r.createdPieces+" nye biblioteksposter.");
 });}));
};
Repertoire.prototype.drawSetSort=function(parent,entries){
 var self=this,doc=this.document,box=el(doc,"details","huwrep-set-sort");
 box.appendChild(el(doc,"summary","","Sortér sætlisten"));
 var sort=labelled(doc,"Ny rækkefølge","","select");sort.input.classList.add("huwrep-set-sort-select");
 sortOptions(doc,sort.input);sort.input.value=this.setSort||"title";
 sort.input.addEventListener("change",function(){self.setSort=this.value;});box.appendChild(sort.wrap);
 var apply=button(doc,"Sortér sætlisten",function(){self.attempt(function(){
  var before=model.entries(self.wiki,self.setlistTitle).slice();
  var after=model.sortEntries(self.wiki,self.setlistTitle,sort.input.value);
  if(sameOrder(before,after)){self.alert("Sætlisten har allerede denne rækkefølge.");return;}
  model.reorderEntries(self.wiki,self.setlistTitle,after);
  self.undoSort={setlist:self.setlistTitle,before:before,after:after.slice()};
  self.alert("Sætlistens rækkefølge er ændret. Du kan fortryde sorteringen.");
 });});apply.disabled=entries.length<2;box.appendChild(apply);parent.appendChild(box);
 if(this.undoSort&&this.undoSort.setlist===this.setlistTitle&&sameOrder(entries,this.undoSort.after)){
  parent.appendChild(button(doc,"Fortryd sortering",function(){self.attempt(function(){
   var undo=self.undoSort,current=model.entries(self.wiki,self.setlistTitle);
   if(!undo||undo.setlist!==self.setlistTitle||!sameOrder(current,undo.after))return;
   model.reorderEntries(self.wiki,self.setlistTitle,undo.before);self.undoSort=null;self.alert("Den tidligere rækkefølge er gendannet.");
  });}));
 }
};
Repertoire.prototype.drawRows=function(){
 if(!this._tbody)return;
 var self=this,doc=this.document,wiki=this.wiki,view=this.view,setTitle=this.setlistTitle;
 var entries=setTitle?model.entries(wiki,setTitle):[],query=this.queries[view]||"";
 var rows=model.catalog(wiki,this.orchestraTitle,{scope:view==="library"?"library":"orchestra",
  setlistTitle:setTitle,query:query,sort:this.sorts[view]||"title"});
 if(view==="setlist"){
  var byId=Object.create(null);rows.forEach(function(r){byId[r.itemTitle]=r;});
  rows=entries.map(function(id){return byId[id];}).filter(Boolean);
 }
 this._tbody.textContent="";
 this._count.textContent=rows.length+(rows.length===1?" nummer":" numre")+(query?" fundet":"");
 this._empty.hidden=!!rows.length;
 this._empty.textContent=query?"Ingen numre matcher søgningen.":view==="setlist"?
  "Sætlisten er tom. Vælg Orkestrets repertoire og tilføj numre.":view==="library"?
  "Musikbiblioteket er tomt. Indlæs sangtitler ovenfor.":"Orkestret har endnu ingen numre. Hent musik fra Musikbibliotek eller indlæs sangtitler.";
 rows.forEach(function(row){
  var tr=el(doc,"tr",row.itemTitle&&row.itemTitle===self.activeItem?"huwrep-selected":"");
  tr.setAttribute("data-music-title",row.title);tr.setAttribute("data-item-title",row.itemTitle||"");
  var title=el(doc,"td","huwrep-title-cell");
  if(view==="setlist")title.appendChild(el(doc,"span","huwrep-track-number",String(entries.indexOf(row.itemTitle)+1)));
  var pick=button(doc,row.label,function(){
   if(!row.itemTitle){self.navigate(row.title);return;}
   self.activeItem=row.itemTitle;self.arrangementOpen=true;self.draw();
  },"huwrep-title-button huwrep-link");
  pick.title=row.itemTitle?"Vælg nummer og vis aftaler":"Åbn originalen";title.appendChild(pick);tr.appendChild(title);
  tr.appendChild(el(doc,"td","huwrep-key-cell",row.key||"—"));tr.appendChild(el(doc,"td","huwrep-tempo-cell",row.tempo||"—"));
  tr.appendChild(el(doc,"td","huwrep-type-cell",row.kind==="abc"?"ABC":row.kind==="image"?"Billede":"Tekst"));
  var actions=el(doc,"td","huwrep-row-actions");tr.appendChild(actions);
  if(view==="setlist"){
   var index=entries.indexOf(row.itemTitle);
   function move(delta){self.attempt(function(){
    var current=model.entries(wiki,setTitle),from=current.indexOf(row.itemTitle),to=from+delta;
    if(from<0||to<0||to>=current.length)return;
    current.splice(from,1);current.splice(to,0,row.itemTitle);model.reorderEntries(wiki,setTitle,current);self.undoSort=null;self.draw();
   });}
   var up=button(doc,"↑",function(){move(-1);}),down=button(doc,"↓",function(){move(1);});
   up.disabled=index<=0;down.disabled=index>=entries.length-1;
   up.setAttribute("aria-label","Flyt "+row.label+" op");down.setAttribute("aria-label","Flyt "+row.label+" ned");
   up.title="Flyt op";down.title="Flyt ned";
   var remove=button(doc,"×",function(){self.attempt(function(){
    model.setEntries(wiki,setTitle,model.entries(wiki,setTitle).filter(function(id){return id!==row.itemTitle;}));
    if(self.activeItem===row.itemTitle)self.activeItem="";self.undoSort=null;self.draw();
   });});remove.setAttribute("aria-label","Fjern "+row.label+" fra sætlisten");remove.title="Fjern fra sætliste";actions.append(up,down,remove);
   if(!query){
    tr.draggable=true;tr.title="Træk for at flytte nummeret";
    tr.addEventListener("dragstart",function(e){
     if(!e.dataTransfer)return;self.draggedItem=row.itemTitle;self.draggedSet=setTitle;
     e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-huwiki-repertoire-entry",row.itemTitle);
    });
    tr.addEventListener("dragover",function(e){
     if(self.draggedSet===setTitle&&self.draggedItem&&self.draggedItem!==row.itemTitle){e.preventDefault();tr.classList.add("huwrep-drop-target");}
    });
    tr.addEventListener("dragleave",function(){tr.classList.remove("huwrep-drop-target");});
    tr.addEventListener("dragend",function(){self.draggedItem="";self.draggedSet="";tr.classList.remove("huwrep-drop-target");});
    tr.addEventListener("drop",function(e){
     if(self.draggedSet!==setTitle||!self.draggedItem||self.draggedItem===row.itemTitle)return;
     e.preventDefault();var moved=self.draggedItem;self.draggedItem="";self.draggedSet="";
     self.attempt(function(){
      var current=model.entries(wiki,setTitle),from=current.indexOf(moved),to=current.indexOf(row.itemTitle);
      if(from<0||to<0)return;current.splice(from,1);current.splice(to,0,moved);
      model.reorderEntries(wiki,setTitle,current);self.undoSort=null;self.draw();
     });
    });
   }
  }else if(!row.itemTitle){
   actions.appendChild(button(doc,"Tilføj til orkester",function(){self.attempt(function(){
    self.activeItem=model.addItem(wiki,self.orchestraTitle,row.title).title;self.alert("Nummeret er føjet til orkestrets repertoire.");
   });}));
  }else if(row.inSetlist){actions.appendChild(el(doc,"span","huwrep-added","✓ I sætlisten"));}
  else if(setTitle){actions.appendChild(button(doc,"Tilføj til sætliste",function(){self.attempt(function(){
   model.addEntry(wiki,setTitle,row.itemTitle);self.activeItem=row.itemTitle;self.alert("Nummeret er føjet til sætlisten.");
  });}));}
  else actions.appendChild(el(doc,"span","huwrep-muted","I orkestrets repertoire"));
  self._tbody.appendChild(tr);
 });
};
Repertoire.prototype.drawArrangement=function(host){
 var self=this,doc=this.document,wiki=this.wiki,item=wiki.getTiddler(this.activeItem);
 if(!item||item.fields["orchestra-title"]!==this.orchestraTitle)return;
 var source=item.fields["music-title"],all=model.catalog(wiki,this.orchestraTitle,{setlistTitle:this.setlistTitle});
 var row=all.find(function(r){return r.itemTitle===self.activeItem;}),label=row?row.label:source;
 var box=el(doc,"details","huwrep-arrangement");box.open=!!this.arrangementOpen;
 box.appendChild(el(doc,"summary","","Aftaler · "+label));box.addEventListener("toggle",function(){self.arrangementOpen=box.open;});
 var agreementSet=row&&row.inSetlist?this.setlistTitle:"";
 var draftKey=agreementSet+"\n"+this.activeItem;
 var values=this.drafts[draftKey]||model.effective(wiki,agreementSet,this.activeItem);
 var form=el(doc,"div","huwrep-form"),key=labelled(doc,"Aftalt toneart",values.key),
  tempo=labelled(doc,"Aftalt tempo",values.tempo),arrangement=labelled(doc,"Form, intro, soloer og afslutning",values.form,"textarea");
 key.input.placeholder=row&&row.key||"Fx Dm";tempo.input.placeholder=row&&row.tempo||"Fx 120";
 arrangement.wrap.classList.add("huwrep-form-notes");arrangement.input.rows=3;form.append(key.wrap,tempo.wrap,arrangement.wrap);
 function current(){return {key:key.input.value,tempo:tempo.input.value,form:arrangement.input.value};}
 [key,tempo,arrangement].forEach(function(f){f.input.addEventListener("input",function(){self.drafts[draftKey]=current();});});
 box.appendChild(form);var actions=el(doc,"div","huwrep-inline");
 function save(scope){self.attempt(function(){
  model.saveArrangement(wiki,self.activeItem,self.setlistTitle,current(),scope);delete self.drafts[draftKey];
  self.alert(scope==="setlist"?"Aftalen gælder kun denne sætliste.":"Orkestrets standard er opdateret. Særskilte sætlisteaftaler bevares.");
 });}
 var saveSet=button(doc,"Gem kun i denne sætliste",function(){save("setlist");},"huwrep-primary");
 saveSet.disabled=!row||!row.inSetlist;actions.appendChild(saveSet);
 actions.appendChild(button(doc,"Gem som orkestrets standard",function(){save("orchestra");}));
 actions.appendChild(button(doc,"Åbn originalnoder",function(){self.navigate(source);},"huwrep-link"));box.appendChild(actions);
 box.appendChild(el(doc,"p","huwrep-muted","Toneart og tempo er aftaler. Originalnoderne og afspilningen ændres ikke automatisk."));
 host.appendChild(box);
};
Repertoire.prototype.refresh=function(changed){
 var self=this,attrs=this.computeAttributes();
 if(attrs.orchestra){this.orchestraTitle=this.getAttribute("orchestra","");this.setlistTitle="";}
 if(attrs.setlist)this.setlistTitle=this.getAttribute("setlist","");
 var selectionChanged=false;
 if(changed&&(changed[TEMP+"active-setlist"]||changed[TEMP+"active-item"])){
  var requestedSet=this.wiki.getTiddlerText(TEMP+"active-setlist")||"",set=this.wiki.getTiddler(requestedSet);
  if(set&&set.fields["repertoire-kind"]==="setlist"){
   var requestedItem=this.wiki.getTiddlerText(TEMP+"active-item")||"",entries=model.entries(this.wiki,requestedSet);
   if(entries.indexOf(requestedItem)<0)requestedItem=entries[0]||"";
   selectionChanged=requestedSet!==this.setlistTitle||requestedItem!==this.activeItem;
   this.setlistTitle=requestedSet;this.orchestraTitle=set.fields["orchestra-title"];this.activeItem=requestedItem;
  }
 }
 var affected=attrs.orchestra||attrs.setlist||selectionChanged||Object.keys(changed||{}).some(function(title){
  var t=self.wiki.getTiddler(title),f=t&&t.fields;
  return title.indexOf("Repertoire/")===0||!!(self.trackedSources&&self.trackedSources[title])||
   !!(f&&(f["repertoire-kind"]||typeof f["abc-source"]==="string"||f["repertoire-image"]||(f.tags||[]).indexOf("RepertoireMelodi")>=0));
 });
 if(affected){this.draw();return true;}return false;
};
exports["huwiki-repertoire"]=Repertoire;
})();
