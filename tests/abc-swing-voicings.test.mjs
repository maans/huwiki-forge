import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const payload=JSON.parse(JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8')).text).tiddlers;
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const module={exports:{}};cache[name]=module.exports;
 const local=path.join(root,'plugins/abc/src',name.split('/').at(-1));
 const source=existsSync(local)?readFileSync(local,'utf8'):payload[name].text;
 runInNewContext(source,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});
 return cache[name]=module.exports;
}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js');
const Swing=load('$:/plugins/huwiki/abc/swing-voicings.js');
const Accompaniment=load('$:/plugins/huwiki/abc/accompaniment.js');
const plain=x=>JSON.parse(JSON.stringify(x));
const notes=track=>track.filter(e=>e.cmd==='note'&&e.volume>0&&Number.isFinite(e.duration)&&e.duration>0);
const pcs=ns=>Array.from(new Set(ns.map(n=>((typeof n==='number'?n:n.pitch)%12+12)%12))).sort((a,b)=>a-b);
const progression=(names,options)=>Swing.plan(names.map((name,start)=>({name,start})),options);
const source=body=>`X:1\nT:Swing shells\nR:Swing\nM:4/4\nL:1/4\nQ:1/4=120\nU:s=!style=rhythm!\nV:G clef=treble name="Guitar"\n%%MIDI program 26\nK:C\n${body}`;
function audio(abc,config={},fields={},projected=false){
 const tune=ABC.parseOnly(abc)[0];if(projected)tune._huwabcNotationProjected=true;
 Accompaniment.prepare(ABC,tune,abc,{enabled:false,style:'swing',variation:0,...config},false,fields);
 return tune.setUpAudio({});
}
function groups(track){const result=[];for(const n of notes(track)){let group=result.find(g=>Math.abs(g[0].start-n.start)<.004);if(!group){group=[];result.push(group);}group.push(n);}return result;}

for(const startOrder of ['137','173'])test(`ii–V–I exchanges thirds/sevenths from ${startOrder}`,()=>{
 const plan=progression(['Dm7','G7','Cmaj7'],{startOrder});
 assert.deepEqual(plain(plan.map(p=>p.voicing.order)),startOrder==='137'?['137','173','137']:['173','137','173']);
 assert.deepEqual(plain(plan.map(p=>pcs(p.voicing.tones))),[[0,2,5],[5,7,11],[0,4,11]]);
 for(let i=1;i<plan.length;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(plan[i].voicing.guides[j]-plan[i-1].voicing.guides[j])<=1);
});

test('Cmaj7 → C6 → Am7 → Dm7 closes the requested turnaround',()=>{
 const plan=progression(['Dm7','G7','Cmaj7','C6','Am7','Dm7'],{startOrder:'137'});
 assert.deepEqual(plain(plan.map(p=>p.voicing.tones)),[[50,53,60],[43,53,59],[48,52,59],[48,52,57],[45,55,60],[50,53,60]]);
 assert.deepEqual(plain(plan.map(p=>p.pianoVoicing.tones)),[[50,60,65],[43,59,65],[48,59,64],[48,57,64],[45,60,67],[50,60,65]]);
});

for(const startOrder of ['137','173'])test(`stepwise roots retain ${startOrder} in either direction`,()=>{
 const plan=progression(['Dm7','Em7','Fm7','Em7','Dm7'],{startOrder});
 assert.ok(plan.every(p=>p.voicing.order===startOrder));
});

test('all keys support both shell families without changing harmony',()=>{
 for(const name of ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'])for(const quality of ['m7','7','maj7','6']){
  const h=Swing.chord(name+quality),choices=Swing.candidates(h);
  for(const order of ['137','173'])assert.ok(choices.some(c=>c.order===order),name+quality+' '+order);
  for(const c of choices){assert.deepEqual(pcs(c.tones),pcs([h.root,h.root+h.third,h.root+h.companion]));assert.ok(c.tones.every(n=>n>=40&&n<=69));}
 }
});

