import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {Matrix,matrixFor,svgDocument} from './helpers/svg-test-dom.mjs';
const zoomCode=await readFile(new URL('../plugins/musical/src/selection-zoom.js',import.meta.url),'utf8');
const workspaceCode=await readFile(new URL('../plugins/musical/src/workspace.js',import.meta.url),'utf8');
const zoom={};runInNewContext(zoomCode,{exports:zoom});
const face={},facePanel={};
runInNewContext(await readFile(new URL('../plugins/musical/src/face.js',import.meta.url),'utf8'),{exports:face,require:()=>({})});
runInNewContext(await readFile(new URL('../plugins/musical/src/face-panel.js',import.meta.url),'utf8'),{exports:facePanel,require:()=>face});
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-6,message||`${actual} should equal ${expected}`);
const plain=value=>JSON.parse(JSON.stringify(value));
function geometry(){
 const doc=svgDocument(),svg=doc.createElementNS('svg','svg');doc.body.appendChild(svg);svg.setAttribute('viewBox','0 0 800 450');
 const camera=doc.createElementNS('svg','g'),actor=doc.createElementNS('svg','g'),arm=doc.createElementNS('svg','g'),shape=doc.createElementNS('svg','rect');
 svg.appendChild(camera);camera.appendChild(actor);actor.appendChild(arm);arm.appendChild(shape);
 camera.setAttribute('transform','translate(120 65) rotate(-12) scale(.8 1.2)');actor.setAttribute('transform','translate(200 170) rotate(30) scale(1.5 .8)');arm.setAttribute('transform','translate(20 5) rotate(12)');
 shape.setAttribute('x','0');shape.setAttribute('y','-6');shape.setAttribute('width','48');shape.setAttribute('height','12');
 svg.screenMatrix=new Matrix(.7,0,0,.7,35,20);
 return {doc,svg,camera,actor,arm,shape};
}
test('selection bounds include nested camera, actor and limb transforms independently of preview zoom',()=>{
 const h=geometry(),matrix=matrixFor(h.camera.getAttribute('transform')).multiply(matrixFor(h.actor.getAttribute('transform'))).multiply(matrixFor(h.arm.getAttribute('transform')));
 const expected=[[0,-6],[48,-6],[48,6],[0,6]].map(([x,y])=>matrix.point({x,y}));
 let measured=zoom.boundsInRoot(h.svg,h.arm,0);assert.ok(measured);
 measured.corners.forEach((p,i)=>{near(p.x,expected[i].x);near(p.y,expected[i].y);});
 h.svg.screenMatrix=new Matrix(7,0,0,7,-1500,-1100);
 measured=zoom.boundsInRoot(h.svg,h.arm,0);
 measured.corners.forEach((p,i)=>{near(p.x,expected[i].x);near(p.y,expected[i].y);});
 const fitted=zoom.fitPoints(measured.corners,16/9);
 near(fitted.width/fitted.height,16/9);
 for(const p of expected){assert.ok(p.x>fitted.x&&p.x<fitted.x+fitted.width);assert.ok(p.y>fitted.y&&p.y<fitted.y+fitted.height);}
});
test('hidden ancestors are excluded from zoom and a straight limb still has an editable frame',()=>{
 const h=geometry();h.shape.setAttribute('height','0');const bounds=zoom.boundsInRoot(h.svg,h.arm,8);assert.ok(bounds);assert.equal(bounds.height,8);
 h.actor.style.display='none';assert.equal(zoom.boundsInRoot(h.svg,h.arm,8),null);
 h.actor.style.display='';h.camera.setAttribute('display','none');assert.equal(zoom.boundsInRoot(h.svg,h.arm,8),null);
 h.camera.removeAttribute('display');h.actor.classList.add('huw-musical-preview-hidden');assert.equal(zoom.boundsInRoot(h.svg,h.arm,8),null);
});
test('export restores authored camera frames and restores the same preview after nested export suspension',()=>{
 const h=geometry(),controller=zoom.create(h.svg);const before=h.svg.getAttribute('viewBox');
 assert.equal(controller.fit([{x:100,y:100},{x:130,y:125}],16/9),true);const focused=h.svg.getAttribute('viewBox');assert.notEqual(focused,before);
 h.svg.setAttribute('viewBox','50 30 400 225');controller.apply();assert.equal(h.svg.getAttribute('viewBox'),focused);
 const outer=controller.suspend(),inner=controller.suspend();assert.equal(h.svg.getAttribute('viewBox'),'50 30 400 225');
 h.svg.setAttribute('viewBox','70 40 300 168.75');controller.apply();inner();assert.equal(h.svg.getAttribute('viewBox'),'70 40 300 168.75');
 outer();assert.equal(h.svg.getAttribute('viewBox'),focused);outer();controller.reset();assert.equal(h.svg.getAttribute('viewBox'),'70 40 300 168.75');
 assert.equal(controller.active(),false);
});
test('selection focus releases only ancestor SVG clipping and restores it for export, reset and disposal',()=>{
 const h=geometry(),act=h.doc.createElementNS('svg','svg'),scene=h.doc.createElementNS('svg','svg'),other=h.doc.createElementNS('svg','svg'),otherPart=h.doc.createElementNS('svg','g');
 act.setAttribute('viewBox','100 60 400 225');scene.setAttribute('viewBox','900 150 500 281.25');other.setAttribute('viewBox','0 0 80 60');
 act.classList.add('co-nested-svg');scene.classList.add('co-nested-svg');other.classList.add('co-nested-svg');
 scene.style.overflow='hidden';h.svg.appendChild(act);act.appendChild(scene);scene.appendChild(h.camera);h.svg.appendChild(other);other.appendChild(otherPart);
 const source=[act,scene,other].map(node=>({viewBox:node.getAttribute('viewBox'),overflow:node.style.overflow}));
 const flag='huw-musical-selection-unclipped',points=[{x:-180,y:150},{x:-120,y:220}];let blocked=false;
 const controller=zoom.create(h.svg,()=>blocked);
 controller.fit(points,16/9,h.arm);
 assert.equal(act.classList.contains(flag),true);assert.equal(scene.classList.contains(flag),true,'the child camera no longer clips the focused off-camera part');
 assert.equal(h.svg.classList.contains(flag),false,'the stage itself remains cropped');assert.equal(other.classList.contains(flag),false,'unrelated animation viewports retain their clipping');
 const outer=controller.suspend(),inner=controller.suspend();
 assert.equal(act.classList.contains(flag),false);assert.equal(scene.classList.contains(flag),false,'export uses authored nested viewport clipping');
 inner();assert.equal(scene.classList.contains(flag),false);outer();assert.equal(scene.classList.contains(flag),true);outer();
 blocked=true;controller.apply();assert.equal(scene.classList.contains(flag),false);blocked=false;controller.apply();assert.equal(scene.classList.contains(flag),true);
 controller.fit(points,16/9,otherPart);assert.equal(scene.classList.contains(flag),false);assert.equal(act.classList.contains(flag),false);assert.equal(other.classList.contains(flag),true);
 controller.reset();assert.equal(other.classList.contains(flag),false);
 controller.fit(points,16/9,h.arm);controller.dispose();assert.equal(scene.classList.contains(flag),false);assert.equal(act.classList.contains(flag),false);
 assert.deepEqual([act,scene,other].map(node=>({viewBox:node.getAttribute('viewBox'),overflow:node.style.overflow})),source,'focusing never rewrites child cameras or authored overflow styles');
});
function workspaceHarness(options={}){
 const h=geometry(),{doc,svg,actor,arm,shape}=h;
 doc.createComment=text=>doc.createTextNode(text);
 h.camera.removeAttribute('transform');actor.setAttribute('data-cutout-id','actor');arm.setAttribute('data-cutout-id','arm');
 const body=doc.createElementNS('svg','rect');body.setAttribute('x','-25');body.setAttribute('y','-60');body.setAttribute('width','50');body.setAttribute('height','120');actor.insertBefore(body,arm);
 svg.getBoundingClientRect=()=>({width:640,height:360,left:0,top:0});
 svg.getScreenCTM=()=>{const [x,y,w,height]=svg.getAttribute('viewBox').split(/\s+/).map(Number),s=Math.min(640/w,360/height);return new Matrix(s,0,0,s,(640-w*s)/2-x*s,(360-height*s)/2-y*s);};
 const host=doc.createElement('section');doc.body.appendChild(host);
 const create=(tag,cls,parent=host)=>{const node=doc.createElement(tag);node.className=cls;parent.appendChild(node);return node;};
 const layout=create('div','huw-musical-layout'),stage=create('div','huw-musical-stage',layout);create('h3','huw-musical-subtitle',stage);
 const canvas=create('div','huw-musical-canvas',stage);canvas.appendChild(svg);create('div','huw-musical-score',layout);
 const transport=create('div','huw-musical-transport'),play=create('button','huw-musical-play',transport),root=create('section','huw-musical-editor');
 create('header','huw-musical-editor-header',root);create('p','',root);create('div','huw-musical-inspector',root);
 const film={width:800,height:450,camera:{keys:[{t:0,x:400,y:225,zoom:1}]},parts:[{id:'actor',name:'Actor'},{id:'arm',parent:'actor',name:'Arm'}]};
 if(options.face)film.parts.push({id:'head',parent:'actor',name:'Head'},{id:'mouth',parent:'head',name:'Mouth'},{id:'eyes',parent:'head',name:'Eyes'});
 const scene=film;let selected={id:'song:music',kind:'song'},workspace,change=null,committed=0,paused=0,scriptOpened=0,position=2,seeks=0,figureOptions,figureSelected='',figureOpened=false,figureSuspended=0;
 const faceCommands=[],figureCalls=[];
 function repaint(){svg.setAttribute('viewBox','0 0 800 450');workspace?.paintPreview();workspace?.refreshHandles();}
 const editor={getSelection:()=>selected,setFilter(){},setZoom(){},getZoom:()=>1,addKeyframe(){},removeKeyframe(){},setCameraEdit(){repaint();},inClipDetail:()=>false,
  resolvePartScene:()=>scene,ensureFigureTrack(){},getPartPivot:()=>({x:0,y:0}),isJointMove:()=>false,
  selectPart(id){selected={id:'part:'+id,kind:'part',part:id};workspace?.selectTrack(selected);return true;},
  selectFigure(id,quiet){selected={id:'figure:'+id,kind:'figure',part:id};if(!quiet)workspace?.selectTrack(selected);return true;},
  beginPartMove(id){return {update(dx,dy,dr){change={id,dx,dy,dr};repaint();},commit(){committed++;},cancel(){change=null;}};},
  figureStateFor:()=>({x:0,y:0,r:0,sx:1,sy:1}),isExporting:()=>false};
 if(options.face){
  film.musical={faceKeys:[]};const faceView={scene:film,nodes:{}};
  editor.faceContext=id=>film.parts.some(p=>p.id===id)?{actorId:'actor',actorPartId:'actor',headId:'head',label:'Actor',scene:film,view:faceView,time:position,localTime:position,
   state:face.state(film.musical.faceKeys,position,'actor'),parts:{open:'mouth',eyes:['eyes']},variants:[{id:'o',name:'Round'},{id:'e',name:'Smile'}],viseme:'O',variantMap:{O:'o',E:'e'},defaultVariantMap:{O:'o',E:'e'},cue:{partId:'cue',text:'Hello',time:position}}:null;
  editor.faceHistory=()=>film.musical.faceKeys;
  editor.chooseFace=(id,command)=>{faceCommands.push({id,...plain(command)});const patch=command.channel==='mouth'?{mouth:{mode:'auto'},mouthMap:{[command.viseme]:command.value==='auto'?null:command.value}}:command.channel==='eyes'?{eyes:command.value}:face.preset(command.value);
   film.musical.faceKeys=face.withKey(film.musical.faceKeys,'actor',position,patch);selected={id:'face:actor',kind:'face',part:'head',actorId:'actor'};repaint();workspace.selectTrack(selected);return true;};
 }
 const inactive=()=>({isOpen:()=>false,open(){},close(){},dispose(){},draw(){}});
 const modules={
  '$:/plugins/huwiki/musical/selection-zoom.js':zoom,
  '$:/plugins/huwiki/musical/face-panel.js':options.face?facePanel:{mount:()=>({...inactive(),select:()=>false,refresh(){},hide(){},isWorkshopOpen:()=>false,relocate(){},suspend:()=>()=>{}})},
  '$:/plugins/huwiki/musical/figure-panel.js':{mount:config=>{figureOptions=config;return {select(id){figureCalls.push(id);figureSelected=id.replace(/-drawing$/,'');figureOpened=true;return true;},selectedPart:()=>figureSelected,refresh(){},hide(){figureOpened=false;},isOpen:()=>figureOpened&&!figureSuspended,isDragging:()=>false,cancelGesture(){},
   suspend(){figureSuspended++;let restored=false;return ()=>{if(!restored){restored=true;figureSuspended--;}};},dispose(){figureOpened=false;}};}},
  '$:/plugins/huwiki/musical/puppet.js':{mount:inactive,rootFor:id=>id==='arm'?'actor':id},
  '$:/plugins/huwiki/musical/manuscript.js':{mount:()=>({...inactive(),open(){scriptOpened++;}})},
  '$:/plugins/huwiki/musical/narration.js':{mount:inactive},
  '$:/plugins/huwiki/musical/score-workshop.js':{mount:inactive},
  '$:/plugins/huwiki/musical/scenes.js':{mount:inactive}
 };
 const api={};runInNewContext(workspaceCode,{exports:api,require:name=>{if(!modules[name])throw Error(name);return modules[name];},$tw:{}});
 const view={svg,nodes:{actor:{el:actor},arm:{el:arm}},clips:[]};
 workspace=api.mount({doc,host,editor,film,view,layout,transport,play,project:'Show',sceneTitle:'Film',wiki:{getTiddlerText:()=>'$:/languages/en-GB'},scoreTitle:()=>'',position:()=>position,pause(){paused++;},seek(time){position=time;seeks++;},repaint});
 return {...h,host,stage,film,view,workspace,editor,repaint,faceCommands,figureCalls,openFigureFace(id){figureOptions.onFace({partId:id,actorId:'actor',headId:'head',tab:id==='mouth'?'mouth':'eyes'});},
  get selected(){return selected;},get change(){return change;},get committed(){return committed;},get paused(){return paused;},get scriptOpened(){return scriptOpened;},get position(){return position;},get seeks(){return seeks;},get figureOpen(){return figureOpened&&!figureSuspended;}};
}
test('workspace actions zoom selected figure and arm, retain pointer coordinates and leave camera data unchanged',()=>{
 const h=workspaceHarness(),before=JSON.stringify(h.film),zoomButton=h.host.querySelector('.huw-musical-zoom-selection');
 assert.equal(zoomButton.disabled,true);h.editor.selectFigure('actor');assert.equal(zoomButton.disabled,false);zoomButton.click();
 let box=h.svg.getAttribute('viewBox').split(/\s+/).map(Number);assert.ok(box[2]<800);const figureWidth=box[2];
 h.host.querySelector('.huw-musical-parts-button').click();h.editor.selectPart('arm');
 box=h.svg.getAttribute('viewBox').split(/\s+/).map(Number);assert.ok(box[2]<figureWidth,'changing selection refits the active zoom to the smaller limb');
 const focused=h.svg.getAttribute('viewBox'),parent=h.arm.parentNode.getScreenCTM(),from=parent.point({x:32,y:5}),to=parent.point({x:41,y:2});
 h.shape.dispatch('pointerdown',{clientX:from.x,clientY:from.y});h.arm.dispatch('pointermove',{clientX:to.x,clientY:to.y});
 near(h.change.dx,9);near(h.change.dy,-3);assert.equal(h.svg.getAttribute('viewBox'),focused,'zoom stays fixed during drag');
 h.arm.dispatch('pointerup',{clientX:to.x,clientY:to.y});assert.equal(h.committed,1);
 const handle=h.svg.querySelector('.huw-musical-transform-rotate');near(Number(handle.getAttribute('r'))*h.svg.getScreenCTM().a,11,'rotation handle remains 11 screen pixels at any zoom');
 assert.equal(JSON.stringify(h.film),before);h.host.querySelector('.huw-musical-reset-preview-zoom').click();assert.equal(h.svg.getAttribute('viewBox'),'0 0 800 450');
 h.workspace.openManuscript({});assert.equal(h.scriptOpened,1);h.workspace.dispose();
});
test('switching from a clicked limb to Parts and joints keeps that limb as the rotation and zoom target',()=>{
 const h=workspaceHarness(),click=h.arm.getScreenCTM().point({x:32,y:0});
 h.shape.dispatch('pointerdown',{clientX:click.x,clientY:click.y});h.arm.dispatch('pointerup',{clientX:click.x,clientY:click.y});
 assert.equal(h.selected.kind,'figure');assert.equal(h.selected.part,'actor','the initial click selects the containing figure');
 h.host.querySelector('.huw-musical-parts-button').click();
 assert.equal(h.selected.part,'arm','entering Parts and joints restores the actual clicked limb, not its parent figure');
 assert.equal(h.svg.querySelector('.huw-musical-transform-label').textContent,'Arm');
 h.workspace.zoomToSelection();
 const handle=h.svg.querySelector('.huw-musical-transform-rotate'),start=h.svg.getScreenCTM().point({x:Number(handle.getAttribute('cx')),y:Number(handle.getAttribute('cy'))});
 handle.dispatch('pointerdown',{clientX:start.x,clientY:start.y});
 handle.dispatch('pointermove',{clientX:start.x+25,clientY:start.y+15});handle.dispatch('pointerup',{clientX:start.x+25,clientY:start.y+15});
 assert.equal(h.change.id,'arm','the rotation gesture is committed to the mounted limb');assert.equal(h.committed,1);
 assert.ok(Math.abs(h.change.dr)>0);h.workspace.dispose();
});
test('workspace export, fullscreen fallback, hidden selection and disposal restore the preview cleanly',()=>{
 const h=workspaceHarness();h.editor.selectFigure('actor');h.workspace.zoomToSelection();const focused=h.svg.getAttribute('viewBox');
 const restore=h.workspace.beginExport();assert.equal(h.svg.getAttribute('viewBox'),'0 0 800 450');assert.equal(h.svg.querySelector('.huw-musical-transform-overlay').style.display,'none');
 h.repaint();assert.equal(h.svg.getAttribute('viewBox'),'0 0 800 450');restore();restore();assert.equal(h.svg.getAttribute('viewBox'),focused);
 const fullscreen=h.host.querySelector('.huw-musical-stage-fullscreen');fullscreen.click();assert.equal(fullscreen.getAttribute('aria-pressed'),'true');assert.equal(h.stage.classList.contains('huw-musical-stage--expanded'),true);
 h.host.dispatch('keydown',{key:'Escape'});assert.equal(fullscreen.getAttribute('aria-pressed'),'false');assert.equal(h.stage.classList.contains('huw-musical-stage--expanded'),false);
 h.actor.style.display='none';h.repaint();assert.equal(h.svg.getAttribute('viewBox'),'0 0 800 450');assert.equal(h.host.querySelector('.huw-musical-zoom-selection').disabled,true);
 h.actor.style.display='';h.repaint();h.workspace.zoomToSelection();h.workspace.dispose();assert.equal(h.svg.getAttribute('viewBox'),'0 0 800 450');assert.equal(h.svg.querySelector('.huw-musical-transform-overlay'),null);
});
test('workspace passes the selected part to the nested clipping lifecycle',()=>{
 const h=workspaceHarness(),nested=h.doc.createElementNS('svg','svg');nested.classList.add('co-nested-svg');nested.setAttribute('viewBox','600 0 200 150');h.svg.insertBefore(nested,h.camera);nested.appendChild(h.camera);
 h.editor.selectFigure('actor');h.workspace.zoomToSelection();assert.equal(nested.classList.contains('huw-musical-selection-unclipped'),true);
 const restore=h.workspace.beginExport();assert.equal(nested.classList.contains('huw-musical-selection-unclipped'),false);restore();assert.equal(nested.classList.contains('huw-musical-selection-unclipped'),true);
 h.workspace.resetPreviewZoom();assert.equal(nested.classList.contains('huw-musical-selection-unclipped'),false);assert.equal(nested.getAttribute('viewBox'),'600 0 200 150');
 h.workspace.zoomToSelection();h.workspace.dispose();assert.equal(nested.classList.contains('huw-musical-selection-unclipped'),false);
});
test('a new active scene retargets focus when it contains the same logical actor ID',()=>{
 const h=workspaceHarness(),first=h.doc.createElementNS('svg','svg'),second=h.doc.createElementNS('svg','svg'),actor=h.doc.createElementNS('svg','g'),art=h.doc.createElementNS('svg','rect');
 first.setAttribute('viewBox','600 0 200 150');second.setAttribute('viewBox','0 0 800 450');second.setAttribute('display','none');
 h.svg.insertBefore(first,h.camera);first.appendChild(h.camera);h.svg.insertBefore(second,first);
 actor.setAttribute('data-cutout-id','actor');actor.setAttribute('transform','translate(590 300)');art.setAttribute('x','-30');art.setAttribute('y','-70');art.setAttribute('width','60');art.setAttribute('height','140');second.appendChild(actor);actor.appendChild(art);
 h.view.nodes={};h.view.clips=[{el:first,view:{nodes:{actor:{el:h.actor},arm:{el:h.arm}},clips:[]}},{el:second,view:{nodes:{actor:{el:actor}},clips:[]}}];
 const source=JSON.stringify(h.film),flag='huw-musical-selection-unclipped';h.editor.selectFigure('actor');h.workspace.zoomToSelection();const firstFocus=h.svg.getAttribute('viewBox');
 assert.equal(first.classList.contains(flag),true);assert.equal(second.classList.contains(flag),false);
 first.setAttribute('display','none');second.removeAttribute('display');h.repaint();
 assert.equal(h.selected.part,'actor','the logical selection remains unchanged across the scene cut');
 assert.equal(first.classList.contains(flag),false,'the old scene regains its authored clipping');assert.equal(second.classList.contains(flag),true,'the new instance of the selected actor is focusable');
 assert.notEqual(h.svg.getAttribute('viewBox'),firstFocus,'focus follows the new rendered element rather than its old coordinates');
 const nextFocus=h.svg.getAttribute('viewBox');h.repaint();assert.equal(h.svg.getAttribute('viewBox'),nextFocus,'repainting the same instance does not compound the zoom');
 assert.equal(JSON.stringify(h.film),source);h.workspace.dispose();assert.equal(second.classList.contains(flag),false);
});

