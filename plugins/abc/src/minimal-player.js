/*\
title: $:/plugins/huwiki/abc/minimal-player.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var ScoreView=require('$:/plugins/huwiki/abc/score-view.js');
var PageView=require('$:/plugins/huwiki/abc/page-view.js');
var ViewportAnchor=require('$:/plugins/huwiki/abc/viewport-anchor.js');
var AudioController=require('$:/plugins/huwiki/abc/audio-controller.js');
var Playback=require('$:/plugins/huwiki/abc/playback.js');
var Accompaniment=require('$:/plugins/huwiki/abc/accompaniment.js');
var Tabs=require('$:/plugins/huwiki/abc/tabs.js');
var JazzFont=require('$:/plugins/huwiki/abc/jazz-font.js');
var SheetLayout=require('$:/plugins/huwiki/abc/sheet-layout.js');
var Display=require('$:/plugins/huwiki/abc/display-source.js');
var InstrumentView=require('$:/plugins/huwiki/abc/instrument-view.js');
var Shortcuts=require('$:/plugins/huwiki/abc/keyboard-shortcuts.js');
var StartPosition=require('$:/plugins/huwiki/abc/start-position.js');
var ChordKeys=require('$:/plugins/huwiki/abc/chord-keys.js');
var FollowViewport=require('$:/plugins/huwiki/abc/follow-viewport.js');
var FloatingMixer=require('$:/plugins/huwiki/abc/floating-mixer.js');

// One small renderer is shared by live transclusions and exported examples.
// It creates only the controls it needs; a full editor/player is never mounted.
exports.mount=function(host,options){
 options=options||{};
 var ABC=options.ABC,fields=options.fields||{},source=String(options.source||'');
 if(!host||!ABC)throw new Error('Nodebiblioteket er ikke klar.');
 var doc=host.ownerDocument||document,closed=false,controller=null,visual=null;
 var config=options.config?Accompaniment.clean(options.config):Accompaniment.read(fields);
 var activeNotes=[],cursorLine=null,detachObserver=null,locale=null,controlsLocale=null,playButton=null,unbindShortcuts=null;
 var pendingStart=null,chosenNode=null,cueDataReady=false,updateRevision=0,renderPending=false;
 var viewport=null,miniMixer=null,mixerButton=null;
 var drone=options.audio===false?null:Accompaniment.createDrone(function(){return config;},function(){return source;});
 function make(tag,cls,text){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
 function alive(){return !closed&&host.isConnected!==false&&(!options.isCurrent||options.isCurrent());}
 function text(value){return I18n.translate(value,I18n.language(options.wiki));}
 var box=make('section','huwabc-minimal-player');
 // Normal mode is a compact notation/player view; Advanced owns instrument/print controls.
 var paper=make('div','huwabc-paper huwabc-minimal-paper');
 if(options.follow){box.classList.add('huwabc-follow-player');if(options.showTitle)box.classList.add('huwabc-follow-with-title');viewport=FollowViewport.mount(paper,{voice:options.followVoice||1,measures:options.followMeasures||3,zoom:1.2,chords:options.followChords||'below',chordVoice:options.followChordVoice||0,chordsOnly:!!options.followChordsOnly,showTitle:options.showTitle});if(options.followChordsOnly)box.classList.add('huwabc-follow-chords-only');}
 var controls=options.audio===false?null:make('div','huwabc-minimal-controls');
 var externalControls=!!(controls&&options.controlsHost),shortcutHost=options.shortcutHost||box;
 var status=make('div','huwabc-minimal-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
 if(controls)(externalControls?options.controlsHost:box).appendChild(controls);
 box.appendChild(paper);box.appendChild(status);host.appendChild(box);
 if(options.follow&&controls&&controls.parentNode===box)box.insertBefore(paper,controls);
 var pager=options.paged?PageView.mount(paper,{wiki:options.wiki,state:options.state,title:fields.title||"",audio:options.audio!==false,transport:function(){return controls;},
  onMixer:function(anchor){if(options.audio===false)return;ensureMiniMixer().show({anchor:anchor,floating:true});}}):null;
 function show(message,error){
  if(!alive())return;
  status.textContent=message?text(message):'';status.hidden=!message;
  status.classList.toggle('huwabc-error',!!error);
 }
 function clearFollow(){
  activeNotes.forEach(function(node){if(node&&node.classList)node.classList.remove('huwabc-playing-note');});activeNotes=[];
  if(cursorLine&&cursorLine.parentNode)cursorLine.parentNode.removeChild(cursorLine);cursorLine=null;
 }
 function playing(value){
  if(pager)pager.setPlaying(value);
  if(miniMixer)miniMixer.updatePlayback(value);
  box.classList.toggle('huwabc-playing',!!value);
  if(playButton){playButton.setAttribute('aria-label',text(value?'Pause':'Afspil'));playButton.setAttribute('title',text(value?'Pause':'Afspil')+' · Shift+Space');playButton.setAttribute('aria-keyshortcuts','Space Shift+Space');}
 }
 function stopDrone(){if(drone)drone.stop();}
 function clearCue(){
  if(chosenNode&&chosenNode.classList)chosenNode.classList.remove('huwabc-cue-selected');
  pendingStart=null;chosenNode=null;
 }
 function ensureCueData(){
  if(cueDataReady||!visual)return;
  // Rendering alone does not populate MIDI pitches. Stamp the displayed tune
  // with the shared arrangement before the first click, without loading audio.
  if(typeof visual.setUpAudio==='function')visual.setUpAudio({chordsOff:true});
  cueDataReady=true;
 }
 function cueStart(sourceChar,target,milliseconds){
  if(renderPending||!alive()||!controller||!visual)return false;
  ensureCueData();
  var position=StartPosition.find(visual,sourceChar,target,milliseconds);if(!position)return false;
  // Cancel an in-flight Play as well as currently sounding playback. A click
  // selects and auditions; it must not leave a pending automatic start behind.
  if(controller.isStarted||controller.isLoading||box.classList.contains('huwabc-playing')){
   try{controller.pause();}catch(ignore){}
   playing(false);stopDrone();clearFollow();
  }
  clearCue();if(pager&&target)pager.select(target);
  chosenNode=target&&target.closest?(target.closest('.abcjs-note,.abcjs-chord,[data-huwabc-tab-source]')||target):target;
  if(chosenNode&&chosenNode.classList)chosenNode.classList.add('huwabc-cue-selected');
  pendingStart=position.milliseconds;return true;
 }
 function useCue(){
  if(pendingStart===null)return;
  // AudioController.go rebuilds timing and resets progress. Seek only after
  // preparation, immediately before playback, just like the normal reader.
  if(StartPosition.seek(controller,visual,pendingStart))clearCue();
 }
 function audition(notes,label){
  if(renderPending||!alive()||!controller||typeof controller.audition!=='function'||!notes||!notes.length)return;
  Promise.resolve().then(function(){if(!alive())return;return controller.audition(notes,visual);}).catch(function(error){
   if(alive()&&(!error||error.name!=='AbortError'))show(label+' '+(error&&error.message||String(error)),true);
  });
 }
 function noteClicked(element,tuneNo,classes,analysis,drag,event){
  if(!alive()||!controller||!element)return;
  var target=event&&event.target,handled=target&&target.closest&&target.closest('.abcjs-chord,[data-huwabc-tab-source]');
  if(handled)return; // These are handled once by the delegated click below.
  target=analysis&&analysis.selectableElement||target;
  try{
   cueStart(element.startChar,target,element.currentTrackMilliseconds);
   audition(element.midiPitches||[],'Nodelyd:');
  }catch(error){show('Nodelyd: '+error.message,true);}
 }
 function sourceElement(target){
  var selected=visual&&typeof visual.findSelectableElement==='function'?visual.findSelectableElement(target):null;
  return selected&&selected.element&&selected.element.absEl&&selected.element.absEl.abcelem;
 }
 function paperClicked(event){
  if(!alive()||!controller||!event.target||!event.target.closest)return;
  var chord=event.target.closest('.abcjs-chord'),tab=event.target.closest('[data-huwabc-tab-source]');
  if(!chord&&!tab)return; // Clicking empty paper only activates this score.
  try{
   if(chord){
    var harmony=ChordKeys.parse(chord.textContent);if(!harmony){show('Akkorden kunne ikke læses.',true);return;}
    var element=sourceElement(chord),sourceChar=element&&element.startChar;
    cueStart(typeof sourceChar==='number'?sourceChar:null,chord,element&&element.currentTrackMilliseconds);
    audition(InstrumentView.soundingPitches(harmony.pitches),'Akkordlyd:');
   }else{
    var start=Number(tab.getAttribute('data-huwabc-tab-source')),midi=Number(tab.getAttribute('data-huwabc-tab-midi'));
    cueStart(Number.isFinite(start)?start:null,tab,null);
    if(tab.getAttribute('data-huwabc-tab-midi')!==null&&Number.isFinite(midi))audition([midi],'Nodelyd:');
   }
  }catch(error){show((chord?'Akkordlyd: ':'Nodelyd: ')+error.message,true);}
 }
 function activateByPointer(event){
  if(!alive()||Shortcuts.inputOwnsKey(event.target))return;
  // A click on the paper also moves focus away from a previous score's Play
  // button. Native controls keep their own focus and keyboard behaviour.
  try{box.focus({preventScroll:true});}catch(ignore){if(box.focus)box.focus();}
 }
 function stopAndReset(){clearCue();if(controller)Playback.stopOne(controller);playing(false);stopDrone();clearFollow();if(viewport)viewport.reset();return true;}
 function failure(error){
  if(error&&error.name==='AbortError'||!alive())return;
  playing(false);stopDrone();clearFollow();
  if(playButton)playButton.removeAttribute('aria-busy');
  show('Lyd kunne ikke indlæses: '+(error&&error.message||String(error)),true);
 }
 function follow(event){
  if(!alive()||!event)return;
  if(pager)pager.onEvent(event);
  if(miniMixer)miniMixer.updateEvent(event);
  clearFollow();
  (event.elements||[]).forEach(function(group){(Array.isArray(group)?group:[group]).forEach(function(node){
   // ABCJS events can include non-note SVG elements. In the follow camera,
   // never add a highlight class to rectangles/overlays or hidden voices.
   if(viewport){
    var noteGroup=node&&node.closest&&node.closest('.abcjs-note');
    if(!noteGroup||!noteGroup.classList.contains('abcjs-v'+(Math.max(1,Number(options.followVoice)||1)-1)))return;
    node=noteGroup;
   }
   if(node&&node.classList&&!activeNotes.includes(node)){node.classList.add('huwabc-playing-note');activeNotes.push(node);}
  });});
  var visible=activeNotes.filter(function(node){return !node.getBoundingClientRect||node.getBoundingClientRect().height>0;});
  if(!visible.length&&event.startChar!==null&&event.startChar!==undefined){
   visible=Array.prototype.slice.call(paper.querySelectorAll('[data-huwabc-tab-source="'+Number(event.startChar)+'"]')).filter(function(node){return node.getBoundingClientRect().height>0;});
   visible.forEach(function(node){node.classList.add('huwabc-playing-note');activeNotes.push(node);});
  }
  var note=viewport?viewport.follow(event):visible[0],svg=note&&note.ownerSVGElement;
  if(!svg||!svg.getScreenCTM||!svg.createSVGPoint||!note.getBoundingClientRect)return;
  var rect=note.getBoundingClientRect(),staff=note.closest&&note.closest('.huwabc-tabs-only,.abcjs-staff-wrapper'),staffRect=staff?staff.getBoundingClientRect():rect;
  var ctm=svg.getScreenCTM();if(!ctm)return;
  var top=svg.createSVGPoint(),bottom=svg.createSVGPoint();top.x=bottom.x=rect.left-4;top.y=staffRect.top-5;bottom.y=staffRect.bottom+5;
  top=top.matrixTransform(ctm.inverse());bottom=bottom.matrixTransform(ctm.inverse());
  cursorLine=doc.createElementNS('http://www.w3.org/2000/svg','line');cursorLine.setAttribute('class','huwabc-minimal-cursor');
  cursorLine.setAttribute('x1',top.x);cursorLine.setAttribute('x2',bottom.x);cursorLine.setAttribute('y1',top.y);cursorLine.setAttribute('y2',bottom.y);svg.appendChild(cursorLine);
 }
 function icon(kind){
  var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('width','14');svg.setAttribute('height','14');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','huwabc-minimal-icon huwabc-minimal-'+kind);
  var path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='play'?'M5 3v14l11-7z':'M4 3h4v14H4z M12 3h4v14h-4z');path.setAttribute('fill','currentColor');svg.appendChild(path);return svg;
 }
 function labelButton(){
  playButton=controls.querySelector('.abcjs-midi-start');if(!playButton)return;
  playButton.textContent='';playButton.appendChild(icon('play'));playButton.appendChild(icon('pause'));
  playButton.appendChild(make('span','huwabc-minimal-label-play','Afspil'));playButton.appendChild(make('span','huwabc-minimal-label-pause','Pause'));
  playing(false);
  // SynthController always adds a clock even when progress is disabled. Its
  // methods tolerate a missing clock, so remove it rather than show extra UI.
  ['.abcjs-midi-clock','.abcjs-css-warning'].forEach(function(selector){var node=controls.querySelector(selector);if(node&&node.parentNode)node.parentNode.removeChild(node);});
 }
 // One small icon is available on the standalone minimal player and on an
 // embedded macro only when mixer="yes". In articles, the mixer is created
 // lazily on the first click and starts as a floating, draggable window.
 function mixerVisibility(){
  if(!mixerButton)return;
  var open=!!(miniMixer&&miniMixer.isVisible());
  mixerButton.setAttribute('aria-expanded',String(open));
  var label=text(open?'Skjul mixer':'Åbn mixer');
  mixerButton.title=label;mixerButton.setAttribute('aria-label',label);
  if(typeof options.onMixerVisibilityChange==='function')options.onMixerVisibilityChange(open);
 }
 function syncMixerPreview(next){
  config=Accompaniment.clean(next);
  if(controller&&controller.midiBuffer&&controller.midiBuffer.setVolumes)controller.midiBuffer.setVolumes();
  if(drone){
   if(controller&&controller.isStarted&&config.droneEnabled)drone.start();
   else if(!config.droneEnabled)drone.stop();
   else drone.configure();
  }
 }
 function ensureMiniMixer(){
  if(miniMixer)return miniMixer;
  miniMixer=FloatingMixer.mount({ABC:ABC,source:source,host:box,wiki:options.wiki,title:options.mixerTitle,
   anchor:mixerButton,initialFloating:!options.sidebarMixer,initiallyVisible:false,
   getConfig:function(){return config;},onVisibilityChange:mixerVisibility,
   onTogglePlayback:function(){if(playButton)playButton.click();},getPlaying:function(){return !!(controller&&controller.isStarted);},
   onPreview:syncMixerPreview,
   onChange:function(next){syncMixerPreview(next);if(typeof options.onMixerChange==='function')options.onMixerChange(config);}
  });
  mixerVisibility();return miniMixer;
 }
 function installMixerButton(){
  if(!playButton||!options.mixerButton||mixerButton)return;
  mixerButton=make('button','huwabc-mini-open');mixerButton.type='button';
  var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  var path=doc.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M4 5h16 M4 12h16 M4 19h16 M9 3v4 M15 10v4 M8 17v4');
  path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');
  path.setAttribute('stroke-linecap','round');path.setAttribute('fill','none');svg.appendChild(path);
  mixerButton.appendChild(svg);
  mixerButton.addEventListener('click',function(event){
   event.stopPropagation();ensureMiniMixer().toggle({anchor:mixerButton,floating:!options.sidebarMixer});
   mixerVisibility();
  });
  playButton.parentNode.insertBefore(mixerButton,playButton.nextSibling);
  mixerVisibility();
 }
 function render(){
  var tabConfig=Tabs.read(fields),tabEnabled=fields['abc-tabs']==='yes',displayed=Display.presentation(source);
  var tabOptions=Tabs.options(ABC,displayed,tabEnabled,tabConfig),layout=fields['abc-layout']||'standard';
  var chordStyle=fields['abc-chords-style']||(options.wiki&&options.wiki.getTiddlerText?options.wiki.getTiddlerText('$:/config/huwiki/abc/chords-style','jazz'):'jazz');
  var jazzChords=chordStyle!=='standard',useJazz=fields['abc-font']==='petaluma';
   box.classList.toggle('huwabc-jazz-font',useJazz);
  var results=JazzFont.render(ABC,useJazz,function(){return ABC.renderAbc(paper,displayed,Object.assign({
   visualTranspose:InstrumentView.current().semitones,tablature:tabOptions.options,responsive:'resize',staffwidth:720,scale:layout==='kompakt'?.88:1,jazzchords:jazzChords,
   format:JazzFont.formatFonts(useJazz,{stretchlast:true,gchordfont:useJazz?'PetalumaScript 20':jazzChords?'Helvetica 18 bold':'Helvetica 16'}),
   oneSvgPerLine:!!pager||!!viewport,expandToWidest:true,add_classes:true,selectTypes:options.audio===false?false:undefined,selectionColor:'currentColor',clickListener:options.audio===false?undefined:noteClicked,
   wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:viewport?Math.max(2,Math.min(4,Number(options.followMeasures)||3)):layout==='jazz'?4:3},
   afterParsing:function(tune){
    SheetLayout.prepare(tune,fields,displayed);
    tune.formatting=tune.formatting||{};tune.formatting.staffsep=tabConfig.rhythm?145:90;if(tabConfig.rhythm)tune.formatting.sysstaffsep=120;
    Tabs.notation.project(ABC,tune,tabConfig,tabEnabled);
    if(tabOptions.options.length)tune.tablatures=ABC.parseOnly(displayed,{tablature:tabOptions.options})[0].tablatures;
    if(options.showTitle!==true){
     // Header/footer prose is presentation. Keep tempo, in-staff lyrics,
     // voice labels and every musical event unchanged.
     ['title','subtitle','composer','author','origin','rhythm','book','source','notes','history','transcription','unalignedWords','discography','url'].forEach(function(key){if(tune.metaText)delete tune.metaText[key];});
     (tune.lines||[]).forEach(function(line){if(line.subtitle!==undefined)delete line.subtitle;});
    }
   }
  },viewport?{}:SheetLayout.options(ABC,displayed,fields)));});
  if(!results||!results[0])throw new Error('Kunne ikke danne noder. Kontrollér ABC-teksten.');
  visual=results[0];
  var warning=tabOptions.options.length?Tabs.finish(visual,tabConfig):'';
  if(tabOptions.options.length&&fields['abc-show-notes']==='no')Tabs.only(paper,visual);
  if(tabOptions.options.length)Tabs.rhythm(paper,visual,tabConfig);
  if(pager)pager.layout(visual,fields);
  if(viewport)viewport.layout();
  if(visual.warnings&&visual.warnings.length)show('ABCJS: '+visual.warnings.slice(0,2).join(' · '),true);
  else if(warning||tabOptions.message)show(warning||tabOptions.message,true);
 }
 function attachAudio(){
  if(!controller||!visual)return;
  stopAndReset();cueDataReady=false;controller.visualObj=null;controller.disable(true);
  try{
   var arranged=Accompaniment.prepare(ABC,visual,source,config,true,fields);
   if(arranged.message)show(arranged.message,true);else show('');
   var soundfont=options.wiki&&options.wiki.getTiddlerText?options.wiki.getTiddlerText('$:/config/huwiki/abc/soundfont','https://paulrosen.github.io/midi-js-soundfonts/abcjs/').trim():'https://paulrosen.github.io/midi-js-soundfonts/abcjs/';
   controller.setTune(visual,false,{soundFontUrl:soundfont,swing:ScoreView.swingValue(fields,options.swing)}).catch(failure);
  }catch(error){failure(error);}
 }
 function update(nextFields,nextSource,plan){
  fields=nextFields||fields;source=String(nextSource===undefined?source:nextSource);config=Accompaniment.read(fields);plan=plan||{};
  if(miniMixer)miniMixer.update(config,source);
  if(plan.score){
   var revision=++updateRevision;stopAndReset();renderPending=true;if(playButton)playButton.disabled=true;
   var ready=fields['abc-font']==='petaluma'?JazzFont.ready(doc):Promise.resolve();
   ready.then(function(){
    if(!alive()||revision!==updateRevision)return;
    var restore=ViewportAnchor.capture(paper,visual,shortcutHost);
    try{cueDataReady=false;render();api.visual=visual;renderPending=false;if(playButton)playButton.disabled=false;attachAudio();}
    catch(error){visual=null;api.visual=null;renderPending=false;if(controller){controller.visualObj=null;controller.disable(true);}show('Nodefejl: '+error.message,true);}
    finally{restore(visual);}
   }).catch(failure);
  }else if(plan.audio&&!renderPending){attachAudio();}
  else if(plan.pages&&pager&&visual){pager.layout(visual,fields);}
  else if(plan.live){if(controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();if(drone)drone.configure();}
 }
 // Respect concert/written instrument changes made elsewhere without a toolbar.
 var stopInstrumentObserver=InstrumentView.observe(function(){
  if(alive())update(fields,source,{score:true});
 });
 var api={element:box,pager:pager,controller:null,visual:null,destroy:destroy,update:update,updateConfig:function(next){
  var fresh=Accompaniment.clean(next),live=Accompaniment.liveConfigChange(config,fresh);config=fresh;
  fields=Object.assign({},fields,{'abc-accompaniment':JSON.stringify(config)});
  if(miniMixer)miniMixer.update(config);
  if(!live)attachAudio();else{if(controller&&controller.midiBuffer)controller.midiBuffer.setVolumes();if(drone)drone.configure();}
  }};
 function destroy(){
  if(closed)return;if(pager)pager.destroy();closed=true;
  if(stopInstrumentObserver)stopInstrumentObserver();
  if(miniMixer){miniMixer.destroy();miniMixer=null;}
  if(detachObserver)detachObserver.disconnect();if(locale)locale.destroy();if(controlsLocale)controlsLocale.destroy();
  if(unbindShortcuts)unbindShortcuts();shortcutHost.removeEventListener('pointerdown',activateByPointer,true);paper.removeEventListener('click',paperClicked);
  if(viewport)viewport.destroy();
  stopDrone();clearCue();clearFollow();
  if(controller){controller._disposed=true;Playback.unregister(controller);controller.destroy();}
  if(controls&&controls.parentNode)controls.parentNode.removeChild(controls);
  if(box.parentNode)box.parentNode.removeChild(box);
 }
 try{render();api.visual=visual;}catch(error){show('Nodefejl: '+error.message,true);if(controls)controls.hidden=true;}
 // The mixer is available via its icon, but Minimal view starts without a sidebar panel.
 if(visual&&controls){
  if(!ABC.synth||!ABC.synth.supportsAudio||!ABC.synth.supportsAudio())show('Lydafspilning er ikke tilgængelig i denne browser.',true);
  else try{
   var arranged=Accompaniment.prepare(ABC,visual,source,config,true,fields);
   if(arranged.message)show(arranged.message,true);
   controller=AudioController.install(new ABC.synth.SynthController(),ABC,{
    wiki:options.wiki,getConfig:function(){return config;},isCurrent:alive,beforePlay:useCue,
    onStatus:function(value){
     if(!alive()||!value)return;
     if(value.phase==='loading'){if(playButton)playButton.setAttribute('aria-busy','true');show('Indlæser lyd …');}
     else if(value.phase==='error')failure(new Error(value.details||value.reason||text('Lyden kunne ikke klargøres.')));
     else {if(playButton)playButton.removeAttribute('aria-busy');if(!status.classList.contains('huwabc-error'))show('');}
    },
    onError:failure,
    onStop:function(paused){if(!alive())return;playing(false);stopDrone();clearFollow();if(!paused)clearCue();if(playButton)playButton.removeAttribute('aria-busy');if(!status.classList.contains('huwabc-error'))show('');}
   });
   api.controller=controller;controller._huwabcStopDrone=stopDrone;Playback.register(controller);
   controller.load(controls,{
    onStart:function(){if(!alive())return;Playback.start(controller);playing(true);if(drone&&config.droneEnabled)drone.start();show('');},
    onFinished:function(){if(!alive())return;playing(false);stopDrone();clearFollow();},
    onEvent:follow
   },{displayPlay:true,displayLoop:false,displayRestart:false,displayProgress:false,displayWarp:false});
   labelButton();installMixerButton();
   var soundfont=options.wiki&&options.wiki.getTiddlerText?options.wiki.getTiddlerText('$:/config/huwiki/abc/soundfont','https://paulrosen.github.io/midi-js-soundfonts/abcjs/').trim():'https://paulrosen.github.io/midi-js-soundfonts/abcjs/';
   controller.setTune(visual,false,{soundFontUrl:soundfont,swing:ScoreView.swingValue(fields,options.swing)}).catch(failure);
   box.setAttribute('tabindex','0');box.setAttribute('aria-label',text('Musikafspiller'));
   paper.addEventListener('click',paperClicked);
   unbindShortcuts=Shortcuts.register(shortcutHost,{
    Space:function(){if(!alive()||!playButton)return false;playButton.click();return true;},
    Home:stopAndReset,
    Stand:function(){if(!pager)return false;pager.setDesk(!pager.isDesk());return true;},
    PageDown:function(){return pager?pager.next():false;},PageUp:function(){return pager?pager.previous():false;},
    Escape:function(){if(pager&&pager.isDesk()){pager.setDesk(false);return true;}return stopAndReset();}
   });
   shortcutHost.addEventListener('pointerdown',activateByPointer,true);
  }catch(error){failure(error);}
 }
 locale=I18n.observe(box,options.wiki);
 if(externalControls)controlsLocale=I18n.observe(controls,options.wiki);
 if(typeof MutationObserver==='function'&&doc.documentElement){
  detachObserver=new MutationObserver(function(){if(!alive())destroy();});
  detachObserver.observe(doc.documentElement,{childList:true,subtree:true});
 }
 return api;
};
})();
