/*\
title: $:/plugins/huwiki/musical/layer-order.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var Reorder=require('$:/plugins/huwiki/musical/layer-reorder.js');
// The UI lists front-to-back; SVG paints in the reverse order. Reorder complete
// root subtrees so a shoulder/hand can never be separated from its character.
function reorderRoots(parts,frontOrder){
 var roots=parts.filter(function(p){return !p.parent;}).map(function(p){return p.id;});
 if(frontOrder.length!==roots.length||new Set(frontOrder).size!==roots.length||frontOrder.some(function(id){return roots.indexOf(id)<0;}))throw Error('Invalid layer order');
 var by={},owner={};parts.forEach(function(p){by[p.id]=p;});
 parts.forEach(function(p){var id=p.id,seen={};while(by[id]&&by[id].parent&&!seen[id]){seen[id]=true;id=by[id].parent;}owner[p.id]=id;});
 var ordered=[];frontOrder.slice().reverse().forEach(function(root){parts.forEach(function(p){if(owner[p.id]===root)ordered.push(p);});});
 // Preserve unrelated malformed/orphaned parts rather than dropping user data.
 parts.forEach(function(p){if(ordered.indexOf(p)<0)ordered.push(p);});return ordered;
}
function activeView(o){var Engine=require('$:/plugins/huwiki/cutout/engine.js'),v=o.view,time=o.position();for(var i=0;i<16&&v.clips&&v.clips.length;i++){var at=Engine.clipAt(v.scene.scenes||[],time),c=v.clips[at.index];if(!c||!c.view)break;time=Engine.localTime(at.time,c.duration,c.settings);v=c.view;}return v;}
function applyToViews(view,title,order){if(!view)return;
 if(view.scene&&view.scene._title===title){
  var roots=view.scene.parts.filter(function(p){return !p.parent;}).map(function(p){return view.nodes[p.id];}).filter(Boolean),anchor=roots.length&&roots[roots.length-1].el.nextSibling,parent=roots.length&&roots[0].el.parentNode;
  view.scene.parts=reorderRoots(view.scene.parts,order);
  if(parent)order.slice().reverse().forEach(function(id){var n=view.nodes[id];if(n)parent.insertBefore(n.el,anchor||null);});
 }
 (view.clips||[]).forEach(function(c){if(c.view)applyToViews(c.view,title,order);});Object.keys(view.nodes||{}).forEach(function(id){if(view.nodes[id].nested)applyToViews(view.nodes[id].nested,title,order);});
}
function el(doc,tag,cls,text,parent){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
function mount(o){var doc=o.doc,da=require('$:/plugins/huwiki/musical/language.js').isDanish(o.wiki),panel=null,disposeDrag=null,view=null,original='',returnFocus=null;
 function close(){if(disposeDrag)disposeDrag();disposeDrag=null;if(panel)panel.remove();panel=null;if(returnFocus&&returnFocus.focus)returnFocus.focus({preventScroll:true});}
 function open(){if(panel){close();return;}o.pause();returnFocus=doc.activeElement;view=activeView(o);if(!view||!view.scene._title)return;original=o.wiki.getTiddlerText(view.scene._title,'');
  panel=el(doc,'section','huw-layer-panel',undefined,o.host);panel.setAttribute('role','dialog');panel.setAttribute('aria-label',da?'Lag på scenen':'Stage layers');panel.tabIndex=-1;
  var header=el(doc,'header','',undefined,panel);el(doc,'strong','',da?'Lag · forrest øverst':'Layers · front at top',header);var exit=el(doc,'button','',da?'Luk':'Close',header);exit.onclick=close;
  var list=el(doc,'div','huw-layer-list',undefined,panel),status=el(doc,'output','','',panel);status.setAttribute('aria-live','polite');
  function commit(order,moved,keyboard){var title=view.scene._title;if(o.wiki.getTiddlerText(title,'')!==original){status.textContent=da?'Scenen er ændret. Åbn laglisten igen.':'The scene changed. Reopen Layers.';return;}
   applyToViews(o.view,title,order);var text=JSON.stringify(view.scene),old=o.wiki.getTiddler(title);o.markOwnWrite(title,text);o.wiki.addTiddler(new $tw.Tiddler(old,{text:text}));original=text;if(o.repaint)o.repaint();render();if(keyboard){var row=list.querySelector('[data-layer-id="'+moved.replace(/"/g,'')+'"] .huwrep-order-handle');if(row)row.focus({preventScroll:true});}status.textContent=da?'Lagrækkefølge gemt':'Layer order saved';
  }
  function render(){if(disposeDrag)disposeDrag();list.textContent='';var roots=view.scene.parts.filter(function(p){return !p.parent;}).slice().reverse(),ids=roots.map(function(p){return p.id;});roots.forEach(function(part,index){var row=el(doc,'div','huwrep-order-row',undefined,list);row.dataset.layerId=part.id;var handle=el(doc,'button','huwrep-order-handle','⠿',row);handle.type='button';handle.setAttribute('aria-label',(da?'Flyt lag: ':'Move layer: ')+(part.name||part.id));handle.title=da?'Træk, eller brug piletaster':'Drag, or use arrow keys';var name=el(doc,'button','huw-layer-name',part.name||part.id,row);name.onclick=function(){if(o.onSelect)o.onSelect(part.id);};[['↑',-1],['↓',1]].forEach(function(pair){var b=el(doc,'button','',pair[0],row);b.type='button';b.disabled=index+pair[1]<0||index+pair[1]>=ids.length;b.setAttribute('aria-label',(pair[1]<0?(da?'Frem: ':'Forward: '):(da?'Tilbage: ':'Backward: '))+(part.name||part.id));b.onclick=function(){var boundary=index+pair[1]+(pair[1]>0?1:0);commit(Reorder.move(ids,index,boundary),part.id,true);};});});disposeDrag=Reorder.mount(list,ids,commit);}
  panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}e.stopPropagation();});render();exit.focus({preventScroll:true});
 }
 return {open:open,close:close,dispose:close};
}
exports.reorderRoots=reorderRoots;exports.applyToViews=applyToViews;exports.mount=mount;
})();