test('shared workshop keeps head posing separate from facial choices and returns to the last body part without writing',()=>{
 const h=workspaceHarness({face:true}),dock=h.host.querySelector('[data-animus-workshop]'),source=JSON.stringify(h.film),time=h.position;
 assert.equal(dock.hidden,true);assert.equal(h.figureCalls.length,0,'mounting does not select or open a figure');
 h.editor.selectPart('head');assert.equal(dock.dataset.animusWorkshop,'figure');assert.equal(h.figureCalls.at(-1),'head','a head is still a rotatable joint');
 h.editor.selectPart('arm');assert.equal(h.figureOpen,true);
 h.openFigureFace('eyes');assert.equal(dock.dataset.animusWorkshop,'face');assert.equal(h.figureOpen,false);
 assert.equal(dock.querySelector('[data-face-tab="eyes"]').getAttribute('aria-selected'),'true');
 dock.querySelector('[data-face-back="figure"]').click();
 assert.equal(dock.dataset.animusWorkshop,'figure');assert.equal(h.selected.part,'arm');assert.equal(h.figureCalls.at(-1),'arm');
 h.editor.selectPart('mouth');assert.equal(dock.dataset.animusWorkshop,'face','a mouth selected from the timeline opens facial choices');
 assert.equal(dock.querySelector('[data-face-tab="mouth"]').getAttribute('aria-selected'),'true');
 dock.querySelector('[data-workshop-mode="figure"]').click();assert.equal(h.selected.part,'arm');
 assert.equal(h.position,time);assert.equal(h.seeks,0);assert.equal(JSON.stringify(h.film),source);assert.equal(h.committed,0);assert.deepEqual(h.faceCommands,[]);
 h.workspace.dispose();
});

