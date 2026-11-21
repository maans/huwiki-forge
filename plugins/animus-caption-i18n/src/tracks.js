/*\
title: $:/plugins/huwiki/animus-caption-i18n/tracks.js
type: application/javascript
module-type: library
\*/
"use strict";
var TAG="$:/tags/HUW/CaptionTranslations", CHOICE="$:/config/huwiki/animus/caption-language";
exports.tag=TAG;
exports.choice=CHOICE;
function code(value){
 var tag=String(value||"").replace(/^\$:\/languages\//,"").replace(/_/g,"-");
 if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(tag))return "";
 try{var locale=Intl.getCanonicalLocales(tag)[0];return locale==="da-DK"?"da":locale==="en-GB"?"en":locale;}catch(_){return "";}
}
exports.code=code;
exports.selected=function(wiki){return code(wiki.getTiddlerText("$:/language",""))||"en";};
exports.name=function(tag,locale){
 try{return new Intl.DisplayNames([locale],{type:"language"}).of(tag)||tag;}catch(_){return tag;}
};
function object(){return Object.create(null);}
function own(obj,key){return obj&&Object.prototype.hasOwnProperty.call(obj,key)?obj[key]:undefined;}
function set(obj,key,value){Object.defineProperty(obj,key,{value:value,configurable:true,enumerable:true,writable:true});return value;}
function split(value){var s=String(value||""),m=/^([^:\n]{1,80}):\s*([\s\S]*)$/.exec(s);return m?{prefix:m[1],text:m[2]}:{prefix:"",text:s};}
exports.split=split;
function read(wiki){
 var legacy=object(),films=object(),titles=object(),watched=object(),installed=new Set();
 (wiki.filterTiddlers("[plugin-type[language]]")||[]).forEach(function(title){if(title.indexOf("$:/languages/")===0&&code(title))installed.add(code(title));});
 (wiki.filterTiddlers("[prefix[AniMus/Translations/]]")||[]).forEach(function(title){
  if(title.indexOf("AniMus/Translations/")===0){var lang=code(title.slice("AniMus/Translations/".length));if(lang)installed.add(lang);}
 });
 (wiki.filterTiddlers("[tag["+TAG+"]]")||[]).forEach(function(title){
  watched[title]=true;
  try{
   var record=JSON.parse(wiki.getTiddlerText(title,"")),lang=code(record.targetLanguage),source=record.sourceTiddler;
   if(!lang||!source)return;
   if(record.schema==="animus-cues/2"){
    var tracks=films[source]||(films[source]=object());
    if(record.entries&&typeof record.entries==="object"&&!Array.isArray(record.entries)){
     var names=titles[source]||(titles[source]=object());
     if(!names[lang]||title===exports.title(source,lang)){tracks[lang]=record.entries;names[lang]=title;}
    }
    return;
   }
   watched[source]=true;
   var original=JSON.parse(wiki.getTiddlerText(source,"")),map=object();
   (original.scenes||[]).forEach(function(scene){
    var values=record.scenes&&record.scenes[scene.id];if(!values)return;
    if(!Array.isArray(values)||values.length!==scene.cues.length)throw Error("Invalid caption count");
    scene.cues.forEach(function(cue,i){
     var from=String(cue.text||"").trim(),to=values[i];
     if(!from||typeof to!=="string"||!to.trim())return;
     map[from]=to;
    });
   });
   if(Object.keys(map).length)Object.assign(legacy[lang]||(legacy[lang]=object()),map);
  }catch(_){/* Incomplete or invalid imported files do not replace working tracks. */}
 });
 return {legacy:legacy,films:films,titles:titles,installed:Array.from(installed),watched:watched};
}
exports.read=read;
exports.options=function(catalog,film){
 return Array.from(new Set(catalog.installed.concat(Object.keys(catalog.legacy),Object.keys(catalog.films[film]||{})))).sort();
};
exports.translation=function(catalog,lang,film,scene,cue,source){
 var locales=[lang,String(lang).split("-")[0]],tracks=catalog.films[film]||{};
 for(var i=0;i<locales.length;i++){
  var k=locales[i],parts=own(tracks[k],scene),entry=own(parts,cue);
  if(entry&&entry.source===source&&typeof entry.text==="string"&&entry.text.trim())return entry.text;
  var legacy=catalog.legacy[k];
  if(legacy&&Object.prototype.hasOwnProperty.call(legacy,source))return legacy[source];
 }
 return "";
};
exports.title=function(film,lang){return "AniMus/Subtitle tracks/"+encodeURIComponent(film)+"/"+lang;};
exports.empty=function(film,lang){return {schema:"animus-cues/2",sourceTiddler:film,targetLanguage:lang,entries:object()};};

// Prepare only the changed lines, merging concurrent edits to other cues.
exports.writes=function(wiki,film,changes){
 var known=read(wiki).titles[film]||object();
 var pending=object(),result=[];
 changes.forEach(function(edit){
  var title=known[edit.lang]||exports.title(film,edit.lang);
  if(!pending[title]){
   var raw=wiki.getTiddlerText(title,"");
   var data=raw?JSON.parse(raw):exports.empty(film,edit.lang);
   if(data.schema!=="animus-cues/2"||data.sourceTiddler!==film||code(data.targetLanguage)!==edit.lang||!data.entries)throw Error(title);
   pending[title]=data;
  }
  var record=pending[title],row=own(record.entries,edit.scene)||set(record.entries,edit.scene,object());
  if(JSON.stringify(own(row,edit.id)||null)!==JSON.stringify(edit.before||null))throw Error(title);
  if(edit.text.trim())set(row,edit.id,{source:edit.source,text:edit.text});
  else delete row[edit.id];
  if(!Object.keys(row).length)delete record.entries[edit.scene];
 });
 Object.keys(pending).forEach(function(title){
  result.push({title:title,type:"application/json",tags:[TAG],text:JSON.stringify(pending[title],null,2)});
 });
 return result;
};
