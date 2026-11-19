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
  video:video?{file:"video.mp4",audio:settings.audio==="playback",burnedCaptions:!!settings.burn,width:settings.width,height:Math.round(settings.width*9/16)}:null,
  audio:stems.map(function(stem){return {id:stem.id,file:stem.id+".wav",startSeconds:0,sampleRate:stem.sampleRate,
   channels:stem.channels,bitsPerSample:stem.bitsPerSample,frames:stem.frameCount,durationSeconds:stem.duration,
   peak:stem.peak,clippedSamples:stem.clippedSamples||0,normalized:false};}),
  captions:hasCaptions?{file:"captions.vtt",startSeconds:0,language:settings.captionLanguage||"current player selection",directLumaFusionImportVerified:false}:null,
  audioPolicy:"Original clip levels, fades, mutes and source offsets; no per-stem normalization. Recorded audio is kept intact, not source-separated."
 };
}
function packageReadme(manifest){
 var video=manifest.video,daVideo=!video?"Pakken indeholder ingen video.":video.audio?"Videoen indeholder lyd fra afspilleren.":"Videoen har ingen lyd.";
 var enVideo=!video?"This package contains no video.":video.audio?"The video includes the player's audio.":"The video has no audio.";
 var lines=["AniMus - pakke til videoredigering / editing bundle","",manifest.title,"",
  "DA: Pak ZIP-filen ud i Filer. "+(video?"Importér video.mp4 og de ønskede WAV-filer i dit videoprogram.":"Importér de ønskede WAV-filer i dit videoprogram."),
  "Læg alle filer ved samme startpunkt (00:00). Bevar stilheden i starten af lydsporene.",
  daVideo+" Tale/optaget sang: speech.wav. ABC-musik og musikoptagelser: music.wav. Effekter: effects.wav.",
  video&&video.audio?"Hvis WAV-sporene skal erstatte videoens lyd, skal videoens lyd slås fra.":"",
  "Kun de valgte spor er med. Allerede sammenblandet lyd i en optagelse bliver ikke skilt ad.",
  "Lydstyrker og fades er bevaret; sporene er ikke normaliseret hver for sig.",
  "Undertekster følger afspillerens valgte sprog. Direkte VTT-import i LumaFusion er ikke verificeret.",
  "", "EN: Unzip in Files. "+(video?"Import video.mp4 and the selected WAV files into your editor.":"Import the selected WAV files into your editor."),
  "Place every file at the SAME timeline start (00:00); keep leading silence intact.",
  enVideo+" Speech/recorded singing: speech.wav. ABC music and music recordings: music.wav. Effects: effects.wav.",
  video&&video.audio?"Mute the video's audio when using the WAV tracks to replace its soundtrack.":"",
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
 var ids=["video","music","speech","effects","captions"],names={video:"video.mp4",music:"music.wav",speech:"speech.wav",effects:"effects.wav",captions:"captions.vtt"};
 var labels={video:T("Video (.mp4)","Video (.mp4)"),music:T("Musik (.wav)","Music (.wav)"),speech:T("Tale og sang (.wav)","Speech and singing (.wav)"),effects:T("Lydeffekter (.wav)","Sound effects (.wav)"),captions:T("Undertekster (.vtt)","Captions (.vtt)")};
 var settings={start:0,end:Math.round(o.duration()*1000)/1000,width:1280,fps:30,audio:"playback",captions:"burn"};
 var selected={video:true,music:false,speech:false,effects:false,captions:true};
 // One current reusable rendition plus the last displayed rendition per kind.
 // Closing a dialog never releases its files; player teardown does.
 var cached=Object.create(null),shown=Object.create(null),captionCache=null,batch=null;
 var overlay=null,uiState=null,busy=false,abort=false,closeRequested=false,disposed=false,generation=0;
 function release(){cached=Object.create(null);shown=Object.create(null);captionCache=null;batch=null;}
 function hideDialog(){if(overlay)overlay.remove();overlay=null;uiState=null;}
 function close(){if(busy){abort=true;closeRequested=true;return;}hideDialog();}
 function cancel(){if(busy){abort=true;if(uiState)uiState.status.textContent=T("Afbryder eksport…","Cancelling export…");}else close();}
 function dispose(){disposed=true;abort=true;if(o.wiki&&o.wiki.removeEventListener)o.wiki.removeEventListener("change",wikiChanged);if(trigger.parentNode)trigger.remove();hideDialog();release();}
 function selectedIds(){return ids.filter(function(id){return selected[id];});}
 function normalize(n){return Number.isFinite(Number(n))?Math.round(Number(n)*1000)/1000:NaN;}
 function revisions(titles){
  return Array.from(new Set(Array.isArray(titles)?titles:[])).sort().map(function(title){
   return [title,o.wiki&&o.wiki.getChangeCount?o.wiki.getChangeCount(title):0];
  });
 }
 function sourceState(){
  var deps=o.getDependencyTitles?o.getDependencyTitles():null,live=o.getLiveExportState?o.getLiveExportState():{};
  var revision=o.getSourceRevision?o.getSourceRevision():(!deps?generation:0),grouped=revision&&typeof revision==="object";
  if(Array.isArray(deps))deps={visual:deps,audio:deps,captions:deps};deps=deps||{};live=live||{};
  var wiki=o.wiki,choice=wiki&&wiki.getTiddlerText?wiki.getTiddlerText("$:/config/huwiki/animus/caption-language","auto"):"auto";
  var language=wiki&&wiki.getTiddlerText?wiki.getTiddlerText("$:/language",""):doc.documentElement.lang||"";
  var selector=o.host.querySelector('[data-huw-animus-captions="language"]');if(selector)choice=selector.value;
  function part(kind){return JSON.stringify([grouped?revision[kind]:revision,revisions(deps[kind]),live[kind]||null]);}
  return {visual:part("visual"),audio:JSON.stringify([part("audio"),o.soundFont?o.soundFont():""]),captions:JSON.stringify([part("captions"),choice,language]),captionLanguage:choice};
 }
 function wikiChanged(changes){
  if(Object.keys(changes||{}).some(function(title){return !/^\$:\/(?:temp\/|state\/|status\/|StoryList$|HistoryList$)/.test(title);}))generation++;
  if(uiState&&!busy)refresh();
 }
 if(o.wiki&&o.wiki.addEventListener)o.wiki.addEventListener("change",wikiChanged);
 function plan(){
  var s=Object.assign({},settings),start=normalize(s.start),end=normalize(s.end),duration=o.duration();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.001||end-start<.05)throw Error(T("Ugyldigt tidsudsnit","Invalid export range"));
  s.start=start;s.end=end;
  var range=exportRange(start,end,s.fps),source=sourceState(),keys={};
  keys.video=JSON.stringify([source.visual,start,end,s.width,s.fps,s.audio,s.audio==="playback"?source.audio:null,s.captions,s.captions==="burn"?source.captions:null]);
  ["music","speech","effects"].forEach(function(id){keys[id]=JSON.stringify([source.audio,id,start,end,range.audioFrames]);});
  keys.captions=JSON.stringify([source.captions,start,end,s.fps]);
  return {settings:s,range:range,source:source,keys:keys,ids:selectedIds()};
 }
 function get(id,key){return cached[id]&&cached[id].key===key?cached[id]:shown[id]&&shown[id].key===key?shown[id]:null;}
 function archiveKey(p){return JSON.stringify(p.ids.map(function(id){return [id,p.keys[id]];}));}
 function contextText(id,s){
  var text=s.start+"–"+s.end+" s";
  if(id==="video")text+=" · "+Math.round(s.width*9/16)+"p · "+s.fps+" fps · "+(s.audio==="playback"?T("med lyd","with audio"):T("uden lyd","silent"));
  return text;
 }
 function saveArtifact(id,artifact){if(artifact&&!disposed)saveFile(artifact.blob,artifact.filename);}
 function refresh(){
  if(!uiState)return;
  var u=uiState,p=null;try{p=plan();}catch(_){}
  var chosen=selectedIds(),missing=p?chosen.filter(function(id){return !get(id,p.keys[id]);}):chosen;
  var complete=p&&chosen.length&&missing.length===0,packed=complete&&batch&&batch.key===archiveKey(p);
  ids.forEach(function(id){
   var row=u.rows[id],current=p&&get(id,p.keys[id]),artifact=current||shown[id]||cached[id];
   row.check.checked=selected[id];row.check.disabled=busy;
   row.arrow.disabled=!artifact;row.arrow.hidden=false;
   row.arrow.classList.remove("huw-video-download");
   if(id==="video"&&artifact)row.arrow.classList.add("huw-video-download");
   row.arrow.onclick=function(){saveArtifact(id,artifact);};
   row.context.textContent=artifact?contextText(id,artifact.settings):"";
   row.status.textContent=artifact?(current&&artifact.key===p.keys[id]?T("Klar","Ready"):T("Skal opdateres · tidligere fil kan hentes","Needs updating · previous file can be saved")):current?T("Klar til at samle","Ready to package"):T("Ikke oprettet","Not created");
   row.element.setAttribute("data-ready",artifact?"true":"false");row.element.setAttribute("data-current",current?"true":"false");
  });
  u.start.disabled=busy||!chosen.length||!!packed;
  u.start.textContent=packed?T("Filerne er klar","Files are ready"):complete?T("Klargør valgte filer","Prepare selected files"):
   missing.length<chosen.length?T("Opret manglende filer","Create missing files"):T("Opret valgte filer","Create selected files");
  u.start.classList.remove("huw-video-recreate");
  if(packed)u.start.classList.add("huw-video-secondary");else u.start.classList.remove("huw-video-secondary");
  u.all.hidden=!packed;u.share.hidden=!packed;u.all.disabled=busy;
  u.all.classList.remove("huw-video-download");if(packed&&!shown.video&&!cached.video)u.all.classList.add("huw-video-download");
  u.all.textContent=T("↓ Hent alle valgte filer","↓ Save all selected files")+(packed&&batch.extension===".zip"?" (ZIP)":"");
  u.cancel.textContent=busy?T("Afbryd","Cancel export"):T("Luk","Close");
  [u.audio,u.burn,u.resolution,u.fps,u.scope,u.begin,u.end,u.selectAll].forEach(function(input){input.disabled=busy;});
  u.audio.disabled=busy||!selected.video;u.burn.disabled=busy||!selected.video;u.resolution.disabled=busy||!selected.video;
  u.note.textContent=!selected.video?"":T("Videoens lyd følger afspilleren. WAV-valgene ændrer kun, hvilke lydfiler du får.","Video audio follows the player. WAV selections only choose the separate files you receive.");
  if(selected.video&&settings.audio==="silent")u.note.textContent=T("Videoen bliver uden lyd. De valgte WAV-filer hentes separat.","The video will be silent. Selected WAV files are saved separately.");
 }
 function commitArtifact(id,blob,p,extra){
  var filename=fileName(o.scene&&o.scene.name||"AniMus")+"-"+p.settings.start+"-"+p.settings.end+(id==="video"?".mp4":"-"+names[id]);
  var artifact=Object.assign({key:p.keys[id],blob:blob,settings:Object.assign({},p.settings),filename:filename},extra||{});
  cached[id]=artifact;return artifact;
 }
 async function create(){
  if(busy||disposed||!uiState)return;
  var u=uiState,p;try{p=plan();if(!p.ids.length)throw Error(T("Vælg mindst én fil","Select at least one file"));}catch(error){u.status.textContent=String(error.message||error);return;}
  var key=archiveKey(p),missing=p.ids.filter(function(id){return !get(id,p.keys[id]);});
  if(!missing.length&&batch&&batch.key===key){u.status.textContent=T("De valgte filer er allerede klar","The selected files are already ready");refresh();return;}
  busy=true;abort=false;closeRequested=false;u.bar.value=0;u.status.textContent=T("Opretter valgte filer…","Creating selected files…");refresh();
  var oldPosition=o.position(),restoreExport=null,sourceSignature=JSON.stringify(p.source),range=p.range,s=p.settings;
  function cancelled(){return abort||disposed;}
  function ensureSource(){
   if(cancelled())throw Error(T("Eksport afbrudt","Export cancelled"));
   if(JSON.stringify(sourceState())!==sourceSignature)throw Error(T("Forestillingen blev ændret under eksport. Dine færdige filer er bevaret.","The production changed during export. Your completed files have been kept."));
  }
  function update(phase,value){if(uiState===u){u.status.textContent=phase+" "+Math.round(100*clamp(num(value,0),0,1))+" %";u.bar.value=Math.round(100*clamp(num(value,0),0,1));}}
  try{
   o.pause();
   var scene=o.scene,songs=o.getSongs&&o.getSongs()||[],audioOptions={window:doc.defaultView||window,wiki:o.wiki,scene:scene,songs:songs,
    ABC:o.getABC&&o.getABC(),soundFont:o.soundFont&&o.soundFont(),duration:o.duration(),start:s.start,end:s.end,frameCount:range.audioFrames,cancelled:cancelled,progress:update};
   if(missing.indexOf("video")>=0){
    var opts={start:s.start,end:s.end,width:s.width,fps:s.fps,burn:s.captions==="burn"},config=await videoConfig(o,opts);ensureSource();
    if(o.beginExport)restoreExport=o.beginExport();
    var sound=null;
    if(s.audio==="playback")sound=await Soundtrack.render(Object.assign({},audioOptions,{music:true,speech:true,effects:true}));
    ensureSource();
    var segments=[],video=await videoFrames(o,opts,update,cancelled,segments,config);ensureSource();
    var bytes=MP4.mux(video,sound),blob=new Blob([bytes],{type:"video/mp4"});bytes=null;
    commitArtifact("video",blob,p,{video:{width:video.width,height:video.height,fps:video.fps}});
    captionCache={key:p.keys.captions,segments:segments};
    video.samples=[];if(sound)sound.samples=[];
   }else if(p.ids.indexOf("video")>=0)u.status.textContent=T("Genbruger video.mp4","Reusing video.mp4");
   if(missing.indexOf("captions")>=0){
    var captions;
    if(captionCache&&captionCache.key===p.keys.captions)captions=captionCache.segments;
    else{
     if(!restoreExport&&o.beginExport)restoreExport=o.beginExport();
     captions=await captionFrames(o,{start:s.start,end:s.end,fps:s.fps},update,cancelled);ensureSource();
     captionCache={key:p.keys.captions,segments:captions};
    }
    ensureSource();commitArtifact("captions",new Blob([subtitles(captions,s.end-s.start)],{type:"text/vtt;charset=utf-8"}),p);
   }
   var neededStems=missing.filter(function(id){return id==="music"||id==="speech"||id==="effects";});
   if(neededStems.length){
    var stems=await Soundtrack.renderStems(Object.assign({},audioOptions,{music:neededStems.indexOf("music")>=0,speech:neededStems.indexOf("speech")>=0,effects:neededStems.indexOf("effects")>=0}));ensureSource();
    stems.forEach(function(stem){commitArtifact(stem.id,stem.blob,p,{stem:stem});});
   }
   ensureSource();
   var files=p.ids.map(function(id){var artifact=get(id,p.keys[id]);if(!artifact)throw Error("Missing completed file: "+names[id]);return {name:names[id],blob:artifact.blob,id:id,artifact:artifact};});
   var selectedStems=files.filter(function(file){return /\.wav$/.test(file.name);}).map(function(file){return file.artifact.stem;});
   if(p.ids.length>1&&selectedStems.length){
    var videoFile=files.find(function(file){return file.id==="video";}),manifest=packageManifest(scene,{start:s.start,end:s.end,fps:s.fps,width:s.width,burn:s.captions==="burn",audio:s.audio,captionLanguage:p.source.captionLanguage},selectedStems,videoFile&&videoFile.artifact.video,p.ids.indexOf("captions")>=0);
    files.push({name:"manifest.json",blob:new Blob([JSON.stringify(manifest,null,2)+"\n"],{type:"application/json"})});
    files.push({name:"README.txt",blob:new Blob([packageReadme(manifest)],{type:"text/plain;charset=utf-8"})});
   }
   var extension=files.length===1?files[0].name.slice(files[0].name.lastIndexOf(".")):".zip";
   var allBlob=files.length===1?files[0].blob:await Bundle.zip(files,{cancelled:cancelled,progress:update});ensureSource();
   // Replace the visible batch only once every requested file and its archive
   // are complete. Earlier artifacts remain reusable after later-stage errors.
   p.ids.forEach(function(id){shown[id]=get(id,p.keys[id]);});
   batch={key:key,blob:allBlob,extension:extension,filename:files.length===1?files[0].artifact.filename:fileName(scene&&scene.name||"AniMus")+"-"+s.start+"-"+s.end+extension};
   u.bar.value=100;u.status.textContent=T("Filer klar: ","Files ready: ")+p.ids.length+" · "+range.duration.toFixed(3)+" s";
   var clipped=selectedStems.filter(function(stem){return stem.clippedSamples>0;}).map(function(stem){return stem.id+".wav";});
   if(clipped.length)u.status.textContent+=" · "+T("Advarsel: ","Warning: ")+clipped.join(", ")+T(" har overstyring. Sænk kildens lydniveau og opret filerne igen."," contains clipped audio. Lower the source level and create the files again.");
  }catch(error){
   if(uiState===u)u.status.textContent=abort?T("Eksport afbrudt. Færdige filer er bevaret.","Export cancelled. Completed files have been kept."):T("Eksportfejl: ","Export error: ")+String(error&&error.message||error);
  }finally{
   // Return to the edited scene before enabling its preview controls. A
   // selected face/limb may be absent from the final exported scene; restoring
   // its zoom there would discard that selection before we seek back.
   try{if(!disposed){
    try{o.seek(oldPosition);}
    finally{try{if(restoreExport)restoreExport();}finally{o.pause();}}
   }}catch(_){}
   busy=false;
   if(disposed)release();
   else if(closeRequested)hideDialog();
   else if(uiState===u){refresh();try{u.files.focus({preventScroll:true});u.files.scrollIntoView({block:"nearest",behavior:"smooth"});}catch(_){}}
  }
 }
 function open(){
  if(overlay||disposed)return;
  var fullscreen=doc.fullscreenElement||doc.webkitFullscreenElement,parent=fullscreen&&fullscreen.contains(o.host)?fullscreen:doc.body;
  o.pause();var dlg=ui(doc,"div",parent,"huw-video-modal");overlay=dlg;dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");
  var panel=ui(doc,"section",dlg,"huw-video-panel"),head=ui(doc,"header",panel,"huw-video-head");
  ui(doc,"strong",head,"",T("AniMus · Eksportér filer","AniMus · Export files"));
  var closeBtn=ui(doc,"button",head,"huw-video-close","×");closeBtn.type="button";closeBtn.setAttribute("aria-label",T("Luk","Close"));closeBtn.onclick=close;
  var form=ui(doc,"div",panel,"huw-video-options"),scope=ui(doc,"select");
  makeOption(scope,"all",T("Hele forestillingen","Full performance"));makeOption(scope,"part",T("Aktuelt afsnit","Current segment"));makeOption(scope,"custom",T("Valgt udsnit","Selected range"));scope.value=settings.start===0&&Math.abs(settings.end-o.duration())<.001?"all":"custom";
  label(form,T("Udsnit","Range"),scope).classList.add("huw-video-wide");
  var span=ui(doc,"div",form,"huw-video-range"),begin=ui(doc,"input"),end=ui(doc,"input");
  [begin,end].forEach(function(input){input.type="number";input.min="0";input.step=".001";});begin.value=String(settings.start);end.value=String(settings.end);
  label(span,T("Fra (sek.)","From (seconds)"),begin);label(span,T("Til (sek.)","To (seconds)"),end);
  var files=ui(doc,"section",panel,"huw-video-files");files.tabIndex=-1;files.setAttribute("aria-label",T("Filer, du vil hente","Files to save"));
  var fileHead=ui(doc,"div",files,"huw-video-files-heading");ui(doc,"strong",fileHead,"",T("Filer, du vil hente","Files to save"));
  var selectAll=ui(doc,"button",fileHead,"huw-video-select-all",T("Vælg alle","Select all"));selectAll.type="button";
  var rows={};
  ids.forEach(function(id){
   var row=ui(doc,"div",files,"huw-video-file-row"),field=ui(doc,"label",row,"huw-video-file-choice"),check=ui(doc,"input",field,"");check.type="checkbox";check.checked=selected[id];check.setAttribute("data-export-file",id);
   var info=ui(doc,"span",field,"huw-video-file-info");ui(doc,"strong",info,"huw-video-file-name",labels[id]);
   ui(doc,"span",info,"huw-video-file-filename",names[id]);
   var status=ui(doc,"span",info,"huw-video-file-status"),context=ui(doc,"span",info,"huw-video-file-context");
   var arrow=ui(doc,"button",row,"huw-video-file-download","↓");arrow.type="button";arrow.disabled=true;arrow.setAttribute("aria-label",T("Hent ","Save ")+names[id]);arrow.setAttribute("title",T("Hent ","Save ")+names[id]);
   rows[id]={element:row,check:check,arrow:arrow,status:status,context:context};check.onchange=function(){selected[id]=check.checked;refresh();};
  });
  var videoOptions=ui(doc,"details",panel,"huw-video-content");videoOptions.open=true;ui(doc,"summary",videoOptions,"",T("Videoens indhold","Video content"));
  var controls=ui(doc,"div",videoOptions,"huw-video-options"),audio=ui(doc,"select",null,"huw-video-audio");makeOption(audio,"playback",T("Som i afspilleren","As in the player"));makeOption(audio,"silent",T("Uden lyd","Without audio"));audio.value=settings.audio;label(controls,T("Lyd i video","Video audio"),audio);
  var burn=ui(doc,"select",null,"huw-video-captions");makeOption(burn,"burn",T("Med undertekster","With captions"));makeOption(burn,"none",T("Uden undertekster","Without captions"));burn.value=settings.captions;label(controls,T("Undertekster i billedet","Captions in picture"),burn);
  var resolution=ui(doc,"select",null,"huw-video-resolution");makeOption(resolution,"1280","HD 720p");makeOption(resolution,"1920","Full HD 1080p");resolution.value=String(settings.width);label(controls,T("Opløsning","Resolution"),resolution);
  var fps=ui(doc,"select",null,"huw-video-fps");makeOption(fps,"24","24 fps");makeOption(fps,"30","30 fps");fps.value=String(settings.fps);label(controls,T("Billedfrekvens","Frame rate"),fps);
  var note=ui(doc,"p",videoOptions,"huw-video-hint"),output=ui(doc,"div",panel,"huw-video-output"),status=ui(doc,"p",output,"huw-video-status",T("Vælg de filer, du vil hente.","Choose the files you want to save."));status.setAttribute("role","status");
  var bar=ui(doc,"progress",output,"huw-video-progress");bar.max=100;bar.value=0;
  var actions=ui(doc,"footer",panel,"huw-video-actions"),start=ui(doc,"button",actions,"huw-video-primary",T("Opret valgte filer","Create selected files"));start.type="button";start.onclick=create;
  var all=ui(doc,"button",actions,"huw-video-download-all",T("↓ Hent alle valgte filer","↓ Save all selected files"));all.type="button";all.hidden=true;all.setAttribute("aria-label",T("Hent alle valgte filer","Save all selected files"));
  all.onclick=function(){if(batch&&!disposed&&!busy)saveFile(batch.blob,batch.filename);};
  var share=ui(doc,"button",actions,"huw-video-share",T("Del valgte filer","Share selected files"));share.type="button";share.hidden=true;share.onclick=function(){if(batch&&!disposed&&!busy)shareFile(batch.blob,batch.filename).catch(function(error){if(uiState)uiState.status.textContent=String(error.message||error);});};
  var cancelButton=ui(doc,"button",actions,"huw-video-cancel",T("Luk","Close"));cancelButton.type="button";cancelButton.onclick=cancel;
  uiState={panel:panel,files:files,rows:rows,status:status,bar:bar,start:start,all:all,share:share,cancel:cancelButton,note:note,audio:audio,burn:burn,resolution:resolution,fps:fps,scope:scope,begin:begin,end:end,selectAll:selectAll};
  function readSettings(){settings.start=begin.value.trim()===""?NaN:normalize(begin.value);settings.end=end.value.trim()===""?NaN:normalize(end.value);settings.width=Number(resolution.value);settings.fps=Number(fps.value);settings.audio=audio.value;settings.captions=burn.value;refresh();}
  [resolution,fps,audio,burn].forEach(function(input){input.onchange=readSettings;input.oninput=readSettings;});
  [begin,end].forEach(function(input){input.onchange=input.oninput=function(){scope.value="custom";readSettings();};});
  scope.onchange=function(){var r=scope.value==="part"?currentRange(o.scene,o.position(),o.duration()):scope.value==="all"?[0,o.duration()]:[settings.start,settings.end];begin.value=String(normalize(r[0]));end.value=String(normalize(r[1]));readSettings();};
  selectAll.onclick=function(){ids.forEach(function(id){selected[id]=true;});refresh();};
  dlg.addEventListener("click",function(event){if(event.target===dlg)close();});dlg.addEventListener("keydown",function(event){if(event.key==="Escape"){event.preventDefault();close();}});
  refresh();panel.tabIndex=-1;panel.focus({preventScroll:true});
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
