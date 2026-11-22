/*\
title: $:/plugins/huwiki/musical/material-preview.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var NS='http://www.w3.org/2000/svg',models=new Map(),modelBytes=0;
function clone(value){return JSON.parse(JSON.stringify(value));}
function queue(fetcher,Controller){
 var tasks=[],active=0,closed=false,controllers=[];
 function pump(){while(!closed&&active<2&&tasks.length){var task=tasks.shift();active++;run(task);}}
 async function run(task){var controller=new Controller();controllers.push(controller);var timer=setTimeout(function(){controller.abort();},15000);
  try{var response=await fetcher(task.url,{credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('Preview unavailable');var text=await response.text();if(text.length>2000000)throw Error('Preview too large');var model=JSON.parse(text);if(!Array.isArray(model.parts)||!model.parts.length||model.parts.length>300)throw Error('Invalid preview');if(!closed){models.set(task.url,{parts:model.parts,size:text.length});modelBytes+=text.length;while(modelBytes>4000000||models.size>64){var first=models.keys().next().value;modelBytes-=models.get(first).size;models.delete(first);}task.done(model.parts);}}
  catch(error){if(!closed)task.fail(error);}
  finally{clearTimeout(timer);controllers=controllers.filter(function(c){return c!==controller;});active--;pump();}
 }
 return {add:function(url,done,fail){if(!closed){var cached=models.get(url);if(cached){done(cached.parts);return;}tasks.push({url:url,done:done,fail:fail});pump();}},close:function(){closed=true;tasks=[];controllers.forEach(function(c){c.abort();});}};
}
function render(doc,wiki,host,entry,parts,Engine){
 var scene={version:1,width:960,height:540,duration:1,background:'transparent',parts:clone(parts)},media={};
 (entry.assets||[]).forEach(function(a){var local=a.title&&wiki.getTiddler(a.title);media[a.id]=local||{fields:{type:a.mime||'image/png',_canonical_uri:a.url}};if(a.title)media[a.title]=media[a.id];});
 var previewWiki={getTiddler:function(title){return media[title]||wiki.getTiddler(title);},getTiddlerText:function(title,fallback){var t=media[title];return t?t.fields.text||'':wiki.getTiddlerText(title,fallback);}};
 var view=Engine.build(doc,previewWiki,scene,false);Engine.paint(view,0);view.back.remove();
 var art=doc.createElementNS(NS,'g');view.svg.appendChild(art);
 scene.parts.filter(function(p){return !p.parent||!view.nodes[p.parent];}).forEach(function(p){if(view.nodes[p.id])art.appendChild(view.nodes[p.id].el);});
 host.textContent='';host.appendChild(view.svg);
 // An atlas crop is a nested SVG. getBBox() alone includes the hidden
 // remainder of its source sheet in some browsers, so use its viewport.
 var frame=art.getCTM().inverse(),points=[];
 Object.keys(view.nodes).forEach(function(id){var node=view.nodes[id],shape=node.shape,box;
  if(node.part.type==='group')return;
  if(node.part.type==='image')box={x:Number(shape.getAttribute('x')),y:Number(shape.getAttribute('y')),width:Number(shape.getAttribute('width')),height:Number(shape.getAttribute('height'))};
  else box=shape.getBBox();
  if(!box||!Number.isFinite(box.width)||!Number.isFinite(box.height)||box.width<=0||box.height<=0)return;
  var matrix=frame.multiply(node.el.getCTM());
  [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].forEach(function(c){var p=view.svg.createSVGPoint();p.x=c[0];p.y=c[1];points.push(p.matrixTransform(matrix));});
 });
 if(!points.length)throw Error('Empty preview');
 var xs=points.map(function(p){return p.x;}),ys=points.map(function(p){return p.y;}),x=Math.min.apply(null,xs),y=Math.min.apply(null,ys);
 var box={x:x,y:y,width:Math.max.apply(null,xs)-x,height:Math.max.apply(null,ys)-y};
 if(!box.width||!box.height)throw Error('Empty preview');
 var padding=Math.max(box.width,box.height)*.07;
 view.svg.setAttribute('viewBox',[box.x-padding,box.y-padding,box.width+2*padding,box.height+2*padding].join(' '));
 view.svg.setAttribute('preserveAspectRatio','xMidYMid meet');view.svg.setAttribute('aria-hidden','true');view.svg.setAttribute('focusable','false');
 return view;
}
function mount(doc,wiki,card,entry,work,da){
 var host=doc.createElement('div');host.className='huw-asset-preview';card.appendChild(host);
 function missing(){host.textContent=da?'Forhåndsvisning mangler':'Preview unavailable';host.setAttribute('data-preview-state','unavailable');}
 function draw(parts){try{render(doc,wiki,host,entry,parts,require('$:/plugins/huwiki/cutout/engine.js'));host.setAttribute('data-preview-state','ready');}catch(_bad){missing();}}
 if(entry.parts&&entry.parts.length){draw(entry.parts);return host;}
 if(entry.modelUrl&&/^https:\/\/(?:forge\.xn--mns-ula\.dk|raw\.githubusercontent\.com)\//.test(entry.modelUrl)){
  host.textContent=da?'Henter forhåndsvisning…':'Loading preview…';host.setAttribute('data-preview-state','loading');work.add(entry.modelUrl,draw,missing);return host;
 }
 var a=entry.assets&&entry.assets[0],local=a&&a.title&&wiki.getTiddler(a.title),src=entry.preview||a&&a.url;
 if(local&&/^image\//.test(local.fields.type||'')){src=local.fields._canonical_uri||(local.fields.type==='image/svg+xml'?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(local.fields.text):'data:'+local.fields.type+';base64,'+local.fields.text);}
 if(!src){missing();return host;}
 var img=doc.createElement('img');img.loading='lazy';img.alt='';img.onerror=missing;img.src=src;host.appendChild(img);return host;
}
exports.queue=queue;exports.render=render;exports.mount=mount;
})();
