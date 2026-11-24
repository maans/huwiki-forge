/*\
title: $:/plugins/huwiki/abc/accompaniment.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var notation=require('$:/plugins/huwiki/abc/notation.js');
var jazz=require('$:/plugins/huwiki/abc/jazz-engine.js');
var balkan7=require('$:/plugins/huwiki/abc/balkan7.js');
var meterMap=require('$:/plugins/huwiki/abc/meter-map.js');
var meterArranger=require('$:/plugins/huwiki/abc/meter-arranger.js');
var voiceRouting=require('$:/plugins/huwiki/abc/voice-routing.js');
var repeatPlanModule=require('$:/plugins/huwiki/abc/repeat-plan.js');
var repeatPlayback=require('$:/plugins/huwiki/abc/repeat-playback.js');
var styles={
 pop:{label:'Pop',bass:'pulse',chords:'offbeat',drums:'pop',bassInstrument:33,chordInstrument:24},
 calm:{label:'Rolig',bass:'root',chords:'arpeggio',drums:'shaker',bassInstrument:32,chordInstrument:0},
 waltz:{label:'Vals',bass:'root',chords:'afterbeat',drums:'waltz',bassInstrument:32,chordInstrument:21},
 swing:{label:'Jazz · Swing',bass:'walking',chords:'jazzcomp',drums:'swing',bassInstrument:32,chordInstrument:0},
 bossa:{label:'Brasilien · Bossa nova (2 takter)',bass:'bossa',chords:'bossacomp',drums:'bossa',bassInstrument:32,chordInstrument:24},
 samba:{label:'Brasilien · Samba',bass:'bossa',chords:'bossacomp',drums:'samba',bassInstrument:32,chordInstrument:24},
 'bossa-samba':{label:'Brasilien · A bossa / B samba',bass:'bossa',chords:'bossacomp',drums:'samba',bassInstrument:32,chordInstrument:24},
 jazzballad:{label:'Jazz · Ballad',bass:'root',chords:'balladcomp',drums:'brush',bassInstrument:32,chordInstrument:0},
 jazzwaltz:{label:'Jazz · Vals',bass:'walking',chords:'jazzcomp',drums:'jazzwaltz',bassInstrument:32,chordInstrument:0},
 'india-adi':{label:'Indien · Ādi-tāla · traditionel (melodi, drone og mridangam)',bass:'off',chords:'off',drums:'mridangam',bassInstrument:32,chordInstrument:104},
 'india-adi-energi':{label:'Indien · fusion · vestlig bas og akkorder (valgfrit)',bass:'pulse',chords:'beats',drums:'tabla',bassInstrument:32,chordInstrument:104},
 'india-rupaka':{label:'Indien · Rūpaka-tāla · traditionel (melodi, drone og mridangam)',bass:'off',chords:'off',drums:'mridangam',bassInstrument:32,chordInstrument:104}
};
Object.keys(balkan7.styles).forEach(function(key){var b=balkan7.styles[key];styles[key]={label:b.label,bass:key==='in-misrachapu'?'off':'balkan',chords:key==='in-misrachapu'?'off':'balkan',drums:key==='in-misrachapu'?'mridangam':'balkan',bassInstrument:b.bassInstrument,chordInstrument:b.chordInstrument};});
Object.assign(styles,meterArranger.styles);
var basses=[['written','Følg becifringernes bas · vekselbas'],['off','Ingen bas'],['root','Grundtone ved taktstart'],['alternate','Vekselbas · to anslag'],['pulse','Vekselbas · puls'],['walking','Walking bass · næste akkord'],['bossa','Bossa · synkoperet bas'],['balkan','Balkan · asymmetrisk bas'],['nordic','Nordisk · vekselbas / gangrytme']];
var chords=[['off','Ingen akkorder'],['beats','På slagene'],['offbeat','Efterslag'],['afterbeat','Efter basslaget'],['arpeggio','Brudte akkorder'],['jazzcomp','Jazz · comp på/efter slag'],['bossacomp','Bossa · synkoper'],['balladcomp','Ballad · luftige voicings'],['balkan','Balkan · gruppestyret akkompagnement'],['nordic','Nordisk · efterslag efter stilen']];
var drums=[['tapan','Kopanitsa · tapan (GM: dyb tromme og pind)'],['off','Intet slagtøj'],['pop','Let pop · stortromme, lilletromme og hi-hat'],['waltz','Vals · stortromme og hi-hat'],['shaker','Shaker'],['percussion','Congas og shaker'],['tabla','Tabla · GM-tilnærmelse'],['mridangam','Mridangam · GM-tilnærmelse'],['swing','Swing · ride og hi-hat'],['bossa','Bossa · surdo, rim og shaker'],['samba','Samba · surdo, tamborim, pandeiro, agogô'],['brush','Jazzballad · børster (MIDI)'],['jazzwaltz','Jazzvals · ride'],['balkan','Balkan · tapan / daouli / darbuka'],['nordic','Nordisk · let cajón (GM-tilnærmelse)']];
var melodyInstruments=[['source','Som noteret i ABC'],[0,'Klaver'],[4,'Elklaver'],[21,'Harmonika'],[24,'Lut · nylon-guitar (GM)'],[25,'Mandolin · stål-guitar (GM)'],[46,'Harpe · orkesterharpe (GM)'],[105,'Banjo'],[64,'Sopransaxofon'],[66,'Tenorsaxofon'],[72,'Sopranino · piccolo-tilnærmelse (GM)'],[26,'Jazzguitar'],[56,'Trompet'],[65,'Altsaxofon'],[66,'Tenorsaxofon'],[71,'Klarinet'],[73,'Fløjte'],[40,'Violin'],[104,'Sitar · GM']];
var bassInstruments=[[32,'Kontrabas'],[33,'Elbas · finger'],[34,'Elbas · plekter'],[35,'Båndløs bas'],[38,'Synthbas'],[0,'Klaver']];
var chordInstruments=[[0,'Klaver'],[4,'Elklaver'],[24,'Guitar · nylon'],[25,'Mandolin · stål-guitar (GM)'],[105,'Banjo'],[46,'Harpe (GM)'],[26,'Jazzguitar'],[21,'Harmonika'],[48,'Strygere']];
// General MIDI percussion notes. Changing the timbre does not alter score or tempo.
var metronomeSounds={
 wood:{label:'Træblok · høj/lav',accent:76,beat:77},
 click:{label:'Tørt klik · claves/kantslag',accent:75,beat:37},
 hihat:{label:'Hi-hat · åben/lukket',accent:46,beat:42},
 bell:{label:'Klokke · cowbell/ride',accent:56,beat:53},
 shaker:{label:'Shaker · maracas/cabasa',accent:70,beat:69}
};
function meterProfile(source){return meterArranger.profile(source);}
function compatibleStyles(source){
 var profile=meterProfile(source),m=profile.first,newStyles=meterArranger.compatible(profile);
 if(!m||!profile.parsed.every(meterArranger.supported))return [];
 if(profile.changes)return newStyles;
 if(m.num===7&&m.den===8)return balkan7.compatible(source).concat(['meter-follow']);
 if(m.explicit||m.num===11&&m.den===8||m.num===9&&m.den===8)return newStyles;
 var k=m.num+'/'+m.den,legacy=[];
 if(k==='4/4')legacy=['pop','calm','swing','bossa','samba','bossa-samba','jazzballad','india-adi','india-adi-energi'];
 else if(k==='3/4')legacy=['waltz','jazzwaltz','calm','india-rupaka'];
 else if(k==='2/4')legacy=['pop','calm'];
 else if(k==='6/8'||k==='12/8')legacy=['calm'];
 return legacy.concat(newStyles);
}
function metronomePattern(meta,config,live){
 var c=clean(config),sounds=metronomeSounds[c.metronomeSound]||metronomeSounds.wood;
 var group=meta.meter.num===7&&meta.meter.den===8?balkan7.groupFor(c.style==='auto'?balkan7.autoStyle(meta.source,meta.fields):c.style,meta.source):null;
 var accents=group?group.reduce(function(a,g){a.push(a.length?a[a.length-1]+group[a.length-1]:0);return a;},[]):null;
 var step=meta.meter.den===8?3:2,pattern='',pitches=[],velocities=[];
 for(var tick=0;tick<meta.n;tick++){
  if(accents?!accents.includes(tick):tick%step!==0){pattern+='z';continue;}
  var emphasis=c.metronomeAccent&&tick===0;
  pattern+='d';pitches.push(emphasis?sounds.accent:sounds.beat);
  // In live mode loudness is handled by the mixer's GainNode. Keep accent audible.
  var secondary=accents&&tick!==0;velocities.push(live?(emphasis?116:secondary?88:95):Math.min(127,Math.max(0,Math.round(c.metronomeVolume*(emphasis?1.16:secondary?.80:c.metronomeAccent?0.95:1)))));
 }
 return pattern+' '+pitches.join(' ')+' '+velocities.join(' ');
}

function member(v,list,fallback){return list.some(function(p){return String(p[0])===String(v);})?v:fallback;}
var backingNames=['bass','chords','drums','metronome','drone'];
var backingBuses={bassVolume:'bass',chordVolume:'chords',drumVolume:'drums',metronomeVolume:'metronome',droneVolume:'drone'};
function backingModes(c){
 c=c||{};var saved=c.backingModes&&typeof c.backingModes==='object'&&!Array.isArray(c.backingModes)?c.backingModes:{};
 var result={};backingNames.forEach(function(key){
  var value=saved[key];
  result[key]=value==='mute'||value==='solo'||value==='normal'?value:'normal';
 });
 // Existing flags are still the public API for activating the practice tools.
 // Missing modes from older scores are migrated without turning either on.
 if(c.metronome!==true)result.metronome='mute';
 else if(result.metronome==='mute')result.metronome='normal';
 if(c.droneEnabled!==true)result.drone='mute';
 else if(result.drone==='mute')result.drone='normal';
 return result;
}
function clean(c){c=c||{};if(styles[c.style])c=Object.assign({},styles[c.style],c);return {reverb:volume(c.reverb,0),backingModes:backingModes(c),droneEnabled:c.droneEnabled===true,droneVolume:volume(c.droneVolume,42),droneMode:choice(c.droneMode,['sa','sa-pa','sa-ma'],'sa-pa'),droneTimbre:choice(c.droneTimbre,['tanpura','shruti'],'shruti'),droneSa:choice(String(c.droneSa===undefined?'auto':c.droneSa),['auto','0','1','2','3','4','5','6','7','8','9','10','11'],'auto'),enabled:c.enabled===true,metronome:c.metronome===true,metronomeVolume:volume(c.metronomeVolume,60),metronomeSound:metronomeSounds[c.metronomeSound]?c.metronomeSound:'wood',metronomeAccent:c.metronomeAccent!==false,style:(styles[c.style]||c.style==='custom'||c.style==='auto')?c.style:'auto',bass:member(c.bass,basses,'alternate'),chords:member(c.chords,chords,'offbeat'),drums:member(c.drums,drums,'pop'),melodyInstrument:member(c.melodyInstrument,melodyInstruments,'source'),bassInstrument:Number(member(c.bassInstrument,bassInstruments,33)),chordInstrument:Number(member(c.chordInstrument,chordInstruments,24)),melodyVolume:volume(c.melodyVolume,100),bassVolume:volume(c.bassVolume,72),chordVolume:volume(c.chordVolume,48),drumVolume:volume(c.drumVolume,48),variation:volume(c.variation,35),seed:Number.isFinite(Number(c.seed))?Math.floor(Number(c.seed)):1,form:choice(c.form,['auto','AABA','ABAC','AAB','AB','BLUES','FREE','none'],'auto'),feel:choice(c.feel,['form','two','four'],'form'),bassSource:voiceRouting.bassSource(c.bassSource),voiceSettings:voiceRouting.clean(c.voiceSettings),repeatCounts:repeatPlanModule.clean(c.repeatCounts)};}
function choice(v,choices,fallback){return choices.includes(v)?v:fallback;}
function volume(n,d){return Number.isFinite(Number(n))?Math.max(0,Math.min(100,Math.round(Number(n)))):d;}
function read(fields){try{return clean(JSON.parse(fields['abc-accompaniment']||'null'));}catch(_){return clean();}}
function isIndianSource(source,fields){
 var metadata=(String(source||'').match(/^(?:T|R):[^\r\n]*/gmi)||[]).join(' ')+' '+String(fields&&fields['abc-rhythm']||'')+' '+String(fields&&fields['abc-style']||'')+' '+String(fields&&fields['abc-genre']||'');
 return /\b(?:raga|raag|konnakol|solkattu|mohanam|yaman|bhairav|indien|indian|carnatic|hindustani|adi\s*tala|rupaka|mi[sś]ra|c[āa]pu)\b/i.test(metadata);
}
function isNordicSource(source,fields){
 var metadata=(String(source||'').match(/^(?:T|R):[^\r\n]*/gmi)||[]).join(' ')+' '+String(fields&&fields['abc-genre']||'');
 return /\b(?:polka|polkett|brudmarch|brudmarsch|bruremarsj|brudemarsj|nordisk|svensk|swedish|danse)\b/i.test(metadata);
}
function isTraditionalIndian(style){return style==='india-adi'||style==='india-rupaka'||style==='in-misrachapu';}
function resolve(config,source,fields){var c=clean(config);if(meterArranger.styles[c.style]){var preset=meterArranger.styles[c.style];['bass','chords','drums','bassInstrument','chordInstrument'].forEach(function(k){if(!config||config[k]===undefined)c[k]=preset[k];});}if(c.style==='auto'){
 var profile=meterProfile(source),m=profile.first;
 var choice=(isNordicSource(source,fields)&&m&&([2,4].indexOf(m.den)>=0))?meterArranger.autoStyle(source,fields):
    (profile.changes||m&&(m.num===9&&m.den===8||m.num===11&&m.den===8||m.explicit&&!(m.num===7&&m.den===8)))?meterArranger.autoStyle(source,fields):
    (m&&m.num===7&&m.den===8)?balkan7.autoStyle(source,fields):
    isIndianSource(source,fields)&&(m&&m.num===4&&m.den===4)?'india-adi':
    isIndianSource(source,fields)&&(m&&m.num===3&&m.den===4)?'india-rupaka':
    jazz.inferStyle(source,fields);
 var p=styles[choice]||styles.pop;
 c=Object.assign({},c,{bass:p.bass,chords:p.chords,drums:p.drums,bassInstrument:p.bassInstrument,chordInstrument:p.chordInstrument});
 c.detectedStyle=choice;
 }if(isTraditionalIndian(c.style==='auto'?c.detectedStyle:c.style)){c.bass='off';c.chords='off';}return c;}
