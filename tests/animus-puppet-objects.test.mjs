import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root=new URL('../',import.meta.url),plain=value=>JSON.parse(JSON.stringify(value));
const bundle=JSON.parse(JSON.parse(readFileSync(new URL('plugins/cutout/dist/plugin.json',root),'utf8')).text).tiddlers;
const puppetSource=readFileSync(new URL('plugins/musical/src/puppet.js',root),'utf8');
const production=JSON.parse(readFileSync(new URL('editions/turn-around/tiddlers/production.json',root),'utf8'));
const horse=JSON.parse(production.find(t=>t.title==='Turn Around · 01 · The Whole World').text).parts.find(p=>p.id==='shadow-horse');
class Tiddler {constructor(...values){this.fields=Object.assign({},...values.map(value=>value?.fields||value));}}
class Reader {readAsDataURL(file){this.result=file.data;if(file.defer)file.defer(()=>this.onload());else this.onload();}}
function scene(parts){return {version:1,kind:'scene',width:1600,height:900,duration:26,parts:plain(parts)};}
function harness({scenes={Scene:scene([horse])},sequence=[{source:'Scene',duration:26}],filmParts=[],time=1,id='shadow-horse',figureTransforms={},withEditor=false}={}){
 const film={version:1,kind:'theatre',width:1600,height:900,duration:sequence.reduce((sum,c)=>sum+c.duration,0)||26,parts:plain(filmParts),scenes:sequence,musical:{animationClips:[],figureTransforms:plain(figureTransforms)}};
 const records=Object.fromEntries(Object.entries({...scenes,Film:film}).map(([title,data])=>[title,{title,type:'application/json',text:JSON.stringify(data)}])),writes=[];
  records['$:/language']={title:'$:/language',text:'$:/languages/da-DK'};
 const initial=plain(records),wiki={getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,getTiddler:title=>records[title]&&new Tiddler(records[title]),
  addTiddler(tiddler){records[tiddler.fields.title]=plain(tiddler.fields);writes.push(tiddler.fields.title);},each(callback){Object.entries(records).forEach(([title,fields])=>callback(new Tiddler(fields),title));},getTiddlers:()=>Object.keys(records),getModificationFields:()=>({}),generateNewTitle:title=>title};
 const cache={};function load(id){if(cache[id])return cache[id];const exports={};cache[id]=exports;const musical=/^\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(id),code=musical?(musical[1]==='puppet'?puppetSource:readFileSync(new URL('plugins/musical/src/'+musical[1]+'.js',root),'utf8')):bundle[id]?.text;if(!code)throw Error('Missing '+id);
  runInNewContext(code,{exports,require:load,$tw:{Tiddler},FileReader:Reader});return exports;}
 const engine=load('$:/plugins/huwiki/cutout/engine.js'),puppet=load('$:/plugins/huwiki/musical/puppet.js'),doc=svgDocument(),host=doc.createElement('main');doc.body.appendChild(host);
 const view=engine.build(doc,wiki,film,false);host.appendChild(view.svg);let editor=null;
 function repaint(){engine.paint(view,time);if(editor)editor.paint(time);}
 const options={doc,wiki,host,view,film,sceneTitle:'Film',stageTitle:'Scene',scoreTitle:'Score',position:()=>time,pause(){},isPlaying:()=>false,duration:()=>film.duration,beatClock:()=>({at:t=>t*2}),seek(t){time=t;repaint();},repaint,markOwnWrite(){}};
 if(withEditor)editor=load('$:/plugins/huwiki/musical/editor.js').attach(options);repaint();
 const api=puppet.mount({...options,editor:editor||{redraw(){}}});
 assert.equal(api.open(id),true);
 function save(){host.querySelector('.huw-puppet-save').click();assert.equal(api.isOpen(),false);return JSON.parse(records[writes.find(title=>title==='Film'||Object.hasOwn(scenes,title))].text);}
 return {doc,host,view,engine,api,editor,film,repaint,records,writes,initial,save,
  get overlay(){return host.querySelector('.huw-puppet-workshop');},get canvas(){return host.querySelector('.huw-puppet-canvas');},
  node(partId=id){return this.canvas.querySelector('[data-cutout-id="'+partId+'"]');}};
}
function field(h,label){const wrapper=h.overlay.querySelectorAll('.huw-puppet-field').find(node=>node.firstChild?.textContent===label);assert.ok(wrapper,'field '+label);return wrapper.querySelector('input,select');}
function change(control,value){control.value=value;control.dispatch('change');}

