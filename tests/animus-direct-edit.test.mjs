import {language, languageTitle} from './helpers/animus-language.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {Matrix,svgDocument} from './helpers/svg-test-dom.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const cutout=JSON.parse(JSON.parse(await read('plugins/cutout/dist/plugin.json')).text).tiddlers;
const directEditSource=await read('plugins/cutout/src/direct-edit.js');
const sources=Object.fromEntries(await Promise.all(['playlist','motion','sfx','editor','puppet','track-preview'].map(async name=>[name,await read('plugins/musical/src/'+name+'.js')])));
const plain=value=>JSON.parse(JSON.stringify(value));
class Tiddler {constructor(...items){this.fields=Object.assign({},...items.filter(Boolean).map(i=>i.fields||i));}}
function wiki(initial){const records=plain(initial),writes=[];return {records,writes,getTiddler:title=>records[title]?new Tiddler(records[title]):null,getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,getTiddlers:()=>Object.keys(records),each(fn){for(const [title,fields] of Object.entries(records))fn(new Tiddler(fields),title);},addTiddler(t){records[t.fields.title]=plain(t.fields);writes.push(t.fields.title);},getModificationFields:()=>({}),generateNewTitle:title=>title};}
function modules(){const cache={};function load(name){if(name===languageTitle)return language;if(cache[name])return cache[name];const exported={};cache[name]=exported;
 if(name.endsWith('/i18n.js'))return Object.assign(exported,{t:value=>value,contentName:(_title,value)=>value,language:()=> 'en'});
 const musical=/\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(name),code=musical?sources[musical[1]]:name==='$:/plugins/huwiki/cutout/direct-edit.js'?directEditSource:cutout[name]?.text;
 if(!code)throw Error('Test module missing: '+name);runInNewContext(code,{exports:exported,require:load,$tw:{Tiddler},console});return exported;
 }return {load,engine:load('$:/plugins/huwiki/cutout/engine.js'),editor:load('$:/plugins/huwiki/musical/editor.js'),motion:load('$:/plugins/huwiki/musical/motion.js')};}
const pose=(t=0,extra={})=>({t,x:0,y:0,r:0,sx:1,sy:1,opacity:1,easing:'linear',...extra});
function figure(){return [
 {id:'actor',name:'Alma',type:'group',parent:null,pivot:{x:0,y:0},keys:[pose(0,{x:200,y:170,r:30,sx:1.5,sy:.8})]},
 {id:'body',name:'Body',type:'rect',parent:'actor',geo:{x:-15,y:-30,w:30,h:60},keys:[pose()]},
 {id:'arm',name:'Arm',type:'rect',parent:'actor',pivot:{x:4,y:2},geo:{x:0,y:-6,w:48,h:12},keys:[pose(0,{x:20,y:5,r:12}),pose(8,{x:20,y:5,r:12})]},
 {id:'hand',name:'Hand',type:'circle',parent:'arm',geo:{r:7},keys:[pose(0,{x:48,y:2})]},
 {id:'other',name:'Other figure',type:'circle',parent:null,geo:{r:25},keys:[pose(0,{x:500,y:180})]}
 ];}
function scene(parts=figure()){return {version:1,kind:'scene',name:'Stage',width:800,height:450,duration:10,parts};}
function editorHarness(initial){const api=modules(),doc=svgDocument(),stage=scene(),film={version:1,name:'Show',width:800,height:450,duration:10,parts:[],scenes:[{id:'stage-clip',source:'Scene',duration:10}],musical:{songs:[{id:'music',score:'Score',start:0,duration:10}],animationClips:[{id:'dance',name:'Alma movement',target:'actor',start:0,duration:10,beatsPerLoop:8,loop:true,motion:{actor:[pose(0,{x:200,y:170,r:30,sx:1.5,sy:.8}),pose(8,{x:200,y:170,r:30,sx:1.5,sy:.8})],arm:[pose(0,{x:20,y:5,r:12}),pose(8,{x:20,y:5,r:12})]}}]}};
 const w=wiki(initial||{Film:{title:'Film',type:'application/json',text:JSON.stringify(film)},Scene:{title:'Scene',type:'application/json',text:JSON.stringify(stage)},Score:{title:'Score',type:'text/vnd.abc',text:'X:1\nK:C\nC D E F|'},'$:/language':{title:'$:/language',text:'$:/languages/en-GB'}}),data=api.engine.readScene(w,'Film'),view=api.engine.build(doc,w,data,false),host=doc.createElement('main');doc.body.appendChild(host);host.appendChild(view.svg);
 let editor=null,time=1.75,pauses=0;const clock={at:t=>t*2};
 function repaint(){api.engine.paint(view,time);api.motion.paint(view,data,time,clock);if(editor)editor.paint(time);}
 const options={doc,host,wiki:w,film:data,view,sceneTitle:'Film',stageTitle:'Scene',scoreTitle:'Score',duration:()=>data.duration,beatClock:()=>clock,pause(){pauses++;},isPlaying:()=>false,position:()=>time,seek:t=>{time=t;repaint();},repaint,markOwnWrite(){},onSelect(){}};
 editor=api.editor.attach(options);repaint();return {api,doc,host,w,data,view,editor,options,repaint,get time(){return time;},get pauses(){return pauses;},get clip(){return data.musical.animationClips[0];}};
}

