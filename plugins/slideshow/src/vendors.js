var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
"use strict";
exports.name='huwiki-slideshow-vendors';exports.platforms=['browser'];exports.after=['startup'];exports.synchronous=true;
exports.startup=function(){
 const base='$:/plugins/huwiki/slideshow/',names=['html2canvas.js','jspdf.js','jszip.js','pdf.js','pdf-worker.js'];
 async function ensure(list){for(const name of list){if(!names.includes(name)||!$tw.modules.titles[base+'vendor/'+name])throw Error(ui.t('Det indlejrede hjælpebibliotek mangler: ')+name);}}
 async function completePlugin(){await ensure(names);return $tw.wiki.getTiddler(base.slice(0,-1)).getFieldStrings();}
 window.HUWikiSlideshowVendors={ensure,completePlugin};
};