test('an image import completing after Cancel cannot alter a newly opened object draft',()=>{
 const h=harness();let finish;const file=h.overlay.querySelector('.huw-puppet-file input');
 file.files=[{name:'delayed.png',type:'image/png',size:4,data:'data:image/png;base64,AAAA',defer:callback=>{finish=callback;}}];file.dispatch('change');
 h.api.close();assert.equal(h.api.open('shadow-horse'),true);finish();
 assert.equal(h.node().firstChild.localName,'path');assert.equal(h.node().firstChild.getAttribute('d'),horse.geo.d);assert.deepEqual(h.writes,[]);assert.deepEqual(h.records,h.initial);h.api.close();
});

test('the real horse shadow opens at the current scene time instead of its hidden first frame',()=>{
 assert.equal(horse.keys[0].t,0);assert.equal(horse.keys[0].opacity,0);assert.equal(horse.keys[1].t,0);assert.equal(horse.keys[1].opacity,.58);
 const h=harness(),live=h.view.clips[0].view.nodes['shadow-horse'].el,state=h.engine.state(horse,1);
 assert.equal(h.canvas.firstChild.getAttribute('data-preview-time'),'1');
 assert.equal(h.node().getAttribute('transform'),live.getAttribute('transform'));
 assert.equal(Number(h.node().getAttribute('opacity')),state.opacity);assert.ok(state.opacity>0);
 assert.equal(h.canvas.firstChild.getAttribute('data-preview-revealed'),'false');assert.equal(h.overlay.querySelector('.huw-puppet-preview-notice').hidden,true);
 assert.equal(Number(field(h,'X').value),Math.round(state.x*100)/100);
 assert.match(h.overlay.querySelector('.huw-puppet-brand').textContent,/Objektværksted.*Shadow · horse/);
 assert.equal(h.overlay.querySelector('.huw-puppet-sidebar h3').textContent,'Objektets dele');
 assert.deepEqual(h.writes,[]);assert.deepEqual(h.records,h.initial);
 h.api.clearSelection();assert.equal(Number(h.node().getAttribute('opacity')),state.opacity);
 h.api.close();
});

test('an authored hidden object is revealed only in the structural preview, with no opacity key change',()=>{
 const h=harness({time:0}),before=plain(h.view.clips[0].view.scene.parts);
 assert.equal(h.view.clips[0].view.nodes['shadow-horse'].el.getAttribute('opacity'),'0');
 assert.equal(h.node().getAttribute('opacity'),'1');assert.equal(h.canvas.firstChild.getAttribute('data-preview-revealed'),'true');
 const notice=h.overlay.querySelector('.huw-puppet-preview-notice');assert.equal(notice.hidden,false);assert.equal(notice.textContent,'Vises kun i værkstedet');
 h.api.clearSelection();assert.equal(h.node().getAttribute('opacity'),'1','the workshop remains visible after deselecting');
 assert.deepEqual(h.writes,[]);assert.deepEqual(h.records,h.initial);
 const saved=h.save();assert.deepEqual(saved.parts,before);assert.equal(saved.parts[0].keys[0].opacity,0);
 assert.equal(h.view.clips[0].view.nodes['shadow-horse'].el.getAttribute('opacity'),'0','saving never leaks the preview-only reveal into the scene');
});

test('fill and stroke edit the horse independently and preserve every animation key and joint',()=>{
 const h=harness(),original=plain(horse),fill=h.overlay.querySelector('[data-puppet-paint="fill"]');
 assert.equal(fill.value,'#151817');assert.equal(h.overlay.querySelector('[data-puppet-paint="stroke"]').value,'#24201d');
 change(fill,'#445566');
 assert.equal(h.node().firstChild.getAttribute('fill'),'#445566');assert.equal(h.node().firstChild.getAttribute('stroke'),original.stroke);
 change(h.overlay.querySelector('[data-puppet-paint="stroke"]'),'#112233');
 const saved=h.save().parts.find(p=>p.id===original.id);
 assert.deepEqual(saved,{...original,fill:'#445566',stroke:'#112233'});
 assert.deepEqual(saved.keys,original.keys);assert.deepEqual(saved.pivot,original.pivot);
});

