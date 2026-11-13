/* HUWiki Forge: CutOut site reader, derived from OAuthLab CutOutSiteRuntime.js.
 * View-only: no editor, TiddlyWiki bootstrap, Google API or separate language selector.
 * Scene/keyframe/camera behaviour follows the original CutOut engine. */
(function(){
"use strict";
var NS="http://www.w3.org/2000/svg";
var translations={"▶ Afspil":"▶ Play","Ⅱ Pause":"Ⅱ Pause","↺ Til start":"↺ Restart","Tid i animation":"Animation time","Animationen kunne ikke indlæses: ":"Could not load animation: "};
function tr(s){return /^da/i.test(document.documentElement.lang||"en")?s:(translations[s]||s);}
function finite(x,f){x=Number(x);return Number.isFinite(x)?x:f;}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function ease(a,b,t,mode){if(mode==="step")return t>=1?b:a;if(mode!=="linear")t=t*t*(3-2*t);return a+(b-a)*t;}
function resolve(wiki,uid,name){if(uid){var found="";wiki.each(function(row,title){if(row.fields["cutout-id"]===uid)found=title;});if(found)return found;}return name;}
function readScene(wiki,name){
 var raw=wiki.getTiddlerText(name,""),obj;
 try{obj=JSON.parse(raw);}catch(_){return null;}
 if(!obj||obj.version!==1||(!Array.isArray(obj.parts)&&!Array.isArray(obj.scenes)))return null;
 if(!Array.isArray(obj.parts))obj.parts=[];
 if(obj.parts.length>300)return null;
 obj.width=clamp(finite(obj.width,800),100,4000);
 obj.height=clamp(finite(obj.height,450),100,4000);
 obj.duration=Array.isArray(obj.scenes)?obj.scenes.reduce(function(n,c){return n+Math.max(.1,finite(c.duration,4));},0):clamp(finite(obj.duration,4),.25,3600);
 obj._title=name;return obj;
}
function trackValue(keys,t,defaults,fields,easing){
 keys=(keys||[]).filter(function(k){return k&&Number.isFinite(Number(k.t));}).slice().sort(function(a,b){return a.t-b.t;});
 if(!keys.length)return Object.assign({},defaults);
 var a=keys[0],b=a;
 if(t>=keys[keys.length-1].t)a=b=keys[keys.length-1];
 else if(t>keys[0].t){for(var i=0;i<keys.length-1;i++){if(t>=keys[i].t&&t<=keys[i+1].t){a=keys[i];b=keys[i+1];break;}}}
 var q=b.t>a.t?clamp((t-a.t)/(b.t-a.t),0,1):0,result={};
 fields.forEach(function(k){var left=finite(a[k],defaults[k]),right=finite(b[k],left);result[k]=ease(left,right,q,a.easing||easing||"smooth");});
 return result;
}
function camera(scene,t){
 var base={x:scene.width/2,y:scene.height/2,zoom:1},track=scene.camera||{},value=trackValue(track.keys,t,base,["x","y","zoom"],track.easing);
 value.zoom=clamp(value.zoom,.25,16);
 var w=scene.width/value.zoom,h=scene.height/value.zoom;
 return [value.x-w/2,value.y-h/2,w,h].join(" ");
}
function state(part,t){
 var out=trackValue(part.keys,t,{x:0,y:0,r:0,sx:1,sy:1,opacity:1},["x","y","r","sx","sy","opacity"],part.easing);
 var keys=(part.keys||[]).filter(function(k){return k&&Number(k.t)<=t;}).sort(function(a,b){return a.t-b.t;});
 out.variantId=(keys.length?keys[keys.length-1].variantId:null)||part.variantId||"";
 return out;
}
function svg(doc,name){return doc.createElementNS(NS,name);}
function attr(node,name,value){if(value!==undefined&&value!==null)node.setAttribute(name,String(value));}
function imageHref(wiki,p){
 if(p.imageData&&/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(p.imageData))return p.imageData;
 if(p.asset||p.assetId){
  var title=resolve(wiki,p.assetId,p.asset),row=wiki.getTiddler(title),f=row&&row.fields||{},type=f.type||"";
  if(/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/.test(type)){
   var text=wiki.getTiddlerText(title,"");
   if(/^data:image\//i.test(text))return text;
   if(type==="image/svg+xml")return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(text);
   if(text)return "data:"+type+";base64,"+text;
  }
 }
 if(p.src&&/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(p.src))return p.src;
 return "";
}
function graphic(doc,wiki,p){
 var tag=({circle:"circle",ellipse:"ellipse",rect:"rect",path:"path",text:"text",image:"image"})[p.type]||"g",el=svg(doc,tag),g=p.geo||{};
 if(tag==="rect"){attr(el,"x",finite(g.x,-40));attr(el,"y",finite(g.y,-25));attr(el,"width",Math.max(0,finite(g.w,80)));attr(el,"height",Math.max(0,finite(g.h,50)));attr(el,"rx",finite(g.rx,0));}
 else if(tag==="circle"){attr(el,"r",Math.max(0,finite(g.r,25)));attr(el,"cx",finite(g.cx,0));attr(el,"cy",finite(g.cy,0));}
 else if(tag==="ellipse"){attr(el,"rx",Math.max(0,finite(g.rx,30)));attr(el,"ry",Math.max(0,finite(g.ry,18)));}
 else if(tag==="path")attr(el,"d",String(g.d||""));
 else if(tag==="text"){el.textContent=String(p.text||"Text");attr(el,"text-anchor",p.align||"middle");attr(el,"font-size",finite(p.fontSize,32));attr(el,"font-family",p.fontFamily||"system-ui,sans-serif");attr(el,"font-weight",p.weight||600);attr(el,"dominant-baseline","middle");}
 else if(tag==="image"){
  var variant=(p.variants||[]).find(function(v){return v.id===p.variantId;})||(p.variants||[])[0],href=imageHref(wiki,variant||p);
  if(href)attr(el,"href",href);
  attr(el,"x",finite(g.x,-75));attr(el,"y",finite(g.y,-55));attr(el,"width",Math.max(1,finite(g.w,150)));attr(el,"height",Math.max(1,finite(g.h,110)));attr(el,"preserveAspectRatio","xMidYMid meet");
 }
 if(tag!=="image"){if(p.fill!==undefined)attr(el,"fill",p.fill);else if(tag!=="g")attr(el,"fill","#f0b457");if(p.stroke)attr(el,"stroke",p.stroke);if(p.strokeWidth)attr(el,"stroke-width",p.strokeWidth);if(p.rig){attr(el,"stroke-linecap","round");attr(el,"stroke-linejoin","round");}}
 return el;
}
function timing(t,duration,p){
 p=p||{};var start=finite(p.start,0),v=(Math.max(t,start)-start)*finite(p.speed,1)+finite(p.offset,0);
 return {active:t>=start,time:p.loop&&duration>0?((v%duration)+duration)%duration:clamp(v,0,duration)};
}
function build(doc,wiki,scene,ancestors){
 ancestors=(ancestors||[]).concat(scene._title||[]);
 var root=svg(doc,"svg"),back=svg(doc,"rect"),parts=scene.parts||[],byId={},children={},nodes={},clips=[];
 attr(root,"viewBox","0 0 "+scene.width+" "+scene.height);attr(root,"class","huw-cutout-svg");attr(root,"role","img");attr(root,"aria-label",scene.name||"CutOut");
 attr(back,"width",scene.width);attr(back,"height",scene.height);attr(back,"fill",scene.background===undefined?"transparent":scene.background);root.appendChild(back);
 parts.forEach(function(p){byId[p.id]=p;});
 parts.forEach(function(p){var parent=p.parent&&byId[p.parent]&&p.parent!==p.id?p.parent:"root";(children[parent]||(children[parent]=[])).push(p);});
 function add(parent,id,visited,depth){if(depth>10)return;(children[id]||[]).forEach(function(p){
  if(visited[p.id])return;var seen=Object.assign({},visited),holder=svg(doc,"g"),nested=null,shape=null;seen[p.id]=true;
  attr(holder,"data-cutout-id",p.id);attr(holder,"class","huw-cutout-part");
  if(p.type==="animation"){
   var title=resolve(wiki,p.animationId,p.animation);
   if(title&&ancestors.indexOf(title)<0&&ancestors.length<16){var child=readScene(wiki,title);if(child){nested=build(doc,wiki,child,ancestors);shape=nested.svg;var geo=p.geo||{};attr(shape,"x",finite(geo.x,-100));attr(shape,"y",finite(geo.y,-75));attr(shape,"width",finite(geo.w,200));attr(shape,"height",finite(geo.h,150));}}
  }
  if(!shape)shape=graphic(doc,wiki,p);
  holder.appendChild(shape);parent.appendChild(holder);
  nodes[p.id]={el:holder,part:p,shape:shape,nested:nested,variant:null};
  add(holder,p.id,seen,depth+1);
 });}
 add(root,"root",{},0);
 (scene.scenes||[]).forEach(function(c){
  var title=resolve(wiki,c.sourceId,c.source||c.animation||c.theatre),child=title&&ancestors.indexOf(title)<0&&ancestors.length<16&&readScene(wiki,title),nested=child&&build(doc,wiki,child,ancestors),holder=svg(doc,"g");
  root.appendChild(holder);if(nested){holder.appendChild(nested.svg);attr(nested.svg,"width",scene.width);attr(nested.svg,"height",scene.height);}
  clips.push({el:holder,view:nested,duration:child?child.duration:1,settings:c});
 });
 parts.forEach(function(p){if(p.foreground&&!p.parent&&nodes[p.id])root.appendChild(nodes[p.id].el);});
 return {svg:root,nodes:nodes,clips:clips,scene:scene,wiki:wiki,duration:scene.duration};
}
function paint(view,t){
 attr(view.svg,"viewBox",camera(view.scene,t));
 Object.keys(view.nodes).forEach(function(id){
  var n=view.nodes[id],p=n.part,s=state(p,t),pivot=p.pivot||{};
  if(n.nested){var clock=timing(t,n.nested.duration,p);attr(n.el,"display",clock.active?"inline":"none");paint(n.nested,clock.time);}
  if(p.type==="image"&&p.variants){var variant=p.variants.find(function(v){return v.id===s.variantId;})||p.variants[0];
   if(variant&&n.variant!==variant.id){attr(n.shape,"href",imageHref(view.wiki,variant));n.variant=variant.id;}}
  attr(n.el,"transform","translate("+s.x+" "+s.y+") rotate("+s.r+") scale("+s.sx+" "+s.sy+") translate("+(-finite(pivot.x,0))+" "+(-finite(pivot.y,0))+")");
  attr(n.el,"opacity",s.opacity);
 });
 if(view.clips.length){
  var start=0,selected=view.clips.length-1;
  view.clips.some(function(c,i){var duration=Math.max(.1,finite(c.settings.duration,4));if(t<start+duration){selected=i;return true;}start+=duration;return false;});
  start=0;
  view.clips.forEach(function(c,i){var duration=Math.max(.1,finite(c.settings.duration,4)),local=clamp(t-start,0,duration);
   attr(c.el,"display",selected===i?"inline":"none");if(c.view)paint(c.view,timing(local,c.duration,c.settings).time);start+=duration;});
 }
}
function hydrate(root,rows){
 if(!rows||typeof rows!=="object")return;
 var wiki={getTiddler:function(t){return rows[t]?{fields:rows[t]}:null;},
  getTiddlerText:function(t,fallback){return rows[t]?String(rows[t].text||""):(fallback||"");},
  each:function(callback){Object.keys(rows).forEach(function(t){callback({fields:rows[t]},t);});}};
 (root||document).querySelectorAll(".huw-site-cutout[data-cutout-title]").forEach(function(host){
  if(host.getAttribute("data-cutout-ready"))return;
  var title=host.getAttribute("data-cutout-title"),scene=readScene(wiki,title);
  if(!scene){host.textContent=tr("Animationen kunne ikke indlæses: ")+title;return;}
  host.setAttribute("data-cutout-ready","1");host.textContent="";
  var view=build(document,wiki,scene),controls=document.createElement("div"),buttons=[],playing=false,frame=0,last=0,time=0;
  host.appendChild(view.svg);controls.className="huw-cutout-controls";host.appendChild(controls);
  function button(label,callback){var el=document.createElement("button");el.type="button";el.textContent=tr(label);el.addEventListener("click",callback);controls.appendChild(el);buttons.push(el);return el;}
  function update(){paint(view,time);range.value=String(time);readout.textContent=time.toFixed(2)+" / "+scene.duration.toFixed(2)+" s";}
  function pause(){playing=false;if(frame)cancelAnimationFrame(frame);frame=0;last=0;play.textContent=tr("▶ Afspil");}
  function seek(t){time=clamp(finite(t,0),0,scene.duration);update();}
  function tick(now){frame=0;if(!playing)return;if(!host.isConnected||document.hidden){pause();return;}
   if(last){var next=time+(now-last)/1000;if(next>=scene.duration){if(host.getAttribute("data-loop")!=="no")seek(next%scene.duration);else{seek(scene.duration);pause();return;}}else seek(next);}
   last=now;frame=requestAnimationFrame(tick);
  }
  function start(){if(playing)return;if(time>=scene.duration)seek(0);playing=true;last=0;play.textContent=tr("Ⅱ Pause");frame=requestAnimationFrame(tick);}
  var play=button("▶ Afspil",function(){if(playing)pause();else start();});
  button("↺ Til start",function(){pause();seek(0);});
  var range=document.createElement("input"),readout=document.createElement("span");
  range.type="range";range.min="0";range.max=String(scene.duration);range.step=".01";range.setAttribute("aria-label",tr("Tid i animation"));
  range.addEventListener("input",function(){pause();seek(Number(range.value));});controls.appendChild(range);controls.appendChild(readout);
  seek(0);
  if(host.getAttribute("data-autoplay")==="yes"&&!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches))start();
 });
}
window.HUWikiCutOutSite={hydrate:hydrate};
})();
