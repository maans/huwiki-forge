/*\
title: $:/plugins/huwiki/abc/cue-sheet.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
var ABC=require("$:/plugins/huwiki/abc/vendor/abcjs.js");
var collect=require("$:/plugins/huwiki/abc/repeat-plan.js").collect;
var chords=require("$:/plugins/huwiki/abc/chord-chart.js");
var notation=require("$:/plugins/huwiki/abc/instrument-view.js").profiles;
var NS="http://www.w3.org/2000/svg",width=680,height=974;
var instruments=Object.assign({},notation);
function instrument(id,steps,da,en){
 instruments[id]={semitones:steps,labelDa:da,labelEn:en,printDa:da,printEn:en};
}
instrument("bbwind",2,"B♭ · trompet / klarinet","B♭ · trumpet / clarinet");
instrument("tenor",14,"B♭ · tenorsax / basklarinet","B♭ · tenor sax / bass clarinet");
instrument("baritone",21,"E♭ · barytonsax","E♭ · baritone sax");
instrument("horn",7,"F · horn / engelskhorn","F · horn / cor anglais");
instrument("strings",12,"C · guitar / kontrabas (+8va)","C · guitar / double bass (+8va)");
instrument("piccolo",-12,"C · piccolo (−8va)","C · piccolo (−8va)");
function part(title){
 if(/tenorsax|tenor sax/i.test(title))return "tenor";
 if(/altsax|alto sax/i.test(title))return "ebalto";
 if(/sopranino|E[b♭][- ]sax/i.test(title))return "eb";
 if(/sopransax|soprano sax|B[b♭][- ]sax/i.test(title))return "bb";
 return "source";
}
function offset(source){
 var header=String(source).split(/^\s*K:/m)[0],matches=Array.from(header.matchAll(/^%%MIDI\s+transpose\s+([+-]?\d+)[ \t]*(?:%[^\n]*)?$/gmi));
 return matches.length?Number(matches[matches.length-1][1]):0;
}
function formName(e){
 if(e.el_type==="part")return e.title;
 var mark=(e.chord||[]).find(function(c){return c.position&&c.position!=="default"&&/^(?:[A-Z](?:\d+|['′])?|intro|outro|coda|trio|bridge|vers(?:e)?|omkvæd|chorus)$/i.test(c.name.trim());});
 return mark&&mark.name.trim();
}
function describe(source){
 var tune=ABC.parseOnly(source,{visualTranspose:offset(source)})[0],voices=collect(tune).voices;
 var length=Math.max(0,...voices.map(function(v){return v.measures.length;})),markers=new Map();
 voices.forEach(function(v){v.annotations.forEach(function(a){
  var name=formName(a.event);
  if(name&&a.bar<length&&!markers.has(a.bar))markers.set(a.bar,name);
 });});
 var starts=Array.from(markers.keys()).sort(function(a,b){return a-b;});
 if(starts.length&&starts[0]>0)starts.unshift(0);
 var keyVoice=voices.find(v=>v.measures.length===length);
 var keys=keyVoice?keyVoice.measures.map(m=>{var k=m.header.key;return k&&k.root&&k.root!=="none"?k.root+(k.acc||"")+(k.mode||""):"";}):[];
 return {length:length,keys:keys,sections:starts.map(function(n,i){return {start:n,end:starts[i+1]||length,name:markers.get(n)||""};}),
  voices:voices.map(function(v){
   var staff=tune.lines.find(function(l){return l.staff&&l.staff[v.staffIndex];}).staff[v.staffIndex];
   return {name:(staff.title||[])[v.voiceIndex]||"",count:v.measures.length,sounding:v.sounding};
  })};
}
function systemRanges(info,s){
 var ranges=[];
 if(s.scope==="parts")ranges=info.sections.filter(function(p){return s.sections.includes(p.start);});
 else if(s.scope==="full")ranges=[{start:0,end:info.length}];
 else ranges=[{start:s.start-1,end:Math.min(info.length,s.start-1+s.count)}];
 var systems=[];
 ranges.forEach(function(r){
  for(var i=r.start;i<r.end;i+=s.perLine)systems.push({start:i,end:Math.min(r.end,i+s.perLine)});
 });
 return systems;
}
function svgNode(d,tag,attrs,value){
 var n=d.createElementNS(NS,tag);Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});
 if(value!==undefined)n.textContent=value;return n;
}
function label(d,svg,x,y,size,value,attrs){
 var n=svgNode(d,"text",Object.assign({x:x,y:y,"font-size":size,"font-family":"sans-serif",fill:"#17212a"},attrs),value);
 svg.appendChild(n);return n;
}
function jazz(name){
 return name.replace(/(maj|Maj|M)7/g,"Δ7").replace(/m7(?:b|♭)5/g,"ø7").replace(/dim(?=\d|$)/g,"°").replace(/#/g,"♯").replace(/([A-G0-9])b/g,"$1♭");
}
function chordSymbol(c){return !c.position||c.position==="default";}
function barAt(voices,n){
 var events=voices.flatMap(function(v){return v.boundaries[n]?.events||[];});
 return {left:events.some(e=>["bar_left_repeat","bar_dbl_repeat"].includes(e.type)),
  right:events.some(e=>["bar_right_repeat","bar_dbl_repeat"].includes(e.type)),
  double:events.some(e=>["bar_thin_thin","bar_thin_thick","bar_thick_thin"].includes(e.type)),
  ending:events.find(e=>e.startEnding)?.startEnding||""};
}
function chordSystem(d,voices,chart,range,info,s){
 var svg=svgNode(d,"svg",{viewBox:"0 0 680 70",width:"100%",role:"img","aria-label":s.en?"Chord chart":"Becifringsark","class":"huwabc-chord-system"});
 var span=range.end-range.start,cell=656/s.perLine,top=30,base=59;
 function rule(x1,y1,x2,y2,weight){svg.appendChild(svgNode(d,"line",{x1:x1,y1:y1,x2:x2,y2:y2,stroke:"#38464b","stroke-width":weight||1.5}));}
 function dots(x){[39,49].forEach(y=>svg.appendChild(svgNode(d,"circle",{cx:x,cy:y,r:1.8,fill:"#17212a"})));}
 for(var i=0;i<=span;i++){
  var n=range.start+i,x=12+i*cell,b=barAt(voices,n);
  rule(x,top,x,base,b.left||b.right?2.5:1);
  if(b.right&&i>0){rule(x-3.5,top,x-3.5,base);dots(x-7);}
  if(b.left&&i<span){rule(x+3.5,top,x+3.5,base);dots(x+7);}
  if(b.double&&!b.right&&!b.left&&i>0)rule(x-3,top,x-3,base);
  if(i===span)break;
  if(b.ending){rule(x+3,26,x+3,15);rule(x+3,15,x+cell-4,15);label(d,svg,x+7,26,11,String(b.ending)+".");}
  var section=info.sections.find(p=>p.start===n);
  if(s.formLabels&&section?.name)label(d,svg,x+3,12,13,section.name,{"font-weight":"bold"});
  var measure=chart.measures.find(m=>m.number===n+1),symbols=measure?measure.chords.slice():[];
  var reference=voices.find(v=>v.measures[n])?.measures[n];
  if(i===0&&reference&&(!symbols.length||symbols[0].time>reference.start+0.00001)){
   var prev=chart.chords.filter(c=>c.time<reference.start-0.00001).pop();
   if(prev)symbols.unshift({name:prev.name,time:reference.start});
  }
  var inner=cell-21;
  var positions=symbols.map(function(c,j){
   var beat=reference?(c.time-reference.start)/reference.duration:j/symbols.length;
   return Math.max(0,Math.min(0.94,beat));
  });
  // When voices supply different symbols at the same beat, give both room.
  if(positions.some((v,j)=>j>0&&v-positions[j-1]<0.12))positions=symbols.map((_,j)=>j/symbols.length);
  symbols.forEach(function(symbol,j){
   var name=s.style==="jazz"?jazz(symbol.name):symbol.name,size=s.style==="jazz"?25:21;
   var room=((positions[j+1]??1)-positions[j])*inner;
   var txt=label(d,svg,x+11+positions[j]*inner,51,size,name,{"font-family":s.style==="jazz"?"PetalumaScript, sans-serif":"sans-serif"});
   if(name.length*size*.59>room-3){txt.setAttribute("textLength",Math.max(8,room-3));txt.setAttribute("lengthAdjust","spacingAndGlyphs");}
  });
 }
 return svg;
}
function render(host,source,info,s){
 host.replaceChildren();
 var selected=s.voices,profile=instruments[s.part];
 var steps=s.part==="source"?0:offset(source)+(profile?profile.semitones:s.customSteps);
 var ranges=systemRanges(info,s),systems=[],written="",model,chart,attachments=[];
 if(!ranges.length)return {systems:[],written:""};
 ABC.renderAbc(host,source,{visualTranspose:steps,oneSvgPerLine:true,staffwidth:650,stretchlast:0,
  paddingtop:2,paddingbottom:4,paddingleft:3,paddingright:3,add_classes:true,responsive:"resize",
  format:{gchordfont:s.style==="jazz"?"PetalumaScript 18":"Helvetica 15"},
  afterParsing:function(tune){
   model=collect(tune).voices;
   chart=chords.extract({parseOnly:function(){return [tune];}},source);
   var first=model[selected[0]]?.measures[ranges[0].start]||model.find(v=>v.measures[ranges[0].start])?.measures[ranges[0].start];
   var key=first?.header.key;
   if(key&&key.root&&key.root!=="none")written=key.root+(key.acc||"")+(key.mode||"");
   var lines=[];
   ranges.forEach(function(range){
    var staves=[],visibleChords=new Set();
    selected.forEach(function(slot){
     var voice=model[slot],ms=voice?.measures.slice(range.start,range.end);
     if(!ms?.length)return;
     var staff=Object.assign({},ms[0].header),events=[];
     if(!staff.meter)staff.meter=voice.measures[0].header.meter;
     delete staff.brace;delete staff.bracket;delete staff.connectBarLines;
     if(selected.length>1)staff.title=[info.voices[slot].name||String(slot+1)];else delete staff.title;
     ms.forEach(function(m,j){
      var index=range.start+j;
      if(!j&&!m.events.some(e=>e.el_type==="bar"&&e===m.events[0])){
       var boundary=barAt(model,index);
       if(boundary.left||boundary.ending)events.push({el_type:"bar",type:boundary.left?"bar_left_repeat":"bar_thin",startEnding:boundary.ending||undefined});
      }
      var section=info.sections.find(p=>p.start===index);
      if(s.formLabels&&!staves.length&&section?.name&&!m.events.some(e=>formName(e)===section.name))events.push({el_type:"part",title:section.name});
      m.events.forEach(function(orig){
       if(!s.formLabels&&orig.el_type==="part")return;
       var e=Object.assign({},orig);
       if(e.el_type==="bar"&&orig===m.events[m.events.length-1]){
        var edge=barAt(model,index+1);
        if(edge.left||edge.right)e.type=edge.left&&edge.right?"bar_dbl_repeat":edge.left?"bar_left_repeat":"bar_right_repeat";
        if(edge.ending&&!e.startEnding)e.startEnding=edge.ending;
       }
       if(e.chord)e.chord=e.chord.filter(c=>chordSymbol(c)?s.mode==="with":s.formLabels||!formName({chord:[c]})).map(function(c){
        if(!chordSymbol(c))return c;
        visibleChords.add((index+1)+"|"+orig.startChar+"|"+c.name);return s.style==="jazz"?Object.assign({},c,{name:jazz(c.name)}):c;
       });
       events.push(e);
      });
     });
     staff.voices=[events];staves.push(staff);
    });
    if(staves.length&&s.mode!=="only"){
     var missing=s.mode==="with"&&chart.chords.some(c=>c.measure>range.start&&c.measure<=range.end&&!visibleChords.has(c.measure+"|"+c.startChar+"|"+c.name));
     if(missing)staves.forEach(staff=>staff.voices[0].forEach(e=>{if(e.chord)e.chord=e.chord.filter(c=>!chordSymbol(c));}));
     lines.push({staff:staves});attachments.push(missing?range:null);
    }
   });
   tune.metaText={};tune.metaTextInfo={};tune.lines=lines;
  }});
 if(s.mode==="only"){
  host.replaceChildren();if(!chart.chords.length)throw Error(s.en?"This score has no chord symbols. Choose notes or uncheck it.":"Noden har ingen becifringer. Vælg noder, eller fjern fluebenet ved nummeret.");
  ranges.forEach(function(r){var svg=chordSystem(host.ownerDocument,model,chart,r,info,s);host.appendChild(svg);systems.push(svg);});
 }else{
  Array.from(host.querySelectorAll("svg")).filter(svg=>svg.viewBox.baseVal.height>0).forEach(function(svg,i){
   systems.push(svg);if(attachments[i]){
    var extra=chordSystem(host.ownerDocument,model,chart,attachments[i],info,s);
    svg.parentNode.insertBefore(extra,svg.nextSibling);systems.push(extra);
   }
  });
 }
 return {systems:systems,written:written};
}
function wrap(value,max){
 var lines=[],line="";
 String(value).split(/\s+/).filter(Boolean).forEach(function(word){
  if(line&&line.length+word.length+1>max){lines.push(line);line="";}
  while(word.length>max){if(line){lines.push(line);line="";}lines.push(word.slice(0,max));word=word.slice(max);}
  line+=(line?" ":"")+word;
 });if(line)lines.push(line);return lines;
}
function pages(d,title,rows,en,subtitle){
 var result=[],paper,y;
 function sheet(){
  var page=d.createElement("section");page.className="huwabc-page";
  var body=d.createElement("div");body.className="huwabc-page-body";body.style.cssText="width:90%;margin:8mm auto 0";
  var block=d.createElement("div");block.className="huwabc-system-block";
  paper=svgNode(d,"svg",{viewBox:"0 0 "+width+" "+height,role:"img"});
  block.appendChild(paper);body.appendChild(block);page.appendChild(body);result.push(page);
  y=20;wrap(title,59).forEach(function(t){label(d,paper,0,y,18,t,{"font-weight":"bold"});y+=21;});
  label(d,paper,0,y,12,subtitle);y+=19;
 }
 rows.forEach(function(row,i){
  var titleLines=wrap((i+1)+". "+row.name,64),meta=row.details.flatMap(t=>wrap(t,89));
  function scaled(svg){var vb=svg.viewBox.baseVal;return Math.min(1.1,width/vb.width,(height-155)/vb.height);}
  var first=row.systems[0],firstH=first?first.viewBox.baseVal.height*scaled(first):20;
  if(!paper||y+titleLines.length*19+Math.min(3,meta.length)*16+firstH+14>height)sheet();
  function words(t,size,bold){if(y+size+8>height)sheet();label(d,paper,0,y+size,size,t,{"font-weight":bold?"bold":"normal"});y+=size+4;}
  paper.appendChild(svgNode(d,"line",{x1:0,y1:y,x2:width,y2:y,stroke:"#abb3b6"}));y+=5;
  titleLines.forEach(t=>words(t,16,true));meta.forEach(t=>words(t,12,false));
  row.systems.forEach(function(svg){
   var vb=svg.viewBox.baseVal,scale=scaled(svg),h=vb.height*scale;
   if(y+h+3>height){sheet();words(row.name,14,true);}
   var g=svgNode(d,"g",{transform:"translate(0 "+y+") scale("+scale+") translate("+(-vb.x)+" "+(-vb.y)+")"});
   Array.from(svg.childNodes).forEach(n=>g.appendChild(n.cloneNode(true)));paper.appendChild(g);y+=h+3;
  });
  y+=8;
 });
 return result;
}
exports.instruments=instruments;exports.part=part;exports.offset=offset;
exports.describe=describe;exports.render=render;exports.pages=pages;
})();