test('saving appearance preserves one existing whole-object transform through real editor repaints',()=>{
 const figureTransforms={'shadow-horse':{keys:[{t:0,x:123,y:-45,r:17,sx:1.5,sy:.75,skewX:3,skewY:2,easing:'linear'}]}};
 const h=harness({figureTransforms,withEditor:true}),leaf=h.view.clips[0].view,old=leaf.nodes['shadow-horse'].el,wrapper=old._musicalWholeWrapper;
 const matrix=node=>{const value=node.getScreenCTM();return ['a','b','c','d','e','f'].map(key=>value[key]);},pose=matrix(old),transform=wrapper.getAttribute('transform');
 assert.equal(old.parentNode,wrapper);assert.equal(h.view.svg.querySelectorAll('.huw-musical-object-wrapper').length,1);
 change(h.overlay.querySelector('[data-puppet-paint="fill"]'),'#225544');const saved=h.save(),next=leaf.nodes['shadow-horse'].el;
 assert.notEqual(next,old,'saving rebuilds the edited drawing');
 assert.equal(h.view.svg.querySelectorAll('.huw-musical-object-wrapper').length,1,'repaint must not apply the whole-object transform twice');
 assert.equal(next._musicalWholeWrapper,wrapper);assert.equal(next.parentNode,wrapper);assert.equal(wrapper.getAttribute('transform'),transform);
 assert.deepEqual(matrix(next),pose,'appearance changes retain the current onstage position, angle and scale');
 h.repaint();assert.equal(h.view.svg.querySelectorAll('.huw-musical-object-wrapper').length,1);assert.deepEqual(matrix(next),pose);
 assert.deepEqual(saved.parts.find(p=>p.id==='shadow-horse').keys,horse.keys);assert.deepEqual(plain(h.film.musical.figureTransforms),figureTransforms);
});

test('replacing a scene object appearance preserves its identity, parent, pivot, animation and attached child',()=>{
 const parent={id:'shadow-rig',name:'Shadow rig',type:'group',keys:[{t:0,x:20,y:30,r:7}]},object={...plain(horse),parent:parent.id,pivot:{x:4,y:8}},child={id:'detail',parent:horse.id,type:'circle',geo:{r:5},keys:[{t:0,x:45,y:0}]},sample={id:'sample',name:'Replacement',type:'rect',geo:{x:-55,y:-65,w:110,h:130},fill:'#789abc',stroke:'#345678',strokeWidth:2};
 const original=[parent,object,child,sample],h=harness({scenes:{Scene:scene(original)}});
 const copy=field(h,'Kopiér udseende fra');change(copy,'sample');
 const saved=h.save().parts,changed=saved.find(p=>p.id===horse.id);
 assert.deepEqual({id:changed.id,parent:changed.parent,pivot:changed.pivot,keys:changed.keys},{id:object.id,parent:object.parent,pivot:object.pivot,keys:object.keys});
 assert.equal(changed.type,'rect');assert.deepEqual(changed.geo,sample.geo);assert.equal(changed.fill,sample.fill);
 assert.deepEqual(saved.filter(p=>p.id!==horse.id),plain(original.filter(p=>p.id!==horse.id)));
});

test('image replacement retains a large backdrop footprint instead of shrinking it to 300 pixels',()=>{
 const backdrop={id:'backdrop',name:'Backdrop',type:'rect',geo:{x:-800,y:-450,w:1600,h:900},pivot:{x:12,y:34},fill:'#eeeeee',keys:[{t:0,x:800,y:450,r:0,sx:1,sy:1,opacity:.7},{t:10,x:840,y:430,r:4,sx:1.1,sy:1.2,opacity:.9}]};
 const h=harness({scenes:{Scene:scene([backdrop])},id:'backdrop',time:3}),pose=h.node('backdrop').getAttribute('transform');
 const file=h.overlay.querySelector('.huw-puppet-file input');file.files=[{name:'new-background.png',type:'image/png',size:4,data:'data:image/png;base64,AAAA'}];file.dispatch('change');
 assert.equal(h.node('backdrop').getAttribute('transform'),pose);assert.equal(h.node('backdrop').firstChild.getAttribute('width'),'1600');assert.equal(h.node('backdrop').firstChild.getAttribute('height'),'900');
 const saved=h.save().parts[0];assert.equal(saved.id,backdrop.id);assert.equal(saved.type,'image');assert.deepEqual(saved.geo,backdrop.geo);assert.deepEqual(saved.keys,backdrop.keys);assert.deepEqual(saved.pivot,backdrop.pivot);
 assert.equal(saved.variants.length,1);assert.ok(saved.variants[0].asset);assert.equal(saved.variants[0].imageData,undefined);
});

