/* HUWiki MuseScore → ABC importer — TiddlyWiki5 widget (MIT) */
/*\
title: $:/plugins/huwiki/musescore-import/widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require('$:/core/modules/widgets/widget.js').widget;
var Converter=require('$:/plugins/huwiki/musescore-import/converter.js');
var JSZip=require('$:/plugins/huwiki/musescore-import/jszip.js');
var ABCJS=require('$:/plugins/huwiki/musescore-import/abcjs.js');
// Retain the in-memory conversion across a parent TiddlyWiki re-render, e.g. changing $:/language.
var sessions=new WeakMap();
function keepSession(widget){if(widget.wiki)sessions.set(widget.wiki,{stage:widget.stage,model:widget.model,state:widget.state,result:widget.result,batchItems:widget.batchItems,batchErrors:widget.batchErrors});}
function ImportWidget(parseTreeNode,options){this.initialise(parseTreeNode,options);}
ImportWidget.prototype=new Widget();
var MAX_FILE=12*1024*1024,MAX_XML=18*1024*1024;
// TW5 locale follows the wiki's own $:/language, not the browser/device locale.
function inEnglish(){
 var lang=($tw.wiki&&$tw.wiki.getTiddlerText('$:/language','$:/languages/en-GB'))||'$:/languages/en-GB';
 return !/(?:\/|^)(?:huwiki-)?da(?:[-_]|$)/i.test(lang);
}
// Translation table of visible UI messages, including the variable-length batch statuses.
// We deliberately do not translate ABC source or any saved source filename.
var EN={
 'MuseScore til ABC-import':'MuseScore to ABC import',
 'HUWIKI · MUSIK':'HUWIKI · MUSIC',
 'Åbn fil':'Open files', 'Vælg noder':'Choose notation', 'Node-preview':'Score preview',
 'Vælg ét eller flere partiturer. Al konvertering foregår lokalt i browseren.':'Choose one or more scores. All conversion is performed locally in your browser.',
 'MuseScore .mscz/.mscx og MusicXML .musicxml/.xml/.mxl. Du kan vælge flere filer samtidig. Originalerne ændres ikke.':'MuseScore .mscz/.mscx and MusicXML .musicxml/.xml/.mxl. You can select several files. The originals are unchanged.',
 'Vælg en eller flere filer':'Choose one or more files',
 'Efter node-preview sender du de konverterede melodier til TiddlyWikis almindelige $:/Import. Dér vælger du, hvilke tiddlere der skal importeres, og om eksisterende titler skal overskrives.':'After the score preview, submit the converted tunes to TiddlyWiki’s standard $:/Import. There you select which tiddlers to import and whether existing titles may be overwritten.',
 'Filen er for stor. Maks. 12 MB komprimeret.':'File too large. Maximum 12 MB compressed.',
 'Ingen ':'No ', '-fil fundet inde i arkivet.':' file found in the archive.',
 'Indholdet er for stort (over 18 MB).':'Archive content too large (over 18 MB).',
 'Ukendt filtype: ':'Unknown file type: ',
 'XML-indholdet er for stort.':'XML content too large.',
 'Vælg højst 20 filer ad gangen.':'Choose up to 20 files at a time.',
 'Læser ':'Reading ', 'Ingen filer kunne læses. ':'No files could be read. ',
 'Kunne ikke læse filen: ':'Could not read the file: ',
 'Batchimport: tilpas indstillingerne for hver fil, eller behold de foreslåede valg.':'Batch import: adjust each file’s settings or keep the suggested selections.',
 ' partitur(er) klar · ':' score(s) ready · ', ' fil(er) kunne ikke læses':' file(s) could not be read',
 'Filer, som ikke kunne indlæses (':'Files that could not be loaded (',
 ' takter · ':' measures · ', ' nodesystem(er)':' staff/staves',
 'Mulig transponeret dublet fra takt ':'Possible transposed duplicate from measure ',
 'Mulig transponeret dublet: takt ':'Possible transposed duplicate: measures ',
 ' halvtoner). Foreslået slut: ':' semitones). Suggested end: ',
 ' halvtoner fra første halvdel (':' semitones from the first half (',
 ' % rytmisk match). Intervallet er foreslået uden denne halvdel. Du kan frit ændre det.':'% rhythmic match). The proposed range excludes this half; you can change it.',
 'Nodeakkorder':'Note chords', ' nodeakkorder':' note chords',
 'Fra takt':'From measure','Til takt':'To measure',
 'Titel på den nye tiddler':'New tiddler title',
 'Takter pr. linje (fulde)':'Full measures per line',
 'Konverteringsbemærkninger (':'Conversion notes (', 'Konverteringsadvarsler (':'Conversion warnings (',
 '← Vælg nye filer':'← Choose new files', 'Vis nodeeksempler →':'Preview scores →',
 'Ingen partiturer at vise.':'No scores to display.',
 'Vælg mindst én stemme.':'Select at least one voice.', 'Ugyldigt taktinterval.':'Invalid measure range.',
 'ABC mangler titel (T:) eller toneart (K:).':'ABC is missing a title (T:) or key (K:).',
 'Ingen noder blev tegnet.':'No notes were drawn.',
 'Der blev ikke tegnet et nodeark.':'No score was drawn.',
 'ABCJS advarer om ':'ABCJS reports ', ' punkt(er): ':' issue(s): ',
 ' punkt(er). Undersøg dem før import: ':' issue(s). Please review before importing: ',
 'Noderne er tegnet med ABCJS. Sammenlign med originalen.':'The score was rendered with ABCJS. Compare it with the original.',
 'Nodeeksemplet er dannet med ABCJS. Sammenlign med originalpartituret.':'The preview was rendered with ABCJS. Compare it with the source score.',
 'Preview kunne ikke vises: ':'Preview could not be displayed: ',
 'Nodeeksemplet kunne ikke vises: ':'Could not display the score: ',
 ' af ':' of ', ' partiturer har et gyldigt node-preview. De bliver kun klargjort i $:/Import; du vælger de endelige tiddlere i TiddlyWikis egen importliste.':' scores have a valid preview. They will only be staged in $:/Import; select final tiddlers using TiddlyWiki’s own import list.',
 'Batchimport: kontrollér noderne. Når du fortsætter, viser TiddlyWiki sin normale importliste med valgfrie afkrydsninger.':'Batch import: review the music. TiddlyWiki will then show its normal import list with selectable checkboxes.',
 ' partiturer · ':' scores · ', ' filfejl fra indlæsningen':' file read error(s)',
 ' · takt ':' · measures ', ' · ':' · ', ' stemme(r) · ':' voice(s) · ', ' toner':' notes',
 'Kan ikke generere ABC: ':'Could not generate ABC: ',
 'Nodeforhåndsvisning for ':'Score preview for ', 'Nodeforhåndsvisning':'Score preview',
 'Se eller ret ABC-koden':'Show or edit ABC source',
 'Se eller ret ABC-koden før import':'Show or edit ABC source before import',
 '← Ret valg og intervaller':'← Edit selections and ranges',
 'Send til TiddlyWiki-import (':'Send to TiddlyWiki import (',
 'Ingen gyldige nodeeksempler at overføre.':'No valid scores to submit.',
 'TiddlyWiki har allerede en ufærdig $:/Import. Fuldfør eller annullér den først, så vi ikke blander to forskellige importer.':'TiddlyWiki already has a pending $:/Import. Complete or cancel it first so two imports are not mixed.',
 'Åbn den eksisterende $:/Import':'Open the existing $:/Import',
 'Nodearkene er lagt i TiddlyWikis midlertidige importliste. Ingen melodier er gemt permanent endnu.':'The scores have been staged in TiddlyWiki’s temporary import list. No tunes have been permanently saved.',
 ' ABC-tiddlere klargjort':' ABC tiddlers staged',
 'TiddlyWiki har åbnet $:/Import. Vælg/fravælg melodier, omdøb dem ved behov, og tryk først dér på Importér.':'TiddlyWiki has opened $:/Import. Select/deselect tunes, rename as necessary, and only then click Import.',
 'Åbn $:/Import igen':'Open $:/Import again', 'Begynd ny konvertering':'Start a new conversion',
 'Vælg stemmer og takter. Becifringer fra hele partituret kommer med én gang.':'Choose voices and bars. Chord symbols from the whole score are included once.',
 'Stemmer og nodesystemer':'Voices and staves',
 'Bemærkninger ved filen':'Notes about the file',
 '← Vælg en anden fil':'← Choose another file', 'Vis nodeeksempel →':'Preview score →',
 'Vælg et gyldigt taktinterval.':'Select a valid measure range.',
 'Kan ikke vise noder: ':'Cannot render score: ',
 'Gennemse de faktiske noder. Derefter sender du melodien til TiddlyWikis almindelige importliste.':'Review the actual score, then submit the tune to TiddlyWiki’s standard import list.',
 'Takt ':'Measures ', 'Kontrollér især:':'Review especially:',
 '← Tilbage til valg':'← Back to selection',
 'Send til TiddlyWikis import':'Send to TiddlyWiki import',
 'Melodien ligger nu i TiddlyWikis midlertidige $:/Import. Den er endnu ikke gemt som en ABC-tiddler.':'The tune is now in TiddlyWiki’s temporary $:/Import. No ABC tiddler has been saved yet.',
 'Klar til TiddlyWikis normale import':'Ready for TiddlyWiki’s native import',
 'Gå til $:/Import, kontrollér titlen, og markér Importér. Her kan du også fravælge melodien.':'Open $:/Import, check the title, then select Import. You can also deselect the tune.',
 'Åbn $:/Import':'Open $:/Import', 'Konvertér endnu en fil':'Convert another file',
 'Importeret fra ':'Imported from ', 'Redigér musikken med ABC-editoren.':'Edit the music using the ABC editor.',
 'Importeret melodi':'Imported tune',
 'En usædvanlig tuplet kræver manuel kontrol.':'An unusual tuplet needs manual review.',
 'MuseScore-location/flyttede nodepositioner findes; kontrollér rytmer i preview.':'MuseScore position offsets were found; check rhythms in the preview.',
 'Slagtøjsnotation (perc) kan ikke gengives fuldt ud i denne version.':'Percussion notation is not fully supported by this version.',
 'Kontrollér transponeret dublet fra takt ':'Review transposed duplicate from measure ',
 'Varighed mangler i takt ':'Missing duration in measure ',
 'Gentagelse x':'Repeat x', ' i takt ':' in measure ',
 ' skal kontrolleres (ABC afspiller normalt to gange).':' needs review (ABC normally plays repeats twice).',
 'En unpitched/percussion-node er ikke oversat nøjagtigt.':'An unpitched/percussion note was not converted exactly.',
 'XML kunne ikke læses: ':'Could not parse XML: ',
 'Ikke en MuseScore MSCX-fil.':'Not a MuseScore MSCX file.',
 'Filen indeholder ingen nodesystemer.':'The file has no staves.',
 'Ingen stemmer fundet i MusicXML.':'No voices were found in MusicXML.'
};
var EN_KEYS=Object.keys(EN).filter(function(k){return k!==' · ';}).sort(function(a,b){return b.length-a.length;});
function tr(s){
 if(!inEnglish()||s===undefined||s===null)return s;
 s=String(s);
 for(var i=0;i<EN_KEYS.length;i++){var k=EN_KEYS[i];if(s.indexOf(k)>=0)s=s.split(k).join(EN[k]);}
 return s;
}
function node(parent,tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=tr(text);parent.appendChild(x);return x;}
function btn(parent,text,fn,primary){var b=node(parent,'button','humi-button'+(primary?' primary':''),text);b.type='button';b.addEventListener('click',fn);return b;}
function field(parent,labelText,tag,attrs){var l=node(parent,'label','humi-field'),cap=node(l,'span','',labelText),x=node(l,tag);if(attrs)Object.keys(attrs).forEach(function(k){if(k==='value')x.value=attrs[k];else x.setAttribute(k,attrs[k]);});return x;}
function errorMessage(widget,msg){widget.status.textContent=tr(msg||'');widget.status.className='humi-status '+(msg?'humi-error':'');}
ImportWidget.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 if(!$tw.browser){return;}
 var host=this.document.createElement('section');host.className='humi-app';host.setAttribute('aria-label',tr('MuseScore til ABC-import'));parent.insertBefore(host,nextSibling);this.domNodes.push(host);this.host=host;
 var saved=sessions.get(this.wiki)||{};
 this.model=saved.model||null;this.stage=saved.stage||1;this.state=saved.state||null;this.result=saved.result||null;this.batchItems=saved.batchItems||null;this.batchErrors=saved.batchErrors||[];
 if(this.stage===3&&this.batchItems)this.showBatchStep3();
 else if(this.stage===2&&this.batchItems)this.showBatchStep2();
 else if(this.stage===3&&this.model&&this.result)this.showStep3();
 else if(this.stage===2&&this.model&&this.state)this.showStep2();
 else this.showStep1();
};
ImportWidget.prototype.refresh=function(changed){
 var attrs=this.computeAttributes();if($tw.utils.count(attrs)){this.refreshSelf();return true;}
 if(changed['$:/language']){
  // Preserve source edits and conversion selections when changing wiki language.
  if(this.stage===3&&!this.batchItems&&this.result&&this.source)this.result.abc=this.source.value;
  if(this.batchItems&&this.stage===3)this.showBatchStep3();
  else if(this.batchItems&&this.stage===2)this.showBatchStep2();
  else if(this.model&&this.stage===3)this.showStep3();
  else if(this.model&&this.stage===2)this.showStep2();
  else if(this.stage===1)this.showStep1();
  else this.showStep1();
  return true;
 }
 return false;
};
ImportWidget.prototype.frame=function(step,subtitle){
 this.host.textContent='';var hd=node(this.host,'div','humi-hero');node(hd,'div','humi-kicker','HUWIKI · MUSIK');node(hd,'h2','', 'MuseScore → ABC');node(hd,'p','',subtitle);
 var nav=node(this.host,'div','humi-steps');[['1','Åbn fil'],['2','Vælg noder'],['3','Node-preview']].forEach(function(s,i){var x=node(nav,'span','humi-step'+(step===i+1?' current':step>i+1?' complete':''),s[0]+' · '+s[1]);if(step===i+1)x.setAttribute('aria-current','step');});
 this.page=node(this.host,'div','humi-page');this.status=node(this.host,'p','humi-status');this.status.setAttribute('role','status');
 keepSession(this);
};
ImportWidget.prototype.showStep1=function(){var self=this;this.stage=1;this.frame(1,'Vælg ét eller flere partiturer. Al konvertering foregår lokalt i browseren.');
 node(this.page,'p','humi-help','MuseScore .mscz/.mscx og MusicXML .musicxml/.xml/.mxl. Du kan vælge flere filer samtidig. Originalerne ændres ikke.');
 var input=field(this.page,'Vælg en eller flere filer','input',{type:'file',accept:'.mscz,.mscx,.xml,.musicxml,.mxl',multiple:'multiple'});input.className='humi-file';
 input.addEventListener('change',function(){if(input.files&&input.files.length)self.openFiles(Array.from(input.files));});
 node(this.page,'p','humi-note','Efter node-preview sender du de konverterede melodier til TiddlyWikis almindelige $:/Import. Dér vælger du, hvilke tiddlere der skal importeres, og om eksisterende titler skal overskrives.');
};
ImportWidget.prototype.readModel=async function(file){
 if(file.size>MAX_FILE)throw Error('Filen er for stor. Maks. 12 MB komprimeret.');
 var ext=file.name.toLowerCase().split('.').pop(),raw='';
 if(ext==='mscz'||ext==='mxl'){
   var zipped=await JSZip.loadAsync(await file.arrayBuffer());var names=Object.keys(zipped.files).filter(function(s){return !zipped.files[s].dir;});
   var regex=ext==='mscz'?/\.mscx$/i:/\.(musicxml|xml)$/i;var eligible=names.filter(function(s){return regex.test(s)&&!/^(META-INF|__MACOSX)\//i.test(s);});
   if(!eligible.length)throw Error('Ingen '+(ext==='mscz'?'MSCX':'MusicXML')+'-fil fundet inde i arkivet.');
   if(ext==='mxl'||ext==='mscz'){
     var m=names.find(function(x){return /^META-INF\/container\.xml$/i.test(x);});
     if(m){var container=await zipped.file(m).async('string');var found=container.match(/full-path\s*=\s*["']([^"']+)["']/);if(found&&zipped.file(found[1]))eligible=[found[1]];}
   }
   var entry=zipped.file(eligible[0]);if(entry._data&&entry._data.uncompressedSize>MAX_XML)throw Error('Indholdet er for stort (over 18 MB).');
   raw=await entry.async('string');
 }else if(['mscx','xml','musicxml'].indexOf(ext)>=0){raw=await file.text();}
 else throw Error('Ukendt filtype: '+ext);
 if(raw.length>MAX_XML)throw Error('XML-indholdet er for stort.');
 var model=(ext==='mscz'||ext==='mscx')?Converter.parseMuse(raw,file.name):Converter.parseMusicXML(raw,file.name);
 model.name=file.name;return model;
};
ImportWidget.prototype.initialState=function(model){
 var first=model.staves.reduce(function(a,s){return a||s.voices.find(function(v){return v.count>0;})||null;},null);
 return {selected:first?[first.id]:[],start:1,end:model.duplicate?model.duplicate.start-1:model.totalMeasures,title:model.title,barsPerLine:4,ack:false};
};
ImportWidget.prototype.openFiles=async function(files){
 if(files.length===1){this.batchItems=null;return this.openFile(files[0]);}
 if(files.length>20){errorMessage(this,'Vælg højst 20 filer ad gangen.');return;}
 this.batchItems=[];this.batchErrors=[];var good=0;
 for(var i=0;i<files.length;i++){
   try{errorMessage(this,'Læser '+(i+1)+'/'+files.length+': '+files[i].name+' …');
     var model=await this.readModel(files[i]);this.batchItems.push({model:model,state:this.initialState(model),source:files[i].name});good++;
   }catch(e){this.batchErrors.push({file:files[i].name,message:e.message});}
 }
 if(!good){errorMessage(this,'Ingen filer kunne læses. '+this.batchErrors.map(function(x){return x.file+': '+x.message;}).join(' · '));return;}
 this.showBatchStep2();
};
ImportWidget.prototype.openFile=async function(file){try{
 errorMessage(this,'Læser '+file.name+' …');this.model=await this.readModel(file);this.state=this.initialState(this.model);this.showStep2();
 }catch(e){errorMessage(this,'Kunne ikke læse filen: '+e.message);}
};
// The catalogue supplies original files to the same review flow as a local upload.
// Parsing and ABC conversion remain in this widget; nothing is saved by opening a source.
ImportWidget.prototype.openCatalogueFiles=async function(items){
 if(!items.length||items.length>20)throw Error('Vælg mellem 1 og 20 originalfiler.');
 var epoch=this._catalogueEpoch=(this._catalogueEpoch||0)+1,parsed=[];
 for(var i=0;i<items.length;i++){
  var item=items[i],model=await this.readModel(item.file);
  if(epoch!==this._catalogueEpoch)return false;
  model.catalogueProvenance=item.provenance||{};
  var state=this.initialState(model);state.title=item.title||model.title;
  parsed.push({model:model,state:state,source:item.file.name});
 }
 this.result=null;this.batchErrors=[];
 if(parsed.length===1){this.batchItems=null;this.model=parsed[0].model;this.state=parsed[0].state;this.showStep2();}
 else{this.model=null;this.batchItems=parsed;this.showBatchStep2();}
 return true;
};
ImportWidget.prototype.showBatchStep2=function(){
 var self=this;this.stage=2;this.frame(2,'Batchimport: tilpas indstillingerne for hver fil, eller behold de foreslåede valg.');
 node(this.page,'p','humi-meta',this.batchItems.length+' partitur(er) klar · '+this.batchErrors.length+' fil(er) kunne ikke læses');
 if(this.batchErrors.length){var d=node(this.page,'details','humi-warning');node(d,'summary','','Filer, som ikke kunne indlæses ('+this.batchErrors.length+')');var u=node(d,'ul','humi-warnings');this.batchErrors.forEach(function(e){node(u,'li','',e.file+': '+e.message);});}
 this.batchItems.forEach(function(item,i){
  var m=item.model,st=item.state,card=node(self.page,'section','humi-batch-card');
  var hd=node(card,'div','humi-batch-heading');node(hd,'strong','',(i+1)+'. '+m.title);node(card,'p','humi-meta',m.name+' · '+m.totalMeasures+' takter · '+m.staves.length+' nodesystem(er)');
  if(m.duplicate)node(card,'p','humi-warning','Mulig transponeret dublet fra takt '+m.duplicate.start+' ('+(m.duplicate.shift>0?'+':'')+m.duplicate.shift+' halvtoner). Foreslået slut: '+st.end+'.');
  var voices=node(card,'div','humi-voices humi-batch-voices');
  m.staves.forEach(function(s){s.voices.forEach(function(v){if(v.count<=0)return;var a=node(voices,'label','humi-check'),x=node(a,'input');x.type='checkbox';x.value=v.id;x.checked=st.selected.indexOf(v.id)>=0;x.addEventListener('change',function(){st.selected=Array.from(voices.querySelectorAll('input:checked')).map(function(y){return y.value;});});node(a,'span','',v.label+' ('+v.count+' nodeakkorder)');});});
  var r=node(card,'div','humi-range'),a=field(r,'Fra takt','input',{type:'number',min:1,max:m.totalMeasures,value:st.start}),b=field(r,'Til takt','input',{type:'number',min:1,max:m.totalMeasures,value:st.end});
  a.addEventListener('change',function(){st.start=Number(a.value);});b.addEventListener('change',function(){st.end=Number(b.value);});
  var perLine=field(r,'Takter pr. linje (fulde)','input',{type:'number',min:1,max:12,value:st.barsPerLine||4});perLine.addEventListener('change',function(){st.barsPerLine=Math.max(1,Math.min(12,Number(perLine.value)||4));});
  var title=field(card,'Titel på den nye tiddler','input',{type:'text',value:st.title});title.className='humi-title';title.addEventListener('input',function(){st.title=title.value;});
  if(m.warnings.length){var wr=node(card,'details','humi-source');node(wr,'summary','','Konverteringsbemærkninger ('+m.warnings.length+')');var ul=node(wr,'ul','humi-warnings');m.warnings.forEach(function(w){node(ul,'li','',w);});}
 });
 var act=node(this.page,'div','humi-actions');btn(act,'← Vælg nye filer',function(){self.batchItems=null;self.showStep1();});btn(act,'Vis nodeeksempler →',function(){self.buildBatchPreviews();},true);
};
ImportWidget.prototype.buildBatchPreviews=function(){var included=this.batchItems;if(!included.length){errorMessage(this,'Ingen partiturer at vise.');return;}
 for(var i=0;i<included.length;i++){
  var it=included[i],s=it.state,m=it.model;it.previewOK=false;it.previewError='';
  try{
   if(!s.selected.length)throw Error('Vælg mindst én stemme.');
   if(!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<1||s.end>m.totalMeasures||s.end<s.start)throw Error('Ugyldigt taktinterval.');
   it.result=Converter.renderABC(m,s.selected,s.start,s.end,{title:s.title,barsPerLine:s.barsPerLine});it.abc=it.result.abc;
  }catch(e){it.result=null;it.previewError=e.message;}
 }
 this.showBatchStep3();
};
ImportWidget.prototype.renderBatchNotation=function(it){
 it.previewOK=false;
 if(it.paper)it.paper.textContent='';if(it.info)it.info.textContent='';
 try{
  if(!it.abc||!/^K:\s*\S/m.test(it.abc)||!/^T:\s*\S/m.test(it.abc))throw Error('ABC mangler titel (T:) eller toneart (K:).');
  var tunes=ABCJS.renderAbc(it.paper,it.abc,{responsive:'resize',staffwidth:680,add_classes:true});
  if(!tunes||!tunes.length||!it.paper.querySelector('svg')||!it.paper.querySelector('.abcjs-note'))throw Error('Ingen noder blev tegnet.');
  var warnings=tunes[0].warnings||[];if(warnings.length){it.info.textContent=tr('ABCJS advarer om '+warnings.length+' punkt(er): '+warnings.slice(0,4).join(' · '));it.info.className='humi-preview-info humi-warning';}
  else{it.info.textContent=tr('Noderne er tegnet med ABCJS. Sammenlign med originalen.');it.info.className='humi-preview-info';}
  it.previewOK=true;
 }catch(e){it.previewError=e.message;it.info.textContent=tr('Preview kunne ikke vises: '+e.message);it.info.className='humi-preview-info humi-error';}
 this.updateBatchSaveState();
};
ImportWidget.prototype.updateBatchSaveState=function(){
 if(!this.batchSave)return;var selected=this.batchItems,ready=selected.filter(function(it){return it.previewOK;});
 this.batchSave.disabled=!ready.length;this.batchSave.textContent=tr('Send til TiddlyWiki-import ('+ready.length+')');
 if(this.batchSummary)this.batchSummary.textContent=tr(ready.length+' af '+selected.length+' partiturer har et gyldigt node-preview. De bliver kun klargjort i $:/Import; du vælger de endelige tiddlere i TiddlyWikis egen importliste.');
};
ImportWidget.prototype.showBatchStep3=function(){var self=this;this.stage=3;this.frame(3,'Batchimport: kontrollér noderne. Når du fortsætter, viser TiddlyWiki sin normale importliste med valgfrie afkrydsninger.');
 var included=this.batchItems;node(this.page,'p','humi-meta',included.length+' partiturer · '+this.batchErrors.length+' filfejl fra indlæsningen');
 included.forEach(function(it,i){var card=node(self.page,'section','humi-batch-card'),st=it.state;
  node(card,'h3','',(i+1)+'. '+(st.title||it.model.title));node(card,'p','humi-meta',it.source+' · takt '+st.start+'–'+st.end+(it.result?' · '+it.result.voices+' stemme(r) · '+it.result.notes+' toner':''));
  if(!it.result){node(card,'p','humi-warning','Kan ikke generere ABC: '+it.previewError);return;}
  it.paper=node(card,'div','humi-paper');it.paper.setAttribute('aria-label','Nodeforhåndsvisning for '+st.title);it.info=node(card,'p','humi-preview-info');
  if(it.result.warnings.length){var d=node(card,'details','humi-source');node(d,'summary','','Konverteringsadvarsler ('+it.result.warnings.length+')');var u=node(d,'ul','humi-warnings');it.result.warnings.forEach(function(x){node(u,'li','',x);});}
  var source=node(card,'details','humi-source');node(source,'summary','','Se eller ret ABC-koden');var code=node(source,'textarea','humi-code');code.spellcheck=false;code.value=it.abc;
  code.addEventListener('input',function(){it.abc=code.value;it.previewOK=false;self.updateBatchSaveState();clearTimeout(it.timer);it.timer=setTimeout(function(){self.renderBatchNotation(it);},350);});
  self.renderBatchNotation(it);
 });
 var actions=node(this.page,'div','humi-actions');btn(actions,'← Ret valg og intervaller',function(){self.showBatchStep2();});this.batchSave=btn(actions,'Send til TiddlyWiki-import (0)',function(){self.queueBatch();},true);this.batchSave.disabled=true;
 this.batchSummary=node(this.page,'p','humi-meta');this.updateBatchSaveState();
};
// Build in-memory import fields only. Do not create a permanent tiddler here.
// The core's native $:/Import review takes responsibility for the final selection.
ImportWidget.prototype.createAbcFields=function(model,state,sourceText){
 var title=String(state.title||model.title||'Importeret melodi').trim()||'Importeret melodi';
 if(title.indexOf('$:/')===0)title='Importeret '+title;
 var originals=[];
 model.staves.forEach(function(st){if(st.name&&st.voices.some(function(v){return state.selected.indexOf(v.id)>=0;})&&originals.indexOf(st.name)<0)originals.push(st.name);});
 var fields={title:title,text:tr('Importeret fra ')+model.name+'\n\n'+tr('Redigér musikken med ABC-editoren.'),tags:['ABC','Musik'],type:'text/vnd.tiddlywiki','abc-source':sourceText,'huwiki-import-source':model.name,'huwiki-import-format':model.format,'huwiki-import-staves':state.selected.join(','),'huwiki-import-original-instruments':originals.join(' / '),'huwiki-import-range':state.start+'-'+state.end,'abc-bars-per-line':String(state.barsPerLine||4)};
 ['abc-origin-library','abc-origin-entry','abc-origin-sha256','abc-origin-url','abc-collection','huwiki-source-date','huwiki-source-contributor'].forEach(function(key){if(model.catalogueProvenance&&typeof model.catalogueProvenance[key]==='string')fields[key]=model.catalogueProvenance[key];});
 return fields;
};
ImportWidget.prototype.stageForCoreImport=function(fields){
 if(!fields.length){errorMessage(this,'Ingen gyldige nodeeksempler at overføre.');return false;}
 var existing=this.wiki.getTiddler('$:/Import');
 if(existing&&existing.fields.status==='pending'){
  errorMessage(this,'TiddlyWiki har allerede en ufærdig $:/Import. Fuldfør eller annullér den først, så vi ikke blander to forskellige importer.');
  var self=this;btn(this.page,'Åbn den eksisterende $:/Import',function(){self.dispatchEvent({type:'tm-navigate',navigateTo:'$:/Import',navigateFromTitle:'HUWiki · MuseScore → ABC'});});
  return false;
 }
 // Duplicate names inside the same batch would overwrite each other in the import container.
 // Suffix them within the batch; existing wiki titles are deliberately left unchanged
 // so the native importer can warn and let the user rename, skip or overwrite.
 var seen=Object.create(null);fields.forEach(function(t){
  var base=t.title,idx=2;while(seen[t.title]){t.title=base+' ('+idx+')';idx++;}seen[t.title]=true;
 });
 this.dispatchEvent({type:'tm-import-tiddlers',param:JSON.stringify(fields),autoOpenOnImport:'yes'});
 return true;
};
ImportWidget.prototype.queueBatch=function(){
 var self=this,ready=this.batchItems.filter(function(it){return it.previewOK&&it.abc;});
 var fields=ready.map(function(it){return self.createAbcFields(it.model,it.state,it.abc);});
 if(!this.stageForCoreImport(fields))return;
 this.stage=4;this.frame(3,'Nodearkene er lagt i TiddlyWikis midlertidige importliste. Ingen melodier er gemt permanent endnu.');
 node(this.page,'h3','humi-success',fields.length+' ABC-tiddlere klargjort');
 node(this.page,'p','', 'TiddlyWiki har åbnet $:/Import. Vælg/fravælg melodier, omdøb dem ved behov, og tryk først dér på Importér.');
 var actions=node(this.page,'div','humi-actions');btn(actions,'Åbn $:/Import igen',function(){self.dispatchEvent({type:'tm-navigate',navigateTo:'$:/Import',navigateFromTitle:'HUWiki · MuseScore → ABC'});});btn(actions,'Begynd ny konvertering',function(){self.batchItems=null;self.showStep1();});
};
ImportWidget.prototype.showStep2=function(){var self=this,m=this.model;if(!m)return this.showStep1();this.stage=2;this.frame(2,'Vælg stemmer og takter. Becifringer fra hele partituret kommer med én gang.');
 node(this.page,'h3','',m.title);node(this.page,'p','humi-meta',m.name+' · '+m.totalMeasures+' takter · '+m.staves.length+' nodesystem(er) · '+(m.version?'MuseScore '+m.version:m.format));
 if(m.duplicate){node(this.page,'p','humi-warning','Mulig transponeret dublet: takt '+m.duplicate.start+'–'+m.totalMeasures+' ligger '+(m.duplicate.shift>0?'+':'')+m.duplicate.shift+' halvtoner fra første halvdel ('+m.duplicate.confidence+' % rytmisk match). Intervallet er foreslået uden denne halvdel. Du kan frit ændre det.');}
 node(this.page,'h4','', 'Stemmer og nodesystemer');var options=node(this.page,'div','humi-voices');
 m.staves.forEach(function(s){s.voices.forEach(function(v){if(v.count<=0)return;var label=node(options,'label','humi-check');var cb=node(label,'input');cb.type='checkbox';cb.value=v.id;cb.checked=self.state.selected.indexOf(v.id)>=0;cb.addEventListener('change',function(){self.state.selected=Array.from(options.querySelectorAll('input:checked')).map(function(x){return x.value;});});var t=node(label,'span','',v.label+' ('+v.count+' nodeakkorder)');});});
 var ranges=node(this.page,'div','humi-range');var a=field(ranges,'Fra takt','input',{type:'number',min:1,max:m.totalMeasures,value:this.state.start});var b=field(ranges,'Til takt','input',{type:'number',min:1,max:m.totalMeasures,value:this.state.end});
 [a,b].forEach(function(x){x.addEventListener('change',function(){self.state.start=Number(a.value);self.state.end=Number(b.value);});});
 var perLine=field(ranges,'Takter pr. linje (fulde)','input',{type:'number',min:1,max:12,value:this.state.barsPerLine||4});perLine.addEventListener('change',function(){self.state.barsPerLine=Math.max(1,Math.min(12,Number(perLine.value)||4));});
 var nm=field(this.page,'Titel på den nye tiddler','input',{type:'text',value:this.state.title});nm.className='humi-title';nm.addEventListener('input',function(){self.state.title=nm.value;});
 if(m.warnings.length){node(this.page,'h4','', 'Bemærkninger ved filen');var list=node(this.page,'ul','humi-warnings');m.warnings.forEach(function(x){node(list,'li','',x);});}
 var actions=node(this.page,'div','humi-actions');btn(actions,'← Vælg en anden fil',function(){self.showStep1();});btn(actions,'Vis nodeeksempel →',function(){self.state.start=Number(a.value);self.state.end=Number(b.value);self.state.title=nm.value;self.buildPreview();},true);
};
ImportWidget.prototype.buildPreview=function(){var self=this;try{
 if(!this.state.selected.length)throw Error('Vælg mindst én stemme.');if(!Number.isInteger(this.state.start)||!Number.isInteger(this.state.end)||this.state.start<1||this.state.end>this.model.totalMeasures||this.state.end<this.state.start)throw Error('Vælg et gyldigt taktinterval.');
 this.result=Converter.renderABC(this.model,this.state.selected,this.state.start,this.state.end,{title:this.state.title,barsPerLine:this.state.barsPerLine});this.showStep3();
 }catch(e){errorMessage(this,'Kan ikke vise noder: '+e.message);}
};
ImportWidget.prototype.showStep3=function(){var self=this;this.stage=3;this.frame(3,'Gennemse de faktiske noder. Derefter sender du melodien til TiddlyWikis almindelige importliste.');
 node(this.page,'h3','',this.state.title);node(this.page,'p','humi-meta','Takt '+this.state.start+'–'+this.state.end+' · '+this.result.voices+' stemme(r) · '+this.result.notes+' toner');
 var paper=node(this.page,'div','humi-paper');paper.setAttribute('aria-label','Nodeforhåndsvisning');this.paper=paper;
 this.previewInfo=node(this.page,'div','humi-preview-info');
 var warn=node(this.page,'div','humi-warn-list');if(this.result.warnings.length){node(warn,'h4','', 'Kontrollér især:');var ul=node(warn,'ul','humi-warnings');this.result.warnings.forEach(function(w){node(ul,'li','',w);});}
 var sourceDetails=node(this.page,'details','humi-source');var sm=node(sourceDetails,'summary','', 'Se eller ret ABC-koden før import');this.source=node(sourceDetails,'textarea','humi-code');this.source.spellcheck=false;this.source.value=this.result.abc;
 this.previewTimer=null;this.source.addEventListener('input',function(){self.result.abc=self.source.value;self.previewOK=false;self.saveButton.disabled=true;clearTimeout(self.previewTimer);self.previewTimer=setTimeout(function(){self.showNotation();},400);});
 var actions=node(this.page,'div','humi-actions');btn(actions,'← Tilbage til valg',function(){self.showStep2();});this.saveButton=btn(actions,'Send til TiddlyWikis import',function(){self.queueSingle();},true);this.saveButton.disabled=true;
 this.showNotation();
};
ImportWidget.prototype.showNotation=function(){this.previewOK=false;this.saveButton.disabled=true;this.paper.textContent='';this.previewInfo.textContent='';var raw=this.source.value;
 try{
   if(!/^K:\s*\S/m.test(raw)||!/^T:\s*\S/m.test(raw))throw Error('ABC mangler titel (T:) eller toneart (K:).');
   var tunes=ABCJS.renderAbc(this.paper,raw,{responsive:'resize',staffwidth:680,add_classes:true});
   var svg=this.paper.querySelector('svg');if(!tunes||!tunes.length||!svg||!this.paper.querySelector('.abcjs-note'))throw Error('Der blev ikke tegnet et nodeark.');
   var warnings=tunes[0].warnings||[];if(warnings.length){this.previewInfo.textContent=tr('ABCJS advarer om '+warnings.length+' punkt(er). Undersøg dem før import: '+warnings.slice(0,5).join(' · '));this.previewInfo.className='humi-preview-info humi-warning';}
   else {this.previewInfo.textContent=tr('Nodeeksemplet er dannet med ABCJS. Sammenlign med originalpartituret.');this.previewInfo.className='humi-preview-info';}
   this.previewOK=true;this.saveButton.disabled=false;
 }catch(e){this.previewInfo.textContent=tr('Nodeeksemplet kunne ikke vises: '+e.message);this.previewInfo.className='humi-preview-info humi-error';}
};
ImportWidget.prototype.queueSingle=function(){
 if(!this.previewOK||!this.source.value)return;
 if(!this.stageForCoreImport([this.createAbcFields(this.model,this.state,this.source.value)]))return;
 var self=this;this.stage=4;this.frame(3,'Melodien ligger nu i TiddlyWikis midlertidige $:/Import. Den er endnu ikke gemt som en ABC-tiddler.');
 node(this.page,'h3','humi-success','Klar til TiddlyWikis normale import');
 node(this.page,'p','', 'Gå til $:/Import, kontrollér titlen, og markér Importér. Her kan du også fravælge melodien.');
 var actions=node(this.page,'div','humi-actions');btn(actions,'Åbn $:/Import',function(){self.dispatchEvent({type:'tm-navigate',navigateTo:'$:/Import',navigateFromTitle:'HUWiki · MuseScore → ABC'});});btn(actions,'Konvertér endnu en fil',function(){self.model=null;self.showStep1();});
};
ImportWidget.prototype.onDestroy=function(){this._catalogueEpoch=(this._catalogueEpoch||0)+1;clearTimeout(this.previewTimer);(this.batchItems||[]).forEach(function(item){clearTimeout(item.timer);});};
exports['huwiki-ms-import']=ImportWidget;
})();
