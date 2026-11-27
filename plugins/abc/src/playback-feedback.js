/*\
title: $:/plugins/huwiki/abc/playback-feedback.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var states=new WeakMap();
// Preparation belongs to the transport request, so a loaded sample bank does
// not clear the feedback while resume/timing work is still pending.
exports.update=function(button,value,options){
 if(!button)return;options=options||{};
 var state=states.get(button),busy=!!value;
 if(!state){state={busy:false};states.set(button,state);}
 var language=options.language||(options.wiki&&options.wiki.getTiddlerText&&options.wiki.getTiddlerText('$:/language','da'))||'da';
 var label=/(?:^|\/|[-_])da(?:$|[-_])/i.test(language)?'Gør klar …':'Preparing …';
 if(busy){
  if(!state.busy){state.oldLabel=button.getAttribute('aria-label');state.oldTitle=button.getAttribute('title');}
  var doc=button.ownerDocument;
  if(!state.spinner){state.spinner=doc.createElement('span');state.spinner.className='huwabc-preparing-spinner';state.spinner.setAttribute('aria-hidden','true');}
  if(!state.label){state.label=doc.createElement('span');state.label.className='huwabc-preparing-label';}
  if(state.spinner.parentNode!==button)button.appendChild(state.spinner);
  if(state.label.parentNode!==button)button.appendChild(state.label);
  state.label.textContent=label;
  state.busyLabel=(options.caption?options.caption+' · ':'')+label;
  button.setAttribute('aria-label',state.busyLabel);button.setAttribute('title',state.busyLabel);button.setAttribute('aria-busy','true');
 }else{
  button.removeAttribute('aria-busy');
  // A start/stop callback may already have supplied a newer Pause/Play label.
  [['aria-label','oldLabel'],['title','oldTitle']].forEach(function(pair){
   if(state.busy&&button.getAttribute(pair[0])===state.busyLabel){if(state[pair[1]]===null)button.removeAttribute(pair[0]);else button.setAttribute(pair[0],state[pair[1]]);}
  });
 }
 state.busy=busy;button.classList.toggle('huwabc-preparing',busy);
 if(state.spinner)state.spinner.hidden=!busy;if(state.label)state.label.hidden=!busy;
};
})();
