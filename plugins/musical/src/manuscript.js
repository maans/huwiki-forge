/*\
title: $:/plugins/huwiki/musical/manuscript.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var Language=require("$:/plugins/huwiki/musical/language.js");
var isDanish=Language.isDanish;
var LipSync=require("$:/plugins/huwiki/musical/lipsync.js");
/* One shared screenplay workstation. Script cues remain in their original
   CutOut scene tiddlers; scene notes belong to the individual scenes, and
   the common caption style belongs to the Musical film. */
function element(doc,tag,cls,text,parent){var e=doc.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined&&text!==null)e.textContent=String(text);if(parent)parent.appendChild(e);return e;}
function copy(value){return JSON.parse(JSON.stringify(value));}
function num(value,defaultValue){var n=Number(value);return Number.isFinite(n)?n:defaultValue;}
function clamp(x,min,max){return Math.max(min,Math.min(max,x));}
function display(t){var min=Math.floor(t/60),sec=Math.max(0,t-min*60);return min+":"+String(Math.floor(sec)).padStart(2,"0");}
function captions(scene){return (scene.parts||[]).filter(function(p){return p.type==="text"&&/^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(p.id);});}
function timing(part,duration){var keys=(part.keys||[]).slice().sort(function(a,b){return num(a.t,0)-num(b.t,0);});
 var start=0,end=duration,on=false,found=false;
 keys.forEach(function(key){var visible=num(key.opacity,1)>=.45,time=clamp(num(key.t,0),0,duration);
  if(!found&&visible){start=time;found=true;on=true;}
  else if(found&&on&&!visible){end=time;on=false;}
 });
 if(!found){start=0;end=Math.min(duration,4);}
 return {start:start,end:Math.max(start+.1,end)};}
function retime(part,start,end,duration){start=clamp(start,0,Math.max(0,duration-.1));end=clamp(end,start+.1,duration);
 var base=Object.assign({x:400,y:391,r:0,sx:1,sy:1,opacity:0,easing:"step"},(part.keys&&part.keys[0])||{});
 function key(t,opacity){return Object.assign({},base,{t:t,opacity:opacity,easing:"step"});}
 var arr=[key(0,start===0?1:0)];if(start>0)arr.push(key(start,1));
 if(end<duration)arr.push(key(end,0));else arr.push(key(duration,0));
 part.keys=arr;
}
function collect(wiki,film,rootTitle){var result=[],active={};
 function walk(data,title,base,duration,depth,path){
  if(depth>12||!data||!data.parts)return;
  var sub=data.scenes||[];
  if(!sub.length){var id=String(title||data.id||"scene")+"@"+String(base);
   result.push({id:id,title:title,scene:data,start:base,duration:duration,name:data.name||title,path:path||"",cues:captions(data)});
   return;
  }
  var elapsed=0;
  sub.forEach(function(clip){var span=Math.max(.1,num(clip.duration,4)),src=String(clip.source||""),t=wiki.getTiddler(src),nested=null;
   if(t){try{nested=JSON.parse(t.fields.text||"");}catch(_){nested=null;}}
   if(nested)walk(nested,src,base+elapsed,span,depth+1,(path?path+" · ":"")+(clip.name||nested.name||""));
   elapsed+=span;
  });
 }
 walk(film,rootTitle||film._title||"",0,num(film.duration,1),0,"");
 return result;}
