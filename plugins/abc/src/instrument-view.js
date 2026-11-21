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
var active='c',subscribers=[];
var profiles={
 c:{id:'c',button:'C',labelDa:'C · klingende',labelEn:'C · concert pitch',printDa:'C · klingende noder',printEn:'C · concert pitch',semitones:0},
 bb:{id:'bb',button:'B♭',labelDa:'B♭ · sopransax',labelEn:'B♭ · soprano sax',printDa:'B♭ · sopransaxofon',printEn:'B♭ · soprano saxophone',semitones:2},
 eb:{id:'eb',button:'E♭',labelDa:'E♭ · sopranino',labelEn:'E♭ · sopranino',printDa:'E♭ · sopraninosaxofon',printEn:'E♭ · sopranino saxophone',semitones:-3},
 ebalto:{id:'ebalto',button:'E♭ alto',labelDa:'E♭ · altsaxofon',labelEn:'E♭ · alto saxophone',printDa:'E♭ · altsaxofon',printEn:'E♭ · alto saxophone',semitones:9}
};
var order=['c','bb','eb','ebalto'];
function current(){return profiles[active];}
function language(wiki){try{return I18n.language(wiki)==='en'?'en':'da';}catch(ignore){return 'da';}}
function label(profile,lang,kind){return profile[(kind==='print'?'print':'label')+(lang==='en'?'En':'Da')];}
function change(id){if(!profiles[id]||id===active)return false;active=id;subscribers.slice().forEach(function(fn){fn();});return true;}
function mount(host,options){
 options=options||{};
 var d=host.ownerDocument||document,lang=function(){return language(options.wiki);};
 var group=d.createElement('div');group.className='huwabc-instrument-group';group.setAttribute('role','group');
 var legend=d.createElement('span');legend.className='huwabc-instrument-legend';group.appendChild(legend);
 var buttons=d.createElement('div');buttons.className='huwabc-instrument-buttons';group.appendChild(buttons);
 var map={};order.forEach(function(id){var b=d.createElement('button');b.type='button';b.className='huwabc-instrument-option';b.textContent=profiles[id].button;b.addEventListener('click',function(){change(id);});buttons.appendChild(b);map[id]=b;});
 var hint=d.createElement('span');hint.className='huwabc-instrument-hint';group.appendChild(hint);
 host.appendChild(group);
 function sync(){
  var english=lang()==='en',name=english?'Written notes':'Noder';
  legend.textContent=name+':';group.setAttribute('aria-label',english?'Instrument notation (audio stays at concert pitch)':'Instrumentnoder (lyden forbliver i klingende C)');
  order.forEach(function(id){var p=profiles[id],b=map[id],selected=id===active;
   b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',label(p,lang()));b.title=label(p,lang());
  });
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
exports.observe=observe;
exports.current=current;exports.change=change;exports.mount=mount;exports.soundingPitches=soundingPitches;
exports.profiles=profiles;
exports.printLabel=function(wiki){return label(current(),language(wiki),'print');};
})();