test('AniMus limb drag records rotation at the paused beat cursor and retains its joint position',()=>{
 const h=editorHarness(),before=plain(h.clip.motion.actor),originalScene=JSON.stringify(h.view.clips[0].view.scene.parts);h.editor.openAnimation('dance');assert.equal(h.editor.selectPart('arm'),true);assert.equal(h.editor.isJointMove('arm'),true);
 const drag=h.editor.beginPartMove('arm',h.time);drag.update(0,0,45);drag.commit();
 const key=h.clip.motion.arm.find(k=>k.t===3.5);assert.ok(key);assert.equal(key.r,57);assert.equal(key.x,20);assert.equal(key.y,5);assert.equal(h.time,1.75);
 assert.deepEqual(plain(h.clip.motion.actor),before);assert.equal(JSON.stringify(h.view.clips[0].view.scene.parts),originalScene);assert.deepEqual(h.w.writes,['Film']);
 const reopened=editorHarness(h.w.records);assert.equal(reopened.clip.motion.arm.find(k=>k.t===3.5).r,57);
});

test('cancel of a limb rotation restores both a new key and an existing key exactly',()=>{
 const h=editorHarness();h.editor.openAnimation('dance');h.editor.selectPart('arm');const original=JSON.stringify(h.clip.motion.arm);
 let drag=h.editor.beginPartMove('arm',1.75);drag.update(11,-7,60);drag.cancel();assert.equal(JSON.stringify(h.clip.motion.arm),original);assert.equal(h.w.writes.length,0);
 h.options.seek(0);drag=h.editor.beginPartMove('arm',0);drag.update(11,-7,-30);drag.cancel();assert.equal(JSON.stringify(h.clip.motion.arm),original);assert.equal(h.w.writes.length,0);
});

test('whole-figure selection and transform preserve all local arm keys and source geometry',()=>{
 const h=editorHarness(),before=JSON.stringify(h.clip.motion),parts=JSON.stringify(h.view.clips[0].view.scene.parts);
 assert.equal(h.editor.selectFigure('actor'),true);assert.equal(h.editor.getSelection().kind,'figure');assert.equal(h.editor.getSelection().part,'actor');
 const drag=h.editor.beginFigureTransform('actor',h.time);drag.update({x:25,y:-10,r:15,sx:1.2,sy:.9});drag.commit();
 assert.equal(JSON.stringify(h.clip.motion),before);assert.equal(JSON.stringify(h.view.clips[0].view.scene.parts),parts);
 const key=h.data.musical.figureTransforms.actor.keys.find(k=>k.t===1.75);assert.equal(key.r,15);assert.equal(key.x,25);assert.equal(key.y,-10);
 assert.equal(JSON.parse(h.w.records.Film.text).musical.figureTransforms.actor.keys.find(k=>k.t===1.75).sx,1.2);
});

test('direct parts mode selects the active limb motion without opening an unrelated animation or moving the playhead',()=>{
 const initial=editorHarness().w.records,film=JSON.parse(initial.Film.text),future=plain(film.musical.animationClips[0]);future.id='future';future.start=6;future.duration=4;future.motion.arm.forEach(k=>k.r=99);film.musical.animationClips.unshift(future);initial.Film.text=JSON.stringify(film);
 const h=editorHarness(initial),before=JSON.stringify(h.data);assert.equal(h.editor.selectPart('arm',true),true);
 const selection=h.editor.getSelection();assert.equal(selection.kind,'motion');assert.equal(selection.clipId,'dance');assert.equal(selection.part,'arm');assert.equal(h.editor.inClipDetail(),false);assert.equal(h.editor.isJointMove('arm'),true);assert.equal(h.time,1.75);assert.equal(JSON.stringify(h.data),before);assert.equal(h.w.writes.length,0);
 const drag=h.editor.beginPartMove('arm',h.time);drag.update(0,0,25);drag.commit();const saved=JSON.parse(h.w.records.Film.text);
 assert.equal(saved.musical.animationClips.find(c=>c.id==='dance').motion.arm.find(k=>k.t===3.5).r,37);assert.deepEqual(saved.musical.animationClips.find(c=>c.id==='future').motion,plain(future.motion));
});

