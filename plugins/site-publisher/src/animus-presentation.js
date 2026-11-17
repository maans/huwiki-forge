/* Audience metadata for AniMus publication. Bundled into SitePublisher.
 * No source JSON, script notes, assets or editing instructions are rendered. */
function animusPresentation(title,lang){
 var wiki=$tw.wiki,limit=2048,maximumDepth=16,visits=0,reads=Object.create(null),idIndex=null,incomplete=false,rows=[],lastOccurrence="";
 function number(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
 function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
 function round(value){return Math.round(value*1000)/1000;}
 function label(value,fallback){return String(value||fallback||"").replace(/\s+/g," ").trim().slice(0,320);}
 function cleanTitle(value){return label(value).replace(/\s*\((?:film|animation|scene)\)\s*$/i,"").replace(/^Musical\s*[–—-]\s*/i,"").trim();}
 function fields(name){var t=name&&wiki.getTiddler(name);return t&&t.fields||null;}
 function read(name){if(Object.prototype.hasOwnProperty.call(reads,name))return reads[name];var f=fields(name),data=null;try{data=f&&JSON.parse(String(f.text||""));}catch(_){}
  if(!data||typeof data!=="object"||Array.isArray(data)||data.version!==1||(!Array.isArray(data.parts)&&!Array.isArray(data.scenes)))data=null;
  reads[name]=data;return data;
 }
 function musical(data){return !!(data&&data.musical&&typeof data.musical==="object"&&!Array.isArray(data.musical));}
 function resolve(id,name){if(id&&!idIndex){idIndex=Object.create(null);var each=wiki.eachShadowPlusTiddlers||wiki.each;if(each)each.call(wiki,function(t,tiddlerTitle){var f=t&&t.fields||{};if(f["cutout-id"])idIndex[f["cutout-id"]]=tiddlerTitle;});}return id&&idIndex&&idIndex[id]||String(name||"");}
 var owner=fields(title),sourceTitle=String(title||""),source=read(sourceTitle),fallbackScore="";
 if(!musical(source)){
  sourceTitle=owner&&typeof owner["animus-scene"]==="string"?owner["animus-scene"].trim():"";
  fallbackScore=owner&&typeof owner["animus-score"]==="string"?owner["animus-score"].trim():"";
  if(!sourceTitle&&owner){
   // Documentation/code samples are not productions. Bilingual Start pages
   // may repeat the same widget; multiple different shows stay an article.
   var text=String(owner.text||"").replace(/<!--[\s\S]*?-->/g,"").replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,"").replace(/\{\{\{[\s\S]*?\}\}\}/g,""),names=[],scores=[],match,re=/<\$musical-stage(?=\s|\/?>)([^>]*?)\/?\s*>/gi;
   while((match=re.exec(text))){var attrs=match[1];
    function value(key){var attr=new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|\\{\\{!!([a-z0-9_-]+)\\}\\})','i').exec(attrs);if(!attr)return "";return attr[3]?typeof owner[attr[3]]==="string"?owner[attr[3]].trim():"":String(attr[1]===undefined?attr[2]:attr[1]).trim();}
    var name=value("scene"),score=value("score");if(name&&names.indexOf(name)<0)names.push(name);if(score&&scores.indexOf(score)<0)scores.push(score);
   }
   if(names.length===1){sourceTitle=names[0];fallbackScore=scores.length===1?scores[0]:"";}
  }
  source=sourceTitle&&read(sourceTitle);if(!musical(source))return null;
 }
 function sceneDuration(scene){if(Array.isArray(scene.scenes))return Math.max(.1,scene.scenes.reduce(function(sum,clip){return sum+Math.max(.1,number(clip&&clip.duration,4));},0));return clamp(number(scene.duration,4),.25,3600);}
 function runningDuration(scene){var duration=sceneDuration(scene),m=scene.musical||{},previous=0,songs=Array.isArray(m.songs)&&m.songs.length?m.songs:fallbackScore?[{score:fallbackScore,start:0,duration:16}]:[];
  songs.slice(0,32).filter(function(song){return song&&typeof song.score==="string"&&song.score.trim();}).forEach(function(song){var start=clamp(number(song.start===undefined?previous:song.start,0),0,21600),length=clamp(number(song.duration,.125),.125,7200);previous=start+length;duration=Math.max(duration,previous);});
  (Array.isArray(m.audioClips)?m.audioClips:[]).forEach(function(clip){if(clip)duration=Math.max(duration,Math.max(0,number(clip.start,0))+Math.max(0,number(clip.duration,0)));});
  (Array.isArray(m.sfx)?m.sfx:[]).forEach(function(cue){if(cue)duration=Math.max(duration,Math.max(0,number(cue.t,0))+Math.max(0,number(cue.duration,0)));});return duration;
 }
 var duration=runningDuration(source),titleText=label(source.name,cleanTitle(sourceTitle)),actCount=0;
 (Array.isArray(source.scenes)?source.scenes:[]).forEach(function(clip){var name=resolve(clip&&clip.sourceId,clip&&(clip.source||clip.animation||clip.theatre)),child=read(name);if(child&&Array.isArray(child.scenes)&&child.scenes.length)actCount++;});
 function add(name,caption,start,end,group,occurrence){if(!(end>start+1e-8))return;if(rows.length>=limit){incomplete=true;return;}var previous=rows[rows.length-1];caption=label(caption,cleanTitle(name));group=label(group);
  if(previous&&lastOccurrence===occurrence&&previous.title===name&&previous.label===caption&&previous.group===group&&Math.abs(previous.start+previous.duration-start)<.002){previous.duration=round(end-previous.start);return;}
  rows.push({title:name,label:caption,start:round(start),duration:round(end-start),group:group});
  lastOccurrence=occurrence;
 }
 function cut(range,values){var times=[range.start,range.end];if(range.rate){values.forEach(function(value){var at=range.start+(value-range.offset)/range.rate;if(at>range.start+1e-8&&at<range.end-1e-8)times.push(at);});}times.sort(function(a,b){return a-b;});var result=[];for(var i=0;i<times.length-1;i++)if(times[i+1]-times[i]>1e-8)result.push({start:times[i],end:times[i+1],offset:range.offset+(times[i]-range.start)*range.rate,rate:range.rate});return result;}
 function normalizedWindows(range,sourceLength,loop){
  if(!(sourceLength>0))return [{start:range.start,end:range.end,offset:0,rate:0}];var boundaries=[0,sourceLength];
  if(loop&&range.rate){var end=range.offset+(range.end-range.start)*range.rate,min=Math.min(range.offset,end),max=Math.max(range.offset,end),from=Math.floor(min/sourceLength)+1,to=Math.floor(max/sourceLength);boundaries=[];
   var count=to-from;if(count>limit){count=limit;incomplete=true;}for(var n=0;n<=count;n++)boundaries.push((from+n)*sourceLength);
  }
  return cut(range,boundaries).map(function(piece){var mid=piece.offset+(piece.end-piece.start)*piece.rate/2;if(loop){var cycle=Math.floor(mid/sourceLength);return {start:piece.start,end:piece.end,offset:piece.offset-cycle*sourceLength,rate:piece.rate};}
   if(mid<=0)return {start:piece.start,end:piece.end,offset:0,rate:0};if(mid>=sourceLength)return {start:piece.start,end:piece.end,offset:sourceLength,rate:0};return piece;
  });
 }
 function childWindows(parent,clipBegin,settings,sourceLength){var span=Math.max(.1,number(settings.duration,4)),delay=number(settings.start,0),speed=number(settings.speed,1),offset=number(settings.offset,0),input={start:parent.start,end:parent.end,offset:parent.offset-clipBegin,rate:parent.rate},result=[];
  cut(input,[0,span,delay]).forEach(function(piece){var mid=piece.offset+(piece.end-piece.start)*piece.rate/2,position=clamp(piece.offset,0,span),rate=mid<0||mid>span?0:piece.rate;
   var raw=mid<delay?{start:piece.start,end:piece.end,offset:offset,rate:0}:{start:piece.start,end:piece.end,offset:(Math.max(position,delay)-delay)*speed+offset,rate:rate*speed};
   normalizedWindows(raw,sourceLength,settings.loop===true).forEach(function(window){result.push(window);});
  });return result;
 }
 function walk(scene,name,range,group,caption,depth,path,occurrence){
  if(rows.length>=limit||++visits>limit*4){incomplete=true;return;}if(depth>maximumDepth||path.indexOf(name)>=0){incomplete=true;return;}
  var clips=Array.isArray(scene.scenes)?scene.scenes:[];if(!clips.length){add(name,caption||scene.name,range.start,range.end,group,occurrence);return;}
  var starts=[],elapsed=0;clips.forEach(function(clip){starts.push(elapsed);elapsed+=Math.max(.1,number(clip&&clip.duration,4));});
  var nextPath=path.concat(name);cut(range,starts.slice(1)).forEach(function(piece){if(rows.length>=limit||visits>limit*4)return;var mid=piece.offset+(piece.end-piece.start)*piece.rate/2,index=clips.length-1;for(var i=0;i<clips.length-1;i++)if(mid<starts[i+1]){index=i;break;}
   var settings=clips[index]||{},childTitle=resolve(settings.sourceId,settings.source||settings.animation||settings.theatre),child=read(childTitle);if(!child){incomplete=true;return;}
   var caption=label(settings.name,child.name||cleanTitle(childTitle)),hasChildren=Array.isArray(child.scenes)&&child.scenes.length,nextGroup=hasChildren?label(group?group+" · "+caption:caption):group;
   childWindows(piece,starts[index],settings,sceneDuration(child)).forEach(function(window){walk(child,childTitle,window,nextGroup,caption,depth+1,nextPath,occurrence+"/"+index);});
  });
 }
 walk(source,sourceTitle,{start:0,end:duration,offset:0,rate:1},"",titleText,0,[],"root");
 var result={title:titleText,sourceTitle:sourceTitle,duration:round(duration),scenes:rows,sceneCount:rows.length,actCount:actCount};if(incomplete)result.incomplete=true;return result;
}
function animusProgramHtml(info,lang){
 if(!info)return "";var da=/^da(?:-|$)/i.test(String(lang||""));
 function escape(value){return String(value===undefined||value===null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
 function time(value){var total=Math.max(0,Math.round(Number(value)||0)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return hours?hours+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0"):minutes+":"+String(seconds).padStart(2,"0");}
 var scenes=Array.isArray(info.scenes)?info.scenes:[],count=scenes.length,acts=Math.max(0,Number(info.actCount)||0),program=da?"Program":"Programme",html='<section class="huw-animus-program" aria-label="'+program+'"><h2 class="huw-animus-program-title">'+escape(info.title)+'</h2><p class="huw-animus-program-summary">'+(da?"Varighed":"Duration")+' <strong class="huw-animus-program-duration">'+time(info.duration)+'</strong> · '+count+' '+(da?count===1?"scene":"scener":count===1?"scene":"scenes")+(acts?' · '+acts+' '+(da?acts===1?"akt":"akter":acts===1?"act":"acts"):"")+'</p>';
 var group=null,opened=false;scenes.forEach(function(scene){var current=String(scene.group||"");if(!opened||current!==group){if(opened)html+='</ol></section>';html+='<section class="huw-animus-program-group">'+(current?'<h3>'+escape(current)+'</h3>':"")+'<ol class="huw-animus-program-scenes">';opened=true;group=current;}
  var start=Math.max(0,Number(scene.start)||0);html+='<li data-scene-start="'+start+'"><time class="huw-animus-program-start">'+time(start)+'</time><span class="huw-animus-program-scene-title">'+escape(scene.label||scene.title)+'</span><small class="huw-animus-program-scene-duration">'+time(scene.duration)+'</small></li>';
 });if(opened)html+='</ol></section>';return html+'</section>';
}
