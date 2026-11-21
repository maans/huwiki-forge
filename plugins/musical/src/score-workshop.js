/*\
title: $:/plugins/huwiki/musical/score-workshop.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var isDanish=require("$:/plugins/huwiki/musical/language.js").isDanish;
var Loader=require('$:/plugins/huwiki/abc/loader.js');
function el(doc,tag,cls,text,parent){var e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;}
function mount(o){
 var doc=o.doc,wiki=o.wiki,da=isDanish(wiki);
 var popup=null,editor=null,draft='',title='',original='',origin=null,newScore=false,onSaved=null,clip=null;
 function button(host,text,action,cls){var b=el(doc,'button',cls||'',text,host);b.type='button';b.onclick=action;return b;}
 function destroyWidget(w){if(!w)return;(w.children||[]).forEach(destroyWidget);if(typeof w.onDestroy==='function')w.onDestroy();}
 function changed(){var t=draft&&wiki.getTiddler(draft);if(!t)return false;var f=Object.assign({},t.fields);delete f.title;delete f['draft.of'];delete f['draft.title'];return JSON.stringify(f)!==original;}
 function close(force){
  if(!popup)return true;
  if(!force&&changed()&&!doc.defaultView.confirm(da?'Luk uden at gemme ændringer i musikken?':'Close without saving the music changes?'))return false;
  destroyWidget(editor);if(editor&&editor.removeChildDomNodes)editor.removeChildDomNodes();editor=null;
  popup.remove();popup=null;clip=null;if(draft)wiki.deleteTiddler(draft);draft='';o.host.classList.remove('huw-musical--score-open');return true;
 }
 function save(){
  if(!popup)return;var t=wiki.getTiddler(draft);if(!t)return;
  var source=Object.prototype.hasOwnProperty.call(t.fields,'abc-source')?String(t.fields['abc-source']):Loader.getSource(wiki,draft);if(!/^\s*X:\s*\d+/m.test(source)||!/^\s*K:/m.test(source)){
   popup.querySelector('.huw-score-workshop-status').textContent=da?'Musikken skal have X: og K: i ABC-koden.':'The ABC music needs X: and K: fields.';return;
  }
  var current=wiki.getTiddler(title);
  if(!newScore&&(!current||origin!==JSON.stringify(current.fields))){
   popup.querySelector('.huw-score-workshop-status').textContent=da?'Nodearket er ændret i et andet vindue. Gem en kopi for at beholde begge udgaver.':'The score changed in another editor. Save a copy to keep both versions.';return;
  }
  var fields=Object.assign({},t.fields,{title:title});delete fields['draft.of'];delete fields['draft.title'];
  if(fields.type==='text/vnd.abc'||fields.type==='text/plain')fields.text=source;
  wiki.addTiddler(new $tw.Tiddler(current||{},fields));
  var callback=onSaved,wasNew=newScore,savedTitle=title;close(true);
  if(callback)callback(savedTitle,wasNew);if(o.reload)o.reload();
 }
 function renderEditor(){
  var body=popup.querySelector('.huw-score-workshop-body');destroyWidget(editor);if(editor&&editor.removeChildDomNodes)editor.removeChildDomNodes();body.textContent='';
  var attributes={tiddler:{type:'string',value:draft}};
  if(clip&&o.seekScore)attributes.selectionMessage={type:'string',value:'tm-animus-score-selection'};
  editor=wiki.makeWidget({tree:[{type:'huwiki-abc-edit',attributes:attributes,children:[]}]},{document:doc,parentWidget:o.parentWidget||$tw.rootWidget});
  if(attributes.selectionMessage)editor.addEventListener('tm-animus-score-selection',function(event){
   var tune=event.tune;
   if(!tune.noteTimings)tune.setTiming();
   var times=(tune.noteTimings||[]).filter(function(row){
    return row.type==='event'&&(row.startChar===event.startChar||(row.startCharArray||[]).indexOf(event.startChar)>=0);
   }).map(function(row){return row.milliseconds;});
   if(times.length)o.seekScore(clip.id,times);
   return false;
  });
  editor.render(body,null);
 }
 function open(score,options){
  options=options||{};if(popup&&!close(false))return false;o.pause();
  clip=options.clip||null;
  newScore=!score;title=score||wiki.generateNewTitle(da?'Ny musik':'New music');onSaved=options.onSave||null;
  var t=wiki.getTiddler(title),fields=t?Object.assign({},t.fields):{type:'text/vnd.tiddlywiki',text:'<$huwiki-abc-score tiddler=<<currentTiddler>>/>','abc-source':'X:1\nT:'+title+'\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\nC D E F | G2 G2 | A G F E | D2 C2 |','abc-accompaniment':'{"enabled":false}'};
  origin=t?JSON.stringify(t.fields):null;
  draft=wiki.generateNewTitle('$:/temp/animus-score/'+Date.now());fields.title=draft;fields['draft.of']=title;fields['draft.title']=title;
  wiki.addTiddler(new $tw.Tiddler(fields));var clean=Object.assign({},wiki.getTiddler(draft).fields);delete clean.title;delete clean['draft.of'];delete clean['draft.title'];original=JSON.stringify(clean);
  popup=el(doc,'section','huw-score-workshop',undefined,o.host);popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label',da?'ABC-musikværksted':'ABC music workshop');popup.tabIndex=-1;
  var bar=el(doc,'header','huw-score-workshop-header',undefined,popup);el(doc,'strong','',da?'ABC-musikværksted':'ABC music workshop',bar);el(doc,'span','huw-score-workshop-title',title,bar);
  button(bar,da?'Annuller':'Cancel',function(){close(false);});
  var files=el(doc,'details','huw-score-files',undefined,bar);
  el(doc,'summary','',da?'Filer':'Files',files);
  var fileActions=el(doc,'div','huw-score-file-actions',undefined,files);
  button(fileActions,da?'Gem kopi':'Save a copy',function(){title=wiki.generateNewTitle(title+(da?' – kopi':' – copy'));newScore=true;save();});
  button(bar,da?'Gem og tilbage':'Save and return',save,'huw-score-save');
  var importer=el(doc,'label','huw-score-import',da?'Importér ABC-fil':'Import ABC file',fileActions),file=el(doc,'input','',undefined,importer);file.type='file';file.accept='.abc,.txt,text/plain';
  file.onchange=function(){var f=file.files&&file.files[0];if(!f)return;var requestedDraft=draft,requestedPopup=popup,reader=new doc.defaultView.FileReader();reader.onload=function(){if(popup!==requestedPopup||draft!==requestedDraft)return;var old=wiki.getTiddler(requestedDraft);if(!old)return;wiki.addTiddler(new $tw.Tiddler(old,{'abc-source':String(reader.result||'')}));renderEditor();};reader.readAsText(f);};
  el(doc,'div','huw-score-workshop-body',undefined,popup);el(doc,'output','huw-score-workshop-status','',popup);
  popup.addEventListener('pointerdown',function(e){if(files.open&&!files.contains(e.target))files.open=false;});
  files.addEventListener('focusout',function(e){if(e.relatedTarget&&!files.contains(e.relatedTarget))files.open=false;});
  popup.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();if(files.open){files.open=false;files.querySelector('summary').focus();}else close(false);}});
  o.host.classList.add('huw-musical--score-open');renderEditor();popup.focus({preventScroll:true});return true;
 }
 return {open:open,close:close,isOpen:function(){return !!popup;},dispose:function(){close(true);}};
}
exports.mount=mount;
})();