test('triads, sixths, suspensions, alterations and slash bass retain their identities',()=>{
 for(const [name,expected] of [['C',[0,4,7]],['Cm',[0,3,7]],['C6',[0,4,9]],['C6/9',[0,2,4,9]],['Cadd9',[0,2,4,7]],['C7sus4',[0,5,10]],['C7b9',[0,1,4,10]],['Cm7b5',[0,3,6,10]],['Cdim7',[0,3,6,9]],['C/E',[0,4,7]]]){
  const p=progression([name])[0];assert.ok(p.voicing,name);assert.deepEqual(pcs(p.voicing.tones),expected,name);
  if(name==='C/E')assert.equal(p.voicing.tones[0]%12,4);
 }
 assert.equal(Swing.chord('N.C.'),null);assert.equal(Swing.chord('Break'),undefined);
});

test('ordinary swing accompaniment uses shells while the written melody stays intact',()=>{
 const abc=source('"Dm7"C D E F | "G7"G A B c | "Cmaj7"d c B A |');
 const expected=notes(ABC.parseOnly(abc)[0].setUpAudio({chordsOff:true}).tracks[0]);
 const result=audio(abc,{enabled:true,chords:'beats',bass:'off',drums:'off'});
 assert.deepEqual(plain(notes(result.tracks[0])),plain(expected));
 const comp=groups(result.tracks.find(t=>t.huwabcPart==='chordVolume'));
 assert.ok(comp.length>=3);for(const g of comp){assert.equal(g.length,3);assert.deepEqual(pcs(g),g[0].start<1? [0,2,5]:g[0].start<2?[5,7,11]:[0,4,11]);}
});

test('written guitar uses the lower shell and generated piano the brighter position',()=>{
 const abc=source('"Dm7"sB sB sB sB | "G7"sB sB sB sB | "Cmaj7"sB sB sB sB |');
 const result=audio(abc,{enabled:true,chords:'beats',chordInstrument:0,bass:'off',drums:'off'});
 const guitar=groups(result.tracks[0]),piano=groups(result.tracks.find(t=>t.huwabcPart==='chordVolume'));
 for(const g of piano){const match=guitar.find(n=>Math.abs(n[0].start-g[0].start)<.004);assert.ok(match);assert.deepEqual(g.map(n=>n.pitch),[match[0].pitch,match[2].pitch,match[1].pitch+12]);}
 const [one,two,three,four]=guitar;
 assert.ok(one[0].duration>two[0].duration&&three[0].duration>four[0].duration);
 assert.ok(one[0].volume/one[1].volume>two[0].volume/two[1].volume);
 assert.ok(two[1].volume>one[1].volume&&four[1].volume>three[1].volume);
});

test('guitar retains its swing voicings with backing off, bossa backing and concert projection',()=>{
 const abc=source('"Dm7"sB sB sB sB | "G7"sB sB sB sB |');
 const variants=[audio(abc),audio(abc,{enabled:true}),audio(abc,{enabled:true,style:'bossa',chordInstrument:4}),audio(abc,{}, {},true)];
 for(const result of variants.slice(1))assert.deepEqual(plain(notes(result.tracks[0])),plain(notes(variants[0].tracks[0])));
});

test('repeats, rests, tied hits and N.C. survive; written cues retain pitch and timing at the mixer level',()=>{
 const abc=source('Z2 |: "Dm7"sB sB z sB | "G7"sB-sB sB sB :| "Cmaj7"C D E F | "N.C."sB sB sB sB |');
 const result=audio(abc,{}, {'abc-rhythm-playback':'written'}),actual=notes(result.tracks[0]);
 assert.ok(actual.every(n=>n.start>=2&&n.start<7));
 const attacks=Array.from(new Set(actual.filter(n=>n.start<6).map(n=>n.start)));
 assert.deepEqual(attacks,[2,2.25,2.75,3,3.5,3.75,4,4.25,4.75,5,5.5,5.75]);
 assert.equal(actual.find(n=>n.start===3).duration,.5);assert.equal(actual.find(n=>n.start===5).duration,.5);
 const reference=notes(ABC.parseOnly(abc)[0].setUpAudio({chordsOff:true}).tracks[0]).filter(n=>n.start>=6&&n.start<7);
 assert.deepEqual(plain(actual.filter(n=>n.start>=6&&n.start<7)),plain(reference.map(n=>({...n,volume:Math.round(n.volume*.5)}))));
 assert.ok(actual.every(n=>n.instrument===26));
});

