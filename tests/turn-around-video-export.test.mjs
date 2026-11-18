import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const production=JSON.parse(readFileSync(new URL('../editions/turn-around/tiddlers/production.json',import.meta.url),'utf8'));
const filmTitle='Turn Around · Complete performance (film)';
const film=JSON.parse(production.find(row=>row.title===filmTitle).text);
const overlays=JSON.parse(readFileSync(new URL('../editions/turn-around/tiddlers/video-export.json',import.meta.url),'utf8'));
const overlay=overlays.find(row=>row.title==='$:/plugins/maans/plato/video-export.js');

function fixture({present=true,missingPlugin=false}={}){
 const sliders={Speech:{value:'0.7'},Singing:{value:'0.6'},Music:{value:'0.4'}};
 const stage={},controls={},calls=[],attached=[],state={position:12,paused:0,destroyed:0,disposed:0};
 const sourceClips=structuredClone(film.musical.audioClips),sourceFilm=structuredClone(film);
 const player={
  pause(){state.paused++;},seek(value){state.position=value;return Promise.resolve();},time(){return state.position;},
  getTimeline(){return {filmTitle,title:'Turn Around — Beyond the Cave',duration:481.377,scenes:sourceFilm.scenes,
   audioClips:sourceClips.map(clip=>({...clip}))};},destroy(){state.destroyed++;}
 };
 const host={nodeType:1,_platoPlayer:player,connected:present,
  matches(selector){return selector==='.plato-player';},
  querySelector(selector){
   if(selector==='.plato-screen')return stage;
   if(selector==='.plato-options')return controls;
   for(const label of Object.keys(sliders))if(selector===`.plato-level[aria-label="${label}, volume"]`)return sliders[label];
   return null;
  },querySelectorAll(){return [];}
 };
 let notify,disconnected=false;
 class Observer{
  constructor(callback){notify=callback;}
  observe(target,settings){calls.push({target,settings});}
  disconnect(){disconnected=true;}
 }
 const body={nodeType:1,querySelectorAll(){return host.connected?[host]:[];},contains(element){return element===host&&host.connected;}};
 const document={body,defaultView:{MutationObserver:Observer}},wiki={};
 const exports={};
 vm.runInNewContext(overlay.text,{exports,document,$tw:{wiki},Map,Object,Number,Array,Error,
  require(name){
   if(missingPlugin)throw Error('Plugin unavailable');
   if(name==='$:/plugins/huwiki/animus-video-export/runtime.js')return {attach(options){attached.push(options);return {dispose(){state.disposed++;}};}};
   if(name==='$:/plugins/huwiki/cutout/engine.js')return {readScene(w,title){assert.equal(w,wiki);assert.equal(title,filmTitle);return sourceFilm;}};
   throw Error('Unexpected dependency: '+name);
  }
 },{filename:'plato/video-export.js'});
 const cleanup=exports.startup();
 return {host,player,sliders,stage,controls,calls,attached,state,sourceClips,sourceFilm,exports,cleanup,
  notify(records=[]){notify?.(records);},isDisconnected(){return disconnected;}};
}

test('Turn Around adapter attaches the shared exporter to the actual audience player',async()=>{
 assert.equal(overlay['module-type'],'startup');
 const f=fixture(),options=f.attached[0];
 assert.equal(f.attached.length,1);
 assert.equal(options.host,f.host);assert.equal(options.stage,f.stage);assert.equal(options.controls,f.controls);
 assert.equal(options.position(),12);assert.equal(options.duration(),481.377);
 await options.seek(17.25);assert.equal(f.state.position,17.25);
 options.pause();assert.equal(f.state.paused,1);
 assert.equal(options.getSongs().length,0,'recorded instrumentation must not be doubled by ABC synthesis');
 assert.equal(options.getABC(),null);
 assert.equal(f.calls.length,1,'discover future audience players without polling');
});

