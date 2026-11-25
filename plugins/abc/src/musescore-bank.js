/*\
title: $:/plugins/huwiki/abc/musescore-bank.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var ROOT='https://forge.xn--mns-ula.dk/';
var BANKS=[{id:'akustisk-elektrisk',name:'Akustisk Elektrisk'},{id:'silba-atno',name:'Silba Ätno'}];
var cache=Object.create(null);
function normalize(value){return String(value||'').replace(/[øØ]/g,'o').replace(/[æÆ]/g,'ae').replace(/[đĐ]/g,'dj').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function installed(wiki){
 var out=Object.create(null);if(!wiki||!wiki.filterTiddlers)return out;
 wiki.filterTiddlers('[all[shadows+tiddlers]tag[$:/tags/MuseScoreCatalogue]]').forEach(function(title){
  try{var t=wiki.getTiddler(title),data=JSON.parse(t.fields.text);if(data.schemaVersion===1&&/^[a-z0-9-]+$/.test(data.id)&&Array.isArray(data.entries))out[data.id]={id:data.id,name:data.name,index:data};}catch(_){}
 });return out;
}
function list(wiki){var found=installed(wiki),out=BANKS.map(function(b){return found[b.id]||b;});Object.keys(found).forEach(function(id){if(!out.some(function(b){return b.id===id;}))out.push(found[id]);});return out;}
function validate(index,id){
 if(!index||index.schemaVersion!==1||index.id!==id||!Array.isArray(index.entries)||index.entries.length>5000)throw Error('Nodearkivets indeks kunne ikke læses.');
 return index;
}
async function index(id,wiki,signal){
 var local=installed(wiki)[id];if(local)return validate(local.index,id);
 if(!BANKS.some(function(b){return b.id===id;}))throw Error('Ukendt nodearkiv.');
 if(cache[id])return cache[id];
 var response=await fetch(ROOT+'catalog/musescore/'+id+'.json',{signal:signal,cache:'no-cache'});
 if(!response.ok)throw Error('Nodearkivet kunne ikke hentes ('+response.status+').');
 return cache[id]=validate(await response.json(),id);
}
function filter(index,query){
 var words=normalize(query).trim().split(/\s+/).filter(Boolean),groups=Object.create(null);
 index.entries.forEach(function(entry){
  var group=groups[entry.family]||(groups[entry.family]={id:entry.family,title:entry.title,versions:[],matched:[]});
  group.versions.push(entry);if(entry.preferred)group.title=entry.title;
  var hay=normalize([entry.title,(entry.aliases||[]).join(' '),entry.composer,entry.arranger,entry.key,entry.meter,(entry.instruments||[]).join(' '),entry.arrangement,entry.sourceFile,entry.contributor,entry.status,entry.date].join(' '));
  if(words.every(function(word){return hay.indexOf(word)>=0;}))group.matched.push(entry);
 });
 return Object.keys(groups).map(function(k){var group=groups[k];group.versions.sort(function(a,b){return Number(!!b.preferred)-Number(!!a.preferred)||String(b.date).localeCompare(String(a.date));});group.preferred=group.versions[0];return group;}).filter(function(g){return g.matched.length;}).sort(function(a,b){return a.title.localeCompare(b.title,'da');});
}
function sourceURL(entry){
 if(!entry||!/^catalog\/musescore\/sources\/[a-f0-9]{64}\.(mscz|mscx|musicxml|mxl|pdf)$/.test(entry.sourcePath||''))throw Error('Ugyldig nodekilde.');
 return ROOT+entry.sourcePath;
}
async function file(entry,signal){
 if(!/^(mscz|mscx|musicxml|mxl)$/.test(entry.format))throw Error('Denne kilde kan ikke åbnes i MuseScore-importeren.');
 var response=await fetch(sourceURL(entry),{signal:signal});if(!response.ok)throw Error('Originalfilen kunne ikke hentes ('+response.status+').');
 var bytes=await response.arrayBuffer();if(bytes.byteLength>12*1024*1024)throw Error('Originalfilen er større end importgrænsen på 12 MB.');
 if(entry.bytes&&bytes.byteLength!==entry.bytes)throw Error('Originalfilen er ufuldstændig. Prøv igen.');
 if(typeof crypto!=='undefined'&&crypto.subtle&&entry.sha256){
  var hash=await crypto.subtle.digest('SHA-256',bytes),hex=Array.from(new Uint8Array(hash)).map(function(n){return n.toString(16).padStart(2,'0');}).join('');
  if(hex!==entry.sha256)throw Error('Originalfilen passer ikke til den valgte version. Opdatér nodearkivet.');
 }
 return new File([bytes],entry.sourceFile,{type:entry.format==='mscz'?'application/x-musescore':'application/xml'});
}
function provenance(bank,entry){return {'abc-origin-library':'musescore-bank:'+bank.id,'abc-origin-entry':entry.id,'abc-origin-sha256':entry.sha256||'','abc-origin-url':sourceURL(entry),'abc-collection':bank.name,'huwiki-source-date':entry.date||'','huwiki-source-contributor':entry.contributor||''};}
exports.list=list;exports.index=index;exports.filter=filter;exports.file=file;exports.sourceURL=sourceURL;exports.provenance=provenance;exports.normalize=normalize;
})();
