/*\
title: $:/plugins/huwiki/repertoire/book-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var model=require("$:/plugins/huwiki/repertoire/model.js");
var Layout=require("$:/plugins/huwiki/repertoire/book-layout.js");
var Practice=require("$:/plugins/huwiki/repertoire/practice.js");
var Printing=require("$:/plugins/huwiki/repertoire/print.js");
var LiveScore=require("$:/plugins/huwiki/repertoire/live-score.js");
var TEMP="$:/temp/huwiki/repertoire/active-setlist";
var MODE="$:/temp/huwiki/repertoire/book-mode";
function el(doc,tag,cls,label){
 var n=doc.createElement(tag);
 if(cls)n.className=cls;
 if(label!==undefined)n.textContent=String(label);
 return n;
}
function btn(doc,label,onClick,css){
 var b=el(doc,"button","huwrep-button "+(css||""),label);
 b.type="button";b.addEventListener("click",onClick);return b;
}
function choice(doc,id,label){
 var o=el(doc,"option","",label);o.value=id;return o;
}
function name(wiki,item){
 var t=wiki.getTiddler(item);return t?t.fields["music-title"]||item:item;
}
function shortName(wiki,item){
 var original=name(wiki,item),post=wiki.getTiddler(item);
 var orchestra=post&&wiki.getTiddler(post.fields["orchestra-title"]),label=orchestra&&(orchestra.fields.name||orchestra.fields.title)||"";
 var prefix=label+" · ";
 return label&&original.indexOf(prefix)===0?original.slice(prefix.length):original;
}
function prefersFrameSeparatedEdit(win){
 var nav=win&&win.navigator,ua=String(nav&&nav.userAgent||"");
 // iPadOS can advertise itself as a desktop Mac even in Chrome on iPad.
 return /iPad|iPhone|iPod/i.test(ua)||(/Macintosh/.test(ua)&&Number(nav&&nav.maxTouchPoints)>1);
}
function Book(parseTreeNode,options){this.initialise(parseTreeNode,options);}
Book.prototype=new Widget();
Book.prototype.disposeScore=function(){
 this._practiceBaseline=null;this._practiceAppliedKey=null;
 this._practiceScoreHost=null;this._practiceControls=null;
 if(this._observer){this._observer.disconnect();this._observer=null;}
 if(this._score){
  // Keep the immersive ABC reading state when a page turn changes melody.
  if(this._score._reader)this._readerCarry=this._score._reader.snapshot();
  try{this._score.onDestroy();}catch(_ignored){}
  this._score=null;
 }
 this.children=[];
};
Book.prototype.onDestroy=function(){
 if(this._editRaf&&this._win&&this._win.cancelAnimationFrame)this._win.cancelAnimationFrame(this._editRaf);
 this._editRaf=null;
 if(this._editCheck&&this._win)this._win.clearTimeout(this._editCheck);
 this._editCheck=null;this._editReturn=null;this._returnPage=null;
 this.disposeScore();
 if(this.host&&this._boundKeys)this.host.removeEventListener("keydown",this._boundKeys);
 if(this.host&&this._readerBoundary)this.host.removeEventListener("huwabc-reader-boundary",this._readerBoundary);
 this._boundKeys=null;this._readerBoundary=null;
 if(this._win&&this._resize)this._win.removeEventListener("resize",this._resize);
 if(this._win&&this._orientation)this._win.removeEventListener("orientationchange",this._orientation);
 this._win=null;this._resize=null;this._orientation=null;
 if(this.host)this.host.classList.remove("huwrep-book-fullscreen");
};
Book.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 var doc=this.document;
 var host=this.host=el(doc,"section","huwrep-book");
 parent.insertBefore(host,nextSibling);this.domNodes.push(host);
 if(this.getAttribute("fullscreen","no")==="yes")host.classList.add("huwrep-book-fullscreen");
 if(doc.isTiddlyWikiFakeDom){
  host.appendChild(el(doc,"p","","Nodebogen er interaktiv. Åbn wikien i browseren for at bruge den."));
  return;
 }
 this._win=doc.defaultView;
 this.addEventListener("tm-edit-tiddler","handleEditTiddler");
 this.preference=this.wiki.getTiddlerText(MODE)||"auto";
 if(["auto","single","spread"].indexOf(this.preference)<0)this.preference="auto";
 this.setlistTitle=this.getAttribute("setlist","")||this.wiki.getTiddlerText(TEMP)||"";
 this.activeItem="";
 this.practiceEnabled=false;this.practiceMetronome=false;
 this.practiceMuteByItem=Object.create(null);this.practiceOpen=false;
 this._resize=this.updateMode.bind(this);
 this._orientation=this.updateMode.bind(this);
 this._boundKeys=this._onKeyDown.bind(this);
 host.addEventListener("keydown",this._boundKeys);
 var self=this;
 this._readerBoundary=function(event){
  if(!event||!event.detail)return;
  var delta=Number(event.detail.direction);
  if(delta!==1&&delta!==-1)return;
  event.stopPropagation();
  self.turn(delta);
 };
 host.addEventListener("huwabc-reader-boundary",this._readerBoundary);
 if(this._win){
  this._win.addEventListener("resize",this._resize);
  this._win.addEventListener("orientationchange",this._orientation);
 }
 this.draw();
};
Book.prototype.handleEditTiddler=function(event){
 var title=event.param||event.tiddlerTitle,score=this._score;
 // A second click from the old menu must not open another draft while the
 // first request is being handed to TiddlyWiki's normal navigator.
 if(this._editReturn&&this._editReturn.source===title)return false;
 if(!score||score.title!==title)return true;
 var pager=this.pager(),story=this.getVariable("tv-story-list")||"$:/StoryList";
 var reader=score._reader?score._reader.snapshot():this._readerCarry;
 if(reader)reader=Object.assign({},reader,{controlsOpen:false});
 var state={source:title,item:this.activeItem,setlist:this.setlistTitle,
  reader:reader,
  anchor:pager&&pager.anchor?pager.anchor():null,
  fullscreen:this.host.classList.contains("huwrep-book-fullscreen"),
  story:story,sourceWasOpen:this.wiki.getTiddlerList(story).indexOf(title)>=0,
  draft:null};
 this._editReturn=state;
 // Release the old SVG, audio and observers before the draft editor renders.
 // Merely leaving ABC's reader otherwise leaves the fullscreen book on top.
 this.disposeScore();
 this.host.classList.remove("huwrep-book-fullscreen","huwrep-reader-active","huwrep-reader-practice");
 this.host.hidden=true;this.host.textContent="";
 // On physical iPads a draft rendered in the SAME frame as the old animated
 // score can exhaust WebKit's tab memory. Let the old SVG/audio layers be
 // painted away over two frames before the native navigator creates a draft.
 // The original edit event is forwarded once, from our parent (bypassing this
 // book's own handler), without creating another editor or changing the source.
 if(prefersFrameSeparatedEdit(this._win)&&this._win.requestAnimationFrame&&this.parentWidget){
  var self=this,win=this._win,parent=this.parentWidget;
  state.pendingNavigation=true;
  this._editRaf=win.requestAnimationFrame(function(){
   self._editRaf=win.requestAnimationFrame(function(){
    self._editRaf=null;
    if(self._editReturn!==state||!self.host||!self.host.isConnected)return;
    state.pendingNavigation=false;
    parent.dispatchEvent(event);
    self.queueEditorCheck();
   });
  });
  return false;
 }
 this.queueEditorCheck();
 return true; // Desktop handoff stays native and synchronous.
};
Book.prototype.queueEditorCheck=function(){
 if(!this._editReturn||this._editCheck||!this._win)return;
 var self=this;
 // The navigator creates/reuses the draft synchronously after our handler.
 // Inspect on the next turn, never between edit-focus and draft creation.
 this._editCheck=this._win.setTimeout(function(){
  self._editCheck=null;self.checkEditorReturn();
 },0);
};
Book.prototype.checkEditorReturn=function(){
 var state=this._editReturn;
 if(!state||state.pendingNavigation||!this.host||!this.host.isConnected)return;
 var draft=this.wiki.findDraft(state.source),story=this.wiki.getTiddlerList(state.story);
 if(draft&&story.indexOf(draft)>=0){state.draft=draft;return;}
 // Save/cancel replace the draft with the original in the story. If the song
 // was opened just for this edit, the book remains its one reader on return.
 if(!state.sourceWasOpen&&story.indexOf(state.source)>=0){
  this.wiki.addTiddler(new $tw.Tiddler(this.wiki.getTiddler(state.story),{
   title:state.story,list:story.filter(function(title){return title!==state.source;})
  }));
  // A StoryList write schedules TiddlyWiki's DOM refresh. Let it dispose the
  // temporary standalone reader before mounting the embedded score again.
  state.returning=true;this.queueEditorCheck();return;
 }
 this._editReturn=null;
 this.activeItem=state.item;this.setlistTitle=state.setlist;
 this._readerCarry=state.reader;this._returnPage=state.anchor;
 this.host.hidden=false;this.host.classList.toggle("huwrep-book-fullscreen",state.fullscreen);
 this.draw();
};
Book.prototype.navigate=function(title){
 this.dispatchEvent({type:"tm-navigate",navigateTo:title,
  navigateFromTitle:this.getVariable("currentTiddler"),navigateFromNode:this,
  navigateSuppressNavigation:false});
};
Book.prototype.selectSetlist=function(title){
 this.setlistTitle=title;this.activeItem="";
 this.wiki.addTiddler(new $tw.Tiddler({title:TEMP,type:"text/plain",text:title}));
 this.draw();
};
Book.prototype.selectItem=function(title,last){
 this.activeItem=title;this.lastPage=!!last;
 this.draw();
};
Book.prototype.pager=function(){
 return this._score&&this._score._pager&&this._score._pager.element&&this._score._pager.element.isConnected?
  this._score._pager:null;
};
Book.prototype.updateMode=function(){
 if(!this.host||!this.host.isConnected||!this._win)return;
 var width=this._win.innerWidth,height=this._win.innerHeight;
 var mode=Layout.mode(this.preference,width,height),selector;
 var pager=this.pager();
 if(!pager)return;
 selector=pager.element.querySelector(".huwabc-page-select");
 if(selector&&selector.value!==mode){
  selector.value=mode;
  selector.dispatchEvent(new this._win.Event("change",{bubbles:true}));
 }
 if(this._displayMode){
  this._displayMode.textContent=mode==="spread"?"To sider":"Én side";
 }
 if(this.lastPage&&pager.info().count>0){
  this.lastPage=false;
  pager.go(pager.info().count-1,false);
 }
 if(this._returnPage&&pager.info().count>0){
  var anchor=this._returnPage;this._returnPage=null;
  if(!Number.isInteger(anchor.event)||!pager.revealOrdinal||!pager.revealOrdinal(anchor.event,true))
   pager.go(Number(anchor.page)||0,false);
 }
};
Book.prototype.turn=function(delta){
 var all=model.entries(this.wiki,this.setlistTitle);
 var i=all.indexOf(this.activeItem),pager=this.pager();
 if(i<0)return;
 if(!pager){
  // No ABC pages (text or scanned artwork): turning means changing song.
  var sibling=i+delta;if(sibling>=0&&sibling<all.length)this.selectItem(all[sibling],delta<0);
  return;
 }
 var info=pager.info(),target=Layout.direction(info.page,info.count,info.shown,delta,i,all.length);
 if(target.kind==="page"){
  if(delta>0)pager.next();else pager.previous();
 }else if(target.kind==="song"){
  this.selectItem(all[target.index],target.lastPage);
 }else if(target.kind==="unready"){
  // A large ABC score may still be drawing: don't skip to the next tune.
  if(this._pageStatus)this._pageStatus.textContent="Noderne indlæses …";
 }
};
Book.prototype.applyPractice=function(){
 var score=this._score,control=score&&score._accompControls;
 if(!control||!control.config||!control.setConfig)return;
 if(!this._practiceBaseline){
  // Preserve the original mix, without modifying its tiddler.
  this._practiceBaseline=JSON.parse(JSON.stringify(control.config()));
 }
 var chosen=this.practiceMuteByItem[this.activeItem]||"";
 var token=JSON.stringify({enabled:this.practiceEnabled,metro:this.practiceMetronome,
  mute:chosen,item:this.activeItem});
 if(this._practiceAppliedKey===token)return;
 var next=Practice.overlay(this._practiceBaseline,{
  enabled:this.practiceEnabled,metronome:this.practiceMetronome,voice:chosen
 });
 this._practiceAppliedKey=token;
 // The existing ABC mixer updates independent GainNodes during playback,
 // including the metronome channel. The score's visual clock is untouched.
 control.setConfig(next,false);
 if(this._practiceControls&&this._practiceControls.status){
  this._practiceControls.status.textContent=this.practiceEnabled?
   (chosen?"Den valgte stemme er lydløs. ":"Alle noterede stemmer kan høres. ")+
   (this.practiceMetronome?"Metronom til. ":"Metronom fra. ")+
   "Nodefølget fortsætter under afspilning.":
   "Øvetilstand er slået fra. Den almindelige lydblanding er gendannet.";
 }
};
Book.prototype.syncPracticeVoices=function(){
 if(!this._practiceControls||!this._practiceScoreHost)return;
 var voices=Array.from(this._practiceScoreHost.querySelectorAll(".huwabc-voice-row[data-voice-index]"))
  .map(function(row){return {id:row.getAttribute("data-voice-index"),
   name:(row.querySelector(".huwabc-voice-name")||row).textContent.trim()};})
  .filter(function(v){return /^(?:0|[1-9]\d*)$/.test(v.id);});
 if(!voices.length)return;
 var signature=voices.map(function(v){return v.id+":"+v.name;}).join("|");
 if(this._practiceVoiceSignature===signature)return;
 this._practiceVoiceSignature=signature;
 var select=this._practiceControls.voice,doc=this.document,selected=this.practiceMuteByItem[this.activeItem]||"";
 select.textContent="";
 select.appendChild(choice(doc,"","Ingen – alle stemmer høres"));
 voices.forEach(function(v){select.appendChild(choice(doc,v.id,v.name));});
 if(selected&&!voices.some(function(v){return v.id===selected;})){
  this.practiceMuteByItem[this.activeItem]="";selected="";
 }
 select.value=selected;
 this.applyPractice();
};
Book.prototype.practicePanel=function(doc){
 var self=this,box=el(doc,"details","huwrep-book-practice");
 box.open=!!this.practiceOpen;
 box.appendChild(el(doc,"summary","","Øvetilstand · Music Minus One"));
 box.addEventListener("toggle",function(){self.practiceOpen=box.open;});
 var controls=el(doc,"div","huwrep-book-practice-controls");
 var enabledLabel=el(doc,"label","huwrep-book-practice-check");
 var enabled=el(doc,"input");enabled.type="checkbox";enabled.checked=!!this.practiceEnabled;
 enabledLabel.append(enabled,doc.createTextNode(" Øvetilstand aktiv"));controls.appendChild(enabledLabel);
 var metronomeLabel=el(doc,"label","huwrep-book-practice-check");
 var metronome=el(doc,"input");metronome.type="checkbox";
 metronome.checked=!!this.practiceMetronome;metronome.disabled=!this.practiceEnabled;
 metronomeLabel.append(metronome,doc.createTextNode(" Metronom"));controls.appendChild(metronomeLabel);
 var muteLabel=el(doc,"label","huwrep-book-practice-voice");
 muteLabel.appendChild(el(doc,"span","","Spil selv – dæmp denne stemme"));
 var voice=el(doc,"select","huwrep-input");
 voice.setAttribute("aria-label","Music Minus One: vælge stemme der skal være lydløs");
 voice.appendChild(choice(doc,"","Ingen – alle stemmer høres"));
 voice.value=this.practiceMuteByItem[this.activeItem]||"";
 voice.disabled=!this.practiceEnabled;muteLabel.appendChild(voice);controls.appendChild(muteLabel);
 var status=el(doc,"p","huwrep-muted","Vælg metronom og en stemme. Nodefølget fortsætter, selv om stemmen er lydløs.");
 status.setAttribute("role","status");controls.appendChild(status);
 box.appendChild(controls);
 this._practiceControls={enabled:enabled,metronome:metronome,voice:voice,status:status};
 enabled.addEventListener("change",function(){
  self.practiceEnabled=enabled.checked;metronome.disabled=voice.disabled=!self.practiceEnabled;
  self._practiceAppliedKey=null;self.applyPractice();
 });
 metronome.addEventListener("change",function(){
  self.practiceMetronome=metronome.checked;self._practiceAppliedKey=null;self.applyPractice();
 });
 voice.addEventListener("change",function(){
  self.practiceMuteByItem[self.activeItem]=voice.value;
  self._practiceAppliedKey=null;self.applyPractice();
 });
 return box;
};
Book.prototype.draw=function(){
 var self=this,doc=this.document,wiki=this.wiki,host=this.host;
 if(!host||this._editReturn)return;
 this.disposeScore();host.textContent="";
 var sets=model.orchestras(wiki).flatMap(function(o){return model.setlists(wiki,o.fields.title);});
 if(!sets.some(function(s){return s.fields.title===self.setlistTitle;}))
  this.setlistTitle=sets.length?sets[0].fields.title:"";
 var set=wiki.getTiddler(this.setlistTitle),all=set?model.entries(wiki,this.setlistTitle):[];
 if(all.indexOf(this.activeItem)<0)this.activeItem=all.length?all[0]:"";
 var index=all.indexOf(this.activeItem);
 var toolbar=el(doc,"header","huwrep-book-header");host.appendChild(toolbar);
 toolbar.appendChild(btn(doc,"← Repertoireværksted",function(){
  self.disposeScore();host.classList.remove("huwrep-book-fullscreen");host.hidden=true;self.navigate("HUWiki Repertoire – Start");
 }));
 var fullScreenButton=btn(doc,host.classList.contains("huwrep-book-fullscreen")?"⛶ Mindre visning":"⛶ Fuldskærm",function(){
  var isFull=host.classList.toggle("huwrep-book-fullscreen");
  fullScreenButton.textContent=isFull?"⛶ Mindre visning":"⛶ Fuldskærm";
  self.updateMode();
 },"huwrep-book-fullscreen-button");
 toolbar.appendChild(fullScreenButton);
 var printMenu=el(doc,"details","huwrep-book-print-menu");
 printMenu.appendChild(el(doc,"summary","","PDF / Udskriv"));
 var printActions=el(doc,"div","huwrep-book-print-actions");
 var printInstrument=el(doc,"select","huwrep-input");
 printInstrument.setAttribute("aria-label","Instrument i udgivelsen");
 [["c","C · klingende"],["bb","B♭ · +2 halvtoner"],["eb","E♭ · sopranino"],["ebalto","E♭ · altsaxofon"]].forEach(function(p){printInstrument.appendChild(choice(doc,p[0],p[1]));});
 printActions.appendChild(printInstrument);
 function openPrint(scores){
  printMenu.open=false;
  var result=Printing.open(wiki,self.setlistTitle,self,{scores:scores,instrumentId:printInstrument.value});
  if(result&&result.error&&self._win&&self._win.alert)self._win.alert(result.error);
 }
 printActions.appendChild(btn(doc,"Sætliste og aftaler",function(){openPrint(false);}));
 printActions.appendChild(btn(doc,"Hele nodebogen med noder",function(){openPrint(true);},"huwrep-primary"));
 printMenu.appendChild(printActions);toolbar.appendChild(printMenu);
 if(wiki.getTiddler("$:/plugins/huwiki/site-publisher"))toolbar.appendChild(btn(doc,"Udgiv site",function(){
  var result=Printing.open(wiki,self.setlistTitle,self,{scores:true,site:true,instrumentId:printInstrument.value});
  if(result&&result.error&&self._win&&self._win.alert)self._win.alert(result.error);
 }));
 var selector=el(doc,"select","huwrep-input huwrep-book-select");
 selector.setAttribute("aria-label","Vælg sætliste");
 sets.forEach(function(s){
  var orch=wiki.getTiddler(s.fields["orchestra-title"]);
  selector.appendChild(choice(doc,s.fields.title,(orch?.fields.name||"Orkester")+" · "+(s.fields.name||s.fields.title)));
 });
 selector.value=this.setlistTitle;
 selector.addEventListener("change",function(){self.selectSetlist(this.value);});
 toolbar.appendChild(selector);
 var mode=el(doc,"select","huwrep-input huwrep-book-view");
 mode.setAttribute("aria-label","Visning på iPad");
 [["auto","Automatisk efter skærmretning"],["single","Én side"],["spread","To sider"]].forEach(function(x){mode.appendChild(choice(doc,x[0],x[1]));});
 mode.value=this.preference;
 mode.addEventListener("change",function(){
  self.preference=this.value;
  wiki.addTiddler(new $tw.Tiddler({title:MODE,type:"text/plain",text:this.value}));
  self.updateMode();
 });
 toolbar.appendChild(mode);
 this._displayMode=el(doc,"span","huwrep-muted huwrep-book-mode","");toolbar.appendChild(this._displayMode);
 var header=el(doc,"div","huwrep-book-heading");host.appendChild(header);
 if(!all.length){
  header.appendChild(el(doc,"h2","","Sætlisten er tom"));
  host.appendChild(el(doc,"p","huwrep-muted","Vælg en sætliste med numre i Repertoireværkstedet."));
  return;
 }
 header.appendChild(el(doc,"h2","",shortName(wiki,this.activeItem)));
 header.appendChild(el(doc,"span","huwrep-muted",(index+1)+" / "+all.length+" numre"));
 var listBox=el(doc,"aside","huwrep-book-list");listBox.hidden=true;
 listBox.setAttribute("aria-label","Numre i den aktuelle sætliste");host.appendChild(listBox);
 var listToggle=btn(doc,"☷ Nummerliste",function(){
  listBox.hidden=!listBox.hidden;
  listToggle.setAttribute("aria-expanded",String(!listBox.hidden));
  if(!listBox.hidden)search.focus();
 });
 listToggle.setAttribute("aria-expanded","false");toolbar.appendChild(listToggle);
 var title=el(doc,"div","huwrep-book-list-heading");
 title.appendChild(el(doc,"strong","","Numre i sætlisten"));
 title.appendChild(btn(doc,"Luk ×",function(){
  listBox.hidden=true;listToggle.setAttribute("aria-expanded","false");
 }));
 listBox.appendChild(title);
 var search=el(doc,"input","huwrep-input huwrep-book-list-search");
 search.type="search";search.placeholder="Find et nummer…";
 search.setAttribute("aria-label","Søg i sætlisten");
 listBox.appendChild(search);
 var list=el(doc,"nav","huwrep-book-list-items");listBox.appendChild(list);
 all.forEach(function(id,i){
  var b=btn(doc,(i+1)+". "+shortName(wiki,id),function(){
   listBox.hidden=true;self.selectItem(id,false);
  },id===self.activeItem?"huwrep-primary":"");
  b.setAttribute("aria-current",id===self.activeItem?"true":"false");
  list.appendChild(b);
 });
 search.addEventListener("input",function(){
  var q=search.value.trim().toLocaleLowerCase();
  Array.from(list.children).forEach(function(b){b.hidden=!b.textContent.toLocaleLowerCase().includes(q);});
 });
 var row=el(doc,"div","huwrep-book-agreement"),agreement=model.effective(wiki,this.setlistTitle,this.activeItem);
 if(agreement.key)row.appendChild(el(doc,"span","","Toneart: "+agreement.key));
 if(agreement.tempo)row.appendChild(el(doc,"span","","Tempo: "+agreement.tempo));
 if(agreement.form)row.appendChild(el(doc,"span","huwrep-book-form","Form: "+agreement.form));
 if(agreement.instrumentation)row.appendChild(el(doc,"span","huwrep-book-form","Instrumentering: "+agreement.instrumentation));
 if(agreement.cues)row.appendChild(el(doc,"span","huwrep-book-form","Tegn: "+agreement.cues));
 if(row.childNodes.length)host.appendChild(row);
 var stage=el(doc,"main","huwrep-book-stage");host.appendChild(stage);
 var source=wiki.getTiddler(name(wiki,this.activeItem)),f=source&&source.fields;
 if(f&&typeof f["abc-source"]==="string"){
  host.insertBefore(this.practicePanel(doc),stage);
  var scoreHost=el(doc,"div","huwrep-book-score");stage.appendChild(scoreHost);
  this._practiceScoreHost=scoreHost;this._practiceVoiceSignature="";
  try {
   // The full notation engine (pagination, audio and page dots) is reused;
   // only the active score widget exists. No orchestral ABC is duplicated.
   var Score=require("$:/plugins/huwiki/abc/score-widget.js")["huwiki-abc"];
   var tree={type:"huwiki-abc",attributes:{
    tiddler:{type:"string",value:source.fields.title},
    view:{type:"string",value:"full"},
    embedded:{type:"string",value:"yes"},
    audio:{type:"string",value:"all"},
    "show-title":{type:"string",value:"no"}}};
   this._score=new Score(tree,{wiki:wiki,parentWidget:this,document:doc});
   // The current setlist owns a temporary performance layer, never the source tiddler.
   this._score._repertoireScore=function(ABC,abcSource){
    try{
     var prepared=LiveScore.apply(ABC,abcSource,agreement);
     if(self._scoreError){self._scoreError.remove();self._scoreError=null;}
     return prepared.source;
    }catch(error){
     if(!self._scoreError){
      self._scoreError=el(doc,"span","huwrep-book-transform-error");
      self._scoreError.setAttribute("role","alert");
      row.appendChild(self._scoreError);
      if(!row.isConnected)host.insertBefore(row,stage);
     }
     self._scoreError.textContent="Spilleaftalen kunne ikke anvendes: "+error.message;
     return abcSource;
    }
   };
   this.children=[this._score];
   this._score.render(scoreHost,null);
   // Keep the same reader state as we cross a tune boundary.
   if(this._score._reader){
    // A repertoire book opens on the notation, not on six editor panels.
    // An explicit exit is respected on subsequent tunes.
    var readerState=this._readerCarry===undefined?
     {active:true,mode:"vis",controlsOpen:false,fill:false}:this._readerCarry;
    if(readerState.active)this._score._reader.enter(readerState);
   }
   var win=this._win;
   if(win&&win.MutationObserver){
    this._observer=new win.MutationObserver(function(){
     self.updateMode();self.syncPracticeVoices();self.applyPractice();
    });
    this._observer.observe(scoreHost,{childList:true,subtree:true});
   }
   this.updateMode();this.syncPracticeVoices();this.applyPractice();
  }catch(error){
   this.disposeScore();
   scoreHost.appendChild(el(doc,"p","huwrep-muted","Noderne kunne ikke vises: "+error.message));
   stage.appendChild(btn(doc,"Åbn originalen",function(){self.navigate(source.fields.title);}));
  }
 }else if(f&&f["repertoire-sheet-format"]==="chords"){
  // An editable WikiText chord chart belongs in Nodebog without fake melody notes.
  var chordFrame=el(doc,"div","huwrep-chord-frame");
  var chordSheet=el(doc,"article","huwrep-chord-sheet");
  chordSheet.setAttribute("aria-label","Becifringsark");
  chordSheet.innerHTML=wiki.renderText("text/html","text/vnd.tiddlywiki",f.text||"");
  chordFrame.appendChild(chordSheet);
  chordFrame.appendChild(btn(doc,"Åbn / rediger becifringsark",function(){self.navigate(source.fields.title);}));
  stage.appendChild(chordFrame);
 }else{
  var imageTitle=f&&f["repertoire-image"]||"";
  var image=wiki.getTiddler(imageTitle)||source;
  var imageFields=image&&image.fields||{};
  var imageSrc="";
  if(/^image\//.test(imageFields.type||"")){
   var data=imageFields.text||"";
   if(/^data:image\//.test(data))imageSrc=data;
   else if(imageFields._canonical_uri&&/^https?:\/\//.test(imageFields._canonical_uri))imageSrc=imageFields._canonical_uri;
   else if(data&&!/^image\/svg\+xml$/.test(imageFields.type))imageSrc="data:"+imageFields.type+";base64,"+data;
   else if(data)imageSrc="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data);
  }else if(imageTitle&&/^https?:\/\//.test(imageTitle)){imageSrc=imageTitle;}
  if(imageSrc){
   var img=el(doc,"img","huwrep-book-image");img.alt=shortName(wiki,this.activeItem);
   img.src=imageSrc;stage.appendChild(img);
  }else{
   stage.appendChild(el(doc,"p","huwrep-muted","Ingen ABC-noder eller scannet nodebillede knyttet til melodien. Aftalerne kan stadig læses her."));
  }
  if(source)stage.appendChild(btn(doc,"Åbn melodien",function(){self.navigate(source.fields.title);}));
 }
 var footer=el(doc,"footer","huwrep-book-footer");host.appendChild(footer);
 var prev=btn(doc,"‹ Forrige side / nummer",function(){self.turn(-1);});
 var next=btn(doc,"Næste side / nummer ›",function(){self.turn(1);});
 var songPrev=btn(doc,"⇤ Forrige nummer",function(){if(index>0)self.selectItem(all[index-1],false);});
 var songNext=btn(doc,"Næste nummer ⇥",function(){if(index<all.length-1)self.selectItem(all[index+1],false);});
 songPrev.disabled=index===0;songNext.disabled=index===all.length-1;
 this._pageStatus=el(doc,"span","huwrep-muted","Sidevisning følger iPadens skærmretning");
 footer.append(songPrev,prev,this._pageStatus,next,songNext);
 this.updateMode();
};
Book.prototype.refresh=function(changed){
 changed=changed||{};
 if(this._editReturn){
  var state=this._editReturn;
  if(state.pendingNavigation)return false;
  if(!state.draft||changed[state.draft]||changed[state.source]||changed[state.story])this.queueEditorCheck();
  return false;
 }
 var titles=Object.keys(changed||{});
 if(titles.some(function(title){return title.indexOf("Repertoire/")===0;})){
  this.draw();return true;
 }
 if(this._score&&this._score.refresh){
  try{return !!this._score.refresh(changed);}catch(_ignored){return false;}
 }
 return false;
};
Book.prototype._onKeyDown=function(event){
 if(event.key==="Escape"&&this.host&&this.host.classList.contains("huwrep-book-fullscreen")){
  this.host.classList.remove("huwrep-book-fullscreen");this.updateMode();return;
 }
};
exports["huwiki-repertoire-book"]=Book;
})();
