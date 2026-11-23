/*\
title: $:/plugins/huwiki/musical/background-import.js
type: application/javascript
module-type: library
\*/
"use strict";

// Decode once and keep a scene-sized image in the wiki. The original file can
// remain in Photos or Files after the project has been saved.
exports.prepare = async function(doc,file,scene) {
 const win=doc.defaultView, url=win.URL.createObjectURL(file);
 const image=new win.Image(), canvas=doc.createElement("canvas");
 try {
  await new Promise(function(resolve,reject) {
   image.onload=resolve;
   image.onerror=function(){ reject(Error("Billedet kunne ikke åbnes / Could not open image")); };
   image.src=url;
  });
  const width=Number(scene.width)||960, height=Number(scene.height)||540;
  const scale=Math.min(2,2048/Math.max(width,height),image.naturalWidth/width,image.naturalHeight/height);
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const cover=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight);
  const w=image.naturalWidth*cover, h=image.naturalHeight*cover;
  canvas.getContext("2d").drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  const data=canvas.toDataURL(file.type==="image/jpeg"?"image/jpeg":"image/png",.92);
  const match=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(data);
  if(!match)throw Error("Billedet kunne ikke gemmes / Could not save image");
  return {type:match[1],text:match[2]};
 } finally {
  win.URL.revokeObjectURL(url);
  canvas.width=canvas.height=1;
 }
};
exports.insert=function(scene,title,name,id) {
 const parts=scene.parts||[], w=Number(scene.width)||960,h=Number(scene.height)||540;
 // Reuse a static single-image backdrop slot. Keep custom scenery, animation,
 // foreground layers and authored multi-part backgrounds in their own order.
 const index=parts.findIndex(p=>!p.parent&&p.type==="image"&&(p.animusImportedBackground||
  (p["animus-category"]==="background"||/^kenney-background-background/.test(p.id))&&
  (p.keys||[]).length<=1&&!parts.some(child=>child.parent===p.id)));
 const part={id:index<0?id:parts[index].id,name,type:"image",asset:title,geo:{x:0,y:0,w,h},
  parent:null,pivot:{x:0,y:0},keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1}],
  "animus-category":"background",animusImportedBackground:true};
 if(index>=0)parts[index]=part;
 else {
  if(parts.length>=300)throw Error("Scenen har 300 dele / The scene has 300 parts");
  let end=0;
  while(end<parts.length&&(parts[end]["animus-category"]==="background"||/harbour$/.test(parts[end]["animus-library-id"]||"")))end++;
  parts.splice(end,0,part);
 }
 scene.parts=parts;
 return scene;
};
