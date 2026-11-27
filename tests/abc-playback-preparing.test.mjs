import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../plugins/abc/src/audio-controller.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function until(check,message){
 for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,0));}
 assert.ok(check(),message);
}
function fixture(){
 const events=[],preparing=[],resumes=[],buffers=[],errors=[];
 const listeners=[];
 const buttonClasses=new Set(),buttonAttrs={};
 const button={disabled:false,classList:{contains:name=>buttonClasses.has(name),toggle(name,value){if(value)buttonClasses.add(name);else buttonClasses.delete(name);}},
  setAttribute(name,value){buttonAttrs[name]=value;},removeAttribute(name){delete buttonAttrs[name];},getAttribute(name){return buttonAttrs[name]??null;},
  addEventListener(type,handler,capture){listeners.push({type,handler,capture:capture===true||!!capture?.capture});},
  removeEventListener(type,handler){const index=listeners.findIndex(item=>item.type===type&&item.handler===handler);if(index>=0)listeners.splice(index,1);},
  closest(selector){return selector.includes('abcjs-midi-start')?button:host;},
  click(){
   const event={target:button,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;}};
   for(const item of [...listeners].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(event.stopped)break;if(item.type==='click')item.handler(event);}
   return event;
  }};
 const host={querySelector(selector){return selector==='.abcjs-midi-start'?button:null;},classList:{contains:()=>false}};
 const context={state:'suspended',resume(){const job=deferred();resumes.push(job);events.push('resume');return job.promise;}};
 const ABC={synth:{activeAudioContext:()=>context,registerAudioContext(){}},TimingCallbacks:function(){
  this.start=()=>events.push('timer-start');this.pause=()=>events.push('timer-pause');this.stop=()=>events.push('timer-stop');this.reset=()=>{};
 }};
 const Reserve={stopAuditions(){},createMixer(_ABC,_config,options){
  const buffer={duration:4,starts:0,state:{phase:'idle',engine:'original'},
   init(){events.push('init');buffer.state={phase:'loading',engine:'original'};options.onStatus(buffer.state);return Promise.resolve({status:'created'});},
   prime(){events.push('prime');buffer.state={phase:'ready',engine:'original'};options.onStatus(buffer.state);return Promise.resolve({status:'ready'});},
   start(){buffer.starts++;events.push('buffer-start');},pause(){events.push('buffer-pause');},stop(){events.push('buffer-stop');},cancel(){events.push('buffer-cancel');},release(){},getState(){return buffer.state;}
  };buffers.push(buffer);return buffer;
 }};
 const output={};
 runInNewContext(source,{exports:output,require(name){assert.equal(name,'$:/plugins/huwiki/abc/reserve-mixer.js');return Reserve;},
  window:{AudioContext:function(){return context;},requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout},
  document:{hidden:false},setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout});
 const controller={visualObj:{millisecondsPerMeasure:()=>1000,getBeatsPerMeasure:()=>4},warp:100,options:{},percent:0,
  isStarted:false,isLoading:false,isLoaded:false,
  control:{setTempo(){},pushPlay(value){events.push('push-play:'+value);},pushLoop(){},resetAll(){}},
  cursorControl:{onStart(){events.push('on-start');},onFinished(){events.push('on-finished');}},
  setTune(tune){this.visualObj=tune;return Promise.resolve({status:'no-audio-context'});},
  load(){
   this.control.parent=host;
   // ABCJS waits for AudioContext.resume before invoking its play handler.
   button.addEventListener('click',()=>{events.push('native-click');context.resume().then(()=>this.play());});
  },setProgress(value){this.percent=value;},seek(){},finished(){this.isStarted=false;this.cursorControl.onFinished();}
 };
 output.install(controller,ABC,{getConfig:()=>({}),onPreparing(value){preparing.push(value);events.push('preparing:'+value);},onError(error){errors.push(error);}});
 return {controller,events,preparing,resumes,buffers,errors,button,host};
}
async function start(f){
 const task=f.controller.play();
 await until(()=>f.resumes.length>0,'AudioContext resume was requested');f.resumes[0].resolve();
 await until(()=>f.resumes.length>1,'Prepared playback requests its resume');f.resumes[1].resolve();
 await task;return task;
}

test('Play announces preparation immediately, coalesces clicks, and stays busy after reserve ready until actual start',async()=>{
 const f=fixture(),c=f.controller;
 const task=c.play();
 assert.equal(c.isPreparing,true,'feedback is synchronous with Play');
 assert.equal(f.preparing.at(-1),true);
 assert.equal(f.events.includes('buffer-start'),false);
 const duplicate=c.play();
 assert.equal(duplicate,task,'concurrent Play calls share one start');
 await until(()=>f.resumes.length===1,'first resume requested');
 assert.equal(c.isPreparing,true,'a suspended AudioContext retains feedback');
 f.resumes[0].resolve();
 await until(()=>f.resumes.length===2,'second resume requested after reserve ready');
 assert.equal(f.buffers[0].state.phase,'ready');
 assert.equal(c.isPreparing,true,'engine ready is earlier than playback start');
 assert.equal(f.preparing.filter(value=>value===false).length,0);
 f.resumes[1].resolve();await Promise.all([task,duplicate]);
 assert.equal(f.buffers[0].starts,1);assert.equal(c.isStarted,true);assert.equal(c.isPreparing,false);
 assert.equal(f.preparing.at(-1),false);
});

