/*\
title: $:/plugins/huwiki/abc/score-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var PageView=require('$:/plugins/huwiki/abc/page-view.js');
var RefreshPolicy=require('$:/plugins/huwiki/abc/refresh-policy.js');
var ViewState=require('$:/plugins/huwiki/abc/view-state.js');
var ViewportAnchor=require('$:/plugins/huwiki/abc/viewport-anchor.js');
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var tools=require("$:/plugins/huwiki/abc/loader.js");
var piano=require("$:/plugins/huwiki/abc/piano.js");
var chordKeys=require("$:/plugins/huwiki/abc/chord-keys.js");
var tabs=require("$:/plugins/huwiki/abc/tabs.js");
var transpose=require("$:/plugins/huwiki/abc/transpose.js");
var playback=require("$:/plugins/huwiki/abc/playback.js");
var shortcuts=require("$:/plugins/huwiki/abc/keyboard-shortcuts.js");
var startPosition=require("$:/plugins/huwiki/abc/start-position.js");
var repeatButton=require('$:/plugins/huwiki/abc/repeat-button.js');
var jazzFont=require("$:/plugins/huwiki/abc/jazz-font.js");
var sheetLayout=require("$:/plugins/huwiki/abc/sheet-layout.js");
var accompaniment=require("$:/plugins/huwiki/abc/accompaniment.js");
var publisher=require("$:/plugins/huwiki/abc/site-publisher.js");
var siteShare=require("$:/plugins/huwiki/abc/site-share.js");
var Display=require("$:/plugins/huwiki/abc/display-source.js");
var InstrumentView=require("$:/plugins/huwiki/abc/instrument-view.js");
var TransposedLayout=require("$:/plugins/huwiki/abc/transposed-layout.js");
var Audition=require("$:/plugins/huwiki/abc/audition.js");
var AudioController=require("$:/plugins/huwiki/abc/audio-controller.js");
var SoundHelp=require("$:/plugins/huwiki/abc/sound-help.js");
var ScoreView=require("$:/plugins/huwiki/abc/score-view.js");
var ReaderMode=require("$:/plugins/huwiki/abc/reader-mode.js");
var MinimalPlayer=require("$:/plugins/huwiki/abc/minimal-player.js");
var FloatingPiano=require("$:/plugins/huwiki/abc/floating-piano.js");
var FloatingMixer=require("$:/plugins/huwiki/abc/floating-mixer.js");
var PianoFollow=require('$:/plugins/huwiki/abc/piano-follow.js');
function el(tag,cls,text){
  var node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined&&text!==null)node.textContent=text;
  return node;
}
function button(label,handler,cls){
  var b=el("button","huwabc-btn "+(cls||""),label);b.type="button";b.addEventListener("click",handler);return b;
}
// Provide our own consistent icons: do not depend on abcjs' default SVG styling.
function miniIcon(kind){
  var svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","20");svg.setAttribute("height","20");
  svg.setAttribute("aria-hidden","true");svg.setAttribute("class","huwabc-icon huwabc-icon-"+kind);
  var p=document.createElementNS("http://www.w3.org/2000/svg","path");
  var shapes={play:"M8 5v14l11-7z",pause:"M7 5h4v14H7z M14 5h4v14h-4z",restart:"M3 11a9 9 0 1 1 2.6 6.4 M3 4v7h7",loop:"M4 7h14l-3-3 M18 7l-3 3 M20 17H6l3 3 M6 17l3-3"};
  p.setAttribute("d",shapes[kind]||shapes.play);p.setAttribute("fill",(kind==="play"||kind==="pause")?"currentColor":"none");
  p.setAttribute("stroke",kind==="play"?"none":"currentColor");p.setAttribute("stroke-width","2");
  p.setAttribute("stroke-linejoin","round");p.setAttribute("stroke-linecap","round");
  svg.appendChild(p);return svg;
}
function labelPlayerControls(container){
  var items=[
    [".abcjs-midi-start","Afspil / pause","Afspil","play"],
    [".abcjs-midi-reset","Start forfra","Forfra","restart"],
    [".abcjs-midi-loop","Gentag melodien","Gentag","loop"]
  ];
  items.forEach(function(spec){
    var b=container.querySelector(spec[0]);if(!b)return;
    b.setAttribute("aria-label",spec[1]);b.setAttribute("title",spec[1]+(spec[3]==='play'?' · Shift+Space':''));if(spec[3]==='play')b.setAttribute('aria-keyshortcuts','Space Shift+Space');
    if(b.querySelector(".huwabc-control-label"))return;
    b.insertBefore(miniIcon(spec[3]),b.firstChild);
    if(spec[3]==="play")b.insertBefore(miniIcon("pause"),b.querySelector(".huwabc-icon-play").nextSibling);
    var lbl=el("span","huwabc-control-label",spec[2]);b.appendChild(lbl);
    if(spec[3]==="play"){b.appendChild(el("span","huwabc-control-label-pause","Pause"));}
  });
  var clock=container.querySelector(".abcjs-midi-clock");if(clock){clock.setAttribute("aria-label","Afspilningstid");}
  var slider=container.querySelector(".abcjs-midi-progress-background");if(slider){slider.setAttribute("aria-label","Afspilningsposition");slider.setAttribute("title","Klik for at spole");}
  var warp=container.querySelector(".abcjs-tempo-wrapper");
  if(warp && !warp.querySelector(".huwabc-tempo-label")){warp.insertBefore(el("span","huwabc-tempo-label","Tempo"),warp.firstChild);}
}
function select(options,value){
  var s=el("select","huwabc-select");
  options.forEach(function(o){var op=el("option","",o);op.value=o;s.appendChild(op);});
  s.value=value;if(!s.value && value) {var v=el("option","",value);v.value=value;s.appendChild(v);s.value=value;}
  return s;
}
function inputField(label,value,opts,callback){
  var holder=el("label","huwabc-field");holder.appendChild(el("span","",label));
  var box;
  if(opts && opts.options)box=select(opts.options,value);
  else{box=el("input","huwabc-input");box.type=(opts&&opts.type)||"text";box.value=value||"";}
  box.addEventListener("change",function(){callback(box.value);});
  holder.appendChild(box);
  return {holder:holder,control:box};
}
function ABCWidget(parseTreeNode,options){this.initialise(parseTreeNode,options);}
ABCWidget.prototype=new Widget();
ABCWidget.prototype.execute=function(){
 this.title=this.getAttribute("tiddler",this.getVariable("currentTiddler"));
 var self=this,t=this.wiki.getTiddler(this.title);this._viewAttributes={};this._viewError=null;
 ['view','from','start','count','to','end','bars','audio','show-title','embedded','voice','measures','chords','chord-voice','swing','mixer'].forEach(function(key){self._viewAttributes[key]=self.getAttribute(key,'');});
 try{this._scoreView=ScoreView.resolve(this._viewAttributes,t?t.fields:{});}catch(error){this._viewError=error;this._scoreView={minimal:true};}
 var current=this.getVariable('currentTiddler',''),story=this.getVariable('storyTiddler',''),explicit=this._viewAttributes.view;
 // The normal tiddler reader owns the view switch. Transclusions and explicit
 // example widgets keep their requested presentation without extra controls.
 this._standaloneView=!!(t&&!t.fields['draft.of']&&!this._viewError&&!this._scoreView.range&&!this._scoreView.embedded&&
  (!explicit||explicit==='auto')&&this.getAttribute('preview','')!=='yes'&&this.title===current&&(!story||story===this.title));
 // The standalone reader has two modes. Previously saved notation-only views
 // remain compact, now with the same Play button as the minimal reader.
 if(this._standaloneView){
  this._scoreView.audio=true;
  // A complete score keeps its musical title in both full and minimal views.
  // Inline article examples retain the existing show-title default (no),
  // and explicit show-title="no" must still be respected everywhere.
  if(!this._viewAttributes['show-title'])this._scoreView.showTitle=true;
 }
};
ABCWidget.prototype.onDestroy=function(){if(this._reader){this._reader.destroy();this._reader=null;}if(this._floatingMixer){this._floatingMixer.destroy();this._floatingMixer=null;}if(this._instrumentViewControls){this._instrumentViewControls.destroy();this._instrumentViewControls=null;}if(this._pianoFollow){this._pianoFollow.destroy();this._pianoFollow=null;}if(this._pager){this._pager.destroy();this._pager=null;}this._refreshMusic=null;this._syncTempo=null;if(this._viewState){this._viewState.destroy();this._viewState=null;}if(this._minimalPlayer){this._minimalPlayer.destroy();this._minimalPlayer=null;}if(this._localeObserver){this._localeObserver.destroy();this._localeObserver=null;}if(this._accompControls){this._accompControls.destroy();this._accompControls=null;}if(this._unbindShortcut){this._unbindShortcut();this._unbindShortcut=null;}if(this._floatingPiano){this._floatingPiano.destroy();this._floatingPiano=null;}this._renderToken++;if(this._audioController){this._audioController._disposed=true;playback.unregister(this._audioController);this._audioController.destroy();this._audioController=null;}};
ABCWidget.prototype.render=function(parent,nextSibling){
  if(this._audioController||this._minimalPlayer)this.onDestroy();
  this.parentDomNode=parent;this.computeAttributes();this.execute();
  // Native TiddlyWiki static exports use FakeDom. Emit a self-contained reader
  // instead of starting an asynchronous editor widget in the live document.
  if(this.document.isTiddlyWikiFakeDom||this.getVariable('tv-config-static')==='yes'){
    var exported=this.document.createElement('section');exported.setAttribute('class','huwabc-static-score');
    exported.innerHTML=this._viewError?'<p class="huwabc-error">'+$tw.utils.htmlEncode(this._viewError.message)+'</p>':publisher.frame(this.wiki,this.title,Object.assign({},this._viewAttributes,{view:this._scoreView.view,audio:this._scoreView.audio,'show-title':this._scoreView.showTitle}))+'<script>'+publisher.frameSupport()+'</'+'script>';
    parent.insertBefore(exported,nextSibling);this.domNodes.push(exported);return;
  }
  var host=el("section","huwabc-score"+(this._scoreView.minimal?" huwabc-minimal":"")+(this._standaloneView?" huwabc-standalone":" huwabc-example")+(this.wiki.getTiddler(this.title)&&this.wiki.getTiddler(this.title).fields["abc-font"]==="petaluma"?" huwabc-jazz-font":""));
  host.setAttribute("data-huwabc-title",this.title);
  parent.insertBefore(host,nextSibling);this.domNodes.push(host);
  this.host=host;this.editing=false;this.draft=null;this.chordStyle=null;this._mounted=true;this._audioController=null;this._unbindShortcut=null;this._renderToken=0;
  this._viewState=ViewState.mount(this,host);
  this.draw();
  this._viewState.bind();
  this._localeObserver=I18n.observe(host,this.wiki);
};
ABCWidget.prototype.draw=function(){
  var self=this,host=this.host;if(!host)return;
  if(this._reader){this._readerState=this._reader.snapshot();this._reader.destroy();this._reader=null;}
  if(this._pianoFollow){this._pianoFollow.destroy();this._pianoFollow=null;}if(this._pager){this._pager.destroy();this._pager=null;}
  var renderToken=++this._renderToken,tuneRevision=0;
  if(this._minimalPlayer){this._minimalPlayer.destroy();this._minimalPlayer=null;}
  if(this._instrumentViewControls){this._instrumentViewControls.destroy();this._instrumentViewControls=null;}
  this._minimalControlsHost=null;
  this._updateMixer=null;this._refreshMusic=null;
  if(this._unbindShortcut){this._unbindShortcut();this._unbindShortcut=null;}
  // Old sound is stopped when the entire widget really needs to be reconstructed.
  if(this._floatingPiano){this._floatingPiano.destroy();this._floatingPiano=null;}
  if(this._floatingMixer){this._floatingMixer.destroy();this._floatingMixer=null;}
  if(this._accompControls){this._accompControls.destroy();this._accompControls=null;}
  if(this._audioController){this._audioController._disposed=true;playback.unregister(this._audioController);try{this._audioController.destroy();}catch(_ignored){}this._audioController=null;}
  host.innerHTML="";
  var t=this.wiki.getTiddler(this.title),source=tools.getSource(this.wiki,this.title);
  this._renderFields=t?t.fields:{};
  if(this._viewError){host.appendChild(el('p','huwabc-error',this._viewError.message));return;}
  if(!t||!source){host.appendChild(el('p','huwabc-error','Ingen ABC-kilde fundet.'));return;}
  if(this._standaloneView)this.drawViewToggle();
  if(this._scoreView.minimal){this.drawMinimal(t,source,renderToken);return;}
  var top=el("div","huwabc-head");
  var branding=el("div","huwabc-head-label","HUWIKI · NODEARK");
  var actions=el("div","huwabc-actions");
  top.appendChild(branding);top.appendChild(actions);host.appendChild(top);
  var instrumentBar=el('div','huwabc-instrument-bar');host.appendChild(instrumentBar);
  var status=el("div","huwabc-status");
  var score=el("div","huwabc-paper");
  var audio=el("div","huwabc-audio");
  audio.setAttribute("role","region");audio.setAttribute("aria-label","Musikafspiller");
  var audioHeading=el("div","huwabc-audio-caption");
  audioHeading.appendChild(el("span","huwabc-audio-label","Afspiller"));
  audioHeading.appendChild(el("span","huwabc-audio-hint","Følg noderne, mens musikken spiller"));
  audio.appendChild(audioHeading);
  var viewPiano=null,pianoFollow=null,viewPianoHost=el("div","huwabc-piano-view-host");
  var audioControls=el("div","huwabc-audio-controls");
  audioControls.appendChild(el("span","huwabc-player-wait","Indlæser afspiller …"));
  audio.appendChild(audioControls);audioControls.appendChild(button("Stop",function(){playback.stopAll();},"huwabc-stop"));
  // Shared learning surface: just as on a public Site page, opened only on demand.
  var learn=el("div","huwabc-learn-panels");
  var pianoDetails=el("details","huwabc-learn-panel"),pianoSummary=el("summary","","♫  Klaviatur");
  var pianoHelp=el("div","huwabc-learn-hint","Vis meloditoner under afspilning, eller klik på en becifring i nodearket.");
  pianoDetails.setAttribute('data-huwabc-panel','piano');
  pianoDetails.appendChild(pianoSummary);pianoDetails.appendChild(pianoHelp);pianoDetails.appendChild(viewPianoHost);
  var abcDetails=el("details","huwabc-learn-panel");abcDetails.setAttribute("data-huwabc-panel","source");abcDetails.appendChild(el("summary","","ABC-kode · kopiér uden download"));
  var abcHelp=el("div","huwabc-learn-hint","Notationen er almindelig tekst, der kan kopieres ind i enhver ABC-editor.");abcDetails.appendChild(abcHelp);
  var abcText=el("textarea","huwabc-readable-abc");abcText.value=source;abcText.readOnly=true;abcText.spellcheck=false;abcText.rows=10;abcText.setAttribute("aria-label","ABC-notation til kopiering");abcDetails.appendChild(abcText);
  var abcActions=el("div","huwabc-abc-actions");abcActions.appendChild(button("Kopiér ABC",function(){self.dispatchEvent({type:"tm-copy-to-clipboard",param:abcText.value});showStatus("ABC-koden er sendt til udklipsholderen.");},"huwabc-primary"));
  abcDetails.appendChild(abcActions);learn.appendChild(pianoDetails);learn.appendChild(abcDetails);
  function ensurePiano(){
    if(!viewPiano){viewPiano=piano.mountKeyboard(viewPianoHost,{isView:true,startOctave:4,showNames:false,lang:'auto',wiki:self.wiki,onKey:function(midi){auditionNotes([midi]).catch(function(e){showStatus('Klavertone: '+e.message,true);});}});
      pianoFollow=PianoFollow.mount(viewPiano,{wiki:self.wiki,state:self._viewState,caption:pianoHelp});self._pianoFollow=pianoFollow;
      if(ABC)pianoFollow.setSource(ABC,working||source);if(controller&&controller.isLoaded)pianoFollow.ready(controller);
    }return viewPiano;
  }
  pianoDetails.open=!!(t&&t.fields['abc-layout']==='klaver');if(pianoDetails.open)ensurePiano();
  pianoDetails.addEventListener("toggle",function(){if(pianoDetails.open)ensurePiano();});
  var floatingPiano=FloatingPiano.create(pianoDetails,viewPianoHost);self._floatingPiano=floatingPiano;
  var followScroller=FloatingPiano.createScroller();
  score.addEventListener("click",function(event){
    var tab=event.target&&event.target.closest&&event.target.closest('[data-huwabc-tab-source]');
    if(tab){var tabStart=Number(tab.getAttribute('data-huwabc-tab-source')),tabMidi=Number(tab.getAttribute('data-huwabc-tab-midi'));cueStart(Number.isFinite(tabStart)?tabStart:null,tab,null);if(tab.hasAttribute('data-huwabc-tab-midi')&&Number.isFinite(tabMidi))auditionNotes([tabMidi]).catch(function(e){showStatus('Nodelyd: '+e.message,true);});return;}
    var target=event.target&&event.target.closest&&event.target.closest('.abcjs-chord');if(!target)return;
    var chord=chordKeys.parse(target.textContent);if(!chord){showStatus('Kan ikke vise denne akkord på klaviaturet.',true);return;}
    var chordConcertPitches=InstrumentView.soundingPitches(chord.pitches);
    pianoDetails.open=true;ensurePiano();pianoFollow.explain(chordConcertPitches,(I18n.language(self.wiki)==='da'?'Becifring: ':'Chord symbol: ')+chord.name);
    if(audio.classList.contains('huwabc-playing'))floatingPiano.show(target);
    var selectable=visual&&visual.findSelectableElement&&visual.findSelectableElement(target),chordElement=selectable&&selectable.element&&selectable.element.absEl&&selectable.element.absEl.abcelem;
    cueStart(chordElement&&chordElement.startChar,target,chordElement&&chordElement.currentTrackMilliseconds);
    auditionNotes(chordConcertPitches).catch(function(e){showStatus('Akkordlyd: '+e.message,true);});
  });
  if(!t || !source){status.textContent="Ingen ABC-kilde fundet i feltet abc-source. Brug importværkstedet til at oprette et nodeark.";host.appendChild(status);return;}
  var working=this.editing ? this.draft : source;
  function showStatus(msg,error){status.textContent=msg||"";status.className="huwabc-status"+(error?" huwabc-error":"");}
  var visual=null,ABC=null,controller=null,activeNotes=[],cursorLine=null,cueDataReady=false,fullMiniMixer=null;
  function ensureFullMiniMixer(){
    if(fullMiniMixer)return fullMiniMixer;
    if(!ABC||!accompControls)return null;
    fullMiniMixer=FloatingMixer.mount({ABC:ABC,source:working,host:host,wiki:self.wiki,title:self.title,
      initiallyVisible:!!self._standaloneView,sidebarMixer:!!self._standaloneView,
      getConfig:accompControls.config,getPlaying:function(){return !!(controller&&controller.isStarted);},
      onTogglePlayback:function(){var btn=audioControls.querySelector('.abcjs-midi-start');if(btn)btn.click();},
      onPreview:function(next){accompControls.setConfig(next,false);if(controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();},
      onChange:function(next){accompControls.setConfig(next,true);} });
    self._floatingMixer=fullMiniMixer;return fullMiniMixer;
  }
  var soundHelp=SoundHelp.mount(audio,{
    getEngineMode:function(){return self.wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto');},
    onEngine:function(mode){
      if(controller){controller.setEngineMode(mode);clearCue();}
      self.wiki.addTiddler(new $tw.Tiddler({title:'$:/config/huwiki/abc/audio-engine-mode',text:mode}));
    }
  });
  function auditionNotes(notes){
    if(!ABC)return Promise.resolve(false);
    if(controller&&controller.audition)return controller.audition(notes,visual);
    return Audition.play(ABC,notes,visual,{wiki:self.wiki,onStatus:soundHelp.update,isCancelled:function(){return renderToken!==self._renderToken||!host.isConnected;}});
  }
  var pendingStart=null,chosenNode=null;
  function clearCue(){
    if(chosenNode&&chosenNode.classList)chosenNode.classList.remove('huwabc-cue-selected');
    chosenNode=null;pendingStart=null;
  }
  function ensureCueData(){
    if(cueDataReady||!visual)return;
    // Populate pitches/timing on the displayed tune, without loading samples.
    // Normal view must work on its very first click, just like minimal view.
    if(typeof visual.setUpAudio==='function')visual.setUpAudio({chordsOff:true});
    cueDataReady=true;
  }
  function cueStart(sourceChar,target,milliseconds){
    if(!visual||!ABC)return;
    ensureCueData();
    var pos=startPosition.find(visual,sourceChar,target,milliseconds);
    if(!pos)return;
    if(self._pager&&target)self._pager.select(target);
    if(chosenNode&&chosenNode.classList)chosenNode.classList.remove('huwabc-cue-selected');
    chosenNode=target&&target.closest&&(target.closest('.abcjs-note,.abcjs-chord')||target);
    if(chosenNode&&chosenNode.classList)chosenNode.classList.add('huwabc-cue-selected');
    pendingStart=pos.milliseconds;
    // A selection made during playback becomes the next play position.
    // Auditioning this selected note/chord is a separate, short sound.
    if(controller&&(controller.isStarted||controller.isLoading||audio.classList.contains('huwabc-playing'))){
      try{controller.pause();}catch(_ignored){}
      audio.classList.remove('huwabc-playing');if(self._accompControls)self._accompControls.stopDrone();clearFollow(false);
    }
  }
  function useCue(){
    if(pendingStart===null)return;
    // Run just before playback actually starts, after ABCJS has loaded the tune.
    if(startPosition.seek(controller,visual,pendingStart)){
      pendingStart=null;
      if(chosenNode&&chosenNode.classList)chosenNode.classList.remove('huwabc-cue-selected');
      chosenNode=null;
    }
  }
  function clearFollow(complete){
    if(complete&&viewPiano){viewPiano.clear();if(pianoFollow)pianoFollow.clear();}
    if(complete){floatingPiano.hide();followScroller.reset();}
    activeNotes.forEach(function(e){try{e.classList.remove("huwabc-playing-note");}catch(_ignored){}});
    activeNotes=[];
    if(cursorLine&&cursorLine.parentNode)cursorLine.parentNode.removeChild(cursorLine);
    cursorLine=null;
  }
  var cursorControl={
    lineEndAnticipation:550,
    onReady:function(){if(pianoFollow){pianoFollow.setSource(ABC,working);pianoFollow.ready(controller);}},
    onBeat:function(beat,total,time){if(pianoFollow&&controller&&controller.isStarted&&total>0)pianoFollow.at(beat/total*time);},
    onStart:function(){if(fullMiniMixer)fullMiniMixer.updatePlayback(true);if(self._pager)self._pager.setPlaying(true);followScroller.reset();playback.start(controller);if(self._accompControls)self._accompControls.startDrone();audio.classList.add("huwabc-playing");},
    onFinished:function(){if(fullMiniMixer)fullMiniMixer.updatePlayback(false);if(self._pager)self._pager.setPlaying(false);audio.classList.remove("huwabc-playing");if(self._accompControls)self._accompControls.stopDrone();clearFollow(true);},
    onEvent:function(evt){
      if(renderToken!==self._renderToken || !evt)return;
      if(self._pager)self._pager.onEvent(evt);
      if(fullMiniMixer)fullMiniMixer.updateEvent(evt);
      clearFollow(false);
      // MIDI pitch data from ABCJS is authoritative, also for simultaneous tones.
      var pitches=(evt.midiPitches||[]).map(function(x){return typeof x==='number'?x:x&&x.pitch;}).filter(function(x){return typeof x==='number'&&Number.isFinite(x);});
      if(pianoFollow)pianoFollow.at(evt.milliseconds);
      var elements=evt.elements||[];
      elements.forEach(function(e){
        if(Array.isArray(e))e.forEach(function(n){if(n&&n.classList){n.classList.add("huwabc-playing-note");activeNotes.push(n);}});
        else if(e&&e.classList){e.classList.add("huwabc-playing-note");activeNotes.push(e);}
      });
      // Draw from the visible DOM, including compact tabs and transformed staves.
      var visible=activeNotes.filter(function(n){return n.getBoundingClientRect().height>0;});
      if(!visible.length&&evt.startChar!==null)visible=Array.from(score.querySelectorAll('[data-huwabc-tab-source="'+evt.startChar+'"]')).filter(function(n){return n.getBoundingClientRect().height>0;});
      visible.forEach(function(n){n.classList.add('huwabc-playing-note');if(activeNotes.indexOf(n)<0)activeNotes.push(n);});
      var note=visible[0],svg=note&&note.ownerSVGElement;
      if(svg){
        var rect=note.getBoundingClientRect(),staff=note.closest('.huwabc-tabs-only,.abcjs-staff-wrapper'),staffRect=staff?staff.getBoundingClientRect():rect,ctm=svg.getScreenCTM();
        if(ctm){var a=svg.createSVGPoint(),b=svg.createSVGPoint();a.x=b.x=rect.left-5;a.y=staffRect.top-8;b.y=staffRect.bottom+8;a=a.matrixTransform(ctm.inverse());b=b.matrixTransform(ctm.inverse());
          cursorLine=document.createElementNS('http://www.w3.org/2000/svg','line');cursorLine.setAttribute('class','huwabc-follow-line');cursorLine.setAttribute('x1',a.x);cursorLine.setAttribute('x2',b.x);cursorLine.setAttribute('y1',a.y);cursorLine.setAttribute('y2',b.y);svg.appendChild(cursorLine);
        }
      }
      var node=visible[0];
      if(node&&pianoDetails.open&&pitches.length&&(!self._pager||!self._pager.isDesk()))floatingPiano.show(node);
      // Scroll once per staff line, without moving ancestor panels or reversing the scroll.
      if(node&&!self._pager)followScroller.follow(node);
    },
    onLineEnd:function(){/* Scrolling is handled only when the next event leaves the visible viewport. */}
  };
  function activeSoundfont(){return self.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim();}
  function attachTune(tune){
    if(!controller || !tune || renderToken!==self._renderToken)return;
    var revision=++tuneRevision;cueDataReady=false;
    // Cancel pending preparation as well as current playback, without removing
    // controls, score SVGs, focus or opened panels.
    playback.stopOne(controller);controller.visualObj=null;clearFollow(true);
    try{
      clearCue();controller.disable(true);
      var arranged=accompaniment.prepare(ABC,tune,working,accompControls.config(),true,t.fields);
      if(arranged.message)showStatus(arranged.message,true);
      if(accompControls&&accompControls.setForm)accompControls.setForm(arranged.form);
      controller.setTune(tune,false,{soundFontUrl:activeSoundfont(),swing:ScoreView.swingValue(t.fields,self._viewAttributes.swing)}).then(function(){
        if(renderToken!==self._renderToken||revision!==tuneRevision)return;
        if(self._syncTempo)self._syncTempo();
        labelPlayerControls(audioControls);
        audio.classList.remove("huwabc-audio-loading");
      }).catch(function(e){if(renderToken===self._renderToken&&revision===tuneRevision&&e.name!=="AbortError")showStatus("Lyd kunne ikke indlæses: "+e.message,true);});
    }catch(e){showStatus("Afspillerfejl: "+e.message,true);}
  }
  var quickSettings=el("div","huwabc-quick-settings");
  var settingsPanel=el("details","huwabc-settings-panel");settingsPanel.setAttribute("data-huwabc-panel","settings");settingsPanel.appendChild(el("summary","","Nodeopsætning · TAB, takter og sider"));
  var settingsBody=el("div","huwabc-settings-body");settingsPanel.appendChild(settingsBody);
  var transposeControls=transpose.mount(quickSettings,function(){return ABC;},function(){return working;},function(next){var current=self.wiki.getTiddler(self.title);if(current)self.wiki.addTiddler(new $tw.Tiddler(current,{'abc-source':next,'abc-key':tools.header(next,'K'),'abc-before-transpose':working}));});
  var undoTranspose=button('Fortryd seneste transponering',function(){var current=self.wiki.getTiddler(self.title),previous=current&&current.fields['abc-before-transpose'];if(previous)self.wiki.addTiddler(new $tw.Tiddler(current,{'abc-source':previous,'abc-key':tools.header(previous,'K'),'abc-before-transpose':undefined}));});undoTranspose.hidden=!t.fields['abc-before-transpose'];quickSettings.appendChild(undoTranspose);
  var tabControls=tabs.mount(settingsBody,t?t.fields:{},function(fields,opened){self._tabsOpen=opened;var current=self.wiki.getTiddler(self.title);if(current)self.wiki.addTiddler(new $tw.Tiddler(current,fields));},self._tabsOpen);
  var sheetSettings=sheetLayout.mount(settingsBody,t.fields,function(fields){var current=self.wiki.getTiddler(self.title);self._sheetOpen=true;if(current)self.wiki.addTiddler(new $tw.Tiddler(current,fields));});sheetSettings.open=!!self._sheetOpen;
  function drawScore(text,into,printing){
    if(!ABC)return;
    try{
      cueDataReady=false;
      var layout=(t.fields["abc-layout"]||"standard");
      var chordStyle=self.chordStyle || t.fields["abc-chords-style"] || self.wiki.getTiddlerText("$:/config/huwiki/abc/chords-style","jazz").trim() || "jazz";
      var jazzChords=chordStyle!=="standard";
      var displayed=Display.presentation(text);
      if(!self.editing&&self.getAttribute('preview')!=='yes')displayed=I18n.localizedSource(displayed,t.fields,I18n.language(self.wiki));
      var tabOptions=tabs.options(ABC,displayed,tabControls.enabled(),tabControls.config());
      tabControls.availability(tabOptions.options.length>0);
      var useJazz=self.wiki.getTiddler(self.title).fields['abc-font']==='petaluma';var result=jazzFont.render(ABC,useJazz,function(){return ABC.renderAbc(into,displayed,TransposedLayout.options(ABC,host,displayed,Object.assign({visualTranspose:InstrumentView.current().semitones,tablature:tabOptions.options,clickListener:function(abcElem,tuneNo,classes,analysis,drag,event){
          if(event&&event.target&&event.target.closest&&event.target.closest('.abcjs-chord,[data-huwabc-tab-source]'))return;
          if(!abcElem)return;
          ensureCueData();
          if(!abcElem.midiPitches||!abcElem.midiPitches.length)return;
          var pitches=abcElem.midiPitches.map(function(n){return n.pitch;}).filter(Number.isFinite);
          if(pitches.length){pianoDetails.open=true;ensurePiano();pianoFollow.explain(pitches,I18n.language(self.wiki)==='da'?'Valgte toner':'Selected notes');if(audio.classList.contains('huwabc-playing'))floatingPiano.show(analysis&&analysis.selectableElement||event&&event.target);}
          cueStart(abcElem.startChar,analysis&&analysis.selectableElement||event&&event.target,abcElem.currentTrackMilliseconds);
          auditionNotes(abcElem.midiPitches).catch(function(e){showStatus('Nodelyd: '+e.message,true);});
         },afterParsing:function(tune){sheetLayout.prepare(tune,self.wiki.getTiddler(self.title).fields,displayed);tune.formatting.staffsep=tabControls.config().rhythm?145:90;if(tabControls.config().rhythm)tune.formatting.sysstaffsep=120;tabs.notation.project(ABC,tune,tabControls.config(),tabControls.notationActive());if(tabOptions.options.length)tune.tablatures=ABC.parseOnly(displayed,{tablature:tabOptions.options})[0].tablatures;},responsive:"resize",staffwidth:720,scale:layout==="kompakt"?0.88:1,jazzchords:jazzChords,format:jazzFont.formatFonts(useJazz,{stretchlast:true,gchordfont:useJazz?"PetalumaScript 20":jazzChords?"Helvetica 18 bold":"Helvetica 16"}),add_classes:true,oneSvgPerLine:true,expandToWidest:true,wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:layout==="jazz"?4:3}},sheetLayout.options(ABC,displayed,self.wiki.getTiddler(self.title).fields))));});
      if(!result || !result.length){showStatus("Kunne ikke danne noder. Kontrollér ABC-teksten.",true);return null;}
      var tabWarning=tabOptions.options.length?tabs.finish(result[0],tabControls.config()):'';
      if(tabOptions.options.length&&!tabControls.showNotes())tabs.only(into,result[0]);if(tabOptions.options.length)tabs.rhythm(into,result[0],tabControls.config());
      if(into===score&&self._pager){self._pager.layout(result[0],self.wiki.getTiddler(self.title).fields);if(self._reader)self._reader.update();}
      var warnings=result[0]&&result[0].warnings;
      if(warnings&&warnings.length)showStatus("ABCJS: "+warnings.slice(0,2).join(" · "),true);
      else showStatus(tabOptions.message||tabWarning);
      return result[0];
    } catch(ex){showStatus("Nodefejl: "+ex.message,true);into.textContent="";return null;}
  }
  function refreshVisual(text,into){
    if(ABC){clearCue();clearFollow();abcText.value=text;visual=drawScore(text,into);if(visual)attachTune(visual);}
  }
  // TiddlyWiki's normal draft editor remains the only source of editable data.
  // A short-lived temp tiddler chooses where the editor should put focus.
  function openEditor(focus){
    if(self.getAttribute("preview")==="yes")return false;
    self.wiki.addTiddler(new $tw.Tiddler({title:"$:/temp/huwiki/abc/edit-focus",text:JSON.stringify(Object.assign({title:self.title,focus:focus,originState:self._viewState&&self._viewState.key},self._pager?self._pager.anchor():{}))}));
    self.dispatchEvent({type:"tm-edit-tiddler",param:self.title,tiddlerTitle:self.title});
    return true;
  }
  if(this.getAttribute("preview")!=="yes")actions.appendChild(button("Redigér noder",function(){openEditor("notes");},"huwabc-primary"));
  actions.appendChild(button("PDF / Udskriv",function(){
    if(!score.querySelector("svg")){showStatus("Der er endnu ingen noder at udskrive.",true);return;}
    if(!self._pager||!self._pager.openPrintPreview(jazzFont.css(),InstrumentView.printLabel(self.wiki)))
      showStatus("Der er endnu ingen noder at udskrive.",true);
  }));
  actions.appendChild(button("MIDI",function(){
    if(!ABC||!ABC.synth||!ABC.synth.getMidiFile){showStatus("MIDI er ikke klar endnu.",true);return;}
    try{var midi=ABC.synth.getMidiFile(accompaniment.prepare(ABC,ABC.parseOnly(working)[0],working,accompControls.config(),false,t.fields).tune,{midiOutputType:"binary"});
      if(Array.isArray(midi))midi=midi[0];
      tools.download(midi,tools.fileName(tools.header(working,"T")||self.title)+".mid","audio/midi");
    }catch(e){showStatus("MIDI-eksport mislykkedes: "+e.message,true);}
  }));
  actions.appendChild(button("ABC",function(){tools.download(working,tools.fileName(tools.header(working,"T")||self.title)+".abc","text/vnd.abc;charset=utf-8");}));
  actions.appendChild(button("Site-afspiller",function(){try{
    var hosted=self.wiki.getTiddlerText('$:/Wiki/CurrentWikiId','')&&window.google&&window.google.script&&window.google.script.run;
    if(hosted){
      // Publication uses the saved tiddler. Do not send editor state, prose or
      // private wiki settings through the toolbar event.
      var handled=self.dispatchEvent({type:'tm-huwiki-abc-site-player',paramObject:{title:self.title}});
      if(handled!==false)showStatus(I18n.language(self.wiki)==='da'?'Sitebyggeren er ikke klar. Genindlæs HUWiki.':'The Site builder is not ready. Reload HUWiki.',true);
      return;
    }
    var previewSource=working,previewFields=self.wiki.getTiddler(self.title).fields,previewTitle=tools.header(working,"T")||self.title;
    var initialHeading=self.wiki.getTiddlerText('$:/config/huwiki/abc/site-heading','TiddlyWiki Musik Edition');
    var initialChoices={siteHeading:initialHeading,showSiteHeading:true};
    function buildPreview(choices){return publisher.build(self.wiki,previewSource,previewFields,previewTitle,{baseUrl:document.baseURI,preview:true,siteHeading:choices.siteHeading,showSiteHeading:choices.showSiteHeading});}
    function buildDownload(choices){return publisher.build(self.wiki,previewSource,previewFields,previewTitle,{siteHeading:choices.siteHeading,showSiteHeading:choices.showSiteHeading});}
    siteShare.previewHtml(buildPreview(initialChoices),tools.fileName(previewTitle)+'-site.html',showStatus,tools.download,{language:I18n.language(self.wiki),siteHeading:initialHeading,showSiteHeading:true,previewHtml:buildPreview,downloadHtml:buildDownload});
  }catch(e){showStatus((I18n.language(self.wiki)==='da'?'Site-afspiller: ':'Site player: ')+e.message,true);}},"huwabc-site-export"));
  // Player is a permanent part of the music sheet – no separate tab or "Lyt" button.
  host.appendChild(score);host.appendChild(audio);host.appendChild(quickSettings);host.appendChild(settingsPanel);host.appendChild(learn);
  self._pager=PageView.mount(score,{wiki:self.wiki,state:self._viewState,title:self.title,audio:true,transport:function(){return audioControls;},onDesk:function(){floatingPiano.hide();},
    onMixer:function(anchor){var mini=ensureFullMiniMixer();if(mini)mini.show({anchor:anchor,floating:true});}});
  // One shared musician view for stand-alone ABC scores and embedded notation.
  // Switching it changes only CSS/controls; it never recreates the score or player.
  self._reader=ReaderMode.mount({host:host,paper:score,actions:actions,title:self.title,
    pager:function(){return self._pager;},state:self._readerState,
    onEdit:this.getAttribute("preview")==="yes"?null:function(){return openEditor("notes");}});
  self._instrumentViewControls=InstrumentView.mount(instrumentBar,{wiki:self.wiki,onChange:function(){
   if(!ABC)return;
   var restore=ViewportAnchor.capture(score,visual,host);
   clearCue();clearFollow(true);
   try{visual=drawScore(working,score);if(visual)attachTune(visual);}
   finally{restore(visual);}
  }});
  var accompControls=accompaniment.mount(audio,t.fields,function(fields,opened,meta){self._accompOpen=opened;if(meta.view)self._accompView=meta.view;if(meta.live&&controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();var current=self.wiki.getTiddler(self.title);if(current)self.wiki.addTiddler(new $tw.Tiddler(current,fields));},self._accompOpen,self._accompView,function(){if(controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();});
  self._accompControls=accompControls;audio.insertBefore(accompControls.element,audioControls.nextSibling);
  var swingMixer=accompControls.element.querySelector('.huwabc-mixer'),swingSlider=null,swingOutput=null;
  if(swingMixer){
    var swingWrap=el('label','huwabc-swing-setting'),swingHeading=el('span','huwabc-swing-heading','Swing');
    swingOutput=el('output','huwabc-swing-value');swingHeading.appendChild(swingOutput);
    swingSlider=el('input','huwabc-swing-slider');swingSlider.type='range';
    swingSlider.min='50';swingSlider.max='75';swingSlider.step='1';
    swingSlider.setAttribute('aria-label','Swing · 50 = lige ottendedele, 66 = trioliseret');
    swingWrap.appendChild(swingHeading);swingWrap.appendChild(swingSlider);
    var swingHost=accompControls.element.querySelector('.huwabc-accomp-channels-grid')||swingMixer;
    swingHost.insertBefore(swingWrap,swingHost.firstChild);
    var syncSwing=function(fields){
      if(!swingSlider)return;
      var value=ScoreView.swingValue(fields,self._viewAttributes.swing);
      // Preserve the thumb while the user is dragging; save only on release.
      if(document.activeElement!==swingSlider)swingSlider.value=String(value);
      swingOutput.textContent=swingSlider.value+' %';
    };
    swingSlider.addEventListener('input',function(){swingOutput.textContent=swingSlider.value+' %';});
    swingSlider.addEventListener('change',function(){
      var n=Number(swingSlider.value),current=self.wiki.getTiddler(self.title);
      if(current&&ScoreView.swingValue({},n)!==ScoreView.swingValue(current.fields,'')){
       self.wiki.addTiddler(new $tw.Tiddler(current,{'abc-swing':String(n)}));
      }
    });
    syncSwing(t.fields);
  }
  self._updateMixer=function(fields){accompControls.update(fields);if(fullMiniMixer)fullMiniMixer.update(accompControls.config(),working);if(controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();};
  self._refreshMusic=function(current,plan){
    t=current;var raw=tools.getSource(self.wiki,self.title);
    working=ABC&&!self.editing&&self._repertoireScore?self._repertoireScore(ABC,raw):raw;
    if(pianoFollow&&ABC)pianoFollow.setSource(ABC,working);if(abcText.value!==working)abcText.value=working;
    // These setters keep the actual inputs and their focus in the DOM.
    if(plan.source||plan.audio||plan.live)accompControls.update(t.fields);
    if(fullMiniMixer)fullMiniMixer.update(accompControls.config(),working);
    if(typeof syncSwing==='function'&&(plan.audio||plan.source))syncSwing(t.fields);
    if(plan.score||plan.controls){tabControls.update(t.fields);sheetSettings.update(t.fields);undoTranspose.hidden=!t.fields['abc-before-transpose'];}
    if(!ABC)return; // The initial load reads the latest source and fields.
    if(plan.score){
      var restore=ViewportAnchor.capture(score,visual,host);
      if(controller)playback.stopOne(controller);clearCue();clearFollow(true);
      try{visual=drawScore(working,score);transposeControls.sync();}finally{restore(visual);}
    }
    if(plan.pages&&!plan.score&&self._pager&&visual)self._pager.layout(visual,t.fields);
    if(plan.score||plan.audio){
      if(visual)attachTune(visual);
      else if(controller){controller.visualObj=null;controller.disable(true);}
    }
    else if(plan.live&&controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();
    if(plan.source&&self._viewState)self._viewState.bind();
  };
  host.appendChild(status);
  // Keyboard controls are invisible in the toolbar and work only outside form controls.
  // If several scores are open the shortcut manager uses the last active one.
  self._unbindShortcut=shortcuts.register(host,{
    Space:function(){
      var playButton=audioControls.querySelector(".abcjs-midi-start");
      if(!playButton){showStatus("Afspilleren indlæses stadig.");return true;}
      playButton.click();return true;
    },
    Home:function(){
      clearCue();if(controller){playback.stopOne(controller);audio.classList.remove("huwabc-playing");clearFollow(true);}
      return true;
    },
    PageDown:function(){return self._pager?self._pager.next():false;},
    PageUp:function(){return self._pager?self._pager.previous():false;},
    Stand:function(){if(!self._pager)return false;self._pager.setDesk(!self._pager.isDesk());return true;},
    N:function(){return openEditor("notes");},
    E:function(){return openEditor("code");},
    P:function(){pianoDetails.open=!pianoDetails.open;if(pianoDetails.open)ensurePiano();else floatingPiano.hide();return true;},
    Escape:function(){if(self._pager&&self._pager.isDesk()){self._pager.setDesk(false);return true;}clearCue();return true;}
  });
  var editor=null,textarea=null,preview=null,formInputs={};
  if(this.editing){
    editor=el("div","huwabc-editor");
    editor.appendChild(el("h3","","Nodeværksted"));
    editor.appendChild(el("p","huwabc-muted","Vælg musikalske oplysninger i menuerne. Selve melodien kan foreløbig skrives i ABC-feltet nedenunder."));
    var fields=el("div","huwabc-fields");
    var definitions=[
      ["Titel","T",null],
      ["Komponist","C",null],
      ["Toneart","K",["C","G","D","A","E","F","Bb","Eb","Am","Em","Dm","Gm","Bm","D dor","A mix","C perc"]],
      ["Taktart","M",["4/4","3/4","2/4","6/8","9/8","12/8","5/4","7/8","C","C|"]],
      ["Tempo (BPM)","Q",null]
    ];
    function updateRaw(){
      working=self.draft;
      textarea.value=working;
      for(var key in formInputs){formInputs[key].value=tools.header(working,key).replace(/^1\/4=/,"");}
      abcText.value=working;refreshVisual(working,score);
    }
    definitions.forEach(function(def){
      var code=def[1];var current=tools.header(working,code);
      if(code==="Q")current=current.replace(/^1\/4=/,"");
      var field=inputField(def[0],current,{options:def[2]},function(v){
        if(code==="Q"&&/^\d+$/.test(v))v="1/4="+v;
        self.draft=tools.putHeader(self.draft,code,v);updateRaw();
      });
      formInputs[code]=field.control;fields.appendChild(field.holder);
    });
    var chordChoices=inputField("Becifring",self.chordStyle==="standard"?"Almindelig":"Jazz",{options:["Jazz","Almindelig"]},function(choice){
      self.chordStyle=choice==="Almindelig"?"standard":"jazz";
      refreshVisual(self.draft,score);
    });
    fields.appendChild(chordChoices.holder);
    editor.appendChild(fields);
    var titleRow=el("div","huwabc-code-label");titleRow.appendChild(el("strong","","Musikalsk tekst (ABC)"));
    var hint=el("span","huwabc-muted","Indsæt toner og rytmer med knapperne, eller skriv direkte.");titleRow.appendChild(hint);editor.appendChild(titleRow);
    var tokens=el("div","huwabc-insert-tools");
    ["C","D","E","F","G","A","B","c","z","|","[", "]", "2","/2", "\"C\"", "\"G7\"", "w:"].forEach(function(token){
      tokens.appendChild(button(token,function(){
        var start=textarea.selectionStart,end=textarea.selectionEnd;
        self.draft=self.draft.slice(0,start)+token+self.draft.slice(end);
        updateRaw();textarea.focus();textarea.setSelectionRange(start+token.length,start+token.length);
      },"huwabc-token"));
    });editor.appendChild(tokens);
    textarea=el("textarea","huwabc-code");textarea.value=working;textarea.spellcheck=false;textarea.rows=9;
    var debounce=null;
    textarea.addEventListener("input",function(){self.draft=textarea.value;working=self.draft;
      if(debounce)clearTimeout(debounce);
      debounce=setTimeout(function(){refreshVisual(working,score);},300);
    });editor.appendChild(textarea);
    var foot=el("div","huwabc-editor-actions");
    foot.appendChild(button("Gem musik",function(){
      var old=self.wiki.getTiddler(self.title);if(!old)return;
      var newFields={"abc-source":self.draft,"abc-chords-style":self.chordStyle||"jazz","modified":new Date()};
      self.editing=false;
      self.wiki.addTiddler(new $tw.Tiddler(old,newFields));
      showStatus("Musikken er gemt.");
      self.draw();
    },"huwabc-primary"));
    foot.appendChild(button("Fortryd",function(){self.editing=false;self.draft=null;self.draw();}));
    editor.appendChild(foot);host.appendChild(editor);
  }
  showStatus("Indlæser nodebibliotek …");
  tools.load().then(function(lib){return jazzFont.ready(document).then(function(){return lib;});}).then(function(lib){
    if(!host.isConnected || renderToken!==self._renderToken)return;
    ABC=lib;
    var current=self.editing ? self.draft : tools.getSource(self.wiki,self.title);
    working=!self.editing&&self._repertoireScore?self._repertoireScore(ABC,current):current;
    abcText.value=working;
    if(pianoFollow)pianoFollow.setSource(ABC,working);
    transposeControls.sync();
    visual=drawScore(working,score);
    if(!ABC.synth || !ABC.synth.supportsAudio || !ABC.synth.supportsAudio()){
      audioControls.textContent="Lydafspilning er ikke tilgængelig i denne browser.";
      audio.classList.add("huwabc-player-unavailable");return;
    }
    try{
      audioControls.textContent="";
      controller=AudioController.install(new ABC.synth.SynthController(),ABC,{
        wiki:self.wiki,getConfig:accompControls.config,
        isCurrent:function(){return host.isConnected&&renderToken===self._renderToken;},
        beforePlay:useCue,onStatus:soundHelp.update,
        onError:function(error){soundHelp.error(error);showStatus('Lyd kunne ikke klargøres. Åbn Lydproblemer.',true);},
        onStop:function(paused){if(fullMiniMixer)fullMiniMixer.updatePlayback(false);if(self._pager)self._pager.setPlaying(false);audio.classList.remove('huwabc-playing');if(self._accompControls)self._accompControls.stopDrone();clearFollow(!paused);soundHelp.stopped(paused);}
      });
      self._audioController=controller;controller._huwabcStopDrone=function(){if(self._accompControls)self._accompControls.stopDrone();};playback.register(controller);
      controller.load(audioControls,cursorControl,{displayPlay:true,displayLoop:true,displayRestart:true,displayProgress:true,displayWarp:true});
      // Stop belongs to the stable transport row; tempo is a separate row.
      audioControls.querySelector(".abcjs-inline-audio").appendChild(button("Stop",function(){playback.stopAll();},"huwabc-stop"));
      labelPlayerControls(audioControls);repeatButton.mount(audioControls);
      var restart=audioControls.querySelector('.abcjs-midi-reset');
      if(restart)restart.addEventListener('click',function(){clearCue();if(self._accompControls)self._accompControls.stopDrone();},true);
      var keyHint=el('span','huwabc-transport-keyhint','Shift+Space · Afspil/pause');audioControls.appendChild(keyHint);
      var tempoPanel=el('div','huwabc-tempo-modes'),mode='live',practice=50;
      var liveButton=button('Live',function(){changeTempo('live');}),practiceButton=button('Øv',function(){changeTempo('practice');}),rates=select(['25','50','60','75','90'],50),tempoText=el('span','huwabc-tempo-status');
      rates.setAttribute('aria-label','Øvehastighed i procent');rates.addEventListener('change',function(){practice=Number(rates.value);changeTempo('practice');});
      function tempoSync(){if(visual)controller.currentTempo=Math.round(visual.getBeatsPerMeasure()/visual.millisecondsPerMeasure()*60000*(controller.warp||100)/100);liveButton.setAttribute('aria-pressed',String(mode==='live'));practiceButton.setAttribute('aria-pressed',String(mode==='practice'));tempoText.textContent=(mode==='live'?'Originaltempo':practice+' %')+(controller.currentTempo?' · '+Math.round(controller.currentTempo)+' BPM':'');}
      function changeTempo(next){mode=next;liveButton.disabled=practiceButton.disabled=rates.disabled=true;tempoSync();controller.setWarp(mode==='live'?100:practice).then(function(){tempoSync();}).catch(function(e){showStatus('Tempo kunne ikke ændres: '+e.message,true);}).finally(function(){liveButton.disabled=practiceButton.disabled=rates.disabled=false;});}
      tempoPanel.appendChild(liveButton);tempoPanel.appendChild(practiceButton);tempoPanel.appendChild(rates);tempoPanel.appendChild(tempoText);audioControls.appendChild(tempoPanel);self._syncTempo=tempoSync;tempoSync();
      if(visual)attachTune(visual);
      if(self._standaloneView)ensureFullMiniMixer();
    }catch(e){audioControls.textContent="Afspilleren kunne ikke startes.";showStatus("Afspillerfejl: "+e.message,true);}
  }).catch(function(e){if(host.isConnected&&renderToken===self._renderToken){audioControls.textContent="Nodebiblioteket kunne ikke indlæses.";showStatus(e.message,true);}});
};
// Keep the compact view reversible from the same place in the score frame.
ABCWidget.prototype.drawViewToggle=function(){
 var self=this,minimal=this._scoreView.minimal,row=el('div','huwabc-view-toggle-row');
 if(minimal){this._minimalControlsHost=el('div','huwabc-minimal-toolbar');row.appendChild(this._minimalControlsHost);}
 var control=button(minimal?'Normal visning':'Minimal visning',function(){
  var current=self.wiki.getTiddler(self.title);if(!current)return;
  var next=self._scoreView.minimal?'full':'minimal';
  if(self._audioController)playback.stopOne(self._audioController);
  if(self._minimalPlayer&&self._minimalPlayer.controller)playback.stopOne(self._minimalPlayer.controller);
  self._toggleFocusPending=true;
  self.wiki.addTiddler(new $tw.Tiddler(current,{'abc-view':next}));
 },'huwabc-view-toggle');
 control.setAttribute('title',minimal?'Vis alle værktøjer':'Vis kun noder og afspilning');
 control.setAttribute('aria-label',minimal?'Skift til normal visning':'Skift til minimal visning');
 row.appendChild(control);this.host.appendChild(row);
 if(this._toggleFocusPending){this._toggleFocusPending=false;try{control.focus({preventScroll:true});}catch(ignore){control.focus();}}
};
// A small example has its own light renderer, with the same audio engine.
ABCWidget.prototype.drawMinimal=function(tiddler,source,renderToken){
 var self=this,host=this.host,view=this._scoreView,minimalABC=null;
 self._refreshMusic=function(current,plan){
  if(!minimalABC||!self._minimalPlayer)return;
  var prepared=ScoreView.prepare(minimalABC,tools.getSource(self.wiki,self.title),current.fields,view);
  var displayed=I18n.localizedSource(prepared.source,prepared.fields,I18n.language(self.wiki));
  self._minimalPlayer.update(prepared.fields,displayed,plan);
 };
 if(!tiddler||!source){host.appendChild(el('p','huwabc-error','Ingen ABC-kilde fundet.'));return;}
 var body=el('div','huwabc-minimal-content');host.appendChild(body);
 var wait=el('span','huwabc-minimal-loading','Indlæser noder …');body.appendChild(wait);
 tools.load().then(function(ABC){return (tiddler.fields['abc-font']==='petaluma'?jazzFont.ready(document):Promise.resolve()).then(function(){return ABC;});}).then(function(ABC){
  if(!host.isConnected||renderToken!==self._renderToken)return;
  var current=self.wiki.getTiddler(self.title)||tiddler;
  minimalABC=ABC;var prepared=ScoreView.prepare(ABC,tools.getSource(self.wiki,self.title),current.fields,view);
  var displayed=I18n.localizedSource(prepared.source,prepared.fields,I18n.language(self.wiki));
  body.textContent='';
  self._minimalPlayer=MinimalPlayer.mount(body,{ABC:ABC,source:displayed,fields:prepared.fields,wiki:self.wiki,audio:view.audio,showTitle:view.showTitle,
   controlsHost:self._minimalControlsHost,shortcutHost:host,paged:self._standaloneView&&!view.range,state:self._viewState,follow:view.view==='follow'||view.view==='chords',followChordsOnly:view.view==='chords',followChords:view.chords,followChordVoice:view.chordVoice,followVoice:view.voice,followMeasures:view.measures,swing:self._viewAttributes.swing,
   sidebarMixer:self._standaloneView,mixerButton:self._standaloneView||view.mixer,mixerTitle:self.title,
   onMixerChange:function(next){var saved=self.wiki.getTiddler(self.title);if(saved)self.wiki.addTiddler(new $tw.Tiddler(saved,{'abc-accompaniment':JSON.stringify(accompaniment.clean(next))}));},
   isCurrent:function(){return host.isConnected&&renderToken===self._renderToken;}});
  self._updateMixer=function(fields){if(self._minimalPlayer)self._minimalPlayer.updateConfig(Object.assign(accompaniment.read(fields),view.range?{repeatCounts:{}}:{}));};
  self._refreshMusic=function(current,plan){
    if(!self._minimalPlayer)return;
    if(plan.source||plan.score||plan.controls){self.refreshSelf();return;}
    if(plan.audio){
      // Rebuild audio without touching the existing SVG or its follow camera.
      var source=tools.getSource(self.wiki,self.title);
      self._minimalPlayer.update(current.fields,I18n.localizedSource(source,current.fields,I18n.language(self.wiki)),{audio:true});
    }else if(plan.live){self._minimalPlayer.updateConfig(accompaniment.read(current.fields));}
  };
  if(prepared.excerpt){host.setAttribute('data-huwabc-from',prepared.excerpt.start);host.setAttribute('data-huwabc-count',prepared.excerpt.count);}
 }).catch(function(error){if(host.isConnected&&renderToken===self._renderToken){body.textContent='';body.appendChild(el('p','huwabc-error',error.message));}});
};
ABCWidget.prototype.refresh=function(changes){
  var attrs=this.computeAttributes(),attributeChanged=Object.keys(attrs).length>0;
  if(this._viewState)this._viewState.refresh(changes);
  if(attributeChanged||changes['$:/language']){this.refreshSelf();return true;}
  var current=this.wiki.getTiddler(this.title),before=this._renderFields;
  var soundfont=!!(changes['$:/config/huwiki/abc/soundfont']||changes['$:/config/huwiki/abc/reserve-base']);
  var chordDefault=!!changes['$:/config/huwiki/abc/chords-style'];
  if(!changes[this.title]&&!soundfont&&!chordDefault)return false;
  if(!current||!before||!RefreshPolicy.source(current.fields)||!RefreshPolicy.source(before)||this._viewError){this.refreshSelf();return true;}
  // A saved view change is structural only when it changes this instance.
  var resolved;
  try{resolved=ScoreView.resolve(this._viewAttributes,current.fields);if(this._standaloneView){resolved.audio=true;if(!this._viewAttributes['show-title'])resolved.showTitle=true;}}
  catch(error){this.refreshSelf();return true;}
  if(JSON.stringify(resolved)!==JSON.stringify(this._scoreView)){this.refreshSelf();return true;}
  var plan=RefreshPolicy.plan(before,current.fields);
  if(soundfont)plan.audio=true;
  if(chordDefault&&!current.fields['abc-chords-style'])plan.score=true;
  this._renderFields=current.fields;
  if(this._refreshMusic)this._refreshMusic(current,plan);
  return !!(plan.score||plan.audio||plan.live||plan.controls||plan.pages);
};
exports["huwiki-abc"]=ABCWidget;
})();
