/*\
title: $:/plugins/huwiki/musical/cutout-paint.js
type: application/javascript
module-type: library
\*/
"use strict";
exports.open=function(o){
 const {doc,host,da}=o;
 const panel=doc.createElement("section");panel.className="huw-rig-paint";host.appendChild(panel);
 function element(type,text){const e=doc.createElement(type);if(text)e.textContent=text;panel.appendChild(e);return e;}
 const heading=element("strong",o.repair?(da?"Reparér billedet":"Repair artwork"):(da?"Klip en del fri":"Cut out a part"));
 const hint=element("p",o.repair?(da?"Tryk på en farve i billedet, og mal hullet til.":"Tap a colour in the picture, then paint the missing area."):(da?"Tegn rundt om delen, eller tryk langs kanten. Den sidste kant lukkes automatisk.":"Trace the part, or tap around its edge. The last edge closes automatically."));
 const canvas=element("canvas");canvas.style.touchAction="none";
 const image=doc.createElement("img");image.crossOrigin="anonymous";
 const buffer=doc.createElement("canvas"),ctx=buffer.getContext("2d",{willReadFrequently:true}),display=canvas.getContext("2d");
 let path=[],drawing=null,history=[],sample=true,loaded=false;
 function button(title,fn){const b=element("button",title);b.type="button";b.onclick=fn;return b;}
 const color=element("input");color.type="color";color.value="#a26343";color.hidden=!o.repair;color.oninput=()=>sample=false;
 const radius=element("input");radius.type="range";radius.min=1;radius.max=30;radius.value=6;radius.hidden=!o.repair;radius.setAttribute("aria-label",da?"Penselstørrelse":"Brush size");
 if(o.repair)button(da?"Hent farve":"Pick colour",()=>sample=true);
 function paint(){display.clearRect(0,0,canvas.width,canvas.height);display.drawImage(buffer,0,0);
  if(path.length){display.beginPath();path.forEach(([x,y],i)=>i?display.lineTo(x,y):display.moveTo(x,y));display.strokeStyle="#00acc1";display.lineWidth=2*canvas.width/Math.max(1,canvas.clientWidth);display.stroke();}
 }
 function pos(e){const b=canvas.getBoundingClientRect();return [(e.clientX-b.left)*canvas.width/b.width,(e.clientY-b.top)*canvas.height/b.height];}
 function dab(p,last){ctx.strokeStyle=ctx.fillStyle=color.value;ctx.lineWidth=radius.value*canvas.width/Math.max(1,canvas.clientWidth);ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(...last);ctx.lineTo(...p);ctx.stroke();ctx.beginPath();ctx.arc(...p,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
 canvas.onpointerdown=e=>{if(!loaded||drawing)return;const p=pos(e);
  if(o.repair&&sample){const pix=ctx.getImageData(Math.max(0,Math.min(canvas.width-1,p[0])),Math.max(0,Math.min(canvas.height-1,p[1])),1,1).data;color.value="#"+Array.from(pix.slice(0,3),n=>n.toString(16).padStart(2,"0")).join("");sample=false;return;}
  history.push(o.repair?ctx.getImageData(0,0,buffer.width,buffer.height):path.length);
  if(history.length>(o.repair?3:100))history.shift();
  drawing={id:e.pointerId,last:p};canvas.setPointerCapture(e.pointerId);if(o.repair)dab(p,p);else path.push(p);paint();};
 canvas.onpointermove=e=>{if(!drawing||drawing.id!==e.pointerId)return;const p=pos(e);if(o.repair)dab(p,drawing.last);else path.push(p);drawing.last=p;paint();};
 canvas.onpointerup=canvas.onpointercancel=e=>{if(drawing&&drawing.id===e.pointerId)drawing=null;};
 button(da?"Fortryd":"Undo",()=>{if(!history.length)return;const last=history.pop();if(o.repair)ctx.putImageData(last,0,0);else path.length=last;paint();});
 button(da?"Annuller":"Cancel",()=>panel.remove());
 const done=button(o.repair?(da?"Brug reparation":"Apply repair"):(da?"Klip ud":"Cut out"),()=>{
  if(!loaded||(!o.repair&&path.length<3))return;
  try{
   let cut=null,selection=null;
   const result=doc.createElement("canvas");result.width=buffer.width;result.height=buffer.height;const rc=result.getContext("2d");rc.drawImage(buffer,0,0);
   if(!o.repair){
    const mask=doc.createElement("canvas");mask.width=buffer.width;mask.height=buffer.height;const mc=mask.getContext("2d");mc.beginPath();path.forEach(([x,y],i)=>i?mc.lineTo(x,y):mc.moveTo(x,y));mc.closePath();mc.fill();
    mc.globalCompositeOperation="source-in";mc.drawImage(buffer,0,0);const x=Math.max(0,Math.floor(Math.min(...path.map(p=>p[0])))),y=Math.max(0,Math.floor(Math.min(...path.map(p=>p[1]))));
    const right=Math.min(buffer.width,Math.ceil(Math.max(...path.map(p=>p[0])))),bottom=Math.min(buffer.height,Math.ceil(Math.max(...path.map(p=>p[1]))));
    if(right<=x||bottom<=y)return;
    selection={x,y,w:right-x,h:bottom-y};
    const trimmed=doc.createElement("canvas");trimmed.width=selection.w;trimmed.height=selection.h;
    trimmed.getContext("2d").drawImage(mask,x,y,selection.w,selection.h,0,0,selection.w,selection.h);cut=trimmed.toDataURL("image/png");
    rc.globalCompositeOperation="destination-out";rc.beginPath();path.forEach(([x,y],i)=>i?rc.lineTo(x,y):rc.moveTo(x,y));rc.closePath();rc.fill();
   }
   o.apply(result.toDataURL("image/png"),cut,selection,buffer.width,buffer.height);panel.remove();
  }catch(err){hint.textContent=String(err.message);}
 });
 done.disabled=true;
 image.onerror=()=>{hint.textContent=da?"Billedet kunne ikke åbnes.":"Could not open image.";};
 image.onload=()=>{if(!panel.parentNode)return;const c=o.crop,box=c?[c.x*image.naturalWidth/c.sourceWidth,c.y*image.naturalHeight/c.sourceHeight,c.w*image.naturalWidth/c.sourceWidth,c.h*image.naturalHeight/c.sourceHeight]:[0,0,image.naturalWidth,image.naturalHeight];const scale=Math.min(1,2048/Math.max(box[2],box[3]));canvas.width=buffer.width=Math.max(1,Math.round(box[2]*scale));canvas.height=buffer.height=Math.max(1,Math.round(box[3]*scale));ctx.drawImage(image,...box,0,0,canvas.width,canvas.height);loaded=true;paint();done.disabled=false;};
 image.src=o.href;
};
