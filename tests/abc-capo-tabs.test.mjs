import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const pkg=JSON.parse(await readFile(new URL('../plugins/abc/dist/plugin.json',import.meta.url),'utf8'));
const entries=JSON.parse(pkg.text).tiddlers,prefix='$:/plugins/huwiki/abc/';
function environment(){
 const cache={};
 function load(name){if(cache[name])return cache[name];const exports={};cache[name]=exports;
  if(name==='i18n.js')return cache[name]={language:()=> 'da'};
  const module={exports};runInNewContext(entries[prefix+name].text,{exports,module,window:{},require:id=>load(id.slice(prefix.length))});
  return cache[name]=module.exports;
 }
 return {view:load('instrument-view.js'),tabs:load('tabs.js'),abc:load('vendor/abcjs.js'),notation:load('notation.js'),accompaniment:load('accompaniment.js'),planner:load('repeat-plan.js')};
}
test('Capo and wind notation combine without changing the original ABC or MIDI pitches',()=>{
 const {view,abc}=environment(),source='X:1\nT:Capo test\nM:4/4\nL:1/4\nK:D\n"D"D E F G | A B c d |';
 const baseline=JSON.stringify(abc.parseOnly(source)[0].setUpAudio());
 for(const instrument of Object.keys(view.profiles))for(const capo of [0,1,2,5,8]){
  view.change(instrument);view.setCapo(capo);
  const state=view.current();assert.equal(state.semitones,view.profiles[instrument].semitones-capo);
  assert.equal(JSON.stringify(abc.parseOnly(source,{visualTranspose:state.semitones})[0].setUpAudio()),baseline,instrument+' capo '+capo);
  assert.equal(view.soundingPitches([60+state.semitones])[0],60);
 }
 assert.equal(view.setCapo(9),false);assert.equal(view.setCapo(-1),false);
});
test('TAB applies the capo exactly once and leaves saved source fields intact',()=>{
 const {view,tabs}=environment(),fields={'abc-tabs':'no'},before=JSON.stringify(fields);
 view.setTab('guitar');view.setCapo(2);
 const {config,enabled}=tabs.view(fields);assert.equal(enabled,true);assert.equal(config.capo,2);
 // Concert E4 is written D4 for capo 2; the high E string is now F#4,
 // so a lower string must be used. Every result must reconstruct E4.
 const written=64+view.current().semitones,positions=tabs.fingering([written],config.notes,config.capo);
 assert.ok(positions);for(const p of positions)assert.equal(config.notes[config.notes.length-1-p.str]+config.capo+p.num-view.current().semitones,64);
 assert.equal(JSON.stringify(fields),before);
 view.setTab('off');assert.equal(tabs.view(fields).enabled,false);
});
test('Physical string assignment supports reentrant banjo and charango without changing course order',()=>{
 const {tabs,view,notation}=environment();
 for(const preset of ['guitar','ukulele','tenorbanjo','irishbanjo','mandolin','banjo5','charango']){
  view.setTab(preset);view.setCapo(2);const c=tabs.view({}).config;
  assert.ok([4,5,6].includes(c.notes.length));
  const offsets=c.notes.map((_,i)=>tabs.capoForString(c,i));
  const pitches=c.notes.map((n,i)=>n+offsets[i]);
  const frets=tabs.fingering(pitches,c.notes,c.capo,offsets);assert.ok(frets,preset);
  assert.equal(new Set(frets.map(p=>p.str)).size,c.notes.length);
  frets.forEach((p,i)=>{const index=c.notes.length-1-p.str;assert.equal(c.notes[index]+offsets[index]+p.num,pitches[i]);});
  assert.equal(c.notes[0],tabs.read({'abc-tabs-config':JSON.stringify({preset,tuning:tabs.presets[preset].tuning})}).notes[0]+view.current().semitones);
 }
 view.setTab('banjo5');const c=tabs.view({}).config;
 assert.equal(tabs.capoForString(c,0),0,'short drone stays at g without a separate spike');
 assert.equal(tabs.capoForString(c,1),2);
});
test('Shared distribution contains all versioned reading, TAB and engraving modules',async()=>{
 for(const name of ['instrument-view.js','tabs.js','notation.js','transposed-layout.js','minimal-player.js','score-widget.js']){
  assert.equal(entries[prefix+name].text,await readFile(new URL('../plugins/abc/src/'+name,import.meta.url),'utf8'));
 }
});

test('TAB clefs, capo and repeats keep concert audio and note seeking across real score voices',async()=>{
 const songs=JSON.parse(await readFile(new URL('../editions/silba-atno-repertoire/tiddlers/repertoire.json',import.meta.url),'utf8'));
 const real=songs.find(s=>s.title.includes('Brudmarch'))['abc-source'];
 const polyphonic='X:1\nM:4/4\nL:1/4\n%%score (1) (2)\nV:1 clef=treble\nV:2 clef=bass\nK:C\n[V:1] |: e f g a | [1 b a g e :| [2 d e f g |\n[V:2] |: C, D, E, F, | [1 G, F, E, C, :| [2 D, E, F, G, |';
 const {view,tabs,abc,notation,accompaniment,planner}=environment();
 const config={style:'custom',enabled:false,bass:'off',chords:'off',drums:'off'};
 function audio(tune,source){accompaniment.prepare(abc,tune,source,config,false,{});return JSON.stringify(tune.setUpAudio({chordsOff:true}));}
 for(const source of [real,polyphonic,polyphonic.replaceAll('|:','|').replaceAll(':|','|').replaceAll('[1','').replaceAll('[2','')]){
  const baseline=audio(abc.parseOnly(source)[0],source),count=planner.collect(abc.parseOnly(source)[0]).voices.length;
  for(const preset of ['guitar','ukulele','tenorbanjo','irishbanjo','mandolin','banjo5','charango'])for(const instrument of ['c','tenor'])for(const capo of [0,2,8]){
   view.change(instrument);view.setCapo(capo);view.setTab(preset);
   const tune=abc.parseOnly(source,{visualTranspose:view.current().semitones})[0];
   notation.project(abc,tune,tabs.view({}).config,true);
   // ABCJS appends AST TAB staves with clef.type=TAB, without isTabStaff.
   tune.lines.forEach(l=>{if(l.staff)l.staff=l.staff.flatMap(s=>[s,{clef:{type:'TAB'},voices:[[]]}]);});
   assert.equal(planner.collect(tune).voices.length,count);
   assert.equal(audio(tune,source),baseline,preset+' '+instrument+' capo '+capo);
   const notes=planner.collect(tune).voices.flatMap(v=>v.measures.flatMap(m=>m.events.filter(e=>e.el_type==='note'&&e.pitches)));
   assert.ok(notes.every(n=>n.midiPitches&&n.currentTrackMilliseconds!==undefined),'displayed notes retain concert pitches and seek times');
  }
 }
});

