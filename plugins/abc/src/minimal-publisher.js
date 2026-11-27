/*\
title: $:/plugins/huwiki/abc/minimal-publisher.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
var View=require('$:/plugins/huwiki/abc/score-view.js');
var I18n=require('$:/plugins/huwiki/abc/i18n.js');
function json(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function script(text){return String(text).replace(/<\/script/gi,'<\\/script');}
function attr(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
function baseUrl(value){try{var u=new URL(String(value||''));return /^(https?:|file:)$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch(ignore){return '';}}
exports.build=function(wiki,source,fields,title,options){
 options=options||{};fields=fields||{};
 var view=View.resolve(Object.assign({},options,{embedded:false}),fields),prefix='$:/plugins/huwiki/abc/';
 var kept={title:fields.title||title};
 ['abc-parts-new-line','abc-paper-size','abc-page-margin','abc-accompaniment','abc-font','abc-tabs','abc-tabs-config','abc-show-notes','abc-layout','abc-lines-per-page','abc-bars-per-line','abc-chords-style','abc-rhythm','abc-style','abc-genre','abc-origin-library','huwiki-title-da','huwiki-title-en','huwiki-score-title-source','huwiki-score-title-da','huwiki-score-title-en'].forEach(function(key){if(fields[key]!==undefined)kept[key]=fields[key];});
 kept['abc-chords-style']=kept['abc-chords-style']||wiki.getTiddlerText('$:/config/huwiki/abc/chords-style','jazz');
 // Store only score data. Surrounding teaching notes and unrelated tiddler
 // fields do not belong to an exported music example.
 var data={paged:!view.range&&!/^(yes|true|1)$/.test(String(options.embedded||'')),source:String(source||''),fields:kept,title:title,view:view,language:I18n.language(wiki),
  soundFont:wiki.getTiddlerText('$:/config/huwiki/abc/soundfont','https://paulrosen.github.io/midi-js-soundfonts/abcjs/').trim(),
  reserveBase:wiki.getTiddlerText('$:/config/huwiki/abc/reserve-base','').trim(),engineMode:wiki.getTiddlerText('$:/config/huwiki/abc/audio-engine-mode','auto').trim()};
 var names=['page-view','viewport-anchor','minimal-player','floating-mixer','score-view','score-excerpt','jazz-font','tabs','editor-model','tab-rhythm','tabs-only','notation','i18n','jazz-engine','balkan7','meter-map','meter-arranger','voice-routing','voice-controls','repeat-plan','repeat-playback','repeat-controls','accompaniment','voice-names','engraving-rules','sheet-layout','piano','chord-keys','audition','display-source','loader','playback','keyboard-shortcuts','start-position','audio-controller','playback-feedback','audio-sequence','fluid-renderer','reserve-runtime','reserve-mixer'];
 // Follow transitive CommonJS imports, so a new mini-mixer dependency cannot
 // leave exported Site examples blank (the old fixed list missed some modules).
 var sources=Object.create(null),queue=[];
 function include(id){if(sources[id]!==undefined)return;var content=wiki.getTiddlerText(id);if(!content)throw new Error('Et modul til nodeeksemplet mangler: '+id);sources[id]=content;queue.push(id);}
 names.forEach(function(name){include(prefix+name+'.js');});
 for(var q=0;q<queue.length;q++){
  var re=/require\s*\(\s*['"](\$:\/plugins\/huwiki\/abc\/[a-z0-9-]+\.js)['"]\s*\)/gi,match;
  while((match=re.exec(sources[queue[q]]))!==null)include(match[1]);
 }
 var definitions=queue.map(function(id){return 'definitions['+json(id)+']=function(module,exports,require){\n'+script(sources[id])+'\n};';}).join('\n');
 definitions+='\ndefinitions['+json(prefix+'rhythm-symbols.json')+']=function(module){module.exports='+wiki.getTiddlerText(prefix+'rhythm-symbols.json','{}')+';};';
 var boot='(function(){var definitions=Object.create(null),cache=Object.create(null);\n'+definitions+'\n'+
  'cache['+json(prefix+'vendor/abcjs.js')+']={exports:window.ABCJS};\n'+
  'function require(id){if(cache[id])return cache[id].exports;if(!definitions[id])throw new Error("Example module missing: "+id);var module={exports:{}};cache[id]=module;try{definitions[id](module,module.exports,require);}catch(error){delete cache[id];throw error;}return module.exports;}\n'+
  'window.HUWMinimalPlayer=require('+json(prefix+'minimal-player.js')+');window.HUWScoreView=require('+json(prefix+'score-view.js')+');window.HUWI18n=require('+json(prefix+'i18n.js')+');window.HUWJazzFont=require('+json(prefix+'jazz-font.js')+');\n})();';
 var app=`(function(){'use strict';
 const DATA=${json(data)},host=document.getElementById('example');
 window.HUWMusicSiteLanguage=DATA.language;
 const config={getTiddlerText:function(id,fallback){if(id==='$:/language')return DATA.language;if(id==='$:/config/huwiki/abc/soundfont')return DATA.soundFont;if(id==='$:/config/huwiki/abc/reserve-base')return DATA.reserveBase;if(id==='$:/config/huwiki/abc/audio-engine-mode')return DATA.engineMode||'auto';return fallback===undefined?'':fallback;}};
 let player=null,closed=false,queued=false,lastHeight=-1,observer=null;
 function alive(){return !closed&&host.isConnected;}
 function height(){queued=false;if(!alive()||window.parent===window)return;const mix=document.querySelector('.huwabc-mini-mixer:not([hidden])');const bottom=mix&&mix.classList.contains('huwabc-mini-mixer--floating')?mix.getBoundingClientRect().bottom+10:0;const n=Math.max(40,Math.ceil(Math.max(host.scrollHeight,host.getBoundingClientRect().height,bottom)));if(n===lastHeight)return;lastHeight=n;window.parent.postMessage({type:'huwiki-abc-frame-height',version:1,height:n},'*');}
 function schedule(){if(!queued){queued=true;window.requestAnimationFrame(height);}}
 function stop(){if(player&&player.controller&&player.controller.huwikiStop)player.controller.huwikiStop();}
 function mount(){if(!alive())return;try{
  const prepared=window.HUWScoreView.prepare(window.ABCJS,DATA.source,DATA.fields,DATA.view);
  const source=window.HUWI18n.localizedSource(prepared.source,prepared.fields,DATA.language);
  player=window.HUWMinimalPlayer.mount(host,{ABC:window.ABCJS,source:source,fields:prepared.fields,wiki:config,audio:DATA.view.audio,showTitle:DATA.view.showTitle,paged:DATA.paged,mixerButton:DATA.view.mixer,onMixerVisibilityChange:schedule,isCurrent:alive});
  schedule();
 }catch(error){host.textContent=window.HUWI18n.translate('Eksemplet kunne ikke vises: ',DATA.language)+error.message;host.classList.add('huwabc-error');schedule();}}
 window.addEventListener('message',function(event){const d=event.data;if(event.source===window.parent&&d&&d.version===1&&d.type==='huwiki-abc-frame-stop')stop();});
 window.addEventListener('resize',schedule);
 window.addEventListener('pagehide',function(){closed=true;if(observer)observer.disconnect();if(player)player.destroy();});
 if(typeof ResizeObserver==='function'){observer=new ResizeObserver(schedule);observer.observe(host);}else if(typeof MutationObserver==='function'){observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true,attributes:true});}
 if(DATA.fields['abc-font']==='petaluma')window.HUWJazzFont.ready(document).then(mount).catch(function(error){host.textContent=error.message;schedule();});else mount();
})();`;
 var css='html,body{margin:0;padding:0;background:transparent;color:#19362e;font-family:system-ui,-apple-system,Segoe UI,sans-serif}#example{display:block;padding:0 2px;box-sizing:border-box}button{font:inherit}.huwabc-error{color:#963b2f;padding:.4em 0}'+wiki.getTiddlerText(prefix+'minimal-player.css','')+wiki.getTiddlerText(prefix+'page-view.css','')+wiki.getTiddlerText(prefix+'floating-mixer.css','');
 var vendor=wiki.getTiddlerText(prefix+'vendor/abcjs.js',''),audioCss=wiki.getTiddlerText(prefix+'vendor/abcjs-audio.css','');
 if(!vendor||!audioCss)throw new Error('Indlejret ABCJS eller afspillerens CSS mangler.');
 var license=wiki.getTiddlerText(prefix+'vendor/abcjs-LICENSE','')+'\n'+wiki.getTiddlerText(prefix+'vendor/abcjs-bundled-LICENSE','')+'\n'+wiki.getTiddlerText(prefix+'Petaluma-license','')+'\n'+wiki.getTiddlerText(prefix+'tinysynth-LICENSE','');
 var base=baseUrl(options.baseUrl);
 return '<!doctype html><html lang="'+attr(data.language)+'"><head><meta charset="utf-8">'+(base?'<base href="'+attr(base)+'">':'')+'<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+attr(title)+'</title><style>'+audioCss+'</style><style>'+css+'</style></head><body><main id="example" class="huwabc-minimal"></main><script type="text/plain" id="abcjs-license">'+script(license)+'</script><script>'+script(vendor)+'</script><script>'+boot+'</script><script>'+script(app)+'</script></body></html>';
};
})();
