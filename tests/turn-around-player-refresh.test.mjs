import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const source=await read('editions/turn-around/src/player.js');
const production=JSON.parse(await read('editions/turn-around/tiddlers/production.json'));
const packed=production.find(row=>row.title==='$:/plugins/maans/plato/player.js').text;
const cutout=JSON.parse(JSON.parse(await read('plugins/cutout/dist/plugin.json')).text).tiddlers;
const musical=Object.fromEntries(await Promise.all(['playlist','motion','lipsync','face','language'].map(async name=>[name,await read('plugins/musical/src/'+name+'.js')])));
const pose=x=>({t:0,x,y:50,r:0,sx:1,sy:1,opacity:1});
const record=(title,data)=>({title,type:'application/json',text:JSON.stringify(data)});
function fixtures(audio){
  const scene=(name,x)=>({version:1,name,width:800,height:450,duration:10,parts:[{id:'actor',type:'circle',geo:{r:20},keys:[pose(x)]}]});
  return {
    Film:record('Film',{version:1,name:'Test show',width:800,height:450,parts:[],scenes:[{id:'a',source:'A',duration:10},{id:'b',source:'B',duration:10}],musical:{songs:[],audioClips:audio?[{id:'take',asset:'Voice',start:0,duration:20,volume:1}]:[]}}),
    A:record('A',scene('First scene',100)),B:record('B',scene('Second scene',200)),
    Voice:{title:'Voice',type:'audio/wav',text:Buffer.from([1,2]).toString('base64')}
  };
}
function harness(t,{audio=false,deferDecode=false}={}){
  const rows=fixtures(audio),doc=svgDocument(),counts={builds:0,reads:0,refreshes:0},frames=new Map(),decodes=[],started=[],contexts=[];
  let now=0,nextFrame=0;
  const win=doc.defaultView;
  Object.assign(win,{performance:{now:()=>now},requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);},setTimeout,clearTimeout,atob:value=>Buffer.from(value,'base64').toString('binary')});
  class Context {
    constructor(){this.state='running';this.currentTime=0;this.destination={};this.listeners={};contexts.push(this);}
    addEventListener(type,fn){this.listeners[type]=fn;}removeEventListener(type){delete this.listeners[type];}
    resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
    createGain(){return {gain:{value:1,setTargetAtTime(){}},connect(){},disconnect(){}};}
    createBufferSource(){return {buffer:null,connect(){},disconnect(){},start(){started.push({buffer:this.buffer,source:this});},stop(){this.stopped=true;}};}
    decodeAudioData(bytes,success){const buffer={id:new Uint8Array(bytes)[0],duration:30};if(!deferDecode){success(buffer);return Promise.resolve(buffer);}return new Promise(resolve=>decodes.push({id:buffer.id,finish(){success(buffer);resolve(buffer);}}));}
  }
  if(audio)win.AudioContext=Context;
  const wiki={getTiddler:title=>rows[title]?{fields:rows[title]}:null,getTiddlerText:(title,fallback='')=>rows[title]?.text??fallback,each(fn){Object.entries(rows).forEach(([title,fields])=>fn({fields},title));}};
  function Widget(){}
  Object.assign(Widget.prototype,{
    initialise(_tree,options){this.wiki=options.wiki;this.document=options.document;this.domNodes=[];},
    getAttribute(name,fallback){return name==='film'?'Film':fallback;},computeAttributes(){return {};},getVariable(){return 'Turn Around';},
    removeChildDomNodes(){this.domNodes.forEach(node=>node.remove());this.domNodes=[];},
    refreshSelf(){counts.refreshes++;this.removeChildDomNodes();this.render(this.parentDomNode);}
  });
  const modules={'$:/core/modules/widgets/widget.js':{widget:Widget}};
  function load(name){
    if(modules[name])return modules[name];
    if(name.endsWith('/i18n.js'))return modules[name]={t:value=>value,contentName:(_name,value)=>value,language:()=> 'en'};
    const match=/\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(name),code=match?musical[match[1]]:cutout[name]?.text;
    if(!code)throw Error('Missing module '+name);
    const exports={};modules[name]=exports;
    runInNewContext(code,{exports,require:load,document:doc,window:win,console});
    if(name.endsWith('/cutout/engine.js')){
      const build=exports.build,readScene=exports.readScene;
      exports.build=function(...args){counts.builds++;return build(...args);};
      exports.readScene=function(...args){counts.reads++;return readScene(...args);};
    }
    return exports;
  }
  const exports={};runInNewContext(packed,{exports,require:load,window:win,document:doc,console});
  const widget=new exports['plato-player']({}, {wiki,document:doc});widget.render(doc.body);
  const host=widget.host,player=host._platoPlayer;
  t.after(()=>player.destroy());
  return {rows,doc,widget,host,player,counts,frames,decodes,started,contexts,
    async flush(){for(let i=0;i<16;i++)await Promise.resolve();},
    edit(title,change){const data=JSON.parse(rows[title].text);change(data);rows[title].text=JSON.stringify(data);return widget.refresh({[title]:{modified:true}});},
    tick(ms){now+=ms;contexts.forEach(context=>context.currentTime+=ms/1000);const active=[...frames.values()];frames.clear();active.forEach(fn=>fn(now));}
  };
}