// Affect only parsed playback data; the editable/exported ABC remains unchanged.
var managed=/^(?:gchord.*|bassprog|bassvol|chordprog|chordvol|drum|drumon|drumoff|drumbars)$/;
function strip(t){if(t.formatting&&t.formatting.midi)Object.keys(t.formatting.midi).forEach(function(k){if(managed.test(k))delete t.formatting.midi[k];});(t.lines||[]).forEach(function(l){(l.staff||[]).forEach(function(s){(s.voices||[]).forEach(function(v){for(var i=v.length-1;i>=0;i--)if(v[i].el_type==='midi'&&managed.test(v[i].cmd))v.splice(i,1);});});});return t;}
function info(t,source,fields){
 var m=t.getMeterFraction(),profile=meterProfile(source),tempoChange=false;
 (t.lines||[]).forEach(function(l){(l.staff||[]).forEach(function(s){(s.voices||[]).forEach(function(v){v.forEach(function(e){if(e.el_type==='tempo')tempoChange=true;});});});});
 var supported=profile.parsed.every(meterArranger.supported)&&!tempoChange;
 var reason=tempoChange?'Akkompagnement ved temposkift er endnu ikke understøttet.':supported?'':'Akkompagnement i denne taktart er under udvikling.';
 return {meter:m,n:m.num*8/m.den,source:source,fields:fields||{},profile:profile,supported:supported,message:reason};
}
function patterns(meta,c){var n=meta.n,compound=meta.meter.den===8,step=compound?3:2,second=compound?3:(n===6?4:Math.floor(n/4)*2);
 var bass=Array(n).fill('z'),chord=Array(n).fill('z');
 for(var i=0;i<n;i++){
  if(c.bass==='root'&&i===0||c.bass==='alternate'&&(i===0||i===second)||c.bass==='pulse'&&i%step===0||c.bass==='walking'&&i%1===0||c.bass==='bossa'&&(i===0||i===3||i===4||i===n-1))bass[i]='f';
  if(c.chords==='beats'&&i%step===0||c.chords==='offbeat'&&i%step===step-1||c.chords==='afterbeat'&&i>0&&i%step===0)chord[i]='c';
  if(c.chords==='arpeggio')chord[i]='GHIH'[i%4];
  if(c.chords==='jazzcomp'&&(n===6?(i===2||i===4):(i===2||i===5||i===n-1)))chord[i]='c';
  if(c.chords==='bossacomp'&&(i===0||i===3||i===6))chord[i]='c';
  if(c.chords==='balladcomp'&&(i===0||i===second))chord[i]='c';
 }
 var layers=[];
 function layer(pitch,when,vel){var hits=[],vols=[],str='';for(var j=0;j<n;j++){if(when(j)){str+='d';hits.push(pitch);vols.push(Math.round(c.drumVolume*(vel?vel(j):1)));}else str+='z';}if(hits.length)layers.push(str+' '+hits.join(' ')+' '+vols.join(' '));}
 if(c.drums==='pop'||c.drums==='waltz'){layer(36,function(i){return i===0||(c.drums==='pop'&&i===second);});if(c.drums==='pop')layer(38,function(i){return i%4===2;});layer(42,function(i){return c.drums==='pop'||i%step===0;},function(i){return i%step===0?.7:.45;});}
 if(c.drums==='shaker'||c.drums==='percussion')layer(70,function(){return true;},function(i){return i%step===0?.85:.5;});
 if(c.drums==='tabla'){
  // General MIDI hand-drum approximation to tabla bols (not acoustic tabla).
  layer(64,function(i){return i===0||i===second;},function(i){return i===0?.95:.72;});
  layer(60,function(i){return i>0&&i%step===0;},function(){return .60;});
  layer(61,function(i){return i%step===step-1;},function(){return .32;});
 }
 if(c.drums==='mridangam'){
  // Pedagogic Carnatic tala pulse: alternate bass and treble hand-drums, no western kit.
  layer(64,function(i){return i===0||(n>5&&i===second);},function(i){return i===0?.90:.66;});
  layer(63,function(i){return i%step===0&&i>0;},function(){return .62;});
  layer(62,function(i){return i%step===step-1;},function(){return .35;});
 }
 if(c.drums==='percussion'){layer(64,function(i){return i===0||i===second;});layer(63,function(i){return i===step-1||i===n-1;},function(){return .8;});}
 if(c.drums==='swing'||c.drums==='jazzwaltz'||c.drums==='brush'){
  layer(51,function(i){return i%2===0||(c.drums==='swing'&&(i===3||i===n-1));},function(i){return i%2===0?.60:.28;});
  layer(44,function(i){return i===2||(n>=8&&i===6);},function(){return .7;});
  if(c.drums==='brush')layer(38,function(i){return i===2||i===6;},function(){return .18;});
 }
 if(c.drums==='bossa'){
  layer(36,function(i){return i===0||i===4;},function(){return .56;});
  layer(37,function(i){return i===3||i===6;},function(){return .60;});
  layer(42,function(i){return i%2===0||i===3||i===7;},function(){return .32;});
 }
 return {bass:bass.join(''),chord:chord.join(''),drums:layers};}