test('face-key selection reentry preserves the chosen mouth tab and sound group through script and export',()=>{
 const h=workspaceHarness({face:true}),dock=h.host.querySelector('[data-animus-workshop]');
 h.editor.selectPart('arm');h.openFigureFace('mouth');
 const expanded=dock.querySelector('.huw-face-workshop');expanded.querySelector('[data-face-sound="E"]').click();
 expanded.querySelector('.huw-musical-face-choice[data-face-value="o"]').click();
 assert.equal(h.selected.kind,'face');assert.equal(dock.dataset.animusWorkshop,'face');
 assert.equal(expanded.querySelector('[data-face-tab="mouth"]').getAttribute('aria-selected'),'true');
 assert.equal(expanded.querySelector('.huw-musical-face-context').dataset.faceViseme,'E','the editor callback selects the head without changing the inspected sound');
 assert.deepEqual(h.faceCommands,[{id:'mouth',channel:'mouth',value:'o',viseme:'E',mode:'auto'}]);
 const saved=JSON.stringify(h.film);expanded.querySelector('.huw-musical-face-script').click();assert.equal(h.scriptOpened,1);
 assert.equal(dock.querySelector('.huw-face-workshop'),expanded,'opening Manuscript keeps the inline workshop and its context');
 const fullscreen=h.host.querySelector('.huw-musical-stage-fullscreen');fullscreen.click();assert.equal(dock.parentNode,h.stage);
 const outer=h.workspace.beginExport(),inner=h.workspace.beginExport();assert.equal(dock.hidden,true);assert.equal(expanded.hidden,true);
 inner();assert.equal(dock.hidden,true);assert.equal(expanded.hidden,true);
 outer();outer();assert.equal(dock.hidden,false);assert.equal(expanded.hidden,false);assert.equal(dock.dataset.animusWorkshop,'face');
 assert.equal(expanded.querySelector('.huw-musical-face-context').dataset.faceViseme,'E');assert.equal(dock.parentNode,h.stage);
 fullscreen.click();assert.equal(dock.parentNode,h.host);
 expanded.querySelector('[data-face-back="figure"]').click();assert.equal(h.selected.part,'arm');assert.equal(h.seeks,0);assert.equal(JSON.stringify(h.film),saved);
 h.workspace.dispose();assert.equal(h.host.querySelector('[data-animus-workshop]'),null);
});

