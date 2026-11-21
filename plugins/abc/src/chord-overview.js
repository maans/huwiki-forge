/*\
title: $:/plugins/huwiki/abc/chord-overview.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var ChordChart=require('$:/plugins/huwiki/abc/chord-chart.js');
// A full-song overview for chord-only tunes. The original ABCJS score and its
// event timing stay mounted; only their screen presentation is replaced.
function describe(ABC,source,barsPerLine,fields){
 var chart=ChordChart.extract(ABC,source),perLine=Math.max(1,Math.min(8,Number(barsPerLine)||4));
 var parts=[],current=null,inBody=false;
 String(source||'').split(/\r?\n/).forEach(function(line){
  if(/^K:/.test(line)){inBody=true;return;}if(!inBody)return;
  var m=line.match(/^\s*P:\s*([A-Za-z])\s*$/);
  if(m){current={name:m[1].toUpperCase(),startRepeat:false,endRepeat:false};parts.push(current);return;}
  if(!current||!/[|]/.test(line)||/^\s*(?:%|%%)/.test(line))return;
  if(/^\s*\|:/.test(line))current.startRepeat=true;
  if(/:\|\s*(?:%.*)?$/.test(line))current.endRepeat=true;
 });
 var rows=[],measures=chart.measures||[];
 for(var i=0;i<measures.length;i+=perLine){
  var p=parts[rows.length]||{},name=p.name||String(rows.length+1);
  rows.push({name:name,startRepeat:!!p.startRepeat,endRepeat:!!p.endRepeat,
   doubleTime:!!(fields&&fields['abc-double-time-section']===name),
   bars:measures.slice(i,i+perLine).map(function(m){
    return {number:m.number,chords:(m.chords||[]).map(function(c){
     return {name:c.name,index:c.index,startChar:c.startChar};
    })};
   })});
 }
 return {chart:chart,rows:rows};
}
function mount(paper,opts){
 opts=opts||{};var doc=paper.ownerDocument||document;
 var model=describe(opts.ABC,opts.source,opts.barsPerLine,opts.fields),active=null,buttons=[];
 function node(tag,cls,value){var result=doc.createElement(tag);result.className=cls;if(value!==undefined)result.textContent=value;return result;}
 var root=node('div','huwabc-chord-overview');root.setAttribute('role','group');root.setAttribute('aria-label','Hele becifringsarket');
 model.rows.forEach(function(row,i){
  var section=node('section','huwabc-chord-overview-row');
  section.setAttribute('data-part',row.name);
  var title=node('div','huwabc-chord-overview-part');
  title.appendChild(node('strong','huwabc-chord-overview-part-label',row.name));
  if(row.doubleTime)title.appendChild(node('span','huwabc-chord-overview-feel','Dobbelt tempo'));
  section.appendChild(title);
  var line=node('div','huwabc-chord-overview-line');
  if(row.startRepeat)line.appendChild(node('span','huwabc-chord-overview-repeat huwabc-chord-overview-repeat-start','|:'));
  var bars=node('div','huwabc-chord-overview-bars');
  bars.style.setProperty('--huwabc-bar-count',String(row.bars.length));
  row.bars.forEach(function(bar){
   var cell=node('div','huwabc-chord-overview-bar');cell.setAttribute('data-bar',String(bar.number));
   var chords=node('div','huwabc-chord-overview-chords');
   chords.style.setProperty('--huwabc-chord-count',String(Math.max(1,bar.chords.length)));
   bar.chords.forEach(function(chord){
    var b=node('button','huwabc-chord-overview-chord',chord.name);b.type='button';
    b.setAttribute('data-chord-index',String(chord.index));
    if(Number.isFinite(chord.startChar))b.setAttribute('data-huwabc-source-char',String(chord.startChar));
    b.setAttribute('aria-label',row.name+', takt '+bar.number+', '+chord.name);
    buttons[chord.index]=b;chords.appendChild(b);
   });
   cell.appendChild(chords);bars.appendChild(cell);
  });
  line.appendChild(bars);
  if(row.endRepeat)line.appendChild(node('span','huwabc-chord-overview-repeat huwabc-chord-overview-repeat-end',':|'));
  section.appendChild(line);root.appendChild(section);
 });
 paper.appendChild(root);
 function clear(){
  if(active)active.classList.remove('huwabc-chord-overview-current');
  active=null;
 }
 function follow(event){
  var at=ChordChart.atEvent(model.chart,event);
  var target=buttons[at];if(!target)return null;
  if(active!==target){clear();active=target;target.classList.add('huwabc-chord-overview-current');}
  return target;
 }
 return {root:root,model:model,clear:clear,follow:follow,
  destroy:function(){clear();if(root.parentNode)root.parentNode.removeChild(root);}};
}
exports.describe=describe;
exports.mount=mount;
})();