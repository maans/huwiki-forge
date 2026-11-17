/*\
title: $:/plugins/huwiki/cutout/direct-edit.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Engine=require('$:/plugins/huwiki/cutout/engine.js');
var Ui=require('$:/plugins/huwiki/cutout/i18n.js');
var SVG='http://www.w3.org/2000/svg';
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function partOf(data,id){return (data&&data.parts||[]).find(function(part){return part.id===id;})||null;}
function rootPart(data,id){
 var part=partOf(data,id),seen=Object.create(null);
 while(part&&part.parent&&!seen[part.id]){seen[part.id]=true;var parent=partOf(data,part.parent);if(!parent||seen[parent.id])break;part=parent;}
 return part;
}
function keySnapshot(part){return {has:Object.prototype.hasOwnProperty.call(part,'keys'),value:clone(part.keys)};}
function restoreKeys(part,snapshot){if(snapshot.has)part.keys=clone(snapshot.value);else delete part.keys;}
function sameKeys(a,b){return a.has===b.has&&JSON.stringify(a.value)===JSON.stringify(b.value);}

// Preview a keyframe without changing the original key objects. Geometry,
// pivots, parent links and child keys are never part of this transaction.
function keyframeEdit(part,time){
 var before=keySnapshot(part),original=part.keys,initial=Engine.state(part,time);
 var list=clone(Array.isArray(original)?original:[]),key=list.find(function(k){return Math.abs(finite(k.t,0)-time)<.0001;}),closed=false;
 if(!key){key=Object.assign({t:time},initial);list.push(key);}
 part.keys=list;
 return {
  initial:Object.assign({},initial),
  update:function(changes){if(closed)return;['x','y','r','sx','sy','opacity'].forEach(function(name){
   if(Object.prototype.hasOwnProperty.call(changes,name)&&Number.isFinite(Number(changes[name])))key[name]=Number(changes[name]);
  });},
  commit:function(){if(closed)return null;closed=true;list.sort(function(a,b){return a.t-b.t;});return {before:before,after:keySnapshot(part)};},
  cancel:function(){if(closed)return;closed=true;if(before.has)part.keys=original;else delete part.keys;}
 };
}
function element(doc,tag,attrs,parent,svg){var node=svg?doc.createElementNS(SVG,tag):doc.createElement(tag);Object.keys(attrs||{}).forEach(function(name){node.setAttribute(name,attrs[name]);});if(parent)parent.appendChild(node);return node;}
function screenPoint(svg,matrix,x,y){var point=svg.createSVGPoint();point.x=x;point.y=y;return point.matrixTransform(matrix);}
function angleDelta(current,start){var value=current-start;while(value>180)value-=360;while(value< -180)value+=360;return value;}

function create(studio){
 var doc=studio.document,stage=studio.stage,view=studio.view,svg=view&&view.svg;
 if(!stage||!svg||!studio.data)return null;
 var da=Ui.language(studio.wiki)==='da',L=da?{
  figure:'Figur',parts:'Dele og led',move:'Flyt',rotate:'Drej',scale:'Størrelse',choose:'Klik på en figur i scenen',part:'Del / led',mount:'Monteret på',root:'Figurens rod',undo:'↶ Fortryd',redo:'↷ Gentag',
  help:'Klik på en figur for at markere den. Vælg Dele og led for at flytte eller dreje en kropsdel omkring dens montering. Træk det runde håndtag for at dreje. Ændringer sættes ved tidsmarkøren.',
  buildHelp:'Klik på en del for at markere den. Træk for at flytte; det runde håndtag drejer om delens montering. Børnene følger med.',
  partHint:'Vælg en kropsdel på figuren eller i listen. Det markerede punkt er delens drejepunkt.',selection:'Valgt figur eller del'
 }:{
  figure:'Figure',parts:'Parts and joints',move:'Move',rotate:'Rotate',scale:'Size',choose:'Click a figure on the stage',part:'Part / joint',mount:'Attached to',root:'Figure root',undo:'↶ Undo',redo:'↷ Redo',
  help:'Click a figure to select it. Choose Parts and joints to move or rotate a body part around its attachment. Drag the round handle to rotate. Changes are keyed at the playhead.',
  buildHelp:'Click a part to select it. Drag to move; the round handle rotates it around its attachment. Its children follow.',
  partHint:'Choose a body part on the figure or in the list. The marked point is its pivot.',selection:'Selected figure or part'
 };
 var selected=partOf(studio.data,studio.selected);
 if(studio.directSelectedId!==studio.selected){studio.directSelectionMode=studio.mode==='puppet'||selected&&selected.parent?'part':'figure';studio.directSelectedId=studio.selected;}
 var scope=studio.directSelectionMode||(studio.mode==='puppet'?'part':'figure'),drag=null,disposed=false,optionsRoot=null,optionsParts=null;
 var history=studio._directHistory;
 if(!history||history.scene!==studio.data)history=studio._directHistory={scene:studio.data,undo:[],redo:[]};
 var bar=element(doc,'div',{'class':'co-direct-toolbar','aria-label':L.selection});
 stage.parentNode.insertBefore(bar,stage);
 var label=element(doc,'strong',{'class':'co-direct-selection','aria-live':'polite'},bar);
 var scopeButtons={},toolButtons={};
 function button(text,attrs,fn){var b=element(doc,'button',Object.assign({type:'button'},attrs),bar);b.textContent=text;b.onclick=fn;return b;}
 ['figure','part'].forEach(function(value){scopeButtons[value]=button(value==='figure'?L.figure:L.parts,{'data-direct-scope':value},function(){setScope(value);});});
 var pickerLabel=element(doc,'label',{'class':'co-direct-part-field'},bar);
 var pickerText=element(doc,'span',{},pickerLabel);pickerText.textContent=L.part;
 var picker=element(doc,'select',{'class':'co-direct-part-select','aria-label':L.part},pickerLabel);
 picker.onchange=function(){select(picker.value,'part',true);};
 ['move','rotate','scale'].forEach(function(value){toolButtons[value]=button(L[value],{'data-direct-tool':value},function(){setTool(value);});});
 var undoButton=button(L.undo,{'class':'co-direct-undo'},function(){undo();});
 var redoButton=button(L.redo,{'class':'co-direct-redo'},function(){redo();});
 var mounting=element(doc,'span',{'class':'co-direct-mount'},bar);
 var hint=element(doc,'p',{'class':'co-direct-hint'},bar);
 hint.textContent=studio.mode==='puppet'?L.buildHelp:L.help;
 var overlay=element(doc,'g',{'class':'co-direct-overlay','aria-hidden':'true','pointer-events':'none'},svg,true);
 var figureBox=element(doc,'polygon',{'class':'co-direct-figure-box','fill':'none','stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke'},overlay,true);
 var partBox=element(doc,'polygon',{'class':'co-direct-part-box','fill':'none','stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke'},overlay,true);
 var joints=element(doc,'g',{'class':'co-direct-joints'},overlay,true);
 var guide=element(doc,'line',{'class':'co-direct-rotation-guide','vector-effect':'non-scaling-stroke'},overlay,true);
 var pivot=element(doc,'circle',{'class':'co-direct-pivot','vector-effect':'non-scaling-stroke'},overlay,true);
 var pivotCenter=element(doc,'circle',{'class':'co-direct-pivot-center'},overlay,true);
 var rotateHit=element(doc,'circle',{'class':'co-direct-rotate-hit','data-direct-action':'rotate','fill':'transparent','pointer-events':'all'},overlay,true);
 var rotateMark=element(doc,'circle',{'class':'co-direct-rotate','pointer-events':'none','vector-effect':'non-scaling-stroke'},overlay,true);
 var corners=[];
 for(var i=0;i<4;i++)corners.push({hit:element(doc,'circle',{'class':'co-direct-scale-hit','data-direct-action':'scale','fill':'transparent','pointer-events':'all'},overlay,true),mark:element(doc,'rect',{'class':'co-direct-scale','pointer-events':'none','vector-effect':'non-scaling-stroke'},overlay,true)});
 var old={down:stage.onpointerdown,move:stage.onpointermove,up:stage.onpointerup,cancel:stage.onpointercancel,click:stage.onclick};
 stage.setAttribute('data-direct-edit','yes');
 function parts(){return studio.data.parts||[];}
 function currentTool(){return studio.objectTool||(typeof studio.transformTool==='function'?studio.transformTool():'move');}
 function repaint(){if(typeof studio.paint==='function')studio.paint();sync();}
 function redraw(){if(typeof studio.ui==='function')studio.ui();else repaint();}
 function select(id,nextScope,full){
  var part=partOf(studio.data,id);if(!part)return false;
  studio.directLastPart=id;scope=nextScope==='part'?'part':'figure';
  studio.directSelectionMode=scope;
  studio.selected=scope==='figure'?rootPart(studio.data,id).id:id;
  studio.directSelectedId=studio.selected;
  repaint();if(full)redraw();return true;
 }
 function setScope(value){
  scope=value==='part'?'part':'figure';studio.directSelectionMode=scope;
  var part=partOf(studio.data,studio.selected),root=part&&rootPart(studio.data,part.id),last=partOf(studio.data,studio.directLastPart);
  var id=scope==='part'&&last&&root&&rootPart(studio.data,last.id).id===root.id?last.id:part&&part.id;
  if(scope==='part'&&id&&partOf(studio.data,id).parent)studio.objectTool='rotate';
  else if(scope==='figure')studio.objectTool='move';
  if(id)select(id,scope,true);else{sync();redraw();}
 }
 function setTool(value){if(['move','rotate','scale'].indexOf(value)<0)return;studio.objectTool=value;sync();redraw();}
 function localToStage(node,x,y){
  var matrix=node&&node.getScreenCTM&&node.getScreenCTM(),rootMatrix=svg.getScreenCTM&&svg.getScreenCTM();
  if(!matrix||!rootMatrix)return null;
  try{var screen=screenPoint(svg,matrix,x,y);return screenPoint(svg,rootMatrix.inverse(),screen.x,screen.y);}catch(error){return null;}
 }
 function bounds(node){
  try{var box=node.getBBox();if(!Number.isFinite(box.width)||!Number.isFinite(box.height))return null;
   // A straight SVG arm may have a zero-width or zero-height geometric box.
   // Enlarge only the editing frame, never the source shape.
   box={x:box.x-Math.max(0,8-box.width)/2,y:box.y-Math.max(0,8-box.height)/2,width:Math.max(8,box.width),height:Math.max(8,box.height)};
   var points=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(function(p){return localToStage(node,p[0],p[1]);});
   return points.every(function(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y);})?points:null;
  }catch(error){return null;}
 }
 function pointAttrs(node,point,radius){node.setAttribute('cx',point.x);node.setAttribute('cy',point.y);if(radius!==undefined)node.setAttribute('r',radius);}
 function setPolygon(node,points){node.setAttribute('points',points.map(function(p){return p.x+','+p.y;}).join(' '));}
 function sync(){
  if(disposed)return;
  var p=partOf(studio.data,studio.selected),root=p&&rootPart(studio.data,p.id),node=p&&view.nodes[p.id],rootNode=root&&view.nodes[root.id];
  var text=p?(root&&root!==p?(root.name||root.id)+' · ':'')+(p.name||p.id):L.choose;
  if(label.textContent!==text)label.textContent=text;
  Object.keys(scopeButtons).forEach(function(value){scopeButtons[value].setAttribute('aria-pressed',String(scope===value));});
  Object.keys(toolButtons).forEach(function(value){toolButtons[value].disabled=!p;toolButtons[value].setAttribute('aria-pressed',String(currentTool()===value));});
  undoButton.disabled=!history.undo.length;redoButton.disabled=!history.redo.length;
  pickerLabel.hidden=scope!=='part'||!root;
  if(root&&(optionsRoot!==root.id||optionsParts!==studio.data.parts)){
   optionsRoot=root.id;optionsParts=studio.data.parts;picker.textContent='';
   parts().filter(function(part){return rootPart(studio.data,part.id).id===root.id;}).forEach(function(part){
    var option=element(doc,'option',{value:part.id},picker),depth=0,cursor=part,seen=Object.create(null);
    while(cursor&&cursor.parent&&!seen[cursor.id]&&depth<12){seen[cursor.id]=true;depth++;cursor=partOf(studio.data,cursor.parent);}
    option.textContent=Array(depth+1).join('· ')+(part.name||part.id);
   });
  }
  if(p)picker.value=p.id;
  var parent=p&&partOf(studio.data,p.parent);
  mounting.textContent=p?(parent?L.mount+': '+(parent.name||parent.id):L.root):'';
  stage.setAttribute('data-direct-selection',p?p.id:'');stage.setAttribute('data-direct-scope',scope);
  var hidden=!p||!node||!rootNode||studio.mode==='theatre'&&studio.cameraPreview||studio.clock&&studio.clock.playing;
  overlay.setAttribute('display',hidden?'none':'inline');if(hidden)return;
  var outer=bounds(rootNode.el),active=bounds(p.type==='group'?node.el:node.shape||node.el);
  if(!outer||!active){overlay.setAttribute('display','none');return;}
  setPolygon(figureBox,outer);setPolygon(partBox,active);
  figureBox.setAttribute('data-part-id',root.id);partBox.setAttribute('data-part-id',p.id);
  figureBox.setAttribute('opacity',scope==='part'&&p!==root?'.55':'1');
  partBox.setAttribute('display',scope==='part'&&p!==root?'inline':'none');
  var matrix=svg.getScreenCTM(),unit=matrix?1/Math.max(.001,Math.hypot(matrix.a,matrix.b)):1;
  var pv=p.pivot||{},anchor=localToStage(node.el,finite(pv.x,0),finite(pv.y,0));
  if(!anchor){overlay.setAttribute('display','none');return;}
  pointAttrs(pivot,anchor,6*unit);pointAttrs(pivotCenter,anchor,2*unit);
  pivot.setAttribute('data-part-id',p.id);
  var top={x:(active[0].x+active[1].x)/2,y:(active[0].y+active[1].y)/2};
  var middle={x:(active[0].x+active[2].x)/2,y:(active[0].y+active[2].y)/2};
  var dx=top.x-middle.x,dy=top.y-middle.y,length=Math.hypot(dx,dy);
  if(length<.001){dx=0;dy=-1;length=1;}
  var handle={x:top.x+dx/length*32*unit,y:top.y+dy/length*32*unit};
  guide.setAttribute('x1',anchor.x);guide.setAttribute('y1',anchor.y);guide.setAttribute('x2',handle.x);guide.setAttribute('y2',handle.y);
  pointAttrs(rotateHit,handle,22*unit);pointAttrs(rotateMark,handle,9*unit);rotateHit.setAttribute('data-direct-part',p.id);
  corners.forEach(function(c,index){var at=active[index];pointAttrs(c.hit,at,16*unit);c.hit.setAttribute('data-direct-part',p.id);c.mark.setAttribute('x',at.x-4*unit);c.mark.setAttribute('y',at.y-4*unit);c.mark.setAttribute('width',8*unit);c.mark.setAttribute('height',8*unit);});
  joints.textContent='';
  if(scope==='part')parts().forEach(function(part){
   if(part.id===p.id||!part.parent||rootPart(studio.data,part.id).id!==root.id)return;
   var n=view.nodes[part.id],v=part.pivot||{},at=n&&localToStage(n.el,finite(v.x,0),finite(v.y,0));if(!at)return;
   var hit=element(doc,'circle',{'class':'co-direct-joint-hit','data-direct-action':'select','data-direct-part':part.id,'fill':'transparent','pointer-events':'all'},joints,true);
   pointAttrs(hit,at,12*unit);
   var dot=element(doc,'circle',{'class':'co-direct-joint','vector-effect':'non-scaling-stroke'},joints,true);pointAttrs(dot,at,3.5*unit);
  });
 }
 function targetPart(target){
  var node=target;
  while(node&&node!==stage){var id=node.getAttribute&&node.getAttribute('data-cutout-id');if(id&&view.nodes[id]&&view.nodes[id].el===node)return id;node=node.parentNode;}
  return '';
 }
 function directHandle(target){var node=target;while(node&&node!==stage){if(node.getAttribute&&node.hasAttribute('data-direct-action'))return node;node=node.parentNode;}return null;}
 function delegate(name,event){if(typeof old[name]==='function')return old[name].call(stage,event);}
 function pointerDown(event){
  if(disposed)return;if(drag)return;
  if(studio.mode==='theatre'&&studio.cameraPreview||studio.panMode||studio.spacePan||event.altKey||event.button===1)return delegate('down',event);
  if(event.button!==undefined&&event.button!==0)return;
  var handle=directHandle(event.target),hit=handle?handle.getAttribute('data-direct-part'):targetPart(event.target);
  if(!hit)return delegate('down',event);
  if(typeof studio.stop==='function')studio.stop();
  if(studio.host&&studio.host.focus)studio.host.focus({preventScroll:true});
  var action=handle&&handle.getAttribute('data-direct-action');
  if(!select(hit,action==='select'?'part':scope,false))return;
  var p=partOf(studio.data,studio.selected),node=p&&view.nodes[p.id],parent=node&&node.el.parentNode;
  var matrix=parent&&parent.getScreenCTM&&parent.getScreenCTM();if(!matrix)return;
  var inverse;try{inverse=matrix.inverse();}catch(error){return;}
  var start=screenPoint(svg,inverse,event.clientX,event.clientY),state=Engine.state(p,studio.mode==='puppet'?0:studio.time);
  var anchor={x:state.x,y:state.y};action=action||currentTool();
  drag={id:p.id,part:p,action:action,time:studio.mode==='puppet'?0:studio.time,inverse:inverse,start:start,screen:{x:event.clientX,y:event.clientY},state:state,anchor:anchor,
   angle:Math.atan2(start.y-anchor.y,start.x-anchor.x)*180/Math.PI,radius:Math.max(.001,Math.hypot(start.x-anchor.x,start.y-anchor.y)),pointerId:event.pointerId,edit:null};
  try{if(stage.setPointerCapture)stage.setPointerCapture(event.pointerId);}catch(error){}
  event.preventDefault();
 }
 function pointerMove(event){
  if(!drag)return delegate('move',event);
  if(event.pointerId!==undefined&&drag.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;
  if(drag.action==='select'||drag.action==='layer')return;
  if(!drag.edit&&Math.hypot(event.clientX-drag.screen.x,event.clientY-drag.screen.y)<3)return;
  var at=screenPoint(svg,drag.inverse,event.clientX,event.clientY),base=drag.state,changes={};
  if(drag.action==='rotate'){
   if(drag.radius<.001||Math.hypot(at.x-drag.anchor.x,at.y-drag.anchor.y)<.001)return;
   changes.r=base.r+angleDelta(Math.atan2(at.y-drag.anchor.y,at.x-drag.anchor.x)*180/Math.PI,drag.angle);
  }else if(drag.action==='scale'){
   var ratio=Math.min(20,Math.max(.05,Math.hypot(at.x-drag.anchor.x,at.y-drag.anchor.y)/drag.radius));changes.sx=base.sx*ratio;changes.sy=base.sy*ratio;
  }else{changes.x=base.x+at.x-drag.start.x;changes.y=base.y+at.y-drag.start.y;}
  if(!drag.edit)drag.edit=keyframeEdit(drag.part,drag.time);
  drag.edit.update(changes);repaint();event.preventDefault();
 }
 function finish(commit,refresh){
  if(!drag)return false;var current=drag;drag=null;
  if(current.edit){
   if(commit){var change=current.edit.commit();if(change&&!sameKeys(change.before,change.after)){change.id=current.id;history.undo.push(change);if(history.undo.length>50)history.undo.shift();history.redo=[];if(typeof studio.mark==='function')studio.mark();}}
   else current.edit.cancel();
  }
  try{if(stage.releasePointerCapture)stage.releasePointerCapture(current.pointerId);}catch(error){}
  repaint();if(refresh)redraw();return true;
 }
 function pointerUp(event){if(!drag)return delegate('up',event);if(event.pointerId!==undefined&&drag.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;event.preventDefault();finish(true,true);}
 function pointerCancel(event){if(!drag)return delegate('cancel',event);finish(false,true);}
 function click(event){if(targetPart(event.target)||directHandle(event.target)){event.preventDefault();return;}return delegate('click',event);}
 function undoRedo(backward){
  if(drag)finish(false,false);
  var from=backward?history.undo:history.redo,to=backward?history.redo:history.undo,record=from[from.length-1];if(!record)return false;
  var part=partOf(studio.data,record.id),expected=backward?record.after:record.before;
  if(!part||!sameKeys(keySnapshot(part),expected)){history.undo=[];history.redo=[];sync();return false;}
  restoreKeys(part,backward?record.before:record.after);from.pop();to.push(record);
  studio.selected=record.id;studio.directSelectedId=record.id;if(typeof studio.mark==='function')studio.mark();repaint();redraw();return true;
 }
 function undo(){return undoRedo(true);}function redo(){return undoRedo(false);}
 function keyboard(event){
  if(/INPUT|SELECT|TEXTAREA/.test(event.target&&event.target.tagName||'')||event.target&&event.target.isContentEditable)return;
  if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(false,true);}
  else if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='z'){if(event.shiftKey?redo():undo()){event.preventDefault();event.stopPropagation();}}
 }
 function lostCapture(){if(drag)finish(false,true);}
 stage.onpointerdown=pointerDown;stage.onpointermove=pointerMove;stage.onpointerup=pointerUp;stage.onpointercancel=pointerCancel;stage.onclick=click;
 stage.addEventListener('lostpointercapture',lostCapture);
 if(studio.host)studio.host.addEventListener('keydown',keyboard,true);
 function dispose(){
  if(disposed)return;disposed=true;if(drag)finish(false,false);
  if(stage.onpointerdown===pointerDown)stage.onpointerdown=old.down;
  if(stage.onpointermove===pointerMove)stage.onpointermove=old.move;
  if(stage.onpointerup===pointerUp)stage.onpointerup=old.up;
  if(stage.onpointercancel===pointerCancel)stage.onpointercancel=old.cancel;
  if(stage.onclick===click)stage.onclick=old.click;
  stage.removeEventListener('lostpointercapture',lostCapture);
  if(studio.host)studio.host.removeEventListener('keydown',keyboard,true);
  stage.removeAttribute('data-direct-edit');stage.removeAttribute('data-direct-selection');stage.removeAttribute('data-direct-scope');
  if(bar.parentNode)bar.parentNode.removeChild(bar);if(overlay.parentNode)overlay.parentNode.removeChild(overlay);
 }
 sync();
 return {view:view,sync:sync,select:function(id,mode){return select(id,mode||scope,true);},setScope:setScope,setTool:setTool,undo:undo,redo:redo,cancel:function(){return finish(false,true);},dispose:dispose};
}

function install(Studio){
 if(Studio.prototype._directEditInstalled)return;Studio.prototype._directEditInstalled=true;
 var ui=Studio.prototype.ui,paintViewport=Studio.prototype.paintViewport,remove=Studio.prototype.removeChildDomNodes;
 Studio.prototype.ui=function(){if(this._directEdit){var previous=this._directEdit;this._directEdit=null;previous.dispose();}ui.apply(this,arguments);if(this.data&&this.stage&&this.view)this._directEdit=create(this);};
 Studio.prototype.paintViewport=function(){
  paintViewport.apply(this,arguments);
  if(this._directEdit&&this._directEdit.view!==this.view){var previous=this._directEdit;this._directEdit=null;previous.dispose();this._directEdit=create(this);}
  if(this._directEdit)this._directEdit.sync();
 };
 Studio.prototype.removeChildDomNodes=function(){if(this._directEdit){var previous=this._directEdit;this._directEdit=null;previous.dispose();}return remove.apply(this,arguments);};
}
exports.install=install;exports.create=create;exports.rootPart=rootPart;exports.keyframeEdit=keyframeEdit;
})();
