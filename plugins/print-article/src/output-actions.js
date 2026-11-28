/*\
title: $:/plugins/huwiki/print-article/output-actions.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// Print the same prepared pages as the PDF, independently of Web Share.
exports.mount=function(options){
 var doc=options.document,win=options.window,nav=options.navigator||{},urls=[],revision=0,ready=false,closed=false;
 var host=doc.createElement('section'),style=doc.createElement('style');
 host.className='huprint-native-pages';host.setAttribute('aria-hidden','true');
 style.textContent='.huprint-native-pages{display:none!important}@media print{'+
  '@page{size:A4;margin:0}html:has(body.huprint-native-printing){margin:0!important;padding:0!important}'+
  'body.huprint-native-printing{margin:0!important;padding:0!important;overflow:visible!important;background:white!important}'+
  'body.huprint-native-printing>:not(.huprint-native-pages){display:none!important}'+
  'body.huprint-native-printing>.huprint-native-pages{display:block!important;margin:0!important;padding:0!important}'+
  '.huprint-native-pages>section{display:block!important;box-sizing:border-box!important;width:210mm!important;height:297mm!important;padding:0!important;margin:0!important;overflow:hidden!important;break-inside:avoid;break-after:page;page-break-after:always;line-height:0}'+
  '.huprint-native-pages>section:last-child{break-after:auto;page-break-after:auto}'+
  '.huprint-native-pages img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;margin:0!important;padding:0!important}'+
 '}';
 doc.head.appendChild(style);doc.body.appendChild(host);
 function finish(){doc.body.classList.remove('huprint-native-printing');}
 if(win.addEventListener)win.addEventListener('afterprint',finish);
 function reset(){revision++;ready=false;finish();host.textContent='';urls.forEach(function(url){win.URL.revokeObjectURL(url);});urls=[];}
 async function prepare(images){
  reset();var generation=revision;
  await Promise.all(images.map(function(page,index){
   var sheet=doc.createElement('section');sheet.setAttribute('data-page',String(index+1));host.appendChild(sheet);
   if(page.blank){sheet.setAttribute('data-blank','true');return Promise.resolve();}
   var image=doc.createElement('img');image.alt=(options.language==='en'?'Page ':'Side ')+(index+1);sheet.appendChild(image);
   return new Promise(function(resolve,reject){
    image.onload=resolve;image.onerror=function(){reject(Error(options.language==='en'?'A print page could not be loaded.':'En udskriftsside kunne ikke indlæses.'));};
    var url=win.URL.createObjectURL(new Blob([page.data],{type:'image/jpeg'}));urls.push(url);image.src=url;
   });
  }));
  if(!closed&&generation===revision)ready=images.length>0;
  return ready;
 }
 function report(error){if(options.onError)options.onError(error);}
 function print(){
  if(closed||!ready)return false;
  try{
   if(typeof win.print!=='function')throw Error(options.language==='en'?'Printing is unavailable. Save the PDF instead.':'Browseren kan ikke udskrive. Brug Gem PDF.');
   doc.body.classList.add('huprint-native-printing');if(win.focus)win.focus();win.print();return true;
  }catch(error){finish();report(error);return false;}
 }
 function canShare(file){try{return !!(file&&nav.share&&(!nav.canShare||nav.canShare({files:[file]})));}catch(ignore){return false;}}
 function activate(file){
  // A desktop print action must open Print, even if Web Share is advertised.
  if(!options.preferShare||!canShare(file))return print();
  try{return Promise.resolve(nav.share({files:[file],title:options.title||''})).then(function(){return true;},failed);}
  catch(error){return failed(error);}
  function failed(error){if(error&&error.name==='AbortError')return false;return print();}
 }
 return {prepare:prepare,reset:reset,print:print,activate:activate,canShare:canShare,isReady:function(){return ready;},destroy:function(){closed=true;reset();if(win.removeEventListener)win.removeEventListener('afterprint',finish);host.remove();style.remove();}};
};
})();
