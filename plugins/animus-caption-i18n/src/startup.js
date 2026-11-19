/*\
title: $:/plugins/huwiki/animus-caption-i18n/startup.js
type: application/javascript
module-type: startup
\*/
(function(){
"use strict";
exports.name="huwiki-animus-caption-i18n";
exports.after=["startup"];
exports.synchronous=true;
exports.startup=function(){
 if(typeof document==="undefined"||typeof MutationObserver==="undefined"||typeof $tw==="undefined"||!$tw.wiki)return;
 var wiki=$tw.wiki,TAG="$:/tags/HUW/CaptionTranslations",CHOICE="$:/config/huwiki/animus/caption-language";
 var HOSTS=".plato-player, .huw-musical",CAPTIONS=".plato-caption-text, .plato-caption-speaker, .huw-musical-caption-line, .huw-musical-caption-cue";
 var TOOLBARS=".plato-options, .huw-musical-transport";
 var byLanguage=Object.create(null);
 var speakers={"Narrator":"Fortælleren","The Narrator":"Fortælleren","The Prisoner":"Fangen","Prisoner":"Fangen","The Guide":"Vejviseren","Guide":"Vejviseren","The Elder":"Den ældre","Elder":"Den ældre","Chorus":"Koret"};
 function chosen(){var v=wiki.getTiddlerText(CHOICE,"auto");return /^(auto|en|da)$/.test(v)?v:"auto";}
 function autoLanguage(){return /(?:^|\/)da(?:[-_]|$)/i.test(wiki.getTiddlerText("$:/language","")||document.documentElement.lang||"")?"da":"en";}
 function language(){var v=chosen();return v==="auto"?autoLanguage():v;}
 function load(){
  var result=Object.create(null);
  (wiki.filterTiddlers("[tag["+TAG+"]]")||[]).forEach(function(title){
   try{
    var record=JSON.parse(wiki.getTiddlerText(title,"")),lang=String(record.targetLanguage||""),source=wiki.getTiddlerText(record.sourceTiddler||"","");
    if(!/^[a-z]{2}$/.test(lang)||!source)return;
    var original=JSON.parse(source),scenes=original.scenes||[],map=result[lang]||(result[lang]=Object.create(null));
    scenes.forEach(function(scene){
     var cues=scene.cues||[],translated=record.scenes&&record.scenes[scene.id];
     if(!translated)return;
     if(!Array.isArray(translated)||translated.length!==cues.length)throw Error("Caption count mismatch: "+scene.id);
     translated.forEach(function(value,index){
      var en=String(cues[index].text||"").trim();
      if(!en||typeof value!=="string"||!value.trim())throw Error("Missing caption: "+scene.id+"/"+index);
      if(map[en]&&map[en]!==value)throw Error("Ambiguous English caption: "+en);
      map[en]=value;
     });
    });
   }catch(error){if(typeof console!=="undefined")console.warn("AniMus caption translations:",title,error);}
  });
  byLanguage=result;
 }
 function translated(source,lang,isSpeaker){
  if(lang==="en")return source;
  if(isSpeaker)return lang==="da"?(speakers[source]||source):source;
  var table=byLanguage[lang]||{};
  if(Object.prototype.hasOwnProperty.call(table,source))return table[source];
  var prefix=/^([^:\n]{1,80}):\s*([\s\S]*)$/.exec(source);
  if(prefix&&Object.prototype.hasOwnProperty.call(table,prefix[2]))return (lang==="da"?(speakers[prefix[1]]||prefix[1]):prefix[1])+": "+table[prefix[2]];
  return source;
 }
 function paintText(node,lang){
  var current=node.textContent||"";
  if(node._huwCaptionPainted!==current)node._huwCaptionSource=current;
  var original=node._huwCaptionSource||"";
  var next=translated(original,lang,node.classList.contains("plato-caption-speaker"));
  node._huwCaptionPainted=next;
  if(current!==next)node.textContent=next;
 }
 function updateChoiceLabels(wrapper){
  var da=autoLanguage()==="da",title=da?"Undertekster: ":"Captions: ";
  if(wrapper.firstChild.textContent!==title)wrapper.firstChild.textContent=title;
  var list=wrapper.querySelector("select");if(!list)return;
  var auto=da?"Automatisk (wikiens sprog)":"Automatic (wiki language)";
  if(list.options[0].textContent!==auto)list.options[0].textContent=auto;
  if(list.options[1].textContent!=="Dansk")list.options[1].textContent="Dansk";
  if(list.options[2].textContent!=="English")list.options[2].textContent="English";
  var aria=da?"Sprog for undertekster":"Caption language";
  if(list.getAttribute("aria-label")!==aria)list.setAttribute("aria-label",aria);
 }
 function mount(host){
  var toolbar=host.querySelector(".plato-options")||host.querySelector(".huw-musical-transport");
  if(!toolbar||host._huwCaptionSelect)return;
  var wrapper=document.createElement("label");wrapper.className="huw-animus-caption-language";
  wrapper.appendChild(document.createElement("span"));
  var select=document.createElement("select");select.setAttribute("data-huw-animus-captions","language");
  [["auto","Automatic (wiki language)"],["da","Dansk"],["en","English"]].forEach(function(pair){
   var option=document.createElement("option");option.value=pair[0];option.textContent=pair[1];select.appendChild(option);
  });
  select.value=chosen();wrapper.appendChild(select);toolbar.appendChild(wrapper);host._huwCaptionSelect=wrapper;
  updateChoiceLabels(wrapper);
  select.addEventListener("change",function(){
   if(chosen()!==select.value)wiki.addTiddler(new $tw.Tiddler({title:CHOICE,type:"text/plain",text:select.value}));
   updateAll();
  });
 }
 function updateHost(host,lang){
   if(!Object.keys(byLanguage).length||host.isConnected===false)return;
   mount(host);
   if(host._huwCaptionSelect){
    var input=host._huwCaptionSelect.querySelector("select");if(input&&input.value!==chosen())input.value=chosen();
    updateChoiceLabels(host._huwCaptionSelect);
   }
   var nodes=host.querySelectorAll(CAPTIONS);
   Array.prototype.forEach.call(nodes,function(node){paintText(node,lang);});
 }
 function updateAll(){
  var lang=language();
  Array.prototype.forEach.call(document.querySelectorAll(HOSTS),function(host){updateHost(host,lang);});
 }
 function changed(records){
  // Transport labels and SVG artwork change on every animation frame. Only
  // new players/toolbars and changed caption text need translation work;
  // repainting one player must not rescan every other open editor.
  var hosts=new Set(),nodes=new Set();
  function inspect(element){
   if(!element||element.nodeType!==1||!element.matches)return;
   if(element.matches(HOSTS))hosts.add(element);
   if(element.matches(TOOLBARS)){
    var host=element.closest(HOSTS);if(host)hosts.add(host);
   }
   if(element.matches(CAPTIONS))nodes.add(element);
  }
  records.forEach(function(record){
   var element=record.target&&record.target.nodeType===1?record.target:record.target&&record.target.parentElement;
   var caption=element&&element.closest&&element.closest(CAPTIONS);
   if(caption){nodes.add(caption);return;}
   Array.prototype.forEach.call(record.addedNodes||[],function(added){
    if(added.nodeType!==1)return;
    inspect(added);
    if(added.querySelectorAll)Array.prototype.forEach.call(added.querySelectorAll(HOSTS+", "+TOOLBARS+", "+CAPTIONS),inspect);
   });
  });
  if(!hosts.size&&!nodes.size)return;
  var lang=language();
  hosts.forEach(function(host){updateHost(host,lang);});
  nodes.forEach(function(node){
   var host=node.closest&&node.closest(HOSTS);
   if(host&&!hosts.has(host)&&node.isConnected!==false&&node.textContent!==node._huwCaptionPainted)paintText(node,lang);
  });
 }
 function launch(){
  load();updateAll();
  var observer=new MutationObserver(changed);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  wiki.addEventListener("change",function(changes){
   if(changes["$:/language"]||changes[CHOICE])updateAll();
   else if(Object.keys(changes).some(function(title){return wiki.getTiddler(title)&&wiki.getTiddler(title).hasTag(TAG)||title==="Turn Around · Timeline";})){load();updateAll();}
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",launch,{once:true});else launch();
};
})();
