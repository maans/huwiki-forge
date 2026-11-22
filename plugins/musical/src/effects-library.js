/*\
title: $:/plugins/huwiki/musical/effects-library.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var TAG="$:/tags/AniMus/AudioEffect",PLUGIN="$:/plugins/huwiki/audio-effects";
function number(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function fields(wiki,title){var t=wiki.getTiddler(title);return t&&(t.fields||t);}
function catalog(wiki,danish){
 var titles=wiki.getTiddlersWithTag?wiki.getTiddlersWithTag(TAG):wiki.filterTiddlers("[tag["+TAG+"]]");
 return titles.map(function(title){var f=fields(wiki,title);if(!f||!/^audio\//i.test(f.type||""))return null;
  var duration=number(f["animus-effect-duration"],0);if(duration<=0)return null;
  return {id:title,asset:title,icon:String(f["animus-effect-icon"]||"🔊"),name:String(f[danish?"animus-effect-name-da":"animus-effect-name-en"]||f["animus-effect-name"]||title),duration:duration,category:String(f["animus-effect-category"]||""),license:String(f["animus-effect-license"]||""),source:String(f["animus-effect-source"]||"")};
 }).filter(Boolean).sort(function(a,b){return a.name.localeCompare(b.name);});
}
function replaceAudio(clip,entry){
 var duration=Math.max(.02,number(entry.duration,1));
 clip.asset=entry.asset;clip.icon=entry.icon;clip.name=entry.name;clip.effectId=entry.id;clip.kind="effects";
 clip.sourceDuration=duration;clip.offset=Math.min(Math.max(0,number(clip.offset,0)),Math.max(0,duration-.02));
 clip.duration=Math.min(Math.max(.02,number(clip.duration,duration)),duration-clip.offset);
 ["fadeIn","fadeOut"].forEach(function(k){if(k in clip)clip[k]=Math.min(clip.duration,Math.max(0,number(clip[k],0)));});
 return clip;
}
function makeClip(entry,start,end){
 start=Math.max(0,Math.min(number(start,0),Math.max(0,number(end,86400)-.02)));
 return replaceAudio({id:"audio-fx-"+Date.now()+"-"+Math.floor(Math.random()*1000000),start:start,offset:0,duration:Math.min(entry.duration,Math.max(.02,end-start)),volume:.7,reverb:0,muted:false},entry);
}
function importFile(wiki,doc,file){
 return new Promise(function(resolve,reject){
  var win=doc.defaultView,Reader=win&&win.FileReader,URL=win&&win.URL;
  if(!Reader||!URL||!URL.createObjectURL)return reject(Error("Audio import is unavailable"));
  if(file.size>32*1024*1024)return reject(Error("Audio file exceeds 32 MB"));
  var mime=String(file.type||""),ext=String(file.name||"").split('.').pop().toLowerCase(),types={mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",m4a:"audio/mp4",flac:"audio/flac",aac:"audio/aac",webm:"audio/webm"};
  if(!/^audio\//.test(mime))mime=types[ext]||"";
  if(!mime)return reject(Error("Unsupported audio file"));
  var a=doc.createElement("audio"),url=URL.createObjectURL(file),reader=new Reader(),done=false,timer=win.setTimeout(function(){finish(Error("Could not read audio duration"));},20000);
  function cleanup(){win.clearTimeout(timer);a.onloadedmetadata=a.onerror=null;a.removeAttribute("src");a.load();URL.revokeObjectURL(url);}
  function finish(error,result){if(done)return;done=true;cleanup();if(error)reject(error);else resolve(result);}
  a.onerror=function(){finish(Error("Could not read audio file"));};
  a.onloadedmetadata=function(){var duration=Number(a.duration);if(!(duration>0&&Number.isFinite(duration)))return finish(Error("Unknown audio duration"));
   reader.onerror=function(){finish(Error("Could not read audio file"));};
   reader.onload=function(){if(done)return;var name=String(file.name||"Audio effect").replace(/\.[^.]+$/,"");
    var title=PLUGIN+"/clips/"+name.replace(/[\[\]{}|]/g,"-").slice(0,90),base=title,suffix=2;
    while(wiki.getTiddler(title))title=base+"-"+(suffix++);
    var icon=/wave|water|sea|ocean|vand|hav/i.test(name)?"🌊":/wood|plank|hull|træ|skrog/i.test(name)?"🪵":/rope|tov|reb/i.test(name)?"🪢":/wind|vind/i.test(name)?"🌬️":/hammer|mallet/i.test(name)?"🔨":/cloth|sail|sejl/i.test(name)?"⛵":/step|skridt/i.test(name)?"👣":/door|dør/i.test(name)?"🚪":"🔊";
    var row={title:title,type:mime,text:String(reader.result).split(',')[1],tags:[TAG],"animus-effect-name":name,"animus-effect-icon":icon,"animus-effect-duration":String(duration)};
    wiki.addTiddler(new $tw.Tiddler(row));finish(null,row);
   };reader.readAsDataURL(file);
  };a.preload="metadata";a.src=url;
 });
}
function buildPlugin(wiki){
 var tiddlers=Object.create(null);
 catalog(wiki,false).forEach(function(entry){var f=fields(wiki,entry.asset),copy={};Object.keys(f).forEach(function(key){if(key!=="title")copy[key]=f[key];});tiddlers[entry.asset]=copy;});
 tiddlers[PLUGIN+"/readme"]={type:"text/vnd.tiddlywiki",text:"Audio recordings for AniMus. Open the Audio effects lane and its icon library. Double-click a placed effect to replace or delete it.\n\nAudiooptagelser til AniMus. Åbn Audioeffekter og ikonbiblioteket. Dobbeltklik på en indsat effekt for at udskifte eller slette den.\n\nOriginal source and licence fields are preserved on each recording. Imported recordings retain their own rights."};
 return {title:PLUGIN,name:"AniMus Audio Effects",description:"Reusable audio effects for the AniMus icon library",author:"HUWiki Forge",version:"0.1.0","plugin-type":"plugin",type:"application/json",list:"readme",text:JSON.stringify({tiddlers:tiddlers})};
}
function open(o){
 var doc=o.doc,da=o.danish,ui=o.ui||function(s){return s;},audioMode=o.mode==="audio",focus=doc.activeElement,closed=false,preview=null;
 function label(a,b){return da?a:ui(b);}
 function el(tag,cls,text,parent){var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
 var backdrop=el("div","huw-musical-effects-backdrop",undefined,o.host),panel=el("section","huw-musical-effects-dialog",undefined,backdrop);
 panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-label",label("Effektbibliotek","Effect library"));
 var top=el("div","huw-musical-effects-heading",undefined,panel);
 el("strong","",o.selected?label("Udskift eller slet effekt","Replace or delete effect"):audioMode?label("Audioeffekter","Audio effects"):label("MIDI-effekter","MIDI effects"),top);
 var closeButton=el("button","", "×",top);closeButton.type="button";closeButton.setAttribute("aria-label",label("Luk bibliotek","Close library"));
 var search=el("input","huw-musical-effects-search",undefined,panel);search.type="search";search.placeholder=label("Søg effekter…","Search effects…");search.setAttribute("aria-label",search.placeholder);
 var toolbar=el("div","huw-musical-effects-toolbar",undefined,panel),status=el("output","huw-musical-effects-status","",panel),grid=el("div","huw-musical-effects-library",undefined,panel);
 status.setAttribute("aria-live","polite");
 function stopPreview(){if(preview){preview.pause();preview.removeAttribute("src");preview.load();preview=null;}if(o.onStopPreview)o.onStopPreview();}
 function close(){if(closed)return;closed=true;stopPreview();doc.removeEventListener("keydown",key);if(backdrop.parentNode)backdrop.parentNode.removeChild(backdrop);if(o.onClose)o.onClose();if(focus&&focus.isConnected&&focus.focus)focus.focus();}
 function key(ev){if(ev.key==="Escape"){ev.preventDefault();ev.stopPropagation();close();return;}
  if(ev.key==="Tab"){var nodes=Array.prototype.slice.call(panel.querySelectorAll('button:not([disabled]),input:not([type="file"])')).filter(function(n){return !n.hidden;}),first=nodes[0],last=nodes[nodes.length-1];if(ev.shiftKey&&doc.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&doc.activeElement===last){ev.preventDefault();first.focus();}}
 }
 closeButton.onclick=close;backdrop.onclick=function(ev){if(ev.target===backdrop)close();};doc.addEventListener("keydown",key);
 if(o.selected&&o.onDelete){var del=el("button","huw-musical-effect-delete",label("Slet effekt","Delete effect"),toolbar);del.type="button";del.onclick=function(){o.onDelete();close();};}
 if(audioMode){
  var add=el("label","huw-musical-effect-import",label("＋ Lydfiler","＋ Audio files"),toolbar),file=el("input","",undefined,add);file.type="file";file.multiple=true;file.accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac";file.setAttribute("aria-label",label("Tilføj lydfiler til biblioteket","Add audio files to library"));
  file.onchange=function(){var list=Array.prototype.slice.call(file.files||[]),failures=[];file.disabled=true;
   list.reduce(function(chain,item){return chain.then(function(){if(closed)return;status.textContent=item.name;return importFile(o.wiki,doc,item).catch(function(error){failures.push(item.name+": "+error.message);});});},Promise.resolve()).then(function(){if(closed)return;file.disabled=false;file.value="";status.textContent=failures.length?failures.join(" · "):label("Tilføjet til biblioteket","Added to library");render();});
  };
  var pack=el("button","huw-musical-effect-export",label("↓ Plugin","↓ Plugin"),toolbar);pack.type="button";pack.title=label("Hent bibliotek som plugin","Download library as plugin");
  pack.onclick=function(){if(!catalog(o.wiki,da).length){status.textContent=label("Tilføj lydfiler først","Add audio files first");return;}
   var win=doc.defaultView,blob=new win.Blob([JSON.stringify([buildPlugin(o.wiki)],null,2)],{type:"application/json"}),url=win.URL.createObjectURL(blob),a=el("a","",undefined,panel);a.href=url;a.download="animus-audio-effects.json";a.click();a.remove();win.setTimeout(function(){win.URL.revokeObjectURL(url);},1000);
  };
 }
 function render(){
  grid.textContent="";var q=search.value.toLocaleLowerCase(),items=audioMode?catalog(o.wiki,da):Object.keys(o.presets||{}).map(function(id){var p=o.presets[id];return {id:id,name:da?p[1]:ui(p[2]),icon:p[0]};});
  items=items.filter(function(item){return (item.name+" "+(item.category||"")).toLocaleLowerCase().indexOf(q)>=0;});
  if(!items.length)el("p","huw-musical-effects-empty",audioMode?label("Tilføj lydfiler, eller importér et audioeffektplugin.","Add audio files, or import an audio effects plugin."):label("Ingen effekter fundet","No effects found"),grid);
  items.forEach(function(item){
   var tile=el("div","huw-musical-effects-tile",undefined,grid),button=el("button","huw-musical-effect-choice",undefined,tile);button.type="button";button.dataset.effectId=item.id;button.setAttribute("aria-label",item.name);
   el("span","huw-musical-effect-symbol",item.icon,button).setAttribute("aria-hidden","true");el("span","",item.name,button);
   button.setAttribute("aria-pressed",String(!!o.selected&&(audioMode?o.selected.asset===item.asset:o.selected.type===item.id)));
   button.onclick=function(){stopPreview();o.onChoose(item);close();};
   var listen=el("button","huw-musical-effect-listen","▶",tile);listen.type="button";listen.setAttribute("aria-label",label("Lyt: ","Listen: ")+item.name);
   listen.onclick=function(){stopPreview();if(o.onPause)o.onPause();if(!audioMode){if(o.onPreview)o.onPreview(item);return;}
    var src=require("$:/plugins/huwiki/musical/narration-player.js").audioSource(o.wiki,item.asset);if(!src)return;
    preview=doc.createElement("audio");preview.src=src;preview.volume=.7;var current=preview;current.onended=stopPreview;
    var p=current.play();if(p&&p.catch)p.catch(function(){if(!closed)status.textContent=label("Lyden kunne ikke afspilles","Audio could not be played");});
   };
  });
 }
 search.oninput=render;render();search.focus();return {close:close};
}
exports.TAG=TAG;exports.catalog=catalog;exports.makeClip=makeClip;exports.replaceAudio=replaceAudio;exports.buildPlugin=buildPlugin;exports.importFile=importFile;exports.open=open;
})();
