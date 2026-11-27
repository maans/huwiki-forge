import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
const read=name=>readFile(new URL('../plugins/abc/src/'+name,import.meta.url),'utf8');
const code={feedback:await read('playback-feedback.js'),mixer:await read('floating-mixer.js'),minimal:await read('minimal-player.js')};
function shared(){
 const doc=svgDocument(),win=doc.defaultView;
 Object.assign(win,{innerWidth:1280,innerHeight:900,sessionStorage:{getItem:()=>null,setItem(){}},addEventListener(){},removeEventListener(){},requestAnimationFrame(fn){fn();},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 const feedback={};runInNewContext(code.feedback,{exports:feedback});
 const config={enabled:false,voiceSettings:{},backingModes:{},bassSource:'style',reverb:0,bassVolume:60,chordVolume:60,drumVolume:60,metronomeVolume:60,droneVolume:60};
 const accompaniment={clean:v=>({...config,...v}),read:()=>({...config}),activeSolo:()=>false,createDrone:()=>({stop(){},start(){},configure(){}}),prepare:(_A,t)=>({tune:t}),liveConfigChange:()=>false};
 const modules={
  '$:/plugins/huwiki/abc/playback-feedback.js':feedback,
  '$:/plugins/huwiki/abc/voice-routing.js':{clean:v=>v||{},describe:()=>[],bassSource:v=>v},
  '$:/plugins/huwiki/abc/voice-controls.js':{},
  '$:/plugins/huwiki/abc/accompaniment.js':accompaniment,
  '$:/plugins/huwiki/abc/chord-chart.js':{extract:()=>({chords:[],measures:[],noteTimes:{}}),atEvent:()=>-1}
 };
 const mixer={};runInNewContext(code.mixer,{exports:mixer,require:id=>{assert.ok(modules[id],id);return modules[id];},document:doc,window:win});
 return {doc,win,feedback,mixer,modules,config};
}

test('transport feedback is immediate, reusable and localized, and preserves newer Pause labels',()=>{
 const {doc,feedback}=shared(),button=doc.createElement('button');doc.body.appendChild(button);
 button.setAttribute('aria-label','Play');button.setAttribute('title','Play');
 const normal=doc.createElement('span');normal.textContent='▶';button.appendChild(normal);
 feedback.update(button,true,{language:'en'});
 assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(button.getAttribute('aria-label'),'Preparing …');
 assert.equal(button.querySelector('.huwabc-preparing-label').textContent,'Preparing …');
 assert.equal(button.querySelector('.huwabc-preparing-spinner').hidden,false);assert.equal(button.disabled,undefined);
 feedback.update(button,true,{language:'da'});
 assert.equal(button.querySelectorAll('.huwabc-preparing-spinner').length,1);
 assert.equal(button.getAttribute('aria-label'),'Gør klar …');
 button.setAttribute('aria-label','Pause');feedback.update(button,false,{language:'da'});
 assert.equal(button.getAttribute('aria-label'),'Pause');assert.equal(button.getAttribute('aria-busy'),null);
 assert.equal(button.querySelector('.huwabc-preparing-label').hidden,true);assert.equal(normal.textContent,'▶');
 feedback.update(button,true,{language:'en'});feedback.update(button,false,{language:'en'});
 assert.equal(button.getAttribute('aria-label'),'Pause');
});

test('a mixer opened during preparation shows the same state while collapsed, docked or floating',()=>{
 const {doc,mixer}=shared(),sidebar=doc.createElement('div');sidebar.className='tc-sidebar-scrollable';
 const wrapper=doc.createElement('div'),header=doc.createElement('div');header.className='tc-sidebar-header';header.box={x:900,y:30,width:300,height:80};
 wrapper.appendChild(header);sidebar.appendChild(wrapper);doc.body.appendChild(sidebar);
 // SVG fixture DOM exposes children; the browser exposes firstElementChild.
 Object.defineProperty(sidebar,'firstElementChild',{get:()=>wrapper});
 const wiki={getTiddlerText:(_id,fallback)=>fallback,getTiddler:()=>null},host=doc.createElement('section');doc.body.appendChild(host);
 let toggles=0;
 const panel=mixer.mount({host,ABC:{},wiki,title:'Test tune',getPreparing:()=>true,onTogglePlayback(){toggles++;}});
 const play=panel.element.querySelector('.huwabc-mini-mixer-play');
 assert.equal(play.getAttribute('aria-busy'),'true');assert.equal(play.querySelector('.huwabc-preparing-label').textContent,'Gør klar …');
 assert.equal(play.getAttribute('aria-label'),'Test tune · Gør klar …');
 panel.collapse(true);assert.equal(play.getAttribute('aria-busy'),'true');assert.equal(play.closest('.huwabc-mini-mixer-content'),null);
 panel.show({floating:true});panel.redock();assert.equal(play.getAttribute('aria-busy'),'true');
 play.click();assert.equal(toggles,1,'busy clicks still reach the guarded controller');
 panel.updatePlayback(true);assert.equal(play.getAttribute('aria-busy'),'true','ready/start ordering cannot clear preparation');
 panel.updatePreparing(false);assert.equal(play.getAttribute('aria-busy'),null);assert.equal(play.getAttribute('aria-label'),'Test tune · Pause');
 panel.destroy();
});

function minimalHarness({language='da',failure=false}={}){
 const h=shared(),{doc,modules}=h,host=doc.createElement('section');doc.body.appendChild(host);
 let release,reject,controls,controllerOptions,starts=0;
 const gate=new Promise((resolve,no)=>{release=resolve;reject=no;});
 const visual={formatting:{},lines:[],getKeySignature:()=>({root:'C'}),setUpAudio:()=>({tracks:[]})};
 class Controller{
  load(parent,cursor){controls=parent;this.cursor=cursor;const inline=doc.createElement('div');inline.className='abcjs-inline-audio';const button=doc.createElement('button');button.className='abcjs-midi-start';inline.appendChild(button);parent.appendChild(inline);this.control={pushPlay:value=>button.classList.toggle('abcjs-pushed',value)};button.addEventListener('click',()=>this.play().catch(()=>{}));}
  setTune(tune){this.visualObj=tune;return Promise.resolve();}
  setProgress(){}destroy(){}disable(){}
 }
 Object.assign(modules,{
  '$:/plugins/huwiki/abc/i18n.js':{language:()=>language,translate:v=>v,observe:()=>({destroy(){}})},
  '$:/plugins/huwiki/abc/audio-controller.js':{install(controller,_ABC,options){controllerOptions=options;let pending,cancelled=false;
   controller.play=()=>{if(pending)return pending;cancelled=false;options.onPreparing(true);controller.isPreparing=true;pending=gate.then(()=>{if(cancelled)return;if(failure)throw Error('No samples');controller.isStarted=true;controller.isPreparing=false;options.onPreparing(false);controller.control.pushPlay(true);controller.cursor.onStart();starts++;}).catch(error=>{controller.isPreparing=false;options.onPreparing(false);options.onError(error);}).finally(()=>{pending=null;});return pending;};
   controller.pause=()=>{cancelled=true;controller.isPreparing=false;options.onPreparing(false);options.onStop(false);};return controller;}},
  '$:/plugins/huwiki/abc/playback.js':{register(){},unregister(){},start(){},stopOne(c){c.pause();}},
  '$:/plugins/huwiki/abc/score-view.js':{swingValue:()=>0},
  '$:/plugins/huwiki/abc/tabs.js':{view:()=>({config:{},enabled:false}),options:()=>({options:[]}),notation:{project(){}}},
  '$:/plugins/huwiki/abc/jazz-font.js':{render:(_ABC,_jazz,fn)=>fn(),formatFonts:(_jazz,opts)=>opts},
  '$:/plugins/huwiki/abc/sheet-layout.js':{prepare(){},options:()=>({})},
  '$:/plugins/huwiki/abc/display-source.js':{presentation:s=>s},
  '$:/plugins/huwiki/abc/instrument-view.js':{current:()=>({semitones:0}),observe:()=>()=>{}},
  '$:/plugins/huwiki/abc/transposed-layout.js':{options:(_ABC,_box,_source,opts)=>opts},
  '$:/plugins/huwiki/abc/keyboard-shortcuts.js':{register:()=>()=>{},inputOwnsKey:()=>false},
  '$:/plugins/huwiki/abc/floating-mixer.js':h.mixer
 });
 const minimal={};runInNewContext(code.minimal,{exports:minimal,require:id=>modules[id]||{},document:doc,console});
 const ABC={parseOnly:()=>[visual],renderAbc:(_host,_source,options)=>{options.afterParsing(visual);return [visual];},synth:{supportsAudio:()=>true,SynthController:Controller}};
 const player=minimal.mount(host,{ABC,source:'X:1\nK:C\nC4|',fields:{},wiki:{getTiddlerText:(id,fallback)=>id==='$:/language'?language:fallback},mixerButton:true});
 return {...h,player,host,controls,get options(){return controllerOptions;},release,reject,starts:()=>starts};
}

test('minimal transport and a lazily opened mixer retain preparation until real playback starts',async()=>{
 const h=minimalHarness(),play=h.controls.querySelector('.abcjs-midi-start');
 play.click();assert.equal(play.getAttribute('aria-busy'),'true','same event turn');
 assert.equal(play.querySelector('.huwabc-preparing-label').textContent,'Gør klar …');
 h.options.onStatus({phase:'ready'});assert.equal(play.getAttribute('aria-busy'),'true','sample-ready is earlier than start');
 h.controls.querySelector('.huwabc-mini-open').click();
 const mini=h.doc.querySelector('.huwabc-mini-mixer-play');assert.ok(mini);assert.equal(mini.getAttribute('aria-busy'),'true');
 mini.click();play.click();h.release();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(h.starts(),1);assert.equal(play.getAttribute('aria-busy'),null);assert.equal(mini.getAttribute('aria-busy'),null);assert.equal(mini.getAttribute('aria-pressed'),'true');
 h.player.destroy();
});

test('failed preparation clears both transports and leaves a visible error',async()=>{
 const h=minimalHarness({language:'en',failure:true}),play=h.controls.querySelector('.abcjs-midi-start');
 play.click();h.controls.querySelector('.huwabc-mini-open').click();
 const mini=h.doc.querySelector('.huwabc-mini-mixer-play');assert.equal(mini.querySelector('.huwabc-preparing-label').textContent,'Preparing …');
 h.release();for(let i=0;i<6;i++)await Promise.resolve();
 assert.equal(h.starts(),0);assert.equal(play.getAttribute('aria-busy'),null);assert.equal(mini.getAttribute('aria-busy'),null);
 const status=h.host.querySelector('.huwabc-minimal-status');assert.equal(status.hidden,false);assert.match(status.textContent,/No samples/);
 h.player.destroy();
});


test('stopping a pending request immediately clears visible preparation on both controls',async()=>{
 const h=minimalHarness(),play=h.controls.querySelector('.abcjs-midi-start');
 play.click();h.controls.querySelector('.huwabc-mini-open').click();
 const mini=h.doc.querySelector('.huwabc-mini-mixer-play');
 h.player.controller.pause();
 assert.equal(play.getAttribute('aria-busy'),null);assert.equal(mini.getAttribute('aria-busy'),null);
 assert.equal(mini.getAttribute('aria-pressed'),'false');
 h.release();for(let i=0;i<6;i++)await Promise.resolve();assert.equal(h.starts(),0);
 h.player.destroy();
});