test('the shipped Turn Around player matches its editable source',()=>assert.equal(packed,source));
test('the normal Turn Around lip-sync tiddler cannot shadow a newer shared facial runtime',()=>{
  assert.equal(production.find(row=>row.title==='$:/plugins/huwiki/musical/lipsync.js').text,musical.lipsync);
});

test('many paused scene edits do no player rebuild work until playback, preserving host, controls and playhead',async t=>{
  const h=harness(t);await h.player.seek(7);
  const options=h.host.querySelector('.plato-options'),external=h.doc.createElement('select');external.value='da';options.appendChild(external);
  const captions=h.host.querySelectorAll('button').find(button=>button.textContent==='Captions');captions.click();
  const volume=h.host.querySelector('.plato-level');volume.value='.4';volume.dispatch('input');
  const before={...h.counts};
  for(let i=0;i<20;i++)assert.equal(h.edit('A',scene=>{scene.parts[0].keys[0].x=300+i;}),false);
  assert.deepEqual(h.counts,before,'saving edits must not read all scenes or rebuild SVG in the paused audience player');
  assert.equal(h.frames.size,0);assert.equal(h.host.getAttribute('data-plato-stale'),'true');
  await h.player.play();await h.flush();
  assert.equal(h.widget.host,h.host);assert.equal(h.host._platoPlayer,h.player);assert.equal(h.counts.refreshes,0);
  assert.equal(h.counts.builds-before.builds,2,'one root and the active scene are rebuilt once for the whole batch');
  assert.equal(external.parentNode,options);assert.equal(external.value,'da');assert.equal(volume.value,'.4');assert.equal(captions.getAttribute('aria-pressed'),'false');
  assert.equal(h.player.time(),7);assert.match(h.player.getView().nodes.actor.el.getAttribute('transform'),/translate\(319 50\)/);
  assert.equal(h.frames.size,1);assert.equal(h.host.getAttribute('data-plato-stale'),null);
});

test('scrub and chapter controls refresh their scene timing without losing the requested seek',async t=>{
  const h=harness(t);await h.player.seek(7);
  h.edit('Film',film=>{film.scenes[0].duration=4;film.scenes[1].duration=12;});
  const range=h.host.querySelector('.plato-scrub');range.value='9';range.dispatch('input');range.dispatch('change');
  assert.equal(h.player.time(),9);assert.equal(range.max,'16');assert.equal(h.player.getView().scene.name,'Second scene');
  h.edit('Film',film=>{film.scenes[0].duration=6;});
  const chapters=h.host.querySelector('.plato-chapters');chapters.value='1';chapters.dispatch('change');
  assert.equal(h.player.time(),6,'chapter selection uses the newly edited start time');
  assert.equal(h.widget.host,h.host);assert.equal(h.counts.refreshes,0);
});

test('navigation pauses the audience player and returning from AniMus shows the edited scene',async t=>{
  const h=harness(t),nav=h.doc.createElement('nav'),link=h.doc.createElement('a');nav.className='plato-nav';link.nodeType=1;nav.appendChild(link);h.doc.body.appendChild(nav);
  await h.player.seek(3);await h.player.play();assert.equal(h.frames.size,1);
  link.setAttribute('href','#Turn%20Around%20%C2%B7%20AniMus');link.click();assert.equal(h.frames.size,0);
  const before=h.counts.builds;h.edit('A',scene=>{scene.parts[0].keys[0].x=444;});assert.equal(h.counts.builds,before);
  link.setAttribute('href','#Turn%20Around');link.click();
  assert.equal(h.counts.builds,before+2);assert.equal(h.player.time(),3);assert.equal(h.frames.size,0);
  assert.match(h.player.getView().nodes.actor.el.getAttribute('transform'),/translate\(444 50\)/);
});

