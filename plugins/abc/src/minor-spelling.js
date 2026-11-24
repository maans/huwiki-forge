/*\
title: $:/plugins/huwiki/abc/minor-spelling.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var Model=require('$:/plugins/huwiki/abc/editor-model.js');
var letters='CDEFGAB',accidentals={sharp:1,flat:-1,natural:0,dblsharp:2,dblflat:-2};
function pc(n){return (n%12+12)%12;}
// A major dominant's third is the minor key's raised seventh: D# in Em,
// C# in Dm, E# in F#m. Imported F-natural must not force Eb/Db after capo.
// This is a spelling rule for that harmonic context, never a global sharp bias.
function apply(tune){
 var states={},changed=false;
 (tune.lines||[]).forEach(function(line){(line.staff||[]).forEach(function(staff,si){
  if(staff.isTabStaff||staff.clef&&/perc|TAB/.test(staff.clef.type))return;
  (staff.voices||[]).forEach(function(voice,vi){
   var state=states[si+':'+vi]||(states[si+':'+vi]={bar:{},chord:null}),records=[],dirty=false;
   function key(k){state.key={};(k&&k.accidentals||[]).forEach(function(a){state.key[a.note.toUpperCase()]=accidentals[a.acc]||0;});
    state.minor=!!k&&k.mode==='m';state.root=k?letters.indexOf(k.root):-1;state.tonic=state.root>=0?pc(Model.midi(state.root,0)+(k.acc==='#'?1:k.acc==='b'?-1:0)):null;}
   function flush(){
    if(dirty){var written={};records.forEach(function(r){var letter=letters[(r.d%7+7)%7],expected=written[r.d]===undefined?(r.key[letter]||0):written[r.d];
     if(r.acc===expected)delete r.p.accidental;else{r.p.accidental=Object.keys(accidentals).find(function(a){return accidentals[a]===r.acc;});written[r.d]=r.acc;}
     r.p.verticalPos+=(r.d-r.p.pitch);r.p.pitch=r.d;
     r.p.name=(r.p.accidental?(r.acc>0?'^'.repeat(r.acc):r.acc<0?'_'.repeat(-r.acc):'='):'')+Model.name(r.d);
    });changed=true;}
    records=[];dirty=false;
   }
   key(staff.key);
   voice.forEach(function(event){
    if(event.el_type==='bar'){flush();state.bar={};return;}
    if(event.el_type==='key'){flush();state.bar={};key(event);return;}
    var chord=(event.chord||[]).find(function(c){return !c.position||c.position==='default';});
    if(chord)state.chord=Model.chordInfo(chord.name);
    (event.pitches||[]).forEach(function(p){
     var d=p.pitch,letter=letters[(d%7+7)%7],explicit=accidentals[p.accidental];
     var acc=explicit===undefined?(state.bar[d]===undefined?(state.key[letter]||0):state.bar[d]):explicit;
     if(explicit!==undefined)state.bar[d]=acc;
     var n=Model.midi(d,acc),c=state.chord,next=d,nextAcc=acc;
     if(state.minor&&c&&!c.rootOnly&&c.root===pc(state.tonic+7)&&pc(n)===pc(state.tonic-1)&&c.midi.some(function(m){return pc(m)===pc(n);})){ 
      var seventh=(state.root+6)%7,octave=Math.round((n-Model.midi(seventh,0))/12);
      next=seventh+7*octave;nextAcc=n-Model.midi(next,0);
      if(next!==d&&Math.abs(nextAcc)<=2)dirty=true;else{next=d;nextAcc=acc;}
     }
     records.push({p:p,d:next,acc:nextAcc,key:Object.assign({},state.key)});
    });
   });flush();
  });
 });});
 if(changed)tune._huwabcNotationProjected=true;
 return tune;
}
exports.apply=apply;
})();
