/*\
title: $:/plugins/huwiki/abc/notation.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var model=require('$:/plugins/huwiki/abc/editor-model.js');
var Spelling=require('$:/plugins/huwiki/abc/minor-spelling.js');
function shift(clef){if(clef&&clef.transpose)return Number(clef.transpose);return clef&&/-8/.test(clef.type)?-12:clef&&/\+8/.test(clef.type)?12:0;}
function target(c){if(c.notation==='source')return null;if(c.notation==='guitar')return 'treble-8';if(c.notation==='bass')return 'bass-8';if(['guitar','dropd','dadgad','openg'].includes(c.preset)||c.notes.length===6)return 'treble-8';if(['bass','bass5'].includes(c.preset))return 'bass-8';if(['mandolin','ukulele','violin','tenorbanjo','irishbanjo','banjo5','charango'].includes(c.preset))return 'treble';return null;}
function project(abc,tune,c,active){
 Spelling.apply(tune);
 var type=active&&target(c);if(!type)return;
 tune._huwabcNotationProjected=true;
 var template=abc.parseOnly('X:1\nK:C clef='+type+'\nC')[0].lines[0].staff[0].clef;
 var desired=shift(template),cache={};
 function keyFor(key){if(!key)return key;var k=(key.root||'C')+(key.acc||'')+(key.mode||'');if(!cache[k]){var t=abc.parseOnly('X:1\nK:'+k+' clef='+type+'\nC')[0];cache[k]=t.lines[0].staff[0].key;}return Object.assign({},key,{accidentals:cache[k].accidentals.map(function(a){return Object.assign({},a);})});}
 (tune.lines||[]).forEach(function(line){(line.staff||[]).forEach(function(staff){if(!staff.clef||/perc|TAB/.test(staff.clef.type))return;
  var initial=shift(staff.clef);if(initial%12!==0)return;
  staff.clef=Object.assign({},template);staff.key=keyFor(staff.key);
  (staff.voices||[]).forEach(function(voice){var trans=initial;voice.forEach(function(ev){if(ev.el_type==='clef'){trans=shift(ev);Object.assign(ev,template);delete ev.transpose;}if(ev.el_type==='key'){var key=keyFor(ev);ev.accidentals=key.accidentals;}
   var delta=(trans-desired)/12*7;
   (ev.pitches||[]).concat(ev.gracenotes||[]).forEach(function(p){p.pitch+=delta;p.verticalPos=p.pitch-template.verticalPos;if(p.name){var raw=model.pitch(p.name);if(raw)p.name=model.step({kind:'note',pitch:raw},delta);}});
  });});
 });});
}
function link(sourceMap,tune){var rendered={};(tune.lines||[]).forEach(function(l){(l.staff||[]).filter(function(s){return !s.clef||s.clef.type!=='TAB';}).forEach(function(s){(s.voices||[]).forEach(function(v){v.forEach(function(e){if(e.abselem)rendered[e.startChar]=e.abselem;});});});});sourceMap.events.forEach(function(e){e.el.abselem=rendered[e.start];});return sourceMap;}
exports.project=project;exports.link=link;exports.shift=shift;
})();
