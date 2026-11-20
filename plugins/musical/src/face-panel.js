/*\
title: $:/plugins/huwiki/musical/face-panel.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Face=require("$:/plugins/huwiki/musical/face.js"),NS="http://www.w3.org/2000/svg",serial=0;
function element(doc,tag,cls,text,parent){var node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
function copy(value){return JSON.parse(JSON.stringify(value||{}));}
function timeLabel(value){var n=Math.max(0,Number(value)||0),seconds=(n%60).toFixed(1);return Math.floor(n/60)+":"+(Number(seconds)<10?"0":"")+seconds;}
function containsPart(scene,id,root){var map={},seen={};(scene&&scene.parts||[]).forEach(function(p){map[p.id]=p;});while(id&&map[id]&&!seen[id]){if(id===root)return true;seen[id]=true;id=map[id].parent;}return false;}
function channelFor(context,id){var parts=context.parts||{};
 if([parts.open,parts.closed].indexOf(id)>=0||/(?:^|[-_ ])(?:mouth|mund|lip|lips)(?:[-_ ]|$)/i.test(id))return "mouth";
 if([].concat(parts.eyes||[],parts.pupils||[],parts.brows||[],parts.lids||[]).indexOf(id)>=0||/(?:^|[-_ ])(?:eyes?|pupils?|brows?|lids?|oejne|ojen|øjne)(?:[-_ ]|$)/i.test(id))return "eyes";
 return "expression";
}
function isFace(context,id){
 if(!context||!id)return false;
 if(channelFor(context,id)!=="expression")return true;
 var scene=context.scene||context.view&&context.view.scene,root=context.actorPartId||context.actorId;
 // A flat custom figure may use its actor root as the facial fallback.
 // Its arms and legs must not inherit the meaning of a separate head.
 if(context.headId&&context.headId!==root&&context.headId!==context.actorId)return containsPart(scene,id,context.headId);
 var part=(scene&&scene.parts||[]).find(function(p){return p.id===id;});
 return !!(id===context.headId&&part&&/(?:^|[-_ ])(?:head|hoved|face|ansigt)(?:[-_ ]|$)/i.test((part.name||"")+" "+part.id));
}
function mount(o){
 var doc=o.doc,host=o.host,da=!/\/en(?:-|$)/i.test(o.wiki.getTiddlerText("$:/language","")),uid="huw-face-"+(++serial);
 var L=da?{title:"Ansigt og tale",face:"Ansigt",eyes:"Øjne",mouth:"Mund",auto:"Auto",custom:"Auto · tilpasset",fixed:"Fast mund",script:"Manuskript",follow:"Følg manuskript",hold:"Hold denne mund",more:"Flere valg",close:"Luk ansigtsvalg",workshop:"Ansigtsværksted",back:"Tilbage til animationen",sounds:"Bogstavgrupper og mundvalg",history:"Anvendte ansigtsvalg",noHistory:"Der er endnu ingen ansigtsvalg på tidslinjen.",noLine:"Ingen replik ved tidsmarkøren",line:"Replik",from:"Fra",future:"dit valg bruges fremover",expressionHint:"Vælg et udtryk. Munden følger stadig talen.",eyesHint:"Vælg øjne eller blik ved tidsmarkøren.",soundHint:"Vælg en bogstavgruppe og derefter en mund. Valget gælder fra tidsmarkøren for denne figur, også i senere scener.",saved:"Valget er gemt ved tidsmarkøren.",empty:"Der er ingen mundtegninger til denne figur.",original:"Original",pause:"Pause",go:"Gå til",resetHint:"Brug manuskriptets automatiske mundvalg fra tidsmarkøren.",holdHint:"Hold den valgte mund fast fra tidsmarkøren. Følg manuskript slår automatisk mund til igen.",chooseHint:"Vælg en mund til denne bogstavgruppe"}:
 {title:"Face and speech",face:"Face",eyes:"Eyes",mouth:"Mouth",auto:"Auto",custom:"Auto · customised",fixed:"Fixed mouth",script:"Script",follow:"Follow script",hold:"Hold this mouth",more:"More choices",close:"Close face choices",workshop:"Face workshop",back:"Back to animation",sounds:"Letter groups and mouth choices",history:"Face choices on the timeline",noHistory:"There are no face choices on the timeline yet.",noLine:"No line at the playhead",line:"Line",from:"From",future:"your choice applies from here",expressionHint:"Choose an expression. The mouth still follows speech.",eyesHint:"Choose eyes or gaze at the playhead.",soundHint:"Choose a letter group, then a mouth. Your choice applies from the playhead for this character, including later scenes.",saved:"Choice saved at the playhead.",empty:"This character has no mouth drawings.",original:"Original",pause:"Pause",go:"Go to",resetHint:"Use the script's automatic mouth choice from the playhead.",holdHint:"Hold this mouth from the playhead. Follow script turns automatic mouth movement back on.",chooseHint:"Choose a mouth for this letter group"};
 var panel=element(doc,"section","huw-musical-face-panel"),anchor=doc.createComment("face choices"),selectedId="",context=null,tab="expression",soundOverride="",dismissed=false,suspended=0,disposed=false,workshop=null,returnFocus=null,backgroundInert=[],cardStamp="",cardView=null,overviewStamp="",lastRefresh=-1;
 panel.hidden=true;panel.setAttribute("data-face-panel","");panel.setAttribute("aria-label",L.title);
 o.parent.insertBefore(anchor,o.before||null);o.parent.insertBefore(panel,anchor);
 var top=element(doc,"div","huw-musical-face-top",undefined,panel),title=element(doc,"strong","huw-musical-face-title","",top);
 var tabs=element(doc,"div","huw-musical-face-tabs",undefined,top);tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label",L.title);
 var tabButtons={};
 function button(parent,cls,text,fn){var b=element(doc,"button",cls,text,parent);b.type="button";b.addEventListener("click",fn);return b;}
 [["expression",L.face],["eyes",L.eyes],["mouth",L.mouth]].forEach(function(item){var b=button(tabs,"huw-musical-face-tab",item[1],function(){setTab(item[0]);});b.dataset.faceTab=item[0];b.id=uid+"-tab-"+item[0];b.setAttribute("role","tab");b.setAttribute("aria-controls",uid+"-choices");tabButtons[item[0]]=b;});
 tabs.addEventListener("keydown",function(e){var ids=["expression","eyes","mouth"],index=ids.indexOf(tab),next;
  if(e.key==="ArrowRight")next=(index+1)%ids.length;else if(e.key==="ArrowLeft")next=(index+ids.length-1)%ids.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=ids.length-1;else return;
  e.preventDefault();e.stopPropagation();setTab(ids[next]);tabButtons[ids[next]].focus();
 });
 var status=element(doc,"span","huw-musical-face-status","",top);
 var workshopButton=button(top,"huw-musical-face-workshop-open",L.workshop,openWorkshop);
 var closeButton=button(top,"huw-musical-face-close","×",function(){dismissed=true;closeWorkshop();show(false);if(o.onClose)o.onClose();});closeButton.setAttribute("aria-label",L.close);
 var cards=element(doc,"div","huw-musical-face-choices",undefined,panel);cards.id=uid+"-choices";cards.setAttribute("role","tabpanel");
 var foot=element(doc,"div","huw-musical-face-footer",undefined,panel),copyArea=element(doc,"div","huw-musical-face-copy",undefined,foot);
 var explanation=element(doc,"p","huw-musical-face-context","",copyArea),line=element(doc,"p","huw-musical-face-line","",copyArea);
 var actions=element(doc,"div","huw-musical-face-actions",undefined,foot);
 var follow=button(actions,"huw-musical-face-follow",L.follow,function(){choose("mouth","auto");});follow.dataset.faceChannel="mouth";follow.dataset.faceValue="auto";follow.title=L.resetHint;
 var more=element(doc,"details","huw-musical-face-more",undefined,actions);element(doc,"summary","",L.more,more);
 var hold=button(more,"huw-musical-face-hold",L.hold,function(){var id=effectiveVariant();if(id)choose("mouth",id,"fixed");});hold.title=L.holdHint;hold.dataset.faceMode="fixed";
 var script=button(actions,"huw-musical-face-script",L.script,function(){var cue=context&&context.cue||{partId:context&&context.cueId,time:o.position()};closeWorkshop();if(o.onScript)o.onScript(cue);});
 var undo=button(actions,"huw-musical-face-undo",da?"Fortryd valget":"Undo choice",function(){if(o.undo)o.undo();overviewStamp="";refresh(true);});undo.disabled=true;
 var announcement=element(doc,"span","huw-musical-face-announcement","",panel);announcement.setAttribute("role","status");announcement.setAttribute("aria-live","polite");
 panel.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(workshop)closeWorkshop();else{dismissed=true;show(false);if(o.onClose)o.onClose();}}});
 function sound(){return soundOverride||context&&context.viseme||"rest";}
 function soundName(value){var item=(Face.SOUNDS||[]).find(function(s){return s.id===value;});return item?(da?item.label:item.en||item.label):value==="rest"?L.pause:value;}
 function sounds(){return Face.SOUNDS&&Face.SOUNDS.length?Face.SOUNDS:[{id:"A",letters:"a"},{id:"E",letters:"e / i / y / æ"},{id:"O",letters:"o / u / å / ø"},{id:"F",letters:"f / v"},{id:"M",letters:"m / b / p"},{id:"C",letters:da?"øvrige konsonanter":"other consonants"},{id:"rest",letters:L.pause}];}
 function variantName(id){var v=(context&&context.variants||[]).find(function(item){return item.id===id;});return v&&(v.name||v.label)||id||L.original;}
 function effectiveVariant(value){if(!context)return "";var which=value||sound(),map=context.variantMap||{},state=context.state||{},manual=state.mouth&&state.mouth.mode==="fixed";
  if(manual&&!value)return state.mouth.variant||"";return map[which]||state.mouthMap&&state.mouthMap[which]||(!value||which===context.viseme?context.effectiveVariant:"")||context.defaultVariantMap&&context.defaultVariantMap[which]||"";
 }
 function show(value){value=!!value&&!suspended&&!disposed;var changed=panel.hidden===value;panel.hidden=!value;host.classList.toggle("huw-musical--face-open",value&&!workshop);if(changed&&o.onLayout)o.onLayout();}
 function setTab(value){tab=value;cardStamp="";refresh(true);}
 function choose(channel,value,mode){if(!context||suspended)return;var command={channel:channel,value:value,viseme:sound()};if(channel==="mouth")command.mode=mode||"auto";
  var result=o.choose(selectedId,command);if(result===false)return;announcement.textContent=L.saved;overviewStamp="";refresh(true);
  if(result&&typeof result.then==="function")result.then(function(){if(!disposed)refresh(true);});
 }
 function select(id,preferred,allowActor){if(disposed)return false;var next=id&&o.context(id);if(!next||!allowActor&&!isFace(next,id)){selectedId="";context=null;closeWorkshop();show(false);return false;}
  var different=!context||context.actorId!==next.actorId||!allowActor&&selectedId!==id;selectedId=id;context=next;dismissed=false;if(different){tab=preferred||channelFor(next,id);soundOverride="";cardStamp="";overviewStamp="";}
  else if(preferred)tab=preferred;refresh(true);return true;
 }
 function currentCue(){var cue=context&&context.cue;return typeof cue==="string"?cue:cue&&(cue.text||cue.line)||context&&context.text||"";}
 function refresh(force){if(disposed||!selectedId)return;var now=Date.now();if(!force&&now-lastRefresh<100)return;lastRefresh=now;
  var next=o.context(selectedId);if(!next){show(false);return;}context=next;if(dismissed||suspended){show(false);return;}show(true);
  panel.dataset.faceTarget=context.actorId||"";panel.dataset.facePart=selectedId;panel.dataset.faceViseme=sound();title.textContent=context.label||L.face;
  var state=context.state||{},fixed=state.mouth&&state.mouth.mode==="fixed",custom=context.custom||Object.keys(state.mouthMap||{}).some(function(k){return !!state.mouthMap[k];});
  status.textContent=fixed?L.fixed:custom?L.custom:L.auto;status.dataset.faceAuto=fixed?"fixed":custom?"custom":"original";
  Object.keys(tabButtons).forEach(function(id){var active=id===tab;tabButtons[id].setAttribute("aria-selected",String(active));tabButtons[id].tabIndex=active?0:-1;});cards.setAttribute("aria-labelledby",tabButtons[tab].id);
  explanation.dataset.faceViseme=sound();explanation.textContent=tab==="mouth"?soundName(sound())+" · "+L.future:tab==="eyes"?L.eyesHint:L.expressionHint;
  var lineLabel=context.cue&&context.cue.active===false?(da?"Nærmeste replik":"Nearest line"):L.line;
  line.textContent=lineLabel+": "+(currentCue()||L.noLine);line.title=line.textContent;script.title=L.script+(currentCue()?": "+currentCue():"");
  var currentCustom=!!(state.mouthMap&&state.mouthMap[sound()]);
  follow.hidden=more.hidden=tab!=="mouth";hold.disabled=!effectiveVariant();follow.setAttribute("aria-pressed",String(!fixed&&!currentCustom));follow.title=soundName(sound())+" · "+L.resetHint;
  undo.disabled=!(o.canUndo&&o.canUndo());
  renderCards();if(workshop)renderOverview();
 }
 function choices(){if(tab==="mouth")return (context.variants||[]).map(function(v){return {id:v.id,label:v.name||v.label||v.id,en:v.name||v.label||v.id};});return tab==="eyes"?Face.EYES||[]:Face.PRESETS||[];}
 function previewState(channel,value){var state=copy(context.state);if(channel==="mouth")state.mouth={mode:"fixed",variant:value};
  else if(channel==="eyes")state.eyes=value;
  else {var preset=Face.preset?Face.preset(value):{mood:value};Object.keys(preset||{}).forEach(function(key){state[key]=preset[key];});}
  return state;
 }
 function renderCards(){var items=choices(),stamp=[context.actorId,context.headId,tab,items.map(function(v){return v.id+":"+v.label;}).join("|")].join("\n");
  if(stamp!==cardStamp||context.view!==cardView){cardStamp=stamp;cardView=context.view;cards.textContent="";
   if(!items.length)element(doc,"p","huw-musical-face-empty",L.empty,cards);
   items.forEach(function(item){var channel=tab,b=button(cards,"huw-musical-face-choice","",function(){choose(channel,item.id);});b.dataset.faceChannel=channel;b.dataset.faceValue=item.id;
    var thumb=element(doc,"span","huw-musical-face-thumbnail",undefined,b);thumbnail(thumb,previewState(channel,item.id),channel);
    element(doc,"span","huw-musical-face-choice-name",da?item.label:item.en||item.label,b);b.setAttribute("aria-label",(channel==="mouth"?L.mouth:channel==="eyes"?L.eyes:L.face)+": "+(da?item.label:item.en||item.label));
   });
  }
  var state=context.state||{},selected=tab==="mouth"?effectiveVariant():tab==="eyes"?state.eyes||"auto":state.mood||"original";
  Array.prototype.forEach.call(cards.querySelectorAll("[data-face-value]"),function(b){b.setAttribute("aria-pressed",String(b.dataset.faceValue===selected));});
 }
 function thumbnail(parent,state,channel){var view=context&&context.view,source=view&&view.nodes&&view.nodes[context.headId];if(!source||!source.el){element(doc,"span","huw-musical-face-preview-missing",L.face,parent);return;}
  var mini=doc.createElementNS(NS,"svg"),head=source.el.cloneNode(true),nodes={},prefix=uid+"-preview-"+(++serial)+"-";mini.setAttribute("viewBox","-100 -140 200 200");mini.setAttribute("aria-hidden","true");mini.setAttribute("focusable","false");mini.setAttribute("preserveAspectRatio","xMidYMid meet");
  head.removeAttribute("transform");head.removeAttribute("display");head.setAttribute("opacity","1");head.style.display="";
  Array.prototype.forEach.call(head.querySelectorAll(".huw-cutout-joint,.huw-musical-transform-overlay"),function(node){node.remove();});
  var all=[head].concat(Array.prototype.slice.call(head.querySelectorAll("[data-cutout-id]")));
  all.forEach(function(node){var id=node.getAttribute("data-cutout-id"),original=view.nodes&&view.nodes[id];node.classList.remove("huw-musical-selected-element","huw-musical-preview-hidden");if(original)nodes[id]={el:node,shape:node.firstElementChild,part:original.part,variant:original.variant};});
  var defs=view.svg&&view.svg.querySelector("defs");if(defs)mini.appendChild(defs.cloneNode(true));mini.appendChild(head);
  var ids={};Array.prototype.forEach.call(mini.querySelectorAll("[id]"),function(node){var id=node.getAttribute("id");ids[id]=prefix+id;node.setAttribute("id",ids[id]);});
  Array.prototype.forEach.call(mini.querySelectorAll("*"),function(node){Array.prototype.slice.call(node.attributes||[]).forEach(function(a){var value=a.value;Object.keys(ids).forEach(function(id){value=value.split("#"+id).join("#"+ids[id]);});if(value!==a.value)node.setAttribute(a.name,value);});});
  parent.appendChild(mini);
  if(Face.preview)Face.preview({svg:mini,nodes:nodes,scene:view.scene,wiki:view.wiki,clips:[],localTime:context.localTime},context.actorId,state);
  var parts=context.parts||{},targets=channel==="mouth"?[parts.open,parts.closed]:channel==="eyes"?[].concat(parts.eyes||[],parts.pupils||[],parts.brows||[],parts.lids||[]):[context.headId],bounds=[];
  try{var inverse=mini.getCTM().inverse();targets.forEach(function(id){var node=nodes[id]&&nodes[id].el;if(!node)return;var bb=node.getBBox(),matrix=inverse.multiply(node.getCTM());if(!(bb.width>0&&bb.height>0))return;[[bb.x,bb.y],[bb.x+bb.width,bb.y],[bb.x+bb.width,bb.y+bb.height],[bb.x,bb.y+bb.height]].forEach(function(p){bounds.push({x:matrix.a*p[0]+matrix.c*p[1]+matrix.e,y:matrix.b*p[0]+matrix.d*p[1]+matrix.f});});});
   if(!bounds.length){var bb=head.getBBox();bounds=[{x:bb.x,y:bb.y},{x:bb.x+bb.width,y:bb.y+bb.height}];}
   var xx=bounds.map(function(p){return p.x;}),yy=bounds.map(function(p){return p.y;}),left=Math.min.apply(null,xx),top=Math.min.apply(null,yy),width=Math.max.apply(null,xx)-left,height=Math.max.apply(null,yy)-top,pad=Math.max(4,Math.max(width,height)*.14);
   if(width>0&&height>0)mini.setAttribute("viewBox",[left-pad,top-pad,width+2*pad,height+2*pad].join(" "));
  }catch(_unmounted){}
 }
 function history(){if(o.history)return o.history(context.actorId)||[];return (o.film.musical&&o.film.musical.faceKeys||[]).filter(function(k){return k.actor===context.actorId;});}
 function keyDescription(key){var words=[];if(key.mood){var p=(Face.PRESETS||[]).find(function(v){return v.id===key.mood;});words.push(p?(da?p.label:p.en||p.label):key.mood);}if(key.eyes){var e=(Face.EYES||[]).find(function(v){return v.id===key.eyes;});words.push((da?"Øjne: ":"Eyes: ")+(e?(da?e.label:e.en||e.label):key.eyes));}
  if(key.mouthMap===null)words.push(L.follow);else Object.keys(key.mouthMap||{}).forEach(function(id){words.push(soundName(id)+" → "+(key.mouthMap[id]?variantName(key.mouthMap[id]):L.original));});
  if(key.mouth&&key.mouth.mode==="fixed")words.push(L.fixed+": "+variantName(key.mouth.variant));else if(key.mouth&&key.mouth.mode==="auto"&&!key.mouthMap&&!words.length)words.push(L.auto);return words.join(" · ")||L.face;
 }
 function openWorkshop(){if(!context||workshop)return;o.pause();returnFocus=doc.activeElement;var parent=doc.fullscreenElement&&doc.fullscreenElement.contains(panel)?doc.fullscreenElement:host;workshop=element(doc,"section","huw-face-workshop",undefined,parent);workshop.setAttribute("role","dialog");workshop.setAttribute("aria-modal","true");workshop.setAttribute("aria-label",L.workshop);workshop.tabIndex=-1;
  var header=element(doc,"header","huw-face-workshop-header",undefined,workshop);element(doc,"h2","",L.workshop,header);button(header,"huw-face-workshop-close",L.back,closeWorkshop);
  var body=element(doc,"div","huw-face-workshop-body",undefined,workshop);element(doc,"aside","huw-face-workshop-overview",undefined,body);var editing=element(doc,"div","huw-face-workshop-editing",undefined,body);editing.appendChild(panel);element(doc,"section","huw-face-workshop-history",undefined,editing);
  Array.prototype.forEach.call(parent.children,function(node){if(node!==workshop){backgroundInert.push({node:node,value:node.inert});node.inert=true;}});
  workshopButton.hidden=closeButton.hidden=true;host.classList.remove("huw-musical--face-open");host.classList.add("huw-musical--face-workshop-open");overviewStamp="";refresh(true);workshop.addEventListener("keydown",workshopKeys);workshop.focus({preventScroll:true});if(o.onLayout)o.onLayout();
 }
 function workshopKeys(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeWorkshop();return;}if(e.key!=="Tab")return;var nodes=Array.prototype.slice.call(workshop.querySelectorAll("button:not([disabled]),[tabindex='0'],summary")),first=nodes.find(function(n){return !n.hidden&&n.getClientRects().length;}),last=nodes.slice().reverse().find(function(n){return !n.hidden&&n.getClientRects().length;});if(!first)return;
  if(e.shiftKey&&(doc.activeElement===first||doc.activeElement===workshop)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(doc.activeElement===last||doc.activeElement===workshop)){e.preventDefault();first.focus();}
 }
 function closeWorkshop(){if(!workshop)return;anchor.parentNode.insertBefore(panel,anchor);workshop.remove();workshop=null;backgroundInert.forEach(function(saved){saved.node.inert=saved.value;});backgroundInert=[];soundOverride="";workshopButton.hidden=closeButton.hidden=false;host.classList.remove("huw-musical--face-workshop-open");relocate(doc.fullscreenElement===o.stage||o.stage&&o.stage.classList.contains('huw-musical-stage--expanded'));show(!!context&&!dismissed);if(returnFocus&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;refresh(true);if(o.onLayout)o.onLayout();}
 function renderOverview(){var keys=history().slice().sort(function(a,b){return a.t-b.t;}),stamp=JSON.stringify([context.actorId,soundOverride,context.state,context.variantMap,keys]);if(stamp===overviewStamp)return;overviewStamp=stamp;
  var overview=workshop.querySelector(".huw-face-workshop-overview"),historyPane=workshop.querySelector(".huw-face-workshop-history"),focused=doc.activeElement&&doc.activeElement.dataset.faceSound;
  overview.textContent="";element(doc,"h3","",context.label||L.face,overview);var large=element(doc,"div","huw-face-workshop-preview",undefined,overview),state=copy(context.state),v=effectiveVariant(sound());if(v)state.mouth={mode:"fixed",variant:v};thumbnail(large,state,"expression");element(doc,"h3","",L.sounds,overview);element(doc,"p","huw-face-workshop-hint",L.soundHint,overview);
  sounds().forEach(function(item){var b=button(overview,"huw-face-sound","",function(){soundOverride=item.id;tab="mouth";cardStamp="";overviewStamp="";refresh(true);});b.dataset.faceSound=item.id;b.setAttribute("aria-pressed",String(sound()===item.id));
   var thumb=element(doc,"span","huw-face-sound-thumbnail",undefined,b),current=effectiveVariant(item.id),original=context.defaultVariantMap&&context.defaultVariantMap[item.id],custom=!!(context.state&&context.state.mouthMap&&context.state.mouthMap[item.id]),pose=copy(context.state);if(current)pose.mouth={mode:"fixed",variant:current};thumbnail(thumb,pose,"mouth");var words=element(doc,"span","huw-face-sound-copy",undefined,b);element(doc,"strong","",soundName(item.id),words);element(doc,"span","",item.letters||"",words);element(doc,"span","huw-face-sound-choice",(custom?(da?"Dit valg: ":"Your choice: "):L.original+": ")+variantName(current),words);b.dataset.faceCustom=String(custom);
   if(custom)element(doc,"span","huw-face-sound-original",L.original+": "+variantName(original),words);
  });
  historyPane.textContent="";element(doc,"h3","",L.history,historyPane);if(!keys.length)element(doc,"p","huw-face-workshop-hint",L.noHistory,historyPane);
  keys.forEach(function(key){var b=button(historyPane,"huw-face-history-key","",function(){if(o.goToKey)o.goToKey(context.actorId,Number(key.t)||0);else o.seek(Number(key.t)||0);refresh(true);});b.dataset.faceKeyTime=String(key.t);b.title=L.go+" "+timeLabel(key.t);var thumb=element(doc,"span","huw-face-history-thumbnail",undefined,b);thumbnail(thumb,Face.state(keys,Number(key.t)||0,context.actorId),"expression");element(doc,"strong","",timeLabel(key.t),b);element(doc,"span","",keyDescription(key),b);});
  if(focused){var replacement=overview.querySelector('[data-face-sound="'+focused+'"]');if(replacement)replacement.focus({preventScroll:true});}
 }
 function relocate(fullscreen){if(workshop)return;var parent=fullscreen&&o.stage?o.stage:anchor.parentNode;if(panel.parentNode!==parent){if(parent===anchor.parentNode)parent.insertBefore(panel,anchor);else parent.appendChild(panel);}}
 return {select:select,refresh:refresh,hide:function(){selectedId="";context=null;closeWorkshop();show(false);},isOpen:function(){return !panel.hidden;},isWorkshopOpen:function(){return !!workshop;},openWorkshop:openWorkshop,relocate:relocate,
  suspend:function(){suspended++;show(false);if(workshop)workshop.hidden=true;var restored=false;return function(){if(restored)return;restored=true;suspended=Math.max(0,suspended-1);if(workshop)workshop.hidden=false;refresh(true);};},
  dispose:function(){disposed=true;closeWorkshop();panel.remove();anchor.remove();host.classList.remove("huw-musical--face-open","huw-musical--face-workshop-open");}
 };
}
exports.mount=mount;exports.isFace=isFace;exports.channelFor=channelFor;
})();
