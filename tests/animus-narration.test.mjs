import {language, languageTitle} from './helpers/animus-language.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const directory=new URL('../plugins/musical/src/',import.meta.url);
const playerSource=await readFile(new URL('narration-player.js',directory),'utf8');
const narrationSource=await readFile(new URL('narration.js',directory),'utf8');
function load(){
 const playback={};runInNewContext(playerSource,{exports:playback});
 const api={};runInNewContext(narrationSource,{exports:api,require(id){if(id===languageTitle)return language;assert.equal(id,'$:/plugins/huwiki/musical/narration-player.js');return playback;},Promise,Blob,Date,Math});
 return api;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class FakeAudio {
 constructor(){this.listeners={};this.paused=true;this.currentTime=0;this.duration=20;this.volume=1;this.muted=false;this.playbackRate=1;this.plays=0;this.pauses=0;this.loads=0;this.rejectPlay=false;}
 setAttribute(){}
 addEventListener(name,fn){(this.listeners[name]||(this.listeners[name]=[])).push(fn);}
 emit(name){for(const listener of this.listeners[name]||[])listener();}
 removeAttribute(name){if(name==='src')this.src='';}
 load(){this.loads++;}
 pause(){this.paused=true;this.pauses++;}
 play(){this.plays++;if(this.rejectPlay)return Promise.reject(Object.assign(new Error('Blocked'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve();}
}
function fixture(clips){
 const api=load(),created=[],errors=[];
 const files={voice:{type:'audio/webm',text:'YWJj'},second:{type:'audio/mp4',text:'ZGVm'}};
 const wiki={getTiddler(title){return files[title]?{fields:files[title]}:null;}};
 const doc={createElement(tag){assert.equal(tag,'audio');const audio=new FakeAudio();created.push(audio);return audio;}};
 const player=new api.Player({wiki,doc,clips,onError(error,clip){errors.push({error,clip});}});
 return {api,player,wiki,files,created,errors};
}
test('audio clips keep trim bounds, source durations and immutable caller input',()=>{
 const api=load(),input=[{id:'one',asset:'voice',start:-3,offset:8,duration:9,sourceDuration:10,volume:2},{id:'one',asset:'second',start:4,offset:-2,duration:2,muted:true}];
 const result=api.normalizeClips(input);
 assert.equal(result[0].start,0);assert.equal(result[0].duration,2);assert.equal(result[0].volume,1);assert.equal(result[1].offset,0);assert.notEqual(result[1].id,result[0].id);
 assert.equal(input[0].duration,9);assert.equal(api.total(result),6);
});
test('audioSource resolves stored data and canonical audio, rejects non-audio and script URIs',()=>{
 const {api,wiki,files}=fixture([]);
 assert.equal(api.audioSource(wiki,'voice'),'data:audio/webm;base64,YWJj');
 files.raw={type:'audio/wav',text:'data:audio/wav;base64,YWJj'};
 files.remote={type:'audio/mp4',_canonical_uri:'https://media.example.test/voice.m4a'};
 files.script={type:'audio/mp4',_canonical_uri:'javascript:alert(1)'};
 files.image={type:'image/png',text:'YWJj'};
 assert.equal(api.audioSource(wiki,'raw'),'data:audio/wav;base64,YWJj');
 assert.equal(api.audioSource(wiki,'remote'),'https://media.example.test/voice.m4a');
 assert.equal(api.audioSource(wiki,'script'),'');assert.equal(api.audioSource(wiki,'image'),'');assert.equal(api.audioSource(wiki,'missing'),'');
});
test('recorded clips follow the shared clock, including trim, overlapping voices, speed and end',async()=>{
 const {player,created}=fixture([{id:'a',asset:'voice',start:3,offset:2,duration:4,volume:.4},{id:'b',asset:'second',start:5,offset:1,duration:3,volume:.7}]);
 player.unlock();await tick();assert.ok(created.every(a=>a.paused));
 player.sync(2,1);assert.ok(created.every(a=>a.paused));
 player.sync(3.5,1.25);await tick();assert.equal(created[0].paused,false);assert.equal(created[0].currentTime,2.5);assert.equal(created[0].volume,.4);assert.equal(created[0].playbackRate,1.25);assert.equal(created[1].paused,true);
 player.sync(5.5,1);await tick();assert.equal(created[0].currentTime,4.5);assert.equal(created[1].currentTime,1.5);assert.equal(created[1].paused,false);
 player.sync(7,1);assert.equal(created[0].paused,true);assert.equal(created[1].paused,false);
 player.sync(8,1);assert.ok(created.every(a=>a.paused));
 player.seek(3.5);player.sync(3.5,1);await tick();assert.equal(created[0].paused,false);assert.equal(created[0].currentTime,2.5);
 player.pause();assert.ok(created.every(a=>a.paused));player.dispose();assert.ok(created.every(a=>a.src===''));
});
test('unlock promise cannot pause a clip already started by the timeline',async()=>{
 const {player,created}=fixture([{id:'a',asset:'voice',start:0,offset:1,duration:3,volume:.5}]);
 player.unlock();player.sync(.5,1);await tick();assert.equal(created[0].paused,false);assert.equal(created[0].currentTime,1.5);assert.equal(created[0].muted,false);
});
test('muted clips stay quiet and source removal releases media without changing wiki files',async()=>{
 const {player,created,files}=fixture([{id:'a',asset:'voice',start:0,duration:3,muted:true},{id:'b',asset:'second',start:0,duration:3}]);
 player.sync(1,1);await tick();assert.equal(created[0].paused,true);assert.equal(created[1].paused,false);
 player.setClips([]);assert.equal(created[1].paused,true);assert.equal(created[1].src,'');assert.equal(files.second.text,'ZGVm');
});
test('same-source volume and mute edits update a playing clip without recreating audio',async()=>{
 const clip={id:'a',asset:'voice',start:0,duration:4,volume:.8},f=fixture([clip]);f.player.sync(1,1);await tick();
 f.player.setClips([{...clip,volume:.25}]);assert.equal(f.created.length,1);assert.equal(f.created[0].volume,.25);assert.equal(f.created[0].paused,false);
 f.player.setClips([{...clip,muted:true}]);assert.equal(f.created[0].paused,true);
 f.player.setClips([{...clip,muted:false,offset:1}]);await tick();assert.equal(f.created.length,1);assert.equal(f.created[0].paused,false);assert.equal(f.created[0].currentTime,2);
});
test('pause/resume while native play is pending does not turn its AbortError into a permanent failure',async()=>{
 const f=fixture([{id:'a',asset:'voice',start:0,duration:4}]),a=f.created[0];let fail;
 a.play=function(){this.plays++;this.paused=false;if(this.plays===1)return new Promise((resolve,reject)=>{fail=reject;});return Promise.resolve();};
 f.player.sync(.5,1);f.player.pause();f.player.sync(1,1);fail(Object.assign(new Error('Interrupted'),{name:'AbortError'}));await tick();
 assert.equal(f.errors.length,0);assert.equal(a.paused,false);assert.equal(a.currentTime,1);assert.equal(a.plays,2);
});
test('missing media and rejected autoplay are reported once without throwing or blocking later clips',async()=>{
 const {player,created,errors}=fixture([{id:'a',asset:'voice',start:0,duration:3},{id:'b',asset:'missing',start:0,duration:3}]);
 created[0].rejectPlay=true;player.sync(.5,1);await tick();player.sync(.6,1);await tick();
 assert.equal(errors.length,2);assert.equal(created[0].plays,1);
 player.seek(0);created[0].rejectPlay=false;player.unlock();player.sync(1,1);await tick();assert.equal(created[0].paused,false);
 player.dispose();assert.doesNotThrow(()=>player.sync(2,1));
});
test('MIME selection supports Safari mp4 and the browser default when no candidate is supported',()=>{
 const api=load();assert.equal(api.chooseMime({isTypeSupported:type=>type==='audio/mp4'}),'audio/mp4');assert.equal(api.chooseMime({isTypeSupported:()=>false}),'');
});
function recordingFixture(options={}){
 const api=load(),tracks=[{stops:0,stop(){this.stops++;}}],stream={getTracks:()=>tracks},states=[],errors=[],completed=[],created=[];let clock=1000;
 class Recorder {
  static isTypeSupported(type){return type==='audio/mp4';}
  constructor(source,config){assert.equal(source,stream);this.mimeType=config?.mimeType||'audio/webm';this.state='inactive';created.push(this);}
  start(){if(options.startError)throw options.startError;this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.();});}
 }
 const capture=new api.Capture({navigator:{mediaDevices:{getUserMedia:options.getUserMedia||(()=>Promise.resolve(stream))}},MediaRecorder:Recorder,Blob,now:()=>clock,onState:s=>states.push(s),onError:e=>errors.push(e),onComplete:r=>completed.push(r)});
 return {capture,stream,tracks,states,errors,completed,created,setClock:v=>clock=v};
}
test('recording stops the microphone and delivers a durable audio blob with elapsed duration',async()=>{
 const f=recordingFixture();assert.equal(await f.capture.start(),true);assert.equal(f.capture.state,'recording');assert.equal(f.created[0].mimeType,'audio/mp4');
 f.setClock(3500);assert.equal(f.capture.stop(),true);f.setClock(4000);await tick();assert.equal(f.capture.state,'idle');assert.equal(f.completed.length,1);assert.equal(f.completed[0].duration,2.5);assert.equal(f.completed[0].blob.type,'audio/mp4');assert.equal(await f.completed[0].blob.text(),'voice');assert.ok(f.tracks[0].stops>0);
});
test('closing during a microphone permission prompt stops the late stream and creates no recording',async()=>{
 let resolve;const promise=new Promise(r=>{resolve=r;}),f=recordingFixture({getUserMedia:()=>promise});const start=f.capture.start();await tick();assert.equal(f.capture.state,'requesting');f.capture.cancel();resolve(f.stream);assert.equal(await start,false);assert.equal(f.tracks[0].stops,1);assert.equal(f.created.length,0);assert.equal(f.completed.length,0);
});
test('cancelled recordings release tracks and never save the final data event',async()=>{
 const f=recordingFixture();await f.capture.start();f.capture.cancel();await tick();assert.equal(f.completed.length,0);assert.ok(f.tracks[0].stops>0);assert.equal(f.capture.state,'idle');
});
test('permission and recorder start failures remain recoverable and release microphone tracks',async()=>{
 const denied=recordingFixture({getUserMedia:()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}))});assert.equal(await denied.capture.start(),false);assert.equal(denied.capture.state,'idle');assert.equal(denied.errors[0].name,'NotAllowedError');
 const start=recordingFixture({startError:new Error('Recorder unavailable')});assert.equal(await start.capture.start(),false);assert.equal(start.capture.state,'idle');assert.ok(start.tracks[0].stops>0);assert.equal(start.completed.length,0);
});
test('script cues retain the nested scene clock, offsets, clipping and roles',()=>{
 const api=load(),files={scene:{parts:[{id:'spoken-1',type:'text',text:'SOLDAT: Hej',keys:[{t:0,opacity:0},{t:6,opacity:1}]},{id:'spoken-2',type:'text',text:'Gone',keys:[{t:1,opacity:1}]}]},intro:{parts:[]}};
 const wiki={getTiddler(title){return files[title]?{fields:{text:JSON.stringify(files[title])}}:null;}};
 const cues=api.collectCues(wiki,{name:'Film',scenes:[{source:'intro',duration:10},{source:'scene',duration:5,speed:2,offset:2}]});
 assert.equal(cues.length,1);assert.equal(cues[0].start,12);assert.equal(cues[0].role,'SOLDAT');assert.equal(cues[0].sceneTitle,'scene');assert.equal(cues[0].cueId,'spoken-1');
});

