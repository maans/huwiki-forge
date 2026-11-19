var coUi=require("$:/plugins/huwiki/cutout/i18n.js");
/*\
title: $:/plugins/huwiki/cutout/engine.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var M=require('$:/plugins/huwiki/cutout/model.js');
var NS='http://www.w3.org/2000/svg';
var PROPERTIES=['x','y','r','sx','sy','opacity'];
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function finite(n,f){n=Number(n);return Number.isFinite(n)?n:f;}
function interpolate(a,b,q,easing){if(easing==='step')return q>=1?b:a;if(easing!=='linear'){q=q*q*(3-2*q);}return a+(b-a)*q;}
// A theatre camera is a normal time track. It crops the complete rendered tree,
// including foreground objects, without changing any child pose or child clock.
function cameraState(scene,t){
 var base={x:finite(scene.width,800)/2,y:finite(scene.height,450)/2,zoom:1},track=scene.camera;
 var keys=track&&Array.isArray(track.keys)?track.keys.filter(function(k){return Number.isFinite(Number(k.t));}).slice().sort(function(a,b){return a.t-b.t;}):[];
 if(!keys.length)return base;
 var a=keys[0],b=a;
 if(t>=keys[keys.length-1].t)a=b=keys[keys.length-1];
 else if(t>keys[0].t){for(var i=0;i<keys.length-1;i++)if(t>=keys[i].t&&t<=keys[i+1].t){a=keys[i];b=keys[i+1];break;}}
 var span=b.t-a.t,q=span>0?clamp((t-a.t)/span,0,1):0,out={};
 ['x','y','zoom'].forEach(function(p){var av=finite(a[p],base[p]),bv=finite(b[p],av);out[p]=interpolate(av,bv,q,a.easing||track.easing||'smooth');});
 out.zoom=clamp(out.zoom,.25,16);return out;
}
function cameraBox(scene,t){var c=cameraState(scene,t),w=scene.width/c.zoom,h=scene.height/c.zoom;return {x:c.x-w/2,y:c.y-h/2,width:w,height:h};}
function state(part,t){
 var keys=(part.keys||[]).slice().sort(function(a,b){return a.t-b.t;});
 var base={x:0,y:0,r:0,sx:1,sy:1,opacity:1};
 var first=keys[0]||{t:0};
 if(!keys.length)return base;
 var k0=first,k1=first;
 if(t>=keys[keys.length-1].t){k0=k1=keys[keys.length-1];}
 else if(t<=first.t){k0=k1=first;}
 else{for(var i=0;i<keys.length-1;i++){if(t>=keys[i].t && t<=keys[i+1].t){k0=keys[i];k1=keys[i+1];break;}}}
 var span=k1.t-k0.t,q=span>0?clamp((t-k0.t)/span,0,1):0;
 var result={};PROPERTIES.forEach(function(key){
  var av=finite(k0[key],base[key]),bv=finite(k1[key],av);
  result[key]=interpolate(av,bv,q,k0.easing||part.easing||'smooth');
 });
 var held=keys.filter(function(k){return k.t<=t;}).pop()||first;
 result.variantId=held.variantId||part.variantId||'';
 return result;
}
function readScene(wiki,title){
 if(!title||!wiki)return null;
 var raw=wiki.getTiddlerText(title,'');var obj;
 try{obj=JSON.parse(raw);}catch(e){return null;}
 if(!obj||obj.version!==1||(!Array.isArray(obj.parts)&&!Array.isArray(obj.scenes)))return null;
 if(Array.isArray(obj.scenes)){obj.duration=obj.scenes.reduce(function(n,c){return n+Math.max(.1,finite(c.duration,4));},0);obj.parts=obj.parts||[];}
 obj.width=clamp(finite(obj.width,800),100,4000);obj.height=clamp(finite(obj.height,450),100,4000);
 obj.duration=Array.isArray(obj.scenes)?Math.max(.1,finite(obj.duration,.1)):clamp(finite(obj.duration,4),.25,3600);
 if(obj.parts.length>300)return null;
 Object.defineProperty(obj,"_title",{value:title});
 return obj;
}
function writeScene(wiki,title,scene){
 var prior=wiki.getTiddler(title);
 var base=prior?prior.fields:{title:title};
 wiki.addTiddler(new $tw.Tiddler(base,{title:title,type:'application/json',text:JSON.stringify(scene,null,2),'cutout-project':'yes'}));
}
function createSvg(doc,name){return doc.createElementNS(NS,name);}
function set(el,k,v){if(v!==undefined&&v!==null)el.setAttribute(k,String(v));}
function imageHref(wiki,part){
 if(part.imageData&&/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/.test(part.imageData))return part.imageData;
 if(part.asset||part.assetId){
  var assetTitle=M.resolve(wiki,part.assetId,part.asset);
  var asset=wiki.getTiddler(assetTitle);
  if(!asset)return '';
  var type=asset.fields.type||'';
  if(/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/.test(type)){
   if(asset.fields._canonical_uri)return asset.fields._canonical_uri;
   var content=wiki.getTiddlerText(assetTitle,'');
   if(/^data:image\//.test(content))return content;
   if(type==='image/svg+xml')return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(content);
   if(content)return 'data:'+type+';base64,'+content;
  }
 }
 if(part.src&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(part.src))return part.src;
 return '';
}
function graphic(doc,wiki,p){
 var tag=p.type==='circle'?'circle':p.type==='ellipse'?'ellipse':p.type==='rect'?'rect':p.type==='path'?'path':p.type==='text'?'text':p.type==='image'?'image':'g';
 var el=createSvg(doc,tag),g=p.geo||{};
 if(tag==='rect'){set(el,'x',finite(g.x,-40));set(el,'y',finite(g.y,-25));set(el,'width',Math.max(0,finite(g.w,80)));set(el,'height',Math.max(0,finite(g.h,50)));set(el,'rx',finite(g.rx,0));}
 else if(tag==='circle'){set(el,'r',Math.max(0,finite(g.r,25)));set(el,'cx',finite(g.cx,0));set(el,'cy',finite(g.cy,0));}
 else if(tag==='ellipse'){set(el,'rx',Math.max(0,finite(g.rx,30)));set(el,'ry',Math.max(0,finite(g.ry,18)));}
 else if(tag==='path'){set(el,'d',String(g.d||''));}
 else if(tag==='text'){el.textContent=String(p.text||coUi.t('Tekst'));set(el,'text-anchor',p.align||'middle');set(el,'font-size',finite(p.fontSize,32));set(el,'font-family',p.fontFamily||'system-ui, sans-serif');set(el,'font-weight',p.weight||600);set(el,'dominant-baseline','middle');}
 else if(tag==='image'){var variant=(p.variants||[]).find(function(v){return v.id===p.variantId;})||(p.variants||[])[0],href=imageHref(wiki,variant||p);set(el,'href',href||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect width="80" height="60" fill="#d7dce5"/><text x="40" y="38" text-anchor="middle" font-size="24" fill="#765">?</text></svg>'));}

 if(tag==='image'){set(el,'x',finite(g.x,-75));set(el,'y',finite(g.y,-55));set(el,'width',Math.max(1,finite(g.w,150)));set(el,'height',Math.max(1,finite(g.h,110)));set(el,'preserveAspectRatio','xMidYMid meet');}
 if(tag!=='image'){if(p.fill!==undefined)set(el,'fill',p.fill);else if(tag!=='g')set(el,'fill','#f0b457');if(p.stroke)set(el,'stroke',p.stroke);if(p.strokeWidth)set(el,'stroke-width',p.strokeWidth);if(p.rig){set(el,'stroke-linecap','round');set(el,'stroke-linejoin','round');}}
 return el;
}
// All descendants receive absolute local time. No descendant owns a timer.
// Before start: hidden + held at the initial offset. A loop boundary maps to 0;
// a non-looping endpoint is held, including when seeking backwards from the end.
function timing(t,duration,settings){settings=settings||{};var active=t>=finite(settings.start,0),value=(Math.max(t,finite(settings.start,0))-finite(settings.start,0))*finite(settings.speed,1)+finite(settings.offset,0);return {active:active,time:settings.loop&&duration>0?((value%duration)+duration)%duration:clamp(value,0,duration)};}
function localTime(t,duration,settings){return timing(t,duration,settings).time;}
function clipAt(clips,t){var start=0,total=clips.reduce(function(n,c){return n+Math.max(.1,finite(c.duration,4));},0);t=clamp(t,0,total);for(var i=0;i<clips.length;i++){var d=Math.max(.1,finite(clips[i].duration,4));if(t<start+d||i===clips.length-1)return {index:i,time:t-start};start+=d;}return {index:-1,time:0};}
function build(doc,wiki,scene,editable,ancestry){
 ancestry=(ancestry||[]).slice();if(scene._title)ancestry.push(scene._title);
 var svg=createSvg(doc,'svg');svg.setAttribute('viewBox','0 0 '+scene.width+' '+scene.height);svg.setAttribute('class','huw-cutout-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',scene.name||'CutOut-animation');
 var back=createSvg(doc,'rect');set(back,'width',scene.width);set(back,'height',scene.height);set(back,'fill',scene.background===undefined?'transparent':scene.background);svg.appendChild(back);
 var parts=scene.parts||[],byId={},children={},nodes={},clips=[];
 parts.forEach(function(p){byId[p.id]=p;});
 parts.forEach(function(p){var parent=(p.parent&&byId[p.parent]&&p.parent!==p.id)?p.parent:'root';(children[parent]||(children[parent]=[])).push(p);});
 function add(parent,id,visited,depth){if(depth>10)return;(children[id]||[]).forEach(function(p){
  if(visited[p.id])return;var seen=Object.assign({},visited);seen[p.id]=true;
  var holder=createSvg(doc,'g');holder.setAttribute('data-cutout-id',p.id);holder.setAttribute('class','huw-cutout-part');
  var nested=null,shape;
  if(p.type==='animation'){
   var target=M.resolve(wiki,p.animationId,p.animation);
   if(target&&ancestry.indexOf(target)<0&&ancestry.length<16){var child=readScene(wiki,target);if(child){nested=build(doc,wiki,child,false,ancestry);nested.duration=child.duration;shape=nested.svg;shape.setAttribute('class','co-nested-svg');var geo=p.geo||{};set(shape,'x',finite(geo.x,-100));set(shape,'y',finite(geo.y,-75));set(shape,'width',finite(geo.w,200));set(shape,'height',finite(geo.h,150));}}
   if(!shape){shape=createSvg(doc,'text');shape.textContent=coUi.t('⚠ Manglende eller cirkulær kilde');set(shape,'font-size',14);set(shape,'fill','#b42318');}
  }
  if(!shape)shape=graphic(doc,wiki,p);
  holder.appendChild(shape);parent.appendChild(holder);nodes[p.id]={el:holder,part:p,nested:nested,shape:shape,variant:null};
  add(holder,p.id,seen,depth+1);
  if(editable){var joint=createSvg(doc,'circle');set(joint,'cx',finite((p.pivot||{}).x,0));set(joint,'cy',finite((p.pivot||{}).y,0));set(joint,'r',8);joint.setAttribute('class','huw-cutout-joint');joint.setAttribute('data-cutout-joint','yes');holder.appendChild(joint);}
 });}
 add(svg,'root',{},0);
 (scene.scenes||[]).forEach(function(c){var target=M.resolve(wiki,c.sourceId,c.source||c.animation||c.theatre),source=target&&ancestry.indexOf(target)<0&&ancestry.length<16&&readScene(wiki,target),nested=source&&build(doc,wiki,source,false,ancestry),holder=createSvg(doc,'g');svg.appendChild(holder);if(nested){holder.appendChild(nested.svg);nested.svg.setAttribute('class','co-nested-svg');set(nested.svg,'width',scene.width);set(nested.svg,'height',scene.height);}else{var warning=createSvg(doc,'text');warning.textContent=coUi.t('⚠ Scene mangler eller er cirkulær');set(warning,'y',40);holder.appendChild(warning);}clips.push({el:holder,view:nested,duration:source?source.duration:1,settings:c});});
 // Foreground roots (for example the proscenium) stay above every scene clip.
 parts.forEach(function(p){if(p.foreground&&!p.parent&&nodes[p.id])svg.appendChild(nodes[p.id].el);});
 return {svg:svg,nodes:nodes,back:back,clips:clips,wiki:wiki,scene:scene};
}
function paint(view,t,selected){
 var camera=cameraBox(view.scene,t);set(view.svg,'viewBox',[camera.x,camera.y,camera.width,camera.height].join(' '));
 Object.keys(view.nodes).forEach(function(id){var v=view.nodes[id],p=v.part,s=state(p,t),pv=p.pivot||{x:0,y:0};
  if(v.nested){
   var ct=timing(t,v.nested.duration,p);
   v.el.setAttribute('display',ct.active?'inline':'none');
   // Hidden animation trees do not need a pose until they become active.
   // Use the absolute local clock when revealing them, so seeks in either
   // direction and loop boundaries do not depend on a previously painted frame.
   if(ct.active)paint(v.nested,ct.time);
  }
  if(p.type==='image'&&p.variants){var variant=p.variants.find(function(a){return a.id===s.variantId;})||p.variants[0];if(variant&&v.variant!==variant.id){set(v.shape,'href',imageHref(view.wiki,variant));v.variant=variant.id;}}
  var transform='translate('+s.x+' '+s.y+') rotate('+s.r+') scale('+s.sx+' '+s.sy+') translate('+(-finite(pv.x,0))+' '+(-finite(pv.y,0))+')';
  v.el.setAttribute('transform',transform);v.el.setAttribute('opacity',s.opacity);
  v.el.classList&&v.el.classList.toggle('huw-cutout-selected',selected===id);
 });
 if(view.clips.length){
  var at=clipAt(view.scene.scenes,t);
  view.clips.forEach(function(c,i){
   var active=i===at.index;
   c.el.setAttribute('display',active?'inline':'none');
   // Keep the complete tree for scene editing and dependency tracking, but
   // evaluate only the scene on stage. Updating every hidden scene made each
   // pointer movement in AniMus repaint the entire performance.
   if(active&&c.view)paint(c.view,localTime(at.time,c.duration,c.settings));
  });
 }
}
function dependencies(view){var out={};function walk(v){if(v.scene._title)out[v.scene._title]=true;Object.keys(v.nodes).forEach(function(id){var n=v.nodes[id],p=n.part;if(n.nested)walk(n.nested);[p].concat(p.variants||[]).forEach(function(a){var title=M.resolve(v.wiki,a.assetId,a.asset);if(title)out[title]=true;});});v.clips.forEach(function(c){if(c.view)walk(c.view);});}walk(view);return out;}
exports.dependencies=dependencies;
exports.cameraState=cameraState;exports.cameraBox=cameraBox;
exports.timing=timing;exports.clipAt=clipAt;exports.imageHref=imageHref;exports.localTime=localTime;exports.state=state;exports.readScene=readScene;exports.writeScene=writeScene;exports.build=build;exports.paint=paint;exports.clamp=clamp;exports.finite=finite;exports.PROPERTIES=PROPERTIES;
})();
