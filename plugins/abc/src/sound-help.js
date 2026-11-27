/*\
title: $:/plugins/huwiki/abc/sound-help.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
function node(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function validMode(value){return ['auto','original','fluid','tiny'].indexOf(value)>=0?value:'auto';}
exports.mount=function(parent,options){
 options=options||{};
 var host=node('div','huwabc-sound-help');host.style.marginTop='10px';
 var notice=node('div','huwabc-status huwabc-reserve-notice');notice.setAttribute('role','status');notice.hidden=true;
 var details=node('details','huwabc-audio-troubleshooting');
 var summary=node('summary');summary.appendChild(node('span','','Lydmotor'));
 var summaryState=node('span','huwabc-engine-summary',' · Automatisk');summary.appendChild(summaryState);details.appendChild(summary);
 var engineRow=node('label','huwabc-engine-row');engineRow.appendChild(node('span','','Vælg lydmotor'));
 var selection=node('select','huwabc-engine-select');selection.setAttribute('aria-label','Lydmotor');
 [['auto','Automatisk (standard)'],['original','Originallyd · samplebank'],['fluid','FluidSynth · SF3'],['tiny','WebAudio TinySynth · indbygget']].forEach(function(pair){var opt=node('option','',pair[1]);opt.value=pair[0];selection.appendChild(opt);});
 var initial=validMode(options.getEngineMode?options.getEngineMode():options.engineMode);
 selection.value=initial;
 engineRow.appendChild(selection);details.appendChild(engineRow);
 details.appendChild(node('p','huwabc-muted huwabc-engine-explanation','Offline: Prøv cached originallyd, derefter FluidSynth med lokal SF3 og til sidst indbygget TinySynth. Online: TinySynth vælges kun manuelt.'));
 var state=node('p','huwabc-muted huwabc-sound-state','Klar til afspilning.');state.setAttribute('role','status');details.appendChild(state);
 var diagnostic=node('details','huwabc-sound-diagnostic');diagnostic.appendChild(node('summary','','Tekniske oplysninger'));
 var report=node('pre','huwabc-sound-report');report.style.whiteSpace='pre-wrap';report.style.overflowWrap='anywhere';diagnostic.appendChild(report);details.appendChild(diagnostic);
 host.appendChild(notice);host.appendChild(details);parent.appendChild(host);
 var last={engine:'original',mode:initial,phase:'idle'};
 function label(mode){return ({auto:'Automatisk',original:'Originallyd',fluid:'FluidSynth',tiny:'TinySynth'})[mode]||'Automatisk';}
 function engineLabel(engine){return ({original:'Originallyd (samplebank)',fluid:'FluidSynth + SF3',tiny:'WebAudio TinySynth'})[engine]||'Originallyd';}
 function update(value){
  if(!value)return;
  last=Object.assign({},last,value);
  var loading=last.phase==='loading',failure=last.phase==='error';
  var message=failure?'Lyd kunne ikke klargøres: '+(last.details||'ukendt fejl'):
   last.phase==='paused'?'Afspilningen er på pause.':
   last.phase==='stopped'||last.phase==='cancelled'?'Afspilningen er stoppet.':
   loading?'Klargør '+engineLabel(last.engine)+' …':
   last.phase==='selected'?'Valgt: '+label(selection.value)+'. Tryk Afspil.':
   last.phase==='ready'?'Bruger '+engineLabel(last.engine)+(last.engine==='tiny'?' (indbygget, uden SF3).':last.local?' (lokale filer/cache).':'.'):
   'Klar til '+label(selection.value).toLowerCase()+'.';
  state.textContent=message;
  notice.hidden=!(failure||last.engine!=='original'&&(loading||last.phase==='ready'));
  notice.textContent=notice.hidden?'':message;
  notice.className='huwabc-status huwabc-reserve-notice'+(failure?' huwabc-error':'');
  summaryState.textContent=' · '+label(selection.value)+(last.phase==='ready'&&selection.value==='auto'?' ('+engineLabel(last.engine)+')':'');
  report.textContent=JSON.stringify({selected:selection.value,engine:last.engine,phase:last.phase,reason:last.reason||'',local:!!last.local,details:last.details||'',output:last.output||null,signal:last.stats||null,resourceInfo:last.resourceInfo||null},null,2);
 }
 selection.addEventListener('change',function(){
  var chosen=validMode(selection.value);selection.value=chosen;
  try {if(options.onEngine)options.onEngine(chosen);}catch(error){update({phase:'error',details:error.message||String(error)});return;}
  update({mode:chosen,engine:chosen==='auto'?'original':chosen,phase:'selected',reason:'manual',local:chosen==='tiny',details:null});
 });
 update(last);
 return {element:host,details:details,selection:selection,update:update,
  stopped:function(paused){update(Object.assign({},last,{phase:paused?'paused':'stopped'}));},
  error:function(error){update(Object.assign({},last,{phase:'error',details:error&&error.message||String(error)}));},
  state:function(){return Object.assign({},last);},
  select:function(mode){selection.value=validMode(mode);update({mode:mode});},
  destroy:function(){host.remove();}};
};
})();
