/*\
title: $:/plugins/huwiki/abc/score-view.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
function present(value){return value!==undefined&&value!==null&&String(value).trim()!=='';}
function positive(value,name){
 var text=String(value).trim();
 if(!/^\d+$/.test(text)||Number(text)<1||!Number.isSafeInteger(Number(text)))throw new Error(name+' skal være et positivt heltal.');
 return Number(text);
}
function flag(value,fallback,name){
 if(!present(value))return fallback;
 var text=String(value).trim().toLowerCase();
 if(/^(yes|true|1)$/.test(text))return true;
 if(/^(no|false|0)$/.test(text))return false;
 throw new Error(name+' skal være yes eller no.');
}
function swingValue(fields,override){
 var source=present(override)?override:(fields&&fields['abc-swing']);
 if(!present(source))return 50;
 var v=Number(source);
 if(!Number.isInteger(v)||v<50||v>75)throw new Error('Swing skal være et heltal mellem 50 og 75.');
 return v;
}
exports.swingValue=swingValue;
exports.resolve=function(attributes,fields){
 var a=attributes||{},f=fields||{},range=null;
 if(present(a.bars)){
  if(present(a.from)||present(a.start)||present(a.count)||present(a.to)||present(a.end))throw new Error('Brug enten bars eller from/count til taktudsnittet.');
  var match=/^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(String(a.bars));
  if(!match)throw new Error('Skriv takter som bars="5-8" eller bars="5".');
  range={start:positive(match[1],'Første takt'),end:positive(match[2]||match[1],'Sidste takt')};
 }else if(['from','start','count','to','end'].some(function(key){return present(a[key]);})){
  if(present(a.from)&&present(a.start)||present(a.to)&&present(a.end))throw new Error('Angiv kun én starttakt og én sluttakt.');
  range={start:positive(present(a.from)?a.from:present(a.start)?a.start:1,'Første takt')};
  if(present(a.count))range.count=positive(a.count,'Antal takter');
  if(present(a.to)||present(a.end))range.end=positive(present(a.to)?a.to:a.end,'Sidste takt');
  if(range.count&&range.end)throw new Error('Angiv enten antal takter eller sluttakt.');
 }
 if(range&&range.end&&range.end<range.start)throw new Error('Sluttakten skal komme efter eller være lig med starttakten.');
 var explicit=present(a.view)?String(a.view).trim().toLowerCase():'auto';
 if(['auto','full','minimal','notes','follow','chords'].indexOf(explicit)<0)throw new Error('Visning skal være auto, full, minimal, notes, follow eller chords.');
 var embedded=flag(a.embedded,false,'embedded');
 var saved=['full','minimal','notes','chords'].indexOf(f['abc-view'])>=0?f['abc-view']:'minimal';
 var mode=explicit==='auto'?(range||embedded?'minimal':saved):explicit;
 if(range&&mode==='full')throw new Error('Et taktudsnit bruger minimal visning. Vælg view="minimal".');
 var audio=(mode!=='notes'&&String(a.audio||'').trim().toLowerCase()==='all')?true:flag(a.audio,mode!=='notes'&&!(saved==='notes'&&explicit!=='full'),'audio');
 if(mode==='full'&&!audio)mode='minimal';
 var voice=present(a.voice)?positive(a.voice,'Stemme'):1;
 var measures=present(a.measures)?positive(a.measures,'Takter i vinduet'):3;
 if((mode==='follow'||mode==='chords')&&(voice>32||measures<2||measures>4))throw new Error('Følgevisning: voice skal være 1–32, measures skal være 2–4.');
 var chords=present(a.chords)?String(a.chords).trim().toLowerCase():'below';
 if(['below','none'].indexOf(chords)<0)throw new Error('chords skal være below eller none.');
 var chordVoice=present(a['chord-voice'])?positive(a['chord-voice'],'Becifringsstemme'):0;
 if(chordVoice>32)throw new Error('chord-voice skal være 1–32 eller tom.');
 swingValue(f,a.swing);
 return {view:mode==='notes'?'minimal':mode,minimal:mode!=='full',audio:audio,
  showTitle:flag(a['show-title'],mode==='full','show-title'),range:range,embedded:embedded,
  voice:voice,measures:measures,chords:chords,chordVoice:chordVoice,
  mixer:flag(a.mixer,false,'mixer')};
};
exports.prepare=function(ABC,source,fields,view){
 var result={source:String(source||''),fields:Object.assign({},fields||{}),excerpt:null};
 if(view&&view.range){
  result.excerpt=require('$:/plugins/huwiki/abc/score-excerpt.js').build(ABC,result.source,view.range);
  result.source=result.excerpt.source;
  var config={};try{config=JSON.parse(result.fields['abc-accompaniment']||'{}')||{};}catch(ignore){}
  if(typeof config!=='object'||Array.isArray(config))config={};
  config=Object.assign({},config,{repeatCounts:{}});
  result.fields['abc-accompaniment']=JSON.stringify(config);
 }
 result.fields['abc-source']=result.source;
 return result;
};
})();
