import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=name=>readFile(new URL('../plugins/musical/src/'+name+'.js',import.meta.url),'utf8');
const api={};runInNewContext(await read('track-preview'),{exports:api});
const engineSource=await readFile(new URL('../plugins/cutout/src/engine.js',import.meta.url),'utf8');
const engine={};runInNewContext(engineSource,{exports:engine,require:()=>({})});
const plain=value=>JSON.parse(JSON.stringify(value));
const subtitle=(id,start,end,text=id)=>({id,type:'text',text,keys:[{t:0,opacity:0,easing:'step'},{t:start,opacity:1,easing:'step'},{t:end,opacity:0,easing:'step'}]});
function view(title,duration,parts=[],clips=[]){return {scene:{_title:title,duration,parts,scenes:clips.map(c=>c.settings)},nodes:{},clips};}
function clip(child,duration=child.scene.duration,settings={}){return {view:child,duration:child.scene.duration,settings:{source:child.scene._title,duration,...settings}};}

test('preview state keeps independent audio channels and nested export scopes without altering clips',()=>{
 const state=api.create(),song={id:'one',lane:'A',muted:true},other={id:'two',lane:'B'},voice={id:'voice',muted:true},before=JSON.stringify([song,other,voice]);
 state.set('music:A',false);state.set('audio-lane',false);state.set('sfx',false);state.set('captions',false);
 assert.equal(state.song(song),false);assert.equal(state.song(other),true);assert.equal(state.audio(voice),false);assert.equal(state.effects(),false);
 const restoreOuter=state.beginExport(),restoreInner=state.beginExport();assert.equal(state.song(song),true);assert.equal(state.enabled('captions'),true);assert.equal(state.audio(voice),true);
 restoreOuter();restoreOuter();assert.equal(state.exporting(),true);restoreInner();assert.equal(state.exporting(),false);assert.equal(state.enabled('captions'),false);assert.equal(state.song(song),false);
 assert.equal(JSON.stringify([song,other,voice]),before,'Authored mute values are owned by the production, never the preview');
});

test('caption metadata aligns nested scenes to master time and preserves original source references',()=>{
 const first=view('First',4,[subtitle('spoken-1',1,3,'First line')]),last=view('Last',6,[subtitle('song-line-1',2,5,'Song line')]),act=view('Act',10,[],[clip(first),clip(last)]),intro=view('Intro',3),film=view('Film',13,[],[clip(intro),clip(act)]);
 const cues=api.captions(film,engine);assert.deepEqual(plain(cues.map(c=>[c.sceneTitle,c.start,c.end,c.text])),[['First',4,6,'First line'],['Last',9,12,'Song line']]);
 assert.equal(cues[0].part,first.scene.parts[0]);assert.equal(cues[1].scene,last.scene);
});

test('caption metadata covers each repetition with speed and offset instead of using source-local seconds',()=>{
 const source=view('Loop',10,[subtitle('spoken-1',1,3)]),intro=view('Intro',4),film=view('Film',16,[],[clip(intro),clip(source,12,{speed:2,offset:1,loop:true})]);
 const cues=api.captions(film,engine);assert.deepEqual(plain(cues.map(c=>[c.start,c.end])),[[4,5],[9,10],[14,15]]);
});

test('caption opacity fades use the displayed threshold and clip boundaries',()=>{
 const part={id:'spoken-1',text:'Fade',keys:[{t:0,opacity:0,easing:'linear'},{t:2,opacity:1,easing:'linear'},{t:4,opacity:0,easing:'linear'}]},scene=view('Fade',4,[part]);
 const cues=api.captions(scene,engine);assert.equal(cues.length,1);assert.ok(Math.abs(cues[0].start-.9)<1e-6);assert.ok(Math.abs(cues[0].end-3.1)<1e-6);
 const clipped=view('Film',2,[],[clip(scene,2)]);const shortened=api.captions(clipped,engine);assert.ok(Math.abs(shortened[0].start-.9)<1e-6);assert.equal(shortened[0].end,2);
});

test('invisible and unrelated scene text never becomes a subtitle cue',()=>{
 const scene=view('Scene',5,[{id:'title',text:'Scenery title'},{id:'spoken-1',text:'Never shown',keys:[{t:0,opacity:0}]},{id:'song-line-2',text:'Always visible'}]);
 assert.deepEqual(plain(api.captions(scene,engine).map(c=>[c.partId,c.start,c.end])),[['song-line-2',0,5]]);
});
