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
function category(tiddler){
 var f=tiddler&&tiddler.fields||tiddler||{};
 return String(f["repertoire-category"]||"").toLowerCase()==="leadsheet"||String(f["repertoire-has-leadsheet"]||"").toLowerCase()==="yes"?"leadsheet":"";
}
function work(wiki,value){
 var t=typeof value==="string"?wiki.getTiddler(value):value;
 if(t&&t.fields[KIND]==="orchestra-item")t=wiki.getTiddler(t.fields["music-title"]);
 return t;
}
function abcAvailable(t){var f=t&&t.fields||{};return typeof f["abc-source"]==="string"&&!!f["abc-source"].trim()||f.type==="text/vnd.abc"&&!!String(f.text||"").trim();}
function pdfReference(wiki,value){var ref=String(value||""),asset=ref&&wiki.getTiddler(ref);return asset?String(asset.fields._canonical_uri||""):ref;}
function configuredRole(wiki){return wiki.getTiddlerText?String(wiki.getTiddlerText("$:/config/maans/repertoire/default-source-role","")||""):"";}
var viewLabels={leadsheet:"Leadsheet (ABC)",guitar:"Guitar (PDF)","chord-stabs":"Guitar · chord stabs (ABC)",score:"Partitur (PDF)",abc:"ABC",pdf:"PDF",youtube:"YouTube"};
// Accept only a single YouTube video, never arbitrary iframe HTML or hosts.
function youtubeId(value){
 var text=String(value||'').trim(),match;
 if(/^[A-Za-z0-9_-]{11}$/.test(text))return text;
 if((match=/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#]|$)/i.exec(text)))return match[1];
 if((match=/^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/i.exec(text)))return match[1];
 if(/^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/watch\?/i.test(text)&&(match=/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(text)))return match[1];
 return '';
}
function video(wiki,value){
 var t=work(wiki,value),f=t&&t.fields||{},id=youtubeId(f['repertoire-youtube']);
 return {id:id,title:String(f['repertoire-youtube-title']||''),match:String(f['repertoire-youtube-match']||''),note:String(f['repertoire-youtube-note']||''),source:String(f['repertoire-youtube-source']||''),start:Math.max(0,parseInt(f['repertoire-youtube-start'],10)||0)};
}
function setVideo(wiki,title,url){
 var t=work(wiki,title);if(!t)throw Error('Nummeret findes ikke.');
 var id=youtubeId(url);if(String(url||'').trim()&&!id)throw Error('Indsæt et gyldigt link til én YouTube-video.');
 update(wiki,t,{'repertoire-youtube':id?'https://www.youtube.com/watch?v='+id:'','repertoire-youtube-match':id?'manual':'','repertoire-youtube-title':'','repertoire-youtube-note':'','repertoire-youtube-source':'','repertoire-youtube-start':''});
}
function availableViews(wiki,value){
 var t=work(wiki,value),f=t&&t.fields||{},out=[],defaultRole=configuredRole(wiki),generic=pdfReference(wiki,f["repertoire-pdf"]||(f.type==="application/pdf"?f._canonical_uri:""));
 var guitar=pdfReference(wiki,f["repertoire-guitar-pdf"])||(defaultRole!=="score"&&defaultRole!==""?generic:""),score=pdfReference(wiki,f["repertoire-score-pdf"])||(defaultRole==="score"?generic:"");
 var leadRef=String(f["repertoire-leadsheet-source"]||""),lead=leadRef&&wiki.getTiddler(leadRef),stabsRef=String(f["repertoire-chord-stabs-source"]||""),stabs=stabsRef&&wiki.getTiddler(stabsRef);
 var canonicalLead=abcAvailable(t)&&!leadRef&&category(t)==="leadsheet"&&f["repertoire-sheet-format"]!=="chords"&&!/guitar|chord.?stab/i.test(f["repertoire-abc-label"]||"");
 function add(role,record,pdf){
  var label=role==="leadsheet"?String(record&&record.fields["repertoire-abc-label"]||f["repertoire-abc-label"]||viewLabels[role]):viewLabels[role];
  out.push({role:role,label:label,format:pdf?"pdf":"abc",abc:!pdf,pdf:pdf||"",sourceTitle:record&&record.fields.title||f.title||"",abcLabel:role==="leadsheet"?label:role==="chord-stabs"?viewLabels[role]:String(f["repertoire-abc-label"]||"ABC")});
 }
 if(abcAvailable(lead))add("leadsheet",lead);else if(canonicalLead)add("leadsheet",t);
 if(guitar)add("guitar",t,guitar);
 if(abcAvailable(stabs))add("chord-stabs",stabs);else if(abcAvailable(t)&&!canonicalLead)add(guitar||defaultRole==="guitar"||f["repertoire-sheet-format"]==="chords"||f["repertoire-source-role"]==="chord-stabs"?"chord-stabs":"abc",t);
 if(score)add("score",t,score);
 if(generic&&!guitar&&!score)add("pdf",t,generic);
 var clip=video(wiki,t);if(clip.id)out.push({role:"youtube",label:"YouTube",format:"youtube",abc:false,pdf:"",sourceTitle:f.title||"",video:clip});
 return out;
}
function notation(wiki,value){
 var t=work(wiki,value),f=t&&t.fields||{},views=availableViews(wiki,t),pdf=views.find(function(v){return !!v.pdf;});
 return {abc:views.some(function(v){return v.abc;}),pdf:pdf&&pdf.pdf||"",category:category(t),abcLabel:String(f["repertoire-abc-label"]||"ABC")};
}
function presentation(wiki,setlistTitle,itemTitle){
 var item=wiki.getTiddler(itemTitle),t=work(wiki,item),f=t&&t.fields||{},itemFields=item&&item.fields||{},set=wiki.getTiddler(setlistTitle),setFields=set&&set.fields||{},override=overrides(set)[itemTitle]||{};
 var role=override.sourceRole||setFields["repertoire-source-role"]||itemFields["repertoire-source-role"]||f["repertoire-source-role"]||configuredRole(wiki);
 var format=override.sheetFormat||setFields["repertoire-sheet-format"]||itemFields["repertoire-sheet-format"]||f["repertoire-sheet-format"]||"";if(format==="chords")format="abc";
 var views=availableViews(wiki,t),selected=role?views.find(function(v){return v.role===role;}):null;
 if(!role){selected=views.find(function(v){return format?v.format===format:v.abc;})||(!format?views[0]:null);role=selected&&selected.role||"";}
 // A folder preference must not hide music that exists in another edition.
 // Keep the saved preference so the next song can use its requested source.
 var requestedRole=role,preferredFormat=format||(/^(guitar|score|pdf)$/.test(role)?"pdf":/^(leadsheet|chord-stabs|abc)$/.test(role)?"abc":"");
 if(!selected&&role!=='youtube'&&format!=='youtube'){
  var notationViews=views.filter(function(v){return v.role!=='youtube';});
  var counterpart=role==='guitar'?'chord-stabs':role==='score'?'abc':'';
  selected=notationViews.find(function(v){return counterpart&&v.role===counterpart;})||
   notationViews.find(function(v){return preferredFormat&&v.format===preferredFormat;})||
   notationViews.find(function(v){return v.role==='leadsheet';})||notationViews[0]||null;
 }

 return Object.assign({abc:false,pdf:"",sourceTitle:"",role:role,format:format||(role==="youtube"?"youtube":/^(guitar|score|pdf)$/.test(role)?"pdf":"abc"),label:viewLabels[role]||"Noder",category:category(t),missing:!selected,fallbackFrom:selected&&requestedRole&&selected.role!==requestedRole?requestedRole:""},selected||{});
}
function setPresentation(wiki,setlistTitle,itemTitle,role){
 if(role&&!Object.prototype.hasOwnProperty.call(viewLabels,role))throw Error("Ukendt nodevisning.");
 var set=wiki.getTiddler(setlistTitle);if(!set)throw Error("Vælg en nodemappe eller sætliste.");
 var format=role==="youtube"?"youtube":/^(guitar|score|pdf)$/.test(role)?"pdf":"abc";
 if(!itemTitle){update(wiki,set,{"repertoire-source-role":role,"repertoire-sheet-format":role?format:""});return;}
 if(entries(wiki,setlistTitle).indexOf(itemTitle)<0)throw Error("Nummeret findes ikke i denne nodemappe.");
 var changes=overrides(set),next=Object.assign({},changes[itemTitle]||{});
 if(role){next.sourceRole=role;next.sheetFormat=format;}else{delete next.sourceRole;delete next.sheetFormat;}
 if(Object.keys(next).length)changes[itemTitle]=next;else delete changes[itemTitle];
 update(wiki,set,{"repertoire-overrides":JSON.stringify(changes)});
}
function matches(wiki,value,filters){
 var n=notation(wiki,value);filters=filters||{};
 return (!filters.category||filters.category==="all"||n.category===filters.category)&&
  (!filters.format||filters.format==="all"||filters.format==="abc"&&n.abc||filters.format==="pdf"&&!!n.pdf);
}
function setCategory(wiki,title,value){
 var t=wiki.getTiddler(title);if(!t)throw Error("Melodien findes ikke.");
 if(value!==""&&value!=="leadsheet")throw Error("Ukendt nodekategori.");
 update(wiki,t,{"repertoire-category":value,"repertoire-has-leadsheet":value==="leadsheet"?"yes":""});
}
function songs(wiki){
 return all(wiki).filter(function(t){
  var f=t.fields;if(f["repertoire-work-title"]||/^(orchestra|orchestra-item|setlist)$/.test(f[KIND]||""))return false;var n=notation(wiki,t);return f[KIND]==="piece"||n.abc||!!n.pdf||f.type==="application/pdf"||
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
// An orchestra is also a read-only collection of its entire repertoire.
// No synthetic setlist or duplicate music tiddlers are stored in the wiki.
function collection(wiki,title){
 var t=wiki.getTiddler(title);if(!t)return null;
 if(t.fields[KIND]!=="orchestra")return t;
 return {fields:Object.assign({},t.fields,{name:"Hele repertoiret","orchestra-title":title})};
}
function collections(wiki){return orchestras(wiki).flatMap(function(o){return setlists(wiki,o.fields.title).concat([collection(wiki,o.fields.title)]);});}
function entries(wiki,setlistTitle){
 var t=wiki.getTiddler(setlistTitle);
 if(t&&t.fields[KIND]==="orchestra")return items(wiki,setlistTitle).map(function(item){return item.fields.title;});
 return wiki.getTiddlerList(setlistTitle,"list")||[];
}
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
function sourceAgreement(wiki,itemTitle,setlistTitle){
 var item=wiki.getTiddler(itemTitle),canonical=work(wiki,item),fields=canonical&&canonical.fields||{},chosen=presentation(wiki,setlistTitle,itemTitle);
 var source=abcAvailable(canonical)?canonical:wiki.getTiddler(chosen.sourceTitle);
 if(!abcAvailable(source)){var first=availableViews(wiki,canonical).find(function(v){return v.abc;});source=first&&wiki.getTiddler(first.sourceTitle);}
 var abc=source&&(source.fields["abc-source"]||"");
 if(!abc&&source&&source.fields.type==="text/vnd.abc")abc=source.fields.text||"";
 var key="",tempo="",lines=String(abc||"").split(/\r?\n/);
 for(var i=0;i<lines.length;i++){
  var line=lines[i],q=/^\s*Q:\s*(.*?)\s*$/.exec(line),k=/^\s*K:\s*(.*?)\s*$/.exec(line);
  if(q&&!tempo)tempo=q[1];
  if(k){key=(k[1].match(/^\S+/)||[])[0]||"";break;}
 }
 key=fields["repertoire-key"]||fields["abc-key"]||key;tempo=fields["repertoire-tempo"]||fields["abc-tempo"]||tempo;
 if(!fields["repertoire-key"]&&/^%%MIDI\s+transpose\s/m.test(abc)){
  var live=require("$:/plugins/huwiki/repertoire/live-score.js"),offset=live.soundingOffset(abc);
  if(offset)return {key:live.shiftKey(key,offset),writtenKey:key,tempo:tempo};
 }
 return {key:key,tempo:tempo};
}
function baseline(wiki,itemTitle,setlistTitle){
 var item=wiki.getTiddler(itemTitle),f=item&&item.fields||{},source=sourceAgreement(wiki,itemTitle,setlistTitle);
 return {key:f["repertoire-key"]||source.key,tempo:f["repertoire-tempo"]||source.tempo,
  form:f["repertoire-form"]||"",instrumentation:f["repertoire-instrumentation"]||"",cues:f["repertoire-cues"]||""};
}
function effective(wiki,setlistTitle,itemTitle){
 var details=baseline(wiki,itemTitle,setlistTitle),setlist=wiki.getTiddler(setlistTitle);
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
 var source=sourceAgreement(wiki,itemTitle,setlistTitle),base=baseline(wiki,itemTitle,setlistTitle),details={
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
  ["sourceRole","sheetFormat"].forEach(function(field){if(changes[itemTitle]&&changes[itemTitle][field])delta[field]=changes[itemTitle][field];});
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
exports.youtubeId=youtubeId;exports.video=video;exports.setVideo=setVideo;exports.presentation=presentation;exports.availableViews=availableViews;exports.setPresentation=setPresentation;exports.viewLabels=viewLabels;exports.songs=songs;exports.category=category;exports.notation=notation;exports.matches=matches;exports.setCategory=setCategory;
exports.parseTitles=parseTitles;
exports.addPiece=addPiece;
exports.items=items;
exports.addItem=addItem;
exports.importTitles=importTitles;
exports.setlists=setlists;
exports.createSetlist=createSetlist;
exports.entries=entries;
exports.collection=collection;exports.collections=collections;
exports.setEntries=setEntries;
exports.addEntry=addEntry;
exports.sourceAgreement=sourceAgreement;
exports.baseline=baseline;
exports.effective=effective;
exports.saveArrangement=saveArrangement;
})();

