import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const playbackSource=await readFile(new URL('../plugins/musical/src/score-playback.js',import.meta.url),'utf8');
const workshopSource=await readFile(new URL('../plugins/musical/src/score-workshop.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
class Tiddler{constructor(...values){this.fields=Object.assign({},...values.filter(Boolean).map(value=>value.fields||value));}}
class Node{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.className='';this.attributes={};this.listeners={};this._text='';this.connected=false;this.classList={add:()=>{},remove:()=>{}};}
 get isConnected(){return this.connected||!!this.parentNode?.isConnected;}
 appendChild(child){child.parentNode=this;this.children.push(child);return child;}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name]??null;}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(listener=>listener!==fn);}
 focus(){}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const found=[];function walk(node){for(const child of node.children){if(selector.startsWith('.')?child.className.split(/\s+/).includes(selector.slice(1)):child.tagName===selector.toUpperCase())found.push(child);walk(child);}}walk(this);return found;}
}
function fixture(options={}){
 const original={title:'Score',type:'text/vnd.abc',text:'X:1\nT:Original\nK:C\nz4|','abc-source':'X:1\nT:Original\nK:C\nz4|','abc-accompaniment':'{"enabled":false}'};
 const records={Score:original,'$:/language':{title:'$:/language',text:options.en?'$:/languages/en-GB':'$:/languages/da-DK'}};
 const wikiListeners=new Set(),writes=[],trace=[],states=[],controllers=[],registered=new Set(),preparations=[];
 const root=new Node('main');root.connected=true;
 const docEvents={},windowEvents={};let audioContext,playGate=options.playGate,setTuneGate=options.setTuneGate;
 const context={resume(){trace.push('resume');return options.resumeGate?.promise||Promise.resolve();}};
 const win={confirm:()=>true,AudioContext:function(){trace.push('context');return context;},addEventListener(name,fn){windowEvents[name]=fn;},removeEventListener(name,fn){if(windowEvents[name]===fn)delete windowEvents[name];}};
 const doc={createElement:tag=>new Node(tag),defaultView:win,hidden:false,addEventListener(name,fn){docEvents[name]=fn;},removeEventListener(name,fn){if(docEvents[name]===fn)delete docEvents[name];}};
 const wiki={getTiddler:title=>records[title]?new Tiddler(records[title]):null,getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,
  addTiddler(t){records[t.fields.title]=structuredClone(t.fields);writes.push(t.fields.title);},deleteTiddler(title){delete records[title];writes.push(title);},
  generateNewTitle(title){let value=title;while(records[value])value+=' copy';return value;},
  addEventListener(name,fn){if(name==='change')wikiListeners.add(fn);},removeEventListener(name,fn){wikiListeners.delete(fn);},
  makeWidget(){return {children:[],render(){},removeChildDomNodes(){},onDestroy(){}};}
 };
 const ABC={renderAbc(host,source){trace.push('render');return [{source}];},synth:{supportsAudio:()=>true,activeAudioContext:()=>audioContext,registerAudioContext:value=>{audioContext=value;},SynthController:function(){
  trace.push('controller');this.revision=0;this.isStarted=false;this.isLoading=false;controllers.push(this);
  this.load=(host,cursor)=>{this.cursorControl=cursor;};
  this.setTune=(tune,gesture,params)=>{trace.push('setTune');this.visualObj=tune;this.params=params;return setTuneGate?.promise||Promise.resolve();};
  this.play=()=>{const revision=this.revision;trace.push('play');this.isLoading=true;return Promise.resolve(playGate?.promise).then(()=>{this.isLoading=false;if(this._disposed||revision!==this.revision||!this.options.isCurrent())return {status:'cancelled'};this.isStarted=true;this.cursorControl.onStart();return {status:'ok'};});};
  this.pause=()=>{trace.push('pause');this.revision++;this.isStarted=false;this.isLoading=false;this.options.onStop(true);};
  this.destroy=()=>{trace.push('destroy');this.revision++;this.isStarted=false;this.isLoading=false;this.destroyed=true;this.options.onStop(false);};
 }}};
 const loader={getSource(w,title){return w.getTiddler(title)?.fields['abc-source']||'';},load(){return options.libraryGate?.promise||Promise.resolve(ABC);}};
 const dependencies={
  '$:/plugins/huwiki/abc/loader.js':loader,
  '$:/plugins/huwiki/abc/audio-controller.js':{install(c,lib,opts){assert.equal(lib,ABC);c.options=opts;return c;}},
  '$:/plugins/huwiki/abc/accompaniment.js':{read(fields){return JSON.parse(fields['abc-accompaniment']||'{"enabled":false}');},prepare(lib,tune,source,config,live,fields){preparations.push({source,config,live,fields});},createDrone(){return {start(){trace.push('drone-start');},stop(){trace.push('drone-stop');}};}},
  '$:/plugins/huwiki/abc/playback.js':{register:c=>registered.add(c),unregister:c=>registered.delete(c),start:c=>{assert.ok(registered.has(c));trace.push('exclusive');}},
  '$:/plugins/huwiki/abc/score-view.js':{swingValue:fields=>fields['abc-swing']||0}
 };
 const api={};runInNewContext(playbackSource,{exports:api,require:id=>dependencies[id],Promise,Error,JSON});
 let current={fields:structuredClone(original),source:original['abc-source']},parentPauses=0;
 const preview=api.mount({doc,wiki,host:root,da:!options.en,getDraft:()=>current,pause(){parentPauses++;},onState:state=>states.push(state)});
 return {preview,doc,wiki,root,ABC,api,dependencies,states,trace,controllers,preparations,registered,writes,wikiListeners,records,
  setDraft(source,config){current={source,fields:{...current.fields,'abc-source':source,...(config?{'abc-accompaniment':JSON.stringify(config)}:{})}};},
  emitChange(){for(const fn of wikiListeners)fn({Score:{modified:true}});},
  setPlayGate(value){playGate=value;},setTuneGate(value){setTuneGate=value;},
  get phase(){return states.at(-1)?.phase;},get parentPauses(){return parentPauses;},get windowEvents(){return windowEvents;},get docEvents(){return docEvents;}
 };
}

