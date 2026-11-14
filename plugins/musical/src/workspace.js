/*\
title: $:/plugins/huwiki/musical/workspace.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
function el(doc,tag,cls,text,parent){
 var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;
 if(parent)parent.appendChild(e);return e;
}
function label(wiki){
 return /\/en(?:-|$)/i.test(wiki.getTiddlerText("$:/language",""))?{
  title:"Musical Studio",focus:"Focus workspace",exit:"Exit focus",fit:"Split",scene:"Stage",score:"Score",
  properties:"Properties",close:"Close properties",all:"All tracks",music:"Music",camera:"Cameras",animation:"Animation",sceneTracks:"Stage & light",
  addKey:"Add keyframe",delKey:"Delete keyframe",zoomIn:"Zoom in",zoomOut:"Zoom out",
  sceneHint:"Click a stage element to edit it",timeline:"Timeline",preview:"Preview"
 }:{
  title:"Musical Studio",focus:"Fokusvisning",exit:"Forlad fokus",fit:"Delt visning",scene:"Scene",score:"Noder",
  properties:"Egenskaber",close:"Luk egenskaber",all:"Alle spor",music:"Musik",camera:"Kameraer",animation:"Animation",sceneTracks:"Scene & lys",
  addKey:"Nyt nøglebillede",delKey:"Slet nøglebillede",zoomIn:"Zoom ind",zoomOut:"Zoom ud",
  sceneHint:"Klik på et element på scenen for at redigere det",timeline:"Tidslinje",preview:"Forhåndsvisning"
 };
}
function mount(o){
 var doc=o.doc,host=o.host,L=label(o.wiki),editor=o.editor,root=host.querySelector(".huw-musical-editor");
 if(!root)return {dispose:function(){}};
 host.classList.add("huw-musical--workspace");
 host.tabIndex=0;
 var appbar=el(doc,"header","huw-musical-appbar");
 host.insertBefore(appbar,o.layout);
 var branding=el(doc,"div","huw-musical-brand",undefined,appbar);
 el(doc,"strong","",L.title,branding);
 el(doc,"span","huw-musical-project",o.project,branding);
 var actions=el(doc,"div","huw-musical-app-actions",undefined,appbar);
 function button(parent,cls,title,action){
  var b=el(doc,"button",cls,title,parent);b.type="button";b.title=title;b.addEventListener("click",action);return b;
 }
 var inspectorOpen=false,mode="split",focus=false;
 function toggleFocus(){
  focus=!focus;host.classList.toggle("huw-musical--focus",focus);
  focusButton.textContent=focus?L.exit:L.focus;focusButton.setAttribute("aria-pressed",String(focus));
  host.focus({preventScroll:true});
 }
 var focusButton=button(actions,"huw-musical-focus-button",L.focus,toggleFocus);
 focusButton.setAttribute("aria-pressed","false");
 var viewButton=el(doc,"select","huw-musical-view-mode",undefined,actions);
 viewButton.setAttribute("aria-label",L.preview);
 [["split",L.fit],["stage",L.scene],["score",L.score]].forEach(function(v){
  var op=el(doc,"option","",v[1],viewButton);op.value=v[0];
 });
 viewButton.value="split";
 viewButton.onchange=function(){
  mode=viewButton.value;host.dataset.previewMode=mode;
 };
 var inspectorButton=button(actions,"huw-musical-inspector-button",L.properties,function(){setInspector(!inspectorOpen);});
 inspectorButton.setAttribute("aria-pressed","false");
 // Keep existing native CutOut/ABC links available without giving them an
 // entire row between the viewer and editing timeline.
 var links=host.querySelector(".huw-musical-links");
 if(links){actions.appendChild(links);}
 // Remove the old full-size camera-shot toolbar entirely. Each shot is now
 // edited as a keyframe on Camera A/B and Cuts tracks.
 var shots=host.querySelector(".huw-musical-shots");if(shots)shots.remove();
 var status=host.querySelector(".huw-musical-status");
 if(status){status.classList.add("huw-musical-inline-status");o.transport.appendChild(status);}
 // The editor is no longer a growing article below the controls.
 var workbench=el(doc,"div","huw-musical-workbench");
 host.appendChild(workbench);
 var timelinePane=el(doc,"section","huw-musical-timeline-pane",undefined,workbench);
 var toolbar=el(doc,"div","huw-musical-timeline-toolbar",undefined,timelinePane);
 el(doc,"strong","huw-musical-timeline-title",L.timeline,toolbar);
 var filters=el(doc,"div","huw-musical-track-filters",undefined,toolbar);
 var filterButtons={};
 [["all",L.all],["music",L.music],["camera",L.camera],["animation",L.animation],["scene",L.sceneTracks]].forEach(function(a){
  filterButtons[a[0]]=button(filters,"huw-musical-filter",a[1],function(){
   Object.keys(filterButtons).forEach(function(k){filterButtons[k].classList.toggle("is-active",k===a[0]);});
   editor.setFilter(a[0]);
  });
 });
 filterButtons.all.classList.add("is-active");
 var controls=el(doc,"div","huw-musical-edit-controls",undefined,toolbar);
 var addKeyButton=button(controls,"huw-musical-add-key","＋ "+L.addKey,function(){editor.addKeyframe();setInspector(true);});
 var deleteKeyButton=button(controls,"huw-musical-delete-key","⌫ "+L.delKey,function(){editor.removeKeyframe();});
 function updateEditButtons(){
  var selected=editor.getSelection(),editable=selected&&selected.kind!=="song";
  addKeyButton.disabled=deleteKeyButton.disabled=!editable;
  addKeyButton.title=editable?L.addKey:L.sceneHint;
  deleteKeyButton.title=editable?L.delKey:L.sceneHint;
 }
 updateEditButtons();
 var zoomOut=button(controls,"huw-musical-zoom-out","−",function(){editor.setZoom(editor.getZoom()/1.35);});
 zoomOut.setAttribute("aria-label",L.zoomOut);zoomOut.title=L.zoomOut;
 var zoomIn=button(controls,"huw-musical-zoom-in","＋",function(){editor.setZoom(editor.getZoom()*1.35);});
 zoomIn.setAttribute("aria-label",L.zoomIn);zoomIn.title=L.zoomIn;
 timelinePane.appendChild(root);
 var drawer=el(doc,"aside","huw-musical-inspector-drawer",undefined,workbench);
 var inspectorHead=el(doc,"div","huw-musical-inspector-heading",undefined,drawer);
 el(doc,"strong","",L.properties,inspectorHead);
 button(inspectorHead,"huw-musical-inspector-close","×",function(){setInspector(false);}).setAttribute("aria-label",L.close);
 var inspector=root.querySelector(".huw-musical-inspector");
 if(inspector)drawer.appendChild(inspector);
 var editorStatus=root.querySelector(".huw-musical-edited-status");
 if(editorStatus)drawer.appendChild(editorStatus);
 var oldHeader=root.querySelector(".huw-musical-editor-header"),oldHelp=root.querySelector("p");
 if(oldHeader)oldHeader.classList.add("huw-musical-legacy-heading");
 if(oldHelp)oldHelp.classList.add("huw-musical-legacy-help");
 function setInspector(value){
  inspectorOpen=!!value;
  host.classList.toggle("huw-musical--inspector-open",inspectorOpen);
  inspectorButton.setAttribute("aria-pressed",String(inspectorOpen));
 }
 function selection(){
  updateEditButtons();setInspector(true);
 }
 // Adjustable divider keeps the preview and timeline visible together.
 var grip=el(doc,"div","huw-musical-layout-resize");
 grip.setAttribute("role","separator");grip.setAttribute("aria-orientation","horizontal");
 grip.setAttribute("tabindex","0");grip.setAttribute("aria-label",L.preview);
 host.insertBefore(grip,o.transport);
 function movePreview(y){
  var r=host.getBoundingClientRect(),barHeight=appbar.getBoundingClientRect().height;
  var max=Math.max(145,Math.min(520,r.height-barHeight-240));
  var value=Math.max(145,Math.min(max,y-r.top-barHeight));
  host.style.setProperty("--musical-preview-height",Math.round(value)+"px");
 }
 grip.onpointerdown=function(event){
  if(event.button!==0)return;
  event.preventDefault();grip.setPointerCapture(event.pointerId);
  function move(e){movePreview(e.clientY);}
  function stop(){grip.removeEventListener("pointermove",move);grip.removeEventListener("pointerup",stop);grip.removeEventListener("pointercancel",stop);}
  grip.addEventListener("pointermove",move);
  grip.addEventListener("pointerup",stop);
  grip.addEventListener("pointercancel",stop);
 };
 grip.onkeydown=function(e){
  if(e.key==="ArrowUp"||e.key==="ArrowDown"){
   e.preventDefault();var old=parseInt(host.style.getPropertyValue("--musical-preview-height"),10)||255;
   host.style.setProperty("--musical-preview-height",Math.max(145,Math.min(520,old+(e.key==="ArrowDown"?20:-20)))+"px");
  }
 };
 function editingField(target){
  return target&&(target.closest&&target.closest("input,select,textarea,[contenteditable=true]"));
 }
 function keyboard(e){
  if(e.altKey||e.ctrlKey||e.metaKey||editingField(e.target))return;
  if(e.key==="Escape"){
   if(focus){e.preventDefault();toggleFocus();}
   else if(inspectorOpen){e.preventDefault();setInspector(false);}
  }else if(e.code==="Space"&&e.target.tagName!=="BUTTON"){
   e.preventDefault();o.play.click();
  }else if(e.key==="ArrowRight"||e.key==="ArrowLeft"){
   e.preventDefault();o.seek(o.position()+(e.key==="ArrowRight"?1:-1)*(e.shiftKey?1:.1));
  }else if(e.key==="Delete"||e.key==="Backspace"){
   e.preventDefault();editor.removeKeyframe();
  }else if(e.key.toLowerCase()==="k"){
   e.preventDefault();editor.addKeyframe();setInspector(true);
  }
 }
 host.addEventListener("keydown",keyboard);
 // Click a CutOut part on the stage to select its original scene object.
 // Dragging uses parent-local SVG coordinates, preserving nested transforms.
 var svg=o.view.svg;
 function pointerDown(e){
  if(e.button!==0)return;
  var partEl=e.target.closest&&e.target.closest("[data-cutout-id]");
  if(!partEl||!svg.contains(partEl))return;
  var id=partEl.getAttribute("data-cutout-id"),target=editor.selectPart(id);
  if(!target)return;
  setInspector(true);
  var parent=partEl.parentNode;
  function coords(ev){
   var matrix=parent&&parent.getScreenCTM&&parent.getScreenCTM();
   if(!matrix)return {x:ev.clientX,y:ev.clientY};
   var point=svg.createSVGPoint();point.x=ev.clientX;point.y=ev.clientY;
   var local=point.matrixTransform(matrix.inverse());return {x:local.x,y:local.y};
  }
  var start=coords(e),drag=null,finished=false;
  partEl.classList.add("huw-musical-selected-element");
  if(partEl.setPointerCapture)partEl.setPointerCapture(e.pointerId);
  function move(ev){
   var at=coords(ev),dx=at.x-start.x,dy=at.y-start.y;
   if(!drag&&Math.hypot(dx,dy)<3)return;
   if(!drag){o.pause();drag=editor.beginPartMove(id,o.position());}
   if(drag)drag.update(dx,dy);
  }
  function finish(commit){
   if(finished)return;finished=true;
   partEl.removeEventListener("pointermove",move);
   partEl.removeEventListener("pointerup",up);
   partEl.removeEventListener("pointercancel",cancel);
   if(drag){if(commit)drag.commit();else drag.cancel();}
  }
  function up(){finish(true);}function cancel(){finish(false);}
  partEl.addEventListener("pointermove",move);
  partEl.addEventListener("pointerup",up);
  partEl.addEventListener("pointercancel",cancel);
 }
 svg.addEventListener("pointerdown",pointerDown);
 return {showInspector:selection,setInspector:setInspector,dispose:function(){
  host.removeEventListener("keydown",keyboard);
  svg.removeEventListener("pointerdown",pointerDown);
 }};
}
exports.mount=mount;
})();