test('direct parts mode falls back to source keys outside a motion clip and keeps the body part mounted',()=>{
 const initial=editorHarness().w.records,film=JSON.parse(initial.Film.text);film.musical.animationClips[0].start=6;film.musical.animationClips[0].duration=4;initial.Film.text=JSON.stringify(film);
 const h=editorHarness(initial),filmBefore=h.w.records.Film.text;assert.equal(h.editor.selectPart('arm',true),true);assert.equal(h.editor.getSelection().kind,'part');assert.equal(h.editor.isJointMove('arm'),true);assert.equal(h.editor.inClipDetail(),false);
 const drag=h.editor.beginPartMove('arm',h.time);drag.update(0,0,25);drag.commit();const key=JSON.parse(h.w.records.Scene.text).parts.find(p=>p.id==='arm').keys.find(k=>k.t===1.75);
 assert.equal(key.r,37);assert.equal(key.x,20);assert.equal(key.y,5);assert.equal(h.w.records.Film.text,filmBefore);assert.deepEqual(h.w.writes,['Scene']);assert.equal(h.time,1.75);
 h.editor.selectPart('actor',true);assert.equal(h.editor.isJointMove('actor'),false);
});

test('a body-part key in a later nested scene uses the local scene cursor instead of master time',()=>{
 const row=(title,data)=>({title,type:'application/json',text:JSON.stringify(data)}),empty=(name,duration)=>({...scene([]),name,duration});
 const film={version:1,name:'Nested show',width:800,height:450,duration:12,parts:[],scenes:[{id:'intro',source:'Intro',duration:4},{id:'act',source:'Act',duration:8}],musical:{songs:[{id:'music',score:'Score',start:0,duration:12}],animationClips:[]}};
 const act={version:1,name:'Act',width:800,height:450,duration:8,parts:[],scenes:[{id:'intro',source:'Act Intro',duration:2},{id:'scene',source:'Scene',duration:6}]};
 const h=editorHarness({Film:row('Film',film),Intro:row('Intro',empty('Intro',4)),Act:row('Act',act),'Act Intro':row('Act Intro',empty('Act Intro',2)),Scene:row('Scene',scene()),Score:{title:'Score',type:'text/vnd.abc',text:'X:1\nK:C\nC D E F|'}});
 h.options.seek(8);assert.equal(h.editor.selectPart('arm',true),true);assert.equal(h.editor.isJointMove('arm'),true);const drag=h.editor.beginPartMove('arm',h.time);assert.ok(drag);drag.update(7,-3,0);drag.commit();
 const saved=JSON.parse(h.w.records.Scene.text).parts.find(p=>p.id==='arm'),key=saved.keys.find(k=>k.t===2);assert.ok(key,'master8 - intro4 - actintro2 = scene2');assert.equal(key.x,27);assert.equal(key.y,2);assert.equal(saved.keys.find(k=>k.t===8).x,20);assert.deepEqual(h.w.writes,['Scene']);assert.equal(h.time,8);
 const point=h.host.querySelectorAll('[data-track-id="part:arm"] .huw-musical-key').find(node=>node.title.endsWith(' · 2s'));assert.ok(point);point.click();assert.equal(h.time,8);
});

test('source-key timing respects a later scene speed, offset and loop, and key navigation stays in the current repetition',()=>{
 const row=(title,data)=>({title,type:'application/json',text:JSON.stringify(data)}),film={version:1,name:'Looped show',width:800,height:450,parts:[],scenes:[{id:'intro',source:'Intro',duration:4},{id:'scene',source:'Scene',duration:12,speed:2,offset:1,loop:true}],musical:{songs:[{id:'music',score:'Score',start:0,duration:16}],animationClips:[]}};
 const h=editorHarness({Film:row('Film',film),Intro:row('Intro',{...scene([]),duration:4}),Scene:row('Scene',scene()),Score:{title:'Score',text:'X:1\nK:C\nC D E F|'}});
 h.options.seek(11);assert.equal(h.editor.selectPart('arm',true),true);const drag=h.editor.beginPartMove('arm',h.time);drag.update(0,0,25);drag.commit();
 const saved=JSON.parse(h.w.records.Scene.text).parts.find(p=>p.id==='arm'),key=saved.keys.find(k=>k.t===5);assert.ok(key,'((master11 - intro4) * speed2 + offset1) % duration10 = scene5');assert.equal(key.r,37);
 const point=h.host.querySelectorAll('[data-track-id="part:arm"] .huw-musical-key').find(node=>node.title.endsWith(' · 5s'));assert.ok(point);close(Number.parseFloat(point.style.left),68.75);point.click();assert.equal(h.time,11);
 h.options.seek(6);point.click();assert.equal(h.time,6,'the same local key uses the nearest repetition at the current playhead');
});

