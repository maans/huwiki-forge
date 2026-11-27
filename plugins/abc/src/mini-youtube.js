/*\
title: $:/plugins/huwiki/abc/mini-youtube.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var apis=new WeakMap();
function loadApi(doc){
 var win=doc.defaultView;if(win.YT&&win.YT.Player)return Promise.resolve(win.YT);
 if(apis.has(win))return apis.get(win);
 var promise=new Promise(function(resolve,reject){
  var previous=win.onYouTubeIframeAPIReady;
  win.onYouTubeIframeAPIReady=function(){try{if(previous)previous();}finally{resolve(win.YT);}};
  var script=doc.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;
  script.onerror=function(){apis.delete(win);reject(Error("YouTube-styringen kunne ikke indlæses. Brug videoens egen afspilknap."));};doc.body.appendChild(script);
 });apis.set(win,promise);return promise;
}
function id(value){
 var text=String(value||"").trim(),match;
 if(/^[A-Za-z0-9_-]{11}$/.test(text))return text;
 if((match=/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#]|$)/i.exec(text)))return match[1];
 if((match=/^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/i.exec(text)))return match[1];
 if(/^https?:\/\/(?:(?:www|m|music)\.)?youtube\.com\/watch\?/i.test(text)&&(match=/[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(text)))return match[1];
 return "";
}
function work(wiki,title){
 var t=wiki&&wiki.getTiddler(title),seen={};
 while(t&&!seen[t.fields.title]){
  seen[t.fields.title]=true;
  var next=t.fields["repertoire-work-title"]||t.fields["music-title"];
  if(!next)break;
  t=wiki.getTiddler(next)||t;if(t.fields.title===next&&seen[next])break;
 }
 return t;
}
exports.video=function(wiki,title){var t=work(wiki,title),f=t&&t.fields||{};return {id:id(f["repertoire-youtube"]),title:f["repertoire-youtube-title"]||f.caption||f.title||title,start:Math.max(0,parseInt(f["repertoire-youtube-start"],10)||0),workTitle:f.title||title};};
exports.mount=function(host,options){
 var doc=host.ownerDocument,wiki=options.wiki,frame=null,player=null,ready=false,pendingPlay=false,playing=false,generation=0,closed=false,visible=false;
 function el(tag,text){var n=doc.createElement(tag);if(text)n.textContent=text;return n;}
 function state(value){playing=value;if(options.onState)options.onState(value);}
 function stop(){generation++;ready=false;pendingPlay=false;if(player){try{player.destroy();}catch(ignore){}player=null;}if(frame){frame.src="about:blank";frame.remove();frame=null;}state(false);}
 function draw(){
  stop();host.textContent="";
  var clip=exports.video(wiki,options.title);
  if(clip.id&&visible){
   frame=el("iframe");frame.className="huwabc-mini-youtube-frame";frame.title=clip.title+" · YouTube";
   frame.src="https://www.youtube-nocookie.com/embed/"+clip.id+"?enablejsapi=1&autoplay=0&playsinline=1&rel=0&origin="+encodeURIComponent(doc.defaultView.location&&doc.defaultView.location.origin||"")+"&start="+clip.start;
   frame.style.cssText="width:100%;aspect-ratio:16/9;min-height:200px;border:0";
   frame.setAttribute("allow","autoplay; encrypted-media; picture-in-picture; fullscreen");frame.setAttribute("allowfullscreen","");frame.setAttribute("referrerpolicy","strict-origin-when-cross-origin");host.appendChild(frame);
   var token=generation,target=frame;
   loadApi(doc).then(function(YT){
    if(closed||!visible||token!==generation)return;
    player=new YT.Player(target,{events:{onReady:function(){if(token!==generation)return;ready=true;if(pendingPlay){pendingPlay=false;player.playVideo();}},onStateChange:function(event){if(token!==generation)return;if(event.data===1&&options.onPlay)options.onPlay();state(event.data===1||event.data===3);},onError:function(){if(token!==generation)return;state(false);host.appendChild(el("p","Videoen kan ikke afspilles her. Brug linket til YouTube."));}}});
   }).catch(function(error){if(!closed&&token===generation)host.appendChild(el("p",error.message));});
   var link=el("a","Åbn på YouTube ↗");link.href="https://www.youtube.com/watch?v="+clip.id;link.target="_blank";link.rel="noopener noreferrer";host.appendChild(link);
  }else if(!clip.id)host.appendChild(el("p","Der er endnu ikke knyttet en YouTube-video til dette nummer."));
  var edit=el("details"),summary=el("summary",clip.id?"Skift YouTube-video":"Tilføj YouTube-video");edit.appendChild(summary);
  var input=el("input");input.type="url";input.placeholder="https://www.youtube.com/watch?v=…";input.setAttribute("aria-label","YouTube-link til nummeret");input.style.cssText="width:100%;box-sizing:border-box";
  if(clip.id)input.value="https://www.youtube.com/watch?v="+clip.id;
  var save=el("button","Gem videolink"),message=el("p");save.type="button";message.setAttribute("role","status");
  save.addEventListener("click",function(){
   var videoId=id(input.value),t=work(wiki,options.title);
   if(!videoId){message.textContent="Indsæt et gyldigt link til én YouTube-video.";return;}
   if(!t||!wiki.addTiddler){message.textContent="Videolinket kan ikke gemmes her.";return;}
   wiki.addTiddler(new $tw.Tiddler(t,{"repertoire-youtube":"https://www.youtube.com/watch?v="+videoId,"repertoire-youtube-match":"manual","repertoire-youtube-title":"","repertoire-youtube-note":"","repertoire-youtube-start":""}));draw();
  });
  edit.appendChild(input);edit.appendChild(save);edit.appendChild(message);host.appendChild(edit);
 }
 return {show:function(){if(closed)return;visible=true;draw();},hide:function(){visible=false;stop();},toggle:function(){if(closed||!visible)return false;if(!ready){pendingPlay=!pendingPlay;return true;}if(playing)player.pauseVideo();else player.playVideo();return true;},stop:stop,refresh:function(){if(visible&&!closed)draw();},destroy:function(){closed=true;stop();host.textContent="";}};
};
exports.id=id;
})();
