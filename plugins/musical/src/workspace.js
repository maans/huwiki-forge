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
  sceneHint:"Click a stage element to edit it",timeline:"Timeline",preview:"Preview",
  zoomSelection:"Zoom to selection",resetPreviewZoom:"Reset zoom",zoomHint:"Enlarge the selected object or body part for editing (Z). The film camera stays unchanged.",
  fullscreen:"Full screen",exitFullscreen:"Exit full screen"
 }:{
  title:"Musical Studio",focus:"Fokusvisning",exit:"Forlad fokus",fit:"Delt visning",scene:"Scene",score:"Noder",
  properties:"Egenskaber",close:"Luk egenskaber",all:"Alle spor",music:"Musik",camera:"Kameraer",animation:"Animation",sceneTracks:"Scene & lys",
  addKey:"Nyt nøglebillede",delKey:"Slet nøglebillede",zoomIn:"Zoom ind",zoomOut:"Zoom ud",
  sceneHint:"Klik på et element på scenen for at redigere det",timeline:"Tidslinje",preview:"Forhåndsvisning",
  zoomSelection:"Zoom til markering",resetPreviewZoom:"Nulstil zoom",zoomHint:"Forstør det markerede objekt eller den markerede kropsdel under redigering (Z). Filmens kamera ændres ikke.",
  fullscreen:"Fuld skærm",exitFullscreen:"Forlad fuld skærm"
 };
}
function mount(o){
 var Puppet=require("$:/plugins/huwiki/musical/puppet.js");
 var Manuscript=require("$:/plugins/huwiki/musical/manuscript.js");
 var Narration=require("$:/plugins/huwiki/musical/narration.js");
 var ScoreWorkshop=require("$:/plugins/huwiki/musical/score-workshop.js");
 var SceneWorkshop=require("$:/plugins/huwiki/musical/scenes.js");
 var SelectionZoom=require("$:/plugins/huwiki/musical/selection-zoom.js");
 var FacePanel=require("$:/plugins/huwiki/musical/face-panel.js");
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
 var inspectorOpen=false,mode="split",focus=false,puppet=Puppet.mount(o),lastTap=null;
 var narration=Narration.mount(o),scoreWorkshop=ScoreWorkshop.mount(o),sceneWorkshop=SceneWorkshop.mount(o);
 var manuscript=Manuscript.mount(Object.assign({},o,{openNarration:function(details){narration.open(details);},openFace:o.openFace||openFace}));
 var transformMode='',figureRoot='',cameraName='A',latestPart='',cancelGesture=null;
 var previewZoom=SelectionZoom.create(o.view.svg,function(){return editor.isExporting&&editor.isExporting();}),zoomTarget='',selectingOnStage=false;
 var stagePanel=host.querySelector('.huw-musical-stage'),fullscreenFallback=false,fullscreenPending=false,exportSuspended=0,disposed=false;
 var facePanel=FacePanel.mount({doc:doc,wiki:o.wiki,host:host,film:o.film,parent:host,before:o.layout.nextSibling,stage:stagePanel,
  context:function(id){return editor.faceContext&&editor.faceContext(id);},
  choose:function(id,command){o.pause();return editor.chooseFace&&editor.chooseFace(id,command);},
  history:function(id){return editor.faceHistory?editor.faceHistory(id):[];},
  goToKey:function(id,time){if(editor.selectFaceKey)editor.selectFaceKey(id,time);else o.seek(time);},
  undo:function(){if(editor.undoFace)editor.undoFace();},canUndo:function(){return editor.canUndoFace&&editor.canUndoFace();},
  position:o.position,seek:o.seek,pause:o.pause,onScript:function(details){manuscript.open(details);},
  onClose:function(){host.focus({preventScroll:true});},onLayout:reframeAfterLayout
 });
 function toggleFocus(){
  focus=!focus;host.classList.toggle("huw-musical--focus",focus);
  focusButton.textContent=focus?L.exit:L.focus;focusButton.setAttribute("aria-pressed",String(focus));
  host.focus({preventScroll:true});
  reframeAfterLayout();
 }
 var focusButton=button(actions,"huw-musical-focus-button",L.focus,toggleFocus);
 focusButton.setAttribute("aria-pressed","false");
 var figureButton=button(actions,'huw-musical-transform-button huw-musical-figure-button',L.scene==='Scene'?'Figur':'Figure',function(){toggleFigure();});
 figureButton.title=L.scene==='Scene'?'Flyt, skalér, drej og skævvrid hele figuren, rekvisitten eller kulissen':'Move, scale, rotate and skew entire object';
 var partsButton=button(actions,'huw-musical-transform-button huw-musical-parts-button',L.scene==='Scene'?'Dele og led':'Parts and joints',function(){toggleParts();});
 partsButton.title=L.scene==='Scene'?'Klik på en kropsdel. Træk den omkring sit led, eller brug drejehåndtaget. Ændringen gemmes ved tidsmarkøren.':'Select a body part. Drag it around its joint or use the rotation handle. Changes are keyed at the playhead.';
 var cameraButton=button(actions,'huw-musical-transform-button',L.scene==='Scene'?'Kameraramme':'Camera frame',function(){toggleCamera();});
 cameraButton.title=L.scene==='Scene'?'Vis og redigér kameraets udsnit på scenen':'Edit camera viewport directly on the stage';
 var manuscriptButton=button(actions,"huw-musical-manuscript-button",L.scene==='Scene'?"Manuskript":"Script",function(){manuscript.open();});
 manuscriptButton.title=L.scene==='Scene'?"Manuskriptværksted: Replikker, undertekster, scenenoter":"Script workshop: dialogue, subtitles, scene notes";
 button(actions,'huw-musical-scenes-button',L.scene==='Scene'?'Scener':'Scenes',function(){sceneWorkshop.open();});
 button(actions,'huw-musical-draw-button',L.scene==='Scene'?'Tegn SVG':'Draw SVG',function(){sceneWorkshop.draw();});
 button(actions,'huw-musical-score-button',L.scene==='Scene'?'Musik':'Music',function(){scoreWorkshop.open(o.scoreTitle());});
 button(actions,'huw-musical-audio-button',L.scene==='Scene'?'Lydspor':'Audio tracks',function(){narration.open();});
 button(actions,'huw-musical-site-button',L.scene==='Scene'?'Sitevisning':'Site view',function(){
  o.pause();if(focus)toggleFocus();if($tw.rootWidget)$tw.rootWidget.dispatchEvent({type:'tm-huwiki-sitepublisher',param:o.sceneTitle});
 });
 function updateToolButtons(){figureButton.setAttribute('aria-pressed',String(transformMode==='figure'));partsButton.setAttribute('aria-pressed',String(transformMode==='parts'));cameraButton.setAttribute('aria-pressed',String(transformMode==='camera'));}
 var previousPreviewMode=null;
 function useStageMode(){if(previousPreviewMode===null)previousPreviewMode=viewButton.value;viewButton.value='stage';viewButton.onchange();}
 function restorePreviewMode(){if(previousPreviewMode!==null){if(viewButton.value==='stage'){viewButton.value=previousPreviewMode;viewButton.onchange();}previousPreviewMode=null;}}
 function stopTool(){if(cancelGesture)cancelGesture();transformMode='';o.editor.setCameraEdit(false);updateToolButtons();restorePreviewMode();refreshHandles();}
 function chooseStageObject(id,quiet){
  // A figure, prop, background or other scene object is always selected by
  // its own root, never by an arbitrary character from another scene.
  var scene=id&&o.editor.resolvePartScene&&o.editor.resolvePartScene(id);
  var root=id&&((scene&&Puppet.rootFor(id,scene,o.film))||id);
  if(!root)return false;
  figureRoot=root;transformMode='figure';
  o.editor.setCameraEdit(false);
  o.editor.selectFigure(root,!!quiet);
  // Selecting the root synchronously updates the timeline selection. Keep
  // the actual hit part after that callback so Parts and joints returns to
  // the clicked arm/face instead of silently editing the entire figure.
  latestPart=id;
  updateToolButtons();refreshHandles();
  return true;
 }
 function toggleFigure(){
  if(transformMode==='figure'){stopTool();return;}
  if(cancelGesture)cancelGesture();
  if(editor.inClipDetail&&editor.inClipDetail())editor.closeAnimation();
  var selected=o.editor.getSelection&&o.editor.getSelection();
  var candidate=latestPart||(selected&&selected.kind==='figure'&&selected.part)||'';
  transformMode='figure';figureRoot='';useStageMode();o.editor.setCameraEdit(false);
  if(candidate)chooseStageObject(candidate,true);
  updateToolButtons();refreshHandles();
  figureButton.title=L.scene==='Scene'?'Klik på en figur, rekvisit eller kulisse for at markere hele objektet':'Tap any figure, prop or scenery element to select the entire object';
 }
 function toggleParts(){
  if(cancelGesture)cancelGesture();
  if(transformMode==='parts'){if(editor.inClipDetail&&editor.inClipDetail())editor.closeAnimation();stopTool();return;}
  var selected=editor.getSelection&&editor.getSelection(),candidate=latestPart||(selected&&selected.part)||'';
  transformMode='parts';figureRoot='';useStageMode();o.pause();editor.setCameraEdit(false);
  if(candidate&&editor.selectPart(candidate,true)){figureRoot=candidate;latestPart=candidate;setInspector(true);}
  updateToolButtons();refreshHandles();
 }
 function toggleCamera(){if(transformMode==='camera'){stopTool();return;}
  facePanel.hide();
  if(o.editor.inClipDetail&&o.editor.inClipDetail())o.editor.closeAnimation();
  cameraName=o.editor.activeCamera(o.position());transformMode='camera';useStageMode();o.pause();o.editor.selectCamera(cameraName);o.editor.setCameraEdit(true);
  var chooser=o.host.querySelector('.huw-musical-view-mode');if(chooser&&chooser.value==='score'){chooser.value='stage';chooser.onchange();}
  setInspector(true);updateToolButtons();refreshHandles();
 }
 updateToolButtons();

 var viewButton=el(doc,"select","huw-musical-view-mode",undefined,actions);
 viewButton.setAttribute("aria-label",L.preview);
 [["split",L.fit],["stage",L.scene],["score",L.score]].forEach(function(v){
  var op=el(doc,"option","",v[1],viewButton);op.value=v[0];
 });
 viewButton.value="split";
 viewButton.onchange=function(){
  mode=viewButton.value;host.dataset.previewMode=mode;
  reframeAfterLayout();
 };
 var previewTools=el(doc,'div','huw-musical-preview-tools',undefined,stagePanel||actions);
 if(stagePanel){var stageHeading=stagePanel.querySelector('.huw-musical-subtitle');stagePanel.insertBefore(previewTools,stagePanel.firstChild);if(stageHeading)previewTools.appendChild(stageHeading);}
 var zoomSelectionButton=button(previewTools,'huw-musical-zoom-selection',L.zoomSelection,function(){zoomToSelection();});
 zoomSelectionButton.title=L.zoomHint;zoomSelectionButton.setAttribute('aria-label',L.zoomSelection);zoomSelectionButton.setAttribute('aria-pressed','false');zoomSelectionButton.disabled=true;
 var resetPreviewButton=button(previewTools,'huw-musical-reset-preview-zoom',L.resetPreviewZoom,function(){resetPreviewZoom();});
 resetPreviewButton.title=L.resetPreviewZoom+' (0 / Esc)';resetPreviewButton.disabled=true;
 var stageFullscreenButton=button(previewTools,'huw-musical-stage-fullscreen',L.fullscreen,toggleStageFullscreen);
 stageFullscreenButton.setAttribute('aria-pressed','false');
 function stageIsFullscreen(){return !!stagePanel&&(fullscreenFallback||doc.fullscreenElement===stagePanel);}
 function syncStageFullscreen(){
  if(!stagePanel||disposed)return;
  stagePanel.classList.toggle('huw-musical-stage--expanded',fullscreenFallback);
  var active=stageIsFullscreen();stageFullscreenButton.textContent=active?L.exitFullscreen:L.fullscreen;
  facePanel.relocate(active);
  stageFullscreenButton.title=stageFullscreenButton.textContent;stageFullscreenButton.setAttribute('aria-pressed',String(active));
  reframeAfterLayout();
 }
 function toggleStageFullscreen(){
  if(!stagePanel||fullscreenPending)return;
  if(stageIsFullscreen()){
   fullscreenFallback=false;
   if(doc.fullscreenElement===stagePanel&&doc.exitFullscreen){Promise.resolve(doc.exitFullscreen()).then(syncStageFullscreen,syncStageFullscreen);}else syncStageFullscreen();
   return;
  }
  if(stagePanel.requestFullscreen&&!doc.fullscreenElement){
   fullscreenPending=true;
   try{Promise.resolve(stagePanel.requestFullscreen()).then(function(){fullscreenPending=false;syncStageFullscreen();},function(){fullscreenPending=false;if(!disposed){fullscreenFallback=true;syncStageFullscreen();}});}
   catch(_denied){fullscreenPending=false;fullscreenFallback=true;syncStageFullscreen();}
  }else{fullscreenFallback=true;syncStageFullscreen();}
 }
 doc.addEventListener('fullscreenchange',syncStageFullscreen);
 function reframeAfterLayout(){
  function settled(){if(disposed)return;if(previewZoom.active()&&!cancelGesture)zoomToSelection(false);else refreshHandles();}
  if(doc.defaultView&&doc.defaultView.requestAnimationFrame)doc.defaultView.requestAnimationFrame(settled);else settled();
 }
 var inspectorButton=button(actions,"huw-musical-inspector-button",L.properties,function(){setInspector(!inspectorOpen);});
 inspectorButton.setAttribute("aria-pressed","false");
 // Keep existing native CutOut/ABC links available without giving them an
 // entire row between the viewer and editing timeline.
 var links=host.querySelector(".huw-musical-links");
 if(links){
  actions.appendChild(links);
  var shortcuts=links.querySelectorAll("a");
  if(shortcuts[0]){shortcuts[0].title=shortcuts[0].textContent;shortcuts[0].textContent="CutOut";}
  if(shortcuts[1]){shortcuts[1].title=shortcuts[1].textContent;shortcuts[1].textContent="ABC";}
 }
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
  var selected=editor.getSelection(),editable=selected&&['song','audio','audio-lane','scene-range','object-browser','captions','caption'].indexOf(selected.kind)<0;
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
 var inspectorHeading=el(doc,"strong","",L.properties,inspectorHead);
 inspectorHeading.setAttribute("aria-live","polite");
 button(inspectorHead,"huw-musical-inspector-close","×",function(){setInspector(false);}).setAttribute("aria-label",L.close);
 var inspector=root.querySelector(".huw-musical-inspector");
 if(inspector)drawer.appendChild(inspector);
 var editorStatus=root.querySelector(".huw-musical-edited-status");
 if(editorStatus)drawer.appendChild(editorStatus);
 var oldHeader=root.querySelector(".huw-musical-editor-header"),oldHelp=root.querySelector("p");
 if(oldHeader)oldHeader.classList.add("huw-musical-legacy-heading");
 if(oldHelp)oldHelp.classList.add("huw-musical-legacy-help");
 function updateInspectorHeading(){var t=editor.getSelection&&editor.getSelection();
  var kind=t&&t.kind,name=kind==='figure'?(L.scene==='Scene'?'Hele objekt':'Whole object'):
   kind==='animation'?(L.scene==='Scene'?'Animationsklip':'Animation clip'):
   kind==='song'?(L.scene==='Scene'?'Musikklip':'Music clip'):
   kind==='camera'?(L.scene==='Scene'?'Kamera':'Camera'):
   kind==='film-part'||kind==='part'?(L.scene==='Scene'?'Objekt':'Object'):L.properties;
  inspectorHeading.textContent=kind?L.properties+' · '+name:L.properties;
 }
 function setInspector(value){
  updateInspectorHeading();
  inspectorOpen=!!value;
  host.classList.toggle("huw-musical--inspector-open",inspectorOpen);
  inspectorButton.setAttribute("aria-pressed",String(inspectorOpen));
 }
 function selection(t){
  // The timeline and stage are two views of the *same* selected object.
  // Selecting a row title, its keyframe or its animation clip must display
  // the corresponding dashed frame without aiming at a tiny stage shape.
  t=t||editor.getSelection();
  updateEditButtons();
  if(t&&t.kind==='face'){
   figureRoot=t.part;latestPart=t.part;transformMode='parts';useStageMode();o.pause();editor.setCameraEdit(false);
   facePanel.select(t.part,undefined,true);updateToolButtons();setInspector(false);refreshHandles();return;
  }
  // A stage gesture opens the strip only after pointer-up. Changing layout
  // during pointer-down would move the SVG under a finger while dragging.
  if(!selectingOnStage){var faceId=t&&['part','film-part','motion'].indexOf(t.kind)>=0?t.part:null;if(faceId)facePanel.select(faceId);else facePanel.hide();}
  if(transformMode==='parts'||(editor.inClipDetail&&editor.inClipDetail()&&t&&t.kind==='motion')){
   if(t&&['part','film-part','motion'].indexOf(t.kind)>=0){figureRoot=t.part;latestPart=t.part;transformMode='parts';o.pause();editor.setCameraEdit(false);}
   if(t&&['part','film-part','motion','animation'].indexOf(t.kind)>=0){updateToolButtons();setInspector(true);refreshHandles();return;}
  }
  if(!(editor.inClipDetail&&editor.inClipDetail())){
   var id=t&&(t.kind==='animation'?t.target:(t.kind==='figure'||t.kind==='part'||t.kind==='film-part')?t.part:null);
   // Editing a whole object or camera should hold the synchronized show.
   if(id||(t&&t.kind==='camera'))o.pause();
   if(id){
    var scene=editor.resolvePartScene&&editor.resolvePartScene(id);
    var root=(scene&&Puppet.rootFor(id,scene,o.film))||id;
    // Keep the animation track selected in the inspector; the new whole-
    // object track is just used internally to record position/scale keys.
    if(editor.ensureFigureTrack)editor.ensureFigureTrack(root);
    figureRoot=root;latestPart=id;transformMode='figure';
    editor.setCameraEdit(false);
    // Preserve split mode and score unless it was score-only.
    if(viewButton.value==='score'){viewButton.value='split';viewButton.onchange();}
   }else if(t&&t.kind==='camera'){
    transformMode='camera';cameraName=t.id==='camera-B'?'B':'A';figureRoot='';
    if(viewButton.value==='score'){viewButton.value='split';viewButton.onchange();}
    editor.setCameraEdit(true);
   }else if(t&&t.kind!=='motion'&&t.kind!=='accent'){
    transformMode='';figureRoot='';editor.setCameraEdit(false);
   }
  }
  updateToolButtons();setInspector(true);refreshHandles();
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
  return target&&(target.closest&&target.closest("input,select,textarea,[contenteditable=true],.huw-musical-face-panel,.huw-face-workshop"));
 }
 function keyboard(e){
  if(narration.isOpen()||scoreWorkshop.isOpen())return;
  if(manuscript.isOpen()){if(e.key==="Escape"){e.preventDefault();manuscript.close();}return;}
  if(puppet.isOpen())return;
  if(e.altKey||e.ctrlKey||e.metaKey||editingField(e.target))return;
  if(e.key==="Escape"){
   if(cancelGesture){e.preventDefault();cancelGesture();return;}
   if(stageIsFullscreen()){e.preventDefault();toggleStageFullscreen();return;}
   if(previewZoom.active()){e.preventDefault();resetPreviewZoom();return;}
   if(editor.inClipDetail&&editor.inClipDetail()){e.preventDefault();editor.closeAnimation();return;}
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
  }else if(e.key.toLowerCase()==="z"){
   e.preventDefault();zoomToSelection();
  }else if(e.key==="0"){
   e.preventDefault();resetPreviewZoom();
  }
 }
 host.addEventListener("keydown",keyboard);
 // Lightweight shared transform overlay: the only handles shown on stage.
 // Figure motion is globally keyed and independent from beat-loop limb animation.
 var svg=o.view.svg,SVG='http://www.w3.org/2000/svg';
 var handles=doc.createElementNS(SVG,'g');handles.setAttribute('class','huw-musical-transform-overlay');handles.style.display='none';svg.appendChild(handles);
 function shape(tag,cls,action){var e=doc.createElementNS(SVG,tag);e.setAttribute('class',cls);if(action)e.setAttribute('data-transform-action',action);handles.appendChild(e);return e;}
 var outline=shape('polygon','huw-musical-transform-outline','move'),handleSet={};
 ['nw','ne','se','sw'].forEach(function(id){handleSet[id]=shape('circle','huw-musical-transform-corner','scale');handleSet[id].setAttribute('r','8');});
 handleSet.rotate=shape('circle','huw-musical-transform-rotate','rotate');handleSet.rotate.setAttribute('r','10');
 handleSet.skewX=shape('rect','huw-musical-transform-skew','skewX');
 handleSet.skewY=shape('rect','huw-musical-transform-skew','skewY');
 var guideline=shape('line','huw-musical-transform-guide');
 var partPivot=shape('circle','huw-musical-part-pivot');partPivot.setAttribute('r','5');partPivot.setAttribute('fill','#fff');partPivot.setAttribute('stroke','#b56e14');partPivot.setAttribute('stroke-width','2');partPivot.setAttribute('vector-effect','non-scaling-stroke');partPivot.style.pointerEvents='none';partPivot.style.display='none';
 var selectLabel=doc.createElementNS(SVG,'text');selectLabel.setAttribute('class','huw-musical-transform-label');handles.appendChild(selectLabel);
 var activeGeometry=null;
 function svgPoint(e,node){var matrix=node&&node.getScreenCTM&&node.getScreenCTM();if(!matrix)return null;
  var p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;try{return p.matrixTransform(matrix.inverse());}catch(err){return null;}}
 function svgPosition(p,node){var a=node.getScreenCTM(),b=svg.getScreenCTM();if(!a||!b)return null;
  var q=svg.createSVGPoint();q.x=p.x;q.y=p.y;return q.matrixTransform(b.inverse().multiply(a));}
 function setPos(el,p){el.setAttribute('cx',p.x);el.setAttribute('cy',p.y);}
 function cameraGeometry(){var c=editor.cameraStateFor(o.position(),cameraName),w=o.film.width/c.zoom,h=o.film.height/c.zoom;
  var r=(c.r||0)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r),sx=Math.tan((c.skewX||0)*Math.PI/180),sy=Math.tan((c.skewY||0)*Math.PI/180);
  function point(u,v){var x=u+sx*v,y=sy*u+v;return {x:c.x+cos*x-sin*y,y:c.y+sin*x+cos*y};}
  var pts=[point(-w/2,-h/2),point(w/2,-h/2),point(w/2,h/2),point(-w/2,h/2)];
  return {corners:pts,center:{x:c.x,y:c.y},measureNode:svg,referenceWidth:w,referenceHeight:h,initialAngle:c.r||0};
 }
 function figureGeometry(){
  function find(v,depth){if(!v||depth>16)return null;if(v.nodes&&v.nodes[figureRoot]&&SelectionZoom.visibleElement(v.nodes[figureRoot].el,svg))return v.nodes[figureRoot].el;
   var result=null;(v.clips||[]).some(function(c){if(c.el&&c.el.getAttribute('display')==='none')return false;result=find(c.view,depth+1);return !!result;});
   if(result)return result;Object.keys(v.nodes||{}).some(function(id){var n=v.nodes[id];if(!n.nested||n.el&&n.el.getAttribute('display')==='none')return false;result=find(n.nested,depth+1);return !!result;});return result;
  }
  var el=find(o.view,0),bounds=el&&SelectionZoom.boundsInRoot(svg,el,8);if(!bounds)return null;
  var pivot=editor.getPartPivot&&editor.getPartPivot(figureRoot),joint=pivot&&svgPosition({x:Number(pivot.x)||0,y:Number(pivot.y)||0},el);
  return {corners:bounds.corners,center:bounds.center,pivot:joint||bounds.center,measureNode:el.parentNode,referenceWidth:bounds.width,referenceHeight:bounds.height,figureElement:el};
 }
 function previewAspect(){var rect=svg.getBoundingClientRect();return rect&&rect.width>0&&rect.height>0?rect.width/rect.height:o.film.width/o.film.height;}
 function updatePreviewButtons(geometry){
  if(!zoomSelectionButton)return;
  zoomSelectionButton.disabled=!geometry||transformMode==='camera'||exportSuspended>0;
  zoomSelectionButton.setAttribute('aria-pressed',String(previewZoom.active()));
  resetPreviewButton.disabled=!previewZoom.active()||exportSuspended>0;
 }
 function zoomToSelection(pause){
  if(disposed||exportSuspended||editor.isExporting&&editor.isExporting()||!transformMode||transformMode==='camera')return false;
  if(pause!==false)o.pause();
  var geometry=figureGeometry();if(!geometry){updatePreviewButtons(null);return false;}
  if(!previewZoom.fit(geometry.corners,previewAspect()))return false;
  zoomTarget=transformMode+':'+figureRoot;updatePreviewButtons(geometry);refreshHandles();return true;
 }
 function resetPreviewZoom(){
  previewZoom.reset();zoomTarget='';
  if(!disposed&&o.repaint)o.repaint();
  if(!disposed)refreshHandles();
 }
 function paintPreview(){if(!disposed){previewZoom.apply();if(facePanel&&!selectingOnStage&&!cancelGesture)facePanel.refresh();}}
 function screenUnit(){
  var matrix=svg.getScreenCTM&&svg.getScreenCTM(),scale=matrix&&Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c));
  return Number.isFinite(scale)&&scale>1e-7?1/scale:1;
 }
 function refreshHandles(){
  var selectedTrack=editor.getSelection&&editor.getSelection();
  if(selectedTrack&&transformMode==='camera'&&selectedTrack.kind==='camera')cameraName=selectedTrack.id==='camera-B'?'B':'A';
  if(selectedTrack&&transformMode==='figure'&&selectedTrack.kind==='figure')figureRoot=selectedTrack.part;
  if(selectedTrack&&transformMode==='parts'&&['part','film-part','motion'].indexOf(selectedTrack.kind)>=0)figureRoot=selectedTrack.part;
  if(!handles||!svg.isConnected||puppet.isOpen()||!transformMode||exportSuspended>0||editor.isExporting&&editor.isExporting()||(o.editor.inClipDetail&&o.editor.inClipDetail()&&transformMode==='camera')||o.host.dataset.playing==='true'){
   updatePreviewButtons(null);
   handles.style.display='none';activeGeometry=null;return;
  }
  if(transformMode==='camera'&&o.host.querySelector('.huw-musical-play[aria-pressed="true"]')){handles.style.display='none';activeGeometry=null;return;}
  if(transformMode==='camera'&&previewZoom.active()){previewZoom.reset();zoomTarget='';}
  var geom=transformMode==='camera'?cameraGeometry():figureGeometry();if(!geom){
   if(previewZoom.active()&&figureRoot){previewZoom.reset();zoomTarget='';}
   updatePreviewButtons(null);handles.style.display='none';activeGeometry=null;return;
  }
  if(previewZoom.active()&&zoomTarget!==transformMode+':'+figureRoot&&!cancelGesture&&!selectingOnStage){
   previewZoom.fit(geom.corners,previewAspect());zoomTarget=transformMode+':'+figureRoot;
  }
  updatePreviewButtons(geom);
  activeGeometry=geom;handles.dataset.mode=transformMode;handles.style.display='';var p=geom.corners;
  var editingPart=transformMode==='parts',unit=screenUnit();
  outline.style.pointerEvents=editingPart?'none':'';
  ['nw','ne','se','sw','skewX','skewY'].forEach(function(id){handleSet[id].style.display=editingPart?'none':'';});
  partPivot.style.display=editingPart?'':'none';partPivot.setAttribute('r',String(5*unit));if(editingPart)setPos(partPivot,geom.pivot);
  outline.setAttribute('points',p.map(function(x){return x.x+','+x.y;}).join(' '));
  ['nw','ne','se','sw'].forEach(function(id,i){handleSet[id].setAttribute('r',String(8*unit));setPos(handleSet[id],p[i]);});
  var cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2,center=geom.center;
  var vx=cx-center.x,vy=cy-center.y,mag=Math.hypot(vx,vy)||1;
  var rotate={x:cx+27*unit*vx/mag,y:cy+27*unit*vy/mag};handleSet.rotate.setAttribute('r',String(11*unit));setPos(handleSet.rotate,rotate);
  guideline.setAttribute('x1',editingPart?geom.pivot.x:cx);guideline.setAttribute('y1',editingPart?geom.pivot.y:cy);guideline.setAttribute('x2',rotate.x);guideline.setAttribute('y2',rotate.y);
  function diamond(el,pos){el.setAttribute('x',pos.x-6*unit);el.setAttribute('y',pos.y-6*unit);el.setAttribute('width',String(12*unit));el.setAttribute('height',String(12*unit));}
  diamond(handleSet.skewX,{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2});
  diamond(handleSet.skewY,{x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2});
  var selectedScene=transformMode!=='camera'&&editor.resolvePartScene&&editor.resolvePartScene(figureRoot);
  var selectedPart=selectedScene&&selectedScene.parts&&selectedScene.parts.find(function(p){return p.id===figureRoot;});
  selectLabel.textContent=transformMode==='camera'?(L.scene==='Scene'?'Kamera '+cameraName:'Camera '+cameraName):(selectedPart&&(selectedPart.name||selectedPart.id)||figureRoot||(L.scene==='Scene'?'Hele objekt':'Whole object'));
  selectLabel.style.fontSize=String(13*unit)+'px';selectLabel.style.strokeWidth=String(4*unit)+'px';
  selectLabel.setAttribute('x',p[0].x+6*unit);selectLabel.setAttribute('y',p[0].y-11*unit);
 }
 function angle(p,c){return Math.atan2(p.y-c.y,p.x-c.x)*180/Math.PI;}
 function deltaAngle(now,start){var v=now-start;while(v>180)v-=360;while(v< -180)v+=360;return v;}
 function limit(n,a,b){return Math.min(b,Math.max(a,n));}
 handles.addEventListener('pointerdown',function(e){
  if(e.button!==0)return;var action=e.target.getAttribute('data-transform-action');if(!action||!activeGeometry)return;
  var editingPart=transformMode==='parts',partId=figureRoot;
  if(editingPart&&action!=='rotate')return;
  e.preventDefault();e.stopPropagation();o.pause();
  host.focus({preventScroll:true});
  var geom=activeGeometry,node=geom.measureNode,ctm=node&&node.getScreenCTM&&node.getScreenCTM();
  if(!ctm)return;
  var inverse=ctm.inverse();
  function frozenPoint(ev){var p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(inverse);}
  var start=frozenPoint(e),center=null;
  if(!start)return;
  // Convert center from stage coordinates into the part's parent-local coordinates.
  var c=editingPart?geom.pivot:geom.center,stageMatrix=svg.getScreenCTM();
  if(!stageMatrix)return;var stagePt=svg.createSVGPoint();stagePt.x=c.x;stagePt.y=c.y;
  var screen=stagePt.matrixTransform(stageMatrix);center=frozenPoint({clientX:screen.x,clientY:screen.y});
  if(!center)return;
  var change=null,base=editingPart?{}:transformMode==='camera'?editor.cameraStateFor(o.position(),cameraName):editor.figureStateFor(o.position(),figureRoot);
  if(!base)return;
  var startDistance=Math.max(10,Math.hypot(start.x-center.x,start.y-center.y)),startAngle=angle(start,center);
  var width=Math.max(20,geom.referenceWidth),height=Math.max(20,geom.referenceHeight),closed=false;
  if(e.target.setPointerCapture)e.target.setPointerCapture(e.pointerId);
  function move(ev){var p=frozenPoint(ev);if(!p)return;
   var dx=p.x-start.x,dy=p.y-start.y,changes={};
   if(!change){if(Math.hypot(dx,dy)<2.5)return;change=editingPart?editor.beginPartMove(partId,o.position()):transformMode==='camera'?editor.beginCameraTransform(cameraName,o.position()):editor.beginFigureTransform(figureRoot,o.position());if(!change)return;if(!editingPart)base=change.initial;}
   if(editingPart){change.update(0,0,deltaAngle(angle(p,center),startAngle));refreshHandles();return;}
   if(action==='move'){changes.x=(base.x||0)+dx;changes.y=(base.y||0)+dy;}
   else if(action==='rotate')changes.r=(base.r||0)+deltaAngle(angle(p,center),startAngle);
   else if(action==='scale'){
    var distance=Math.max(5,Math.hypot(p.x-center.x,p.y-center.y)),ratio=limit(distance/startDistance,.08,10);
    if(transformMode==='camera')changes.zoom=limit((base.zoom||1)/ratio,.25,16);
    else{changes.sx=limit((base.sx||1)*ratio,.05,16);changes.sy=limit((base.sy||1)*ratio,.05,16);}
   }else if(action==='skewX')changes.skewX=limit((base.skewX||0)+dx/width*70,-35,35);
   else if(action==='skewY')changes.skewY=limit((base.skewY||0)+dy/height*70,-35,35);
   change.update(changes);refreshHandles();
  }
  function finish(commit){if(closed)return;closed=true;if(cancelGesture===cancel)cancelGesture=null;e.target.removeEventListener('pointermove',move);e.target.removeEventListener('pointerup',up);e.target.removeEventListener('pointercancel',cancel);if(change){if(commit)change.commit();else change.cancel();}refreshHandles();}
  function up(){finish(true);}function cancel(){finish(false);}
  cancelGesture=cancel;
  e.target.addEventListener('pointermove',move);e.target.addEventListener('pointerup',up);e.target.addEventListener('pointercancel',cancel);
 });
 // Click a CutOut part on the stage to select its original scene object.
 // Dragging uses parent-local SVG coordinates, preserving nested transforms.
 function pointerDown(e){
  selectingOnStage=true;
  try{
  if(e.button!==0)return;
  var partEl=e.target.closest&&e.target.closest("[data-cutout-id]");
  if(!partEl||!svg.contains(partEl)){facePanel.hide();return;}
  host.focus({preventScroll:true});
  var id=partEl.getAttribute("data-cutout-id");latestPart=id;
  if(transformMode==='camera')return;
  if(transformMode!=='parts'&&!(editor.inClipDetail&&editor.inClipDetail())){
   // A single touch/click selects the whole object immediately. Dragging
   // the actual painted shape moves it; corners/handles edit scale/skew/rotation.
   o.pause();
   // Show the selected whole object in Properties, not the previously
   // highlighted animation clip. Its appearance remains on the stage.
   if(!chooseStageObject(id,false))return;
   var geom=activeGeometry;
   if(!geom)return;
   var node=geom.measureNode,ctm=node&&node.getScreenCTM&&node.getScreenCTM();
   if(!ctm)return;
   var inverse=ctm.inverse(),point=function(ev){var p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(inverse);};
   var start=point(e),drag=null,done=false,moved=false;
   if(partEl.setPointerCapture)partEl.setPointerCapture(e.pointerId);
   function move(ev){var at=point(ev),dx=at.x-start.x,dy=at.y-start.y;
    if(!drag&&Math.hypot(dx,dy)<3.2)return;
    if(!drag){drag=editor.beginFigureTransform(figureRoot,o.position());if(!drag)return;}
    moved=true;
    drag.update({x:(drag.initial.x||0)+dx,y:(drag.initial.y||0)+dy});
    refreshHandles();
   }
   function finish(save){if(done)return;done=true;if(cancelGesture===cancel)cancelGesture=null;
    partEl.removeEventListener('pointermove',move);partEl.removeEventListener('pointerup',up);partEl.removeEventListener('pointercancel',cancel);
    if(drag){if(save)drag.commit();else drag.cancel();}
    if(moved)lastTap=null;
    if(save)facePanel.select(id);
    refreshHandles();
   }
   function up(){finish(true);}function cancel(){finish(false);}
   cancelGesture=cancel;
   partEl.addEventListener('pointermove',move);partEl.addEventListener('pointerup',up);partEl.addEventListener('pointercancel',cancel);
   return;
  }
  o.pause();
  var target=editor.selectPart(id,transformMode==='parts');
  if(!target)return;
  e.preventDefault();figureRoot=id;transformMode='parts';updateToolButtons();refreshHandles();
  setInspector(true);
  var parent=partEl.parentNode;
  function coords(ev){
   var matrix=parent&&parent.getScreenCTM&&parent.getScreenCTM();
   if(!matrix)return {x:ev.clientX,y:ev.clientY};
   var point=svg.createSVGPoint();point.x=ev.clientX;point.y=ev.clientY;
   var local=point.matrixTransform(matrix.inverse());return {x:local.x,y:local.y};
  }
  var start=coords(e),drag=null,finished=false,joint=editor.isJointMove&&editor.isJointMove(id),anchor=null;
  // In the clip editor a limb turns around its actual CutOut pivot.
  // Dragging the puppet root still moves the whole figure.
  if(joint&&partEl.getScreenCTM&&parent&&parent.getScreenCTM){
   var childMatrix=partEl.getScreenCTM(),parentMatrix=parent.getScreenCTM();
   if(childMatrix&&parentMatrix){
    var pivot=editor.getPartPivot(id),point=svg.createSVGPoint();
    point.x=Number(pivot.x)||0;point.y=Number(pivot.y)||0;
    var screen=point.matrixTransform(childMatrix);
    anchor=screen.matrixTransform(parentMatrix.inverse());
    if(Math.hypot(start.x-anchor.x,start.y-anchor.y)<6)anchor=null;
   }
  }
  partEl.classList.add("huw-musical-selected-element");
  if(partEl.setPointerCapture)partEl.setPointerCapture(e.pointerId);
  function move(ev){
   // A drag that starts exactly on a mounted joint has no usable angle.
   // Keep its attachment fixed; the visible rotation handle remains usable.
   if(joint&&!anchor)return;
   var at=coords(ev),dx=at.x-start.x,dy=at.y-start.y;
   if(!drag&&Math.hypot(dx,dy)<3)return;
   if(!drag){o.pause();lastTap=null;drag=editor.beginPartMove(id,o.position());}
   if(drag){
    if(joint&&anchor){
     var from=Math.atan2(start.y-anchor.y,start.x-anchor.x),
      to=Math.atan2(at.y-anchor.y,at.x-anchor.x),
      angle=(to-from)*180/Math.PI;
     if(angle>180)angle-=360;if(angle< -180)angle+=360;
     drag.update(0,0,angle);
    }else drag.update(dx,dy);
   }
  }
  function finish(commit){
   if(finished)return;finished=true;
   if(cancelGesture===cancel)cancelGesture=null;
   partEl.removeEventListener("pointermove",move);
   partEl.removeEventListener("pointerup",up);
   partEl.removeEventListener("pointercancel",cancel);
   if(drag){if(commit)drag.commit();else drag.cancel();}
   if(commit)facePanel.select(id);
   refreshHandles();
  }
  function up(){finish(true);}function cancel(){finish(false);}
  cancelGesture=cancel;
  partEl.addEventListener("pointermove",move);
  partEl.addEventListener("pointerup",up);
  partEl.addEventListener("pointercancel",cancel);
  }finally{selectingOnStage=false;}
 }
 function sourceId(e){var node=e.target.closest&&e.target.closest("[data-cutout-id]");return node&&svg.contains(node)?node.getAttribute("data-cutout-id"):"";}
 function openPuppet(e){var id=sourceId(e);if(!id||transformMode==='camera')return; e.preventDefault();e.stopPropagation();puppet.open(id);}
 svg.addEventListener("dblclick",openPuppet);
 // iPad does not reliably generate dblclick after the timeline/inspector re-render.
 function touchOpen(e){if(e.pointerType!=="touch"&&e.pointerType!=="pen")return;
  var id=sourceId(e);if(!id)return;
  var now=Date.now(),tap=lastTap;lastTap={id:id,time:now,x:e.clientX,y:e.clientY};
  if(tap&&tap.id===id&&now-tap.time<450&&Math.hypot(tap.x-e.clientX,tap.y-e.clientY)<25){
   lastTap=null;e.preventDefault();e.stopPropagation();puppet.open(id);
  }
 }
 svg.addEventListener("pointerup",touchOpen);
 svg.addEventListener("pointerdown",pointerDown);
 function openFace(details){
  details=details||{};if(cancelGesture)cancelGesture();o.pause();
  if(Number.isFinite(Number(details.time))&&Math.abs(o.position()-Number(details.time))>.001)o.seek(Number(details.time));
  var context=editor.faceContext&&editor.faceContext(details.actorId||details.partId||latestPart);if(!context)return false;
  figureRoot=context.headId;latestPart=context.headId;transformMode='parts';useStageMode();editor.setCameraEdit(false);
  editor.selectPart(context.headId,true);facePanel.select(context.headId,'expression',true);facePanel.openWorkshop();updateToolButtons();setInspector(false);refreshHandles();return true;
 }
 return {showInspector:selection,selectTrack:selection,setInspector:setInspector,refreshHandles:refreshHandles,
  zoomToSelection:zoomToSelection,resetPreviewZoom:resetPreviewZoom,paintPreview:paintPreview,
  beginExport:function(){exportSuspended++;var restore=previewZoom.suspend(),restoreFace=facePanel.suspend(),restored=false;refreshHandles();return function(){if(restored)return;restored=true;exportSuspended=Math.max(0,exportSuspended-1);restoreFace();restore();if(!disposed)refreshHandles();};},
  openFace:openFace,openScore:function(title){scoreWorkshop.open(title);},openNarration:function(details){narration.open(details);},openScenes:function(){sceneWorkshop.open();},openManuscript:function(details){manuscript.open(details);},
  dispose:function(){disposed=true;if(cancelGesture)cancelGesture();previewZoom.dispose();fullscreenFallback=false;if(stagePanel)stagePanel.classList.remove('huw-musical-stage--expanded');doc.removeEventListener('fullscreenchange',syncStageFullscreen);if(doc.fullscreenElement===stagePanel&&doc.exitFullscreen)try{Promise.resolve(doc.exitFullscreen()).catch(function(){});}catch(_closed){}
  facePanel.dispose();narration.dispose();scoreWorkshop.dispose();sceneWorkshop.dispose();if(manuscript.dispose)manuscript.dispose();if(handles&&handles.parentNode)handles.parentNode.removeChild(handles);
  host.removeEventListener("keydown",keyboard);
  svg.removeEventListener("pointerdown",pointerDown);
  svg.removeEventListener("dblclick",openPuppet);svg.removeEventListener("pointerup",touchOpen);puppet.close();
 }};
}
exports.mount=mount;
})();
