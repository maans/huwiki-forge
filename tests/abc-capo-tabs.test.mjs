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
 return {view:load('instrument-view.js'),tabs:load('tabs.js'),abc:load('vendor/abcjs.js'),notation:load('notation.js')};
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