test('non-swing charts keep the original rhythm-head realization',()=>{
 const abc=source('"Dm7"sB sB sB sB |').replace('R:Swing','R:Bossa');
 const reference=ABC.parseOnly(abc)[0].setUpAudio({gchord:'z',bassvol:0,chordvol:0}).tracks[0];
 assert.deepEqual(plain(notes(audio(abc,{style:'bossa'}).tracks[0])),plain(notes(reference)));
});

test('explicit MIDI transposition moves guitar and generated shells together',()=>{
 const abc=source('"Dm7"sB sB sB sB | "G7"sB sB sB sB |');
 const config={enabled:true,bass:'off',drums:'off',chords:'beats'};
 const before=audio(abc,config),after=audio(abc.replace('K:C','%%MIDI transpose 2\nK:C'),config);
 for(const key of [0,'chordVolume']){
  const a=notes(typeof key==='number'?before.tracks[key]:before.tracks.find(t=>t.huwabcPart===key));
  const b=notes(typeof key==='number'?after.tracks[key]:after.tracks.find(t=>t.huwabcPart===key));
  assert.equal(a.length,b.length);assert.deepEqual(b.map(n=>n.pitch),a.map(n=>n.pitch+2));
 }
});

test('pickup positions keep the guitar accents on the written beats',()=>{
 const abc=source('"Dm7"sB | sB sB sB sB |');
 const played=groups(audio(abc).tracks[0]);
 assert.equal(played[1][0].start,.25);assert.ok(played[1][0].duration>played[2][0].duration);
 assert.ok(played[1][0].volume/played[1][1].volume>played[2][0].volume/played[2][1].volume);
});

test('inline MIDI transposition follows repeated source positions',()=>{
 const abc=source('|: "Dm7"sB sB sB sB | [I:MIDI transpose 2] "G7"sB sB sB sB :|');
 const result=audio(abc,{enabled:true,chords:'beats',bass:'off',drums:'off'});
 for(const track of [result.tracks[0],result.tracks.find(t=>t.huwabcPart==='chordVolume')]){
  for(const g of groups(track)){const bar=Math.floor(g[0].start+.001);assert.deepEqual(pcs(g),bar%2===0?[0,2,5]:[1,7,9]);}
 }
});

test('an explicitly selected arpeggio keeps its separate attacks',()=>{
 const abc=source('"Dm7"C D E F |');
 const result=audio(abc,{enabled:true,chords:'arpeggio',bass:'off',drums:'off'});
 const comp=groups(result.tracks.find(t=>t.huwabcPart==='chordVolume'));
 assert.ok(comp.length>1);assert.ok(comp.every(g=>g.length===1));
});

test('piano adds colours above the shell; Freddie Green guitar plays only the shell',()=>{
 for(const [name,shell,colour] of [['C9',[0,4,10],2],['C7b9',[0,4,10],1],['C7#9',[0,4,10],3],['C13',[0,4,10],9],['C7b5',[0,4,10],6],['C7#11',[0,4,10],6],['C7#5',[0,4,10],8],['C7b13',[0,4,10],8]]){
  const abc=source(`"${name}"sB sB sB sB |`);
  const result=audio(abc,{enabled:true,chords:'beats',chordInstrument:0,bass:'off',drums:'off'});
  const guitar=groups(result.tracks[0])[0],piano=groups(result.tracks.find(t=>t.huwabcPart==='chordVolume'))[0];
  assert.equal(guitar.length,3,name);assert.deepEqual(pcs(guitar),shell,name);
  assert.deepEqual(pcs(piano.slice(0,3)),shell,name);
  assert.ok(piano[2].pitch>guitar[2].pitch,name+': piano keeps its higher working register');
  assert.equal(piano.at(-1).pitch%12,colour,name);assert.ok(piano.at(-1).pitch>Math.max(...piano.slice(0,3).map(n=>n.pitch)),name);
 }
});

