/*\
title: $:/plugins/huwiki/abc/cue-widget.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require("$:/core/modules/widgets/widget.js").widget;
var cue=require("$:/plugins/huwiki/abc/cue-sheet.js");
var loader=require("$:/plugins/huwiki/abc/loader.js");
var ABC=require("$:/plugins/huwiki/abc/vendor/abcjs.js");
var Print=require("$:/plugins/huwiki/abc/print-export.js");
var font=require("$:/plugins/huwiki/abc/jazz-font.js");
var I18n=require("$:/plugins/huwiki/abc/i18n.js");
var selection="$:/temp/huwiki/abc/cue-selection",legacy="$:/config/huwiki/abc/cue-settings",prefs="$:/config/huwiki/abc/print-parts/";
function node(d,tag,text){var n=d.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function field(parent,label,input){
 var wrap=node(parent.ownerDocument,"label",label+" ");input.setAttribute("aria-label",label);
 wrap.appendChild(input);parent.appendChild(wrap);return input;
}
function select(parent,label,choices,value,change){
 var d=parent.ownerDocument,ctrl=node(d,"select");
 choices.forEach(function(c){var opt=node(d,"option",c[1]);opt.value=c[0];ctrl.appendChild(opt);});
 ctrl.value=String(value);ctrl.onchange=function(){change(ctrl.value);};return field(parent,label,ctrl);
}
function check(parent,label,value,change){
 var d=parent.ownerDocument,wrap=node(d,"label"),ctrl=node(d,"input");ctrl.type="checkbox";ctrl.checked=value;
 ctrl.onchange=function(){change(ctrl.checked);};wrap.append(ctrl,d.createTextNode(" "+label));parent.appendChild(wrap);return ctrl;
}
function group(parent,name){
 var g=node(parent.ownerDocument,"fieldset");g.appendChild(node(parent.ownerDocument,"legend",name));parent.appendChild(g);return g;
}
function number(parent,label,value,min,max,change){
 var input=node(parent.ownerDocument,"input");input.type="number";input.min=min;input.max=max;input.step=1;input.value=value;
 input.onchange=function(){input.value=Math.max(min,Math.min(max,Math.round(Number(input.value))||0));change(Number(input.value));};return field(parent,label,input);
}
function CueWidget(tree,options){this.initialise(tree,options);}
CueWidget.prototype=new Widget();
CueWidget.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();this.host=node(this.document,"section");this.host.className="huwabc-cues";
 parent.insertBefore(this.host,nextSibling);this.domNodes.push(this.host);if(!this.document.isTiddlyWikiFakeDom)this.draw();
};
CueWidget.prototype.draw=function(){
 var self=this,wiki=this.wiki,d=this.document,host=this.host,en=I18n.language(wiki)==="en",tr=(da,eng)=>en?eng:da;
 var sets=wiki.filterTiddlers("[repertoire-kind[setlist]sort[name]]"),orchestras=wiki.filterTiddlers("[repertoire-kind[orchestra]sort[name]]");
 function fields(id){return (id&&wiki.getTiddler(id)?.fields)||{};}
 var single=this.getAttribute("score",""),requested=this.getAttribute("setlist","")||wiki.getTiddlerText(selection,wiki.getTiddlerText("$:/config/huwiki/abc/cue-default",""));
 var choices=sets.concat(orchestras).map(function(id){
  var f=fields(id),o=fields(f["orchestra-title"]);
  return [id,f["repertoire-kind"]==="setlist"?[o.name,f.name||id].filter(Boolean).join(" · "):(f.name||id)+" · "+tr("Hele repertoiret","Full repertoire")];
 });
 if(single)choices=[[single,single]];
 else if(requested&&!choices.some(c=>c[0]===requested)&&loader.getSource(wiki,requested))choices.unshift([requested,requested]);
 if(!choices.length)choices=wiki.filterTiddlers("[has[abc-source]] [type[text/vnd.abc]] +[unique[]sort[title]]").map(id=>[id,id]);
 var selected=choices.find(c=>c[0]===(self.selected||requested))||choices[0];
 host.replaceChildren();if(!selected){host.appendChild(node(d,"p",tr("Ingen ABC-noder i wikien.","No ABC scores in this wiki.")));return;}
 var id=selected[0],kind=fields(id)["repertoire-kind"],items=[id],model,live;
 if(kind==="setlist"||kind==="orchestra"){
  model=require("$:/plugins/huwiki/repertoire/model.js");live=require("$:/plugins/huwiki/repertoire/live-score.js");
  items=kind==="setlist"?model.entries(wiki,id):model.items(wiki,id).map(t=>t.fields.title);
 }
 var key=prefs+encodeURIComponent(id),store=wiki.getTiddlerData(key,{})||{},prior=wiki.getTiddlerData(legacy,{})||{};
 var g=Object.assign({scope:"excerpt",mode:"with",instrument:"auto",style:"plain",perLine:4,formLabels:true,
  customName:"",customSteps:0,agreements:["key"]},store.options);
 var saved=Object.assign(Object.create(null),store.rows||{}),rows=[];
 function save(){wiki.setTiddlerData(key,{options:g,rows:saved});}
 var tools=node(d,"div");tools.className="huwabc-cue-tools";host.appendChild(tools);
 if(choices.length>1)select(tools,tr("Sætliste","Set list"),choices,id,function(v){self.selected=v;self.draw();});
 var print=node(d,"button",tr("Udskriv / PDF","Print / PDF"));print.type="button";print.className="huwabc-cue-print";tools.appendChild(print);
 var opt=group(host,tr("Udskrift","Print settings"));
 function update(k,v){g[k]=v;save();self.draw();}
 var scopeChoices=[["excerpt",tr("Stiknoder","Cue excerpts")],["full",tr("Hele nummeret","Full piece")],["parts",tr("Valgte formdele","Selected form sections")]];
 var modes=[["with",tr("Noder med becifringer","Notes with chord symbols")],["without",tr("Noder uden becifringer","Notes without chord symbols")],["only",tr("Kun becifringer","Chord chart only")]];
 select(opt,tr("Omfang","Range"),scopeChoices,g.scope,v=>update("scope",v));
 select(opt,tr("Indhold","Contents"),modes,g.mode,v=>update("mode",v));
 var instruments=[["source",tr("Som i kilden (også capogreb)","As written (including capo shapes)")]].concat(Object.keys(cue.instruments).map(k=>[k,cue.instruments[k][en?"labelEn":"labelDa"]]),[["custom",tr("Eget instrument","Custom instrument")]]);
 select(opt,tr("Instrument for hele arket","Instrument for the sheet"),[["auto",tr("Vælg pr. nummer","Choose per piece")]].concat(instruments),g.instrument,v=>update("instrument",v));
 function custom(parent,obj,commit){
  var name=node(d,"input");name.type="text";name.value=obj.customName||"";name.onchange=function(){obj.customName=name.value.trim();commit();};
  field(parent,tr("Instrumentnavn","Instrument name"),name);
  number(parent,tr("Skrevet over klang C (halvtoner)","Written above concert pitch (semitones)"),obj.customSteps||0,-48,48,v=>{obj.customSteps=v;commit();});
 }
 if(g.instrument==="custom")custom(opt,g,()=>{save();self.draw();});
 var formatting=group(host,tr("Form og layout","Form and layout"));
 if(g.mode!=="without")select(formatting,tr("Becifring","Chord style"),[["plain",tr("Standard · Cm7♭5","Standard · Cm7♭5")],["jazz",tr("Jazz · Cø7","Jazz · Cø7")]],g.style,v=>update("style",v));
 select(formatting,tr("Takter pr. linje","Bars per line"),[2,4,8].map(n=>[n,n]),g.perLine,v=>update("perLine",Number(v)));
 check(formatting,tr("Vis navne på formdele","Show section labels"),g.formLabels,v=>update("formLabels",v));
 if(g.style==="jazz")font.ready(d);
 var agreements=[["key",tr("Tonearter","Keys")],["tempo",tr("Tempo","Tempo")],["form",tr("Formaftale","Form instructions")],["instrumentation",tr("Besætning / capo","Instrumentation / capo")],["cues",tr("Stikord","Cues")]];
 var agreementPanel=group(host,tr("Spilleaftaler på arket","Playing instructions on the sheet"));
 agreements.forEach(function(a){
  check(agreementPanel,a[1],g.agreements.includes(a[0]),function(on){
   g.agreements=on?g.agreements.concat(a[0]):g.agreements.filter(k=>k!==a[0]);
   rows.forEach(r=>r.resetAgreement?.(a[0]));save();rows.forEach(r=>r.updateDetails?.());
  });
 });
 this.watched=new Set(sets.concat(orchestras,items,[key,"$:/language"]));
 function ready(){print.disabled=!rows.some(r=>r.include)||rows.some(r=>r.include&&!r.systems.length);}
 items.forEach(function(item,index){
  var itemFields=fields(item),title=itemFields["music-title"]||item;self.watched.add(title);
  var data=itemFields["music-title"]?(kind==="setlist"?model.effective(wiki,id,item):model.baseline(wiki,item)):{};
  var source=loader.getSource(wiki,title)||"",name=(/^T:\s*(.+)/m.exec(source)||[])[1]||title;
  if(data.instrumentation&&/ · (?:.*(?:-sax|capo\b|[- ]greb))/i.test(name))name=name.split(" · ")[0];
  var cfg=Object.assign({},prior[item],saved[item]),row={name:name,details:[],systems:[],include:cfg.include!==false};
  rows.push(row);function persist(){saved[item]=cfg;save();}
  var card=node(d,"section");card.className="huwabc-cue-row";host.appendChild(card);
  var h=node(d,"h3");card.appendChild(h);
  check(h,(index+1)+". "+name,row.include,v=>{cfg.include=v;persist();self.draw();});
  if(!row.include)return;
  var controls=node(d,"div");controls.className="huwabc-cue-controls";card.appendChild(controls);
  var summary=node(d,"div");summary.className="huwabc-cue-meta";card.appendChild(summary);
  var music=node(d,"div");music.className="huwabc-cue-music";card.appendChild(music);
  try{
   if(!source)throw Error(tr("Denne post har ingen ABC-node. Fjern fluebenet for at springe den over.","This entry has no ABC score. Uncheck it to skip it."));
   if(live)source=live.apply(ABC,source,data).source;
   var info=cue.describe(source);
   if(!info.length)throw Error(tr("Noden indeholder ingen takter.","This score has no bars."));
   var voices=info.voices,suggested=Math.max(0,voices.findIndex(v=>v.sounding>0));
   if(!Array.isArray(cfg.voices))cfg.voices=[Number.isInteger(cfg.voice)?cfg.voice:suggested];
   cfg.voices=cfg.voices.filter(i=>voices[i]);
   if(!cfg.part)cfg.part=cue.part(name===title?title:(/^T:\s*(.+)/m.exec(source)||[])[1]||title);
   if(!instruments.some(x=>x[0]===cfg.part))cfg.part="source";
   if(!Array.isArray(cfg.sections))cfg.sections=info.sections.map(p=>p.start);
   cfg.start=Math.min(info.length,Math.max(1,Number(cfg.start)||1));cfg.count=Math.max(1,Math.min(info.length,Number(cfg.count)||2));
   function change(k,v){cfg[k]=v;persist();render();}
   if(g.instrument==="auto"){
    select(controls,tr("Instrument","Instrument"),instruments,cfg.part,v=>{cfg.part=v;persist();self.draw();});
    if(cfg.part==="custom")custom(controls,cfg,()=>{persist();render();});
   }
   if(g.mode!=="only"){
    var voiceGroup=group(controls,tr("Stemmer","Voices"));
    voices.forEach(function(v,i){check(voiceGroup,v.name||tr("Stemme ","Voice ")+(i+1),cfg.voices.includes(i),function(on){
     change("voices",on?cfg.voices.concat(i).sort((a,b)=>a-b):cfg.voices.filter(x=>x!==i));
    });});
   }
   if(g.scope==="excerpt"){
    number(controls,tr("Fra takt","From bar"),cfg.start,1,info.length,v=>change("start",v));
    number(controls,tr("Antal takter","Number of bars"),cfg.count,1,info.length,v=>change("count",v));
   }else if(g.scope==="parts"){
    var parts=group(controls,tr("Formdele","Form sections"));
    if(!info.sections.length)parts.appendChild(node(d,"span",tr("Ingen navngivne formdele. Vælg takter eller hele nummeret.","No named sections. Choose an excerpt or the full piece.")));
    info.sections.forEach(function(p){check(parts,(p.name||tr("Indledning","Introduction"))+" ("+(p.start+1)+"–"+p.end+")",cfg.sections.includes(p.start),on=>change("sections",on?cfg.sections.concat(p.start):cfg.sections.filter(x=>x!==p.start)));});
   }
   var exceptions=Object.assign(Object.create(null),cfg.agreementChoices||{});
   function chosen(a){return Object.hasOwn(exceptions,a.id)?exceptions[a.id]:g.agreements.includes(a.key);}
   row.resetAgreement=function(k){Object.keys(exceptions).filter(id=>id.startsWith(k+"=")).forEach(id=>delete exceptions[id]);cfg.agreementChoices=exceptions;saved[item]=cfg;};
   var keyChoice={id:"key=key",key:"key",label:agreements[0][1],text:""};
   var available=agreements.slice(1).flatMap(function(a){
    var lines=String(data[a[0]]||"").split(/\r?\n/);
    if(a[0]==="form"||a[0]==="cues")lines=lines.flatMap(line=>line.replace(/([.!?])\s+(?=[A-ZÆØÅČŠŽ])/gu,"$1\n").split("\n"));
    return lines.map(t=>t.trim()).filter(Boolean).map(t=>({id:a[0]+"="+t,key:a[0],text:t,label:a[1]}));
   });
   var rowChoices=[keyChoice].concat(available);
   if(rowChoices.length){
    var details=node(d,"details");details.className="huwabc-cue-agreements";card.insertBefore(details,summary);
    details.appendChild(node(d,"summary",tr("Vælg aftaler for dette nummer","Choose instructions for this piece")));
    rowChoices.forEach(a=>check(details,a.text?a.label+" · "+a.text:a.label,chosen(a),function(on){
     exceptions[a.id]=on;cfg.agreementChoices=exceptions;persist();row.updateDetails();
    }));
    row.syncChecks=function(){Array.from(details.querySelectorAll("input")).forEach((el,i)=>el.checked=chosen(rowChoices[i]));};
   }
   var pitched="",base="";
   row.updateDetails=function(){
    row.details=[base].filter(Boolean);
    if(chosen(keyChoice)&&pitched)row.details.push(pitched);
    available.filter(chosen).forEach(a=>row.details.push(a.label+" · "+a.text));
    summary.replaceChildren(...row.details.map(t=>node(d,"div",t)));row.syncChecks?.();
   };
   function render(){
    var instrument=g.instrument==="auto"?cfg.part:g.instrument;
    var customOptions=g.instrument==="auto"?cfg:g;
    var instrumentName=instrument==="custom"?customOptions.customName||tr("Eget instrument","Custom instrument"):instruments.find(x=>x[0]===instrument)?.[1];
    var start=g.scope==="parts"?Math.min(...cfg.sections):g.scope==="full"?0:cfg.start-1;
    var rangeName=g.scope==="full"?tr("Hele nummeret","Full piece"):g.scope==="parts"?info.sections.filter(p=>cfg.sections.includes(p.start)).map(p=>p.name||tr("Indledning","Introduction")).join(", "):tr("Takt ","Bars ")+cfg.start+"–"+Math.min(cfg.start+cfg.count-1,info.length);
    base=[instrumentName,rangeName].filter(Boolean).join(" · ");pitched="";row.systems=[];music.replaceChildren();
    var message=!cfg.voices.length&&g.mode!=="only"?tr("Vælg mindst én stemme.","Select at least one voice."):
      g.scope==="parts"&&(!info.sections.length||!cfg.sections.length)?tr("Vælg en formdel eller et andet omfang.","Select a section or another range."):"";
    if(!message){try{
     var result=cue.render(music,source,info,Object.assign({},cfg,g,{voices:cfg.voices,sections:cfg.sections,start:cfg.start,count:cfg.count,part:instrument,customSteps:Number(customOptions.customSteps)||0,en:en}));
     row.systems=result.systems;
     pitched=[info.keys[start]&&tr("Klingende ","Concert ")+info.keys[start],result.written&&tr("Skrevet ","Written ")+result.written].filter(Boolean).join(" · ");
     if(!row.systems.length)message=tr("Ingen noder i det valgte udsnit.","No music in the selected range.");
    }catch(e){message=e.message;}}
    if(message)music.textContent=message;row.updateDetails();ready();
   }
   render();
  }catch(e){music.textContent=e.message;}
 });
 ready();print.onclick=function(){
  var subtitle=modes.find(m=>m[0]===g.mode)[1]+" · "+scopeChoices.find(s=>s[0]===g.scope)[1];
  var title=selected[1],pages=cue.pages(d,title,rows.filter(r=>r.include),en,subtitle);
  Print.open({doc:d,language:en?"en":"da",title:title+" · "+subtitle,filename:(title+" - "+subtitle).replace(/[\\/:*?"<>|]/g,"-")+".pdf",
   css:g.style==="jazz"?font.css():"",geom:{width:210,height:297,margin:8},pages:pages});
 };
};
CueWidget.prototype.refresh=function(changes){
 var attrs=this.computeAttributes();
 if(Object.keys(attrs).length||changes[selection]){this.selected=null;this.refreshSelf();return true;}
 var watched=this.watched,wiki=this.wiki;
 if(watched&&Object.keys(changes).some(function(k){
  if(k.startsWith(prefs))return false;
  if(watched.has(k))return true;
  var t=wiki.getTiddler(k);return t&&["setlist","orchestra","orchestra-item"].includes(t.fields["repertoire-kind"]);
 })){this.draw();return true;}
 return false;
};
exports["huwiki-abc-cues"]=CueWidget;
})();
