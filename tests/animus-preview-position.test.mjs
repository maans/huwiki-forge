import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const sources=Object.fromEntries(await Promise.all(['widget','sync','playlist'].map(async name=>[name,await read('plugins/musical/src/'+name+'.js')])));

function harness(t){
 const doc=svgDocument(),paints=[],editorPaints=[],frames=new Map();
 for(const method of ['createElement','createElementNS']){const create=doc[method];doc[method]=(...args)=>{const node=create(...args);node.nodeType=1;return node;};}
 let resolveLoader,workspaceOptions,frameId=0;
 const loading=new Promise(resolve=>{resolveLoader=resolve;});
 const film={version:1,name:'Preview show',width:800,height:450,duration:20,parts:[],scenes:[],musical:{
  songs:[{id:'a',score:'Score A',start:0,duration:10},{id:'b',score:'Score B',start:10,duration:10}],audioClips:[]
 }};
 const rows={'Score A':{title:'Score A',text:'X:1\nK:C\nCDEF|'},'Score B':{title:'Score B',text:'X:2\nK:C\nGABc|'}};
 const wiki={getTiddler:title=>rows[title]?{fields:rows[title]}:null,getTiddlerText:(title,fallback='')=>title==='$:/language'?'$:/languages/en-GB':rows[title]?.text??fallback};
 function Widget(){}
 Object.assign(Widget.prototype,{
  initialise(_tree,options){Object.assign(this,options);this.domNodes=[];},computeAttributes(){return {};},
  getAttribute(name,fallback){return name==='scene'?'Film':name==='score'?'Score A':fallback;},
  removeChildDomNodes(){this.domNodes.forEach(node=>node.remove());this.domNodes=[];}
 });
 class SilentTrack {unlock(){}sync(){}seek(){}quiet(){}pause(){}dispose(){}setClips(){}}
 const modules={
  '$:/core/modules/widgets/widget.js':{widget:Widget},
  '$:/plugins/huwiki/cutout/engine.js':{
   readScene:()=>film,build:()=>({scene:film,nodes:{},clips:[],svg:doc.createElementNS('http://www.w3.org/2000/svg','svg')}),
   paint(_view,time){paints.push(time);},clipAt:()=>({index:-1,time:0})
  },
  '$:/plugins/huwiki/abc/loader.js':{load:()=>loading},
  '$:/plugins/huwiki/abc/audio-controller.js':{},
  '$:/plugins/huwiki/abc/playback.js':{register(){},unregister(){},start(){},stopOne(){}},
  '$:/plugins/huwiki/abc/accompaniment.js':{read:()=>({enabled:false})},
  '$:/plugins/huwiki/abc/start-position.js':{},
  '$:/plugins/huwiki/musical/editor.js':{attach:()=>({paint:time=>editorPaints.push(time),dispose(){}})},
  '$:/plugins/huwiki/musical/workspace.js':{mount(options){workspaceOptions=options;return {refreshHandles(){},dispose(){}};}},
  '$:/plugins/huwiki/musical/motion.js':{beatClock:()=>({at:t=>t*2}),paint(){}},
  '$:/plugins/huwiki/musical/sfx.js':{Fx:SilentTrack},
  '$:/plugins/huwiki/musical/narration.js':{Player:SilentTrack},
  '$:/plugins/huwiki/musical/lipsync.js':{apply(){},reset(){}}
 };
 function load(name){
  if(modules[name])return modules[name];
  const match=/\/([^/]+)\.js$/.exec(name),code=sources[match?.[1]];if(!code)throw Error('Missing '+name);
  const exports={};modules[name]=exports;
  runInNewContext(code,{exports,require:load,performance:{now:()=>1000},console,requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}});
  return exports;
 }
 const Musical=load('$:/plugins/huwiki/musical/widget.js')['musical-stage'];
 const widget=new Musical({}, {wiki,document:doc});widget.render(doc.body);
 t.after(()=>widget.removeChildDomNodes());
 return {widget,host:widget.host,paints,editorPaints,frames,workspace:workspaceOptions,
  async finishLoading(){resolveLoader({renderAbc:()=>[{getTotalTime:()=>10,noteTimings:[]}],synth:{supportsAudio:()=>false}});for(let i=0;i<8;i++)await Promise.resolve();}
 };
}

test('notation loading preserves the studio opening preview instead of repainting time zero',async t=>{
 const h=harness(t),play=h.host.querySelector('.huw-musical-play');
 assert.equal(play.disabled,true);
 h.workspace.seek(1);assert.equal(h.paints.at(-1),1);
 await h.finishLoading();
 assert.equal(play.disabled,false);assert.equal(h.workspace.position(),1);
 assert.equal(h.paints.at(-1),1);assert.equal(h.editorPaints.at(-1),1);
 assert.equal(h.host.dataset.cameraTime,'1.00');assert.equal(h.host.querySelector('.huw-musical-range').value,'1');
 assert.equal(h.host.querySelector('.huw-musical-time').textContent,'0:01 / 0:20');
 play.click();assert.equal(h.workspace.position(),1);assert.equal(h.paints.at(-1),1);assert.equal(h.frames.size,1);
});

test('a later seek made before notation is ready retains the selected score, frame and gains',async t=>{
 const h=harness(t);h.workspace.seek(1);h.workspace.seek(12);
 await h.finishLoading();
 assert.equal(h.workspace.position(),12);assert.equal(h.paints.at(-1),12);assert.equal(h.editorPaints.at(-1),12);
 assert.equal(h.host.dataset.activeSong,'Score B');assert.equal(h.host.dataset.cameraTime,'12.00');
 const pages=h.host.querySelectorAll('.huw-musical-score-page');assert.equal(pages[0].hidden,true);assert.equal(pages[1].hidden,false);
 assert.deepEqual(Array.from(h.widget._songStates,song=>song.gain),[0,1]);
});