test('reused scene IDs resolve the active occurrence and its mapped local clock',()=>{
 const other={...plain(horse),name:'Second scene horse',keys:horse.keys.map(key=>({...key,x:key.x+200}))};
 const h=harness({scenes:{First:scene([horse]),Second:scene([other])},sequence:[{source:'First',duration:5},{source:'Second',duration:8,speed:2,offset:1}],time:6});
 assert.equal(h.canvas.firstChild.getAttribute('data-preview-time'),'3');
 assert.equal(h.node().getAttribute('transform'),h.view.clips[1].view.nodes['shadow-horse'].el.getAttribute('transform'));
 assert.match(h.overlay.querySelector('.huw-puppet-brand').textContent,/Second scene horse/);
 change(h.overlay.querySelector('[data-puppet-paint="fill"]'),'#abcdef');h.save();
 assert.deepEqual(h.writes,['Second']);assert.equal(h.records.First.text,h.initial.First.text);assert.deepEqual(JSON.parse(h.records.Second.text).parts[0].keys,other.keys);
});

test('nested object animation uses its timing and structural movement offsets the complete keyed path from the current pose',()=>{
 const nested={id:'container',type:'animation',animation:'Inner',start:.5,speed:3,offset:.5,keys:[{t:0,x:0,y:0}]};
 const h=harness({scenes:{Outer:scene([nested]),Inner:scene([horse])},sequence:[{source:'Outer',duration:10}],time:3});
 assert.equal(h.canvas.firstChild.getAttribute('data-preview-time'),'8');
 const target=h.node(),first={x:10,y:10},last={x:22,y:17};
 target.firstChild.dispatch('pointerdown',{pointerId:5,clientX:first.x,clientY:first.y});target.dispatch('pointermove',{pointerId:5,clientX:last.x,clientY:last.y});target.dispatch('pointerup',{pointerId:5,clientX:last.x,clientY:last.y});
 const saved=h.save().parts.find(p=>p.id===horse.id);
 assert.deepEqual(h.writes,['Inner']);assert.deepEqual(saved.keys,horse.keys.map(key=>({...key,x:key.x+12,y:key.y+7})));
 assert.deepEqual(saved.pivot,horse.pivot);assert.equal(saved.fill,horse.fill);
 assert.equal(h.view.clips[0].view.nodes.container.nested.nodes['shadow-horse'].part.keys[0].x,horse.keys[0].x+12,'saving rebuilds the actual nested source subtree');
});

test('a grouped scene object edits its drawing carrier while preserving the group and both sets of timed transforms',()=>{
 const object={id:'prop',name:'Prop',type:'group',pivot:{x:4,y:5},keys:[{t:0,x:300,y:400,r:5,sx:2,sy:2},{t:8,x:500,y:320,r:25,sx:3,sy:3}]};
 const drawing={...plain(horse),id:'prop-drawing',parent:'prop',name:'Appearance'},child={id:'attachment',parent:'prop',type:'circle',geo:{r:9},keys:[{t:0,x:10,y:11}]};
 const h=harness({scenes:{Scene:scene([object,drawing,child])},id:'prop'});
 assert.equal(h.overlay.dataset.workshopKind,'object');assert.equal(h.overlay.querySelector('[data-puppet-appearance-target]').dataset.puppetAppearanceTarget,'prop-drawing');
 assert.equal(h.overlay.querySelector('[data-puppet-paint="fill"]').value,horse.fill);
 change(h.overlay.querySelector('[data-puppet-paint="fill"]'),'#668855');
 const saved=h.save().parts;assert.deepEqual(saved.find(p=>p.id==='prop'),object);assert.deepEqual(saved.find(p=>p.id==='attachment'),child);
 assert.deepEqual(saved.find(p=>p.id==='prop-drawing'),{...drawing,fill:'#668855'});
 assert.equal(h.view.clips[0].view.nodes['prop-drawing'].shape.getAttribute('fill'),'#668855','the saved drawing is visible on the existing stage');
});

