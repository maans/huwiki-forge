/*\
title: $:/plugins/maans/plato/player.js
type: application/javascript
module-type: widget
\*/
(function () {
"use strict";
var Widget = require("$:/core/modules/widgets/widget.js").widget;
var Engine = require("$:/plugins/huwiki/cutout/engine.js");
var LipSync = require("$:/plugins/huwiki/musical/lipsync.js");
var Model = require("$:/plugins/huwiki/cutout/model.js");
var Motion = require("$:/plugins/huwiki/musical/motion.js");
var Playlist = require("$:/plugins/huwiki/musical/playlist.js");
var Language=require("$:/plugins/huwiki/musical/language.js");
var SoundFx;try{SoundFx=require("$:/plugins/huwiki/musical/sfx.js");}catch(_){}
var DEFAULT_FILM = "Turn Around · Complete performance (film)";
var SPEAKERS = {narrator:"Narrator",prisoner:"The Prisoner",guide:"The Guide",elder:"The Elder",chorus:"Chorus"};
var SOUND_NAMES = {speech:"speech",song:"singing",music:"music",sfx:"ambient sound"};

function number(value, fallback) { value=Number(value); return Number.isFinite(value)?value:fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function clockLabel(value) {
  var seconds=Math.max(0,Math.floor(number(value,0)));
  return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
}
function node(doc, tag, className, text, parent) {
  var element=doc.createElement(tag);
  if(className) element.className=className;
  if(text!==undefined&&text!==null) element.textContent=text;
  if(parent) parent.appendChild(element);
  return element;
}
function button(doc, parent, className, text, label) {
  var element=node(doc,"button",className,text,parent);
  element.type="button";
  if(label) element.setAttribute("aria-label",label);
  return element;
}
// The native AniMus film is the single source of truth. This read-only view
// model is rebuilt from current wiki tiddlers; it is never saved as a parallel
// timeline. Scene order/spans, source clocks, captions and audio edits therefore
// reach the audience view through exactly the same canonical project objects.
function nativeTimeline(wiki,title) {
  var film=Engine.readScene(wiki,title),elapsed=0,dependencies=Object.create(null),visited=Object.create(null);
  if(!film)throw Error("The AniMus film could not be read.");
  function resolve(id,fallback){return Model.resolve(wiki,id,fallback)||fallback||"";}
  function dependency(name){if(name)dependencies[name]=true;return name;}
  function inspect(name,depth){
    if(!name||visited[name]||depth>16)return;visited[name]=true;dependency(name);
    var project=Engine.readScene(wiki,name);if(!project)return;
    (project.parts||[]).forEach(function(p){
      [p].concat(p.variants||[]).forEach(function(v){
        dependency(resolve(v.assetId,v.asset));
        dependency(resolve(v.sourceId,v.source));
      });
      if(p.type==="animation")inspect(resolve(p.animationId,p.animation),depth+1);
    });
    (project.scenes||[]).forEach(function(c){inspect(resolve(c.sourceId,c.source||c.animation||c.theatre),depth+1);});
  }
  inspect(title,0);
  var scenes=(film.scenes||[]).map(function(clip,index){
    var source=resolve(clip.sourceId,clip.source||clip.animation||clip.theatre),project=Engine.readScene(wiki,source),span=Math.max(.1,number(clip.duration,4));
    var item={id:String(clip.id||"scene-"+(index+1)),title:String(clip.name||project&&project.name||"Scene "+(index+1)),
      source:source,sourceDuration:project?project.duration:span,start:elapsed,duration:span,settings:Object.assign({},clip),tracks:[]};
    elapsed+=span;return item;
  });
  if(!scenes.length)scenes=[{id:"film",title:String(film.name||"Film"),source:"",sourceDuration:film.duration,start:0,duration:Math.max(.1,film.duration),settings:{},tracks:[]}];
  var musical=film.musical||{},usedIds=Object.create(null);
  var audio=(Array.isArray(musical.audioClips)?musical.audioClips:[]).filter(function(row){return row&&typeof row.asset==="string"&&row.asset.trim();}).map(function(row,index){
    var a=Object.assign({},row),id=String(a.id||"audio-"+index);while(usedIds[id])id+="-copy";usedIds[id]=true;a.id=id;
    a.start=clamp(number(a.start,0),0,86400);a.offset=clamp(number(a.offset,0),0,86400);a.sourceDuration=Math.max(0,number(a.sourceDuration,0));
    if(a.sourceDuration>0)a.offset=Math.min(a.offset,Math.max(0,a.sourceDuration-.02));
    a.duration=clamp(number(a.duration,a.sourceDuration-a.offset||1),.02,86400);
    if(a.sourceDuration>0)a.duration=Math.min(a.duration,a.sourceDuration-a.offset);
    a.volume=clamp(number(a.volume,1),0,1);a.muted=a.muted===true;
    var asset=wiki.getTiddler(a.asset),fields=asset&&asset.fields||{},kind=fields["plato-audio-kind"]||a.kind;
    // New takes created by AniMus have native cue links but no demo metadata.
    if(!kind)kind=/^spoken-\d+$/.test(a.cueId||"")?"speech":/^(?:song-line-\d+|sing-label)$/.test(a.cueId||"")?"song":"music";
    a.kind=/^(speech|song|music|sfx)$/.test(kind)?kind:"music";dependency(a.asset);return a;
  });
  var duration=Math.max(.1,elapsed,number(film.duration,0));
  audio.forEach(function(a){duration=Math.max(duration,a.start+a.duration);});
  (musical.songs||[]).forEach(function(song){dependency(song.score);duration=Math.max(duration,number(song.start,0)+number(song.duration,0));});
  // Partition global native audio clips only for bounded decoding/scheduling.
  // Segments retain exact source offsets, including clips crossing a scene cut.
  scenes.forEach(function(scene,index){var end=index+1<scenes.length?scenes[index+1].start:duration;
    audio.forEach(function(a){var from=Math.max(scene.start,a.start),until=Math.min(end,a.start+a.duration);if(until<=from)return;
      scene.tracks.push(Object.assign({},a,{start:from-scene.start,offset:a.offset+from-a.start,duration:until-from}));
    });
  });
  return {title:String(film.name||"Turn Around"),film:film,scenes:scenes,duration:duration,audioClips:audio,dependencies:dependencies,captionStyle:musical.captionStyle||{}};
}

function PlatoPlayer(parseTreeNode,options) { this.initialise(parseTreeNode,options); }
PlatoPlayer.prototype=new Widget();
PlatoPlayer.prototype.execute=function() { this.filmTitle=this.getAttribute("film",DEFAULT_FILM); };
PlatoPlayer.prototype.render=function(parent,nextSibling) {
  if(this._shutdown) this._shutdown();
  this.parentDomNode=parent;
  this.computeAttributes(); this.execute();
  var self=this,doc=this.document,displayName=Language.projectLabels(this.wiki,this.filmTitle);
  this._localize=null;
  var host=node(doc,"section","plato-player");host._animusFilm=this.filmTitle;
  host.setAttribute("aria-label",displayName(this.getAttribute("label","Turn Around — Beyond the Cave")));
  host.setAttribute("tabindex","0");
  host.setAttribute("data-plato-time","0.000");
  host.setAttribute("data-plato-playing","false");
  host.setAttribute("data-plato-scene","");
  parent.insertBefore(host,nextSibling); this.domNodes.push(host); this.host=host;
  var timeline;
  try { timeline=nativeTimeline(this.wiki,this.filmTitle); }
  catch(error) { node(doc,"p","plato-load-error",error.message||"The film could not be read.",host); return; }
  var scenes=timeline.scenes,duration=timeline.duration;
  this._pendingRefresh=false;
  this._dependencies=timeline.dependencies;
  this._sourceTitles=scenes.map(function(scene){return scene.source;});
  this._audioTitles=[];
  scenes.forEach(function(scene){scene.tracks.forEach(function(track){self._audioTitles.push(track.asset);});});
  // TiddlyWiki also renders with a non-browser document when saving the wiki.
  // That pass must not build SVG, install timers, or open an AudioContext.
  if(typeof window==="undefined"||typeof host.addEventListener!=="function") {
    node(doc,"p","plato-static",timeline.title+" · "+scenes.length+" scenes · "+clockLabel(duration),host);
    return;
  }
  var win=doc.defaultView||window;
  var removers=[],timeouts=new Set(),dead=false,raf=0,context=null,buses={},effects=null,recordingRoom=null;
  var state={running:false,preparing:false,position:0,anchorTime:0,anchorAudio:0,anchorPerf:0,mode:"silent",generation:0,sceneIndex:-1,view:null,filmView:null,world:null,dimmer:null,subtitles:true,audioError:"",refreshError:""};
  var musical=timeline.film.musical||{},beatClock=Motion.beatClock(Playlist.reflow(musical.songs||[],""),function(title){var t=self.wiki.getTiddler(title),f=t&&t.fields||{};return f["abc-source"]||f.text||"";});
  var cache=Object.create(null),wanted=Object.create(null),decodeQueue=[],activeDecodes=0;
  var scheduled=Object.create(null),scheduleFailures=Object.create(null),audioWarnings=Object.create(null);
  var gains={speech:1,song:1,music:1},scrubbing=false,resumeAfterScrub=false,lastCaption="",lastStatus="";

  var screen=node(doc,"div","plato-screen",null,host);
  var scenePane=node(doc,"div","plato-scene",null,screen);
  var sceneBadge=node(doc,"div","plato-scene-badge","",screen);
  var caption=node(doc,"div","plato-caption",null,screen);
  caption.setAttribute("aria-live","off"); caption.hidden=true;
  var speakerLabel=node(doc,"div","plato-caption-speaker","",caption);
  var captionText=node(doc,"div","plato-caption-text","",caption);
  var captionStyle=timeline.captionStyle,captionScale=clamp(number(captionStyle.scale,1),.65,2.2),captionWidth=clamp(number(captionStyle.width,88),45,100);
  caption.style.left=(100-captionWidth)/2+"%";caption.style.right=(100-captionWidth)/2+"%";
  caption.style.bottom=clamp(number(captionStyle.bottom,4.5),1,30)+"%";
  captionText.style.fontSize="clamp(12px,"+(1.9*captionScale).toFixed(3)+"cqw,"+Math.round(27*captionScale)+"px)";
  captionText.style.backgroundColor="rgba(9,10,12,"+clamp(number(captionStyle.background,.87),0,1)+")";
  var preparing=node(doc,"div","plato-preparing","Preparing sound …",screen);
  preparing.hidden=true; preparing.setAttribute("role","status");
  var transport=node(doc,"div","plato-transport",null,host);
  var playButton=button(doc,transport,"plato-button plato-play","▶ Play","Play the performance");
  var stopButton=button(doc,transport,"plato-button plato-stop","■","Stop and return to the beginning");
  stopButton.title="Stop";
  var timelineControl=node(doc,"div","plato-timeline",null,transport);
  var scrub=node(doc,"input","plato-scrub",null,timelineControl);
  scrub.type="range"; scrub.min="0"; scrub.max=String(duration); scrub.step="0.01"; scrub.value="0";
  scrub.setAttribute("aria-label","Position in the performance");
  var timeOutput=node(doc,"output","plato-time","0:00 / "+clockLabel(duration),timelineControl);
  var options=node(doc,"div","plato-options",null,host);
  var chapters=node(doc,"select","plato-chapters",null,options);
  chapters.setAttribute("aria-label","Choose a chapter");
  function chapterOptions() {
    chapters.textContent="";
    scenes.forEach(function(scene,index){
      var option=node(doc,"option","",String(index+1).padStart(2,"0")+" · "+displayName(scene.title)+"  ("+clockLabel(scene.start)+")",chapters);
      option.value=String(index);
    });
  }
  chapterOptions();
  var subtitlesButton=button(doc,options,"plato-button plato-secondary","Captions","Show captions");
  subtitlesButton.setAttribute("aria-pressed","true");
  var soundWrap=node(doc,"div","plato-sound-wrap",null,options);
  var soundButton=button(doc,soundWrap,"plato-button plato-secondary","Sound","Adjust sound levels");
  soundButton.setAttribute("aria-expanded","false");
  var mixer=node(doc,"div","plato-mixer",null,soundWrap); mixer.hidden=true;
  mixer.setAttribute("role","group"); mixer.setAttribute("aria-label","Sound levels");
  [["speech","Speech"],["song","Singing"],["music","Music"]].forEach(function(row) {
    var label=node(doc,"label","plato-mixer-row",null,mixer);
    node(doc,"span","",row[1],label);
    var range=node(doc,"input","plato-level",null,label);
    range.type="range"; range.min="0"; range.max="1"; range.step=".01"; range.value="1";
    range.setAttribute("aria-label",row[1]+", volume");
    var value=node(doc,"output","plato-level-value","100 %",label);
    on(range,"input",function() {
      gains[row[0]]=clamp(number(range.value,1),0,1);
      value.textContent=Math.round(gains[row[0]]*100)+" %";
      if(context&&buses[row[0]]) buses[row[0]].gain.setTargetAtTime(gains[row[0]],context.currentTime,.015);
    });
  });
  var fullscreenButton=button(doc,options,"plato-button plato-secondary plato-fullscreen","Full screen","Show the performance in full screen");
  var footer=node(doc,"div","plato-footer",null,host);
  var progressLabel=node(doc,"p","plato-progress","",footer);
  var status=node(doc,"p","plato-status","",footer);
  status.setAttribute("role","status"); status.setAttribute("aria-live","polite");

  function on(element,event,handler,optionsValue) {
    element.addEventListener(event,handler,optionsValue);
    removers.push(function(){element.removeEventListener(event,handler,optionsValue);});
  }
  function nowPerf() { return win.performance&&win.performance.now?win.performance.now()/1000:Date.now()/1000; }
  function time() {
    if(!state.running) return clamp(state.position,0,duration);
    var elapsed=state.mode==="audio"&&context?Math.max(0,context.currentTime-state.anchorAudio):Math.max(0,nowPerf()-state.anchorPerf);
    return clamp(state.anchorTime+elapsed,0,duration);
  }
  function sceneAt(t) {
    var low=0,high=scenes.length-1;
    while(low<high) {var middle=Math.ceil((low+high)/2);if(scenes[middle].start<=t) low=middle;else high=middle-1;}
    return low;
  }
  function statusText() {
    var message=state.refreshError||state.audioError||"";
    if(message!==lastStatus) {status.textContent=message;lastStatus=message;}
    status.classList.toggle("has-error",!!message);
  }
  function reportAudio(key,message) {
    if(dead||audioWarnings[key]) return;
    audioWarnings[key]=message;
    state.audioError=message;
    host.setAttribute("data-plato-audio-error",message);
    statusText();
  }
  function updateTransport() {
    host.setAttribute("data-plato-playing",state.running?"true":"false");
    host.setAttribute("aria-busy",state.preparing?"true":"false");
    playButton.textContent=state.preparing?"Preparing …":state.running?"Ⅱ Pause":"▶ Play";
    playButton.setAttribute("aria-label",state.preparing?"Cancel preparation":state.running?"Pause the performance":"Play the performance");
    playButton.setAttribute("aria-pressed",state.running?"true":"false");
    preparing.hidden=!state.preparing;
    host.classList.toggle("is-playing",state.running);
  }
  function hideAuthoredCaptions(view) {
    if(!view) return;
    Object.keys(view.nodes||{}).forEach(function(id) {
      var entry=view.nodes[id],part=entry.part||{};
      if(part.type==="text"&&(/^(?:spoken-\d+|song-line-\d+|sing-label)(?:$|-)/.test(id)||/^lipsync-only(?:\s|$)/i.test(String(part.name||"")))) {
        entry.el.style.display="none";entry.el.setAttribute("aria-hidden","true");
      }
      if(entry.nested) hideAuthoredCaptions(entry.nested);
    });
    (view.clips||[]).forEach(function(clip){if(clip.view)hideAuthoredCaptions(clip.view);});
  }
  function captionFromPart(part,scene) {
    var aliases={"narrator":"narrator","the narrator":"narrator","socrates":"narrator","prisoner":"prisoner","the prisoner":"prisoner","guide":"guide","the guide":"guide","elder":"elder","the elder":"elder","chorus":"chorus","the chorus":"chorus","fortælleren":"narrator","fangen":"prisoner","vejviseren":"guide","den ældre":"elder","koret":"chorus"};
    var text=String(part.text||""),prefix=/^\s*([^:\n]{1,80}):\s*([\s\S]*)$/.exec(text),target=part.lipSync&&part.lipSync.target;
    var speaker=prefix&&aliases[prefix[1].trim().toLowerCase()]||(SPEAKERS[target]?target:prefix&&prefix[1].trim())||"narrator";
    if(prefix)text=prefix[2];
    return {id:part.id,scene:scene,speaker:speaker,text:text,kind:part.id.indexOf("song-line-")===0||part.id==="sing-label"?"song":"speech"};
  }
  function captionAt(view,seconds,depth) {
    if(!view||depth>16)return null;var active=null;
    (view.scene.parts||[]).forEach(function(part){if(part.type!=="text"||!/^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(part.id)||Engine.state(part,seconds).opacity<.45)return;
      if(!active||part.id.indexOf("spoken-")===0)active=captionFromPart(part,view.scene.id||view.scene._title);
    });
    if(active)return active;
    var which=Engine.clipAt(view.scene.scenes||[],seconds).index,elapsed=0;
    (view.clips||[]).forEach(function(clip,index){var span=Math.max(.1,number(clip.settings&&clip.settings.duration,4));
      if(index===which&&clip.view)active=captionAt(clip.view,Engine.localTime(clamp(seconds-elapsed,0,span),clip.duration,clip.settings),depth+1);elapsed+=span;
    });
    if(active)return active;
    Object.keys(view.nodes||{}).some(function(id){var n=view.nodes[id],p=n.part||{};if(n.nested&&seconds>=number(p.start,0)&&Engine.state(p,seconds).opacity>=.45){active=captionAt(n.nested,Engine.localTime(seconds,n.nested.duration,p),depth+1);return !!active;}return false;});
    return active;
  }
  function ensureFilmView() {
    if(state.filmView)return;
    // Root foreground objects and the global camera remain fully native while
    // inactive scene DOM trees are omitted to keep the complete wiki responsive.
    var wrapper=Object.assign({},timeline.film,{scenes:[]});
    Object.defineProperty(wrapper,"_title",{value:self.filmTitle});
    state.filmView=Engine.build(doc,self.wiki,wrapper,false);
    // Native AniMus stores whole-object transforms, film cameras and lighting
    // separately from the source part keys. Keep their DOM layers in the same
    // order as the editor: source geometry, motion, whole-object/camera, lips.
    state.world=doc.createElementNS("http://www.w3.org/2000/svg","g");state.world.setAttribute("class","plato-native-world");
    Array.prototype.slice.call(state.filmView.svg.children||[]).forEach(function(child){if(String(child.tagName).toLowerCase()!=="defs")state.world.appendChild(child);});
    state.filmView.svg.appendChild(state.world);
    state.dimmer=doc.createElementNS("http://www.w3.org/2000/svg","rect");state.dimmer.setAttribute("class","plato-native-lighting");state.dimmer.setAttribute("fill","#040716");state.dimmer.setAttribute("pointer-events","none");state.filmView.svg.appendChild(state.dimmer);
    hideAuthoredCaptions(state.filmView);scenePane.appendChild(state.filmView.svg);
  }
  function sceneLabels(index) {
    if(!scenes[index])return;
    var name=displayName(scenes[index].title);
    sceneBadge.textContent=String(index+1).padStart(2,"0")+" / "+String(scenes.length).padStart(2,"0")+"  ·  "+name;
    chapters.value=String(index);
    progressLabel.textContent=scenes.length+(Language.isDanish(self.wiki)?" scener · ":" scenes · ")+clockLabel(duration)+" · "+name;
  }
  this._localize=function(){
    displayName=Language.projectLabels(self.wiki,self.filmTitle);
    chapterOptions();sceneLabels(state.sceneIndex);
  };
  function showScene(index) {
    if(index===state.sceneIndex) return;
    if(state.view&&LipSync.reset) LipSync.reset(state.view);
    if(state.view&&state.view.svg.parentNode)state.view.svg.parentNode.removeChild(state.view.svg);
    state.view=null;
    Array.prototype.slice.call(scenePane.children||[]).forEach(function(child){if(!state.filmView||child!==state.filmView.svg)scenePane.removeChild(child);});
    state.sceneIndex=index;
    var scene=scenes[index],source=Engine.readScene(self.wiki,scene.source);
    ensureFilmView();
    if(source) {
      try {
        state.view=Engine.build(doc,self.wiki,source,false,[self.filmTitle]);
        hideAuthoredCaptions(state.view);
        state.view.svg.setAttribute("class","co-nested-svg");
        state.view.svg.setAttribute("width",timeline.film.width);state.view.svg.setAttribute("height",timeline.film.height);
        var foreground=(timeline.film.parts||[]).find(function(p){return p.foreground&&!p.parent&&state.filmView.nodes[p.id];});
        state.world.insertBefore(state.view.svg,foreground?state.filmView.nodes[foreground.id].el:null);
      } catch(error) {node(doc,"div","plato-load-error",(Language.isDanish(self.wiki)?"Scenen kunne ikke vises: ":"The scene could not be shown: ")+displayName(scene.title),scenePane);}
    } else if(scene.source)node(doc,"div","plato-load-error",(Language.isDanish(self.wiki)?"Scenen mangler: ":"The scene is missing: ")+displayName(scene.title),scenePane);
    host.setAttribute("data-plato-scene",scene.id);
    sceneLabels(index);
    lastCaption="";
    setAudioWindow(index);
    if(context&&context.state!=="closed") prepareWindow(index);
  }
  function updateCaption(local,global) {
    var active=captionAt(state.view,local,0)||captionAt(state.filmView,global,0);
    var key=active?active.scene+"\n"+active.id+"\n"+active.text:"";
    if(key!==lastCaption) {
      speakerLabel.textContent=active?(SPEAKERS[active.speaker]||active.speaker):"";
      captionText._animusCue=active?{film:self.filmTitle,scene:active.scene,id:active.id,source:active.text,separateSpeaker:true}:null;
      captionText.textContent=active?active.text:"";
      caption.classList.toggle("is-song",!!active&&active.kind==="song");
      lastCaption=key;
    }
    caption.hidden=!state.subtitles||!active;
  }
  // This is the native editor's scalar interpolation (including its step
  // convention), applied read-only to musical.figureTransforms and cameras.
  function nativeValue(keys,t,property,fallback) {
    keys=(keys||[]).slice().sort(function(a,b){return a.t-b.t;});if(!keys.length)return fallback;
    var a=keys[0],b=a;
    if(t>=keys[keys.length-1].t)a=b=keys[keys.length-1];
    else if(t>a.t)for(var i=0;i<keys.length-1;i++)if(t>=keys[i].t&&t<=keys[i+1].t){a=keys[i];b=keys[i+1];break;}
    var q=a===b?0:clamp((t-a.t)/(b.t-a.t),0,1);if(a.easing==="step")q=0;else if(a.easing!=="linear")q=q*q*(3-2*q);
    return number(a[property],fallback)*(1-q)+number(b[property],number(a[property],fallback))*q;
  }
  function nativeTree() {
    // Motion.paint receives the original scene sequence and exact source clocks,
    // while only the currently visible source owns an SVG tree in this player.
    return {scene:timeline.film,nodes:state.filmView.nodes,svg:state.filmView.svg,clips:scenes.map(function(scene,i){return {settings:scene.settings,duration:scene.sourceDuration,view:i===state.sceneIndex?state.view:null,el:i===state.sceneIndex&&state.view?state.view.svg:null};})};
  }
  function paintNativeVisuals(tree,t) {
    var film=timeline.film,which="A";
    (musical.cuts||[]).slice().sort(function(a,b){return a.t-b.t;}).forEach(function(k){if(number(k.t,0)<=t+.000001)which=k.camera==="B"?"B":"A";});
    var cfg=which==="B"?musical.cameraB:film.camera,keys=cfg&&cfg.keys||[],camera=Engine.cameraState({width:film.width,height:film.height,camera:cfg},t);
    var box={x:camera.x-film.width/camera.zoom/2,y:camera.y-film.height/camera.zoom/2,width:film.width/camera.zoom,height:film.height/camera.zoom};
    state.filmView.svg.setAttribute("viewBox",[box.x,box.y,box.width,box.height].join(" "));
    Object.keys(box).forEach(function(k){state.dimmer.setAttribute(k,box[k]);});
    var intensity=clamp(nativeValue(musical.lighting&&musical.lighting.keys,t,"intensity",1),0,1);
    state.dimmer.setAttribute("opacity",Math.round((1-intensity)*.78*100)/100);
    var radians=nativeValue(keys,t,"r",0)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),sx=Math.tan(clamp(nativeValue(keys,t,"skewX",0),-35,35)*Math.PI/180),sy=Math.tan(clamp(nativeValue(keys,t,"skewY",0),-35,35)*Math.PI/180);
    var a=cos-sin*sy,b=sin+cos*sy,c=cos*sx-sin,d=sin*sx+cos,det=a*d-b*c;
    state.world.setAttribute("transform","translate("+camera.x+" "+camera.y+") matrix("+[d/det,-b/det,-c/det,a/det,0,0].join(" ")+") translate("+(-camera.x)+" "+(-camera.y)+")");
    function walk(view,local,depth) {
      if(!view||depth>16)return;
      Object.keys(musical.figureTransforms||{}).forEach(function(id){
        var node=view.nodes&&view.nodes[id],settings=musical.figureTransforms[id],list=settings&&settings.keys||[];
        if(!node||!node.el||!list.length)return;
        var wrap=node.el._platoWholeWrapper;
        if(!wrap){wrap=doc.createElementNS("http://www.w3.org/2000/svg","g");wrap.setAttribute("class","plato-native-object");node.el._platoWholeWrapper=wrap;}
        if(node.el.parentNode!==wrap){var parent=node.el.parentNode;if(parent){parent.insertBefore(wrap,node.el);wrap.appendChild(node.el);}}
        var k={};["x","y","r","sx","sy","skewX","skewY"].forEach(function(p){k[p]=nativeValue(list,t,p,p==="sx"||p==="sy"?1:0);});
        var origin=(node.el.getAttribute("transform")||"").match(/^translate\(\s*([-+\d.eE]+)[, ]+([-+\d.eE]+)/),cx=origin?number(origin[1],0):0,cy=origin?number(origin[2],0):0;
        wrap.setAttribute("transform","translate("+k.x+" "+k.y+") translate("+cx+" "+cy+") rotate("+k.r+") skewX("+k.skewX+") skewY("+k.skewY+") scale("+k.sx+" "+k.sy+") translate("+(-cx)+" "+(-cy)+")");
      });
      var active=Engine.clipAt(view.scene.scenes||[],local),start=0;
      (view.clips||[]).forEach(function(clip,i){var span=Math.max(.1,number(clip.settings&&clip.settings.duration,4));if(i===active.index&&clip.view)walk(clip.view,Engine.localTime(clamp(local-start,0,span),clip.duration,clip.settings),depth+1);start+=span;});
      Object.keys(view.nodes||{}).forEach(function(id){var n=view.nodes[id];if(n.nested&&n.el.getAttribute("display")!=="none")walk(n.nested,Engine.localTime(local,n.nested.duration,n.part),depth+1);});
    }
    walk(tree,t,0);
  }
  function paint(t) {
    var index=sceneAt(t); showScene(index);
    var scene=scenes[index],local=Engine.localTime(clamp(t-scene.start,0,scene.duration),scene.sourceDuration,scene.settings);
    if(state.filmView)Engine.paint(state.filmView,t);
    if(state.view)Engine.paint(state.view,local);
    var tree=nativeTree();Motion.paint(tree,timeline.film,t,beatClock);paintNativeVisuals(tree,t);
    LipSync.apply(state.filmView,t,t,{sceneTitle:self.filmTitle,audioClips:timeline.audioClips,duration:duration,film:timeline.film});
    if(state.view)LipSync.apply(state.view,local,t,{sceneTitle:scene.source,audioClips:timeline.audioClips,duration:duration,film:timeline.film});
    updateCaption(local,t);
    if(!scrubbing) scrub.value=String(t);
    scrub.style.setProperty("--plato-progress",(t/duration*100).toFixed(3)+"%");
    var ariaTime=clockLabel(t)+" of "+clockLabel(duration),clockText=clockLabel(t)+" / "+clockLabel(duration);
    if(scrub.getAttribute("aria-valuetext")!==ariaTime)scrub.setAttribute("aria-valuetext",ariaTime);
    if(timeOutput.textContent!==clockText)timeOutput.textContent=clockText;
    host.setAttribute("data-plato-time",t.toFixed(3));
    host.setAttribute("data-plato-local",local.toFixed(3));
  }
  function tick() {
    raf=0;
    if(dead) return;
    if(host.isConnected===false) {destroy();return;}
    var t=time();if(effects&&state.mode==="audio")effects.sync(t);paint(t);
    if(t>=duration&&state.running) {
      state.position=duration;state.running=false;stopSources();updateTransport();
      return;
    }
    if(state.running) raf=win.requestAnimationFrame(tick);
  }
  function requestFrame() {if(!raf&&!dead)raf=win.requestAnimationFrame(tick);}

  // Editing can commit dozens of wiki changes while this tiddler remains open.
  // Keep the idle player and its controls mounted; refresh its project only
  // when it is used again. The stable host/API also keeps export adapters and
  // the caption-language selector connected across these updates.
  function invalidate() {
    if(dead||self._pendingRefresh)return;
    state.position=time();state.running=false;state.preparing=false;state.generation++;
    if(raf){win.cancelAnimationFrame(raf);raf=0;}
    stopSources();
    // Do not continue preparing the old chapter in the background while the
    // editor is active. Already running decodes settle without retaining data.
    wanted=Object.create(null);cache=Object.create(null);
    decodeQueue.forEach(function(job){job.resolve(null);});decodeQueue=[];
    updateTransport();
    self._pendingRefresh=true;host.setAttribute("data-plato-stale","true");
  }
  function ensureFresh() {
    if(dead)return false;
    if(!self._pendingRefresh)return true;
    var next;
    try {next=nativeTimeline(self.wiki,self.filmTitle);}
    catch(error) {state.refreshError=error.message||"The edited performance could not be read.";statusText();return false;}
    // Pending decodes may still settle. Cache identity checks ensure they can
    // never supply an old take to the refreshed project; keep their count until
    // they finish so the two-decode limit remains valid.
    stopSources();decodeQueue.forEach(function(job){job.resolve(null);});decodeQueue=[];
    cache=Object.create(null);wanted=Object.create(null);scheduleFailures=Object.create(null);audioWarnings=Object.create(null);
    if(state.view&&LipSync.reset)LipSync.reset(state.view);
    if(state.filmView&&LipSync.reset)LipSync.reset(state.filmView);
    scenePane.textContent="";state.view=null;state.filmView=null;state.world=null;state.dimmer=null;state.sceneIndex=-1;
    timeline=next;scenes=timeline.scenes;duration=timeline.duration;
    musical=timeline.film.musical||{};if(effects)effects.cues=musical.sfx||[];
    beatClock=Motion.beatClock(Playlist.reflow(musical.songs||[],""),function(title){var t=self.wiki.getTiddler(title),f=t&&t.fields||{};return f["abc-source"]||f.text||"";});
    self._dependencies=timeline.dependencies;self._sourceTitles=scenes.map(function(scene){return scene.source;});
    self._audioTitles=[];scenes.forEach(function(scene){scene.tracks.forEach(function(track){self._audioTitles.push(track.asset);});});
    chapterOptions();
    captionStyle=timeline.captionStyle;captionScale=clamp(number(captionStyle.scale,1),.65,2.2);captionWidth=clamp(number(captionStyle.width,88),45,100);
    caption.style.left=(100-captionWidth)/2+"%";caption.style.right=(100-captionWidth)/2+"%";caption.style.bottom=clamp(number(captionStyle.bottom,4.5),1,30)+"%";
    captionText.style.fontSize="clamp(12px,"+(1.9*captionScale).toFixed(3)+"cqw,"+Math.round(27*captionScale)+"px)";
    captionText.style.backgroundColor="rgba(9,10,12,"+clamp(number(captionStyle.background,.87),0,1)+")";
    state.position=clamp(state.position,0,duration);scrub.max=String(duration);lastCaption="";
    state.audioError="";state.refreshError="";host.removeAttribute("data-plato-audio-error");
    self._pendingRefresh=false;host.removeAttribute("data-plato-stale");statusText();paint(state.position);updateTransport();
    return true;
  }
  this._invalidate=invalidate;

  // Audio is entirely embedded. There is deliberately no URL loader, sample
  // bank, synthesizer, or request for a network resource in this player.
  function embeddedBytes(asset) {
    var tiddler=self.wiki.getTiddler(asset),fields=tiddler&&tiddler.fields;
    if(!fields||!/^audio\//i.test(String(fields.type||""))) throw Error("Embedded audio missing");
    var raw=String(fields.text||"").trim();
    if(/^data:/i.test(raw)) {
      var comma=raw.indexOf(",");
      if(comma<0||!/^data:audio\/[^,]+;base64$/i.test(raw.slice(0,comma))) throw Error("Embedded audio is not base64");
      raw=raw.slice(comma+1);
    }
    raw=raw.replace(/\s/g,"");
    if(!raw||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw Error("Embedded audio is invalid");
    var binary=win.atob(raw),bytes=new Uint8Array(binary.length);
    for(var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes.buffer;
  }
  function decodeBytes(bytes) {
    return new Promise(function(resolve,reject) {
      var finished=false,timer=win.setTimeout(function(){finish(Error("Audio decoding timed out"));},25000);
      timeouts.add(timer);
      function finish(error,buffer) {
        if(finished)return;finished=true;win.clearTimeout(timer);timeouts.delete(timer);
        if(error)reject(error);else resolve(buffer);
      }
      try {
        var pending=context.decodeAudioData(bytes,function(buffer){finish(null,buffer);},function(error){finish(error||Error("Audio decoding failed"));});
        if(pending&&typeof pending.then==="function")pending.then(function(buffer){finish(null,buffer);},function(error){finish(error);});
      } catch(error) {finish(error);}
    });
  }
  function runDecodeQueue() {
    if(dead||!context||context.state==="closed")return;
    while(activeDecodes<2&&decodeQueue.length) {
      var job=decodeQueue.shift();
      if(!wanted[job.asset]||cache[job.asset]!==job.entry) {job.resolve(null);continue;}
      activeDecodes++;
      (function(current) {
        var operation;
        try {operation=decodeBytes(embeddedBytes(current.asset));}
        catch(error) {operation=Promise.reject(error);}
        operation.then(function(buffer) {
          var currentAsset=!dead&&wanted[current.asset]&&cache[current.asset]===current.entry;
          if(currentAsset)current.entry.buffer=buffer;
          current.resolve(currentAsset?buffer:null);
        },function(error) {
          current.entry.error=error;
          if(!dead&&wanted[current.asset]&&cache[current.asset]===current.entry)reportAudio(current.asset,"A "+(SOUND_NAMES[current.kind]||"sound")+" track could not be opened. Animation and other sound will continue.");
          current.resolve(null);
        }).then(function(){activeDecodes--;runDecodeQueue();});
      })(job);
    }
  }
  function assetBuffer(track) {
    if(dead||!context||!wanted[track.asset])return Promise.resolve(null);
    if(cache[track.asset])return cache[track.asset].promise;
    var entry={buffer:null,error:null,promise:null};
    cache[track.asset]=entry;
    entry.promise=new Promise(function(resolve) {decodeQueue.push({asset:track.asset,kind:track.kind,entry:entry,resolve:resolve});});
    runDecodeQueue();
    return entry.promise;
  }
  function setAudioWindow(index) {
    var next=Object.create(null);
    [index,index+1].forEach(function(i){if(scenes[i])scenes[i].tracks.forEach(function(track){if(!track.muted&&track.volume>0)next[track.asset]=true;});});
    wanted=next;
    Object.keys(cache).forEach(function(asset){if(!wanted[asset])delete cache[asset];});
    decodeQueue=decodeQueue.filter(function(job){if(wanted[job.asset]&&cache[job.asset]===job.entry)return true;job.resolve(null);return false;});
  }
  function prepareScene(index) {
    if(!scenes[index]||!context||context.state==="closed")return Promise.resolve();
    return Promise.all(scenes[index].tracks.filter(function(track){return !track.muted&&track.volume>0;}).map(assetBuffer));
  }
  function prepareWindow(index) {
    [index,index+1].forEach(function(i) {
      if(!scenes[i])return;
      prepareScene(i).then(function(){if(!dead&&state.running&&state.mode==="audio")scheduleScene(i);});
    });
  }
  function releaseSource(entry,stop) {
    if(!entry)return;
    try {entry.source.onended=null;if(stop)entry.source.stop();entry.source.disconnect();entry.source.buffer=null;}catch(_){}
    try {entry.gain.disconnect();if(entry.send)entry.send.disconnect();}catch(_){}
  }
  function stopSources() {
    if(effects)effects.quiet();
    if(recordingRoom){recordingRoom.dispose();recordingRoom=null;}
    Object.keys(scheduled).forEach(function(key){releaseSource(scheduled[key],true);});
    scheduled=Object.create(null);
  }
  function scheduleScene(index) {
    if(dead||!state.running||state.mode!=="audio"||!context||context.state!=="running"||!scenes[index])return;
    var currentIndex=sceneAt(time());
    if(index<currentIndex||index>currentIndex+1)return;
    var scene=scenes[index];
    scene.tracks.forEach(function(track,trackIndex) {
      var key=index+":"+trackIndex+":"+track.id;
      if(scheduled[key]||scheduleFailures[key]||track.muted||track.volume<=0)return;
      var entry=cache[track.asset],buffer=entry&&entry.buffer;
      if(!buffer)return;
      var start=scene.start+track.start;
      // Tracks are already partitioned at scene boundaries. The final scene
      // can hold its last frame while a native audio tail continues past it.
      var length=Math.min(track.duration,Math.max(0,buffer.duration-track.offset));
      var end=start+length;
      var desired=state.anchorAudio+(start-state.anchorTime);
      var when=Math.max(context.currentTime+.006,state.anchorAudio,desired);
      var timelineAtStart=state.anchorTime+(when-state.anchorAudio);
      var elapsed=Math.max(0,timelineAtStart-start);
      if(length<=0||timelineAtStart>=end||elapsed>=length)return;
      var source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffer;gain.gain.value=track.volume;
      source.connect(gain);gain.connect(buses[track.kind==="speech"?"speech":track.kind==="song"?"song":"music"]);
      var send=null;
      if(track.reverb>0&&context.createConvolver){
       if(!recordingRoom)recordingRoom=require("$:/plugins/huwiki/abc/accompaniment.js").createRoom(context,buses.music);
       send=context.createGain();send.gain.value=clamp(track.reverb,0,1);gain.connect(send);send.connect(recordingRoom.input());
      }
      var playing={source:source,gain:gain,send:send};scheduled[key]=playing;
      source.onended=function(){if(scheduled[key]===playing)delete scheduled[key];releaseSource(playing,false);};
      try {source.start(when,track.offset+elapsed,length-elapsed);}
      catch(error) {delete scheduled[key];scheduleFailures[key]=true;releaseSource(playing,false);reportAudio(track.asset,"An audio track could not start. Animation and other sound will continue.");}
    });
  }
  function anchor(t,audio) {
    state.position=t;state.anchorTime=t;state.mode=audio?"audio":"silent";
    state.anchorPerf=nowPerf();
    state.anchorAudio=context?context.currentTime+.04:0;
  }
  function audioStateChanged() {
    if(dead||!state.running||!context)return;
    if(context.state!=="running"&&state.mode==="audio") {
      var frozen=time();stopSources();anchor(frozen,false);
      reportAudio("interrupted","Sound was interrupted. The performance continues silently; pause and play to resume sound.");
    } else if(context.state==="running"&&state.mode!=="audio") {
      var continuing=time();anchor(continuing,true);
      var index=sceneAt(continuing);setAudioWindow(index);prepareWindow(index);
      scheduleScene(index);scheduleScene(index+1);
    }
  }
  function resumeAudio() {
    // This function is entered synchronously from the Play gesture. Calling
    // resume here, before any decode await, preserves Safari's user activation.
    try {
      if(!context) {
        var AudioContext=win.AudioContext||win.webkitAudioContext;
        if(!AudioContext) {reportAudio("unavailable","Audio is unavailable in this browser. The performance continues silently.");return Promise.resolve(false);}
        context=new AudioContext();
        ["speech","song","music"].forEach(function(kind){buses[kind]=context.createGain();buses[kind].gain.value=gains[kind];buses[kind].connect(context.destination);});
        if(SoundFx)effects=new SoundFx.Fx(musical.sfx,{context:context,destination:buses.music});
        on(context,"statechange",audioStateChanged);
      }
      var resume=context.state==="running"?Promise.resolve():context.resume();
      return Promise.resolve(resume).then(function() {
        if(dead)return false;
        if(context.state!=="running") {reportAudio("blocked","Audio could not start. The performance continues silently; pause and play to try again.");return false;}
        ["blocked","unavailable","interrupted"].forEach(function(key){delete audioWarnings[key];});
        state.audioError=Object.keys(audioWarnings).map(function(key){return audioWarnings[key];}).pop()||"";
        if(!state.audioError)host.removeAttribute("data-plato-audio-error");
        statusText();
        return true;
      },function(){reportAudio("blocked","Audio could not start. The performance continues silently; pause and play to try again.");return false;});
    } catch(error) {reportAudio("unavailable","Audio could not be prepared. The performance continues silently.");return Promise.resolve(false);}
  }
  function play() {
    if(dead||!ensureFresh()||state.running||state.preparing)return Promise.resolve();
    if(state.position>=duration-.01)state.position=0;
    var token=++state.generation,index=sceneAt(state.position);
    state.preparing=true;updateTransport();paint(state.position);setAudioWindow(index);
    var audioReady=resumeAudio();
    return audioReady.then(function(canAudio) {
      if(dead||token!==state.generation)return null;
      return (canAudio?prepareScene(index):Promise.resolve()).then(function() {
        if(dead||token!==state.generation)return;
        state.preparing=false;state.running=true;scheduleFailures=Object.create(null);
        anchor(state.position,canAudio&&context&&context.state==="running");
        if(state.mode==="audio") {
          scheduleScene(index);scheduleScene(index+1);prepareWindow(index);
        }
        updateTransport();requestFrame();
      });
    });
  }
  function pause() {
    if(dead)return;
    state.position=time();state.running=false;state.preparing=false;state.generation++;
    if(raf){win.cancelAnimationFrame(raf);raf=0;}
    stopSources();updateTransport();if(!self._pendingRefresh)paint(state.position);
  }
  function seek(value) {
    if(dead||!ensureFresh())return Promise.resolve();
    var resume=state.running||state.preparing;
    pause();state.position=clamp(number(value,0),0,duration);
    paint(state.position);setAudioWindow(sceneAt(state.position));
    if(context)prepareWindow(sceneAt(state.position));
    return resume?play():Promise.resolve();
  }
  function stop() {pause();state.position=0;if(ensureFresh())paint(0);}
  function toggle() {return state.running||state.preparing?pause():play();}
  function finishScrub() {
    if(!scrubbing)return;
    var requested=Number(scrub.value);
    if(!ensureFresh()){scrubbing=false;return;}
    var resume=resumeAfterScrub;scrubbing=false;resumeAfterScrub=false;
    state.position=clamp(number(requested,0),0,duration);paint(state.position);
    setAudioWindow(sceneAt(state.position));
    if(resume)play();else if(context)prepareWindow(sceneAt(state.position));
  }
  function fullscreen() {
    if(!ensureFresh())return;
    var current=doc.fullscreenElement||doc.webkitFullscreenElement;
    var action=current?(doc.exitFullscreen||doc.webkitExitFullscreen):(host.requestFullscreen||host.webkitRequestFullscreen);
    if(!action)return;
    try {var result=action.call(current?doc:host);if(result&&result.catch)result.catch(function(){});}catch(_){}
  }
  function syncFullscreen() {
    var active=(doc.fullscreenElement||doc.webkitFullscreenElement)===host;
    fullscreenButton.textContent=active?"Exit full screen":"Full screen";
    fullscreenButton.setAttribute("aria-label",active?"Exit full screen":"Show the performance in full screen");
  }
  function destroy() {
    if(dead)return;
    state.position=time();dead=true;state.running=false;state.preparing=false;state.generation++;
    if(raf)win.cancelAnimationFrame(raf);raf=0;stopSources();
    timeouts.forEach(function(timer){win.clearTimeout(timer);});timeouts.clear();
    decodeQueue.forEach(function(job){job.resolve(null);});decodeQueue=[];
    cache=Object.create(null);wanted=Object.create(null);
    if(state.view&&LipSync.reset)LipSync.reset(state.view);state.view=null;
    if(state.filmView&&LipSync.reset)LipSync.reset(state.filmView);state.filmView=null;
    removers.forEach(function(remove){remove();});removers=[];
    if(effects){effects.dispose();effects=null;}
    Object.keys(buses).forEach(function(kind){try{buses[kind].disconnect();}catch(_){}});buses={};
    if(context&&context.state!=="closed") {try{var closed=context.close();if(closed&&closed.catch)closed.catch(function(){});}catch(_){}}
    host.setAttribute("data-plato-playing","false");
    self._shutdown=null;self._invalidate=null;
  }

  on(playButton,"click",toggle);
  on(stopButton,"click",stop);
  on(scenePane,"pointerdown",function(){try{host.focus({preventScroll:true});}catch(_){host.focus();}});
  on(scrub,"input",function() {
    var requested=Number(scrub.value);if(!ensureFresh())return;
    if(!scrubbing){resumeAfterScrub=state.running||state.preparing;scrubbing=true;pause();}
    state.position=clamp(number(requested,0),0,duration);scrub.value=String(state.position);paint(state.position);
  });
  on(scrub,"change",finishScrub);on(scrub,"blur",finishScrub);on(scrub,"pointercancel",finishScrub);
  on(chapters,"change",function(){var chosen=Number(chapters.value);if(!ensureFresh())return;var index=clamp(number(chosen,0),0,scenes.length-1);seek(scenes[index].start);});
  on(subtitlesButton,"click",function(){if(!ensureFresh())return;state.subtitles=!state.subtitles;subtitlesButton.setAttribute("aria-pressed",state.subtitles?"true":"false");paint(time());});
  on(soundButton,"click",function(){mixer.hidden=!mixer.hidden;soundButton.setAttribute("aria-expanded",mixer.hidden?"false":"true");});
  on(fullscreenButton,"click",fullscreen);
  on(doc,"fullscreenchange",syncFullscreen);on(doc,"webkitfullscreenchange",syncFullscreen);
  on(doc,"click",function(event) {
    var element=event.target;
    if(element&&element.nodeType!==1)element=element.parentElement||element.parentNode;
    var link=element&&typeof element.closest==="function"&&element.closest(".plato-nav a");
    if(link){
      if(state.running||state.preparing)pause();
      var target=link.getAttribute("data-tiddler-title"),href=link.getAttribute("href")||"";
      if(!target&&href.charAt(0)==="#")try{target=decodeURIComponent(href.slice(1));}catch(_){}
      if(target===(self.getVariable?self.getVariable("currentTiddler"):"Turn Around"))ensureFresh();
    }
  },true);
  on(host,"keydown",function(event) {
    var target=event.target,tag=target&&target.tagName;
    if(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag||"")||(target&&target.isContentEditable))return;
    if(event.key===" "||event.code==="Space") {event.preventDefault();if(!event.repeat)toggle();}
    else if(event.key==="ArrowRight") {event.preventDefault();seek(time()+10);}
    else if(event.key==="ArrowLeft") {event.preventDefault();seek(time()-10);}
    else if(event.key==="Escape"&&!mixer.hidden){mixer.hidden=true;soundButton.setAttribute("aria-expanded","false");}
  });
  host._platoPlayer={seek:seek,play:play,pause:pause,time:time,getView:function(){return ensureFresh()?state.view:null;},getFilmView:function(){return ensureFresh()?state.filmView:null;},destroy:destroy,
    getTimeline:function(){if(!ensureFresh())throw Error(state.refreshError||"The performance is unavailable.");return {filmTitle:self.filmTitle,title:timeline.title,duration:duration,scenes:scenes.map(function(s){return {id:s.id,title:s.title,source:s.source,start:s.start,duration:s.duration,settings:Object.assign({},s.settings)};}),audioClips:timeline.audioClips.map(function(a){return Object.assign({},a);})};},
    getAudioState:function(){return {mode:state.mode,context:context&&context.state,bufferedAssets:Object.keys(cache).filter(function(asset){return !!cache[asset].buffer;}),scheduledTracks:Object.keys(scheduled).length,error:state.audioError};}};
  this._shutdown=destroy;
  paint(0);updateTransport();
};
PlatoPlayer.prototype.removeChildDomNodes=function() {
  if(this._shutdown)this._shutdown();
  Widget.prototype.removeChildDomNodes.call(this);
};
PlatoPlayer.prototype.refresh=function(changedTiddlers) {
  var attributes=this.computeAttributes(),dependencies=this._dependencies||{};
  if(Object.keys(attributes).length){
    if(this._shutdown)this._shutdown();
    this.refreshSelf();return true;
  }
  if(changedTiddlers["$:/language"]&&this._localize)this._localize();
  if(changedTiddlers[this.filmTitle]||
    (this._sourceTitles||[]).some(function(title){return !!changedTiddlers[title];})||
    (this._audioTitles||[]).some(function(title){return !!changedTiddlers[title];})||
    Object.keys(dependencies).some(function(title){return !!changedTiddlers[title];})) {
    if(this._invalidate){this._invalidate();return false;}
    this.refreshSelf();return true;
  }
  return false;
};
exports["plato-player"]=PlatoPlayer;
})();