test('music preview lazily plays the current unsaved ABC through the shared engine without changing saved music',async()=>{
 const f=fixture();await f.preview.ready;
 assert.equal(f.controllers.length,0);assert.equal(f.root.children.length,0);assert.equal(f.phase,'idle');
 const changed='X:1\nT:Unsaved\nK:G\nG A B c|';f.setDraft(changed,{enabled:false,melodyVolume:74});
 const playing=f.preview.toggle();assert.equal(f.trace[0],'context');assert.equal(f.trace[1],'resume','the user gesture unlocks Web Audio before rendering or asynchronous setup');await playing;
 assert.equal(f.phase,'playing');assert.equal(f.controllers[0].visualObj.source,changed);assert.equal(f.preparations[0].source,changed);
 assert.equal(f.preparations[0].live,false,'disabled accompaniment does not force extra instruments to load');assert.equal(f.controllers[0].options.getConfig().melodyVolume,74);
 assert.equal(f.records.Score['abc-source'],'X:1\nT:Original\nK:C\nz4|');assert.equal(f.writes.length,0,'audition does not save a score or flip the show track');assert.equal(f.parentPauses,1);
 f.preview.destroy();assert.equal(f.registered.size,0);assert.equal(f.root.children.length,0);
});
test('pause keeps the prepared cursor; Stop releases the player and the next Play starts fresh',async()=>{
 const f=fixture();await f.preview.ready;await f.preview.toggle();const first=f.controllers[0];
 await f.preview.toggle();assert.equal(f.phase,'paused');assert.equal(first.destroyed,undefined);
 await f.preview.toggle();assert.equal(f.phase,'playing');assert.equal(f.controllers.length,1);assert.equal(f.trace.filter(x=>x==='render').length,1);
 f.preview.stop();assert.equal(f.phase,'idle');assert.equal(first.destroyed,true);assert.equal(f.root.children.length,0);assert.equal(f.registered.size,0);
 await f.preview.toggle();assert.equal(f.controllers.length,2);assert.equal(f.phase,'playing');f.preview.destroy();
});
test('changing the draft cancels pending sound and cannot restart the obsolete score',async()=>{
 const gate=deferred(),f=fixture({playGate:gate});await f.preview.ready;
 const playing=f.preview.toggle();await tick();assert.equal(f.phase,'loading');assert.equal(f.controllers.length,1);
 f.setDraft('X:1\nK:D\nD E F G|');f.emitChange();assert.equal(f.phase,'idle');assert.equal(f.controllers[0].destroyed,true);
 gate.resolve();await playing;assert.equal(f.phase,'idle');assert.equal(f.trace.filter(x=>x==='play').length,1);assert.equal(f.controllers[0].isStarted,false);assert.equal(f.registered.size,0);
 f.setPlayGate(null);await f.preview.toggle();assert.equal(f.controllers[1].visualObj.source,'X:1\nK:D\nD E F G|');assert.equal(f.phase,'playing');f.preview.destroy();
});
test('a source edit before the asynchronous wiki notification is checked again before Play',async()=>{
 const gate=deferred(),f=fixture({setTuneGate:gate});await f.preview.ready;
 const playing=f.preview.toggle();f.setDraft('X:1\nK:F\nF2 A2|');gate.resolve();await playing;
 assert.equal(f.phase,'idle');assert.equal(f.trace.includes('play'),false);assert.equal(f.controllers[0].destroyed,true);f.preview.destroy();
});
test('Stop or closing during preparation cancels sound and releases all listeners and notation',async()=>{
 for(const close of [false,true]){
  const gate=deferred(),f=fixture({playGate:gate});await f.preview.ready;const pending=f.preview.toggle();await tick();
  if(close)f.preview.destroy();else f.preview.stop();gate.resolve();await pending;
  assert.equal(f.controllers[0].isStarted,false);assert.equal(f.controllers[0].destroyed,true);assert.equal(f.registered.size,0);assert.equal(f.root.children.length,0);
  if(close){assert.equal(f.wikiListeners.size,0);assert.deepEqual(Object.keys(f.docEvents),[]);assert.deepEqual(Object.keys(f.windowEvents),[]);}else f.preview.destroy();
 }
});
test('sound errors release resources, stay visible, and a subsequent Play can retry',async()=>{
 const gate=deferred(),f=fixture({playGate:gate,en:true});await f.preview.ready;const pending=f.preview.toggle();await tick();gate.reject(Error('Sample unavailable'));await pending;
 assert.equal(f.phase,'error');assert.match(f.states.at(-1).message,/The music could not be played: Sample unavailable/);assert.equal(f.registered.size,0);assert.equal(f.root.children.length,0);
 f.setPlayGate(null);await f.preview.toggle();assert.equal(f.phase,'playing');f.preview.destroy();
});
test('finishing, pagehide and hidden pages stop previews without saving the draft',async()=>{
 for(const finish of ['finished','pagehide','hidden']){
  const f=fixture();await f.preview.ready;await f.preview.toggle();
  if(finish==='finished')f.controllers[0].cursorControl.onFinished();else if(finish==='pagehide')f.windowEvents.pagehide();else{f.doc.hidden=true;f.docEvents.visibilitychange();}
  assert.equal(f.phase,'idle');assert.equal(f.registered.size,0);assert.equal(f.controllers[0].isStarted,false);assert.equal(f.writes.length,0);f.preview.destroy();
 }
});
test('the visible workshop transport uses its isolated draft and Cancel destroys its active player',async()=>{
 const f=fixture();await f.preview.ready;f.preview.destroy();
 const api={};runInNewContext(workshopSource,{exports:api,require:id=>id==='$:/plugins/huwiki/musical/score-playback.js'?f.api:f.dependencies[id],$tw:{Tiddler,rootWidget:{}},Promise,Date});
 const workshop=api.mount({doc:f.doc,wiki:f.wiki,host:f.root,pause(){}});workshop.open('Score');await tick();
 const draft=Object.keys(f.records).find(key=>key.startsWith('$:/temp/animus-score/'));
 f.records[draft]['abc-source']='X:1\nT:Draft take\nK:D\nD E F G|';
 const popup=f.root.querySelector('.huw-score-workshop'),play=f.root.querySelector('.huw-score-play'),stop=f.root.querySelector('.huw-score-stop');
 assert.equal(play.disabled,false);assert.equal(stop.disabled,true);assert.equal(play.getAttribute('aria-label'),'Afspil');
 play.onclick();await tick();assert.equal(popup.getAttribute('data-score-playback'),'playing');assert.equal(play.getAttribute('aria-label'),'Pause');assert.equal(stop.disabled,false);assert.match(f.controllers.at(-1).visualObj.source,/T:Draft take/);
 play.onclick();await tick();assert.equal(popup.getAttribute('data-score-playback'),'paused');assert.equal(play.getAttribute('aria-label'),'Afspil');
 play.onclick();await tick();assert.equal(popup.getAttribute('data-score-playback'),'playing');workshop.close(true);
 assert.equal(f.controllers.at(-1).isStarted,false);assert.equal(f.controllers.at(-1).destroyed,true);assert.equal(f.registered.size,0);assert.equal(f.records[draft],undefined);assert.match(f.records.Score['abc-source'],/T:Original/);
});
