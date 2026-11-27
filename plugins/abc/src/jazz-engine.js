/*\
title: $:/plugins/huwiki/abc/jazz-engine.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
/* HUWiki jazz arranging engine. Only playback events are changed, never the user's ABC.
 * Rhythm/arrangement choices are seeded and thus repeatable (also when looping a tune).
 * The source/part metadata is advisory; section choice is always overrideable. */
function pc(n){return ((Math.round(Number(n))%12)+12)%12;}
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){var x=seed>>>0;return function(){x+=0x6D2B79F5;var t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function noteInRegister(pitch,prev,min,max){
 var choices=[];for(var n=min;n<=max;n++)if(pc(n)===pc(pitch))choices.push(n);
 if(!choices.length)return Math.round(pitch);
 return choices.sort(function(a,b){var da=Math.abs(a-(prev==null?43:prev));var db=Math.abs(b-(prev==null?43:prev));return da-db||a-b;})[0];
}
function inferStyle(source,fields){
 fields=fields||{};
 var r=(String(source||'').match(/^R:\s*(.*)$/mi)||[])[1]||fields['abc-rhythm']||'';
 var notes=[r,fields['abc-style']||'',fields['abc-genre']||'',fields['repertoire-style']||'',fields['repertoire-genre']||''].join(' ').toLowerCase();
 var identity=(String(source||'').match(/^(?:T|C):[^\r\n]*/gmi)||[]).join(' ')+' '+String(fields['repertoire-work-title']||'');
 var fromJazz=/jazz|ian.hayden/i.test(String(fields['abc-origin-library']||'')+' '+String(fields['abc-origin-url']||''));
 var meter=(String(source||'').match(/^M:\s*([^\s]+)$/mi)||[])[1]||fields['abc-meter']||'';
 if(/^(?:4\/4|2\/4|2\/2|C|C\|)$/.test(meter)&&(/tango|piazzolla|piazolla/.test(notes)||/\b(?:libertango|piazzolla|piazolla)\b/i.test(identity)))return 'piazzolla-tango';
 if(meter==='3/4'&&/jazz[ -]?(?:waltz|vals)|(?:waltz|vals)[ -]?jazz/.test(notes))return 'jazzwaltz';
 if(/samba/.test(notes))return 'samba';
 if(/bossa|bossanova|bossa nova/.test(notes))return 'bossa';
 if(/ballad|slow jazz|jazz slow/.test(notes)){
  // Q uses its written beat unit: half-note=50 is quarter-note=100.
  var q=(String(source||'').match(/^Q:[^\r\n]*/mi)||[''])[0].replace(/"[^"]*"/g,''),parts=q.split('='),bpm=Number((parts[parts.length-1].match(/(\d+(?:\.\d+)?)\s*$/)||[])[1]),unit=.25;
  if(parts.length>1){var units=Array.from(parts[0].matchAll(/(\d+)\s*\/\s*(\d+)/g));if(units.length)unit=units.reduce(function(sum,m){return sum+Number(m[1])/Number(m[2]);},0);}
  if(/\b(?:slow|langsom|langsomt)\b/.test(notes)||bpm>0&&bpm*unit*4<=70)return 'slowjazzballad';
  return 'jazzballad';
 }
 if(/swing|bebop|jazz|blues|shuffle/.test(notes)||fromJazz)return meter==='3/4'?'jazzwaltz':'swing';
 if(/waltz|vals|valse/.test(notes)||meter==='3/4')return 'waltz';
 return 'pop';
}
function organise(events){return (events||[]).filter(function(e){return e&&e.cmd==='note'&&Number.isFinite(e.start)&&Number.isFinite(e.pitch);}).slice().sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});}
function meterLength(meter){return meter&&meter.den?meter.num/meter.den:1;}
function calcBars(events,meter){var sorted=organise(events),last=0;sorted.forEach(function(e){last=Math.max(last,e.start+Math.max(0,e.duration||0));});return Math.max(1,Math.ceil((last-0.0001)/meterLength(meter)));}
function normalForm(s){return String(s||'').replace(/[^A-Za-z]/g,'').toUpperCase();}
var EPS=.00002;
function playedTimeline(formResult,meter){
 if(formResult&&formResult.playedBars&&formResult.playedBars.length)return formResult.playedBars;
 var length=meterLength(meter),out=[];
 for(var i=0;i<(formResult&&formResult.bars||1);i++)out.push({index:i,start:i*length,end:(i+1)*length,duration:length,meter:meter,sourceBar:i});
 return out;
}
function pickupOffset(bar,meter){
 var nominal=meterLength(bar.meter||meter);
 return (bar.index===0||bar.sourceBar===0)&&bar.duration<nominal-EPS?nominal-bar.duration:0;
}
function harmonyAt(formResult,time){
 var harmony=formResult&&formResult.chords||[],found=null;
 for(var i=0;i<harmony.length&&harmony[i].start<=time+EPS;i++)found=harmony[i];
 return found;
}
function silentAt(formResult,time,drums){var h=harmonyAt(formResult,time);return !!(h&&(drums?/^(?:tacet|break)$/i:/^(?:N\.?\s*C\.?|no\s*chord|tacet|break)$/i).test(String(h.name||'').trim()));}
function harmonyEnd(formResult,time,end){
 var harmony=formResult&&formResult.chords||[];
 for(var i=0;i<harmony.length;i++)if(harmony[i].start>time+EPS)return Math.min(end,harmony[i].start);
 return end;
}
function form(source,barCount,meter,override,playedBars){
 source=String(source||'').replace(/\r\n?/g,'\n');barCount=playedBars&&playedBars.length||barCount||1;
 var keyMatch=/^K:\s*[^\r\n]*(?:\r?\n|$)/m.exec(source),bodyAt=keyMatch?keyMatch.index+keyMatch[0].length:0;
 var head=source.slice(0,bodyAt),p=(head.match(/^P:\s*(.*)$/m)||[])[1]||'';
 var detected='',reason='',confidence='forslag',requested=String(override||'auto').toUpperCase();
 var marks=[],markRe=/^P:\s*([A-Za-z])(?:[ \t]+[^\r\n]*)?[ \t]*$|\[P:\s*([A-Za-z])(?:[ \t]+[^\]]*)?[ \t]*\]/gm,match;
 // Preserve character positions: these are the same source offsets supplied by
 // meter-map, so repeat/volta playback can revisit its own written part label.
 var body=source.slice(bodyAt).replace(/%[^\r\n]*/g,function(x){return x.replace(/[^\r\n]/g,' ');}).replace(/"(?:[^"\\]|\\.)*"/g,function(x){return ' '.repeat(x.length);});
 while((match=markRe.exec(body)))marks.push({position:bodyAt+match.index,id:(match[1]||match[2]).toUpperCase(),index:marks.length});
 if(requested!=='AUTO'&&requested!=='NONE')detected=requested;
 var mapped=!!(playedBars&&playedBars.length&&playedBars.some(function(bar){return Number.isFinite(bar.sourceStart);}));
 var repeats=/\|:|:\|/.test(source.replace(/^\s*%.*$/gm,''));
 if(!detected&&marks.length&&(mapped||!repeats)){detected='INLINE';reason='P: markører i nodeteksten';confidence='høj';}
 if(!detected){var named=normalForm(p);if(/^(?:AABA|ABAC|ABAB|ABA|AAB|AB|ABC)$/.test(named)){detected=named;reason='ABC-feltet P:';confidence='høj';}}
 if(!detected){
  if(barCount===32)detected=repeats&&/\[1/.test(source)&&/\[2/.test(source)?'AAB':'AABA';
  else if(barCount===12)detected='BLUES';else if(barCount===24)detected='AAB';else if(barCount===16)detected='AB';else detected='FREE';
  reason='taktantal'+(repeats?' og gentagelsestegn':'');confidence=detected==='FREE'?'ukendt':'forslag';
 }
 if(requested==='NONE'){detected='FREE';reason='valgt uden form';confidence='manuelt';}
 if(requested!=='AUTO'){confidence='manuelt';reason='valgt i afspilleren';}
 var sections=[];
 if(detected==='INLINE'){
  var labels=[];
  if(mapped){
   playedBars.forEach(function(bar,i){
    var mark=null;for(var j=0;j<marks.length&&marks[j].position<=bar.sourceStart;j++)mark=marks[j];
    labels.push({id:mark?mark.id:'A',mark:mark?mark.index:-1,source:bar.sourceStart});
   });
  }else{
   // Without a playback map, use written barlines only for repeat-free ABC.
   var boundaries=[],bar=0,scan=/\[P:\s*([A-Za-z])(?:[ \t]+[^\]]*)?[ \t]*\]|^P:\s*([A-Za-z])(?:[ \t]+[^\r\n]*)?[ \t]*$|\[\||\|\]|\|\||\|/gm,item;
   while((item=scan.exec(body))){if(item[1]||item[2])boundaries.push({at:bar,id:(item[1]||item[2]).toUpperCase()});else if(item.index>0)bar++;}
   for(var n=0;n<barCount;n++){var active={id:'A',at:0};boundaries.forEach(function(m){if(m.at<=n)active=m;});labels.push({id:active.id,mark:active.at});}
  }
  labels.forEach(function(label,i){var prior=labels[i-1];if(!prior||label.id!==prior.id||label.mark!==prior.mark||Number.isFinite(label.source)&&label.source<prior.source){if(sections.length)sections[sections.length-1].end=i;sections.push({start:i,end:barCount,id:label.id,index:sections.length});}});
 }else{
  var names=detected==='BLUES'?['A','A','B']:detected==='FREE'?['A']:detected.split('');
  for(var i=0;i<names.length;i++)sections.push({start:Math.round(i*barCount/names.length),end:Math.round((i+1)*barCount/names.length),id:names[i],index:i});
 }
 sections=sections.filter(function(s){return s.end>s.start;});
 if(!sections.length)sections=[{start:0,end:barCount,id:'A',index:0}];
 return {type:detected,sections:sections,bars:barCount,reason:reason,confidence:confidence,repeats:repeats,playedBars:playedBars||null};
}
function sectionAt(formResult,bar){var ss=formResult&&formResult.sections||[];for(var i=ss.length-1;i>=0;i--)if(bar>=ss[i].start)return ss[i];return ss[0]||{id:'A',index:0,start:0,end:formResult&&formResult.bars||1};}
// Walking and the livelier ride pattern share this one local feel decision.
function feelAt(formResult,bar,c){
 c=c||{};var mode=c.feel||'form';if(mode==='two'||mode==='four')return mode;
 var sec=sectionAt(formResult,bar);if(sec.id==='B'||sec.id==='C')return 'four';
 if(c.swing&&Number(c.tempo)>=160&&Number(c.variation)>0){
  var phrase=Math.floor((bar-sec.start)/4),start=sec.start+phrase*4,complete=start+4<=sec.end;
  var timeline=formResult&&formResult.playedBars;
  if(complete&&timeline)for(var i=start;i<start+4;i++){var b=timeline[i];if(!b||b.meter&&b.duration<meterLength(b.meter)-EPS)complete=false;}
  // Always allow one clear four-bar lift; later lifts depend on variation and
  // seed, while keeping an entire phrase in one feel and returning afterwards.
  if(complete&&phrase%2===1&&(phrase===1||hash(String(c.seed||0)+'|'+sec.index+'|'+phrase)%100<Number(c.variation)))return 'four';
 }
 return 'two';
}
function walk(events,meter,formResult,c){
 var seeds=organise(events),timeline=playedTimeline(formResult,meter),beats=[],output=[],previous=null;
 if(!seeds.length)return output;
 function seedAt(time){var found=null;for(var i=0;i<seeds.length&&seeds[i].start<=time+EPS;i++)found=seeds[i];return found;}
 timeline.forEach(function(bar){
  var offset=pickupOffset(bar,meter),quarters=Math.round(meterLength(bar.meter||meter)*4);
  for(var q=Math.ceil(offset*4-EPS);q/4-offset<bar.duration-EPS;q++){
   var start=bar.start+q/4-offset,seed=seedAt(start);
   if(!seed||silentAt(formResult,start))continue;
   beats.push({start:start,bar:bar.index,position:q,quarters:quarters,end:bar.end,root:pc(seed.pitch),source:seed});
  }
 });
 beats.forEach(function(beat,i){
  var next=beats[i+1],root=beat.root,position=beat.position,feel=feelAt(formResult,beat.bar,c),prior=i?beats[i-1]:null;
  if(feel==='two'&&position%2!==0)return;
  var change=prior&&prior.root!==root,targetPc=root,harmony=harmonyAt(formResult,beat.start),name=harmony&&harmony.name||'';
  var third=/^[A-Ha-h][#b]?(?:m(?!aj)|min|dim|o|°)/.test(name)?3:4,fifth=/dim|b5|°/.test(name)?6:/aug|#5|\+/.test(name)?8:7;
  // An approach is only allowed to an immediately following sounding beat.
  var connected=next&&next.start-beat.start<=.25+EPS;
  if(feel==='two'){
   if(position!==0&&!change)targetPc=connected&&next.root!==root?pc(next.root+11):pc(root+fifth);
  }else if(position===0||change)targetPc=root;
  else if(connected&&(position===beat.quarters-1||next.root!==root)){
   var nextPitch=noteInRegister(next.root,previous,36,55),up=pc(nextPitch-1),down=pc(nextPitch+1);
   targetPc=previous==null?up:(Math.abs(noteInRegister(up,previous,36,55)-previous)<=Math.abs(noteInRegister(down,previous,36,55)-previous)?up:down);
  }else if(position%4===1)targetPc=pc(root+fifth);else if(position%4===2)targetPc=pc(root+third);else targetPc=pc(root+5);
  var midi=noteInRegister(targetPc,previous,36,55);
  if(previous!=null&&Math.abs(midi-previous)>8&&targetPc!==root){var alternate=noteInRegister(pc(root+fifth),previous,36,55);if(Math.abs(alternate-previous)<Math.abs(midi-previous))midi=alternate;}
  previous=midi;
  var end=harmonyEnd(formResult,beat.start,Math.min(beat.end,beat.start+(feel==='two'?.435:.215)));
  if(end>beat.start+EPS)output.push(Object.assign({},beat.source,{start:beat.start,pitch:midi,duration:end-beat.start,volume:clamp(Math.round((beat.source.volume||70)*(position===0?1:.83)),1,127)}));
 });
 return output;
}
// These non-Brazilian pattern slots are eighth-note subdivisions.
// Musical examples: Charleston, reverse Charleston, 2&4, upbeat anticipation, brush ballad, jazz waltz.
var COMP={
 swing:[[0,3],[1,4],[2,6],[3,7],[2,5,7]],
 jazzballad:[[0,4],[0,5],[2,6],[0,3,7],[1,6]],
 jazzwaltz:[[0,3],[2,4],[1,5],[0,4],[2,5]]
};
function describe(style){return style==='bossa'?BRAZIL_COMP.bossa.cycle.length:(COMP[style]||COMP.swing).length;}
// Four-bar piano conversations: spaces and an occasional hold belong to the
// motif, rather than random deletion of a rigid one-measure accompaniment.
var PIANO_COMP=[
 [[[0,.16],[3,.12]],[[2,.16],[6,.20]],[],[[1,.15],[5,.32]]],
 [[[1,.13],[4,.18]],[],[[0,.30],[5,.14]],[[3,.16],[7,.12]]],
 [[[2,.15],[5,.12]],[[1,.36]],[[3,.14],[6,.14]],[]],
 [[],[[0,.18],[3,.14]],[[2,.32]],[[1,.13],[6,.16]]]
];
function comp(events,meter,formResult,c,style,source){
 c=c||{};if(style==='bossa')return brazilComp(events,meter,formResult,c,'bossa',source);
 var sorted=organise(events),groups=[],timeline=playedTimeline(formResult,meter),variation=clamp(Number(c.variation||0),0,100),choices=COMP[style]||COMP.swing;
 sorted.forEach(function(e){var g=groups[groups.length-1];if(!g||Math.abs(g.start-e.start)>.0001){g={start:e.start,notes:[]};groups.push(g);}g.notes.push(e);});
 if(!groups.length)return [];
 var program=Number(c.chordInstrument),piano=c.swing===true&&style==='swing'&&program>=0&&program<=7;
 var fast=piano&&Number(c.tempo)>=160,random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|'+style)),current=-1,prevSec=-1,output=[];
 function groupAt(time){var lo=0,hi=groups.length-1,idx=-1;while(lo<=hi){var mid=(lo+hi)>>1;if(groups[mid].start<=time+EPS){idx=mid;lo=mid+1;}else hi=mid-1;}return idx<0?null:groups[idx];}
 timeline.forEach(function(bar){
  var sec=sectionAt(formResult,bar.index),newSection=sec.index!==prevSec,cell=bar.index-sec.start,feel=feelAt(formResult,bar.index,c),length=meterLength(bar.meter||meter),offset=pickupOffset(bar,meter);
  if(newSection){current=sec.id==='B'?2:0;prevSec=sec.index;}
  if(!piano&&variation>0&&bar.index>0&&(newSection||variation>=65||cell%2===0)&&random()*100<variation){var old=current;current=Math.floor(random()*choices.length);if(current===old)current=(current+1)%choices.length;}
  var pulses;
  if(piano){
   var phrase=Math.floor(cell/4),motif=(phrase+(sec.id==='B'?1:0)+(variation?hash(String(c.seed||0)+'|'+sec.index+'|'+phrase)%PIANO_COMP.length:0))%PIANO_COMP.length;
   pulses=PIANO_COMP[motif][cell%4];
   // Faster swing breathes: preserve a motif's leading attack, rather than
   // mechanically increasing the piano's density with the rhythm section.
   if(fast&&pulses.length>1)pulses=pulses.slice(0,1);
  }else pulses=(choices[current]||choices[0]).map(function(slot){return [slot,style==='jazzballad'?.33:.13];});
  // Lightly swung comping in triple time; do not swing the written melody.
  if(style==='jazzwaltz')pulses=pulses.map(function(p){return [p[0]%2===1?p[0]+1/3:p[0],p[1]];});
  pulses.forEach(function(pulse){
   var slot=pulse[0],within=slot/8-offset;if(slot>=length*8||within< -EPS||within>=bar.duration-EPS)return;
   var at=bar.start+Math.max(0,within);if(silentAt(formResult,at))return;
   var lookup=at;if(!piano&&slot===Math.round(length*8)-1&&variation>35)lookup+=.126;
   var group=groupAt(lookup);if(!group)return;
   var velocity=variation?(.88+random()*.23):1,jitter=variation?(random()-.5)*.0014*variation/100:0,start=clamp(at+jitter,bar.start,bar.end-EPS);
   var end=harmonyEnd(formResult,at,Math.min(bar.end,start+pulse[1]));
   if(end<=start+EPS)return;
   group.notes.forEach(function(note){output.push(Object.assign({},note,{start:start,huwabcHarmonyStart:piano?at:(Number.isFinite(note.huwabcHarmonyStart)?note.huwabcHarmonyStart:group.start),duration:end-start,volume:clamp(Math.round((note.volume||60)*velocity*(feel==='two'?.75:.9)),1,127)}));});
  });
 });
 return output.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
function swingDrums(meter,formResult,c,source){
 c=c||{};var out=[],timeline=playedTimeline(formResult,meter),variation=clamp(Number(c.variation)||0,0,100),level=Number.isFinite(Number(c.drumVolume))?Number(c.drumVolume):48;
 if(level<=0)return out;
 var random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|swingdrums'));
 timeline.forEach(function(bar){
  var feel=feelAt(formResult,bar.index,c),offset=pickupOffset(bar,meter),quarters=meterLength(bar.meter||meter)*4;
  function hit(q,pitch,strength){
   var at=bar.start+q/4-offset;if(at<bar.start-EPS||at>=bar.end-EPS||silentAt(formResult,at,true))return;
   var factor=(feel==='two'?.73:1.02)*1.20*(variation?.91+random()*.18:1);
   out.push({cmd:'note',start:Math.max(bar.start,at),pitch:pitch,duration:Math.min(.061,bar.end-at),volume:clamp(Math.round(level*strength*factor),1,127),instrument:128});
  }
  for(var q=0;q<quarters-EPS;q++){
   if(feel==='four'||q%2===0)hit(q,51,q%2===0?1:.88); // restrained ride pulse
   if(feel==='four'&&q%2===1&&q+2/3<quarters-EPS)hit(q+2/3,51,.64);
   if(q%2===1)hit(q,44,.63); // pedal hi-hat, never a rock backbeat
   if(q%2===0)hit(q,36,feel==='two'?.47:.34); // feather the bass drum
  }
  var sec=sectionAt(formResult,bar.index),cell=bar.index-sec.start;
  if(feel==='four'&&variation>0&&cell%2===1){hit(Math.min(quarters-1/3,2+2/3),38,.39);}
 });
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
// Bossa uses a complete two-measure, sixteen-position cycle: eight positions
// in each written measure (sixteenths in 2/4, eighths in 4/4). The first cell
// is a common three-plus-two figure, not an obligatory clave for all bossa.
// Samba retains its existing eighth-note grid and meter-specific cells.
var BRAZIL_COMP={
 bossa:{cycle:[[0,3,6,10,13],[0,4,7,11,14],[0,3,6,10,15],[1,3,7,10,14]]},
 samba:{four:[[0,2,3,6,8,11,13,15],[0,3,5,7,8,10,14,15],[1,3,4,6,8,11,12,15],[0,2,5,7,9,11,13,15]],two:[[0,2,3,5,6,7],[0,1,3,4,6,7],[1,2,4,5,7],[0,3,4,5,6,7]]}
};
function brazilStyle(style,formResult,bar){
 if(style==='bossa-samba')return sectionAt(formResult,bar).id==='B'?'samba':'bossa';
 return style==='samba'?'samba':'bossa';
}
function brazilComp(events,meter,formResult,c,style,source){
 var sorted=organise(events),grouped=[],length=meterLength(meter),writtenSlots=Math.round(length*8),total=formResult.bars;
 sorted.forEach(function(e){var g=grouped[grouped.length-1];if(!g||Math.abs(g.start-e.start)>.0001){g={start:e.start,notes:[]};grouped.push(g);}g.notes.push(e);});
 if(!grouped.length)return [];
 var random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|brazilcomp')),variation=clamp(Number(c.variation||0),0,100),chosen=0,priorSection=-1,result=[];
 for(var bar=0;bar<total;bar+=2){
  var sec=sectionAt(formResult,bar),actual=brazilStyle(style,formResult,bar),family=BRAZIL_COMP[actual];
  var slots=actual==='bossa'?8:writtenSlots,step=actual==='bossa'?length/8:1/8,choices=actual==='bossa'?family.cycle:(slots<=4?family.two:family.four);
  if(sec.index!==priorSection){chosen=0;priorSection=sec.index;}
  else if(variation>0&&random()*100<variation){var old=chosen;chosen=Math.floor(random()*choices.length);if(old===chosen)chosen=(chosen+1)%choices.length;}
  var hits=choices[chosen]||choices[0];
  hits.forEach(function(slot){var beatBar=bar+Math.floor(slot/slots);if(beatBar>=total)return;
   // Accents near the next harmony may anticipate its arrival.
   var at=bar*length+slot*step,lookup=at;
   if(slot%slots===slots-1)lookup+=step;
   var low=0,high=grouped.length-1,idx=0;
   while(low<=high){var mid=Math.floor((low+high)/2);if(grouped[mid].start<=lookup+.0001){idx=mid;low=mid+1;}else high=mid-1;}
   var notes=grouped[idx].notes;
   notes.forEach(function(note){result.push(Object.assign({},note,{start:at,duration:actual==='bossa'?.18:.105,volume:clamp(Math.round((note.volume||65)*(actual==='bossa'?.75:.88)*(slot%slots===0?1:.87)),1,127)}));});
  });
 }
 return result.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
function brazilBass(events,meter,formResult,c,style){
 var sorted=organise(events),slots=Math.round(meterLength(meter)*8),result=[],prev=null;
 sorted.forEach(function(e){
  var tick=Math.round(e.start*8),bar=Math.floor(tick/slots),within=((tick%slots)+slots)%slots;
  var actual=brazilStyle(style,formResult,bar),isSamba=actual==='samba';
  var onBeat=within===0||within===Math.floor(slots/2)||(isSamba&&slots>=8&&within%2===0);
  var anticip=isSamba&&within===slots-1&&bar%2===1;
  if(!onBeat&&!anticip)return;
  var original=e.pitch;
  if((within===Math.floor(slots/2)||isSamba&&within%4===2)&&!anticip)original-=5;
  var mid=noteInRegister(original,prev,35,56);prev=mid;
  result.push(Object.assign({},e,{pitch:mid,duration:isSamba?.18:.215,volume:clamp(Math.round((e.volume||72)*(anticip?.47:within===0?.83:1.0)),1,127)}));
 });
 return result;
}
function brazilDrums(meter,formResult,c,style,source){
 var length=meterLength(meter),writtenSlots=Math.round(length*8),slots=writtenSlots,step=1/8,total=formResult.bars,out=[];
 var random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|brazildrums'));
 var twoBossa=BRAZIL_COMP.bossa.cycle[0];
 var twoSamba=writtenSlots<=4?[1,3,4,6,7]:[1,3,5,7,9,11,13,15];
 function hit(bar,tick,pitch,velocity){if(bar>=total)return;out.push({cmd:'note',start:bar*length+tick*step,pitch:pitch,duration:.061,volume:clamp(Math.round(velocity),1,127),instrument:128});}
 for(var bar=0;bar<total;bar++){
  var family=brazilStyle(style,formResult,bar),isSamba=family==='samba';
  slots=isSamba?writtenSlots:8;step=isSamba?1/8:length/8;
  // Surdo-like low drum: in a 2/4 samba, beat two is stronger.
  for(var tick=0;tick<slots;tick+=isSamba?2:Math.max(2,slots/2)){
   hit(bar,tick,36,isSamba?(tick%4===2?80:57):(tick===0?53:67));
  }
  for(var j=0;j<slots;j++){
   var two=(bar%2)*slots+j;
   if(isSamba){
    hit(bar,j,70,j%2===0?30:23); // light cabasa/maracas
    if(twoSamba.includes(two))hit(bar,j,37,46+(j%2===1?13:0)); // tamborim-like accents
    if(j%2===1&&j%4===3)hit(bar,j,54,35); // pandeiro/tambourine
    if(two%4===0)hit(bar,j,two%8===0?68:67,36); // agogo call/response
   }else{
    hit(bar,j,70,j%2===0?19:13);
    if(twoBossa.includes(two))hit(bar,j,37,41);
   }
  }
  // Phrase-end flourish only if variation is high; do not overwrite pulse.
  if(isSamba&&c.variation>=70&&bar%4===3&&random()<c.variation/160)hit(bar,slots-1,63,28);
 }
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}

// Jazz waltz: three quarter-note ride pulses with a light triplet skip,
// pedal hi-hat on 2 and 3, feathered bass drum on 1. No rock backbeat.
function jazzWaltzDrums(meter,formResult,c,source){
 var out=[],level=Number(c.drumVolume)||0,random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|jazzwaltz'));
 if(level<=0)return out;
 playedTimeline(formResult,meter).forEach(function(bar){
  var m=bar.meter||meter;if(m.num!==3||m.den!==4)return;
  var offset=pickupOffset(bar,meter);
  function hit(q,pitch,strength){
   var at=bar.start+q/4-offset;if(at<bar.start-EPS||at>=bar.end-EPS||silentAt(formResult,at,true))return;
   out.push({cmd:'note',start:Math.max(bar.start,at),pitch:pitch,duration:Math.min(.055,bar.end-at),volume:clamp(Math.round(level*strength*(c.variation?.94+random()*.12:1)),1,127),instrument:128});
  }
  [0,1,2].forEach(function(q){hit(q,51,q===0?.85:.70);});
  hit(1+2/3,51,.40);hit(1,44,.52);hit(2,44,.52);hit(0,36,.28);
  if(c.variation>=50&&bar.index%4===3)hit(2+2/3,38,.26);
 });
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
// Nuevo tango accompaniment: an eighth-note 3+3+2 ostinato. Every fourth
// complete bar may use marcato in four under the continuing chord rhythm.
// The normalized eight-slot cell also supports 2/4 (sixteenths) and 2/2.
function tangoEvents(events,meter,formResult,c,bass,source){
 var groups=[];organise(events).forEach(function(e){var last=groups[groups.length-1];if(!last||Math.abs(last.start-e.start)>EPS){last={start:e.start,notes:[]};groups.push(last);}last.notes.push(e);});
 if(!groups.length)return [];
 var out=[],previous=null,random=rng(hash(String(source||'')+'|'+String(c.seed||0)+'|tango'+bass));
 function at(time){var found=null;for(var i=0;i<groups.length&&groups[i].start<=time+EPS;i++)found=groups[i];return found;}
 playedTimeline(formResult,meter).forEach(function(bar){
  var m=bar.meter||meter;if(!((m.num===4&&m.den===4)||(m.num===2&&(m.den===4||m.den===2))))return;
  var length=meterLength(m),step=length/8,offset=pickupOffset(bar,meter),sec=sectionAt(formResult,bar.index);
  var marcato=bass&&c.variation>=50&&(bar.index-sec.start)%4===3&&bar.duration>=length-EPS;
  var slots=marcato?[0,2,4,6]:[0,3,6];
  slots.forEach(function(slot,index){
   var start=bar.start+slot*step-offset;if(start<bar.start-EPS||start>=bar.end-EPS||silentAt(formResult,start))return;
   var group=at(start);if(!group)return;
   var end=harmonyEnd(formResult,start,Math.min(bar.end,start+step*(bass?1.38:.72)));
   if(end<=start+EPS)return;
   var strength=(slot===0?1:slot===3?.88:.94)*(c.variation?.96+random()*.08:1);
   var chosen=bass?[group.notes[0]]:group.notes;
   chosen.forEach(function(e){
    var pitch=e.pitch;
    if(bass){
     var h=harmonyAt(formResult,start),name=h&&String(h.name||''),slash=name&&/\/([A-Ga-g])([#b♯♭]?)/.exec(name);
     // G seeds give the transposed chord root; slash harmony gives the actual bass.
     if(slash){var root=/^([A-Ga-g])([#b♯♭]?)/.exec(name),names={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
      function tone(x){return names[x[1].toUpperCase()]+(/[#♯]/.test(x[2])?1:/[b♭]/.test(x[2])?-1:0);}
      if(root)pitch+=tone(slash)-tone(root);
     }
     pitch=noteInRegister(pitch,previous,33,53);previous=pitch;
    }
    out.push(Object.assign({},e,{start:Math.max(bar.start,start),pitch:pitch,duration:end-start,volume:clamp(Math.round((e.volume||65)*strength*(bass?.92:.86)),1,127)}));
   });
  });
 });
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
function tangoBass(events,meter,formResult,c,source){return tangoEvents(events,meter,formResult,c,true,source);}
function tangoComp(events,meter,formResult,c,source){return tangoEvents(events,meter,formResult,c,false,source);}

function voiceLead(events){
 var sorted=organise(events),groups=[];
 sorted.forEach(function(e){var g=groups[groups.length-1];if(!g||Math.abs(g.start-e.start)>.004){g={start:e.start,notes:[]};groups.push(g);}g.notes.push(e);});
 var prev=null,out=[];
 groups.forEach(function(g){
  var pcs=[];g.notes.forEach(function(e){var n=pc(e.pitch);if(!pcs.includes(n))pcs.push(n);});
  if(pcs.length<2){out=out.concat(g.notes);return;}
  pcs=pcs.slice(0,4);var candidates=[];
  pcs.forEach(function(root){for(var low=48;low<=64;low++){
   if(pc(low)!==root)continue;var notes=[low],remaining=pcs.filter(function(n){return n!==root;});
   for(var n=low+1;n<=81&&remaining.length;n++){var idx=remaining.indexOf(pc(n));if(idx>=0){notes.push(n);remaining.splice(idx,1);}}
   if(!remaining.length&&notes[notes.length-1]<=76&&notes[notes.length-1]-notes[0]<=18)candidates.push(notes);
  }});
  if(!candidates.length){out=out.concat(g.notes);return;}
  var score=function(ns){var cost=Math.abs((ns[0]+ns[ns.length-1])/2-60)*1.5;cost+=Math.max(0,ns[ns.length-1]-ns[0]-13)*1.6;
   if(prev){for(var i=0;i<ns.length;i++)cost+=Math.abs(ns[i]-(prev[Math.min(i,prev.length-1)]||ns[i]))*2.4;}
   return cost;};
  candidates.sort(function(a,b){return score(a)-score(b);});var choice=candidates[0];prev=choice;
  choice.forEach(function(p,i){var e=g.notes[Math.min(i,g.notes.length-1)];out.push(Object.assign({},e,{pitch:p,duration:Math.min(.35,Math.max(.065,e.duration||.15)),volume:Math.round((e.volume||65)*(i===0?.90:.83))}));});
 });
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
function drumDynamics(events,meter,formResult,c,source){
 var amount=clamp(Number(c.variation||0),0,100),random=rng(hash(String(source)+'|'+String(c.seed)+'|drums'));
 return organise(events).map(function(e){var bar=Math.floor((e.start+.00001)/meterLength(meter)),feel=feelAt(formResult,bar,c),factor=feel==='two'?.73:1.02;
  if(amount)factor*=.88+random()*.24;
  var shift=amount?(random()-.5)*.0015*amount/100:0;
  return Object.assign({},e,{start:Math.max(0,e.start+shift),volume:clamp(Math.round((e.volume||45)*factor),1,127)});
 });
}
exports.jazzWaltzDrums=jazzWaltzDrums;exports.tangoBass=tangoBass;exports.tangoComp=tangoComp;
exports.inferStyle=inferStyle;exports.walk=walk;exports.voiceLead=voiceLead;
exports.form=form;exports.calcBars=calcBars;exports.sectionAt=sectionAt;exports.feelAt=feelAt;exports.comp=comp;
exports.drumDynamics=drumDynamics;exports.swingDrums=swingDrums;exports.describe=describe;
exports.brazilComp=brazilComp;exports.brazilBass=brazilBass;exports.brazilDrums=brazilDrums;exports.brazilStyle=brazilStyle;exports.hash=hash;
})();

