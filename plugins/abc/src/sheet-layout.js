/*\
title: $:/plugins/huwiki/abc/sheet-layout.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Engraving=require("$:/plugins/huwiki/abc/engraving-rules.js");
var VoltaLayout=require("$:/plugins/huwiki/abc/volta-layout.js");
var BalancedLayout=require("$:/plugins/huwiki/abc/balanced-layout.js");
var I18n=require("$:/plugins/huwiki/abc/i18n.js");
var balancedHelp='Automatisk måler takternes bredde og fordeler linjerne jævnt med hensyn til formdele, optakter og volter. Vælg et fast taktantal eller kildens linjeskift for selv at styre opsætningen. Sidevisning og PDF bruger samme opsætning; musikken ændres ikke.';
I18n.dictionary['Balanceret · fraser og volter']='Balanced · phrases and endings';
I18n.dictionary[balancedHelp]='Automatic measures bar widths and balances systems around sections, pickups and endings. Choose a fixed bar count or source line breaks for manual control. Screen pages and PDF share the same layout; the music is unchanged.';
I18n.dictionary['Automatisk · balanceret']='Automatic · balanced';
I18n.dictionary['Kildens linjeskift']='Source line breaks';
var metricCache=[];
function value(n,allowed){return allowed.indexOf(Number(n))>=0?Number(n):0;}
function read(fields){return {bars:value(fields['abc-bars-per-line'],[2,3,4,6,8]),lines:value(fields['abc-lines-per-page'],[2,3,4,6,8])};}
// ABCJS supplies the duration of an anacrusis via getPickupLength(). The
// first incomplete bar is bar zero in conventional notation, not one of the
// four full bars requested by "4 takter pr. linje".
function hasPickup(tune){
  if(!tune||typeof tune.getPickupLength!=='function'||typeof tune.getBarLength!=='function')return false;
  var pickup=Number(tune.getPickupLength()),full=Number(tune.getBarLength());
  return Number.isFinite(pickup)&&Number.isFinite(full)&&pickup>0&&pickup<full-1e-8;
}
// In an otherwise longer meter, a single short transition bar (e.g. one
// 2/4 measure between two 4/4 measures) is an anacrusis for *system layout*.
// Keep its real meter and duration for notation and playback; do not edit ABC.
function meterLength(event,fallback){
  if(!event||event.el_type!=='meter')return fallback;
  var beats=event.value;
  if(!Array.isArray(beats)||!beats.length)return fallback;
  var duration=beats.reduce(function(sum,m){
    return sum+(Number(m.num)||0)/(Number(m.den)||1);
  },0);
  return duration>0?duration:fallback;
}
function lineBreaksForVoice(voice,perLine,pickup,primaryLength){
  var breaks=[],barIndex=0,hasNote=false,measureDuration=0;
  var activeMeter=Number(primaryLength)||0,measureMeter=activeMeter;
  var bars=[];
  voice.forEach(function(element,index){
    if(element.el_type==='meter'){
      activeMeter=meterLength(element,activeMeter);
      if(!hasNote)measureMeter=activeMeter;
    }
    if(element.el_type==='note'){
      if(!hasNote)measureMeter=activeMeter;
      hasNote=true;
      measureDuration+=(Number(element.duration)||0);
    }
    if(element.el_type!=='bar')return;
    if(hasNote)bars.push({barIndex:barIndex,endIndex:index,meter:measureMeter,duration:measureDuration});
    barIndex++;hasNote=false;measureDuration=0;measureMeter=activeMeter;
  });
  var firstTarget=perLine+(pickup?1:0),completed=0;
  bars.forEach(function(bar,index){
    var prev=bars[index-1],next=bars[index+1],primary=Number(primaryLength)||0;
    // The exception only applies to a single fully written 2/4 bar in a 4/4 tune
    // followed immediately by a return to the primary time signature.
    // Other changing meters (such as 9/8 and 7/8) retain normal counting.
    var transition=Math.abs(primary-1)<1e-7&&Math.abs(bar.meter-0.5)<1e-7&&
      Math.abs(bar.duration-bar.meter)<1e-7&&
      !!next&&next.meter>=primary-1e-7&&
      !!prev&&prev.meter>=primary-1e-7;
    if(!transition)completed++;
    var atBoundary=completed===firstTarget||completed>firstTarget&&(completed-firstTarget)%perLine===0;
    // A short transition measure doesn't itself create a new line.
    if(!transition&&atBoundary&&voice.slice(bar.endIndex+1).some(function(e){return e.el_type==='note';}))breaks.push(bar.barIndex);
  });
  return VoltaLayout.balance(voice,breaks);
}
function options(ABC,source,fields){
  fields=fields||{};
  var mode=String(fields['abc-bars-per-line']||'0');
  if(mode==='source')return {wrap:null};
  if(mode==='balanced'||mode==='0'||mode==='auto')return balancedOptions(ABC,source,fields);
  var settings=read(fields);if(!settings.bars)return {};
  var tune=ABC.parseOnly(source)[0];if(!tune)return {};
  var pickup=hasPickup(tune),seenFirstSection=false;
  var sections=tune.deline({lineBreaks:false}).filter(function(line){return !!(line.staff&&line.staff.length);});
  var breaks=sections.map(function(line){
    var voice=line.staff[0]&&line.staff[0].voices&&line.staff[0].voices[0];
    if(!voice)return [];
    var sectionPickup=pickup&&!seenFirstSection;
    if(voice.some(function(e){return e.el_type==='note';}))seenFirstSection=true;
    return lineBreaksForVoice(voice,settings.bars,sectionPickup,Number(tune.getBarLength&&tune.getBarLength())||0);
  });
  return {lineBreaks:breaks,wrap:null};
}
function balancedOptions(ABC,source,fields){
 if(!ABC||typeof ABC.tuneMetrics!=='function')return {};
 var key=source+'\n'+(fields['abc-font']||'')+'\n'+(fields['abc-chords-style']||'');
 try{
  var cached=metricCache.find(function(c){return c.key===key;}),metrics;
  if(cached)metrics=cached.metrics;
  else {
   var jazz=fields['abc-font']==='petaluma';
   var result=ABC.tuneMetrics(source,{staffwidth:720,jazzchords:fields['abc-chords-style']!=='standard',format:{gchordfont:jazz?'PetalumaScript 20':fields['abc-chords-style']==='standard'?'Helvetica 16':'Helvetica 18 bold'}});
   metrics=result&&result[0]&&result[0].sections;
   if(!metrics)return {};
   metricCache.push({key:key,metrics:metrics});if(metricCache.length>8)metricCache.shift();
  }
  var tune=ABC.parseOnly(source)[0],sections=tune.deline({lineBreaks:false}).filter(function(l){return l.staff;}),pickup=hasPickup(tune);
  if(sections.length!==metrics.length)return {};
  var breaks=sections.map(function(l,i){var plan=BalancedLayout.plan(l.staff[0].voices[0],metrics[i].measureWidths,metrics[i].left,{pickup:pickup&&i===0,parts:Engraving.partLines(fields)});return plan&&plan.breaks;});
  return breaks.some(function(b){return !b;})?{}:{lineBreaks:breaks,wrap:null};
 }catch(_error){return {};}
}
function mount(parent,fields,onChange){
  var details=document.createElement('details');details.className='huwabc-sheet-settings';details.setAttribute('data-huwabc-panel','sheet');var controls={};
  var title=document.createElement('summary');title.textContent='Nodeopsætning · takter og sider';details.appendChild(title);
  var grid=document.createElement('div');grid.className='huwabc-sheet-grid';details.appendChild(grid);
  [['Takter pr. linje','abc-bars-per-line'],['Højst nodesystemer pr. side','abc-lines-per-page']].forEach(function(pair){
    var label=document.createElement('label');label.textContent=pair[0];
    var input=document.createElement('select');input.className='huwabc-select';
    (pair[1]==='abc-bars-per-line'?[0,'balanced','source',2,3,4,6,8]:[0,2,3,4,6,8]).forEach(function(n){var opt=document.createElement('option');opt.value=n;opt.textContent=n==='balanced'?'Balanceret · fraser og volter':n==='source'?'Kildens linjeskift':n?String(n):pair[1]==='abc-bars-per-line'?'Automatisk · balanceret':'Automatisk';input.appendChild(opt);});
    controls[pair[1]]=input;input.value=fields[pair[1]]||0;label.appendChild(input);grid.appendChild(label);
    input.onchange=function(){var next={};next[pair[1]]=input.value;onChange(next);};
  });
  [['Papirformat','abc-paper-size',[['A4','A4'],['Letter','Letter']],'A4'],['Margen','abc-page-margin',[['8','8 mm'],['14','14 mm'],['20','20 mm']],'14']].forEach(function(spec){
    var label=document.createElement('label');label.textContent=spec[0];var control=document.createElement('select');control.className='huwabc-select';
    spec[2].forEach(function(item){var op=document.createElement('option');op.value=item[0];op.textContent=item[1];control.appendChild(op);});
    control.value=fields[spec[1]]||spec[3];controls[spec[1]]=control;label.appendChild(control);grid.appendChild(label);control.addEventListener('change',function(){var next={};next[spec[1]]=control.value;onChange(next);});
  });
  var label=document.createElement('label');label.textContent='Nodeskrift og akkorder';
  var input=document.createElement('select');input.className='huwabc-select';
  [['standard','Standard'],['petaluma','Jazz · Petaluma']].forEach(function(pair){var opt=document.createElement('option');opt.value=pair[0];opt.textContent=pair[1];input.appendChild(opt);});
  controls['abc-font']=input;input.value=fields['abc-font']||'standard';label.appendChild(input);grid.appendChild(label);
  input.onchange=function(){onChange({'abc-font':input.value});};
  var sectionLabel=document.createElement('label');sectionLabel.className='huwabc-section-break-option';
  var sectionCheck=document.createElement('input');sectionCheck.type='checkbox';sectionCheck.checked=Engraving.partLines(fields);
  sectionCheck.setAttribute('aria-label','Formdele på ny linje');sectionLabel.appendChild(sectionCheck);sectionLabel.appendChild(document.createTextNode(' Formdele på ny linje'));grid.appendChild(sectionLabel);
  sectionCheck.addEventListener('change',function(){onChange({'abc-parts-new-line':sectionCheck.checked?'yes':'no'});});
  var help=document.createElement('p');
  help.textContent=balancedHelp;
  details.appendChild(help);parent.appendChild(details);details.update=function(next){sectionCheck.checked=Engraving.partLines(next);Object.keys(controls).forEach(function(k){controls[k].value=next[k]||(k==='abc-font'?'standard':k==='abc-paper-size'?'A4':k==='abc-page-margin'?'14':0);});};return details;
}
exports.prepare=Engraving.prepare;exports.read=read;exports.options=options;exports.mount=mount;
// Pure functions also exported for regression testing.
exports.hasPickup=hasPickup;
exports.lineBreaksForVoice=lineBreaksForVoice;
})();

