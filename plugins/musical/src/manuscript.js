/*\
title: $:/plugins/huwiki/musical/manuscript.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
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
function collect(wiki,film){var result=[],active={};
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
 walk(film,film._title||"",0,num(film.duration,1),0,"");
 return result;}
function notesFromExisting(wiki,scene){var text=wiki.getTiddlerText("Fyrtøjet · Manuskript","");
 if(!text||!scene.name)return "";
 var chunks=text.split(/\n#!!\s+Scene\s+/),name=String(scene.name).split("·").pop().trim().toLowerCase();
 for(var i=1;i<chunks.length;i++){
  var c=chunks[i],head=(c.split("\n")[0]||"").toLowerCase();
  if(head.indexOf(name)<0)continue;
  var rows=[];
  ["Handling","Instruktion","Lydeffekter"].forEach(function(label){var pattern=new RegExp("''"+label+":''\\s*([^\\n]+)","i"),m=pattern.exec(c);if(m)rows.push(label+": "+m[1].trim());});
  return rows.join("\n\n");
 }
 return "";}
function mount(o){var doc=o.doc,host=o.host,wiki=o.wiki,en=/\/en(?:-|$)/i.test(wiki.getTiddlerText("$:/language",""));
 var L=en?{
  title:"Script workshop",subtitle:"Dialogue, lyrics, scene notes and shared subtitles",back:"Cancel",save:"Save and return",
  scene:"Scenes",cues:"Lines & subtitles",notes:"Scene notes",add:"+ New line",remove:"Delete selected line",when:"Starts",until:"Ends",
  edit:"Selected line",text:"Text shown to the audience",go:"Go to this point",empty:"No lines in this scene yet",types:{spoken:"Spoken line",song:"Song lyric",cue:"Song title"},
  style:"Subtitles · shared appearance",size:"Text size",bottom:"Distance from bottom",width:"Maximum width",bg:"Background",live:"Preview",all:"All scenes",
  hint:"Scene notes stay inside the editor. They are never displayed to the audience.",warning:"Unsaved changes. Close without saving?",status:"All edits saved to their own CutOut scenes."}
 :{
  title:"Manuskriptværksted",subtitle:"Replikker, sangtekster, scenenoter og fælles undertekster",back:"Annuller",save:"Gem og tilbage",
  scene:"Scener",cues:"Replikker og undertekster",notes:"Scenenoter",add:"+ Ny replik",remove:"Slet valgt replik",when:"Start",until:"Slut",
  edit:"Valgt replik",text:"Tekst, som publikum ser",go:"Gå til dette tidspunkt",empty:"Ingen replikker i denne scene endnu",types:{spoken:"Replik",song:"Sanglinje",cue:"Sangtitel"},
  style:"Undertekster · fælles udseende",size:"Tekststørrelse",bottom:"Afstand fra bunden",width:"Maksimal bredde",bg:"Baggrund",live:"Eksempel",all:"Alle scener",
  hint:"Scenenoter vises kun i redigeringsværkstedet – aldrig som undertekster for publikum.",warning:"Der er ændringer, som ikke er gemt. Luk uden at gemme?",status:"Ændringerne er gemt i de tilhørende CutOut-scener."};
 var popup=null,items=[],selectedScene=0,selectedId="",drafts={},style={},dirty=false;
 function isOpen(){return !!popup;}
 function changed(){dirty=true;var s=popup&&popup.querySelector('.huw-script-status');if(s)s.textContent=en?"Unsaved changes":"Ændringer er ikke gemt";}
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
   element(doc,'small','',cueName(part),text);element(doc,'span','',part.text||part.name||'',text);
  });
 }
 function refreshScenes(){var sidebar=popup.querySelector('.huw-script-scenes');sidebar.textContent='';
  items.forEach(function(entry,i){var b=button(sidebar,'',function(){selectScene(i)},'huw-script-scene');
   if(i===selectedScene)b.classList.add('is-active');
   element(doc,'span','huw-script-scene-time',display(entry.start),b);
   element(doc,'span','',entry.path||entry.name,b);
  });
 }
 function redraw(){if(!popup)return;var entry=selectedEntry();
  refreshScenes();refreshList();
  var note=popup.querySelector('.huw-script-scene-notes'),right=popup.querySelector('.huw-script-selected');
  note.value=entry?initialNotes(entry):'';right.textContent='';
  var part=entry&&findCue(entry,selectedId);
  if(!part){element(doc,'p','huw-script-placeholder',en?'Select a line to edit its text and timing.':'Vælg en replik for at redigere tekst og tidspunkt.',right);return;}
  element(doc,'h3','',cueName(part),right);
  var textLabel=element(doc,'label','huw-script-field',undefined,right);labelText(textLabel,L.text);
  var textarea=element(doc,'textarea','huw-script-line-input',undefined,textLabel);textarea.rows=4;textarea.value=part.text||'';
  textarea.addEventListener('input',function(){part.text=textarea.value;changed();var shown=popup.querySelector('.huw-script-cue.is-active .huw-script-cue-text>span');if(shown)shown.textContent=textarea.value;});
  var span=timing(part,entry.duration);
  var range=element(doc,'div','huw-script-range',undefined,right);
  field(range,L.when+' (s)','number',span.start,function(v){var now=timing(part,entry.duration);retime(part,num(v,now.start),now.end,entry.duration);changed();refreshList();});
  field(range,L.until+' (s)','number',span.end,function(v){var now=timing(part,entry.duration);retime(part,now.start,num(v,now.end),entry.duration);changed();refreshList();});
  button(right,L.go,function(){var at=timing(part,entry.duration);o.pause();o.seek(entry.start+at.start);},'huw-script-secondary');
  if(o.openNarration)button(right,en?'Record this line':'Indtal replik',function(){
   var at=timing(part,entry.duration),role=/^([^:\n]{1,40}):/.exec(part.text||'');
   o.openNarration({cueId:part.id,sceneTitle:entry.title,text:part.text||'',role:role?role[1]:'',start:entry.start+at.start,name:part.name||cueName(part)});
  },'huw-script-primary');
  button(right,L.remove,function(){if(!entry)return;var d=data(entry);d.parts=d.parts.filter(function(p){return p!==part;});selectedId='';changed();redraw();},'huw-script-danger');
 }
 function open(){if(popup)return true;
  items=collect(wiki,o.film);if(!items.length)return false;
  drafts={};items.forEach(function(item){if(!drafts[item.title])drafts[item.title]=copy(item.scene);});
  ensureStyle();dirty=false;
  // Open on the current scene, even in the middle of a multi-act musical.
  var t=o.position();selectedScene=Math.max(0,items.findIndex(function(e){return t>=e.start&&t<e.start+e.duration;}));selectedId='';o.pause();
  popup=element(doc,'section','huw-script-workshop',undefined,host);popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label',L.title);popup.tabIndex=-1;
  var header=element(doc,'header','huw-script-header',undefined,popup);
  var heading=element(doc,'div','',undefined,header);element(doc,'h2','',L.title,heading);element(doc,'p','',L.subtitle,heading);
  var actions=element(doc,'div','huw-script-header-actions',undefined,header);
  button(actions,L.back,function(){close();},'huw-script-secondary');
  button(actions,L.save,function(){save();},'huw-script-primary');
  var common=element(doc,'section','huw-script-common',undefined,popup);
  var styleLabel=element(doc,'strong','',L.style,common);
  field(common,L.size+' (%)','range',Math.round(style.scale*100),function(v){style.scale=clamp(num(v,100)/100,.65,2.2);changed();preview();}).min=65;
  var controls=common.querySelectorAll('input[type=range]');controls[0].max=220;
  var distance=field(common,L.bottom+' (%)','range',style.bottom,function(v){style.bottom=clamp(num(v,5),1,30);changed();preview();});distance.min=1;distance.max=30;
  var width=field(common,L.width+' (%)','range',style.width,function(v){style.width=clamp(num(v,98),45,100);changed();preview();});width.min=45;width.max=100;
  var bg=field(common,L.bg+' (%)','range',Math.round(style.background*100),function(v){style.background=clamp(num(v,66)/100,0,1);changed();preview();});bg.min=0;bg.max=100;
  var sample=element(doc,'div','huw-script-caption-preview',undefined,common);sample.setAttribute('aria-label',L.live);
  element(doc,'div','huw-script-caption-sample',en?'SOLDIER: We can change the scene.':'SOLDAT: Vi kan ændre scenen.',sample);preview();
  var body=element(doc,'div','huw-script-columns',undefined,popup);
  var scenes=element(doc,'section','huw-script-pane huw-script-scene-pane',undefined,body);
  element(doc,'h3','',L.scene,scenes);element(doc,'div','huw-script-scenes',undefined,scenes);
  var cues=element(doc,'section','huw-script-pane huw-script-cue-pane',undefined,body);
  var cueTitle=element(doc,'div','huw-script-pane-title',undefined,cues);element(doc,'h3','',L.cues,cueTitle);
  button(cueTitle,L.add,function(){var entry=selectedEntry(),d=data(entry);if(!d)return;
   var ids=d.parts.filter(function(p){return /^spoken-\d+/.test(p.id);}).map(function(p){return Number(p.id.slice(7));});
   var next=ids.length?Math.max.apply(null,ids)+1:0,start=clamp(o.position()-entry.start,0,Math.max(.1,entry.duration-4)),id='spoken-'+next;
   var part={id:id,name:en?'Line '+(next+1):'Replik '+(next+1),type:'text',parent:null,geo:{},fill:'#fff7e8',text:en?'NEW LINE: ':'NY REPLIK: ',fontSize:15,align:'middle',keys:[]};
   retime(part,start,Math.min(start+4,entry.duration),entry.duration);d.parts.push(part);selectedId=id;changed();redraw();
  },'huw-script-primary');
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
 function save(){if(!popup)return false;var changes=[],errors=[];
  Object.keys(drafts).forEach(function(title){var tid=wiki.getTiddler(title);if(!tid){errors.push(title);return;}
   var existing=JSON.parse(tid.fields.text||'{}'),draft=drafts[title];
   if(JSON.stringify(existing)!==JSON.stringify(draft))changes.push({title:title,tid:tid,text:JSON.stringify(draft)});
  });
  if(errors.length){popup.querySelector('.huw-script-status').textContent=en?'Missing scenes: ':'Manglende scener: '+errors.join(', ');return false;}
  var newStyle=copy(style),musical=o.film.musical||(o.film.musical={});
  if(JSON.stringify(musical.captionStyle||{})!==JSON.stringify(newStyle)){
   musical.captionStyle=newStyle;var f=wiki.getTiddler(o.sceneTitle);if(f)changes.push({title:o.sceneTitle,tid:f,text:JSON.stringify(o.film)});
  }
  changes.forEach(function(c){o.markOwnWrite(c.title,c.text);wiki.addTiddler(new $tw.Tiddler(c.tid,{title:c.title,text:c.text}));});
  dirty=false;close(true);if(changes.length&&o.reload)o.reload();else o.repaint();return true;
 }
 return {open:open,close:function(){close(false);},dispose:function(){close(true);},isOpen:isOpen};
}
exports.mount=mount;
})();
