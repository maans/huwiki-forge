/* HUWiki MuseScore / MusicXML importer v0.1.5-beta.1 — original code; MIT license. */
/*\
module-type: library
\*/
(function(){
"use strict";
var DT={maxima:8,long:4,breve:2,whole:1,half:.5,quarter:.25,eighth:.125,'16th':.0625,'32nd':.03125,'64th':.015625,'128th':.0078125};
var CIRCLE="CGDAEBF", NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
var MAJOR={"-7":"Cb","-6":"Gb","-5":"Db","-4":"Ab","-3":"Eb","-2":"Bb","-1":"F","0":"C","1":"G","2":"D","3":"A","4":"E","5":"B","6":"F#","7":"C#"};
var MINOR={"-7":"Abm","-6":"Ebm","-5":"Bbm","-4":"Fm","-3":"Cm","-2":"Gm","-1":"Dm","0":"Am","1":"Em","2":"Bm","3":"F#m","4":"C#m","5":"G#m","6":"D#m","7":"A#m"};
var KEYSHARP="FCGDAEB",KEYFLAT="BEADGCF";
function el(n,k){if(!n)return null;for(var c=n.firstElementChild;c;c=c.nextElementSibling){if(c.localName===k)return c;}return null;}
function els(n,k){var a=[];if(!n)return a;for(var c=n.firstElementChild;c;c=c.nextElementSibling){if(c.localName===k)a.push(c);}return a;}
function xp(n,path){var a=path.split('/');for(var i=0;i<a.length;i++){n=el(n,a[i]);if(!n)return null;}return n;}
function tx(n,path,def){var v=path?xp(n,path):n;return v&&v.textContent!==null?v.textContent.trim():(def||"");}
function num(n,path,def){var v=Number(tx(n,path));return isFinite(v)&&tx(n,path)!==""?v:(def===undefined?null:def);}
function xml(raw){var p=new DOMParser().parseFromString(raw,"application/xml");var err=p.getElementsByTagName('parsererror');if(err.length)throw Error('XML kunne ikke læses: '+err[0].textContent.slice(0,160));return p.documentElement;}
function cleanTitle(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/[\r\n]+/g,' ').trim();}
// Keep renderer labels short. Stave IDs are technical identifiers, not
// instrument names: never append "system 1", "system 2" to V: name=...
function shortPrintedName(name, abbreviation){
 var whole=cleanTitle(name).replace(/\s*[·|–—-]\s*(?:system|staff|stave|nodesystem)\s*\d+\s*$/i,'').trim();
 var short=cleanTitle(abbreviation).replace(/\s*[·|–—-]\s*(?:system|staff|stave|nodesystem)\s*\d+\s*$/i,'').trim();
 if(!whole)return short.length>18?short.slice(0,17).trimEnd()+'…':short;
 if(whole.length<=18)return whole;
 if(short&&short.length<=18)return short;
 // No usable short name in source. Prefer a word boundary to a mid-word cut.
 var first=whole.slice(0,18);
 var cut=first.lastIndexOf(' ');
 if(cut>=9)first=first.slice(0,cut);
 return first.trimEnd()+'…';
}
function safeAbcLabel(s){return String(s||'').replace(/["\\\r\n]/g,'').trim();}

function tpc(p){if(p===null||!isFinite(p))return null;var f=p-14,letter=CIRCLE[((f%7)+7)%7];var pc=((7*f)%12+12)%12;var delta=((pc-NAT[letter]+18)%12)-6;if(delta<-2||delta>2)return null;return {letter:letter,acc:delta,pc:pc};}
function midiSpell(n,preferFlat){var pc=(n%12+12)%12;var sha=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];var fl=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];var s=(preferFlat?fl:sha)[pc];return {letter:s[0],acc:s.length>1?(s[1]==='b'?-1:1):0,pc:pc};}
function noteSpell(n,spelling,preferFlat){var s=spelling&&spelling.pc===((n%12+12)%12)?spelling:midiSpell(n,preferFlat);
  var x=n-(NAT[s.letter]+s.acc), oct=4+Math.floor((x-60)/12); // MIDI 60 = middle C
  var name=(oct>=5?s.letter.toLowerCase():s.letter);
  if(oct>=6)name+="'".repeat(Math.min(6,oct-5)); else if(oct<4)name+=",".repeat(Math.min(6,4-oct));
  return {letter:s.letter,acc:s.acc,name:name};
}
function keyMap(fifths){var m={},s=fifths>0?KEYSHARP:KEYFLAT;for(var i=0;i<Math.min(7,Math.abs(fifths));i++)m[s[i]]=fifths>0?1:-1;return m;}
function signatureKey(fifths,isMinor){return (isMinor?MINOR:MAJOR)[String(Math.max(-7,Math.min(7,fifths||0)))]||'C';}
function ratio(str,def){var a=String(str||'').split('/');if(a.length===2&&+a[1])return +a[0]/+a[1];return def===undefined?null:def;}
function meterFraction(str){
 var m=/^([0-9+]+)\/([0-9]+)$/.exec(String(str||'').trim());if(!m||!Number(m[2]))return null;
 return m[1].split('+').reduce(function(a,b){return a+Number(b);},0)/Number(m[2]);
}
function frac(x){if(!isFinite(x)||x<=0)return '1';for(var d=1;d<=256;d*=2){var n=Math.round(x*d);if(Math.abs(x-n/d)<.000001){if(d===1)return n===1?'':String(n);if(n===1)return d===2?'/':'/'+d;return n+'/'+d;}}
 return String(Math.round(x*1000)/1000);}
function rhythm(t,dots,duration){var f=DT[String(t||'').toLowerCase()]||.125;if(t==='measure'&&duration)f=ratio(duration,f);var factor=1;for(var i=0;i<Math.min(dots||0,4);i++)factor+=1/Math.pow(2,i+1);return f*factor;}
function markWarn(model,message){if(model.warnings.indexOf(message)<0)model.warnings.push(message);}
function harmony(root,extension){var r=tpc(root), name=r?r.letter+(r.acc<0?'b':r.acc>0?'#':''):'';var ext=String(extension||'').trim();var suff={'mi':'m','m':'m','min':'m','ma':'','M':'','maj':'','7':'7','dom':'7','dom7':'7','ma7':'maj7','maj7':'maj7','mi7':'m7','sus4':'sus4','dim':'dim','aug':'aug','*':''};return name+(suff[ext]!==undefined?suff[ext]:ext);}
function clef(c){
 c=(c||'').toUpperCase().replace(/\s/g,'');
 // MuseScore stores concert MIDI pitch; octave-clefs must preserve written register.
 if(c.indexOf('F8VB')===0)return 'bass-8';
 if(c.indexOf('F8VA')===0)return 'bass+8';
 if(c.indexOf('G8VB')===0)return 'treble-8';
 if(c.indexOf('G8VA')===0)return 'treble+8';
 if(c.indexOf('F')===0)return 'bass';
 if(c.indexOf('C')===0)return 'alto';
 if(c.indexOf('PERC')>=0)return 'perc';
 return 'treble';
}
function octaveWrittenOffset(clefName,format){
 if(format!=='mscx')return 0; // MusicXML pitch is already in the written register
 return /-8$/.test(clefName)?12:/\+8$/.test(clefName)?-12:0;
}
// Repeat barlines belong to the score, not just the staff that happened
// to carry MuseScore's startRepeat/endRepeat/Volta XML element.
function synchronizeScoreRepeats(model){
 var shared=[];
 model.staves.forEach(function(st){st.measures.forEach(function(m,i){
  var r=shared[i]||(shared[i]={startRepeat:false,endRepeat:false,endCount:null,endingStart:null});
  if(m.startRepeat)r.startRepeat=true;
  if(m.endRepeat)r.endRepeat=true;
  if(m.endCount!==null&&m.endCount!==undefined)r.endCount=Math.max(r.endCount||0,m.endCount);
  if(m.endingStart&&!r.endingStart)r.endingStart=m.endingStart;
  // Time signatures, key and tempo are score-level events too.
  m.voices.forEach(function(v){v.forEach(function(q){
   if((q.kind==='meter'||q.kind==='key'||q.kind==='tempo')&&r[q.kind]===undefined)r[q.kind]=q;
  });});
 });});
 model.staves.forEach(function(st){st.measures.forEach(function(m,i){
  var r=shared[i];if(!r)return;
  m.startRepeat=r.startRepeat;m.endRepeat=r.endRepeat;
  if(r.endCount!==null)m.endCount=r.endCount;
  if(r.endingStart)m.endingStart=r.endingStart;
  m.voices.forEach(function(v){
   ['tempo','key','meter'].forEach(function(kind){
    if(r[kind]&&!v.some(function(q){return q.kind===kind;}))v.unshift(Object.assign({},r[kind]));
   });
  });
 });});
 return model;
}
function measureWholeDuration(m,meter){
 var partial=meterFraction(m.len);
 if(partial>0)return partial;
 if(m.actualDuration>0)return m.actualDuration;
 return meterFraction(meter)||1;
}

function museVoice(v,measure,model){var out=[],beam=0,beamActive=false,tuplet=null,small=0,cursor=0;
 for(var n=v.firstElementChild;n;n=n.nextElementSibling){var tag=n.localName;
  if(tag==='Beam'){beam++;beamActive=true;continue;}
  if(tag==='Tuplet'){tuplet={actual:num(n,'actualNotes',3),normal:num(n,'normalNotes',2)}; if(tuplet.actual<2||tuplet.actual>9)markWarn(model,'En usædvanlig tuplet kræver manuel kontrol.'); continue;}
  if(tag==='endTuplet'){tuplet=null;continue;}
  if(tag==='TimeSig'){measure.meter=tx(n,'sigN','4')+'/'+tx(n,'sigD','4');out.push({kind:'meter',value:measure.meter});continue;}
  if(tag==='KeySig'){var fifth=num(n,'concertKey',num(n,'accidental',0));out.push({kind:'key',fifths:fifth});continue;}
  if(tag==='Clef'){out.push({kind:'clef',value:clef(tx(n,'concertClefType',tx(n,'subtype','G')))});continue;}
  if(tag==='Tempo'){var q=num(n,'tempo',null);if(q){var syms=els(xp(n,'text'),'sym').map(function(e){return e.textContent});var note=syms.some(function(s){return /Half/i.test(s);})?'1/2':syms.some(function(s){return /Eighth/i.test(s);})?'1/8':'1/4';var dotted=syms.some(function(s){return /AugmentationDot/i.test(s)});var nlen=note==='1/2'?.5:note==='1/8'?.125:.25;if(dotted){nlen*=1.5;note=note==='1/4'?'3/8':note==='1/8'?'3/16':'3/4';}out.push({kind:'tempo',value:note+'='+Math.round(q*60*.25/nlen)});}continue;}
  if(tag==='Harmony'){var t=el(n,'harmonyInfo')||n;var h=harmony(num(t,'root',null),tx(t,'name',''));var bass=num(t,'base',num(t,'bass',null));if(bass!==null&&bass>=0&&h)h+='/'+harmony(bass,'');
   if(h)out.push({kind:'harmony',value:h,at:cursor});continue;}
  if(tag==='RehearsalMark'){var txt=cleanTitle(tx(n,'text'));if(txt)out.push({kind:'part',value:txt});continue;}
  if(tag==='location'){
   var fractions=ratio(tx(n,'fractions'),null);
   if(fractions!==null)cursor+=fractions;
   else markWarn(model,'MuseScore-location/flyttede nodepositioner findes; kontrollér rytmer i preview.');continue;}
  if(tag==='Chord'||tag==='Rest'){
   var type=tx(n,'durationType','quarter'),dots=num(n,'dots',0),dur=rhythm(type,dots,tx(n,'duration',''));
   var isRest=tag==='Rest'; var ps=isRest?[]:els(n,'Note').map(function(x){return {pitch:num(x,'pitch',null),tpc:num(x,'tpc',null),tpc2:num(x,'tpc2',null),tie:els(x,'Spanner').some(function(y){return y.getAttribute('type')==='Tie'&&(!!el(y,'Tie')||!!el(y,'next'));})};}).filter(function(x){return x.pitch!==null;});
   var words=els(n,'Lyrics').map(function(x){return tx(x,'text')||tx(x,'syllabic');}).filter(Boolean);
   if(type==='measure'&&measure.len)dur=ratio(measure.len,dur);
   var rec={kind:isRest?'rest':'note',notes:ps,dur:dur,measureRest:isRest&&type==='measure',beam:!isRest&&beamActive&&dur<=.125?beam:-1,tuplet:tuplet?{actual:tuplet.actual,normal:tuplet.normal}:null,lyric:words[0]||null};
   if(rec.tuplet){rec.tupletStart=small===0;small++;if(small>=rec.tuplet.actual)small=0;}
   out.push(rec);cursor+=durationOf(rec,measure.meter||'4/4','mscx'); if(isRest||dur>.125)beamActive=false;
  }
 }
 return out;
}
function parseMuse(raw,filename){var root=xml(raw),score=root.localName==='Score'?root:el(root,'Score');if(!score)throw Error('Ikke en MuseScore MSCX-fil.');
 var model={format:'mscx',name:filename,version:tx(root,'programVersion'),title:'',composer:'',warnings:[],staves:[],totalMeasures:0};
 for(var a=0;a<els(score,'metaTag').length;a++){var t=els(score,'metaTag')[a];if(t.getAttribute('name')==='composer')model.composer=cleanTitle(t.textContent);if(t.getAttribute('name')==='workTitle')model.title=cleanTitle(t.textContent);}
 for(var b=0;b<els(score,'Staff').length;b++){var staff=els(score,'Staff')[b],vbox=el(staff,'VBox');if(vbox){for(var e=0;e<els(vbox,'Text').length;e++){var q=els(vbox,'Text')[e],sty=tx(q,'style').toLowerCase();if(sty==='title')model.title=cleanTitle(tx(q,'text'));if(sty==='composer')model.composer=cleanTitle(tx(q,'text'));}}
 }
 var parts=[],staffToPart={},ordinalPart={},ordinal=0;els(score,'Part').forEach(function(part,idx){var name=cleanTitle(tx(part,'trackName',tx(part,'Instrument/trackName',''))),shortName=cleanTitle(tx(part,'Instrument/shortName',''));var sts=els(part,'Staff');sts.forEach(function(s){var id=s.getAttribute('id'),datum={name:name,shortName:shortName,partId:'muse-part-'+idx,clef:clef(tx(s,'defaultClef','G'))};ordinal++;ordinalPart[String(ordinal)]=datum;if(id)staffToPart[id]=datum;});parts.push(name);});
 var scores=els(score,'Staff'); scores.forEach(function(s,idx){var id=s.getAttribute('id')||String(idx+1);var info=staffToPart[id]||ordinalPart[String(idx+1)]||{name:parts[idx]||'',shortName:'',partId:'unmapped-'+id,clef:'treble'};var staffMeter='4/4';var measures=els(s,'Measure').map(function(m,i){var result={index:i+1,meter:staffMeter,len:m.getAttribute('len')||'',startRepeat:!!el(m,'startRepeat'),endRepeat:!!el(m,'endRepeat'),endCount:num(m,'endRepeat',null),endingStart:null,voices:[]};
   Array.from(m.getElementsByTagName('Spanner')).forEach(function(sp){if(sp.getAttribute('type')==='Volta'){var v=tx(sp,'Volta/endings',tx(sp,'Volta/beginText',''));if(v)result.endingStart=String(v).replace(/[^0-9,\-]/g,'');}});
   var layers=els(m,'voice');if(!layers.length)layers=[m];
   layers.forEach(function(v){result.voices.push(museVoice(v,result,model));});staffMeter=result.meter;return result;});
  var staffFirstClef=null;for(var ci=0;ci<measures.length&&!staffFirstClef;ci++){for(var cj=0;cj<measures[ci].voices.length&&!staffFirstClef;cj++){var ce=measures[ci].voices[cj].find(function(e){return e.kind==='clef';});if(ce)staffFirstClef=ce.value;}}if(staffFirstClef)info.clef=staffFirstClef;
  var maxVoices=Math.max(1,measures.reduce(function(n,m){return Math.max(n,m.voices.length);},0));
  var voices=[];for(var v=0;v<maxVoices;v++){var count=measures.reduce(function(sum,m){return sum+(m.voices[v]||[]).filter(function(e){return e.kind==='note';}).length;},0);if(count||v===0||measures.some(m=>(m.voices[v]||[]).some(e=>e.kind==='harmony'||e.kind==='rest')))voices.push({id:id+':'+v,index:v,label:(info.name||('Stemme '+(idx+1)))+(maxVoices>1?' · stemme '+(v+1):''),count:count,clef:info.clef});}
  model.staves.push({id:id,name:info.name,shortName:info.shortName||'',partId:info.partId||'unmapped-'+id,clef:info.clef,measures:measures,voices:voices});model.totalMeasures=Math.max(model.totalMeasures,measures.length);
 });
 synchronizeScoreRepeats(model);
 if(!model.staves.length)throw Error('Filen indeholder ingen notesystemer.');
 if(!model.title)model.title=filename.replace(/\.(mscz|mscx)$/i,'').replace(/[-_]/g,' ');
 model.duplicate=findDuplicate(model);
 return model;
}
function parseMusicXML(raw,filename){var root=xml(raw);if(root.localName!=='score-partwise')throw Error('MusicXML score-partwise forventes (score-timewise er endnu ikke understøttet).');
 var model={format:'musicxml',name:filename,title:cleanTitle(tx(root,'work/work-title',tx(root,'movement-title','')))||filename.replace(/\.(xml|musicxml|mxl)$/i,''),composer:'',warnings:[],staves:[],totalMeasures:0};
 els(root,'identification').forEach(function(id){els(id,'creator').forEach(function(c){if(c.getAttribute('type')==='composer')model.composer=cleanTitle(c.textContent);});});
 var names={};var pl=el(root,'part-list');els(pl,'score-part').forEach(function(e){names[e.getAttribute('id')]={name:cleanTitle(tx(e,'part-name','')),shortName:cleanTitle(tx(e,'part-abbreviation',''))};});
 els(root,'part').forEach(function(part,idx){var id=part.getAttribute('id')||String(idx+1),clefName='treble',divisions=1,meter='4/4',key=0,transpose=0;var ms=els(part,'measure').map(function(m,i){var result={index:i+1,len:'',startRepeat:false,endRepeat:false,endCount:null,endingStart:null,voices:[],implicit:m.getAttribute('implicit')==='yes',actualDuration:null};var cursor=0,previousStart=0,items={},xmlBeamGroup={},xmlBeamCounter=0;var attributes=null, maxEnd=0;
  for(var n=m.firstElementChild;n;n=n.nextElementSibling){var tg=n.localName;
   if(tg==='attributes'){
    if(num(n,'divisions')!==null)divisions=num(n,'divisions');
    if(el(n,'transpose'))transpose=num(n,'transpose/chromatic',0)+12*num(n,'transpose/octave-change',0);
    if(el(n,'time'))meter=tx(n,'time/beats','4')+'/'+tx(n,'time/beat-type','4');
    if(el(n,'key'))key=num(n,'key/fifths',0);
    if(el(n,'clef'))clefName=({G:'treble',F:'bass',C:'alto',percussion:'perc'})[tx(n,'clef/sign')]||'treble';
    (items['1']||(items['1']=[])).push({when:cursor,kind:'meter',value:meter},{when:cursor,kind:'key',fifths:key},{when:cursor,kind:'clef',value:clefName});
   }else if(tg==='backup')cursor-=num(n,'duration',0);
   else if(tg==='forward')cursor+=num(n,'duration',0);
   else if(tg==='barline'){
    var rep=el(n,'repeat');if(rep){if(rep.getAttribute('direction')==='forward')result.startRepeat=true;else if(rep.getAttribute('direction')==='backward'){result.endRepeat=true;result.endCount=Number(rep.getAttribute('times'))||null;}}
    var end=el(n,'ending');if(end&&end.getAttribute('type')==='start')result.endingStart=(end.getAttribute('number')||'1').replace(/[^0-9,\-]/g,'');
   }else if(tg==='note'){
    var isChord=!!el(n,'chord'),v=tx(n,'voice','1'),d=num(n,'duration',0);var rest=!!el(n,'rest'),isGrace=!!el(n,'grace');
    var beamElements=els(n,'beam'),firstBeam=beamElements.find(function(x){return x.getAttribute('number')==='1';})||beamElements[0];
    var beamFlag=firstBeam?firstBeam.textContent.trim():'';
    if(beamFlag==='begin')xmlBeamGroup[v]=++xmlBeamCounter;
    if(beamFlag==='continue'||beamFlag==='end')xmlBeamGroup[v]=xmlBeamGroup[v]||++xmlBeamCounter;
    var beamId=(beamFlag==='begin'||beamFlag==='continue'||beamFlag==='end')?xmlBeamGroup[v]:-1;
    var entry={kind:rest?'rest':'note',notes:[],dur:d/(4*divisions),beam:beamId,lyric:tx(n,'lyric/text')||null,when:isChord?previousStart:cursor};
    if(beamFlag==='end')delete xmlBeamGroup[v];
    if(el(n,'time-modification')){entry.tuplet={actual:num(n,'time-modification/actual-notes',3),normal:num(n,'time-modification/normal-notes',2)};entry.tupletStart=els(xp(n,'notations'),'tuplet').some(function(z){return z.getAttribute('type')==='start';});}
    if(!rest){var p=el(n,'pitch');if(p){var step=tx(p,'step','C'),alter=num(p,'alter',0),oct=num(p,'octave',4),pitch=(oct+1)*12+NAT[step]+alter;
       var sp={letter:step,acc:alter,pc:(pitch%12+12)%12};entry.notes.push({pitch:pitch,spelling:sp,tie:els(n,'tie').some(function(z){return z.getAttribute('type')==='start';})});}else markWarn(model,'En unpitched/percussion-node er ikke oversat nøjagtigt.');}
    if(isChord){var found=(items[v]||[]).slice().reverse().find(function(x){return x.kind==='note'&&x.when===previousStart;});if(found){found.notes=found.notes.concat(entry.notes);}else (items[v]||(items[v]=[])).push(entry);}else{(items[v]||(items[v]=[])).push(entry);previousStart=cursor;if(!isGrace)cursor+=d;maxEnd=Math.max(maxEnd,cursor);}
   }else if(tg==='direction'){
    var s=el(n,'sound');var bpm=s?Number(s.getAttribute('tempo')):null; if(bpm){(items['1']||(items['1']=[])).push({when:cursor,kind:'tempo',value:'1/4='+Math.round(bpm)});}
    var txt=tx(n,'direction-type/rehearsal');if(txt)(items['1']||(items['1']=[])).push({when:cursor,kind:'part',value:txt});
   }else if(tg==='harmony'){
    var step=tx(n,'root/root-step',''),alt=num(n,'root/root-alter',0);var kind=tx(n,'kind','');var suff={minor:'m',major:'',dominant:'7',majorseventh:'maj7','major-seventh':'maj7','minor-seventh':'m7',diminished:'dim','half-diminished':'m7b5',augmented:'aug'};var v=step+(alt<0?'b':alt>0?'#':'')+(suff[kind]!==undefined?suff[kind]:kind);
    var bass=tx(n,'bass/bass-step',''),alter=num(n,'bass/bass-alter',0);
    if(bass)v+='/'+bass+(alter<0?'b':alter>0?'#':'');
    if(kind==='none')v='N.C.';
    var placement=cursor+num(n,'offset',0);
    if(step||kind==='none')(items['1']||(items['1']=[])).push({when:placement,at:placement/(4*divisions),kind:'harmony',value:v});
   }
  }
  result.transpose=transpose;result.actualDuration=maxEnd/(4*divisions);
  Object.keys(items).sort().forEach(function(v){var source=items[v].sort(function(a,b){return a.when-b.when;});var list=[],time=0;source.forEach(function(q){if((q.kind==='note'||q.kind==='rest')&&q.when>time+1e-6){list.push({kind:'rest',dur:(q.when-time)/(4*divisions),notes:[],beam:-1});time=q.when;}
      list.push(q);if(q.kind==='note'||q.kind==='rest')time=Math.max(time,q.when+q.dur*4*divisions);
    }); result.voices[Number(v)-1>=0?Number(v)-1:0]=list;});
  return result;});
  var maxVoices=Math.max(1,ms.reduce(function(n,m){return Math.max(n,m.voices.length);},0)),voices=[];
  for(var k=0;k<maxVoices;k++){var count=ms.reduce(function(sum,m){return sum+(m.voices[k]||[]).filter(function(e){return e.kind==='note';}).length;},0);if(count||k===0)voices.push({id:id+':'+k,index:k, label:((names[id]||{}).name||'Part '+id)+(maxVoices>1?' · stemme '+(k+1):''),count:count,clef:clefName});}
  model.staves.push({id:id,name:(names[id]||{}).name||'',shortName:(names[id]||{}).shortName||'',partId:'musicxml-part-'+id,clef:clefName,measures:ms,voices:voices});model.totalMeasures=Math.max(model.totalMeasures,ms.length);
 });
 synchronizeScoreRepeats(model);
 if(!model.staves.length)throw Error('Ingen stemmer fundet i MusicXML.');model.duplicate=findDuplicate(model);return model;
}
function melodyFingerprint(staff,from,to){var out=[];for(var i=from;i<to;i++){var m=staff.measures[i];if(!m)return null;var v=m.voices[0]||[];var seq=[];v.forEach(function(e){if(e.kind==='note'&&e.notes.length)seq.push({p:e.notes[0].pitch,d:Math.round(e.dur*1024)});else if(e.kind==='rest')seq.push({p:null,d:Math.round(e.dur*1024)});});out.push(seq);}return out;}
function findDuplicate(model){for(var k=0;k<model.staves.length;k++){var s=model.staves[k],n=s.measures.length;if(n<8||n%2)continue;var len=n/2,a=melodyFingerprint(s,0,len),b=melodyFingerprint(s,len,n);var comparisons=0,align=0,shifts={};
 for(var j=0;j<len;j++){if(a[j].length!==b[j].length)continue;var ok=true,delta=null;for(var i=0;i<a[j].length;i++){if(a[j][i].d!==b[j][i].d||((a[j][i].p===null)!==(b[j][i].p===null))){ok=false;break;}if(a[j][i].p!==null){var d=b[j][i].p-a[j][i].p;if(delta===null)delta=d;else if(delta!==d){ok=false;break;}}}
  comparisons++;if(ok){align++;if(delta!==null)shifts[delta]=(shifts[delta]||0)+1;}}
 var best=Object.keys(shifts).sort(function(x,y){return shifts[y]-shifts[x];})[0];var conf=align/Math.max(len,1);if(conf>=.75&&best!==undefined&&Number(best)!==0&&shifts[best]>=len*.65)return {start:len+1,length:len,shift:Number(best),confidence:Math.round(conf*100),staff:s.id};
 }return null;}
// Pickup-aware line planning: a short measure does not consume a full measure slot.
// A true one-off 2/4 in 4/4 is treated like an anacrusis for layout purposes.
// Alternating 7/8 and 9/8 meters are not misclassified as pickups.
function measureMeters(st,starting){
 var signatures=[],current=starting||'4/4';
 st.measures.forEach(function(m){m.voices.some(function(v){var found=v.find(function(e){return e.kind==='meter';});if(found){current=found.value;return true;}return false;});signatures.push(current);});
 return signatures;
}
function measureDuration(m,voiceIndex,meter,format){
 var declared=meterFraction(m.len);if(declared>0)return declared;
 if(m.actualDuration>0)return m.actualDuration;
 var evs=m.voices[voiceIndex]||m.voices[0]||[];
 if(evs.some(function(q){return q.kind==='rest'&&q.measureRest;}))return meterFraction(meter);
 var total=0,notes=0;
 evs.forEach(function(q){if(q.kind==='note'||q.kind==='rest'){
  var f=format==='mscx'&&q.tuplet?q.tuplet.normal/q.tuplet.actual:1;
  total+=q.dur*f;notes++;
 }});
 return notes?total:null;
}
function isPartialLayoutMeasure(st,idx,voiceIndex,meters,format){
 var m=st.measures[idx],meter=meters[idx],expected=meterFraction(meter),actual=measureDuration(m,voiceIndex,meter,format);
 if(!expected)return false;
 if(actual!==null&&actual>0&&actual<expected-0.0005)return true;
 // Explicit short meter sandwiched between longer common-meter bars.
 var before=idx>0?meters[idx-1]:null,after=idx+1<meters.length?meters[idx+1]:null;
 var base=(before&&after&&before===after)?before:(idx===0&&after?after:null);
 if(!base||!(meterFraction(base)>expected+0.0005))return false;
 // If the smaller meter recurs in the local context, this is a real meter pattern.
 var start=Math.max(0,idx-4),end=Math.min(meters.length-1,idx+4),hits=0;
 for(var j=start;j<=end;j++)if(meters[j]===meter)hits++;
 return hits===1;
}
function planLineBreaks(st,voiceIndex,start,end,format,defaultMeter,barsPerLine){
 var meters=measureMeters(st,defaultMeter),breaks=[],full=0,partial=0;
 for(var n=start;n<=end;n++){
  var shortened=isPartialLayoutMeasure(st,n-1,voiceIndex,meters,format);
  if(shortened)partial++;else full++;
  // Bound pathological runs of short measures, but let the first one add a fifth bar.
  if(full>=barsPerLine||partial>=barsPerLine){breaks.push(n);full=0;partial=0;}
 }
 if(breaks[breaks.length-1]!==end)breaks.push(end);
 return breaks;
}
function inferredBeams(evs,meter,format){
 var v=meterFraction(meter)||1,parts=String(meter||'4/4').split('/'),n=Number(parts[0]),d=Number(parts[1]);
 var groups;
 if(d===8&&(n===5||n===7||n===10||n===11))groups=n===5?[2,3]:n===7?[2,2,3]:n===10?[2,3,2,3]:[2,2,3,2,2];
 else if(d===8&&n%3===0)groups=Array(n/3).fill(3);
 else if(d===2)groups=Array(n).fill(4);
 else if(d===8)groups=Array(n).fill(2);
 else if(d===4)groups=Array(n).fill(2);
 else groups=[Math.round(v*8)];
 var bounds=[],sum=0;groups.forEach(function(g){sum+=g/8;bounds.push(sum);});
 var p=0,group=0,result=[];
 evs.forEach(function(q){
  if(q.kind==='note'||q.kind==='rest'){
   while(group<bounds.length-1&&p>=bounds[group]-0.00001)group++;
   var real=q.dur*(format==='mscx'&&q.tuplet?q.tuplet.normal/q.tuplet.actual:1);
   // Prefer explicit MusicXML/MuseScore beam groups; otherwise infer from beats.
   var beam=(q.kind==='note'&&q.dur<=.125)?(q.beam>=0?'explicit-'+q.beam:'auto-'+group):-1;
   result.push(beam);p+=real;
  }else result.push(-1);
 });
 return result;
}
var HARMONY_EPS=0.000001;
function durationOf(item,meter,format){
 if(item.measureRest)return item.dur>.125?item.dur:meterFraction(meter)||1;
 return item.dur*(format==='mscx'&&item.tuplet?item.tuplet.normal/item.tuplet.actual:1);
}
function transposeSymbol(symbol,semitones,flat){
 if(!semitones||semitones%12===0)return symbol;
 return symbol.replace(/(^|\/)([A-G])([b#♭♯]*)/g,function(_,slash,root,acc){
  var pitch=NAT[root]+Array.from(acc).reduce(function(n,a){return n+(/[b♭]/.test(a)?-1:1);},0);
  var spell=midiSpell(pitch+semitones,flat);
  return slash+spell.letter+(spell.acc<0?'b':spell.acc>0?'#':'');
 });
}
// Merge in musical time before selecting staves. Coincident copies, including
// written transpositions, have one carrier. Prefer that carrier's spelling.
function collectHarmonies(model,carrier){
 var bars=Array.from({length:model.totalMeasures},function(){return new Map();});
 var ordered=[carrier.st].concat(model.staves.filter(st=>st!==carrier.st));
 ordered.forEach(function(st){
  var meters=measureMeters(st,'4/4');
  st.measures.forEach(function(m,b){
   var priority=st===carrier.st?carrier.v.index:0;
   var voices=[m.voices[priority]].concat(m.voices.filter((_,i)=>i!==priority));
   voices.forEach(function(events){
    var pos=0;
    (events||[]).forEach(function(e){
     if(e.kind==='harmony'){
      var at=Number.isFinite(e.at)?e.at:pos,tick=Math.round(at/HARMONY_EPS);
      if(!bars[b].has(tick))bars[b].set(tick,{at:at,value:e.value,transpose:m.transpose||0});
     }else if(e.kind==='note'||e.kind==='rest')pos+=durationOf(e,meters[b],model.format);
    });
   });
  });
 });
 return bars.map(function(bar){return Array.from(bar.values()).sort((a,b)=>a.at-b.at);});
}
function projectHarmonies(input,marks,meter,format,total){
 var events=input.filter(e=>e.kind!=='harmony'),out=[],i=0,time=0;
 if(!marks.length)return events;
 function emit(at){
  while(i<marks.length&&marks[i].at<=at+HARMONY_EPS)out.push({kind:'harmony',value:marks[i++].value});
 }
 function place(e){
  var length=durationOf(e,meter,format),end=time+length;
  emit(time);
  if(i>=marks.length||marks[i].at>=end-HARMONY_EPS){out.push(e);time=end;return;}
  // A harmony can change under a held melody note. Split it at the change
  // and tie the pitches through; split silences without introducing attacks.
  var begin=time,first=true;
  while(begin<end-HARMONY_EPS){
   var cut=i<marks.length?Math.min(end,marks[i].at):end;
   var fragment=Object.assign({},e,{measureRest:false,dur:(cut-begin)*e.dur/length,
    lyric:first?e.lyric:null,tupletStart:first&&e.tupletStart,continuation:!first});
   if(e.measureRest)fragment.dur=cut-begin;
   if(cut<end-HARMONY_EPS&&e.kind==='note')fragment.notes=e.notes.map(n=>Object.assign({},n,{tie:true}));
   out.push(fragment);first=false;begin=cut;if(begin<end-HARMONY_EPS)emit(begin);
  }
  time=end;
 }
 events.forEach(function(e){if(e.kind==='note'||e.kind==='rest')place(e);else out.push(e);});
 if(i<marks.length&&time<total-HARMONY_EPS)place({kind:'rest',invisible:true,notes:[],dur:total-time,beam:-1});
 // Splitting one member creates one more ABC tuplet slot, at the original ratio.
 var groupStart=null,count=0;
 function finish(){if(groupStart)groupStart.tupletCount=count;groupStart=null;count=0;}
 out.forEach(function(e,index){
  if(e.kind!=='note'&&e.kind!=='rest')return;
  if(e.tupletStart||!e.tuplet)finish();
  if(e.tupletStart){groupStart=Object.assign({},e);out[index]=groupStart;}
  if(groupStart&&e.tuplet)count++;
 });finish();return out;
}
function renderABC(model,selected,start,end,options){options=options||{};start=Math.max(1,Math.floor(start||1));end=Math.min(model.totalMeasures,Math.floor(end||model.totalMeasures));if(end<start)throw Error('Taktintervallet er ugyldigt.');if(!selected||!selected.length)throw Error('Vælg mindst én stemme.');
 var voices=[];selected.forEach(function(id){model.staves.forEach(function(st){st.voices.forEach(function(v){if(v.id===id)voices.push({st:st,v:v});});});});if(!voices.length)throw Error('Ingen kendte stemmer valgt.');
 var globalFirst={meter:'4/4',fifths:0,tempo:'1/4=100'};
 model.staves.forEach(function(st){st.measures.slice(0,Math.max(start,1)).forEach(function(m){(m.voices[0]||[]).forEach(function(q){if(q.kind==='meter')globalFirst.meter=q.value;if(q.kind==='key')globalFirst.fifths=q.fifths;if(q.kind==='tempo')globalFirst.tempo=q.value;});});});
 var allHarmony=collectHarmonies(model,voices[0]);
 // The selected MusicXML part is written in its own key and register.
 var carrier=voices[0].st;
 carrier.measures.slice(0,start).forEach(m=>m.voices.forEach(v=>v.forEach(e=>{if(e.kind==='key')globalFirst.fifths=e.fifths;})));
 var firstMark=allHarmony.slice(0,end).flat().find(Boolean);
 var firstChord=firstMark&&transposeSymbol(firstMark.value,firstMark.transpose-(carrier.measures[start-1]?.transpose||0),globalFirst.fifths<0);
 var minor=!!(firstChord&&firstChord===signatureKey(globalFirst.fifths,true));
 if(!minor&&/\b(minor|moll|molltonart)\b/i.test(model.title))minor=true;
 if(typeof options.minor==='boolean')minor=options.minor;
 var header=['X:1','T:'+cleanTitle(options.title||model.title||'Ny melodi')];if(model.composer)header.push('C:'+model.composer);header.push('M:'+globalFirst.meter,'L:1/8','Q:'+globalFirst.tempo);
 if(voices.length>1){
  var namedParts={};
  voices.forEach(function(o,i){
   var label='',key=o.st.partId||o.st.id;
   if(!namedParts[key]){label=shortPrintedName(o.st.name,o.st.shortName);namedParts[key]=true;}
   header.push('V:'+(i+1)+(label?' name="'+safeAbcLabel(label)+'"':'')+' clef='+o.v.clef);
  });
 }header.push('K:'+signatureKey(globalFirst.fifths,minor)+(voices.length===1&&voices[0].v.clef!=='treble'?' clef='+voices[0].v.clef:''));
 var notesCount=0, warnings=model.warnings.slice(); if(model.duplicate&&end>=model.duplicate.start)warnings.push('Kontrollér transponeret dublet fra takt '+model.duplicate.start+' ('+(model.duplicate.shift>0?'+':'')+model.duplicate.shift+' halvtoner).');
 voices.forEach(function(vo){if(vo.v.clef==='perc')warnings.push('Slagtøjsnotation (perc) kan ikke gengives fuldt ud i denne version.');});
 var outputs=[],barLimit=Math.max(1,Math.min(12,Math.round(Number(options.barsPerLine)||4)));
 var lineBreaks=planLineBreaks(voices[0].st,voices[0].v.index,start,end,model.format,globalFirst.meter,barLimit);
 voices.forEach(function(vo,vi){var accKey=keyMap(globalFirst.fifths),currentKey=globalFirst.fifths,curMeter=globalFirst.meter, curTempo=globalFirst.tempo,lines=[],line='',beatCount=0, lyricLines=[],lastEnding='',breakCursor=0;
  for(var bar=start;bar<=end;bar++){
    var measure=vo.st.measures[bar-1];if(!measure)continue;var evs=measure.voices[vo.v.index]||[], local={},pieces=[],prev=null,lyrics=[],beamGroups=inferredBeams(evs,curMeter,model.format),beamPrev=null;
    var meterEvent=evs.find(q=>q.kind==='meter'),barMeter=meterEvent?meterEvent.value:curMeter;
    if(vi===0){
     var harmony=(allHarmony[bar-1]||[]).slice();
     if(bar===start&&start>1&&(!harmony.length||harmony[0].at>HARMONY_EPS)){
      var earlier=allHarmony.slice(0,start-1).flat().pop();
      if(earlier)harmony.unshift(Object.assign({},earlier,{at:0}));
     }
     harmony=harmony.map(h=>({at:h.at,value:transposeSymbol(h.value,h.transpose-(measure.transpose||0),currentKey<0)}));
     evs=projectHarmonies(evs,harmony,barMeter,model.format,measureWholeDuration(measure,barMeter));
    }else evs=evs.filter(e=>e.kind!=='harmony');
    beamGroups=inferredBeams(evs,barMeter,model.format);
    var partMark=evs.find(e=>e.kind==='part');
    if(!partMark&&vi===0)partMark=model.staves.flatMap(st=>(st.measures[bar-1]?.voices||[]).flat()).find(e=>e?.kind==='part');if(partMark&&vi===0)pieces.push('[P:'+String(partMark.value).replace(/[^\p{L}\p{N} _-]/gu,'').trim()+']');
    if(measure.endingStart&&lastEnding!==measure.endingStart)pieces.push('['+measure.endingStart);lastEnding=measure.endingStart||'';
    // The shared repeat at the previous measure end is rendered only once.
    if(measure.startRepeat&&(bar===start||!vo.st.measures[bar-2]))pieces.push('|:');
    for(var e=0;e<evs.length;e++){var item=evs[e];
      if(item.kind==='meter'){if(item.value!==curMeter||bar===start&&currentKey!==globalFirst.fifths)pieces.push('[M:'+item.value+']');curMeter=item.value;beamGroups=inferredBeams(evs,curMeter,model.format);continue;}
      if(item.kind==='key'){if(item.fifths!==currentKey){currentKey=item.fifths;accKey=keyMap(currentKey);pieces.push('[K:'+signatureKey(currentKey,minor)+']');}continue;}
      if(item.kind==='tempo'){if(item.value!==curTempo){pieces.push('[Q:'+item.value+']');curTempo=item.value;}continue;}
      if(item.kind==='clef'){/* Clef in V: header; in-line changes handled below in future */ continue;}
      if(item.kind==='part'){continue;}
      if(item.kind==='harmony'){var h=String(item.value).replace(/"/g,'');pieces.push('"'+h+'"');continue;}
      if(item.kind==='note'||item.kind==='rest'){
         var txt='',dur=item.dur;if(!isFinite(dur)||dur<=0){warnings.push('Varighed mangler i takt '+bar);continue;}
         if(model.format==='musicxml'&&item.tuplet)dur*=item.tuplet.actual/item.tuplet.normal;
         if(item.kind==='rest'){txt=item.invisible?'x':'z';if(item.measureRest&&(!isFinite(dur)||dur<=.125))dur=ratio(curMeter,1);}else if(item.notes.length){var nn=[];item.notes.forEach(function(p){var visualPitch=p.pitch+octaveWrittenOffset(vo.v.clef,model.format);var s=noteSpell(visualPitch,p.spelling||tpc(p.tpc),currentKey<0);var expected=Object.prototype.hasOwnProperty.call(local,s.name)?local[s.name]:(accKey[s.letter]||0);var prefix='';if(s.acc!==expected){prefix=s.acc===-2?'__':s.acc===-1?'_':s.acc===0?'=':s.acc===1?'^':'^^';local[s.name]=s.acc;}nn.push(prefix+s.name+((p.tie&&item.notes.length>1)?'-':''));});txt=nn.length===1?nn[0]:'['+nn.join('')+']';if(nn.length===1&&item.notes[0].tie)txt+=frac(dur*8)+'-';else txt+=frac(dur*8);if(!item.continuation)notesCount+=nn.length;}else txt='z';
         if(item.kind==='rest')txt+=frac(dur*8);
         if(item.tuplet&&item.tupletStart){var tp=item.tuplet; txt='('+tp.actual+':'+tp.normal+':'+(item.tupletCount||tp.actual)+txt;}
         var thisBeam=beamGroups[e],join=prev&&beamPrev!==-1&&thisBeam!==-1&&beamPrev===thisBeam&&item.kind==='note'&&prev.kind==='note'&&item.dur<=.125&&prev.dur<=.125;
         pieces.push({music:txt,join:!!join});
         prev=item;beamPrev=thisBeam;lyrics.push(item.lyric||'*');
      }
    }
    // An absent layer must still consume the measure's duration. Without this,
    // ABCJS starts later bars early and different voices cease to be synchronized.
    // x = invisible rest; it does not clutter the printed staff.
    var targetDuration=measureWholeDuration(measure,curMeter),usedDuration=0;
    evs.forEach(function(q){if(q.kind==='note'||q.kind==='rest'){
      usedDuration+=durationOf(q,curMeter,model.format);
    }});
    if(usedDuration<targetDuration-0.00001){
      var missing=targetDuration-usedDuration;
      pieces.push({music:'x'+frac(missing*8),join:false});
    }
    var sb='',lastMusic=false;
    pieces.forEach(function(p){
     if(typeof p==='string'){
      if(p.slice(0,2)==='|:')sb+=(sb?' ':'')+p;
      else if(p[0]==='"')sb+=p;
      else if(p[0]==='[')sb+=p;
      else sb+=(sb?' ':'')+p;
      if(p[0]!=='"')lastMusic=false;
     }else{
      // ABC beaming is controlled solely by whitespace. Never use the last character
      // of a note (notably a chord's closing bracket) to decide whether to insert it.
      if(sb&&lastMusic&&!p.join)sb+=' ';
      if(sb&&!lastMusic&&!/[:\[" ]$/.test(sb))sb+=' ';
      sb+=p.music;lastMusic=true;
     }
    });
    // One shared boundary. :| followed by |: is :: in standard ABC, not two bars.
    var following=bar<end?vo.st.measures[bar]:null;
    var openNext=!!(following&&following.startRepeat);
    var boundary=measure.endRepeat?(openNext?'::':':|'):(openNext?'|:':'|');
    sb+=(sb?' ':'')+boundary;
    if(measure.endCount&&measure.endCount>2)warnings.push('Gentagelse x'+measure.endCount+' i takt '+bar+' skal kontrolleres (ABC afspiller normalt to gange).');
    if(line)line+=' ';line+=sb;
    if(bar===lineBreaks[breakCursor]){lines.push(line);line='';breakCursor++;}
   }
   if(line)lines.push(line);
   // The line breaks are source-authoritative. ABCJS preview must not enable wrap.
   // Layout ranges include abbreviated measures at no cost to the 4-full-bar count.
   /*ABC-LAYOUT*/
  outputs.push((voices.length>1?'V:'+(vi+1)+'\n':'')+lines.join('\n'));
 });
 return {abc:header.join('\n')+'\n'+outputs.join('\n')+'\n',warnings:warnings,notes:notesCount,voices:voices.length,range:[start,end],barsPerLine:barLimit,lineBreaks:lineBreaks};
}
exports.parseMuse=parseMuse;exports.parseMusicXML=parseMusicXML;exports.renderABC=renderABC;exports.findDuplicate=findDuplicate;
exports.decodeScore=function(raw,name){var ext=(name.split('.').pop()||'').toLowerCase();if(ext==='musicxml'||ext==='xml')return parseMusicXML(raw,name);return parseMuse(raw,name);};
})();