test('film-owned scenery saves only its subtree while retaining stage SVG, overlays and other objects',()=>{
 const companion={id:'companion',type:'rect',geo:{x:10,y:20,w:30,h:40},fill:'#778899',keys:[{t:0,x:0,y:0}]};
 const h=harness({scenes:{},sequence:[],filmParts:[horse,companion]}),svg=h.view.svg,unchanged=h.view.nodes.companion,overlay=h.doc.createElementNS('http://www.w3.org/2000/svg','g');
 overlay.setAttribute('class','existing-editor-overlay');svg.appendChild(overlay);
 assert.deepEqual(h.writes,[]);assert.deepEqual(h.records,h.initial);assert.equal(h.canvas.firstChild.getAttribute('data-preview-time'),'1');
 change(h.overlay.querySelector('[data-puppet-paint="fill"]'),'#abcdef');
 const saved=h.save();assert.deepEqual(h.writes,['Film']);assert.equal(h.view.svg,svg);assert.equal(overlay.parentNode,svg);assert.equal(h.view.nodes.companion,unchanged);
 assert.deepEqual(saved.parts[0],{...plain(horse),fill:'#abcdef'});assert.deepEqual(saved.parts[1],companion);
 assert.equal(h.view.nodes['shadow-horse'].shape.getAttribute('fill'),'#abcdef');assert.equal(h.view.nodes['shadow-horse'].el.parentNode,svg);
});

test('replacing the currently keyed image variant keeps variant IDs and every animation key intact',()=>{
 const image={id:'prop',type:'image',name:'Prop',geo:{x:-100,y:-50,w:200,h:100},pivot:{x:8,y:9},variants:[{id:'one',name:'One',imageData:'data:image/png;base64,AAAA'},{id:'two',name:'Two',imageData:'data:image/png;base64,BBBB'}],variantId:'one',keys:[{t:0,x:100,y:100,variantId:'one'},{t:2,x:300,y:150,variantId:'two'}]};
 const h=harness({scenes:{Scene:scene([image])},id:'prop',time:3}),pose=h.node('prop').getAttribute('transform');
 const file=h.overlay.querySelector('.huw-puppet-file input');file.files=[{name:'replacement.png',type:'image/png',size:4,data:'data:image/png;base64,CCCC'}];file.dispatch('change');
 assert.equal(h.node('prop').firstChild.getAttribute('href'),'data:image/png;base64,CCCC','a timed variant key must not override the newly imported appearance');
 assert.equal(h.node('prop').getAttribute('transform'),pose);
 const saved=h.save().parts[0];assert.deepEqual(saved.keys,image.keys);assert.deepEqual(saved.pivot,image.pivot);assert.deepEqual(saved.geo,image.geo);
 assert.deepEqual(saved.variants.map(v=>v.id),['one','two']);assert.equal(saved.variantId,'one');assert.equal(saved.variants[1].name,'replacement.png');
});

test('rebuilding reused scene appearances keeps unedited DOM nodes connected to their current source records',()=>{
 const companion={id:'companion',name:'Unedited prop',type:'rect',geo:{x:0,y:0,w:40,h:50},keys:[{t:0,x:10,y:20}]};
 const h=harness({scenes:{Scene:scene([horse,companion])},sequence:[{source:'Scene',duration:5},{source:'Scene',duration:8}],time:6});
 const first=h.view.clips[0].view,second=h.view.clips[1].view,firstNode=first.nodes.companion,secondNode=second.nodes.companion;
 assert.notEqual(first.scene,second.scene);assert.notEqual(firstNode.part,secondNode.part,'the production builds independent records for reused scene occurrences');
 change(h.overlay.querySelector('[data-puppet-paint="fill"]'),'#112244');h.save();
 assert.equal(first.nodes.companion,firstNode);assert.equal(second.nodes.companion,secondNode);
 for(const occurrence of [first,second]){
  const source=occurrence.scene.parts.find(part=>part.id==='companion');assert.equal(occurrence.nodes.companion.part,source);
  source.keys[0].x=321;source.keys[0].y=123;h.engine.paint(occurrence,1);
  assert.match(occurrence.nodes.companion.el.getAttribute('transform'),/^translate\(321 123\)/,'later transforms repaint the retained node from its updated source record');
 }
});