function directHarness(initial){
 const api=modules(),directModule=api.load('$:/plugins/huwiki/cutout/direct-edit.js'),model=api.load('$:/plugins/huwiki/cutout/model.js'),doc=svgDocument();
 const w=wiki(initial||{Scene:{title:'Scene',type:'application/json',text:JSON.stringify(scene())}}),data=api.engine.readScene(w,'Scene'),view=api.engine.build(doc,w,data,false);
 const host=doc.createElement('section'),stage=doc.createElement('div');doc.body.appendChild(host);host.appendChild(stage);stage.appendChild(view.svg);
 // A zoomed and translated viewport makes raw screen deltas incorrect.
 view.svg.screenMatrix=new Matrix(.75,0,0,.75,35,20);
 let marks=0,stops=0;const studio={document:doc,wiki:w,data,view,host,stage,mode:'animation',selected:null,time:2,clock:{playing:false},
  paint(){api.engine.paint(view,this.time,this.selected);},ui(){this.paint();},mark(){marks++;},stop(){stops++;this.clock.playing=false;}};
 studio.paint();const direct=directModule.create(studio);studio._directEdit=direct;
 return {api,directModule,model,doc,w,data,view,host,stage,studio,direct,part:id=>data.parts.find(p=>p.id===id),get marks(){return marks;},get stops(){return stops;}};
}
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-7,message||`${actual} should be close to ${expected}`);
function pointClose(actual,expected){close(actual.x,expected.x);close(actual.y,expected.y);}
function pointEvent(node,type,point,extra={}){return node.dispatch(type,{clientX:point.x,clientY:point.y,...extra});}
function worldPoint(h,id,point){return h.view.nodes[id].el.getScreenCTM().point(point);}
function rotationGesture(h,degrees,finish='pointerup',extra={}){
 const handle=h.view.svg.querySelector('[data-direct-action="rotate"]'),screen=h.view.svg.getScreenCTM().point({x:Number(handle.getAttribute('cx')),y:Number(handle.getAttribute('cy'))});
 const id=h.studio.selected,parent=h.view.nodes[id].el.parentNode.getScreenCTM(),at=parent.inverse().point(screen),state=h.api.engine.state(h.part(id),h.studio.time);
 const angle=degrees*Math.PI/180,dx=at.x-state.x,dy=at.y-state.y,end=parent.point({x:state.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:state.y+dx*Math.sin(angle)+dy*Math.cos(angle)});
 pointEvent(handle,'pointerdown',screen,extra);pointEvent(h.stage,'pointermove',end,extra);if(finish)pointEvent(h.stage,finish,end,extra);
 return end;
}

test('CutOut stage click selects the whole figure; parts mode and the picker select its mounted limb without adding keys',()=>{
 const h=directHarness(),before=JSON.stringify(h.data),shape=h.view.nodes.arm.shape,at=worldPoint(h,'arm',{x:24,y:0});
 pointEvent(shape,'pointerdown',at);pointEvent(h.stage,'pointerup',at);
 assert.equal(h.studio.selected,'actor');assert.equal(h.stage.getAttribute('data-direct-scope'),'figure');assert.equal(h.marks,0);assert.equal(JSON.stringify(h.data),before);
 const box=h.view.svg.querySelector('.co-direct-figure-box');assert.equal(box.getAttribute('data-part-id'),'actor');assert.equal(box.getAttribute('stroke-dasharray'),'6 4');assert.equal(box.getAttribute('points').trim().split(/\s+/).length,4);
 h.host.querySelector('[data-direct-scope="part"]').click();assert.equal(h.studio.selected,'arm');assert.equal(h.studio.objectTool,'rotate');
 const picker=h.host.querySelector('.co-direct-part-select');assert.equal(picker.parentNode.hidden,false);assert.deepEqual(picker.children.map(n=>n.value),['actor','body','arm','hand']);
 assert.equal(h.view.svg.querySelector('.co-direct-part-box').getAttribute('data-part-id'),'arm');
 const marker=h.view.svg.querySelector('.co-direct-pivot'),displayed=h.view.svg.getScreenCTM().point({x:Number(marker.getAttribute('cx')),y:Number(marker.getAttribute('cy'))});pointClose(displayed,worldPoint(h,'arm',h.part('arm').pivot));
 picker.value='hand';picker.dispatch('change');assert.equal(h.studio.selected,'hand');assert.match(h.host.querySelector('.co-direct-mount').textContent,/Arm/);
 assert.equal(JSON.stringify(h.data),before);assert.equal(h.marks,0);
});

