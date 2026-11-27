/*\
title: $:/plugins/huwiki/repertoire/youtube-video.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var MATCH={original:'Originalindspilning / originalkunstner',early:'Tidlig indspilning',traditional:'Traditionel udgave',own:'Orkestrets egen optagelse',arrangement:'Arrangementmatch',likely:'Sandsynligt arrangement · ikke bekræftet',reference:'Lytteeksempel · arrangement ikke bekræftet',manual:'Valgt videolink'};
exports.mount=function(host,options){
 var doc=host.ownerDocument,clip=options.video||{},closed=false;
 function el(tag,cls,text){var n=doc.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;}
 var wrapper=el('section','huwrep-youtube'),frame=el('iframe','huwrep-youtube-frame');
 wrapper.setAttribute('aria-label','YouTube · '+options.title);
 // No automatic playback, no API script and no hidden second audio player.
 frame.src='https://www.youtube-nocookie.com/embed/'+clip.id+'?autoplay=0&playsinline=1&rel=0&start='+(clip.start||0);
 frame.title=clip.title||options.title+' · YouTube';frame.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');frame.setAttribute('allowfullscreen','');frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 wrapper.appendChild(frame);
 var caption=el('div','huwrep-youtube-caption');
 if(clip.title)caption.appendChild(el('strong','',clip.title));
 if(clip.match)caption.appendChild(el('span','huwrep-muted',MATCH[clip.match]||'Lytteeksempel'));
 if(clip.note)caption.appendChild(el('p','huwrep-muted',clip.note));
 var link=el('a','huwrep-button','Åbn på YouTube ↗');link.href='https://www.youtube.com/watch?v='+clip.id+(clip.start?'&t='+clip.start:'');link.target='_blank';link.rel='noopener noreferrer';caption.appendChild(link);
 caption.appendChild(el('small','huwrep-muted','Hvis videoen ikke kan afspilles her, kan du åbne den på YouTube.'));
 wrapper.appendChild(caption);host.appendChild(wrapper);
 return {element:wrapper,destroy:function(){if(closed)return;closed=true;frame.src='about:blank';wrapper.remove();}};
};
})();
