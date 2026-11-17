/* AniMus publication adapters. Bundled into the SitePublisher startup module.
 * Only the selected production and its referenced scenes, scores and media
 * are exported. The audience runtime contains no authoring widgets. */
var PUBLISHER_ANIMUS_BASE="$:/plugins/huwiki/site-publisher/animus/";
function isAnimusTitle(title){var scene=cutoutScene(title);return !!(scene&&scene.musical&&typeof scene.musical==="object");}
function collectAnimus(title,fallback,ctx){
 var scene=cutoutScene(title);if(!scene)throw publicationMediaError(title,"AniMus-forestillingen mangler / missing AniMus production.");
 collectCutout(title,ctx,[]);ctx.animus=true;
 // Scene notes are editing material, never audience content.
 Object.keys(ctx.rows).forEach(function(key){var row=ctx.rows[key];if(row.type!=="application/json")return;
  try{var data=JSON.parse(row.text);if(data.version===1){delete data.sceneNotes;
   (data.parts||[]).forEach(function(part){delete part.svgDrawing;delete part.svgLayerIds;delete part.svgLayerOwner;delete part.svgLayerId;});
   row.text=JSON.stringify(data);
  }}catch(_){}
 });
 var musical=scene.musical||{},songs=Array.isArray(musical.songs)?musical.songs:[];
 if(!songs.length&&fallback)songs=[{score:fallback}];
 songs.forEach(function(clip){
  var name=String(clip&&clip.score||""),t=$tw.wiki.getTiddler(name),f=t&&t.fields,source=f&&(f["abc-source"]||f.text);
  if(!name||!source)throw publicationMediaError(title,"nodearket mangler / missing score: "+name);
  var copy={title:name,type:f.type||"text/vnd.abc",text:String(source),"abc-source":String(source)};
  Object.keys(f).forEach(function(k){if(/^abc-[a-z0-9-]+$/.test(k))copy[k]=f[k];});
  ctx.rows[name]=copy;
 });
 (Array.isArray(musical.audioClips)?musical.audioClips:[]).forEach(function(clip){
  var asset=String(clip&&clip.asset||"");if(!asset)throw publicationMediaError(title,"et lydklip mangler lydfil / recorded clip has no audio asset.");
  var t=$tw.wiki.getTiddler(asset),f=t&&t.fields;
  if(!f)throw publicationMediaError(title,"optagelsen mangler / recorded audio is missing: "+asset);
  var url=publicationDataUrl(asset,"audio");
  ctx.rows[asset]={title:asset,type:String(f.type),text:url};
 });
 return scene;
}
function animusWidgetMarkup(title,score,ctx){
 collectAnimus(title,score,ctx);
 return '<section class="huw-site-animus" data-animus-title="'+safe(title)+'" data-animus-score="'+safe(score||"")+'"></section>';
}
function animusWidgetPlaceholders(text,ctx,snippets,ownerTitle){
 var result=String(text||"").replace(/<\$musical-stage(?=\s|\/>)([^>]*?)\/>/gi,function(_,attrs){
  function value(name){
   var match=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|\\{\\{!!([a-z0-9_-]+)\\}\\})','i').exec(attrs);
   if(!match)return "";
   if(match[3]){var owner=ownerTitle&&$tw.wiki.getTiddler(ownerTitle);return owner&&typeof owner.fields[match[3]]==="string"?owner.fields[match[3]]:"";}
   return match[1]===undefined?match[2]:match[1];
  }
  var title=value("scene"),score=value("score");
  if(!title)throw publicationMediaError("AniMus","widget mangler scene-navn / missing scene attribute.");
  var token="HUW_SITE_ANIMUS_"+snippets.length+"_HERE";
  snippets.push({tag:token,html:animusWidgetMarkup(title,score,ctx)});return token;
 });
 if(/<\$musical-stage(?=\s|>)/i.test(result))throw publicationMediaError("AniMus","widget-syntaks kan ikke udgives / unsupported musical-stage widget syntax.");
 return result;
}
function animusBundle(ctx){
 if(!ctx.animus)return {script:"",css:"",config:null};
 function source(title){var text=$tw.wiki.getTiddlerText(title,"");if(!text)throw publicationMediaError("AniMus","afspillermodulet mangler / playback module is missing: "+title);return text;}
 function json(value){return JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");}
 var names=["musical/playlist","musical/motion","musical/sync","musical/sfx","musical/lipsync","musical/narration-player","abc/audio-controller","abc/accompaniment","abc/start-position"],queue=names.map(function(n){return "$:/plugins/huwiki/"+n+".js";}),sources=Object.create(null),seen=Object.create(null);
 queue.forEach(function(title){seen[title]=true;});
 for(var i=0;i<queue.length;i++){
  var title=queue[i];if(title==="$:/plugins/huwiki/cutout/engine.js"||title==="$:/plugins/huwiki/abc/vendor/abcjs.js")continue;
  var code=source(title);sources[title]=code;
  var re=/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,match;
  while((match=re.exec(code))){var dependency=match[1];
   if(!/^\$:\/plugins\/huwiki\/(?:abc|musical|cutout)\/[a-z0-9/-]+\.(?:js|json)$/i.test(dependency))throw publicationMediaError("AniMus","unsupported runtime dependency: "+dependency);
   if(!seen[dependency]){seen[dependency]=true;queue.push(dependency);}
  }
 }
 var definitions=Object.keys(sources).map(function(title){var content=sources[title];if(/\.json$/.test(title))content="module.exports="+JSON.stringify(JSON.parse(content))+";";
  return "definitions["+json(title)+"]=function(module,exports,require){\n"+content+"\n};";
 }).join("\n");
 var bootstrap="(function(){var definitions=Object.create(null),cache=Object.create(null);\n"+definitions+"\n"+
  'cache["$:/plugins/huwiki/cutout/engine.js"]={exports:window.HUWikiCutOutSite};\n'+
  'cache["$:/plugins/huwiki/abc/vendor/abcjs.js"]={exports:window.ABCJS};\n'+
  'function require(title){if(cache[title])return cache[title].exports;if(!definitions[title])throw new Error("AniMus module missing: "+title);var module={exports:{}};cache[title]=module;try{definitions[title](module,module.exports,require);}catch(error){delete cache[title];throw error;}return module.exports;}\n'+
  'window.HUWikiAniMusModules={require:require};})();';
 var license=$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/vendor/abcjs-LICENSE","")+"\n"+$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/vendor/abcjs-bundled-LICENSE","")+"\n"+$tw.wiki.getTiddlerText("$:/plugins/huwiki/abc/tinysynth-LICENSE","");
 var mode=$tw.wiki.getTiddlerText("$:/config/huwiki/abc/audio-engine-mode","auto");
 // The publication keeps an explicit engine choice. The default requests the
 // normal sample engine; failure does not activate another synthesizer.
 if(["original","fluid","tiny"].indexOf(mode)<0)mode="original";
 return {script:source("$:/plugins/huwiki/abc/vendor/abcjs.js")+"\n"+bootstrap+"\n"+source(PUBLISHER_ANIMUS_BASE+"viewer.js"),
  css:source(PUBLISHER_ANIMUS_BASE+"viewer.css"),license:license,
  config:{soundFont:$tw.wiki.getTiddlerText("$:/config/huwiki/abc/soundfont","https://paulrosen.github.io/midi-js-soundfonts/abcjs/").trim(),
   reserveBase:$tw.wiki.getTiddlerText("$:/config/huwiki/abc/reserve-base","").trim(),engineMode:mode}};
}
