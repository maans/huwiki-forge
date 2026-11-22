/*\
title: $:/plugins/huwiki/musical/language-player.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var Engine=require("$:/plugins/huwiki/cutout/engine.js");
var Language=require("$:/plugins/huwiki/musical/language.js");
function num(v,d){v=Number(v);return Number.isFinite(v)?v:d;}
function versions(wiki,title){
 var root=Engine.readScene(wiki,title),list=root&&root.musical&&root.musical.languageVersions||[],seen={};
 return list.filter(function(row){if(!row||typeof row.code!=="string"||typeof row.film!=="string"||seen[row.code]||!Engine.readScene(wiki,row.film))return false;seen[row.code]=true;return true;});
}
function correspondingTime(wiki,before,after,time){
 if(num(before.duration,0)>0&&time>=before.duration-.001)return num(after.duration,0);
 var old=(before.scenes||[]).filter(function(s){return s.start<=time;}).pop(),fresh=old&&(after.scenes||[]).find(function(s){return s.id===old.id;});
 if(!fresh)return 0;
 var source=Engine.readScene(wiki,old.source),target=Engine.readScene(wiki,fresh.source);
 var local=Engine.localTime(Math.max(0,time-old.start),source&&source.duration||old.duration,old.settings||{});
 var cues=source&&source.languageCues||[],cue=cues.find(function(c){return local>=c.start&&local<c.start+c.duration;});
 var inCue=!!cue;
 if(!cue)cue=cues.filter(function(c){return c.start<=local;}).pop();
 var next=cue&&(target&&target.languageCues||[]).find(function(c){return c.id===cue.id;});
 if(!next)return fresh.start+Math.min(local,(target&&target.languageCues||[])[0]?.start||0);
 var fraction=cue.kind==="song"&&(cue.timingStatus!=="verified"||next.timingStatus!=="verified")?0:Math.max(0,Math.min(1,(local-cue.start)/Math.max(.01,cue.duration)));
 var desired=next.start+fraction*next.duration;
 if(!inCue){
  var following=cues.find(function(c){return c.start>local;}),newFollowing=following&&(target.languageCues||[]).find(function(c){return c.id===following.id;});
  var end=cue.start+cue.duration,newEnd=next.start+next.duration;
  var gap=Math.max(.001,(following?following.start:source.duration)-end),newGap=Math.max(0,(newFollowing?newFollowing.start:target.duration)-newEnd);
  desired=newEnd+Math.max(0,Math.min(1,(local-end)/gap))*newGap;
 }
 var settings=fresh.settings||{},speed=num(settings.speed,1);
 if(settings.loop||speed<=0)return fresh.start;
 return fresh.start+Math.max(0,Math.min(fresh.duration,num(settings.start,0)+(desired-num(settings.offset,0))/speed));
}
function LanguagePlayer(parseTreeNode,options){this.initialise(parseTreeNode,options);}
LanguagePlayer.prototype=new Widget();
LanguagePlayer.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();
 var self=this,doc=this.document,title=this.getAttribute("film",""),choices=versions(this.wiki,title),da=Language.isDanish(this.wiki);
 var outer=doc.createElement("div");outer.className="animus-language-performance";parent.insertBefore(outer,nextSibling);this.domNodes.push(outer);
 var label=doc.createElement("label");label.className="animus-audio-language";
 var text=doc.createElement("span");text.textContent=da?"Lyd og tekst: ":"Audio and text: ";label.appendChild(text);
 var select=doc.createElement("select");select.setAttribute("aria-label",da?"Sprog for lyd og tekst":"Audio and text language");label.appendChild(select);
 choices.forEach(function(row){var option=doc.createElement("option");option.value=row.code;option.textContent=row.label||row.code;select.appendChild(option);});
 outer.appendChild(label);label.hidden=choices.length<2;
 var mount=doc.createElement("div");outer.appendChild(mount);
 var selected=this._chosenLanguage||(choices.find(function(v){return v.code===(da?"da":"en");})||choices[0]||{}).code;
 function api(){var child=self.children&&self.children[0];return child&&child.host&&child.host._platoPlayer;}
 function show(code,previous,wasPlaying){
  var row=choices.find(function(v){return v.code===code;}),film=row?row.film:title;
  // Keep the control alive when the old player (possibly in fullscreen) closes.
  outer.insertBefore(label,mount);
  (self.children||[]).forEach(function(child){if(child._shutdown)child._shutdown();child.removeChildDomNodes();});
  self.makeChildWidgets([{type:"plato-player",attributes:{film:{type:"string",value:film},label:{type:"string",value:self.getAttribute("label","AniMus")}},children:[]}]);
  self.renderChildren(mount,null);self._chosenLanguage=code;select.value=code;
  var child=self.children[0],host=child&&child.host,player=api();
  if(host){
   host.setAttribute("data-animus-audio-language",code||"");
   var toolbar=Array.prototype.find.call(host.childNodes||[],function(n){return n.className==="plato-options";});
   if(toolbar)toolbar.appendChild(label);
  }
  if(previous&&player){player.seek(correspondingTime(self.wiki,previous.timeline,player.getTimeline(),previous.time));if(wasPlaying)player.play();}
 }
 var handler=function(){
  var player=api(),host=self.children[0]&&self.children[0].host,wasPlaying=!!(host&&(host.getAttribute("data-plato-playing")==="true"||host.getAttribute("aria-busy")==="true"));
  var previous=player?{time:player.time(),timeline:player.getTimeline()}:null;
  if(player)player.pause();show(select.value,previous,wasPlaying);
 };
 if(select.addEventListener){select.addEventListener("change",handler);this._removeLanguageListener=function(){select.removeEventListener("change",handler);};}
 show(selected,null,false);
};
LanguagePlayer.prototype.onDestroy=function(){if(this._removeLanguageListener)this._removeLanguageListener();this._removeLanguageListener=null;};
LanguagePlayer.prototype.refresh=function(changed){
 var attrs=this.computeAttributes();
 if(Object.keys(attrs).length||changed[this.getAttribute("film","")]){this.refreshSelf();return true;}
 return this.refreshChildren(changed);
};
exports["animus-language-player"]=LanguagePlayer;
exports.correspondingTime=correspondingTime;
exports.languageVersions=versions;
})();
