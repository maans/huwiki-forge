/*\
title: $:/plugins/huwiki/repertoire/model.js
type: application/javascript
module-type: library
\*/
(function() {
"use strict";
// A piece is stored only once. An orchestra item points at that piece; a
// setlist points at orchestra items. Neither copies the original score.
var KIND="repertoire-kind", ROOT="Repertoire";
function normalized(s) {return String(s||"").trim().replace(/\s+/g," ");}
function all(wiki) {return wiki.allTitles().map(function(title){return wiki.getTiddler(title);}).filter(Boolean);}
function byKind(wiki,kind) {return all(wiki).filter(function(t){return t.fields[KIND]===kind;});}
function create(wiki,fields){wiki.addTiddler(new $tw.Tiddler(wiki.getCreationFields(),fields));}
function update(wiki,tiddler,fields){wiki.addTiddler(new $tw.Tiddler(tiddler,fields));}
function orchestras(wiki){return byKind(wiki,"orchestra").sort(function(a,b){return (a.fields.name||a.fields.title).localeCompare(b.fields.name||b.fields.title);});}
function orchestra(wiki,name){
 name=normalized(name);if(!name)throw Error("Skriv orkestrets navn.");
 var old=orchestras(wiki).find(function(t){return (t.fields.name||"").toLocaleLowerCase()===name.toLocaleLowerCase();});
 if(old)return old.fields.title;
 var title=ROOT+"/Orkestre/"+encodeURIComponent(name);
 if(wiki.tiddlerExists(title))throw Error("Orkestrets id bruges allerede.");
 create(wiki,{title:title,"repertoire-kind":"orchestra",name:name,text:""});
 return title;
}
function parseTitles(text){
 var seen=Object.create(null);
 return String(text||"").split(/\r?\n/).map(function(line){
  return normalized(line.replace(/^\s*(?:[•*–-]|\d+[.)])\s+/,"").split("\t")[0]);
 }).filter(function(s){if(!s)return false;var k=s.toLocaleLowerCase();if(seen[k])return false;seen[k]=true;return true;});
}
function songs(wiki){
 return all(wiki).filter(function(t){
  var f=t.fields;return f[KIND]==="piece"||typeof f["abc-source"]==="string"||
   typeof f["repertoire-image"]==="string"||(f.tags||[]).indexOf("RepertoireMelodi")>=0;
 }).sort(function(a,b){return a.fields.title.localeCompare(b.fields.title);});
}
function addPiece(wiki,title){
 title=normalized(title);if(!title)throw Error("En melodi skal have en titel.");
 // Do not alter a source score (including ABC and image tiddlers) on import.
 if(wiki.tiddlerExists(title))return {title:title,created:false};
 create(wiki,{title:title,"repertoire-kind":"piece",tags:["RepertoireMelodi"],text:""});
 return {title:title,created:true};
}
function items(wiki,orchestraTitle){
 return byKind(wiki,"orchestra-item").filter(function(t){return t.fields["orchestra-title"]===orchestraTitle;})
  .sort(function(a,b){return (a.fields["music-title"]||"").localeCompare(b.fields["music-title"]||"");});
}
function itemTitle(orchestraTitle,musicTitle){return ROOT+"/Poster/"+encodeURIComponent(orchestraTitle)+"/"+encodeURIComponent(musicTitle);}
function addItem(wiki,orchestraTitle,musicTitle){
 if(!wiki.tiddlerExists(orchestraTitle))throw Error("Orkestret findes ikke.");
 if(!wiki.tiddlerExists(musicTitle))throw Error("Melodien findes ikke.");
 var title=itemTitle(orchestraTitle,musicTitle);
 if(wiki.tiddlerExists(title))return {title:title,created:false};
 create(wiki,{title:title,"repertoire-kind":"orchestra-item","orchestra-title":orchestraTitle,
  "music-title":musicTitle,"repertoire-key":"","repertoire-tempo":"","repertoire-form":"","repertoire-instrumentation":"","repertoire-cues":"",text:""});
 return {title:title,created:true};
}
function importTitles(wiki,orchestraTitle,text){
 var names=parseTitles(text),createdPieces=0,createdItems=0,existingPieces=0;
 names.forEach(function(name){
  var p=addPiece(wiki,name);if(p.created)createdPieces++;else existingPieces++;
  if(addItem(wiki,orchestraTitle,p.title).created)createdItems++;
 });
 return {titles:names.length,createdPieces:createdPieces,existingPieces:existingPieces,createdItems:createdItems};
}
function setlists(wiki,orchestraTitle){
 return byKind(wiki,"setlist").filter(function(t){return t.fields["orchestra-title"]===orchestraTitle;})
  .sort(function(a,b){return (a.fields.name||a.fields.title).localeCompare(b.fields.name||b.fields.title);});
}
function createSetlist(wiki,orchestraTitle,name){
 name=normalized(name);if(!name)throw Error("Skriv sætlistens navn.");
 if(!wiki.tiddlerExists(orchestraTitle))throw Error("Orkestret findes ikke.");
 var old=setlists(wiki,orchestraTitle).find(function(t){return (t.fields.name||"").toLocaleLowerCase()===name.toLocaleLowerCase();});
 if(old)return old.fields.title;
 var title=ROOT+"/Saetlister/"+encodeURIComponent(orchestraTitle)+"/"+encodeURIComponent(name);
 if(wiki.tiddlerExists(title))throw Error("Sætlistens id bruges allerede.");
 create(wiki,{title:title,"repertoire-kind":"setlist","orchestra-title":orchestraTitle,
  name:name,list:"","repertoire-overrides":"{}",text:""});
 return title;
}
function entries(wiki,setlistTitle){return wiki.getTiddlerList(setlistTitle,"list")||[];}
function setEntries(wiki,setlistTitle,titles){
 var list=wiki.getTiddler(setlistTitle);if(!list||list.fields[KIND]!=="setlist")throw Error("Sætlisten findes ikke.");
 var allowed=Object.create(null);
 items(wiki,list.fields["orchestra-title"]).forEach(function(t){allowed[t.fields.title]=true;});
 var seen=Object.create(null),safe=[];
 titles.forEach(function(title){if(allowed[title]&&!seen[title]){seen[title]=true;safe.push(title);}});
 update(wiki,list,{list:$tw.utils.stringifyList(safe)});
 return safe;
}
function addEntry(wiki,setlistTitle,item){return setEntries(wiki,setlistTitle,entries(wiki,setlistTitle).concat([item]));}
function overrides(setlist){
 try{var data=JSON.parse(setlist&&setlist.fields["repertoire-overrides"]||"{}");
  return data&&typeof data==="object"&&!Array.isArray(data)?data:{};
 }catch(_e){return {};}
}
// Read the score header without modifying the original music tiddler.
// A K: field describes the notated key signature; do not guess a concert key from the title.
function sourceAgreement(wiki,itemTitle){
 var item=wiki.getTiddler(itemTitle),source=item&&wiki.getTiddler(item.fields["music-title"]);
 var abc=source&&(source.fields["abc-source"]||"");
 if(!abc&&source&&source.fields.type==="text/vnd.abc")abc=source.fields.text||"";
 var key="",tempo="",lines=String(abc||"").split(/\r?\n/);
 for(var i=0;i<lines.length;i++){
  var line=lines[i],q=/^\s*Q:\s*(.*?)\s*$/.exec(line),k=/^\s*K:\s*(.*?)\s*$/.exec(line);
  if(q&&!tempo)tempo=q[1];
  if(k){key=(k[1].match(/^\S+/)||[])[0]||"";break;}
 }
 if(/^%%MIDI\s+transpose\s/m.test(abc)){
  var live=require("$:/plugins/huwiki/repertoire/live-score.js"),offset=live.soundingOffset(abc);
  if(offset)return {key:live.shiftKey(key,offset),writtenKey:key,tempo:tempo};
 }
 return {key:key,tempo:tempo};
}
function baseline(wiki,itemTitle){
 var item=wiki.getTiddler(itemTitle),f=item&&item.fields||{},source=sourceAgreement(wiki,itemTitle);
 return {key:f["repertoire-key"]||source.key,tempo:f["repertoire-tempo"]||source.tempo,
  form:f["repertoire-form"]||"",instrumentation:f["repertoire-instrumentation"]||"",cues:f["repertoire-cues"]||""};
}
function effective(wiki,setlistTitle,itemTitle){
 var details=baseline(wiki,itemTitle),setlist=wiki.getTiddler(setlistTitle);
 var override=setlist&&overrides(setlist)[itemTitle]||{};
 Object.keys(override).forEach(function(k){
  if(!Object.prototype.hasOwnProperty.call(details,k))return;
  // Older repertoire files stored empty key/tempo overrides even when no override was intended.
  if((k==="key"||k==="tempo")&&!override[k])return;
  details[k]=override[k];
 });
 return details;
}
function saveArrangement(wiki,itemTitle,setlistTitle,values,scope){
 var item=wiki.getTiddler(itemTitle);if(!item||item.fields[KIND]!=="orchestra-item")throw Error("Repertoirepost mangler.");
 var source=sourceAgreement(wiki,itemTitle),base=baseline(wiki,itemTitle),details={
  key:normalized(values.key)||base.key,tempo:normalized(values.tempo)||base.tempo,
  form:String(values.form||"").trim(),instrumentation:String(values.instrumentation||"").trim(),cues:String(values.cues||"").trim()
 };
 if(scope==="orchestra"){
  // An unchanged value keeps following the score instead of freezing a copy of its header.
  update(wiki,item,{"repertoire-key":details.key===source.key?"":details.key,
   "repertoire-tempo":details.tempo===source.tempo?"":details.tempo,
   "repertoire-form":details.form,"repertoire-instrumentation":details.instrumentation,"repertoire-cues":details.cues});
 }else if(scope==="setlist"){
  var list=wiki.getTiddler(setlistTitle);
  if(!list||list.fields["orchestra-title"]!==item.fields["orchestra-title"]||entries(wiki,setlistTitle).indexOf(itemTitle)<0)
   throw Error("Vælg en sætliste med denne melodi.");
  var changes=overrides(list),delta={};
  ["key","tempo","form","instrumentation","cues"].forEach(function(field){
   if(details[field]!==base[field])delta[field]=details[field];
  });
  if(Object.keys(delta).length)changes[itemTitle]=delta;
  else delete changes[itemTitle];
  update(wiki,list,{"repertoire-overrides":JSON.stringify(changes)});
 }else throw Error("Ukendt lagringstype.");
 return details;
}
exports.orchestras=orchestras;
exports.orchestra=orchestra;
exports.songs=songs;
exports.parseTitles=parseTitles;
exports.addPiece=addPiece;
exports.items=items;
exports.addItem=addItem;
exports.importTitles=importTitles;
exports.setlists=setlists;
exports.createSetlist=createSetlist;
exports.entries=entries;
exports.setEntries=setEntries;
exports.addEntry=addEntry;
exports.sourceAgreement=sourceAgreement;
exports.baseline=baseline;
exports.effective=effective;
exports.saveArrangement=saveArrangement;
})();