/*\
title: $:/plugins/huwiki/musical/puppet.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// The workshop edits the same hierarchy and asset schema as CutOut Edition.
// It never converts an animated scene part into an unrelated canvas object.
var Engine=require("$:/plugins/huwiki/cutout/engine.js");
var Model=require("$:/plugins/huwiki/cutout/model.js");
function optionalSvgLayers(){
 try{var api=require("$:/plugins/huwiki/cutout/svg-layers.js");return api&&typeof api.open==="function"?api:null;}
 catch(_missing){return null;}
}

var NS="http://www.w3.org/2000/svg";
function el(doc,tag,cls,text,parent){var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
function clone(v){return JSON.parse(JSON.stringify(v));}
function n(v,f){var x=Number(v);return Number.isFinite(x)?x:f;}
function r(v){return Math.round(v*100)/100;}
function yes(wiki){return !/\/en(?:-|$)/i.test(wiki.getTiddlerText("$:/language",""));}
function descendants(parts,root){var ids={},nodes={};parts.forEach(function(p){nodes[p.id]=p;});
 function walk(id){if(ids[id])return;ids[id]=true;parts.forEach(function(p){if(p.parent===id)walk(p.id);});}walk(root);
 return parts.filter(function(p){return ids[p.id];});}
function rootFor(id,scene,film){var byId={};(scene.parts||[]).forEach(function(p){byId[p.id]=p;});
 var seen={};while(byId[id]&&!seen[id]){seen[id]=true;var p=byId[id];if((film.musical&&film.musical.animationClips||[]).some(function(c){return c.target===id;}))return id;if(!p.parent)return id;id=p.parent;}return null;}
function validateSvg(str){
 var parsed=new DOMParser().parseFromString(str,"image/svg+xml");
 if(!parsed.documentElement||parsed.documentElement.localName!=="svg"||parsed.querySelector("parsererror,script,foreignObject,iframe,object,embed,style,animate,set,animateTransform"))throw Error("SVG skal være en statisk tegning uden scripts.");
 Array.prototype.forEach.call(parsed.querySelectorAll("*"),function(node){Array.prototype.forEach.call(node.attributes,function(a){
  if(/^on/i.test(a.name)||(/(?:href|src)$/i.test(a.name)&&!/^(?:data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]|#)/i.test(a.value))||/url\(\s*[^#]/i.test(a.value))throw Error("Eksternt indhold er ikke tilladt i SVG.");
 });});return str;
}
function partBase(p){var k=(p.keys&&p.keys[0])||{t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1};return k;}
function applyKeys(p,field,value){var current=n(partBase(p)[field],field==="sx"||field==="sy"||field==="opacity"?1:0),delta=value-current;
 if(!Array.isArray(p.keys)||!p.keys.length)p.keys=[{t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1}];
 p.keys.forEach(function(k){if(field==="sx"||field==="sy"||field==="opacity")k[field]=value;else k[field]=r(n(k[field],0)+delta);});}
function imageInfo(p){var g=p.geo||{},w=60,h=60,x=-30,y=-30;
 if(p.type==="image"||p.type==="rect"){w=n(g.w,60);h=n(g.h,60);x=n(g.x,-w/2);y=n(g.y,-h/2);}
 else if(p.type==="ellipse"){w=2*n(g.rx,25);h=2*n(g.ry,25);x=-w/2;y=-h/2;}
 else if(p.type==="circle"){w=h=2*n(g.r,25);x=-w/2;y=-h/2;}
 else if(p.type==="path"){
  var numbers=String(g.d||"").match(/-?\d+(?:\.\d+)?/g)||[];
  if(numbers.length>=4){var coords=numbers.map(Number),xx=[],yy=[];for(var i=0;i<coords.length-1;i+=2){xx.push(coords[i]);yy.push(coords[i+1]);}
   x=Math.min.apply(null,xx);y=Math.min.apply(null,yy);w=Math.max(15,Math.max.apply(null,xx)-x);h=Math.max(15,Math.max.apply(null,yy)-y);}
 }
 return {x:r(x),y:r(y),w:r(Math.max(15,Math.min(300,w))),h:r(Math.max(15,Math.min(300,h)))};
}
function mount(o){
 var doc=o.doc,stage=o.view.clips&&o.view.clips[0]&&o.view.clips[0].view,source=stage&&stage.scene,film=o.film;
 if(!source||!Array.isArray(source.parts))return {open:function(){return false;},isOpen:function(){return false;},close:function(){}};
 var da=yes(o.wiki),L=da?{
  title:"Dukkeværksted",back:"← Tilbage til animationen",save:"Gem og tilbage",cancel:"Annuller",tree:"Dukkens dele",settings:"Valgt del",choose:"Vælg en del på dukken eller i listen",name:"Navn",parent:"Forbundet med",none:"Dukkens rod",rot:"Drejning",pivot:"Drejepunkt",replace:"Udskift delens udseende",import:"Importér SVG/PNG/billede",copy:"Kopiér udseende fra",circle:"Cirkel",ellipse:"Ellipse",rect:"Firkant",stroke:"Streg",color:"Farve",elbow:"Del op med led",library:"Gem kopi som CutOut-dukke",svgLayers:"✎ Tegn i SVG-lag",hint:"Træk en del på dukken. Led og børn følger automatisk med. Ændringer gemmes først med Gem.",bad:"Dukkehierarkiet er ugyldigt",saved:"Ændringerne er gemt i CutOut-scenen.",removed:"Gemte ændringer kan fortrydes ved at annullere, før du gemmer."}:{
  title:"Puppet workshop",back:"← Back to animation",save:"Save and back",cancel:"Cancel",tree:"Puppet parts",settings:"Selected part",choose:"Select a part on the puppet or in the list",name:"Name",parent:"Connected to",none:"Puppet root",rot:"Rotation",pivot:"Pivot",replace:"Replace part appearance",import:"Import SVG/PNG/image",copy:"Copy appearance from",circle:"Circle",ellipse:"Ellipse",rect:"Rectangle",stroke:"Line",color:"Color",elbow:"Split at joint",library:"Save copy to CutOut library",svgLayers:"✎ Draw SVG layers",hint:"Drag parts directly on the puppet. Children follow their joints. Changes are saved only when you press Save.",bad:"Invalid puppet hierarchy",saved:"Changes saved to the CutOut scene.",removed:"You can cancel unsaved changes."};
 var overlay=null,drawing=null,activeRoot="",activeStageTitle="",previewFrame=null,workshopTitle="",parts=[],selected="",clip=null,canvas=null,tree=null,inspector=null,msg=null,preview=null,dirty=false,libraryRequested=false,originalIds={},cancelInteraction=null;
 // The Fyrtøjet performance contains acts -> scenes -> figures. Locate the
 // actual nested source instead of assuming all puppets live in scene one.
 function findView(v,id,depth){if(!v||depth>14)return null;
  if(v.scene&&Array.isArray(v.scene.parts)&&v.scene.parts.some(function(p){return p.id===id;}))return v;
  var found=null;(v.clips||[]).some(function(c){found=findView(c.view,id,depth+1);return !!found;});return found;
 }
 function lookup(id){return parts.find(function(p){return p.id===id;});}
 function close(){if(cancelInteraction)cancelInteraction();if(drawing){drawing.close(true);drawing=null;}if(!overlay)return;overlay.remove();overlay=null;o.host.classList.remove("huw-musical--puppet-open");activeRoot="";}
 function exit(){if(dirty&&doc.defaultView&&!doc.defaultView.confirm(da?"Luk uden at gemme ændringerne i figuren?":"Close without saving changes to the figure?"))return;close();o.host.focus({preventScroll:true});}
 function writable(){dirty=true;if(msg)msg.textContent=da?"Ikke gemt endnu":"Not saved yet";}
 function selectedNode(){return lookup(selected);}
 function setPreviewFrame(){
  if(preview&&preview.svg&&previewFrame)preview.svg.setAttribute('viewBox',previewFrame.join(' '));
 }
 function fitPreview(){
  if(!preview||!preview.svg)return;
  // Fit visible painted shapes, not the hierarchy's joints: scenery may
  // have its joint at (0,0) and all of its artwork 500px to the right.
  var bounds=null,xs=[],ys=[];
  try{
   var rootMatrix=preview.svg.getCTM();
   if(rootMatrix){var inverse=rootMatrix.inverse();
    parts.forEach(function(part){
     var node=preview.nodes&&preview.nodes[part.id],shape=node&&node.shape;
     if(!shape||!shape.getBBox||shape.localName==='g')return;
     var bb=shape.getBBox(),m=shape.getCTM();
     if(!m||!bb||bb.width<=0||bb.height<=0)return;
     var transform=inverse.multiply(m);
     [[bb.x,bb.y],[bb.x+bb.width,bb.y],[bb.x+bb.width,bb.y+bb.height],[bb.x,bb.y+bb.height]].forEach(function(c){
      xs.push(transform.a*c[0]+transform.c*c[1]+transform.e);
      ys.push(transform.b*c[0]+transform.d*c[1]+transform.f);
     });
    });
   }
   if(xs.length)bounds={x:Math.min.apply(null,xs),y:Math.min.apply(null,ys),w:Math.max.apply(null,xs)-Math.min.apply(null,xs),h:Math.max.apply(null,ys)-Math.min.apply(null,ys)};
  }catch(_ignored){}
  if(!bounds||!(bounds.w>0&&bounds.h>0)){
   // A bare group has no geometry; keep its pivot visible for building.
   var base=Engine.state(lookup(activeRoot)||{keys:[]},0);
   bounds={x:base.x-60,y:base.y-60,w:120,h:120};
  }
  // Leave breathing room for joints; preserve the drawing instead of
  // forcing large scenery into the 290-pixel puppet close-up.
  var pad=Math.max(18,Math.max(bounds.w,bounds.h)*.13);
  var w=Math.max(130,bounds.w+pad*2),h=Math.max(120,bounds.h+pad*2);
  var cx=bounds.x+bounds.w/2,cy=bounds.y+bounds.h/2;
  previewFrame=[r(cx-w/2),r(cy-h/2),r(w),r(h)];setPreviewFrame();
 }
 function clearSelection(){if(cancelInteraction)cancelInteraction();selected="";renderTree();renderInspector();if(preview){Engine.paint(preview,0,selected);setPreviewFrame();}if(overlay)overlay.focus({preventScroll:true});}
 function choose(id){if(!lookup(id))return;if(cancelInteraction)cancelInteraction();selected=id;renderTree();renderInspector();
  if(preview){Engine.paint(preview,0,selected);setPreviewFrame();}
 }
 function renderPreview(){
  if(!canvas)return;canvas.textContent="";
  var isolated={version:1,kind:"puppet",width:800,height:450,background:"transparent",name:clip&&clip.name||workshopTitle||L.title,parts:parts};
  preview=Engine.build(doc,o.wiki,isolated,true);
  preview.svg.setAttribute("aria-label",workshopTitle||L.title);canvas.appendChild(preview.svg);
  Engine.paint(preview,0,selected);
  // Preserve zoom across selection changes and SVG redraws.
  if(!previewFrame)fitPreview();else setPreviewFrame();
 }
 function renderTree(){if(!tree)return;tree.textContent="";
  var byId={};parts.forEach(function(p){byId[p.id]=p;});
  parts.forEach(function(p){var depth=0,up=p.parent,visited={};while(up&&byId[up]&&!visited[up]){depth++;visited[up]=true;up=byId[up].parent;}
   var b=el(doc,"button","huw-puppet-part",p.name||p.id,tree);b.type="button";b.style.paddingLeft=(12+Math.min(7,depth)*14)+"px";
   b.title=p.id;b.dataset.partId=p.id;b.classList.toggle("is-active",selected===p.id);b.onclick=function(){choose(p.id);};
  });}
 function input(label,value,type,onchange,host){var wrapper=el(doc,"label","huw-puppet-field",undefined,host||inspector);el(doc,"span","",label,wrapper);
  var field=el(doc,"input","",undefined,wrapper);field.type=type;field.value=value===undefined?"":String(value);
  field.onchange=function(){onchange(type==="number"?Number(field.value):field.value);};return field;}
 function button(host,label,onClick){var b=el(doc,"button","huw-puppet-action",label,host);b.type="button";b.onclick=onClick;return b;}
 function appearance(to,from){var generated=to.svgLayerIds||{};Object.keys(generated).forEach(function(id){parts=parts.filter(function(p){return p.id!==generated[id];});});delete to.svgDrawing;delete to.svgLayerIds;["type","geo","fill","stroke","strokeWidth","rig","text","fontSize","align","weight","fontFamily","variants","variantId","asset","assetId","imageData","src"].forEach(function(k){delete to[k];if(from[k]!==undefined)to[k]=clone(from[k]);});}
 function selectImage(file){if(!file)return;var allowed=/^image\/(png|jpeg|webp|svg\+xml)$/i;
  if(!allowed.test(file.type)||file.size>8*1024*1024){msg.textContent=da?"Vælg SVG, PNG, JPEG eller WebP under 8 MB.":"Choose an SVG, PNG, JPEG or WebP under 8 MB.";return;}
  function use(data){var p=selectedNode();if(!p)return;
   var bounds=imageInfo(p);p.type="image";p.geo=bounds;var v={id:Model.id("variant"),name:file.name,imageData:data};
   p.variants=(p.variants||[]).concat([v]);p.variantId=v.id;delete p.imageData;delete p.asset;delete p.assetId;writable();renderPreview();renderInspector();}
  if(file.type==="image/svg+xml")file.text().then(function(s){validateSvg(s);use("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s));}).catch(function(err){msg.textContent=err.message;});
  else{var reader=new FileReader();reader.onload=function(){use(reader.result);};reader.onerror=function(){msg.textContent=String(reader.error);};reader.readAsDataURL(file);}
 }
 function splitLimb(){var p=selectedNode();if(!p||p.type!=="path")return;
  var path=String(p.geo&&p.geo.d||""),match=path.match(/^M\s*0(?:\.0+)?[ ,]+0(?:\.0+)?\s+L\s*(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/i);
  if(!match){msg.textContent=da?"Kan kun opdele en enkel streg fra et led.":"Can split a simple line starting at the joint.";return;}
  var dx=Number(match[1]),dy=Number(match[2]),newId=p.id+"-lower",index=1;
  while(lookup(newId)||source.parts.some(function(q){return q.id===newId;}))newId=p.id+"-lower-"+(++index);
  var midX=r(dx/2),midY=r(dy/2),child={id:newId,name:(p.name||p.id)+(da?" · underdel":" · lower"),type:"path",parent:p.id,pivot:{x:0,y:0},geo:{d:"M0 0 L"+midX+" "+midY},stroke:p.stroke||"#17202f",strokeWidth:p.strokeWidth||5,fill:"none",rig:true,keys:[{t:0,x:midX,y:midY,r:0,sx:1,sy:1,opacity:1}]};
  p.geo.d="M0 0 L"+midX+" "+midY;parts.splice(parts.indexOf(p)+1,0,child);selected=newId;writable();renderAll();
 }
 function renderInspector(){if(!inspector)return;inspector.textContent="";var p=selectedNode();if(!p){el(doc,"p","huw-puppet-hint",L.choose,inspector);return;}
  el(doc,"h3","",p.name||p.id,inspector);
  input(L.name,p.name||p.id,"text",function(v){p.name=v;writable();renderTree();renderInspector();});
  var parentLabel=el(doc,"label","huw-puppet-field",undefined,inspector);el(doc,"span","",L.parent,parentLabel);var select=el(doc,"select","",undefined,parentLabel);
  var opt=el(doc,"option","",L.none,select);opt.value="";
  var invalid={};descendants(parts,p.id).forEach(function(d){invalid[d.id]=true;});
  parts.forEach(function(q){if(!invalid[q.id]){var item=el(doc,"option","",q.name||q.id,select);item.value=q.id;}});
  select.value=p.parent||"";select.disabled=p.id===activeRoot;
  select.onchange=function(){var last=p.parent||"";p.parent=select.value;if(Model.validate({parts:parts}).length){p.parent=last;msg.textContent=L.bad;select.value=last;return;}writable();renderAll();};
  var k=partBase(p);
  [["x","X"],["y","Y"],["r",L.rot],["sx","Scale X"],["sy","Scale Y"]].forEach(function(item){
   var field=item[0];input(item[1],r(n(k[field],field[0]==="s"?1:0)),"number",function(v){if(!Number.isFinite(v)||((field==="sx"||field==="sy")&&v<=.01))return;applyKeys(p,field,v);writable();renderPreview();renderInspector();});
  });
  el(doc,"strong","huw-puppet-section-title",L.pivot,inspector);
  [["x","X"],["y","Y"]].forEach(function(item){input(item[1],n((p.pivot||{})[item[0]],0),"number",function(v){if(!Number.isFinite(v))return;p.pivot=p.pivot||{};p.pivot[item[0]]=v;writable();renderPreview();renderInspector();});});
  el(doc,"strong","huw-puppet-section-title",L.replace,inspector);
  if(p.type!=="group"&&p.type!=="image"){
   var colors=input(L.color,p.stroke||p.fill||"#dba04b","color",function(v){if(p.type==="path")p.stroke=v;else p.fill=v;writable();renderPreview();});
   colors.value=/^#[0-9a-f]{6}$/i.test(colors.value)?colors.value:"#dba04b";
  }
  var shapes=el(doc,"div","huw-puppet-presets",undefined,inspector);
  [["circle",L.circle,{r:13}],["ellipse",L.ellipse,{rx:20,ry:13}],["rect",L.rect,{x:-16,y:-12,w:32,h:24}],["path",L.stroke,{d:"M0 0 L0 34"}]].forEach(function(row){button(shapes,row[1],function(){appearance(p,{type:row[0],geo:row[2],fill:row[0]==="path"?"none":"#eab970",stroke:row[0]==="path"?"#243549":"#5b4053",strokeWidth:row[0]==="path"?5:1,rig:row[0]==="path"});writable();renderPreview();renderInspector();});});
  var copyLabel=el(doc,"label","huw-puppet-field",undefined,inspector);el(doc,"span","",L.copy,copyLabel);
  var copy=el(doc,"select","",undefined,copyLabel);el(doc,"option","",da?"— Vælg del —":"— Choose part —",copy).value="";
  source.parts.forEach(function(q){if(q.id!==p.id&&q.type!=="group"){var option=el(doc,"option","",q.name||q.id,copy);option.value=q.id;}});
  copy.onchange=function(){var other=source.parts.find(function(q){return q.id===copy.value;});if(!other)return;appearance(p,other);writable();renderPreview();renderInspector();};
  button(inspector,L.svgLayers,function(){
   var SvgLayers=optionalSvgLayers();
   if(!SvgLayers){if(msg)msg.textContent=da?"SVG-lagværkstedet mangler i denne betaversion.":"The SVG layer workshop is unavailable in this beta.";return;}
   drawing=SvgLayers.open({doc:doc,wiki:o.wiki,host:overlay,part:p,da:da,duration:source.duration||4,onClose:function(){drawing=null;},onSave:function(layers,settings){
    SvgLayers.applyToParts(parts,p,layers,settings);
    selected=p.id;writable();renderAll();return true;
   }});
  });
  var row=el(doc,"label","huw-puppet-file",L.import,inspector);var file=el(doc,"input","",undefined,row);file.type="file";file.accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp";
  file.onchange=function(){selectImage(file.files&&file.files[0]);};
  if(p.type==="path")button(inspector,L.elbow,splitLimb);
  if(p.type==="image"&&(p.variants||[]).length>1){var variantLabel=el(doc,"label","huw-puppet-field",undefined,inspector);el(doc,"span","",da?"Billedvariant":"Image variant",variantLabel);
   var variant=el(doc,"select","",undefined,variantLabel);(p.variants||[]).forEach(function(v){var op=el(doc,"option","",v.name||v.id,variant);op.value=v.id;});variant.value=p.variantId;variant.onchange=function(){p.variantId=variant.value;writable();renderPreview();};}
 }
 function renderAll(){renderPreview();renderTree();renderInspector();}
 function installAssets(){parts.forEach(function(p){(p.variants||[]).forEach(function(v){if(!v.imageData)return;
   var id=Model.id("asset"),title="CutOut/Assets/"+id,raw=v.imageData,match=/^data:(image\/(?:svg\+xml|png|jpeg|webp))/.exec(raw);
   if(!match)throw Error("Unsupported image");o.wiki.addTiddler(new $tw.Tiddler({title:title,type:match[1],"cutout-id":id,caption:v.name||p.name||"Billede",tags:["CutOut Assets"],text:raw}));
   v.asset=title;v.assetId=id;delete v.imageData;
  });});}
 function rebuildStage(){
  function walk(outer){(outer.clips||[]).forEach(function(sceneClip){var current=sceneClip.view;if(!current)return;
   if(current.scene===source){
    var old=current.svg,next=Engine.build(doc,o.wiki,source,false);next.svg.setAttribute('class','co-nested-svg');
    next.svg.setAttribute('width',old.getAttribute('width')||o.film.width||800);
    next.svg.setAttribute('height',old.getAttribute('height')||o.film.height||450);
    if(old.parentNode)old.parentNode.replaceChild(next.svg,old);sceneClip.view=next;
   }else walk(current);
  });}walk(o.view);o.repaint();
 }
 function save(){if(cancelInteraction)cancelInteraction();var before=source.parts||[],rootIndex=before.findIndex(function(p){return p.id===activeRoot;}),combined=before.filter(function(p){return !originalIds[p.id];});
  // Keep the edited subtree's painter order, including SVG layers moved forward
  // or backward. Inserting every new child after its parent reverses the stack.
  var insertion=before.slice(0,Math.max(0,rootIndex)).filter(function(p){return !originalIds[p.id];}).length;
  combined.splice.apply(combined,[insertion,0].concat(parts));
  if(combined.length>300){msg.textContent=da?"Scenen kan højst have 300 dele. Brug færre SVG-lag.":"A scene supports at most 300 parts. Use fewer SVG layers.";return false;}
  var problem=Model.validate({parts:combined});if(problem.length){msg.textContent=problem.join(" · ");return false;}
  try{installAssets();}catch(err){msg.textContent=err.message;return false;}
  source.parts=combined;
  var changedParts=parts.filter(function(p){return !originalIds[p.id];});
  if(changedParts.length&&clip){var loops=film.musical&&film.musical.animationClips||[];var savedClip=loops.find(function(c){return c.id===clip.id;});
   if(savedClip){savedClip.motion=savedClip.motion||{};changedParts.forEach(function(p){if(!savedClip.motion[p.id]){var key=Object.assign({},partBase(p)),tail=Object.assign({},key,{t:n(savedClip.beatsPerLoop,8)});savedClip.motion[p.id]=[key,tail];}});}}
  var stageTitle=activeStageTitle||o.stageTitle,prior=o.wiki.getTiddler(stageTitle);if(!prior){msg.textContent="CutOut scene not found";return false;}
  var body=JSON.stringify(source);o.markOwnWrite(stageTitle,body);o.wiki.addTiddler(new $tw.Tiddler(prior,{title:stageTitle,text:body}));
  if(changedParts.length){var filmPrior=o.wiki.getTiddler(o.sceneTitle),filmBody=JSON.stringify(film);if(filmPrior){o.markOwnWrite(o.sceneTitle,filmBody);o.wiki.addTiddler(new $tw.Tiddler(filmPrior,{title:o.sceneTitle,text:filmBody}));}}
  if(libraryRequested){var title=o.wiki.generateNewTitle((clip&&clip.name||"Musical")+(da?" – dukke":" – puppet"));
   Model.write(o.wiki,title,{version:1,kind:"puppet",name:clip&&clip.name||L.title,width:800,height:450,duration:4,background:"transparent",parts:clone(parts)},"puppet");}
  rebuildStage();o.editor.redraw();dirty=false;exit();return true;
 }
 function open(id){var chosenView=findView(o.view,id,0);if(!chosenView)return false;
  source=chosenView.scene;activeStageTitle=source._title||o.stageTitle;
  var root=rootFor(id,source,film);if(!root)return false;var all=descendants(source.parts,root);if(!all.length)return false;
  if(overlay)close();activeRoot=root;previewFrame=null;parts=clone(all);selected=id&&parts.some(function(p){return p.id===id;})?id:root;
  dirty=false;libraryRequested=false;originalIds={};all.forEach(function(p){originalIds[p.id]=true;});
  clip=(film.musical&&film.musical.animationClips||[]).find(function(c){return c.target===root;})||null;
  workshopTitle=clip?L.title:(da?"Objektværksted":"Object workshop");
  o.pause();o.host.classList.add("huw-musical--puppet-open");
  overlay=el(doc,"section","huw-puppet-workshop",undefined,o.host);overlay.tabIndex=0;
  var bar=el(doc,"header","huw-puppet-appbar",undefined,overlay);
  button(bar,L.back,exit).classList.add("huw-puppet-back");
  var title=el(doc,"div","huw-puppet-brand",undefined,bar);el(doc,"strong","",workshopTitle,title);el(doc,"span","",clip&&clip.name||root,title);
  var closeBtn=button(bar,L.cancel,exit);closeBtn.classList.add("huw-puppet-cancel");
  button(bar,L.save,save).classList.add("huw-puppet-save");
  var layout=el(doc,"div","huw-puppet-layout",undefined,overlay);
  var left=el(doc,"aside","huw-puppet-sidebar",undefined,layout);el(doc,"h3","",L.tree,left);tree=el(doc,"div","huw-puppet-tree",undefined,left);
  var center=el(doc,"main","huw-puppet-center",undefined,layout);canvas=el(doc,"div","huw-puppet-canvas",undefined,center);
  el(doc,"p","huw-puppet-hint",L.hint,center);
  var right=el(doc,"aside","huw-puppet-inspector",undefined,layout);el(doc,"h2","",L.settings,right);
  inspector=el(doc,"div","huw-puppet-fields",undefined,right);
  var footer=el(doc,"footer","huw-puppet-footer",undefined,overlay);msg=el(doc,"output","",L.removed,footer);
  var choice=el(doc,"label","huw-puppet-library-toggle",undefined,footer),box=el(doc,"input","",undefined,choice);box.type="checkbox";
  el(doc,"span","",L.library,choice);box.onchange=function(){libraryRequested=box.checked;};
  renderAll();overlay.addEventListener("keydown",function(e){if(e.target.closest&&e.target.closest('.huw-svg-workshop'))return;if(e.key==="Escape"){e.preventDefault();e.stopPropagation();clearSelection();}},true);
  // Parent-local coordinate system makes a wrist move with its elbow, not with the scene.
  canvas.addEventListener("pointerdown",function(e){if((e.button!==undefined&&e.button!==0)||e.isPrimary===false||!preview)return;
   if(cancelInteraction)cancelInteraction();
   var target=e.target.closest&&e.target.closest("[data-cutout-id]");
   // A tap in the preview's empty space releases the part without closing
   // this draft. Moving, cancelling or lifting a different finger is not a tap.
   if(!target||!canvas.contains(target)){
    var blankX=e.clientX,blankY=e.clientY,blankMoved=false,blankDone=false;
    if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
    function blankMove(ev){if(ev.pointerId!==e.pointerId)return;if(Math.hypot(ev.clientX-blankX,ev.clientY-blankY)>8)blankMoved=true;}
    function blankFinish(clear){if(blankDone)return;blankDone=true;if(cancelInteraction===blankCancel)cancelInteraction=null;
     canvas.removeEventListener('pointermove',blankMove);canvas.removeEventListener('pointerup',blankUp);canvas.removeEventListener('pointercancel',blankCancel);canvas.removeEventListener('lostpointercapture',blankCancel);
     if(canvas.hasPointerCapture&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
     if(clear)clearSelection();
    }
    function blankUp(ev){if(ev.pointerId!==e.pointerId)return;blankMove(ev);var hit=doc.elementFromPoint&&doc.elementFromPoint(ev.clientX,ev.clientY),part=hit&&hit.closest&&hit.closest('[data-cutout-id]');blankFinish(!blankMoved&&(!hit||canvas.contains(hit))&&(!part||!canvas.contains(part)));}
    function blankCancel(ev){if(ev&&ev.pointerId!==e.pointerId)return;blankFinish(false);}
    cancelInteraction=blankCancel;canvas.addEventListener('pointermove',blankMove);canvas.addEventListener('pointerup',blankUp);canvas.addEventListener('pointercancel',blankCancel);canvas.addEventListener('lostpointercapture',blankCancel);return;
   }
   var id=target.getAttribute("data-cutout-id"),p=lookup(id);if(!p)return;
   selected=id;renderTree();renderInspector();Engine.paint(preview,0,selected);
   setPreviewFrame();
   var parent=target.parentNode,ctm=parent&&parent.getScreenCTM&&parent.getScreenCTM();if(!ctm)return;
   var point=preview.svg.createSVGPoint();function coords(ev){point.x=ev.clientX;point.y=ev.clientY;return point.matrixTransform(ctm.inverse());}
   var start=coords(e),before=clone(p),old=partBase(p),startX=n(old.x,0),startY=n(old.y,0),startPX=n((p.pivot||{}).x,0),startPY=n((p.pivot||{}).y,0),isJoint=e.target.hasAttribute&&e.target.hasAttribute("data-cutout-joint"),moved=false,finished=false;
   if(target.setPointerCapture)target.setPointerCapture(e.pointerId);
   function move(ev){if(ev.pointerId!==e.pointerId)return;var at=coords(ev),dx=at.x-start.x,dy=at.y-start.y;if(!moved&&Math.hypot(dx,dy)<2)return;moved=true;
    if(isJoint){p.pivot=p.pivot||{};p.pivot.x=r(startPX+dx);p.pivot.y=r(startPY+dy);}
    else{applyKeys(p,"x",startX+dx);applyKeys(p,"y",startY+dy);}
    Engine.paint(preview,0,selected);setPreviewFrame();
   }
   function finish(commit){if(finished)return;finished=true;if(cancelInteraction===cancel)cancelInteraction=null;
    target.removeEventListener("pointermove",move);target.removeEventListener("pointerup",done);target.removeEventListener("pointercancel",cancel);target.removeEventListener("lostpointercapture",cancel);
    if(target.hasPointerCapture&&target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);
    if(moved){if(commit)writable();else{Object.keys(p).forEach(function(key){delete p[key];});Object.assign(p,before);}renderAll();}
   }
   function done(ev){if(ev.pointerId!==e.pointerId)return;finish(true);}
   function cancel(ev){if(ev&&ev.pointerId!==e.pointerId)return;finish(false);}
   cancelInteraction=cancel;target.addEventListener("pointermove",move);target.addEventListener("pointerup",done);target.addEventListener("pointercancel",cancel);target.addEventListener("lostpointercapture",cancel);
  });
  overlay.focus({preventScroll:true});return true;
 }
 return {open:open,close:close,clearSelection:clearSelection,isOpen:function(){return !!overlay;}};
}
exports.mount=mount;exports.rootFor=rootFor;exports.descendants=descendants;exports.validateSvg=validateSvg;
})();
