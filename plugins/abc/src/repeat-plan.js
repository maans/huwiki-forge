/*\
title: $:/plugins/huwiki/abc/repeat-plan.js
type: application/javascript
module-type: library
\*/
(function () {
'use strict';
var EPS = 0.00002, MAX_COUNT = 16, MAX_BARS = 20000;

var RENDER_FIELDS={abselem:true,abcelem:true,graphelem:true,elemset:true,parent:true,staffGroup:true,engraver:true};
function clone(value,ancestors) {
 if (typeof value === 'function') return undefined;
 if (!value || typeof value !== 'object') return value;
 // ABCJS's real draw pass adds event.abselem.abcelem === event, including
 // staff clefs, keys and meters. Headers need music data, never that graph.
 if (typeof value.nodeType === 'number') return undefined;
 ancestors=ancestors||new Set();if(ancestors.has(value))return undefined;
 ancestors.add(value);
 var out;
 if(Array.isArray(value))out=value.map(function(item){return clone(item,ancestors);});
 else {
  out={};Object.keys(value).forEach(function(k){
   if(Object.prototype.hasOwnProperty.call(RENDER_FIELDS,k))return;
   var copied=clone(value[k],ancestors);if(copied!==undefined)out[k]=copied;
  });
 }
 ancestors.delete(value);return out;
}
function clean(value) {
 var out={}; if(!value||typeof value!=='object'||Array.isArray(value))return out;
 Object.keys(value).slice(0,512).sort().forEach(function(id){
  var n=Number(value[id]);if(/^r[\w-]+$/.test(id)&&Number.isInteger(n)&&n>=1&&n<=MAX_COUNT)out[id]=n;
 });return out;
}
function header(staff,previous) {
 var out=Object.assign({},previous||{});
 ['clef','key','meter','title','stafflines','staffscale','scale','brace','bracket','connectBarLines','vocalfont'].forEach(function(k){
  if(staff[k]!==undefined)out[k]=clone(staff[k]);
 });return out;
}
// Written measures are collected independently of ABCJS's playback traversal.
// Keep original event references so the playback adapter can transfer timing
// occurrences back to the displayed score without editing the source.
function collect(tune) {
 var byKey=Object.create(null),voices=[];
 function voiceFor(si,vi){var key=si+':'+vi;if(!byKey[key]){
  byKey[key]={staffIndex:si,voiceIndex:vi,header:{},measures:[],boundaries:[],annotations:[],pending:[],active:null,clock:0,triplet:1,sounding:0};voices.push(byKey[key]);
 }return byKey[key];}
 function boundary(v){var n=v.measures.length;return v.boundaries[n]||(v.boundaries[n]={index:n,events:[],startEnding:null,endEnding:false});}
 function annotations(v,e,isBar){(e.chord||[]).forEach(function(c){
  if(c.position&&c.position!=='default'&&typeof c.name==='string')v.annotations.push({name:c.name,bar:v.measures.length,isBar:isBar,event:e,offset:v.active?v.active.duration:0});
 });}
 function flush(v){if(!v.active||v.active.duration<=EPS)return;
  v.active.index=v.measures.length;v.active.start=v.clock;v.clock+=v.active.duration;v.measures.push(v.active);v.active=null;
 }
 (tune.lines||[]).forEach(function(line){(line.staff||[]).forEach(function(staff,si){if(staff.isTabStaff)return;(staff.voices||[]).forEach(function(events,vi){
  var v=voiceFor(si,vi);v.header=header(staff,v.header);
  events.forEach(function(e){
   if(e.el_type==='bar'){
    if(v.active&&v.active.duration>EPS){v.active.events.push(e);flush(v);}else v.pending.push(e);
    var b=boundary(v);b.events.push(e);if(e.startEnding)b.startEnding=String(e.startEnding);if(e.endEnding)b.endEnding=true;
    annotations(v,e,true);return;
   }
   if(e.el_type==='key')v.header.key=clone(e);
   if(e.el_type==='clef')v.header.clef=clone(e);
   if(e.el_type==='meter')v.header.meter=clone(e);
   if(e.el_type==='part'&&typeof e.title==='string')v.annotations.push({name:e.title,bar:v.measures.length,isBar:false,event:e,offset:0,part:true});
   if(e.el_type!=='note'){
    (v.active?v.active.events:v.pending).push(e);return;
   }
   if(e.startTriplet)v.triplet=Number(e.tripletMultiplier)||1;
   var length=Number(e.duration)*v.triplet;
   if(!(length>0)){(v.active?v.active.events:v.pending).push(e);if(e.endTriplet)v.triplet=1;return;}
   if(!v.active)v.active={events:v.pending.splice(0),header:header(v.header),duration:0,sourceStart:Number.isFinite(e.startChar)?e.startChar:null};
   annotations(v,e,false);v.active.events.push(e);v.active.duration+=length;
   if(e.pitches&&e.pitches.length)v.sounding++;
   if(e.endTriplet)v.triplet=1;
  });
 });});});
 voices.forEach(function(v){flush(v);for(var i=0;i<=v.measures.length;i++)if(!v.boundaries[i])v.boundaries[i]={index:i,events:[],startEnding:null,endEnding:false};delete v.pending;delete v.active;delete v.triplet;});
 var selected=voices.findIndex(function(v){return v.sounding>0;});if(selected<0)selected=voices.findIndex(function(v){return v.measures.length>0;});
 return {voices:voices,selected:selected};
}
function countText(text) {
 var s=String(text||'').trim(),m;
 if((m=/^(?:(?:([A-Za-zÆØÅæøå][\wÆØÅæøå.-]*)\s*)?[x×]\s*(\d+))$/i.exec(s)))return {label:m[1]||'',count:Number(m[2])};
 if((m=/^(\d+)\s*(?:[x×]|gange|times)\.?$/i.exec(s)))return {label:'',count:Number(m[1])};
 return null;
}
function endingNumbers(text) {
 if(!text)return [];
 var values=[];String(text).replace(/\s/g,'').split(',').forEach(function(item){
  var m=/^(\d+)(?:-(\d+))?$/.exec(item);if(!m)return;
  var a=Number(m[1]),b=m[2]?Number(m[2]):a;
  if(a<1||b<a||b>MAX_COUNT)throw new Error('Volter skal bruge gennemspilning 1–'+MAX_COUNT+'.');
  for(var n=a;n<=b;n++)if(values.indexOf(n)<0)values.push(n);
 });return values.sort(function(a,b){return a-b;});
}
function flags(b,source) {
 var texts=b.events.map(function(e){return Number.isFinite(e.startChar)&&Number.isFinite(e.endChar)?source.slice(e.startChar,e.endChar):'';});
 var raw=texts.map(function(s){return (s.match(/^[|:\[\]]+/)||[''])[0];}).join('');
 var f={start:false,end:false,startCount:2,endCount:2,double:false};
 b.events.forEach(function(e){if(e.type==='bar_left_repeat'||e.type==='bar_dbl_repeat')f.start=true;if(e.type==='bar_right_repeat'||e.type==='bar_dbl_repeat')f.end=true;if(['bar_thin_thin','bar_thin_thick','bar_thick_thin'].indexOf(e.type)>=0)f.double=true;});
 // ABCJS splits ::| into two bar elements and discards the repeat count.
 // Read only actual bar tokens, never colons in annotations or music fields.
 if(/^\|:+$/.test(raw)){f.start=true;f.end=false;f.startCount=raw.length;}
 else if(/^:+\|$/.test(raw)){f.start=false;f.end=true;f.endCount=raw.length;}
 else if(raw==='::'||/^:+\|\|?:+$/.test(raw)){f.start=true;f.end=true;}
 f.raw=raw;return f;
}
function hash(text){var h=2166136261;for(var i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(36);}
function build(ABC,source,overrides) {
 // ABCJS reports source spans after normalizing line endings. Use the same
 // working representation when reading repeat-dot tokens; never rewrite ABC.
 source=String(source||'').replace(/\r\n?/g,'\n');var tune=ABC.parseOnly(source)[0],model=collect(tune||{}),voice=model.voices[model.selected];
 if(!voice)return {active:false,order:[],written:[],sections:[],warnings:[]};
 var written=voice.measures,bounds=voice.boundaries,n=written.length,sections=[],stack=[],skipClose=new Set(),endingStarts=new Set(),implicitStart=0,implicitEnding=null,warnings=[];
 bounds.forEach(function(b){b.flags=flags(b,source);});
 function finish(open,end){
  if(end<=open.start)return null;
  var sec={start:open.start,end:end,bodyEnd:end,endings:[],opening:open.boundary,closing:end,label:'',counts:[]};
  if(open.ending!==null&&open.ending!==undefined&&open.ending<end){
   sec.bodyEnd=open.ending;
   sec.endings.push({start:open.ending,end:end,numbers:endingNumbers(bounds[open.ending].startEnding)});
   var at=end;
   while(at<n&&bounds[at].startEnding){
    endingStarts.add(at);var next=at+1;
    // A second ending can lead straight into the next section's opening
     // repeat (e.g. Dalarne A -> B). That |: terminates THIS ending;
     // otherwise the whole following B section is swallowed by A's volta 2.
     while(next<n&&!bounds[next].endEnding&&!bounds[next].startEnding&&!bounds[next].flags.end&&!bounds[next].flags.start)next++;
    sec.endings.push({start:at,end:next,numbers:endingNumbers(bounds[at].startEnding)});
    if(bounds[next].flags.end)skipClose.add(next);
    at=next;if(!bounds[at].startEnding)break;
   }
   sec.end=at;
  }
  var startFlags=bounds[open.start].flags,endFlags=bounds[end].flags;
  if(startFlags.startCount>2)sec.counts.push(startFlags.startCount);
  if(endFlags.endCount>2)sec.counts.push(endFlags.endCount);
  sections.push(sec);return sec;
 }
 for(var i=0;i<=n;i++){
  var b=bounds[i],f=b.flags;
  if(f.end&&!skipClose.has(i)){
   var open=stack.length?stack.pop():{start:implicitStart,boundary:implicitStart,ending:implicitEnding};
   var sec=finish(open,i);if(sec)implicitStart=sec.end;implicitEnding=null;
  }
  if(f.start&&i<n)stack.push({start:i,boundary:i,ending:null});
  if(b.startEnding&&!endingStarts.has(i)){
   if(stack.length){if(stack[stack.length-1].ending===null)stack[stack.length-1].ending=i;}
   else if(!f.end)implicitEnding=i;
  }
  if(f.double&&!f.start&&!f.end&&!stack.length&&!b.endEnding)implicitStart=i;
 }
 // A trailing open repeat has no closing instruction; do not invent one.
 sections.sort(function(a,b){return a.start-b.start||b.end-a.end;});
 model.voices.forEach(function(v){v.annotations.forEach(function(a){
  var parsed=countText(a.name),isLabel=/^[A-Za-zÆØÅæøå]$/.test(a.name.trim());if(!parsed&&!isLabel)return;
  var candidates=sections.filter(function(s){return a.isBar?(s.start===a.bar||s.closing===a.bar||s.start<a.bar&&a.bar<s.end):(s.start<=a.bar&&a.bar<s.end);});
  candidates.sort(function(s,t){
   function rank(x){return a.isBar&&a.event.type==='bar_left_repeat'&&x.start===a.bar?-2:a.isBar&&a.event.type==='bar_right_repeat'&&x.closing===a.bar?-2:0;}
   return rank(s)-rank(t)||(s.end-s.start)-(t.end-t.start);
  });var s=candidates[0];
  if(!s){if(parsed)warnings.push('Gentagelsesangivelsen '+a.name+' står uden for et gentagelsesafsnit.');return;}
  if(parsed){if(parsed.count<1||parsed.count>MAX_COUNT)throw new Error('Gentagelser skal angive 1–'+MAX_COUNT+' gennemspilninger i alt.');s.counts.push(parsed.count);if(parsed.label)s.label=parsed.label;}
  else if(a.bar===s.start&&Math.abs(a.offset)<EPS&&!s.label)s.label=a.name.trim();
 });});
 overrides=clean(overrides);var active=false;
 sections.forEach(function(s,index){
  var distinct=s.counts.filter(function(c,j,a){return a.indexOf(c)===j;});
  if(distinct.length>1)throw new Error('Stemmerne angiver forskellige gentagelsesantal for samme afsnit.');
  var largest=s.endings.reduce(function(max,e){return Math.max(max,Math.max.apply(null,e.numbers.length?e.numbers:[0]));},2);
  s.notatedCount=distinct.length?distinct[0]:largest;
  // Identity follows the written rhythm/section rather than character offsets
  // or pitches, so transposition and formatting retain the user's choice.
  var identity=s.label+'|'+written.slice(s.start,s.end).map(function(m){return m.events.filter(function(e){return e.el_type==='note';}).map(function(e){return [e.duration,e.startTriplet||0,e.tripletMultiplier||1,e.endTriplet?1:0].join(',');}).join(' ');}).join('|');
  s.id='r'+s.start+'_'+s.end+'_'+hash(identity);s.count=Object.prototype.hasOwnProperty.call(overrides,s.id)?overrides[s.id]:s.notatedCount;
  s.label=s.label||'Afsnit '+(index+1);s.startBar=s.start;s.endBar=s.end-1;s.hasEndings=!!s.endings.length;
  if(distinct.length||largest>2||Object.prototype.hasOwnProperty.call(overrides,s.id)||sections.some(function(o){return o!==s&&o.start>=s.start&&o.end<=s.end;}))active=true;
  delete s.counts;
 });
 var order=[];
 function push(i){order.push(i);if(order.length>MAX_BARS)throw new Error('Gentagelserne giver for mange takter at afspille.');}
 function range(start,end,skip,depth){
  if(depth>16)throw new Error('Gentagelsesstrukturen er for dyb.');
  for(var at=start;at<end;){
   var nested=sections.find(function(s){return s!==skip&&s.start===at&&s.end<=end;});
   if(nested){play(nested,depth+1);at=nested.end;}else push(at++);
  }
 }
 function play(s,depth){
  for(var pass=1;pass<=s.count;pass++){
   range(s.start,s.bodyEnd,s,depth);
   if(s.endings.length){
    var simple=s.endings.length===2&&s.endings[0].numbers.join(',')==='1'&&s.endings[1].numbers.join(',')==='2';
    var ending=simple?s.endings[pass===s.count?1:0]:s.endings.find(function(e){return e.numbers.indexOf(pass)>=0;});
    if(ending)range(ending.start,ending.end,s,depth);
   }
  }
 }
 range(0,n,null,0);
 return {active:active,order:order,written:written.map(function(m){return {start:m.start,duration:m.duration,sourceStart:m.sourceStart};}),sections:sections,warnings:warnings,voiceKey:{staffIndex:voice.staffIndex,voiceIndex:voice.voiceIndex}};
}
exports.collect=collect;exports.build=build;exports.clean=clean;exports.countText=countText;exports.MAX_COUNT=MAX_COUNT;
})();
