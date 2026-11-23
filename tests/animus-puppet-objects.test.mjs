import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {drawingDocument} from './helpers/drawing-document.mjs';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root=new URL('../',import.meta.url),plain=value=>JSON.parse(JSON.stringify(value));
const bundle=JSON.parse(JSON.parse(readFileSync(new URL('plugins/cutout/dist/plugin.json',root),'utf8')).text).tiddlers;
const puppetSource=readFileSync(new URL('plugins/musical/src/puppet.js',root),'utf8');
const production=JSON.parse(readFileSync(new URL('editions/turn-around/tiddlers/production.json',root),'utf8'));
const horse=JSON.parse(production.find(t=>t.title==='Turn Around · 01 · The Whole World').text).parts.find(p=>p.id==='shadow-horse');
class Tiddler {constructor(...values){this.fields=Object.assign({},...values.map(value=>value?.fields||value));}}
class Reader {readAsDataURL(file){this.result=file.data;if(file.defer)file.defer(()=>this.onload());else this.onload();}}
function scene(parts){return {version:1,kind:'scene',width:1600,height:900,duration:26,parts:plain(parts)};}
function harness({scenes={Scene:scene([horse])},sequence=[{source:'Scene',duration:26}],filmParts=[],time=1,id='shadow-horse',figureTransforms={},withEditor=false,makeDoc=svgDocument,assets={}}={}){
 const film={version:1,kind:'theatre',width:1600,height:900,duration:sequence.reduce((sum,c)=>sum+c.duration,0)||26,parts:plain(filmParts),scenes:sequence,musical:{animationClips:[],figureTransforms:plain(figureTransforms)}};
 const records=Object.fromEntries(Object.entries({...scenes,Film:film}).map(([title,data])=>[title,{title,type:'application/json',text:JSON.stringify(data)}])),writes=[];
 Object.assign(records,assets);
  records['$:/language']={title:'$:/language',text:'$:/languages/da-DK'};
 const initial=plain(records),wiki={getTiddlerText:(title,fallback='')=>records[title]?.text??fallback,getTiddler:title=>records[title]&&new Tiddler(records[title]),
  addTiddler(tiddler){records[tiddler.fields.title]=plain(tiddler.fields);writes.push(tiddler.fields.title);},each(callback){Object.entries(records).forEach(([title,fields])=>callback(new Tiddler(fields),title));},getTiddlersWithTag:tag=>Object.keys(records).filter(t=>(records[t].tags||[]).includes(tag)),getTiddlers:()=>Object.keys(records),getModificationFields:()=>({}),generateNewTitle:title=>title};
 const cache={};function load(id){if(cache[id])return cache[id];const exports={};cache[id]=exports;
  if(makeDoc===drawingDocument&&(id.endsWith('/svg-model.js')||id.endsWith('/svg-layers.js'))){
   runInNewContext(readFileSync(new URL('plugins/musical/src/'+id.split('/').pop(),root),'utf8'),{exports,require:load});return exports;
  }
  const musical=/^\$:\/plugins\/huwiki\/musical\/([^/]+)\.js$/.exec(id),code=musical?(musical[1]==='puppet'?puppetSource:readFileSync(new URL('plugins/musical/src/'+musical[1]+'.js',root),'utf8')):bundle[id]?.text;if(!code)throw Error('Missing '+id);
  runInNewContext(code,{exports,require:load,$tw:{Tiddler},FileReader:Reader});return exports;}
 const engine=load('$:/plugins/huwiki/cutout/engine.js'),puppet=load('$:/plugins/huwiki/musical/puppet.js'),doc=makeDoc(),host=doc.createElement('main');doc.body.appendChild(host);
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

test('deleting a shoulder removes its descendants only after saving',()=>{
 const root={id:'actor',type:'group'},arm={id:'shoulder',parent:'actor',type:'group'},elbow={id:'elbow',parent:'shoulder',type:'group'},hand={id:'hand',parent:'elbow',type:'circle'},other={...plain(horse),parent:'actor'};
 const h=harness({scenes:{Scene:scene([root,arm,elbow,hand,other])},id:'shoulder'});
 h.overlay.querySelector('[data-puppet-delete]').dispatch('click');
 assert.deepEqual(h.records,h.initial);
 assert.equal(h.overlay.querySelector('[data-puppet-delete]'),null);
 assert.deepEqual(h.save().parts,[root,other]);
 for(const id of ['shoulder','elbow','hand'])assert.equal(h.view.clips[0].view.nodes[id],undefined);
});

test('placing the shoulder above the body moves its subtree and preserves animated joints',()=>{
 const root={id:'actor',type:'group'},arm={id:'shoulder',parent:'actor',type:'group'},hand={...plain(horse),id:'hand',parent:'shoulder'},body={id:'body',parent:'actor',type:'circle'},head={id:'head',parent:'actor',type:'circle'};
 const table={id:'table',type:'rect'},plank={id:'plank',type:'rect'};
 const h=harness({scenes:{Scene:scene([table,root,arm,hand,body,head,plank])},id:'shoulder'});
 change(field(h,'Lag (1 = bagest)'),2);
 assert.deepEqual(h.records,h.initial);
 const saved=h.save().parts;
 assert.deepEqual(saved.filter(p=>!p.parent),[table,root,plank]);
 assert.deepEqual(saved.filter(p=>p.parent==='actor'),[body,arm,head]);
 assert.deepEqual(saved.find(p=>p.id==='hand'),hand);
 const nodes=h.view.clips[0].view.nodes;
 assert.equal(nodes.hand.el.parentNode,nodes.shoulder.el);
 const stage=Array.from(nodes.actor.el.parentNode.children);
 assert.ok(stage.indexOf(nodes.table.el)<stage.indexOf(nodes.actor.el));
 assert.ok(stage.indexOf(nodes.actor.el)<stage.indexOf(nodes.plank.el));
 const drawn=Array.from(nodes.actor.el.children);
 assert.ok(drawn.indexOf(nodes.shoulder.el)>drawn.indexOf(nodes.body.el));
});

test('duplicate, mirror and reparent support multiple undo and redo steps before saving',()=>{
 const root={id:'actor',type:'group'},arm={id:'arm',name:'Arm',parent:'actor',type:'group',keys:[{t:0,sx:1},{t:2,sx:2}]},hand={...plain(horse),id:'hand',parent:'arm'},body={id:'body',parent:'actor',type:'group'};
 const h=harness({scenes:{Scene:scene([root,arm,hand,body])},id:'arm'});
 h.overlay.querySelector('[data-puppet-duplicate]').click();
 const copy=h.overlay.querySelector('[data-puppet-mirror]').dataset.puppetMirror;
 assert.notEqual(copy,'arm');
 h.overlay.querySelector('[data-puppet-mirror]').click();
 change(field(h,'Lag (1 = bagest)'),3);
 change(field(h,'Forbundet med'),'body');
 h.overlay.querySelector('.huw-puppet-undo').click();
 assert.equal(field(h,'Forbundet med').value,'actor');
 h.overlay.querySelector('.huw-puppet-undo').click();
 assert.equal(Number(field(h,'Lag (1 = bagest)').value),2);
 h.overlay.querySelector('.huw-puppet-redo').click();
 h.overlay.querySelector('.huw-puppet-redo').click();
 const saved=h.save().parts;
 assert.deepEqual(saved.find(p=>p.id==='arm'),arm);
 assert.equal(saved.find(p=>p.id===copy).parent,'body');
 assert.deepEqual(saved.find(p=>p.id===copy).keys.map(k=>k.sx),[-1,-2]);
 assert.deepEqual(saved.find(p=>p.parent===copy).keys,hand.keys);
});

test('saving a Kenney-style cropped limb keeps the sprite on stage through repeated edits',()=>{
 const root={id:'actor',type:'group'},arm={id:'arm',name:'Arm',parent:'actor',type:'image',imageData:'data:image/png;base64,AAAA',geo:{x:-10,y:0,w:20,h:20,crop:{x:0,y:0,w:10,h:10,sourceWidth:10,sourceHeight:20}},keys:[{t:0,x:20,y:20}]};
 const h=harness({scenes:{Scene:scene([root,arm])},id:'arm'});
 for(const angle of [15,30]){
  change(field(h,'Drejning'),angle);h.save();
  const stage=h.view.clips[0].view.nodes.arm,ref=stage.shape.firstChild.getAttribute('href');
  assert.ok(h.view.svg.querySelector('[id="'+ref.slice(1)+'"]'),'the source referenced by the cropped limb must be mounted in the stage SVG');
  assert.equal(stage.part.keys[0].r,angle);h.api.open('arm');
 }
});

test('turning a limb by dragging rotates around its joint and supports undo',()=>{
 const root={id:'actor',type:'group'},arm={id:'arm',type:'rect',parent:'actor',keys:[{t:0,x:0,y:0,r:0}]};
 const h=harness({scenes:{Scene:scene([root,arm])},id:'arm'});
 h.overlay.querySelectorAll('button').find(b=>b.textContent==='Drej del').click();
 const target=h.node('arm');target.firstChild.dispatch('pointerdown',{pointerId:3,clientX:20,clientY:0});
 target.dispatch('pointermove',{pointerId:3,clientX:0,clientY:20});target.dispatch('pointerup',{pointerId:3,clientX:0,clientY:20});
 assert.equal(Number(field(h,'Drejning').value),90);h.overlay.querySelector('.huw-puppet-undo').click();
 assert.equal(Number(field(h,'Drejning').value),0);
});

test('workshop-only fitted joints bind artwork and produce editable travelling scene keys',()=>{
 const root={id:'doll',type:'group',keys:[{t:0,x:150,y:200}]};
 const body={id:'body',parent:'doll',type:'rect',geo:{x:-50,y:-90,w:100,h:190}};
 const h=harness({scenes:{Scene:scene([root,body])},id:'body',withEditor:true,time:0});
 const button=(host,title)=>{const b=host.querySelectorAll('button').find(b=>b.textContent===title);assert.ok(b,title);return b;};
 const canvas=h.canvas.firstChild;
 const toggle=button(h.overlay,'Vis skelet');
 toggle.click();
 assert.equal(h.canvas.firstChild,canvas);
 assert.equal(toggle.textContent,'Skjul skelet');
 assert.equal(h.canvas.querySelectorAll('[data-rig-joint]').length,15);
 toggle.click();
 assert.equal(toggle.textContent,'Vis skelet');
 assert.equal(h.canvas.querySelectorAll('[data-rig-joint]').length,0);
 toggle.click();
 const handle=h.canvas.querySelector('[data-rig-joint="handR"]');assert.ok(handle);
 handle.dispatch('pointerdown');h.canvas.dispatch('pointermove',{clientX:120,clientY:150});
 assert.match(h.canvas.querySelector('[data-rig-label]').textContent,/hånd/i);
 h.canvas.dispatch('pointerup');assert.equal(h.canvas.querySelector('[data-rig-label]'),null);
 button(h.overlay,'Sæt fast på skelet').click();
 h.canvas.querySelector('[data-rig-joint="chest"]').dispatch('pointerdown');
 const saved=h.save();assert.equal(saved.parts[1].animusJoint,'chest');assert.ok(saved.parts[0].animusRig);
 assert.equal(h.view.svg.querySelector('[data-rig-joint]'),null);
 h.editor.selectFigure('doll');button(h.host,'Indsæt ved tidsmarkøren').click();
 let src=JSON.parse(h.records.Scene.text);assert.equal(src.parts[0].animusMoves.length,1);assert.ok(src.parts[0].keys.at(-1).x>150);
 assert.ok(h.host.querySelector('.huw-musical-motion-clip'));
 button(h.host,'Fjern seneste bevægelse · Gang').click();
 src=JSON.parse(h.records.Scene.text);assert.deepEqual(src.parts[0].keys,root.keys);
});

test('a drawn Kenney hand saves with its joint and keys and can be chosen for another hand',()=>{
 const pack=JSON.parse(readFileSync(new URL('plugins/animus-starter-kenney/dist/plugin.json',root)));
 const assets=JSON.parse(pack.text).tiddlers,scene=JSON.parse(assets['$:/plugins/huwiki/animus-starter-kenney/template'].text);
 const hand=scene.parts.find(p=>p.id.includes('female-person-front-hand')),other=scene.parts.find(p=>p.id.includes('female-adventurer-front-hand'));
 const h=harness({scenes:{Scene:scene},id:hand.id,assets,makeDoc:drawingDocument});
 const button=(node,label)=>{const b=node.querySelectorAll('button').find(x=>x.textContent===label);assert.ok(b,label);return b;};
 button(h.overlay,'Tegn del').click();
 const drawing=h.host.querySelector('.huw-svg-workshop'),canvas=drawing.querySelector('.huw-svg-canvas');
 const name=drawing.querySelector('.huw-svg-header input');name.value='Testhånd';
 canvas.dispatch('pointerdown',{clientX:1,clientY:2});canvas.dispatch('pointerup',{clientX:5,clientY:6});
 button(drawing,'Gem tegning').click();assert.equal(drawing.isConnected,false);
 const saved=h.save(),updated=saved.parts.find(p=>p.id===hand.id);
 assert.deepEqual(updated.keys,hand.keys);assert.deepEqual(updated.pivot,hand.pivot);assert.equal(updated.parent,hand.parent);
 const title=updated.variants[0].asset;assert.match(h.records[title].text,/<path/);
 h.api.open(other.id);button(h.overlay,'Vælg fra Materialer').click();
 const picker=h.overlay.querySelector('.huw-puppet-parts'),search=picker.querySelector('input');
 search.value='Testhånd';search.dispatch('input');button(picker,'Testhånd').click();
 const replaced=h.save().parts.find(p=>p.id===other.id);
 assert.equal(replaced.variants[0].asset,title);assert.deepEqual(replaced.keys,other.keys);assert.equal(replaced.parent,other.parent);
});

test('three cartwheels can temporarily cover starter elbow keys on one puppet',()=>{
 const pack=JSON.parse(readFileSync(new URL('plugins/animus-starter-kenney/dist/plugin.json',root)));
 const assets=JSON.parse(pack.text).tiddlers,scene=JSON.parse(assets['$:/plugins/huwiki/animus-starter-kenney/template'].text);
 const actor=scene.parts.find(p=>!p.parent&&p.id.includes('female-person'));
 const h=harness({scenes:{Scene:scene},id:actor.id,withEditor:true,assets,time:0});
 h.api.close();h.editor.selectFigure(actor.id);
 const controls=h.host.querySelector('.huw-musical-rig-controls'),selects=controls.querySelectorAll('select');
 const choose=(value)=>{const select=selects.find(s=>s.querySelectorAll('option').some(o=>o.value===value));assert.ok(select,value);change(select,value);};
 choose('wheel');choose('-1');choose('3');
 const button=label=>h.host.querySelectorAll('button').find(b=>b.textContent===label);
 button('Indsæt ved tidsmarkøren').click();
 const confirm=button('Brug bevægelsen her');assert.equal(confirm.hidden,false);confirm.click();
 let after=JSON.parse(h.records.Scene.text).parts;
 const moved=after.find(p=>p.id===actor.id);assert.equal(moved.animusMoves[0].end,4.5);assert.ok(moved.keys.at(-1).x<actor.keys[0].x);
 const other=p=>p.id.includes('female-adventurer');
 assert.deepEqual(after.filter(other),scene.parts.filter(other));
 button('Fjern seneste bevægelse · Vejrmølle').click();after=JSON.parse(h.records.Scene.text).parts;
 for(const part of scene.parts)assert.deepEqual(after.find(p=>p.id===part.id).keys,part.keys);
});

test('timeline clips use their actual span, append at the cursor, move between Kenney actors and cancel atomically',()=>{
 const pack=JSON.parse(readFileSync(new URL('plugins/animus-starter-kenney/dist/plugin.json',root)));
 const assets=JSON.parse(pack.text).tiddlers,stage=JSON.parse(assets['$:/plugins/huwiki/animus-starter-kenney/template'].text);
 const actors=stage.parts.filter(p=>!p.parent&&p.id.includes('female')).map(p=>p.id);
 const h=harness({scenes:{Scene:stage},withEditor:true,id:actors[0],assets,time:0});
 h.api.close();h.editor.selectFigure(actors[0]);
 const button=label=>h.host.querySelectorAll('button').find(b=>b.textContent===label);
 function insert(type,seconds){
  const group=h.host.querySelector('.huw-musical-rig-controls'),menu=group.querySelectorAll('select').find(s=>s.querySelectorAll('option').some(o=>o.value===type));
  change(menu,type);group.querySelector('.huw-rig-duration').value=String(seconds);
  button('Indsæt ved tidsmarkøren').click();
  if(button('Brug bevægelsen her')?.hidden===false)button('Brug bevægelsen her').click();
 }
 const scene=()=>JSON.parse(h.records.Scene.text);
 const moves=id=>scene().parts.find(p=>p.id===id).animusMoves||[];
 const row=id=>h.host.querySelector('[data-track-id="figure:'+id+'"]');
 const block=id=>h.host.querySelector('[data-rig-move="'+id+'"]');
 insert('walk',1.5);insert('wave',2);
 let [walk,wave]=moves(actors[0]);assert.equal(walk.start,0);assert.equal(walk.end,1.5);assert.equal(wave.start,1.5);assert.equal(wave.end,3.5);
 assert.ok(Math.abs(parseFloat(block(wave.id).style.width)/parseFloat(block(walk.id).style.width)-2/1.5)<1e-8);
 function drag(id,from,to,seconds,cancel=false){
  const width=1000,axis=h.film.duration,fromLane=row(from).querySelector('.huw-musical-lane'),targetLane=row(to).querySelector('.huw-musical-lane');
  for(const l of [fromLane,targetLane])l.getBoundingClientRect=()=>({left:0,width});
  h.doc.elementFromPoint=()=>targetLane;
  const b=block(id),x=(+b.dataset.start+.25)*width/axis,x2=(seconds+.25)*width/axis;
  b.dispatch('pointerdown',{pointerType:'touch',clientX:x,clientY:20});
  b.dispatch('pointermove',{pointerType:'touch',clientX:x2,clientY:65});
  b.dispatch(cancel?'pointercancel':'pointerup',{pointerType:'touch',clientX:x2,clientY:65});
 }
 const before=h.records.Scene.text;
 drag(walk.id,actors[0],actors[1],4,true);assert.equal(h.records.Scene.text,before);
 drag(walk.id,actors[0],actors[0],2);assert.equal(h.records.Scene.text,before,'overlapping drop has no writes');
 drag(walk.id,actors[0],actors[1],4);
 assert.deepEqual(moves(actors[0]).map(m=>[m.id,m.start,m.end]),[[wave.id,1.5,3.5]]);
 assert.deepEqual(moves(actors[1]).map(m=>[m.id,m.start,m.end]),[[walk.id,4,5.5]]);
 const target=scene().parts.find(p=>p.id===actors[1]),original=stage.parts.find(p=>p.id===target.id);
 assert.equal(target.keys.find(k=>k.animusMove===walk.id).x,original.keys[0].x);
 drag(wave.id,actors[0],actors[1],5.5);
 assert.equal(moves(actors[1]).length,2);
 const beforeMove=moves(actors[1]).find(m=>m.id===walk.id);drag(walk.id,actors[1],actors[1],9);
 const after=moves(actors[1]).find(m=>m.id===walk.id);assert.equal(after.start,9);assert.equal(after.end-after.start,beforeMove.end-beforeMove.start);
 block(walk.id).click();button('Fjern dette klip · Gang').click();
 block(wave.id).click();button('Fjern dette klip · Vink').click();
 for(const p of scene().parts)assert.deepEqual(p.keys,stage.parts.find(old=>old.id===p.id).keys,p.id);
});

test('a saved 0.15 cartwheel transfers its three leftward revolutions to an independently positioned puppet',()=>{
 const pack=JSON.parse(readFileSync(new URL('plugins/animus-starter-kenney/dist/plugin.json',root)));
 const assets=JSON.parse(pack.text).tiddlers,stage=JSON.parse(assets['$:/plugins/huwiki/animus-starter-kenney/template'].text);
 const [a,b]=stage.parts.filter(p=>!p.parent&&p.id.includes('female'));
 const start=harness({scenes:{Scene:stage},withEditor:true,id:a.id,assets,time:0});
 start.api.close();start.editor.selectFigure(a.id);
 const group=start.host.querySelector('.huw-musical-rig-controls'),selects=group.querySelectorAll('select');
 for(const value of ['wheel','-1','3'])change(selects.find(s=>s.querySelectorAll('option').some(o=>o.value===value)),value);
 const button=(scope,label)=>scope.querySelectorAll('button').find(x=>x.textContent===label);
 button(group,'Indsæt ved tidsmarkøren').click();button(group,'Brug bevægelsen her').click();
 const saved=JSON.parse(start.records.Scene.text),original=saved.parts.find(p=>p.id===a.id).animusMoves[0];
 delete original.recipe;
 const h=harness({scenes:{Scene:saved},withEditor:true,id:a.id,assets,time:0});h.api.close();
 h.host.querySelector('[data-rig-move]').click();
 const edit=h.host.querySelector('.huw-musical-rig-controls');
 edit.querySelector('.huw-activity-target').value=b.id;edit.querySelector('.huw-activity-start').value='5';
 const legacySelects=edit.querySelectorAll('select');
 for(const v of ['wheel','-1','3'])assert.ok(legacySelects.some(s=>s.value===v),'recovered '+v);
 button(edit,'Gem ændringer').click();
 const after=JSON.parse(h.records.Scene.text),target=after.parts.find(p=>p.id===b.id),source=after.parts.find(p=>p.id===a.id);
 assert.deepEqual(source.keys,a.keys);assert.equal(source.animusMoves.length,0);
 const m=target.animusMoves[0],keys=target.keys.filter(k=>k.animusMove===m.id);
 assert.equal(m.id,original.id);assert.equal(m.recipe.repeats,3);assert.equal(m.recipe.dir,-1);
 assert.equal(keys[0].x,b.keys[0].x);assert.ok(keys.at(-1).x<keys[0].x);
 assert.ok(Math.abs(Math.abs(keys.at(-1).r-keys[0].r)-1080)<.001);assert.equal(keys.at(-1).t,9.5);
});

test('editing a selected activity replaces its motion in place and protects adjacent clips and authored keys',()=>{
 const pack=JSON.parse(readFileSync(new URL('plugins/animus-starter-kenney/dist/plugin.json',root)));
 const assets=JSON.parse(pack.text).tiddlers,stage=JSON.parse(assets['$:/plugins/huwiki/animus-starter-kenney/template'].text);
 const actor=stage.parts.find(p=>!p.parent&&p.id.includes('female-person'));
 const h=harness({scenes:{Scene:stage},withEditor:true,id:actor.id,assets,time:0});h.api.close();h.editor.selectFigure(actor.id);
 const form=()=>h.host.querySelector('.huw-musical-rig-controls');
 const button=label=>form().querySelectorAll('button').find(x=>x.textContent===label);
 const select=label=>form().querySelectorAll('label').find(x=>x.textContent.startsWith(label+' ')).querySelector('select');
 const duration=()=>form().querySelector('.huw-rig-duration');
 const savedActor=()=>JSON.parse(h.records.Scene.text).parts.find(p=>p.id===actor.id);
 change(select('Bevægelse'),'wheel');change(select('Retning'),'-1');change(select('Gentagelser'),'3');
 button('Indsæt ved tidsmarkøren').click();button('Brug bevægelsen her').click();
 change(select('Bevægelse'),'wave');button('Indsæt ved tidsmarkøren').click();
 const [first,next]=savedActor().animusMoves;
 const open=id=>h.host.querySelector('[data-rig-move="'+id+'"]').click();
 open(first.id);
 assert.equal(h.host.querySelectorAll('.huw-musical-rig-controls').length,1);
 assert.equal(button('Indsæt ved tidsmarkøren'),undefined);
 assert.equal(select('Bevægelse').value,'wheel');assert.equal(select('Retning').value,'-1');
 assert.equal(select('Gentagelser').value,'3');assert.equal(Number(duration().value),4.5);
 change(select('Retning'),'1');change(select('Gentagelser'),'2');
 const before=h.records.Scene.text;
 duration().value='5';button('Gem ændringer').click();assert.equal(h.records.Scene.text,before);
 assert.match(form().querySelector('.huw-activity-feedback').textContent,/allerede en aktivitet/);
 duration().value='4.5';button('Gem ændringer').click();
 let updated=savedActor(),keys=updated.keys.filter(k=>k.animusMove===first.id);
 assert.deepEqual(updated.animusMoves.map(x=>[x.id,x.start,x.end]),[[first.id,0,4.5],[next.id,4.5,6]]);
 assert.equal(updated.animusMoves[0].recipe.repeats,2);assert.equal(updated.animusMoves[0].recipe.dir,1);
 const endpoint=updated.animusMoves[1].prior[actor.id].find(k=>k.animusMove===first.id);
 assert.ok(endpoint.x>keys[0].x);assert.ok(Math.abs(Math.abs(endpoint.r-keys[0].r)-720)<.001);
 change(select('Bevægelse'),'jump');assert.equal(Number(duration().value),4.5);
 button('Gem ændringer').click();assert.equal(savedActor().animusMoves[0].type,'jump');
 const reopened=harness({scenes:{Scene:JSON.parse(h.records.Scene.text)},withEditor:true,id:actor.id,assets,time:0});
 reopened.api.close();reopened.host.querySelector('[data-rig-move="'+first.id+'"]').click();
 const restored=reopened.host.querySelector('.huw-activity-editor');assert.ok(restored.querySelectorAll('select').some(s=>s.value==='jump'));
 button('Fjern dette klip · Hop').click();open(next.id);button('Fjern dette klip · Vink').click();
 for(const part of JSON.parse(h.records.Scene.text).parts)assert.deepEqual(part.keys,stage.parts.find(p=>p.id===part.id).keys,part.id);
});