test('CutOut body-part drag uses its rotated and scaled parent coordinates at the paused playhead',()=>{
 const h=directHarness(),part=h.part('arm'),originalKeys=plain(part.keys),other=JSON.stringify(h.data.parts.filter(p=>p.id!=='arm'));
 h.direct.select('arm','part');h.direct.setTool('move');const parent=h.view.nodes.arm.el.parentNode.getScreenCTM(),at=parent.point({x:30,y:5}),end=parent.point({x:39,y:1});
 pointEvent(h.view.nodes.arm.shape,'pointerdown',at,{pointerType:'touch'});pointEvent(h.stage,'pointermove',end,{pointerType:'touch'});pointEvent(h.stage,'pointerup',end,{pointerType:'touch'});
 const key=part.keys.find(k=>k.t===2);assert.ok(key);close(key.x,29);close(key.y,1);close(key.r,12);assert.equal(h.studio.time,2);assert.equal(h.studio.clock.playing,false);
 assert.deepEqual(plain(part.keys.filter(k=>k.t!==2)),originalKeys);assert.equal(JSON.stringify(h.data.parts.filter(p=>p.id!=='arm')),other);assert.equal(h.marks,1);assert.equal(h.stops,1);
});

test('CutOut rotation keeps the mounted pivot fixed, moves the child hand, and survives undo, redo and source save/reopen',()=>{
 const h=directHarness(),part=h.part('arm'),original=JSON.stringify(part.keys),other=JSON.stringify(h.data.parts.filter(p=>p.id!=='arm'));
 h.direct.select('arm','part');const pivotBefore=worldPoint(h,'arm',part.pivot),handBefore=worldPoint(h,'hand',{x:0,y:0});rotationGesture(h,90);
 const key=part.keys.find(k=>k.t===2);close(key.r,102);close(key.x,20);close(key.y,5);pointClose(worldPoint(h,'arm',part.pivot),pivotBefore);assert.ok(Math.hypot(worldPoint(h,'hand',{x:0,y:0}).x-handBefore.x,worldPoint(h,'hand',{x:0,y:0}).y-handBefore.y)>20);
 assert.equal(JSON.stringify(h.data.parts.filter(p=>p.id!=='arm')),other);assert.equal(h.marks,1);
 assert.equal(h.direct.undo(),true);assert.equal(JSON.stringify(part.keys),original);pointClose(worldPoint(h,'hand',{x:0,y:0}),handBefore);
 assert.equal(h.direct.redo(),true);close(part.keys.find(k=>k.t===2).r,102);assert.equal(h.marks,3);
 h.model.write(h.w,'Scene',h.data,'animation');const reopened=directHarness(h.w.records);close(reopened.part('arm').keys.find(k=>k.t===2).r,102);pointClose(worldPoint(reopened,'arm',reopened.part('arm').pivot),pivotBefore);
 assert.equal(reopened.w.records.Scene['cutout-kind'],'animation');assert.equal(reopened.direct.undo(),false);
});

test('CutOut pointer cancellation and disposal roll back both new and existing keys without marking a draft',()=>{
 const h=directHarness(),part=h.part('arm'),original=JSON.stringify(h.data),keys=part.keys,first=keys[0];h.direct.select('arm','part');
 rotationGesture(h,35,'pointercancel');assert.equal(JSON.stringify(h.data),original);assert.equal(part.keys,keys);assert.equal(part.keys[0],first);assert.equal(h.marks,0);
 h.studio.time=0;h.studio.paint();h.direct.sync();rotationGesture(h,-50,null);assert.notEqual(JSON.stringify(h.data),original);h.direct.dispose();
 assert.equal(JSON.stringify(h.data),original);assert.equal(part.keys,keys);assert.equal(part.keys[0],first);assert.equal(h.marks,0);assert.equal(h.host.querySelector('.co-direct-toolbar'),null);assert.equal(h.view.svg.querySelector('.co-direct-overlay'),null);assert.equal(h.stage.hasAttribute('data-direct-edit'),false);
});

test('a cancelled direct-edit transaction preserves an absent keys field and unrelated facial metadata',()=>{
 const h=directHarness(),part={id:'unkeyed',type:'path',variantId:'closed',lipSync:{enabled:false},geo:{d:'M 0 0 L 20 0'}};
 const before=JSON.stringify(part),edit=h.directModule.keyframeEdit(part,3);edit.update({r:45,opacity:.5});edit.cancel();assert.equal(JSON.stringify(part),before);assert.equal(Object.hasOwn(part,'keys'),false);
});

