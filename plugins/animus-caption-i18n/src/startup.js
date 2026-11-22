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
 var Tracks=require("$:/plugins/huwiki/animus-caption-i18n/tracks.js"),catalog;
 var speakers={"Narrator":"Fortælleren","The Narrator":"Fortælleren","The Prisoner":"Fangen","Prisoner":"Fangen","The Guide":"Vejviseren","Guide":"Vejviseren","The Elder":"Den ældre","Elder":"Den ældre","Chorus":"Koret"};
 // The caption plugin can also run without the AniMus editor.
 var editorLanguage=null,ui=function(text){return text;};
 try{editorLanguage=require("$:/plugins/huwiki/musical/language.js");}catch(_optionalEditor){}
 function loadLabels(){if(editorLanguage&&editorLanguage.translator)ui=editorLanguage.translator(wiki);}
 function chosen(){var v=wiki.getTiddlerText(CHOICE,"auto");return v==="original"?v:Tracks.code(v)||"auto";}
 function autoLanguage(){return Tracks.selected(wiki).split("-")[0];}
 function language(host){var v=chosen(),choices=host&&host._huwCaptionSelect;
  return v==="auto"||choices&&!choices._codes.includes(v)?Tracks.automatic(wiki,host):v;
 }
 function load(){catalog=Tracks.read(wiki);loadLabels();}
 function translated(source,lang,node){
  if(lang==="original")return source;
  var danish=lang.split("-")[0]==="da",ref=node._animusCue||{};
  if(node.classList.contains("plato-caption-speaker"))return danish?speakers[source]||source:source;
  var line=ref.separateSpeaker?{prefix:"",text:source}:Tracks.split(source),text=Tracks.translation(catalog,lang,ref.film,ref.scene,ref.id,line.text);
  if(!text)return source;
  return line.prefix?(danish?speakers[line.prefix]||line.prefix:line.prefix)+": "+text:text;
 }
 function paintText(node,lang){
  var current=node.textContent||"";
  if(node._huwCaptionPainted!==current)node._huwCaptionSource=current;
  var original=node._animusCue?node._animusCue.source:node._huwCaptionSource||"";
  var next=translated(original,lang,node);
  node._huwCaptionPainted=next;node._huwTranslatedCue=node._animusCue;
  if(current!==next)node.textContent=next;
 }
 function updateChoiceLabels(wrapper){
  var da=autoLanguage()==="da",title=da?"Undertekster: ":ui("Captions")+": ";
  if(wrapper.firstChild.textContent!==title)wrapper.firstChild.textContent=title;
  var list=wrapper.querySelector("select");if(!list)return;
  var host=wrapper.closest(HOSTS),film=host&&host._animusFilm,locale=Tracks.selected(wiki);
  if(wrapper._catalog!==catalog||wrapper._locale!==locale||wrapper._film!==film){
   var codes=Tracks.options(catalog,film);
   // Older bilingual wikis used "en" for the English original.
   if(!codes.includes("en"))codes.push("en");
   var audio=host&&Tracks.code(host.getAttribute("data-animus-audio-language"));
   var choices=[["auto",audio?(da?"Automatisk (lydens sprog)":"Automatic (audio language)"):(da?"Automatisk (wikiens sprog)":ui("Automatic (wiki language)"))]];
   codes.forEach(function(code){choices.push([code,Tracks.name(code,locale)]);});
   if(host&&host._animusFilm)choices.push(["original",da?"Originaltekst":ui("Original text")]);
   while(list.firstChild)list.removeChild(list.firstChild);
   choices.forEach(function(pair){var option=document.createElement("option");option.value=pair[0];option.textContent=pair[1];list.appendChild(option);});
   wrapper._codes=choices.map(function(item){return item[0];});
   wrapper._catalog=catalog;wrapper._locale=locale;wrapper._film=film;
  }
  var current=chosen();list.value=wrapper._codes.includes(current)?current:"auto";
  var aria=da?"Sprog for undertekster":ui("Caption language");
  if(list.getAttribute("aria-label")!==aria)list.setAttribute("aria-label",aria);
 }

 // Translate the audience player's own controls as well as its captions.
 // The native player resets play/fullscreen labels when their state changes;
 // update only these small controls, never animation SVG frames.
 function localizePlayer(host){
  if(!host.classList.contains("plato-player"))return;
  var da=autoLanguage()==="da",T=function(d,e){return da?d:ui(e);};
  function txt(selector,value){var n=host.querySelector(selector);if(n&&n.textContent!==value)n.textContent=value;return n;}
  function att(selector,key,value){var n=host.querySelector(selector);if(n&&n.getAttribute(key)!==value)n.setAttribute(key,value);}
  var busy=host.getAttribute("aria-busy")==="true",playing=host.getAttribute("data-plato-playing")==="true";
  txt(".plato-preparing",T("Forbereder lyd …","Preparing sound …"));
  txt(".plato-play",busy?T("Forbereder …","Preparing …"):playing?"Ⅱ Pause":T("▶ Afspil","▶ Play"));
  att(".plato-play","aria-label",busy?T("Afbryd klargøring","Cancel preparation"):playing?T("Sæt forestillingen på pause","Pause the performance"):T("Afspil forestillingen","Play the performance"));
  att(".plato-stop","aria-label",T("Stop, og gå til begyndelsen","Stop and return to the beginning"));
  att(".plato-stop","title","Stop");
  att(".plato-scrub","aria-label",T("Position i forestillingen","Position in the performance"));
  att(".plato-chapters","aria-label",T("Vælg afsnit","Choose a chapter"));
  txt(".plato-options > .plato-secondary:not(.plato-fullscreen)",T("Undertekster","Captions"));
  att(".plato-options > .plato-secondary:not(.plato-fullscreen)","aria-label",T("Vis undertekster","Show captions"));
  txt(".plato-sound-wrap .plato-button",T("Lyd","Sound"));
  att(".plato-sound-wrap .plato-button","aria-label",T("Juster lydniveauer","Adjust sound levels"));
  att(".plato-mixer","aria-label",T("Lydniveauer","Sound levels"));
  var channels=[["speech","Tale","Speech"],["song","Sang","Singing"],["music","Musik","Music"]];
  Array.prototype.forEach.call(host.querySelectorAll(".plato-mixer-row"),function(row,index){
   var pair=channels[index];if(!pair)return;
   var label=row.querySelector("span"),range=row.querySelector("input.plato-level");
   if(label&&label.textContent!==T(pair[1],pair[2]))label.textContent=T(pair[1],pair[2]);
   if(range){
    if(range.getAttribute("data-plato-kind")!==pair[0])range.setAttribute("data-plato-kind",pair[0]);
    var name=T(pair[1]+" · lydstyrke",pair[2]+", volume");
    if(range.getAttribute("aria-label")!==name)range.setAttribute("aria-label",name);
   }
  });
  var full=host.querySelector(".plato-fullscreen");
  if(full){
   var active=!!(host.ownerDocument.fullscreenElement||host.ownerDocument.webkitFullscreenElement);
   var title=T(active?"Afslut fuld skærm":"Fuld skærm",active?"Exit full screen":"Full screen");
   if(full.textContent!==title)full.textContent=title;
   var aria=T(active?"Afslut fuld skærm":"Vis forestillingen i fuld skærm",active?"Exit full screen":"Show the performance in full screen");
   if(full.getAttribute("aria-label")!==aria)full.setAttribute("aria-label",aria);
  }
  [".plato-progress",".plato-static"].forEach(function(selector){
   var n=host.querySelector(selector);if(!n)return;
   var match=/^([0-9]+) (scenes|scener)(?= ·)/.exec(n.textContent||"");
   if(match){
    var text=n.textContent.replace(match[0],match[1]+" "+T("scener","scenes"));
    if(text!==n.textContent)n.textContent=text;
   }
  });
  var status=host.querySelector(".plato-status");
  if(status){
   var current=status.textContent||"";
   if(current!==status._huwPlayerPainted)status._huwPlayerSource=current;
   var source=status._huwPlayerSource||"",messages={
    "Sound was interrupted. The performance continues silently; pause and play to resume sound.":"Lyden blev afbrudt. Forestillingen fortsætter uden lyd. Sæt på pause og afspil igen for at genoptage lyden.",
    "Audio is unavailable in this browser. The performance continues silently.":"Lyd er ikke tilgængelig i denne browser. Forestillingen fortsætter uden lyd.",
    "Audio could not start. The performance continues silently; pause and play to try again.":"Lyden kunne ikke starte. Forestillingen fortsætter uden lyd. Sæt på pause og prøv igen.",
    "Audio could not be prepared. The performance continues silently.":"Lyden kunne ikke klargøres. Forestillingen fortsætter uden lyd.",
    "An audio track could not start. Animation and other sound will continue.":"Et lydspor kunne ikke starte. Animation og øvrig lyd fortsætter."
   };
   var next=da?(messages[source]||source):source;status._huwPlayerPainted=next;
   if(current!==next)status.textContent=next;
  }
 }
 function mount(host){
  var toolbar=host.querySelector(".plato-options")||host.querySelector(".huw-musical-playback-options")||host.querySelector(".huw-musical-transport");
  if(!toolbar||host._huwCaptionSelect)return;
  var wrapper=document.createElement("label");wrapper.className="huw-animus-caption-language";
  wrapper.appendChild(document.createElement("span"));
  var select=document.createElement("select");select.setAttribute("data-huw-animus-captions","language");
  wrapper.appendChild(select);toolbar.appendChild(wrapper);host._huwCaptionSelect=wrapper;
  updateChoiceLabels(wrapper);
  select.addEventListener("change",function(){
   if(chosen()!==select.value)wiki.addTiddler(new $tw.Tiddler({title:CHOICE,type:"text/plain",text:select.value}));
   updateAll();
  });
 }
 function updateHost(host){
   if(host.isConnected===false)return;
   localizePlayer(host);
   if(!host._huwCaptionSelect&&!Tracks.options(catalog,host._animusFilm).length)return;
   mount(host);
   if(host._huwCaptionSelect){
    updateChoiceLabels(host._huwCaptionSelect);
   }
   var lang=language(host),nodes=host.querySelectorAll(CAPTIONS);
   Array.prototype.forEach.call(nodes,function(node){paintText(node,lang);});
 }
 function updateAll(){
  Array.prototype.forEach.call(document.querySelectorAll(HOSTS),updateHost);
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
   // Only seek/play/status labels, not frame-by-frame SVG updates.
   if(element&&element.closest&&element.closest(".plato-play, .plato-fullscreen, .plato-status, .plato-progress")){
    var player=element.closest(".plato-player");if(player)hosts.add(player);
   }
   Array.prototype.forEach.call(record.addedNodes||[],function(added){
    if(added.nodeType!==1)return;
    inspect(added);
    if(added.querySelectorAll)Array.prototype.forEach.call(added.querySelectorAll(HOSTS+", "+TOOLBARS+", "+CAPTIONS),inspect);
   });
  });
  if(!hosts.size&&!nodes.size)return;
  hosts.forEach(updateHost);
  nodes.forEach(function(node){
   var host=node.closest&&node.closest(HOSTS);
   if(host&&!hosts.has(host)&&node.isConnected!==false&&(node._animusCue!==node._huwTranslatedCue||node.textContent!==node._huwCaptionPainted))paintText(node,language(host));
  });
 }
 function launch(){
  load();updateAll();
  var observer=new MutationObserver(changed);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  wiki.addEventListener("change",function(changes){
   var reload=Object.keys(changes).some(function(title){
    var tid=wiki.getTiddler(title);
    return title.indexOf("AniMus/Translations/")===0||title.indexOf("$:/languages/")===0||catalog.watched[title]||tid&&tid.hasTag(TAG);
   });
   if(reload)load();else if(changes["$:/language"])loadLabels();
   if(reload||changes["$:/language"]||changes[CHOICE])updateAll();
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",launch,{once:true});else launch();
};
})();
