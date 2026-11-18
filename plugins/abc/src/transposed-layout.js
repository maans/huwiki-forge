/*\
title: $:/plugins/huwiki/abc/transposed-layout.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";

// The original C score is the layout reference for written B-flat / E-flat
// notation. ABCJS otherwise recalculates automatic measure breaks after
// visualTranspose; changed accidentals can move measures to different systems.
// Do not alter ABC source, sounding pitches, or any playback controls.
function options(ABC,host,source,original){
 var transpose=Number(original&&original.visualTranspose)||0;
 if(!transpose || !original.wrap || original.lineBreaks || !ABC || !host)return original;
 var doc=host.ownerDocument || (typeof document!=="undefined"?document:null);
 if(!doc || !doc.createElement || !host.appendChild)return original;
 var sample=doc.createElement("div");
 sample.className="huwabc-concert-layout-reference";
 // Must have layout geometry: display:none gives ABCJS zero-width metrics.
 sample.style.cssText="position:absolute;left:-100000px;top:0;width:720px;visibility:hidden;pointer-events:none;";
 host.appendChild(sample);
 try{
  var baseline=Object.assign({},original,{visualTranspose:0});
  delete baseline.clickListener;
  var rendered=ABC.renderAbc(sample,source,baseline);
  var reference=rendered && rendered[0] && rendered[0].lineBreaks;
  if(!Array.isArray(reference) || reference.some(function(group){return !Array.isArray(group);}))return original;
  // Reuse the original musical system boundaries. ABCJS can still engrave
  // extra accidentals or wider labels at their proper natural width.
  // Recalculation is unnecessary, so omit wrap for the written view.
  var fixed=Object.assign({},original,{lineBreaks:reference.map(function(group){return group.slice();})});
  delete fixed.wrap;
  return fixed;
 }catch(error){
  // An optional reference pass must never prevent a readable score.
  return original;
 }finally{
  if(sample.parentNode)sample.parentNode.removeChild(sample);
 }
}
exports.options=options;
})();