/*\
title: $:/plugins/huwiki/repertoire/print.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var model=require("$:/plugins/huwiki/repertoire/model.js");
var ROOT="$:/temp/huwiki/repertoire/publication/";
function clean(v){return String(v||"").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[\r\n]+/g," · ").trim();}
function add(lines,label,value){if(value)lines.push("''"+label+":'' "+clean(value)+"\n");}
function shortTitle(title,orchestra){var prefix=String(orchestra||"").trim()+" · ";return title.indexOf(prefix)===0?title.slice(prefix.length):title;}
function wikiLink(number,name,title){return "[["+number+". "+clean(name).replace(/[|\[\]]/g," ")+"|"+String(title).replace(/[|\[\]]/g," ")+"]]";}
function open(wiki,setlistTitle,widget,options){
 options=options||{};
 var set=wiki.getTiddler(setlistTitle);
 if(!set)return {error:"Vælg først en sætliste."};
 if(!widget||typeof widget.dispatchEvent!=="function")return {error:"Udgivelse kræver det åbne repertoire."};
 var site=!!options.site,scores=!!options.scores,publisher=site?"$:/plugins/huwiki/site-publisher":"$:/plugins/huwiki/print-article";
 if(!wiki.getTiddler(publisher))return {error:(site?"SitePublisher":"PDF Publisher")+" er ikke installeret i wikien."};
 var instrumentId=/^(c|bb|eb|ebalto)$/.test(options.instrumentId)?options.instrumentId:"c";
 var instrumentName={c:"C · klingende noder",bb:"B♭ · transponeret",eb:"E♭ · sopranino",ebalto:"E♭ · altsaxofon"}[instrumentId];
 var orch=wiki.getTiddler(set.fields["orchestra-title"]),orchName=orch&&(orch.fields.name||orch.fields.title)||"Repertoire",setName=set.fields.name||set.fields.title;
 var entries=model.entries(wiki,setlistTitle).map(function(id,index){
  var item=wiki.getTiddler(id),title=item&&item.fields["music-title"]||id;
  return {number:index+1,title:title,shortTitle:shortTitle(title,orchName),agreement:model.effective(wiki,setlistTitle,id)};
 });
 var prefix=ROOT+encodeURIComponent(setlistTitle)+"/"+(site?"site":scores?"nodebog":"saetliste")+"/"+instrumentId+"/";
 var summaryTitle=prefix+"summary",orderTitle=prefix+"order";
 var lines=["! "+clean(orchName)+" · "+clean(setName)+"\n",(scores&&!site?"''Nodebog til "+instrumentName+"''\n":""),"''"+entries.length+" numre''\n"];
 entries.forEach(function(e){
  lines.push("\n!! "+(site?wikiLink(e.number,e.shortTitle,e.title):e.number+". "+clean(e.shortTitle))+"\n");
  var a=e.agreement;
  if(a.key||a.tempo)lines.push("''"+[a.key?"Klingende toneart: "+clean(a.key):"",a.tempo?"Tempo: "+clean(a.tempo):""].filter(Boolean).join(" · ")+"''\n");
  add(lines,"Form",a.form);add(lines,"Instrumentering",a.instrumentation);add(lines,"Indsatser og tegn",a.cues);
 });
 var titles=[summaryTitle];
 if(scores)entries.forEach(function(e){if(wiki.getTiddler(e.title))titles.push(e.title);});
 try{
  var agreements={};entries.forEach(function(entry){agreements[entry.title]=entry.agreement;});
  wiki.addTiddler(new $tw.Tiddler({title:summaryTitle,type:"text/vnd.tiddlywiki",text:lines.join("\n"),caption:orchName+" · "+setName,
   "repertoire-publication-kind":"summary","repertoire-publication-orchestra":orchName,
   "repertoire-publication-agreements":JSON.stringify(agreements),"repertoire-publication-count":String(entries.length)}));
  wiki.addTiddler(new $tw.Tiddler({title:orderTitle,type:"text/vnd.tiddlywiki",list:$tw.utils.stringifyList(titles),text:""}));
  widget.dispatchEvent({type:site?"tm-huwiki-sitepublisher":"tm-huwiki-print-article",param:summaryTitle,
    paramObject:{title:summaryTitle,listTitle:orderTitle,siteTitle:orchName+" · "+setName+(scores?" · "+instrumentName:""),instrumentId:instrumentId,repertoireOrchestra:orchName}});
  return {titles:titles,summary:summaryTitle,order:orderTitle,instrumentId:instrumentId};
 }catch(error){return {error:"Udgivelse kunne ikke åbnes: "+(error&&error.message||error)};}
}
exports.open=open;
})();