test('Turn Around preserves native clip timing and routes the real recorded sources with mixer gains once',()=>{
 const f=fixture(),before=JSON.stringify(f.sourceFilm),beforeClips=JSON.stringify(f.sourceClips);
 const output=f.attached[0].scene;
 assert.equal(output.name,'Turn Around — Beyond the Cave');
 assert.deepEqual(output.musical.audioClips.reduce((counts,clip)=>{counts[clip.kind]=(counts[clip.kind]||0)+1;return counts;},{}),
  {speech:87,sfx:7,music:14,song:4});
 const expectedGains={speech:0.7,song:0.6,music:0.4,sfx:0.4};
 assert.equal(output.musical.audioClips.length,f.sourceClips.length);
 for(let i=0;i<f.sourceClips.length;i++){
  const original=f.sourceClips[i],copy=output.musical.audioClips[i];
  assert.notEqual(copy,original);
  for(const property of ['id','asset','start','duration','offset','sourceDuration','muted','kind'])
   assert.equal(copy[property],original[property],`${original.id} preserves ${property}`);
  assert.equal(copy.volume,original.volume*expectedGains[original.kind]);
 }
 const music=output.musical.audioClips.find(clip=>clip.id==='music-s01');
 assert.equal(music.volume,0.2,'clip 0.5 times Music mixer 0.4, exactly once');
 assert.ok(Math.abs(output.musical.audioClips.find(clip=>clip.id==='foley-s01').volume-0.32)<1e-12);
 assert.ok(output.musical.songs.every(clip=>clip.muted),'the actual demo uses recorded instrumental takes');
 assert.equal(JSON.stringify(f.sourceFilm),before,'export does not save into or mutate the project');
 assert.equal(JSON.stringify(f.sourceClips),beforeClips);
 f.sliders.Music.value='0.2';
 assert.equal(f.attached[0].scene.musical.audioClips.find(clip=>clip.id==='music-s01').volume,0.1,'new export reads current mixer');
});

test('Turn Around adapter attaches future player renders once and disposes a removed player',()=>{
 const f=fixture({present:false});
 assert.equal(f.attached.length,0);
 f.host.connected=true;f.notify([{addedNodes:[f.host]}]);
 assert.equal(f.attached.length,1);
 f.notify([{addedNodes:[f.host]}]);assert.equal(f.attached.length,1,'no duplicate export buttons');
 f.host.connected=false;f.notify([{addedNodes:[]}]);
 assert.equal(f.state.disposed,1);
 f.host.connected=true;f.notify([{addedNodes:[f.host]}]);assert.equal(f.attached.length,2);
 f.cleanup.dispose();assert.equal(f.state.disposed,2);assert.equal(f.isDisconnected(),true);
});

test('Turn Around preserves the original destroy behavior and stays optional without exporter',()=>{
 const f=fixture();
 f.player.destroy();
 assert.equal(f.state.destroyed,1);assert.equal(f.state.disposed,1);
 const absent=fixture({missingPlugin:true});
 assert.equal(absent.attached.length,0);assert.equal(absent.cleanup,undefined);
});


test('Turn Around preserves edited source offsets and mutes while keeping Singing independent of Speech',()=>{
 const f=fixture(),spoken=f.sourceClips.find(clip=>clip.kind==='speech');
 spoken.offset=.625;spoken.duration=1.125;spoken.muted=true;
 f.sliders.Speech.value='0';f.sliders.Singing.value='0.25';f.sliders.Music.value='0';
 const copied=f.attached[0].scene.musical.audioClips;
 const voice=copied.find(clip=>clip.id===spoken.id),song=copied.find(clip=>clip.kind==='song');
 assert.equal(voice.offset,.625);assert.equal(voice.duration,1.125);assert.equal(voice.muted,true);
 assert.equal(voice.volume,0,'muting dialogue does not alter its source timing');
 assert.equal(song.volume,f.sourceClips.find(clip=>clip.id===song.id).volume*.25,
  'sung recordings use the Singing fader even when dialogue is silent');
 assert.ok(copied.filter(clip=>clip.kind==='music'||clip.kind==='sfx').every(clip=>clip.volume===0),
  "the Music fader also mutes the audience player's recorded effects bus");
});
