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
function printSource(wiki,setlistTitle,id){
 var item=wiki.getTiddler(id),title=item&&item.fields["music-title"]||id,t=wiki.getTiddler(title),f=t&&t.fields||{};
 var chosen=model.presentation(wiki,setlistTitle,id);
 // Video is a reading mode; a printed set uses the song's actual notation.
 if(chosen.role==="youtube"||chosen.missing){
  var views=model.availableViews(wiki,id).filter(function(v){return v.abc||v.pdf;});
  chosen=views.find(function(v){return v.role==="leadsheet";})||views[0]||{};
 }
 if(chosen.abc||chosen.pdf)return {format:chosen.pdf?"pdf":"abc",sourceTitle:chosen.sourceTitle||title,pdf:chosen.pdf||"",role:chosen.role,label:chosen.label,fallbackFrom:chosen.fallbackFrom||""};
 var ref=f["repertoire-image"]||"",asset=wiki.getTiddler(ref)||(/^image\//.test(f.type||"")?t:null),a=asset&&asset.fields||{};
 if(ref||asset){
  var image=a._canonical_uri||ref;
  if(a.text&&/^image\//.test(a.type||""))image=/^data:/.test(a.text)?a.text:a.type==="image/svg+xml"?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(a.text):"data:"+a.type+";base64,"+a.text;
  return {format:"image",sourceTitle:title,image:image,label:"Nodebillede"};
 }
 var text=String(f.text||"").replace(/<\$huwiki-repertoire-(?:piece|book)[\s\S]*?\/>/g,"").trim();
 return {format:"tiddler",sourceTitle:title,label:"Tekst og aftaler",missing:!text};
}
function open(wiki,setlistTitle,widget,options){
 options=options||{};
 var set=model.collection(wiki,setlistTitle);
 if(!set)return {error:"Vælg først en sætliste."};
 if(!widget||typeof widget.dispatchEvent!=="function")return {error:"Udgivelse kræver det åbne repertoire."};
 var site=!!options.site,scores=!!options.scores,publisher=site?"$:/plugins/huwiki/site-publisher":"$:/plugins/huwiki/print-article";
 if(!wiki.getTiddler(publisher))return {error:(site?"SitePublisher":"PDF Publisher")+" er ikke installeret i wikien."};
 // Default to the same written view as the reader, including capo, TAB and key.
 var instrument=null;try{instrument=require("$:/plugins/huwiki/abc/instrument-view.js");}catch(ignore){}
 var current=widget._instrumentView?widget._instrumentView.current():instrument&&typeof instrument.current==="function"?instrument.current():{id:"c"};
 var instrumentId=instrument&&instrument.profiles&&instrument.profiles[options.instrumentId]?options.instrumentId:
  /^(c|bb|eb|ebalto)$/.test(options.instrumentId)?options.instrumentId:current.id;
 var instrumentName=instrument&&typeof instrument.printLabel==="function"&&instrumentId===current.id?instrument.printLabel(wiki):
  {c:"C · klingende noder",bb:"B♭ · transponeret",eb:"E♭ · sopranino",ebalto:"E♭ · altsaxofon"}[instrumentId]||instrumentId;
 var orch=wiki.getTiddler(set.fields["orchestra-title"]),orchName=orch&&(orch.fields.name||orch.fields.title)||"Repertoire",setName=set.fields.name||set.fields.title;
 var entries=model.entries(wiki,setlistTitle).map(function(id,index){
  var item=wiki.getTiddler(id),title=item&&item.fields["music-title"]||id;
  var source=scores&&!site?printSource(wiki,setlistTitle,id):null;
  if(source&&source.format==='abc'){
   source.notation=Object.assign({id:instrument&&instrument.current?instrument.current().id:current.id,capo:null,tab:null,transpose:0},model.notationSettings(wiki,setlistTitle,id));
   if(options.instrumentId&&options.instrumentId!=='current')source.notation.id=instrumentId;
  }
  return {number:index+1,title:title,shortTitle:shortTitle(title,orchName),agreement:model.effective(wiki,setlistTitle,id),source:source};
 });
 var missing=entries.filter(function(e){return e.source&&e.source.missing;});
 if(missing.length)return {error:"Sættets PDF kan ikke dannes, fordi der mangler noder eller tekst til: "+missing.map(function(e){return e.shortTitle;}).join(", ")+". Ingen numre er udeladt."};
 var prefix=ROOT+encodeURIComponent(setlistTitle)+"/"+(site?"site":scores?"nodebog":"saetliste")+"/"+instrumentId+"/";
 var summaryTitle=prefix+"summary",orderTitle=prefix+"order";
 var lines=["! "+clean(orchName)+" · "+clean(setName)+"\n",(scores&&!site?"''Nodebog · "+(!options.instrumentId||options.instrumentId==='current'?'hvert nummers nodeindstillinger':instrumentName)+"''\n":""),"''"+entries.length+" numre''\n"];
 entries.forEach(function(e){
  lines.push("\n!! "+(site?wikiLink(e.number,e.shortTitle,e.title):e.number+". "+clean(e.shortTitle))+"\n");
  var a=e.agreement;
  if(e.source)add(lines,"Udskriftsudgave",e.source.label+(e.source.format==="pdf"&&instrumentId!=="c"?" · original PDF, uden transponering":""));
  if(e.source&&e.source.notation&&instrument&&instrument.create)add(lines,'Nodeindstillinger',instrument.create(e.source.notation).printLabel(wiki));
  if(a.key||a.tempo)lines.push("''"+[a.key?"Klingende toneart: "+clean(a.key):"",a.tempo?"Tempo: "+clean(a.tempo):""].filter(Boolean).join(" · ")+"''\n");
  add(lines,"Form",a.form);add(lines,"Instrumentering",a.instrumentation);add(lines,"Indsatser og tegn",a.cues);
 });
 var titles=[summaryTitle];
 if(scores)entries.forEach(function(e){if(wiki.getTiddler(e.title))titles.push(e.title);});
 try{
  var agreements={},sources={};entries.forEach(function(entry){agreements[entry.title]=entry.agreement;if(entry.source)sources[entry.title]=entry.source;});
  wiki.addTiddler(new $tw.Tiddler({title:summaryTitle,type:"text/vnd.tiddlywiki",text:lines.join("\n"),caption:orchName+" · "+setName,
   "repertoire-publication-kind":"summary","repertoire-publication-orchestra":orchName,
   "repertoire-publication-agreements":JSON.stringify(agreements),"repertoire-publication-sources":JSON.stringify(sources),"repertoire-publication-count":String(entries.length)}));
  wiki.addTiddler(new $tw.Tiddler({title:orderTitle,type:"text/vnd.tiddlywiki",list:$tw.utils.stringifyList(titles),text:""}));
  widget.dispatchEvent({type:site?"tm-huwiki-sitepublisher":"tm-huwiki-print-article",param:summaryTitle,
    paramObject:{title:summaryTitle,listTitle:orderTitle,siteTitle:orchName+" · "+setName+(scores?" · "+instrumentName:""),instrumentId:instrumentId,repertoireOrchestra:orchName}});
  return {titles:titles,summary:summaryTitle,order:orderTitle,instrumentId:instrumentId};
 }catch(error){return {error:"Udgivelse kunne ikke åbnes: "+(error&&error.message||error)};}
}
exports.cueLabel=function(wiki){return wiki.getTiddlerText("$:/language","").startsWith("$:/languages/da")?"Stiknoder og stemmer":"Cue sheets and parts";};
exports.cues=function(wiki,setlist,widget){
 wiki.setText("$:/temp/huwiki/abc/cue-selection","text",undefined,setlist);
 wiki.setText("$:/temp/huwiki/repertoire/active-setlist","text",undefined,setlist);
 widget.navigate(exports.cueLabel(wiki)==="Cue sheets and parts"?"Repertoire – Cue sheets and parts":"Repertoire – Stiknoder");
};
exports.open=open;
exports.printSource=printSource;
})();
