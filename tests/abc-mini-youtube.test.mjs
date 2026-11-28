import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

async function setup({ready=true}={}){
 const doc=svgDocument(),players=[];
 Object.assign(doc.defaultView,{innerWidth:1200,innerHeight:900,location:{origin:'https://example.com'},requestAnimationFrame(){},addEventListener(){},removeEventListener(){},sessionStorage:{getItem(){return null;},setItem(){}}});
 doc.defaultView.YT={Player:class{
  constructor(frame,{events}){this.frame=frame;this.events=events;this.plays=0;this.pauses=0;this.destroyed=0;this.time=0;players.push(this);if(ready)queueMicrotask(()=>events.onReady());}
  playVideo(){this.plays++;this.events.onStateChange({data:1});}
  pauseVideo(){this.pauses++;this.events.onStateChange({data:2});}
  getCurrentTime(){return this.time;}
  seekTo(time){this.time=time;}
  destroy(){this.destroyed++;}
 }};
 const wiki={getTiddler(title){return {fields:{title,'repertoire-youtube':'https://youtu.be/abcdefghijk'}};},getTiddlerText(){return 'da';}};
 const youtube={};runInNewContext(await readFile(new URL('../plugins/abc/src/mini-youtube.js',import.meta.url),'utf8'),{exports:youtube});
 const mixer={};runInNewContext(await readFile(new URL('../plugins/abc/src/floating-mixer.js',import.meta.url),'utf8'),{exports:mixer,require(name){if(name.endsWith('/mini-youtube.js'))return youtube;if(name.endsWith('/accompaniment.js'))return {clean:()=>({reverb:0,voiceSettings:{},backingModes:{},bassSource:'auto'}),activeSolo:()=>false};if(name.endsWith('/voice-routing.js'))return {clean:()=>({}),describe:()=>[]};if(name.endsWith('/chord-chart.js'))return {extract:()=>({chords:[],measures:[],noteTimes:{}})};if(name.endsWith('/playback-feedback.js'))return {update(){}};return {};}});
 const host=doc.createElement('div');doc.body.appendChild(host);
 return {doc,players,host,wiki,youtube,mixer,settle:async()=>{await Promise.resolve();await Promise.resolve();}};
}

test('Collapsed video keeps the same player and can pause and resume from the mixer header',async()=>{
 const env=await setup(),states=[];
 const panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'Song',videoOnly:true,initiallyVisible:false,onTransportState:(playing)=>states.push(playing)});
 panel.show();await env.settle();
 const player=env.players[0],play=panel.element.querySelector('.huwabc-mini-mixer-play');
 play.click();assert.equal(player.plays,1);assert.equal(play.getAttribute('aria-pressed'),'true');
 panel.collapse(true);assert.equal(panel.element.querySelector('.huwabc-mini-mixer-content').hidden,true);
 assert.equal(player.destroyed,0);assert.equal(panel.isPlaying(),true);
 play.click();assert.equal(player.pauses,1);assert.equal(panel.isPlaying(),false);assert.equal(play.getAttribute('aria-pressed'),'false');
 play.click();assert.equal(player.plays,2);
 panel.collapse(false);assert.equal(env.players.length,1);assert.equal(player.destroyed,0);
 assert.equal(states.at(-1),true);
 panel.destroy();assert.equal(player.destroyed,1);
});

test('A second click cancels playback requested before the YouTube API is ready',async()=>{
 const env=await setup({ready:false}),panel=env.youtube.mount(env.host,{wiki:env.wiki,title:'Song'});
 panel.show();await env.settle();
 panel.toggle();assert.equal(panel.isPlaying(),true);
 panel.toggle();assert.equal(panel.isPlaying(),false);
 env.players[0].events.onReady();assert.equal(env.players[0].plays,0);
 panel.toggle();assert.equal(env.players[0].plays,1);panel.destroy();
});

test('Closing YouTube stops it, while unrelated ABC state updates preserve video playback',async()=>{
 const env=await setup(),panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'Song',videoOnly:true,initiallyVisible:false});
 panel.show();await env.settle();panel.togglePlayback();
 panel.updatePlayback(false);panel.updatePreparing(false);
 assert.equal(panel.isPlaying(),true);assert.equal(panel.element.querySelector('.huwabc-mini-mixer-play').getAttribute('aria-pressed'),'true');
 panel.hide();assert.equal(env.players[0].destroyed,1);panel.destroy();
});

test('One YouTube tab click stops ABC and opens the video despite synchronous Stop status callbacks',async()=>{
 for(const active of ['playing','preparing']){
  const env=await setup();let stops=0,playing=active==='playing',preparing=active==='preparing';
  const panel=env.mixer.mount({host:env.host,ABC:{},wiki:env.wiki,title:'Song',initiallyVisible:false,
   getPlaying:()=>playing,getPreparing:()=>preparing,onStopPlayback(){
    stops++;preparing=false;panel.updatePreparing(false);
    playing=false;panel.updatePlayback(false);
   }});
  panel.show();
  panel.element.querySelectorAll('[role=tab]')[3].click();await env.settle();
  const selected=panel.element.querySelectorAll('[role=tab]').filter(tab=>tab.getAttribute('aria-selected')==='true');
  assert.deepEqual(selected.map(tab=>tab.textContent),['YouTube'],active);
  assert.equal(env.players.length,1,active);assert.equal(stops,1,active);
  assert.equal(env.players[0].plays,0,'Opening the tab must not auto-play video');
  panel.togglePlayback();assert.equal(env.players[0].plays,1);
  panel.togglePlayback();assert.equal(env.players[0].pauses,1);
  panel.destroy();
 }
});

