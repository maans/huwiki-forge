import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {svgDocument} from "./helpers/svg-test-dom.mjs";

function source(path){return readFileSync(new URL("../"+path,import.meta.url),"utf8");}
function load(path,dependencies={}){
 const exports={};
 vm.runInNewContext(source(path),{
  exports,Uint8Array,ArrayBuffer,Map,Math,Number,String,Object,JSON,
  require(name){if(name in dependencies)return dependencies[name];throw Error("Missing test dependency: "+name);}
 },{filename:path});
 return exports;
}
function atoms(array,start=0,end=array.length){
 const text=Buffer.from(array),rows=[];
 for(let i=start;i+8<=end;){
  const length=text.readUInt32BE(i),type=text.toString("ascii",i+4,i+8);
  assert.ok(length>=8&&i+length<=end,"valid "+type+" atom");
  rows.push({type,start:i,end:i+length,length});i+=length;
 }
 return rows;
}
function children(bytes,row){return atoms(bytes,row.start+8,row.end);}
function seek(bytes,parent,types){
 let rows=parent?children(bytes,parent):atoms(bytes),found=null;
 for(const type of types){found=rows.find(r=>r.type===type);assert.ok(found,"missing "+type);rows=children(bytes,found);}
 return found;
}

test("MP4 muxes AVC video with correct atom and media offsets",()=>{
 const mp4=load("plugins/animus-video-export/src/mp4.js");
 const video={width:1280,height:720,fps:30,bitrate:5000000,
  description:Uint8Array.from([1,77,0,31,255,225,0,4,103,77,0,31,1,0,2,104,0]),
  samples:Array.from({length:31},(_,i)=>({data:Uint8Array.from([0,0,0,1,i]),key:i%30===0}))};
 const data=mp4.mux(video),top=atoms(data);
 assert.deepEqual(top.map(x=>x.type),["ftyp","moov","mdat"]);
 assert.equal(top.at(-1).end,data.length);
 const moov=top[1],tracks=children(data,moov).filter(x=>x.type==="trak");
 assert.equal(tracks.length,1);
 const stbl=seek(data,tracks[0],["mdia","minf","stbl"]);
 const stco=children(data,stbl).find(x=>x.type==="stco");
 const offset=Buffer.from(data).readUInt32BE(stco.start+16);
 assert.equal(offset,top[2].start+8);
 const videoPayload=data.slice(offset,offset+5);
 assert.deepEqual(Array.from(videoPayload),[0,0,0,1,0]);
 assert.ok(children(data,stbl).some(x=>x.type==="stss"));
 assert.ok(data.length>155);
});

test("MP4 includes separately addressable AAC audio",()=>{
 const mp4=load("plugins/animus-video-export/src/mp4.js");
 const video={width:1280,height:720,fps:30,description:Uint8Array.from([1,77,0,31,255]),
  samples:[{data:Uint8Array.from([1,2,3,4]),key:true}]};
 const audio={sampleRate:48000,channels:2,description:Uint8Array.from([0x11,0x90]),
  samples:[{data:Uint8Array.from([11,12]),timestamp:0},{data:Uint8Array.from([13,14,15]),timestamp:21333}]};
 const bytes=mp4.mux(video,audio),moov=atoms(bytes)[1],tracks=children(bytes,moov).filter(x=>x.type==="trak");
 assert.equal(tracks.length,2);
 const offsets=tracks.map(track=>{
  const stbl=seek(bytes,track,["mdia","minf","stbl"]);
  const stco=children(bytes,stbl).find(x=>x.type==="stco");
  return Buffer.from(bytes).readUInt32BE(stco.start+16);
 });
 assert.equal(offsets[1],offsets[0]+4);
 assert.deepEqual(Array.from(bytes.slice(offsets[1],offsets[1]+5)),[11,12,13,14,15]);
});

