/*\
title: $:/plugins/huwiki/repertoire/performance-surface.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
function node(doc,tag,cls,text){var n=doc.createElement(tag);n.className=cls||"";if(text!==undefined)n.textContent=text;return n;}
exports.create=function(book,notation,audioView){
 var doc=book.document,host=node(doc,"section","huwrep-performance"),transport=node(doc,"div","huwrep-performance-transport");
 host.setAttribute("aria-label","Afspilning og lyd");
 var tools=node(doc,"div","huwrep-performance-tools"),sound=node(doc,"button","huwrep-button huwrep-sound-toggle","Lyd og akkompagnement");
 sound.type="button";sound.setAttribute("aria-expanded",String(!!book.soundOpen));tools.appendChild(sound);
 var status=node(doc,"span","huwrep-muted huwrep-audio-source");status.setAttribute("role","status");tools.appendChild(status);
 host.append(transport,tools);
 if(!audioView){
  var unavailable=node(doc,"button","huwrep-button huwrep-primary","Afspil");unavailable.type="button";unavailable.disabled=true;
  unavailable.title="Der findes ingen afspillelig ABC-udgave til dette nummer.";transport.appendChild(unavailable);sound.disabled=true;
  status.textContent="Kun PDF eller nodebillede · ingen afspillelig ABC-udgave.";
 }else{
  status.textContent=notation.abc?"Lyd: "+audioView.label:"Lyd: "+audioView.label+" · PDF-siderne følger ikke afspilningen.";
  transport.appendChild(node(doc,"span","huwrep-muted","Afspilleren indlæses …"));
 }
 var accompaniment=null;
 sound.addEventListener("click",function(){book.soundOpen=!book.soundOpen;if(accompaniment)accompaniment.hidden=!book.soundOpen;sound.setAttribute("aria-expanded",String(!!book.soundOpen));});
 return {element:host,attach:function(score,scoreHost){
  var instrument=scoreHost.querySelector(".huwabc-instrument-bar");if(instrument)host.appendChild(instrument);
  var audio=scoreHost.querySelector(".huwabc-audio");if(!audio)return null;
  transport.textContent="";transport.appendChild(audio);
  // Keep the original bound controls together, including their async load
  // target. Only their parent changes; playback and its preparation survive.
  var controls=audio.querySelector(".huwabc-audio-controls");
  if(controls&&book._toolbar){controls.classList.add("huwrep-compact-transport");book._toolbar.appendChild(controls);}
  accompaniment=score._accompControls&&score._accompControls.element||audio.querySelector(".huwabc-accompaniment");
  if(accompaniment){
   accompaniment.hidden=!book.soundOpen;
   var details=score._accompControls&&score._accompControls.details,style=details&&details.querySelector(".huwabc-field"),mixer=accompaniment.querySelector(".huwabc-mixer");
   if(style){style.classList.add("huwrep-style-choice");accompaniment.insertBefore(style,accompaniment.firstChild);}
   if(mixer)mixer.hidden=false;
   var summary=details&&details.querySelector("summary");if(summary)summary.textContent="Flere akkompagnementsindstillinger";
  }
  // Rehome the existing DOM, preserving its player, preparation indicator,
  // event handlers, sound settings and current playback. Never clone a player.
  return audio;
 }};
};
})();
