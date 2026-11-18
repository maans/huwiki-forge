/*\
title: $:/plugins/huwiki/animus-video-export/runtime.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Optional export action for the editable AniMus stage and published Site view.
// Renders the same deterministic stage at fixed resolution, frame by frame.
// H.264/AAC is encoded locally via WebCodecs; no network video service is used.
var MP4=require("$:/plugins/huwiki/animus-video-export/mp4.js");
var Soundtrack=require("$:/plugins/huwiki/animus-video-export/audio.js");
function num(n,f){n=Number(n);return Number.isFinite(n)?n:f;}
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function hasDanish(o){var lang=o.wiki&&o.wiki.getTiddlerText("$:/language","")||o.host.ownerDocument.documentElement.lang||"en";return /(?:da|dansk)/i.test(lang);}
function ui(doc,tag,parent,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);if(parent)parent.appendChild(n);return n;}
function label(parent,text,child){var row=ui(parent.ownerDocument,"label",parent,"huw-video-field");ui(parent.ownerDocument,"span",row,"",text);row.appendChild(child);return row;}
function makeOption(select,value,text){var o=ui(select.ownerDocument,"option",select,"",text);o.value=value;return o;}
function fileName(name){return String(name||"AniMus").replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").replace(/\s+/g," ").trim().slice(0,70)||"AniMus";}
function timeCode(seconds,separator){
 var millis=Math.max(0,Math.round(seconds*1000)),hours=Math.floor(millis/3600000),minutes=Math.floor(millis%3600000/60000),secs=Math.floor(millis%60000/1000),ms=millis%1000;
 return [hours,minutes,secs].map(function(n){return String(n).padStart(2,"0");}).join(":")+(separator||".")+String(ms).padStart(3,"0");
}
function saveFile(blob,name){
 var doc=document,url=URL.createObjectURL(blob),a=doc.createElement("a");
 a.href=url;a.download=name;a.rel="noopener";doc.body.appendChild(a);a.click();a.remove();
 setTimeout(function(){URL.revokeObjectURL(url);},60000);
}
async function shareFile(blob,name){
 if(navigator.share&&navigator.canShare&&typeof File!=="undefined"){
  var file=new File([blob],name,{type:blob.type||"video/mp4"});
  if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return true;}
 }
 saveFile(blob,name);return true;
}
function cuesFromStage(stage){
 var cue=stage.querySelector(".huw-musical-caption-cue,.huw-animus-cue");
 var line=stage.querySelector(".huw-musical-caption-line,.huw-animus-line");
 return {cue:cue&&!cue.hidden?cue.textContent.trim():"",line:line&&!line.hidden?line.textContent.trim():""};
}
function wrap(ctx,text,maxWidth){
 var rows=[],parts=String(text||"").split(/\n/);
 parts.forEach(function(part){var line="";
  part.split(/\s+/).forEach(function(word){if(!word)return;
   var next=line?line+" "+word:word;
   if(line&&ctx.measureText(next).width>maxWidth){rows.push(line);line=word;}else line=next;
  });
  if(line)rows.push(line);
 });
 return rows.slice(0,5);
}
function drawCaptions(ctx,stage,width,height,enabled){
 if(!enabled)return;
 var copy=cuesFromStage(stage);
 if(!copy.line&&!copy.cue)return;
 var size=Math.round(height*.043),small=Math.round(height*.025),lineHeight=Math.round(size*1.32);
 var maxWidth=width*.89,pad=size*.5,base=height*.945;
 ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";
 function block(text,font,y,uppercase){
  ctx.font="600 "+font+"px system-ui,-apple-system,Arial,sans-serif";
  var rows=wrap(ctx,uppercase?text.toUpperCase():text,maxWidth);
  if(!rows.length)return 0;
  var h=Math.round(font*1.34),w=Math.min(maxWidth+pad*2,Math.max.apply(null,rows.map(function(t){return ctx.measureText(t).width;}))+pad*2);
  var boxHeight=rows.length*h+pad*.9,top=y-boxHeight;
  ctx.fillStyle="rgba(9,12,18,.72)";ctx.fillRect((width-w)/2,top,w,boxHeight);
  ctx.fillStyle="#fff";rows.forEach(function(row,i){ctx.fillText(row,width/2,top+pad*.46+h*(i+.5));});
  return boxHeight+height*.01;
 }
 var capRows=copy.line?wrap(ctx,copy.line,maxWidth):[];
 if(capRows.length){ctx.font="600 "+size+"px system-ui,-apple-system,Arial,sans-serif";base-=block(copy.line,size,base,false);}
 if(copy.cue)block(copy.cue,small,base,true);
 ctx.restore();
}
function videoPreviewStage(o){
 var svg=o.stage&&o.stage.querySelector("svg");
 if(!svg)throw Error("AniMus SVG stage is missing");
 return svg;
}
async function rasterFrame(o,canvas,ctx,burn){
 var svg=videoPreviewStage(o).cloneNode(true);
 svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
 svg.setAttribute("width",String(canvas.width));svg.setAttribute("height",String(canvas.height));
 svg.setAttribute("preserveAspectRatio","xMidYMid meet");
 var markup=new XMLSerializer().serializeToString(svg);
 if(/(?:href|xlink:href)\s*=\s*["']https?:\/\//i.test(markup))
  throw Error("A stage image points to an external URL. Import it into the wiki before exporting.");
 var blob=new Blob([markup],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob);
 try{
  var img=new Image();
  img.src=url;
  if(typeof img.decode==="function")await img.decode();
  else await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=function(){reject(Error("SVG frame cannot be decoded"));};});
  ctx.fillStyle="#101514";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  drawCaptions(ctx,o.stage,canvas.width,canvas.height,burn);
 }finally{URL.revokeObjectURL(url);}
}
function lineKey(c){return(c.cue?c.cue+"\n":"")+(c.line||"");}
function subtitles(segments,end){
 return "WEBVTT\n\n"+segments.map(function(s,i){
  return (i+1)+"\n"+timeCode(s.start)+" --> "+timeCode(s.end||end)+"\n"+s.text+"\n";
 }).join("\n");
}
async function videoFrames(o,settings,update,cancelled,captionSegments){
 var root=o.host.ownerDocument.defaultView||window;
 if(!root.VideoEncoder||!root.VideoFrame)throw Error("WebCodecs H.264 encoding is unavailable in this browser.");
 var fps=settings.fps,width=settings.width,height=Math.round(width*9/16),codecs=width>1280?["avc1.4d4028","avc1.640028"]:["avc1.4d401f","avc1.42e01f"];
 var bitrate=width>1280?10000000:5000000,config=null;
 for(var c=0;c<codecs.length;c++){
  var attempt={codec:codecs[c],width:width,height:height,bitrate:bitrate,framerate:fps,
   latencyMode:"realtime",hardwareAcceleration:"prefer-hardware",avc:{format:"avc"}};
  try{var supported=await root.VideoEncoder.isConfigSupported(attempt);if(supported&&supported.supported){config=supported.config||attempt;break;}}catch(_){}
 }
 if(!config)throw Error("No H.264 MP4 encoder is supported at this resolution.");
 var canvas=o.host.ownerDocument.createElement("canvas");canvas.width=width;canvas.height=height;
 var context=canvas.getContext("2d",{alpha:false});
 if(!context)throw Error("Video canvas unavailable");
 var samples=[],description=null,problem=null;
 var encoder=new root.VideoEncoder({output:function(chunk,metadata){
  var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
  samples.push({data:data,key:chunk.type==="key",timestamp:chunk.timestamp});
  var cfg=metadata&&metadata.decoderConfig;if(cfg&&cfg.description)description=new Uint8Array(cfg.description);
 },error:function(e){problem=e||Error("H.264 encoder failed");}});
 var count=Math.max(1,Math.ceil((settings.end-settings.start)*fps));
 try{
  encoder.configure(config);
  for(var i=0;i<count;i++){
   if(cancelled())throw Error("Export cancelled");
   var t=Math.min(settings.end-.00001,settings.start+i/fps);
   o.seek(t);
   await rasterFrame(o,canvas,context,settings.burn);
   var caption=cuesFromStage(o.stage),key=lineKey(caption),last=captionSegments[captionSegments.length-1];
   if(key){if(!last||last.text!==key){if(last)last.end=t-settings.start;captionSegments.push({start:t-settings.start,end:0,text:key});}}
   else if(last&&last.end===0)last.end=t-settings.start;
   var timestamp=Math.round(i*1000000/fps);
   var frame=new root.VideoFrame(canvas,{timestamp:timestamp,duration:Math.round(1000000/fps)});
   encoder.encode(frame,{keyFrame:i%(fps*2)===0});frame.close();
   if(encoder.encodeQueueSize>4)await encoder.flush();
   if(problem)throw problem;
   if(i%10===0||i===count-1)update("Beregner billeder / Encoding frames",i/count);
  }
  await encoder.flush();
  if(problem)throw problem;
  samples.sort(function(a,b){return a.timestamp-b.timestamp;});
  if(!description||!samples.length)throw Error("H.264 encoder did not provide an MP4 configuration.");
  var current=captionSegments[captionSegments.length-1];
  if(current&&!current.end)current.end=settings.end-settings.start;
  return {samples:samples,description:description,width:width,height:height,fps:fps,bitrate:bitrate};
 }finally{try{encoder.close();}catch(_){}}
}
function currentRange(scene,position,duration){
 var clips=scene&&scene.scenes||[],start=0,t=clamp(num(position,0),0,duration);
 for(var i=0;i<clips.length;i++){var d=Math.max(.1,num(clips[i].duration,4));
  if(t<start+d||i===clips.length-1)return [start,Math.min(duration,start+d)];
  start+=d;
 }
 return [0,duration];
}
function attach(o){
 if(!o||!o.host||!o.stage||!o.controls||o.host.querySelector("[data-animus-video-export]"))return null;
 var doc=o.host.ownerDocument,da=hasDanish(o),T=function(d,e){return da?d:e;};
 var trigger=ui(doc,"button",o.controls,"huw-video-export-button",T("↓ Eksportér video","↓ Export video"));
 trigger.type="button";trigger.setAttribute("data-animus-video-export","1");
 var overlay=null,busy=false,abort=false,disposed=false,result=null,subtitlesBlob=null;
 function disposeResult(){result=null;subtitlesBlob=null;}
 function dispose(){disposed=true;abort=true;if(trigger.parentNode)trigger.remove();if(overlay)overlay.remove();disposeResult();}
 function close(){if(busy){abort=true;return;}if(overlay)overlay.remove();overlay=null;disposeResult();}
 function open(){
  if(overlay||disposed)return;
  o.pause();var dlg=ui(doc,"div",doc.body,"huw-video-modal");
  overlay=dlg;dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");
  var panel=ui(doc,"section",dlg,"huw-video-panel"),head=ui(doc,"header",panel,"huw-video-head");
  ui(doc,"strong",head,"",T("AniMus · Eksportér video","AniMus · Export video"));
  var closeBtn=ui(doc,"button",head,"huw-video-close","×");closeBtn.type="button";closeBtn.setAttribute("aria-label",T("Luk","Close"));closeBtn.onclick=close;
  var form=ui(doc,"div",panel,"huw-video-options");
  var scope=ui(doc,"select");makeOption(scope,"all",T("Hele forestillingen","Full performance"));makeOption(scope,"part",T("Aktuelt afsnit","Current segment"));
  label(form,T("Udsnit","Range"),scope);
  var span=ui(doc,"div",form,"huw-video-range");
  var begin=ui(doc,"input");begin.type="number";begin.min="0";begin.step=".01";begin.value="0";
  var finish=ui(doc,"input");finish.type="number";finish.min=".01";finish.step=".01";finish.value=String(o.duration());
  label(span,T("Fra (sek.)","From (seconds)"),begin);label(span,T("Til (sek.)","To (seconds)"),finish);
  scope.onchange=function(){var r=scope.value==="part"?currentRange(o.scene,o.position(),o.duration()):[0,o.duration()];begin.value=String(r[0]);finish.value=String(r[1]);};
  var resolution=ui(doc,"select");makeOption(resolution,"1280","HD 720p");makeOption(resolution,"1920","Full HD 1080p");
  resolution.value="1280";label(form,T("Opløsning","Resolution"),resolution);
  var fps=ui(doc,"select");makeOption(fps,"24","24 fps");makeOption(fps,"30","30 fps");fps.value="30";label(form,T("Billedfrekvens","Frame rate"),fps);
  function checkbox(text,checked){var field=ui(doc,"label",form,"huw-video-check"),box=ui(doc,"input");box.type="checkbox";box.checked=checked;field.appendChild(box);ui(doc,"span",field,"",text);return box;}
  var burn=checkbox(T("Brænd undertekster ind i billedet","Burn subtitles into video"),true);
  var vtt=checkbox(T("Hent også redigerbare undertekster (.vtt)","Also save editable captions (.vtt)"),true);
  var music=checkbox(T("Musik (oprindelig ABC-lydbank)","Music (original ABC sound library)"),true);
  var speech=checkbox(T("Tale og optagelser","Speech and recordings"),true);
  var effects=checkbox(T("Lydeffekter","Sound effects"),true);
  ui(doc,"p",form,"huw-video-hint",T("MP4 (H.264 + AAC). Eksporten beregnes lokalt; store film kan kræve meget hukommelse på iPad. Hold fanen åben under eksport.","MP4 (H.264 + AAC). Encoded locally; long videos may require substantial iPad memory. Keep the tab open."));
  var output=ui(doc,"div",panel,"huw-video-output");
  var state=ui(doc,"p",output,"huw-video-status",T("Klar til eksport","Ready to export"));state.setAttribute("role","status");
  var bar=ui(doc,"progress",output,"huw-video-progress");bar.max=100;bar.value=0;
  var actions=ui(doc,"footer",panel,"huw-video-actions");
  var start=ui(doc,"button",actions,"huw-video-primary",T("Opret MP4","Create MP4"));start.type="button";
  var download=ui(doc,"button",actions,"",T("Hent MP4","Save MP4"));download.type="button";download.hidden=true;
  var share=ui(doc,"button",actions,"",T("Del til Filer / LumaFusion","Share to Files / LumaFusion"));share.type="button";share.hidden=true;
  var captionsButton=ui(doc,"button",actions,"",T("Hent VTT","Save VTT"));captionsButton.type="button";captionsButton.hidden=true;
  var cancel=ui(doc,"button",actions,"",T("Luk","Close"));cancel.type="button";cancel.onclick=close;
  var currentName=fileName(o.scene&&o.scene.name||"AniMus");
  function update(phase,value){state.textContent=T("Eksport: ","Export: ")+phase+" "+Math.round(100*clamp(num(value,0),0,1))+" %";bar.value=Math.round(100*clamp(num(value,0),0,1));}
  start.onclick=async function(){
   if(busy)return;
   var a=num(begin.value,NaN),b=num(finish.value,NaN),duration=o.duration();
   if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>duration+.001||b-a<.05){state.textContent=T("Ugyldigt tidsudsnit","Invalid export range");return;}
   busy=true;abort=false;disposeResult();start.disabled=true;closeBtn.disabled=false;cancel.textContent=T("Afbryd","Cancel export");bar.value=0;download.hidden=true;share.hidden=true;captionsButton.hidden=true;
   var oldPosition=o.position(),opts={start:a,end:b,width:Number(resolution.value),fps:Number(fps.value),burn:burn.checked};
   try{
    o.pause();
    var sound=null;
    if(music.checked||speech.checked||effects.checked){
     update(T("Forbereder lyd","Preparing audio"),0);
     sound=await Soundtrack.render({window:doc.defaultView||window,wiki:o.wiki,scene:o.scene,
      songs:o.getSongs&&o.getSongs()||[],ABC:o.getABC&&o.getABC(),soundFont:o.soundFont&&o.soundFont(),
      duration:duration,start:a,end:b,music:music.checked,speech:speech.checked,effects:effects.checked,
      cancelled:function(){return abort||disposed;},progress:update});
    }
    var segments=[];
    var video=await videoFrames(o,opts,update,function(){return abort||disposed;},segments);
    if(abort||disposed)throw Error("Export cancelled");
    update(T("Samler MP4","Finalizing MP4"),.97);
    var bytes=MP4.mux(video,sound);
    result=new Blob([bytes],{type:"video/mp4"});bytes=null;
    if(vtt.checked)subtitlesBlob=new Blob([subtitles(segments,b-a)],{type:"text/vtt;charset=utf-8"});
    var name=currentName+"-"+Math.round(a)+"-"+Math.round(b);
    download.onclick=function(){if(result)saveFile(result,name+".mp4");};
    share.onclick=function(){if(result)shareFile(result,name+".mp4").catch(function(error){state.textContent=String(error&&error.message||error);});};
    captionsButton.onclick=function(){if(subtitlesBlob)saveFile(subtitlesBlob,name+".vtt");};
    download.hidden=false;share.hidden=false;captionsButton.hidden=!subtitlesBlob;
    state.textContent=T("MP4 klar: ","MP4 ready: ")+(result.size/1048576).toFixed(1)+" MB · "+opts.width+"×"+Math.round(opts.width*9/16)+", "+opts.fps+" fps";
    bar.value=100;
   }catch(error){
    if(!disposed)state.textContent=(abort?T("Eksport afbrudt","Export cancelled"):T("Eksportfejl: ","Export error: ")+String(error&&error.message||error));
   }finally{
    try{if(!disposed){o.seek(oldPosition);o.pause();}}catch(_){}
    busy=false;start.disabled=false;cancel.textContent=T("Luk","Close");
    if(disposed||abort){if(overlay){overlay.remove();overlay=null;}disposeResult();}
   }
  };
  dlg.addEventListener("click",function(e){if(e.target===dlg)close();});
  dlg.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();close();}});
  panel.tabIndex=-1;panel.focus({preventScroll:true});
 }
 trigger.onclick=open;
 return {dispose:dispose,open:open};
}
exports.attach=attach;
exports.subtitles=subtitles;
exports.currentRange=currentRange;
})();