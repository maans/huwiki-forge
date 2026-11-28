import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

async function setup({ready=true}={}){
 const doc=svgDocument(),players=[];
 Object.assign(doc.defaultView,{innerWidth:1200,innerHeight:900,location:{origin:'https://example.com'},requestAnimationFrame(){},addEventListener(){},removeEventListener(){},sessionStorage:{getItem(){return null;},setItem(){}}});
 doc.defaultView.YT={Player:class{
  constructor(frame,{events}){this.frame=frame;this.events=events;this.plays=0;this.pauses=0;this.destroyed=0;players.push(this);if(ready)queueMicrotask(()=>events.onReady());}
  playVideo(){this.plays++;this.events.onStateChange({data:1});}
  pauseVideo(){this.pauses++;this.events.onStateChange({data:2});}
  destroy(){this.destroyed++;}
 }};
 const wiki={getTiddler(title){return {fields:{title,'repertoire-youtube':'https://youtu.be/abcdefghijk'}};},getTiddlerText(){return 'da';}};
 const youtube={};runInNewContext(await readFile(new URL('../plugins/abc/src/mini-youtube.js',import.meta.url),'utf8'),{exports:youtube});
 const mixer={};runInNewContext(await readFile(new URL('../plugins/abc/src/floating-mixer.js',import.meta.url),'utf8'),{exports:mixer,require(name){if(name.endsWith('/mini-youtube.js'))return youtube;if(name.endsWith('/accompaniment.js'))return {clean:()=>({reverb:0})};if(name.endsWith('/playback-feedback.js'))return {update(){}};return {};}});
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
