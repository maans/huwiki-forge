/*\
title: $:/plugins/huwiki/abc/edit-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
'use strict';
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var ScoreText=require('$:/plugins/huwiki/abc/score-text.js');
var SelectionPopover=require('$:/plugins/huwiki/abc/selection-popover.js');
var PageView=require('$:/plugins/huwiki/abc/page-view.js');
var ViewState=require('$:/plugins/huwiki/abc/view-state.js');
var Widget=require('$:/core/modules/widgets/widget.js').widget;
var tools=require('$:/plugins/huwiki/abc/loader.js');
var model=require('$:/plugins/huwiki/abc/editor-model.js');
var Entry=require('$:/plugins/huwiki/abc/entry-model.js');
var piano=require('$:/plugins/huwiki/abc/piano.js');
var tabs=require('$:/plugins/huwiki/abc/tabs.js');
var transpose=require('$:/plugins/huwiki/abc/transpose.js');
var sourceHelp=require("$:/plugins/huwiki/abc/source-assist.js");
var jazzFont=require('$:/plugins/huwiki/abc/jazz-font.js');
var sheetLayout=require("$:/plugins/huwiki/abc/sheet-layout.js");
var VoiceNames=require('$:/plugins/huwiki/abc/voice-names.js');
var accompaniment=require('$:/plugins/huwiki/abc/accompaniment.js');
var shortcuts=require('$:/plugins/huwiki/abc/keyboard-shortcuts.js');
function E(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!==undefined)e.textContent=txt;return e;}
function B(text,fn,cls){var b=E('button','huwabc-btn '+(cls||''),text);b.type='button';b.addEventListener('click',fn);return b;}
function sel(list,val){var n=E('select','huwabc-select');list.forEach(function(a){var o=E('option','',a[1]);o.value=a[0];n.appendChild(o);});if(val&&!list.some(function(x){return x[0]===val;})){var o=E('option','',val+' (fra ABC)');o.value=val;n.appendChild(o);}n.value=val||list[0][0];return n;}
function label(text,node){var h=E('label','huwabc-field');h.appendChild(E('span','',text));h.appendChild(node);return h;}
function inp(value){var n=E('input','huwabc-input');n.type='text';n.value=value||'';return n;}
function panel(title,child,cls){var p=E('section','huwabc-edit-panel '+(cls||''));p.appendChild(E('div','huwabc-edit-panel-head',title));var c=E('div','huwabc-edit-panel-content');c.appendChild(child);p.appendChild(c);return p;}
var KEY_OPTIONS=[['C','C-dur'],['G','G-dur'],['D','D-dur'],['A','A-dur'],['E','E-dur'],['B','H-dur'],['F','F-dur'],['Bb','B-dur'],['Eb','Es-dur'],['Ab','As-dur'],['Am','a-mol'],['Em','e-mol'],['Bm','h-mol'],['Dm','d-mol'],['Gm','g-mol'],['Cm','c-mol'],['F#m','fis-mol'],['D dor','D-dorisk'],['A mix','A-mixolydisk']];
var METERS=[['4/4','4/4'],['3/4','3/4'],['2/4','2/4'],['6/8','6/8'],['9/8','9/8'],['12/8','12/8'],['5/4','5/4'],['7/8','7/8'],['C','C (4/4)'],['C|','Alla breve']];
var LENS=[['1/8','Ottendedel'],['1/4','Fjerdedel'],['1/16','Sekstendedel'],['1/2','Halvnode']];
var LAYOUTS=[['standard','Klassisk'],['sangark','Sangark'],['jazz','Jazz lead sheet'],['klaver','Klaver'],['rytme','Rytme og trommer'],['kompakt','Kompakt']];
function Editor(p,o){this.initialise(p,o);}
Editor.prototype=new Widget();
Editor.prototype.execute=function(){this.title=this.getAttribute('tiddler',this.getVariable('currentTiddler'));};
Editor.prototype.onDestroy=function(){if(this._cancelPreview){this._cancelPreview();this._cancelPreview=null;}if(this._contextPopup){this._contextPopup.destroy();this._contextPopup=null;}if(this._pager)this._pager.destroy();if(this._viewState)this._viewState.destroy();if(this._closeExpanded)this._closeExpanded();if(this._localeObserver){this._localeObserver.destroy();this._localeObserver=null;}if(this._unbindShortcut){this._unbindShortcut();this._unbindShortcut=null;}};
Editor.prototype.render=function(parent,next){this.parentDomNode=parent;this.computeAttributes();this.execute();var h=E('div','huwabc-edit-workshop');parent.insertBefore(h,next);this.domNodes.push(h);this.host=h;this.start();this._localeObserver=I18n.observe(h,this.wiki);};
Editor.prototype.start=function(){
 var self=this,tid=this.wiki.getTiddler(this.title),source=tools.getSource(this.wiki,this.title).replace(/\r\n?/g,'\n'),abc=null,timer=null,map=null,selected=null,anchor=null,history=[],future=[],drag=null,entryMode=false,entryLength=.25,lastEntryMidi=60,entryVerse=0,contextPopup=null,metaItems=[],metadata=null,metaKey=null,metaSource='';
 if(!tid){this.host.textContent='Redigeringskladden blev ikke fundet.';return;}
 // iPad and iPhone share a limited WebKit rendering process even in Chrome.
 // Avoid repeated full-page SVG render passes for every fast keystroke.
 var browser=this.document.defaultView&&this.document.defaultView.navigator;
 var mobileWebKit=!!(browser&&(/iPad|iPhone|iPod/i.test(browser.userAgent||'')||
  (browser.platform==='MacIntel'&&browser.maxTouchPoints>1)));
 this._cancelPreview=function(){if(timer){clearTimeout(timer);timer=null;}};

 var host=this.host;host.textContent='';this._viewState=ViewState.mount(this,host);
 function saveDraft(fields){var old=self.wiki.getTiddler(self.title);if(!old)return;self.wiki.addTiddler(new $tw.Tiddler(old,Object.assign({'abc-before-transpose':old.fields['abc-source']===source?old.fields['abc-before-transpose']:undefined,'abc-source':source,'abc-key':tools.header(source,'K'),'abc-meter':tools.header(source,'M'),'abc-rhythm':tools.header(source,'R')},fields||{})));}
 function anchorFor(item){return item?{kind:item.kind,start:item.start,virtual:!!item.virtual,eventStart:item.event&&item.event.start,verse:item.verse||0}:null;}
 function snapshot(){return {source:source,metaKey:metaKey,anchor:selected?anchorFor(selected):anchor};}
 function commit(next,target){if(next===source)return;history.push(snapshot());if(history.length>100)history.shift();future=[];source=next;anchor=target===undefined?anchor:target;codearea.value=source;saveDraft();sync();renderPreview();}
 function undo(redo){var from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(snapshot());var state=from.pop();source=state.source;anchor=state.anchor;metaKey=state.metaKey||null;metadata=null;codearea.value=source;saveDraft();sync();renderPreview();preview.focus({preventScroll:true});}
 function keyParts(value){var m=/\s+(?=(?:clef=|transpose=|octave=|stafflines=|staffscale=|middle=|treble\b|bass\b|alto\b|tenor\b|perc\b|none\b)).*$/.exec(value);return {key:m?value.slice(0,m.index):value,params:m?m[0]:''};}
 function header(code,val){if(code==='K')val=keyParts(val).key+keyParts(tools.header(source,'K')).params;if(code==='Q'&&/^\d+$/.test(val))val=tools.tempoWithBpm(tools.header(source,'Q'),val);commit(tools.putHeader(source,code,val),null);}
 var transposeControls=transpose.mount(host,function(){return abc;},function(){return source;},function(next){commit(next,null);});
 var tabControls=tabs.mount(host,tid.fields,function(fields){saveDraft(fields);renderPreview();});
 sheetLayout.mount(host,tid.fields,function(fields){saveDraft(fields);renderPreview();});
 var previewShell=E('div','huwabc-edit-live'),preview=E('div','huwabc-edit-preview'),status=E('div','huwabc-preview-status','Indlæser nodevisning …');
 preview.setAttribute('tabindex','0');preview.setAttribute('role','group');preview.setAttribute('aria-label','Interaktive noder. Venstre og højre vælger. Op og ned ændrer tone.');
 var viewport=E('div','huwabc-edit-preview-viewport');viewport.appendChild(preview);previewShell.appendChild(viewport);previewShell.appendChild(status);var previewPanel=panel('Live-musik · noder og tabs',previewShell,'huwabc-edit-live-panel');host.appendChild(previewPanel);
 var pager=PageView.mount(preview,{wiki:self.wiki,state:self._viewState,editor:true,audio:false});self._pager=pager;viewport=pager.viewport;
 var editorAccomp=accompaniment.mount(host,tid.fields,function(fields){saveDraft(fields);});
 var selection=E('section','huwabc-selection');selection.setAttribute('aria-label','Valgt element');var toolbar=E('div','huwabc-selection-toolbar');
 var mode=sel([['note','Noder og pauser'],['chord','Becifringer'],['lyric','Sangstavelser']],'note');mode.setAttribute('aria-label','Redigér elementtype');toolbar.appendChild(mode);
 toolbar.appendChild(B('←',function(){navigate(-1);},'huwabc-prev'));toolbar.appendChild(B('→',function(){navigate(1);},'huwabc-next'));
 var down=B('↓',function(e){movePitch(-1,!!e.shiftKey);}),up=B('↑',function(e){movePitch(1,!!e.shiftKey);});down.setAttribute('aria-label','Sænk den valgte tone');up.setAttribute('aria-label','Hæv den valgte tone');toolbar.appendChild(down);toolbar.appendChild(up);
 var undoButton=B('Fortryd ændring',function(){undo(false);}),redoButton=B('Gentag ændring',function(){undo(true);});toolbar.appendChild(undoButton);toolbar.appendChild(redoButton);selection.appendChild(toolbar);
 var selectedLabel=E('div','huwabc-selection-label','Klik på en node, becifring eller sangstavelse.');selectedLabel.setAttribute('role','status');selectedLabel.setAttribute('aria-live','polite');selection.appendChild(selectedLabel);
 var fields=E('div','huwabc-selection-fields'),pitchSelect=E('select','huwabc-select');pitchSelect.setAttribute('aria-label','Valgt tone');var pitchNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
 for(var m=12;m<=119;m++){var option=E('option','',I18n.noteName(m,I18n.language(self.wiki)==='da'?'da':'int',true)+(Math.floor(m/12)-1));option.value=m;pitchSelect.appendChild(option);}var pitchLabel=label('Tone',pitchSelect);pitchLabel.classList.add('huwabc-pitch-field');fields.appendChild(pitchLabel);
 var valueField=inp('');valueField.setAttribute('aria-label','Valgt becifring eller sangstavelse');var valueLabel=label('Tekst',valueField);valueLabel.classList.add('huwabc-value-field');fields.appendChild(valueLabel);var apply=B('Anvend',applyValue);fields.appendChild(apply);selection.appendChild(fields);
 selection.appendChild(E('p','huwabc-compose-hint','← → vælger i samme stemme. ↑ ↓ flytter en node ét trin. Træk et nodehoved op eller ned. Esc vender tilbage til noderne.'));host.appendChild(selection);
 var entryTools=E('div','huwabc-entry-tools');
 var entryToggle=B('Skriv noder',function(){if(!allowSelection())return;entryMode=!entryMode;if(entryMode)entryLength=.25;syncEntry();if(!selected&&map&&map.events.length)choose(atEvent(map.events[0],'note'),true);preview.focus({preventScroll:true});},'huwabc-entry-toggle');entryToggle.setAttribute('aria-pressed','false');entryTools.appendChild(entryToggle);
 var durationChoice=sel([['1','1 · Helnode'],['0.5','2 · Halvnode'],['0.25','3 · Fjerdedel'],['0.125','4 · Ottendedel'],['0.0625','5 · Sekstendedel']],'0.25');durationChoice.classList.add('huwabc-entry-duration');durationChoice.setAttribute('aria-label','Nodelængde');entryTools.appendChild(label('Længde',durationChoice));
 durationChoice.addEventListener('change',function(){entryLength=Number(durationChoice.value);if(!entryMode&&selected&&(selected.kind==='note'||selected.kind==='rest'))writeHere(selected.kind==='rest'?'z':selected.value,entryLength,false);syncEntry();});
 var restButton=B(tr('Pause','Rest'),function(){if(!selected)return;writeHere('z',entryMode?entryLength:selected.event.el.duration,entryMode);},'huwabc-entry-rest');entryTools.appendChild(restButton);
 var addBar=B('+ Takt',function(){appendBar();},'huwabc-entry-bar');entryTools.appendChild(addBar);
 var voiceChoice=sel([['0:0','1']],'0:0');voiceChoice.classList.add('huwabc-entry-voice');voiceChoice.setAttribute('aria-label','Aktiv stemme');entryTools.appendChild(label('Stemme',voiceChoice));
 voiceChoice.addEventListener('change',function(){if(!map||!allowSelection())return;var old=selected&&selected.event,position=0;if(old)map.events.filter(function(e){return e.voice===old.voice;}).some(function(e){if(e===old)return true;position+=e.el.duration;return false;});var time=0,candidate=map.events.filter(function(e){return e.voice===voiceChoice.value;}).find(function(e){var yes=time+e.el.duration>position+1e-8;time+=e.el.duration;return yes;});if(candidate)choose(atEvent(candidate,mode.value),true);});
 var verseChoice=sel(Array.from({length:8},function(_,i){return [String(i),String(i+1)];}),'0');verseChoice.setAttribute('aria-label','Vers');var verseLabel=label('Vers',verseChoice);entryTools.appendChild(verseLabel);verseLabel.hidden=true;
 verseChoice.addEventListener('change',function(){if(!allowSelection())return;entryVerse=Number(verseChoice.value);if(selected)choose(atEvent(selected.event,'lyric'),true);});
 var entryHint=E('p','huwabc-entry-status');entryTools.appendChild(entryHint);selection.appendChild(entryTools);
 var compose=E('div','huwabc-compose'),codearea=E('textarea','huwabc-code');codearea.value=source;codearea.rows=8;codearea.spellcheck=false;codearea.setAttribute('aria-label','ABC musik: toner, sangtekst og akkorder');compose.appendChild(codearea);var sourcePanel=panel('ABC-kilde · markeringen følger dit valg',compose,'huwabc-edit-source-panel');host.appendChild(sourcePanel);var sourceAssist=sourceHelp.mount(codearea);
 var pianoHost=E('div'),keyboard=piano.mountKeyboard(pianoHost,{startOctave:4,showNames:true,lang:'auto',wiki:self.wiki,onKey:function(m,flat){setMidi(m,flat);}});var details=E('details','huwabc-piano-details');details.open=true;details.appendChild(E('summary','','Klaviatur · følger markeringen'));details.appendChild(pianoHost);host.insertBefore(details,editorAccomp.element);
 // N = graphical note editing; E = ABC text; P = piano.
 // Arrow keys, Escape, and Cmd/Ctrl-Z are already handled by the note editor.
 self._unbindShortcut=shortcuts.register(host,{
  N:function(){if(mode.value!=='note'){mode.value='note';mode.dispatchEvent(new Event('change'));}preview.focus({preventScroll:true});return true;},
  E:function(){if(entryMode)return false;codearea.focus({preventScroll:true});return true;},
  P:function(){details.open=!details.open;return true;},
  PageDown:function(){return pager.next();},PageUp:function(){return pager.previous();}
 });
 try{
  var requested=JSON.parse(self.wiki.getTiddlerText('$:/temp/huwiki/abc/edit-focus','null'));
  if(requested&&requested.title===(tid.fields['draft.of']||self.title)){
   self._requestedPageEvent=Number.isInteger(requested.event)?requested.event:null;self._originViewState=requested.originState||null;
   self.wiki.deleteTiddler('$:/temp/huwiki/abc/edit-focus');
   setTimeout(function(){if(!host.isConnected)return;var target=requested.focus==='code'?codearea:preview;target.focus({preventScroll:true});},0);
  }
 }catch(_ignored){}
 function pitchText(note){
  var danish=I18n.language(self.wiki)==='da';if(!note||!note.pitch||(note.transpose||0)%12!==0)return note?I18n.noteName(note.midi,danish?'da':'int',true)+(Math.floor(note.midi/12)-1):'';
  var p=note.pitch,acc=Math.round(note.midi-(note.transpose||0)-model.midi(p.d,0)),letter=p.letter,oct=4+Math.floor(p.d/7)+(note.transpose||0)/12;
  if(danish&&letter==='B'){if(acc===-1)return 'B'+oct;letter='H';}
  return letter+(acc>0?'♯'.repeat(acc):acc<0?'♭'.repeat(-acc):'')+oct;
 }
 function melodicItem(){return selected&&(selected.kind==='note'?selected:selected.event.notes[0]);}
 function eventNode(ev){var item=ev.notes[0]||ev.rest||ev.chords[0]||ev.lyrics[0];return item&&item.nodes&&item.nodes[0];}
 function atEvent(ev,kind){
  if(!ev)return null;kind=kind==='rest'?'note':kind;
  if(kind==='note')return ev.notes[0]||ev.rest||null;
  var old=kind==='chord'?ev.chords[0]:ev.lyrics.find(function(l){return l.verse===entryVerse;});if(old)return old;
  var node=eventNode(ev);return {kind:kind,start:ev.start,end:ev.start,value:'',virtual:true,event:ev,voice:ev.voice,verse:entryVerse,nodes:node?[node]:[]};
 }
 function restoreAnchor(){if(!anchor||!map)return null;var found=map.find(anchor.kind,anchor.start);if(found&&!anchor.virtual)return found;entryVerse=anchor.verse||0;var ev=map.events.find(function(e){return e.start===(anchor.eventStart===undefined?anchor.start:anchor.eventStart);});return ev?atEvent(ev,anchor.kind):found||null;}
 function syncEntry(){
  if(!entryToggle)return;entryToggle.setAttribute('aria-pressed',String(entryMode));entryToggle.textContent=entryMode?'Stop nodeindtastning':'Skriv noder';
  durationChoice.value=String(entryLength);verseLabel.hidden=mode.value!=='lyric';verseChoice.value=String(entryVerse);
  var noteMode=mode.value==='note';durationChoice.parentElement.hidden=restButton.hidden=!noteMode;entryToggle.hidden=!noteMode;restButton.disabled=!selected;addBar.disabled=!map||!map.events.length;
  if(map){var vv=[];map.events.forEach(function(e){if(!vv.some(function(v){return v.key===e.voice;}))vv.push({key:e.voice,id:e.rawVoice||'default'});});var signature=vv.map(function(v){return v.key+'='+v.id;}).join('|');
   if(voiceChoice.dataset.signature!==signature){voiceChoice.textContent='';var names=VoiceNames.scan(source);vv.forEach(function(v){var n=names.find(function(x){return x.id===v.id;}),o=E('option','',(n&&n.name||v.id==='default'?'1':v.id));if(n&&n.name)o.textContent=n.name+' (V:'+v.id+')';o.value=v.key;voiceChoice.appendChild(o);});voiceChoice.dataset.signature=signature;}
   if(selected)voiceChoice.value=selected.voice;
  }
  entryHint.textContent=entryMode?'Indtast med A–G eller klaviaturet. 1–5 vælger længde, 0 skriver pause. Markøren går videre.':'Vælg og ret. ← → vælger position. ↑ ↓ flytter trin; Shift+↑/↓ flytter en halv tone.';
 }
 // The source field is an editable textarea over a colorized <pre>.
 // The <pre> maintains the highlighted range even while focus is in the
 // floating inspector, on the keyboard, or in another input.
 function insertionForLyric(item){
  // An as-yet unwritten syllable has no text position. Show where its w:
  // line exists (or will be added) instead of mislabelling a note as a lyric.
  var ev=item.event,at=ev&&ev.start;
  if(!Number.isInteger(at))return item.start;
  var begin=source.lastIndexOf('\n',Math.max(0,at-1))+1;
  var end=source.indexOf('\n',at);if(end<0)end=source.length;
  var after=end,verse=Number(item.verse)||0,lyrics=[];
  while(after<source.length){
   var next=after+1,stop=source.indexOf('\n',next);if(stop<0)stop=source.length;
   var line=source.slice(next,stop);
   if(/^w:/.test(line))lyrics.push({start:next,end:stop});
   else if(!/^\s*(?:%|$)/.test(line))break;
   after=stop;
  }
  return lyrics[verse]?lyrics[verse].end:lyrics.length?lyrics[lyrics.length-1].end:end;
 }
 function rangesFor(item){
  if(!item)return [];
  if(Array.isArray(item.ranges)&&item.ranges.length)return item.ranges;
  if(item.virtual&&item.kind==='lyric'){
   var pos=insertionForLyric(item);return [{start:pos,end:pos}];
  }
  return [{start:item.start,end:item.end}];
 }
 function markSource(item,skipNative){
  var ranges=rangesFor(item);
  sourceAssist.setSelection(ranges);
  if(!item||skipNative)return;
  var first=ranges[0];
  if(first&&Number.isFinite(first.start)&&Number.isFinite(first.end))codearea.setSelectionRange(first.start,first.end);
  revealSource();
 }
 function updateSelection(skipSource){
  if(metadata){refreshMeta();return;}
  if(musicWrap){musicWrap.hidden=false;metaBody.hidden=true;}
  preview.querySelectorAll('.huwabc-meta-selected,.huwabc-selected').forEach(function(e){e.classList.remove('huwabc-meta-selected','huwabc-selected');e.setAttribute('aria-pressed','false');});
  preview.querySelectorAll('[data-huwabc-tab-source]').forEach(function(e){e.classList.toggle('huwabc-tab-selected',!!(selected&&selected.event.start===Number(e.dataset.huwabcTabSource)&&(selected.kind!=='note'||selected.midi===Number(e.dataset.huwabcTabMidi))));});
  undoButton.disabled=!history.length;redoButton.disabled=!future.length;
  markSource(selected,skipSource);
  if(!selected){selectedLabel.textContent='Vælg en node eller pause, eller klik i ABC-kilden.';pitchSelect.disabled=true;pitchSelect.selectedIndex=-1;valueLabel.hidden=apply.hidden=true;down.disabled=up.disabled=true;keyboard.clear();syncEntry();return;}
  mode.value=selected.kind==='rest'?'note':selected.kind;anchor=anchorFor(selected);
  (selected.nodes||[]).forEach(function(e){e.classList.add('huwabc-selected');e.setAttribute('aria-pressed','true');});
  var mi=melodicItem(),ci=selected.kind==='chord'?model.chordInfo(selected.value):null;
  pitchSelect.disabled=selected.kind==='chord'?!ci:!mi&&selected.kind!=='rest';pitchSelect.value=ci?60+ci.root:mi?mi.midi:lastEntryMidi;
  Array.from(pitchSelect.options).forEach(function(o){var midi=Number(o.value);o.textContent=I18n.noteName(midi,I18n.language(self.wiki)==='da'?'da':'int',true)+(Math.floor(midi/12)-1);});
  if(selected.kind==='note'){var pitchOption=Array.from(pitchSelect.options).find(function(o){return Number(o.value)===selected.midi;});if(pitchOption)pitchOption.textContent=pitchText(selected);}
  pitchLabel.hidden=selected.kind==='lyric';pitchLabel.querySelector('span').textContent=selected.kind==='chord'?tr('Grundtone','Root'):tr('Tone','Pitch');
  var musical=selected.kind==='note'||selected.kind==='rest';valueLabel.hidden=apply.hidden=musical;apply.disabled=selected.kind==='lyric'&&!selected.event.notes.length;
  valueLabel.querySelector('span').textContent=selected.kind==='chord'?'Becifring':'Sangstavelse';valueField.value=valueForSelected();valueField.placeholder=selected.virtual?'Tilføj ved denne position':'';
  down.disabled=up.disabled=selected.kind!=='note';
  var labelText=selected.kind==='note'?tr('Node ','Note ')+pitchText(selected):selected.kind==='rest'?tr('Pause','Rest'):selected.kind==='chord'?(selected.virtual?tr('Ny becifring ved markeringen','New chord at selection'):tr('Becifring ','Chord ')+selected.value):(selected.virtual?tr('Ny sangstavelse ved markeringen','New syllable at selection'):tr('Sangstavelse “','Syllable “')+model.lyricDisplay(selected.value)+'”');
  selectedLabel.textContent=labelText+tr(' · stemme ',' · voice ')+(selected.event.rawVoice==='default'?'1':selected.event.rawVoice)+(selected.kind==='lyric'?tr(' · vers ',' · verse ')+(entryVerse+1):'');
  if(selected.kind==='lyric'&&!selected.event.notes.length)localError.textContent=tr('Sangstavelser knyttes til toner, ikke pauser. Vælg først en node.','Lyrics belong to notes, not rests. Select a note first.');
  var active=ci?ci.midi:selected.kind==='note'?[selected.midi]:selected.event.notes.map(function(n){return n.midi;});if(keyboard.follow)keyboard.follow(active);else keyboard.setActive(active);
  if(contextPopup&&selected.nodes&&selected.nodes[0])contextPopup.refresh(selected.nodes[0]);
  if(!entryMode&&musical){var d=selected.event.el.duration;if(Array.from(durationChoice.options).some(function(o){return Math.abs(Number(o.value)-d)<1e-8;}))entryLength=d;}
  syncEntry();
 }
 function choose(item,focus,skipSource){if(item!==selected&&!allowSelection()){if(selected)mode.value=selected.kind==='rest'?'note':selected.kind;return false;}metadata=null;metaKey=null;localError.textContent='';selected=item||null;if(selected&&selected.kind==='lyric')entryVerse=selected.verse||0;if(selected&&selected.nodes&&selected.nodes[0])pager.revealNode(selected.nodes[0],true);updateSelection(skipSource);if(focus)preview.focus({preventScroll:true});if(selected&&selected.nodes&&selected.nodes[0])contextPopup.show(selected.nodes[0]);rememberReadingPlace();return true;}
 function navigate(delta){if(!map||!allowSelection())return;var voice=selected?selected.voice:voiceChoice.value,list=map.events.filter(function(e){return e.voice===voice;}),at=selected?list.indexOf(selected.event):-1,index=at<0?0:at+delta;if(index>=list.length&&entryMode){appendBar();return;}index=Math.max(0,Math.min(list.length-1,index));if(list[index])choose(atEvent(list[index],mode.value),true);}
 function replaceItem(item,value,target){try{target=target||anchorFor(item);if(item.kind==='note'){var r=model.editPitch(source,map,item,value,function(s){return abc.parseOnly(s);});target.start=r.offset(target.start);if(target.eventStart!==undefined)target.eventStart=r.offset(target.eventStart);commit(r.source,target);}else{commit(model.replace(source,item,value),target);}}catch(e){localError.textContent=e.message;}}
 function movePitch(delta,chromatic){if(!selected||selected.kind!=='note')return;try{var token;if(chromatic){var sig=Object.values(selected.key||{}).reduce(function(n,v){return n+v;},0);token=model.sourceMidi(selected.midi-(selected.transpose||0)+delta,sig?sig<0:delta<0);}else token=model.step(selected,delta);replaceItem(selected,token);preview.focus({preventScroll:true});}catch(e){localError.textContent=e.message;}}
 function writeHere(token,duration,advance){
  if(!selected||!allowSelection())return;try{var voice=selected.voice,r=Entry.write(abc,source,selected.event,token,duration),target=r.anchor;
   if(advance){var changed=Entry.map(abc,r.source),ev=changed.events.find(function(e){return (e.notes[0]||e.rest)&&((e.notes[0]||e.rest).start===target.start);}),vv=changed.events.filter(function(e){return e.voice===voice;}),next=vv[vv.indexOf(ev)+1];
    if(!next){var ar=Entry.appendMeasure(abc,r.source);r.source=ar.source;changed=Entry.map(abc,r.source);vv=changed.events.filter(function(e){return e.voice===voice;});next=vv[vv.length-1];}
    if(next){var ni=next.notes[0]||next.rest;target={kind:ni.kind,start:ni.start};}
   }
   localError.textContent='';metadata=null;metaKey=null;commit(r.source,target);preview.focus({preventScroll:true});if(selected&&eventNode(selected.event))contextPopup.show(eventNode(selected.event));
  }catch(error){localError.textContent=I18n.translate(error.message,I18n.language(self.wiki));}
 }
 function appendBar(){if(!map||!allowSelection())return;try{var voice=selected?selected.voice:voiceChoice.value,r=Entry.appendMeasure(abc,source),m=Entry.map(abc,r.source),events=m.events.filter(function(e){return e.voice===voice;}),ev=events[events.length-1];metadata=null;metaKey=null;commit(r.source,{kind:'rest',start:ev.rest.start});choose(selected,true);}catch(error){localError.textContent=I18n.translate(error.message,I18n.language(self.wiki));}}
 function setMidi(m,flat){
  if(!selected||!allowSelection())return;lastEntryMidi=m;
  if(selected.kind==='chord'){var ci=model.chordInfo(selected.value),roots=flat?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];valueField.value=roots[m%12]+(ci?ci.suffix:'');applyValue();}
  else if(selected.kind==='note'||selected.kind==='rest'){var note=melodicItem(),token=model.sourceMidi(m-(note?note.transpose||0:selected.event.transpose||0),flat);if(entryMode||selected.kind==='rest')writeHere(token,entryMode?entryLength:selected.event.el.duration,entryMode);else replaceItem(note,token);}
 }
 function applyValue(){if(!selected||selected.kind==='note'||selected.kind==='rest')return;try{var r=selected.kind==='chord'?Entry.chord(abc,source,selected.event,valueField.value):Entry.lyric(abc,source,selected.event,valueField.value,entryVerse);localError.textContent='';commit(r.source,r.anchor);}catch(error){localError.textContent=I18n.translate(error.message,I18n.language(self.wiki));}}
 valueField.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();applyValue();}});pitchSelect.addEventListener('change',function(){setMidi(Number(pitchSelect.value),false);});
 mode.addEventListener('change',function(){var kind=mode.value;if(!allowSelection()){mode.value=selected&&selected.kind==='rest'?'note':selected?selected.kind:'note';return;}if(selected)choose(atEvent(selected.event,kind),true);else if(map&&map.events.length)choose(atEvent(map.events[0],kind),true);syncEntry();});
 function keys(e){if(e.defaultPrevented||e.isComposing)return;if(e.target.closest&&e.target.closest('.huwabc-page-toolbar,.huwabc-page-nav'))return;
  if(e.target===codearea||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.target.isContentEditable)return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();preview.focus({preventScroll:true});return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();navigate(e.key==='ArrowLeft'?-1:1);}
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();movePitch(e.key==='ArrowUp'?1:-1,e.shiftKey);}
  if(entryMode&&e.repeat&&/^[a-g0-5]$/i.test(e.key)){e.preventDefault();return;}
  if(entryMode&&/^[1-5]$/.test(e.key)){e.preventDefault();entryLength=[1,.5,.25,.125,.0625][Number(e.key)-1];syncEntry();}
  if(entryMode&&e.key==='0'){e.preventDefault();writeHere('z',entryLength,true);}
  if(entryMode&&/^[a-g]$/i.test(e.key)){e.preventDefault();var pitchClass={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[e.key.toUpperCase()],acc=selected&&(selected.event.key||{})[e.key.toUpperCase()]||0;setMidi((Math.floor(lastEntryMidi/12))*12+pitchClass+acc,acc<0);}
 }
 host.addEventListener('keydown',keys);
 function bind(item,node){if(!node)return;(item.nodes||(item.nodes=[])).push(node);node.dataset.huwabcItem=item.id;node.setAttribute('role','button');node.setAttribute('aria-label',item.kind==='rest'?'Pause':item.kind==='note'?'Node '+item.value:item.kind==='chord'?'Becifring '+item.value:'Sangstavelse '+model.lyricDisplay(item.value));node.classList.add('huwabc-selectable');}
 function bindScore(){map.events.forEach(function(ev){var abs=ev.el.abselem;if(!abs)return;var notes=ev.notes.slice().sort(function(a,b){return a.pitch.d-b.pitch.d||a.start-b.start;});(abs.heads||[]).forEach(function(h,i){if(notes[i])bind(notes[i],h.graphelem);else if(ev.rest)bind(ev.rest,h.graphelem);});if(ev.rest&&(!ev.rest.nodes||!ev.rest.nodes.length))(abs.elemset||[]).forEach(function(n){if(n&&n.tagName)bind(ev.rest,n);});var chords=(abs.children||[]).filter(function(c){return c.type==='chord';});if(chords.length===ev.chords.length)chords.forEach(function(c,i){bind(ev.chords[i],c.graphelem);});(abs.children||[]).filter(function(c){return c.type==='lyric';}).forEach(function(c){var spans=c.graphelem?Array.from(c.graphelem.children):[];ev.lyrics.forEach(function(l){bind(l,spans[l.verse]||(!spans.length?c.graphelem:null));});});});}
 function bindTabNumbers(){preview.querySelectorAll('[data-huwabc-tab-source]').forEach(function(node){var event=map.events.find(function(e){return e.start===Number(node.dataset.huwabcTabSource);});if(!event)return;var item=event.notes.slice().sort(function(a,b){return a.pitch.d-b.pitch.d||a.start-b.start;})[Number(node.dataset.huwabcTabIndex)];if(item){bind(item,node);node.setAttribute('aria-label','Tab '+item.value+', streng '+node.dataset.huwabcTabString+', bånd '+node.textContent);}});}
 function pointerItem(e){var n=e.target.closest&&e.target.closest('[data-huwabc-item]');return n&&map&&map.items.find(function(i){return i.id===n.dataset.huwabcItem;});}
 preview.addEventListener('pointerdown',function(e){if(e.button!==0)return;var item=pointerItem(e);if(!item)return;e.preventDefault();e.stopPropagation();if(choose(item,true)===false)return;var svg=e.target.ownerSVGElement,ctm=svg&&svg.getScreenCTM();drag={item:item,y:e.clientY,step:0,node:e.target.closest('[data-huwabc-item]'),scale:ctm?Math.hypot(ctm.c,ctm.d):1};drag.transform=drag.node.getAttribute('transform')||'';preview.setPointerCapture(e.pointerId);});
 preview.addEventListener('pointermove',function(e){if(!drag||drag.item.kind!=='note')return;var dy=e.clientY-drag.y,step=Math.abs(dy)<4?0:Math.round(-dy/(3.875*drag.scale));drag.step=step;drag.node.setAttribute('transform',drag.transform+' translate(0,'+(-step*3.875)+')');if(step)status.textContent='Slip for at flytte '+step+' trin.';});
 function endDrag(e,cancel){if(!drag)return;var d=drag;drag=null;d.node.setAttribute('transform',d.transform);if(preview.hasPointerCapture(e.pointerId))preview.releasePointerCapture(e.pointerId);if(!cancel&&d.step){selected=d.item;movePitch(d.step);}else updateSelection();}
 preview.addEventListener('pointerup',function(e){endDrag(e,false);});preview.addEventListener('pointercancel',function(e){endDrag(e,true);});
 // Own exact-node selection; prevent ABCJS from recolouring the entire chord group.
 ['mousedown','mouseup','click'].forEach(function(type){preview.addEventListener(type,function(e){e.stopPropagation();},true);});
 var settings=E('details','huwabc-advanced-settings'),grid=E('div','huwabc-form-grid');settings.appendChild(E('summary','','Nodearkets oplysninger · toneart, taktart, tempo, layout'));settings.appendChild(grid);
 var inputs={};
 function setting(title,code,opts,def){var val=tools.header(source,code)||def||'';if(code==='K')val=keyParts(val).key;if(code==='Q')val=val.replace(/^.*?=(\d+)$/,'$1');var field=opts?sel(opts,val):inp(val);inputs[code]=field;field.addEventListener('change',function(){header(code,field.value);});grid.appendChild(label(title,field));}
 setting('Titel på nodearket','T',null,'');setting('Komponist','C',null,'');setting('Toneart','K',KEY_OPTIONS,'C');setting('Taktart','M',METERS,'4/4');setting('Grundværdi','L',LENS,'1/8');setting('Tempo i BPM','Q',null,'100');setting('Rytmetype','R',null,'');
 var titleHelp=E('div','huwabc-title-help');
 titleHelp.appendChild(E('p','huwabc-muted','Tiddlerens navn bruges til links og indlejring. Titlen på nodearket står i ABC-kildens T:-felt. De to navne må gerne være forskellige.'));
 titleHelp.appendChild(B('Brug tiddlerens navn på nodearket',function(){
  var current=self.wiki.getTiddler(self.title),name=current&&(current.fields['draft.title']||current.fields['draft.of']||current.fields.title);
  if(name){header('T',name);saveDraft({'huwiki-score-title-source':undefined,'huwiki-score-title-da':undefined,'huwiki-score-title-en':undefined});}
 }));settings.appendChild(titleHelp);
 var layout=sel(LAYOUTS,tid.fields['abc-layout']||'standard');layout.addEventListener('change',function(){saveDraft({'abc-layout':layout.value});update();});grid.appendChild(label('Layout',layout));
 var chords=sel([['jazz','Jazzbecifringer'],['standard','Almindelig']],tid.fields['abc-chords-style']||'jazz');chords.addEventListener('change',function(){saveDraft({'abc-chords-style':chords.value});update();});grid.appendChild(label('Becifringer',chords));host.appendChild(settings);
 var voiceNames=VoiceNames.mount(host,function(){return source;},function(result){var target=selected?{kind:selected.kind,start:result.offset(selected.start)}:anchor?{kind:anchor.kind,start:result.offset(anchor.start)}:null;commit(result.source,target);},self.wiki);
 var noteDetails=E('details','huwabc-advanced-settings');noteDetails.appendChild(E('summary','','Øvemål og undervisningsnoter'));var notes=E('textarea','huwabc-notes');notes.value=tid.fields.text||'';notes.spellcheck=true;notes.setAttribute('aria-label','Undervisningsnoter');noteDetails.appendChild(notes);notes.addEventListener('input',function(){var old=self.wiki.getTiddler(self.title);if(old)self.wiki.addTiddler(new $tw.Tiddler(old,{text:notes.value}));});host.appendChild(noteDetails);
 // Reuse the wired panes, rather than creating a second source field or draft.
 var workspace=E('section','huwabc-editor-workspace'),workspaceHead=E('div','huwabc-editor-workspace-head'),workspaceGrid=E('div','huwabc-editor-workspace-grid');
 var noteColumn=E('div','huwabc-editor-notes-column'),textColumn=E('div','huwabc-editor-source-column');
 workspaceHead.appendChild(E('span','','Klik en node for at finde teksten. Page Up/Down bladrer uden at ændre musikken.'));
 var frame=host.closest('.tc-tiddler-frame'),expanded=false,bodyOverflow='',oldWindowScroll=0;
 var expand=B('Udvid arbejdsområde',function(){
  if(!frame)return;expanded=!expanded;frame.classList.toggle('huwabc-editor-expanded',expanded);
  if(expanded){oldWindowScroll=window.scrollY;bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  else{document.body.style.overflow=bodyOverflow;window.scrollTo(0,oldWindowScroll);}
  expand.textContent=expanded?'Tilbage til wikien':'Udvid arbejdsområde';
 });workspaceHead.appendChild(expand);workspace.appendChild(workspaceHead);
 workspaceGrid.appendChild(noteColumn);workspaceGrid.appendChild(textColumn);workspace.appendChild(workspaceGrid);host.insertBefore(workspace,host.firstChild);
 noteColumn.appendChild(previewPanel);textColumn.appendChild(sourcePanel);textColumn.appendChild(selection);textColumn.appendChild(details);
 var extra=E('details','huwabc-edit-options');extra.appendChild(E('summary','','Opsætning, instrumenter og øvenoter'));
 Array.from(host.children).forEach(function(n){if(n!==workspace)extra.appendChild(n);});workspace.appendChild(extra);
 // One set of selection controls is reused in-flow and at the clicked item.
 var musicWrap=E('div','huwabc-context-music');while(selection.firstChild)musicWrap.appendChild(selection.firstChild);selection.appendChild(musicWrap);
 var common=E('div','huwabc-context-common');common.appendChild(undoButton);common.appendChild(redoButton);
 var metaBody=E('div','huwabc-context-meta'),metaInput=inp(''),metaShort=inp(''),metaMainLabel=label('Titel på nodearket',metaInput),metaShortLabel=label('Kort navn',metaShort);
 metaInput.classList.add('huwabc-context-text');metaShort.classList.add('huwabc-context-short');metaBody.appendChild(metaMainLabel);metaBody.appendChild(metaShortLabel);
 var metaHelp=E('p','huwabc-context-meta-help');metaBody.appendChild(metaHelp);metaBody.appendChild(B('Anvend',applyMeta,'huwabc-context-apply'));metaBody.hidden=true;selection.appendChild(metaBody);selection.appendChild(common);
 var localError=E('div','huwabc-context-error');localError.setAttribute('role','status');selection.appendChild(localError);
 contextPopup=SelectionPopover.mount(host,selection,{wiki:self.wiki,state:self._viewState,cancel:cancelContext,focus:function(){preview.focus({preventScroll:true});}});self._contextPopup=contextPopup;syncEntry();
 function tr(da,en){return I18n.language(self.wiki)==='da'?da:en;}
 function valueForSelected(){return !selected?'':selected.kind==='lyric'?model.lyricDisplay(selected.value):selected.value;}
 function pendingContext(){
  if(!contextPopup)return false;
  if(metadata)return metaInput.value!==(metadata.kind==='voice'?metadata.name:metadata.value)||metadata.kind==='voice'&&metaShort.value!==metadata.short;
  return !!(selected&&(selected.kind==='chord'||selected.kind==='lyric')&&valueField.value!==valueForSelected());
 }
 function allowSelection(){if(!pendingContext())return true;localError.textContent=tr('Anvend ændringen, eller tryk Esc for at annullere den først.','Apply the change or press Esc to cancel it first.');return false;}
 function cancelContext(){localError.textContent='';if(metadata){metadata=null;metaKey=null;preview.querySelectorAll('.huwabc-meta-selected').forEach(function(n){n.classList.remove('huwabc-meta-selected');});}valueField.value=valueForSelected();updateSelection(true);}
 function refreshMeta(){
  if(!metadata)return;
  musicWrap.hidden=true;metaBody.hidden=false;localError.textContent='';
  preview.querySelectorAll('.huwabc-selected,.huwabc-meta-selected').forEach(function(n){n.classList.remove('huwabc-selected','huwabc-meta-selected');});metadata.node.classList.add('huwabc-meta-selected');
  var voice=metadata.kind==='voice',caption=voice?tr('Fuldt navn','Full name'):metadata.kind==='title'?tr('Titel på nodearket','Score title'):tr('Komponist','Composer');
  metaMainLabel.querySelector('span').textContent=caption;metaInput.setAttribute('aria-label',caption+(voice?' · V:'+metadata.id:''));
  metaShort.setAttribute('aria-label',tr('Kort navn','Short name')+(voice?' · V:'+metadata.id:''));metaShortLabel.hidden=!voice;
  metaInput.value=voice?metadata.name:metadata.value;metaShort.value=voice?metadata.short:'';
  metaHelp.textContent=voice?tr('V:'+metadata.id+' · Fuldt navn på første system, kort navn på de næste.','V:'+metadata.id+' · Full name on the first system, short name thereafter.'):
   metadata.kind==='title'?tr('Ændrer kun nodearkets T:-felt, ikke tiddlerens navn.','Changes only the score T: field, not the tiddler name.'):
   tr('Ændrer komponisten i ABC-kildens C:-felt.','Changes the composer in the ABC C: field.');
  undoButton.disabled=!history.length;redoButton.disabled=!future.length;metaSource=source;
  markSource(metadata,true);
  contextPopup.refresh(metadata.node);
 }
 function chooseMeta(entry){
  if(!entry||!allowSelection())return false;
  selected=null;anchor=null;metadata=entry;metaKey=entry.key;refreshMeta();pager.revealNode(entry.node,false);
  markSource(entry,false);contextPopup.show(entry.node);metaInput.focus({preventScroll:true});metaInput.select();return true;
 }
 function applyMeta(){
  if(!metadata)return;
  if(metaSource!==source){localError.textContent=tr('ABC-kilden er ændret. Tryk Esc og vælg teksten igen.','ABC source changed. Press Esc and select the text again.');return;}
  try{var result=ScoreText.apply(source,metadata,metadata.kind==='voice'?{name:metaInput.value,short:metaShort.value}:{value:metaInput.value});localError.textContent='';commit(result.source,null);}
  catch(error){localError.textContent=I18n.translate(error.message,I18n.language(self.wiki));}
 }
 [metaInput,metaShort].forEach(function(input){input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();applyMeta();}});});
 preview.addEventListener('pointerdown',function(e){var n=e.target.closest&&e.target.closest('[data-huwabc-meta]');if(!n||e.button!==0)return;e.preventDefault();e.stopPropagation();chooseMeta(metaItems.find(function(m){return m.node===n;}));});
 preview.addEventListener('keydown',function(e){var n=e.target.closest&&e.target.closest('[data-huwabc-meta]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();chooseMeta(metaItems.find(function(m){return m.node===n;}));}});

 self._closeExpanded=function(){if(expanded){frame.classList.remove('huwabc-editor-expanded');document.body.style.overflow=bodyOverflow;window.scrollTo(0,oldWindowScroll);expanded=false;}};
 function rememberReadingPlace(){
  if(!self._originViewState||!map)return;
  var index=selected?map.events.indexOf(selected.event):null;
  if(index===null||index<0)return;
  try{var state=JSON.parse(self.wiki.getTiddlerText(self._originViewState,'{}'));if(state.pageAnchor!==index){state.pageAnchor=index;self.wiki.setText(self._originViewState,'text',null,JSON.stringify(state));}}catch(ignore){}
 }
 function revealSource(){
  var sourceSelection=metadata||selected;if(!sourceSelection||!codearea.clientWidth)return;
  var mirror=E('div'),marker=E('span','','|'),style=getComputedStyle(codearea);
  mirror.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;';
  ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','tabSize'].forEach(function(k){mirror.style[k]=style[k];});
  mirror.style.width=codearea.clientWidth+'px';mirror.appendChild(document.createTextNode(codearea.value.slice(0,sourceSelection.start)));mirror.appendChild(marker);document.body.appendChild(mirror);
  var y=marker.getBoundingClientRect().top-mirror.getBoundingClientRect().top;mirror.remove();
  if(y<codearea.scrollTop+8||y>codearea.scrollTop+codearea.clientHeight-25){codearea.scrollTop=Math.max(0,y-codearea.clientHeight*.35);codearea.dispatchEvent(new Event('scroll'));}
 }
 function sync(){if(voiceNames)voiceNames.update();if(sourceAssist)sourceAssist.update();if(transposeControls)transposeControls.sync();['T','C','K','M','L','R','Q'].forEach(function(k){var v=tools.header(source,k);if(k==='K')v=keyParts(v).key;if(k==='Q')v=v.replace(/^.*?=(\d+)$/,'$1');if(inputs[k]&&document.activeElement!==inputs[k])inputs[k].value=v;});}
 function update(){if(timer)clearTimeout(timer);timer=setTimeout(renderPreview,mobileWebKit?420:130);}
 function renderPreview(){
  if(!abc||!host.isConnected)return;if(timer){clearTimeout(timer);timer=null;}
  var scroll=viewport.scrollTop,stage=E('div','huwabc-edit-preview'),oldSource=map&&map.source;
  // Drop the old score's composited layer while constructing replacement SVGs,
  // avoiding two full displayed scores on memory-constrained WebKit.
  var oldVisibility=preview.style.visibility;
  preview.style.visibility='hidden';
  stage.style.cssText='position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:100%;';preview.parentNode.appendChild(stage);
  try{
   var parsedSource=abc.parseOnly(source)[0];if(!parsedSource)throw new Error('Ingen læsbare noder.');
   var tabOptions=tabs.options(abc,source,tabControls.enabled(),tabControls.config());tabControls.availability(tabOptions.options.length>0);
   host.classList.toggle('huwabc-with-tabs',tabOptions.options.length>0);
   var current=self.wiki.getTiddler(self.title),useJazz=current.fields['abc-font']==='petaluma';
   var result=jazzFont.render(abc,useJazz,function(){return abc.renderAbc(stage,source,Object.assign({
    tablature:tabOptions.options,oneSvgPerLine:true,expandToWidest:true,
    afterParsing:function(tune){sheetLayout.prepare(tune,current.fields,source);tune.formatting.staffsep=tabControls.config().rhythm?145:90;if(tabControls.config().rhythm)tune.formatting.sysstaffsep=120;tabs.notation.project(abc,tune,tabControls.config(),tabControls.notationActive());if(tabOptions.options.length)tune.tablatures=abc.parseOnly(source,{tablature:tabOptions.options})[0].tablatures;},
    format:jazzFont.formatFonts(useJazz,{stretchlast:true,gchordfont:useJazz?'PetalumaScript 20':'Helvetica 18 bold'}),responsive:'resize',staffwidth:720,
    scale:layout.value==='kompakt'?.88:1,jazzchords:chords.value!=='standard',add_classes:true,selectTypes:false,
    wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:layout.value==='jazz'?4:3}
   },sheetLayout.options(abc,source,current.fields)));});
   if(!result||!result[0])throw new Error('Ingen læsbare noder.');
   var warnings=Array.from(new Set((parsedSource.warnings||[]).concat(result[0].warnings||[]))).map(function(s){return String(s).replace(/<[^>]*>/g,'');});
   if(warnings.length&&preview.querySelector('svg')&&oldSource!==source)throw new Error(warnings.slice(0,2).join(' · '));
   var tabWarning=tabOptions.options.length?tabs.finish(result[0],tabControls.config()):'';
   if(tabOptions.options.length&&!tabControls.showNotes())tabs.only(stage,result[0]);if(tabOptions.options.length)tabs.rhythm(stage,result[0],tabControls.config());
   var nextMap=tabs.notation.link(model.build(source,parsedSource),result[0]);
   preview.textContent='';while(stage.firstChild)preview.appendChild(stage.firstChild);map=nextMap;
   pager.layout(result[0],current.fields);bindScore();bindTabNumbers();metaItems=ScoreText.bind(preview,source,map);metadata=metaKey?metaItems.find(function(m){return m.key===metaKey;})||null:null;
   metaItems.forEach(function(m){m.node.setAttribute('aria-label',tr('Redigér ','Edit ')+(m.kind==='voice'?('V:'+m.id):m.kind==='title'?tr('titel','title'):tr('komponist','composer')));});
   if(metaKey&&!metadata){metaKey=null;if(contextPopup)contextPopup.hide();}
   selected=metadata?null:restoreAnchor();
   if(!metadata&&!selected&&Number.isInteger(self._requestedPageEvent)){
    var event=map.events[Math.min(self._requestedPageEvent,map.events.length-1)];
    selected=event&&(event.notes[0]||event.rest||event.chords[0]||event.lyrics[0]);self._requestedPageEvent=null;
   }
   // Keep the text cursor and notation together when typing changes the page plan.
   if(!metadata&&!selected&&document.activeElement===codearea){var at=codearea.selectionStart;selected=map.items.find(function(i){return at>=i.start&&at<i.end;})||null;}
   if(selected&&selected.nodes&&selected.nodes[0])pager.revealNode(selected.nodes[0],true);else viewport.scrollTop=scroll;
   updateSelection(document.activeElement===codearea);rememberReadingPlace();
   status.textContent=tabOptions.message||tabWarning||(warnings.length?warnings.slice(0,2).join(' · '):(tabControls.enabled()?'Noder, tabs og ABC-kilde er opdateret':'Noder og ABC-kilde er opdateret'));
   status.className='huwabc-preview-status'+(warnings.length?' huwabc-error':'');preview.removeAttribute('aria-disabled');
  }catch(ex){map=null;selected=null;metadata=null;metaKey=null;if(contextPopup)contextPopup.hide();updateSelection(true);preview.setAttribute('aria-disabled','true');status.textContent='Visningen er ikke opdateret: '+ex.message;status.className='huwabc-preview-status huwabc-error';}
  finally{stage.remove();preview.style.visibility=oldVisibility;}
 }

 function fromCursor(){if(!map)return;var at=codearea.selectionStart,item=map.items.find(function(i){return at>=i.start&&at<i.end;}),ev=Entry.eventAt(map,at);if(item||ev)choose(item||atEvent(ev,mode.value),false,true);}
 codearea.addEventListener('click',fromCursor);codearea.addEventListener('keyup',function(e){if(e.key.startsWith('Arrow'))fromCursor();});
 codearea.addEventListener('input',function(){history.push(snapshot());metadata=null;metaKey=null;if(contextPopup)contextPopup.hide();if(history.length>100)history.shift();future=[];source=codearea.value.replace(/\r\n?/g,'\n');anchor=null;selected=null;updateSelection();saveDraft();sync();update();});
 tools.load().then(function(lib){return jazzFont.ready(document).then(function(){return lib;});}).then(function(lib){if(!host.isConnected)return;abc=lib;transposeControls.sync();renderPreview();}).catch(function(ex){status.textContent='ABCJS kunne ikke indlæses: '+ex.message;});
};
Editor.prototype.refresh=function(changes){var attr=this.computeAttributes();if(attr.tiddler){this.refreshSelf();return true;}return false;};
exports['huwiki-abc-edit']=Editor;
})();
