/**
 * Convert the 17 original MuseScore files using the existing MuseScore→ABC
 * converter bundled with Musik Edition. Preserve every populated voice,
 * chord layer, source filename and Henrik's order.
 *
 * This is a command-line adapter for the existing converter, not a new importer.
 */
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {DOMParser} from "@xmldom/xmldom";
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,"..");
const base=path.join(root,"editions/silva-ethno-repertoire");
const plugin=JSON.parse(await readFile(path.join(root,"plugins/musescore-import/dist/plugin.json"),"utf8"));
const pluginTiddlers=JSON.parse(plugin.text).tiddlers;
let converterSource=pluginTiddlers["$:/plugins/huwiki/musescore-import/converter.js"].text;
// Preserve a voice with only rests or chord symbols; do not drop it merely
// because the rendered note count is zero.
converterSource=converterSource.replace(
 /if\(count\|\|v===0\)voices\.push\(/g,
 "if(count||v===0||measures.some(function(m){return (m.voices[v]||[]).some(function(e){return e.kind==='harmony'||e.kind==='rest';});}))voices.push("
);
// MuseScore 2.x sometimes places Chord/Rest directly under Measure, without a voice wrapper.
// Reuse the same parser but let that measure act as its implicit first voice.
const oldMeasure="els(m,\'voice\').forEach(function(v){result.voices.push(museVoice(v,result,model));});return result;";
const newMeasure="var layers=els(m,\'voice\');if(!layers.length)layers=[m];layers.forEach(function(v){result.voices.push(museVoice(v,result,model));});return result;";
if(!converterSource.includes(oldMeasure))throw Error("Importer compatibility patch target missing");
converterSource=converterSource.replace(oldMeasure,newMeasure);
const doc=new DOMParser().parseFromString("<root><child/></root>","application/xml");
const elementProto=Object.getPrototypeOf(doc.documentElement);
if(!("firstElementChild" in elementProto))Object.defineProperty(elementProto,"firstElementChild",{get(){
 return Array.from(this.childNodes||[]).find(n=>n.nodeType===1)||null;
}});
if(!("nextElementSibling" in elementProto))Object.defineProperty(elementProto,"nextElementSibling",{get(){
 let n=this.nextSibling;while(n&&n.nodeType!==1)n=n.nextSibling;return n||null;
}});
globalThis.DOMParser=DOMParser;
const tmp=await mkdtemp(path.join(os.tmpdir(),"silba-abc-"));
let converter;
try {
 const filename=path.join(tmp,"converter.cjs");
 await writeFile(filename,converterSource);
 converter=require(filename);
}finally{await rm(tmp,{recursive:true,force:true});}
const sources=JSON.parse(await readFile(path.join(base,"tiddlers/songs.json"),"utf8"));
const ready=sources.filter(s=>s["silva-musescore-file"]);
if(ready.length!==17)throw Error("Expected exactly 17 known MuseScore files; got "+ready.length);
const output=[],report=[],used=new Set(),unconverted=[];
for(const song of ready){
 const name=song["silva-musescore-file"];
 const bin=path.join(base,"sources",name);
 const zipEntries=execFileSync("unzip",["-Z1",bin],{encoding:"utf8"}).trim().split(/\r?\n/);
 const scorePath=zipEntries.filter(s=>/\.mscx$/i.test(s)&&!/(^|\/)META-INF\//.test(s))[0];
 if(!scorePath)throw Error("Score MSCX missing inside "+name);
 const raw=execFileSync("unzip",["-p",bin,scorePath],{encoding:"utf8",maxBuffer:30*1024*1024});
 const model=converter.parseMuse(raw,name);
 if(!model.totalMeasures)throw Error("No score measures in "+name);
 const selected=model.staves.flatMap(st=>st.voices.map(v=>v.id));
 if(!selected.length)throw Error("No score voices in "+name);
 let last=model.totalMeasures,duplicateRemoved=false;
 if(model.duplicate&&model.duplicate.confidence>=90&&model.duplicate.start>1){
  last=model.duplicate.start-1;duplicateRemoved=true;
 }
 const heading=song.title.replace(/^Silba Etno · /,"");
 const rendered=converter.renderABC(model,selected,1,last,{title:heading,barsPerLine:4});
 if(rendered.notes<1||rendered.voices!==selected.length){
  console.error("ABC conversion error",JSON.stringify({name,notes:rendered.notes,voices:rendered.voices,expectedVoices:selected.length,
   staffSummary:model.staves.map(st=>({id:st.id,measures:st.measures.length,voices:st.voices.map(v=>({id:v.id,count:v.count}))})),
   xmlTagCounts:{Chord:(raw.match(/<Chord(?:\\s|>)/g)||[]).length,Note:(raw.match(/<Note(?:\\s|>)/g)||[]).length,Measure:(raw.match(/<Measure(?:\\s|>)/g)||[]).length},xmlStart:raw.slice(0,350)}));
  unconverted.push(name);continue;
 }
 const bassVoice=selected.map(id=>{
  for(const st of model.staves){const v=st.voices.find(v=>v.id===id);if(v)return v;}
  return null;
 }).findIndex((v,i)=>i===1 && /^bass/.test(v?.clef||""));
 const meter=(rendered.abc.match(/^M:(.*)$/m)||[])[1]||"4/4";
 const isBalkan=/^(5|7|9|11)\/8$/.test(meter);
 const accompaniment={
  enabled:true,metronome:false,style:isBalkan?"balkan":"folk",
  bassSource:bassVoice===1?"voice:1":"style",
  bass:"alternating",chords:"folk",drums:isBalkan?"balkan":"folk",
  melodyInstrument:"source",melodyVolume:100,bassVolume:50,chordVolume:45,drumVolume:40,
  droneEnabled:false,variation:20
 };
 const warn=[...new Set(rendered.warnings||[])];
 const statusNote=duplicateRemoved?
   "En transponeret dublet i anden halvdel er udeladt efter automatisk mønstergenkendelse. Kontrollér mod originalpartituret.":
   "Hele partituret er konverteret; kontrollér nodebillede, gentagelser og afspilning mod originalen.";
 const result={...song,
  "type":"text/vnd.tiddlywiki",
  "tags":"ABC SilvaEthnoTrack",
  "abc-source":rendered.abc,
  "abc-view":"full",
  "abc-bars-per-line":"4",
  "abc-accompaniment":JSON.stringify(accompaniment),
  "huwiki-import-source":name,
  "huwiki-import-format":"mscx",
  "huwiki-import-range":"1-"+last,
  "huwiki-import-original-instruments":model.staves.map(s=>s.name||s.id).join(" / "),
  "silva-import-state":"abc-konverteret",
  "silva-abc-voices":String(rendered.voices),
  "silva-abc-notes":String(rendered.notes),
  "text":"! "+heading+"\n\nOriginal: "+name+" · "+rendered.voices+" stemmer · "+last+" takter.\n\n"+statusNote+
   (warn.length?"\n\n!! Importbemærkninger\n"+warn.map(w=>"* "+w).join("\n"):"")
 };
 Object.keys(result).forEach(k=>{if(typeof result[k]!=="string")throw Error("Non-string "+k+" in "+name);});
 if(used.has(result.title))throw Error("Duplicate song "+result.title);used.add(result.title);
 output.push(result);
 report.push({title:result.title,source:name,measures:model.totalMeasures,usedMeasures:last,
  sourceStaves:model.staves.length,voices:rendered.voices,notes:rendered.notes,
  duplicateRemoved,warnings:warn});
 console.log(String(report.length).padStart(2,"0")+"/17",heading,
  "measures="+last,"voices="+rendered.voices,"notes="+rendered.notes,
  duplicateRemoved?"transposed-duplicate-trimmed":"");
}
if(unconverted.length)throw Error("Could not convert "+unconverted.length+" original files: "+unconverted.join(", "));
const out=path.join(base,"tiddlers/repertoire.json");
await writeFile(out,JSON.stringify(output,null,2)+"\n");
await writeFile(path.join(base,"conversion-report.json"),JSON.stringify({
 title:"Silba Etno Repertoire",created:new Date().toISOString(),converted:report.length,
 omitted:sources.filter(s=>!s["silva-musescore-file"]).map(s=>s.title),
 entries:report
},null,2)+"\n");
const configPath=path.join(base,"tiddlers/config.json");
const config=JSON.parse(await readFile(configPath,"utf8"));
const overview=config.find(t=>t.title==="Silba Etno Repertoire – Oversigt");
if(!overview)throw Error("Missing repertoire overview");
overview.list=output.map(t=>"[["+t.title+"]]").join(" ");
overview.text="! Silba Etno Repertoire\n\n17 MuseScore-partiturer konverteret til redigerbare ABC-nodeark i Henriks rækkefølge. "+
 "Dette er en bruttoliste, ikke et endeligt koncertprogram.\n\n"+
 "!! Hovedliste\n<$list filter=\"[tag[SilvaEthnoTrack]field:silva-section[hovedliste]sort[silva-order]]\">\n* <$link/>\n</$list>\n\n"+
 "!! Usikre\n<$list filter=\"[tag[SilvaEthnoTrack]field:silva-section[usikre]sort[silva-order]]\">\n* <$link/>\n</$list>\n\n"+
 "!! Foreløbigt ude\n<$list filter=\"[tag[SilvaEthnoTrack]field:silva-section[ude]sort[silva-order]]\">\n* <$link/>\n</$list>\n\n"+
 "!! Arbejdsnoter\nKlik på et nummer for ABC-nodeark, afspilning og redigering. "+
 "Konverterede partiturer skal fortsat gennemgås mod originalerne, herunder gentagelser og becifringer. "+
 "Fire titler uden sikker kilde er ikke medtaget.";
await writeFile(configPath,JSON.stringify(config,null,2)+"\n");
console.log("Silba Etno Repertoire: 17 editable ABC scores generated");