test('the exported CutOut renderer remains read-only under the same pointer gestures',async()=>{
 const code=await read('plugins/site-publisher/src/cutout-viewer.js'),doc=svgDocument(),window={};runInNewContext(code,{window,document:doc});const runtime=window.HUWikiCutOutSite,w=wiki({Scene:{title:'Scene',text:JSON.stringify(scene())}}),data=runtime.readScene(w,'Scene'),view=runtime.build(doc,w,data);doc.body.appendChild(view.svg);runtime.paint(view,2);
 const before=JSON.stringify(data),node=view.nodes.arm.el,transform=node.getAttribute('transform');node.dispatch('pointerdown',{clientX:100,clientY:100});node.dispatch('pointermove',{clientX:200,clientY:150});node.dispatch('pointerup',{clientX:200,clientY:150});
 assert.equal(JSON.stringify(data),before);assert.equal(node.getAttribute('transform'),transform);assert.equal(view.svg.querySelectorAll('.co-direct-overlay,.co-direct-toolbar').length,0);assert.equal(w.writes.length,0);
});


test('editor track switches are immediate, independently operable and never save project changes',()=>{
 const h=editorHarness(),before=JSON.stringify(h.data),selection=h.editor.getSelection().id;let changes=0,selections=0;
 h.options.onPreviewChange=()=>{changes++;};h.options.onSelect=()=>{selections++;};
 const rows=h.host.querySelectorAll('.huw-musical-track');
 assert.ok(rows.length>6);assert.equal(h.host.querySelectorAll('.huw-musical-preview-toggle').length,rows.length,'Every lane has a preview switch');
 const speaker=h.host.querySelector('[data-preview-track="music:A"]');assert.equal(speaker.getAttribute('aria-pressed'),'true');speaker.click();
 assert.equal(h.editor.isSongAudible({id:'music',lane:'A'}),false);assert.equal(h.editor.isSongAudible({id:'second',lane:'B'}),true);assert.equal(speaker.getAttribute('aria-pressed'),'false');
 assert.equal(h.editor.getSelection().id,selection);assert.equal(selections,0,'A preview switch must not select a row or seek');
 h.editor.setTrackAudible('audio-lane',false);assert.equal(h.editor.isAudioAudible({id:'voice'}),false);
 h.editor.setTrackAudible('sfx',false);assert.equal(h.editor.isSfxAudible(),false);
 assert.equal(changes,3);assert.deepEqual(h.w.writes,[]);assert.equal(JSON.stringify(h.data),before);
});

test('visual track hiding preserves authored opacity, timeline position and body part keys',()=>{
 const h=editorHarness(),actor=h.view.clips[0].view.nodes.actor,other=h.view.clips[0].view.nodes.other,opacity=actor.el.getAttribute('opacity'),before=JSON.stringify(h.data),at=h.time;
 h.editor.setTrackVisible('figure:actor',false);assert.equal(actor.el.style.display,'none');assert.ok(actor.el.classList.contains('huw-musical-preview-hidden'));assert.notEqual(other.el.style.display,'none');
 h.options.seek(5);assert.equal(actor.el.style.display,'none');assert.equal(actor.el.getAttribute('opacity'),opacity);
 h.editor.setTrackVisible('figure:actor',true);assert.equal(actor.el.style.display,'');assert.equal(actor.el.classList.contains('huw-musical-preview-hidden'),false);
 assert.equal(JSON.stringify(h.data),before);assert.equal(h.w.writes.length,0);assert.equal(at,1.75);assert.equal(h.time,5);
 h.editor.selectPart('arm',true);const selected=h.editor.getSelection();assert.equal(selected.part,'arm');
 h.editor.setTrackVisible(selected.id,false);assert.equal(h.view.clips[0].view.nodes.arm.el.style.display,'none');assert.notEqual(actor.el.style.display,'none');
 h.editor.dispose();assert.equal(h.view.clips[0].view.nodes.arm.el.style.display,'');
});

test('export bypasses preview switches and clip isolation, then restores them without saving',()=>{
 const h=editorHarness(),before=JSON.stringify(h.data);h.editor.openAnimation('dance');
 h.editor.setTrackVisible('figure:actor',false);h.editor.setTrackVisible('captions',false);h.editor.setTrackAudible('music:A',false);h.editor.setTrackAudible('audio-lane',false);h.editor.setTrackAudible('sfx',false);
 const restore=h.editor.beginExport();assert.equal(h.editor.isExporting(),true);assert.equal(h.editor.isTrackVisible('captions'),true);assert.equal(h.editor.isSongAudible({id:'music',lane:'A'}),true);assert.equal(h.editor.isAudioAudible({id:'voice'}),true);assert.equal(h.editor.isSfxAudible(),true);assert.notEqual(h.view.clips[0].view.nodes.actor.el.style.display,'none');
 restore();restore();assert.equal(h.editor.isExporting(),false);assert.equal(h.editor.isTrackVisible('captions'),false);assert.equal(h.editor.isSongAudible({id:'music',lane:'A'}),false);assert.equal(h.view.clips[0].view.nodes.actor.el.style.display,'none');
 assert.equal(JSON.stringify(h.data),before);assert.equal(h.w.writes.length,0);assert.equal(h.editor.inClipDetail(),true);
});

