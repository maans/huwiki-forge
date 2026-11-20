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
 wrap.appendChild(el(doc,"span","","Toneart"));
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
 var songList=model.songs(wiki),known=model.items(wiki,orch),
  owned=Object.create(null);
 known.forEach(function(t){owned[t.fields["music-title"]]=true;});
 var available=songList.filter(function(s){return !owned[s.fields.title];});
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
  var publishInstrument=el(doc,"select","huwrep-input");publishInstrument.setAttribute("aria-label","Instrument til udgivelse");
  [["c","C"],["bb","B♭"],["eb","E♭ sopranino"],["ebalto","E♭ altsaxofon"]].forEach(function(x){option(doc,publishInstrument,x[0],x[1]);});
  setPanel.appendChild(publishInstrument);
  if(wiki.getTiddler("$:/plugins/huwiki/site-publisher"))setPanel.appendChild(button(doc,"Udgiv repertoire-site",function(){
   var result=Printing.open(wiki,self.setlistTitle,self,{scores:true,site:true,instrumentId:publishInstrument.value});
   if(result&&result.error)self.alert(result.error);
  }));
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
 known.forEach(function(item){
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
  var details=[item.fields["repertoire-key"],item.fields["repertoire-tempo"]].filter(Boolean).join(" · ");
  if(details)tile.appendChild(el(doc,"span","huwrep-song-detail",details));
  var indicator=el(doc,"span","huwrep-song-indicator",selected?"✓":"+");
  indicator.setAttribute("aria-hidden","true");tile.appendChild(indicator);
  li.appendChild(tile);ul.appendChild(li);
 });
 if(!known.length)repertoire.appendChild(el(doc,"p","huwrep-muted","Orkestret har endnu ingen melodier."));
 if(!setTitle)return;
 var stand=el(doc,"div","huwrep-panel huwrep-stand");host.appendChild(stand);
 stand.appendChild(el(doc,"h3","","Aktuel sætliste · "+list.length+" numre"));
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
 var effective=model.effective(wiki,setTitle,this.activeItem),original=model.sourceAgreement(wiki,this.activeItem);
 var originalLabel=[original.key?"ABC K:"+original.key:"Ingen ABC-toneart",original.tempo?"Q:"+original.tempo:"Intet ABC-tempo"].join(" · ");
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
 editorPanel.appendChild(el(doc,"p","huwrep-muted huwrep-editor-note","Toneart og tempo gemmes som spilleaftaler. De originale ABC-noder og afspilningshastigheden ændres ikke endnu."));
 var order=el(doc,"ol","huwrep-order-list tc-links-draggable-list");orderPanel.appendChild(order);
 list.forEach(function(id,index){
  var selected=id===self.activeItem,title=shortSheetName(wiki,id);
  var li=el(doc,"li","huwrep-order-row tc-droppable"+(selected?" is-active":""));
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
 this._orderDispose=Reorder.mount(order,list,function(newOrder,id,keyboard){
  model.setEntries(wiki,setTitle,newOrder);
  self.activeItem=id;
  if(keyboard)self._focusOrderId=id;
  self.draw();
 });
 if(this._focusOrderId){
  var targetIndex=list.indexOf(this._focusOrderId);
  var grips=order.querySelectorAll(".huwrep-order-handle");
  if(grips[targetIndex]&&grips[targetIndex].focus){
   try{grips[targetIndex].focus({preventScroll:true});}catch(_e){grips[targetIndex].focus();}
  }
  this._focusOrderId="";
 }
};
Repertoire.prototype.refresh=function(changedTiddlers){
 var affected=Object.keys(changedTiddlers).some(function(title){
  return title.indexOf("Repertoire/")===0;
 });
 if(affected){this.refreshSelf();return true;}
 return false;
};
exports["huwiki-repertoire"]=Repertoire;
})();