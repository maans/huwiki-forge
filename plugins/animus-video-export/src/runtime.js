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
var Bundle=require("$:/plugins/huwiki/animus-video-export/bundle.js");
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
 var group=stage.querySelector(".plato-caption");
 if(group&&group.hidden)return {cue:"",line:""};
 var cue=stage.querySelector(".huw-musical-caption-cue,.huw-animus-cue,.plato-caption-speaker");
 var line=stage.querySelector(".huw-musical-caption-line,.huw-animus-line,.plato-caption-text");
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
 // Authoring handles are part of the live SVG, never of the performance.
 Array.prototype.slice.call(svg.querySelectorAll(".huw-musical-transform-overlay,.co-direct-overlay,.co-selection-overlay")).forEach(function(node){node.remove();});
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
function recordCaption(segments,copy,time){
 var key=lineKey(copy),last=segments[segments.length-1];
 if(last&&last.end==null&&last.text===key)return;
 if(last&&last.end==null)last.end=time;
 if(key)segments.push({start:time,end:null,text:key});
}
function subtitles(segments,end){
 return "WEBVTT\n\n"+segments.filter(function(s){return Math.min(end,s.end==null?end:s.end)>s.start;}).map(function(s,i){
  return (i+1)+"\n"+timeCode(s.start)+" --> "+timeCode(Math.min(end,s.end==null?end:s.end))+"\n"+s.text+"\n";
 }).join("\n");
}
// Every editing asset has one common zero and one whole-frame duration.
// The tiny remainder after the selected end is silence plus the last picture.
function exportRange(start,end,fps){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||[24,30].indexOf(fps)<0)throw Error("Invalid export range or frame rate");
 var frames=Math.max(1,Math.ceil((end-start)*fps-1e-8));
 return {start:start,end:end,fps:fps,videoFrames:frames,audioFrames:frames*(48000/fps),
  duration:frames/fps,padding:Math.max(0,frames/fps-(end-start))};
}
async function videoConfig(o,settings){
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
 return config;
}
async function videoFrames(o,settings,update,cancelled,captionSegments,preparedConfig){
 var root=o.host.ownerDocument.defaultView||window,config=preparedConfig||await videoConfig(o,settings);
 var fps=settings.fps,width=settings.width,height=Math.round(width*9/16),bitrate=config.bitrate;
 var canvas=o.host.ownerDocument.createElement("canvas");canvas.width=width;canvas.height=height;
 var context=canvas.getContext("2d",{alpha:false});
 if(!context)throw Error("Video canvas unavailable");
 var samples=[],description=null,problem=null;
 var encoder=new root.VideoEncoder({output:function(chunk,metadata){
  var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
  samples.push({data:data,key:chunk.type==="key",timestamp:chunk.timestamp});
  var cfg=metadata&&metadata.decoderConfig;if(cfg&&cfg.description)description=new Uint8Array(cfg.description);
 },error:function(e){problem=e||Error("H.264 encoder failed");}});
 var count=exportRange(settings.start,settings.end,fps).videoFrames;
 try{
  encoder.configure(config);
  for(var i=0;i<count;i++){
   if(cancelled())throw Error("Export cancelled");
   var t=Math.min(settings.end-.00001,settings.start+i/fps);
   o.seek(t);
   await rasterFrame(o,canvas,context,settings.burn);
   recordCaption(captionSegments,cuesFromStage(o.stage),t-settings.start);
   var timestamp=Math.round(i*1000000/fps);
   var frame=new root.VideoFrame(canvas,{timestamp:timestamp,duration:Math.round(1000000/fps)});
   encoder.encode(frame,{keyFrame:i%(fps*2)===0});frame.close();
   if(encoder.encodeQueueSize>4)await encoder.flush();
   if(problem)throw problem;
   if(i%10===0||i===count-1)update("Beregner billeder / Encoding frames",i/count);
  }
  await encoder.flush();
  if(problem)throw problem;
  validateVideoSamples(samples,count,fps);
  if(!description||!samples.length)throw Error("H.264 encoder did not provide an MP4 configuration.");
  var current=captionSegments[captionSegments.length-1];
  if(current&&current.end==null)current.end=settings.end-settings.start;
  return {samples:samples,description:description,width:width,height:height,fps:fps,bitrate:bitrate};
 }finally{try{encoder.close();}catch(_){}}
}
function validateVideoSamples(samples,count,fps){
 if(samples.length!==count)throw Error("The H.264 encoder did not return every video frame.");
 if(!samples.length||!samples[0].key)throw Error("The exported video does not start with a keyframe.");
 samples.forEach(function(sample,index){
  if(!Number.isFinite(sample.timestamp)||Math.abs(sample.timestamp-Math.round(index*1000000/fps))>1)
   throw Error("The H.264 encoder changed the frame order or timing. This encoder cannot create synchronized exports.");
 });
}
async function captionFrames(o,settings,update,cancelled){
 var segments=[],count=exportRange(settings.start,settings.end,settings.fps).videoFrames;
 for(var i=0;i<count;i++){
  if(cancelled())throw Error("Export cancelled");
  var t=Math.min(settings.end-.00001,settings.start+i/settings.fps);
  o.seek(t);
  // Caption-language plugins update their text through MutationObserver.
  // Let that microtask complete before reading the selected language.
  await Promise.resolve();
  recordCaption(segments,cuesFromStage(o.stage),t-settings.start);
  if(i%60===0){update("Undertekster / Captions",i/count);await new Promise(function(resolve){setTimeout(resolve,0);});}
 }
 return segments;
}
function packageManifest(scene,settings,stems,video,hasCaptions){
 var range=exportRange(settings.start,settings.end,settings.fps);
 return {format:"animus-editing-bundle",version:1,title:scene&&scene.name||"AniMus",
  sourceRange:{startSeconds:range.start,endSeconds:range.end},
  timeline:{startSeconds:0,durationSeconds:range.duration,frameRate:range.fps,videoFrames:range.videoFrames,
   sampleRate:48000,audioFrames:range.audioFrames,endPaddingSeconds:range.padding},
  video:video?{file:"video.mp4",audio:false,burnedCaptions:!!settings.burn,width:settings.width,height:Math.round(settings.width*9/16)}:null,
  audio:stems.map(function(stem){return {id:stem.id,file:stem.id+".wav",startSeconds:0,sampleRate:stem.sampleRate,
   channels:stem.channels,bitsPerSample:stem.bitsPerSample,frames:stem.frameCount,durationSeconds:stem.duration,
   peak:stem.peak,clippedSamples:stem.clippedSamples||0,normalized:false};}),
  captions:hasCaptions?{file:"captions.vtt",startSeconds:0,language:"current player selection",directLumaFusionImportVerified:false}:null,
  audioPolicy:"Original clip levels, fades, mutes and source offsets; no per-stem normalization. Recorded audio is kept intact, not source-separated."
 };
}
function packageReadme(manifest){
 var lines=["AniMus - pakke til videoredigering / editing bundle","",manifest.title,"",
  "DA: Pak ZIP-filen ud i Filer. Importér video.mp4 og de ønskede WAV-filer i dit videoprogram.",
  "Læg alle filer ved samme startpunkt (00:00). Bevar stilheden i starten af lydsporene.",
  "Videoen har ingen lyd. Tale/optaget sang: speech.wav. ABC-musik og musikoptagelser: music.wav. Effekter: effects.wav.",
  "Kun de valgte spor er med. Allerede sammenblandet lyd i en optagelse bliver ikke skilt ad.",
  "Lydstyrker og fades er bevaret; sporene er ikke normaliseret hver for sig.",
  "Undertekster følger afspillerens valgte sprog. Direkte VTT-import i LumaFusion er ikke verificeret.",
  "", "EN: Unzip in Files. Import video.mp4 and the selected WAV files into your editor.",
  "Place every file at the SAME timeline start (00:00); keep leading silence intact.",
  "Video has no audio. Speech/recorded singing: speech.wav. ABC music and music recordings: music.wav. Effects: effects.wav.",
  "Only selected tracks are included. Pre-mixed recordings remain intact; this is not source separation.",
  "Clip levels and fades are preserved. No independent normalization is applied.",
  "Captions use the player's current language. Direct VTT import in LumaFusion has not been verified.",
  "", "Source range: "+manifest.sourceRange.startSeconds+" - "+manifest.sourceRange.endSeconds+" seconds",
  "Common duration: "+manifest.timeline.durationSeconds+" seconds",
  "Frame rate: "+manifest.timeline.frameRate+" fps; audio: 48000 Hz stereo PCM WAV.",
  "The last video frame is completed; the remaining "+manifest.timeline.endPaddingSeconds+" seconds are silent in all WAVs."];
 manifest.audio.forEach(function(stem){if(stem.clippedSamples)lines.push("WARNING: "+stem.file+" has "+stem.clippedSamples+" clipped samples. Lower the source clip levels and export again.");});
 return lines.join("\r\n")+"\r\n";
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
 var overlay=null,busy=false,abort=false,disposed=false,result=null,allResult=null,subtitlesBlob=null,files=[];
 function disposeResult(){result=null;allResult=null;subtitlesBlob=null;files=[];}
 function dispose(){disposed=true;abort=true;if(trigger.parentNode)trigger.remove();if(overlay)overlay.remove();disposeResult();}
 function close(){if(busy){abort=true;return;}if(overlay)overlay.remove();overlay=null;disposeResult();}
 function open(){
  if(overlay||disposed)return;
  // Fullscreen hides elements outside its subtree, even a fixed dialog with a
  // high z-index. Keep the export controls with this player's visible surface.
  var fullscreen=doc.fullscreenElement||doc.webkitFullscreenElement;
  var parent=fullscreen&&fullscreen.contains(o.host)?fullscreen:doc.body;
  o.pause();var dlg=ui(doc,"div",parent,"huw-video-modal");
  overlay=dlg;dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");
  var panel=ui(doc,"section",dlg,"huw-video-panel"),head=ui(doc,"header",panel,"huw-video-head");
  ui(doc,"strong",head,"",T("AniMus · Eksportér video","AniMus · Export video"));
  var closeBtn=ui(doc,"button",head,"huw-video-close","×");closeBtn.type="button";closeBtn.setAttribute("aria-label",T("Luk","Close"));closeBtn.onclick=close;
  var form=ui(doc,"div",panel,"huw-video-options");
  var mode=ui(doc,"select",null,"huw-video-mode");
  makeOption(mode,"movie",T("MP4 med samlet lyd","MP4 with mixed audio"));
  makeOption(mode,"bundle",T("Pakke til videoredigering (ZIP)","Video editing package (ZIP)"));
  makeOption(mode,"stems",T("Kun separate lydspor (ZIP)","Separate audio tracks only (ZIP)"));
  label(form,T("Eksporttype","Export type"),mode).classList.add("huw-video-wide");
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
  var vtt=checkbox(T("Separat undertekstfil (.vtt)","Separate caption file (.vtt)"),true);
  var music=checkbox(T("Musik (ABC og musikoptagelser)","Music (ABC and music recordings)"),true);
  var speech=checkbox(T("Tale og optaget sang","Speech and recorded singing"),true);
  var effects=checkbox(T("Lydeffekter","Sound effects"),true);
  var hint=ui(doc,"p",form,"huw-video-hint");
  var summary=ui(doc,"section",form,"huw-video-summary");
  ui(doc,"strong",summary,"",T("Filer ved næste eksport","Files in the next export"));
  var summaryNames=ui(doc,"p",summary,"huw-video-summary-names"),summaryNote=ui(doc,"p",summary,"");
  ui(doc,"p",form,"huw-video-hint",T("Eksperimentel eksport · Prøv et kort klip først. Hold fanen åben under eksport. Undertekster følger det valgte sprog i afspilleren.","Experimental export · Try a short clip first. Keep the tab open. Captions follow the language selected in the player."));
  var output=ui(doc,"div",panel,"huw-video-output");
  var state=ui(doc,"p",output,"huw-video-status",T("Klar til eksport","Ready to export"));state.setAttribute("role","status");
  var changedNotice=ui(doc,"p",output,"huw-video-changed",T("Indstillingerne er ændret. Filerne nedenfor er fra den seneste eksport.","Settings have changed. The files below are from the most recent export."));changedNotice.hidden=true;
  var bar=ui(doc,"progress",output,"huw-video-progress");bar.max=100;bar.value=0;
  var fileList=ui(doc,"div",output,"huw-video-files");fileList.tabIndex=-1;fileList.setAttribute("aria-label",T("Filer klar til at hente","Files ready to download"));
  var actions=ui(doc,"footer",panel,"huw-video-actions");
  var start=ui(doc,"button",actions,"huw-video-primary",T("Opret MP4","Create MP4"));start.type="button";
  var downloadAll=ui(doc,"button",actions,"huw-video-download-all",T("↓ Hent alle valgte filer","↓ Save all selected files"));downloadAll.type="button";downloadAll.hidden=true;
  downloadAll.setAttribute("aria-label",T("Hent alle valgte filer","Save all selected files"));
  var share=ui(doc,"button",actions,"",T("Del til Filer / LumaFusion","Share to Files / LumaFusion"));share.type="button";share.hidden=true;
  var cancel=ui(doc,"button",actions,"",T("Luk","Close"));cancel.type="button";cancel.onclick=close;
  var currentName=fileName(o.scene&&o.scene.name||"AniMus"),ready=false,completedSignature=null;
  function settingsSignature(){return JSON.stringify([mode.value,begin.value,finish.value,resolution.value,fps.value,burn.checked,vtt.checked,music.checked,speech.checked,effects.checked]);}
  function refreshMode(){
   var editing=mode.value!=="movie",audioOnly=mode.value==="stems";
   resolution.disabled=audioOnly;burn.disabled=audioOnly;
   start.textContent=ready?T("Opret igen","Create again"):editing?(audioOnly?T("Opret lydpakke","Create audio package"):T("Opret redigeringspakke","Create editing package")):T("Opret MP4","Create MP4");
   if(ready)start.classList.add("huw-video-recreate");else start.classList.remove("huw-video-recreate");
   changedNotice.hidden=!ready||completedSignature===settingsSignature();
   var names=audioOnly?[]:["video.mp4"];
   if(editing){if(music.checked)names.push("music.wav");if(speech.checked)names.push("speech.wav");if(effects.checked)names.push("effects.wav");}
   if(vtt.checked)names.push("captions.vtt");
   summaryNames.textContent=names.length?names.join(" · "):T("Vælg mindst ét lydspor","Select at least one audio track");
   summaryNote.textContent=editing?T("Valgte lydspor bliver separate WAV-filer med fælles start og længde. ZIP-filen indeholder også manifest.json og README.txt med tidsoplysninger og importvejledning.","Selected audio tracks become separate WAV files with the same start and duration. The ZIP also includes manifest.json and README.txt with timing and import instructions."):
    music.checked||speech.checked||effects.checked?T("De afkrydsede lydspor blandes i video.mp4. Vælg Pakke til videoredigering for at få dem som separate WAV-filer.","The checked audio tracks are mixed into video.mp4. Choose Video editing package to receive them as separate WAV files."):
    T("Ingen lydspor er valgt: video.mp4 bliver uden lyd.","No audio tracks are selected: video.mp4 will be silent.");
   hint.textContent=editing?T("Separate WAV-spor med samme startpunkt, pauser og længde. Pak ZIP-filen ud og læg filerne ved samme startpunkt i LumaFusion. Optagelser bevares som de er. VTT-import i LumaFusion er ikke verificeret.","Separate WAV tracks share the same start, silence and duration. Unzip and place every file at the same start in LumaFusion. Recordings stay intact. VTT import in LumaFusion is not verified."):T("MP4 (H.264 + AAC) med de valgte spor blandet sammen. Eksporten beregnes lokalt; store film kan kræve meget hukommelse på iPad.","MP4 (H.264 + AAC) with the selected tracks mixed together. Encoded locally; long videos can require substantial iPad memory.");
  }
  mode.onchange=function(){burn.checked=mode.value==="movie";refreshMode();};
  [music,speech,effects,vtt].forEach(function(input){input.onchange=refreshMode;});refreshMode();
  form.addEventListener("change",refreshMode);
  form.addEventListener("input",refreshMode);
  function update(phase,value){state.textContent=T("Eksport: ","Export: ")+phase+" "+Math.round(100*clamp(num(value,0),0,1))+" %";bar.value=Math.round(100*clamp(num(value,0),0,1));}
  start.onclick=async function(){
   if(busy)return;
   var a=num(begin.value,NaN),b=num(finish.value,NaN),duration=o.duration();
   if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>duration+.001||b-a<.05){state.textContent=T("Ugyldigt tidsudsnit","Invalid export range");return;}
   if(mode.value==="stems"&&!music.checked&&!speech.checked&&!effects.checked){state.textContent=T("Vælg mindst ét lydspor","Select at least one audio track");return;}
   busy=true;abort=false;ready=false;disposeResult();start.disabled=true;closeBtn.disabled=false;cancel.textContent=T("Afbryd","Cancel export");bar.value=0;downloadAll.hidden=true;share.hidden=true;
   completedSignature=null;changedNotice.hidden=true;
   start.classList.remove("huw-video-recreate");downloadAll.classList.remove("huw-video-download");
   fileList.textContent="";
   var oldPosition=o.position(),exportSignature=settingsSignature(),opts={start:a,end:b,width:Number(resolution.value),fps:Number(fps.value),burn:burn.checked,
    mode:mode.value,vtt:vtt.checked,music:music.checked,speech:speech.checked,effects:effects.checked};
   var range=exportRange(a,b,opts.fps),isCancelled=function(){return abort||disposed;},restoreExport=null;
   var inputs=Array.prototype.slice.call(form.querySelectorAll("input,select"));inputs.forEach(function(input){input.disabled=true;});
   try{
    o.pause();
    var sound=null,stems=[],video=null,segments=[],config=null;
    // Check video support first; audio-only export deliberately bypasses it.
    if(opts.mode!=="stems")config=await videoConfig(o,opts);
    if(isCancelled())throw Error("Export cancelled");
    if(o.beginExport)restoreExport=o.beginExport();
    var audioOptions={window:doc.defaultView||window,wiki:o.wiki,scene:o.scene,
     songs:o.getSongs&&o.getSongs()||[],ABC:o.getABC&&o.getABC(),soundFont:o.soundFont&&o.soundFont(),
     duration:duration,start:a,end:b,frameCount:range.audioFrames,music:opts.music,speech:opts.speech,effects:opts.effects,
     cancelled:isCancelled,progress:update};
    if(opts.music||opts.speech||opts.effects){
     update(T("Forbereder lyd","Preparing audio"),0);
     if(opts.mode==="movie")sound=await Soundtrack.render(audioOptions);
     else stems=await Soundtrack.renderStems(audioOptions);
    }
    if(opts.mode!=="stems"){
     video=await videoFrames(o,opts,update,isCancelled,segments,config);
     update(T("Samler MP4","Finalizing MP4"),.97);
     var bytes=MP4.mux(video,sound);result=new Blob([bytes],{type:"video/mp4"});bytes=null;
     // Release encoder chunks before packaging the original output Blob.
     video.samples=[];if(sound)sound.samples=[];
    }else if(opts.vtt)segments=await captionFrames(o,opts,update,isCancelled);
    if(isCancelled())throw Error("Export cancelled");
    if(opts.vtt)subtitlesBlob=new Blob([subtitles(segments,b-a)],{type:"text/vtt;charset=utf-8"});
    var name=currentName+"-"+a+"-"+b;
    if(result)files.push({name:"video.mp4",blob:result,description:opts.mode==="movie"&&(opts.music||opts.speech||opts.effects)?T("Video med samlet lyd","Video with mixed audio"):T("Video uden lyd","Video without audio")});
    var stemDescriptions={music:T("Musik","Music"),speech:T("Tale og optaget sang","Speech and recorded singing"),effects:T("Lydeffekter","Sound effects")};
    stems.forEach(function(stem){files.push({name:stem.id+".wav",blob:stem.blob,description:stemDescriptions[stem.id]});});
    if(subtitlesBlob)files.push({name:"captions.vtt",blob:subtitlesBlob,description:T("Separat undertekstfil","Separate caption file")});
    if(opts.mode!=="movie"){
     var manifest=packageManifest(o.scene,opts,stems,video,!!subtitlesBlob);
     files.push({name:"manifest.json",blob:new Blob([JSON.stringify(manifest,null,2)+"\n"],{type:"application/json"}),description:T("Tidsplacering og sporoplysninger","Track timing and details"),secondary:true});
     files.push({name:"README.txt",blob:new Blob([packageReadme(manifest)],{type:"text/plain;charset=utf-8"}),description:T("Vejledning til import i videoprogram","Video editor import instructions"),secondary:true});
     result=await Bundle.zip(files,{cancelled:isCancelled,progress:update});
     allResult=result;
    }else if(files.length>1){
     // Package the already encoded picture and sidecar; downloading all files
     // never re-renders video or relies on multiple automatic iOS downloads.
     allResult=await Bundle.zip(files,{cancelled:isCancelled,progress:update});
    }else{
     allResult=result;
    }
    if(isCancelled())throw Error("Export cancelled");
    ui(doc,"strong",fileList,"huw-video-files-title",T("Filer klar til at hente","Files ready to download"));
    ui(doc,"p",fileList,"huw-video-files-help",T("Hent alle filer samlet, eller vælg pilen ved den enkelte fil.","Save all files together, or choose the arrow beside an individual file."));
    var metadataList=null;
    files.forEach(function(file){
     var parent=fileList;
     if(file.secondary){
      if(!metadataList){metadataList=ui(doc,"details",fileList,"huw-video-file-metadata");ui(doc,"summary",metadataList,"",T("Pakkeoplysninger og vejledning","Package details and instructions"));}
      parent=metadataList;
     }
     var row=ui(doc,"div",parent,"huw-video-file-row"),info=ui(doc,"div",row,"huw-video-file-info");
     ui(doc,"strong",info,"huw-video-file-name",file.name);
     var size=file.blob.size>=1048576?(file.blob.size/1048576).toFixed(1)+" MB":Math.max(1,Math.ceil(file.blob.size/1024))+" KB";
     ui(doc,"span",info,"huw-video-file-description",file.description+" · "+size);
     var button=ui(doc,"button",row,"huw-video-file-download","↓");button.type="button";
     button.setAttribute("aria-label",T("Hent ","Save ")+file.name);button.setAttribute("title",T("Hent ","Save ")+file.name);
     if(opts.mode==="movie"&&file.name==="video.mp4")button.classList.add("huw-video-download");
     var filename=opts.mode==="movie"&&file.name==="video.mp4"?name+".mp4":name+"-"+file.name;
     button.onclick=function(){if(!busy&&ready&&!disposed)saveFile(file.blob,filename);};
    });
    var allExtension=opts.mode!=="movie"||files.length>1?".zip":".mp4";
    if(opts.mode!=="movie")downloadAll.classList.add("huw-video-download");
    downloadAll.textContent=T("↓ Hent alle valgte filer","↓ Save all selected files")+(allExtension===".zip"?" (ZIP)":"");
    downloadAll.onclick=function(){if(!busy&&allResult&&!disposed)saveFile(allResult,name+allExtension);};
    share.textContent=allExtension===".zip"?T("Del alle filer til Filer","Share all files to Files"):T("Del til Filer / LumaFusion","Share to Files / LumaFusion");
    share.onclick=function(){if(!busy&&allResult&&!disposed)shareFile(allResult,name+allExtension).catch(function(error){if(!disposed&&overlay)state.textContent=String(error&&error.message||error);});};
    ready=true;completedSignature=exportSignature;downloadAll.hidden=false;share.hidden=false;
    state.textContent=(opts.mode==="movie"?T("MP4 klar: ","MP4 ready: "):opts.mode==="stems"?T("Lydpakke klar: ","Audio package ready: "):T("Redigeringspakke klar: ","Editing package ready: "))+(result.size/1048576).toFixed(1)+" MB · "+range.duration.toFixed(3)+" s · "+opts.fps+" fps";
    var clipped=stems.filter(function(stem){return stem.clippedSamples>0;});
    if(clipped.length)state.textContent+=T(" · Overstyring i "," · Clipping in ")+clipped.map(function(stem){return stem.id+".wav";}).join(", ")+T(". Sænk kildesporets lydstyrke og eksportér igen.",". Lower source clip levels and export again.");
    bar.value=100;
   }catch(error){
    disposeResult();ready=false;fileList.textContent="";downloadAll.hidden=true;share.hidden=true;
    if(!disposed)state.textContent=(abort?T("Eksport afbrudt","Export cancelled"):T("Eksportfejl: ","Export error: ")+String(error&&error.message||error));
   }finally{
    try{if(!disposed&&restoreExport)restoreExport();}catch(_){}
    try{if(!disposed){o.seek(oldPosition);o.pause();}}catch(_){}
    busy=false;start.disabled=false;cancel.textContent=T("Luk","Close");inputs.forEach(function(input){input.disabled=false;});refreshMode();
    if(disposed||abort){if(overlay){overlay.remove();overlay=null;}disposeResult();}
    else if(ready){
     try{fileList.focus({preventScroll:true});fileList.scrollIntoView({block:"nearest",behavior:"smooth"});}catch(_){}
    }
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
exports.exportRange=exportRange;
exports.recordCaption=recordCaption;
exports.packageManifest=packageManifest;
exports.validateVideoSamples=validateVideoSamples;
})();
