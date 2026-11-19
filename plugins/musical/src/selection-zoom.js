/*\
title: $:/plugins/huwiki/musical/selection-zoom.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
function finite(value){return Number.isFinite(Number(value));}
function visibleElement(node,root){
 for(var current=node;current;current=current.parentNode){
  if(current.hidden||current.getAttribute&&current.getAttribute('display')==='none'||
   current.style&&(current.style.display==='none'||current.style.visibility==='hidden')||
   current.classList&&current.classList.contains('huw-musical-preview-hidden'))return false;
  if(current===root)return true;
 }
 return false;
}
// Convert the actual painted geometry through every parent transform and the
// film camera, then back into the preview SVG's own coordinate system. The
// outer SVG zoom therefore cancels out and cannot compound on repeated fits.
function boundsInRoot(svg,node,minEdge){
 if(!node||!visibleElement(node,svg))return null;
 try{
  var box=node.getBBox(),from=node.getScreenCTM(),to=svg.getScreenCTM();
  if(!box||!from||!to||![box.x,box.y,box.width,box.height].every(finite)||(box.width<=0&&box.height<=0))return null;
  var width=Math.max(minEdge||0,box.width),height=Math.max(minEdge||0,box.height);
  var x=box.x-(width-box.width)/2,y=box.y-(height-box.height)/2,matrix=to.inverse().multiply(from);
  function point(px,py){var p=svg.createSVGPoint();p.x=px;p.y=py;return p.matrixTransform(matrix);}
  var corners=[point(x,y),point(x+width,y),point(x+width,y+height),point(x,y+height)];
  if(corners.some(function(p){return !finite(p.x)||!finite(p.y);} ))return null;
  return {corners:corners,center:point(x+width/2,y+height/2),width:width,height:height};
 }catch(_unavailable){return null;}
}
function fitPoints(points,aspect,padding,minSize){
 if(!points||!points.length||points.some(function(p){return !p||!finite(p.x)||!finite(p.y);} ))return null;
 aspect=finite(aspect)&&aspect>0?Number(aspect):16/9;
 padding=finite(padding)&&padding>=1?Number(padding):1.65;
 minSize=finite(minSize)&&minSize>0?Number(minSize):24;
 var xs=points.map(function(p){return Number(p.x);}),ys=points.map(function(p){return Number(p.y);});
 var left=Math.min.apply(Math,xs),right=Math.max.apply(Math,xs),top=Math.min.apply(Math,ys),bottom=Math.max.apply(Math,ys);
 var width=Math.max(minSize,right-left)*padding,height=Math.max(minSize,bottom-top)*padding;
 if(width/height<aspect)width=height*aspect;else height=width/aspect;
 return {x:(left+right-width)/2,y:(top+bottom-height)/2,width:width,height:height};
}
function format(box){return [box.x,box.y,box.width,box.height].map(function(n){return Math.round(n*10000)/10000;}).join(' ');}
function create(svg,blocked){
 var box=null,base='',applied='',suspended=0;
 function enabled(){return suspended===0&&!(blocked&&blocked());}
 function apply(){
  if(!box)return false;
  var current=svg.getAttribute('viewBox')||'';
  if(current&&current!==applied)base=current;
  if(!enabled()){
   if(current===applied&&base)svg.setAttribute('viewBox',base);
   return false;
  }
  applied=format(box);
  if(current!==applied)svg.setAttribute('viewBox',applied);
  return true;
 }
 function reset(){
  if(box&&base&&svg.getAttribute('viewBox')===applied)svg.setAttribute('viewBox',base);
  box=null;applied='';base='';
 }
 return {
  fit:function(points,aspect){var next=fitPoints(points,aspect);if(!next)return false;
   if(!box)base=svg.getAttribute('viewBox')||'';box=next;apply();return true;},
  active:function(){return !!box;},apply:apply,reset:reset,
  box:function(){return box&&{x:box.x,y:box.y,width:box.width,height:box.height};},
  suspend:function(){suspended++;apply();var restored=false;return function(){if(restored)return;restored=true;suspended=Math.max(0,suspended-1);apply();};},
  dispose:reset
 };
}
exports.visibleElement=visibleElement;exports.boundsInRoot=boundsInRoot;exports.fitPoints=fitPoints;exports.create=create;
})();
