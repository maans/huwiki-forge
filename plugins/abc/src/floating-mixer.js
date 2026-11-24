/*\
title: $:/plugins/huwiki/abc/floating-mixer.js
type: application/javascript
module-type: library
\*/
(function () {
  'use strict';
  var Routing = require('$:/plugins/huwiki/abc/voice-routing.js');
  var VoiceControls = require('$:/plugins/huwiki/abc/voice-controls.js');
  var Accompaniment = require('$:/plugins/huwiki/abc/accompaniment.js');
  var ChordChart = require('$:/plugins/huwiki/abc/chord-chart.js');
  var positions = new WeakMap();


  // Compatibility for older wikis with orchestra-prefixed source titles.
  // Shared library pieces use their own titles; other separators stay whole.
  function displayMusicTitle(wiki,fullTitle) {
    var full=String(fullTitle||""),separator=" · ",at=full.indexOf(separator);
    if(at<1)return full;
    var orchestra=full.slice(0,at),song=full.slice(at+separator.length);
    if(!song||!wiki||typeof wiki.getTiddler!=="function")return full;
    var orchestraRecord=wiki.getTiddler("Repertoire/Orkestre/"+encodeURIComponent(orchestra));
    if(orchestraRecord&&orchestraRecord.fields&&orchestraRecord.fields["repertoire-kind"]==="orchestra")return song;
    var score=wiki.getTiddler(full),tags=score&&(score.fields&&score.fields.tags||score.tags)||[];
    if(typeof tags==="string"){
      // Serialized demo tiddlers have space-separated tags; the live wiki uses arrays.
      tags=tags.split(/\s+/);
    }
    return Array.isArray(tags)&&tags.indexOf(orchestra)>=0&&tags.indexOf(orchestra+"Track")>=0?song:full;
  }

  function mount(options) {
    options = options || {};
    var doc = options.host && options.host.ownerDocument || document;
    var win = doc.defaultView || window;
    if (!options.host || !options.ABC) return { update: function () {}, destroy: function () {}, show: function () {}, toggle: function () {} };
    var wiki = options.wiki;
    var isDanish = !wiki || !wiki.getTiddlerText || /da/i.test(wiki.getTiddlerText('$:/language', 'da'));
    function word(da, en) { return isDanish ? da : en; }
    function node(tag, cls, value) { var e = doc.createElement(tag); if (cls) e.className = cls; if (value !== undefined) e.textContent = value; return e; }
    var musicTitle=String(options.title||word('Mixer','Mixer'));
    var caption=displayMusicTitle(wiki,musicTitle);
    // Persist layout by the complete source ID, independently of its caption.
    var storeKey='huwabc-mini-mixer-layout-v3-'+musicTitle;
    function safeState() { try { return JSON.parse(win.sessionStorage.getItem(storeKey) || 'null'); } catch (_) { return null; } }
    function saveState() { try { win.sessionStorage.setItem(storeKey, JSON.stringify({floating:floating,x:x,y:y,collapsed:collapsed})); } catch (_) {} }
    var initial = safeState() || positions.get(doc) || {};
    var floating = !!(options.initialFloating || initial.floating);
    var overlap=doc.querySelectorAll('.huwabc-mini-mixer--floating').length;
    var x = Number.isFinite(initial.x) ? initial.x : 100+overlap*26;
    var y = Number.isFinite(initial.y) ? initial.y : 105+overlap*26;
    var collapsed=!!initial.collapsed,skipTitleClick=false,currentlyPlaying=false,activeChord=-1;
    var visibleRequested = options.initiallyVisible !== false;
    var closed = false, dragging = null, voices = [], rows = [], backingRows = [],chordNodes=[];
    var chart={chords:[],measures:[],noteTimes:{}};
    var current = Accompaniment.clean(options.getConfig && options.getConfig());
    var sidebar = doc.querySelector('.tc-sidebar-scrollable');
    var wrapper = sidebar && sidebar.firstElementChild;
    var dockHeader = wrapper && wrapper.querySelector('.tc-sidebar-header');
    var dock = dockHeader ? wrapper : sidebar;
    var canDock = !!dock;
    if (!canDock) floating = true; // Published static pages have no TiddlyWiki sidebar.
    var selectedTab = 'voices';

    var panel = node('section','huwabc-mini-mixer');
    panel.setAttribute('role','region');
    panel.setAttribute('aria-label',word('Minimixer','Mini mixer'));
    var header = node('div','huwabc-mini-mixer-header');
    var title = node('button','huwabc-mini-mixer-title',caption);title.type='button';
    title.title=word('Fold mixer sammen eller ud','Collapse or expand mixer');
    title.setAttribute('aria-label',caption+' · '+title.title);
    var count = node('span','huwabc-mini-mixer-count');
    var tools = node('div','huwabc-mini-mixer-tools');
    var play=node('button','huwabc-mini-mixer-play','▶');play.type='button';
    play.title=word('Afspil','Play');play.setAttribute('aria-label',play.title);
    var toggleDock = node('button','huwabc-mini-mixer-detach');toggleDock.type = 'button';
    var close = node('button','huwabc-mini-mixer-close','×');close.type = 'button';
    close.title = word('Skjul mixeren','Close mixer');close.setAttribute('aria-label',close.title);
    header.appendChild(title);header.appendChild(count);header.appendChild(tools);
    tools.appendChild(play);tools.appendChild(toggleDock);tools.appendChild(close);panel.appendChild(header);
    var content=node('div','huwabc-mini-mixer-content');panel.appendChild(content);
    var tabbar = node('div','huwabc-mini-mixer-tabs');tabbar.setAttribute('role','tablist');
    var voiceTab = node('button','huwabc-mini-mixer-tab',word('Stemmer','Voices'));
    var backingTab = node('button','huwabc-mini-mixer-tab',word('Akkompagnement','Accompaniment'));
    var chordTab=node('button','huwabc-mini-mixer-tab',word('C7 · Akkorder','C7 · Chords'));
    voiceTab.type=backingTab.type=chordTab.type='button';
    [voiceTab,backingTab,chordTab].forEach(function(b){b.setAttribute('role','tab');});
    tabbar.appendChild(voiceTab);tabbar.appendChild(backingTab);tabbar.appendChild(chordTab);content.appendChild(tabbar);
    var list = node('div','huwabc-mini-mixer-list');list.setAttribute('role','tabpanel');content.appendChild(list);
    var backingList = node('div','huwabc-mini-mixer-list huwabc-mini-mixer-backing');backingList.setAttribute('role','tabpanel');content.appendChild(backingList);
    var chordList=node('div','huwabc-mini-mixer-chordlist');chordList.setAttribute('role','tabpanel');content.appendChild(chordList);
    var roomRow=node('label','huwabc-mini-mixer-reverb');
    var roomLabel=word('Rumklang','Reverb');
    roomRow.appendChild(node('span','',roomLabel));
    var roomSlider=node('input','huwabc-mini-mixer-slider');
    roomSlider.type='range';roomSlider.min='0';roomSlider.max='100';roomSlider.step='1';
    roomSlider.setAttribute('aria-label',roomLabel);
    var roomValue=node('output','huwabc-mini-mixer-output');
    roomRow.appendChild(roomSlider);roomRow.appendChild(roomValue);content.appendChild(roomRow);
    roomRow.style.cssText='display:flex;align-items:center;gap:.6em;padding:.45em .65em;border-top:1px solid #ccc';
    roomSlider.style.cssText='flex:1;min-width:0';
    roomSlider.addEventListener('input',function(){changeBacking('reverb',Number(roomSlider.value),false);});
    roomSlider.addEventListener('change',function(){changeBacking('reverb',Number(roomSlider.value),true);});
    var info = node('div','huwabc-mini-mixer-info');content.appendChild(info);
     // Minimal chord zoom; controls use the existing footer, not a new toolbar.
     var chordFontConfig='$:/config/huwiki/abc/chord-font-size';
     var chordFontSize=Number(wiki&&wiki.getTiddlerText&&wiki.getTiddlerText(chordFontConfig,'10'))||10;
     var zoomOut=node('button','huwabc-mini-mixer-zoom','−'),zoomIn=node('button','huwabc-mini-mixer-zoom','+');
     zoomOut.type=zoomIn.type='button';
     zoomOut.title=word('Mindre akkorder','Smaller chords');zoomOut.setAttribute('aria-label',zoomOut.title);
     zoomIn.title=word('Større akkorder','Larger chords');zoomIn.setAttribute('aria-label',zoomIn.title);
     function setChordFontSize(value,persist){
       chordFontSize=Math.max(8,Math.min(15,Math.round(Number(value)||10)));
       chordList.style.setProperty('--huwabc-chord-font-size',chordFontSize+'px');
       chordList.style.setProperty('--huwabc-chord-cell-min',Math.round(chordFontSize*9.2)+'px');
       zoomOut.disabled=chordFontSize===8;zoomIn.disabled=chordFontSize===15;
       if(persist&&wiki&&wiki.addTiddler){wiki.addTiddler(new $tw.Tiddler({title:chordFontConfig,text:String(chordFontSize)}));}
       if(activeChord>=0&&selectedTab==='chords')ensureChordVisible(chordNodes[activeChord]);
     }
     zoomOut.addEventListener('click',function(e){e.stopPropagation();setChordFontSize(chordFontSize-1,true);});
     zoomIn.addEventListener('click',function(e){e.stopPropagation();setChordFontSize(chordFontSize+1,true);});
     setChordFontSize(chordFontSize,false);
    function updatePlayback(value){
      currentlyPlaying=!!value;play.textContent=currentlyPlaying?'⏸':'▶';
      play.title=word(currentlyPlaying?'Pause':'Afspil',currentlyPlaying?'Pause':'Play');
      play.setAttribute('aria-label',caption+' · '+play.title);
      play.setAttribute('aria-pressed',String(currentlyPlaying));
    }
    play.addEventListener('click',function(e){e.stopPropagation();if(typeof options.onTogglePlayback==='function')options.onTogglePlayback();});
    updatePlayback(options.getPlaying&&options.getPlaying());
    function setCollapsed(value){
      collapsed=!!value;content.hidden=collapsed;count.hidden=collapsed;
      panel.classList.toggle('huwabc-mini-mixer--collapsed',collapsed);
      title.setAttribute('aria-expanded',String(!collapsed));
      title.title=word(collapsed?'Fold mixer ud':'Fold mixer sammen',collapsed?'Expand mixer':'Collapse mixer');
      if(floating)clamp();saveState();
    }
    title.addEventListener('click',function(e){
      if(skipTitleClick){skipTitleClick=false;e.preventDefault();return;}
      setCollapsed(!collapsed);
    });

    function sidebarVisible() {
      if (!canDock) return false;
      var state = wiki && wiki.getTiddlerText && wiki.getTiddlerText('$:/state/sidebar','yes');
      if (/^(?:no|hide|hidden|closed)$/i.test(String(state))) return false;
      // Responsive TiddlyWiki keeps sidebar DOM even when it is below the
      // story or scrolled out of sight. Dock presence is not visible space.
      if(doc.querySelector('.tc-show-sidebar-btn'))return false;
      var target=dockHeader||sidebar,rect=target.getBoundingClientRect();
      var style=win.getComputedStyle(target);
      return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0&&
        rect.right>24&&rect.left<win.innerWidth-24&&rect.bottom>0&&rect.bottom<win.innerHeight-40;
    }
    var lastReportedVisible;
    function isVisible() { return !closed && visibleRequested && (floating || sidebarVisible()); }
    function syncVisibility() {
      panel.hidden = !isVisible();
      if (lastReportedVisible !== !panel.hidden) {
        lastReportedVisible = !panel.hidden;
        if (typeof options.onVisibilityChange === 'function') options.onVisibilityChange(!panel.hidden, floating);
      }
    }
    function clamp() {
      var rect = panel.getBoundingClientRect(), width = rect.width || 330, height = rect.height || 280;
      x = Math.max(4, Math.min(x, Math.max(4, win.innerWidth - Math.min(width,win.innerWidth) - 4)));
      y = Math.max(4, Math.min(y, Math.max(4, win.innerHeight - Math.min(height,win.innerHeight) - 4)));
      panel.style.left = Math.round(x) + 'px';panel.style.top = Math.round(y) + 'px';
    }
    function layout(nextFloating) {
      floating = !canDock || !!nextFloating;
      panel.classList.toggle('huwabc-mini-mixer--floating',floating);
      if (floating) {
        if (panel.parentNode !== doc.body) doc.body.appendChild(panel);
        panel.style.position = 'fixed';
        clamp();
      } else {
        panel.style.position = '';panel.style.left = '';panel.style.top = '';
        if (dockHeader && dockHeader.parentNode === dock) dock.insertBefore(panel,dockHeader.nextSibling);
        else if (panel.parentNode !== dock) dock.appendChild(panel);
      }
      toggleDock.hidden = !canDock;
      toggleDock.textContent = floating ? word('I sidepanel','Dock') : word('Frigør','Detach');
      toggleDock.title = floating ? word('Sæt mixeren tilbage i sidepanelet','Return mixer to sidebar') : word('Frigør mixeren, så den kan flyttes','Detach and move mixer');
      header.title = floating ? word('Træk her for at flytte mixeren','Drag to move mixer') : '';
      syncVisibility();saveState();
    }
    function positionFromSidebar() {
      var box = panel.getBoundingClientRect();
      x = Math.max(4,Math.min(win.innerWidth-300,box.left||win.innerWidth-330));
      y = Math.max(4,Math.min(win.innerHeight-150,box.top||90));
    }
    function positionFromAnchor(anchor) {
      if (!anchor || !anchor.getBoundingClientRect) return;
      var r = anchor.getBoundingClientRect();
      x = Math.max(4,Math.min(win.innerWidth-335,r.left));
      y = Math.max(4,Math.min(win.innerHeight-330,r.bottom+7));
    }
    function show(opts) {
      opts = opts || {};
      if (closed) return;
      if (opts.anchor && !visibleRequested && !options.sidebarMixer) positionFromAnchor(opts.anchor);
      visibleRequested = true;
      if (!floating && (!sidebarVisible() || opts.floating)) layout(true);
      else syncVisibility();
      if (floating) {clamp();panel.style.zIndex = '10100';}
    }
    function hide() { if (closed) return;visibleRequested = false;syncVisibility(); }
    function toggle(opts) {if (isVisible()) hide();else show(opts);}
    toggleDock.addEventListener('click',function(){
      if (!floating) positionFromSidebar();
      layout(!floating);
    });
    close.addEventListener('click',hide);
    function endDrag(e) {
      if (!dragging || e && e.pointerId !== dragging.id) return;
      var moved=dragging.moved;dragging=null;
      panel.classList.remove('huwabc-mini-mixer--dragging');
      doc.removeEventListener('pointermove',dragMove,true);
      doc.removeEventListener('pointerup',endDrag,true);
      doc.removeEventListener('pointercancel',endDrag,true);
      if(moved){skipTitleClick=true;win.setTimeout(function(){skipTitleClick=false;},100);}
      saveState();
    }
    function dragMove(e) {
      if (!dragging || dragging.id !== e.pointerId) return;
      var dx=e.clientX-dragging.clientX,dy=e.clientY-dragging.clientY;
      if(!dragging.moved){
        if(Math.hypot(dx,dy)<(e.pointerType==='touch'?9:5))return;
        dragging.moved=true;
        if(!floating){
          // Docked windows become floating the moment their title is dragged.
          // The initial pointer offset is retained; there is no visual jump.
          x=dragging.left;y=dragging.top;layout(true);
        }
        panel.classList.add('huwabc-mini-mixer--dragging');
      }
      x=dragging.left+dx;y=dragging.top+dy;
      clamp();e.preventDefault();
    }
    header.addEventListener('pointerdown',function(e){
      if(e.button!==0)return;
      var clicked=e.target.closest&&e.target.closest('button');
      if(clicked&&clicked!==title)return;
      var rect=panel.getBoundingClientRect();
      dragging={id:e.pointerId,left:floating?x:rect.left,top:floating?y:rect.top,
        clientX:e.clientX,clientY:e.clientY,moved:false};
      doc.addEventListener('pointermove',dragMove,true);
      doc.addEventListener('pointerup',endDrag,true);
      doc.addEventListener('pointercancel',endDrag,true);
    });
    header.tabIndex = 0;
    header.addEventListener('keydown',function(e){
      if (!floating || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0) return;
      var delta = e.shiftKey ? 48 : 12;
      if (e.key==='ArrowLeft') x-=delta;
      if (e.key==='ArrowRight') x+=delta;
      if (e.key==='ArrowUp') y-=delta;
      if (e.key==='ArrowDown') y+=delta;
      clamp();saveState();e.preventDefault();
    });
    function notify(next,persist) {
      current = Accompaniment.clean(next);
      refreshControls();
      if (typeof options.onPreview==='function') options.onPreview(current);
      if (persist && typeof options.onChange==='function') options.onChange(current);
    }
    function changeVoice(index,values,persist) {
      var next=Accompaniment.clean(current),key=String(index);
      var item=Object.assign({instrument:'inherit',volume:100,mode:'normal'},next.voiceSettings[key]);
      Object.keys(values).forEach(function(k){item[k]=values[k];});next.voiceSettings[key]=item;
      notify(next,persist);
    }
    function changeBacking(key,value,persist) {
      var next=Accompaniment.clean(current);next[key]=value;notify(next,persist);
    }
    function changeBackingMode(channel,mode,persist) {
      var next=Accompaniment.clean(current);
      next.backingModes[channel]=mode;
      if(channel==='metronome')next.metronome=mode!=='mute';
      else if(channel==='drone')next.droneEnabled=mode!=='mute';
      else if(mode!=='mute')next.enabled=true;
      notify(next,persist);
    }
    function instrumentLabel(voice) {
      var v=Routing.clean(current.voiceSettings)[String(voice.index)] || {};
      var program=v.instrument;
      if (program===undefined || program==='inherit') {
        var src=Routing.bassSource(current.bassSource)==='voice:'+voice.index?current.bassInstrument:current.melodyInstrument;
        program=typeof src==='number'?src:voice.program;
      }
      if (program==='source') program=voice.program;
      return (typeof program==='number'?VoiceControls.programName(options.ABC,program):'')||voice.name||'';
    }
    function rebuild(source) {
      try {voices=Routing.describe(options.ABC,source||'')||[];} catch (_) {voices=[];}
      rows=[];list.textContent='';count.textContent=voices.length?'('+voices.length+')':'';
      voices.forEach(function(voice){
        var row=node('div','huwabc-mini-mixer-row');row.dataset.voiceIndex=String(voice.index);
        var label=node('span','huwabc-mini-mixer-name');label.appendChild(node('b','',String(voice.index+1)));
        var instr=node('span','huwabc-mini-mixer-instrument');label.appendChild(instr);row.appendChild(label);
        var sliderWrap=node('div','huwabc-mini-mixer-level');
        var slider=node('input','huwabc-mini-mixer-slider');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
        slider.setAttribute('aria-label',word('Stemme ','Voice ')+(voice.index+1)+' · '+word('lydstyrke','volume'));
        var output=node('output','huwabc-mini-mixer-value');
        slider.addEventListener('input',function(){output.textContent=slider.value+'%';changeVoice(voice.index,{volume:Number(slider.value)},false);});
        slider.addEventListener('change',function(){changeVoice(voice.index,{volume:Number(slider.value)},true);});
        sliderWrap.appendChild(slider);sliderWrap.appendChild(output);row.appendChild(sliderWrap);
        var group=node('div','huwabc-mini-mixer-modes');
        var modeButton=node('button','huwabc-mini-mixer-mode huwabc-mini-mixer-mode--cycle','N ↻');modeButton.type='button';
        modeButton.addEventListener('click',function(){
          var saved=Routing.clean(current.voiceSettings)[String(voice.index)]||{mode:'normal'};
          changeVoice(voice.index,{mode:nextMode(saved.mode)},true);
        });
        group.appendChild(modeButton);
        row.appendChild(group);list.appendChild(row);
        rows.push({voice:voice,row:row,slider:slider,output:output,instr:instr,modeButton:modeButton});
      });
      if (!voices.length) list.appendChild(node('p','huwabc-mini-mixer-empty',word('Ingen noterede stemmer','No notated voices')));
      refreshControls();
    }
    function createBacking() {
      var master=node('div','huwabc-mini-mixer-master');
      var masterText=node('span','',word('Akkompagnement','Accompaniment'));
      var masterSwitch=node('button','huwabc-mini-mixer-switch');masterSwitch.type='button';
      masterSwitch.addEventListener('click',function(){changeBacking('enabled',!current.enabled,true);});
      master.appendChild(masterText);master.appendChild(masterSwitch);backingList.appendChild(master);
      [['bassVolume','bass','Bas','Bass'],['chordVolume','chords','Akkorder','Chords'],
       ['drumVolume','drums','Slagtøj','Drums'],['metronomeVolume','metronome','Metronom','Metronome'],
       ['droneVolume','drone','Drone','Drone']].forEach(function(spec){
        var key=spec[0],channel=spec[1],row=node('div','huwabc-mini-mixer-backing-row');
        var label=node('span','huwabc-mini-mixer-backing-name',word(spec[2],spec[3]));
        var sliderWrap=node('div','huwabc-mini-mixer-level');
        var slider=node('input','huwabc-mini-mixer-slider');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
        slider.setAttribute('aria-label',word(spec[2],spec[3])+' · '+word('lydstyrke','volume'));
        var output=node('output','huwabc-mini-mixer-value');
        slider.addEventListener('input',function(){output.textContent=slider.value+'%';changeBacking(key,Number(slider.value),false);});
        slider.addEventListener('change',function(){changeBacking(key,Number(slider.value),true);});
        sliderWrap.appendChild(slider);sliderWrap.appendChild(output);
        row.appendChild(label);row.appendChild(sliderWrap);
        var group=node('div','huwabc-mini-mixer-modes');
        var modeButton=node('button','huwabc-mini-mixer-mode huwabc-mini-mixer-mode--cycle','N ↻');modeButton.type='button';
        modeButton.addEventListener('click',function(){
          changeBackingMode(channel,nextMode(current.backingModes[channel]),true);
        });
        group.appendChild(modeButton);
        row.appendChild(group);backingList.appendChild(row);
        backingRows.push({key:key,channel:channel,row:row,slider:slider,output:output,modeButton:modeButton});
      });
      return masterSwitch;
    }
    var masterSwitch=createBacking();
    function rebuildChords(source){
      chart=ChordChart.extract(options.ABC,source);chordList.textContent='';chordNodes=[];activeChord=-1;
      chart.measures.forEach(function(measure){
        var row=node('div','huwabc-mini-mixer-chordbar');
        row.appendChild(node('span','huwabc-mini-mixer-barnum',String(measure.number)));
        var names=node('div','huwabc-mini-mixer-chordnames');
        measure.chords.forEach(function(c){
          var name=node('span','huwabc-mini-mixer-chord',c.name);
          name.title=word('Takt ','Bar ')+measure.number+' · '+c.name;
          chordNodes[c.index]=name;names.appendChild(name);
        });
        row.appendChild(names);chordList.appendChild(row);
      });
      if(!chart.chords.length)chordList.appendChild(node('p','huwabc-mini-mixer-empty',word('Ingen becifringer i nummeret','No chord symbols in this tune')));
    }
    function updateEvent(event){
      var next=ChordChart.atEvent(chart,event);
      if(next<0||next===activeChord)return;
      if(chordNodes[activeChord]){
        chordNodes[activeChord].classList.remove('huwabc-mini-mixer-chord--active');
        chordNodes[activeChord].removeAttribute('aria-current');
      }
      activeChord=next;
      var item=chordNodes[next];if(!item)return;
      item.classList.add('huwabc-mini-mixer-chord--active');
      item.setAttribute('aria-current','true');
      if(selectedTab==='chords')ensureChordVisible(item);
    }
    function ensureChordVisible(item){
      if(!item||chordList.hidden||!chordList.clientHeight)return;
      var row=item.closest('.huwabc-mini-mixer-chordbar');
      if(!row)return;
      // offsetTop may refer to the panel instead of the scrolling chord list.
      // Rectangles share a viewport origin and remain correct for grid rows,
      // hidden sidebar transitions and a freely floating mixer.
      var viewport=chordList.getBoundingClientRect();
      var rect=row.getBoundingClientRect();
      var margin=Math.min(10,Math.floor(chordList.clientHeight/7));
      if(rect.top<viewport.top+margin){
        chordList.scrollTop+=rect.top-viewport.top-margin;
      }else if(rect.bottom>viewport.bottom-margin){
        chordList.scrollTop+=rect.bottom-viewport.bottom+margin;
      }
    }
    function nextMode(mode) {
      var order=['normal','solo','mute'];
      return order[(Math.max(0,order.indexOf(mode))+1)%3];
    }
    function setModeButton(button, mode, label) {
      mode=mode||'normal';
      button.dataset.mode=mode;
      button.textContent=({normal:'N',solo:'S',mute:'M'}[mode]||'N')+' ↻';
      button.title=word('Klik: Normal → Solo → Mute → Normal','Click: Normal → Solo → Mute → Normal');
      button.setAttribute('aria-label',label+' · '+mode+'. '+button.title);
    }
    function chooseTab(tab) {
      selectedTab=['voices','accompaniment','chords'].indexOf(tab)>=0?tab:'voices';
      var backing=selectedTab==='accompaniment',chords=selectedTab==='chords';
      list.hidden=backing||chords;backingList.hidden=!backing;chordList.hidden=!chords;
      voiceTab.setAttribute('aria-selected',String(selectedTab==='voices'));
      backingTab.setAttribute('aria-selected',String(backing));
      chordTab.setAttribute('aria-selected',String(chords));
      if(chords&&activeChord>=0)ensureChordVisible(chordNodes[activeChord]);
      count.textContent=selectedTab==='voices'&&voices.length?'('+voices.length+')':'';
       if(chords){
         info.textContent='';info.classList.add('huwabc-mini-mixer-info--chord');
         info.appendChild(zoomOut);info.appendChild(zoomIn);
       }else{
         info.classList.remove('huwabc-mini-mixer-info--chord');
         info.textContent=word('Tryk på N / S / M for at skifte · solo virker på tværs af faner',
          'Tap N / S / M to cycle · solo works across tabs');
       }
    }
    voiceTab.addEventListener('click',function(){chooseTab('voices');});
    backingTab.addEventListener('click',function(){chooseTab('accompaniment');});
    chordTab.addEventListener('click',function(){chooseTab('chords');});
    function refreshControls() {
      roomSlider.value=String(current.reverb||0);roomValue.textContent=roomSlider.value+'%';
      var settings=Routing.clean(current.voiceSettings);
      var solos=Accompaniment.activeSolo(current);
      rows.forEach(function(r){
        var s=settings[String(r.voice.index)]||{volume:100,mode:'normal'};
        if (r.slider !== doc.activeElement || !r.slider.matches(':active')) r.slider.value=String(s.volume);
        r.output.textContent=s.volume+'%';r.instr.textContent=instrumentLabel(r.voice);r.instr.title=r.instr.textContent;
        setModeButton(r.modeButton,s.mode,word('Stemme ','Voice ')+(r.voice.index+1));
        var isBass=current.bassSource==='voice:'+r.voice.index;
        r.row.classList.toggle('huwabc-mini-mixer-row--silent',s.mode==='mute'||isBass&&current.backingModes.bass==='mute'||solos&&s.mode!=='solo'&&!(isBass&&current.backingModes.bass==='solo'));
        r.row.classList.toggle('huwabc-mini-mixer-row--solo',s.mode==='solo');
      });
      masterSwitch.textContent=current.enabled?word('Til','On'):word('Fra','Off');
      masterSwitch.setAttribute('aria-pressed',String(current.enabled));
      masterSwitch.setAttribute('aria-label',word('Akkompagnement til eller fra','Toggle accompaniment'));
      backingRows.forEach(function(r){
        var amount=current[r.key],mode=current.backingModes[r.channel]||'normal';
        if (r.slider !== doc.activeElement || !r.slider.matches(':active')) r.slider.value=String(amount);
        r.output.textContent=amount+'%';
        var on=r.channel==='metronome'?current.metronome:r.channel==='drone'?current.droneEnabled:
          r.channel==='bass'&&current.bassSource.indexOf('voice:')===0?true:current.enabled;
        r.row.classList.toggle('huwabc-mini-mixer-backing-row--silent',!on||mode==='mute'||solos&&mode!=='solo');
        r.row.classList.toggle('huwabc-mini-mixer-backing-row--solo',mode==='solo'&&on);
        setModeButton(r.modeButton,mode,word('Kanal ','Channel ')+r.channel);
      });
    }
    function update(next,source) {
      if (closed) return;
      current=Accompaniment.clean(next||options.getConfig&&options.getConfig());
      if (source!==undefined && String(source)!==lastSource) {lastSource=String(source);rebuild(lastSource);rebuildChords(lastSource);}
      else refreshControls();
    }
    function onWikiChange(changes) {
      if (changes && changes['$:/state/sidebar']) syncVisibility();
    }
    function onResize(){if (floating) clamp();else if(visibleRequested&&!sidebarVisible())layout(true);else syncVisibility();}
    function destroy() {
      if (closed) return;
      endDrag();positions.set(doc,{floating:floating,x:x,y:y});
      closed=true;if (panel.parentNode) panel.parentNode.removeChild(panel);
      win.removeEventListener('resize',onResize);
      if (wiki && wiki.removeEventListener) wiki.removeEventListener('change',onWikiChange);
    }
    var lastSource=String(options.source||'');rebuild(lastSource);rebuildChords(lastSource);chooseTab('voices');setCollapsed(collapsed);
    if (options.initialFloating && options.anchor && !Number.isFinite(initial.x)) positionFromAnchor(options.anchor);
    layout(floating);
    win.addEventListener('resize',onResize);
    if (wiki && wiki.addEventListener) wiki.addEventListener('change',onWikiChange);
    return {element:panel,update:update,destroy:destroy,redock:function(){layout(false);},
      show:show,hide:hide,toggle:toggle,isVisible:isVisible,isFloating:function(){return floating;},
      selectTab:chooseTab,updateEvent:updateEvent,updatePlayback:updatePlayback,collapse:setCollapsed};
  }
  exports.displayMusicTitle=displayMusicTitle;
  exports.mount=mount;
})();