test("export range follows the current top-level stage segment",()=>{
 const rt=load("plugins/animus-video-export/src/runtime.js",{
  "$:/plugins/huwiki/animus-video-export/mp4.js":{},
  "$:/plugins/huwiki/animus-video-export/audio.js":{},
  "$:/plugins/huwiki/animus-video-export/bundle.js":{}
 });
 assert.deepEqual(Array.from(rt.currentRange({scenes:[{duration:4},{duration:7},{duration:3}]},8,14)),[4,11]);
 assert.deepEqual(Array.from(rt.currentRange({scenes:[]},2,14)),[0,14]);
 assert.match(rt.subtitles([{start:1,end:3,text:"Hej!"}],4),/00:00:01\.000 --> 00:00:03\.000\nHej!/);
});

function runtime(){return load("plugins/animus-video-export/src/runtime.js",{
 "$:/plugins/huwiki/animus-video-export/mp4.js":{},
 "$:/plugins/huwiki/animus-video-export/audio.js":{},
 "$:/plugins/huwiki/animus-video-export/bundle.js":{}
});}

test("export dialog stays reachable in its player's fullscreen subtree and closes normally",()=>{
 for(const scenario of ["normal","host","ancestor","webkit","unrelated"]){
  const doc=svgDocument(),wrapper=doc.createElement("main"),host=doc.createElement("div");
  doc.body.appendChild(wrapper);wrapper.appendChild(host);
  const stage=doc.createElement("div"),controls=doc.createElement("div");
  host.appendChild(stage);host.appendChild(controls);
  if(scenario==="host")doc.fullscreenElement=host;
  if(scenario==="ancestor")doc.fullscreenElement=wrapper;
  if(scenario==="webkit")doc.webkitFullscreenElement=host;
  if(scenario==="unrelated"){
   doc.fullscreenElement=doc.createElement("div");doc.body.appendChild(doc.fullscreenElement);
  }
  let pauses=0;
  const exporter=runtime().attach({host,stage,controls,scene:{name:"Show"},
   duration:()=>40,position:()=>12,pause:()=>{pauses++;}});
  exporter.open();
  const dialog=doc.querySelector(".huw-video-modal");
  const expected=scenario==="host"||scenario==="webkit"?host:scenario==="ancestor"?wrapper:doc.body;
  assert.equal(dialog.parentNode,expected,scenario+" dialog belongs to the visible player surface");
  assert.ok(dialog.contains(doc.activeElement),scenario+" dialog receives focus");
  assert.equal(pauses,1);
  dialog.querySelector(".huw-video-close").click();
  assert.equal(doc.querySelector(".huw-video-modal"),null,scenario+" close removes the dialog");
  assert.equal(controls.querySelectorAll("[data-animus-video-export]").length,1);
  exporter.open();assert.equal(doc.querySelectorAll(".huw-video-modal").length,1);
  exporter.dispose();
  assert.equal(doc.querySelector(".huw-video-modal"),null);
  assert.equal(controls.querySelectorAll("[data-animus-video-export]").length,0);
 }
});

test("editing assets agree on whole-frame duration and preserve a nonzero source start",()=>{
 const rt=runtime();
 for(const fps of [24,30])for(const [start,end] of [[1,2.01],[20.5,25.75],[0,481]]){
  const plan=rt.exportRange(start,end,fps);
  assert.equal(plan.start,start);assert.equal(plan.end,end);
  assert.equal(plan.audioFrames/48000,plan.videoFrames/fps);
  assert.equal(plan.duration,plan.audioFrames/48000);
  assert.ok(plan.duration>=end-start-1e-9);
  assert.ok(plan.padding<1/fps+1e-9);
 }
 assert.equal(rt.exportRange(1,2.01,30).audioFrames,49600);
 assert.equal(rt.exportRange(.1,.4,30).videoFrames,9,"floating point error must not add a frame");
 assert.throws(()=>rt.exportRange(5,4,30));assert.throws(()=>rt.exportRange(0,1,29.97));
});

