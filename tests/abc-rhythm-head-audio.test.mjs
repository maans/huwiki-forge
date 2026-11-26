import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const plugin=JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const tiddlers=JSON.parse(plugin.text).tiddlers;
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const module={exports:{}};cache[name]=module.exports;
 const source=name==='$:/plugins/huwiki/abc/accompaniment.js'
  ?readFileSync(path.join(root,'plugins/abc/src/accompaniment.js'),'utf8'):tiddlers[name].text;
 runInNewContext(source,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});
 return cache[name]=module.exports;
}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js');
const Accompaniment=load('$:/plugins/huwiki/abc/accompaniment.js');
const source=`X:1
T:Rhythm guitar
M:4/4
L:1/4
Q:1/4=126
U:s=!style=rhythm!
V:G clef=treble name="Guitar"
%%MIDI program 26
K:C
Z2 |: "C7"sB sB z sB | "F6"sB-sB sB sB :|
"G7"sB sB sB sB | "N.C."sB sB sB sB |`;
const notes=track=>track.filter(e=>e.cmd==='note'&&e.volume>0);
const shape=track=>JSON.stringify(notes(track).map(({pitch,start,duration,instrument,volume})=>({pitch,start,duration,instrument,volume})));

for(const live of [false,true])test(`Written rhythm guitar survives accompaniment off/on (live=${live})`,()=>{
 const reference=ABC.parseOnly(source)[0].setUpAudio({gchord:'z',bassvol:0,chordvol:0}).tracks[0];
 for(const enabled of [false,true]){
  const tune=ABC.parseOnly(source)[0];
  Accompaniment.prepare(ABC,tune,source,{enabled,style:'swing'},live,{});
  const audio=tune.setUpAudio({});
  assert.ok(notes(audio.tracks[0]).length>20);
  assert.equal(shape(audio.tracks[0]),shape(reference));
  assert.ok(notes(audio.tracks[0]).every(e=>e.start>=2));
  assert.ok(notes(audio.tracks[0]).every(e=>e.instrument===26));
  for(const bus of ['bassVolume','chordVolume','drumVolume']){
   const tracks=audio.tracks.filter(t=>t.huwabcPart===bus);
   if(enabled||live)assert.ok(tracks.some(t=>notes(t).length>0),bus);
   else assert.equal(tracks.length,0);
  }
  assert.equal(Accompaniment.channelGain('voice:0',{enabled:false}),1);
  assert.equal(Accompaniment.channelGain('chordVolume',{enabled:false}),0);
 }
});

test('Rhythm head arrangement remains stable on reconfiguration and concert projection',()=>{
 const tune=ABC.parseOnly(source)[0];tune._huwabcNotationProjected=true;
 let previous;
 for(let i=0;i<3;i++){
  Accompaniment.prepare(ABC,tune,source,{enabled:true,style:'swing'},true,{});
  const audio=tune.setUpAudio({});
  const current=JSON.stringify(audio.tracks.map(t=>({bus:t.huwabcPart,notes:shape(t)})));
  if(previous)assert.equal(current,previous);
  previous=current;
 }
});

test('Ordinary melody and chord charts retain their original notes',()=>{
 for(const body of ['"C"C D E F | "F"G A B c |','"C"z4 | "F"z4 |']){
  const abc='X:1\nM:4/4\nL:1/4\nK:C\n'+body;
  const expected=ABC.parseOnly(abc)[0].setUpAudio({chordsOff:true}).tracks[0];
  const tune=ABC.parseOnly(abc)[0];
  Accompaniment.prepare(ABC,tune,abc,{enabled:true,style:'swing'},true,{});
  const audio=tune.setUpAudio({});
  assert.equal(shape(audio.tracks[0]),shape(expected));
  assert.ok(audio.tracks.some(t=>t.huwabcPart==='chordVolume'&&notes(t).length));
 }
});

test('Mixed melody scores do not acquire automatic stabs; explicit guitar charts retain written hits and cues',()=>{
 const abc=source.replace('"G7"sB sB sB sB','"G7"C D E F');
 for(const written of [false,true]){
  const tune=ABC.parseOnly(abc)[0];
  const expected=ABC.parseOnly(abc)[0].setUpAudio(written?{gchord:'z',bassvol:0,chordvol:0}:{chordsOff:true}).tracks[0];
  Accompaniment.prepare(ABC,tune,abc,{enabled:false,style:'swing'},false,written?{'abc-rhythm-playback':'written'}:{});
  const audio=tune.setUpAudio({});
  assert.equal(shape(audio.tracks[0]),shape(expected));
  if(!written)assert.equal(notes(audio.tracks[0]).length,4);
 }
});

test('Written guitar rhythm is independent of the backing style, instrument and chord bus',()=>{
 const results=[];
 for(const style of ['swing','bossa']){
  const tune=ABC.parseOnly(source)[0];
  Accompaniment.prepare(ABC,tune,source,{enabled:true,style,chordInstrument:4},true,{});
  const audio=tune.setUpAudio({});
  results.push(shape(audio.tracks[0]));
  assert.ok(notes(audio.tracks[0]).every(e=>e.instrument===26));
  const chords=audio.tracks.filter(t=>t.huwabcPart==='chordVolume');
  assert.equal(chords.length,1);
  assert.ok(chords.flatMap(notes).every(e=>e.instrument===4));
 }
 assert.equal(results[0],results[1]);
});
