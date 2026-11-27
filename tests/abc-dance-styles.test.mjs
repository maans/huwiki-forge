import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bundled=JSON.parse(JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8')).text).tiddlers,cache={};
function load(name){
 if(cache[name])return cache[name];const module={exports:{}};cache[name]=module.exports;
 const local=path.join(root,'plugins/abc/src',name.split('/').at(-1));
 runInNewContext(existsSync(local)?readFileSync(local,'utf8'):bundled[name].text,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});
 return cache[name]=module.exports;
}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js'),A=load('$:/plugins/huwiki/abc/accompaniment.js');
const plain=v=>JSON.parse(JSON.stringify(v));
const notes=t=>(t||[]).filter(e=>e.cmd==='note'&&e.volume>0);
const part=(audio,key)=>notes(audio.tracks.find(t=>t.huwabcPart===key));
const starts=events=>[...new Set(events.map(e=>Math.round(e.start*1e6)/1e6))];
const abc=(meter,rhythm,body,title='Dance style')=>`X:1\nT:${title}\nR:${rhythm}\nM:${meter}\nL:1/4\nQ:1/4=120\nK:C\n${body}`;
function render(source,config={},fields={}){
 const tune=ABC.parseOnly(source)[0],prepared=A.prepare(ABC,tune,source,{enabled:true,style:'auto',variation:0,...config},false,fields);
 return {audio:tune.setUpAudio({}),prepared};
}
test('auto selection uses jazz and meter, preserving ordinary folk waltz and explicit choices',()=>{
 for(const rhythm of ['Jazz waltz','Jazzvals','Vals jazz','Jazz','Swing'])assert.equal(A.resolve({style:'auto'},abc('3/4',rhythm,'C3 |')).detectedStyle,'jazzwaltz');
 assert.equal(A.resolve({style:'auto'},abc('3/4','Vals','C3 |')).detectedStyle,'waltz');
 assert.equal(A.resolve({style:'auto'},abc('3/4','Vals','C3 |'),{'abc-genre':'Jazz'}).detectedStyle,'jazzwaltz');
 for(const rhythm of ['Tango','Tango nuevo','Piazzolla'])for(const meter of ['4/4','2/4','2/2']){
  assert.equal(A.resolve({style:'auto'},abc(meter,rhythm,'C2 |')).detectedStyle,'piazzolla-tango');
  assert.ok(A.compatibleStyles(abc(meter,rhythm,'C2 |')).includes('piazzolla-tango'));
 }
 assert.equal(A.resolve({style:'auto'},abc('4/4','','C4 |','Libertango')).detectedStyle,'piazzolla-tango');
 assert.equal(A.resolve({style:'auto'},abc('3/4','Tango vals','C3 |')).detectedStyle,'waltz');
 assert.equal(A.resolve({style:'waltz'},abc('3/4','Jazz waltz','C3 |')).style,'waltz');
});
test('jazz waltz has three bass beats, lightly swung ride, pedal 2 and 3 and no rock backbeat',()=>{
 const source=abc('3/4','Jazz waltz','"Dm7"D3 | "G7"G3 | "Cmaj7"C3 | C3 |');
 const {audio,prepared}=render(source);assert.equal(prepared.detectedStyle,'jazzwaltz');
 assert.deepEqual(starts(part(audio,'bassVolume')).slice(0,3),[0,.25,.5]);
 const drums=part(audio,'drumVolume').filter(e=>e.start<.75);
 assert.deepEqual(starts(drums.filter(e=>e.pitch===44)),[.25,.5]);
 assert.ok(starts(drums.filter(e=>e.pitch===51)).includes(.416667),'triplet skip on beat 2 and');
 assert.ok(!drums.some(e=>e.pitch===38),'no snare backbeat');
 assert.ok(part(audio,'chordVolume').length>0);
 assert.deepEqual(plain(notes(audio.tracks[0])),plain(notes(ABC.parseOnly(source)[0].setUpAudio({chordsOff:true}).tracks[0])));
});
test('Piazzolla ostinato follows 3+3+2 with short chords and no default drum kit',()=>{
 const {audio,prepared}=render(abc('4/4','Tango','"Cm"C4 | "G7"G4 |'));
 assert.equal(prepared.detectedStyle,'piazzolla-tango');
 for(const key of ['bassVolume','chordVolume'])assert.deepEqual(starts(part(audio,key)).filter(n=>n<1),[0,.375,.75]);
 assert.ok(part(audio,'chordVolume').every(n=>n.duration<=.091));
 assert.equal(part(audio,'drumVolume').length,0);
 assert.deepEqual([...new Set(part(audio,'bassVolume').filter(n=>n.start<1).map(n=>n.pitch%12))],[0]);
});
test('tango slash bass stays on the pedal instead of adding a second fifth',()=>{
 const {audio}=render(abc('4/4','Tango','"D/C"C4 | "Dm7b5/C"C4 |'));
 assert.ok(part(audio,'bassVolume').length>=6);
 assert.ok(part(audio,'bassVolume').every(e=>e.pitch%12===0),JSON.stringify(part(audio,'bassVolume')));
});
test('tango handles half-bar chord changes, N.C. and transposition',()=>{
 const source=abc('4/4','Tango','"Cm"C2 "G7"G2 | "N.C."C4 | "Fm"F4 |');
 const {audio}=render(source),bass=part(audio,'bassVolume');
 assert.ok(bass.filter(e=>e.start<.5).every(e=>e.pitch%12===0));
 assert.ok(bass.filter(e=>e.start>=.5&&e.start<1).every(e=>e.pitch%12===7));
 for(const key of ['bassVolume','chordVolume'])assert.equal(part(audio,key).filter(e=>e.start>=1&&e.start<2).length,0);
 const shifted=render(source.replace('K:C','K:C\n%%MIDI transpose 2')).audio;
 assert.ok(part(shifted,'bassVolume').filter(e=>e.start<.5).every(e=>e.pitch%12===2));
});
test('pickups, repeats, voltas and short ending keep both grooves inside real played bars',()=>{
 for(const [meter,rhythm,body] of [
  ['3/4','Jazz waltz','"Dm7"D |: D3 | [1 "G7"G3 :| [2 "Cmaj7"C2 |'],
  ['4/4','Tango','"Cm"C |: C4 | [1 "G7"G4 :| [2 "Cm"C3 |']]){
  const source=abc(meter,rhythm,body),{audio,prepared}=render(source,{variation:75});
  assert.ok(prepared.form.playedBars?.length>=5);
  for(const key of ['bassVolume','chordVolume','drumVolume'])for(const e of part(audio,key)){
   assert.ok(e.start>=0&&e.start<audio.totalDuration);
   assert.ok(e.start+e.duration<=audio.totalDuration+.0001,`${rhythm}: ${key} release`);
  }
 }
});
test('optional tango marcato varies the bass by a complete phrase and is deterministic',()=>{
 const source=abc('4/4','Tango',Array(8).fill('"Cm"C4 |').join(' '));
 const {audio}=render(source,{variation:80,seed:42});
 assert.equal(part(audio,'bassVolume').filter(e=>e.start>=3&&e.start<4).length,4);
 assert.deepEqual(starts(part(audio,'chordVolume')).filter(e=>e>=3&&e<4),[3,3.375,3.75]);
 assert.deepEqual(plain(audio),plain(render(source,{variation:80,seed:42}).audio));
});
test('style choices preserve source melody, tempo and manual mute or accompaniment off',()=>{
 for(const [meter,rhythm,body] of [['3/4','Jazz waltz','"Dm7"D3 | "G7"G3 |'],['4/4','Tango','"Cm"C4 | "G7"G4 |']]){
  const source=abc(meter,rhythm,body),{audio}=render(source),original=ABC.parseOnly(source)[0].setUpAudio({chordsOff:true});
  assert.equal(audio.tempo,original.tempo);assert.equal(audio.totalDuration,original.totalDuration);
  assert.deepEqual(plain(notes(audio.tracks[0])),plain(notes(original.tracks[0])));
  assert.equal(part(render(source,{bassVolume:0,chordVolume:0,drumVolume:0}).audio,'bassVolume').length,0);
  assert.equal(part(render(source,{enabled:false}).audio,'chordVolume').length,0);
 }
});
test('reviewed Helles Libertango now selects Piazzolla automatically',()=>{
 const fields={'abc-source':abc('4/4','Tango nuevo','C |: \"Cm\"C4 | \"D/C\"C4 | \"Dm7b5/C\"C4 | \"G7\"G4 :|','Libertango'),'abc-accompaniment':JSON.stringify({enabled:false,style:'auto'})};
 const {audio,prepared}=render(fields['abc-source'],JSON.parse(fields['abc-accompaniment']),fields);
 assert.equal(prepared.detectedStyle,'piazzolla-tango');
 const active=render(fields['abc-source'],{enabled:true},fields);
 assert.ok(part(active.audio,'bassVolume').length>20);
 assert.ok(part(active.audio,'chordVolume').length>20);
 assert.equal(part(audio,'chordVolume').length,0,'loading a score does not turn accompaniment on');
});

test('legacy swing in 3/4 becomes jazz waltz in the saved UI config and actual playback',()=>{
 const source=abc('3/4','','"Eb"E3 | "Abmaj7"A3 |','Bluesette'),fields={'abc-source':source,'abc-accompaniment':'{"enabled":true,"style":"swing"}'};
 assert.equal(A.read(fields).style,'jazzwaltz');
 const {audio,prepared}=render(source,{style:'swing'},fields);
 assert.equal(prepared.detectedStyle,'jazzwaltz');
 assert.deepEqual(starts(part(audio,'drumVolume').filter(e=>e.pitch===44&&e.start<.75)),[.25,.5]);
});
test('normalized tango cells play in 2/4 and 2/2 without changing melody duration',()=>{
 for(const [meter,count,length] of [['2/4',2,.5],['2/2',4,1]]){
  const source=abc(meter,'Tango',`"Cm"C${count} | "G7"G${count} |`),{audio}=render(source);
  assert.deepEqual(starts(part(audio,'bassVolume')).filter(t=>t<length),[0,length*3/8,length*6/8]);
  assert.equal(audio.totalDuration,length*2);
 }
});
