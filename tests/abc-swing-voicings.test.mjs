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

test('written guitar and generated piano share the same harmonic plan',()=>{
 const abc=source('"Dm7"sB sB sB sB | "G7"sB sB sB sB | "Cmaj7"sB sB sB sB |');
 const result=audio(abc,{enabled:true,chords:'beats',chordInstrument:0,bass:'off',drums:'off'});
 const guitar=groups(result.tracks[0]),piano=groups(result.tracks.find(t=>t.huwabcPart==='chordVolume'));
 for(const g of piano){const match=guitar.find(n=>Math.abs(n[0].start-g[0].start)<.004);assert.ok(match);assert.deepEqual(g.map(n=>n.pitch),match.map(n=>n.pitch));}
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

test('repeats, rests, tied hits and N.C. survive; explicitly written cues stay unchanged',()=>{
 const abc=source('Z2 |: "Dm7"sB sB z sB | "G7"sB-sB sB sB :| "Cmaj7"C D E F | "N.C."sB sB sB sB |');
 const result=audio(abc,{}, {'abc-rhythm-playback':'written'}),actual=notes(result.tracks[0]);
 assert.ok(actual.every(n=>n.start>=2&&n.start<7));
 const attacks=Array.from(new Set(actual.filter(n=>n.start<6).map(n=>n.start)));
 assert.deepEqual(attacks,[2,2.25,2.75,3,3.5,3.75,4,4.25,4.75,5,5.5,5.75]);
 assert.equal(actual.find(n=>n.start===3).duration,.5);assert.equal(actual.find(n=>n.start===5).duration,.5);
 const reference=notes(ABC.parseOnly(abc)[0].setUpAudio({chordsOff:true}).tracks[0]).filter(n=>n.start>=6&&n.start<7);
 assert.deepEqual(plain(actual.filter(n=>n.start>=6&&n.start<7)),plain(reference));
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
