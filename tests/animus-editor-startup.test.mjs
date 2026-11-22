import {language, languageTitle} from './helpers/animus-language.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const widgetSource=read('plugins/musical/src/widget.js');
const production=JSON.parse(read('editions/turn-around/tiddlers/production.json'));
const film=JSON.parse(production.find(t=>t.title==='Turn Around · Complete performance (film)').text);
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

// Execute the actual widget and its playlist/master clock. A deferred notation
// renderer makes the user's seek-before-load race deterministic; audio and SVG
// presentation are controlled here, with browser integration tested separately.
function fixture({songs=film.musical.songs,notatedSeconds=110,audioPending=false,recordings=[]}={}){
 const doc=svgDocument(),load=deferred(),pendingAudio=deferred(),painted=[],frames=new Map(),audios=[];
 let now=0,nextFrame=0,editorOptions=null,workspaceOptions=null,exportOptions=null,audioPreparations=0,contextRequests=0,registrations=0,notationRenders=0;
 const preview={captions:true,music:true,audio:true,sfx:true};let effectsSynced=0,effectsQuieted=0,exporting=false;
 for(const method of ['createElement','createElementNS']){
  const original=doc[method];doc[method]=(...args)=>{
   const node=Object.assign(original(...args),{nodeType:1});
   if(node.tagName==='AUDIO'){
    Object.assign(node,{paused:true,currentTime:0,duration:600,playCalls:0,
     play(){this.playCalls++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){}});
    audios.push(node);
   }
   return node;
  };
 }
 const scene={name:'Startup regression',duration:film.duration,parts:[],scenes:[],musical:{songs:plain(songs),audioClips:plain(recordings)}};
 const fields=Object.fromEntries(production.map(row=>[row.title,row]));
 for(const clip of recordings)fields[clip.asset]={title:clip.asset,type:'audio/wav',text:'UklGRg=='};
 const wiki={getTiddler:title=>({fields:fields[title]||{'abc-source':'X:1\nK:C\nC|'}}),
  getTiddlerText:(title,fallback='')=>title==='$:/language'?'$:/languages/en-GB':fallback};
 function Widget(){}
 Widget.prototype.initialise=function(_tree,options){Object.assign(this,options);this.domNodes=[];};
 Widget.prototype.getVariable=()=> 'Test show';
 Widget.prototype.computeAttributes=()=>({});
 Widget.prototype.getAttribute=(name,fallback)=>name==='scene'?'Film':name==='score'?songs[0].score:fallback;
 function Sound(){ }
 for(const name of ['unlock','sync','seek','pause','quiet','dispose','setClips'])Sound.prototype[name]=function(){};
 Sound.prototype.sync=function(){effectsSynced++;};Sound.prototype.quiet=function(){effectsQuieted++;};
 const shared={performance:{now:()=>now}};
 function localModule(name){const exports={};runInNewContext(read('plugins/musical/src/'+name+'.js'),{exports,...shared});return exports;}
 const controller={load(){},setTune(){audioPreparations++;return pendingAudio.promise;},pause(){},destroy(){}};
 const context={state:'suspended',resume:()=>pendingAudio.promise};
 const ABC={renderAbc:()=>{notationRenders++;return [{getTotalTime:()=>notatedSeconds,noteTimings:[]}];},
  synth:{supportsAudio:()=>audioPending,activeAudioContext(){contextRequests++;return context;},SynthController:function(){}}};
 const deps={
  '$:/core/modules/widgets/widget.js':{widget:Widget},
  '$:/plugins/huwiki/cutout/engine.js':{
   readScene:()=>scene,build:()=>({scene,svg:doc.createElement('svg'),nodes:{},clips:[]}),
   paint:(_view,time)=>painted.push(time),clipAt:()=>({index:-1})
  },
  '$:/plugins/huwiki/abc/loader.js':{load:()=>load.promise},
  '$:/plugins/huwiki/abc/audio-controller.js':{install:()=>controller},
  '$:/plugins/huwiki/abc/playback.js':{register(){registrations++;},unregister(){},start(){},stopOne(){}},
  '$:/plugins/huwiki/abc/accompaniment.js':{read:()=>({enabled:false}),prepare(){}},
  '$:/plugins/huwiki/abc/start-position.js':{seek(){}},
  '$:/plugins/huwiki/animus-video-export/runtime.js':{attach(options){exportOptions=options;return {dispose(){}};}},
  '$:/plugins/huwiki/musical/cue-score.js':localModule('cue-score'),
  '$:/plugins/huwiki/musical/sync.js':localModule('sync'),
  '$:/plugins/huwiki/musical/playlist.js':localModule('playlist'),
  '$:/plugins/huwiki/musical/editor.js':{attach(options){editorOptions=options;return {paint(){},redraw(){},dispose(){},
   isTrackVisible:id=>exporting||preview[id]!==false,isSongAudible:()=>exporting||preview.music,
   isAudioAudible:()=>exporting||preview.audio,isSfxAudible:()=>exporting||preview.sfx,
   beginExport(){exporting=true;options.repaint();return ()=>{exporting=false;options.repaint();};}
  };}},
  '$:/plugins/huwiki/musical/workspace.js':{mount:options=>{workspaceOptions=options;return {refreshHandles(){},dispose(){}};}},
  '$:/plugins/huwiki/musical/motion.js':{beatClock:()=>({at:t=>t}),paint(){}},
  '$:/plugins/huwiki/musical/sfx.js':{Fx:Sound},
  '$:/plugins/huwiki/musical/narration.js':localModule('narration-player'),
  '$:/plugins/huwiki/musical/lipsync.js':{apply(){},invalidate(){},reset(){}}
 };
 const exports={};runInNewContext(widgetSource,{exports,...shared,$tw:{rootWidget:{}},window:doc.defaultView,
  require(name){if(name===languageTitle)return language;if(!deps[name])throw Error('Unavailable test module: '+name);return deps[name];},
  requestAnimationFrame(callback){const id=++nextFrame;frames.set(id,callback);return id;},
  cancelAnimationFrame:id=>frames.delete(id)});
 const widget=new exports['musical-stage']({}, {document:doc,wiki});widget.render(doc.body,null);
 const range=widget.host.querySelector('.huw-musical-range'),play=widget.host.querySelector('.huw-musical-play');
 return {widget,range,play,painted,scene,audios,exportOptions,preview,
  previewChange(changes){Object.assign(preview,changes);editorOptions.onPreviewChange();editorOptions.repaint();},
   previewMode(mode){widget.host.dataset.previewMode=mode;if(mode!=='stage')workspaceOptions.refreshScore();},
  seek(time){range.value=String(time);range.dispatch('input');},
  updateClips(rows){editorOptions.updateClips(rows);},
  async load(){load.resolve(ABC);await load.promise;await Promise.resolve();assert.equal(play.disabled,false);assert.ok(widget._songStates.filter(song=>!song.clip.muted||(!song.page.hidden&&widget.host.dataset.previewMode!=="stage")).every(song=>song.tune));},
  async flush(){await Promise.resolve();await Promise.resolve();},
  advance(ms){now+=ms;const queued=[...frames.entries()];frames.clear();for(const [,callback] of queued)callback(now);},
  get duration(){return editorOptions.duration();},get audioPreparations(){return audioPreparations;},
  get contextRequests(){return contextRequests;},get registrations(){return registrations;},get notationRenders(){return notationRenders;},
  get effectsSynced(){return effectsSynced;},get effectsQuieted(){return effectsQuieted;}
 };
}

