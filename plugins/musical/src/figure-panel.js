/*\
title: $:/plugins/huwiki/musical/figure-panel.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Language=require("$:/plugins/huwiki/musical/language.js");
var isDanish=Language.isDanish;
var Engine=require("$:/plugins/huwiki/cutout/engine.js"),Puppet=require("$:/plugins/huwiki/musical/puppet.js");
var NS="http://www.w3.org/2000/svg",serial=0;
function num(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function element(doc,name,cls,text,parent){var node=doc.createElement(name);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
function semanticId(scene,id){var part=(scene.parts||[]).find(function(p){return p.id===id;});return part&&/-drawing$/.test(id)&&part.parent===id.slice(0,-8)?part.parent:id;}
// Only visit the occurrence currently on stage. Repeated scene sources can
// have the same part IDs but a different local clock and rendered pose.
function activeView(view,id,time,depth){if(!view||!view.scene||depth>16)return null;if(view.nodes&&view.nodes[id])return {view:view,time:time};
 var at=Engine.clipAt(view.scene.scenes||[],time),clip=(view.clips||[])[at.index],found;
 if(clip&&clip.view){found=activeView(clip.view,id,Engine.localTime(at.time,num(clip.duration,clip.view.scene.duration),clip.settings||(view.scene.scenes||[])[at.index]),depth+1);if(found)return found;}
 var ids=Object.keys(view.nodes||{});for(var i=0;i<ids.length;i++){var node=view.nodes[ids[i]];if(!node.nested)continue;var clock=Engine.timing(time,num(node.nested.duration,node.nested.scene.duration),node.part);if(clock.active){found=activeView(node.nested,id,clock.time,depth+1);if(found)return found;}}
 return null;
}
function resolve(view,id,time,film){var found=activeView(view,id,num(time,0),0);if(!found)return null;var scene=found.view.scene,partId=semanticId(scene,id),rootId=Puppet.rootFor(partId,scene,film||view.scene),root=rootId&&found.view.nodes[rootId];
 if(!root)return null;var parts=Puppet.descendants(scene.parts||[],rootId),hasJoints=parts.some(function(part){return part.id!==rootId&&semanticId(scene,part.id)===part.id;});
 // One bitmap, vector shape or generated drawing is still an editable
 // object. Only semantic child parts require the figure's joint controls.
 return {view:found.view,scene:scene,partId:partId,actorId:rootId,rootId:rootId,root:root,parts:parts,kind:hasJoints?"figure":"object",hasJoints:hasJoints,isObject:!hasJoints,localTime:found.time,globalTime:num(time,0)};
}
function attributes(node){if(!node||!node.getAttribute)return [];if(node.getAttributeNames)return node.getAttributeNames().map(function(name){return {name:name,value:node.getAttribute(name)};});return Array.prototype.slice.call(node.attributes||[]).map(function(attr){return {name:attr.name,value:attr.value};});}
function matrixText(matrix){return "matrix("+[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(" ")+")";}
function point(svg,x,y,matrix){var p=svg.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(matrix);}
function relativeMatrix(from,to){try{var a=from&&from.getScreenCTM&&from.getScreenCTM(),b=to&&to.getScreenCTM&&to.getScreenCTM();return a&&b?b.inverse().multiply(a):null;}catch(_unavailable){return null;}}
function frameFor(svg,node,padding){try{var box=node.getBBox(),matrix=relativeMatrix(node,svg);if(!matrix||!box||!(box.width>0||box.height>0))return null;var w=Math.max(2,box.width),h=Math.max(2,box.height),x=box.x-(w-box.width)/2,y=box.y-(h-box.height)/2,points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(function(p){return point(svg,p[0],p[1],matrix);}),xs=points.map(function(p){return p.x;}),ys=points.map(function(p){return p.y;}),left=Math.min.apply(null,xs),top=Math.min.apply(null,ys),width=Math.max.apply(null,xs)-left,height=Math.max.apply(null,ys)-top,pad=Math.max(8,Math.max(width,height)*num(padding,.13));return {x:left-pad,y:top-pad,width:width+pad*2,height:height+pad*2,corners:points};}catch(_unavailable){return null;}}
function faceHit(context,id){if(!context)return "";var parts=context.parts||{};if(id===parts.open||id===parts.closed)return "mouth";if([].concat(parts.eyes||[],parts.pupils||[],parts.brows||[],parts.lids||[]).indexOf(id)>=0)return "eyes";return "";}
function mount(o){
 var ui=Language.translator(o.wiki);
 var displayName=o.displayName||function(value){return value;};var doc=o.doc,editor=o.editor,parent=o.parent||o.host,da=isDanish(o.wiki),uid="huw-figure-"+(++serial),opened=false,disposed=false,suspended=0,selectedId="",context=null,previewRoot=null,sourceRoot=null,sourceView=null,pairs=[],nodes={},idMap={},frame=null,lastTime=null,gesture=null,selecting=false,clickGuard=null,blockedPointers={},reveal=false,ghostOf=null,ghostPairs=[];
 var L=da?{title:"Hele figuren",parts:"Figurens dele",fit:"Vis hele figuren",hint:"Træk en kropsdel for at dreje den om leddet. Træk figurens rod for at flytte den. Tryk på øjne eller mund for at redigere ansigtet. Tom plads eller Escape slipper markeringen.",saved:"Ændringen er gemt ved det valgte tidspunkt.",cancelled:"Bevægelsen er annulleret.",cleared:"Markeringen er sluppet.",none:"Ingen del valgt",rotate:"Drej den valgte del",selected:"Valgt del",at:"Tid"}:ui.labels({title:"Whole figure",parts:"Figure parts",fit:"Fit whole figure",hint:"Drag a body part to turn it around its joint. Drag the figure root to move it. Touch eyes or mouth to edit the face. Empty space or Escape clears the selection.",saved:"Saved at the selected time.",cancelled:"Movement cancelled.",cleared:"Selection cleared.",none:"No part selected",rotate:"Rotate the selected part",selected:"Selected part",at:"Time"});
 var O=da?{title:"Hele objektet",fit:"Vis hele objektet",hint:"Træk objektet for at flytte det, eller brug det blå håndtag til at dreje det. Ændringen gemmes ved tidsmarkøren, når du slipper. Tom plads eller Escape slipper markeringen.",appearance:"Redigér / udskift",properties:"Egenskaber",none:"Intet objekt valgt",selected:"Valgt objekt",rotate:"Drej det valgte objekt",invisible:"Objektet er usynligt ved dette tidspunkt.",reveal:"Vis som hjælp",hideReveal:"Skjul hjælpevisning",revealed:"Hjælpevisning · objektet er stadig usynligt i animationen."}:ui.labels({title:"Whole object",fit:"Fit whole object",hint:"Drag the object to move it, or use the blue handle to rotate it. Release to save the change at the playhead. Empty space or Escape clears the selection.",appearance:"Edit / replace",properties:"Properties",none:"No object selected",selected:"Selected object",rotate:"Rotate the selected object",invisible:"The object is invisible at this time.",reveal:"Show as guide",hideReveal:"Hide guide",revealed:"Guide preview · the object is still invisible in the animation."});
 var panel=element(doc,"section","huw-musical-figure-panel",undefined,parent);panel.setAttribute("data-figure-panel","");panel.setAttribute("aria-label",L.title);panel.tabIndex=-1;panel.hidden=true;
 var header=element(doc,"header","huw-musical-figure-header",undefined,panel),title=element(doc,"strong","huw-musical-figure-title",L.title,header),selectedLabel=element(doc,"span","huw-musical-figure-selected-label","",header),clockLabel=element(doc,"span","huw-musical-figure-time","",header);
 var fit=element(doc,"button","huw-musical-figure-fit",L.fit,header);fit.type="button";fit.setAttribute("data-figure-fit","");fit.onclick=function(){fitFrame();};
 var appearance=element(doc,"button","huw-musical-object-appearance",O.appearance,header);appearance.type="button";appearance.setAttribute("data-object-appearance","");appearance.hidden=true;appearance.onclick=function(){if(!context||!o.onEditAppearance)return;finish(false);o.onEditAppearance(selectedId||context.rootId);};
 var properties=element(doc,"button","huw-musical-object-properties",O.properties,header);properties.type="button";properties.setAttribute("data-object-properties","");properties.hidden=true;properties.onclick=function(){if(!context||!o.onProperties)return;finish(false);o.onProperties(selectedId||context.rootId);};
 var body=element(doc,"div","huw-musical-figure-body",undefined,panel),canvas=element(doc,"div","huw-musical-figure-canvas",undefined,body),list=element(doc,"div","huw-musical-figure-parts",undefined,body);list.setAttribute("role","group");list.setAttribute("aria-label",L.parts);
 var partsOpen=false,partsButton=element(doc,'button','huw-musical-figure-parts-toggle',L.parts,header);
 list.id=uid+'-parts';partsButton.type='button';partsButton.setAttribute('aria-controls',list.id);
 partsButton.setAttribute('aria-expanded','false');
 partsButton.onclick=function(){partsOpen=!partsOpen;list.hidden=!partsOpen;partsButton.setAttribute('aria-expanded',String(partsOpen));};
 var svg=doc.createElementNS(NS,"svg");svg.setAttribute("class","huw-cutout-svg huw-musical-figure-preview");svg.setAttribute("data-figure-preview","");svg.setAttribute("viewBox","0 0 800 450");svg.setAttribute("preserveAspectRatio","xMidYMid meet");svg.setAttribute("role","group");svg.setAttribute("aria-label",L.title);canvas.appendChild(svg);
 var content=doc.createElementNS(NS,"g");svg.appendChild(content);var ghostLayer=doc.createElementNS(NS,"g");ghostLayer.setAttribute("data-figure-ghost","");ghostLayer.setAttribute("opacity","0.55");ghostLayer.setAttribute("display","none");svg.appendChild(ghostLayer);var overlay=doc.createElementNS(NS,"g");overlay.setAttribute("class","huw-musical-figure-overlay");svg.appendChild(overlay);
 function shape(name,cls){var node=doc.createElementNS(NS,name);node.setAttribute("class",cls);overlay.appendChild(node);return node;}
 var outline=shape("polygon","huw-musical-figure-outline"),guide=shape("line","huw-musical-figure-guide"),pivot=shape("circle","huw-musical-figure-pivot"),rotate=shape("circle","huw-musical-figure-rotate");rotate.setAttribute("data-figure-action","rotate");rotate.setAttribute("aria-label",L.rotate);rotate.setAttribute("role","button");rotate.setAttribute("tabindex","0");pivot.setAttribute("data-figure-pivot","");
 var hint=element(doc,"p","huw-musical-figure-hint",L.hint,panel),notice=element(doc,"div","huw-musical-object-visibility",undefined,panel),noticeText=element(doc,"span","",O.invisible,notice),revealButton=element(doc,"button","huw-musical-object-reveal",O.reveal,notice);notice.hidden=true;notice.setAttribute("data-object-visibility","");revealButton.type="button";revealButton.setAttribute("data-object-reveal","");revealButton.setAttribute("aria-pressed","false");revealButton.onclick=function(){reveal=!reveal;renderGhost();};
 var status=element(doc,"output","huw-musical-figure-status","",panel);status.setAttribute("aria-live","polite");
 function visibility(){var visible=opened&&!disposed&&!suspended,changed=panel.hidden===visible;panel.hidden=!visible;if(changed&&o.onLayout)o.onLayout();}
 function renamed(value){return String(value).replace(/#([^\s)'";]+)/g,function(all,id){return idMap[id]?"#"+idMap[id]:all;});}
 function copyAttributes(source,target){var present={},previewHidden=source.classList&&source.classList.contains("huw-musical-preview-hidden");attributes(source).forEach(function(attr){var name=attr.name,value=attr.value;if(name==="id")value=idMap[value]||value;else value=renamed(value);
   if(name==="class")value=String(value).split(/\s+/).filter(function(cls){return ["huw-musical-selected-element","huw-cutout-selected","huw-musical-preview-hidden"].indexOf(cls)<0;}).join(" ");
   if(name==="style"&&previewHidden)value=String(value).replace(/(^|;)\s*display\s*:[^;]*/gi,"$1");
   present[name]=true;if(target.getAttribute(name)!==value)target.setAttribute(name,value);
  });attributes(target).forEach(function(attr){if(!present[attr.name])target.removeAttribute(attr.name);});
  if(source.nodeType===3&&target.textContent!==source.textContent)target.textContent=source.textContent;
 }
 function omit(node){return node.classList&&(node.classList.contains("huw-cutout-joint")||node.classList.contains("huw-musical-transform-overlay")||node.classList.contains("co-direct-overlay"));}
 function cloneTree(source){var clone=source.cloneNode(true);function pair(a,b){if(omit(a)){b.remove();return;}pairs.push({source:a,target:b});var id=a.getAttribute&&a.getAttribute("data-cutout-id");if(id&&context.view.nodes[id])nodes[id]={el:b,part:context.view.nodes[id].part};
   var left=Array.prototype.slice.call(a.childNodes||[]),right=Array.prototype.slice.call(b.childNodes||[]);left.forEach(function(child,index){if(right[index])pair(child,right[index]);});
  }pair(source,clone);return clone;}
 function rebuild(){content.textContent="";pairs=[];nodes={};idMap={};sourceRoot=context.root.el;sourceView=context.view;
  // Definitions attached to scene SVGs may be outside the actor subtree.
  // Copy only this actor's ancestor definitions, never the other scene trees.
  for(var ancestor=sourceRoot.parentNode;ancestor;ancestor=ancestor.parentNode){Array.prototype.forEach.call(ancestor.childNodes||[],function(child){var name=String(child.localName||"").toLowerCase();if(name==="defs"||name==="style")content.appendChild(cloneTree(child));});if(ancestor===o.view.svg)break;}
  previewRoot=cloneTree(sourceRoot);content.appendChild(previewRoot);
  pairs.forEach(function(pair){var id=pair.source.getAttribute&&pair.source.getAttribute("id");if(id)idMap[id]=uid+"-"+id;});
  sync();renderParts();frame=null;lastTime=null;
 }
 function sync(){pairs.forEach(function(pair){if(pair.source.getAttribute)copyAttributes(pair.source,pair.target);else if(pair.source.nodeType===3&&pair.target.textContent!==pair.source.textContent)pair.target.textContent=pair.source.textContent;});
  // Keep the stage's complete nested transform chain in an independent
  // preview coordinate system. Its camera and viewBox are never edited.
  var matrix=relativeMatrix(sourceRoot&&sourceRoot.parentNode,o.view.svg);if(matrix){var transform=matrixText(matrix);if(content.getAttribute("transform")!==transform)content.setAttribute("transform",transform);}
  renderGhost();
 }
 function objectInvisible(){if(!context||!context.isObject)return false;return !context.parts.some(function(part){var node=nodes[part.id]&&nodes[part.id].el;if(!node||part.type==="group")return false;for(var up=node;up&&up!==content;up=up.parentNode){var opacity=up.getAttribute&&up.getAttribute("opacity");if(opacity!==null&&opacity!==undefined&&num(opacity,1)<=.0001||up.getAttribute&&up.getAttribute("display")==="none"||up.style&&(up.style.display==="none"||up.style.opacity==="0"))return false;}return true;});}
 function renderGhost(){var invisible=objectInvisible();notice.hidden=!invisible;noticeText.textContent=reveal?O.revealed:O.invisible;revealButton.textContent=reveal?O.hideReveal:O.reveal;revealButton.setAttribute("aria-pressed",String(reveal));panel.setAttribute("data-object-invisible",String(invisible));
  if(!invisible||!reveal||!previewRoot){ghostLayer.setAttribute("display","none");if(!reveal){ghostLayer.textContent="";ghostOf=null;ghostPairs=[];}return;}
  if(ghostOf!==previewRoot){ghostLayer.textContent="";ghostPairs=[];var ghost=previewRoot.cloneNode(true);function pair(source,target){ghostPairs.push({source:source,target:target});Array.prototype.forEach.call(source.childNodes||[],function(child,index){if(target.childNodes[index])pair(child,target.childNodes[index]);});}pair(previewRoot,ghost);ghostLayer.appendChild(ghost);ghostOf=previewRoot;}
  ghostPairs.forEach(function(pair){if(!pair.source.getAttribute){if(pair.source.nodeType===3)pair.target.textContent=pair.source.textContent;return;}copyAttributes(pair.source,pair.target);pair.target.removeAttribute("id");if(pair.target.hasAttribute("opacity")&&num(pair.target.getAttribute("opacity"),1)<=.0001)pair.target.setAttribute("opacity","1");if(pair.target.getAttribute("display")==="none")pair.target.removeAttribute("display");var style=pair.target.getAttribute("style");if(style)pair.target.setAttribute("style",style.replace(/(^|;)\s*(?:display\s*:\s*none|opacity\s*:\s*0(?:\.0*)?)\s*(?=;|$)/gi,"$1"));});
  var transform=content.getAttribute("transform");if(transform)ghostLayer.setAttribute("transform",transform);else ghostLayer.removeAttribute("transform");ghostLayer.removeAttribute("display");
 }
 function fitFrame(){if(gesture||!previewRoot)return;var next=frameFor(svg,previewRoot,.13);if(!next)return;frame=next;svg.setAttribute("viewBox",[next.x,next.y,next.width,next.height].join(" "));drawSelection();}
 function unit(){var matrix=svg.getScreenCTM&&svg.getScreenCTM(),scale=matrix&&Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c));return Number.isFinite(scale)&&scale>1e-7?1/scale:1;}
 function drawSelection(){var node=nodes[selectedId]&&nodes[selectedId].el,box=node&&frameFor(svg,node,0),p=node&&editor.getPartPivot?editor.getPartPivot(selectedId):{x:0,y:0},matrix=node&&relativeMatrix(node,svg);if(!box||!matrix){overlay.setAttribute("display","none");rotate.setAttribute("tabindex","-1");return;}overlay.removeAttribute("display");rotate.setAttribute("tabindex","0");var anchor=point(svg,num(p.x,0),num(p.y,0),matrix),u=unit(),corners=box.corners;
  outline.setAttribute("points",corners.map(function(p){return p.x+","+p.y;}).join(" "));
  pivot.setAttribute("cx",anchor.x);pivot.setAttribute("cy",anchor.y);pivot.setAttribute("r",5*u);
  var center={x:(corners[0].x+corners[2].x)/2,y:(corners[0].y+corners[2].y)/2},top={x:(corners[0].x+corners[1].x)/2,y:(corners[0].y+corners[1].y)/2},vx=top.x-center.x,vy=top.y-center.y,length=Math.hypot(vx,vy)||1,handle={x:top.x+28*u*vx/length,y:top.y+28*u*vy/length};
  rotate.setAttribute("cx",handle.x);rotate.setAttribute("cy",handle.y);rotate.setAttribute("r",11*u);guide.setAttribute("x1",anchor.x);guide.setAttribute("y1",anchor.y);guide.setAttribute("x2",handle.x);guide.setAttribute("y2",handle.y);
 }
 function labels(){var part=context&&context.scene.parts.find(function(p){return p.id===selectedId;}),rootPart=context&&context.root.part,isObject=!!(context&&context.isObject),labels=isObject?O:L;title.textContent=rootPart&&displayName(rootPart.name||rootPart.id)||labels.title;selectedLabel.textContent=selectedId?labels.selected+": "+(part&&displayName(part.name||part.id)||selectedId):labels.none;clockLabel.textContent=L.at+": "+num(o.position(),0).toFixed(2)+" s";panel.setAttribute("data-figure-actor",context?context.rootId:"");panel.setAttribute("data-figure-selected",selectedId);panel.setAttribute("data-figure-kind",isObject?"object":"figure");panel.setAttribute("aria-label",labels.title);fit.textContent=labels.fit;hint.textContent=labels.hint;rotate.setAttribute("aria-label",labels.rotate);partsButton.hidden=isObject;list.hidden=isObject||!partsOpen;appearance.hidden=!isObject||!o.onEditAppearance;properties.hidden=!isObject||!o.onProperties;svg.setAttribute("aria-label",title.textContent+" · "+selectedLabel.textContent);
  Array.prototype.forEach.call(list.querySelectorAll("[data-figure-part]"),function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-figure-part")===selectedId));});
 }
 function renderParts(){list.textContent="";if(!context)return;var map={};context.parts.forEach(function(part){map[part.id]=part;});context.parts.forEach(function(part){if(semanticId(context.scene,part.id)!==part.id)return;var depth=0,up=part.parent,seen={};while(up&&map[up]&&!seen[up]){seen[up]=true;depth++;up=map[up].parent;}var button=element(doc,"button","huw-musical-figure-part",displayName(part.name||part.id),list);button.type="button";button.setAttribute("data-figure-part",part.id);button.style.paddingLeft=(10+Math.min(depth,5)*12)+"px";button.onclick=function(){pick(part.id,true);};});}
 function refresh(force){if(disposed||!opened||suspended||!context)return false;var time=num(o.position(),0),id=selectedId||context.rootId,next=resolve(o.view,id,time,o.film);if(!next){if(gesture)finish(false);context=null;opened=false;visibility();return false;}
  if(gesture&&(Math.abs(time-gesture.time)>1e-7||next.root.el!==sourceRoot)){finish(false);next=resolve(o.view,id,time,o.film);if(!next)return false;}
  context=next;if(selectedId)selectedId=next.partId;else context.partId="";
  if(sourceRoot!==next.root.el||sourceView!==next.view)rebuild();else sync();
  labels();if(!gesture&&(!frame||force||lastTime!==time))fitFrame();else drawSelection();lastTime=time;return true;
 }
 function select(id,options){if(disposed)return false;var next=id&&resolve(o.view,id,num(o.position(),0),o.film);if(!next)return false;if(gesture&&next.partId!==selectedId)finish(false);
  if(!context||next.rootId!==context.rootId)reveal=false;selectedId=next.partId;context=next;opened=true;visibility();refresh(false);if(options&&options.focus){panel.focus({preventScroll:true});if(panel.scrollIntoView)panel.scrollIntoView({block:"nearest"});}return true;
 }
 function clearSelection(){if(disposed)return false;var changed=!!(selectedId||gesture);finish(false);selectedId="";if(context)context.partId="";labels();drawSelection();if(doc.activeElement===rotate)panel.focus({preventScroll:true});if(changed)status.textContent=L.cleared;return changed;}
 function deselect(){var changed=clearSelection();if(changed&&o.onDeselect)o.onDeselect();return changed;}
 function facialChoice(id){if(context&&context.isObject)return null;var face=context&&editor.faceContext&&editor.faceContext(id),channel=faceHit(face,id);return channel&&o.onFace?{partId:id,actorId:face.actorId,headId:face.headId,tab:channel}:null;}
 function pick(id,routeFace){if(!context)return false;var face=routeFace&&facialChoice(id);
  if(face){o.pause();o.onFace(face);return false;}
  var normalized=semanticId(context.scene,id);if(!nodes[normalized])return false;selectedId=normalized;context.partId=normalized;selecting=true;
  try{if(editor.selectPart(normalized,true)===false)return false;if(o.onSelect)o.onSelect(normalized);}finally{selecting=false;}
  labels();drawSelection();return true;
 }
 function finish(commit,event){var active=gesture;if(!active)return;gesture=null;
  // Touch browsers may send a click after pointerup, even though pointerdown
  // was prevented. It must not activate a card that replaces the figure.
  if(active.face||active.blank)clickGuard={pointerId:active.pointerId,x:num(event&&event.clientX,active.screen.x),y:num(event&&event.clientY,active.screen.y),until:Date.now()+1000};
  try{if(canvas.hasPointerCapture&&canvas.hasPointerCapture(active.pointerId))canvas.releasePointerCapture(active.pointerId);}catch(_released){}
  if(active.face||active.blank){var endingGuard=clickGuard;try{if(commit&&!disposed&&!suspended&&opened&&Math.abs(num(o.position(),0)-active.time)<1e-7&&sourceRoot===active.source){if(active.blank)deselect();else o.onFace(active.face);}else refresh(false);}
   finally{
    // Thumbnail construction can block for seconds on a slow device. Start
    // the compatibility-click window after that synchronous work finishes.
    if(clickGuard===endingGuard)endingGuard.until=Date.now()+1000;
   }return;}
  if(active.change){if(commit)active.change.commit();else active.change.cancel();status.textContent=commit?L.saved:L.cancelled;}
  // A newly extended limb may lie beyond the old frame. Refit once after
  // committing, while keeping the frame frozen throughout the gesture.
  refresh(!!(commit&&active.change));
 }
 function pointerDown(event){if(disposed||suspended||!opened||gesture||event.button!==0||event.isPrimary===false||blockedPointers[event.pointerId])return;var action=event.target.getAttribute&&event.target.getAttribute("data-figure-action"),hit=event.target.closest&&event.target.closest("[data-cutout-id]"),id=action==="rotate"?selectedId:hit&&svg.contains(hit)&&hit.getAttribute("data-cutout-id");
  if(!id||!nodes[id]){if(!selectedId)return;event.preventDefault();event.stopPropagation();gesture={blank:true,pointerId:event.pointerId,time:num(o.position(),0),source:sourceRoot,screen:{x:event.clientX,y:event.clientY},change:null};try{if(canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);}catch(_unavailable){}return;}
  event.preventDefault();event.stopPropagation();o.pause();var face=action!=="rotate"&&facialChoice(id);
  if(face){gesture={face:face,pointerId:event.pointerId,time:num(o.position(),0),source:sourceRoot,screen:{x:event.clientX,y:event.clientY},change:null};try{if(canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);}catch(_unavailable){}return;}
  if(!pick(id,false))return;refresh(false);
  var node=nodes[selectedId]&&nodes[selectedId].el,parent=node&&node.parentNode,ctm=parent&&parent.getScreenCTM&&parent.getScreenCTM(),child=node&&node.getScreenCTM&&node.getScreenCTM();if(!ctm||!child)return;var inverse;try{inverse=ctm.inverse();}catch(_singular){return;}
  var start=point(svg,event.clientX,event.clientY,inverse),joint=!!(editor.isJointMove&&editor.isJointMove(selectedId)),pivotValue=editor.getPartPivot?editor.getPartPivot(selectedId):{x:0,y:0},screenAnchor=point(svg,num(pivotValue.x,0),num(pivotValue.y,0),child),anchor=point(svg,screenAnchor.x,screenAnchor.y,inverse);
  gesture={id:selectedId,pointerId:event.pointerId,time:num(o.position(),0),inverse:inverse,start:start,screen:{x:event.clientX,y:event.clientY},anchor:anchor,rotate:joint||action==="rotate",usable:!joint||Math.hypot(start.x-anchor.x,start.y-anchor.y)>1e-6,change:null};
  try{if(canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);}catch(_unavailable){}
 }
 function pointerMove(event){var active=gesture;if(!active||event.pointerId!==active.pointerId)return;if(Math.abs(num(o.position(),0)-active.time)>1e-7){finish(false,event);return;}
  if(active.face||active.blank){event.preventDefault();event.stopPropagation();if(Math.hypot(event.clientX-active.screen.x,event.clientY-active.screen.y)>8)finish(false,event);return;}
  if(!active.usable)return;var at=point(svg,event.clientX,event.clientY,active.inverse);if(!active.change&&Math.hypot(event.clientX-active.screen.x,event.clientY-active.screen.y)<3)return;
  if(!active.change)active.change=editor.beginPartMove(active.id,active.time);if(!active.change)return;event.preventDefault();event.stopPropagation();
  if(active.rotate){var a=Math.atan2(active.start.y-active.anchor.y,active.start.x-active.anchor.x),b=Math.atan2(at.y-active.anchor.y,at.x-active.anchor.x),angle=(b-a)*180/Math.PI;while(angle>180)angle-=360;while(angle< -180)angle+=360;active.change.update(0,0,angle);}else active.change.update(at.x-active.start.x,at.y-active.start.y);
  refresh(false);
 }
 canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",function(event){if(gesture&&event.pointerId===gesture.pointerId){event.preventDefault();event.stopPropagation();finish(!(gesture.face||gesture.blank)||Math.hypot(event.clientX-gesture.screen.x,event.clientY-gesture.screen.y)<=8,event);}});canvas.addEventListener("pointercancel",function(event){if(gesture&&event.pointerId===gesture.pointerId)finish(false,event);});canvas.addEventListener("lostpointercapture",function(event){if(gesture&&event.pointerId===gesture.pointerId)finish(false,event);});
 function documentDown(event){clickGuard=null;if(event.isPrimary===false)blockedPointers[event.pointerId]=true;if(gesture&&event.pointerId!==gesture.pointerId){blockedPointers[event.pointerId]=true;finish(false,event);}}
 function documentEnd(event){delete blockedPointers[event.pointerId];if(gesture&&(gesture.face||gesture.blank)&&event.pointerId===gesture.pointerId&&(!canvas.contains(event.target)||event.type==="pointercancel"))finish(false,event);}
 function compatibilityClick(event){var guard=clickGuard;if(!guard)return;if(Date.now()>guard.until){clickGuard=null;return;}if(event.detail===0&&!event.pointerType)return;
  if(event.pointerId!==guard.pointerId&&Math.hypot(num(event.clientX,Infinity)-guard.x,num(event.clientY,Infinity)-guard.y)>12)return;
  clickGuard=null;event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation();
 }
 doc.addEventListener("pointerdown",documentDown,true);doc.addEventListener("pointerup",documentEnd,true);doc.addEventListener("pointercancel",documentEnd,true);doc.addEventListener("click",compatibilityClick,true);
 rotate.addEventListener("keydown",function(event){if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();event.stopPropagation();if(gesture||disposed||suspended||!opened)return;o.pause();if(!pick(selectedId,false))return;var change=editor.beginPartMove(selectedId,num(o.position(),0));if(!change)return;change.update(0,0,(event.key==="ArrowLeft"?-1:1)*(event.shiftKey?15:5));change.commit();status.textContent=L.saved;refresh(true);});
 panel.addEventListener("keydown",function(event){if(event.key==="Escape"&&opened&&!suspended&&(selectedId||gesture)){event.preventDefault();event.stopPropagation();deselect();}});
 return {select:select,refresh:refresh,clearSelection:clearSelection,selectedPart:function(){return selectedId;},context:function(){return context;},show:function(){opened=!!context;visibility();refresh(true);},hide:function(){finish(false);opened=false;visibility();},isOpen:function(){return opened&&!suspended&&!disposed;},isDragging:function(){return !!gesture;},cancelGesture:function(){finish(false);},
  suspend:function(){finish(false);suspended++;visibility();var restored=false;return function(){if(restored)return;restored=true;suspended=Math.max(0,suspended-1);visibility();refresh(true);};},
  dispose:function(){if(disposed)return;finish(false);disposed=true;opened=false;doc.removeEventListener("pointerdown",documentDown,true);doc.removeEventListener("pointerup",documentEnd,true);doc.removeEventListener("pointercancel",documentEnd,true);doc.removeEventListener("click",compatibilityClick,true);clickGuard=null;blockedPointers={};panel.remove();pairs=[];nodes={};context=null;}
 };
}
exports.mount=mount;exports.resolve=resolve;exports.semanticId=semanticId;exports.faceHit=faceHit;
})();
