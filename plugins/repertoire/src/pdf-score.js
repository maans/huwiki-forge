/*\
title: $:/plugins/huwiki/repertoire/pdf-score.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var CONFIG='$:/config/maans/repertoire/pdf-viewer';
exports.mount=function(host,options){
 options=options||{};
 var doc=host.ownerDocument,win=doc.defaultView,closed=false,ready=false,pages=0,page=1,spread=Number(options.spread)===1?1:2;
 var frame=doc.createElement('iframe'),message=doc.createElement('p'),link=doc.createElement('a');
 frame.className='huwrep-book-pdf-frame';frame.title=options.title||'PDF-noder';
 frame.setAttribute('loading','eager');frame.setAttribute('allow','fullscreen');
 message.className='huwrep-muted huwrep-book-pdf-status';message.setAttribute('role','status');message.textContent='PDF-noderne indlæses …';
 var configured=options.wiki&&options.wiki.getTiddlerText?options.wiki.getTiddlerText(CONFIG,''):'';
 var origin=win.location&&win.location.origin,source,viewer;
 try{
  source=new URL(String(options.source||''),win.location.href);
  if(source.origin!==origin||!/^https?:$/.test(source.protocol))throw Error('PDF-noderne skal ligge på samme websted som wikien.');
  link.href=source.href;link.textContent='Åbn noderne som PDF';link.target='_blank';link.rel='noopener';link.className='huwrep-book-pdf-link';
  if(!configured)throw Error('PDF-viseren er ikke konfigureret i denne wiki. Åbn PDF-filen med linket nedenfor.');
  viewer=new URL(configured,win.location.href);
  if(viewer.origin!==origin||!/^https?:$/.test(viewer.protocol))throw Error('PDF-viseren skal ligge på samme websted som wikien.');
  viewer.searchParams.set('file',source.href);viewer.searchParams.set('spread',String(spread));viewer.searchParams.set('title',options.title||'');viewer.searchParams.set('embedded','1');if(options.onFullscreen){viewer.searchParams.set('fullscreen-owner','book');viewer.searchParams.set('fullscreen-active',options.isFullscreen&&options.isFullscreen()?'yes':'no');}frame.src=viewer.href;
  host.appendChild(frame);
 }catch(error){message.textContent=error.message||String(error);message.classList.add('huwrep-error');}
 host.appendChild(message);if(link.href)host.appendChild(link);
 function notify(){if(options.onState)options.onState(api.info());}
 function command(name,values){
  if(closed||!ready||!frame.contentWindow)return false;
  frame.contentWindow.postMessage(Object.assign({type:'birdland-pdf:command',command:name},values||{}),origin);return true;
 }
 function receive(event){
  if(closed||!viewer||event.origin!==origin||event.source!==frame.contentWindow)return;
  var state=event.data;if(!state||typeof state!=='object')return;
  if(state.type==='birdland-pdf:fullscreen'){if(options.onFullscreen)options.onFullscreen(state.exit===true);return;}
  if(state.type==='birdland-pdf:error'){message.hidden=false;message.textContent=String(state.message||'PDF-noderne kunne ikke vises. Åbn PDF-filen med linket.');message.classList.add('huwrep-error');return;}
  if(state.type==='birdland-pdf:boundary'){
   // A boundary can be reached while its final spread is still rendering.
   // Use the child's current position before the book decides to change song.
   if(Number.isInteger(state.pages)&&state.pages>0&&Number.isInteger(state.page)&&state.page>=1&&state.page<=state.pages){
    pages=state.pages;page=state.page;ready=true;if(state.spread===1||state.spread===2)spread=state.spread;
   }
   var direction=state.direction==='next'?1:state.direction==='previous'?-1:Number(state.direction||state.delta);
   if((direction===1||direction===-1)&&options.onBoundary)options.onBoundary(direction);return;
  }
  if(state.type!=='birdland-pdf:ready'&&state.type!=='birdland-pdf:state')return;
  if(!Number.isInteger(state.pages)||state.pages<1||!Number.isInteger(state.page)||state.page<1||state.page>state.pages)return;
  var first=!ready;pages=state.pages;page=state.page;ready=true;
  if(state.spread===1||state.spread===2)spread=state.spread;
  message.hidden=true;
  if(first&&options.isFullscreen)command('fullscreen-state',{active:!!options.isFullscreen()});
  notify();
  if(first&&options.onReady)options.onReady(api.info());
 }
 win.addEventListener('message',receive);
 var api={element:frame,info:function(){return {page:page,count:pages,shown:Math.min(spread,Math.max(1,pages-page+1)),mode:spread===2?'spread':'single',ready:ready};},
  go:function(index){return command('go',{page:Math.max(1,Math.floor(Number(index)||0)+1)});},
  next:function(){return command('next');},previous:function(){return command('previous');},
  setFullscreen:function(active){command('fullscreen-state',{active:!!active});},
  setSpread:function(value){value=Number(value)===1?1:2;if(value===spread)return;spread=value;if(ready)command('spread',{spread:spread});else if(viewer){viewer.searchParams.set('spread',String(spread));frame.src=viewer.href;}},
  destroy:function(){if(closed)return;closed=true;win.removeEventListener('message',receive);frame.remove();message.remove();link.remove();}};
 return api;
};
})();
