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
Repertoire.prototype.alert=function(message){this.message=message;this.draw();};
Repertoire.prototype.navigate=function(title){
 this.dispatchEvent({type:"tm-navigate",navigateTo:title,
  navigateFromTitle:this.getVariable("currentTiddler"),navigateFromNode:this,
  navigateSuppressNavigation:false});
};
Repertoire.prototype.draw=function(){
 var self=this,doc=this.document,host=this.host,wiki=this.wiki;
 if(!host)return;host.textContent="";
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
  self.orchestraTitle=this.value;self.setlistTitle="";self.activeItem="";self.message="";self.draw();
 });
 orchestraLabel.appendChild(orchestraSel);top.appendChild(orchestraLabel);
 var fresh=labelled(doc,"Nyt orkester","","input");top.appendChild(fresh.wrap);
 top.appendChild(button(doc,"Opret orkester",function(){
  try{self.orchestraTitle=model.orchestra(wiki,fresh.input.value);self.setlistTitle="";self.activeItem="";
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
 setSel.addEventListener("change",function(){self.setlistTitle=this.value;self.activeItem="";self.message="";self.draw();});
 row.appendChild(setSel);
 var newSet=labelled(doc,"Ny sætliste","","input");
 row.appendChild(newSet.wrap);
 row.appendChild(button(doc,"Opret sætliste",function(){
  try{self.setlistTitle=model.createSetlist(wiki,orch,newSet.input.value);self.activeItem="";
   self.alert("Sætlisten er oprettet. Tilføj numre fra orkestrets repertoire.");}
  catch(e){self.alert(e.message);}
 },"huwrep-primary"));
 setPanel.appendChild(row);
 if(this.setlistTitle){
  setPanel.appendChild(button(doc,"Udskriv sætliste / PDF",function(){
   var result=Printing.open(wiki,self.setlistTitle,doc.defaultView,{scores:false});
   if(result&&result.error)self.alert(result.error);
  }));
  setPanel.appendChild(button(doc,"Åbn nodebogen",function(){
   wiki.addTiddler(new $tw.Tiddler({title:"$:/temp/huwiki/repertoire/active-setlist",type:"text/plain",text:self.setlistTitle}));
   self.navigate("Repertoire – Nodebog");
  },"huwrep-primary"));
 }
 var setTitle=this.setlistTitle,list=setTitle?model.entries(wiki,setTitle):[];
 var repertoire=el(doc,"div","huwrep-panel");host.appendChild(repertoire);
 repertoire.appendChild(el(doc,"h3","","Orkestrets repertoire ("+known.length+")"));
 var ul=el(doc,"ol","huwrep-list");repertoire.appendChild(ul);
 known.forEach(function(item){
  var li=el(doc,"li","huwrep-item");
  var name=item.fields["music-title"];
  li.appendChild(button(doc,name,function(){self.navigate(name);},"huwrep-link"));
  var details=[item.fields["repertoire-key"],item.fields["repertoire-tempo"]].filter(Boolean).join(" · ");
  if(details)li.appendChild(el(doc,"span","huwrep-muted",details));
  if(setTitle)li.appendChild(button(doc,"Tilføj til sætliste",function(){
   try{model.addEntry(wiki,setTitle,item.fields.title);self.activeItem=item.fields.title;self.alert("Tilføjet til sætlisten.");}
   catch(e){self.alert(e.message);}
  }));
  ul.appendChild(li);
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
 var nav=el(doc,"div","huwrep-inline");stand.appendChild(nav);
 var prev=button(doc,"← Forrige",function(){self.activeItem=list[Math.max(0,activeIndex-1)];self.draw();});
 prev.disabled=activeIndex<=0;nav.appendChild(prev);
 var current=el(doc,"select","huwrep-input");current.setAttribute("aria-label","Vælg nummer");
 list.forEach(function(id,i){option(doc,current,id,(i+1)+". "+sheetName(wiki,id));});
 current.value=this.activeItem;current.addEventListener("change",function(){self.activeItem=this.value;self.draw();});
 nav.appendChild(current);
 var next=button(doc,"Næste →",function(){self.activeItem=list[Math.min(list.length-1,activeIndex+1)];self.draw();});
 next.disabled=activeIndex>=list.length-1;nav.appendChild(next);
 stand.appendChild(el(doc,"h4","",sheetName(wiki,this.activeItem)));
 var effective=model.effective(wiki,setTitle,this.activeItem);
 var form=el(doc,"div","huwrep-form");
 var key=labelled(doc,"Toneart",effective.key),tempo=labelled(doc,"Tempo",effective.tempo),
  arrangement=labelled(doc,"Form: intro, dele, soloer og afslutning",effective.form,"textarea"),
  instrumentation=labelled(doc,"Instrumentering: hvem spiller hvad?",effective.instrumentation,"textarea"),
  cues=labelled(doc,"Indsatser, tegn og andre aftaler",effective.cues,"textarea");
 arrangement.input.rows=3;instrumentation.input.rows=2;cues.input.rows=2;
 form.append(key.wrap,tempo.wrap,arrangement.wrap,instrumentation.wrap,cues.wrap);
 function agreementValues(){return {key:key.input.value,tempo:tempo.input.value,form:arrangement.input.value,
  instrumentation:instrumentation.input.value,cues:cues.input.value};}
 stand.appendChild(form);
 var actions=el(doc,"div","huwrep-inline");stand.appendChild(actions);
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
 stand.appendChild(el(doc,"p","huwrep-muted","Aftalerne lagres uden at ændre originalnoder. Transponeret ABC-visning og fuldskærmsnodebog tilføjes i et senere trin."));
 var order=el(doc,"ol","huwrep-list huwrep-order");stand.appendChild(order);
 list.forEach(function(id,index){
  var li=el(doc,"li","huwrep-item"+(id===self.activeItem?" huwrep-selected":""));
  li.appendChild(button(doc,(index+1)+". "+sheetName(wiki,id),function(){self.activeItem=id;self.draw();},"huwrep-link"));
  var up=button(doc,"↑",function(){var copy=list.slice(),item=copy.splice(index,1)[0];copy.splice(index-1,0,item);
   model.setEntries(wiki,setTitle,copy);self.activeItem=id;self.draw();});
  up.disabled=index===0;up.title="Flyt op";li.appendChild(up);
  var down=button(doc,"↓",function(){var copy=list.slice(),item=copy.splice(index,1)[0];copy.splice(index+1,0,item);
   model.setEntries(wiki,setTitle,copy);self.activeItem=id;self.draw();});
  down.disabled=index===list.length-1;down.title="Flyt ned";li.appendChild(down);
  li.appendChild(button(doc,"Fjern",function(){model.setEntries(wiki,setTitle,list.filter(function(x){return x!==id;}));self.draw();}));
  order.appendChild(li);
 });
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