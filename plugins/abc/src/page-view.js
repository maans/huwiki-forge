/*\
title: $:/plugins/huwiki/abc/page-view.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// This layer owns page geometry and navigation, never parsing or sound.
// Move the original system SVGs, not copies: ABCJS selection, TAB/source links
// and the running timing callbacks must retain their original DOM references.
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
var PrintExport=require('$:/plugins/huwiki/abc/print-export.js');
var serial=0,activeDesk=null;
function geometry(fields){
 fields=fields||{};
 var letter=fields['abc-paper-size']==='Letter',w=letter?215.9:210,h=letter?279.4:297;
 var m=Number(fields['abc-page-margin']);if(!Number.isFinite(m)||m<5||m>30)m=14;
 var lines=Number(fields['abc-lines-per-page']);if(!Number.isInteger(lines)||lines<1||lines>20)lines=0;
 return {width:w,height:h,margin:m,capacity:(h-2*m)/(w-2*m),lines:lines,name:letter?'Letter':'A4'};
}
// Heights are width-normalised SVG units, not CSS pixels. Zoom, hidden pages,
// browser size and device orientation therefore cannot change the page plan.
function pack(items,g){
 var groups=[],pending=[],pages=[],current=null;
 items.forEach(function(item){
  if(item.system){groups.push(pending.concat([item]));pending=[];}
  else if(item.footer&&groups.length)groups[groups.length-1].push(item);
  else pending.push(item);
 });
 if(pending.length){if(groups.length)groups[groups.length-1]=groups[groups.length-1].concat(pending);else groups.push(pending);}
 groups.forEach(function(group){
  var height=group.reduce(function(n,x){return n+x.height;},0),systems=group.filter(function(x){return x.system;}).length;
  if(!current||(current.items.length&&(group.some(function(x){return x.breakBefore;})||current.height+height>g.capacity+1e-7||(g.lines&&current.systems+systems>g.lines)))){
   current={items:[],groups:[],height:0,systems:0,scale:1};pages.push(current);
  }
  current.groups.push(group);current.items=current.items.concat(group);current.height+=height;current.systems+=systems;
  // A system taller than a whole page must stay intact, rather than be clipped.
  current.scale=Math.min(1,g.capacity/Math.max(current.height,1e-9));
 });
 // Avoid a solitary final system when the preceding page can donate a system.
 // Never move music across an explicit new-page directive or the requested cap.
 if(pages.length>1){
  var last=pages[pages.length-1],previous=pages[pages.length-2];
  if(last.systems===1&&previous.systems>=3&&!last.items.some(function(x){return x.breakBefore;})&&(!g.lines||g.lines>=2)){
   var group=previous.groups[previous.groups.length-1],height=group.reduce(function(n,x){return n+x.height;},0);
   if(last.height+height<=g.capacity+1e-7){
    previous.groups.pop();previous.items=previous.items.slice(0,previous.items.length-group.length);previous.height-=height;previous.systems--;
    last.groups.unshift(group);last.items=group.concat(last.items);last.height+=height;last.systems++;
   }
  }
 }
 return pages;
}
function flat(elements){var a=[];function add(n){if(Array.isArray(n))n.forEach(add);else if(n&&n.nodeType===1)a.push(n);}add(elements||[]);return a;}
function elementOf(event){
 var a=event&&event.abselem;if(!a)return null;
 var heads=(a.heads||[]).concat(a.children||[]);
 for(var i=0;i<heads.length;i++)if(heads[i].graphelem)return heads[i].graphelem;
 return flat(a.elemset)[0]||null;
}
function safeClone(node){
 var copy=node.cloneNode(true);
 copy.querySelectorAll('.huwabc-follow-line,.huwabc-minimal-cursor,.site-playhead').forEach(function(n){n.remove();});
 // Keep definitions/clip IDs together, but do not duplicate their IDs in the DOM.
 var ids={},suffix='-pagecopy-'+(++serial);
 [copy].concat(Array.from(copy.querySelectorAll('[id]'))).forEach(function(n){if(n.id){ids[n.id]=n.id+suffix;n.id+=suffix;}});
 [copy].concat(Array.from(copy.querySelectorAll('*'))).forEach(function(n){
  if(n.classList)['huwabc-playing-note','huwabc-cue-selected','huwabc-selected','site-active-note','site-cue-selected','huwabc-tab-selected','abcjs-note_selected'].forEach(function(c){n.classList.remove(c);});
  n.removeAttribute('tabindex');n.removeAttribute('aria-pressed');
  Array.from(n.attributes||[]).forEach(function(a){
   if(/^on/i.test(a.name))n.removeAttribute(a.name);
   else {var value=a.value;Object.keys(ids).forEach(function(id){value=value.split('url(#'+id+')').join('url(#'+ids[id]+')');if(value==='#'+id)value='#'+ids[id];});if(value!==a.value)n.setAttribute(a.name,value);}
  });
 });
 return copy;
}
// Preserve the existing editor/Nodepult layout, but let normal notation use
// the space that actually remains beneath the controls. Never use the sheet's
// own height to compute this allowance (that would cause resize feedback).
function availablePageHeight(windowHeight,top,footerHeight,editor){
 var baseline=editor?Math.min(520,windowHeight*.48):Math.min(800,windowHeight*.64);
 if(editor)return baseline;
 var visible=windowHeight-Math.max(0,top)-Math.max(0,footerHeight)-16;
 return Math.round(Math.max(baseline,Math.min(Math.max(0,windowHeight-16),Math.max(0,visible))));
}
function mount(root,opts){
 opts=opts||{};var doc=root.ownerDocument,win=doc.defaultView,uid='huwabc-pages-'+(++serial),state=opts.state;
 var tune=null,fields={},g=geometry(fields),blocks=[],pages=[],records=[],svgIndex=new WeakMap(),pageIndex=0,activePage=0,selectedOrdinal=null,lastEvent=null,closed=false,desk=false,playing=false;
 var mode=state?state.get('pageMode',opts.editor?'flow':'single'):(opts.editor?'flow':'single'),zoom=state?state.get('pageZoom',opts.editor?'width':'page'):(opts.editor?'width':'page');
 // A user's follow preference is not the same as temporarily looking elsewhere.
 // In test.1 navigation persisted pageFollow=false, even BEFORE Play. Do not
 // carry that ambiguous legacy value forward as an explicit opt-out.
 var followEnabled=state?state.get('pageFollowEnabled',true)!==false:true,followSuspended=false;
 function isFollowing(){return followEnabled&&!followSuspended;}
 if(['single','spread','three','four','stack','flow'].indexOf(mode)<0)mode='single';
 if(['width','page','125','150','200'].indexOf(zoom)<0)zoom='width';
 var initialAnchor=state?state.get('pageAnchor',null):null,initialPage=state?state.get('pageIndex',0):0,layoutSerial=0;
 function tr(da,en){return I18n.language(opts.wiki)==='da'?da:en;}
 function E(tag,cls,text){var n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function B(cls,da,en,fn){var n=E('button','huwabc-page-button '+cls,tr(da,en));n.type='button';n.addEventListener('click',fn);return n;}
 function save(k,v){if(state)state.set(k,v);}
 var shell=E('section','huwabc-page-shell'+(opts.editor?' huwabc-page-editor':'')),bar=E('div','huwabc-page-toolbar'),viewport=E('div','huwabc-page-viewport'),nav=E('nav','huwabc-page-nav');
 shell.id=uid;shell.setAttribute('aria-label',tr('Nodevisning','Score view'));nav.setAttribute('aria-label',tr('Nodesider','Score pages'));
 root.parentNode.insertBefore(shell,root);shell.appendChild(bar);viewport.appendChild(root);shell.appendChild(viewport);shell.appendChild(nav);
 root.classList.add('huwabc-paginated');root.id=root.id||uid+'-paper';
 var viewLabel=E('label','huwabc-page-choice'),views=E('select','huwabc-page-select');
 viewLabel.appendChild(E('span','',tr('Visning','View')));
 [['single','Én side','One page'],['spread','To sider','Two pages'],['three','Tre sider','Three pages'],['four','Fire sider','Four pages'],['stack','Sider under hinanden','Pages vertically'],['flow','Løbende noder','Continuous notation']].forEach(function(a){var o=E('option','',tr(a[1],a[2]));o.value=a[0];views.appendChild(o);});
 views.value=mode;viewLabel.appendChild(views);bar.appendChild(viewLabel);
 var zoomLabel=E('label','huwabc-page-choice'),zooms=E('select','huwabc-page-select');zoomLabel.appendChild(E('span','','Zoom'));
 [['width','Tilpas bredde','Fit width'],['page','Hele siden','Fit page'],['125','125 %','125 %'],['150','150 %','150 %'],['200','200 %','200 %']].forEach(function(a){var o=E('option','',tr(a[1],a[2]));o.value=a[0];zooms.appendChild(o);});
 zooms.value=zoom;zoomLabel.appendChild(zooms);bar.appendChild(zoomLabel);
 var followButton=B('huwabc-page-follow','Følg afspilning','Follow playback',function(){
  if(followSuspended){followSuspended=false;}
  else {followEnabled=!followEnabled;save('pageFollowEnabled',followEnabled);}
  manualScrollUntil=0;
  if(isFollowing()&&lastEvent)revealEvent(lastEvent);
  paint();
 });
 function paintFollow(){
  followButton.textContent=followSuspended?tr('Følg igen','Resume following'):tr('Følg afspilning','Follow playback');
  followButton.setAttribute('aria-pressed',String(isFollowing()));
  followButton.setAttribute('data-follow-state',!followEnabled?'off':followSuspended?'paused':'on');
  followButton.setAttribute('title',!followEnabled?
   tr('Automatisk sidefølge er slået fra. Klik for at slå det til.','Automatic page following is off. Click to enable it.'):
   followSuspended?tr('Du bladrer selv, mens musikken spiller. Klik for at følge igen. Afspil genoptager også automatisk sidefølge.','You are browsing while the music plays. Click to follow again. Play also resumes automatic following.'):
   tr('Siderne følger afspilningen. Bladring under afspilning sætter kun sidefølget på pause. Klik for at slå det fra.','Pages follow playback. Browsing while playing only suspends following. Click to turn it off.'));
 }
 function suspendFollow(){
  if(!playing||!followEnabled||followSuspended)return;
  followSuspended=true;paintFollow();previewKey='';previewAhead();
  announce.textContent=tr('Sidefølge sat på pause. Vælg Følg igen for at vende tilbage til musikken.','Page following paused. Choose Resume following to return to the music.');
 }
 function setPlaying(value){
  var starting=!!value&&!playing;playing=!!value;
  if(starting){followSuspended=false;manualScrollUntil=0;}
  paintFollow();previewKey='';previewAhead();
 }
 followButton.hidden=opts.audio===false||!!opts.editor;bar.appendChild(followButton);
 var deskButton=B('huwabc-page-desk','Nodepult','Music stand',function(){setDesk(!desk);});deskButton.hidden=!!opts.editor;deskButton.setAttribute('aria-keyshortcuts','Shift+N');deskButton.title=tr('Nodepult · Shift+N','Music stand · Shift+N');bar.appendChild(deskButton);
 var mixerButton=B('huwabc-page-mixer','☷','☷',function(){if(typeof opts.onMixer==='function')opts.onMixer(mixerButton);});
 mixerButton.hidden=true;mixerButton.setAttribute('aria-label',tr('Vis minimixer','Show mini mixer'));
 mixerButton.title=tr('Vis flytbar minimixer','Open floating mini mixer');bar.appendChild(mixerButton);
 var prev=B('huwabc-page-prev','‹','‹',function(){turn(-1,true);}),next=B('huwabc-page-next','›','›',function(){turn(1,true);});
 prev.setAttribute('aria-label',tr('Forrige side','Previous page'));next.setAttribute('aria-label',tr('Næste side','Next page'));
 var dots=E('div','huwabc-page-dots'),jump=E('select','huwabc-page-jump'),counter=E('span','huwabc-page-counter');
 jump.setAttribute('aria-label',tr('Gå til side','Go to page'));counter.setAttribute('aria-live','off');
 nav.appendChild(prev);nav.appendChild(dots);nav.appendChild(jump);nav.appendChild(counter);nav.appendChild(next);
 var announce=E('span','huwabc-page-sr');announce.setAttribute('role','status');nav.appendChild(announce);
 var ahead=E('aside','huwabc-page-ahead'),aheadLabel=E('div','huwabc-page-ahead-label'),aheadImage=E('div','huwabc-page-ahead-image');ahead.appendChild(aheadLabel);ahead.appendChild(aheadImage);ahead.hidden=true;shell.appendChild(ahead);
 var transportSlot=E('div','huwabc-page-transport');shell.appendChild(transportSlot);
 var warning=E('div','huwabc-page-warning');warning.hidden=true;shell.appendChild(warning);
 var transport=null,transportMark=null,deskOldMode=null,deskOldZoom=null,oldOverflow='',oldFocus=null,oldScroll=0;
 function requestedCount(){return {spread:2,three:3,four:4}[mode]||1;}
 function isPaged(){return mode!=='stack'&&mode!=='flow';}
 function countShown(){return Math.min(requestedCount(),Math.max(1,Math.floor((viewport.clientWidth+12)/332)));}
 function remember(){save('pageIndex',pageIndex);var a=anchor();if(a&&Number.isInteger(a.event))save('pageAnchor',a.event);}
 function anchor(){
  var record=records.find(function(r){return r.ordinal===selectedOrdinal&&r.page===activePage;})||records.find(function(r){return r.page===activePage;});
  return {event:record?record.ordinal:null,page:record?record.page:activePage};
 }
 function go(value,manual){
  if(!pages.length)return false;
  value=Math.max(0,Math.min(pages.length-1,Math.floor(Number(value)||0)));
  if(manual){suspendFollow();selectedOrdinal=null;}
  var before=pageIndex;activePage=value;
  // A dot selects a page, not the start of a spread. Keep an already visible page in place.
  if(!isPaged()||value<pageIndex||value>=pageIndex+countShown())pageIndex=value;
  var changed=before!==pageIndex;paint();
  if(mode==='stack'||mode==='flow')scrollPage();else if(changed)scrollViewport(0);
  if(manual){remember();announce.textContent=counter.textContent;}
  if(opts.onPageChange&&changed)opts.onPageChange(anchor());
  return true;
 }
 function turn(delta,manual){return go(pageIndex+delta*(isPaged()?countShown():1),manual);}
 function paint(){
  if(closed)return;
  shell.setAttribute('data-page-mode',mode);shell.setAttribute('data-page-zoom',zoom);shell.classList.toggle('huwabc-page-spread',countShown()>1);shell.setAttribute('data-pages-shown',String(countShown()));
  views.value=mode;zooms.value=zoom;paintFollow();
  var last=Math.min(pages.length-1,pageIndex+countShown()-1),stack=mode==='stack'||mode==='flow';
  pages.forEach(function(p,i){p.element.hidden=!stack&&(i<pageIndex||i>last);});
  paintActive();prev.disabled=pageIndex===0;next.disabled=pageIndex+countShown()>=pages.length;
  dots.hidden=pages.length>9;jump.hidden=pages.length<=9;nav.hidden=pages.length<=1&&!desk;
  followButton.hidden=!!opts.editor||opts.audio===false||pages.length<=1;
  resize();previewAhead();
 }
 // Update only the indicator during playback; never resize/rebuild the page for a moving dot.
 function paintActive(){
  activePage=Math.max(0,Math.min(Math.max(0,pages.length-1),activePage));
  shell.setAttribute('data-active-page',String(activePage+1));
  Array.from(dots.children).forEach(function(b,i){b.setAttribute('aria-current',i===activePage?'page':'false');b.setAttribute('aria-pressed',String(i===activePage));});
  pages.forEach(function(p,i){p.element.classList.toggle('huwabc-page-active',i===activePage);});
  jump.value=String(activePage);
  var last=Math.min(pages.length-1,pageIndex+countShown()-1);
  counter.textContent=isPaged()&&last>pageIndex?
   tr('Aktiv: ','Active: ')+(activePage+1)+tr(' · Viser ',' · Showing ')+(pageIndex+1)+'–'+(last+1)+tr(' af ',' of ')+pages.length:
   tr('Side ','Page ')+(pages.length?activePage+1:0)+tr(' af ',' of ')+pages.length;
 }
 function activatePage(index){if(index!==activePage){activePage=index;paintActive();}}
 function makeNavigation(){
  dots.textContent='';jump.textContent='';
  pages.forEach(function(p,i){
   if(pages.length<=9){var b=B('huwabc-page-dot','','',function(){go(i,true);});b.appendChild(E('span','huwabc-page-dot-mark'));b.setAttribute('aria-label',tr('Gå til side ','Go to page ')+(i+1));b.setAttribute('title',tr('Side ','Page ')+(i+1));b.setAttribute('aria-controls',p.element.id);dots.appendChild(b);}
   var o=E('option','',tr('Side ','Page ')+(i+1));o.value=String(i);jump.appendChild(o);
  });
 }
 function sourceRecords(){
  var seen=Object.create(null),pendingBreak=false;records=[];
  (tune&&tune.lines||[]).forEach(function(line){
   if(line.newpage!==undefined)pendingBreak=true;
   var firstBlock=null;
   (line.staff||[]).filter(function(s){return !s.clef||s.clef.type!=='TAB';}).forEach(function(s){(s.voices||[]).forEach(function(v){v.forEach(function(ev){
    if(ev.el_type!=='note'||typeof ev.startChar!=='number'||ev.startChar<0||seen[ev.startChar])return;
    seen[ev.startChar]=true;var node=elementOf(ev),b=blockOf(node);if(!b)return;
    if(!firstBlock)firstBlock=b;
    records.push({start:ev.startChar,end:ev.endChar,node:node,block:b,page:0});
   });});});
   if(pendingBreak&&firstBlock){firstBlock.breakBefore=true;pendingBreak=false;}
  });
  records.sort(function(a,b){return a.start-b.start;});records.forEach(function(r,i){r.ordinal=i;});
 }
 function blockOf(node){
  if(!node)return null;var svg=node.tagName&&node.tagName.toLowerCase()==='svg'?node:node.ownerSVGElement;return svg?svgIndex.get(svg)||null:null;
 }
 function layout(nextTune,nextFields){
  if(closed)return;
  var saved=layoutSerial?anchor():{event:initialAnchor,page:initialPage};
  manualScrollUntil=0;tune=nextTune||tune;fields=nextFields||fields;g=geometry(fields);blocks=[];svgIndex=new WeakMap();
  var svgs=Array.from(root.querySelectorAll('svg')).filter(function(s){return !s.ownerSVGElement;});
  svgs.forEach(function(svg){
   var vb=svg.viewBox.baseVal;if(!(vb.width>0&&vb.height>=0))return;
   var node=svg.parentElement;
   if(!node||node===root||node.children.length!==1||node.tagName.toLowerCase()!=='div'){node=E('div');node.appendChild(svg);}
   node.className='huwabc-system-block';node.removeAttribute('style');
   svg.style.display='block';svg.style.position='static';svg.style.width='100%';svg.style.height='auto';
   var b={node:node,svg:svg,height:Math.max(0,vb.height/vb.width),system:!!svg.querySelector('.abcjs-staff-wrapper,.huwabc-tabs-only'),footer:!!svg.querySelector('.abcjs-meta-bottom'),breakBefore:false,page:0};
   blocks.push(b);svgIndex.set(svg,b);
  });
  sourceRecords();pages=pack(blocks,g);var track=E('div','huwabc-pages-track');
  pages.forEach(function(p,i){
   var el=E('article','huwabc-page'),body=E('div','huwabc-page-body'),label=E('span','huwabc-page-folio',String(i+1));
   el.id=uid+'-'+i;el.setAttribute('aria-label',tr('Nodeside ','Score page ')+(i+1));el.setAttribute('data-page-index',String(i));
   el.style.aspectRatio=g.width+' / '+g.height;el.style.padding=(g.margin/g.width*100)+'%';
   // Padding percentages are relative to the track; use an inner page-width
   // container so spread/grid layouts have the same geometry as a single page.
   el.style.padding='0';body.style.margin=(g.margin/g.width*100)+'%';body.style.width=((g.width-2*g.margin)/g.width*100)+'%';
   if(p.scale<1){body.style.width=((g.width-2*g.margin)/g.width*p.scale*100)+'%';body.style.marginLeft='auto';body.style.marginRight='auto';}
   p.items.forEach(function(b){b.page=i;body.appendChild(b.node);});el.appendChild(body);el.appendChild(label);track.appendChild(el);p.element=el;
  });
  records.forEach(function(r){r.page=r.block.page;});root.textContent='';root.style.paddingBottom='';root.appendChild(track);
  root.setAttribute('data-page-count',String(pages.length));root.style.setProperty('--huwabc-page-ratio',String(g.width/g.height));
  pageIndex=Math.max(0,Math.min(pages.length-1,Number(saved.page)||0));
  var restored=Number.isInteger(saved.event)&&records[saved.event];if(restored)pageIndex=restored.page;
  activePage=pageIndex;layoutSerial++;makeNavigation();paint();
  var small=pages.some(function(p){return p.scale<.999;});warning.hidden=!small;warning.textContent=small?tr('Et højt nodesystem er skaleret ned for at stå helt på én side.','An unusually tall system has been reduced to fit intact on one page.'):'';
 }
 function scrollPage(){
  var p=pages[pageIndex];if(!p)return;
  var a=p.element.getBoundingClientRect(),b=viewport.getBoundingClientRect();scrollViewport(viewport.scrollTop+a.top-b.top);
 }
 function revealNode(node,scroll){
  var b=blockOf(node);if(!b)return false;
  var r=records.find(function(x){return x.node===node||x.node.contains&&x.node.contains(node)||node.contains&&node.contains(x.node);});
  if(r)selectedOrdinal=r.ordinal;activatePage(b.page);
  if(b.page<pageIndex||b.page>=pageIndex+countShown()){pageIndex=b.page;paint();}
  if(scroll){var rect=node.getBoundingClientRect(),v=viewport.getBoundingClientRect();if(rect.top<v.top+8||rect.bottom>v.bottom-8)scrollViewport(viewport.scrollTop+rect.top-v.top-Math.min(60,viewport.clientHeight*.2));}
  return true;
 }
 function revealOrdinal(n,scroll){var r=records[n];return r?revealNode(r.node,scroll):false;}
 function eventBlock(ev){
  var nodes=flat(ev&&ev.elements),b=null;
  for(var i=0;i<nodes.length;i++){b=blockOf(nodes[i]);if(b)return b;}
  var chars=ev&&ev.startCharArray||[ev&&ev.startChar];
  for(var j=0;j<chars.length;j++){var r=records.find(function(x){return x.start===chars[j];});if(r)return r.block;}
  return null;
 }
 function revealEvent(ev){
  var b=eventBlock(ev);if(!b)return;
  if(mode==='stack'||mode==='flow'){
   pageIndex=b.page;paint();var rect=b.node.getBoundingClientRect(),v=viewport.getBoundingClientRect();
   if(viewport.scrollHeight>viewport.clientHeight+1&&(rect.top<v.top||rect.bottom>v.bottom))scrollViewport(viewport.scrollTop+rect.top-v.top);
  }else if(b.page<pageIndex||b.page>=pageIndex+countShown()){pageIndex=b.page;paint();scrollViewport(0);}
  // Width zoom can intentionally make a whole page taller than the viewport.
  if(isPaged()){var r=b.node.getBoundingClientRect(),vr=viewport.getBoundingClientRect();if(viewport.scrollHeight>viewport.clientHeight+1&&(r.top<vr.top||r.bottom>vr.bottom))scrollViewport(viewport.scrollTop+r.top-vr.top);}
 }
 function onEvent(ev){if(!ev||closed)return;lastEvent=ev;var block=eventBlock(ev);if(block)activatePage(block.page);if(isFollowing())revealEvent(ev);previewAhead();}
 var previewKey='';
 function previewAhead(){
  if(!desk||!blocks.length||ahead.hidden)return;
  var target=null;
  if(playing&&lastEvent&&isFollowing()){
   var current=eventBlock(lastEvent),timings=tune&&tune.noteTimings||[],lo=0,hi=timings.length;
   while(lo<hi){var mid=(lo+hi)>>1;if(timings[mid].milliseconds<=lastEvent.milliseconds)lo=mid+1;else hi=mid;}
   for(var i=lo;i<timings.length;i++){var b=eventBlock(timings[i]);if(b&&current&&(b.page<pageIndex||b.page>=pageIndex+countShown())){target=b;break;}}
  }else{target=blocks.find(function(b){return b.system&&b.page===pageIndex+countShown();});}
  var key=target?layoutSerial+':'+blocks.indexOf(target):'end';if(key===previewKey)return;previewKey=key;aheadImage.textContent='';
  aheadLabel.textContent=target?tr('Herefter: side ','Coming next: page ')+(target.page+1):tr('Sidste side','Last page');
  if(target){var svg=safeClone(target.svg);svg.style.width='100%';svg.style.height='100%';svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.setAttribute('aria-hidden','true');aheadImage.appendChild(svg);}
 }
 function resize(){
  if(closed)return;var width=viewport.clientWidth;if(!width)return;
  var gap=12,shown=countShown(),pageWidth=(width-(shown-1)*gap)/shown;
  var height=desk?Math.max(120,viewport.clientHeight-8):
   availablePageHeight(win.innerHeight,viewport.getBoundingClientRect().top,
    (nav.hidden?0:nav.offsetHeight)+(warning.hidden?0:warning.offsetHeight),!!opts.editor);
  var limit=desk?'none':height+'px';
  if(viewport.style.maxHeight!==limit)viewport.style.maxHeight=limit;
  if(zoom==='page')pageWidth=Math.min(pageWidth,(height-8)*g.width/g.height);
  else if(/^\d+$/.test(zoom))pageWidth*=Number(zoom)/100;
  var paperWidth=Math.max(120,pageWidth)+'px';
  var trackWidth=Math.max(width,pageWidth*shown+(shown-1)*gap)+'px';
  if(root.style.getPropertyValue('--huwabc-page-width')!==paperWidth)root.style.setProperty('--huwabc-page-width',paperWidth);
  if(root.style.getPropertyValue('--huwabc-track-width')!==trackWidth)root.style.setProperty('--huwabc-track-width',trackWidth);
 }
 function setDesk(value){
  value=!!value;if(value===desk||closed||opts.editor)return;
  if(value&&activeDesk&&activeDesk!==api)activeDesk.setDesk(false);
  desk=value;shell.classList.toggle('huwabc-page-is-desk',desk);mixerButton.hidden=!desk||typeof opts.onMixer!=='function'||opts.audio===false;deskButton.textContent=desk?tr('Tilbage','Back'):tr('Nodepult','Music stand');deskButton.title=desk?tr('Tilbage · Esc eller Shift+N','Back · Esc or Shift+N'):tr('Nodepult · Shift+N','Music stand · Shift+N');
  // The old fixed-height future-page preview wasted music-stand screen space.
  // Nav and playback now share ONE lower toolbar. Keep the unused preview
  // hidden (a future preview should overlay the score, not reserve height).
  ahead.hidden=true;
  if(desk){
   if(nav.parentNode!==transportSlot)transportSlot.insertBefore(nav,transportSlot.firstChild);
   activeDesk=api;deskOldMode=mode;deskOldZoom=zoom;mode='spread';zoom='page';
   oldFocus=doc.activeElement;oldScroll=win.scrollY;oldOverflow=doc.body.style.overflow;doc.body.style.overflow='hidden';
   shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');shell.setAttribute('aria-label',tr('Nodepult. Escape går tilbage.','Music stand. Escape returns.'));
   transport=typeof opts.transport==='function'?opts.transport():opts.transport;
   if(transport&&transport.parentNode){transportMark=doc.createComment('music stand transport');transport.parentNode.insertBefore(transportMark,transport);transportSlot.appendChild(transport);}
   if(opts.onDesk)opts.onDesk(true);deskButton.focus({preventScroll:true});
  }else{
   if(nav.parentNode===transportSlot)shell.insertBefore(nav,ahead);
   if(transportMark&&transportMark.parentNode){transportMark.parentNode.insertBefore(transport,transportMark);transportMark.remove();}transportMark=null;transport=null;
   doc.body.style.overflow=oldOverflow;shell.removeAttribute('role');shell.removeAttribute('aria-modal');
   if(activeDesk===api)activeDesk=null;pageIndex=activePage;mode='single';zoom=deskOldZoom||'width';save('pageMode','single');
   if(opts.onDesk)opts.onDesk(false);if(oldFocus&&oldFocus.isConnected)oldFocus.focus({preventScroll:true});win.scrollTo(0,oldScroll);
  }
  previewKey='';paint();
 }
 views.addEventListener('change',function(){manualScrollUntil=0;mode=views.value;pageIndex=activePage;if(!desk)save('pageMode',mode);paint();if(mode==='stack'||mode==='flow')scrollPage();});
 zooms.addEventListener('change',function(){manualScrollUntil=0;zoom=zooms.value;if(!desk)save('pageZoom',zoom);paint();});
 jump.addEventListener('change',function(){go(Number(jump.value),true);});
 function keys(e){
  if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  if(desk&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setDesk(false);return;}
  if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(e.key==='PageDown'||e.key==='PageUp'||(!opts.editor&&(e.key==='ArrowLeft'||e.key==='ArrowRight'))){e.preventDefault();e.stopPropagation();turn(e.key==='PageUp'||e.key==='ArrowLeft'?-1:1,true);}
  if(desk&&e.key==='Tab'){
   var buttons=Array.from(shell.querySelectorAll('button,select,[tabindex="0"]')).filter(function(n){return !n.disabled&&n.getClientRects().length;});
   if(buttons.length&&((e.shiftKey&&doc.activeElement===buttons[0])||(!e.shiftKey&&doc.activeElement===buttons[buttons.length-1]))){e.preventDefault();(e.shiftKey?buttons[buttons.length-1]:buttons[0]).focus();}
  }
 }
 shell.addEventListener('keydown',keys,true);
 var touch=null,suppressUntil=0,manualScrollUntil=0,programmaticScroll=null;
 function scrollViewport(top){
  viewport.scrollTop=top;
  programmaticScroll={top:viewport.scrollTop,left:viewport.scrollLeft};
 }
 function manualScroll(event){
  if(event&&event.type==='wheel'){
   if(event.ctrlKey)return; // Trackpad pinch/zoom is not a page-follow command.
   var x=event.deltaX||0,y=event.deltaY||0;
   var canY=(y<0&&viewport.scrollTop>1)||(y>0&&viewport.scrollTop+viewport.clientHeight<viewport.scrollHeight-1);
   var canX=(x<0&&viewport.scrollLeft>1)||(x>0&&viewport.scrollLeft+viewport.clientWidth<viewport.scrollWidth-1);
   if(!canX&&!canY)return; // A wheel event at an edge must not switch following off.
  }
  manualScrollUntil=Date.now()+1600;
 }
 function scrolled(){
  if(closed)return;
  if(programmaticScroll&&Math.abs(programmaticScroll.top-viewport.scrollTop)<1&&Math.abs(programmaticScroll.left-viewport.scrollLeft)<1){programmaticScroll=null;return;}
  programmaticScroll=null;
  if(Date.now()>manualScrollUntil)return;
  if(!opts.editor)suspendFollow();
  if(mode!=='flow'&&mode!=='stack')return;
  var top=viewport.getBoundingClientRect().top+Math.min(60,viewport.clientHeight*.15),index=0;
  pages.forEach(function(p,i){if(p.element.getBoundingClientRect().top<=top)index=i;});
  if(index!==pageIndex){activePage=index;pageIndex=index;selectedOrdinal=null;paint();remember();if(opts.onPageChange)opts.onPageChange(anchor());}
 }
 function scrollPointer(e){if(e.target===viewport)manualScroll();}
 function moved(e){if(touch&&e.pointerId===touch.id&&Math.abs(e.clientY-touch.y)>12)manualScroll();}
 viewport.addEventListener('wheel',manualScroll,{passive:true});viewport.addEventListener('scroll',scrolled,{passive:true});viewport.addEventListener('pointerdown',scrollPointer,{passive:true});

 function down(e){if(e.pointerType!=='touch'||!e.isPrimary||opts.editor){touch=null;return;}touch={id:e.pointerId,x:e.clientX,y:e.clientY};}
 function up(e){if(!touch||e.pointerId!==touch.id)return;var dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.6){suppressUntil=Date.now()+600;turn(dx<0?1:-1,true);}}
 function suppress(e){if(desk||Date.now()<suppressUntil){
  if(desk&&e.type==='click'&&Date.now()>=suppressUntil){var box=viewport.getBoundingClientRect(),x=(e.clientX-box.left)/Math.max(1,box.width);if(x<.23)turn(-1,true);else if(x>.77)turn(1,true);}
  e.preventDefault();e.stopImmediatePropagation();
 }}
 root.addEventListener('pointerdown',down,{passive:true});root.addEventListener('pointerup',up,{passive:true});
 function cancelTouch(){touch=null;}
 root.addEventListener('pointercancel',cancelTouch);root.addEventListener('pointermove',moved,{passive:true});
 ['click','mousedown','mouseup'].forEach(function(type){root.addEventListener(type,suppress,true);});
 // ResizeObserver must not synchronously resize its own observed viewport.
 // Defer geometry writes to the next frame (also when the virtual keyboard opens).
 var resizeFrame=0;
 function scheduleResize(){if(closed||resizeFrame)return;resizeFrame=win.requestAnimationFrame(function(){
  resizeFrame=0;if(closed)return;
  var before=Number(shell.getAttribute('data-pages-shown')),after=countShown();
  if(before!==after){if(isFollowing()&&activePage>=pageIndex+after)pageIndex=activePage;paint();}else resize();
 });}
 var observer=typeof ResizeObserver==='function'?new ResizeObserver(scheduleResize):null;
 if(observer){
  observer.observe(viewport);
  // A collapsed TiddlyWiki panel can move the sheet without changing its width.
  // Watch the enclosing frame as well so its new vertical position is measured.
  var outer=shell.closest&&shell.closest('.tc-tiddler-frame')||shell.parentElement;
  if(outer&&outer!==viewport)observer.observe(outer);
 }
 win.addEventListener('resize',scheduleResize);
 function openPrintPreview(css,instrumentLabel){
  if(!pages.length)return false;
  return PrintExport.open({doc:doc,language:I18n.language(opts.wiki),title:opts.title||tr('HUWiki Nodeark','HUWiki Sheet Music'),geom:g,
   css:css||'',instrumentLabel:instrumentLabel||'',pages:pages.map(function(p){return safeClone(p.element);})});
 }
 function printTo(win,css,instrumentLabel){
  if(!pages.length)return false;var d=win.document;d.open();d.write('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><div class="print-tools"><button type="button"></button></div><main></main></body></html>');d.close();
  d.documentElement.lang=I18n.language(opts.wiki);d.title=(opts.title||tr('HUWiki Nodeark','HUWiki Sheet Music'))+(instrumentLabel?' · '+instrumentLabel:'');
  var style=d.createElement('style');style.textContent=(css||'')+'\n@page{size:'+g.width+'mm '+g.height+'mm;margin:0}html,body{margin:0;padding:0;color:#111;background:#eee;font-family:system-ui}.print-tools{text-align:center;padding:12px}.huwabc-page{display:block;position:relative;box-sizing:border-box;width:'+g.width+'mm!important;height:'+g.height+'mm!important;aspect-ratio:auto!important;margin:8mm auto!important;background:white;overflow:hidden;break-after:page;page-break-after:always}.huwabc-page:last-child{break-after:auto;page-break-after:auto}.huwabc-page-body{display:flow-root}.huwabc-page-folio{position:absolute;bottom:3mm;right:8mm;font:9pt system-ui;color:#777}.huwabc-system-block{line-height:0;break-inside:avoid}.huwabc-system-block svg{display:block;width:100%;height:auto;overflow:visible}@media print{html,body{background:white}.print-tools{display:none}.huwabc-page{margin:0!important;box-shadow:none!important}}';d.head.appendChild(style);
  var main=d.querySelector('main');pages.forEach(function(p){var copy=safeClone(p.element);copy.hidden=false;
   if(instrumentLabel){var info=d.createElement('div');info.className='huwabc-print-instrument';info.textContent=instrumentLabel;copy.appendChild(info);}
   main.appendChild(d.adoptNode(copy));});
  var printStyle=d.createElement('style');printStyle.textContent='.huwabc-print-instrument{position:absolute;top:3mm;right:8mm;z-index:3;color:#555;font:8pt system-ui,sans-serif;letter-spacing:.025em;white-space:nowrap}';d.head.appendChild(printStyle);
  var b=d.querySelector('button');b.textContent=tr('Udskriv / Gem som PDF','Print / Save as PDF');b.addEventListener('click',function(){win.print();});win.focus();return true;
 }
 function destroy(){
  if(closed)return;if(desk)setDesk(false);closed=true;
  if(observer)observer.disconnect();win.removeEventListener('resize',scheduleResize);if(resizeFrame)win.cancelAnimationFrame(resizeFrame);shell.removeEventListener('keydown',keys,true);
  ['click','mousedown','mouseup'].forEach(function(type){root.removeEventListener(type,suppress,true);});root.removeEventListener('pointerdown',down);root.removeEventListener('pointerup',up);
  viewport.removeEventListener('wheel',manualScroll);viewport.removeEventListener('scroll',scrolled);viewport.removeEventListener('pointerdown',scrollPointer);root.removeEventListener('pointercancel',cancelTouch);root.removeEventListener('pointermove',moved);
  if(root._huwabcPager===api)delete root._huwabcPager;
 }
 var api={layout:layout,onEvent:onEvent,setPlaying:setPlaying,select:function(n){var b=blockOf(n);if(b){var r=records.find(function(r){return r.node===n||r.node.contains(n)||n.contains(r.node);});if(r)selectedOrdinal=r.ordinal;activatePage(b.page);}},
  anchor:anchor,revealNode:revealNode,revealOrdinal:revealOrdinal,next:function(){return turn(1,true);},previous:function(){return turn(-1,true);},first:function(){return go(0,false);},go:go,
  isDesk:function(){return desk;},setDesk:setDesk,isFollowing:isFollowing,destroy:destroy,printTo:printTo,openPrintPreview:openPrintPreview,viewport:viewport,element:shell,
  info:function(){return {page:pageIndex+1,activePage:activePage+1,count:pages.length,mode:mode,shown:countShown(),requested:requestedCount(),follow:isFollowing(),followEnabled:followEnabled,followSuspended:followSuspended,playing:playing,desk:desk,anchor:anchor(),pages:pages.map(function(p){return {height:p.height,scale:p.scale,systems:p.systems};})};}};
 root._huwabcPager=api;return api;
}
exports.mount=mount;exports.pack=pack;exports.geometry=geometry;exports.safeClone=safeClone;exports.availablePageHeight=availablePageHeight;
})();
