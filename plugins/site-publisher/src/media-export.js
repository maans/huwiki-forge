/* HUWiki Forge SitePublisher: shared local media + CutOut export adapters.
 * Adapted from OAuthLab SiteWorkshop.js (siteCutoutWidgets/cutoutAssets/cutoutTitle).
 * This source is bundled into startup.js; no editor/Google code reaches readers.
 * No external or private media dependencies may be silently emitted. */
var PUBLISHER_CUTOUT_BASE="$:/plugins/huwiki/site-publisher/cutout/";
function publicationMediaError(owner,detail){
 return new Error("SitePublisher · "+owner+": "+detail);
}
function cutoutScene(title){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields;
 if(!f||f.type!=="application/json")return null;
 try{
  var scene=JSON.parse(String(f.text||""));
  if(scene&&scene.version===1&&(Array.isArray(scene.parts)||Array.isArray(scene.scenes)))return scene;
 }catch(_){}
 return null;
}
function isCutoutTitle(title){return !!cutoutScene(title);}
function cutoutReference(id,title){
 var found="";
 var scan=$tw.wiki.eachShadowPlusTiddlers||$tw.wiki.each;
 if(id&&typeof scan==="function")scan.call($tw.wiki,function(t,key){if(t.fields["cutout-id"]===id)found=key;});
 return found||title||"";
}
function publicationDataUrl(title,expectedType){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields;
 if(!f)throw publicationMediaError(title,"medietiddleren findes ikke / media tiddler is missing.");
 var type=String(f.type||""),valid=/^(?:image\/(?:png|jpeg|gif|webp|svg\+xml|avif)|audio\/(?:mpeg|mp3|wav|x-wav|ogg|mp4|webm|aac|flac)|video\/(?:mp4|webm|ogg|quicktime))$/i;
 if(!valid.test(type)||(expectedType&&!new RegExp("^"+expectedType+"/","i").test(type)))
  throw publicationMediaError(title,"medietypen kan ikke indlejres offline / unsupported offline media type: "+type);
 var data=String(f.text||"").trim(),match=/^data:([^;,]+)(?:;[^,]*)?,/i.exec(data);
 if(match){
  if(match[1].toLowerCase()!==type.toLowerCase())
   throw publicationMediaError(title,"data-URL og tiddlerens medietype stemmer ikke overens / data URL MIME mismatch.");
  if(!data.slice(match[0].length))throw publicationMediaError(title,"medieindholdet er tomt / media is empty.");
  return data;
 }
 if(!data)throw publicationMediaError(title,"kun en ekstern/privat filadresse findes; gem mediet i wikien før eksport / only an external or private file URI is available.");
 if(type==="image/svg+xml"){
  if(/<\s*(?:script|foreignObject)\b|@import\b|url\(\s*['"]?\s*(?:https?:|file:|blob:|\/)/i.test(data))
   throw publicationMediaError(title,"SVG indeholder script eller ekstern afhængighed / SVG contains scripts or external references.");
  if(/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i.test(data))
   throw publicationMediaError(title,"SVG indeholder en ekstern billedreference / SVG has an external image reference.");
  if(!/<svg(?:\s|>)/i.test(data))throw publicationMediaError(title,"SVG-data mangler <svg>.");
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(data);
 }
 if(!/^[A-Za-z0-9+/=\s]+$/.test(data))
  throw publicationMediaError(title,"mediet er ikke gemt som gyldige Base64-data / invalid embedded Base64.");
 return "data:"+type+";base64,"+data.replace(/\s/g,"");
}
function cutoutAsset(title,ctx){
 var row=$tw.wiki.getTiddler(title),f=row&&row.fields;
 if(!f)throw publicationMediaError(title,"CutOut-billedet mangler / CutOut image is missing.");
 if(!/^image\/(?:png|jpeg|webp|gif|svg\+xml)$/.test(String(f.type||"")))throw publicationMediaError(title,"billedformatet understøttes ikke af CutOut / unsupported CutOut image format.");
 var url=publicationDataUrl(title,"image");
 var text=f.type==="image/svg+xml"?
  String(f.text||""):(/^data:/i.test(String(f.text||""))?url:String(f.text||""));
 var copy={title:title,type:f.type,text:text};
 if(f["cutout-id"])copy["cutout-id"]=f["cutout-id"];
 // Never copy _canonical_uri: it might point to an editor-only drive/file.
 if(f.type==="image/svg+xml"&&!/^data:/i.test(text))copy.text=String(f.text||"");
 ctx.rows[title]=copy;
}
function collectCutout(title,ctx,stack){
 stack=stack||[];
 if(stack.indexOf(title)!==-1)throw publicationMediaError(title,"cirkulær animationsreference / circular animation reference.");
 if(ctx.rows[title])return;
 var scene=cutoutScene(title),t=$tw.wiki.getTiddler(title);
 if(!scene)throw publicationMediaError(title,"CutOut-animationen findes ikke eller er ugyldig / missing or invalid CutOut scene.");
 if((scene.parts||[]).length>300)throw publicationMediaError(title,"CutOut-scenen har mere end 300 dele.");
 var next=stack.concat(title),f=t.fields,copy={title:title,type:"application/json",text:String(f.text||"")};
 if(f["cutout-id"])copy["cutout-id"]=f["cutout-id"];
 if(f["cutout-kind"])copy["cutout-kind"]=f["cutout-kind"];
 ctx.rows[title]=copy;
 function addImage(p){
  if(!p)return;
  var inline=p.imageData||p.src||"";
  if(inline&&!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i.test(inline))
   throw publicationMediaError(title,"billedkilden er ikke indlejret / non-embedded image source: "+String(inline).slice(0,90));
  var ref=cutoutReference(p.assetId,p.asset);
  if(ref&&!p.imageData)cutoutAsset(ref,ctx);
  if(p.type==="image"&&!inline&&!ref)
   throw publicationMediaError(title,"en billeddel mangler sin billedkilde / image part lacks an image source.");
 }
 (scene.parts||[]).forEach(function(part){
  if(!part)return;
  if(part.type==="animation"){
   var child=cutoutReference(part.animationId,part.animation);
   if(!child)throw publicationMediaError(title,"en indlejret animation mangler reference / nested animation has no reference.");
   collectCutout(child,ctx,next);
  }
  if(part.type==="image"||part.asset||part.assetId)addImage(part);
  (part.variants||[]).forEach(addImage);
 });
 (scene.scenes||[]).forEach(function(clip){
  var child=cutoutReference(clip.sourceId,clip.source||clip.animation||clip.theatre);
  if(!child)throw publicationMediaError(title,"en teaterscene mangler reference / theatre scene has no reference.");
  collectCutout(child,ctx,next);
 });
 ctx.used=true;
}
function cutoutWidgetMarkup(title,loop,autoplay,ctx){
 collectCutout(title,ctx,[]);
 return '<div class="huw-site-cutout" data-cutout-title="'+safe(title)+'" data-loop="'+safe(loop||"yes")+'" data-autoplay="'+safe(autoplay||"no")+'"></div>';
}
function cutoutWidgetPlaceholders(text,ctx,snippets){
 var unmatched=false,result=String(text||"").replace(/<\$(cutout|cutout-film|cutout-theatre)(?=\s|\/>)([^>]*?)\/>/gi,function(_,kind,attributes){
  function value(key){
   var match=attributes.match(new RegExp("\\b"+key+"\\s*=\\s*([\"'])((?:(?!\\1).)*)\\1","i"));
   return match&&match[2]||"";
  }
  var title=value("tiddler");
  if(!title)throw publicationMediaError(kind,"CutOut-widget mangler tiddler-navn / missing tiddler attribute.");
  var markup=cutoutWidgetMarkup(title,value("loop"),value("autoplay"),ctx);
  var token="HUW_SITE_CUTOUT_"+snippets.length+"_HERE";
  snippets.push({tag:token,html:markup});return token;
 });
 if(/<\$(?:cutout|cutout-film|cutout-theatre)(?=\s|>)/i.test(result))
  throw publicationMediaError("CutOut","en CutOut-widget kan ikke gengives / unsupported CutOut widget syntax.");
 return result;
}
function publicationHtmlMedia(div,owner){
 function mediaUrl(value,expected){
  value=String(value||"").trim();
  if(!value)throw publicationMediaError(owner,"et medie mangler src / a media source is missing.");
  if(/^data:/i.test(value)){
   if(!new RegExp("^data:"+expected+"/","i").test(value)||/^\s*data:text\/html/i.test(value))
    throw publicationMediaError(owner,"medieformatet i data-URL understøttes ikke / unsupported data URL: "+value.slice(0,80));
   return value;
  }
  if(/^(?:https?:|blob:|file:|filesystem:|\/\/|\/|[a-z][a-z0-9+.-]*:)/i.test(value))
   throw publicationMediaError(owner,"mediet bruger en ekstern eller privat adresse / media refers to external or private URL: "+value.slice(0,100));
  var title=value;try{title=decodeURIComponent(value);}catch(_){}
  if(!$tw.wiki.getTiddler(title))throw publicationMediaError(owner,"det lokale medie findes ikke i wikien / missing local media tiddler: "+value);
  return publicationDataUrl(title,expected);
 }
 div.querySelectorAll("iframe,object,embed").forEach(function(n){
  throw publicationMediaError(owner,"indlejret iframe/object kan ikke pakkes som én offlinefil / iframe or object would be lost.");
 });
 div.querySelectorAll("img[src],audio[src],video[src],source[src],video[poster],image[href],image[xlink\\:href]").forEach(function(n){
  var type=n.tagName.toLowerCase(),key=type==="video"&&n.hasAttribute("poster")?"poster":(n.hasAttribute("href")?"href":n.hasAttribute("xlink:href")?"xlink:href":"src");
  var expected=(type==="img"||type==="image"||key==="poster")?"image":(type==="audio"?"audio":(type==="video"?"video":(n.closest("video")?"video":"audio")));
  n.setAttribute(key,mediaUrl(n.getAttribute(key),expected));
 });
 div.querySelectorAll("[srcset]").forEach(function(n){
  throw publicationMediaError(owner,"srcset med mulige eksterne billeder understøttes endnu ikke / srcset needs a dedicated offline adapter.");
 });
 div.querySelectorAll("[style]").forEach(function(n){
  if(/url\s*\(\s*['"]?\s*(?:https?:|file:|blob:|\/)/i.test(n.getAttribute("style")))
   throw publicationMediaError(owner,"CSS-stilen indeholder en ekstern ressource / external resource in inline CSS.");
 });
 return div;
}
function publicationMediaArticle(title){
 var t=$tw.wiki.getTiddler(title),f=t&&t.fields||{},type=String(f.type||"");
 if(!/^(?:image|audio|video)\//.test(type))return "";
 var kind=type.split("/")[0],src=publicationDataUrl(title,kind);
 if(kind==="image")return '<figure class="husp-site-image"><img alt="'+safe(title)+'" src="'+safe(src)+'"></figure>';
 return '<figure class="husp-site-media"><'+kind+' controls preload="metadata" src="'+safe(src)+'"></'+kind+'><figcaption>'+safe(title)+'</figcaption></figure>';
}
