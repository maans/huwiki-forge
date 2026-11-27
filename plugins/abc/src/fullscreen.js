/*\
title: $:/plugins/huwiki/abc/fullscreen.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// A fixed reader must leave the tiddler's containing/stacking contexts even
// when native fullscreen is unavailable (iPad, embedded pages, denied calls).
var locks=new WeakMap();
function fullscreenElement(doc){return doc.fullscreenElement||doc.webkitFullscreenElement||null;}
function saveOverflow(node){
 var style=node&&node.style;
 if(!style)return null;
 return {style:style,value:style.getPropertyValue?style.getPropertyValue("overflow"):style.overflow||"",priority:style.getPropertyPriority?style.getPropertyPriority("overflow"):""};
}
function restoreOverflow(saved){
 if(!saved)return;
 if(saved.value)saved.style.setProperty("overflow",saved.value,saved.priority);
 else saved.style.removeProperty("overflow");
}
function lock(doc){
 var state=locks.get(doc),win=doc.defaultView;
 if(!state){
  state={count:0,body:saveOverflow(doc.body),html:saveOverflow(doc.documentElement),x:win&&win.scrollX||0,y:win&&win.scrollY||0};
  locks.set(doc,state);
  [state.body,state.html].forEach(function(saved){if(saved)saved.style.setProperty("overflow","hidden","important");});
 }
 state.count++;
}
function unlock(doc){
 var state=locks.get(doc);
 if(!state)return true;
 if(--state.count>0)return false;
 restoreOverflow(state.body);restoreOverflow(state.html);locks.delete(doc);
 if(doc.defaultView&&doc.defaultView.scrollTo)doc.defaultView.scrollTo(state.x,state.y);
 return true;
}
function leaveNative(doc,host){
 if(fullscreenElement(doc)!==host)return;
 var leave=doc.exitFullscreen||doc.webkitExitFullscreen;
 if(leave)try{var pending=leave.call(doc);if(pending&&pending.catch)pending.catch(function(){});}catch(_ignored){}
}
exports.mount=function(options){
 var host=options.host,doc=host.ownerDocument,active=false,closed=false,marker=null,focus=null,nativeOwned=false;
 function exit(){
  if(!active)return false;
  active=false;nativeOwned=false;
  leaveNative(doc,host);
  host.classList.remove("huwabc-fullscreen-surface");
  if(marker){if(marker.parentNode){marker.parentNode.insertBefore(host,marker);marker.parentNode.removeChild(marker);}marker=null;}
  var last=unlock(doc);
  if(last&&focus&&focus.isConnected&&focus.focus)focus.focus({preventScroll:true});
  focus=null;
  return true;
 }
 function changed(){
  if(!active)return;
  if(fullscreenElement(doc)===host)nativeOwned=true;
  else if(nativeOwned){exit();if(options.onExit)options.onExit();}
 }
 doc.addEventListener("fullscreenchange",changed);
 doc.addEventListener("webkitfullscreenchange",changed);
 return {
  enter:function(requestNative){
   if(closed)return false;
   if(!active){
    active=true;focus=doc.activeElement;
    // Keep an existing fullscreen owner (e.g. a repertoire book). Its
    // descendants disappear if moved outside that browser top-layer surface.
    var owner=fullscreenElement(doc),insideOwner=owner&&owner!==doc.documentElement&&owner!==doc.body&&owner!==host&&owner.contains(host);
    if(host.parentNode&&host.parentNode!==doc.body&&!insideOwner){
     marker=doc.createComment("fullscreen reader position");host.parentNode.insertBefore(marker,host);doc.body.appendChild(host);
    }
    host.classList.add("huwabc-fullscreen-surface");lock(doc);
   }
   var current=fullscreenElement(doc),request=host.requestFullscreen||host.webkitRequestFullscreen;
   if(requestNative&&request&&!current){
    // Call synchronously in the click's user activation. Both old WebKit's
    // void return and modern rejected promises retain the full-window fallback.
    try{
     var pending=request.call(host);
     if(pending&&pending.then)pending.then(function(){if(!active)leaveNative(doc,host);else if(fullscreenElement(doc)===host)nativeOwned=true;},function(){});
     if(fullscreenElement(doc)===host)nativeOwned=true;
    }catch(_ignored){}
   }
   return true;
  },
  exit:exit,
  destroy:function(){if(closed)return;exit();closed=true;doc.removeEventListener("fullscreenchange",changed);doc.removeEventListener("webkitfullscreenchange",changed);},
  isActive:function(){return active;}
 };
};
})();
