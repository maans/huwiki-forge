/*\
title: $:/plugins/huwiki/repertoire/print.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var model=require("$:/plugins/huwiki/repertoire/model.js");
function elem(doc,parent,tag,cls,text){
 var node=doc.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined&&text!==null)node.textContent=String(text);
 if(parent)parent.appendChild(node);
 return node;
}
function agreements(doc,parent,a){
 [["Form",a.form],["Instrumentering",a.instrumentation],["Indsatser og tegn",a.cues]].forEach(function(pair){
  if(!pair[1])return;
  var line=elem(doc,parent,"p","agreement");
  elem(doc,line,"strong","",pair[0]+": ");
  elem(doc,line,"span","",pair[1]);
 });
}
function picture(wiki,tiddler){
 if(!tiddler)return "";
 var f=tiddler.fields,ref=f["repertoire-image"]||"";
 var img=wiki.getTiddler(ref)||tiddler,v=img&&img.fields||{},data=v.text||"";
 if(/^image\//.test(v.type||"")){
  if(/^data:image\//.test(data))return data;
  if(v._canonical_uri&&/^https?:\/\//.test(v._canonical_uri))return v._canonical_uri;
  if(data&&v.type!=="image/svg+xml")return "data:"+v.type+";base64,"+data;
  if(data)return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data);
 }
 return /^https?:\/\//.test(ref)?ref:"";
}
function open(wiki,setlistTitle,owner,options){
 var set=wiki.getTiddler(setlistTitle);
 if(!set)return {error:"Vælg først en sætliste."};
 if(!owner||!owner.open)return {error:"Browseren understøtter ikke denne udskriftsvisning."};
 // Opening here (during the user's click) avoids the iPad popup blocker.
 var win=owner.open("","_blank");
 if(!win)return {error:"Browseren blokerede udskriftsfanen. Tillad pop op-vinduer for Forge."};
 var doc=win.document,withScores=!!(options&&options.scores);
 try{
  doc.open();
  doc.write('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repertoire til udskrift</title></head><body></body></html>');
  doc.close();
  var style=elem(doc,doc.head,"style");
  style.textContent=[
   "@page{size:A4 portrait;margin:13mm 12mm}",
   "body{background:#fff;color:#121a24;font-family:system-ui,-apple-system,Arial,sans-serif;margin:0}",
   "main{max-width:840px;margin:20px auto;padding:12px 24px}",
   ".controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:#eaf3ee;padding:14px;border-bottom:1px solid #a9c8b5;z-index:10}",
   "button{padding:11px 16px;border:0;border-radius:8px;background:#184e3e;color:#fff;font-weight:700;font-size:15px;cursor:pointer}",
   "button:disabled{opacity:.45;cursor:wait}",
   ".status{font-size:13px;color:#245344}",
   "h1{font-size:24pt;margin:0 0 4mm}h2{font-size:16pt;margin:0 0 3mm}",
   ".subtitle{font-size:12pt;color:#444;margin-bottom:8mm}",
   ".list-row{border-top:1px solid #ddd;padding:3mm 0;break-inside:avoid;page-break-inside:avoid}",
   ".song-title{font-weight:750;font-size:12pt;margin:0 0 2mm}",
   ".meta{font-weight:650;color:#344;margin:0 0 2mm}",
   ".agreement{margin:1.2mm 0;white-space:pre-wrap;font-size:10.5pt;line-height:1.3}",
   ".song-page{break-before:page;page-break-before:always}",
   ".score{margin:6mm 0 0;max-width:100%}",
   ".score svg{max-width:100%;width:100%;height:auto;break-inside:avoid;page-break-inside:avoid;display:block}",
   ".score img{width:100%;height:auto;break-inside:avoid}",
   ".fallback{font-size:11pt;color:#555}",
   "@media print{main{max-width:none;padding:0;margin:0}.controls{display:none!important}.song-page{break-before:page;page-break-before:always}.score svg{break-inside:avoid;page-break-inside:avoid}}"
  ].join("\n");
  var controls=elem(doc,doc.body,"div","controls");
  var print=elem(doc,controls,"button","","Print / gem som PDF");
  print.type="button";print.disabled=withScores;
  print.addEventListener("click",function(){win.focus();win.print();});
  var status=elem(doc,controls,"span","status",withScores?"Indlæser noder…":"Sætliste klar til udskrift");
  var main=elem(doc,doc.body,"main");
  var orchestra=wiki.getTiddler(set.fields["orchestra-title"]);
  var orchestraName=orchestra&&(orchestra.fields.name||orchestra.fields.title)||"Repertoire";
  var title=set.fields.name||set.fields.title;
  var entries=model.entries(wiki,setlistTitle).map(function(id,i){
   var t=wiki.getTiddler(id),source=t&&wiki.getTiddler(t.fields["music-title"]);
   return {number:i+1,title:t&&t.fields["music-title"]||id,
    agreement:model.effective(wiki,setlistTitle,id),source:source};
  });
  elem(doc,main,"h1","",withScores?"Nodebog":"Sætliste");
  elem(doc,main,"p","subtitle",orchestraName+" · "+title+" · "+entries.length+" numre");
  if(!entries.length)elem(doc,main,"p","fallback","Sætlisten har endnu ingen numre.");
  entries.forEach(function(item){
   var row=elem(doc,main,"section","list-row");
   elem(doc,row,"p","song-title",item.number+". "+item.title);
   var a=item.agreement,meta=[a.key?"Toneart: "+a.key:"",a.tempo?"Tempo: "+a.tempo:""].filter(Boolean).join(" · ");
   if(meta)elem(doc,row,"p","meta",meta);
   agreements(doc,row,a);
  });
  if(!withScores)return {window:win};
  var jobs=[];
  entries.forEach(function(item){
   var page=elem(doc,main,"article","song-page");
   elem(doc,page,"h2","",item.number+". "+item.title);
   var a=item.agreement,meta=[a.key?"Toneart: "+a.key:"",a.tempo?"Tempo: "+a.tempo:""].filter(Boolean).join(" · ");
   if(meta)elem(doc,page,"p","meta",meta);
   agreements(doc,page,a);
   var target=elem(doc,page,"div","score"),source=item.source;
   if(source&&typeof source.fields["abc-source"]==="string"&&source.fields["abc-source"].trim())
    jobs.push({target:target,abc:source.fields["abc-source"]});
   else{
    var image=picture(wiki,source);
    if(image){var img=elem(doc,target,"img");img.src=image;img.alt="Noder til "+item.title;}
    else elem(doc,target,"p","fallback","Ingen nodekilde er knyttet til dette nummer.");
   }
  });
  if(!jobs.length){status.textContent="Nodebogen er klar (ingen ABC-partiturer at gengive).";print.disabled=false;return {window:win};}
  var loader=require("$:/plugins/huwiki/abc/loader.js");
  loader.load().then(function(ABC){
   var count=0,errors=0;
   function next(){
    if(win.closed)return;
    if(count===jobs.length){
     status.textContent=errors?"Klar med "+errors+" partiturfejl. Kontrollér siderne før udskrift.":"Alle "+jobs.length+" partiturer er klar. Kontrollér sideskift før udskrift.";
     print.disabled=false;return;
    }
    var job=jobs[count];
    try{
     ABC.renderAbc(job.target,job.abc,{print:true,oneSvgPerLine:true,responsive:"resize",staffwidth:720,scale:0.88,paddingtop:0,paddingbottom:0});
    }catch(error){
     errors++;elem(doc,job.target,"p","fallback","Partituret kunne ikke gengives: "+error.message);
    }
    count++;status.textContent="Gør nodebog klar: "+count+" / "+jobs.length;
    owner.setTimeout(next,0);
   }
   next();
  }).catch(function(error){
   status.textContent="Noderne kunne ikke indlæses: "+error.message+". Aftalerne kan stadig udskrives.";
   print.disabled=false;
  });
  return {window:win};
 }catch(error){
  try{win.close();}catch(_ignored){}
  return {error:"Udskriftsvisningen kunne ikke oprettes: "+error.message};
 }
}
exports.open=open;
})();