test('both shell families retain their harmony and register separation in every key',()=>{
 for(const root of ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'])for(const quality of ['m7','7','maj7','6','dim7','7b9','13'])for(const startOrder of ['137','173']){
  const row=progression([root+quality],{startOrder})[0],g=row.voicing,p=row.pianoVoicing;
  assert.equal(p.bass%12,g.bass%12);assert.notEqual(p.order,g.order);
  assert.deepEqual(pcs(p.shell),pcs(g.shell));
  assert.equal(p.guides[0]%12,g.guides[1]%12);assert.equal(p.guides[1]%12,g.guides[0]%12);
  assert.ok(p.guides[1]>g.guides[1],'piano retains its higher register independently of guitar bass octave');
  assert.deepEqual(pcs(p.tones),pcs(g.tones));
 }
});

test('written piano and generated guitar use the same instrument-specific positions',()=>{
 const abc=source('"Dm7"sB sB sB sB | "G7"sB sB sB sB | "Cmaj7"sB sB sB sB |');
 const original=audio(abc,{enabled:true,chords:'beats',chordInstrument:0,bass:'off',drums:'off'});
 const swapped=audio(abc.replace('%%MIDI program 26','%%MIDI program 0'),{enabled:true,chords:'beats',chordInstrument:26,bass:'off',drums:'off'});
 for(const [a,b] of [[original.tracks[0],swapped.tracks.find(t=>t.huwabcPart==='chordVolume')],[original.tracks.find(t=>t.huwabcPart==='chordVolume'),swapped.tracks[0]]])assert.deepEqual(groups(a).map(g=>g.map(n=>n.pitch)),groups(b).map(g=>g.map(n=>n.pitch)));
});

test('diminished guitar chords use root, minor third and sixth in either spread',()=>{
 for(const name of ['Cdim','Cdim7','C°','Co'])for(const startOrder of ['137','173']){
  const p=progression([name],{startOrder})[0];
  assert.deepEqual(pcs(p.voicing.shell),[0,3,9]);
  assert.deepEqual(plain(p.voicing.shell.map(n=>(n-p.voicing.shell[0])%12)),startOrder==='137'?[0,3,9]:[0,9,3]);
 }
});


test('Easy Money keeps its lower guitar opening when later harmony favours a higher global path',()=>{
 // The chart's first seventeen harmony changes reproduced the whole-chart
 // register drift: previously its final F pulled the initial Gm7 up to G3.
 const changes='Gm7 C7 Am7 D7 Gm7 C7 F6 Gm7 Am7 D7 Gm7 C7 Am7 D7 Gm7 C7 F'.split(' ');
 for(const names of [['Gm7','F'],changes,changes.concat(changes)]){
  const plan=progression(names);
  assert.deepEqual(plain(plan[0].voicing.tones),[43,53,58]);
  assert.deepEqual(plain(plan[0].pianoVoicing.tones),[55,65,70],'the lower guitar policy must not lower the established piano opening');
  assert.ok(plan.every(row=>row.voicing.bass<=52),'later changes must not make this guitar phrase drift into a higher bass octave');
  for(let i=0;i<names.length;i++)if(names[i]==='Gm7')assert.deepEqual(plain(plan[i].voicing.tones),[43,53,58]);
 }
 const plan=progression(changes);
 assert.deepEqual(plain(plan.slice(0,4).map(row=>row.voicing.tones)),[[43,53,58],[48,52,58],[45,55,60],[50,54,60]]);
});

test('an explicit higher starting family remains available after the lower guitar default',()=>{
 assert.deepEqual(plain(progression(['Gm7','C7'],{startOrder:'137'})[0].voicing.tones),[55,58,65]);
 assert.deepEqual(plain(progression(['Gm7','C7'],{startOrder:'173'})[0].voicing.tones),[43,53,58]);
});
