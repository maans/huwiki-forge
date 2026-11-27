/*\
title: $:/plugins/huwiki/abc/site-publisher.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var ScoreView=require('$:/plugins/huwiki/abc/score-view.js');
function escapeJson(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function safeScript(value){return String(value).replace(/<\/script/gi,'<\\/script');}
function attr(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function safeUrl(value,local){
 try{var url=new URL(String(value||''));if(url.username||url.password)return '';return /^(https?:)$/.test(url.protocol)||local&&url.protocol==='file:'?url.href:'';}catch(ignore){return '';}
}
// One fixed parent helper is shared by static exports, Site builder previews
// and the hosted reader. Published content never supplies executable helpers.
function frameSupportRuntime(){
 'use strict';
 if(window.HUWAbcSiteFrames){window.HUWAbcSiteFrames.mount(document);return;}
 var frames=[];
 function selected(root){var out=[];if(root&&root.matches&&root.matches('iframe[data-huwiki-abc-frame]'))out.push(root);if(root&&root.querySelectorAll)out=out.concat(Array.prototype.slice.call(root.querySelectorAll('iframe[data-huwiki-abc-frame]')));return out;}
 function validUrl(value){try{var u=new URL(String(value||''));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(ignore){return '';}}
 function send(frame,data){try{if(frame.contentWindow)frame.contentWindow.postMessage(data,'*');}catch(ignore){}}
 function config(entry){send(entry.frame,{type:'huwiki-abc-frame-config',version:1,shareUrl:entry.preview?'':entry.shareUrl,preview:entry.preview});}
 function prune(){frames=frames.filter(function(entry){if(entry.frame.isConnected)return true;send(entry.frame,{type:'huwiki-abc-frame-stop',version:1});entry.frame.removeEventListener('load',entry.load);return false;});}
 function mount(root,options){
  options=options||{};prune();selected(root||document).forEach(function(frame){
   var entry=frames.find(function(item){return item.frame===frame;}),preview=options.preview===true||frame.getAttribute('data-huwabc-preview')==='yes';
   var url=validUrl(options.shareUrl||frame.getAttribute('data-huwabc-share-url')||location.href);
   if(!entry){entry={frame:frame};entry.load=function(){config(entry);};frame.addEventListener('load',entry.load);frames.push(entry);}
   entry.preview=preview;entry.shareUrl=url;config(entry);
  });
 }
 function stop(root){selected(root||document).forEach(function(frame){send(frame,{type:'huwiki-abc-frame-stop',version:1});});}
 function dispose(root){var targets=selected(root||document);stop(root);frames=frames.filter(function(entry){if(targets.indexOf(entry.frame)<0)return true;entry.frame.removeEventListener('load',entry.load);return false;});}
 window.addEventListener('message',function(event){
  var data=event.data;if(!data||data.version!==1||data.type!=='huwiki-abc-frame-height')return;
  prune();var entry=frames.find(function(item){return item.frame.contentWindow===event.source;});if(!entry)return;
  if(typeof data.height!=='number'||!Number.isFinite(data.height)||data.height<1||data.height>24000)return;
  var minimum=entry.frame.getAttribute('data-huwabc-minimal')==='yes'?40:240;
  var height=Math.max(minimum,Math.ceil(data.height));if(entry.frame.style.height!==height+'px')entry.frame.style.height=height+'px';config(entry);
 });
 window.addEventListener('pagehide',function(){frames.forEach(function(entry){send(entry.frame,{type:'huwiki-abc-frame-stop',version:1});});});
 document.addEventListener('visibilitychange',function(){if(document.hidden)frames.forEach(function(entry){send(entry.frame,{type:'huwiki-abc-frame-stop',version:1});});});
 window.HUWAbcSiteFrames={mount:mount,stop:stop,dispose:dispose};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){mount(document);});else mount(document);
}
function frameSupport(){return '('+frameSupportRuntime.toString()+')();';}
function embeddedRuntime(){
 if((!DATA.embedded&&!DATA.preview)||window.parent===window)return;
 var scheduled=false,last=-1;
 function height(){scheduled=false;var main=document.querySelector('main');if(!main)return;var value=Math.ceil(Math.max(main.scrollHeight,main.getBoundingClientRect().height));if(value===last)return;last=value;window.parent.postMessage({type:'huwiki-abc-frame-height',version:1,height:Math.max(240,value)},'*');}
 function schedule(){if(!scheduled){scheduled=true;window.requestAnimationFrame(height);}}
 window.addEventListener('message',function(event){
  var data=event.data;if(event.source!==window.parent||!data||data.version!==1)return;
  if(data.type==='huwiki-abc-frame-stop'){stopAllSound();return;}
  if(data.type!=='huwiki-abc-frame-config')return;
  parentShareUrl='';if(!data.preview){try{var url=new URL(String(data.shareUrl||''));if(/^https?:$/.test(url.protocol)&&!url.username&&!url.password)parentShareUrl=url.href;}catch(ignore){}}
  if(shareModal.open||shareModal.hasAttribute('open'))shareInfo();
 });
 window.addEventListener('resize',schedule);
 if(typeof ResizeObserver==='function'){var observer=new ResizeObserver(schedule);observer.observe(document.querySelector('main'));window.addEventListener('pagehide',function(){observer.disconnect();});}
 else {var observer=new MutationObserver(schedule);observer.observe(document.querySelector('main'),{childList:true,subtree:true,attributes:true});window.addEventListener('pagehide',function(){observer.disconnect();});}
 schedule();
}
function scoreData(wiki,source,fields,title,options){
 options=options||{};
 var langTiddler=wiki.getTiddlerText('$:/language','');
 var activePlugin=wiki&&wiki.getTiddler&&wiki.getTiddler(langTiddler);var langDefault=/(?:\/|\b)da(?:[-_]|$)/i.test(langTiddler)&&!!(activePlugin&&activePlugin.fields&&activePlugin.fields['plugin-type']==='language')?'da':'en';
 var settings={};try{settings=JSON.parse(fields['abc-accompaniment']||'{}')||{};}catch(_ignore){}
 var soundFont=wiki.getTiddlerText('$:/config/huwiki/abc/soundfont','https://paulrosen.github.io/midi-js-soundfonts/abcjs/').trim();
 var reserveBase=wiki.getTiddlerText('$:/config/huwiki/abc/reserve-base','').trim();
 var engineMode=wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto').trim();
 var data={source:source,title:title,titleFields:{title:fields.title||title,'huwiki-score-title-source':fields['huwiki-score-title-source']||'','huwiki-score-title-da':fields['huwiki-score-title-da']||'','huwiki-score-title-en':fields['huwiki-score-title-en']||''},titleDa:fields['huwiki-title-da']||title,titleEn:fields['huwiki-title-en']||title,langDefault:langDefault,config:settings,soundFont:soundFont,reserveBase:reserveBase,engineMode:engineMode,fields:{'abc-rhythm':fields['abc-rhythm']||'','abc-style':fields['abc-style']||'','abc-genre':fields['abc-genre']||'','abc-origin-library':fields['abc-origin-library']||'','abc-bars-per-line':fields['abc-bars-per-line']||'0'}};
 ['abc-parts-new-line','abc-paper-size','abc-page-margin','abc-font','abc-tabs','abc-tabs-config','abc-show-notes','abc-layout','abc-lines-per-page'].forEach(function(key){data.fields[key]=fields[key]||'';});
 data.fields['abc-chords-style']=fields['abc-chords-style']||wiki.getTiddlerText('$:/config/huwiki/abc/chords-style','jazz');
 data.siteHeading=typeof options.siteHeading==='string'?options.siteHeading.trim().slice(0,180):'TiddlyWiki Musik Edition';
 data.showSiteHeading=options.showSiteHeading!==false&&!!data.siteHeading;
 data.startDesk=options.startDesk!==false;
 data.embedded=options.embedded===true;data.preview=options.preview===true;data.shareUrl=safeUrl(options.shareUrl,false);
 return data;
}
function exporter(wiki,source,fields,title,options){
 options=options||{};
 // Being inside an iframe is independent of a score's minimal/full choice.
 var scoreView=ScoreView.resolve(Object.assign({},options,{embedded:false}),fields);
 if(scoreView.minimal)return require('$:/plugins/huwiki/abc/minimal-publisher.js').build(wiki,source,fields,title,Object.assign({},options,{view:'minimal',audio:scoreView.audio,'show-title':scoreView.showTitle}));
 // The standalone export carries the same pinned notation library and CSS.
 var abcjs=wiki.getTiddlerText('$:/plugins/huwiki/abc/vendor/abcjs.js');
 var abcjsCss=wiki.getTiddlerText('$:/plugins/huwiki/abc/vendor/abcjs-audio.css');
 var abcjsLicense=wiki.getTiddlerText('$:/plugins/huwiki/abc/vendor/abcjs-LICENSE','');
 var abcjsNotices=wiki.getTiddlerText('$:/plugins/huwiki/abc/vendor/abcjs-bundled-LICENSE','')+'\n\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/Petaluma-license','')+'\n\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/tinysynth-LICENSE','');
 if(!abcjs||!abcjsCss)throw new Error('Indlejret ABCJS eller afspillerens CSS mangler.');
 var names=['keyboard-shortcuts','page-view','print-export','jazz-font','tabs','editor-model','tab-rhythm','tabs-only','notation','i18n','repeat-button','jazz-engine','balkan7','meter-map','meter-arranger','voice-routing','voice-controls','repeat-plan','repeat-playback','repeat-controls','transpose','instrument-view','accompaniment','voice-names','engraving-rules','sheet-layout','piano','piano-follow','chord-keys','audition','display-source','floating-piano','start-position','loader','playback','playback-feedback','audio-controller','sound-help','audio-sequence','fluid-renderer','reserve-runtime','reserve-mixer','tinysynth-core','tinysynth-renderer'];
 var moduleSources={};
 names.forEach(function(name){var title='$:/plugins/huwiki/abc/'+name+'.js',text=wiki.getTiddlerText(title);if(!text)throw new Error('Et modul til Site-afspilleren mangler: '+title);moduleSources[title]=text;});
 // Keep the standalone site's CommonJS graph in sync with the wiki modules.
 // New static dependencies must never leave the entire player blank at startup.
 var queue=Object.keys(moduleSources),seen=Object.create(null);
 queue.forEach(function(key){seen[key]=true;});
 for(var depIndex=0;depIndex<queue.length;depIndex++){
  var parent=queue[depIndex],code=moduleSources[parent];
  var dependencyRe=/require\s*\(\s*['\"](\$:\/plugins\/huwiki\/abc\/[a-z0-9-]+\.js)['\"]\s*\)/gi,match;
  while((match=dependencyRe.exec(code))!==null){
   var requested=match[1];if(seen[requested])continue;
   var dependency=wiki.getTiddlerText(requested);
   if(!dependency)throw new Error('Site-afspiller mangler afhængighed '+requested+' (krævet af '+parent+')');
   seen[requested]=true;moduleSources[requested]=dependency;queue.push(requested);
  }
 }
 var symbols='$:/plugins/huwiki/abc/rhythm-symbols.json';moduleSources[symbols]='module.exports='+wiki.getTiddlerText(symbols,'{}')+';';
 var data=scoreData(wiki,source,fields,title,options),langDefault=data.langDefault;
 var base=safeUrl(options.baseUrl,true);
 var style=`
:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f9f7;color:#19362e;color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;padding:clamp(0px,2vw,24px)}button,input,select{font:inherit;accent-color:#277866}button{cursor:pointer}main{max-width:1050px;margin:0 auto;background:#fff;border:1px solid #e1e8e2;border-radius:14px;padding:clamp(10px,2.8vw,28px);box-shadow:0 12px 38px #24453712}
.site-header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.site-overline{font-size:11px;letter-spacing:.15em;font-weight:750;color:#4c7a6d;text-transform:uppercase}h1{font-size:clamp(20px,3vw,29px);line-height:1.2;margin:6px 0 5px;font-weight:700}.sub{font-size:12px;color:#71867e}
#paper{overflow:auto;width:100%;padding:16px 0 4px}#paper svg{max-width:100%;height:auto}#paper .site-active-note,#paper .site-active-note *{fill:#ce4e38!important;stroke:#ce4e38!important}#paper .site-playhead{stroke:#18a0a1;stroke-width:2.8;pointer-events:none;opacity:.9}
.player-bar{margin:2px 0 12px;padding:8px 9px;background:#f0f7f3;border:1px solid #d6e6dc;border-radius:12px;display:flex;gap:10px;align-items:center}.player-bar #audio{flex:1;min-width:0}.player-bar .abcjs-inline-audio{background:transparent!important;color:#194d3d!important;max-width:100%;padding:0!important;min-height:34px;height:auto;display:flex;align-items:center;gap:6px}.player-bar .abcjs-btn{cursor:pointer;border-radius:8px;opacity:1!important;background:#fff!important;border:1px solid #cbded1!important;min-height:32px;min-width:32px;height:32px;width:32px;box-sizing:border-box}.player-bar .abcjs-midi-start{background:#26725d!important;border-color:#26725d!important;color:white!important}.player-bar .abcjs-midi-loop.abcjs-pushed,.player-bar .abcjs-midi-loop[aria-pressed="true"]{background:#217b62!important;border-color:#185d4a!important;color:#fff!important;box-shadow:0 0 0 2px #1d895033!important}.player-bar .abcjs-midi-loop.abcjs-pushed svg,.player-bar .abcjs-midi-loop[aria-pressed="true"] svg{fill:currentColor!important;color:#fff!important}.player-bar .abcjs-midi-progress-background{flex:1;min-width:70px;height:8px;border-radius:5px;background:#d0e2d6;margin:0 3px;cursor:pointer}.player-bar .abcjs-midi-progress-indicator{background:#2d856c;border:2px solid white;width:15px;height:15px;top:-4px}.player-bar .abcjs-midi-clock{font-size:12px;white-space:nowrap;color:#3a5b4e}.player-bar .abcjs-css-warning{display:none!important}
.primary-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:11px;align-items:end;padding:6px 0 8px}.field{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:580;color:#385e51;min-width:0}.field select,.field input[type=number]{width:100%;min-width:0}.field input[type=range]{width:100%}select,input[type=text],input[type=number]{color:#183c31!important;-webkit-text-fill-color:#183c31;background:#fff!important;border:1px solid #bfd6c8;border-radius:8px;min-height:36px;padding:7px 8px}select option{color:#183c31;background:#fff}select:focus-visible,input:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #248a73;outline-offset:2px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.switches{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:12px 0 8px}.switches label{display:inline-flex;align-items:center;gap:6px;font-size:13px}.switches input{width:16px;height:16px}
button{border:1px solid #b8d3c3;border-radius:9px;background:#fff;color:#245b49;padding:7px 11px;font-size:13px;font-weight:650}button:hover{background:#eff9f1}button.primary{background:#286f5c;color:#fff;border-color:#286f5c}button:disabled{opacity:.5;cursor:not-allowed}
.more{border-top:1px solid #e7eee8;padding:10px 0;margin-top:3px}.more summary{font-size:13px;font-weight:700;cursor:pointer;color:#28644f}.more[open] summary{margin-bottom:12px}.more-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px}.mixer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:9px}.mix-channel{border:1px solid #d6e8dd;border-radius:10px;background:#f7faf7;padding:10px}.mix-channel h3{font-size:12px;display:flex;justify-content:space-between;margin:0 0 7px}.mix-channel h3 output{font-weight:500;color:#53786a}.mix-channel input[type=range]{display:block;width:100%;margin:7px 0 12px}.mix-channel .field{font-size:11px}.mix-channel .field select{width:100%;font-size:12px}
#status{min-height:20px;font-size:12px;color:#55756a;margin:14px 0 0}.footnote{font-size:11px;color:#829489;margin:18px 0 0}.muted{font-size:12px;color:#72897a}.share-btn{white-space:nowrap;flex:none}.share-modal{border:1px solid #cdded4;border-radius:16px;max-width:min(560px,94vw);width:100%;padding:24px;color:#1a4236;box-shadow:0 30px 65px #081e1833}.share-modal::backdrop{background:#142b2466}.share-modal h2{margin:0 0 6px;font-size:22px}.share-modal p{font-size:13px;color:#527263}.share-modal label{display:block;font-weight:650;font-size:12px;margin:18px 0 7px}.share-modal textarea,.share-modal input{width:100%;border:1px solid #bdd5c7;background:#f8faf8;border-radius:8px;color:#1a4336;padding:10px;font:12px/1.5 ui-monospace,monospace}.share-modal textarea{min-height:92px;resize:vertical}.share-modal .modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
body.embedded{padding:0;background:#fff;min-height:0}body.embedded main{border:0;box-shadow:none;border-radius:0;margin:0;max-width:none}body.embedded .site-header{display:flex;justify-content:flex-end;border:0;padding:0 0 8px}body.embedded .brandline,body.embedded .footnote{display:none}
body.embedded .share-modal{position:absolute;left:50%;right:auto;bottom:auto;margin:0;transform:translateX(-50%);max-height:560px;overflow:auto}
@media(max-width:640px){main{padding:12px;border:0;border-radius:0;box-shadow:none}.player-bar{gap:5px;padding:7px 5px}.player-bar .abcjs-midi-clock{font-size:11px}.player-bar .abcjs-midi-progress-background{min-width:48px}.primary-row{grid-template-columns:repeat(2,minmax(0,1fr))}.mix-channel{padding:8px}.share-btn{padding:7px}.player-bar .abcjs-btn{min-width:28px;width:28px;height:30px}}
@media print{body{padding:0;background:#fff}main{box-shadow:none;border:0}.player-bar,.primary-row,.more,.site-header .share-btn,.switches,.share-modal,#status,.footnote{display:none!important}}

/* HUWiki 0.3.2 · Reader-first publication with progressive disclosure */
body{background:radial-gradient(circle at 0% 0%,#e9f5ee 0%,transparent 44%),linear-gradient(165deg,#f9fbf8,#f2f6f2);min-height:100vh}
main{max-width:1060px;box-shadow:0 15px 55px rgba(26,55,43,.075);border-color:#deebe2;padding:clamp(15px,3vw,34px);border-radius:18px}
.site-header{padding:0 0 16px;border-bottom:1px solid #e5eee7}.brandline{display:flex;gap:13px;align-items:center;min-width:0}
.brandmark{width:36px;height:36px;border-radius:11px;background:#176e5d;color:white;display:grid;place-items:center;font-size:22px;font-weight:800;line-height:1;box-shadow:0 3px 10px #175e4420;flex:none}
h1{font-size:clamp(22px,3vw,32px);letter-spacing:-.026em;margin:3px 0 3px}
.site-overline{font-size:12px;letter-spacing:.025em;text-transform:none;overflow-wrap:anywhere}.sub{color:#71827a}
#paper{padding:16px 0 6px;min-height:120px}#paper svg{display:block;width:100%;height:auto;overflow:visible}
#paper .abcjs-chord{cursor:pointer}#paper .abcjs-chord:hover{fill:#07826d!important}#paper .site-chord-selected{fill:#118d78!important}
.player-bar{margin:4px 0 14px;border-radius:12px;background:#eff7f3;border-color:#d6e9dc}
.primary-row{grid-template-columns:1.1fr 1fr 1.3fr;gap:12px}.switches{margin-top:0;border-top:1px solid #e6efe8;gap:24px}
.more{border-top:1px solid #e6eee7;margin-top:2px;padding:12px 0}.more summary{font-size:13px;font-weight:700;list-style:none;position:relative;padding-right:20px}
.more summary::-webkit-details-marker{display:none}.more summary:after{content:'＋';position:absolute;right:2px;top:-2px;color:#367b66;font-size:18px;font-weight:400}.more[open] summary:after{content:'−'}
.learn-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:6px}
.learn-grid>details{border:1px solid #dfebe4;border-radius:12px;background:#fbfdfb;padding:11px 14px;margin:0}
.learn-grid>details[open]{background:#fff;grid-column:span 2;box-shadow:0 4px 18px #1a4e3111}
.learn-grid .more{border-top:0}.learn-grid .more summary{font-size:13px}
#pianoHost{margin:12px 0 0}.learn-hint{margin:12px 0 6px;color:#668074;font-size:12px;line-height:1.6}
#sourceCode{margin:12px 0;border:1px solid #d9e7df;border-radius:10px;padding:14px 16px;overflow:auto;white-space:pre;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;color:#25483d;background:#f5f9f6;max-height:340px}
.abc-actions{display:flex;gap:8px;flex-wrap:wrap}.abc-actions button{background:#fff}
.piano-info{font-size:12px;color:#497261;margin-top:5px;min-height:17px}
/* Shared HUWiki piano module, with a site-specific calm finish */
.huwabc-piano{width:100%;max-width:100%;padding:2px 0 0;color:#244b42}
.huwabc-piano-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:center;font:12px system-ui;margin:3px 0 12px}
.huwabc-piano-settings{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.huwabc-piano-settings label{display:flex;gap:5px;align-items:center;white-space:nowrap}
.huwabc-piano-select{font:12px system-ui!important;background:#fff!important;color:#234e45!important;border:1px solid #c5dcd1;border-radius:7px;padding:4px 6px;min-height:30px}
.huwabc-keys{position:relative;height:120px;max-width:100%;user-select:none;touch-action:manipulation;border:1px solid #acbeb4;border-radius:9px;overflow:hidden;background:#fafafa}
.huwabc-white-key{position:absolute;top:0;bottom:0;border-radius:0 0 5px 5px;border:1px solid #bac7bf;border-top:0;background:#fff;color:#264d42;padding:0;cursor:pointer;touch-action:manipulation}
.huwabc-white-key:hover,.huwabc-white-key.huwabc-key-active{background:#a5e7c5}
.huwabc-black-key{position:absolute;top:0;height:59%;border:1px solid #17201a;border-radius:0 0 5px 5px;background:#25352f;color:#fff;padding:0;z-index:2;cursor:pointer;touch-action:manipulation}
.huwabc-black-key:hover,.huwabc-black-key.huwabc-key-active{background:#198d71}
.huwabc-piano-name{position:absolute;bottom:5px;left:0;right:0;text-align:center;font:10px/1 system-ui;white-space:nowrap;pointer-events:none;letter-spacing:-.5px}
.huwabc-black-key .huwabc-piano-name{font-size:8px}
body.embedded{background:#fff}body.embedded main{padding:clamp(8px,2vw,20px)}
@media(max-width:700px){.primary-row{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-row>.field:last-child{grid-column:span 2}.learn-grid{grid-template-columns:1fr}.learn-grid>details[open]{grid-column:span 1}.site-header{gap:12px}.brandmark{width:32px;height:32px}.huwabc-keys{height:100px}.huwabc-piano-settings{gap:6px}}
@media print{.learn-grid{display:none!important}}
`;
 style+=`
/* v0.3.3 – floating klaviatur follows the currently played staff */
.huwabc-floating-keyboard{position:fixed;z-index:10020;max-width:calc(100vw - 24px);padding:10px 12px 12px;border-radius:14px;border:1px solid #bdd9cc;background:rgba(250,253,251,.97);color:#21483c;box-shadow:0 15px 48px rgba(22,55,45,.23);backdrop-filter:blur(10px)}
.huwabc-floating-keyboard[hidden]{display:none!important}.huwabc-floating-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;font:12px system-ui}.huwabc-floating-header button{padding:3px 9px}
.huwabc-floating-keyboard .huwabc-keys{height:86px}.huwabc-floating-keyboard .huwabc-piano-toolbar{margin:0 0 5px}.huwabc-floating-keyboard .huwabc-piano-toolbar>strong{display:none}.huwabc-floating-keyboard .huwabc-piano-settings{gap:7px}@media(max-width:620px){.huwabc-floating-keyboard .huwabc-keys{height:65px}}@media print{.huwabc-floating-keyboard{display:none!important}}
`;
 style+=`
/* v0.3.5 · startpoint selected by note or chord without toolbar clutter */
#paper .site-cue-selected,#paper .site-cue-selected *{fill:#1d84ac!important;stroke:#1d84ac!important}
#paper .site-cue-selected.abcjs-chord,#paper .site-cue-selected.abcjs-chord *{stroke:none!important}
`;
 style+='\n.huwabc-engine-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;margin:10px 0;font-size:12px}.huwabc-engine-select{min-height:30px;font-size:12px;max-width:100%;padding:4px 8px}.huwabc-engine-summary{font-size:11px;opacity:.75;font-weight:400}.huwabc-engine-explanation{font-size:11px;line-height:1.4}.huwabc-sound-help{font-size:12px;color:#385e51;margin-bottom:10px}.huwabc-audio-troubleshooting>summary{font-weight:650;cursor:pointer}.huwabc-sound-help .huwabc-actions{display:flex;gap:8px;flex-wrap:wrap}.huwabc-sound-help p{line-height:1.5}.huwabc-reserve-notice{padding:7px 9px;background:#f0f7f3;border-radius:7px;margin-bottom:7px}.huwabc-reserve-notice.huwabc-error{color:#a83232}.huwabc-sound-diagnostic{margin-top:9px}.huwabc-sound-report{font-size:11px}';
 style+='\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/voice-controls.css','')+'\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/repeat-controls.css','');
 style+='\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/page-view.css','')+'\n'+wiki.getTiddlerText('$:/plugins/huwiki/abc/minimal-player.css','');
 style+='\n.site-instrument-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:10px 0 4px;padding:8px 10px;border:1px solid #d9e8df;border-radius:11px;background:#f7fbf7}.site-instrument-row .huwabc-instrument-group{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.site-instrument-row .huwabc-instrument-buttons{display:inline-flex;gap:4px}.site-instrument-row .huwabc-instrument-option{border:1px solid #b9d5c5;border-radius:8px;padding:6px 10px;background:#fff;color:#245645;font-size:13px;font-weight:650}.site-instrument-row .huwabc-instrument-option[aria-pressed=true]{background:#176e5d;color:#fff}.site-instrument-row .huwabc-instrument-legend{font-size:13px;font-weight:600}.site-instrument-row .huwabc-instrument-hint{font-size:11px;color:#527467}.site-print-btn{padding:7px 12px;border:1px solid #a6ccba;background:#fff;border-radius:9px;color:#176e5d;font-weight:650;font-size:13px}@media(max-width:600px){.site-instrument-row .huwabc-instrument-group{flex:1}.site-instrument-row .huwabc-instrument-hint{flex-basis:100%}}';
 style+='\n.huwabc-page-is-desk #instrumentBar .huwabc-instrument-group{flex-wrap:wrap;align-items:center;gap:4px}.huwabc-page-is-desk #instrumentBar .huwabc-instrument-hint{display:none}.huwabc-page-is-desk #instrumentBar{margin:0 5px}.huwabc-page-is-desk #instrumentBar .huwabc-instrument-option{min-height:27px;padding:4px 7px}.huwabc-page-is-desk .site-print-btn{padding:5px 8px;min-height:28px;white-space:nowrap}.huwabc-page-is-desk .huwabc-page-toolbar{align-items:center}';
 var app=`(function(){'use strict';
 const DATA=${escapeJson(data)};
 let parentShareUrl='';
 window.HUWMusicSiteLanguage=DATA.langDefault==='da'?'da':'en';
 const I18n=window.HUWI18n;
 const PageView=window.HUWPageView,Shortcuts=window.HUWShortcuts;
 const PlaybackFeedback=window.HUWPlaybackFeedback,AudioController=window.HUWAudioController,SoundHelp=window.HUWSoundHelp,Reserve=window.HUWReserve,Playback=window.HUWPlayback;
 const C=window.HUWAcc, ABC=window.ABCJS, Transpose=window.HUWTranspose, InstrumentView=window.HUWInstrumentView, JazzFont=window.HUWJazzFont, Tabs=window.HUWTabs, Keys=window.HUWKeys, Chords=window.HUWChordKeys, Audition=window.HUWAudition, Display=window.HUWDisplay, Floating=window.HUWFloatingPiano, Start=window.HUWStartPosition;
 const $=id=>document.getElementById(id);
 const locale=I18n.observe(document.body);
 document.documentElement.lang=window.HUWMusicSiteLanguage;
 function titleInLanguage(){return I18n.scoreTitle(DATA.titleFields,window.HUWMusicSiteLanguage,DATA.source);}
 function localiseTitle(){document.title=titleInLanguage()+(DATA.showSiteHeading?' · '+DATA.siteHeading:'');$('title').textContent=titleInLanguage();$('siteHeading').textContent=DATA.siteHeading;$('siteHeading').hidden=!DATA.showSiteHeading;}
 let source=DATA.source,cfg=C.clean(Object.assign({enabled:true,metronome:false,style:'auto',variation:35,feel:'form'},DATA.config)),controller=null,generation=0,activeNotes=[],cursorLine=null,voicePanel=null,repeatPanel=null;
 const drone=C.createDrone(()=>cfg,()=>source);
 const pager=PageView.mount($('paper'),{audio:true,title:DATA.title,transport:()=>document.querySelector('.player-bar'),onDesk:function(stand){
  floatingPiano.hide();
  // Keep C / B♭ / E♭ visible even in full-screen music-stand mode.
  const controls=$('instrumentBar'),original=document.querySelector('.site-instrument-row'),toolbar=document.querySelector('.huwabc-page-toolbar');
  if(!controls||!original||!toolbar)return;
  var printButton=$('printScore');
  if(stand){toolbar.insertBefore(controls,toolbar.querySelector('.huwabc-page-desk'));toolbar.insertBefore(printButton,toolbar.querySelector('.huwabc-page-desk'));}
  else {original.appendChild(controls);original.appendChild(printButton);}
 }});
 let firstDeskOpen=false;
 // The standalone player exposes only the read-only audio configuration needed
 // by the same controller/reserve modules as the wiki.
 const audioConfig={getTiddlerText:function(title,fallback){if(title==='$:/config/huwiki/abc/soundfont')return DATA.soundFont;if(title==='$:/config/huwiki/abc/reserve-base')return DATA.reserveBase;if(title==='$:/config/huwiki/abc/audio-engine-mode')return DATA.engineMode||'auto';return fallback===undefined?'':fallback;}};
 const soundHelp=SoundHelp.mount($('soundHelp'),{
  getEngineMode:function(){return DATA.engineMode||'auto';},
  onEngine:function(mode){DATA.engineMode=mode;Reserve.stopAuditions();if(controller)controller.setEngineMode(mode);status('');}
 });
 function audioError(error){if(error&&error.name==='AbortError')return;soundHelp.error(error);status('Lyd kunne ikke klargøres. Åbn Lydproblemer.',true);}
 function audioStatus(value){soundHelp.update(value);if(value&&value.phase==='ready')status('Klar til afspilning.');}
 function audition(notes,tune){return controller?controller.audition(notes,tune):Audition.play(ABC,notes,tune,{wiki:audioConfig,getConfig:()=>cfg,onStatus:soundHelp.update});}
 function stopAllSound(){pager.setPlaying(false);Reserve.stopAuditions();Playback.stopAll();drone.stop();syncDrone();playing=false;clearFollow(true);}
 window.addEventListener('pagehide',stopAllSound);
 window.addEventListener('message',function(event){if(event.source===window.parent&&event.data&&event.data.type==='huwiki-sitepublisher-stop')stopAllSound();});
 document.addEventListener('visibilitychange',function(){if(document.hidden)stopAllSound();});
 $('stopPlayback').addEventListener('click',function(){clearCue();stopAllSound();});
 const keyboard=Keys.mountKeyboard($('pianoHost'),{isView:true,startOctave:4,showNames:false,lang:'auto',getLanguage:()=>window.HUWMusicSiteLanguage,onKey:midi=>audition([midi],activeVisual).catch(audioError)});
 const pianoFollow=window.HUWPianoFollow.mount(keyboard,{getLanguage:()=>window.HUWMusicSiteLanguage,caption:$('pianoInfo')});
 const floatingPiano=Floating.create($('pianoPanel'),$('pianoHost'));
 const followScroller=Floating.createScroller();
 let playing=false,activeVisual=null,renderedSource=null,audioRevision=0;
 let selectedChord=null,pendingStart=null,cuedElement=null,cueDataReady=false;
 function ensureCueData(){if(!cueDataReady&&activeVisual){activeVisual.setUpAudio({chordsOff:true});cueDataReady=true;}}
 function clearCue(){if(cuedElement&&cuedElement.classList)cuedElement.classList.remove('site-cue-selected');cuedElement=null;pendingStart=null;}
 function cue(sourceChar,target,milliseconds){
  if(!activeVisual)return;
  ensureCueData();
  const where=Start.find(activeVisual,sourceChar,target,milliseconds);
  if(!where)return;
  if(cuedElement&&cuedElement.classList)cuedElement.classList.remove('site-cue-selected');
  cuedElement=target&&target.closest&&(target.closest('.abcjs-note,.abcjs-chord')||target);
  if(cuedElement&&cuedElement.classList)cuedElement.classList.add('site-cue-selected');
  pendingStart=where.milliseconds;
  if(controller&&(playing||controller.isStarted||controller.isLoading)){try{controller.pause();}catch(_ignored){}playing=false;drone.stop();syncDrone();clearFollow(false);}
 }
 function useCue(){if(pendingStart===null)return; if(Start.seek(controller,activeVisual,pendingStart))clearCue();}
 $('pianoInfo').textContent='Følg melodien under afspilning eller klik på en becifring i nodearket.';
 function showSource(){$('sourceCode').textContent=source;}showSource();
 localiseTitle();
 if(DATA.embedded||new URLSearchParams(location.search).get('embed')==='1'){document.body.classList.add('embedded');const topShare=$('shareButton').cloneNode(true);topShare.id='shareTop';$('shareButton').parentNode.appendChild(topShare);$('audio').parentNode.appendChild($('shareButton'));}
 function status(message,error){$('status').textContent=message||'';$('status').style.color=error?'#a83232':'#55756a';}
 function optionList(element,items){items.forEach(item=>{const o=document.createElement('option');o.value=item[0];o.textContent=item[1];element.appendChild(o);});}
 function refreshAudio(){
  if(!controller||!activeVisual){render();return;}
  const current=controller,stamp=++audioRevision;cueDataReady=false;
  Playback.stopOne(current);current.visualObj=null;current.disable(true);clearCue();clearFollow(true);playing=false;
  try{
   const arrangement=C.prepare(ABC,activeVisual,source,cfg,true,DATA.fields);
   $('formInfo').textContent=arrangement.form?arrangement.form.type+' · '+arrangement.form.bars+' takter':'';
   current.setTune(activeVisual,false,{soundFontUrl:DATA.soundFont}).then(()=>{
    if(controller!==current||stamp!==audioRevision)return;
    status(arrangement.message||'Klar til afspilning.',!!arrangement.message);return current.setWarp(Number($('tempo').value));
   }).catch(error=>{if(controller===current&&stamp===audioRevision)audioError(error);});
  }catch(error){audioError(error);}
 }
 function stopAndRender(){showSource();drone.stop();syncDrone();if(source===renderedSource)refreshAudio();else render();}
 InstrumentView.mount($('instrumentBar'),{onChange:function(){stopAllSound();render();}});
 $('printScore').addEventListener('click',function(){if(!pager.openPrintPreview(JazzFont.css(),InstrumentView.printLabel()))status('Ingen nodesider at udskrive.',true);});
 const styles=C.styles;
 const permitted=C.compatibleStyles(DATA.source);
 // Match the native meter-aware catalogue and preserve an explicit saved style.
 // Some supplied arrangements (such as Rio in 2/4) use a supported preset
 // outside the native menu's suggested choices; opening a Site must not reset it.
 if(styles[cfg.style]&&!permitted.includes(cfg.style))permitted.push(cfg.style);
 optionList($('style'),[['auto','Automatisk efter ABC-kildens R: / genre']].concat(permitted.map(key=>[key,styles[key].label])).concat([['custom','Egen blanding · eksperimentel']]));
 if(!permitted.length)status('Akkompagnementsstilarter til denne taktart er under udvikling. Melodien kan afspilles uden backing.');
 optionList($('form'),[['auto','Automatisk'],['AABA','AABA'],['ABAC','ABAC'],['AAB','AAB'],['AB','AB'],['BLUES','Blues'],['FREE','Fri form']]);
 optionList($('feel'),[['form','A=2 / B=4'],['two','2-feel'],['four','4-feel']]);
 [['form','form'],['feel','feel']].forEach(pair=>{const el=$(pair[0]),key=pair[1];el.value=cfg[key]||'auto';el.addEventListener('change',()=>{cfg[key]=el.value;stopAndRender();});});
 $('style').value=cfg.style;
 $('style').addEventListener('change',()=>{const val=$('style').value;cfg=C.clean(Object.assign({},cfg,styles[val]||{},{style:val}));updateMix();stopAndRender();});
 $('variation').value=cfg.variation;$('variationLabel').textContent=cfg.variation+' %';
 $('variation').addEventListener('input',()=>{$('variationLabel').textContent=$('variation').value+' %';});
 $('variation').addEventListener('change',()=>{cfg.variation=Number($('variation').value);stopAndRender();});
 $('reroll').addEventListener('click',()=>{cfg.seed=(cfg.seed||0)+1;stopAndRender();});
 $('accomp').checked=cfg.enabled;$('accomp').addEventListener('change',()=>{cfg.enabled=$('accomp').checked;stopAndRender();});
 $('metro').checked=cfg.metronome;$('metro').addEventListener('change',()=>{cfg.metronome=$('metro').checked;syncMixerVolumes();});
 optionList($('droneSa'),C.droneRoots);optionList($('droneMode'),C.droneModes);optionList($('droneTimbre'),C.droneTimbres);
 function syncDrone(){drone.configure();$('droneToggle').textContent=drone.isPlaying()?'Stop drone':'Start drone';$('droneToggle').setAttribute('aria-pressed',String(drone.isPlaying()));$('droneSa').value=cfg.droneSa;$('droneMode').value=cfg.droneMode;$('droneTimbre').value=cfg.droneTimbre;$('droneVolume').value=cfg.droneVolume;$('droneVolumeOut').textContent=cfg.droneVolume+' %';}
 $('droneToggle').addEventListener('click',()=>{if(drone.isPlaying()){cfg.droneEnabled=false;drone.stop();}else{cfg.droneEnabled=true;if(!drone.start())cfg.droneEnabled=false;}syncDrone();});
 ['droneSa','droneMode','droneTimbre','droneVolume'].forEach(id=>$(id).addEventListener(id==='droneVolume'?'input':'change',()=>{cfg[id]=id==='droneVolume'?Number($(id).value):$(id).value;cfg=C.clean(cfg);syncDrone();}));
 syncDrone();
 const labels={melodyVolume:'Melodi',bassVolume:'Bas',chordVolume:'Akkorder',drumVolume:'Trommer',metronomeVolume:'Metronom'};
 const opts={
  melodyInstrument:[['source','Som noteret'],[0,'Klaver'],[4,'Elklaver'],[24,'Nylonguitar'],[26,'Jazzguitar'],[56,'Trompet'],[65,'Altsaxofon'],[66,'Tenorsaxofon'],[71,'Klarinet'],[73,'Fløjte'],[40,'Violin'],[104,'Sitar · GM']],
  bassInstrument:[[32,'Kontrabas'],[33,'Elbas'],[34,'Elbas · plekter'],[35,'Fretless'],[38,'Synthbas'],[0,'Klaver']],
  chordInstrument:[[0,'Klaver'],[4,'Elklaver'],[24,'Nylonguitar'],[25,'Stålguitar'],[26,'Jazzguitar'],[21,'Harmonika'],[48,'Strygere']],
  drums:C.drums,
  metronomeSound:Object.keys(C.metronomeSounds).map(k=>[k,C.metronomeSounds[k].label])
 };
 const channelOption={melodyVolume:'melodyInstrument',bassVolume:'bassInstrument',chordVolume:'chordInstrument',drumVolume:'drums',metronomeVolume:'metronomeSound'};
 function syncMixerVolumes(){if(controller&&controller.midiBuffer&&controller.midiBuffer.setVolumes)controller.midiBuffer.setVolumes();}
 function updateMix(){if(voicePanel)voicePanel.update(cfg);if(repeatPanel)repeatPanel.update(cfg);$('style').value=cfg.style;$('bassPattern').value=cfg.bass;$('chordPattern').value=cfg.chords;Object.keys(labels).forEach(key=>{const r=$(key),sel=$(channelOption[key]),out=$(key+'Out');if(r)r.value=cfg[key];if(out)out.textContent=cfg[key]+' %';if(sel)sel.value=cfg[channelOption[key]];});$('metroAccent').checked=cfg.metronomeAccent;}
 Object.keys(labels).forEach(key=>{
  const block=document.createElement('div');block.className='mix-channel';
  const head=document.createElement('h3');head.textContent=labels[key];const out=document.createElement('output');out.id=key+'Out';head.appendChild(out);block.appendChild(head);
  const volume=document.createElement('input');volume.type='range';volume.id=key;volume.min='0';volume.max='100';volume.setAttribute('aria-label',labels[key]+' volumen');block.appendChild(volume);
  volume.addEventListener('input',()=>{cfg[key]=Number(volume.value);out.textContent=cfg[key]+' %';syncMixerVolumes();});
  const label=document.createElement('label');label.className='field';label.textContent=key==='drumVolume'?'Rytme':key==='metronomeVolume'?'Metronomlyd':'Instrument';
  const select=document.createElement('select');const prop=channelOption[key];select.id=prop;optionList(select,opts[prop]);label.appendChild(select);block.appendChild(label);
  select.addEventListener('change',()=>{if(['drums','bassInstrument','chordInstrument'].includes(prop))editableConfig();cfg[prop]=select.value;cfg=C.clean(cfg);updateMix();stopAndRender();});
  if(key==='metronomeVolume'){const accentLabel=document.createElement('label');accentLabel.className='row';accentLabel.style.fontSize='12px';const input=document.createElement('input');input.id='metroAccent';input.type='checkbox';accentLabel.appendChild(input);accentLabel.appendChild(document.createTextNode('Beton første slag'));block.appendChild(accentLabel);input.addEventListener('change',()=>{cfg.metronomeAccent=input.checked;stopAndRender();});}
  $('mix').appendChild(block);
 });
 function editableConfig(){if(cfg.style==='auto'){cfg=C.resolve(cfg,DATA.source,DATA.fields);cfg.style=cfg.detectedStyle;delete cfg.detectedStyle;}}
 optionList($('bassPattern'),C.basses);optionList($('chordPattern'),C.chords);
 [['bassPattern','bass'],['chordPattern','chords']].forEach(pair=>{$(pair[0]).addEventListener('change',()=>{editableConfig();cfg[pair[1]]=$(pair[0]).value;cfg=C.clean(cfg);updateMix();stopAndRender();});});
 voicePanel=C.mountVoices($('voiceControls'),ABC,DATA.source,()=>cfg,next=>{cfg=C.clean(next);updateMix();stopAndRender();});
 repeatPanel=C.mountRepeats($('repeatControls'),ABC,DATA.source,()=>cfg,next=>{cfg=C.clean(next);updateMix();stopAndRender();});
 updateMix();
 $('tempo').addEventListener('input',()=>{$('tempoLabel').textContent=$('tempo').value+' %';if(controller&&controller.setWarp)controller.setWarp(Number($('tempo').value)).catch(err=>status(err.message,true));});
 optionList($('transpose'),Array.from({length:13},(_,i)=>{const n=i-6;return [n,n===0?'Original toneart':(n>0?'+':'')+n+' halvtoner'];}));
 $('transpose').value='0';$('transpose').addEventListener('change',()=>{try{const n=Number($('transpose').value);source=n===0?DATA.source:Transpose.apply(ABC,DATA.source,n);stopAndRender();}catch(err){status('Transponering: '+err.message,true);}});
 function clearFollow(complete){activeNotes.forEach(n=>{if(n.classList)n.classList.remove('site-active-note');});activeNotes=[];if(cursorLine&&cursorLine.parentNode)cursorLine.parentNode.removeChild(cursorLine);cursorLine=null;if(complete){keyboard.clear();pianoFollow.clear();floatingPiano.hide();followScroller.reset();}}
 const cursorControl={
  onReady:function(){pianoFollow.setSource(ABC,source);pianoFollow.ready(controller);},
  onBeat:function(beat,total,time){if(controller&&controller.isStarted&&total>0)pianoFollow.at(beat/total*time);},
  lineEndAnticipation:500,
  onStart:function(){Reserve.stopAuditions();Playback.start(controller);playing=true;pager.setPlaying(true);followScroller.reset();if(cfg.droneEnabled&&drone.start())syncDrone();},
  onFinished:function(){pager.setPlaying(false);playing=false;drone.stop();syncDrone();clearFollow(true);$('pianoInfo').textContent='Klik på en becifring i nodearket for at se akkorden.';},
  onEvent:function(event){
   clearFollow(false);if(!event)return;pager.onEvent(event);
   const pitches=(event.midiPitches||[]).map(x=>typeof x==='number'?x:x&&x.pitch).filter(x=>Number.isFinite(x));
   pianoFollow.at(event.milliseconds);
   function addElements(node){if(Array.isArray(node)){node.forEach(addElements);return;}if(node&&node.classList){node.classList.add('site-active-note');activeNotes.push(node);}}
   addElements(event.elements||[]);
   const first=activeNotes.find(n=>n.getBoundingClientRect&&n.getBoundingClientRect().height>0);
   const svg=first&&first.ownerSVGElement;
   if(svg&&svg.getScreenCTM){try{const rect=first.getBoundingClientRect(),parent=first.closest('.abcjs-staff-wrapper'),staff=parent?parent.getBoundingClientRect():rect,ctm=svg.getScreenCTM();if(ctm){const p=svg.createSVGPoint(),q=svg.createSVGPoint();p.x=q.x=rect.left-5;p.y=staff.top-6;q.y=staff.bottom+6;const a=p.matrixTransform(ctm.inverse()),b=q.matrixTransform(ctm.inverse());const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('class','site-playhead');line.setAttribute('x1',a.x);line.setAttribute('x2',b.x);line.setAttribute('y1',a.y);line.setAttribute('y2',b.y);svg.appendChild(line);cursorLine=line;}}catch(_err){}}
   if(first&&pitches.length&&$('pianoPanel').open&&!pager.isDesk())floatingPiano.show(first);
   
  }
 };
 function render(){
  pianoFollow.setSource(ABC,source);
  drone.stop();syncDrone();
  const token=++generation;cueDataReady=false;
  Reserve.stopAuditions();if(controller){controller._disposed=true;Playback.unregister(controller);try{controller.destroy();}catch(_ignored){}controller=null;}
  playing=false;clearCue();clearFollow(true);$('paper').textContent='';$('audio').textContent='';status('Klargør afspilleren …');
  try{
   const layout=window.HUWSheetLayout.options(ABC,source,DATA.fields);
   const displaySource=I18n.localizedSource(Display.presentation(source),DATA.titleFields,window.HUWMusicSiteLanguage);
   const tabConfig=Tabs.read(DATA.fields),tabEnabled=DATA.fields['abc-tabs']==='yes',tabOptions=Tabs.options(ABC,displaySource,tabEnabled,tabConfig),useJazz=DATA.fields['abc-font']==='petaluma',jazzChords=DATA.fields['abc-chords-style']!=='standard';
   const tunes=JazzFont.render(ABC,useJazz,function(){return ABC.renderAbc('paper',displaySource,Object.assign({visualTranspose:InstrumentView.current().semitones,tablature:tabOptions.options,afterParsing:function(tune){window.HUWSheetLayout.prepare(tune,DATA.fields,displaySource);tune.formatting.staffsep=tabConfig.rhythm?145:90;if(tabConfig.rhythm)tune.formatting.sysstaffsep=120;Tabs.notation.project(ABC,tune,tabConfig,tabEnabled);if(tabOptions.options.length)tune.tablatures=ABC.parseOnly(displaySource,{tablature:tabOptions.options})[0].tablatures;},oneSvgPerLine:true,expandToWidest:true,responsive:'resize',staffwidth:720,scale:DATA.fields['abc-layout']==='kompakt'?.88:1,jazzchords:jazzChords,format:JazzFont.formatFonts(useJazz,{stretchlast:true,gchordfont:useJazz?'PetalumaScript 20':jazzChords?'Helvetica 18 bold':'Helvetica 16'}),wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:DATA.fields['abc-layout']==='jazz'?4:3},add_classes:true,clickListener:function(elem,tuneNo,classes,analysis,drag,event){
    if(event&&event.target&&event.target.closest&&event.target.closest('.abcjs-chord'))return;
    if(!elem)return;ensureCueData();if(!elem.midiPitches||!elem.midiPitches.length)return;
    const pitches=elem.midiPitches.map(x=>x.pitch).filter(Number.isFinite);
    if(pitches.length){$('pianoPanel').open=true;pianoFollow.explain(pitches,I18n.translate('Valgte toner',window.HUWMusicSiteLanguage));if(playing)floatingPiano.show(analysis&&analysis.selectableElement||event&&event.target);}
    cue(elem.startChar,analysis&&analysis.selectableElement||event&&event.target,elem.currentTrackMilliseconds);
    audition(elem.midiPitches,activeVisual).catch(audioError);
   }},layout));});
   if(!tunes||!tunes.length)throw new Error('ABC-notationen kunne ikke vises.');
   const visual=tunes[0];activeVisual=visual;renderedSource=source;if(tabOptions.options.length){Tabs.finish(visual,tabConfig);if(DATA.fields['abc-show-notes']==='no')Tabs.only($('paper'),visual);Tabs.rhythm($('paper'),visual,tabConfig);}pager.layout(visual,DATA.fields);if(DATA.startDesk&&!firstDeskOpen){firstDeskOpen=true;requestAnimationFrame(function(){if(!pager.isDesk())pager.setDesk(true);});}const arrangement=C.prepare(ABC,visual,source,cfg,true,DATA.fields);
   $('formInfo').textContent=arrangement.form?arrangement.form.type+' · '+arrangement.form.bars+' takter':'';
   if(!ABC.synth||!ABC.synth.supportsAudio())throw new Error('Browseren understøtter ikke lydafspilning.');
   const next=AudioController.install(new ABC.synth.SynthController(),ABC,{
    wiki:audioConfig,getConfig:()=>cfg,isCurrent:()=>token===generation,
    beforePlay:useCue,onStatus:audioStatus,onError:audioError,
    onPreparing:function(value){PlaybackFeedback.update($('audio').querySelector('.abcjs-midi-start'),value,{language:window.HUWMusicSiteLanguage});},
    onStop:function(paused){pager.setPlaying(false);Reserve.stopAuditions();soundHelp.stopped(paused);playing=false;drone.stop();syncDrone();clearFollow(!paused);}
   });
   controller=next;Playback.register(next);
   next.load('#audio',cursorControl,{displayPlay:true,displayLoop:true,displayRestart:true,displayProgress:true,displayWarp:false});
   window.HUWRepeat.mount($('audio'));
   const back=$('audio').querySelector('.abcjs-midi-reset');if(back)back.addEventListener('click',()=>{clearCue();drone.stop();syncDrone();},true);
   next.setTune(visual,false,{soundFontUrl:DATA.soundFont}).then(()=>{if(token===generation){status('Klar til afspilning.');return next.setWarp(Number($('tempo').value));}}).catch(err=>{if(token===generation)audioError(err);});
  }catch(err){status('Afspillerfejl: '+err.message,true);}
 }
 // Clicked chord labels explain their pitch classes on the shared piano.
 $('paper').addEventListener('click',event=>{
  const chordNode=event.target&&event.target.closest&&event.target.closest('.abcjs-chord');if(!chordNode)return;
  const name=chordNode.textContent.trim();const chord=Chords.parse(name);if(!chord){status('Kan ikke fortolke becifringen '+name+'.',true);return;}
  if(selectedChord)selectedChord.classList.remove('site-chord-selected');selectedChord=chordNode;chordNode.classList.add('site-chord-selected');
  $('pianoPanel').open=true;pianoFollow.explain(InstrumentView.soundingPitches(chord.pitches),(window.HUWMusicSiteLanguage==='da'?'Becifring: ':'Chord symbol: ')+name);
  if(playing)floatingPiano.show(chordNode);
  cue(null,chordNode,null);
  audition(chord.pitches,activeVisual).catch(audioError);
 });
 $('copySource').addEventListener('click',()=>copyValue(source,'ABC-kode kopieret.'));
 $('copyOriginal').addEventListener('click',()=>copyValue(DATA.source,'Original ABC-kode kopieret.'));
 // Share codes only make sense after the site is published to a web address.
 const shareModal=$('shareModal');let shareTrigger=null;
 function closeShare(){if(shareModal.close)shareModal.close();else shareModal.removeAttribute('open');if(shareTrigger)shareTrigger.focus();}
 function safeAttr(text){return String(text).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
 function shareInfo(){const shared=DATA.preview?'':(parentShareUrl||DATA.shareUrl||(DATA.embedded?'':location.href));let url;try{url=new URL(shared);}catch(ignore){}const online=url&&/^https?:$/.test(url.protocol)&&!url.username&&!url.password&&!/(^|[.])googleusercontent[.]com$/i.test(url.hostname);if(!online){$('shareHint').textContent='Publicér først HTML-afspilleren på en hjemmeside. Når siden har en webadresse, bliver både delingslink og indlejringskode tilgængelige.';$('shareLink').value='';$('embedCode').value='';$('copyLink').disabled=$('copyEmbed').disabled=true;return;}
  const link=shared;url.searchParams.set('embed','1');
  $('shareHint').textContent='Del linket, eller indlejr den interaktive afspiller på en anden hjemmeside.';
  $('shareLink').value=link;$('embedCode').value='<iframe src="'+safeAttr(url.toString())+'" title="'+safeAttr(DATA.title)+' – HUWiki Musik" width="100%" height="640" loading="lazy" allow="autoplay" style="border:0;max-width:100%;"></iframe>';
  $('copyLink').disabled=$('copyEmbed').disabled=false;
 }
 function openShare(event){shareTrigger=event.currentTarget;shareInfo();if(document.body.classList.contains('embedded'))shareModal.style.top=Math.max(8,shareTrigger.getBoundingClientRect().top+window.scrollY)+'px';if(typeof shareModal.showModal==='function')shareModal.showModal();else shareModal.setAttribute('open','');$('shareLink').focus();}
 $('shareButton').addEventListener('click',openShare);if($('shareTop'))$('shareTop').addEventListener('click',openShare);
 $('shareClose').addEventListener('click',closeShare);shareModal.addEventListener('cancel',event=>{event.preventDefault();closeShare();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&shareModal.hasAttribute('open')){event.preventDefault();closeShare();}});
 async function copy(id){const field=$(id);if(!field.value)return;try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(field.value);else{field.select();document.execCommand('copy');} $('shareHint').textContent='Kopieret.';}catch(err){field.focus();field.select();$('shareHint').textContent='Markeret – kopiér teksten manuelt.';}}
 $('copyLink').addEventListener('click',()=>copy('shareLink'));$('copyEmbed').addEventListener('click',()=>copy('embedCode'));
 async function copyValue(value,success){try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);}else{const temp=document.createElement('textarea');temp.value=value;temp.style.position='fixed';temp.style.opacity='0';document.body.appendChild(temp);temp.select();if(!document.execCommand('copy'))throw new Error('Copy not supported');temp.remove();}status(success||'Kopieret.');}catch(error){status('Kopiering blev blokeret af browseren. Markér teksten i ABC-panelet og kopiér manuelt.',true);$('abcPanel').open=true;}}
 // Reuse the exact keyboard policy from the wiki: no divergent Site copy.
 const unbindKeys=Shortcuts.register(document.querySelector('main'),{
  Space:function(){if(shareModal&&shareModal.open)return false;const control=$('audio').querySelector('.abcjs-midi-start');if(!control)return false;control.click();return true;},
  Home:function(){clearCue();stopAllSound();pager.first();return true;},
  PageDown:function(){return pager.next();},PageUp:function(){return pager.previous();},
  Escape:function(){if(pager.isDesk()){pager.setDesk(false);return true;}return false;},
  Stand:function(){pager.setDesk(!pager.isDesk());return true;},
  P:function(){$('pianoPanel').open=!$('pianoPanel').open;if(!$('pianoPanel').open)floatingPiano.hide();return true;}
 });
 window.addEventListener('pagehide',unbindKeys);
 if(DATA.fields['abc-font']==='petaluma')JazzFont.ready(document).then(render).catch(err=>status('Afspillerfejl: '+err.message,true));else render();
 (${embeddedRuntime.toString()})();
})();`;
 // Static CommonJS definitions: one source copy per shared module, no eval.
 var moduleDefinitions=Object.keys(moduleSources).map(function(title){return 'definitions['+escapeJson(title)+']=function(module,exports,require){\n'+safeScript(moduleSources[title])+'\n};';}).join('\n');
 var aliases={HUWShortcuts:'keyboard-shortcuts',HUWJazzFont:'jazz-font',HUWTabs:'tabs',HUWPageView:'page-view',HUWI18n:'i18n',HUWRepeat:'repeat-button',HUWJazz:'jazz-engine',HUWBalkan7:'balkan7',HUWAcc:'accompaniment',HUWTranspose:'transpose',HUWInstrumentView:'instrument-view',HUWSheetLayout:'sheet-layout',HUWKeys:'piano',HUWPianoFollow:'piano-follow',HUWChordKeys:'chord-keys',HUWAudition:'audition',HUWDisplay:'display-source',HUWFloatingPiano:'floating-piano',HUWStartPosition:'start-position',HUWPlaybackFeedback:'playback-feedback',HUWAudioController:'audio-controller',HUWSoundHelp:'sound-help',HUWReserve:'reserve-mixer',HUWPlayback:'playback'};
 var bootstrap='(function(){var definitions=Object.create(null),cache=Object.create(null);\n'+moduleDefinitions+'\n'+
  'cache["$:/plugins/huwiki/abc/vendor/abcjs.js"]={exports:window.ABCJS};\n'+
  'function require(title){if(cache[title])return cache[title].exports;if(!definitions[title])throw new Error("Site module missing: "+title);var module={exports:{}};cache[title]=module;try{definitions[title](module,module.exports,require);}catch(error){delete cache[title];throw error;}return module.exports;}\n'+
  Object.keys(aliases).map(function(alias){return 'window['+escapeJson(alias)+']=require('+escapeJson('$:/plugins/huwiki/abc/'+aliases[alias]+'.js')+');';}).join('\n')+'\n})();';
 var html='<!doctype html><html lang="'+langDefault+'"><head><meta charset="utf-8">'+(base?'<base href="'+attr(base)+'">':'')+'<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>TiddlyWiki Musik Edition</title><style>'+abcjsCss+'</style><style>'+style+'</style></head><body><main><div class="site-header"><div class="brandline"><div class="brandmark" aria-hidden="true">♫</div><div><div class="site-overline" id="siteHeading">TiddlyWiki Musik Edition</div><h1 id="title">Musikafspiller</h1><div class="sub">Noder, lyd og musikalsk udforskning</div></div></div><button class="share-btn" id="shareButton" type="button" aria-label="Del link eller indlejr afspiller">Del · indlejr</button></div><div class="site-instrument-row"><div id="instrumentBar"></div><button id="printScore" class="site-print-btn" type="button">PDF / Udskriv</button></div><div id="paper"></div><div class="player-bar"><div id="audio" role="region" aria-label="Afspiller"></div><button id="stopPlayback" type="button" aria-label="Stop afspilning">Stop</button></div><div id="soundHelp"></div><div class="switches"><label><input id="accomp" type="checkbox">Akkompagnement</label><label><input id="metro" type="checkbox">Metronom</label><button id="droneToggle" type="button" aria-pressed="false">Start drone</button></div><details class="more" id="dronePanel"><summary>Drone · Sa / Pa / Ma</summary><div class="more-grid"><label class="field">Sa / grundtone<select id="droneSa"></select></label><label class="field">Droneinterval<select id="droneMode"></select></label><label class="field">Klang<select id="droneTimbre"></select></label><label class="field">Lydstyrke <span id="droneVolumeOut">42 %</span><input id="droneVolume" type="range" min="0" max="100" value="42"></label></div></details><div class="primary-row"><label class="field">Tempo <span id="tempoLabel">100 %</span><input id="tempo" type="range" min="50" max="150" step="5" value="100"></label><label class="field">Transponér musik og lyd<select id="transpose"></select></label><label class="field">Stil<select id="style"></select></label></div><details class="more"><summary>Arrangement · form og variation</summary><div class="more-grid"><label class="field">Form<select id="form"></select></label><label class="field">Bas-feel<select id="feel"></select></label><label class="field">Basmønster<select id="bassPattern"></select></label><label class="field">Akkordmønster<select id="chordPattern"></select></label><label class="field">Variation <span id="variationLabel">35 %</span><input id="variation" type="range" min="0" max="100" step="5"></label></div><div class="row" style="margin-top:12px"><button id="reroll" type="button">Ny variation</button><span id="formInfo" class="muted"></span></div></details><details class="more"><summary>Mixer · volumen og instrumenter</summary><div class="mixer-grid" id="mix"></div></details><div id="voiceControls"></div><div id="repeatControls"></div><div class="learn-grid"><details class="more" id="pianoPanel"><summary>♫ &nbsp; Klaviatur</summary><p class="learn-hint">Se, hvilke tangenter der spilles, eller klik på en akkord i nodearket.</p><div id="pianoHost"></div><div id="pianoInfo" class="piano-info" aria-live="polite"></div></details><details class="more" id="abcPanel"><summary>⌘ &nbsp; ABC-kode</summary><p class="learn-hint">Kopiér notationen direkte. Koden følger din valgte transponering.</p><pre id="sourceCode" tabindex="0"></pre><div class="abc-actions"><button id="copySource" class="primary" type="button">Kopiér ABC som vist</button><button id="copyOriginal" type="button">Kopiér originalen</button></div></details></div><p id="status" role="status"></p><p class="footnote">Noderne bruger indlejret ABCJS. Originallyd hentes online. FluidSynth kræver SF3; TinySynth er indbygget og virker offline.</p></main><dialog class="share-modal" id="shareModal" aria-label="Del og indlejr"><h2>Del nodearket</h2><p id="shareHint"></p><label for="shareLink">Delingslink</label><input id="shareLink" type="text" readonly><div class="row" style="margin-top:7px"><button id="copyLink" type="button">Kopiér link</button></div><label for="embedCode">Indlejringskode</label><textarea id="embedCode" readonly></textarea><div class="modal-actions"><button id="copyEmbed" type="button" class="primary">Kopiér indlejringskode</button><button id="shareClose" type="button">Luk</button></div></dialog><script type="text/plain" id="abcjs-license">'+safeScript(abcjsLicense+'\n\n'+abcjsNotices)+'</script><script>'+safeScript(abcjs)+'</script><script>'+bootstrap+'</script><script>'+safeScript(app)+'</script></body></html>';
 return html;
}
function sourceFor(wiki,title){return require('$:/plugins/huwiki/abc/loader.js').getSource(wiki,title);}
function hasScore(wiki,title){return !!String(sourceFor(wiki,title)||'').trim();}
function data(wiki,title,options){var t=wiki.getTiddler(title),source=sourceFor(wiki,title);if(!t||!source)throw new Error('Nodearket har ingen ABC-kilde: '+title);return scoreData(wiki,source,t.fields,title,options);}
function frame(wiki,title,options){
 options=options||{};var t=wiki.getTiddler(title),source=sourceFor(wiki,title);
 if(!t||!source)throw new Error('Nodearket har ingen ABC-kilde: '+title);
 var view=ScoreView.resolve(Object.assign({},options,{embedded:false}),t.fields);
 var settings=Object.assign({},options,{embedded:true});
 var html=exporter(wiki,source,t.fields,title,settings),share=safeUrl(options.shareUrl,false);
 return '<iframe class="huwabc-site-frame" data-huwiki-abc-frame="1"'+(view.minimal?' data-huwabc-minimal="yes"':'')+(options.preview?' data-huwabc-preview="yes"':'')+(share?' data-huwabc-share-url="'+attr(share)+'"':'')+' title="'+attr(title)+'" sandbox="allow-scripts" allow="autoplay" style="display:block;width:100%;height:'+(view.minimal?'180':'840')+'px;min-height:'+(view.minimal?'40':'240')+'px;border:0" srcdoc="'+attr(html)+'"></iframe>';
}
exports.build=exporter;exports.data=data;exports.hasScore=hasScore;exports.frame=frame;exports.frameSupport=frameSupport;
})();
