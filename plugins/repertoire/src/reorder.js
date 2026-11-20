/*\
title: $:/plugins/huwiki/repertoire/reorder.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// The native TW5 list-links-draggable macro uses HTML5 DnD, which is unreliable
// on touch iPads. Keep TW5's draggable/drop-highlight CSS vocabulary, but use
// Pointer Events for touch, pen and mouse, and keyboard arrows as an equal path.
function move(items,from,boundary){
 var next=items.slice();
 if(from<0||from>=next.length)return next;
 boundary=Math.max(0,Math.min(next.length,boundary));
 var song=next.splice(from,1)[0],target=boundary>from?boundary-1:boundary;
 next.splice(target,0,song);
 return next;
}
function mount(order,items,onMove){
 var doc=order&&order.ownerDocument,win=doc&&doc.defaultView;
 if(!doc||typeof doc.addEventListener!=="function"||typeof order.querySelectorAll!=="function")return function(){};
 var rows=Array.prototype.slice.call(order.querySelectorAll(".huwrep-order-row"));
 var listeners=[],active=null;
 function unchanged(a,b){return a.every(function(id,i){return id===b[i];});}
 function listen(node,type,fn,options){node.addEventListener(type,fn,options);listeners.push([node,type,fn,options]);}
 function clearHighlights(){
  rows.forEach(function(row){
   row.classList.remove("tc-dragover","tc-dragging");
   row.removeAttribute("data-drop-side");
  });
  order.classList.remove("huwrep-order-is-dragging");
 }
 function boundaryAt(clientY){
  for(var i=0;i<rows.length;i++){
   var rect=rows[i].getBoundingClientRect();
   if(clientY<rect.top+rect.height/2)return i;
  }
  return rows.length;
 }
 function mark(boundary){
  rows.forEach(function(row){row.classList.remove("tc-dragover");row.removeAttribute("data-drop-side");});
  if(!rows.length)return;
  var index=boundary===rows.length?rows.length-1:boundary,row=rows[index];
  row.classList.add("tc-dragover");
  row.setAttribute("data-drop-side",boundary===rows.length?"after":"before");
 }
 // Auto-scroll ONLY the local setlist. The outer story/viewport must never move.
 function autoScroll(){
  if(!active||!active.dragging||!win||typeof win.requestAnimationFrame!=="function")return;
  active.frame=0;
  var rect=order.getBoundingClientRect(),y=active.clientY;
  var edge=Math.max(20,Math.min(52,rect.height/5)),delta=0;
  // Allow a small outside margin so the player can reach either end.
  if(y>=rect.top-24&&y<rect.top+edge)delta=-Math.min(13,Math.max(2,Math.ceil((rect.top+edge-y)/5)));
  else if(y<=rect.bottom+24&&y>rect.bottom-edge)delta=Math.min(13,Math.max(2,Math.ceil((y-(rect.bottom-edge))/5)));
  if(!delta)return;
  var before=order.scrollTop;
  order.scrollTop=before+delta;
  if(order.scrollTop===before)return;
  active.boundary=boundaryAt(y);
  mark(active.boundary);
  active.frame=win.requestAnimationFrame(autoScroll);
 }
 function pointerMove(event){
  if(!active||event.pointerId!==active.pointerId)return;
  active.clientY=event.clientY;
  if(!active.dragging){
   if(Math.abs(event.clientY-active.startY)+Math.abs(event.clientX-active.startX)<8)return;
   active.dragging=true;active.row.classList.add("tc-dragging");
   order.classList.add("huwrep-order-is-dragging");
  }
  if(event.cancelable)event.preventDefault();
  active.boundary=boundaryAt(event.clientY);
  mark(active.boundary);
  if(!active.frame&&win&&win.requestAnimationFrame)active.frame=win.requestAnimationFrame(autoScroll);
 }
 function stop(event,cancel){
  if(!active||event&&event.pointerId!==undefined&&event.pointerId!==active.pointerId)return;
  var dragging=active,wasDragged=active.dragging,target=active.boundary;
  if(win&&dragging.frame&&win.cancelAnimationFrame)win.cancelAnimationFrame(dragging.frame);
  try{if(dragging.handle.hasPointerCapture&&dragging.handle.hasPointerCapture(dragging.pointerId))
   dragging.handle.releasePointerCapture(dragging.pointerId);}catch(_error){}
  active=null;clearHighlights();
  if(!cancel&&wasDragged){
   var result=move(items,dragging.index,target);
   if(!unchanged(items,result))onMove(result,items[dragging.index],false);
  }
 }
 function pointerDown(event,index,handle,row){
  if(active||event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
  if(event.cancelable)event.preventDefault();
  active={pointerId:event.pointerId,index:index,row:row,handle:handle,
   startX:event.clientX,startY:event.clientY,clientY:event.clientY,boundary:index,dragging:false,frame:0};
  try{if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);}catch(_error){}
 }
 function cancelOnEscape(event){if(active&&event.key==="Escape"){event.preventDefault();stop(null,true);}}
 rows.forEach(function(row,index){
  var handle=row.querySelector(".huwrep-order-handle");
  if(!handle)return;
  listen(handle,"pointerdown",function(event){pointerDown(event,index,handle,row);});
  listen(handle,"keydown",function(event){
   if(active||event.altKey||event.ctrlKey||event.metaKey)return;
   var offset=event.key==="ArrowUp"?-1:event.key==="ArrowDown"?1:0;
   if(!offset)return;
   event.preventDefault();
   var destination=index+offset;
   if(destination<0||destination>=items.length)return;
   var changed=move(items,index,destination>index?destination+1:destination);
   if(!unchanged(items,changed))onMove(changed,items[index],true);
  });
 });
 listen(doc,"pointermove",pointerMove,{passive:false});
 listen(doc,"pointerup",function(event){stop(event,false);});
 listen(doc,"pointercancel",function(event){stop(event,true);});
 listen(doc,"keydown",cancelOnEscape);
 return function dispose(){
  if(active)stop(null,true);
  listeners.forEach(function(entry){entry[0].removeEventListener(entry[1],entry[2],entry[3]);});
  listeners=[];clearHighlights();
 };
}
exports.move=move;
exports.mount=mount;
})();