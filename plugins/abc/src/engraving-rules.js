/*\
title: $:/plugins/huwiki/abc/engraving-rules.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var VoiceNames=require('$:/plugins/huwiki/abc/voice-names.js');
var EPS=1e-7;
function note(e){return e&&e.el_type==='note';}
function opening(e){return e&&e.el_type==='bar'&&(e.type==='bar_left_repeat'||e.type==='bar_dbl_repeat');}
function part(e){return e&&(e.el_type==='part'||(e.chord||[]).some(function(c){return c.position==='above'&&/^[A-Z](?:[0-9]|['′])?(?:\s*[x×]\s*\d+)?$/.test(String(c.name||'').trim());}));}
function times(voice){var time=0,multiplier=1,events=[];voice.forEach(function(e,index){var at=time;if(note(e)){if(e.startTriplet)multiplier=Number(e.tripletMultiplier)||1;time+=(Number(e.duration)||0)*multiplier;if(e.endTriplet)multiplier=1;}events.push({e:e,index:index,time:at,end:time});});return {events:events,total:time};}
function hasMusic(voice){return voice.some(note);}
function closeBar(e){var copy=Object.assign({},e,{type:'bar_right_repeat'});if(copy.chord)copy.chord=copy.chord.filter(function(c){return c.position!=='above';});delete copy.startEnding;return copy;}
function openBar(e){var copy=Object.assign({},e,{type:'bar_left_repeat'});delete copy.endEnding;return copy;}
function cloneHeader(staff,left,following){
 var next=Object.assign({},staff);delete next.meter;delete next.barNumber;
 if(Array.isArray(staff.abbrevTitle))next.title=staff.abbrevTitle.slice();
 else if(following&&Array.isArray(following.title))next.title=following.title.slice();
 (left[0]||[]).forEach(function(e){if(e.el_type==='clef'||e.el_type==='key'){next[e.el_type]=Object.assign({},e);delete next[e.el_type].el_type;delete next[e.el_type].startChar;delete next[e.el_type].endChar;}});
 return next;
}
// A complete system is cut at a common musical boundary. Never split an
// event (including ties, tuplets or a multimeasure rest) merely to fit a page.
function cutVoice(voice,at){
 if(!hasMusic(voice))return {left:voice.slice(),right:[]};
 var scan=times(voice);if(scan.total<=at+EPS)return null;
 if(scan.events.some(function(r){return note(r.e)&&r.time<at-EPS&&r.end>at+EPS;}))return null;
 var first=scan.events.findIndex(function(r){return r.time>=at-EPS;});if(first<0)return null;
 var boundary=scan.events.slice(first).filter(function(r){return Math.abs(r.time-at)<EPS;});
 if(!boundary.some(function(r){return r.e.el_type==='bar';})&&first>0&&voice[first-1].el_type!=='bar')return null;
 var pivot=first,closing=[];
 // The closing half belongs to the old line. The opening half and its part
// label belong with the first note of the new line.
 while(pivot<voice.length&&Math.abs(scan.events[pivot].time-at)<EPS){
  var e=voice[pivot];
  if(e.el_type==='bar'&&e.type==='bar_dbl_repeat'){
   closing.push(closeBar(e));return {left:voice.slice(0,first).concat(closing),right:[openBar(e)].concat(voice.slice(pivot+1))};
  }
  if(e.el_type==='bar'&&!opening(e)&&!part(e)){closing.push(e);pivot++;continue;}
  break;
 }
 return {left:voice.slice(0,first).concat(closing),right:voice.slice(pivot)};
}
function splitSystem(line,at,nextOriginal){
 var cuts=[];for(var si=0;si<line.staff.length;si++){var staff=line.staff[si],voices=[];for(var vi=0;vi<staff.voices.length;vi++){var cut=cutVoice(staff.voices[vi],at);if(!cut)return null;voices.push(cut);}cuts.push(voices);}
 if(!cuts.some(function(s){return s.some(function(v){return hasMusic(v.left)&&hasMusic(v.right);});}))return null;
 var left=Object.assign({},line),right=Object.assign({},line);delete right.vskip;delete right.newpage;
 left.staff=line.staff.map(function(s,si){return Object.assign({},s,{voices:cuts[si].map(function(c){return c.left;})});});
 right.staff=line.staff.map(function(s,si){var next=cloneHeader(s,cuts[si].map(function(c){return c.left;}),nextOriginal&&nextOriginal.staff&&nextOriginal.staff[si]);next.voices=cuts[si].map(function(c){return c.right;});return next;});
 return [left,right];
}
function moveTrailing(line,next){
 if(!line.staff||!next||!next.staff||line.staff.length!==next.staff.length)return;
 line.staff.forEach(function(staff,si){staff.voices.forEach(function(voice,vi){var target=next.staff[si].voices[vi];if(!target||!hasMusic(target))return;var last=-1;voice.forEach(function(e,i){if(note(e))last=i;});if(last<0)return;
  var start=-1;for(var i=last+1;i<voice.length;i++){if(opening(voice[i])||voice[i].el_type==='part'){start=i;break;}}
  if(start<0)return;
  var moved=voice.splice(start);if(moved[0].el_type==='bar'&&moved[0].type==='bar_dbl_repeat'){voice.push(closeBar(moved[0]));moved[0]=openBar(moved[0]);}
  // A lone opening repeat doubles as the source's boundary. Retain a closing
  // thin bar on the old system; it has no duration and creates no measure.
  if(voice.length&&note(voice[voice.length-1]))voice.push({el_type:'bar',type:'bar_thin',startChar:-1,endChar:-1});
  Array.prototype.unshift.apply(target,moved);
 });});
}
function combineBars(voice){
 for(var i=1;i<voice.length;i++){var a=voice[i-1],b=voice[i];if(a.el_type!=='bar'||b.el_type!=='bar'||b.type!=='bar_left_repeat')continue;
  // Endings and decorations can carry different meanings; retain unusual
  // combinations rather than guessing their intended scope.
  if(a.startEnding||b.endEnding||(a.decoration&&a.decoration.length)||(b.decoration&&b.decoration.length))continue;
  if(a.type!=='bar_right_repeat'&&a.type!=='bar_thin')continue;
  var merged=Object.assign({},a,b,{type:a.type==='bar_right_repeat'?'bar_dbl_repeat':'bar_left_repeat',startChar:Math.min(a.startChar,b.startChar),endChar:Math.max(a.endChar,b.endChar)});
  if(a.endEnding)merged.endEnding=a.endEnding;
  if(a.chord||b.chord)merged.chord=(a.chord||[]).concat(b.chord||[]);
  voice.splice(i-1,2,merged);i--;
 }
}
function prepare(tune,fields,source){
 if(!tune||!Array.isArray(tune.lines))return tune;
 var lines=tune.lines,force=!fields||fields['abc-parts-new-line']!=='no';
 // The first part label often follows the pickup's opening repeat. It marks
 // the beginning of the tune, not a request for a system containing only the
 // pickup. Keep the actual note, duration and repeat position unchanged.
 var firstMusic=lines.find(function(l){return l.staff;}),pickup=Number(tune.getPickupLength&&tune.getPickupLength())||0;
 // A single source line may have no subsequent staff from which ABCJS can
 // recover its snm attribute. Use explicit, unambiguous source labels only.
 var names=source?VoiceNames.scan(source):[];
 lines.forEach(function(l){(l.staff||[]).forEach(function(s){if(Array.isArray(s.abbrevTitle)||!Array.isArray(s.title))return;
  var matched=false,short=s.title.map(function(full){var candidates=names.filter(function(v){return v.name===full&&v.hasShort;});if(candidates.length===1){matched=true;return candidates[0].short;}return full;});
  if(matched)s.abbrevTitle=short;
 });});
 for(var i=0;i<lines.length-1;i++)if(lines[i].staff&&lines[i+1].staff)moveTrailing(lines[i],lines[i+1]);
 if(force){
  var result=[];for(var j=0;j<lines.length;j++){var original=lines[j];if(!original.staff){result.push(original);continue;}var pending=original,guard=0;
   while(guard++<256){var candidates=[];pending.staff.forEach(function(s){s.voices.forEach(function(v){var scan=times(v);scan.events.forEach(function(r){var initialPickup=pending===firstMusic&&pickup>EPS&&Math.abs(r.time-pickup)<EPS;if(part(r.e)&&!initialPickup&&r.time>EPS&&r.time<scan.total-EPS&&!candidates.some(function(t){return Math.abs(t-r.time)<EPS;}))candidates.push(r.time);});});});
    candidates.sort(function(a,b){return a-b;});var cut=null;for(var ci=0;ci<candidates.length;ci++){cut=splitSystem(pending,candidates[ci],lines[j+1]);if(cut)break;}
    if(!cut)break;result.push(cut[0]);pending=cut[1];
   }result.push(pending);
  }tune.lines=result;
 }
 var firstSystem=true;
 (tune.lines||[]).forEach(function(l){if(!l.staff)return;l.staff.forEach(function(s){
  // ABCJS wrapping retains both title and abbrevTitle but repeats title on
  // every wrapped system. Respect the source's short label after system one.
  if(!firstSystem&&Array.isArray(s.abbrevTitle))s.title=s.abbrevTitle.slice();
  s.voices.forEach(combineBars);
 });firstSystem=false;});return tune;
}
exports.prepare=prepare;exports.part=part;exports.times=times;exports.combineBars=combineBars;exports.splitSystem=splitSystem;
})();
