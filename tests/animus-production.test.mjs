import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const sourceDir=new URL('../plugins/musical/src/',import.meta.url);
const source=Object.fromEntries(await Promise.all(['scenes','projects','score-workshop'].map(async name=>[name,await readFile(new URL(name+'.js',sourceDir),'utf8')])));
class Tiddler {constructor(...values){this.fields=Object.assign({},...values.filter(Boolean).map(value=>value.fields||value));}}
function wiki(initial={}){
 const records=structuredClone(initial);return {records,
  getTiddler:title=>records[title]?new Tiddler(records[title]):null,
  getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,
  addTiddler(tiddler){records[tiddler.fields.title]=structuredClone(tiddler.fields);},
  deleteTiddler:title=>{delete records[title];},
  generateNewTitle(title){let candidate=title,n=1;while(records[candidate])candidate=title+' '+(++n);return candidate;},
  makeWidget(){return {children:[],render(){},removeChildDomNodes(){},onDestroy(){}};}
 };
}
function api(name,deps={}){
 const exports={};runInNewContext(source[name],{exports,$tw:{Tiddler,rootWidget:{}},require(id){return deps[id]||{};},Date,Math,Promise});return exports;
}
function scenes(){return api('scenes');}
function rangesFixture(){
 const leaf=name=>({version:1,name,width:800,height:450,duration:10,parts:[]});
 const files={a:leaf('First'),b:leaf('Second')};
 const film={version:1,duration:20,parts:[],scenes:[{id:'a-clip',source:'a',name:'First',duration:10},{id:'b-clip',source:'b',name:'Second',duration:10}],musical:{}};
 return {files,film,resolve:name=>files[name]};
}
test('new projects create unique editable scenes, a silent ABC score and a linked show',()=>{
 const stage=scenes(),project=api('projects',{'$:/plugins/huwiki/musical/scenes.js':stage,'$:/core/modules/widgets/widget.js':{widget:function(){}}}),w=wiki();
 const first=project.create(w,'Min musical'),second=project.create(w,'Min musical');
 assert.notEqual(first.title,second.title);assert.equal(Object.keys(w.records).length,8);
 const show=w.records[first.title],film=JSON.parse(w.records[first.filmTitle].text),scene=JSON.parse(w.records[first.stageTitle].text),score=w.records[first.scoreTitle];
 assert.equal(show['animus-scene'],first.filmTitle);assert.equal(show['animus-score'],first.scoreTitle);assert.ok(show.tags.includes('AniMusProjects'));
 assert.equal(film.scenes[0].source,first.stageTitle);assert.equal(film.scenes[0].sourceId,scene.id);assert.equal(film.musical.songs[0].score,first.scoreTitle);assert.equal(scene.parts.length,0);assert.equal(scene.duration,16);
 assert.equal(JSON.parse(score['abc-accompaniment']).enabled,false);assert.match(score['abc-source'],/^K:C$/m);assert.equal((score['abc-source'].match(/z4/g)||[]).length,8);
});
test('scene ranges distinguish repeated use of the same scene and preserve nested identities',()=>{
 const s=scenes(),scene={parts:[]},act={duration:10,scenes:[{id:'leaf-1',source:'same',duration:4},{id:'leaf-2',source:'same',duration:6}]},film={duration:20,scenes:[{id:'act-1',source:'act',duration:10},{id:'act-2',source:'act',duration:10}]};
 const r=s.ranges(film,name=>name==='act'?act:scene);
 assert.deepEqual(Array.from(r,x=>x.start),[0,4,10,14]);assert.equal(new Set(r.map(x=>x.id)).size,4);assert.equal(r[0].id,'film/act-1/leaf-1');assert.equal(r[3].id,'film/act-2/leaf-2');
});
test('reordering scenes moves score, voice, effect, light, camera, face and per-scene animation cues together',()=>{
 const s=scenes(),f=rangesFixture(),before=s.ranges(f.film,f.resolve);f.film.camera={keys:[{t:2,x:1},{t:12,x:2}]};f.film.parts=[{id:'curtain',keys:[{t:1,x:3}]}];
 f.film.musical={songs:[{start:2,score:'song',duration:5}],audioClips:[{start:11,asset:'voice',offset:2,duration:3}],sfx:[{t:14,type:'bell'}],cuts:[{t:10,camera:'B'}],lighting:{keys:[{t:3,intensity:.5}]},figureTransforms:{actor:{keys:[{t:15,x:22}]}},animationClips:[{start:0,duration:10,accents:[{t:4,x:1}],motion:{arm:[{t:0,r:0},{t:4,r:30}]}}]};
 f.film.musical.faceKeys=[{actor:'actor',t:3,mouthMap:{O:'E'}},{actor:'actor',t:12,eyes:'closed'}];
 f.film.scenes.reverse();const after=s.ranges(f.film,f.resolve);s.retime(f.film,before,after);
 assert.equal(f.film.musical.songs[0].start,12);assert.equal(f.film.musical.audioClips[0].start,1);assert.equal(f.film.musical.audioClips[0].offset,2);assert.equal(f.film.musical.audioClips[0].duration,3);
 assert.equal(f.film.musical.sfx[0].t,4);assert.equal(f.film.musical.cuts[0].t,0);assert.equal(f.film.musical.lighting.keys[0].t,13);assert.equal(f.film.musical.figureTransforms.actor.keys[0].t,5);
 assert.deepEqual(Array.from(f.film.camera.keys,k=>k.t),[2,12]);assert.equal(f.film.camera.keys[0].x,2);assert.equal(f.film.parts[0].keys[0].t,11);
 assert.deepEqual(f.film.musical.faceKeys,[{actor:'actor',t:2,eyes:'closed'},{actor:'actor',t:13,mouthMap:{O:'E'}}]);
 const animation=f.film.musical.animationClips[0];assert.equal(animation.start,10);assert.equal(animation.duration,10);assert.equal(animation.accents[0].t,14);assert.equal(animation.motion.arm[1].t,4);
});
test('whole-show animation survives scene reordering instead of shrinking to a fraction of a second',()=>{
 const s=scenes(),f=rangesFixture(),before=s.ranges(f.film,f.resolve);f.film.musical.animationClips=[{id:'whole-show',target:'orchestra',start:0,duration:20,accents:[]}];f.film.scenes.reverse();s.retime(f.film,before,s.ranges(f.film,f.resolve));
 assert.equal(f.film.musical.animationClips[0].start,0);assert.equal(f.film.musical.animationClips[0].duration,20);
});
test('film-end keys move to the new end when a scene is extended',()=>{
 const s=scenes(),f=rangesFixture(),before=s.ranges(f.film,f.resolve);f.film.camera={keys:[{t:0,x:0},{t:20,x:10}]};f.film.musical.lighting={keys:[{t:20,intensity:0}]};f.film.scenes[0].duration=15;f.film.duration=25;s.retime(f.film,before,s.ranges(f.film,f.resolve));
 assert.equal(f.film.camera.keys[1].t,25);assert.equal(f.film.musical.lighting.keys[0].t,25);
});

