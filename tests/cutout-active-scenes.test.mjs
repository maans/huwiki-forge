import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const bundled=JSON.parse(JSON.parse(await read('plugins/cutout/dist/plugin.json')).text).tiddlers;
const source=await read('plugins/cutout/src/engine.js');
function modules(){
 const cache={};
 function load(title){
  if(cache[title])return cache[title];
  const exports=cache[title]={};
  if(title.endsWith('/i18n.js'))return Object.assign(exports,{t:text=>text});
  const text=title.endsWith('/engine.js')?source:bundled[title]?.text;
  if(!text)throw Error('Missing module: '+title);
  runInNewContext(text,{exports,require:load});
  return exports;
 }
 return load('$:/plugins/huwiki/cutout/engine.js');
}
const engine=modules();
const pose=(t,x)=>({t,x,y:0,r:0,sx:1,sy:1,opacity:1,easing:'linear'});
const part=(id='actor',duration=10)=>({id,type:'rect',keys:[pose(0,0),pose(duration,duration*10)]});
const scene=(parts=[],duration=10)=>({version:1,width:800,height:450,duration,parts});
function harness(projects){
 const records=Object.fromEntries(Object.entries(projects).map(([title,value])=>[title,{title,type:'application/json',text:JSON.stringify(value)}]));
 const wiki={getTiddler:title=>records[title]?{fields:records[title]}:null,getTiddlerText:(title,fallback='')=>records[title]?.text??fallback};
 const doc=svgDocument(),film=engine.readScene(wiki,'Film'),view=engine.build(doc,wiki,film,false);
 doc.body.appendChild(view.svg);
 return {wiki,doc,view,records};
}
// Count observable SVG writes, independently of the renderer's control flow.
// A paused drag should never mutate an invisible scene's subtree.
function observe(node){
 let writes=0;
 function instrument(current){
  const set=current.setAttribute;
  current.setAttribute=function(...args){writes++;return set.apply(this,args);};
  for(const child of current.childNodes)instrument(child);
 }
 instrument(node);
 return {get writes(){return writes;},reset(){writes=0;}};
}
function x(node){const transform=node.getAttribute('transform');return transform===null?null:Number(/^translate\(([-+\d.eE]+)/.exec(transform)[1]);}

test('a fourteen-scene film repaints only the active scene during repeated paused edits',()=>{
 const projects={Film:{...scene([part('foreground',56)],56),scenes:[]}};
 for(let i=0;i<14;i++){
  const title='Scene '+i;projects[title]=scene([part()],4);
  projects.Film.scenes.push({source:title,duration:4});
 }
 const h=harness(projects),observed=Array.from(h.view.clips,c=>observe(c.view.svg));
 engine.paint(h.view,2);
 assert.equal(x(h.view.clips[0].view.nodes.actor.el),20);
 assert.equal(x(h.view.nodes.foreground.el),20,'film-level scenery still updates');
 assert.ok(observed[0].writes>0);
 assert.deepEqual(observed.slice(1).map(o=>o.writes),Array(13).fill(0));
 for(let frame=0;frame<20;frame++)engine.paint(h.view,2+frame/100);
 assert.deepEqual(observed.slice(1).map(o=>o.writes),Array(13).fill(0));
 assert.equal(h.view.clips.filter(c=>c.el.getAttribute('display')==='inline').length,1);

 for(const item of observed)item.reset();
 engine.paint(h.view,53);
 assert.equal(x(h.view.clips[13].view.nodes.actor.el),10);
 assert.deepEqual(observed.slice(0,13).map(o=>o.writes),Array(13).fill(0));
 assert.ok(observed[13].writes>0);
 assert.equal(h.view.clips[0].el.getAttribute('display'),'none');
 assert.equal(h.view.clips[13].el.getAttribute('display'),'inline');
});

test('forward and backward scene seeks paint fresh poses at cuts and the final frame',()=>{
 const h=harness({Film:{...scene(),scenes:[{source:'A',duration:4},{source:'B',duration:4}]},A:scene([part()],4),B:scene([part()],4)});
 const a=h.view.clips[0],b=h.view.clips[1],originalTree=h.view.clips;
 engine.paint(h.view,4);
 assert.equal(a.el.getAttribute('display'),'none');assert.equal(b.el.getAttribute('display'),'inline');
 assert.equal(x(b.view.nodes.actor.el),0,'the first frame after a cut uses the new scene clock');
 engine.paint(h.view,8);assert.equal(x(b.view.nodes.actor.el),40);
 engine.paint(h.view,100);assert.equal(x(b.view.nodes.actor.el),40,'past the end holds the final visible pose');
 a.view.scene.parts[0].keys=[pose(0,100),pose(4,140)];
 engine.paint(h.view,1);
 assert.equal(x(a.view.nodes.actor.el),110,'hidden edits are evaluated when the scene becomes visible');
 assert.equal(a.el.getAttribute('display'),'inline');assert.equal(b.el.getAttribute('display'),'none');
 engine.paint(h.view,-1);assert.equal(x(a.view.nodes.actor.el),100);
 assert.equal(h.view.clips,originalTree,'editing keeps the same source-tree references');
 assert.deepEqual(Object.keys(engine.dependencies(h.view)).sort(),['A','B','Film']);
});

test('active-scene optimization preserves speed, offset and loop clocks when revisiting a scene',()=>{
 const h=harness({Film:{...scene(),scenes:[{source:'Intro',duration:4},{source:'Loop',duration:12,speed:2,offset:1,loop:true}]},Intro:scene([part()],4),Loop:scene([part()],10)});
 const node=h.view.clips[1].view.nodes.actor.el;
 engine.paint(h.view,11);assert.equal(x(node),50,'((11 - 4) * 2 + 1) % 10 = 5');
 engine.paint(h.view,8.5);assert.equal(x(node),0,'loop boundary maps to the first frame');
 engine.paint(h.view,3);assert.equal(h.view.clips[1].el.getAttribute('display'),'none');
 engine.paint(h.view,6);assert.equal(x(node),50,'seeking forward from another scene needs no warm-up frame');
});

test('an inactive animation skips its nested descendants and catches up immediately on reveal',()=>{
 const h=harness({
  Film:scene([{id:'actor',type:'animation',animation:'Puppet',start:5,speed:2,offset:1,loop:true,keys:[pose(0,0)]}],20),
  Puppet:scene([{id:'limb',type:'animation',animation:'Limb',start:2,keys:[pose(0,0)]}],4),
  Limb:scene([part('hand',3)],3)
 });
 const actor=h.view.nodes.actor,limb=actor.nested.nodes.limb,hand=limb.nested.nodes.hand.el;
 const actorWrites=observe(actor.nested.svg),limbWrites=observe(limb.nested.svg);
 engine.paint(h.view,4);
 assert.equal(actor.el.getAttribute('display'),'none');
 assert.equal(actorWrites.writes,0);assert.equal(limbWrites.writes,0);
 engine.paint(h.view,5.5);
 assert.equal(actor.el.getAttribute('display'),'inline');assert.equal(limb.el.getAttribute('display'),'inline');
 assert.equal(x(hand),0);
 engine.paint(h.view,6);assert.equal(x(hand),10);
 limbWrites.reset();
 engine.paint(h.view,7);
 assert.equal(limb.el.getAttribute('display'),'none','outer looping returns the child before its start');
 assert.equal(limbWrites.writes,0);
 actorWrites.reset();limbWrites.reset();
 engine.paint(h.view,4);assert.equal(actorWrites.writes,0);assert.equal(limbWrites.writes,0);
 limb.nested.scene.parts[0].keys=[pose(0,50),pose(3,80)];
 engine.paint(h.view,6);assert.equal(x(hand),60,'next-visible state reflects edits made while the ancestor was inactive');
 assert.deepEqual(Object.keys(engine.dependencies(h.view)).sort(),['Film','Limb','Puppet']);
});

test('a theatre inside the active film clip also paints only its active scene',()=>{
 const h=harness({
  Film:{...scene(),scenes:[{source:'Intro',duration:4},{source:'Act',duration:8}]},Intro:scene([part()],4),
  Act:{...scene(),scenes:[{source:'A',duration:2},{source:'B',duration:6}]},A:scene([part()],2),B:scene([part()],6)
 });
 const intro=observe(h.view.clips[0].view.svg),act=h.view.clips[1].view;
 const a=observe(act.clips[0].view.svg),b=observe(act.clips[1].view.svg);
 engine.paint(h.view,8);
 assert.equal(intro.writes,0);assert.equal(a.writes,0);assert.ok(b.writes>0);
 assert.equal(x(act.clips[1].view.nodes.actor.el),20,'master 8 - intro 4 - act intro 2 = local 2');
 b.reset();engine.paint(h.view,5);
 assert.ok(a.writes>0);assert.equal(b.writes,0);assert.equal(x(act.clips[0].view.nodes.actor.el),10);
});

test('AniMus mounts only the current artwork and restores the same editable nodes after a cut',()=>{
 const h=harness({Film:{...scene(),scenes:[{source:'A',duration:4},{source:'B',duration:4}]},A:scene([part()],4),B:scene([part()],4)});
 const [first,second]=h.view.clips,actor=first.view.nodes.actor.el;
 const seek=t=>engine.paint(h.view,t,undefined,{activeOnly:true});
 seek(1);assert.equal(actor.isConnected,true);assert.equal(second.view.svg.isConnected,false);
 seek(5);assert.equal(actor.isConnected,false);assert.equal(second.view.svg.isConnected,true);
 assert.equal(x(second.view.nodes.actor.el),10);
 first.view.scene.parts[0].keys=[pose(0,100),pose(4,140)];
 seek(2);assert.equal(first.view.nodes.actor.el,actor);assert.equal(actor.isConnected,true);
 assert.equal(x(actor),120);assert.equal(second.view.svg.isConnected,false);
 assert.deepEqual(Object.keys(engine.dependencies(h.view)).sort(),['A','B','Film']);
});