test('go reports pending preparation and clears it when preparation completes without a Play request',async()=>{
 const f=fixture(),task=f.controller.go();
 assert.equal(f.controller.isPreparing,true);assert.equal(f.preparing.at(-1),true);
 await until(()=>f.resumes.length===1,'resume requested');f.resumes[0].resolve();await task;
 assert.equal(f.controller.isLoaded,true);assert.equal(f.controller.isPreparing,false);
 assert.equal(f.buffers[0].starts,0);
});

test('Native Play click is acknowledged before its suspended AudioContext resolves',async()=>{
 const f=fixture(),c=f.controller;c.load(f.host,c.cursorControl,{displayPlay:true});
 const event=f.button.click();
 assert.equal(c.isPreparing,true,'the first native click publishes preparation synchronously');
 assert.equal(f.button.getAttribute('aria-busy'),'true');
 assert.ok(f.button.classList.contains('abcjs-loading'),'older native transports retain their spinner too');
 assert.equal(f.preparing.at(-1),true);
 assert.equal(f.events.includes('native-click'),false,'the old delayed native handler is intercepted');
 assert.equal(event.defaultPrevented,true);
 assert.equal(f.resumes.length,1,'AudioContext resume keeps the original user gesture');
 const task=c.play();f.resumes[0].resolve();
 await until(()=>f.resumes.length===2,'prepared playback resume requested');
 assert.equal(c.isPreparing,true);f.resumes[1].resolve();await task;
 assert.equal(c.isPreparing,false);assert.equal(f.buffers[0].starts,1);
 assert.equal(f.button.getAttribute('aria-busy'),null);assert.equal(f.button.classList.contains('abcjs-loading'),false);
});

test('Prepared resume immediately shows preparation and Pause cancels its unresolved start',async()=>{
 const f=fixture(),c=f.controller;await start(f);c.pause();
 assert.equal(c.isLoaded,true,'pause retains the prepared sound');
 const existing=f.resumes.length,task=c.play();
 assert.equal(c.isPreparing,true,'cached audio resume still acknowledges the click');
 await until(()=>f.resumes.length>existing,'resume requested');c.pause();
 assert.equal(c.isPreparing,false);assert.equal(c.isStarted,false);
 f.resumes[existing].resolve();await task;
 assert.equal(f.buffers.length,1);assert.equal(f.buffers[0].starts,1,'cancelled resume never restarts old audio');
});

test('Stop invalidates a pending Play, and its stale completion cannot clear a newer request',async()=>{
 const f=fixture(),c=f.controller,old=c.play();
 await until(()=>f.resumes.length===1,'old resume requested');c.huwikiStop();
 assert.equal(c.isPreparing,false);
 const next=c.play();assert.equal(c.isPreparing,true);
 await until(()=>f.resumes.length===2,'new resume requested');
 f.resumes[0].resolve();await old;
 assert.equal(c.isPreparing,true,'old finally cannot erase the current busy state');
 assert.equal(f.buffers.reduce((n,b)=>n+b.starts,0),0);
 f.resumes[1].resolve();
 await until(()=>f.resumes.length===3,'new playback resume requested');
 assert.equal(c.isPreparing,true);f.resumes[2].resolve();await next;
 assert.equal(c.isPreparing,false);assert.equal(f.buffers.reduce((n,b)=>n+b.starts,0),1);
});

test('AudioContext failure clears preparation and permits a fresh successful Play',async()=>{
 const f=fixture(),c=f.controller,task=c.play();
 await until(()=>f.resumes.length===1,'resume requested');f.resumes[0].reject(new Error('Audio device unavailable'));
 await assert.rejects(task,/Audio device unavailable/);
 assert.equal(c.isPreparing,false);assert.equal(c.isStarted,false);assert.ok(f.errors.length);
 const next=c.play();assert.equal(c.isPreparing,true);
 await until(()=>f.resumes.length===2,'retry resume requested');f.resumes[1].resolve();
 await until(()=>f.resumes.length===3,'retry playback resume requested');f.resumes[2].resolve();await next;
 assert.equal(c.isPreparing,false);assert.equal(f.buffers.reduce((n,b)=>n+b.starts,0),1);
});

for(const operation of ['setTune','destroy'])test(`${operation} clears pending preparation and prevents a late start`,async()=>{
 const f=fixture(),c=f.controller,task=c.play();
 await until(()=>f.resumes.length===1,'resume requested');
 if(operation==='setTune')await c.setTune({millisecondsPerMeasure:()=>500,getBeatsPerMeasure:()=>4},false,{});else c.destroy();
 assert.equal(c.isPreparing,false);assert.equal(c.isStarted,false);
 f.resumes[0].resolve();await task;
 assert.equal(c.isPreparing,false);assert.equal(f.buffers.reduce((n,b)=>n+b.starts,0),0);
});