test('Turn Around muted guide scores preserve the authored 481.377-second timeline after ABC loads',async()=>{
 const f=fixture();await f.load();
 assert.equal(f.duration,481.377);
 assert.equal(Number(f.range.max),481.377);
 assert.deepEqual(plain(f.widget._songStates.map(song=>song.clip.duration)),film.musical.songs.map(song=>song.duration));
 assert.match(f.widget.host.querySelector('.huw-musical-time').textContent,/\/ 8:01$/);
});

test('asynchronous notation completion keeps a user seek and the selected score instead of repainting frame zero',async()=>{
 const f=fixture();f.seek(60);
 assert.equal(f.painted.at(-1),60);
 const activeScore=f.widget.host.dataset.activeSong;
 await f.load();
 assert.equal(f.painted.at(-1),60);
 assert.equal(Number(f.range.value),60);
 assert.equal(f.widget.host.dataset.cameraTime,'60.00');
 assert.equal(f.widget.host.dataset.activeSong,activeScore);
 assert.match(f.widget.host.querySelector('.huw-musical-time').textContent,/^1:00 \/ 8:01$/);
});

test('ordinary audible ABC still sets its performed duration and pending audio preparation does not stop the picture clock',async()=>{
 const f=fixture({songs:[{id:'audible',score:'Score',start:0,duration:16,muted:false}],notatedSeconds:530,audioPending:true});
 await f.load();assert.equal(f.duration,530);assert.equal(f.widget._songStates[0].clip.duration,530);
 f.play.click();
 assert.equal(f.contextRequests,1,'the play gesture unlocks the shared ABC audio context synchronously');
 assert.equal(f.audioPreparations,0,'SoundFont preparation starts after the gesture, without blocking its clock');
 await f.flush();
 assert.equal(f.widget.host.dataset.playing,'true');assert.equal(f.audioPreparations,1);
 f.advance(1000);
 assert.equal(f.painted.at(-1),1);
 assert.equal(f.widget.host.dataset.cameraTime,'1.00');
 assert.equal(f.widget.host.dataset.playing,'true');
 f.widget._shutdown();
});

