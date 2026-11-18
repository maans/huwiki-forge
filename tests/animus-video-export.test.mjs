import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

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
  "$:/plugins/huwiki/animus-video-export/audio.js":{}
 });
 assert.deepEqual(Array.from(rt.currentRange({scenes:[{duration:4},{duration:7},{duration:3}]},8,14)),[4,11]);
 assert.deepEqual(Array.from(rt.currentRange({scenes:[]},2,14)),[0,14]);
 assert.match(rt.subtitles([{start:1,end:3,text:"Hej!"}],4),/00:00:01\.000 --> 00:00:03\.000\nHej!/);
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
