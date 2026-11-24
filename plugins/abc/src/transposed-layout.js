/*\
title: $:/plugins/huwiki/abc/transposed-layout.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var VoltaLayout=require('$:/plugins/huwiki/abc/volta-layout.js');

// ABCJS 6.7.2 exposes a *mapping* on the rendered tune's lineBreaks property.
// It is not the array of break indices accepted by the lineBreaks render option.
// Recover the original zero-based bar positions from the mapping and drawn staff.
function referenceBreaks(tune){
 var mapping=tune&&tune.lineBreaks, lines=tune&&tune.lines;
 if(!Array.isArray(mapping)||!Array.isArray(lines)||!mapping.length)return null;
 var segments=mapping.filter(function(s){return s&&s.staff===0&&s.voice===0&&Number.isInteger(s.ogLine)&&Number.isInteger(s.line);});
 if(!segments.length)return null;
 var breaks=[],current=null,bars=0,group=[],voiceGroup=[];
 for(var i=0;i<segments.length;i++){
  var segment=segments[i], next=segments[i+1];
  if(current!==segment.ogLine){
   if(current!==null)breaks.push(VoltaLayout.balance(voiceGroup,group));
   if(current!==null&&segment.ogLine<=current)return null;
   current=segment.ogLine;bars=0;group=[];voiceGroup=[];
  }
  var line=lines[segment.line],voice=line&&line.staff&&line.staff[0]&&line.staff[0].voices&&line.staff[0].voices[0];
  if(!Array.isArray(voice))return null;
  voiceGroup=voiceGroup.concat(voice);
  for(var j=0;j<voice.length;j++)if(voice[j]&&voice[j].el_type==="bar")bars++;
  // Each mapped segment ends with a bar, except the last one of a source line.
  if(next&&next.ogLine===current){
   if(bars<1)return null;
   group.push(bars-1);
  }
 }
 breaks.push(VoltaLayout.balance(voiceGroup,group));
 return breaks;
}

// Keep the concert version's system/measure breaks for written B-flat/E-flat
// instruments. No ABC source, sounding pitches, or playback settings change.
function options(ABC,host,source,original){
 var transposition=Number(original&&original.visualTranspose)||0;
 var hasTabs=original&&original.tablature&&original.tablature.length;
 var hasSecondEnding=/(?:\[|\|)\s*2(?:[\],\s-]|$)/.test(source);
 if((!transposition&&!hasTabs&&!hasSecondEnding)||!original.wrap||original.lineBreaks||!ABC||typeof ABC.renderAbc!=="function"||!host)return original;
 var doc=host.ownerDocument||(typeof document!=="undefined"?document:null);
 if(!doc||!doc.createElement||!host.appendChild)return original;
 var sample=doc.createElement("div");
 sample.className="huwabc-concert-layout-reference";
 // display:none would make the renderer's width measurements unreliable.
 sample.style.cssText="position:absolute;left:-100000px;top:0;width:"+
  (Number(original.staffwidth)||720)+"px;visibility:hidden;pointer-events:none;";
 host.appendChild(sample);
 try{
  var baseline=Object.assign({},original,{visualTranspose:0});
  delete baseline.clickListener;
  baseline.tablature=[];
  if(hasTabs)baseline.afterParsing=function(tune){if(original.afterParsing)original.afterParsing(tune);delete tune.tablatures;};
  var rendered=ABC.renderAbc(sample,source,baseline);
  var reference=referenceBreaks(rendered&&rendered[0]);
  if(!reference)return original;
  var fixed=Object.assign({},original,{lineBreaks:reference});
  delete fixed.wrap;
  return fixed;
 }catch(error){
  // Optional reference render must not prevent a readable transposed score.
  return original;
 }finally{
  if(sample.parentNode)sample.parentNode.removeChild(sample);
 }
}
exports.options=options;
exports.referenceBreaks=referenceBreaks;
})();
