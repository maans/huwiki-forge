/*\
title: $:/plugins/huwiki/musical/part-materials.js
type: application/javascript
module-type: library
\*/
"use strict";
const Library=require("$:/plugins/huwiki/musical/asset-library.js");
const Engine=require("$:/plugins/huwiki/cutout/engine.js");

function candidates(wiki){
 const result=[], seen=new Set();
 for(const entry of Library.entries(wiki)){
  if(!["cutout","figure","prop","face"].includes(entry.category))continue;
  const byId=new Map(entry.assets.map(a=>[a.id,a]));
  function add(asset,crop,name,partName){
   if(!asset||!asset.title||!wiki.getTiddler(asset.title))return;
   const key=JSON.stringify([asset.title,crop||null]);
   if(seen.has(key))return;
   seen.add(key);
   result.push({name,partName,asset:asset.title,crop,width:asset.width,height:asset.height});
  }
  if(entry.parts&&entry.parts.length){
   for(const p of entry.parts){
    if(p.type!=="image")continue;
    for(const v of p.variants&&p.variants.length?p.variants:[p]){
     const name=v.name||p.name||p.id;
     add(byId.get(v.asset||p.asset),v.crop||p.geo&&p.geo.crop,name+" · "+entry.name,[p.id,p.name,v.name].join(" "));
    }
   }
  }else if(entry.assets.length===1)add(entry.assets[0],null,entry.nameDa||entry.name,entry.name);
 }
 return result;
}
function show(doc,wiki,host,target,da,choose){
 const all=candidates(wiki), query=doc.createElement("input"), grid=doc.createElement("div"), more=doc.createElement("button");
 const hint=String(target.name+" "+target.id).toLowerCase();
 const kinds=[/head|hoved/,/hand|hånd/,/elbow|underarm|albue/,/overarm|upper.arm/,/foot|fod/,/leg|ben/,/body|krop/];
 const kind=kinds.find(k=>k.test(hint));
 if(kind)all.sort((a,b)=>Number(kind.test(b.partName.toLowerCase()))-Number(kind.test(a.partName.toLowerCase())));
 query.type="search";query.placeholder=da?"Søg i dele…":"Search parts…";query.setAttribute("aria-label",query.placeholder);
 grid.className="huw-part-choices";more.type="button";more.textContent=da?"Vis flere":"Show more";
 host.appendChild(query);host.appendChild(grid);host.appendChild(more);
 let limit=12;
 function draw(){
  grid.textContent="";const filter=String(query.value||"").toLowerCase().trim();
  const list=all.filter(c=>(c.name+" "+c.partName).toLowerCase().includes(filter));
  for(const item of list.slice(0,limit)){
   const button=doc.createElement("button");button.type="button";
   const svg=doc.createElementNS("http://www.w3.org/2000/svg","svg");
   const image=doc.createElementNS("http://www.w3.org/2000/svg","image");
   const c=item.crop||{x:0,y:0,w:item.width||64,h:item.height||64};
   svg.setAttribute("viewBox",[c.x,c.y,c.w,c.h].join(" "));svg.setAttribute("aria-hidden","true");
   image.setAttribute("width",c.sourceWidth||c.w);image.setAttribute("height",c.sourceHeight||c.h);
   image.setAttribute("href",Engine.imageHref(wiki,item));
   const window=doc.createElementNS("http://www.w3.org/2000/svg","svg");
   for(const [key,value] of Object.entries({x:c.x,y:c.y,width:c.w,height:c.h,viewBox:[c.x,c.y,c.w,c.h].join(" "),overflow:"hidden"}))window.setAttribute(key,value);
   window.appendChild(image);svg.appendChild(window);
   button.appendChild(svg);const label=doc.createElement("span");label.textContent=item.name;button.appendChild(label);
   button.onclick=function(){choose(item);};grid.appendChild(button);
  }
  if(!list.length)grid.textContent=da?"Ingen matchende dele i wikien.":"No matching parts in this wiki.";
  more.hidden=list.length<=limit;
 }
 query.oninput=function(){limit=12;draw();};more.onclick=function(){limit+=12;draw();};draw();
}
exports.candidates=candidates;exports.show=show;