test('Displayed key changes preserve concert audio and do not alter the ABC source',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../plugins/abc/dist/plugin.json',import.meta.url),'utf8'));
 const entries=JSON.parse(pkg.text).tiddlers,prefix='$:/plugins/huwiki/abc/',cache={};
 function load(name){if(cache[name])return cache[name];const result={},module={exports:result};cache[name]=result;runInNewContext(entries[prefix+name].text,{exports:result,module,window:{},require:id=>id.endsWith('/i18n.js')?{language:()=> 'da'}:load(id.slice(prefix.length))});return cache[name]=module.exports;}
 const view=load('instrument-view.js'),abc=load('vendor/abcjs.js'),source='X:1\nM:4/4\nL:1/4\nK:Dm\n"Dm"D E F G |';
 const baseline=JSON.stringify(abc.parseOnly(source)[0].setUpAudio());
 for(const shift of [-11,-2,0,3,11]){view.setTranspose(shift);assert.equal(view.current().semitones,shift);assert.equal(JSON.stringify(abc.parseOnly(source,{visualTranspose:shift})[0].setUpAudio()),baseline);assert.equal(view.soundingPitches([60+shift])[0],60);}
 assert.equal(view.setTranspose(12),false);
});

test('A PDF-only mixer keeps all four tabs and opening or switching them never starts audio',async()=>{
 const env=await setup();let plays=0,stops=0;
 const panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'PDF tune',videoOnly:true,initiallyVisible:false,onTogglePlayback(){plays++;},onStopPlayback(){stops++;}});
 const tabs=panel.element.querySelectorAll('[role=tab]');assert.equal(tabs.length,4);
 assert.deepEqual(tabs.map(tab=>tab.textContent),['Stemmer','Akkompagnement','C7 · Akkorder','YouTube']);
 assert.ok(tabs.every(tab=>!tab.hidden));
 panel.show();await env.settle();assert.equal(env.players[0].plays,0);
 for(const tab of ['voices','accompaniment','chords','youtube']){
  panel.selectTab(tab);await env.settle();assert.equal(plays,0);assert.equal(stops,0);
  assert.equal(panel.isPlaying(),false);
  const button=panel.element.querySelector('.huwabc-mini-mixer-play');assert.equal(button.disabled,tab!=='youtube');
 }
 assert.ok(panel.element.querySelector('.huwabc-mini-mixer-list').textContent.includes('ingen ABC-stemmer'));
 assert.equal(env.players.at(-1).plays,0);panel.togglePlayback();assert.equal(env.players.at(-1).plays,1);
 panel.destroy();
});


function sidebar(env,{atomic=true,visible=true}={}){
 const doc=env.doc,root=doc.createElement('div'),wrapper=doc.createElement('div'),header=doc.createElement('div'),moves=[];
 root.className='tc-sidebar-scrollable';header.className='tc-sidebar-header';header.box={x:900,y:30,width:280,height:80};
 wrapper.appendChild(header);root.appendChild(wrapper);doc.body.appendChild(root);
 Object.defineProperty(root,'firstElementChild',{get:()=>wrapper});
 doc.defaultView.getComputedStyle=()=>({display:visible?'block':'none',visibility:'visible'});
 if(atomic)for(const target of [doc.body,wrapper])target.moveBefore=function(node,before){moves.push(this);this.insertBefore(node,before);};
 return {wrapper,moves};
}

test('Dock and detach preserve the same YouTube player, current time and active playback',async()=>{
 const env=await setup(),dock=sidebar(env),panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'Song',videoOnly:true,initialFloating:true,initiallyVisible:false});
 panel.show();await env.settle();panel.togglePlayback();const player=env.players[0];player.time=37.25;
 panel.redock();await env.settle();assert.equal(panel.isFloating(),false);assert.equal(panel.isVisible(),true);assert.equal(panel.element.parentNode,dock.wrapper);
 assert.equal(player.destroyed,0);assert.equal(env.players.length,1);assert.equal(panel.isPlaying(),true);assert.equal(player.time,37.25);
 panel.show({floating:true});await env.settle();assert.equal(panel.element.parentNode,env.doc.body);assert.equal(panel.isFloating(),true);assert.equal(panel.isPlaying(),true);
 assert.equal(player.destroyed,0);assert.equal(env.players.length,1);assert.equal(dock.moves.length,2);
 panel.togglePlayback();assert.equal(player.pauses,1);panel.destroy();
});

test('Older browsers restore playback position after both dock and detach without losing pause state',async()=>{
 const env=await setup(),dock=sidebar(env,{atomic:false}),panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'Song',videoOnly:true,initialFloating:true,initiallyVisible:false});
 panel.show();await env.settle();panel.togglePlayback();env.players[0].time=42.5;
 panel.redock();await env.settle();assert.equal(panel.element.parentNode,dock.wrapper);assert.equal(env.players[0].destroyed,1);
 assert.equal(env.players[1].time,42.5);assert.equal(env.players[1].plays,1);assert.equal(panel.isPlaying(),true);
 panel.togglePlayback();panel.show({floating:true});await env.settle();
 assert.equal(env.players[2].time,42.5);assert.equal(env.players[2].plays,0);assert.equal(panel.isPlaying(),false);assert.equal(panel.isVisible(),true);panel.destroy();
});

test('A hidden sidebar cannot make a requested mixer disappear or stop its video',async()=>{
 const env=await setup();sidebar(env,{visible:false});
 const panel=env.mixer.mount({host:env.host,wiki:env.wiki,title:'Song',videoOnly:true,initialFloating:true,initiallyVisible:false});
 panel.show();await env.settle();panel.togglePlayback();const player=env.players[0];
 panel.redock();assert.equal(panel.isFloating(),true);assert.equal(panel.isVisible(),true);assert.equal(panel.isPlaying(),true);assert.equal(player.destroyed,0);panel.destroy();
});
