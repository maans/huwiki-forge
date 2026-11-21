/*\
title: $:/plugins/huwiki/abc/meter-arranger.js
type: application/javascript
module-type: library
\*/
(function () {
'use strict';
var Balkan = require('$:/plugins/huwiki/abc/balkan7.js');
var EPS = 0.00002;
// Original HUWiki teaching arrangements. The Kopanitsa bass/comp skeleton is
// informed by Erik Goldov's Gankino accordion tutorial and Milen Slavov's
// Kopanitsa 2 score (see the plugin's MeterArrangementNotes). It is an
// accompaniment model, not a claim that one bass pattern fits every ensemble.
var styles = {
 'bg-kopanitsa': {label:'Bulgarien · Kopanitsa / Gankino (2+2+3+2+2)',bass:'written',chords:'balkan',drums:'tapan',bassInstrument:32,chordInstrument:21},
 'balkan9-2223': {label:'Balkan · 9/8 (2+2+2+3)',bass:'balkan',chords:'balkan',drums:'balkan',bassInstrument:32,chordInstrument:21},
 'balkan97': {label:'Ćuprija · 9/8 ↔ 7/8 (2+2+2+3 ↔ 2+2+3)',bass:'balkan',chords:'balkan',drums:'balkan',bassInstrument:32,chordInstrument:21},
 'balkan-44': {label:'Balkan · 4/4 · kontrabas, harmonika og let tapan',bass:'balkan',chords:'balkan',drums:'balkan',bassInstrument:32,chordInstrument:21},
 'meter-follow': {label:'Følg taktarten · gruppering fra ABC',bass:'balkan',chords:'balkan',drums:'balkan',bassInstrument:32,chordInstrument:24},
 'ungrouped-11': {label:'11/8 · neutral puls (vælg akkompagnementsstil)',bass:'root',chords:'off',drums:'off',bassInstrument:32,chordInstrument:24},
 // Nordic 2- and 4-beat accompaniment. The light percussion is only a
 // General MIDI approximation of cajón/hand percussion; no pop drum kit.
 'se-polka-24': {label:'Sverige · Polka 2/4 · kontrabas, harmonika, cajón',bass:'nordic',chords:'nordic',drums:'nordic',bassInstrument:32,chordInstrument:21},
 'se-dance-22': {label:'Sverige · Danse-2/2 · kontrabas, lut/mandolin, cajón',bass:'nordic',chords:'nordic',drums:'nordic',bassInstrument:32,chordInstrument:24},
 'se-brudmarsch-24': {label:'Sverige · Brudmarsch 2/4 · kontrabas, harmonika, blid cajón',bass:'nordic',chords:'nordic',drums:'nordic',bassInstrument:32,chordInstrument:21},
 'no-bruremarsj-mixed': {label:'Norge · Bruremarsj 4/4 + 2/4 · kontrabas, lut, blid cajón',bass:'nordic',chords:'nordic',drums:'nordic',bassInstrument:32,chordInstrument:24}
};
function parseMeter(text) {
 text=String(text||'').trim();
 if(text==='C')return {num:4,den:4,groups:null,explicit:false};
 if(text==='C|')return {num:2,den:2,groups:null,explicit:false};
 var m=text.match(/^\(?\s*(\d+(?:\s*\+\s*\d+)*)\s*\)?\s*\/\s*(\d+)$/);
 if(!m)return null;
 var groups=m[1].split('+').map(Number),num=groups.reduce(function(a,b){return a+b;},0),den=Number(m[2]);
 if(!groups.every(function(n){return Number.isInteger(n)&&n>0;})||!Number.isInteger(den)||den<1||num>128)return null;
 return {num:num,den:den,groups:groups.length>1?groups:null,explicit:groups.length>1};
}
function key(m){return m?m.num+'/'+m.den+':'+(m.groups||[]).join('+'):'invalid';}
function profile(source) {
 var text=String(source||'').replace(/%[^\r\n]*/g,''),firstKey=text.search(/^K:/m);
 var head=firstKey<0?text:text.slice(0,firstKey),body=firstKey<0?'':text.slice(firstKey);
 var header=(head.match(/^M:\s*([^\r\n]+)/m)||[])[1]||'4/4';
 var matches=[header.trim()],re=/\[M:\s*([^\]]+)\]|^M:\s*([^\r\n]+)/gm,match;
 while((match=re.exec(body)))matches.push((match[1]||match[2]).trim());
 var parsed=matches.map(parseMeter),first=parsed[0],changes=parsed.some(function(m){return key(m)!==key(first);});
 return {first:first,meters:matches,parsed:parsed,changes:changes,description:header.trim()+(changes?' · taktartsskift':'')};
}
function supported(m){return !!m&&Number.isInteger(m.num)&&m.num>0&&m.num<=32&&[2,4,8].indexOf(m.den)>=0;}
function groupMatches(m,groups){return !m.groups||m.groups.join('+')===groups.join('+');}
function compatible(p) {
 p=typeof p==='string'?profile(p):p;
 if(!p||!p.parsed.every(supported))return [];
 var result=['meter-follow'];
 if(p.parsed.every(function(m){return m.num===4&&m.den===4;}))result.unshift('balkan-44');
 if(p.parsed.every(function(m){return m.num===2&&m.den===4;}))result.unshift('se-brudmarsch-24','se-polka-24');
 if(p.parsed.every(function(m){return m.num===2&&m.den===2;}))result.unshift('se-dance-22');
 if(p.parsed.every(function(m){return (m.num===4&&m.den===4)||(m.num===2&&m.den===4);}))result.unshift('no-bruremarsj-mixed');
 if(p.parsed.every(function(m){return m.num===11&&m.den===8;})){
  if(p.parsed.every(function(m){return groupMatches(m,[2,2,3,2,2]);}))result.unshift('bg-kopanitsa');
  if(p.parsed.every(function(m){return !m.groups;}))result.push('ungrouped-11');
 }
 if(p.parsed.every(function(m){return m.den===8&&(m.num===9||m.num===7)&&groupMatches(m,m.num===9?[2,2,2,3]:[2,2,3]);})){
  if(p.changes)result.unshift('balkan97');
  else if(p.first.num===9)result.unshift('balkan9-2223');
 }
 return result;
}
function autoStyle(source,fields) {
 var p=profile(source),m=p.first;if(!m)return 'meter-follow';
 var words=[source.match&&String(source).match(/^(?:T|R):[^\r\n]*/gm),fields&&fields['abc-style'],fields&&fields['abc-rhythm'],fields&&fields['abc-genre']].join(' ').toLowerCase();
 var allowed=compatible(p);
 if(p.parsed.every(function(v){return v.num===2&&v.den===4;})&&/polka|polkett/.test(words))return 'se-polka-24';
 if(p.parsed.every(function(v){return v.num===2&&v.den===4;})&&/brudmarch|brudmarsch|bruremarsj|brudemarsj|brudemarch/.test(words))return 'se-brudmarsch-24';
 if(p.parsed.every(function(v){return v.num===2&&v.den===2;})&&/nordisk|svensk|swedish|folkemusik|folk music|danse/.test(words))return 'se-dance-22';
 if(p.parsed.every(function(v){return (v.num===4&&v.den===4)||(v.num===2&&v.den===4);})&&/bruremarsj|brudemarsj|brudmarch|brudmarsch/.test(words))return 'no-bruremarsj-mixed';
 if(p.changes)return allowed.indexOf('balkan97')>=0?'balkan97':'meter-follow';
 if(m.num===11&&m.den===8){
  if(allowed.indexOf('bg-kopanitsa')>=0&&((m.groups&&m.groups.join('+')==='2+2+3+2+2')||/kopan|gankino/.test(words)))return 'bg-kopanitsa';
  return m.groups?'meter-follow':'ungrouped-11';
 }
 if(m.num===9&&m.den===8){
  if(allowed.indexOf('balkan9-2223')>=0&&((m.groups&&m.groups.join('+')==='2+2+2+3')||/cupr|ćupr|balkan|daich|daych/.test(words)))return 'balkan9-2223';
  return 'meter-follow';
 }
 return 'meter-follow';
}
function specific(style,bar,form) {
 var section=form&&form.sections&&form.sections.find(function(s){return bar.index>=s.start&&bar.index<s.end;});
 var composite=Balkan.styles[style];
 if(composite&&composite.a)return section&&section.id==='B'?composite.b:composite.a;
 if(style==='balkan97')return bar.meter.num===7?'mk-cigancica':'balkan9-2223';
 return style;
}
function groupsFor(style,bar,source,fields,form) {
 var m=bar.meter;if(m.groups&&m.groups.length)return m.groups.slice();
 var name=specific(style,bar,form),legacy=Balkan.styles[name];
 if(legacy&&legacy.group&&m.den===8&&legacy.group.reduce(function(a,b){return a+b;},0)===m.num)return legacy.group.slice();
 if(name==='bg-kopanitsa'&&m.num===11&&m.den===8)return [2,2,3,2,2];
 if(name==='balkan9-2223'&&m.num===9&&m.den===8)return [2,2,2,3];
 if(m.den===8){
  if(m.num===7){var synthetic=String(source||'').replace(/^M:[^\r\n]*/m,'M:7/8');return Balkan.groupFor(Balkan.autoStyle(synthetic,fields),synthetic);}
  if([6,9,12].indexOf(m.num)>=0)return Array(m.num/3).fill(3);
 }
 // An unlabelled 11/8 is deliberately eleven neutral pulses. Explicit M:
 // groups or a selected named style are required for a dance interpretation.
 return Array(m.num).fill(1);
}
function starts(groups){var sum=0;return groups.map(function(n){var v=sum;sum+=n;return v;});}
function sorted(notes){return (notes||[]).filter(function(n){return n.cmd==='note'&&Number.isFinite(n.start)&&Number.isFinite(n.pitch);}).slice().sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});}
function at(notes,when){var lo=0,hi=notes.length-1,found=-1;while(lo<=hi){var mid=(lo+hi)>>1;if(notes[mid].start<=when+EPS){found=mid;lo=mid+1;}else hi=mid-1;}return found<0?null:notes[found];}
function chordAt(notes,when){var found=at(notes,when);if(!found)return [];var index=notes.indexOf(found),out=[];while(index>=0&&Math.abs(notes[index].start-found.start)<EPS)out.unshift(notes[index--]);return out;}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function pitchClass(letter,acc){var n={C:0,D:2,E:4,F:5,G:7,A:9,B:11,H:11}[letter.toUpperCase()];return (n+(acc==='#'?1:acc==='b'?-1:0)+12)%12;}
function harmonyAt(harmony,when){var found=null;for(var i=0;i<harmony.length&&harmony[i].start<=when+EPS;i++)found=harmony[i];return found;}
function isSilent(h){return h&&/^(?:N\.?\s*C\.?|no\s*chord|tacet|break)$/i.test(h.name.trim());}
function register(pitch){var n=Math.round(pitch);while(n<36)n+=12;while(n>55)n-=12;return n;}
function randomFor(text){var h=2166136261;for(var i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return function(){h+=0x6D2B79F5;var n=Math.imul(h^(h>>>15),1|h);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};}
function generate(style,timeline,form,c,source,fields,rootSeeds,chordSeeds,live,metroSounds) {
 var out={bass:[],chords:[],drums:[],metronome:[],bars:[]};
 rootSeeds=sorted(rootSeeds);chordSeeds=sorted(chordSeeds);
 var harmony=timeline.chords||[],variation=clamp(Number(c.variation)||0,0,100);
 var random=randomFor(String(source)+'|'+style+'|'+(c.seed||1));
 (timeline.bars||[]).forEach(function(bar){
  var m=bar.meter,groups=groupsFor(style,bar,source,fields,form),accents=starts(groups),name=specific(style,bar,form),phase=bar.sourceBar%2;
  var part=form&&form.sections&&form.sections.find(function(section){return bar.index>=section.start&&bar.index<section.end;});
  var doubleTime=!!(name==='balkan-44'&&m.num===4&&m.den===4&&part&&fields&&fields['abc-double-time-section']===part.id);
  var unit=1/m.den,nominal=m.num*unit,offset=bar.index===0&&bar.duration<nominal-EPS?nominal-bar.duration:0;
  // Re-enter the same written measure with the same figure. A new meter always
  // starts its own local pattern; there is no pattern-wide time stretching.
  var bassTicks,compTicks,roles;
  if(name==='se-polka-24'&&m.num===2&&m.den===4){
   // Oom-pah with a small upbeat lift: bass on quarter-note beats,
   // accordion / plucked strings on the intervening eighths.
   bassTicks=[0,1];roles=[0,7];compTicks=[.5,1.5];
  }else if(name==='se-dance-22'&&m.num===2&&m.den===2){
   // 2/2: two walking half-note bass beats, quarter-note answers.
   bassTicks=[0,1];roles=[0,7];compTicks=[.5,1.5];
  }else if(name==='se-brudmarsch-24'&&m.num===2&&m.den===4){
   // Restrained procession, not a driving polka. Support the second beat.
   bassTicks=[0,1];roles=[0,7];compTicks=[1];
  }else if(name==='balkan-44'&&m.num===4&&m.den===4){
   // A: relaxed bass on 1/3 and accordion on 2/4.
   // Double-time B doubles the ATTACK frequency, without changing the 4/4
   // measure length or an ABC melody that has not yet been transcribed.
   if(doubleTime){bassTicks=[0,1,2,3];roles=[0,7,0,7];compTicks=[.5,1.5,2.5,3.5];}
   else{bassTicks=[0,2];roles=[0,7];compTicks=[1,3];}
  }else if(name==='no-bruremarsj-mixed'&&(m.den===4&&[2,4].indexOf(m.num)>=0)){
   // Preserve written 2/4 insertions rather than force 4/4 onto them.
   bassTicks=m.num===4?[0,2]:[0,1];roles=[0,7];compTicks=m.num===4?[1,3]:[1];
  }else if(name==='bg-kopanitsa') {bassTicks=[0,4,7];roles=[0,7,0];compTicks=[2,6,9];}
  else if(name==='balkan9-2223'){bassTicks=[0,4,6];roles=[0,7,0];compTicks=[2,5,8];}
  else if(Balkan.patterns[name]){var fig=Balkan.patterns[name][0];bassTicks=fig.bass[phase].slice();roles=bassTicks.map(function(_,i){return i%2?7:0;});compTicks=fig.comp[phase].slice();}
  else {bassTicks=accents.slice();roles=bassTicks.map(function(_,i){return i%2?7:0;});compTicks=accents.map(function(t,i){return t+groups[i]-1;});}
  if(c.bass==='root'){bassTicks=[0];roles=[0];}
  else if(c.bass==='alternate'){bassTicks=[0,accents[Math.max(1,Math.floor(accents.length/2))]||0].filter(function(v,i,a){return a.indexOf(v)===i;});roles=[0,7];}
  else if(c.bass==='pulse'||c.bass==='walking'){bassTicks=accents.slice();roles=bassTicks.map(function(_,i){return i%2?7:0;});}
  // Written harmonic/bass pulses REPLACE the automatic grid in this mode.
  // Adding them to that grid made five bass attacks in the Bulgarian first bar.
  var forcedRoots={},writtenGrid=false;
  var barHarmony=harmony.filter(function(h){return h.start>=bar.start-EPS&&h.start<bar.end-EPS;});
  var useWritten=c.bass==='written'||name==='bg-kopanitsa'&&c.bass==='balkan'&&barHarmony.some(function(h){return /\/[A-Ha-h][#b]?/.test(h.name);});
  if(useWritten&&barHarmony.length>=2){
   bassTicks=[];roles=[];writtenGrid=true;
   barHarmony.forEach(function(h){
    var tick=(h.start-bar.start+offset)/unit;
    if(bassTicks.some(function(t){return Math.abs(t-tick)<EPS;}))return;
    bassTicks.push(tick);roles.push((bassTicks.length-1)%2?7:0);
   });
   // A first symbol later in the bar does not remove its inherited downbeat.
   if(bassTicks[0]>offset/unit+EPS){bassTicks.unshift(offset/unit);roles.unshift(0);}
  }else if(useWritten&&barHarmony.length===1&&barHarmony[0].start>bar.start+EPS){
   var writtenTick=(barHarmony[0].start-bar.start+offset)/unit;
   var replace=bassTicks.findIndex(function(t){return t>=writtenTick-EPS;});
   if(replace>=0){bassTicks[replace]=writtenTick;roles[replace]=0;}
   else{bassTicks.push(writtenTick);roles.push(0);}
   forcedRoots[writtenTick.toFixed(7)]=true;
  }else if(c.bass==='balkan'||c.bass==='pulse'||c.bass==='alternate'||c.bass==='written'){
   var prior=harmonyAt(harmony,bar.start-EPS*2);
   barHarmony.forEach(function(h){
    if(prior&&prior.name!==h.name&&(/\/[A-Ha-h][#b]?/.test(prior.name)||/\/[A-Ha-h][#b]?/.test(h.name))){
     var tick=(h.start-bar.start+offset)/unit;
     forcedRoots[tick.toFixed(7)]=true;
     if(!bassTicks.some(function(t){return Math.abs(t-tick)<EPS;})){bassTicks.push(tick);roles.push(0);}
    }
    prior=h;
   });
   var strokes=bassTicks.map(function(t,i){return {tick:t,role:roles[i]||0};}).sort(function(a,b){return a.tick-b.tick;});
   bassTicks=strokes.map(function(s){return s.tick;});roles=strokes.map(function(s){return s.role;});
  }
  if(c.chords==='beats')compTicks=accents.slice();
  else if(c.chords==='offbeat')compTicks=accents.map(function(t,i){return t+groups[i]-1;});
  else if(c.chords==='afterbeat')compTicks=accents.slice(1);
  else if(c.chords==='arpeggio')compTicks=Array.from({length:m.num},function(_,i){return i;});
  out.bars.push({index:bar.index,start:bar.start,end:bar.end,meter:m,group:groups,style:name,doubleTime:doubleTime,bassGrid:writtenGrid?'written':'style'});
  function when(tick){var p=tick*unit-offset;if(p<-EPS||p>=bar.duration-EPS)return null;return bar.start+Math.max(0,p);}
  function put(target,tick,pitch,volume,duration,seed){var time=when(tick);if(time===null||!Number.isFinite(pitch))return;var len=Math.min(duration,bar.end-time);if(len<=EPS)return;target.push(Object.assign({},seed||{cmd:'note'},{cmd:'note',start:time,pitch:Math.round(pitch),duration:len,gap:0,volume:clamp(Math.round(volume),1,127)}));}
  var writtenHarmony=null,writtenPhase=0;
  if(c.enabled&&c.bass!=='off'&&c.bassVolume>0)bassTicks.forEach(function(tick,i){
   var time=when(tick);if(time===null)return;var h=harmonyAt(harmony,time);if(isSilent(h))return;
   var seed=at(rootSeeds,time);if(!seed)return;var interval=roles[i]||0;
   if(writtenGrid){if(!h||h.name!==writtenHarmony)writtenPhase=0;interval=writtenPhase++%2?7:0;writtenHarmony=h&&h.name;}
   // A new chord gets its root at the next bass attack; a written slash bass
   // overrides alternating fifths until the next chord symbol replaces it.
   var previousTime=i?when(bassTicks[i-1]):null,previousHarmony=previousTime===null?null:harmonyAt(harmony,previousTime);
   if(!previousHarmony||h&&previousHarmony.name!==h.name||forcedRoots[tick.toFixed(7)])interval=0;
   var match=h&&h.name.match(/^([A-Ha-h])([#b]?)[^/]*\/([A-Ha-h])([#b]?)/);
   if(match)interval=(pitchClass(match[3],match[4])-pitchClass(match[1],match[2])+12)%12;
   var nextHarmony=harmony.find(function(next){return next.start>time+EPS&&next.name!==(h&&h.name);});
   var duration=Math.min(unit*.85,.15,nextHarmony?nextHarmony.start-time:Infinity);
   put(out.bass,tick,register(seed.pitch+interval),c.bassVolume*(i===0?.96:.82),duration,seed);
  });
  if(c.enabled&&c.chords!=='off'&&c.chordVolume>0)compTicks.forEach(function(tick,i){
   var time=when(tick);if(time===null||isSilent(harmonyAt(harmony,time)))return;
   var notes=chordAt(chordSeeds,time);if(c.chords==='arpeggio'&&notes.length)notes=[notes[i%notes.length]];
   notes.forEach(function(n){put(out.chords,tick,n.pitch,c.chordVolume*.76,Math.min(unit*((/^se-|^no-bruremarsj/.test(name))?.38:name==='bg-kopanitsa'?.55:.85),.15),n);});
  });
  function drum(tick,pitch,velocity,length){put(out.drums,tick,pitch,c.drumVolume*velocity/100,Math.min(unit*(length||.42),.09),{instrument:128});}
  if(c.enabled&&c.drums!=='off'&&c.drumVolume>0){
   if(name==='balkan-44'&&c.drums==='balkan'){
    // Tapan-like low drum and sticks; double-time makes eight attacks
    // rather than four, but each physical 4/4 bar keeps its duration.
    if(doubleTime){
     [0,1,2,3].forEach(function(tick){drum(tick,35,tick%2?45:66,.44);drum(tick+.5,37,tick%2?36:43,.23);});
    }else{
     drum(0,35,72,.60);drum(2,35,59,.50);
     drum(1,37,37,.22);drum(3,37,43,.24);
    }
   }else if(c.drums==='nordic' && /^se-|^no-bruremarsj/.test(name)){
    // GM35 low cajón stroke, GM37 side/rim. No automatic hi-hat/backbeat.
    if(name==='se-polka-24'){
     drum(0,35,76,.52);drum(1,37,56,.33);
     if(variation>25){drum(.5,70,22,.16);drum(1.5,70,20,.16);}
    }else if(name==='se-dance-22'){
     drum(0,35,64,.42);drum(1,37,46,.28);
    }else if(name==='se-brudmarsch-24'){
     drum(0,35,55,.48);drum(1,37,36,.22);
    }else {
     drum(0,35,56,.44);if(m.num===4){drum(1,37,30,.2);drum(2,35,39,.42);drum(3,37,33,.2);}
     else drum(1,37,34,.2);
    }
   }else if(c.drums==='shaker'){for(var tick=0;tick<m.num;tick++)drum(tick,70,accents.indexOf(tick)>=0?65:32);}
   else if(name==='bg-kopanitsa'&&(c.drums==='tapan'||c.drums==='balkan')){
    // Gankino accents: primary 0, tertiary 4, secondary 7. The light stroke
    // at6 articulates the long group as2+1. This is a tapan-inspired GM model:
    // acoustic bass drum35 and dry stick37, without a shaker or pop backbeat.
    [[0,100],[4,65],[7,82]].forEach(function(hit){drum(hit[0],35,hit[1],.70);});
    [[2,50],[6,32],[9,52]].forEach(function(hit){
     var dynamic=1+(random()-.5)*variation*.002;
     drum(hit[0],37,hit[1]*dynamic,.25);
    });
    // A quiet optional pickup answers the established pattern. Variation
    // changes light sticking; the heavy accent hierarchy remains fixed.
    if(variation>0&&random()*100<variation*.35)drum(10,37,16+random()*8,.20);
   }else{
    accents.forEach(function(tick,i){drum(tick,i===0||groups[i]===3?36:37,i===0?96:groups[i]===3?84:72);});
    if(variation>0)accents.forEach(function(tick,i){
     if(groups[i]>1&&random()*100<variation*(groups[i]===3?1:.45))drum(tick+groups[i]-1,37,20+random()*variation*.25);
    });
   }
  }
  if(live||c.metronome&&c.metronomeVolume>0){
   var sounds=metroSounds[c.metronomeSound]||metroSounds.wood;
   accents.forEach(function(tick){var first=tick===0&&c.metronomeAccent;put(out.metronome,tick,first?sounds.accent:sounds.beat,(live?100:c.metronomeVolume)*(first?1.16:c.metronomeAccent?.80:.95),Math.min(unit*.42,.052),{instrument:128});});
  }
 });
 return out;
}
exports.styles=styles;exports.profile=profile;exports.parseMeter=parseMeter;exports.compatible=compatible;exports.supported=supported;exports.autoStyle=autoStyle;exports.groupsFor=groupsFor;exports.generate=generate;
})();
