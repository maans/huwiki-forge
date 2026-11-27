/*\
title: $:/plugins/huwiki/repertoire/library-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget,model=require("$:/plugins/huwiki/repertoire/model.js");
function node(doc,tag,cls,text){var n=doc.createElement(tag);n.className=cls||"";if(text!==undefined)n.textContent=text;return n;}
function Library(tree,options){this.initialise(tree,options);}
Library.prototype=new Widget();
Library.prototype.navigate=function(title){this.dispatchEvent({type:"tm-navigate",navigateTo:title,navigateFromTitle:this.getVariable("currentTiddler"),navigateFromNode:this,navigateSuppressNavigation:false});};
Library.prototype.render=function(parent,next){
 this.parentDomNode=parent;this.computeAttributes();var self=this,doc=this.document,wiki=this.wiki;
 var host=this.host=node(doc,"section","huwrep-library");parent.insertBefore(host,next);this.domNodes.push(host);
 function button(label,fn,cls){var b=node(doc,"button","huwrep-button "+(cls||""),label);b.type="button";b.addEventListener("click",fn);return b;}
 var actions=node(doc,"nav","huwrep-library-actions");actions.setAttribute("aria-label","Repertoire");host.appendChild(actions);
 var folders=node(doc,"section","huwrep-library-folders"),songs=node(doc,"section","huwrep-library-songs");songs.hidden=true;
 var folderButton=button("Nodemapper",function(){folders.hidden=false;songs.hidden=true;sync();}),songButton=button("Numre",function(){folders.hidden=true;songs.hidden=false;sync();});
 function sync(){folderButton.setAttribute("aria-pressed",String(!folders.hidden));songButton.setAttribute("aria-pressed",String(!songs.hidden));}
 actions.append(folderButton,songButton,button("Redigér sætlister",function(){self.navigate("Repertoire – Sætlister");}));sync();
 folders.appendChild(node(doc,"p","huwrep-muted","Vælg en nodemappe. Rækkefølgen er fælles; nodeudgaven kan vælges for hvert nummer."));
 model.orchestras(wiki).forEach(function(orch){
  folders.appendChild(node(doc,"h3","",orch.fields.name||orch.fields.title));
  var sets=model.setlists(wiki,orch.fields.title).slice().sort(function(a,b){return String(b.fields['repertoire-event-date']||'').localeCompare(String(a.fields['repertoire-event-date']||''));});
  sets.push(model.collection(wiki,orch.fields.title));
  sets.forEach(function(set){var title=set.fields.title,count=model.entries(wiki,title).length;
   folders.appendChild(button((set.fields.name||title)+" · "+count+" numre",function(){wiki.addTiddler(new $tw.Tiddler({title:"$:/temp/huwiki/repertoire/active-setlist",text:title}));self.navigate("Repertoire – Nodebog");},"huwrep-library-folder"));
  });
 });
 var search=node(doc,"input","huwrep-input");search.type="search";search.placeholder="Find et nummer";search.setAttribute("aria-label","Søg efter et nummer");songs.appendChild(search);
 var grid=node(doc,"div","huwrep-library-song-grid");songs.appendChild(grid);
 model.songs(wiki).forEach(function(t){var views=model.availableViews(wiki,t),label=t.fields.title;
  var b=button(label,function(){self.navigate(t.fields.title);},"huwrep-library-song");
  b.appendChild(node(doc,"small","huwrep-muted",views.map(function(v){return v.label;}).join(" · ")||"Noder mangler"));b.setAttribute("data-title",label.toLocaleLowerCase());grid.appendChild(b);
 });
 search.addEventListener("input",function(){var q=search.value.trim().toLocaleLowerCase();Array.from(grid.children).forEach(function(b){b.hidden=b.getAttribute("data-title").indexOf(q)<0;});});
 host.append(folders,songs);
};
Library.prototype.refresh=function(changed){
 if(Object.keys(changed||{}).some(function(title){return !/^\$:\/(?:temp|state)\//.test(title);})){this.refreshSelf();return true;}return false;
};
exports["huwiki-repertoire-library"]=Library;
})();
