/*\
title: $:/plugins/huwiki/abc/repertoire-catalog.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var ROOT='https://xn--mns-ula.dk/catalog/repertoire/',cached=null;
var labels={leadsheet:'Leadsheet (ABC)','chord-stabs':'Chord stabs (ABC)',arrangement:'Arrangement (ABC)',pdf:'Originalnode (PDF)',guitar:'Guitar (PDF)',score:'Partitur (PDF)'};
function normalize(s){return String(s||'').replace(/[øØ]/g,'o').replace(/[æÆ]/g,'ae').replace(/[đĐ]/g,'dj').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function identity(s){return normalize(s).replace(/[^a-z0-9]/g,'');}
function fingerprint(s){var a=2166136261,b=5381;s=String(s);for(var i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return (a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+s.length;}
function header(abc,key){var m=new RegExp('^'+key+':\\s*(.+)$','m').exec(abc||'');return m?m[1].trim():'';}
function safeURL(value,base){if(typeof value!=='string'||!value.trim())return '';try{var u=new URL(value,base);return /^https?:$/.test(u.protocol)?u.href:'';}catch(_){return '';}}
function fields(row){
 var out={type:'text/vnd.tiddlywiki',tags:['ABC','Musik'],'abc-source':row['abc-source']||(row.type==='text/vnd.abc'?row.text:''),text:'<$huwiki-abc/>'};
 Object.keys(row).forEach(function(k){if((k.indexOf('abc-')===0&&!/^abc-(?:origin-library|origin-entry)$/.test(k))||['source-url','repertoire-sheet-format','repertoire-abc-label','repertoire-category'].indexOf(k)>=0)out[k]=row[k];});
 return out;
}
function fromRows(rows,collection){
 var map=Object.create(null),groups=Object.create(null),referenced=Object.create(null);collection=collection||{};
 rows.forEach(function(r){map[r.title]=r;['repertoire-leadsheet-source','repertoire-chord-stabs-source'].forEach(function(k){if(r[k])referenced[r[k]]={title:r['repertoire-work-title']||r.title,role:k==='repertoire-leadsheet-source'?'leadsheet':'chord-stabs'};});});
 function group(title){var id=identity(title)||title;return groups[id]||(groups[id]={id:id,title:title,aliases:[],collections:[],variants:[]});}
 rows.forEach(function(r){
  if(!r.title||r.title.indexOf('$:/')===0||r['draft.of']||r['repertoire-kind']==='orchestra-item'||r['repertoire-kind']==='setlist'||r['repertoire-kind']==='orchestra')return;
  var abc=r['abc-source']||(r.type==='text/vnd.abc'?r.text:''),ref=referenced[r.title],title=ref&&ref.title||r['repertoire-work-title']||r.title;
  if(!abc&&r['repertoire-kind']!=='piece'&&!r['repertoire-pdf']&&!r['repertoire-guitar-pdf']&&!r['repertoire-score-pdf']&&r.type!=='application/pdf')return;
  var g=group(title),origin=safeURL(collection.url&&collection.url+'#'+encodeURIComponent(r.title));
  if(g.aliases.indexOf(r.title)<0)g.aliases.push(r.title);
  if(collection.name&&g.collections.indexOf(collection.name)<0)g.collections.push(collection.name);
  if(!g.sourceURL&&origin)g.sourceURL=origin;
  if(abc){
   var role=ref&&ref.role||(/chord|guitar/i.test(r['repertoire-abc-label']||'')||r['repertoire-sheet-format']==='chords'?'chord-stabs':r['repertoire-category']==='leadsheet'||/leadsheet/i.test(r['repertoire-abc-label']||'')?'leadsheet':'arrangement');
   g.variants.push({id:role+':'+fingerprint(abc),format:'abc',role:role,label:labels[role],key:header(abc,'K'),meter:header(abc,'M'),composer:header(abc,'C'),sourceTitle:r.title,sourceURL:origin,originalURL:safeURL(r['source-url']||r['abc-origin-url'],collection.url),collection:collection.name||'',fields:fields(r)});
  }
  [['repertoire-pdf','pdf'],['repertoire-guitar-pdf','guitar'],['repertoire-score-pdf','score']].concat(r.type==='application/pdf'?[['_canonical_uri','pdf']]:[]).forEach(function(pair){
   var value=r[pair[0]],asset=value&&map[value];if(!value)return;
   var url=asset?safeURL(asset._canonical_uri,collection.url)||safeURL(collection.url+'#'+encodeURIComponent(asset.title)):safeURL(value,collection.url);if(!url)return;
   g.variants.push({id:pair[1]+':'+fingerprint(url),format:'pdf',role:pair[1],label:labels[pair[1]],sourceTitle:r.title,sourceURL:origin,url:url,collection:collection.name||''});
  });
 });
 return {schemaVersion:1,entries:Object.keys(groups).map(function(k){return groups[k];})};
}
function fromWiki(wiki){return fromRows(wiki&&wiki.allTitles?wiki.allTitles().map(function(t){var r=wiki.getTiddler(t);return r&&r.fields;}).filter(Boolean):[],{name:'Denne wiki'});}
function merge(indexes){
 var groups=Object.create(null);
 indexes.forEach(function(index){(index.entries||[]).forEach(function(entry){
  var id=identity(entry.title)||entry.id,g=groups[id];if(!g)g=groups[id]={id:id,title:entry.title,sourceURL:entry.sourceURL||'',aliases:[],collections:[],variants:[]};
  ['aliases','collections'].forEach(function(k){(entry[k]||[]).forEach(function(v){if(g[k].indexOf(v)<0)g[k].push(v);});});
  (entry.variants||[]).forEach(function(v){var old=g.variants.find(function(o){return o.id===v.id;});if(!old)g.variants.push(v);else if(v.fields&&!old.fields){var i=g.variants.indexOf(old);g.variants[i]=Object.assign({},old,v,{sourceURL:v.sourceURL||old.sourceURL,originalURL:v.originalURL||old.originalURL});}});
 });});
 var rank={leadsheet:0,'chord-stabs':1,arrangement:2,pdf:3,guitar:4,score:5};
 return {schemaVersion:1,entries:Object.keys(groups).map(function(k){var g=groups[k];g.variants.sort(function(a,b){return (rank[a.role]??9)-(rank[b.role]??9)||String(a.collection).localeCompare(String(b.collection));});return g;}).sort(function(a,b){return a.title.localeCompare(b.title,'da');})};
}
function validate(index){if(!index||index.schemaVersion!==1||!Array.isArray(index.entries)||index.entries.length>10000)throw Error('Nodebibliotekets indeks kunne ikke læses.');return index;}
async function index(wiki){
 var local=fromWiki(wiki);
 try{if(!cached){var r=await fetch(ROOT+'index.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);cached=validate(await r.json());}return merge([cached,local]);}
 catch(e){var result=merge([local]);result.warning='Det fælles bibliotek kunne ikke hentes. Viser numrene i denne wiki.';return result;}
}
function filter(index,query,kind){
 var words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return index.entries.filter(function(g){return (!kind||kind==='all'||g.variants.some(function(v){return kind==='leadsheet'?v.role==='leadsheet':v.format===kind;}))&&words.every(function(w){return normalize([g.title,(g.aliases||[]).join(' '),(g.collections||[]).join(' '),g.variants.map(function(v){return [v.label,v.key,v.meter,v.composer,v.collection].join(' ');}).join(' ')].join(' ')).indexOf(w)>=0;});});
}
async function load(variant){
 if(variant.fields)return fields(variant.fields);
 if(!/^abc\/[a-f0-9]{64}\.json$/.test(variant.abcPath||''))throw Error('Ugyldig ABC-kilde i biblioteket.');
 var r=await fetch(ROOT+variant.abcPath,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('ABC-nodearket kunne ikke hentes ('+r.status+').');
 var value=await r.json();if(!value||typeof value['abc-source']!=='string'||!value['abc-source'].trim()||value['abc-source'].length>2000000)throw Error('Bibliotekets ABC-nodeark kunne ikke læses.');return fields(value);
}
exports.fromRows=fromRows;exports.fromWiki=fromWiki;exports.merge=merge;exports.index=index;exports.filter=filter;exports.load=load;exports.labels=labels;
})();
