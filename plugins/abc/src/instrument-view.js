/*\
title: $:/plugins/huwiki/abc/instrument-view.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// The original ABC and every audio/accompaniment path stay at concert pitch.
// This is intentionally a session-wide, non-persistent READING preference:
// one choice applies to the four tunes without modifying a source tiddler.
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var active='c',subscribers=[],preferences={capo:null,tab:null};
var profiles={
 c:{id:'c',button:'C',labelDa:'C · klingende',labelEn:'C · concert pitch',printDa:'C · klingende noder',printEn:'C · concert pitch',semitones:0},
 bb:{id:'bb',button:'B♭',labelDa:'B♭ · sopransax',labelEn:'B♭ · soprano sax',printDa:'B♭ · sopransaxofon',printEn:'B♭ · soprano saxophone',semitones:2},
 eb:{id:'eb',button:'E♭',labelDa:'E♭ · sopranino',labelEn:'E♭ · sopranino',printDa:'E♭ · sopraninosaxofon',printEn:'E♭ · sopranino saxophone',semitones:-3},
 ebalto:{id:'ebalto',button:'E♭ alto',labelDa:'E♭ · altsaxofon',labelEn:'E♭ · alto saxophone',printDa:'E♭ · altsaxofon',printEn:'E♭ · alto saxophone',semitones:9}
};
function profile(id,button,da,en,semitones){profiles[id]={id:id,button:button,labelDa:da,labelEn:en,printDa:da,printEn:en,semitones:semitones};}
profile('bbwind','B♭','B♭ · trompet / klarinet','B♭ · trumpet / clarinet',2);
profile('tenor','B♭ tenor','B♭ · tenorsax / basklarinet','B♭ · tenor sax / bass clarinet',14);
profile('baritone','E♭ bari','E♭ · barytonsax','E♭ · baritone sax',21);
profile('horn','F','F · horn / engelskhorn','F · horn / cor anglais',7);
profile('aclarinet','A','A · klarinet','A · clarinet',3);
profile('dwind','D','D · trompet','D · trumpet',-2);
profile('gflute','G','G · altfløjte','G · alto flute',5);
profile('piccolo','C piccolo','C · piccolo','C · piccolo',-12);
profile('bassflute','C bas','C · basfløjte','C · bass flute',12);
var order=Object.keys(profiles);
var strings=[['guitar','Guitar','Guitar'],['ukulele','Ukulele · low G','Ukulele · low G'],['tenorbanjo','Tenorbanjo · CGDA','Tenor banjo · CGDA'],['irishbanjo','Tenorbanjo · GDAE','Tenor banjo · GDAE'],['mandolin','Mandolin','Mandolin'],['banjo5','5-strenget banjo · gDGBD','5-string banjo · gDGBD'],['charango','Charango · GCEAE','Charango · GCEAE']];
function current(){return Object.assign({},profiles[active],{semitones:profiles[active].semitones-(preferences.capo||0),capo:preferences.capo,tab:preferences.tab});}
function notifyAll(){subscribers.slice().forEach(function(fn){fn();});}
function setCapo(value){value=Number(value);if(!Number.isInteger(value)||value<0||value>8||preferences.capo===value)return false;preferences.capo=value;notifyAll();return true;}
function setTab(value){if(value!=='off'&&!strings.some(function(s){return s[0]===value;})||preferences.tab===value)return false;preferences.tab=value;notifyAll();return true;}
function language(wiki){try{return I18n.language(wiki)==='en'?'en':'da';}catch(ignore){return 'da';}}
function label(profile,lang,kind){return profile[(kind==='print'?'print':'label')+(lang==='en'?'En':'Da')];}
function change(id){if(!profiles[id]||id===active)return false;active=id;notifyAll();return true;}
function mount(host,options){
 options=options||{};
 var d=host.ownerDocument||document,lang=function(){return language(options.wiki);};
 var group=d.createElement('div');group.className='huwabc-instrument-group';group.setAttribute('role','group');
 var legend=d.createElement('span');legend.className='huwabc-instrument-legend';group.appendChild(legend);
 var buttons=d.createElement('div');buttons.className='huwabc-instrument-buttons';group.appendChild(buttons);
 function select(cls,aria){var n=d.createElement('select');n.className='huwabc-instrument-select '+cls;n.setAttribute('aria-label',aria);buttons.appendChild(n);return n;}
 function option(select,value,text){var n=d.createElement('option');n.value=value;n.textContent=text;select.appendChild(n);return n;}
 var instrument=select('huwabc-written-select','Instrumentnoder'),capo=select('huwabc-capo-select','Capo'),tab=select('huwabc-tab-select','Tabulatur');
 instrument.addEventListener('change',function(){change(instrument.value);});
 capo.addEventListener('change',function(){setCapo(capo.value);});
 tab.addEventListener('change',function(){setTab(tab.value);});
 var hint=d.createElement('span');hint.className='huwabc-instrument-hint';group.appendChild(hint);
 host.appendChild(group);
 function sync(){
  var english=lang()==='en',name=english?'Written notes':'Noder';
  legend.textContent=name+':';group.setAttribute('aria-label',english?'Instrument notation (audio stays at concert pitch)':'Instrumentnoder (lyden forbliver i klingende C)');
  instrument.textContent='';capo.textContent='';tab.textContent='';
  order.forEach(function(id){option(instrument,id,id==='c'?'C':label(profiles[id],lang()));});
  option(capo,0,english?'Capo · off':'Capo · fra');
  for(var fret=1;fret<=8;fret++)option(capo,fret,'Capo '+fret);
  option(tab,'off',english?'Tab · off':'Tab · fra');
  strings.forEach(function(s){option(tab,s[0],'Tab · '+s[english?2:1]);});
  instrument.value=active;capo.value=String(preferences.capo||0);tab.value=preferences.tab||'off';
  instrument.setAttribute('aria-label',english?'Written instrument':'Instrumentnoder');
  tab.setAttribute('aria-label',english?'Tablature instrument':'Tabulaturinstrument');
  [instrument,capo,tab].forEach(function(n){n.setAttribute('data-active',String(n.value!=='c'&&n.value!=='0'&&n.value!=='off'));});
  hint.textContent=english?'Audio: concert pitch · ABC unchanged':'Lyd: klingende C · ABC uændret';
 }
 function notify(){sync();if(options.onChange)options.onChange(current());}
 subscribers.push(notify);sync();
 return {element:group,sync:sync,destroy:function(){var at=subscribers.indexOf(notify);if(at!==-1)subscribers.splice(at,1);if(group.parentNode)group.parentNode.removeChild(group);}};
}
// The written harmonies can be transposed in the SVG but clicking them must
// still audition sounding/concert pitches, not the transposed chord spelling.
function soundingPitches(pitches){return (pitches||[]).map(function(p){return p-current().semitones;});}
// Passive mode listener: Normal never needs to mount the instrument buttons.
function observe(callback){
 if(typeof callback!=="function")return function(){};
 subscribers.push(callback);
 return function(){var at=subscribers.indexOf(callback);if(at>=0)subscribers.splice(at,1);};
}
exports.observe=observe;exports.setCapo=setCapo;exports.setTab=setTab;
exports.current=current;exports.change=change;exports.mount=mount;exports.soundingPitches=soundingPitches;
exports.profiles=profiles;
exports.printLabel=function(wiki){return label(current(),language(wiki),'print')+(preferences.capo?' · Capo '+preferences.capo:'')+(preferences.tab&&preferences.tab!=='off'?' · Tab · '+strings.find(function(s){return s[0]===preferences.tab;})[language(wiki)==='en'?2:1]:'');};
})();
