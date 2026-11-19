import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

function load(){
 const exports={};
 vm.runInNewContext(readFileSync(new URL("../plugins/animus-video-export/src/bundle.js",import.meta.url),"utf8"),
  {exports,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,setTimeout},{filename:"bundle.js"});
 return exports;
}

// Independent, bit-at-a-time CRC implementation for archive validation.
function crc32(data){
 let crc=0xffffffff;
 for(const value of data){
  crc^=value;
  for(let bit=0;bit<8;bit++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
 }
 return (crc^0xffffffff)>>>0;
}
function readZip(bytes){
 const buffer=Buffer.from(bytes),end=buffer.length-22;
 assert.equal(buffer.readUInt32LE(end),0x06054b50);
 assert.equal(buffer.readUInt16LE(end+4),0);
 assert.equal(buffer.readUInt16LE(end+6),0);
 const count=buffer.readUInt16LE(end+10),directorySize=buffer.readUInt32LE(end+12),directoryOffset=buffer.readUInt32LE(end+16);
 assert.equal(buffer.readUInt16LE(end+8),count);
 assert.equal(buffer.readUInt16LE(end+20),0);
 assert.equal(directoryOffset+directorySize,end);
 const files=[];
 let position=directoryOffset,nextLocalOffset=0;
 for(let i=0;i<count;i++){
  assert.equal(buffer.readUInt32LE(position),0x02014b50);
  assert.equal(buffer.readUInt16LE(position+8),0x800,"UTF-8 file names");
  assert.equal(buffer.readUInt16LE(position+10),0,"STORE method");
  const crc=buffer.readUInt32LE(position+16),size=buffer.readUInt32LE(position+20),nameLength=buffer.readUInt16LE(position+28);
  assert.equal(buffer.readUInt32LE(position+24),size);
  assert.equal(buffer.readUInt16LE(position+30),0);
  assert.equal(buffer.readUInt16LE(position+32),0);
  const name=buffer.toString("utf8",position+46,position+46+nameLength),local=buffer.readUInt32LE(position+42);
  assert.equal(local,nextLocalOffset,"local records are contiguous");
  assert.equal(buffer.readUInt32LE(local),0x04034b50);
  assert.equal(buffer.readUInt16LE(local+6),0x800);
  assert.equal(buffer.readUInt16LE(local+8),0);
  assert.equal(buffer.readUInt32LE(local+14),crc);
  assert.equal(buffer.readUInt32LE(local+18),size);
  assert.equal(buffer.readUInt32LE(local+22),size);
  assert.equal(buffer.readUInt16LE(local+26),nameLength);
  assert.equal(buffer.readUInt16LE(local+28),0);
  assert.equal(buffer.toString("utf8",local+30,local+30+nameLength),name);
  const data=buffer.subarray(local+30+nameLength,local+30+nameLength+size);
  assert.equal(crc32(data),crc,"payload CRC32");
  files.push({name,data});
  nextLocalOffset=local+30+nameLength+size;
  position+=46+nameLength;
 }
 assert.equal(nextLocalOffset,directoryOffset);
 assert.equal(position,end);
 return files;
}

test("ZIP STORE round-trips binary media, Unicode names, empty files and subdirectories",async()=>{
 const files=[
  {name:"video.mp4",blob:new Blob([Uint8Array.from([0,255,3,4,5])])},
  {name:"Tale – Måns.wav",blob:new Blob(["123456789"])},
  {name:"captions/日本語.vtt",blob:new Blob(["WEBVTT\n\nHej og velkommen!\n"])},
  {name:"empty.txt",blob:new Blob([])}
 ];
 const progress=[],archive=await load().zip(files,{progress:(_phase,value)=>progress.push(value)});
 assert.equal(archive.type,"application/zip");
 const extracted=readZip(await archive.arrayBuffer());
 assert.deepEqual(extracted.map(file=>file.name),files.map(file=>file.name));
 for(let i=0;i<files.length;i++)assert.deepEqual(extracted[i].data,Buffer.from(await files[i].blob.arrayBuffer()));
 assert.equal(crc32(extracted[1].data),0xcbf43926,"standard CRC32 check vector");
 assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
 assert.ok(progress.every((value,i)=>value>=0&&value<=1&&(!i||value>=progress[i-1])));
});

test("ZIP can contain only empty files or no files",async()=>{
 for(const files of [[],[{name:"silence.txt",blob:new Blob([])}]]){
  const archive=await load().zip(files);
  const extracted=readZip(await archive.arrayBuffer());
  assert.equal(extracted.length,files.length);
 }
});

test("ZIP reads large sources in bounded slices and yields to the event loop",async()=>{
 const payload=new Uint8Array(2*1048576+17);
 for(let i=0;i<payload.length;i++)payload[i]=(i*37+11)%256;
 const reads=[];
 class SlicedBlob extends Blob{
  async arrayBuffer(){throw Error("whole-source arrayBuffer must not be used");}
  slice(start,end){reads.push([start,end]);return super.slice(start,end);}
 }
 let yielded=false;
 setTimeout(()=>{yielded=true;},0);
 const result=await load().zip([{name:"music.wav",blob:new SlicedBlob([payload])}]);
 assert.equal(reads.length,3);
 assert.ok(reads.every(([start,end])=>end-start<=1048576));
 assert.equal(yielded,true);
 assert.deepEqual(readZip(await result.arrayBuffer())[0].data,Buffer.from(payload));
});

test("ZIP cancellation stops before reading sources and between CRC chunks",async()=>{
 const zip=load().zip;
 await assert.rejects(zip([{name:"video.mp4",blob:new Blob(["video"])}],{cancelled:()=>true}),/Export cancelled/);
 let cancelled=false,reads=0;
 class CountingBlob extends Blob{
  slice(start,end){reads++;return super.slice(start,end);}
 }
 await assert.rejects(zip([{name:"music.wav",blob:new CountingBlob([new Uint8Array(2*1048576)])}],{
  cancelled:()=>cancelled,
  progress:(_phase,value)=>{if(value>0)cancelled=true;}
 }),/Export cancelled/);
 assert.equal(reads,1);
});

test("ZIP rejects unsafe paths, ambiguous names and invalid Unicode",async()=>{
 const zip=load().zip,blob=new Blob(["test"]);
 for(const name of ["../voice.wav","/voice.wav","C:/voice.wav","folder/../voice.wav","folder//voice.wav",
  "voice\\music.wav","voice\0.wav","folder/",".","..","AUX.wav","voice?.wav","voice.wav ","voice.wav.","bad\ud800.wav"])
  await assert.rejects(zip([{name,blob}]),/Unsafe ZIP file name|Invalid Unicode ZIP file name/,name);
 await assert.rejects(zip([{name:"voice.wav",blob},{name:"VOICE.wav",blob}]),/Duplicate ZIP file name/);
 await assert.rejects(zip([{name:"Ma\u030ans.wav",blob},{name:"Måns.wav",blob}]),/Duplicate ZIP file name/);
 await assert.rejects(zip([{name:"x".repeat(65536),blob}]),/file name is too long/);
});

test("ZIP rejects classic ZIP overflow before reading large media",async()=>{
 const zip=load().zip;
 const unreadable=size=>({size,slice(){throw Error("must reject before reading");}});
 await assert.rejects(zip([{name:"huge.wav",blob:unreadable(0xffffffff)}]),/4 GiB/);
 await assert.rejects(zip([{name:"music.wav",blob:unreadable(0x80000000)},{name:"speech.wav",blob:unreadable(0x80000000)}]),/4 GiB/);
 await assert.rejects(zip(Array(65535).fill({name:"voice.wav",blob:new Blob([])})),/too many files/);
 await assert.rejects(zip([{name:"broken.wav",blob:{size:-1,slice(){}}}]),/readable Blob/);
});

test("ZIP rejects Blob-shaped objects whose payload would be stringified",async()=>{
 const actual=new Blob(["audio"]);
 let reads=0;
 const pretend={size:actual.size,slice(start,end){reads++;return actual.slice(start,end);}};
 await assert.rejects(load().zip([{name:"speech.wav",blob:pretend}]),/readable Blob/);
 assert.equal(reads,0,'invalid sources fail before any CRC or media work');
});
