import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bundled=JSON.parse(JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8')).text).tiddlers,cache={};
function load(name){if(cache[name])return cache[name];const module={exports:{}};cache[name]=module.exports;
 const local=path.join(root,'plugins/abc/src',name.split('/').at(-1));runInNewContext(existsSync(local)?readFileSync(local,'utf8'):bundled[name].text,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});return cache[name]=module.exports;}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js'),A=load('$:/plugins/huwiki/abc/accompaniment.js');
const source=(body,r='Slow jazz ballad',q='1/4=50')=>`X:1\nT:Ballad regression\nR:${r}\nM:4/4\nL:1/4\nQ:${q}\nK:C\n${body}`;
const notes=t=>(t||[]).filter(e=>e.cmd==='note'&&e.volume>0);
const part=(audio,key)=>notes(audio.tracks.find(t=>t.huwabcPart===key));
const starts=n=>[...new Set(n.map(e=>Math.round(e.start*1e6)/1e6))];
const plain=v=>JSON.parse(JSON.stringify(v));
function render(s,c={}){const tune=ABC.parseOnly(s)[0],prepared=A.prepare(ABC,tune,s,{enabled:true,style:'auto',...c},false,{});return {audio:tune.setUpAudio({}),prepared};}
test('R selects slow ballad, Q beat units refine generic ballad, manual style wins',()=>{
 for(const r of ['Slow jazz ballad','Langsom jazzballade','Jazz ballad'])assert.equal(A.resolve({style:'auto'},source('C4 |',r)).detectedStyle,'slowjazzballad');
 assert.equal(A.resolve({style:'auto'},source('C4 |','Jazz ballad','1/2=50')).detectedStyle,'jazzballad');
 assert.equal(A.resolve({style:'auto'},source('C4 |','Jazz ballad','1/8=100')).detectedStyle,'slowjazzballad');
 assert.equal(A.resolve({style:'auto'},source('C4 |','Swing')).detectedStyle,'swing');
 assert.equal(A.resolve({style:'swing'},source('C4 |')).style,'swing');
 assert.ok(A.compatibleStyles(source('C4 |')).includes('slowjazzballad'));
});
test('sparse sustained harmony follows every written change, including slash bass and N.C.',()=>{
 const {audio}=render(source('"Cmaj7"C4 | "Dm7"D2 "G7/B"B2 | "N.C."z4 | "Fmaj7"F4 |'));
 for(const key of ['bassVolume','chordVolume'])assert.deepEqual(starts(part(audio,key)),[0,1,1.5,3]);
 assert.ok(part(audio,'bassVolume').filter(e=>e.start===1.5).every(e=>e.pitch%12===11));
 assert.ok(part(audio,'chordVolume').filter(e=>e.start===0).every(e=>e.duration>.95),'long chords survive voicing');
 assert.ok(part(audio,'chordVolume').filter(e=>e.start===1).every(e=>e.duration>.45&&e.duration<.5));
 assert.ok(part(audio,'drumVolume').every(e=>e.pitch===44&&e.volume<20),'quiet pedal only');
});
test('variation preserves attack times and density, with no syncopated fills',()=>{
 const s=source(Array(8).fill('"Cmaj7"C4 |').join(' ')),a=render(s,{variation:0}).audio,b=render(s,{variation:100,seed:12}).audio;
 for(const key of ['bassVolume','chordVolume','drumVolume'])assert.deepEqual(starts(part(a,key)),starts(part(b,key)));
 assert.deepEqual(plain(b),plain(render(s,{variation:100,seed:12}).audio));
});
test('pickups, repeats, endings and a real internal modulation preserve melody and duration',()=>{
 const s=source('C |: "Cmaj7"C4 | [1 "G7"G4 :| [2 "Cmaj7"C3 | [K:Eb] G |: "Ebmaj7"G4 | [1 "Bb7"B4 :| [2 "Ebmaj7"E3 |'),{audio,prepared}=render(s),original=ABC.parseOnly(s)[0].setUpAudio({chordsOff:true});
 assert.equal(audio.tempo,original.tempo);assert.equal(audio.totalDuration,original.totalDuration);
 assert.deepEqual(plain(notes(audio.tracks[0])),plain(notes(original.tracks[0])));
 assert.ok(prepared.form.playedBars.length>8);
 for(const key of ['bassVolume','chordVolume','drumVolume'])for(const e of part(audio,key)){assert.ok(e.start>=0&&e.start<audio.totalDuration);assert.ok(e.start+e.duration<=audio.totalDuration+.0001);}
 assert.ok(part(audio,'bassVolume').some(e=>e.pitch%12===3),'modulated E-flat harmony is played');
});
test('silent parts, accompaniment off and sound transposition stay independent of R',()=>{
 const s=source('"Dm7"D4 | "G7"G4 |');
 assert.equal(part(render(s,{enabled:false}).audio,'chordVolume').length,0);
 for(const key of ['bassVolume','chordVolume','drumVolume'])assert.equal(part(render(s,{bassVolume:0,chordVolume:0,drumVolume:0}).audio,key).length,0);
 const a=render(s).audio,b=render(s.replace('K:C','K:C\n%%MIDI transpose 2')).audio;
 const aa=part(a,'bassVolume'),bb=part(b,'bassVolume');assert.equal(aa.length,bb.length);aa.forEach((e,i)=>assert.equal((bb[i].pitch-e.pitch+12)%12,2));
});
