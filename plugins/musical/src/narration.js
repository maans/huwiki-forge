/*\
title: $:/plugins/huwiki/musical/narration.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// Recorded voices and imported sound use the theatre's clock. The recorder is
// independent of ABC; a microphone or media failure must never stop the show.
function num(v,f){var n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function copy(v){return JSON.parse(JSON.stringify(v));}
function round(v){return Math.round(v*1000)/1000;}
function uid(){return "voice-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);}
var Playback=require("$:/plugins/huwiki/musical/narration-player.js");
var Player=Playback.Player,normalizeClips=Playback.normalizeClips,audioSource=Playback.audioSource,total=Playback.total;

function chooseMime(Recorder){
 if(!Recorder||typeof Recorder.isTypeSupported!=="function")return "";
 var choices=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus","audio/webm"];
 for(var i=0;i<choices.length;i++)try{if(Recorder.isTypeSupported(choices[i]))return choices[i];}catch(_){}
 return "";
}
function stopTracks(stream){if(stream&&stream.getTracks)stream.getTracks().forEach(function(t){try{t.stop();}catch(_){};});}
function Capture(o){this.o=o||{};this.state="idle";this.generation=0;this.stream=null;this.recorder=null;this.started=0;this.ended=0;this.chunks=[];this.cancelled=false;this.error=null;}
Capture.prototype._state=function(state){this.state=state;if(this.o.onState)this.o.onState(state);};
Capture.prototype.start=function(){
 if(this.state!=="idle")return Promise.resolve(false);
 var self=this,o=this.o,nav=o.navigator||(typeof navigator!=="undefined"?navigator:null),R=o.MediaRecorder||(typeof MediaRecorder!=="undefined"?MediaRecorder:null);
 if(!nav||!nav.mediaDevices||!nav.mediaDevices.getUserMedia||!R){var err=Error("Recording needs a supported browser and a secure page (HTTPS or localhost).");err.name="NotSupportedError";if(o.onError)o.onError(err);return Promise.resolve(false);}
 var generation=++this.generation;this.cancelled=false;this.error=null;this.ended=0;this.chunks=[];this._state("requesting");
 return Promise.resolve().then(function(){return nav.mediaDevices.getUserMedia({audio:true,video:false});}).then(function(stream){
  if(generation!==self.generation){stopTracks(stream);return false;}
  self.stream=stream;var mime=chooseMime(R),recorder=new R(stream,mime?{mimeType:mime}:undefined);self.recorder=recorder;
  recorder.ondataavailable=function(event){if(generation===self.generation&&event.data&&event.data.size>0)self.chunks.push(event.data);};
  recorder.onerror=function(event){if(generation!==self.generation)return;self.error=event.error||Error("Recording failed");if(o.onError)o.onError(self.error);stopTracks(self.stream);self.stream=null;try{if(recorder.state!=="inactive")recorder.stop();}catch(_){}self._state("idle");};
  recorder.onstop=function(){
   stopTracks(stream);if(generation!==self.generation)return;self.stream=null;self.recorder=null;
   var duration=Math.max(.02,((self.ended||(o.now?o.now():Date.now()))-self.started)/1000),B=o.Blob||(typeof Blob!=="undefined"?Blob:null),chunks=self.chunks;self.chunks=[];self._state("idle");
   if(self.error||self.cancelled)return;
   if(!chunks.length||!B){if(o.onError)o.onError(Error("The microphone did not return any audio."));return;}
   var actual=recorder.mimeType||(chunks[0]&&chunks[0].type)||mime||"audio/webm",blob=new B(chunks,{type:actual});
   if(o.onComplete)o.onComplete({blob:blob,duration:duration,mimeType:actual});
  };
  recorder.start(250);self.started=o.now?o.now():Date.now();self._state("recording");return true;
 }).catch(function(err){
  if(generation!==self.generation)return false;stopTracks(self.stream);self.stream=null;self.recorder=null;self._state("idle");if(o.onError)o.onError(err);return false;
 });
};
Capture.prototype.stop=function(){if(this.state!=="recording"||!this.recorder)return false;this.ended=this.o.now?this.o.now():Date.now();this._state("stopping");try{this.recorder.stop();return true;}catch(err){stopTracks(this.stream);this.stream=null;this.recorder=null;this._state("idle");if(this.o.onError)this.o.onError(err);return false;}};
Capture.prototype.cancel=function(){this.cancelled=true;this.generation++;var r=this.recorder;this.recorder=null;try{if(r&&r.state!=="inactive")r.stop();}catch(_){}stopTracks(this.stream);this.stream=null;this.chunks=[];this._state("idle");};
Capture.prototype.dispose=Capture.prototype.cancel;

function collectCues(wiki,film){
 var results=[];
 function walk(scene,title,start,scale,depth,path,seen,windowStart,windowEnd){
  if(!scene||depth>12||seen[title])return;seen=Object.assign({},seen);seen[title]=true;
  var clips=scene.scenes||[],elapsed=0;
  if(clips.length){clips.forEach(function(c){var source=c.source||c.animation||c.theatre,t=wiki.getTiddler(source),child=null;
   try{child=t&&JSON.parse(t.fields.text||"");}catch(_){}
   var speed=Math.max(.01,num(c.speed,1)),childScale=scale/speed,clipStart=start+elapsed*scale,clipEnd=clipStart+Math.max(.1,num(c.duration,4))*scale;
   if(child)walk(child,source,clipStart-num(c.offset,0)*childScale,childScale,depth+1,(path?path+" · ":"")+(c.name||child.name||source),seen,Math.max(windowStart,clipStart),Math.min(windowEnd,clipEnd));
   elapsed+=Math.max(.1,num(c.duration,4));
  });return;}
  (scene.parts||[]).filter(function(p){return p.type==="text"&&/^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(p.id);}).forEach(function(p){
   var keys=(p.keys||[]).slice().sort(function(a,b){return num(a.t,0)-num(b.t,0);}),first=keys.find(function(k){return num(k.opacity,1)>=.45;}),text=String(p.text||""),role=/^([^:\n]{1,40}):/.exec(text);
   var at=start+num(first&&first.t,0)*scale;if(at<windowStart-.001||at>=windowEnd)return;
   results.push({cueId:p.id,sceneTitle:title,text:text,role:role?role[1]:"",start:round(at),name:p.name||p.id,sceneName:path||scene.name||title});
  });
 }
 walk(film,film._title||film.name||"film",0,1,0,"",{},0,Infinity);return results.sort(function(a,b){return a.start-b.start;});
}
function dataUrl(blob,win){return new Promise(function(resolve,reject){var Reader=win.FileReader,reader=new Reader();reader.onload=function(){resolve(String(reader.result||""));};reader.onerror=function(){reject(reader.error||Error("Cannot read audio"));};reader.readAsDataURL(blob);});}
function mediaDuration(doc,source,fallback){return new Promise(function(resolve,reject){
 var a=doc.createElement("audio"),win=doc.defaultView||window,done=false,timer=win.setTimeout(function(){finish(num(fallback,0));},7000);
 function cleanup(){win.clearTimeout(timer);a.onloadedmetadata=a.ondurationchange=a.ontimeupdate=a.onerror=null;try{a.pause();a.removeAttribute("src");a.load();}catch(_){};}
 function finish(value){if(done)return;done=true;cleanup();if(value>0&&Number.isFinite(value))resolve(value);else reject(Error("Could not read the audio duration."));}
 function check(){if(Number.isFinite(a.duration)&&a.duration>0)finish(a.duration);}
 a.preload="metadata";a.onloadedmetadata=function(){check();if(!done){if(fallback>0)finish(fallback);else try{a.currentTime=1e10;}catch(_){}}};
 a.ondurationchange=check;a.ontimeupdate=check;a.onerror=function(){finish(num(fallback,0));};a.src=source;
});}
function el(doc,tag,cls,text,parent){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
function display(t){return Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0")+"."+Math.floor((t%1)*10);}
function mount(o){
 var doc=o.doc,wiki=o.wiki,host=o.host,win=doc.defaultView||(typeof window!=="undefined"?window:null),da=!/\/en(?:-|$)/i.test(wiki.getTiddlerText("$:/language",""));
 var L=da?{
  title:"Lydspor og indtaling",subtitle:"Indtal replikker eller importér lyd, og placér klippene i forestillingen.",cancel:"Annuller",save:"Gem og tilbage",record:"● Indtal ny replik",stop:"■ Stop optagelse",retake:"Indtal valgt klip igen",import:"Importér lyd",clips:"Lydklip",empty:"Ingen lydklip endnu. Vælg en replik og tryk Indtal, eller importér en lydfil.",script:"Replik fra manuskript",none:"Fri indtaling",name:"Navn",role:"Rolle / stemme",text:"Tekst til indtaling",start:"Placering i forestillingen (s)",offset:"Klip begyndelsen fra (s)",end:"Slut i lydfil (s)",volume:"Lydstyrke",mute:"Lydløs",remove:"Fjern klip",duplicate:"Duplikér klip",preview:"Lyt til klippet",usePosition:"Brug tidsmarkør",recording:"Optager",requesting:"Venter på adgang til mikrofonen …",stopping:"Gør optagelsen klar …",reading:"Indlæser lyd …",unsaved:"Ændringer er ikke gemt",warning:"Luk uden at gemme lydklippene?",recordWarning:"Optagelsen er ikke gemt. Stop og luk værkstedet?",ready:"Vælg et klip for at redigere det.",clipLength:"Længde",sourceLength:"Lydfil",unsupported:"Indtaling kræver mikrofonadgang på HTTPS eller localhost i en browser, der understøtter lydoptagelse. Du kan også importere en lydfil.",denied:"Mikrofonadgang blev afvist. Tillad mikrofonen i browseren, eller importér en lydfil.",noMic:"Der blev ikke fundet en mikrofon.",micBusy:"Mikrofonen kan ikke åbnes. Kontrollér, om den bruges af et andet program.",saved:"Lydsporene er gemt.",audioType:"Vælg en lydfil, fx WAV, MP3, M4A, OGG eller WebM.",fileLarge:"Lydfilen er større end 100 MB. Del den i kortere klip før import.",missing:"Lydfilen til dette klip mangler.",recordNew:"Ny indtaling",at:"ved",keep:"Indtalingen gemmes som en lydfil i wikien. Gem også selve wikien efter arbejdet.",permission:"Mikrofonen aktiveres først, når du trykker Indtal.",keyboard:"Escape lukker værkstedet."
 }:{
  title:"Audio tracks and recording",subtitle:"Record dialogue or import audio, then place clips in the show.",cancel:"Cancel",save:"Save and return",record:"● Record new line",stop:"■ Stop recording",retake:"Record selected clip again",import:"Import audio",clips:"Audio clips",empty:"No audio clips yet. Choose a line and press Record, or import an audio file.",script:"Line from script",none:"Free recording",name:"Name",role:"Role / voice",text:"Text to record",start:"Position in show (s)",offset:"Trim from beginning (s)",end:"End in audio file (s)",volume:"Volume",mute:"Muted",remove:"Remove clip",duplicate:"Duplicate clip",preview:"Listen to clip",usePosition:"Use playhead",recording:"Recording",requesting:"Waiting for microphone permission …",stopping:"Preparing recording …",reading:"Loading audio …",unsaved:"Unsaved changes",warning:"Close without saving audio clips?",recordWarning:"This recording has not been saved. Stop and close the workshop?",ready:"Select a clip to edit it.",clipLength:"Length",sourceLength:"Audio file",unsupported:"Recording requires microphone permission on HTTPS or localhost in a browser that supports audio recording. You can also import an audio file.",denied:"Microphone permission was denied. Allow the microphone in your browser, or import an audio file.",noMic:"No microphone was found.",micBusy:"The microphone cannot be opened. Check whether another application is using it.",saved:"Audio tracks saved.",audioType:"Choose an audio file, such as WAV, MP3, M4A, OGG or WebM.",fileLarge:"The audio file exceeds 100 MB. Split it into shorter clips before importing.",missing:"The audio file for this clip is missing.",recordNew:"New recording",at:"at",keep:"Recordings are stored as audio files inside this wiki. Save the wiki itself after editing.",permission:"The microphone is activated only when you press Record.",keyboard:"Escape closes the workshop."
 };
 var popup=null,list=null,inspector=null,status=null,recordButton=null,stopButton=null,retakeButton=null,saveButton=null,importInput=null,cueSelect=null,scriptText=null,roleInput=null;
 var drafts=[],pending={},selected="",dirty=false,busy=false,session=0,cues=[],context={},capture=null,timer=0,recordTarget="",recordContext=null,previewAudio=null;
 function say(text,error){if(status){status.textContent=text;status.classList.toggle("is-error",!!error);}}
 function chosen(){return drafts.find(function(c){return c.id===selected;})||null;}
 function source(clip){return pending[clip.asset]?"data:"+pending[clip.asset].type+";base64,"+pending[clip.asset].text:audioSource(wiki,clip.asset);}
 function changed(){dirty=true;say(L.unsaved);}
 function button(parent,caption,action,cls){var b=el(doc,"button",cls||"",caption,parent);b.type="button";b.addEventListener("click",action);return b;}
 function field(parent,label,type,value,onChange){var wrap=el(doc,"label","huw-narration-field",undefined,parent);el(doc,"span","",label,wrap);var input=el(doc,"input","",undefined,wrap);input.type=type;if(type==="checkbox")input.checked=!!value;else input.value=String(value===undefined?"":value);
  input.addEventListener(type==="text"?"input":"change",function(){onChange(type==="checkbox"?input.checked:input.value);});return input;}
 function currentCue(){return Object.assign({},context,{text:scriptText?scriptText.value:context.text||"",role:roleInput?roleInput.value:context.role||""});}
 function setContext(details){context=Object.assign({start:o.position?o.position():0,text:"",role:"",name:""},details||{});if(scriptText)scriptText.value=context.text||"";if(roleInput)roleInput.value=context.role||"";if(cueSelect){var index=cues.findIndex(function(c){return c.cueId===context.cueId&&c.sceneTitle===context.sceneTitle;});cueSelect.value=index<0?"":String(index);}}
 function recordingState(){return capture&&capture.state||"idle";}
 function updateControls(){if(!popup)return;var state=recordingState(),working=state!=="idle"||busy;
  recordButton.disabled=working;stopButton.disabled=state!=="recording";retakeButton.disabled=working||!chosen();saveButton.disabled=working;importInput.disabled=working;cueSelect.disabled=working;scriptText.disabled=working;roleInput.disabled=working;
  popup.classList.toggle("is-recording",state==="recording");
  if(inspector)Array.prototype.forEach.call(inspector.querySelectorAll("input,textarea,button"),function(input){input.disabled=working;});
  if(state==="requesting")say(L.requesting);else if(state==="stopping")say(L.stopping);
 }
 function stopPreview(){if(previewAudio){try{previewAudio.pause();previewAudio.removeAttribute("src");previewAudio.load();}catch(_){}previewAudio=null;}}
 function refreshList(){if(!list)return;list.textContent="";
  if(!drafts.length)el(doc,"p","huw-narration-empty",L.empty,list);
  drafts.slice().sort(function(a,b){return a.start-b.start;}).forEach(function(c){var b=button(list,"",function(){if(recordingState()!=="idle"||busy)return;selected=c.id;setContext(c);refreshList();refreshInspector();},"huw-narration-clip");b.classList.toggle("is-active",c.id===selected);b.setAttribute("aria-pressed",String(c.id===selected));
   el(doc,"span","huw-narration-clip-time",display(c.start),b);var label=el(doc,"span","huw-narration-clip-title",undefined,b);el(doc,"strong","",c.name||c.role||L.recordNew,label);el(doc,"small","",(c.role?c.role+" · ":"")+round(c.duration)+" s"+(c.muted?" · "+L.mute:""),label);
  });updateControls();
 }
 function setNumber(c,key,value){var v=Number(value);if(!Number.isFinite(v))return;c[key]=v;var clean=normalizeClips([c])[0];Object.assign(c,clean);changed();refreshList();}
 function refreshInspector(){if(!inspector)return;stopPreview();inspector.textContent="";var c=chosen();if(!c){el(doc,"p","huw-narration-empty",L.ready,inspector);return;}
  field(inspector,L.name,"text",c.name||"",function(v){c.name=v;changed();refreshList();});
  field(inspector,L.role,"text",c.role||"",function(v){c.role=v;if(roleInput)roleInput.value=v;changed();refreshList();});
  var tw=el(doc,"label","huw-narration-field",undefined,inspector);el(doc,"span","",L.text,tw);var ta=el(doc,"textarea","",undefined,tw);ta.rows=3;ta.value=c.text||"";ta.addEventListener("input",function(){c.text=ta.value;if(scriptText)scriptText.value=ta.value;changed();});
  var timing=el(doc,"div","huw-narration-timing",undefined,inspector);
  var start=field(timing,L.start,"number",round(c.start),function(v){setNumber(c,"start",v);start.value=c.start;});start.min=0;start.step=.1;
  button(timing,L.usePosition,function(){setNumber(c,"start",o.position?o.position():0);start.value=c.start;});
  var offset=field(timing,L.offset,"number",round(c.offset),function(v){var end=c.offset+c.duration,next=clamp(num(v,c.offset),0,Math.max(0,end-.02));c.offset=next;c.duration=end-next;changed();refreshList();refreshInspector();});offset.min=0;offset.step=.1;
  var end=field(timing,L.end,"number",round(c.offset+c.duration),function(v){c.duration=clamp(num(v,c.offset+c.duration)-c.offset,.02,Math.max(.02,(c.sourceDuration||86400)-c.offset));changed();refreshList();refreshInspector();});end.min=round(c.offset+.02);end.step=.1;if(c.sourceDuration>0)end.max=c.sourceDuration;
  var gain=field(timing,L.volume+" (%)","range",Math.round(c.volume*100),function(v){c.volume=clamp(num(v,100)/100,0,1);if(previewAudio)previewAudio.volume=c.volume;changed();});gain.min=0;gain.max=100;gain.step=1;
  field(timing,L.mute,"checkbox",c.muted,function(v){c.muted=v;changed();refreshList();});
  el(doc,"p","huw-narration-duration",L.clipLength+": "+round(c.duration)+" s · "+L.sourceLength+": "+round(c.sourceDuration||c.offset+c.duration)+" s",inspector);
  var src=source(c);if(src){var preview=el(doc,"audio","huw-narration-preview",undefined,inspector);preview.controls=true;preview.preload="metadata";preview.setAttribute("aria-label",L.preview);preview.src=src;preview.volume=c.volume;previewAudio=preview;
   preview.addEventListener("play",function(){if(preview.currentTime<c.offset||preview.currentTime>=c.offset+c.duration-.02)try{preview.currentTime=c.offset;}catch(_){};});
   preview.addEventListener("timeupdate",function(){if(preview.currentTime>=c.offset+c.duration){preview.pause();try{preview.currentTime=c.offset;}catch(_){};}});
  }else el(doc,"p","huw-narration-error",L.missing,inspector);
  var actions=el(doc,"div","huw-narration-clip-actions",undefined,inspector);
  button(actions,L.duplicate,function(){var d=copy(c);d.id=uid();d.name=(c.name||L.recordNew)+(da?" · kopi":" · copy");d.start=round(c.start+c.duration);drafts.push(d);selected=d.id;changed();refreshList();refreshInspector();});
  button(actions,L.remove,function(){drafts=drafts.filter(function(p){return p.id!==c.id;});selected=drafts[0]&&drafts[0].id||"";changed();refreshList();refreshInspector();},"huw-narration-danger");
 }
 function errorText(err){var name=err&&err.name||"";return name==="NotAllowedError"||name==="SecurityError"?L.denied:name==="NotFoundError"?L.noMic:name==="NotReadableError"?L.micBusy:name==="NotSupportedError"?L.unsupported:String(err&&err.message||err||"");}
 function clearTimer(){if(timer){win.clearInterval(timer);timer=0;}}
 function createCapture(){return new Capture({navigator:win.navigator,MediaRecorder:win.MediaRecorder,Blob:win.Blob,
  now:function(){return win.performance&&win.performance.now?win.performance.now():Date.now();},
  onState:function(state){clearTimer();updateControls();if(state==="recording"){var start=Date.now();say(L.recording+" 0:00");timer=win.setInterval(function(){say(L.recording+" "+display((Date.now()-start)/1000));},200);}},
  onError:function(err){clearTimer();say(errorText(err),true);updateControls();},
  onComplete:function(result){clearTimer();acceptBlob(result.blob,result.duration,recordContext||currentCue(),recordTarget);}
 });}
 function startRecording(replace){if(recordingState()!=="idle"||busy)return;stopPreview();if(o.pause)o.pause();recordTarget=replace&&chosen()?chosen().id:"";recordContext=replace&&chosen()?copy(chosen()):currentCue();if(!capture)capture=createCapture();capture.start();}
 function acceptBlob(blob,fallback,details,targetId){
  var generation=session;busy=true;updateControls();say(L.reading);
  return dataUrl(blob,win).then(function(raw){if(!popup||generation!==session)return null;return mediaDuration(doc,raw,fallback).then(function(duration){return {raw:raw,duration:duration};});}).then(function(result){
   if(!result||!popup||generation!==session)return false;
   var split=result.raw.indexOf(","),mime=(/^data:([^;,]+)/.exec(result.raw)||[])[1]||"";
   if(split<0||!/^audio\//i.test(mime))throw Error(L.audioType);
   var title="AniMus/Audio/"+uid();if(wiki.generateNewTitle)title=wiki.generateNewTitle(title);
   pending[title]={title:title,type:mime,text:result.raw.slice(split+1),tags:["AniMus Audio"],caption:details.name||details.role||L.recordNew,"animus-duration":String(round(result.duration))};
   var existing=targetId&&drafts.find(function(c){return c.id===targetId;}),clip=existing||{id:uid()};
   Object.assign(clip,{asset:title,name:details.name||details.role||L.recordNew,text:details.text||"",role:details.role||"",cueId:details.cueId||"",sceneTitle:details.sceneTitle||"",start:num(details.start,o.position?o.position():0),offset:0,duration:result.duration,sourceDuration:result.duration,volume:existing?existing.volume:1,muted:existing?existing.muted:false});
   if(!existing)drafts.push(clip);selected=clip.id;dirty=true;refreshList();refreshInspector();say(L.unsaved);return true;
  }).catch(function(err){if(popup&&generation===session)say(errorText(err),true);return false;}).then(function(result){if(generation===session){busy=false;updateControls();}return result;});
 }
 function importFile(file){if(!file)return;if(file.size>100*1024*1024){say(L.fileLarge,true);return;}
  var type=file.type||({wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",aac:"audio/aac",ogg:"audio/ogg",webm:"audio/webm",flac:"audio/flac"}[String(file.name||"").split(".").pop().toLowerCase()]||"");
  if(!/^audio\//i.test(type)){say(L.audioType,true);return;}
  var blob=file.type?file:new win.Blob([file],{type:type}),details=currentCue();details.name=details.name||String(file.name||L.recordNew).replace(/\.[^.]+$/,"");acceptBlob(blob,0,details,"");
 }
 function confirmClose(){var active=recordingState()!=="idle"||busy;if(!(active||dirty))return true;return !!(win&&win.confirm&&win.confirm(active?L.recordWarning:L.warning));}
 function close(force){if(!popup)return true;if(!force&&!confirmClose())return false;session++;if(capture){capture.dispose();capture=null;}clearTimer();stopPreview();popup.remove();popup=null;host.classList.remove("huw-musical--narration-open");drafts=[];pending={};dirty=false;busy=false;return true;}
 function save(){
  if(!popup||busy||recordingState()!=="idle")return false;
  var prior=wiki.getTiddler(o.sceneTitle);if(!prior){say(da?"Forestillingen findes ikke længere.":"The show no longer exists.",true);return false;}
  var data;try{data=JSON.parse(prior.fields.text||"{}");}catch(err){say(errorText(err),true);return false;}
  var normalized=normalizeClips(drafts),missing=normalized.filter(function(c){return !pending[c.asset]&&!audioSource(wiki,c.asset);});if(missing.length){say(L.missing+" "+missing.map(function(c){return c.name||c.asset;}).join(", "),true);return false;}
  data.musical=data.musical||{};data.musical.audioClips=copy(normalized);
  // Removing or replacing a clip never deletes an existing source recording.
  var used={};normalized.forEach(function(c){used[c.asset]=true;});Object.keys(pending).forEach(function(title){if(used[title])wiki.addTiddler(new $tw.Tiddler(pending[title]));});
  o.film.musical=o.film.musical||{};o.film.musical.audioClips=copy(normalized);var body=JSON.stringify(data);if(o.markOwnWrite)o.markOwnWrite(o.sceneTitle,body);wiki.addTiddler(new $tw.Tiddler(prior,{text:body}));
  dirty=false;close(true);if(o.onAudioChange)o.onAudioChange(normalized);else if(o.reload)o.reload();else if(o.repaint)o.repaint();return true;
 }
 function open(details){
  if(popup){if(details){var found=drafts.find(function(c){return c.id===(details.clipId||details.id);});if(found){selected=found.id;setContext(found);refreshList();refreshInspector();}else setContext(details);}return true;}if(o.pause)o.pause();session++;drafts=normalizeClips(copy(o.film.musical&&o.film.musical.audioClips||[]));pending={};dirty=false;busy=false;selected="";cues=collectCues(wiki,o.film);
  popup=el(doc,"section","huw-narration-workshop",undefined,host);popup.setAttribute("role","dialog");popup.setAttribute("aria-modal","true");popup.setAttribute("aria-label",L.title);popup.tabIndex=-1;host.classList.add("huw-musical--narration-open");
  var header=el(doc,"header","huw-narration-header",undefined,popup),heading=el(doc,"div","",undefined,header);el(doc,"h2","",L.title,heading);el(doc,"p","",L.subtitle,heading);var actions=el(doc,"div","huw-narration-actions",undefined,header);
  button(actions,L.cancel,function(){close(false);});saveButton=button(actions,L.save,save,"huw-narration-primary");
  var body=el(doc,"div","huw-narration-body",undefined,popup),left=el(doc,"section","huw-narration-record-pane",undefined,body);el(doc,"h3","",L.script,left);
  var cueLabel=el(doc,"label","huw-narration-field",undefined,left);el(doc,"span","",L.script,cueLabel);cueSelect=el(doc,"select","",undefined,cueLabel);el(doc,"option","",L.none,cueSelect).value="";cues.forEach(function(c,i){var op=el(doc,"option","",display(c.start)+" · "+(c.sceneName?c.sceneName+" · ":"")+c.text.slice(0,120),cueSelect);op.value=String(i);});cueSelect.addEventListener("change",function(){setContext(cueSelect.value===""?{start:o.position?o.position():0}:cues[Number(cueSelect.value)]);});
  roleInput=field(left,L.role,"text","",function(v){context.role=v;});
  var textLabel=el(doc,"label","huw-narration-field",undefined,left);el(doc,"span","",L.text,textLabel);scriptText=el(doc,"textarea","huw-narration-reading-text",undefined,textLabel);scriptText.rows=7;
  var toolbar=el(doc,"div","huw-narration-record-controls",undefined,left);recordButton=button(toolbar,L.record,function(){startRecording(false);},"huw-narration-record");stopButton=button(toolbar,L.stop,function(){if(capture)capture.stop();});retakeButton=button(toolbar,L.retake,function(){startRecording(true);});
  var upload=el(doc,"label","huw-narration-import",undefined,left);el(doc,"span","",L.import,upload);importInput=el(doc,"input","",undefined,upload);importInput.type="file";importInput.accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac";importInput.addEventListener("change",function(){importFile(importInput.files&&importInput.files[0]);importInput.value="";});el(doc,"p","huw-narration-hint",L.permission,left);
  var middle=el(doc,"section","huw-narration-list-pane",undefined,body);el(doc,"h3","",L.clips,middle);list=el(doc,"div","huw-narration-list",undefined,middle);
  inspector=el(doc,"section","huw-narration-inspector",undefined,body);inspector.setAttribute("aria-label",L.clips);
  var footer=el(doc,"footer","huw-narration-footer",undefined,popup);status=el(doc,"output","huw-narration-status","",footer);status.setAttribute("aria-live","polite");el(doc,"small","",L.keep,footer);
  var found=details&&drafts.find(function(c){return c.id===(details.clipId||details.id);});if(found){selected=found.id;setContext(found);}else setContext(details||{});
  refreshList();refreshInspector();updateControls();popup.addEventListener("keydown",function(e){e.stopPropagation();if(e.key==="Escape"){e.preventDefault();close(false);}});popup.focus({preventScroll:true});return true;
 }
 return {open:open,close:function(){return close(false);},dispose:function(){close(true);},isOpen:function(){return !!popup;},save:save};
}
exports.Player=Player;exports.Capture=Capture;exports.mount=mount;exports.normalizeClips=normalizeClips;exports.audioSource=audioSource;exports.total=total;exports.chooseMime=chooseMime;exports.collectCues=collectCues;
})();
