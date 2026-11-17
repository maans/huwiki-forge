/*\
title: $:/plugins/huwiki/cutout/svg-model.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var serial=0;
function copy(value){return JSON.parse(JSON.stringify(value));}
function number(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function id(prefix){serial++;return (prefix||"svg")+"-"+Date.now().toString(36)+"-"+serial.toString(36);}
function esc(value){return String(value===undefined?"":value).replace(/[&<>\"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function round(value){return Math.round(number(value,0)*1000)/1000;}
function bounds(value){value=value||{};return {x:number(value.x,-100),y:number(value.y,-100),w:clamp(number(value.w,200),1,8000),h:clamp(number(value.h,200),1,8000)};}
function create(box,name){var layer={id:id("layer"),name:name||"Layer 1",visible:true,locked:false,x:0,y:0,sx:1,sy:1,r:0};var artwork={};artwork[layer.id]=[];return {version:1,bounds:bounds(box),fps:12,loop:false,start:0,layers:[layer],frames:[{id:id("frame"),hold:1,artwork:artwork}]};}
function normalize(value){
 if(!value||value.version!==1||!Array.isArray(value.layers)||!Array.isArray(value.frames))throw Error("Invalid SVG drawing");
 if(value.layers.length>60||value.frames.length>240)throw Error("A drawing supports at most 60 layers and 240 frames");
 var model=copy(value),seen={};model.bounds=bounds(model.bounds);model.fps=clamp(number(model.fps,12),1,60);model.start=Math.max(0,number(model.start,0));model.loop=!!model.loop;
 model.layers.forEach(function(layer,index){if(!layer.id||seen[layer.id])layer.id=id("layer");seen[layer.id]=true;layer.name=String(layer.name||"Layer "+(index+1)).slice(0,160);layer.visible=layer.visible!==false;layer.locked=!!layer.locked;
  ["x","y","r"].forEach(function(key){layer[key]=number(layer[key],0);});["sx","sy"].forEach(function(key){layer[key]=clamp(number(layer[key],1),.01,100);});});
 if(!model.layers.length){var first=create(model.bounds);model.layers=first.layers;}
 if(!model.frames.length)model.frames=[{id:id("frame"),hold:1,artwork:{}}];
 model.frames.forEach(function(frame){frame.id=frame.id||id("frame");frame.hold=clamp(Math.round(number(frame.hold,1)),1,120);frame.artwork=frame.artwork||{};model.layers.forEach(function(layer){if(!Array.isArray(frame.artwork[layer.id]))frame.artwork[layer.id]=[];
  if(frame.artwork[layer.id].length>2000)throw Error("Too many shapes in a frame");frame.artwork[layer.id].forEach(function(shape){shape.id=shape.id||id("shape");});});});
 return model;
}
function layerById(model,layerId){return model.layers.find(function(layer){return layer.id===layerId;});}
function addLayer(model,name,after){if(model.layers.length>=60)throw Error("Maximum 60 layers");var layer={id:id("layer"),name:name||"Layer "+(model.layers.length+1),visible:true,locked:false,x:0,y:0,sx:1,sy:1,r:0};var index=after?model.layers.findIndex(function(item){return item.id===after;}):model.layers.length-1;model.layers.splice(index+1,0,layer);model.frames.forEach(function(frame){frame.artwork[layer.id]=[];});return layer;}
function removeLayer(model,layerId){if(model.layers.length<=1)return false;model.layers=model.layers.filter(function(layer){return layer.id!==layerId;});model.frames.forEach(function(frame){delete frame.artwork[layerId];});return true;}
function duplicateLayer(model,layerId){var source=layerById(model,layerId);if(!source)return null;var layer=addLayer(model,source.name+" (copy)",layerId);Object.keys(source).forEach(function(key){if(key!=="id"&&key!=="name")layer[key]=copy(source[key]);});model.frames.forEach(function(frame){frame.artwork[layer.id]=copy(frame.artwork[layerId]||[]).map(function(shape){shape.id=id("shape");return shape;});});return layer;}
function moveLayer(model,layerId,delta){var from=model.layers.findIndex(function(layer){return layer.id===layerId;}),to=clamp(from+delta,0,model.layers.length-1);if(from<0||from===to)return false;model.layers.splice(to,0,model.layers.splice(from,1)[0]);return true;}
function addFrame(model,index,duplicate){if(model.frames.length>=240)throw Error("Maximum 240 frames");index=clamp(index,0,model.frames.length-1);var frame=duplicate?copy(model.frames[index]):{hold:1,artwork:{}};frame.id=id("frame");model.layers.forEach(function(layer){if(!frame.artwork[layer.id])frame.artwork[layer.id]=[];frame.artwork[layer.id].forEach(function(shape){shape.id=id("shape");});});model.frames.splice(index+1,0,frame);return index+1;}
function removeFrame(model,index){if(model.frames.length<=1)return false;model.frames.splice(index,1);return true;}
function frameDuration(model,frame){return number(frame.hold,1)/number(model.fps,12);}
function duration(model){return model.frames.reduce(function(total,frame){return total+frameDuration(model,frame);},0);}
function frameAt(model,time){var length=duration(model);time=Math.max(0,number(time,0));if(model.loop&&length>0)time=time%length;var sum=0;for(var i=0;i<model.frames.length;i++){sum+=frameDuration(model,model.frames[i]);if(time<sum-1e-8)return i;}return model.frames.length-1;}
function transform(item){return "translate("+round(item.x)+" "+round(item.y)+") rotate("+round(item.r)+") scale("+round(number(item.sx,1))+" "+round(number(item.sy,1))+")";}
function shapeSvg(shape){
 var style=' fill="'+esc(shape.fill===undefined?"none":shape.fill)+'" stroke="'+esc(shape.stroke||"none")+'" stroke-width="'+round(Math.max(0,number(shape.strokeWidth,2)))+'" stroke-linecap="round" stroke-linejoin="round"';
 var attrs=' data-svg-shape="'+esc(shape.id)+'" transform="'+transform(shape)+'"';
 if(shape.type==="path")return '<path'+attrs+style+' d="'+esc(shape.d||"")+'"/>';
 if(shape.type==="rect")return '<rect'+attrs+style+' x="'+round(shape.left)+'" y="'+round(shape.top)+'" width="'+round(Math.max(0,number(shape.width,0)))+'" height="'+round(Math.max(0,number(shape.height,0)))+'" rx="'+round(shape.rx)+'"/>';
 if(shape.type==="ellipse")return '<ellipse'+attrs+style+' cx="'+round(shape.cx)+'" cy="'+round(shape.cy)+'" rx="'+round(Math.abs(number(shape.rx,0)))+'" ry="'+round(Math.abs(number(shape.ry,0)))+'"/>';
 if(shape.type==="text")return '<text'+attrs+style+' x="'+round(shape.left)+'" y="'+round(shape.top)+'" font-size="'+round(number(shape.fontSize,24))+'" text-anchor="'+esc(shape.anchor||"middle")+'" font-family="system-ui, sans-serif">'+esc(shape.text||"")+'</text>';
 // Raw vectors are validated before preview/export by svg-layers.js.
 if(shape.type==="svg")return '<g'+attrs+'>'+String(shape.svg||"")+'</g>';
 if(shape.type==="image"&&/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(shape.src||""))return '<image'+attrs+' href="'+esc(shape.src)+'" x="'+round(shape.left)+'" y="'+round(shape.top)+'" width="'+round(shape.width)+'" height="'+round(shape.height)+'"/>';
 return "";
}
function frameSvg(model,index,onlyLayer){var box=model.bounds,frame=model.frames[index]||model.frames[0],body="";model.layers.forEach(function(layer){if(layer.visible===false||(onlyLayer&&layer.id!==onlyLayer))return;body+='<g data-svg-layer="'+esc(layer.id)+'" transform="'+transform(layer)+'">'+(frame.artwork[layer.id]||[]).map(shapeSvg).join("")+'</g>';});return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[box.x,box.y,box.w,box.h].map(round).join(" ")+'" width="'+round(box.w)+'" height="'+round(box.h)+'">'+body+'</svg>';}
function frameTimes(model,sceneDuration){
 var length=duration(model),stop=Math.max(model.start+length,number(sceneDuration,model.start+length)),times=[],base=model.start,iterations=0;
 do{var time=base;model.frames.forEach(function(frame,index){if(time<stop-1e-8||!times.length)times.push({t:round(time),frame:index});time+=frameDuration(model,frame);});base+=length;iterations++;
  if(times.length>12000)throw Error("Animation has more than 12000 frame changes; reduce FPS or turn off Loop");
 }while(model.loop&&length>0&&base<stop-1e-8&&iterations<12001);
 return times;
}
function History(value){this.past=[];this.future=[];this.current=copy(value);}
History.prototype.commit=function(value){var text=JSON.stringify(value);if(text===JSON.stringify(this.current))return false;this.past.push(this.current);if(this.past.length>60)this.past.shift();this.current=copy(value);this.future=[];return true;};
History.prototype.undo=function(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return copy(this.current);};
History.prototype.redo=function(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return copy(this.current);};
exports.copy=copy;exports.number=number;exports.clamp=clamp;exports.id=id;exports.escape=esc;exports.round=round;exports.bounds=bounds;exports.create=create;exports.normalize=normalize;
exports.addLayer=addLayer;exports.removeLayer=removeLayer;exports.duplicateLayer=duplicateLayer;exports.moveLayer=moveLayer;exports.layerById=layerById;
exports.addFrame=addFrame;exports.removeFrame=removeFrame;exports.frameAt=frameAt;exports.duration=duration;exports.frameDuration=frameDuration;exports.frameTimes=frameTimes;exports.shapeSvg=shapeSvg;exports.frameSvg=frameSvg;exports.transform=transform;exports.History=History;
})();
