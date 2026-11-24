/*\
title: $:/plugins/huwiki/abc/tabs.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var model=require('$:/plugins/huwiki/abc/editor-model.js');
var rhythm=require('$:/plugins/huwiki/abc/tab-rhythm.js');
var only=require('$:/plugins/huwiki/abc/tabs-only.js');
var notation=require('$:/plugins/huwiki/abc/notation.js');
var InstrumentView=require('$:/plugins/huwiki/abc/instrument-view.js');
var presets={
 guitar:{label:'Guitar · 6 strenge',tuning:'E2 A2 D3 G3 B3 E4'},
 dropd:{label:'Guitar · Drop D',tuning:'D2 A2 D3 G3 B3 E4'},
 dadgad:{label:'Guitar · DADGAD',tuning:'D2 A2 D3 G3 A3 D4'},
 openg:{label:'Guitar · Open G',tuning:'D2 G2 D3 G3 B3 D4'},
 bass:{label:'Bas · 4 strenge',tuning:'E1 A1 D2 G2'},
 bass5:{label:'Bas · 5 strenge',tuning:'B0 E1 A1 D2 G2'},
 mandolin:{label:'Mandolin · 4 kor / 8 strenge',tuning:'G3 D4 A4 E5'},
 ukulele:{label:'Ukulele · low G',tuning:'G3 C4 E4 A4'},
 tenorbanjo:{label:'Tenorbanjo · CGDA',tuning:'C3 G3 D4 A4'},
 irishbanjo:{label:'Tenorbanjo · GDAE',tuning:'G2 D3 A3 E4'},
 banjo5:{label:'5-strenget banjo · gDGBD',tuning:'G4 D3 G3 B3 D4',reentrant:true},
 charango:{label:'Charango · 5 kor / 10 strenge',tuning:'G4 C5 E4 A4 E5',reentrant:true},
 violin:{label:'Violin · 4 strenge',tuning:'G3 D4 A4 E5'}
};
function parseTuning(value){
 var parts=String(value||'').trim().split(/\s+/),notes=[];
 if(![4,5,6].includes(parts.length))throw new Error('Vælg 4, 5 eller 6 strenge/kor.');
 parts.forEach(function(p){var m=/^([A-GH])([#b♯♭]?)([0-8])$/i.exec(p);if(!m)throw new Error('Skriv toner med oktav, fx E2 A2 D3 G3 B3 E4.');var n=(Number(m[3])+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11,H:11}[m[1].toUpperCase()]+(/[#♯]/.test(m[2])?1:/[b♭]/.test(m[2])?-1:0);notes.push(n);});
 return notes;
}
function clean(c){c=c||{};var preset=presets[c.preset]?c.preset:'custom',tuning=c.tuning||presets.guitar.tuning,notes=parseTuning(tuning),capo=Number(c.capo||0);if(!Number.isInteger(capo)||capo<0||capo>12)throw new Error('Capo skal være et helt tal fra 0 til 12.');return {rhythm:c.rhythm===true,notation:['auto','guitar','bass','source'].includes(c.notation)?c.notation:'auto',preset:preset,tuning:tuning.trim().replace(/\s+/g,' '),capo:capo,notes:notes,notationExplicit:c.notationExplicit===true};}
function read(fields){var c;try{c=JSON.parse(fields['abc-tabs-config']||'null');}catch(_){c=null;}// Migrate the v0.3.0–0.3.4 automatic 'source' fallback without overriding an explicit user choice.
 if(c&&c.notation==='source'&&!c.notationExplicit)c.notation='auto';try{return clean(c||{preset:'guitar',tuning:presets.guitar.tuning,notation:'auto'});}catch(_){return clean({preset:'guitar',tuning:presets.guitar.tuning,notation:'auto'});}}
function view(fields){
 var c=read(fields),v=InstrumentView.current(),enabled=fields['abc-tabs']==='yes';
 if(v.tab!==null){enabled=v.tab!=='off';if(enabled){
  var preset=v.tab.replace(/-low$/,'');
  c=clean(Object.assign({},c,{preset:preset,tuning:presets[preset].tuning,notation:'auto'}));
  c.lowerOctave=preset!==v.tab;
 }}
 if(v.capo!==null)c.capo=v.capo;
 // ABCJS receives written pitches. Shift the open strings by the same amount
 // so TAB is calculated from concert pitches and the capo is subtracted once.
 c.notes=c.notes.map(function(n){return n+v.semitones;});c.viewTranspose=v.semitones;
 return {config:c,enabled:enabled};
}
function capoForString(c,index){return c.preset==='banjo5'&&index===0?0:c.capo;}
function stored(c){return JSON.stringify({rhythm:c.rhythm,notation:c.notation,preset:c.preset,tuning:c.tuning,capo:c.capo,notationExplicit:c.notationExplicit===true});}
function options(abc,source,enabled,c){
 if(!enabled)return {options:[],message:''};
 var tune=abc.parseOnly(source)[0],count=0,blocked=false;
 (tune&&tune.lines||[]).forEach(function(l){count=Math.max(count,(l.staff||[]).length);(l.staff||[]).forEach(function(s){if(s.clef&&(/perc/.test(s.clef.type)||s.clef.stafflines===0))blocked=true;});});
 if(blocked)return {options:[],message:'Tabs vises ikke på nodeark med trommenotation eller skjulte nodelinjer.'};
 var instrument={4:'mandolin',5:'fiveString',6:'guitar'}[c.notes.length];
 // ABCJS assumes ascending tuning. A safe ascending scaffold reserves the
 // correct number of tab lines; finish() assigns physical strings afterwards.
 var engineNotes=c.notes.slice().sort(function(a,b){return a-b;});
 for(var k=1;k<engineNotes.length;k++)engineNotes[k]=Math.max(engineNotes[k],engineNotes[k-1]+1);
 var label=(presets[c.preset]?presets[c.preset].label:'Egen stemning')+' · '+c.tuning+(c.capo?' · capo '+c.capo:'');
 return {options:Array.from({length:count},function(){return {instrument:instrument,tuning:engineNotes.map(function(n){return model.sourceMidi(n,false).replace(/^=/,'');}),capo:c.capo,suppress:true,label:''};}),message:''};
}
// The short fifth string sounds open at the fifth fret. A stopped note
// is labelled with its physical fret, independently of the long strings' capo.
function fingering(pitches,opens,capo,offsets,shortFifth){
 var best=null,bestCost=Infinity,chosen=[];
 if(pitches.length>opens.length)return null;
 function search(i,used,maxFret,sum,dronePenalty){
  if(i===pitches.length){
   var cost=dronePenalty+maxFret*10+sum;
   if(cost<bestCost){bestCost=cost;best=chosen.slice();}
   return;
  }
  for(var string=0;string<opens.length;string++){
   if(used&(1<<string))continue;
   var fret=pitches[i]-opens[string]-(offsets?offsets[string]:capo);
   if(!Number.isInteger(fret)||fret<0)continue;
   var drone=shortFifth&&string===0;
   if(drone&&fret>0)fret+=5;
   if(fret>24)continue;
   // Use the four long strings for melody. Allow an open drone in
   // chords and a stopped drone when a chord otherwise cannot be voiced.
   var penalty=drone&&(pitches.length===1||fret>0)?1000:0;
   chosen.push({index:i,str:opens.length-1-string,num:fret});
   search(i+1,used|(1<<string),Math.max(maxFret,fret),sum+fret,dronePenalty+penalty);
   chosen.pop();
  }
 }
 search(0,0,0,0,0);return best;
}
function finish(tune,c){
 var uncertain=false,shortFifth=c.preset==='banjo5';
 var offsets=c.notes.map(function(_,i){return capoForString(c,i);});
 function place(ev,children){
  if(children.length!==ev.notes.length)return;
  var pitches=ev.notes.map(function(n){
   var p=model.pitch(n.pitch);
   return p?model.midi(p.d,p.acc==='='?0:p.acc[0]==='^'?p.acc.length:p.acc[0]==='_'?-p.acc.length:0):NaN;
  });
  var valid=!shortFifth&&ev.notes.every(function(n,i){
   var index=c.notes.length-1-n.str,fret=Number(n.num);
   return index>=0&&index<c.notes.length&&Number.isInteger(fret)&&fret>=0&&fret<=24&&pitches[i]===c.notes[index]+offsets[index]+fret;
  })&&new Set(ev.notes.map(function(n){return n.str;})).size===ev.notes.length;
  var positions=valid?ev.notes:fingering(pitches,c.notes,c.capo,offsets,shortFifth);
  if(!positions){
   uncertain=true;
   positions=ev.notes.map(function(n,i){return {str:Math.min(i,c.notes.length-1),num:'?'};});
  }
  children.forEach(function(ch,i){
   var node=ch.graphelem,pos=positions[i];if(!node||!pos)return;
   var nextPitch=5.6+(c.notes.length-1-pos.str)*3,dy=-(nextPitch-ch.pitch)*3.875;
   if(Math.abs(dy)>.01)node.setAttribute('transform','translate(0,'+dy+')');
   ch.pitch=nextPitch;ch.c=pos.num;ev.notes[i].str=pos.str;ev.notes[i].num=pos.num;
   node.textContent=pos.num;
   node.dataset.huwabcTabSource=ev.startChar;node.dataset.huwabcTabIndex=i;
   node.dataset.huwabcTabMidi=pitches[i]-(c.viewTranspose||0);node.dataset.huwabcTabString=pos.str+1;
   node.setAttribute('aria-label','Streng '+(pos.str+1)+', bånd '+pos.num);
  });
 }
 (tune&&tune.lines||[]).forEach(function(line){
  (line.staff||[]).filter(function(s){return s.clef&&s.clef.type==='TAB';}).forEach(function(staff){
   (staff.voices||[]).forEach(function(voice){
    var graceEvents=[];
    voice.forEach(function(ev){
     if(ev.grace){graceEvents.push(ev);return;}
     if(ev.notes&&ev.abselem){
      var digits=ev.abselem.children.filter(function(ch){return ch.type==='tabNumber';});
      var graces=digits.filter(function(ch){return ch.isGrace;});
      if(graces.length===graceEvents.length)graces.forEach(function(ch,i){place(graceEvents[i],[ch]);});
      place(ev,digits.filter(function(ch){return !ch.isGrace;}));
     }
     graceEvents=[];
    });
   });
  });
 });
 return uncertain?'Tabs: ? betyder, at tonen eller akkorden ikke har en beregnet placering inden for 24 bånd.':'';
}
function E(tag,text){var e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function mount(parent,fields,onChange,opened){
 var config=read(fields),enabled=fields['abc-tabs']==='yes',available=true,showNotes=fields['abc-show-notes']!=='no'||!enabled;
 var box=E('div');box.className='huwabc-tabs-tools';var toggle=E('input');toggle.type='checkbox';toggle.checked=enabled;var toggleLabel=E('label');toggleLabel.className='huwabc-tabs-toggle';toggleLabel.appendChild(toggle);toggleLabel.appendChild(E('span','Vis tabs'));box.appendChild(toggleLabel);
 var notesToggle=E('input');notesToggle.type='checkbox';notesToggle.checked=showNotes;notesToggle.disabled=!enabled;var notesLabel=E('label');notesLabel.className='huwabc-tabs-toggle';notesLabel.appendChild(notesToggle);notesLabel.appendChild(E('span','Vis noder'));box.appendChild(notesLabel);
 var details=E('details');details.setAttribute('data-huwabc-panel','tabs');details.hidden=!enabled;details.open=!!opened;details.appendChild(E('summary','Tabs · konfigurator'));var grid=E('div');grid.className='huwabc-form-grid';details.appendChild(grid);
 function field(title,node){var l=E('label');l.className='huwabc-field';l.appendChild(E('span',title));l.appendChild(node);grid.appendChild(l);return node;}
 var preset=E('select');preset.className='huwabc-select';Object.keys(presets).concat(['custom']).forEach(function(k){var o=E('option',k==='custom'?'Egen stemning':presets[k].label);o.value=k;preset.appendChild(o);});preset.value=config.preset;field('Instrument og stemning',preset);
 var count=E('select');count.className='huwabc-select';[4,5,6].forEach(function(n){var o=E('option',String(n));o.value=n;count.appendChild(o);});count.value=config.notes.length;field('Antal strenge / kor',count);
 var tuning=E('input');tuning.className='huwabc-input';tuning.type='text';tuning.value=config.tuning;field('Åbne strenge · fra nederste tablinje til øverste',tuning);
 var capo=E('input');capo.className='huwabc-input';capo.type='number';capo.min=0;capo.max=12;capo.step=1;capo.value=config.capo;field('Capo · bånd',capo);
 details.appendChild(E('p','Tonenavne med oktav, fx E2. B er internationalt B (dansk H). En mandolins dobbelte strenge deler en tablinje. Ukulele bruger low G. 5-strenget banjo har en kort g-drone fra 5. bånd. Åben streng vises som 0, og grebne toner bruger det fysiske båndnummer. Melodien bruger normalt de fire lange strenge, som også følger capo. Charango vises som fem kor (E-oktavparret deler tablinje, beregnet fra den dybe E4).'));
 var notationSelect=E('select');notationSelect.className='huwabc-select';[['auto','Instrumentets notation'],['guitar','Guitar · G-nøgle med 8 under'],['bass','Bas · F-nøgle med 8 under'],['source','ABC-kildens notation']].forEach(function(pair){var o=E('option',pair[1]);o.value=pair[0];notationSelect.appendChild(o);});notationSelect.value=config.notation;field('Nodevisning',notationSelect);notationSelect.addEventListener('change',function(){config.notationExplicit=true;update();});
 details.appendChild(E('p','Standard: Når TAB vises, bruges instrumentets notation: Vælg »oktav ned« i tabulaturinstrumentet for at spille en almindelig diskantmelodi en oktav dybere på guitar eller banjo. En eksisterende G-nøgle med 8 under tælles kun én gang. Når TAB skjules, genskabes ABC-kildens notation. Vælg ABC-kildens notation for at slå dette fra. Kildeteksten ændres aldrig.'));
 var rhythmToggle=E('input');rhythmToggle.type='checkbox';rhythmToggle.style.cssText='width:18px;align-self:flex-start;margin:5px 0';rhythmToggle.checked=config.rhythm;field('Nodehalse og rytme',rhythmToggle);rhythmToggle.addEventListener('change',update);details.appendChild(E('p','Viser en rytmelinje under tabs med nodehalse, bjælker, pauser og punkteringer.'));
 var error=E('div');error.className='huwabc-error';error.setAttribute('role','status');details.appendChild(error);box.appendChild(details);parent.appendChild(box);
 function emit(){onChange({'abc-tabs':enabled?'yes':'no','abc-tabs-config':stored(config),'abc-show-notes':showNotes?'yes':'no'},details.open);}
 function update(){try{config=clean({rhythm:rhythmToggle.checked,notation:notationSelect.value,notationExplicit:config.notationExplicit===true,preset:preset.value,tuning:tuning.value,capo:capo.value});count.value=config.notes.length;error.textContent='';[tuning,capo].forEach(function(e){e.removeAttribute('aria-invalid');});emit();}catch(e){error.textContent=e.message+' Den senest gyldige opsætning vises.';tuning.setAttribute('aria-invalid','true');}}
 toggle.addEventListener('change',function(){enabled=toggle.checked;details.hidden=!enabled;notesToggle.disabled=!enabled;if(!enabled){showNotes=true;notesToggle.checked=true;}emit();});
 notesToggle.addEventListener('change',function(){showNotes=notesToggle.checked;emit();});
 preset.addEventListener('change',function(){notationSelect.value='auto';config.notationExplicit=false;if(presets[preset.value]){tuning.value=presets[preset.value].tuning;count.value=parseTuning(tuning.value).length;}update();});
 count.addEventListener('change',function(){preset.value='custom';tuning.value=presets[{4:'bass',5:'bass5',6:'guitar'}[count.value]].tuning;update();});
 tuning.addEventListener('input',function(){preset.value='custom';update();});capo.addEventListener('input',update);
 return {update:function(next){
 config=read(next);enabled=next['abc-tabs']==='yes';showNotes=next['abc-show-notes']!=='no'||!enabled;
 toggle.checked=enabled;notesToggle.checked=showNotes;notesToggle.disabled=!enabled||!available;details.hidden=!enabled;
 preset.value=config.preset;count.value=config.notes.length;tuning.value=config.tuning;capo.value=config.capo;notationSelect.value=config.notation;rhythmToggle.checked=config.rhythm;
 },availability:function(value){available=value;notesToggle.disabled=!enabled||!available;notesToggle.checked=available?showNotes:true;},notationActive:function(){return enabled;},showNotes:function(){return !available||showNotes;},config:function(){return config;},enabled:function(){return enabled;},details:details};
}
exports.view=view;exports.capoForString=capoForString;exports.rhythm=rhythm.render;exports.notation=notation;exports.only=only.layout;exports.finish=finish;exports.fingering=fingering;exports.mount=mount;exports.options=options;exports.read=read;exports.clean=clean;exports.presets=presets;
})();