const recording={id:'recorded',asset:'Recorded',start:0,offset:2,duration:20,sourceDuration:22,volume:.7,muted:false};

test('preview track controls silence running voices and effects, resume in sync, and preserve exported inputs',async()=>{
 const f=fixture({recordings:[recording]});f.seek(1);f.play.click();await f.flush();f.advance(1000);
 const original=JSON.stringify(f.scene),exportInput=JSON.stringify(f.exportOptions.getLiveExportState());
 const overlay=f.widget.host.querySelector('.huw-musical-caption-overlay');
 assert.equal(f.audios[0].paused,false);assert.ok(f.effectsSynced>0);
 f.previewChange({captions:false,audio:false,sfx:false});
 assert.equal(overlay.hidden,true);assert.equal(f.audios[0].paused,true);assert.ok(f.effectsQuieted>0);
 const effectCount=f.effectsSynced;f.advance(2000);
 assert.equal(f.effectsSynced,effectCount,'hidden SFX do not fire or catch up while muted');
 assert.equal(f.widget.host.dataset.playing,'true','preview mutes do not pause the shared clock');
 f.previewChange({audio:true,sfx:true});await f.flush();
 assert.equal(f.audios[0].paused,false);assert.equal(f.audios[0].currentTime,6,'voice resumes at the current source offset');
 assert.equal(JSON.stringify(f.scene),original,'preview controls never rewrite source clips or film');
 assert.equal(JSON.stringify(f.exportOptions.getLiveExportState()),exportInput,'preview settings never invalidate completed exports');
 f.exportOptions.pause();const restore=f.exportOptions.beginExport();assert.equal(overlay.hidden,false,'export sees authored captions');
 restore();assert.equal(overlay.hidden,true,'editing preview is restored after export');f.widget._shutdown();
});

test('preview music mute changes actual playback gains without changing authored or export volume',async()=>{
 const guide={id:'audible',score:'Score',start:0,duration:20,volume:.8,muted:false};
 const f=fixture({songs:[guide],notatedSeconds:20});await f.load();f.seek(2);
 assert.equal(f.widget._songStates[0].gain,.8);
 const before=JSON.stringify(f.exportOptions.getLiveExportState());
 f.previewChange({music:false});assert.equal(f.widget._songStates[0].gain,0);
 assert.equal(f.exportOptions.getSongs()[0].clip.volume,.8);assert.equal(f.exportOptions.getSongs()[0].clip.muted,false);
 assert.equal(JSON.stringify(f.exportOptions.getLiveExportState()),before);
 f.previewChange({music:true});assert.equal(f.widget._songStates[0].gain,.8);f.widget._shutdown();
});

test('a never-resolving ABC loader cannot block Play, recorded takes or the picture clock',async()=>{
 const f=fixture({recordings:[recording]});
 assert.equal(f.play.disabled,false);assert.equal(f.registrations,1);
 f.seek(1);f.play.click();await f.flush();f.advance(2000);
 assert.equal(f.widget.host.dataset.playing,'true');assert.equal(f.painted.at(-1),3);
 assert.equal(f.audios.length,1);assert.ok(f.audios[0].playCalls>0);
 assert.equal(f.audios[0].paused,false);assert.equal(f.audios[0].currentTime,5);
 assert.equal(f.audios[0].volume,.7);assert.equal(f.audios[0].muted,false);
 assert.equal(f.audioPreparations,0);assert.equal(f.contextRequests,0);
 // The same running production survives notation arriving much later.
 await f.load();assert.equal(f.registrations,1);assert.equal(f.painted.at(-1),3);
 assert.equal(f.widget.host.dataset.playing,'true');f.widget._shutdown();
});