function notesFromExisting(wiki,scene){var text=wiki.getTiddlerText("Fyrtøjet · Manuskript","");
 if(!text||!scene.name)return "";
 var name=String(scene.name).split("·").pop().trim().toLowerCase(),identity=/\bAkt\s+(\d+)\s+scene\s+(\d+)\b/i.exec(scene.title||""),blocks=[],active=null,act="";
 function finish(){if(active)blocks.push(active);active=null;}
 String(text).split(/\r?\n/).forEach(function(line){
  var actHeading=/^!![ \t]+AKT[ \t]+(\d+)\b/i.exec(line);
  if(actHeading){finish();act=actHeading[1];return;}
  // !!! is a real TiddlyWiki heading. Keep reading the old #!! spelling
  // so notes in an existing saved wiki remain associated with their scene.
  var heading=/^(?:!!!|#!!)[ \t]+Scene[ \t]+(.+?)\s*$/i.exec(line);
  if(heading){finish();var numbered=/^(\d+)(?:\.(\d+))?[ \t]*(?:[—–:-][ \t]*)?(.*)$/.exec(heading[1]);
   active={act:numbered&&numbered[2]?numbered[1]:act,number:numbered?(numbered[2]||numbered[1]):"",name:(numbered?numbered[3]:heading[1]).trim().toLowerCase(),lines:[]};return;
  }
  if(/^!{1,2}(?:[ \t]|$)/.test(line)){finish();return;}
  if(active)active.lines.push(line);
 });finish();
 var candidates=blocks.filter(function(block){return block.name===name;});
 if(identity){var exact=candidates.filter(function(block){return block.act===identity[1]&&block.number===identity[2];});if(exact.length)candidates=exact;}
 if(candidates.length!==1)return "";
 var rows=[],body=candidates[0].lines.join("\n");
 ["Handling","Instruktion","Lydeffekter"].forEach(function(label){var pattern=new RegExp("''"+label+":''[ \\t]*([^\\r\\n]+)","i"),m=pattern.exec(body);if(m)rows.push(label+": "+m[1].trim());});
 return rows.join("\n\n");}
function speakerChoices(scene){
 var found=LipSync.actors(scene).slice(),known={},cueIds={};found.forEach(function(actor){known[actor.id]=true;});captions(scene).forEach(function(p){cueIds[p.id]=true;});
 (scene.parts||[]).forEach(function(part){
  if(known[part.id]||cueIds[part.id])return;
  if(part.type==="group"||!part.parent||(scene.parts||[]).some(function(child){return child.parent===part.id;})){
   found.push({id:part.id,label:part.name||part.id,open:"",closed:""});known[part.id]=true;
  }
 });return found;
}
function mouthChoices(scene,target){
 var children={};(scene.parts||[]).forEach(function(p){(children[p.parent]||(children[p.parent]=[])).push(p);});
 var result=[],seen={},root=(scene.parts||[]).find(function(p){return p.id===target;});
 // An image with mouth variants can be the whole actor. Grouped characters
 // instead expose their individual descendant layers as mouth choices.
 if(root&&root.type!=='group')result.push({id:root.id,label:root.name||root.id});
 function walk(id){if(seen[id])return;seen[id]=true;(children[id]||[]).forEach(function(p){
  if(!/^(?:spoken-\d+|song-line-\d+|sing-label)$/.test(p.id))result.push({id:p.id,label:p.name||p.id});walk(p.id);
 });}walk(target);return result;
}
function newLipSync(actor){return {enabled:true,target:actor&&actor.id||"",open:actor&&actor.open||"",closed:actor&&actor.closed||"",timing:"auto",offset:0,strength:1};}
function ensembleLine(text){var match=/^\s*([^:\n]{1,80}):/.exec(text||'');return !!(match&&/^(?:alle|kor|chorus|all|everyone|ensemble)$/i.test(match[1].replace(/\([^)]*\)|\[[^\]]*\]/g,'').trim()));}
function assignLipSyncRoles(scene){
 var assigned=0,unresolved=0,preserved=0;
 captions(scene).filter(function(p){return /^spoken-\d+$/.test(p.id);}).forEach(function(part){
  // Keep explicit disablement and manual choices. Assignment runs only when
  // requested, never while rendering or editing dialogue text.
  if(Object.prototype.hasOwnProperty.call(part,"lipSync")){preserved++;return;}
  if(ensembleLine(part.text)){unresolved++;return;}
  var candidates=LipSync.suggest(scene,part.text||"");
  if(candidates.length!==1||!candidates[0].open){unresolved++;return;}
  part.lipSync=newLipSync(candidates[0]);assigned++;
 });return {assigned:assigned,unresolved:unresolved,preserved:preserved};
}
function lipSyncIssues(scene){
 var parts=scene.parts||[],byId={};parts.forEach(function(p){byId[p.id]=p;});
 return captions(scene).filter(function(part){var config=part.lipSync;if(!config||config.enabled!==true)return false;
  if(!byId[config.target]||!byId[config.open]||config.open===config.closed)return true;
  var mouths=mouthChoices(scene,config.target).map(function(p){return p.id;});
  return mouths.indexOf(config.open)<0||!!config.closed&&mouths.indexOf(config.closed)<0;
 });
}
function mount(o){
 var ui=Language.translator(o.wiki);
 var displayName=o.displayName||function(value){return value;};var doc=o.doc,host=o.host,wiki=o.wiki,en=!isDanish(wiki);
 var L=en?ui.labels({
  title:"Script workshop",subtitle:"Dialogue, lyrics, scene notes and shared subtitles",back:"Cancel",save:"Save and return",
  scene:"Scenes",cues:"Lines & subtitles",notes:"Scene notes",add:"+ New line",remove:"Delete selected line",when:"Starts",until:"Ends",
  edit:"Selected line",text:"Text shown to the audience",go:"Go to this point",empty:"No lines in this scene yet",types:{spoken:"Spoken line",song:"Song lyric",cue:"Song title"},
  style:"Subtitles · shared appearance",size:"Text size",bottom:"Distance from bottom",width:"Maximum width",bg:"Background",live:"Preview",all:"All scenes",
  hint:"Scene notes stay inside the editor. They are never displayed to the audience.",warning:"Unsaved changes. Close without saving?",status:"All edits saved to their own CutOut scenes."})
 :{
  title:"Manuskriptværksted",subtitle:"Replikker, sangtekster, scenenoter og fælles undertekster",back:"Annuller",save:"Gem og tilbage",
  scene:"Scener",cues:"Replikker og undertekster",notes:"Scenenoter",add:"+ Ny replik",remove:"Slet valgt replik",when:"Start",until:"Slut",
  edit:"Valgt replik",text:"Tekst, som publikum ser",go:"Gå til dette tidspunkt",empty:"Ingen replikker i denne scene endnu",types:{spoken:"Replik",song:"Sanglinje",cue:"Sangtitel"},
  style:"Undertekster · fælles udseende",size:"Tekststørrelse",bottom:"Afstand fra bunden",width:"Maksimal bredde",bg:"Baggrund",live:"Eksempel",all:"Alle scener",
  hint:"Scenenoter vises kun i redigeringsværkstedet – aldrig som undertekster for publikum.",warning:"Der er ændringer, som ikke er gemt. Luk uden at gemme?",status:"Ændringerne er gemt i de tilhørende CutOut-scener."};
 Object.assign(L,en?ui.labels({
  lipTitle:"Lip sync",lipEnable:"Enable for this line",lipActor:"Speaking figure",lipChoose:"Choose a figure",lipOpen:"Open mouth",lipClosed:"Closed mouth (optional)",lipNone:"None",lipChooseMouth:"Choose a mouth part",lipTiming:"Timing",lipAuto:"Linked recording, otherwise script",lipScript:"Script timing only",lipOffset:"Timing offset (s)",lipStrength:"Mouth movement (%)",lipAssign:"Assign speaking roles",lipAssigned:"Lines assigned",lipUnresolved:"Left for manual selection",lipPreserved:"Existing choices kept",lipMissing:"Missing",lipInvalid:"Choose a figure and its open mouth; the closed mouth must be a different part.",lipApprox:"Mouth movement is approximated from the line. A linked recording can supply its timing; the voice itself is not analysed.",lipSavedPreview:"Save and return, then play the line to check the result.",lipOff:"When disabled, the original mouth animation is kept.",lipNoParts:"This figure has no separate mouth parts. Add a mouth as its own SVG layer, or choose another figure.",sceneConflict:"Scenes changed elsewhere"
 }):{
  lipTitle:"Læbesynkronisering",lipEnable:"Aktivér for denne replik",lipActor:"Talende figur",lipChoose:"Vælg figur",lipOpen:"Åben mund",lipClosed:"Lukket mund (valgfri)",lipNone:"Ingen",lipChooseMouth:"Vælg munddel",lipTiming:"Timing",lipAuto:"Tilknyttet indtaling, ellers manuskript",lipScript:"Kun manuskriptets tider",lipOffset:"Tidsforskydning (s)",lipStrength:"Mundbevægelse (%)",lipAssign:"Fordel taleroller",lipAssigned:"Replikker fordelt",lipUnresolved:"Afventer manuelt valg",lipPreserved:"Eksisterende valg bevaret",lipMissing:"Mangler",lipInvalid:"Vælg en figur og dens åbne mund. Den lukkede mund skal være en anden del.",lipApprox:"Mundbevægelsen tilnærmes ud fra replikteksten. En tilknyttet indtaling kan styre timingen; selve stemmen analyseres ikke.",lipSavedPreview:"Gem og tilbage, og afspil derefter replikken for at se resultatet.",lipOff:"Når funktionen er slået fra, bevares den oprindelige mundanimation.",lipNoParts:"Figuren har ingen særskilte munddele. Tilføj munden som sit eget SVG-lag, eller vælg en anden figur.",sceneConflict:"Scener ændret andetsteds"
 });
 var Tracks=null;
 try{Tracks=require("$:/plugins/huwiki/animus-caption-i18n/tracks.js");}catch(_optionalCaptions){}
 var catalog=null,captionLocale="",edits=new Map();
 function lineTranslation(entry,part){
  var scene=entry.scene.id||entry.title,source=Tracks.split(part.text).text;
  var key=JSON.stringify([captionLocale,scene,part.id]),edit=edits.get(key);
  var stored=catalog.films[o.sceneTitle]||{},lines=stored[captionLocale]||{};
  return {key:key,lang:captionLocale,scene:scene,id:part.id,source:source,before:(lines[scene]||{})[part.id],
   text:edit?edit.text:Tracks.translation(catalog,captionLocale,o.sceneTitle,scene,part.id,source)};
 }
 var popup=null,items=[],selectedScene=0,selectedId="",drafts={},originals={},style={},initialStyle={},originalStyle={},dirty=false;
 function isOpen(){return !!popup;}
 function changed(){dirty=true;var s=popup&&popup.querySelector('.huw-script-status');if(s)s.textContent=en?ui("Unsaved changes"):"Ændringer er ikke gemt";}
 function getEntry(index){return items[index]||null;}
 function data(entry){if(!entry)return null;return drafts[entry.title]||entry.scene;}
 function findCue(entry,id){return captions(data(entry)).find(function(p){return p.id===id;});}
 function entryByTitle(title){return items.find(function(v){return v.title===title;});}
 function initialNotes(entry){var d=data(entry);return typeof d.sceneNotes==="string"?d.sceneNotes:notesFromExisting(wiki,entry);}
 function ensureStyle(){var stored=o.film.musical&&o.film.musical.captionStyle||{};
  style={scale:clamp(num(stored.scale,1),.65,2.2),bottom:clamp(num(stored.bottom,5),1,30),width:clamp(num(stored.width,98),45,100),background:clamp(num(stored.background,.66),0,1)};}
 function labelText(parent,text){return element(doc,"span","",text,parent);}
 function field(parent,label,type,value,onChange){var wrap=element(doc,"label","huw-script-field",undefined,parent);
  labelText(wrap,label);var inp=element(doc,"input","",undefined,wrap);inp.type=type;inp.value=String(value);
  inp.addEventListener(type==="range"?"input":"change",function(){onChange(inp.value);});return inp;}
 function button(parent,caption,action,cls){var b=element(doc,"button",cls||"",caption,parent);b.type="button";b.addEventListener("click",action);return b;}
 function selectedEntry(){return getEntry(selectedScene);}
 function selectScene(index){selectedScene=clamp(index,0,Math.max(0,items.length-1));selectedId="";redraw();}
 function selectCue(id){var entry=selectedEntry();selectedId=id;var part=findCue(entry,id);
  if(part){var range=timing(part,entry.duration);o.pause();o.seek(entry.start+range.start);}
  redraw();}
 function cueName(part){return part.id.indexOf('song-line-')===0?L.types.song:part.id==='sing-label'?L.types.cue:L.types.spoken;}
 function refreshList(){var entry=selectedEntry(),list=popup.querySelector('.huw-script-cue-list');if(!entry)return;
  list.textContent="";
  var cu=captions(data(entry)).slice().sort(function(a,b){return timing(a,entry.duration).start-timing(b,entry.duration).start;});
  if(!cu.length)element(doc,'p','huw-script-placeholder',L.empty,list);
  cu.forEach(function(part){var when=timing(part,entry.duration),b=button(list,"",function(){selectCue(part.id)},'huw-script-cue');
   if(part.id===selectedId)b.classList.add('is-active');
   element(doc,'span','huw-script-cue-time',display(entry.start+when.start),b);
   var text=element(doc,'span','huw-script-cue-text',undefined,b);
   element(doc,'small','',cueName(part),text);element(doc,'span','',captionLocale?(lineTranslation(entry,part).text||part.text):displayName(part.text||part.name||''),text);
  });
 }
 function refreshScenes(){var sidebar=popup.querySelector('.huw-script-scenes');sidebar.textContent='';
  items.forEach(function(entry,i){var b=button(sidebar,'',function(){selectScene(i)},'huw-script-scene');
   if(i===selectedScene)b.classList.add('is-active');
   element(doc,'span','huw-script-scene-time',display(entry.start),b);
   element(doc,'span','',displayName(entry.path||entry.name),b);
  });
 }
 function renderLipSync(parent,entry,part){
  var scene=data(entry),suggested=LipSync.suggest(scene,part.text||''),candidate=suggested.length===1&&!ensembleLine(part.text)?suggested[0]:null;
  var stored=part.lipSync&&typeof part.lipSync==='object'?part.lipSync:null;
  // Suggestions are display defaults. Merely opening a line must never write
  // or enable lip sync, including a line which the author explicitly disabled.
  var config=Object.assign(newLipSync(candidate),stored||{},{enabled:!!(stored&&stored.enabled===true)});
  var group=element(doc,'section','huw-script-lipsync',undefined,parent);
  element(doc,'h4','',L.lipTitle,group);
  var toggleLabel=element(doc,'label','huw-script-lipsync-toggle',undefined,group);
  var enabled=element(doc,'input','huw-script-lipsync-enable',undefined,toggleLabel);enabled.type='checkbox';enabled.checked=config.enabled;
  labelText(toggleLabel,L.lipEnable);
  enabled.addEventListener('change',function(){config.enabled=enabled.checked;part.lipSync=copy(config);changed();redraw();});
  element(doc,'p','huw-script-lipsync-hint',L.lipApprox,group);
  var controls=element(doc,'div','huw-script-lipsync-controls',undefined,group);
  function update(key,value){config[key]=value;part.lipSync=copy(config);changed();}
  function select(label,cls,choices,value,empty,onChange){
   var wrap=element(doc,'label','huw-script-field',undefined,controls);labelText(wrap,label);
   var sel=element(doc,'select',cls,undefined,wrap);sel.disabled=!config.enabled;
   if(empty!==null){var placeholder=element(doc,'option','',empty,sel);placeholder.value='';}
   choices.forEach(function(choice){var option=element(doc,'option','',choice.label,sel);option.value=choice.id;});
   if(value&&!choices.some(function(choice){return choice.id===value;})){
    var missing=element(doc,'option','',L.lipMissing+': '+value,sel);missing.value=value;
   }
   sel.value=value||'';sel.addEventListener('change',function(){onChange(sel.value);});return sel;
  }
  var actors=speakerChoices(scene);
  select(L.lipActor,'huw-script-lipsync-actor',actors,config.target,L.lipChoose,function(value){
   var actor=actors.find(function(a){return a.id===value;});
   config.target=value;config.open=actor&&actor.open||'';config.closed=actor&&actor.closed||'';
   part.lipSync=copy(config);changed();redraw();
  });
  var mouths=mouthChoices(scene,config.target);
  select(L.lipOpen,'huw-script-lipsync-open',mouths,config.open,L.lipChooseMouth,function(value){update('open',value);});
  select(L.lipClosed,'huw-script-lipsync-closed',mouths,config.closed,L.lipNone,function(value){update('closed',value);});
  select(L.lipTiming,'huw-script-lipsync-timing',[{id:'auto',label:L.lipAuto},{id:'script',label:L.lipScript}],config.timing,null,function(value){update('timing',value);});
  var offset=field(controls,L.lipOffset,'number',num(config.offset,0),function(value){update('offset',clamp(num(value,0),-3600,3600));});
  offset.className='huw-script-lipsync-offset';offset.step=.05;offset.min=-3600;offset.max=3600;offset.disabled=!config.enabled;
  var strength=field(controls,L.lipStrength,'range',Math.round(clamp(num(config.strength,1),0,1)*100),function(value){update('strength',clamp(num(value,100)/100,0,1));});
  strength.className='huw-script-lipsync-strength';strength.min=0;strength.max=100;strength.step=1;strength.disabled=!config.enabled;
  if(config.enabled&&config.target&&!mouths.length)element(doc,'p','huw-script-lipsync-warning',L.lipNoParts,group);
  element(doc,'p','huw-script-lipsync-hint',config.enabled?L.lipSavedPreview:L.lipOff,group);
  if(o.openFace){
   var faceButton=button(group,en?ui('Save and open face workshop'):'Gem og åbn ansigtsværksted',function(){
    var interval=timing(part,entry.duration),start=entry.start+interval.start,end=entry.start+interval.end,current=num(o.position(),start);
    var details={actorId:config.target,cueId:part.id,sceneTitle:entry.title,time:current>=start&&current<end?current:start+.01};
    if(save())o.openFace(details);
   },'huw-script-face-workshop');
   faceButton.disabled=!config.target;
   element(doc,'p','huw-script-lipsync-hint',en?ui('Choose expressions and teach autosync your preferred mouth shapes for this character.'):'Vælg ansigtsudtryk og lær autosync dine foretrukne mundformer for denne figur.',group);
  }
 }
 function redraw(){if(!popup)return;var entry=selectedEntry();
  refreshScenes();refreshList();
  var note=popup.querySelector('.huw-script-scene-notes'),right=popup.querySelector('.huw-script-selected');
  note.value=entry?initialNotes(entry):'';right.textContent='';
  var part=entry&&findCue(entry,selectedId);
  if(!part){element(doc,'p','huw-script-placeholder',en?ui('Select a line to edit its text and timing.'):'Vælg en replik for at redigere tekst og tidspunkt.',right);return;}
  element(doc,'h3','',cueName(part),right);
  if(Tracks&&catalog){
   var locales=Tracks.options(catalog,o.sceneTitle);
   if(locales.length){
    var label=element(doc,'label','huw-script-field',undefined,right);
    labelText(label,en?ui('Subtitle language'):'Undertekstsprog');
    var picker=element(doc,'select','huw-script-caption-language',undefined,label);
    element(doc,'option','',en?ui('Original text'):'Originaltekst',picker).value='';
    locales.forEach(function(code){element(doc,'option','',Tracks.name(code,Tracks.selected(wiki)),picker).value=code;});
    picker.value=captionLocale;
    picker.onchange=function(){captionLocale=picker.value;redraw();};
   }
  }
  if(captionLocale)element(doc,'p','huw-script-original-line',part.text||'',right);
  var textLabel=element(doc,'label','huw-script-field',undefined,right);
  labelText(textLabel,captionLocale?(en?ui('Translated subtitle'):'Oversat undertekst'):L.text);
  var textarea=element(doc,'textarea','huw-script-line-input',undefined,textLabel),translation=captionLocale&&lineTranslation(entry,part);
  textarea.rows=4;textarea.value=translation?translation.text:part.text||'';
  textarea.addEventListener('input',function(){
   if(translation){translation.text=textarea.value;edits.set(translation.key,translation);}
   else part.text=textarea.value;
   changed();var shown=popup.querySelector('.huw-script-cue.is-active .huw-script-cue-text>span');
   if(shown)shown.textContent=textarea.value||part.text||'';
  });
  var span=timing(part,entry.duration);
  var range=element(doc,'div','huw-script-range',undefined,right);
  field(range,L.when+' (s)','number',span.start,function(v){var now=timing(part,entry.duration);retime(part,num(v,now.start),now.end,entry.duration);changed();refreshList();});
  field(range,L.until+' (s)','number',span.end,function(v){var now=timing(part,entry.duration);retime(part,now.start,num(v,now.end),entry.duration);changed();refreshList();});
  button(right,L.go,function(){var at=timing(part,entry.duration);o.pause();o.seek(entry.start+at.start);},'huw-script-secondary');
  if(o.openNarration)button(right,en?ui('Record this line'):'Indtal replik',function(){
   var at=timing(part,entry.duration),role=/^([^:\n]{1,40}):/.exec(part.text||'');
   o.openNarration({cueId:part.id,sceneTitle:entry.title,text:part.text||'',role:role?role[1]:'',start:entry.start+at.start,name:part.name||cueName(part)});
  },'huw-script-primary');
  if(part.id!=='sing-label')renderLipSync(right,entry,part);
  button(right,L.remove,function(){if(!entry)return;var d=data(entry);d.parts=d.parts.filter(function(p){return p!==part;});selectedId='';changed();redraw();},'huw-script-danger');
 }
 function open(details){if(popup)return true;details=details||{};
  captionLocale="";edits.clear();catalog=Tracks?Tracks.read(wiki):null;
  items=collect(wiki,o.film,o.sceneTitle);if(!items.length)return false;
  drafts={};originals={};items.forEach(function(item){if(!drafts[item.title]){drafts[item.title]=copy(item.scene);originals[item.title]=copy(item.scene);}});
  ensureStyle();initialStyle=copy(style);originalStyle=copy(o.film.musical&&o.film.musical.captionStyle||{});dirty=false;
  // Caption-track links identify their original cue. Prefer the occurrence
  // at that master time when the same source scene appears more than once.
  var t=num(details.time,o.position());
  selectedScene=Math.max(0,items.findIndex(function(e){return t>=e.start&&t<e.start+e.duration;}));selectedId='';
  if(details.sceneTitle){
   var match=items.findIndex(function(e){return e.title===details.sceneTitle&&t>=e.start&&t<e.start+e.duration;});
   if(match<0)match=items.findIndex(function(e){return e.title===details.sceneTitle;});
   if(match>=0)selectedScene=match;
  }
  var entry=selectedEntry();
  if(details.partId&&(!details.sceneTitle||entry.title===details.sceneTitle)&&findCue(entry,details.partId))selectedId=details.partId;
  o.pause();
  popup=element(doc,'section','huw-script-workshop',undefined,host);popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label',L.title);popup.tabIndex=-1;
  var header=element(doc,'header','huw-script-header',undefined,popup);
  var heading=element(doc,'div','',undefined,header);element(doc,'h2','',L.title,heading);element(doc,'p','',L.subtitle,heading);
  var actions=element(doc,'div','huw-script-header-actions',undefined,header);
  button(actions,L.back,function(){close();},'huw-script-secondary');
  button(actions,L.save,function(){save();},'huw-script-primary');
  var subtitleOptions=element(doc,'details','huw-script-appearance',undefined,popup);
  element(doc,'summary','',L.style,subtitleOptions);
  var common=element(doc,'div','huw-script-common',undefined,subtitleOptions);
  field(common,L.size+' (%)','range',Math.round(style.scale*100),function(v){style.scale=clamp(num(v,100)/100,.65,2.2);changed();preview();}).min=65;
  var controls=common.querySelectorAll('input[type=range]');controls[0].max=220;
  var distance=field(common,L.bottom+' (%)','range',style.bottom,function(v){style.bottom=clamp(num(v,5),1,30);changed();preview();});distance.min=1;distance.max=30;
  var width=field(common,L.width+' (%)','range',style.width,function(v){style.width=clamp(num(v,98),45,100);changed();preview();});width.min=45;width.max=100;
  var bg=field(common,L.bg+' (%)','range',Math.round(style.background*100),function(v){style.background=clamp(num(v,66)/100,0,1);changed();preview();});bg.min=0;bg.max=100;
  var sample=element(doc,'div','huw-script-caption-preview',undefined,common);sample.setAttribute('aria-label',L.live);
  element(doc,'div','huw-script-caption-sample',en?ui('SOLDIER: We can change the scene.'):'SOLDAT: Vi kan ændre scenen.',sample);preview();
  var body=element(doc,'div','huw-script-columns',undefined,popup);
  var scenes=element(doc,'section','huw-script-pane huw-script-scene-pane',undefined,body);
  element(doc,'h3','',L.scene,scenes);element(doc,'div','huw-script-scenes',undefined,scenes);
  var cues=element(doc,'section','huw-script-pane huw-script-cue-pane',undefined,body);
  var cueTitle=element(doc,'div','huw-script-pane-title',undefined,cues);element(doc,'h3','',L.cues,cueTitle);
  button(cueTitle,L.add,function(){var entry=selectedEntry(),d=data(entry);if(!d)return;
   var ids=d.parts.filter(function(p){return /^spoken-\d+/.test(p.id);}).map(function(p){return Number(p.id.slice(7));});
   var next=ids.length?Math.max.apply(null,ids)+1:0,start=clamp(o.position()-entry.start,0,Math.max(.1,entry.duration-4)),id='spoken-'+next;
   var part={id:id,name:en?'Line '+(next+1):'Replik '+(next+1),type:'text',parent:null,geo:{},fill:'#fff7e8',text:en?ui('NEW LINE: '):'NY REPLIK: ',fontSize:15,align:'middle',keys:[]};
   retime(part,start,Math.min(start+4,entry.duration),entry.duration);d.parts.push(part);selectedId=id;changed();redraw();
  },'huw-script-primary');
  button(cues,L.lipAssign,function(){var entry=selectedEntry();if(!entry)return;
   var result=assignLipSyncRoles(data(entry));if(result.assigned)changed();redraw();
   popup.querySelector('.huw-script-status').textContent=L.lipAssigned+': '+result.assigned+' · '+L.lipUnresolved+': '+result.unresolved+' · '+L.lipPreserved+': '+result.preserved;
  },'huw-script-secondary huw-script-lipsync-assign');
  element(doc,'div','huw-script-cue-list',undefined,cues);
  var edit=element(doc,'section','huw-script-pane huw-script-edit-pane',undefined,body);
  element(doc,'div','huw-script-selected',undefined,edit);
  element(doc,'h3','',L.notes,edit);
  var notes=element(doc,'textarea','huw-script-scene-notes',undefined,edit);notes.rows=10;
  notes.addEventListener('input',function(){var d=data(selectedEntry());if(d){d.sceneNotes=notes.value;changed();}});
  element(doc,'p','huw-script-notes-hint',L.hint,edit);
  var footer=element(doc,'footer','huw-script-footer',undefined,popup);
  element(doc,'span','huw-script-status','',footer);button(footer,L.save,function(){save();},'huw-script-primary');
  host.classList.add('huw-musical--manuscript-open');redraw();popup.focus({preventScroll:true});return true;
 }
 function preview(){if(!popup)return;var sample=popup.querySelector('.huw-script-caption-sample');
  if(sample){sample.style.fontSize=(12*style.scale)+'px';sample.style.backgroundColor='rgba(9,12,18,'+style.background+')';
   sample.style.maxWidth=style.width+'%';sample.style.marginBottom=(style.bottom*.4)+'px';}}
 function close(force){if(!popup)return; if(dirty&&!force&&!(doc.defaultView&&doc.defaultView.confirm&&doc.defaultView.confirm(L.warning)))return;
  popup.remove();popup=null;host.classList.remove('huw-musical--manuscript-open');dirty=false;}
 function save(){if(!popup)return false;var pending=Object.create(null),errors=[],conflicts=[],invalid=[];
  function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function latest(title){if(pending[title])return pending[title];var tid=wiki.getTiddler(title),value;
   if(!tid){errors.push(title);return null;}
   try{value=JSON.parse(tid.fields.text||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid scene');}
   catch(_){errors.push(title);return null;}
   return pending[title]={title:title,tid:tid,data:value,changed:false};
  }
  Object.keys(drafts).forEach(function(title){var draft=drafts[title],original=originals[title];
   var partsChanged=!equal(draft.parts,original.parts),notesChanged=!equal(draft.sceneNotes,original.sceneNotes);
   if(!partsChanged&&!notesChanged)return;
   var current=latest(title);if(!current)return;
   if(partsChanged){
    if(!equal(current.data.parts,original.parts)){conflicts.push(title);return;}
    lipSyncIssues(draft).forEach(function(part){invalid.push(part.name||part.id);});
    current.data.parts=copy(draft.parts);current.changed=true;
   }
   if(notesChanged){
    if(!equal(current.data.sceneNotes,original.sceneNotes)){conflicts.push(title);return;}
    current.data.sceneNotes=draft.sceneNotes;current.changed=true;
   }
  });
  if(!equal(style,initialStyle)){
   var film=latest(o.sceneTitle);
   if(film){var savedStyle=film.data.musical&&film.data.musical.captionStyle||{};
    if(!equal(savedStyle,originalStyle)&&!equal(savedStyle,style))conflicts.push(o.sceneTitle);
    else{film.data.musical=film.data.musical||{};film.data.musical.captionStyle=copy(style);film.changed=true;}
   }
  }
  var status=popup.querySelector('.huw-script-status');
  if(errors.length){status.textContent=(en?ui('Missing or unreadable scenes: '):'Manglende eller ulæselige scener: ')+errors.join(', ');return false;}
  if(conflicts.length){status.textContent=L.sceneConflict+': '+conflicts.join(', ');return false;}
  if(invalid.length){status.textContent=L.lipInvalid+' ('+invalid.join(', ')+')';return false;}
  // Merge just manuscript-owned fields into the latest scene. A recording made
  // while this workshop is open must retain its audio asset and clip metadata.
  // The root scene and its caption style are committed together in one write.
  var changes=Object.keys(pending).map(function(title){return pending[title];}).filter(function(c){return c.changed;});
  var trackWrites=[];
  if(edits.size){
   try{trackWrites=Tracks.writes(wiki,o.sceneTitle,Array.from(edits.values()));}
   catch(error){popup.querySelector('.huw-script-status').textContent=(en?ui('Subtitle track changed'):'Undertekstsporet er ændret')+' · '+error.message;return false;}
  }
  changes.forEach(function(c){var text=JSON.stringify(c.data);o.markOwnWrite(c.title,text);wiki.addTiddler(new $tw.Tiddler(c.tid,{title:c.title,text:text}));
   if(c.title===o.sceneTitle){o.film.parts=copy(c.data.parts||[]);if(c.data.sceneNotes!==undefined)o.film.sceneNotes=c.data.sceneNotes;if(c.data.musical)o.film.musical=copy(c.data.musical);}
  });
  trackWrites.forEach(function(fields){wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler(fields.title),fields));});
  dirty=false;close(true);if(changes.length&&o.reload)o.reload();else if(o.repaint)o.repaint();return true;
 }
 return {open:open,close:function(){close(false);},dispose:function(){close(true);},isOpen:isOpen};
}
exports.mount=mount;
exports.assignLipSyncRoles=assignLipSyncRoles;
exports.mouthChoices=mouthChoices;
exports.lipSyncIssues=lipSyncIssues;
})();
