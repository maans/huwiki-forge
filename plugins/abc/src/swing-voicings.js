/*\
title: $:/plugins/huwiki/abc/swing-voicings.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var chordKeys=require('$:/plugins/huwiki/abc/chord-keys.js');
var EPS=.004;
function pc(n){return ((n%12)+12)%12;}
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
function chord(name){
 var text=String(name||'').trim().replace(/♯/g,'#').replace(/♭/g,'b').replace(/Δ|△|Maj|MAJ/g,'maj').replace(/ø/g,'m7b5').replace(/°/g,'dim').replace(/6\/9|69/g,'6add9');
 if(/^(?:N\.?\s*C\.?|tacet|no chord)$/i.test(text))return null;
 // Text directions are not chord symbols. Unknown symbols retain the original audio.
 if(!/^[A-Ha-h][#b]?(?:(?:maj|min|dim|aug|sus|add|omit|no|alt)|[mMo0-9+#b()\s,−-])*(?:\/[A-Ha-h][#b]?)?$/.test(text))return undefined;
 var parsed=chordKeys.parse(text);if(!parsed)return undefined;
 var quality=text.replace(/^[A-Ha-h][#b]?/,'').split('/')[0];
 var intervals=parsed.pitchClasses.map(function(n){return pc(n-parsed.root);});
 var third=intervals.includes(4)?4:intervals.includes(3)?3:intervals.includes(5)?5:intervals.includes(2)?2:null;
 if(third===null)return undefined;
 // add9/add11 do not imply a seventh. Explicit 7sus does.
 var seventh=/(?:7|9|11|13)/.test(quality.replace(/add(?:9|11|13)/g,''));
 var sixth=!seventh&&/6/.test(quality);
 var diminished=/dim|^o/.test(quality);
 var companion=diminished||sixth?9:seventh?(intervals.includes(11)?11:intervals.includes(10)?10:intervals.includes(9)?9:null):intervals.includes(7)?7:intervals.includes(6)?6:intervals.includes(8)?8:null;
 if(companion===null)return undefined;
 // Keep alterations and explicit colours; never turn a plain triad into a seventh chord.
 var colours=[];
 if(/b5|dim|^o/.test(quality))colours.push(6);if(/#5|aug|\+/.test(quality))colours.push(8);
 if(/b9/.test(quality))colours.push(1);else if(/#9/.test(quality))colours.push(3);else if(/9/.test(quality))colours.push(2);
 if(/#11/.test(quality))colours.push(6);else if(/11/.test(quality))colours.push(5);
 if(/b13/.test(quality))colours.push(8);else if(/13/.test(quality))colours.push(9);
 colours=colours.filter(function(n,i,a){return n!==third&&n!==companion&&n!==0&&a.indexOf(n)===i;});
 var slash=text.match(/\/([A-Ha-h][#b]?)$/),bass=slash?chordKeys.parse(slash[1]).root:parsed.root;
 return {root:parsed.root,bass:bass,third:third,companion:companion,colours:colours,key:[parsed.root,bass,third,companion,colours.join(',')].join(':')};
}
function candidates(harmony){
 var out=[];
 ['137','173'].forEach(function(order){
  var first=pc(harmony.root+(order==='137'?harmony.third:harmony.companion));
  var second=pc(harmony.root+(order==='137'?harmony.companion:harmony.third));
  for(var low=50;low<=64;low++){
   if(pc(low)!==first)continue;
   var high=low+1;while(pc(high)!==second)high++;
   if(high<55||high>69)continue;
   for(var root=40;root<=59;root++){
    if(pc(root)!==harmony.bass||root>=low)continue;
    // Shells lie on bass string 6/5, D and G; prefer an actual reachable grip.
    var span=Math.min.apply(null,[40,45].filter(function(open){return root>=open;}).map(function(open){
     var frets=[root-open,low-50,high-55];return Math.max.apply(null,frets)-Math.min.apply(null,frets);
    }));
    if(span>6)continue;
    var tones=[root,low,high];
    if(harmony.bass!==harmony.root){var harmonicRoot=48+harmony.root;while(harmonicRoot<=root)harmonicRoot+=12;if(!tones.includes(harmonicRoot))tones.push(harmonicRoot);}
    var shell=tones.slice().sort(function(a,b){return a-b;}).filter(function(n,i,a){return !a.slice(0,i).some(function(before){return pc(before)===pc(n);});});
    harmony.colours.forEach(function(interval){
     var n=Math.max.apply(null,shell)+1;while(pc(n)!==pc(harmony.root+interval))n++;
     if(!tones.includes(n))tones.push(n);
    });
    tones.sort(function(a,b){return a-b;});
    out.push({order:order,tones:tones,shell:shell,guides:[low,high],bass:root,local:Math.abs(low-55)*.08+Math.abs(high-62)*.08+Math.abs(root-47)*.025+span*.025});
   }
  }
 });
 return out;
}
function brighter(harmony,voicing){
 // Exchange the two guide-note roles above the same bass: F3–C4 becomes C4–F4.
 // This is the other shell position, rather than an octave copy of the guitar.
 var guides=[voicing.guides[1],voicing.guides[0]+12];
 var shell=[voicing.bass].concat(guides);
 if(harmony.bass!==harmony.root){
  var root=48+harmony.root;while(root<=voicing.bass)root+=12;
  if(!shell.some(function(n){return pc(n)===harmony.root;}))shell.push(root);
 }
 shell=shell.sort(function(a,b){return a-b;}).filter(function(n,i,a){return !a.slice(0,i).some(function(before){return pc(before)===pc(n);});});
 var tones=shell.slice();
 harmony.colours.forEach(function(interval){
  var n=Math.max.apply(null,shell)+1;while(pc(n)!==pc(harmony.root+interval))n++;
  if(!tones.includes(n))tones.push(n);
 });
 tones.sort(function(a,b){return a-b;});
 return {order:voicing.order==='137'?'173':'137',tones:tones,shell:shell,guides:guides,bass:voicing.bass};
}
function transition(a,b,oldHarmony,newHarmony){
 var distance=Math.abs(a.guides[0]-b.guides[0])+Math.abs(a.guides[1]-b.guides[1]);
 var cost=distance*2+Math.max(0,Math.abs(a.bass-b.bass)-5)*.3;
 var change=pc(newHarmony.root-oldHarmony.root),same=a.order===b.order;
 // Circle motion exchanges third/seventh roles; stepwise roots keep the shape.
 if((change===5||change===7)&&same)cost+=30;
 if((change===1||change===2||change===10||change===11)&&!same)cost+=30;
 if(change===0&&!same)cost+=35;
 if(oldHarmony.key===newHarmony.key){
  cost+=distance*8+Math.abs(a.bass-b.bass)*4;
 }
 return cost;
}
function plan(changes,options){
 options=options||{};var result=[];
 (changes||[]).forEach(function(event){
  var harmony=chord(event.name),last=result[result.length-1];
  if(last&&last.harmony&&harmony&&last.harmony.key===harmony.key)return;
  result.push({start:event.start,harmony:harmony,choices:harmony?candidates(harmony):[]});
 });
 // Fix the starting register before optimizing the whole phrase. Otherwise a
 // distant chord can make a long chart choose the brighter opening guitar grip.
 // Explicit shell-family choices still allow either starting position.
 for(var start=0;start<result.length;){
  if(!result[start].choices.length){start++;continue;}
  var end=start;while(end+1<result.length&&result[end+1].choices.length)end++;
  var opening=result[start].choices,chosenOrder=['137','173'].includes(options.startOrder)?options.startOrder:null;
  var first=opening.slice().filter(function(candidate){return !chosenOrder||candidate.order===chosenOrder;}).sort(function(a,b){
   return a.guides[1]-b.guides[1]||a.guides[0]-b.guides[0]||a.bass-b.bass||a.local-b.local;
  })[0];
  for(var i=start;i<=end;i++){
   var row=result[i];row.costs=[];row.parents=[];
   var lowerGuides=Math.min.apply(null,row.choices.map(function(c){return c.guides[0]+c.guides[1];}));
   row.choices.forEach(function(candidate,index){
    if(i===start){row.costs[index]=candidate===first?candidate.local:Infinity;row.parents[index]=-1;return;}
    var previous=result[i-1],best=Infinity,parent=0;
    previous.choices.forEach(function(before,j){
     // Keep guitar in its lower working register unless voice leading needs
     // the other family. A long future must not reward a permanently high bass.
     var register=chosenOrder?0:Math.max(0,candidate.bass-52)*8+(candidate.guides[0]+candidate.guides[1]-lowerGuides)*.7;
     var value=previous.costs[j]+transition(before,candidate,previous.harmony,row.harmony)+candidate.local+register;
     if(value<best){best=value;parent=j;}
    });row.costs[index]=best;row.parents[index]=parent;
   });
  }
  var index=result[end].costs.indexOf(Math.min.apply(null,result[end].costs));
  for(var j=end;j>=start;j--){result[j].voicing=result[j].choices[index];index=result[j].parents[index];}
  // Piano keeps its established whole-phrase voice leading independently.
  // Lowering the guitar must not lower the piano's opening or later positions.
  var pianoCosts=[],pianoParents=[];
  for(var pi=start;pi<=end;pi++){
   var pianoRow=result[pi],costs=[],parents=[];
   pianoRow.choices.forEach(function(candidate){
    if(pi===start){costs.push(candidate.local+(chosenOrder&&candidate.order!==chosenOrder?10000:0));parents.push(-1);return;}
    var beforeRow=result[pi-1],best=Infinity,parent=0;
    beforeRow.choices.forEach(function(before,j){
     var cost=pianoCosts[pi-start-1][j]+transition(before,candidate,beforeRow.harmony,pianoRow.harmony)+candidate.local;
     if(cost<best){best=cost;parent=j;}
    });costs.push(best);parents.push(parent);
   });pianoCosts.push(costs);pianoParents.push(parents);
  }
  var lastCosts=pianoCosts[pianoCosts.length-1],pianoIndex=lastCosts.indexOf(Math.min.apply(null,lastCosts));
  for(var pj=end;pj>=start;pj--){var pianoChoice=result[pj].choices[pianoIndex];result[pj].pianoVoicing=brighter(result[pj].harmony,pianoChoice);pianoIndex=pianoParents[pj-start][pianoIndex];}
  start=end+1;
 }
 var output=result.map(function(row){return {start:row.start,harmony:row.harmony,voicing:row.voicing,pianoVoicing:row.pianoVoicing};});
 output.bars=options.bars||[];output.transpose=Number(options.transpose)||0;return output;
}
function at(plan,time){
 var lo=0,hi=plan.length-1,index=-1;
 while(lo<=hi){var mid=(lo+hi)>>1;if(plan[mid].start<=time+EPS){index=mid;lo=mid+1;}else hi=mid-1;}
 return index<0?null:plan[index];
}
function voice(events,plan,options){
 options=options||{};var groups=[],out=[];
 (events||[]).filter(function(e){return Number.isFinite(e.duration)&&e.duration>0;}).slice().sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;}).forEach(function(e){
  var g=groups[groups.length-1];if(!g||Math.abs(g.start-e.start)>EPS){g={start:e.start,notes:[]};groups.push(g);}g.notes.push(e);
 });
 groups.forEach(function(group){
  var origin=Number.isFinite(group.notes[0].huwabcHarmonyStart)?group.notes[0].huwabcHarmonyStart:group.start;
  var target=at(plan,origin),shift=at(plan.shifts||[],origin);
  var transpose=typeof options.transposeAt==='function'?options.transposeAt(group.start):shift?shift.transpose:plan.transpose||0;
  if(!target||target.harmony===undefined||target.harmony&&!target.voicing){out=out.concat(group.notes);return;}
  if(target.harmony===null)return;
  var notes=group.notes,volume=notes.reduce(function(sum,n){return sum+n.volume;},0)/notes.length;
  var sample=notes.reduce(function(a,b){return a.duration>b.duration?a:b;});
  var bar=(plan.bars||[]).find(function(b){return group.start>=b.start-EPS&&group.start<b.end-EPS;});
  var quarter=(group.start-(bar?bar.start:0)+(bar?Math.max(0,bar.meter.num/bar.meter.den-bar.duration):0))*4;
  var beat=Math.round(quarter),onBeat=Math.abs(quarter-beat)<.02,backbeat=onBeat&&beat%2===1;
  var guitar=options.guitar===true,regular=guitar&&sample.duration<=.25+EPS&&(typeof options.pulse==='function'?options.pulse(group.start):options.pulse)&&onBeat;
  var voicing=guitar?target.voicing:target.pianoVoicing||target.voicing;
  (guitar?voicing.shell:voicing.tones).forEach(function(pitch,index){
   var duration=sample.duration,factor=1;
   if(guitar){
    factor=index===0?(backbeat?.46:.88):(backbeat?1.08:.76);
    if(regular)duration=Math.min(duration,backbeat?.25*.34:.25*.62);
   }
   out.push(Object.assign({},sample,{pitch:pitch+transpose,start:group.start,duration:duration,volume:clamp(Math.round(volume*factor),1,127)}));
  });
 });
 return out.sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
}
function written(sequence,hits,plan){
 sequence.tracks=sequence.tracks.map(function(track,index){
  var mask=hits[index]||[],selected=[],other=[];
  track.forEach(function(event){
   if(event.cmd==='note'&&event.volume>0&&mask.some(function(hit){return Math.abs(hit.start-event.start)<EPS;}))selected.push(event);
   else other.push(event);
  });
  if(!selected.length)return track;
  function pulse(time){return mask.some(function(hit){return Math.abs(hit.start-time)<EPS&&Math.abs(hit.duration-.25)<.001&&mask.some(function(other){return Math.abs(other.duration-.25)<.001&&Math.abs(Math.abs(other.start-hit.start)-.25)<EPS;});});}
  var guitar=selected.every(function(n){return [24,25,26,27,28].includes(n.instrument);});
  var voiced=voice(selected,plan,{guitar:guitar,pulse:pulse,transposeAt:function(time){var hit=mask.find(function(h){return Math.abs(h.start-time)<EPS;});return hit&&Number.isFinite(hit.transpose)?hit.transpose:plan.transpose||0;}});
  // Keep program/controller events ahead of notes and preserve routing properties.
  var result=other.concat(voiced).sort(function(a,b){return (a.start===undefined?-Infinity:a.start)-(b.start===undefined?-Infinity:b.start);});
  Object.keys(track).filter(function(key){return !/^\d+$/.test(key);}).forEach(function(key){result[key]=track[key];});
  return result;
 });return sequence;
}
exports.chord=chord;exports.candidates=candidates;exports.plan=plan;exports.voice=voice;exports.written=written;
})();