test('Banjo melody uses the long strings and stopped fifth-string chords use physical fret numbers',()=>{
 const {view,tabs}=environment();view.setTab('banjo5');
 for(const capo of [0,2,5,8]){
  view.setCapo(capo);const c=tabs.view({}).config;
  const offsets=c.notes.map((_,i)=>tabs.capoForString(c,i));
  const positions=pitches=>tabs.fingering(pitches.map(n=>n+c.viewTranspose),c.notes,capo,offsets,true);
  for(const midi of [67,68,69,72,76,81])assert.notEqual(positions([midi])[0].str,4);
  const longOpen=c.notes.slice(1).map(n=>n-c.viewTranspose+capo);
  for(const [midi,physicalFret] of [[67,0],[68,6],[69,7]]){
   // The four other pitches occupy the four long strings at their lowest frets.
   const chord=positions([...longOpen,midi]);
   const short=chord.find(n=>n.str===4);
   assert.ok(short);
   if(capo===0)assert.equal(short.num,physicalFret);
   assert.ok(short.num===0||short.num>5);
   assert.equal(67+(short.num===0?0:short.num-5),[...longOpen,midi][short.index]);
  }
 }
});
test('Guitar reads written E5 as open E4, including a staff already marked treble-8',()=>{
 const {abc,notation,tabs}=environment();
 const config=Object.assign(tabs.clean({preset:'guitar'}),{lowerOctave:true});
 for(const clef of ['treble','treble-8']){
  const tune=abc.parseOnly('X:1\nL:1/4\nK:C clef='+clef+'\ne4 |')[0];
  const staff=tune.lines[0].staff[0],note=staff.voices[0].find(e=>e.pitches).pitches[0];
  const before=note.pitch;notation.project(abc,tune,config,true);
  assert.equal(note.pitch,before);
  assert.equal(notation.shift(staff.clef),-12);
  assert.equal(note.name,'e');
  const position=tabs.fingering([76+notation.shift(staff.clef)],config.notes,0)[0];
  assert.equal(position.str,0);assert.equal(position.num,0);
 }
});

test('Purim Niggun is playable on the four long banjo strings at concert pitch',async()=>{
 const {abc,tabs}=environment();
 const scores=JSON.parse(await readFile(new URL('../editions/silba-atno-repertoire/tiddlers/repertoire.json',import.meta.url),'utf8'));
 const source=scores.find(s=>s.title.endsWith('Purim Niggun'))['abc-source'];
 const pitches=abc.parseOnly(source)[0].setUpAudio({chordsOff:true}).tracks[0].filter(e=>e.cmd==='note').map(e=>e.pitch);
 const open=tabs.clean({preset:'banjo5',tuning:tabs.presets.banjo5.tuning}).notes;
 assert.ok(pitches.length>100);
 for(const pitch of pitches){
  const pos=tabs.fingering([pitch],open,0,null,true)[0];
  assert.ok(pos.str<4);assert.equal(open[4-pos.str]+pos.num,pitch);
 }
});

test('Optional lower registers preserve tunings, lower heard notes once and leave the bass and backing in place',()=>{
 const {abc,accompaniment,notation,tabs,view}=environment();
 for(const kind of ['guitar','tenorbanjo','irishbanjo','banjo5'])for(const clef of ['treble','treble-8']){
  const source='X:1\nM:4/4\nL:1/4\n%%score (1) (2)\nV:1 clef='+clef+'\nV:2 clef=bass\nK:C\n[V:1] |: "C"{d}e g e2 :|\n[V:2] |: C,4 :|';
  view.setTab(kind+'-low');const c=tabs.view({}).config;
  assert.equal(c.preset,kind);assert.equal(c.tuning,tabs.presets[kind].tuning);
  const tune=abc.parseOnly(source)[0];notation.project(abc,tune,c,true);
  const settings={enabled:true,style:'pop',bass:'pulse',chords:'offbeat',drums:'pop'};
  function audio(t){return accompaniment.prepare(abc,t,source,settings,false,{}).tune.setUpAudio({});}
  const normal=audio(abc.parseOnly(source)[0]),actual=audio(tune);
  assert.deepEqual(actual.tracks[0].filter(e=>e.cmd==='note').map(e=>e.pitch),
   normal.tracks[0].filter(e=>e.cmd==='note').map(e=>e.pitch-(clef==='treble'?12:0)));
  assert.equal(JSON.stringify(actual.tracks.slice(1)),JSON.stringify(normal.tracks.slice(1)));
  view.setTab(kind);assert.equal(tabs.view({}).config.lowerOctave,false);
 }
});
