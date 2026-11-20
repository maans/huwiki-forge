import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {SvgNode,svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const sources=Object.fromEntries(await Promise.all(['widget','sync','playlist','puppet','figure-panel','face','lipsync'].map(async name=>[name,await read('plugins/musical/src/'+name+'.js')])));
const cutout=JSON.parse(JSON.parse(await read('plugins/cutout/dist/plugin.json')).text).tiddlers;
SvgNode.prototype.getAttributeNames=function(){return [...new Set([...Object.keys(this.attributes),...(this.className?['class']:[])])];};
SvgNode.prototype.cloneNode=function(deep){const node=new SvgNode(this.localName,this.ownerDocument);for(const name of this.getAttributeNames())node.setAttribute(name,this.getAttribute(name));node._text=this._text;node.nodeType=this.nodeType;Object.assign(node.style,this.style);if(deep)for(const child of this.children)node.appendChild(child.cloneNode(true));return node;};

function harness(t,{rendered=false}={}){
 const doc=svgDocument(),paints=[],editorPaints=[],frames=new Map();
 for(const method of ['createElement','createElementNS']){const create=doc[method];doc[method]=(...args)=>{const node=create(...args);node.nodeType=1;return node;};}
 let resolveLoader,workspaceOptions,figurePanel,frameId=0;
 const loading=new Promise(resolve=>{resolveLoader=resolve;});
 const film={version:1,name:'Preview show',width:800,height:450,duration:20,parts:[],scenes:[],musical:{
  songs:[{id:'a',score:'Score A',start:0,duration:10},{id:'b',score:'Score B',start:10,duration:10}],audioClips:[]
 }};
 if(rendered){const pose=values=>({t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1,...values});film.parts=[
  {id:'prisoner',type:'group',keys:[pose({x:200,y:250})]},
  {id:'prisoner-body',type:'rect',parent:'prisoner',geo:{x:-20,y:-40,w:40,h:80},keys:[pose()]},
  {id:'prisoner-head',type:'group',parent:'prisoner',keys:[pose({y:-70})]},
  {id:'prisoner-head-drawing',type:'ellipse',parent:'prisoner-head',geo:{rx:25,ry:35},keys:[pose()]},
  {id:'prisoner-jaw',type:'group',parent:'prisoner-head',keys:[pose({y:10})]},
  {id:'prisoner-mouth-open',type:'image',parent:'prisoner-jaw',geo:{x:-10,y:0,w:20,h:15},variants:['rest','A','E'].map(id=>({id,imageData:'data:image/svg+xml,<svg id="'+id+'"/>'})),keys:[pose({opacity:0})]},
  {id:'prisoner-mouth-closed',type:'path',parent:'prisoner-jaw',geo:{d:'M-8 0 Q0 4 8 0'},keys:[pose()]},
  {id:'caption',type:'text',text:'AAAA',keys:[pose(),{...pose({t:4}),opacity:0}],lipSync:{enabled:true,target:'prisoner',open:'prisoner-mouth-open',closed:'prisoner-mouth-closed',timing:'script',visemeText:'AAAA',visemes:[{t:0,viseme:'A',open:.7},{t:4,viseme:'rest'}]}}
 ];delete film.scenes;film.musical.faceKeys=[{actor:'prisoner',t:0,mouthMap:{A:'E'}}];}
 const rows={Film:{title:'Film',text:JSON.stringify(film)},'Score A':{title:'Score A',text:'X:1\nK:C\nCDEF|'},'Score B':{title:'Score B',text:'X:2\nK:C\nGABc|'}};
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
  '$:/plugins/huwiki/musical/editor.js':{attach:()=>({paint:time=>editorPaints.push(time),getPartPivot:()=>({x:0,y:0}),dispose(){}})},
  '$:/plugins/huwiki/musical/workspace.js':{mount(options){workspaceOptions=options;if(rendered){const parent=doc.createElement('section');options.host.appendChild(parent);figurePanel=load('$:/plugins/huwiki/musical/figure-panel.js').mount({...options,parent});}return {paintPreview(){if(figurePanel)figurePanel.refresh();},refreshHandles(){},dispose(){if(figurePanel)figurePanel.dispose();}};}},
  '$:/plugins/huwiki/musical/motion.js':{beatClock:()=>({at:t=>t*2}),paint(){}},
  '$:/plugins/huwiki/musical/sfx.js':{Fx:SilentTrack},
  '$:/plugins/huwiki/musical/narration.js':{Player:SilentTrack},
  '$:/plugins/huwiki/musical/lipsync.js':{apply(){},reset(){}}
 };
 if(rendered){delete modules['$:/plugins/huwiki/cutout/engine.js'];delete modules['$:/plugins/huwiki/musical/lipsync.js'];}
 function load(name){
  if(modules[name])return modules[name];
  const match=/\/([^/]+)\.js$/.exec(name),code=cutout[name]?.text||sources[match?.[1]];if(!code)throw Error('Missing '+name);
  const exports={};modules[name]=exports;
  runInNewContext(code,{exports,require:load,performance:{now:()=>1000},console,requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}});
  return exports;
 }
 const Musical=load('$:/plugins/huwiki/musical/widget.js')['musical-stage'];
 const widget=new Musical({}, {wiki,document:doc});widget.render(doc.body);
 t.after(()=>widget.removeChildDomNodes());
 return {widget,host:widget.host,paints,editorPaints,frames,workspace:workspaceOptions,panel:figurePanel,rows,
  async finishLoading(){resolveLoader({renderAbc:()=>[{getTotalTime:()=>10,noteTimings:[]}],synth:{supportsAudio:()=>false}});for(let i=0;i<8;i++)await Promise.resolve();}
 };
}