test('Manuscript waits for native fullscreen exit and keeps the same inline face context',async()=>{
 const h=workspaceHarness({face:true}),dock=h.host.querySelector('[data-animus-workshop]');h.editor.selectPart('arm');h.openFigureFace('mouth');
 const expanded=dock.querySelector('.huw-face-workshop');expanded.querySelector('[data-face-sound="E"]').click();
 h.doc.fullscreenElement=h.stage;h.doc.dispatch('fullscreenchange',{});assert.equal(dock.parentNode,h.stage);
 let finishExit;h.doc.exitFullscreen=()=>new Promise(resolve=>{finishExit=()=>{h.doc.fullscreenElement=null;h.doc.dispatch('fullscreenchange',{});resolve();};});
 const opening=h.workspace.openManuscript({partId:'cue',time:h.position});assert.equal(h.scriptOpened,0,'the dialog is not appended outside an active fullscreen stage');
 finishExit();await opening;
 assert.equal(h.scriptOpened,1);assert.equal(dock.parentNode,h.host);assert.equal(dock.querySelector('.huw-face-workshop'),expanded);
 assert.equal(expanded.querySelector('.huw-musical-face-context').dataset.faceViseme,'E');assert.equal(h.seeks,0);assert.deepEqual(plain(h.film.musical.faceKeys),[]);
 h.workspace.dispose();
});