test('a long recording timeline primes only simultaneous voices and reuses them across cuts and backward seeks',async()=>{
 const clips=Array.from({length:120},(_,i)=>({id:'line-'+i,asset:i%2?'second':'voice',start:i*2,duration:2}));
 clips.push({id:'music',asset:'second',start:0,duration:240});
 const {player,created}=fixture(clips);
 assert.equal(created.length,2);
 assert.ok(created.every(a=>!a.src),'opening the editor does not load recordings');
 for(const t of [180,10,232,1])player.seek(t);
 assert.ok(created.every(a=>!a.plays&&!a.pauses&&!a.src),'paused seeks only move the clock');
 player.unlock();player.sync(1,1);await tick();
 assert.ok(created.every(a=>!a.paused));
 const speech=created[0],bed=created[1],bedStarts=bed.plays;
 player.sync(3,1);await tick();assert.equal(speech.src,'data:audio/mp4;base64,ZGVm');
 assert.equal(speech.currentTime,1);assert.equal(bed.plays,bedStarts);
 player.seek(.5);player.sync(.5,1);await tick();
 assert.equal(speech.src,'data:audio/webm;base64,YWJj');assert.equal(speech.currentTime,.5);
 assert.equal(created.length,2);player.dispose();assert.ok(created.every(a=>!a.src));
});
