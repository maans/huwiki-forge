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
function fixture({songs=film.musical.songs,notatedSeconds=110,audioPending=false,recordings=[],viewMode='split',compactViewport=false,repaintOnDispose=false}={}){
 const doc=svgDocument(),load=deferred(),pendingAudio=deferred(),painted=[],frames=new Map(),audios=[],players=[];
 const mediaListeners=new Set(),mediaQuery={matches:compactViewport,addEventListener:(_type,listener)=>mediaListeners.add(listener),removeEventListener:(_type,listener)=>mediaListeners.delete(listener)};
 doc.defaultView.matchMedia=()=>mediaQuery;
 let now=0,nextFrame=0,editorOptions=null,workspaceOptions=null,exportOptions=null,audioPreparations=0,contextRequests=0,registrations=0,notationRenders=0,notationGeometryReads=0;
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
 Widget.prototype.computeAttributes=()=>({});
 Widget.prototype.getAttribute=(name,fallback)=>name==='scene'?'Film':name==='score'?songs[0].score:fallback;
 Widget.prototype.removeChildDomNodes=function(){for(const node of this.domNodes)node.remove();this.domNodes=[];};
 Widget.prototype.refreshSelf=function(){const next=this.domNodes[0]?.nextSibling;this.removeChildDomNodes();this.render(this.parentDomNode,next);};
 function Sound(){ }
 for(const name of ['unlock','sync','seek','pause','quiet','dispose','setClips'])Sound.prototype[name]=function(){};
 Sound.prototype.sync=function(){effectsSynced++;};Sound.prototype.quiet=function(){effectsQuieted++;};
 const shared={performance:{now:()=>now}};
 function localModule(name){const exports={};runInNewContext(read('plugins/musical/src/'+name+'.js'),{exports,...shared});return exports;}
 const controller={load(){},setTune(){audioPreparations++;return pendingAudio.promise;},pause(){},destroy(){}};
 const context={state:'suspended',resume:()=>pendingAudio.promise};
 const ABC={renderAbc:page=>{
  notationRenders++;const svg=doc.createElement('svg'),note=doc.createElement('path');
  note.ownerSVGElement=svg;svg.appendChild(note);page.appendChild(svg);
  const bounds=note.getBoundingClientRect.bind(note);note.getBoundingClientRect=()=>{notationGeometryReads++;return bounds();};
  return [{getTotalTime:()=>notatedSeconds,noteTimings:[{milliseconds:0,elements:[[note]]}]}];
 },
  synth:{supportsAudio:()=>audioPending,activeAudioContext(){contextRequests++;return context;},SynthController:function(){}}};
 const deps={
  '$:/core/modules/widgets/widget.js':{widget:Widget},
  '$:/plugins/huwiki/cutout/engine.js':{
   readScene:()=>scene,build:()=>({scene,svg:doc.createElement('svg'),nodes:{},clips:[]}),
   paint:(_view,time)=>painted.push(time),clipAt:()=>({index:-1})
  },
  '$:/plugins/huwiki/abc/loader.js':{load:()=>load.promise},
  '$:/plugins/huwiki/abc/audio-controller.js':{install:()=>controller},
  '$:/plugins/huwiki/abc/playback.js':{register(player){registrations++;players.push(player);},unregister(player){for(let i=players.length-1;i>=0;i--)if(players[i]===player)players.splice(i,1);},start(current){for(const player of [...players])if(player!==current&&player.huwikiStop)player.huwikiStop();},stopOne(){}},
  '$:/plugins/huwiki/abc/accompaniment.js':{read:()=>({enabled:false}),prepare(){}},
  '$:/plugins/huwiki/abc/start-position.js':{seek(){}},
  '$:/plugins/huwiki/animus-video-export/runtime.js':{attach(options){exportOptions=options;return {dispose(){}};}},
  '$:/plugins/huwiki/musical/sync.js':localModule('sync'),
  '$:/plugins/huwiki/musical/playlist.js':localModule('playlist'),
  '$:/plugins/huwiki/musical/editor.js':{attach(options){editorOptions=options;return {paint(){},redraw(){},dispose(){},
   isTrackVisible:id=>exporting||preview[id]!==false,isSongAudible:()=>exporting||preview.music,
   isAudioAudible:()=>exporting||preview.audio,isSfxAudible:()=>exporting||preview.sfx,
   beginExport(){exporting=true;options.repaint();return ()=>{exporting=false;options.repaint();};}
  };}},
  '$:/plugins/huwiki/musical/workspace.js':{mount:options=>{workspaceOptions=options;options.host.dataset.previewMode=viewMode;return {refreshHandles(){},dispose(){if(repaintOnDispose)options.repaint();}};}},
  '$:/plugins/huwiki/musical/motion.js':{beatClock:()=>({at:t=>t}),paint(){}},
  '$:/plugins/huwiki/musical/sfx.js':{Fx:Sound},
  '$:/plugins/huwiki/musical/narration.js':localModule('narration-player'),
  '$:/plugins/huwiki/musical/lipsync.js':{apply(){},invalidate(){},reset(){}}
 };
 const exports={};runInNewContext(widgetSource,{exports,...shared,$tw:{rootWidget:{}},window:doc.defaultView,
  require(name){if(!deps[name])throw Error('Unavailable test module: '+name);return deps[name];},
  requestAnimationFrame(callback){const id=++nextFrame;frames.set(id,callback);return id;},
  cancelAnimationFrame:id=>frames.delete(id)});
 const widget=new exports['musical-stage']({}, {document:doc,wiki});widget.render(doc.body,null);
 const range=widget.host.querySelector('.huw-musical-range'),play=widget.host.querySelector('.huw-musical-play');
 function runFrame(){const queued=[...frames.entries()];frames.clear();for(const [,callback] of queued)callback(now);}
 function flushNotation(){runFrame();runFrame();}
 return {widget,get range(){return widget.host.querySelector('.huw-musical-range');},get play(){return widget.host.querySelector('.huw-musical-play');},painted,scene,audios,exportOptions,preview,players,
  saveAndReturn(){workspaceOptions.reload();},
  startScorePreview(player){workspaceOptions.startScorePreview(player);},
  previewChange(changes){Object.assign(preview,changes);editorOptions.onPreviewChange();editorOptions.repaint();},
  seek(time){range.value=String(time);range.dispatch('input');},
  viewMode(mode){widget.host.dataset.previewMode=mode;workspaceOptions.onPreviewModeChange(mode);},
  compactView(matches){mediaQuery.matches=matches;for(const listener of mediaListeners)listener({matches});},
  clipDetail(enabled){widget.host.classList.toggle('huw-musical--clip-detail',enabled);editorOptions.repaint();},
  updateClips(rows){editorOptions.updateClips(rows);},
  async load({render=true}={}){load.resolve(ABC);await load.promise;await Promise.resolve();assert.equal(play.disabled,false);if(render)flushNotation();assert.ok(widget._songStates.filter(song=>!song.clip.muted).every(song=>song.tune));},
  async flush(){await Promise.resolve();await Promise.resolve();},
  advance(ms){now+=ms;runFrame();},flushNotation,
  get duration(){return editorOptions.duration();},get audioPreparations(){return audioPreparations;},
  get contextRequests(){return contextRequests;},get registrations(){return registrations;},get notationRenders(){return notationRenders;},
  get notationGeometryReads(){return notationGeometryReads;},get pendingFrames(){return frames.size;},
  get mediaListeners(){return mediaListeners.size;},
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

test('workshop music pauses the parent at its editing position while other players stay exclusive',async()=>{
 const f=fixture();await f.load();f.seek(60);f.play.click();await f.flush();
 const parent=f.players[0],preview={};let otherStops=0;
 f.players.push({huwikiStop(){otherStops++;}},preview);
 for(let i=0;i<2;i++){
  f.startScorePreview(preview);
  assert.equal(Number(f.range.value),60,'both initial Play and the later onStart preserve the show position');
  assert.equal(f.widget.host.dataset.playing,'false');
  assert.equal(f.players.filter(player=>player===parent).length,1,'the parent registration is restored exactly once');
 }
 assert.equal(otherStops,2);parent.huwikiStop();assert.equal(Number(f.range.value),0,'the restored parent still responds to an ordinary global Stop');f.widget._shutdown();
});

test('an exclusive-playback failure cannot lose the parent session registration',async()=>{
 const f=fixture();await f.load();f.seek(60);const parent=f.players[0];
 f.players.push({huwikiStop(){throw Error('another player failed');}});
 assert.throws(()=>f.startScorePreview({}),/another player failed/);
 assert.equal(Number(f.range.value),60);assert.equal(f.players.filter(player=>player===parent).length,1);
 f.widget._shutdown();assert.equal(f.players.includes(parent),false);
});

test('saving a score and its queued wiki refresh keep the paused editing position and replace old players',async()=>{
 const f=fixture({recordings:[recording]});await f.load();f.seek(12);f.play.click();await f.flush();f.advance(1000);
 const position=Number(f.range.value),oldHost=f.widget.host;
 assert.equal(f.audios[0].paused,false);
 f.saveAndReturn();await f.flush();
 assert.equal(oldHost.isConnected,false,'the normal workshop reload rebuilds the editor');
 assert.equal(Number(f.range.value),position);assert.equal(f.widget.host.dataset.cameraTime,position.toFixed(2));
 assert.equal(f.widget.host.dataset.playing,'false');assert.ok(f.audios.every(audio=>audio.paused));
 assert.equal(f.players.length,1,'rebuilding releases the former playback session');
 const restoredHost=f.widget.host;
 assert.equal(f.widget.refresh({[film.musical.songs[0].score]:{modified:true}}),true);
 await f.flush();
 assert.equal(restoredHost.isConnected,false,'the saved tiddler may also trigger a later wiki refresh');
 assert.equal(Number(f.range.value),position);assert.equal(f.widget.host.dataset.cameraTime,position.toFixed(2));
 assert.equal(f.widget.host.dataset.playing,'false');assert.equal(f.players.length,1);
 f.advance(1000);assert.equal(Number(f.range.value),position,'saving does not restart the picture clock');f.widget._shutdown();
});

test('a saved shorter timeline clamps the retained editing position to its new end',async()=>{
 const f=fixture({songs:[{id:'guide',score:'Score',start:0,duration:80,muted:true}]});await f.load();f.seek(60);
 f.scene.duration=20;f.scene.musical.songs[0].duration=20;
 f.saveAndReturn();await f.flush();
 assert.equal(f.duration,20);assert.equal(Number(f.range.max),20);assert.equal(Number(f.range.value),20);
 assert.equal(f.widget.host.dataset.cameraTime,'20.00');assert.equal(f.widget.host.dataset.playing,'false');f.widget._shutdown();
});

test('late score timing after a save clamps a paused position when the performed music is shorter',async()=>{
 const f=fixture({songs:[{id:'audible',score:'Score',start:0,duration:80,muted:false}],notatedSeconds:12});
 f.scene.duration=5;f.seek(60);f.saveAndReturn();await f.flush();
 assert.equal(Number(f.range.value),60,'the authored duration is used until notation arrives');
 await f.load();
 assert.equal(f.duration,12);assert.equal(Number(f.range.value),12);assert.equal(f.widget._timeline.value(),12);
 assert.equal(f.widget.host.dataset.playing,'false');f.widget._shutdown();
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


test('the fourteen-scene film retains only visible muted guide notation and reuses it within the current song',async()=>{
 const f=fixture();await f.load();assert.equal(f.notationRenders,1);
 assert.equal(f.widget._songStates.filter(song=>song.tune).length,1);
 const first=f.widget._songStates[0],firstNote=first.events[0].elements[0][0];
 f.seek(60);assert.equal(f.notationRenders,1,'a seek paints before new guide notation is rendered');
 assert.equal(first.tune,null);assert.equal(first.events.length,0);assert.equal(first.noteClickTimes,null);
 assert.equal(first.page.childNodes.length,0);assert.equal(firstNote.isConnected,false);
 f.flushNotation();assert.equal(f.notationRenders,2);assert.ok(f.widget._songStates[2].tune);
 assert.equal(f.widget._songStates[1].tune,null,'skipped scenes do no notation work');
 f.seek(61);f.flushNotation();assert.equal(f.notationRenders,2,'a current score is reused');
 f.seek(0);f.flushNotation();assert.equal(f.notationRenders,3,'an evicted guide is rebuilt only when revisited');
 assert.equal(f.widget._songStates.filter(song=>song.tune).length,1);
 f.play.click();await f.flush();f.advance(1000);
 assert.equal(f.notationRenders,3);assert.equal(f.duration,481.377);f.widget._shutdown();
});

test('scene-only editing skips all guide scores, and switching back while paused renders only the current one',async()=>{
 const f=fixture({viewMode:'stage'}),before=JSON.stringify(f.scene);await f.load();
 for(const clip of film.musical.songs){f.seek(clip.start+Math.min(2,clip.duration/2));f.flushNotation();}
 assert.equal(f.notationRenders,0);assert.equal(f.notationGeometryReads,0);
 assert.equal(f.widget._songStates.filter(song=>song.tune).length,0);
 const position=Number(f.range.value),active=f.widget.host.dataset.activeSong;
 f.viewMode('score');assert.equal(f.notationRenders,0,'switching view does not block the change event');
 f.flushNotation();assert.equal(f.notationRenders,1);assert.ok(f.notationGeometryReads>0);
 assert.equal(f.widget.host.dataset.activeSong,active);assert.equal(Number(f.range.value),position);
 f.viewMode('stage');assert.equal(f.widget._songStates.filter(song=>song.tune).length,0);
 assert.equal(f.widget.host.querySelectorAll('.huw-musical-score-page svg').length,0);
 const reads=f.notationGeometryReads;f.seek(position+.1);f.flushNotation();assert.equal(f.notationGeometryReads,reads);
 assert.equal(JSON.stringify(f.scene),before);assert.equal(f.duration,481.377);f.widget._shutdown();
});

test('scrubbing all fourteen scores keeps the rendered guide window bounded',async()=>{
 const f=fixture();await f.load();
 for(const clip of film.musical.songs){
  f.seek(clip.start+Math.min(2,clip.duration/2));f.flushNotation();
  const states=f.widget._songStates,visible=states.filter(song=>!song.page.hidden);
  assert.ok(states.filter(song=>song.tune).length<=visible.length);
  assert.ok(states.filter(song=>song.page.querySelector('svg')).length<=visible.length);
  assert.ok(states.filter(song=>song.page.hidden).every(song=>song.tune===null&&song.events.length===0&&song.page.childNodes.length===0));
 }
 assert.equal(f.duration,481.377);f.widget._shutdown();
});

test('responsive split and animation detail skip their CSS-hidden guides and restore the current paused score',async()=>{
 const f=fixture({compactViewport:true});await f.load();f.seek(60);f.flushNotation();
 assert.equal(f.notationRenders,0,'the narrow split layout contains no visible score');
 f.compactView(false);f.flushNotation();assert.equal(f.notationRenders,1);
 assert.ok(f.widget._songStates[2].tune);assert.equal(Number(f.range.value),60);
 f.clipDetail(true);assert.equal(f.widget._songStates.filter(song=>song.tune).length,0);
 f.seek(100);f.flushNotation();assert.equal(f.notationRenders,1,'animation detail keeps the score hidden');
 f.clipDetail(false);f.flushNotation();assert.equal(f.notationRenders,2);assert.equal(Number(f.range.value),100);
 f.compactView(true);assert.equal(f.widget._songStates.filter(song=>song.tune).length,0);
 f.viewMode('score');f.flushNotation();assert.equal(f.notationRenders,3,'score-only is visible even on a narrow screen');
 assert.equal(f.mediaListeners,1);f.widget._shutdown();assert.equal(f.mediaListeners,0);
 f.compactView(false);f.flushNotation();assert.equal(f.notationRenders,3);
});

test('rapid seeks render the final guide only and disposal cancels deferred notation',async()=>{
 const f=fixture();await f.load({render:false});
 f.seek(30);f.seek(60);f.seek(100);assert.equal(f.notationRenders,0);
 f.flushNotation();assert.equal(f.notationRenders,1);assert.equal(Number(f.range.value),100);
 assert.equal(f.widget._songStates.filter(song=>song.tune).length,1);
 f.seek(0);assert.ok(f.pendingFrames>0);f.widget._shutdown();f.flushNotation();
 assert.equal(f.notationRenders,1);assert.equal(f.pendingFrames,0);
});

test('canceling a drag during workspace disposal cannot schedule fresh notation work',async()=>{
 const f=fixture({repaintOnDispose:true});await f.load({render:false});
 assert.ok(f.pendingFrames>0);assert.equal(f.notationRenders,0);
 f.widget._shutdown();assert.equal(f.pendingFrames,0,'the disposal repaint must not replace the canceled notation task');
 f.flushNotation();assert.equal(f.pendingFrames,0);assert.equal(f.notationRenders,0);
});

test('audible ABC retains its notation and performed timing in scene-only mode',async()=>{
 const f=fixture({viewMode:'stage',songs:[{id:'audible',score:'Score',start:0,duration:16,muted:false}],notatedSeconds:530,audioPending:true});
 await f.load();assert.equal(f.notationRenders,1);assert.equal(f.notationGeometryReads,0);
 assert.equal(f.duration,530);const tune=f.widget._songStates[0].tune;
 f.viewMode('score');f.flushNotation();f.viewMode('stage');
 assert.equal(f.widget._songStates[0].tune,tune);assert.equal(f.notationRenders,1);
 f.play.click();await f.flush();assert.equal(f.audioPreparations,1);f.widget._shutdown();
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
 f.seek(30);f.flushNotation();assert.ok(f.widget._songStates[1].tune);
 assert.equal(f.widget._songStates[1].clip.duration,film.musical.songs[1].duration);
 assert.equal(f.duration,481.377);
});