test('notation loading preserves the studio opening preview instead of repainting time zero',async t=>{
 const h=harness(t),play=h.host.querySelector('.huw-musical-play');
 assert.equal(play.disabled,false,"the picture clock is ready before notation arrives");
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

test('same-time repaint and deselection keep the figure preview in the fully rendered lip-sync pose',t=>{
 const h=harness(t,{rendered:true}),source=h.rows.Film.text;
 function mouth(svg){return Object.fromEntries(['prisoner-jaw','prisoner-mouth-open','prisoner-mouth-closed'].map(id=>{const part=svg.querySelector('[data-cutout-id="'+id+'"]');return [id,{transform:part.getAttribute('transform'),opacity:part.getAttribute('opacity'),href:part.firstChild?.getAttribute('href')}];}));}
 const stage=h.workspace.view.svg,preview=h.host.querySelector('[data-figure-preview]');
 h.workspace.seek(1);assert.equal(h.panel.select('prisoner-head'),true);
 const speaking=mouth(stage);assert.equal(speaking['prisoner-mouth-open'].opacity,'1');assert.equal(speaking['prisoner-mouth-closed'].opacity,'0');assert.match(speaking['prisoner-mouth-open'].href,/id="E"/,'the real lip-sync renderer applies the learned variant');assert.notEqual(speaking['prisoner-jaw'].transform,'translate(0 10) rotate(0) scale(1 1) translate(0 0)');
 assert.deepEqual(mouth(preview),speaking,'opening the workshop shows the complete final pose');
 h.workspace.repaint();assert.deepEqual(mouth(stage),speaking);assert.deepEqual(mouth(preview),speaking,'a same-time repaint, including Reset zoom, must clone the final mouth and jaw');
 h.panel.clearSelection();h.workspace.repaint();assert.equal(h.panel.selectedPart(),'');assert.deepEqual(mouth(preview),speaking,'clearing the outline keeps the active expression and learned mouth');
 h.workspace.seek(5);const silent=mouth(stage);assert.equal(silent['prisoner-mouth-closed'].opacity,'1');assert.deepEqual(mouth(preview),silent,'the unselected workshop still follows a later silent pose');
 h.workspace.seek(1);assert.deepEqual(mouth(stage),speaking);assert.deepEqual(mouth(preview),speaking);assert.equal(h.panel.selectedPart(),'');assert.equal(h.rows.Film.text,source,'preview repaint creates no saved facial or animation keys');
});
