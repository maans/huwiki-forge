/*\
title: $:/plugins/huwiki/musical/scenes.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Engine=require('$:/plugins/huwiki/cutout/engine.js');
function copy(x){return JSON.parse(JSON.stringify(x));}
function num(x,f){x=Number(x);return Number.isFinite(x)?x:f;}
function id(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
function el(doc,tag,cls,text,parent){var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
function key(){return {t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1};}
function blankScene(name){return {version:1,id:id('scene'),kind:'animation',name:name,width:800,height:450,duration:16,background:'#edf3f5',parts:[]};}
function ranges(film,resolve){
 var result=[];
 function walk(scene,base,span,path,seen,depth){
  if(!scene||depth>15)return;var clips=scene.scenes||[];
  if(!clips.length){result.push({id:path,start:base,duration:span,scene:scene});return;}
  var total=clips.reduce(function(n,c){return n+Math.max(.1,num(c.duration,4));},0),factor=span/Math.max(.1,total),offset=0;
  clips.forEach(function(c,i){var d=Math.max(.1,num(c.duration,4))*factor,next=resolve(c.source),childId=path+'/'+(c.id||c.source+'@'+i);
   if(next&&seen.indexOf(c.source)<0)walk(next,base+offset,d,childId,seen.concat(c.source),depth+1);
   else result.push({id:childId,start:base+offset,duration:d,scene:next});offset+=d;
  });
 }
 walk(film,0,num(film.duration,16),'film',[],0);return result;
}
function canFollowScenes(scene,resolve,seen){
 seen=seen||[];if(seen.length>15)return false;
 return (scene.scenes||[]).every(function(c){
  if(num(c.speed,1)!==1||num(c.offset,0)!==0||num(c.start,0)!==0||c.loop)return false;
  var child=resolve(c.source);if(!child||seen.indexOf(c.source)>=0)return false;
  if(child.scenes&&child.scenes.length&&Math.abs(num(child.duration,0)-num(c.duration,0))>.001)return false;
  return canFollowScenes(child,resolve,seen.concat(c.source));
 });
}
function retime(film,before,after){
 var oldEnd=before.reduce(function(n,r){return Math.max(n,r.start+r.duration);},0),newEnd=after.reduce(function(n,r){return Math.max(n,r.start+r.duration);},0);
 function at(time,end){time=Math.max(0,num(time,0));var old=before.find(function(r){return time>=r.start-(end?-.000001:0)&&time<r.start+r.duration-(end?-.000001:0);});
  if(Math.abs(time-oldEnd)<.000001)return newEnd;
  if(end)old=before.find(function(r){return time>r.start+.000001&&time<=r.start+r.duration+.000001;})||old;
  if(!old)return time;
  var next=after.find(function(r){return r.id===old.id;});if(!next)return time;
  return Math.round((next.start+Math.min(Math.max(0,time-old.start),next.duration))*1000)/1000;
 }
 var m=film.musical||{};
 [film.camera&&film.camera.keys,m.cameraB&&m.cameraB.keys,m.cuts,m.lighting&&m.lighting.keys,m.sfx]
 .concat((film.parts||[]).map(function(p){return p.keys;}))
 .concat(Object.keys(m.figureTransforms||{}).map(function(k){return m.figureTransforms[k].keys;}))
 .forEach(function(keys){(keys||[]).forEach(function(k){k.t=at(k.t);});if(keys)keys.sort(function(a,b){return a.t-b.t;});});
 (m.songs||[]).concat(m.audioClips||[]).forEach(function(c){c.start=at(c.start);});
 (m.animationClips||[]).forEach(function(c){var oldStart=num(c.start,0),oldDuration=num(c.duration,0),start=at(oldStart),end=at(oldStart+oldDuration,true);
  if(oldStart<=.000001&&oldStart+oldDuration>=oldEnd-.000001){c.start=0;c.duration=Math.max(.1,newEnd);}
  else{var range=before.find(function(r){return oldStart>=r.start&&oldStart<r.start+r.duration;});c.start=start;c.duration=range&&oldStart+oldDuration<=range.start+range.duration+.000001?Math.max(.1,end-start):Math.max(.1,oldDuration);}
  (c.accents||[]).forEach(function(k){k.t=at(k.t);});});
 return film;
}
function mount(o){
 var doc=o.doc,wiki=o.wiki,da=!/\/en(?:-|$)/i.test(wiki.getTiddlerText('$:/language',''));
 var popup=null,drafts={},originals={},film=null,items=[],choice='',dirty=false,follow=true,timingSafe=true,before=[];
 function button(host,text,fn){var b=el(doc,'button','',text,host);b.type='button';b.onclick=fn;return b;}
 function resolve(title){if(drafts[title])return drafts[title];var t=wiki.getTiddler(title);if(!t)return null;try{drafts[title]=JSON.parse(t.fields.text);originals[title]=t.fields.text;return drafts[title];}catch(_){return null;}}
 function entries(){var out=[];
  function walk(scene,title,base,path,depth){if(depth>15)return;var elapsed=0;
   (scene.scenes||[]).forEach(function(clip,i){var d=Math.max(.1,num(clip.duration,16)),child=resolve(clip.source),ref=path+'/'+(clip.id||clip.source+'@'+i);
    if(child&&child.scenes&&child.scenes.length)walk(child,clip.source,base+elapsed,ref,depth+1);
    else out.push({id:ref,clip:clip,scene:child,parent:scene,parentTitle:title,start:base+elapsed,index:i});elapsed+=d;
   });
  }walk(film,o.sceneTitle,0,'film',0);return out;
 }
 function selected(){return items.find(function(e){return e.id===choice;})||items[0];}
 function updateDurations(scene,seen){seen=seen||[];if(!scene.scenes)return num(scene.duration,16);
  scene.scenes.forEach(function(c){var child=resolve(c.source);if(child&&child.scenes&&seen.indexOf(c.source)<0)c.duration=updateDurations(child,seen.concat(c.source));});
  scene.duration=scene.scenes.reduce(function(n,c){return n+Math.max(.1,num(c.duration,16));},0);return scene.duration;
 }
 function mark(){dirty=true;updateDurations(film);items=entries();}
 function field(parent,label,value,type,fn){var wrap=el(doc,'label','huw-scene-field',undefined,parent);el(doc,'span','',label,wrap);var input=el(doc,'input','',undefined,wrap);input.type=type;input.value=value;input.onchange=function(){fn(input.value);mark();renderList();};return input;}
 function renderList(){var list=popup.querySelector('.huw-scene-list');list.textContent='';items.forEach(function(e,i){var b=button(list,(i+1)+'. '+(e.clip.name||e.scene&&e.scene.name||'Scene')+' · '+Math.round(e.start)+'s',function(){choice=e.id;render();});b.classList.toggle('is-active',selected()===e);});}
 function render(){renderList();var host=popup.querySelector('.huw-scene-details');host.textContent='';var e=selected();if(!e)return;
  field(host,da?'Scenens navn':'Scene name',e.clip.name||e.scene&&e.scene.name||'','text',function(v){e.clip.name=v;if(e.scene)e.scene.name=v;});
  var length=field(host,da?'Varighed (sek.)':'Duration (sec)',e.clip.duration,'number',function(v){e.clip.duration=Math.max(.25,Math.min(3600,num(v,e.clip.duration)));if(e.scene)e.scene.duration=Math.max(e.scene.duration||0,e.clip.duration);});length.min=.25;length.max=3600;length.step=.25;
  if(e.scene)field(host,da?'Baggrund':'Background',/^#[0-9a-f]{6}$/i.test(e.scene.background||'')?e.scene.background:'#edf3f5','color',function(v){e.scene.background=v;});
  var actions=el(doc,'div','huw-scene-actions',undefined,host);
  button(actions,da?'← Tidligere':'← Earlier',function(){var i=e.parent.scenes.indexOf(e.clip);if(i<1)return;e.parent.scenes.splice(i,1);e.parent.scenes.splice(i-1,0,e.clip);mark();render();}).disabled=e.index===0;
  button(actions,da?'Senere →':'Later →',function(){var i=e.parent.scenes.indexOf(e.clip);if(i>=e.parent.scenes.length-1)return;e.parent.scenes.splice(i,1);e.parent.scenes.splice(i+1,0,e.clip);mark();render();}).disabled=e.index===e.parent.scenes.length-1;
  button(actions,da?'+ Ny scene':'+ New scene',function(){var name=da?'Ny scene':'New scene',title=wiki.generateNewTitle((o.film.name||'AniMus')+' · '+name);while(drafts[title])title+=' 2';var next=blankScene(name);drafts[title]=next;originals[title]=null;
   var c={id:id('clip'),source:title,sourceId:next.id,name:name,duration:16,offset:0,speed:1,loop:false};e.parent.scenes.splice(e.index+1,0,c);mark();choice=items.find(function(x){return x.clip===c;}).id;render();});
  button(actions,da?'Vis scenen':'Show scene',function(){o.seek(e.start);});
  el(doc,'p','huw-scene-hint',da?'Dobbeltklik på en figur i scenen for at redigere dens dele og led. Brug Tegn SVG for at tilføje eller tegne en figur.':'Double-click a figure on stage to edit its parts and joints. Use Draw SVG to add or draw a figure.',host);
  var label=el(doc,'label','huw-scene-field',undefined,host),check=el(doc,'input','',undefined,label);check.type='checkbox';check.checked=follow;check.disabled=!timingSafe;el(doc,'span','',da?'Lad musik, lyd og sceneskift følge scenerne':'Move music, audio and stage cues with scenes',label);check.onchange=function(){follow=check.checked;};
  if(!timingSafe)el(doc,'p','huw-scene-hint',da?'Denne komposition bruger scene-loop, startforskydning eller ændret hastighed. Justér musik og lydklip på tidslinjen, når du flytter scener.':'This composition uses scene loops, offsets or speed changes. Adjust music and audio on the timeline when moving scenes.',host);
 }
 function close(force){if(!popup)return true;if(dirty&&!force&&!doc.defaultView.confirm(da?'Luk uden at gemme scenerne?':'Close without saving scenes?'))return false;popup.remove();popup=null;dirty=false;return true;}
 function save(){
  var conflicts=Object.keys(originals).filter(function(title){return originals[title]!==null&&wiki.getTiddlerText(title,'')!==originals[title];});
  if(conflicts.length){popup.querySelector('output').textContent=(da?'Scener ændret andetsteds: ':'Scenes changed elsewhere: ')+conflicts.join(', ');return;}
  updateDurations(film);if(follow)retime(film,before,ranges(film,resolve));
  Object.keys(drafts).forEach(function(title){var body=JSON.stringify(drafts[title]),prior=wiki.getTiddler(title);if(prior&&prior.fields.text===body)return;o.markOwnWrite(title,body);wiki.addTiddler(new $tw.Tiddler(prior||{title:title,type:'application/json','cutout-project':'yes','cutout-id':drafts[title].id},{text:body}));});
  close(true);o.reload();
 }
 function open(){if(popup)return true;o.pause();drafts={};originals={};film=resolve(o.sceneTitle);if(!film)return false;items=entries();if(!items.length)return false;
  before=ranges(copy(film),function(t){return copy(resolve(t));});choice=(items.find(function(e){return o.position()>=e.start&&o.position()<e.start+e.clip.duration;})||items[0]).id;dirty=false;timingSafe=canFollowScenes(film,resolve);follow=timingSafe;
  popup=el(doc,'section','huw-scene-workshop',undefined,o.host);popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label',da?'Scener og rækkefølge':'Scenes and order');popup.tabIndex=-1;
  var head=el(doc,'header','huw-scene-workshop-header',undefined,popup);el(doc,'strong','',da?'Scener og rækkefølge':'Scenes and order',head);button(head,da?'Annuller':'Cancel',function(){close(false);});button(head,da?'Gem og tilbage':'Save and return',save).classList.add('huw-scene-save');
  var body=el(doc,'div','huw-scene-workshop-body',undefined,popup);el(doc,'div','huw-scene-list',undefined,body);el(doc,'div','huw-scene-details',undefined,body);var footer=el(doc,'footer','huw-scene-footer',undefined,popup);el(doc,'output','','',footer);
  popup.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close(false);}});render();popup.focus({preventScroll:true});return true;
 }
 function activeScene(){var current=o.view,local=o.position();for(var depth=0;depth<16&&current.clips&&current.clips.length;depth++){var hit=Engine.clipAt(current.scene.scenes||[],local),clip=current.clips[hit.index];if(!clip||!clip.view)break;local=Engine.localTime(hit.time,clip.duration,clip.settings);current=clip.view;}return current.scene;}
 function draw(){
  o.pause();var selected=o.editor.getSelection(),partId=selected&&(selected.part||selected.target),target=partId&&o.editor.resolvePartScene(partId)||activeScene();
  if(!target||!target._title)return false;
  var data=copy(target),part=partId&&data.parts.find(function(p){return p.id===partId;});
  if(!part){part={id:id('drawing'),name:da?'Ny tegning':'New drawing',type:'group',parent:null,pivot:{x:0,y:0},geo:{},keys:[Object.assign(key(),{x:target.width/2,y:target.height/2})]};data.parts.push(part);}
  var Svg=require('$:/plugins/huwiki/cutout/svg-layers.js');
  Svg.open({doc:doc,wiki:wiki,host:o.host,part:part,duration:target.duration,da:da,onSave:function(layers,settings){
   Svg.applyToParts(data.parts,part,layers,settings);var title=target._title,old=wiki.getTiddler(title);if(!old)return false;
   var body=JSON.stringify(data);o.markOwnWrite(title,body);wiki.addTiddler(new $tw.Tiddler(old,{text:body}));o.reload();return true;
  }});return true;
 }
 return {open:open,draw:draw,close:close,dispose:function(){close(true);}};
}
exports.blankScene=blankScene;exports.ranges=ranges;exports.retime=retime;exports.canFollowScenes=canFollowScenes;exports.mount=mount;
})();