test('muted and zero-volume ABC guides avoid synthesis while recordings play, and unmuting prepares music',async()=>{
 for(const state of [{muted:true,volume:1},{muted:false,volume:0}]){
  const guide={id:'guide',score:'Score',start:0,duration:20,...state};
  const f=fixture({songs:[guide],audioPending:true,recordings:[recording]});await f.load();
  f.play.click();await f.flush();f.advance(1000);
  assert.equal(f.audioPreparations,0);assert.equal(f.contextRequests,0);
  assert.equal(f.audios[0].paused,false);assert.equal(f.audios[0].muted,false);
  assert.match(f.widget.host.querySelector('.huw-musical-status').textContent,/^Ready/);
  f.updateClips([{...guide,muted:false,volume:1}]);await f.flush();
  assert.equal(f.contextRequests,1);assert.equal(f.audioPreparations,1);
  f.advance(1000);assert.equal(f.painted.at(-1),2);assert.equal(f.audios[0].paused,false);
  f.widget._shutdown();
 }
});


test('the fourteen-scene film renders only visible muted guide notation and reuses it on a backward seek',async()=>{
 const f=fixture();await f.load();assert.equal(f.notationRenders,1);
 assert.equal(f.widget._songStates.filter(song=>song.tune).length,1);
 f.seek(60);assert.equal(f.notationRenders,2);assert.ok(f.widget._songStates[2].tune);
 assert.equal(f.widget._songStates[1].tune,null,'skipped scenes do no notation work');
 f.seek(0);assert.equal(f.notationRenders,2,'a prepared score is reused');
 f.play.click();await f.flush();f.advance(1000);
 assert.equal(f.notationRenders,2);assert.equal(f.duration,481.377);f.widget._shutdown();
});

test('playback changes the clock text only when its displayed second changes',async()=>{
 const f=fixture();await f.load();const clock=f.widget.host.querySelector('.huw-musical-time');
 let value=clock.textContent,writes=0;Object.defineProperty(clock,'textContent',{get:()=>value,set:next=>{writes++;value=next;}});
 f.play.click();await f.flush();for(let n=0;n<30;n++)f.advance(16);
 assert.equal(writes,0,'unchanged clock text must not trigger page-wide mutation observers');
 f.advance(1000);assert.equal(writes,1);assert.match(value,/^0:01/);f.widget._shutdown();
});


test('late notation and seeking to unseen guides do not invalidate an unchanged recording export',async()=>{
 const f=fixture({recordings:[recording]});
 const before=plain(f.exportOptions.getLiveExportState());
 assert.match(before.audio.soundFont,/^https:/);
 await f.load();assert.deepEqual(plain(f.exportOptions.getLiveExportState()),before);
 f.seek(60);assert.deepEqual(plain(f.exportOptions.getLiveExportState()),before);
});

test('unmuting an unseen guide keeps its authored duration when the lazy notation appears',async()=>{
 const f=fixture();await f.load();assert.equal(f.widget._songStates[1].tune,null);
 f.updateClips(film.musical.songs.map((clip,index)=>({...clip,...(index===1?{muted:false,volume:1}:{})})));
 f.seek(30);assert.ok(f.widget._songStates[1].tune);
 assert.equal(f.widget._songStates[1].clip.duration,film.musical.songs[1].duration);
 assert.equal(f.duration,481.377);
});


test('iPad stage-only seek updates the cursor without rendering the next hidden ABC score',async()=>{
 const f=fixture();await f.load();assert.equal(f.notationRenders,1);
 f.previewMode('stage');f.seek(60);
 assert.equal(Number(f.range.value),60);
 assert.equal(f.widget.host.dataset.cameraTime,'60.00');
 assert.equal(f.notationRenders,1,'the stage cursor must not wait for hidden ABC rendering');
 f.previewMode('split');
 assert.equal(f.notationRenders,2,'the current score renders on entering split view');
 assert.ok(f.widget._songStates[2].tune);
 f.previewMode('stage');f.seek(30);
 assert.equal(f.notationRenders,2,'another stage-only seek does not render another hidden score');
 f.widget._shutdown();
});

test('opening directly in stage view and dragging with a pointer skips hidden notation and intermediate frames',async()=>{
 const f=fixture();f.previewMode('stage');await f.load();
 assert.equal(f.notationRenders,0);
 const before=f.painted.length;
 f.range.dispatch('pointerdown',{pointerId:4});
 for(const t of [30,60,90])f.seek(t);
 assert.equal(f.painted.length,before);
 f.advance(16);assert.equal(f.painted.length,before+1);assert.equal(f.painted.at(-1),90);
 f.seek(120);f.range.dispatch('pointerup',{pointerId:4});f.advance(16);
 assert.equal(f.painted.length,before+2);assert.equal(f.painted.at(-1),120);
 f.previewMode('split');assert.equal(f.notationRenders,1);
 f.widget._shutdown();
});

