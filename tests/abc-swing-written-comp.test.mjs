import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const bundled=JSON.parse(JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8')).text).tiddlers;
const cache={};
function load(name){
 if(cache[name])return cache[name];const module={exports:{}};cache[name]=module.exports;
 const local=path.join(root,'plugins/abc/src',name.split('/').at(-1));
 runInNewContext(existsSync(local)?readFileSync(local,'utf8'):bundled[name].text,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});
 return cache[name]=module.exports;
}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js'),Accompaniment=load('$:/plugins/huwiki/abc/accompaniment.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const source=body=>`X:1\nT:Written swing figures\nR:Swing\nM:4/4\nL:1/8\nQ:1/4=160\nU:s=!style=rhythm!\nV:G name="Guitar"\n%%MIDI program 26\nK:C\n${body}`;
const regular='"Gm7"sB2 sB2 sB2 sB2 |';
const pushed='"Gm7"z sB z sB2 z sB2 |';
const held='"C7"sB2-sB2 z2 sB2 |';
const notes=track=>(track||[]).filter(n=>n.cmd==='note'&&n.volume>0&&n.duration>0);
function render(abc,config={},mode='written',projected=false){
 const tune=ABC.parseOnly(abc,projected?{visualTranspose:2}:undefined)[0];
 if(projected){tune._huwabcNotationProjected=true;tune.visualTranspose=2;}
 const fields={'abc-source':abc,'abc-rhythm-playback':mode};
 const prepared=Accompaniment.prepare(ABC,tune,abc,{enabled:true,style:'swing',variation:0,chordInstrument:0,...config},false,fields);
 return {audio:tune.setUpAudio({}),prepared};
}
const part=(result,key)=>notes(result.audio.tracks.find(t=>t.huwabcPart===key));
const region=(events,start,end)=>events.filter(n=>n.start>=start-.00002&&n.start<end-.00002);
const shape=events=>plain(events.map(({start,duration,pitch,volume,instrument})=>({start,duration,pitch,volume,instrument})));
function attacks(events){const result=[];for(const n of events.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){let group=result.at(-1);if(!group||Math.abs(group.start-n.start)>.00002){group={start:n.start,duration:n.duration,notes:[]};result.push(group);}group.duration=Math.max(group.duration,n.duration);group.notes.push(n);}return result;}
const starts=events=>attacks(events).map(g=>g.start);
function sameAttacks(actual,expected,message){const a=starts(actual),b=starts(expected);assert.equal(a.length,b.length,message);a.forEach((at,i)=>assert.ok(Math.abs(at-b[i])<.00002,`${message}: ${at} != ${b[i]}`));}

test('four-quarter bars keep free piano comping while pushes use the chart attacks exactly',()=>{
 const abc=source(regular+'\n'+pushed+'\n'+regular);
 const result=render(abc,{variation:100}),free=render(abc,{variation:100},'off');
 const piano=part(result,'chordVolume'),guitar=notes(result.audio.tracks[0]);
 assert.deepEqual(shape(region(piano,0,1)),shape(region(part(free,'chordVolume'),0,1)));
 assert.deepEqual(shape(region(piano,2,3)),shape(region(part(free,'chordVolume'),2,3)));
 sameAttacks(region(piano,1,2),region(guitar,1,2),'written pushes');
 assert.deepEqual(starts(region(piano,1,2)),[1.125,1.375,1.75]);
 assert.ok(region(piano,1,2).every(n=>n.huwabcWrittenRhythm));
 assert.ok(region(piano,0,1).every(n=>!n.huwabcWrittenRhythm));
});

test('ties create one piano attack with the held duration and N.C. stays silent',()=>{
 const result=render(source(regular+'\n'+held+'\n"N.C."z8 |\n'+regular));
 const piano=part(result,'chordVolume'),guitar=notes(result.audio.tracks[0]);
 sameAttacks(region(piano,1,2),region(guitar,1,2),'tied figure');
 assert.deepEqual(starts(region(piano,1,2)),[1,1.75]);
 assert.ok(region(piano,1,2).filter(n=>n.start===1).every(n=>n.duration===.5));
 assert.equal(region(piano,2,3).length,0);
});

test('a tie across a barline keeps its duration and creates no continuation attack',()=>{
 const result=render(source('"Gm7"sB6 sB2- | sB2 z6 |\n'+regular));
 const piano=part(result,'chordVolume'),guitar=notes(result.audio.tracks[0]);
 sameAttacks(region(piano,0,2),region(guitar,0,2),'cross-bar tied figure');
 const held=attacks(piano).find(n=>Math.abs(n.start-.75)<.00002);
 assert.ok(held);assert.equal(held.duration,.5);
 assert.equal(region(piano,1,2).length,0);
});