// Small DOM surface: these tests exercise the workshop's actual save/cancel
// handlers and wiki writes; the ABC widget itself is tested separately.
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.className='';this.parentNode=null;this.attributes={};this._text='';this.classList={add:(...xs)=>{for(const x of xs)this.classList.toggle(x,true);},remove:(...xs)=>{for(const x of xs)this.classList.toggle(x,false);},toggle:(x,on)=>{let values=this.className.split(/\s+/).filter(Boolean);if(on===undefined)on=!values.includes(x);values=values.filter(v=>v!==x);if(on)values.push(x);this.className=values.join(' ');return on;}};}
 appendChild(child){child.parentNode=this;this.children.push(child);return child;}
 set textContent(text){this._text=String(text);this.children=[];}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(){}
 focus(){}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const found=[];function matches(node){return selector.startsWith('.')?node.className.split(/\s+/).includes(selector.slice(1)):node.tagName===selector.toUpperCase();}function walk(node){for(const child of node.children){if(matches(child))found.push(child);walk(child);}}walk(this);return found;}
}
function doc(){let confirms=0,answer=true,readers=[];class Reader{constructor(){readers.push(this);}readAsText(){}}
 return {createElement:tag=>new Node(tag),defaultView:{confirm(){confirms++;return answer;},FileReader:Reader},setConfirm(value){answer=value;},get confirms(){return confirms;},readers};
}
function click(root,text){const b=root.querySelectorAll('button').find(n=>n.textContent===text);assert.ok(b,'Missing button: '+text);b.onclick();}
function sceneWorkshop(){const s=scenes(),f=rangesFixture(),w=wiki({Film:{title:'Film',type:'application/json',text:JSON.stringify(f.film)},a:{title:'a',type:'application/json',text:JSON.stringify(f.files.a)},b:{title:'b',type:'application/json',text:JSON.stringify(f.files.b)},'$:/language':{title:'$:/language',text:'$:/languages/da-DK'}}),d=doc(),host=new Node('main');let reloads=0;
 const ui=s.mount({doc:d,wiki:w,host,film:f.film,sceneTitle:'Film',pause(){},position:()=>0,seek(){},markOwnWrite(){},reload(){reloads++;}});return {ui,host,w,d,get reloads(){return reloads;}};
}
test('scene workshop cancel does not write drafts; save commits scene order',()=>{
 const f=sceneWorkshop(),original=f.w.records.Film.text;f.ui.open();click(f.host,'Senere →');assert.equal(f.w.records.Film.text,original);
 f.d.setConfirm(false);assert.equal(f.ui.close(false),false);assert.ok(f.host.querySelector('.huw-scene-workshop'));
 f.d.setConfirm(true);assert.equal(f.ui.close(false),true);assert.equal(f.w.records.Film.text,original);
 f.ui.open();click(f.host,'Senere →');click(f.host,'Gem og tilbage');assert.equal(JSON.parse(f.w.records.Film.text).scenes[0].source,'b');assert.equal(f.reloads,1);assert.equal(f.host.querySelector('.huw-scene-workshop'),null);
});
function scoreWorkshop(type='text/vnd.tiddlywiki'){
 const initial={title:'Score',type,text:type==='text/vnd.tiddlywiki'?'score widget':'X:1\nK:C\nC D|','abc-source':'X:1\nK:C\nC D|'},w=wiki({Score:initial,'$:/language':{title:'$:/language',text:'$:/languages/da-DK'}}),d=doc(),host=new Node('main'),loader={getSource(w,title){const fields=w.getTiddler(title)?.fields||{};return fields['abc-source']||(['text/plain','text/vnd.abc'].includes(fields.type)?fields.text:'');}};let reloads=0;
 const s=api('score-workshop',{'$:/plugins/huwiki/abc/loader.js':loader}),ui=s.mount({doc:d,wiki:w,host,pause(){},reload(){reloads++;}});
 return {ui,w,d,host,get draft(){return Object.keys(w.records).find(x=>x.startsWith('$:/temp/animus-score/'));},get reloads(){return reloads;}};
}
test('ABC workshop isolates edits in a temporary draft, cancels cleanly and saves source fields',()=>{
 const f=scoreWorkshop(),original=f.w.records.Score['abc-source'];f.ui.open('Score');f.w.records[f.draft]['abc-source']='X:1\nK:G\nG A|';assert.equal(f.w.records.Score['abc-source'],original);f.ui.close(true);assert.equal(f.w.records.Score['abc-source'],original);assert.equal(f.draft,undefined);
 f.ui.open('Score');f.w.records[f.draft]['abc-source']='X:1\nK:G\nG A|';click(f.host,'Gem og tilbage');assert.equal(f.w.records.Score['abc-source'],'X:1\nK:G\nG A|');assert.equal(f.w.records.Score['draft.of'],undefined);assert.equal(f.w.records.Score['draft.title'],undefined);assert.equal(f.draft,undefined);assert.equal(f.reloads,1);
});
test('ABC workshop preserves externally edited source and supports Save a copy',()=>{
 const f=scoreWorkshop();f.ui.open('Score');f.w.records[f.draft]['abc-source']='X:1\nK:G\nG A|';f.w.records.Score['abc-source']='X:1\nK:D\nD E|';click(f.host,'Gem og tilbage');assert.equal(f.w.records.Score['abc-source'],'X:1\nK:D\nD E|');assert.ok(f.draft);
 click(f.host,'Gem kopi');const copied=Object.values(f.w.records).find(t=>t.title.startsWith('Score – kopi'));assert.ok(copied);assert.equal(copied['abc-source'],'X:1\nK:G\nG A|');assert.equal(f.draft,undefined);
});
test('deleting all ABC source does not silently save the old plain-text source',()=>{
 const f=scoreWorkshop('text/plain');f.ui.open('Score');f.w.records[f.draft]['abc-source']='';click(f.host,'Gem og tilbage');assert.ok(f.draft,'invalid empty source must remain open');assert.equal(f.reloads,0);
});
test('an ABC import started in a closed workshop cannot overwrite the next score draft',()=>{
 const f=scoreWorkshop();f.ui.open('Score');const input=f.host.querySelector('input');input.files=[{name:'old.abc'}];input.onchange();const reader=f.d.readers[0];f.ui.close(true);f.ui.open('Score');const next=f.draft;reader.result='X:1\nK:F\nF F|';reader.onload();assert.equal(f.w.records[next]['abc-source'],'X:1\nK:C\nC D|');
});