test('caption lane presents timed blocks and selecting a subtitle seeks to its source without creating keys',()=>{
 const initial=editorHarness().w.records,stage=JSON.parse(initial.Scene.text);stage.parts.push({id:'spoken-1',type:'text',text:'Hello, world.',keys:[pose(0,{opacity:0,easing:'step'}),pose(2,{opacity:1,easing:'step'}),pose(4,{opacity:0,easing:'step'})]});initial.Scene.text=JSON.stringify(stage);
 const h=editorHarness(initial),before=JSON.stringify(h.data),cue=h.editor.getCaptionCues()[0];assert.equal(cue.start,2);assert.equal(cue.end,4);assert.equal(cue.sceneTitle,'Scene');
 const block=h.host.querySelector('.huw-musical-caption-clip');assert.ok(block);assert.match(block.textContent,/Hello, world/);block.click();assert.equal(h.editor.getSelection().kind,'captions');assert.ok(h.time>=2&&h.time<4);assert.match(h.host.querySelector('.huw-musical-caption-text').textContent,/Hello, world/);
 h.editor.addKeyframe();h.editor.removeKeyframe();assert.equal(JSON.stringify(h.data),before);assert.equal(h.w.writes.length,0);
 const toggle=h.host.querySelector('[data-preview-track="captions"]');toggle.click();assert.equal(h.editor.isTrackVisible('captions'),false);assert.equal(h.editor.getCaptionCues().length,1,'Hiding captions keeps their track available');
});


test('preview visibility follows scene switches while leaving inactive scene display and authored visibility intact',()=>{
 const initial=editorHarness().w.records,film=JSON.parse(initial.Film.text),second=JSON.parse(initial.Scene.text);film.duration=20;film.scenes.push({id:'next',source:'Second',duration:10});film.musical.songs[0].duration=20;film.musical.animationClips[0].duration=20;second.parts.find(p=>p.id==='other').keys[0].opacity=0;initial.Film.text=JSON.stringify(film);initial.Second={title:'Second',type:'application/json',text:JSON.stringify(second)};
 const h=editorHarness(initial),first=h.view.clips[0],next=h.view.clips[1];h.editor.setTrackVisible('figure:actor',false);assert.equal(first.view.nodes.actor.el.style.display,'none');assert.notEqual(next.view.nodes.actor.el.style.display,'none','Hidden scene is not visited just to mask its actors');
 h.options.seek(12);assert.equal(first.el.getAttribute('display'),'none');assert.equal(first.view.nodes.actor.el.style.display,'');assert.equal(next.view.nodes.actor.el.style.display,'none');assert.equal(next.view.nodes.other.el.getAttribute('opacity'),'0');
 h.editor.setTrackVisible('scenes',false);assert.equal(next.el.style.display,'none');h.options.seek(2);assert.equal(first.el.style.display,'none');assert.equal(next.el.getAttribute('display'),'none');assert.equal(next.el.style.display,'');
 h.editor.setTrackVisible('scenes',true);assert.equal(first.el.style.display,'');assert.equal(next.el.getAttribute('display'),'none');assert.equal(h.w.writes.length,0);
});

function appearanceHarness(){
 const row=(title,data)=>({title,type:'application/json',text:JSON.stringify(data)}),text=(id,value,fill)=>({id,type:'text',text:value,fill,keys:[pose()]}),rect=(id,fill)=>({id,type:'rect',fill,geo:{x:0,y:0,w:60,h:40},keys:[pose()]}),
  first=scene([rect('shared','#112233'),text('shared-text','First scene','#223344'),text('film-text','Nested first','#334455')]),
  second=scene([rect('shared','#445566'),rect('only-later','#556677'),text('shared-text','Later scene','#667788'),text('film-text','Nested later','#778899')]),
  film={version:1,width:800,height:450,duration:30,parts:[text('film-text','Whole film','#8899aa')],scenes:[{source:'First',duration:10},{source:'Second',duration:10},{source:'Second',duration:10}],musical:{songs:[{id:'music',score:'Score',start:0,duration:30}],animationClips:[]}};
 return editorHarness({Film:row('Film',film),First:row('First',first),Second:row('Second',second),Score:{title:'Score',text:'X:1\nK:C\nC D E F|'},'$:/language':{title:'$:/language',text:'$:/languages/en-GB'}});
}
function editAppearanceText(h,value){const label=h.host.querySelectorAll('.huw-musical-property').find(node=>node.querySelector('span')?.textContent==='Text'),input=label&&label.querySelector('input');assert.ok(input);input.value=value;input.dispatch('change');}
function editAppearanceFill(h,value){const input=h.host.querySelector('.huw-musical-color-input');assert.ok(input);input.value=value;input.dispatch('change');}