test('an empty written bar rests the piano even when the harmony continues',()=>{
 const result=render(source(regular+'\n"Gm7"z8 |\n'+regular));
 assert.equal(region(part(result,'chordVolume'),1,2).length,0);
 assert.ok(region(part(result,'bassVolume'),1,2).length>0);
 assert.ok(region(part(result,'drumVolume'),1,2).length>0);
});

test('written piano figures leave melody cues, bass and drums unchanged',()=>{
 const abc=source(regular+'\n'+pushed+'\n"F7"c2 d2 e2 f2 |\n'+regular);
 const config={voiceSettings:{0:{volume:100}}};
 const result=render(abc,config),free=render(abc,config,'off');
 for(const key of ['bassVolume','drumVolume'])assert.deepEqual(shape(part(result,key)),shape(part(free,key)),key);
 const original=ABC.parseOnly(abc)[0].setUpAudio({chordsOff:true});
 assert.deepEqual(shape(region(notes(result.audio.tracks[0]),2,3)),shape(region(notes(original.tracks[0]),2,3)));
 assert.equal(region(part(result,'chordVolume'),2,3).length,0,'melodic cues do not become chord stabs');
});

test('repeats and voltas unfold the written piano exception on the same played bars',()=>{
 const abc=source('|: '+regular+'\n[1 '+pushed.replace(/\|$/,'')+' :| [2 '+held+'\n'+regular);
 const result=render(abc),piano=part(result,'chordVolume'),guitar=notes(result.audio.tracks[0]);
 sameAttacks(region(piano,1,2),region(guitar,1,2),'first ending figure');
 sameAttacks(region(piano,3,4),region(guitar,3,4),'second ending figure');
 assert.deepEqual(starts(region(piano,1,2)),[1.125,1.375,1.75]);
 assert.deepEqual(starts(region(piano,3,4)),[3,3.75]);
 assert.ok(region(piano,0,1).every(n=>!n.huwabcWrittenRhythm));
 assert.ok(region(piano,2,3).every(n=>!n.huwabcWrittenRhythm));
});

test('pickups and short final bars follow the actual written figures without padding',()=>{
 const result=render(source('"Gm7"sB2 |\n'+pushed+'\n"F7"sB2 z2 |'));
 const piano=part(result,'chordVolume'),guitar=notes(result.audio.tracks[0]);
 assert.equal(result.audio.totalDuration,1.75);
 sameAttacks(piano,guitar,'pickup and short ending');
 assert.deepEqual(starts(piano),[0,.375,.625,1,1.25]);
 assert.ok(piano.every(n=>n.start+n.duration<=1.75002));
});

test('written piano timing and independent voicings survive MIDI and wind transposition',()=>{
 const abc=source(regular+'\n'+pushed+'\n'+held);
 const original=render(abc),midi=render(abc.replace('K:C','%%MIDI transpose 2\nK:C')),bb=render(abc,{},'written',true);
 const piano=part(original,'chordVolume'),transposed=part(midi,'chordVolume');
 assert.equal(piano.length,transposed.length);
 piano.forEach((n,i)=>{assert.equal(transposed[i].pitch,n.pitch+2);assert.equal(transposed[i].start,n.start);assert.equal(transposed[i].duration,n.duration);});
 assert.deepEqual(shape(part(bb,'chordVolume')),shape(piano));
 const guitar=notes(original.audio.tracks[0]),written=region(piano,1,2);
 for(const group of attacks(written)){const match=attacks(guitar).find(g=>Math.abs(g.start-group.start)<.00002);assert.ok(match);assert.ok(Math.max(...group.notes.map(n=>n.pitch))>Math.max(...match.notes.map(n=>n.pitch)),'piano retains its brighter independent shell');}
});

test('explicit arpeggios and generated guitar retain their selected rhythm',()=>{
 const abc=source(regular+'\n'+pushed+'\n'+regular);
 for(const config of [{chordInstrument:26},{chords:'arpeggio'}]){
  const actual=render(abc,config),free=render(abc,config,'off');
  assert.deepEqual(shape(part(actual,'chordVolume')),shape(part(free,'chordVolume')));
 }
});


test('written chart figures survive a manual guitar-to-piano timbre change',()=>{
 const result=render(source(regular+'\n'+pushed+'\n'+held+'\n"Gm7"z8 |'),{voiceSettings:{0:{instrument:0}}});
 const piano=part(result,'chordVolume'),writtenVoice=notes(result.audio.tracks[0]);
 sameAttacks(region(piano,1,3),region(writtenVoice,1,3),'the written guitar role survives mixer timbre changes');
 assert.equal(region(piano,3,4).length,0);
 assert.ok(region(piano,1,3).every(n=>n.huwabcWrittenRhythm));
});