test('the stable export API sees fresh film, audio and scene data and tracks newly added dependencies',async t=>{
  const h=harness(t);await h.player.seek(3);
  h.rows.C=record('C',{version:1,name:'Replacement',width:800,height:450,duration:5,parts:[{id:'actor',type:'circle',geo:{r:10},keys:[pose(555)]}]});
  h.edit('Film',film=>{film.name='Edited title';film.scenes[0]={id:'c',source:'C',duration:5};film.musical.audioClips=[{id:'new',asset:'Voice',start:2,duration:3,offset:1,volume:.3,muted:true}];});
  const timeline=h.player.getTimeline();
  assert.equal(timeline.title,'Edited title');assert.equal(timeline.duration,15);assert.equal(timeline.audioClips[0].muted,true);assert.equal(timeline.audioClips[0].offset,1);
  assert.equal(h.player.time(),3);assert.match(h.player.getView().nodes.actor.el.getAttribute('transform'),/translate\(555 50\)/);
  const builds=h.counts.builds;h.edit('C',scene=>{scene.parts[0].keys[0].x=777;});assert.equal(h.counts.builds,builds);
  await h.player.seek(2);assert.match(h.player.getView().nodes.actor.el.getAttribute('transform'),/translate\(777 50\)/);
  assert.equal(h.host._platoPlayer,h.player);
});

test('edits during audio preparation cancel old playback and old decoded takes never reach the new timeline',async t=>{
  const h=harness(t,{audio:true,deferDecode:true});
  const oldPlay=h.player.play();await h.flush();assert.equal(h.decodes.length,1);assert.equal(h.decodes[0].id,1);
  h.rows.Voice.text=Buffer.from([3,4]).toString('base64');h.widget.refresh({Voice:{modified:true}});
  assert.equal(h.host.getAttribute('data-plato-playing'),'false');assert.equal(h.frames.size,0);
  const nextPlay=h.player.play();await h.flush();assert.equal(h.decodes.length,2);assert.equal(h.decodes[1].id,3);
  h.decodes[0].finish();await h.flush();assert.equal(h.started.length,0,'late old decode must not restart the cancelled play request');
  h.decodes[1].finish();await Promise.all([oldPlay,nextPlay]);await h.flush();
  assert.ok(h.started.length>0);assert.ok(h.started.every(entry=>entry.buffer.id===3),'only the replacement audio may be scheduled');
  assert.equal(h.frames.size,1);h.player.pause();assert.equal(h.frames.size,0);assert.ok(h.started.every(entry=>entry.source.stopped));
});

test('invalidating a preparing player stops its queued audio work while the editor remains active',async t=>{
  const h=harness(t,{audio:true,deferDecode:true});
  h.edit('Film',film=>{
    film.musical.audioClips=Array.from({length:8},(_,index)=>{
      const asset='Take '+index;h.rows[asset]={title:asset,type:'audio/wav',text:Buffer.from([index+10,0]).toString('base64')};
      return {id:asset,asset,start:index,duration:1,volume:1};
    });
  });
  const playing=h.player.play();await h.flush();assert.equal(h.decodes.length,2);
  h.edit('A',scene=>{scene.parts[0].keys[0].x=1000;});
  h.decodes.slice().forEach(decode=>decode.finish());await playing;await h.flush();
  assert.equal(h.decodes.length,2,'queued old takes must not keep decoding after the edit');
  assert.equal(h.started.length,0);assert.equal(h.frames.size,0);assert.equal(h.player.getAudioState().bufferedAssets.length,0);
});

test('invalid edits cannot play stale data, and closing an invalidated player removes pending work',async t=>{
  const h=harness(t);const valid=h.rows.Film.text;
  h.rows.Film.text='invalid JSON';h.widget.refresh({Film:{modified:true}});await h.player.play();
  assert.equal(h.frames.size,0);assert.equal(h.host.getAttribute('data-plato-playing'),'false');assert.throws(()=>h.player.getTimeline(),/could not be read/);
  h.rows.Film.text=valid;await h.player.play();assert.equal(h.frames.size,1);
  h.edit('A',scene=>{scene.parts[0].keys[0].x=999;});const builds=h.counts.builds;h.widget.removeChildDomNodes();
  assert.equal(h.frames.size,0);assert.equal(h.host.isConnected,false);await h.player.play();assert.equal(h.counts.builds,builds);
});
