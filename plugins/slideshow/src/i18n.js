'use strict';
var dictionary;
function load(){if(!dictionary)dictionary=JSON.parse($tw.wiki.getTiddlerText('$:/plugins/huwiki/slideshow/strings.json','{}'));}
function da(){return /^\$:\/languages\/da(?:-DK)?$/.test($tw.wiki.getTiddlerText('$:/language',''));}
function plain(text){return text.replace(/^(\s*)([\s\S]*?)(\s*)$/,function(_,a,key,b){return a+(dictionary[key]||key)+b;});}
// Only static source literals call this function. User content is concatenated afterwards.
exports.t=function(text){load();if(da())return text;if(dictionary[text.trim()])return plain(text);if(text.indexOf('<')<0)return text;return text.replace(/(?:^|>)([^<>]*)(?=<|$)/g,function(match,body){return match.slice(0,match.length-body.length)+plain(body);}).replace(/((?:title|aria-label|placeholder|emptyMessage)=["'])([^"']+)(["'])/g,function(_,a,b,c){return a+plain(b)+c;});};
exports.isDanish=da;
