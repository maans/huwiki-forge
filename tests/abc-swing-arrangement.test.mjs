import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const bundled=JSON.parse(JSON.parse(readFileSync(path.join(root,'plugins/abc/dist/plugin.json'),'utf8')).text).tiddlers;
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const module={exports:{}};cache[name]=module.exports;
 const local=path.join(root,'plugins/abc/src',name.split('/').at(-1));
 const source=existsSync(local)?readFileSync(local,'utf8'):bundled[name].text;
 runInNewContext(source,{module,exports:module.exports,require:load,console,setTimeout,clearTimeout});
 return cache[name]=module.exports;
}
const ABC=load('$:/plugins/huwiki/abc/vendor/abcjs.js');
const Jazz=load('$:/plugins/huwiki/abc/jazz-engine.js');
const Swing=load('$:/plugins/huwiki/abc/swing-voicings.js');
const Accompaniment=load('$:/plugins/huwiki/abc/accompaniment.js');
const MeterMap=load('$:/plugins/huwiki/abc/meter-map.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const notes=track=>(track||[]).filter(e=>e.cmd==='note'&&e.volume>0&&e.duration>0);
const part=(audio,name)=>notes(audio.tracks.find(track=>track.huwabcPart===name));
const within=(events,start,end)=>events.filter(event=>event.start>=start-.001&&event.start<end-.001);
const source=(body,tempo=120)=>`X:1\nT:Swing arrangement\nR:Swing\nM:4/4\nL:1/4\nQ:1/4=${tempo}\nK:C\n${body}`;
function render(abc,config={}){
 const tune=ABC.parseOnly(abc)[0];
 const prepared=Accompaniment.prepare(ABC,tune,abc,{enabled:true,style:'swing',variation:0,...config},false,{});
 return {audio:tune.setUpAudio({}),prepared};
}
function played(abc){
 const tune=ABC.parseOnly(abc)[0],audio=tune.setUpAudio({chordsOff:true});
 return MeterMap.build(ABC,tune,abc,audio).bars;
}

const sections=source('P:A\n"C7"C4 | C4 |\nP:B\n"F7"F4 | F4 |\nP:A\n"C7"C4 | C4 |');

test('explicit A/B/A sections coordinate walking bass and a fuller drum feel, then return',()=>{
 const {audio,prepared}=render(sections);
 assert.deepEqual(plain(prepared.form.sections.map(s=>[s.start,s.end,s.id])),[[0,2,'A'],[2,4,'B'],[4,6,'A']]);
 const bass=part(audio,'bassVolume'),drums=part(audio,'drumVolume');
 assert.equal(within(bass,0,2).length,4);
 assert.equal(within(bass,2,4).length,8);
 assert.equal(within(bass,4,6).length,4);
 assert.ok(within(drums,2,4).length>within(drums,0,2).length,'B changes actual drum activity');
 assert.equal(within(drums,4,6).length,within(drums,0,2).length);
 assert.equal(audio.tempo,120);
 const expected=ABC.parseOnly(sections)[0].setUpAudio({chordsOff:true});
 assert.deepEqual(plain(notes(audio.tracks[0])),plain(notes(expected.tracks[0])));
 assert.equal(audio.totalDuration,expected.totalDuration);
});

test('the explicit two/four feel controls override section and fast-tempo variation',()=>{
 for(const [feel,count] of [['two',2],['four',4]]){
  const {audio}=render(sections.replace('1/4=120','1/4=200'),{feel,variation:100});
  const bass=part(audio,'bassVolume');
  for(let bar=0;bar<6;bar++)assert.equal(within(bass,bar,bar+1).length,count,`${feel}, bar ${bar}`);
 }
});

test('part labels follow unfolded repeats and voltas without treating ending 2 as B',()=>{
 const abc=source('P:A\n|: "C7"C4 | [1 D4 :| [2 E4 ||\nP:B\n|: "G7"G4 :|\nP:A\n"C7"C4 |');
 const bars=played(abc),form=Jazz.form(abc,bars.length,{num:4,den:4},'auto',bars);
 assert.deepEqual(plain(bars.map((_,i)=>Jazz.sectionAt(form,i).id)),['A','A','A','A','B','B','A']);
 const misleading=source('V:B name="Bass"\n|: "C7"C4 | [1 D4 :| [2 E4 |');
 const misleadingBars=played(misleading),unmarked=Jazz.form(misleading,misleadingBars.length,{num:4,den:4},'auto',misleadingBars);
 assert.ok(misleadingBars.every((_,i)=>Jazz.sectionAt(unmarked,i).id==='A'));
});

test('descriptive part labels retain their letter while numeric rehearsal labels do not invent a bridge',()=>{
 const abc=source('[P:A · Head] "C7"C4 | [P:C · Sax / guitar] "G7"G4 | [P:A] "C7"C4 |');
 const bars=played(abc),form=Jazz.form(abc,bars.length,{num:4,den:4},'auto',bars);
 assert.deepEqual(plain(bars.map((_,i)=>Jazz.sectionAt(form,i).id)),['A','C','A']);
 const numbered=source('[P:1] "C7"C4 | C4 | [P:2] "G7"G4 | G4 |');
 const numberedBars=played(numbered),unmarked=Jazz.form(numbered,numberedBars.length,{num:4,den:4},'auto',numberedBars);
 assert.ok(numberedBars.every((_,i)=>Jazz.sectionAt(unmarked,i).id==='A'));
});

test('pickup and short final bars keep accompaniment inside the actual playback duration',()=>{
 const abc=source('P:A\n"C7"C | C4 |\nP:B\n"G7"G4 |\nP:A\n"Cmaj7"C2 |');
 const {audio,prepared}=render(abc,{variation:50});
 assert.equal(audio.totalDuration,2.75);
 assert.deepEqual(plain(prepared.form.playedBars.map(bar=>[bar.start,bar.end])),[[0,.25],[.25,1.25],[1.25,2.25],[2.25,2.75]]);
 assert.deepEqual(plain(prepared.form.playedBars.map((_,i)=>Jazz.sectionAt(prepared.form,i).id)),['A','A','B','A']);
 for(const key of ['bassVolume','chordVolume','drumVolume'])for(const event of part(audio,key)){
  assert.ok(event.start>=0&&event.start<audio.totalDuration,`${key} attack stays inside the tune`);
  assert.ok(event.start+event.duration<=audio.totalDuration+.0001,`${key} release stays inside the tune`);
 }
});

test('fast unmarked swing varies feel by complete phrases and repeats deterministically',()=>{
 const form=Jazz.form('',16,{num:4,den:4},'FREE');
 const config={swing:true,tempo:160,variation:100,seed:7,feel:'form'};
 const feelings=Array.from({length:16},(_,bar)=>Jazz.feelAt(form,bar,config));
 assert.ok(feelings.includes('two')&&feelings.includes('four'));
 for(let start=0;start<16;start+=4)assert.ok(feelings.slice(start,start+4).every(feel=>feel===feelings[start]));
 assert.deepEqual(feelings,Array.from({length:16},(_,bar)=>Jazz.feelAt(form,bar,config)));
 assert.ok(Array.from({length:16},(_,bar)=>Jazz.feelAt(form,bar,{...config,tempo:159})).every(feel=>feel==='two'));
});

test('piano comping leaves space, varies motifs, and remains sparse at faster tempos',()=>{
 const events=[];
 for(let tick=0;tick<16*8;tick++)for(const pitch of [48,52,58])events.push({cmd:'note',start:tick/8,pitch,volume:60,duration:.125,huwabcHarmonyStart:tick/8});
 const form=Jazz.form('',16,{num:4,den:4},'FREE');form.chords=[{start:0,name:'C7'}];
 const config={swing:true,tempo:120,chordInstrument:0,variation:100,seed:7,feel:'two'};
 const output=Jazz.comp(events,{num:4,den:4},form,config,'swing','piano phrase');
 assert.deepEqual(plain(output),plain(Jazz.comp(events,{num:4,den:4},form,config,'swing','piano phrase')));
 const attacks=[...new Set(output.map(event=>Math.round(event.start*1000)/1000))];
 const patterns=Array.from({length:16},(_,bar)=>within(attacks.map(start=>({start})),bar,bar+1).map(e=>Math.round((e.start-bar)*8)).join(','));
 assert.ok(new Set(patterns).size>=3,'phrases contain different rhythmic cells');
 assert.ok(patterns.some(pattern=>!pattern.split(',').includes('0')),'some downbeats are left open');
 assert.ok(attacks.length<16*4,'piano does not duplicate a four-to-the-bar guitar');
 assert.ok(output.some(event=>event.duration>.2),'occasional chords can ring longer');
 const fast=Jazz.comp(events,{num:4,den:4},form,{...config,tempo:200},'swing','piano phrase');
 assert.ok(new Set(fast.map(event=>Math.round(event.start*1000)/1000)).size<=attacks.length,'fast comping uses no more attacks');
});

test('N.C. silences generated piano and bass, and drum mute remains effective',()=>{
 const abc=source('"C7"C4 | "N.C."z4 | "G7"G4 | "Cmaj7"C4 |');
 const {audio}=render(abc,{variation:100,drums:'off'});
 assert.equal(part(audio,'drumVolume').length,0);
 assert.equal(part(render(abc,{drumVolume:0}).audio,'drumVolume').length,0,'zero drum volume remains silent');
 for(const key of ['bassVolume','chordVolume'])assert.equal(within(part(audio,key),1,2).length,0,key);
});

test('swing guitar articulation retains note velocity while the mixer owns its level',()=>{
 const plan=Swing.plan([{start:0,name:'C7'}]);
 const events=[48,52,58].map(pitch=>({cmd:'note',start:0,duration:.25,pitch,volume:80,instrument:26}));
 const voiced=Swing.voice(events,plan,{guitar:true,pulse:true});
 assert.deepEqual(plain(voiced.map(event=>event.pitch)),plain(plan[0].voicing.shell));
 assert.deepEqual(plain(voiced.map(event=>event.volume)),[70,61,61]);
 assert.ok(voiced.every(event=>Math.abs(event.duration-.155)<.0001));
});

test('clicked swing rhythm heads and chord symbols use the same pitches and levels as playback',()=>{
 const abc=source('U:s=!style=rhythm!\nV:G name="Guitar"\n%%MIDI program 26\n"Gm7"sB sB sB sB | "N.C."sB sB sB sB |');
 const tune=ABC.parseOnly(abc)[0];
 Accompaniment.prepare(ABC,tune,abc,{style:'swing'},true,{'abc-rhythm-playback':'written'});
 const audio=tune.setUpAudio({});
 const events=tune.lines.flatMap(l=>(l.staff||[]).flatMap(s=>(s.voices||[]).flat())).filter(e=>e.style==='rhythm');
 for(const event of events){
  const when=Array.isArray(event.currentTrackWholeNotes)?event.currentTrackWholeNotes[0]:event.currentTrackWholeNotes;
  const expected=notes(audio.tracks[0]).filter(n=>Math.abs(n.start-when)<.004).map(n=>({...n,huwabcPreviewPart:'voice:0'}));
  assert.deepEqual(plain(event.midiPitches),plain(expected));
  assert.deepEqual(plain(Accompaniment.rhythmAudition(tune,event.startChar)),plain(expected));
 }
 assert.equal(events[4].midiPitches.length,0,'N.C. also stays silent when clicked');
 assert.equal(Accompaniment.rhythmAudition(tune,-123),null,'ordinary chord previews can retain their existing fallback');
});

test('written shell position and level follow the effective mixer instrument',()=>{
 const abc=source('U:s=!style=rhythm!\nV:G name="Guitar"\n%%MIDI program 0\n"Gm7"sB sB sB sB |');
 function first(sourceText,config){const tune=ABC.parseOnly(sourceText)[0];Accompaniment.prepare(ABC,tune,sourceText,{style:'swing',...config},true,{'abc-rhythm-playback':'written'});return notes(tune.setUpAudio({}).tracks[0]).filter(n=>n.start===0);}
 const guitar=first(abc,{voiceSettings:{0:{instrument:26}}});
 const originalGuitar=first(abc.replace('program 0','program 26'),{});
 const sound=ns=>ns.map(({pitch,volume,instrument,start,duration})=>({pitch,volume,instrument,start,duration}));
 assert.deepEqual(plain(sound(guitar)),plain(sound(originalGuitar)));
 const piano=first(abc.replace('program 0','program 26'),{voiceSettings:{0:{instrument:0}}});
 const originalPiano=first(abc,{});
 assert.deepEqual(plain(sound(piano)),plain(sound(originalPiano)));
 assert.ok(guitar.every(n=>n.volume>60));assert.ok(piano.every(n=>n.volume>60));
});


test('swing guitar defaults to a real 50% mixer gain, retaining dynamics and explicit saved levels',()=>{
 const abc=source('U:s=!style=rhythm!\nV:G name="Guitar"\n%%MIDI program 26\n!p!"Gm7"sB sB sB sB | !f!"C7"sB sB sB sB |');
 const fields={'abc-source':abc,'abc-rhythm-playback':'written','abc-accompaniment':'{"style":"swing"}'};
 const config=Accompaniment.read(fields);
 assert.equal(config.voiceSettings[0].volume,50);
 assert.equal(Accompaniment.channelGain('voice:0',config),.5);
 function renderAt(live,c=config){const tune=ABC.parseOnly(abc)[0];Accompaniment.prepare(ABC,tune,abc,c,live,fields);return {tune,audio:tune.setUpAudio({})};}
 const live=renderAt(true),exported=renderAt(false),liveNotes=notes(live.audio.tracks[0]),exportedNotes=notes(exported.audio.tracks[0]);
 assert.equal(liveNotes.length,exportedNotes.length);
 assert.ok(liveNotes.some(n=>n.start>=1&&n.volume>liveNotes[0].volume),'written dynamics survive the mixer change');
 for(let i=0;i<liveNotes.length;i++)assert.ok(Math.abs(exportedNotes[i].volume-liveNotes[i].volume*.5)<=1,'nonlive gain is applied once');
 const saved=Accompaniment.read({...fields,'abc-accompaniment':JSON.stringify({style:'swing',voiceSettings:{0:{volume:75}}})});
 assert.equal(saved.voiceSettings[0].volume,75);assert.equal(Accompaniment.channelGain('voice:0',saved),.75);
 const full=Accompaniment.read({...fields,'abc-accompaniment':JSON.stringify({style:'swing',voiceSettings:{0:{volume:100}}})});
 assert.equal(Accompaniment.channelGain('voice:0',full),1,'an explicitly saved 100% remains a user choice');
 const selectedGuitar=Accompaniment.read({...fields,'abc-source':abc.replace('program 26','program 0'),'abc-accompaniment':JSON.stringify({style:'swing',melodyInstrument:'26'})});
 assert.equal(Accompaniment.channelGain('voice:0',selectedGuitar),.5,'a guitar chosen in the instrument selector gets the same default');
 const muted=Accompaniment.read({...fields,'abc-accompaniment':JSON.stringify({style:'swing',voiceSettings:{0:{mode:'mute'}}})});
 assert.equal(muted.voiceSettings[0].volume,50);assert.equal(Accompaniment.channelGain('voice:0',muted),0);
 const piano=Accompaniment.read({...fields,'abc-source':abc.replace('program 26','program 0')});
 assert.equal(Accompaniment.channelGain('voice:0',piano),1,'piano keeps its independent full mixer level');
 const notSwing=Accompaniment.read({...fields,'abc-source':abc.replace('R:Swing','R:Bossa'),'abc-accompaniment':'{"style":"bossa"}'});
 assert.equal(Accompaniment.channelGain('voice:0',notSwing),1,'other guitar styles keep their existing defaults');
});

test('clicked guitar previews route through an actual half-gain voice bus and respect mute',async()=>{
 const gains=[],initial=[];
 const ctx={currentTime:0,sampleRate:48000,state:'running',destination:{},resume:async()=>{},
  createGain(){const gain={gain:{value:1,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}};gains.push(gain);return gain;},
  createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}};
 class Synth{
  constructor(){this.duration=.01;this.audioBuffers=[];}
  async init(params){this.flattened=params.sequence;initial.push(params.sequence);return {loaded:[],error:[]};}
  async prime(){this.audioBuffers=[{length:1,numberOfChannels:1,getChannelData:()=>Float32Array.of(.25)}];return {status:'ready'};}
  stop(){} start(){this._kickOffSound(0);}
 }
 const fakeABC={synth:{CreateSynth:Synth,activeAudioContext:()=>ctx,registerAudioContext(){}}};
 const dependencies={
  '$:/plugins/huwiki/abc/accompaniment.js':Accompaniment,
  '$:/plugins/huwiki/abc/audio-sequence.js':{notesFromSequence(sequence){return sequence.tracks.flatMap(track=>track.filter(n=>n.cmd==='note').map(n=>({...n,part:track.huwabcVoice!==undefined?'voice:'+track.huwabcVoice:(track.huwabcPart||'melodyVolume')})));}},
  '$:/plugins/huwiki/abc/reserve-runtime.js':{},'$:/plugins/huwiki/abc/tinysynth-renderer.js':{}
 };
 const reserve={};runInNewContext(readFileSync(path.join(root,'plugins/abc/src/reserve-mixer.js'),'utf8'),{exports:reserve,require:name=>dependencies[name],setTimeout,clearTimeout,setInterval,clearInterval,console});
 let config=Accompaniment.clean({voiceSettings:{0:{volume:50}}});
 const sample={pitch:43,volume:92,instrument:26,duration:.15,huwabcPreviewPart:'voice:0'};
 await reserve.audition(fakeABC,[sample],null,{getConfig:()=>config,engineMode:'original'});
 assert.equal(initial.at(-1).tracks[0].huwabcVoice,'0');
 assert.equal(initial.at(-1).tracks[0][1].volume,92,'preview note velocity is not reduced a second time');
 assert.equal(gains.at(-1).gain.value,.5,'real post-render voice GainNode receives half amplitude');
 config=Accompaniment.clean({voiceSettings:{0:{volume:50,mode:'mute'}}});
 await reserve.audition(fakeABC,[sample],null,{getConfig:()=>config,engineMode:'original'});
 assert.equal(gains.at(-1).gain.value,0,'the same preview voice bus respects mute');
 reserve.stopAuditions();
});