// Instrument clefs and capo alter only engraving. Copy the concert audio's
// timing/pitch annotations onto the corresponding displayed notes for seeking.
function concertAudio(tune,raw,options){
 var audio=raw.setUpAudio(options),played=repeatPlanModule.collect(raw),shown=repeatPlanModule.collect(tune);
 var timing=['currentTrackWholeNotes','currentTrackMilliseconds','midiPitches','midiGraceNotePitches'];
 function notes(voice){return voice.measures.flatMap(function(m){return m.events.filter(function(e){return e.el_type==='note';});});}
 shown.voices.forEach(function(voice,index){
  if(!played.voices[index])return;
  var from=notes(played.voices[index]),to=notes(voice);if(from.length!==to.length)return;
  to.forEach(function(event,i){timing.forEach(function(key){delete event[key];if(from[i][key]!==undefined)event[key]=from[i][key];});});
 });
 return audio;
}
function prepare(ABC,tune,source,config,live,fields){
 var c=resolve(config,source,fields);if(live){c.enabled=true;c.bassVolume=c.chordVolume=c.drumVolume=100;}var repeatPlan=repeatPlanModule.build(ABC,source,c.repeatCounts),raw=strip(ABC.parseOnly(source)[0]);repeatPlayback.install(raw,repeatPlan);var meta=info(raw,source,fields),rawBase=raw.setUpAudio({chordsOff:true}),baseCount=rawBase.tracks.length,backings=[];
 // Notated voices remain independent of the accompaniment switch. A selected
 // score bass replaces generated bass; its original timing and pitches survive.
 var melodySource=raw;
 if(tune._huwabcLowerTreble){
  melodySource=notation.lowerTreble(strip(ABC.parseOnly(source)[0]));
  repeatPlayback.install(melodySource,repeatPlan);
 }
 var missingBass=c.bassSource.indexOf('voice:')===0&&voiceRouting.selectedBass(c,baseCount)<0;
 if(c.bassSource!=='style')c.bass='off';
 var styleName=c.style==='auto'?c.detectedStyle:c.style;
 var useTimeline=meta.profile.changes||!!meterArranger.styles[styleName]||meta.profile.first&&meta.profile.first.explicit&&!(meta.meter.num===7&&meta.meter.den===8);
 var timeline=null,arrangedBars=[];
 if(meta.supported&&useTimeline){
  try{timeline=meterMap.build(ABC,raw,source,rawBase);}
  catch(error){meta.supported=false;meta.message=error.message;}
 }
 var pat=meta.supported&&!useTimeline?patterns(meta,c):null;
 var barCount=timeline?timeline.bars.length:jazz.calcBars(rawBase.tracks.flat(),meta.meter),analysis=jazz.form(source,barCount,meta.meter,c.form);
 var jazzStyle=['swing','bossa','samba','bossa-samba','jazzballad','jazzwaltz'].includes(styleName)?styleName:null;
 var isBrazil=['bossa','samba','bossa-samba'].includes(styleName);var grooveConfig=Object.assign({},c,{feel:styleName==='swing'||styleName==='jazzballad'?c.feel:'four'});
 function generated(options){var t=strip(ABC.parseOnly(source)[0]);repeatPlayback.install(t,repeatPlan);return t.setUpAudio(options).tracks.slice(baseCount).flatMap(function(tr){return tr.filter(function(e){return e.cmd==='note'&&e.volume>0;}).map(function(e){return Object.assign({},e,{pitch:Number(e.pitch),volume:Number(e.volume)});});});}
 function add(name,instrument,notes){if(notes.length)backings.push({name:name,instrument:instrument,notes:notes});}
 // The chord-symbol bass mode also works with existing fixed-meter styles.
 // Replace only their bass; retain their established comping and percussion.
 var writtenBass=null;
 if(meta.supported&&!useTimeline&&c.enabled&&c.bass==='written'){
  try{
   var writtenTimeline=meterMap.build(ABC,raw,source,rawBase);
   writtenBass=meterArranger.generate(styleName,writtenTimeline,analysis,Object.assign({},c,{chords:'off',drums:'off',metronome:false}),source,fields,
    generated({gchord:'G'.repeat(meta.n),chordprog:c.bassInstrument,chordvol:100,bassvol:0}),[],false,metronomeSounds).bass;
  }catch(error){meta.supported=false;meta.message=error.message;}
 }
 if(meta.supported&&useTimeline){
  var allowed=meterArranger.compatible(meta.profile);
  if(meterArranger.styles[styleName]&&allowed.indexOf(styleName)<0)styleName='meter-follow';
  var maxTicks=Math.max.apply(null,timeline.bars.map(function(b){return Math.ceil(b.meter.num*8/b.meter.den);}));
  // G requests the chord root, not ABCJS's automatically alternating f bass.
  // This avoids applying a second fifth, and preserves transposition/slash bass.
  var parts=meterArranger.generate(styleName,timeline,analysis,c,source,fields,
   c.enabled&&c.bass!=='off'?generated({gchord:'G'.repeat(maxTicks),chordprog:c.bassInstrument,chordvol:100,bassvol:0}):[],
   c.enabled&&c.chords!=='off'?generated({gchord:'c'.repeat(maxTicks),chordprog:c.chordInstrument,chordvol:100,bassvol:0}):[],live,metronomeSounds);
  add('Bas',c.bassInstrument,parts.bass);add('Akkorder',c.chordInstrument,jazz.voiceLead(parts.chords));add('Slagtøj',128,parts.drums);add('Metronom',128,parts.metronome);arrangedBars=parts.bars;
 }else if(c.enabled&&meta.supported){
  if(writtenBass)add('Bas',c.bassInstrument,writtenBass);
  if(meta.meter.num===7&&meta.meter.den===8){
   var balkanStyle=balkan7.styles[styleName]?styleName:balkan7.autoStyle(source,fields);
   var balkanParts=balkan7.generate(balkanStyle,analysis,grooveConfig,source,
    c.bass!=='off'&&c.bass!=='written'&&c.bassVolume?generated({gchord:'f'.repeat(7),bassprog:c.bassInstrument,bassvol:c.bassVolume,chordvol:0}):[],
    c.chords!=='off'&&c.chordVolume?generated({gchord:'c'.repeat(7),chordprog:c.chordInstrument,chordvol:c.chordVolume,bassvol:0}):[]);
   if(c.bass!=='off'&&c.bass!=='written'&&c.bassVolume)add('Bas',c.bassInstrument,balkanParts.bass);
   if(c.chords!=='off'&&c.chordVolume)add('Akkorder',c.chordInstrument,jazz.voiceLead(balkanParts.chords));
   if(c.drums!=='off'&&c.drumVolume)add('Slagtøj',128,balkanParts.drums);
  } else {
  if(c.bass!=='off'&&c.bass!=='written'&&c.bassVolume){var bassNotes=generated({gchord:pat.bass,bassprog:c.bassInstrument,bassvol:c.bassVolume,chordvol:0});
   if(c.bass==='walking')bassNotes=jazz.walk(bassNotes,meta.meter,analysis,grooveConfig);
   if(isBrazil&&c.bass==='bossa')bassNotes=jazz.brazilBass(generated({gchord:'f'.repeat(meta.n),bassprog:c.bassInstrument,bassvol:c.bassVolume,chordvol:0}),meta.meter,analysis,grooveConfig,styleName);
   add('Bas',c.bassInstrument,bassNotes);}
  if(c.chords!=='off'&&c.chordVolume){
   var activeComp=c.chords==='jazzcomp'||c.chords==='bossacomp'||c.chords==='balladcomp';
   var compStyle=c.chords==='bossacomp'?'bossa':c.chords==='balladcomp'?'jazzballad':styleName==='jazzwaltz'?'jazzwaltz':'swing';
   var chordNotes=generated({gchord:activeComp?'c'.repeat(meta.n):pat.chord,chordprog:c.chordInstrument,chordvol:c.chordVolume,bassvol:0});
   if(isBrazil&&c.chords==='bossacomp')chordNotes=jazz.brazilComp(chordNotes,meta.meter,analysis,grooveConfig,styleName,source);
   else if(activeComp)chordNotes=jazz.comp(chordNotes,meta.meter,analysis,grooveConfig,compStyle,source);
   if(c.chords!=='arpeggio')chordNotes=jazz.voiceLead(chordNotes);
   if(compStyle==='swing'&&activeComp)chordNotes.forEach(function(e){if(Math.abs((e.start*8)%2-1)<.010)e.start+=.038;});
   add('Akkorder',c.chordInstrument,chordNotes);}
  if(c.drums!=='off'&&c.drumVolume){var drumNotes=pat.drums.flatMap(function(p){return generated({chordsOff:true,drum:p});}).sort(function(a,b){return a.start-b.start||a.pitch-b.pitch;});
    if(isBrazil)drumNotes=jazz.brazilDrums(meta.meter,analysis,grooveConfig,styleName,source);
    else if(jazzStyle)drumNotes=jazz.drumDynamics(drumNotes,meta.meter,analysis,grooveConfig,source);
    add('Slagtøj',128,drumNotes);}
  }
 }
 if(meta.supported&&!useTimeline&&(live||c.metronome)){
  add('Metronom',128,generated({chordsOff:true,drum:metronomePattern(meta,c,live)}));
 }
 // Restore only our previous arrangement decorator. The repeat decorator is
 // independently idempotent and must remain the underlying timing authority.
 if(tune._huwabcArrangementBase)tune.setUpAudio=tune._huwabcArrangementBase;
 strip(tune);repeatPlayback.install(tune,repeatPlan);var original=tune.setUpAudio;
 Object.defineProperty(tune,'_huwabcArrangementBase',{value:original,writable:true,configurable:true});
 delete tune.noteTimings;
 tune.setUpAudio=function(options){var audioOptions=Object.assign({},options,{chordsOff:true,drum:'',drumIntro:0}),sequence=tune._huwabcNotationProjected||tune.visualTranspose?concertAudio(tune,melodySource,audioOptions):original.call(tune,audioOptions),base=voiceRouting.apply(sequence,c,live),used=new Set([9]);base.tracks.forEach(function(tr){tr.forEach(function(e){if(e.cmd==='program')used.add(e.channel);});});
  backings.forEach(function(part){var channel=9;if(part.instrument!==128){for(channel=0;channel<16&&used.has(channel);channel++);if(channel===16)throw new Error('Der er ikke flere ledige MIDI-kanaler til akkompagnement.');used.add(channel);}var track=[{cmd:'text',type:'name',text:part.name},{cmd:'program',channel:channel,instrument:part.instrument}].concat(part.notes.map(function(n){return Object.assign({},n,{instrument:part.instrument});}));track.huwabcPart={Bas:'bassVolume',Akkorder:'chordVolume','Slagtøj':'drumVolume',Metronom:'metronomeVolume'}[part.name];base.tracks.push(track);});return base;};
 return {tune:tune,message:[missingBass?'Den valgte basstemme findes ikke længere. Vælg bassens kilde igen.':'',c.enabled&&styleName==='ungrouped-11'?'Vælg en 11/8-stil eller angiv grupperingen i M:-feltet.':(c.enabled||c.metronome)?meta.message:''].filter(Boolean).join(' '),parts:backings,form:analysis,detectedStyle:styleName,timeline:timeline,bars:arrangedBars,warnings:(timeline?timeline.warnings:[]).concat(repeatPlan.warnings),repeatPlan:repeatPlan};
}
// Independent WebAudio drone. It never reads chord symbols and therefore holds Sa
// through chord and form changes. This is a synthesized timbre, not a tanpura sample.
var currentDrone=null;
var saNames=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
var droneModes=[['sa','Sa'],['sa-pa','Sa – Pa'],['sa-ma','Sa – Ma']];
var droneTimbres=[['tanpura','Tanpura · plukkede strenge (syntetisk)'],['shruti','Shruti box · bælginstrument (syntetisk)']];
var droneRoots=[['auto','Følg K: (ABC-toneart)']].concat(saNames.map(function(x,i){return [String(i),x];}));
function droneTonic(source,setting){
 if(setting!=='auto'&&/^(?:[0-9]|1[01])$/.test(String(setting)))return Number(setting);
 var key=(String(source||'').match(/^K:\s*([A-Ga-g])([#b]?)/m)||[]);
 if(!key[1])return 0;
 var value={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[key[1].toUpperCase()];
 return (value+(key[2]==='#'?1:key[2]==='b'?-1:0)+12)%12;
}
function createDrone(getConfig,getSource){
 var audio=null,master=null,droneRoom=null,interval=null,playing=false,signature='',pluckIndex=0,activeOscillators=[];
 function config(){return clean(getConfig());}
 function tuning(c){
  var tonic=48+droneTonic(getSource(),c.droneSa),pitches=c.droneMode==='sa-pa'?[tonic+7,tonic,tonic,tonic-12]:c.droneMode==='sa-ma'?[tonic+5,tonic,tonic,tonic-12]:[tonic,tonic,tonic-12,tonic];
  return {tonic:tonic,pitches:pitches};
 }
 function freq(midi){return 440*Math.pow(2,(midi-69)/12);}
 function signatureFor(c){return [droneTonic(getSource(),c.droneSa),c.droneMode,c.droneTimbre].join('|');}
 function schedulePluck(){
  if(!playing||!audio||!master)return;
  var c=config(),notes=tuning(c).pitches,at=audio.currentTime+.02,pitch=notes[pluckIndex++%notes.length];
  var envelope=audio.createGain(),filter=audio.createBiquadFilter();
  filter.type='lowpass';filter.frequency.setValueAtTime(2900,at);filter.frequency.exponentialRampToValueAtTime(1050,at+3.7);
  envelope.gain.setValueAtTime(.0001,at);envelope.gain.exponentialRampToValueAtTime(.22,at+.016);
  envelope.gain.exponentialRampToValueAtTime(.0001,at+3.9);
  filter.connect(envelope);envelope.connect(master);
  // Plucked-string harmonics and a softly buzzing jawari-like attack; synthetic approximation.
  [[1,'sawtooth',.36,-1.4],[1,'triangle',.56,1.4],[2,'sine',.30,-1.0],[3,'sine',.20,.8],[5,'sine',.11,0]].forEach(function(part){
   var osc=audio.createOscillator(),g=audio.createGain();osc.type=part[1];osc.frequency.value=freq(pitch)*part[0];osc.detune.value=part[3];g.gain.value=part[2];
   osc.connect(g);g.connect(filter);osc.start(at);osc.stop(at+3.92);
  });
 }
 function makeShruti(c){
  var pitches=tuning(c).pitches.filter(function(p,i,a){return a.indexOf(p)===i;});
  pitches.forEach(function(pitch,i){
   // Reed-like odd/even harmonics, plus gentle cyclic bellows pressure on each voice.
   var g=audio.createGain(),filter=audio.createBiquadFilter();
   g.gain.value=i===0?.068:.048;
   filter.type='lowpass';filter.frequency.value=1800;filter.Q.value=.55;filter.connect(g);g.connect(master);
   [[1,'sawtooth',.58,-1],[1,'triangle',.38,1.1],[2,'sine',.17,0]].forEach(function(part){
    var osc=audio.createOscillator(),vg=audio.createGain();osc.type=part[1];osc.frequency.value=freq(pitch)*part[0];osc.detune.value=part[3];vg.gain.value=part[2];
    osc.connect(vg);vg.connect(filter);osc.start();activeOscillators.push(osc);
   });
   var pump=audio.createOscillator(),amount=audio.createGain();pump.type='sine';pump.frequency.value=.29+i*.018;amount.gain.value=.014;
   pump.connect(amount);amount.connect(g.gain);pump.start();activeOscillators.push(pump);
  });
 }
 function stop(){
  if(interval!==null){clearInterval(interval);interval=null;}
  playing=false;signature='';if(droneRoom){droneRoom.dispose();droneRoom=null;}
  var old=audio,g=master;audio=null;master=null;
  if(currentDrone===api)currentDrone=null;
  if(old){
   var when=old.currentTime;
   try{if(g){g.gain.cancelScheduledValues(when);g.gain.setTargetAtTime(0,when,.025);}}catch(_ignore){}
   activeOscillators.forEach(function(osc){try{osc.stop(when+.12);}catch(_ignore){}});
   setTimeout(function(){try{old.close().catch(function(){});}catch(_ignore){}},200);
  }
  activeOscillators=[];
 }
 function start(){
  var c=config(),Audio=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);
  if(!Audio)return false;
  if(playing){configure();return true;}
  if(currentDrone&&currentDrone!==api)currentDrone.stop();
  try{
   audio=new Audio();master=audio.createGain();master.gain.value=Math.max(0,channelGain('droneVolume',c))*.34;
   master.connect(audio.destination);droneRoom=createRoom(audio);droneRoom.update([master],c.reverb/100);playing=true;signature=signatureFor(c);pluckIndex=0;currentDrone=api;
   if(c.droneTimbre==='shruti')makeShruti(c);else{schedulePluck();interval=setInterval(schedulePluck,1050);}
   if(audio.resume)audio.resume().catch(function(){});
   return true;
  }catch(_error){stop();return false;}
 }
 function configure(){
  if(!playing)return;
  var c=config();
  if(!c.droneEnabled){stop();return;}
  if(signature!==signatureFor(c)){stop();start();return;}
  if(master&&audio){droneRoom.update([master],c.reverb/100);try{master.gain.setTargetAtTime(channelGain('droneVolume',c)*.34,audio.currentTime,.02);}catch(_ignore){}}
 }
 var api={start:start,stop:stop,configure:configure,isPlaying:function(){return playing;},destroy:stop};
 return api;
}

function E(tag,text){var e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function mount(parent,fields,onChange,opened,viewState,onLive){
 viewState=viewState||{};
 if(currentDrone)currentDrone.stop(); // Switching to a new score must not leave the former drone sounding.
 var c=read(fields),drone=createDrone(function(){return c;},function(){return fields['abc-source']||'';}),box=E('section');box.className='huwabc-tabs-tools huwabc-accompaniment';box.setAttribute('aria-label','Akkompagnement og mixer');
 var controls={},outputs={},mixLabels={},channelWraps={},voicePanel=null,repeatPanel=null;
 var switches=E('div');switches.className='huwabc-player-switches';box.appendChild(switches);
 var l=E('label');l.className='huwabc-tabs-toggle';var enabled=E('input');enabled.type='checkbox';enabled.checked=c.enabled;l.appendChild(enabled);l.appendChild(E('span','Akkompagnement'));switches.appendChild(l);
 var ml=E('label');ml.className='huwabc-tabs-toggle';var metronome=E('input');metronome.type='checkbox';ml.appendChild(metronome);ml.appendChild(E('span','Metronom'));switches.appendChild(ml);
 var droneButton=E('button','Start drone');droneButton.type='button';droneButton.className='huwabc-btn huwabc-drone-toggle';switches.appendChild(droneButton);
 droneButton.addEventListener('click',function(){
  if(drone.isPlaying()){c.droneEnabled=false;c.backingModes.drone='mute';drone.stop();}
  else{c.droneEnabled=true;c.backingModes.drone='normal';if(!drone.start()){c.droneEnabled=false;c.backingModes.drone='mute';}}
  sync();emit(true);
 });
 metronome.addEventListener('change',function(){
  c.metronome=metronome.checked;c.backingModes.metronome=c.metronome?'normal':'mute';sync();emit(true);
 });
 var mixerToggle=E('button','Vis mixer og instrumenter');mixerToggle.type='button';mixerToggle.className='huwabc-btn huwabc-mixer-toggle';mixerToggle.setAttribute('aria-expanded','false');box.appendChild(mixerToggle);
 var mixer=E('div');mixer.className='huwabc-mixer';mixer.hidden=!viewState.mixer;mixer.setAttribute('role','group');mixer.setAttribute('aria-label','Mixer · lydstyrker og instrumenter');box.appendChild(mixer);
 // Open the one mixer to see all notated voices. Backing channels live in a compact lower fold.
 var voiceHost=E('div');voiceHost.className='huwabc-mixer-voices';mixer.appendChild(voiceHost);
 var accompChannels=E('details');accompChannels.className='huwabc-accomp-channels';accompChannels.setAttribute('data-huwabc-panel','channels');accompChannels.open=!!viewState.channels;
 accompChannels.appendChild(E('summary','Akkompagnement · øvrige lydkanaler'));
 var accompGrid=E('div');accompGrid.className='huwabc-accomp-channels-grid';accompChannels.appendChild(accompGrid);mixer.appendChild(accompChannels);
 mixerToggle.addEventListener('click',function(){mixer.hidden=!mixer.hidden;mixerToggle.textContent=mixer.hidden?'Vis mixer og instrumenter':'Skjul mixer og instrumenter';mixerToggle.setAttribute('aria-expanded',String(!mixer.hidden));});
 [['Melodi','melodyVolume'],['Bas','bassVolume'],['Akkorder','chordVolume'],['Trommer','drumVolume'],['Metronom','metronomeVolume'],['Drone','droneVolume']].forEach(function(p){
  var wrap=E('div');wrap.className='huwabc-mix-channel';
  var label=E('label');label.className='huwabc-mix-volume';var head=E('span',p[0]);var out=E('output');head.appendChild(out);label.appendChild(head);
  var slider=E('input');slider.type='range';slider.min=0;slider.max=100;slider.step=1;slider.setAttribute('aria-label',p[0]+' · lydstyrke');label.appendChild(slider);wrap.appendChild(label);accompGrid.appendChild(wrap);controls[p[1]]=slider;outputs[p[1]]=out;mixLabels[p[1]]=wrap;channelWraps[p[1]]=wrap;
  slider.addEventListener('input',function(){c[p[1]]=volume(slider.value,100);sync();emit(true);});
 });
 function editableConfig(){if(c.style==='auto'){c=resolve(c,fields['abc-source']||'',fields);c.style=c.detectedStyle;delete c.detectedStyle;}}
 function soundSelect(title,key,list,channel){var label=E('label');label.className='huwabc-mix-setting';label.appendChild(E('span',title));var sel=E('select');sel.className='huwabc-select';sel.setAttribute('aria-label',title);list.forEach(function(item){var opt=E('option',item[1]);opt.value=item[0];sel.appendChild(opt);});label.appendChild(sel);channelWraps[channel].appendChild(label);controls[key]=sel;sel.addEventListener('change',function(){if(['drums','bassInstrument','chordInstrument'].indexOf(key)>=0)editableConfig();c[key]=sel.value;c=clean(c);if(key.indexOf('drone')===0)drone.configure();sync();emit(key.indexOf('drone')===0);});return sel;}
 soundSelect('Instrument','melodyInstrument',melodyInstruments,'melodyVolume');
 soundSelect('Instrument','bassInstrument',bassInstruments,'bassVolume');
 soundSelect('Instrument','chordInstrument',chordInstruments,'chordVolume');
 soundSelect('Rytme / percussion','drums',drums,'drumVolume');
 var metroSoundOptions=Object.keys(metronomeSounds).map(function(k){return [k,metronomeSounds[k].label];});
 soundSelect('Sa / grundtone','droneSa',droneRoots,'droneVolume');
 soundSelect('Droneinterval','droneMode',droneModes,'droneVolume');
 soundSelect('Droneklang','droneTimbre',droneTimbres,'droneVolume');
 var metroSound=soundSelect('Metronomlyd','metronomeSound',metroSoundOptions,'metronomeVolume');
 var metroAccentLabel=E('label');metroAccentLabel.className='huwabc-tabs-toggle huwabc-metro-accent';var metroAccent=E('input');metroAccent.type='checkbox';metroAccentLabel.appendChild(metroAccent);metroAccentLabel.appendChild(E('span','Beton første slag'));channelWraps.metronomeVolume.appendChild(metroAccentLabel);
 metroAccent.addEventListener('change',function(){c.metronomeAccent=metroAccent.checked;sync();emit();});
 var details=E('details');details.setAttribute('data-huwabc-panel','accompaniment');details.open=!!opened;details.appendChild(E('summary','Akkompagnement · konfigurator'));box.appendChild(details);var grid=E('div');grid.className='huwabc-form-grid';details.appendChild(grid);
 function field(label,key,list){var wrap=E('label');wrap.className='huwabc-field';wrap.appendChild(E('span',label));var s=E('select');s.className='huwabc-select';list.forEach(function(p){var o=E('option',p[1]);o.value=p[0];s.appendChild(o);});s.value=c[key];wrap.appendChild(s);grid.appendChild(wrap);controls[key]=s;s.addEventListener('change',function(){if(key==='bass'||key==='chords')editableConfig();c[key]=s.value;if(key==='style'&&styles[s.value]){Object.assign(c,styles[s.value]);delete c.label;}c=clean(c);sync();emit();});}
 var allowedStyles=compatibleStyles(fields['abc-source']||'');if(styles[c.style]&&allowedStyles.indexOf(c.style)<0)allowedStyles.push(c.style);
 field('Stil','style',[['auto','Automatisk efter ABC-kildens R: / genre']].concat(allowedStyles.map(function(k){return [k,styles[k].label];})).concat([['custom','Egen blanding · eksperimentel']]));
 if(!allowedStyles.length){var meterNotice=E('p','Denne taktart eller et taktartsskift kræver en senere version af akkompagnementsmotoren. Vi undgår at tilbyde inkompatible stilarter.');meterNotice.className='huwabc-muted';grid.appendChild(meterNotice);}
 field('Form','form',[['auto','Automatisk (P:, gentagelser, taktantal)'],['AABA','AABA – 32-takters sang'],['ABAC','ABAC – kontrasterende afslutning'],['AAB','AAB – gentaget A, derefter B'],['AB','AB – to dele'],['BLUES','Blues – 12 takter'],['FREE','Fri form – ét afsnit'],['none','Ingen formautomatik']]);
 field('Bas-feel','feel',[['form','Efter form: A=2, B=4'],['two','2-feel hele vejen'],['four','4-feel hele vejen']]);
 field('Basmønster','bass',basses);field('Akkordmønster','chords',chords);
 var indianHint=E('p','Traditionel indisk musik bruger melodi, fast drone og slagtøj. Bas/akkorder er slået fra i de traditionelle stilarter. Vælg fusion eller Egen blanding for vestlige akkorder.');indianHint.className='huwabc-muted';grid.appendChild(indianHint);
 var variationLabel=E('label');variationLabel.className='huwabc-field huwabc-variation';variationLabel.appendChild(E('span','Variation · sandsynlighed pr. frase/takt'));var variation=E('input');variation.type='range';variation.min='0';variation.max='100';variation.step='5';var variationOutput=E('output');variation.setAttribute('aria-label','Variation i procent');variationLabel.appendChild(variation);variationLabel.appendChild(variationOutput);grid.appendChild(variationLabel);
 variation.addEventListener('change',function(){c.variation=volume(variation.value,35);sync();emit();});variation.addEventListener('input',function(){variationOutput.textContent=variation.value+' %';});
 var reroll=E('button','Nyt arrangement');reroll.type='button';reroll.className='huwabc-btn';reroll.title='Lav en ny gentagelig variation med samme indstillinger';details.appendChild(reroll);reroll.addEventListener('click',function(){c.seed=(c.seed||0)+1;sync();emit();});
 var formInfo=E('p');formInfo.className='huwabc-muted huwabc-form-info';details.appendChild(formInfo);
 var hint=E('p');details.appendChild(hint);details.appendChild(E('p','Bas og akkorder følger becifringerne. Slagtøj kan spille alene. Mixeren ændrer lydstyrken under afspilning; dine valg gemmes med nodearket.'));
 function sync(){if(voicePanel)voicePanel.update(c);if(repeatPanel)repeatPanel.update(c);enabled.checked=c.enabled;metronome.checked=c.metronome;metroSound.value=c.metronomeSound;metroAccent.checked=c.metronomeAccent;variation.value=c.variation;variationOutput.textContent=c.variation+' %';Object.keys(controls).forEach(function(k){controls[k].value=c[k];});Object.keys(outputs).forEach(function(k){outputs[k].textContent=c[k]+' %';mixLabels[k].hidden=false;});droneButton.textContent=drone.isPlaying()?'Stop drone':'Start drone';droneButton.setAttribute('aria-pressed',String(drone.isPlaying()));hint.textContent=(c.enabled?'Akkompagnement er slået til.':'Akkompagnement er slået fra.')+(c.style==='auto'?' Automatisk forslag: '+(styles[resolve({style:'auto'},fields['abc-source']||'',fields).detectedStyle]||styles.pop).label+'.':'');}
 function emit(live){onChange({'abc-accompaniment':JSON.stringify(c)},details.open,{live:!!live,view:{mixer:!mixer.hidden,channels:!!accompChannels.open,repeats:!!(repeatPanel&&repeatPanel.element&&repeatPanel.element.open)}});}
 try{voicePanel=mountVoices(voiceHost,require('$:/plugins/huwiki/abc/vendor/abcjs.js'),fields['abc-source']||'',function(){return c;},function(next){c=clean(next);sync();emit(true);},{inline:true,onPreview:function(next){c=clean(next);drone.configure();if(typeof onLive==='function')onLive(c);}});}
 catch(error){var voiceNotice=E('p','Stemmerne kunne ikke læses. Kontrollér ABC-kilden.');voiceNotice.className='huwabc-muted';voiceHost.appendChild(voiceNotice);}
 // No extra fold: the six written parts are visible directly in the mixer.
 var repeatHost=E('div');box.appendChild(repeatHost);repeatPanel=mountRepeats(repeatHost,require('$:/plugins/huwiki/abc/vendor/abcjs.js'),fields['abc-source']||'',function(){return c;},function(next){c=clean(next);sync();emit(false);});
 if(repeatPanel&&repeatPanel.element){repeatPanel.element.open=!!viewState.repeats;repeatPanel.element.setAttribute('data-huwabc-panel','repeats');}
 mixerToggle.textContent=mixer.hidden?'Vis mixer og instrumenter':'Skjul mixer og instrumenter';mixerToggle.setAttribute('aria-expanded',String(!mixer.hidden));
 enabled.addEventListener('change',function(){c.enabled=enabled.checked;sync();emit();});sync();parent.appendChild(box);return {config:function(){return c;},details:details,element:box,setForm:function(info){if(info)formInfo.textContent='Registreret form: '+info.type+' · '+info.bars+' takter · '+info.reason+' ('+info.confidence+').';},setConfig:function(next,persist){
  c=clean(next);drone.configure();sync();if(typeof onLive==='function')onLive(c);
  if(persist)emit(true);
 },update:function(nextFields){
 var sourceChanged=(fields['abc-source']||'')!==(nextFields['abc-source']||'');
 fields=nextFields;c=read(fields);
 if(sourceChanged){
  var repeatOpen=!!(repeatPanel&&repeatPanel.element&&repeatPanel.element.open);
  voiceHost.textContent='';repeatHost.textContent='';
  try{voicePanel=mountVoices(voiceHost,require('$:/plugins/huwiki/abc/vendor/abcjs.js'),fields['abc-source']||'',function(){return c;},function(next){c=clean(next);sync();emit(true);},{inline:true,onPreview:function(next){c=clean(next);drone.configure();if(typeof onLive==='function')onLive(c);}});}catch(ignore){voicePanel=null;}
  repeatPanel=mountRepeats(repeatHost,require('$:/plugins/huwiki/abc/vendor/abcjs.js'),fields['abc-source']||'',function(){return c;},function(next){c=clean(next);sync();emit(false);});
  if(repeatPanel&&repeatPanel.element){repeatPanel.element.open=repeatOpen;repeatPanel.element.setAttribute('data-huwabc-panel','repeats');}
  var allowed=compatibleStyles(fields['abc-source']||'');if(styles[c.style]&&allowed.indexOf(c.style)<0)allowed.push(c.style);
  controls.style.textContent='';
  [['auto','Automatisk efter ABC-kildens R: / genre']].concat(allowed.map(function(k){return [k,styles[k].label];})).concat([['custom','Egen blanding · eksperimentel']]).forEach(function(pair){var opt=E('option',pair[1]);opt.value=pair[0];controls.style.appendChild(opt);});
 }
 drone.configure();sync();
},startDrone:function(){if(c.droneEnabled&&drone.start())sync();},stopDrone:function(){drone.stop();sync();},destroy:function(){drone.destroy();}};
}
// A volume, mute or solo change never rebuilds the score or running sound.
// An instrument change still requires regenerating samples on next playback.
function liveVoices(a,b){
 var left=voiceRouting.clean(a),right=voiceRouting.clean(b);
 var keys=new Set(Object.keys(left).concat(Object.keys(right)));
 return Array.from(keys).every(function(key){
  return (left[key] ? left[key].instrument : 'inherit') === (right[key] ? right[key].instrument : 'inherit');
 });
}
function liveKey(k,a,b){
 return k==='reverb'||/Volume$/.test(k)||k==='enabled'||k==='metronome'||k==='backingModes'||k.indexOf('drone')===0||
  (k==='voiceSettings'&&liveVoices(a.voiceSettings,b.voiceSettings))||JSON.stringify(a[k])===JSON.stringify(b[k]);
}
function liveConfigChange(before,after){
 var a=clean(before),b=clean(after);
 return Object.keys(a).every(function(k){return liveKey(k,a,b);});
}
function onlyVolumes(before,after){
 var a=Object.assign({},before),b=Object.assign({},after);
 delete a['abc-accompaniment'];delete b['abc-accompaniment'];
 var keys=Object.keys(a);
 if(keys.length!==Object.keys(b).length||keys.some(function(k){return JSON.stringify(a[k])!==JSON.stringify(b[k]);}))return false;
 var ca=read(before),cb=read(after);
 return Object.keys(ca).every(function(k){return liveKey(k,ca,cb);});
}
// A Solo is global across notated voices, style bass/chords/drums and the
// metronome/drone. A master-disabled generated part cannot silence everything
// by keeping a stale Solo selected. Written bass uses its original voice bus.
function activeSolo(c){
 var v=voiceRouting.clean(c.voiceSettings),m=c.backingModes||backingModes(c);
 if(Object.keys(v).some(function(k){return v[k].mode==='solo';}))return true;
 return backingNames.some(function(k){
  if(m[k]!=='solo')return false;
  if(k==='metronome')return c.metronome;
  if(k==='drone')return c.droneEnabled;
  if(k==='bass')return c.bassSource!=='none'&&(c.bassSource!=='style'||c.enabled);
  return c.enabled;
 });
}
function channelGain(key,config){
 var c=clean(config),voices=c.voiceSettings,m=c.backingModes;
 var solo=activeSolo(c);
 if(key.indexOf('voice:')===0){
  var index=key.slice(6),v=voices[index]||{mode:'normal',volume:100};
  var routedBass=c.bassSource===key;
  if(v.mode==='mute'||routedBass&&m.bass==='mute')return 0;
  if(solo&&v.mode!=='solo'&&!(routedBass&&m.bass==='solo'))return 0;
  return v.volume/100*c[routedBass?'bassVolume':'melodyVolume']/100;
 }
 var channel=backingBuses[key],mode=m[channel]||'normal';
 if(channel){
  if(mode==='mute'||solo&&mode!=='solo')return 0;
  if(channel==='metronome'&&!c.metronome||channel==='drone'&&!c.droneEnabled)return 0;
  if((channel==='bass'||channel==='chords'||channel==='drums')&&!c.enabled)return 0;
 }
 var amount=Number(c[key]);return Number.isFinite(amount)?amount/100:1;
}
// abcjs 6.7.2 normally combines every instrument into one buffer. Render equal-length
// stems, then route each through its own GainNode on one shared playback clock.
// Dry stems stay reusable. All sends in a mixer share one stereo room.
var impulses = new Map();
var roomSeconds = 1.4;
function roomImpulse(ctx) {
 var rate = ctx.sampleRate;
 if (impulses.has(rate)) return impulses.get(rate);
 var buffer = ctx.createBuffer(2, Math.ceil(rate * roomSeconds), rate);
 for (var channel = 0; channel < 2; channel++) {
  var data = buffer.getChannelData(channel), seed = 3197 + channel;
  for (var i = Math.round(rate * .023); i < data.length; i++) {
   seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
   data[i] = (seed / 2147483648 - 1) * .24 * Math.exp(-6.2 * i / rate);
  }
  [.029,.047,.071,.103].forEach(function(delay, index) {
   data[Math.round(rate * (delay + channel * .003))] += .9 / (index + 1);
  });
 }
 impulses.set(rate, buffer);
 return buffer;
}
function createRoom(ctx, destination) {
 var convolver, wet, connected = new Set();
 function input() {
  if (!convolver && ctx && ctx.createConvolver) {
   convolver = ctx.createConvolver(); convolver.buffer = roomImpulse(ctx);
   wet = ctx.createGain(); wet.gain.value = 1;
   convolver.connect(wet); wet.connect(destination || ctx.destination);
  }
  return convolver;
 }
 return {
  input: input,
  update: function(sources, amount) {
   amount = Math.min(1, Math.max(0, Number(amount) || 0));
   if (!wet) {
    if (!amount || !sources.length || !input()) return;
    wet.gain.value=amount;
   }
   sources.forEach(function(source) {
    if (!connected.has(source)) {source.connect(convolver); connected.add(source);}
   });
   wet.gain.setTargetAtTime(amount, ctx.currentTime, .018);
  },
  dispose: function() {
   if (convolver) {convolver.disconnect(); wet.disconnect();}
   connected.clear(); convolver = wet = null;
  }
 };
}
exports.createRoom=createRoom;
exports.roomSeconds=roomSeconds;
function createMixer(ABC,getConfig){
 var synth=new ABC.synth.CreateSynth(),prime=synth.prime,gains=[],keys=[],room=null;
 synth.prime=async function(){var full=synth.flattened,groups={melodyVolume:[]},buffers=[],result;
  full.tracks.forEach(function(t){var key=t.huwabcVoice!==undefined?'voice:'+t.huwabcVoice:(t.huwabcPart||'melodyVolume');(groups[key]||(groups[key]=[])).push(t);});keys=Object.keys(groups);
  try{for(var i=0;i<keys.length;i++){synth.flattened=Object.assign({},full,{tracks:groups[keys[i]]});result=await prime.call(synth);buffers.push(synth.audioBuffers[0]);}synth.audioBuffers=buffers.filter(Boolean);return result;}finally{synth.flattened=full;}
 };
 synth.setVolumes=function(){var ctx=ABC.synth.activeAudioContext();if(!ctx)return;if(room)room.update(gains,getConfig().reverb/100);gains.forEach(function(g,i){g.gain.setTargetAtTime(channelGain(keys[i],getConfig()),ctx.currentTime,.015);});};
 synth.disposeMixer=function(){if(room){room.dispose();room=null;}gains.forEach(function(g){g.disconnect();});gains=[];};
 synth._kickOffSound=function(seconds){var ctx=ABC.synth.activeAudioContext();synth.stop();synth.disposeMixer();synth.isRunning=true;
  synth.directSource=synth.audioBuffers.map(function(buffer,i){var gain=ctx.createGain();gain.gain.value=channelGain(keys[i],getConfig());gain.connect(ctx.destination);gains.push(gain);var source=ctx.createBufferSource();source.buffer=buffer;source.connect(gain);return source;});
  room=createRoom(ctx);room.update(gains,getConfig().reverb/100);
  var when=ctx.currentTime;synth.directSource.forEach(function(source){source.start(when,seconds);});
  if(synth.onEnded&&synth.directSource[0])synth.directSource[0].onended=function(){synth.onEnded(synth.callbackContext);};
 };
 return synth;
}
function mountVoices(parent,ABC,source,getConfig,onChange,options){return require('$:/plugins/huwiki/abc/voice-controls.js').mount(parent,ABC,source,getConfig,onChange,options);}
function mountRepeats(parent,ABC,source,getConfig,onChange){return require('$:/plugins/huwiki/abc/repeat-controls.js').mount(parent,ABC,source,getConfig,onChange);}
exports.mountRepeats=mountRepeats;exports.repeatPlan=repeatPlanModule;exports.mountVoices=mountVoices;exports.voiceRouting=voiceRouting;exports.basses=basses;exports.chords=chords;exports.drums=drums;
exports.channelGain=channelGain;exports.activeSolo=activeSolo;exports.backingModes=backingModes;exports.liveConfigChange=liveConfigChange;exports.createDrone=createDrone;exports.droneModes=droneModes;exports.droneTimbres=droneTimbres;exports.droneRoots=droneRoots;exports.createMixer=createMixer;exports.onlyVolumes=onlyVolumes;exports.clean=clean;exports.resolve=resolve;exports.read=read;exports.styles=styles;exports.metronomeSounds=metronomeSounds;exports.metronomePattern=metronomePattern;exports.prepare=prepare;exports.mount=mount;exports.patterns=patterns;exports.info=info;exports.meterProfile=meterProfile;exports.compatibleStyles=compatibleStyles;
})();