test("encoded video must preserve every frame in decoding order at the requested rate",()=>{
 const rt=runtime();
 for(const fps of [24,30]){
  const samples=Array.from({length:61},(_,i)=>({key:i===0,timestamp:Math.round(i*1000000/fps)}));
  assert.doesNotThrow(()=>rt.validateVideoSamples(samples,61,fps));
  assert.throws(()=>rt.validateVideoSamples(samples.slice(1),61,fps),/every video frame/);
  const reordered=samples.slice();[reordered[1],reordered[2]]=[reordered[2],reordered[1]];
  assert.throws(()=>rt.validateVideoSamples(reordered,61,fps),/frame order or timing/);
  assert.throws(()=>rt.validateVideoSamples([{...samples[0],key:false},...samples.slice(1)],61,fps),/keyframe/);
  assert.throws(()=>rt.validateVideoSamples(samples.map((s,i)=>({...s,timestamp:s.timestamp+(i?100:0)})),61,fps),/timing/);
 }
});

test("caption gaps remain empty when a later caption starts and sidecars end at the selected cut",()=>{
 const rt=runtime(),segments=[];
 rt.recordCaption(segments,{line:"First line",cue:""},0);
 rt.recordCaption(segments,{line:"",cue:""},.5);
 rt.recordCaption(segments,{line:"Second line",cue:""},1);
 rt.recordCaption(segments,{line:"Second line",cue:""},1.5);
 assert.equal(segments.length,2);
 assert.equal(segments[0].end,.5);
 const text=rt.subtitles(segments,2);
 assert.match(text,/00:00:00\.000 --> 00:00:00\.500\nFirst line/);
 assert.match(text,/00:00:01\.000 --> 00:00:02\.000\nSecond line/);
 assert.doesNotMatch(rt.subtitles([{start:2,end:null,text:"At the cut"}],2),/At the cut/);
});

test("editing manifest records synchronization, clip warnings and the independent movie audio selection",()=>{
 const rt=runtime(),manifest=rt.packageManifest({name:"My show"},{start:1,end:2.01,fps:30,width:1280,burn:false,audio:"silent"},[
  {id:"speech",sampleRate:48000,channels:2,bitsPerSample:16,frameCount:49600,duration:49600/48000,peak:1.2,clippedSamples:12}
 ],{},true);
 assert.equal(manifest.sourceRange.startSeconds,1);
 assert.equal(manifest.timeline.startSeconds,0);
 assert.equal(manifest.timeline.audioFrames,49600);
 assert.equal(manifest.audio[0].startSeconds,0);
 assert.equal(manifest.audio[0].clippedSamples,12);
 assert.equal(manifest.audio[0].normalized,false);
 assert.equal(manifest.video.audio,false);
 assert.equal(manifest.video.burnedCaptions,false);
 assert.equal(manifest.captions.directLumaFusionImportVerified,false);
 const mixed=rt.packageManifest({name:"My show"},{start:1,end:2.01,fps:30,width:1280,burn:true,audio:"playback"},[],{},false);
 assert.equal(mixed.video.audio,true,"a playback-audio MP4 remains mixed even when no WAV is selected");
 assert.equal(mixed.video.burnedCaptions,true);
 assert.equal(mixed.captions,null,"a burned caption does not imply a selected VTT file");
});

test("optional video exporter is integrated in both editor and audience publishing",()=>{
 for(const path of ["plugins/musical/src/widget.js","plugins/site-publisher/src/animus-viewer.js"])
  assert.match(source(path),/VideoExport\.attach/);
 assert.match(source("plugins/site-publisher/src/animus-export.js"),/animus-video-export\/runtime/);
 assert.match(source("plugins/site-publisher/src/publisher.js"),/animus-video-export\/runtime/);
});

test("effects support an injected offline audio context without starting live audio",()=>{
 const sfx=load("plugins/musical/src/sfx.js");
 const context={currentTime:0,destination:{}};
 const effects=new sfx.Fx([],{context});
 assert.equal(effects.ensure(),context);
 effects.fire({type:"bell",volume:0},2.25);
 assert.equal(effects.ctx,context);
});
