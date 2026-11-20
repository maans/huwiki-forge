/*\
title: $:/plugins/huwiki/repertoire/book-layout.js
type: application/javascript
module-type: library
\*/
(function() {
"use strict";
// The score's own page geometry remains under ABC's control; this module only
// selects the number of facing pages and the boundary between two tunes.
function mode(preference,width,height) {
 if(preference==="single"||preference==="spread")return preference;
 return Number(width)>=900 && Number(width)>Number(height)?"spread":"single";
}
function direction(page,count,shown,delta,itemIndex,itemCount) {
 var pages=Number(count)||0, first=Number(page)||1, visible=Math.max(1,Number(shown)||1);
 var song=Number(itemIndex)||0,total=Number(itemCount)||0;
 if(!pages)return {kind:"unready"};
 if(delta>0) {
  if(first+visible-1<pages)return {kind:"page",delta:1};
  return song<total-1?{kind:"song",index:song+1}:{kind:"end"};
 }
 if(delta<0) {
  if(first>1)return {kind:"page",delta:-1};
  return song>0?{kind:"song",index:song-1,lastPage:true}:{kind:"start"};
 }
 return {kind:"unready"};
}
exports.mode=mode;
exports.direction=direction;
})();