test('later-scene color and text edits update the active and repeated source without painting a distinct scene with matching IDs',()=>{
 const h=appearanceHarness(),first=h.view.clips[0].view,second=h.view.clips[1].view,repeated=h.view.clips[2].view,firstBefore=h.w.records.First.text,filmBefore=h.w.records.Film.text,keys=plain(second.nodes.shared.part.keys);
 assert.notEqual(second.scene,repeated.scene,'reused sources really have distinct model instances');h.options.seek(12);h.editor.selectPart('shared',true);editAppearanceFill(h,'#abcdef');h.editor.selectPart('shared-text',true);editAppearanceText(h,'Changed later text');
 assert.equal(first.nodes.shared.shape.getAttribute('fill'),'#112233');assert.equal(first.nodes['shared-text'].shape.textContent,'First scene');
 for(const view of [second,repeated]){assert.equal(view.nodes.shared.shape.getAttribute('fill'),'#abcdef');assert.equal(view.nodes.shared.part.fill,'#abcdef');assert.equal(view.nodes['shared-text'].shape.textContent,'Changed later text');assert.equal(view.nodes['shared-text'].part.text,'Changed later text');assert.deepEqual(plain(view.nodes.shared.part.keys),keys);}
 assert.equal(h.w.records.First.text,firstBefore);assert.equal(h.w.records.Film.text,filmBefore);assert.deepEqual(h.w.writes,['Second','Second']);
 h.options.seek(22);h.editor.selectPart('shared-text',true);editAppearanceText(h,'Saved from the repeated occurrence');const saved=JSON.parse(h.w.records.Second.text);assert.equal(saved.parts.find(part=>part.id==='shared').fill,'#abcdef','editing the repeated instance cannot resave its previous fill');assert.equal(saved.parts.find(part=>part.id==='shared-text').text,'Saved from the repeated occurrence');assert.equal(second.nodes['shared-text'].shape.textContent,'Saved from the repeated occurrence');assert.equal(first.nodes['shared-text'].shape.textContent,'First scene');assert.equal(h.time,22);
});

test('a unique object in a later scene immediately paints its new color and saves only that source',()=>{
 const h=appearanceHarness(),firstBefore=h.w.records.First.text,filmBefore=h.w.records.Film.text;h.options.seek(14);h.editor.selectPart('only-later',true);editAppearanceFill(h,'#b03050');
 assert.equal(h.view.clips[0].view.nodes['only-later'],undefined);for(const view of [h.view.clips[1].view,h.view.clips[2].view])assert.equal(view.nodes['only-later'].shape.getAttribute('fill'),'#b03050');assert.equal(JSON.parse(h.w.records.Second.text).parts.find(part=>part.id==='only-later').fill,'#b03050');assert.equal(h.w.records.First.text,firstBefore);assert.equal(h.w.records.Film.text,filmBefore);assert.deepEqual(h.w.writes,['Second']);assert.equal(h.time,14);
});

test('film-part appearance editing stays on the film even when scene sources reuse its part ID',()=>{
 const h=appearanceHarness(),firstBefore=h.w.records.First.text,secondBefore=h.w.records.Second.text;h.options.seek(12);h.editor.selectPart('film-text',true);assert.equal(h.editor.getSelection().kind,'film-part');editAppearanceFill(h,'#aabbcc');editAppearanceText(h,'Updated whole film');
 assert.equal(h.view.nodes['film-text'].shape.getAttribute('fill'),'#aabbcc');assert.equal(h.view.nodes['film-text'].shape.textContent,'Updated whole film');assert.equal(h.view.clips[0].view.nodes['film-text'].shape.textContent,'Nested first');for(const view of [h.view.clips[1].view,h.view.clips[2].view]){assert.equal(view.nodes['film-text'].shape.textContent,'Nested later');assert.equal(view.nodes['film-text'].shape.getAttribute('fill'),'#778899');}
 const saved=JSON.parse(h.w.records.Film.text).parts.find(part=>part.id==='film-text');assert.equal(saved.fill,'#aabbcc');assert.equal(saved.text,'Updated whole film');assert.equal(h.w.records.First.text,firstBefore);assert.equal(h.w.records.Second.text,secondBefore);assert.deepEqual(h.w.writes,['Film','Film']);assert.equal(h.time,12);
});
