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
  "music-title":musicTitle,"repertoire-key":"","repertoire-tempo":"","repertoire-form":"",text:""});
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
function reorderEntries(wiki,setlistTitle,titles){
 var list=wiki.getTiddler(setlistTitle);if(!list||list.fields[KIND]!=="setlist")throw Error("Sætlisten findes ikke.");
 var current=entries(wiki,setlistTitle),counts=Object.create(null);
 var error="Rækkefølgen skal indeholde præcis de samme numre som sætlisten.";
 if(!Array.isArray(titles)||titles.length!==current.length)throw Error(error);
 current.forEach(function(title){counts[title]=(counts[title]||0)+1;});
 titles.forEach(function(title){
  if(typeof title!=="string"||!counts[title])throw Error(error);counts[title]--;
 });
 var next=titles.slice();
 // Reordering cannot add/remove members, including references whose source or
 // repertoire record is temporarily unavailable. Only explicit edits may do so.
 update(wiki,list,{list:$tw.utils.stringifyList(next)});
 return next;
}
function addEntry(wiki,setlistTitle,item){return setEntries(wiki,setlistTitle,entries(wiki,setlistTitle).concat([item]));}
function overrides(setlist){
 try{var data=JSON.parse(setlist&&setlist.fields["repertoire-overrides"]||"{}");
  return data&&typeof data==="object"&&!Array.isArray(data)?data:{};
 }catch(_e){return {};}
}
function effective(wiki,setlistTitle,itemTitle){
 var item=wiki.getTiddler(itemTitle);
 if(!item)return {key:"",tempo:"",form:""};
 var f=item.fields,defaults={key:f["repertoire-key"]||"",tempo:f["repertoire-tempo"]||"",form:f["repertoire-form"]||""};
 var setlist=wiki.getTiddler(setlistTitle);
 var applies=setlist&&setlist.fields[KIND]==="setlist"&&setlist.fields["orchestra-title"]===f["orchestra-title"]&&
  entries(wiki,setlistTitle).indexOf(itemTitle)>=0;
 var override=applies&&overrides(setlist)[itemTitle];
 return Object.assign(defaults,override||{});
}
function saveArrangement(wiki,itemTitle,setlistTitle,values,scope){
 var item=wiki.getTiddler(itemTitle);if(!item||item.fields[KIND]!=="orchestra-item")throw Error("Repertoirepost mangler.");
 var details={key:normalized(values.key),tempo:normalized(values.tempo),form:String(values.form||"").trim()};
 if(scope==="orchestra"){
  update(wiki,item,{"repertoire-key":details.key,"repertoire-tempo":details.tempo,"repertoire-form":details.form});
 }else if(scope==="setlist"){
  var list=wiki.getTiddler(setlistTitle);
  if(!list||list.fields["orchestra-title"]!==item.fields["orchestra-title"]||entries(wiki,setlistTitle).indexOf(itemTitle)<0)
   throw Error("Vælg en sætliste med denne melodi.");
  var changes=overrides(list);changes[itemTitle]=details;
  update(wiki,list,{"repertoire-overrides":JSON.stringify(changes)});
 }else throw Error("Ukendt lagringstype.");
 return details;
}
function headerValue(source,field){
 var found=String(source||"").match(new RegExp("^[ \\t]*"+field+":[ \\t]*(.*)$","m"));
 return found?normalized(found[1]):"";
}
function tempoValue(value){
 var text=normalized(value),beat=text.match(/=\s*(\d+(?:\.\d+)?)/);
 if(beat)return beat[1];
 // ABC also permits a bare metronome value or a description without a value.
 return text.replace(/^"([^"]*)"$/,"$1");
}
function searchText(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("da").replace(/æ/g,"ae").replace(/ø/g,"o");
}
function natural(a,b){return String(a||"").localeCompare(String(b||""),"da",{numeric:true,sensitivity:"base"});}
function compareRows(a,b,sort){
 var result=0;
 if(sort==="tempo"){
  var av=Number(tempoValue(a.tempo)),bv=Number(tempoValue(b.tempo));
  var an=Number.isFinite(av)&&av>0,bn=Number.isFinite(bv)&&bv>0;
  result=an&&bn?av-bv:an?-1:bn?1:0;
 }else if(sort==="key"){
  result=a.key&&b.key?natural(a.key,b.key):a.key?-1:b.key?1:0;
 }else if(sort==="type")result=natural(a.kind,b.kind);
 return result||natural(a.label,b.label)||natural(a.title,b.title)||natural(a.itemTitle,b.itemTitle);
}
// Searching and ordering a catalogue are views over the existing records. They
// never rewrite source notation, orchestra agreements or a setlist's order.
function catalog(wiki,orchestraTitle,options){
 var opts=options||{},known=items(wiki,orchestraTitle),members=Object.create(null);
 known.forEach(function(item){members[item.fields["music-title"]]=item;});
 var set=wiki.getTiddler(opts.setlistTitle||""),selected=Object.create(null);
 var validSet=!!(set&&set.fields[KIND]==="setlist"&&set.fields["orchestra-title"]===orchestraTitle);
 if(validSet)entries(wiki,opts.setlistTitle).forEach(function(title){selected[title]=true;});
 var titles=opts.scope==="library"?songs(wiki).map(function(t){return t.fields.title;}):
  known.map(function(t){return t.fields["music-title"];});
 // An orchestra may refer to a plain text tiddler which predates this plugin.
 // Keep those original sources visible in the shared library as well.
 if(opts.scope==="library")byKind(wiki,"orchestra-item").forEach(function(item){
  var title=item.fields["music-title"];
  if(title&&wiki.tiddlerExists(title))titles.push(title);
 });
 var seen=Object.create(null),rows=[];
 titles.forEach(function(title){
  if(!title||seen[title])return;seen[title]=true;
  var source=wiki.getTiddler(title),f=source?source.fields:{},abc=f["abc-source"];
  var member=members[title],id=member?member.fields.title:"",inSetlist=!!selected[id];
  var values=id?effective(wiki,inSetlist?opts.setlistTitle:"",id):{key:"",tempo:""};
  var sourceKey=headerValue(abc,"K").split(/\s|%/)[0];
  var sourceTempo=tempoValue(headerValue(abc,"Q").split("%")[0]);
  rows.push({title:title,label:normalized(f.caption)||headerValue(abc,"T")||title,
   itemTitle:id,key:values.key||sourceKey,tempo:values.tempo||sourceTempo,
   kind:typeof abc==="string"?"abc":(f["repertoire-image"]||/^image\//.test(f.type||""))?"image":"text",
   inSetlist:inSetlist});
 });
 var words=searchText(opts.query).trim().split(/\s+/).filter(Boolean);
 if(words.length)rows=rows.filter(function(row){
  var types=row.kind==="abc"?"ABC noder notation":row.kind==="image"?"billede image scan":"tekst text";
  var haystack=searchText([row.label,row.title,row.key,row.tempo,types].join(" "));
  return words.every(function(word){return haystack.indexOf(word)>=0;});
 });
 return rows.sort(function(a,b){return compareRows(a,b,opts.sort);});
}
function sortEntries(wiki,setlistTitle,sort){
 var list=wiki.getTiddler(setlistTitle),original=entries(wiki,setlistTitle).slice();
 if(!list||list.fields[KIND]!=="setlist")return original;
 var rows=catalog(wiki,list.fields["orchestra-title"],{setlistTitle:setlistTitle,sort:sort});
 var sorted=rows.filter(function(row){return row.inSetlist;}).map(function(row){return row.itemTitle;});
 // A missing source or foreign reference must not silently disappear on sort.
 original.forEach(function(title){if(sorted.indexOf(title)<0)sorted.push(title);});
 return sorted;
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
exports.reorderEntries=reorderEntries;
exports.addEntry=addEntry;
exports.effective=effective;
exports.saveArrangement=saveArrangement;
exports.catalog=catalog;
exports.sortEntries=sortEntries;
})();
