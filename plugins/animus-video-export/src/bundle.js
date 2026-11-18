/*\
title: $:/plugins/huwiki/animus-video-export/bundle.js
type: application/javascript
module-type: library
\*/
(function(){
"use strict";
// A dependency-free ZIP STORE writer. Media is already encoded; leave the
// original immutable Blobs intact and read only bounded pieces for CRC32.
// Classic ZIP only: reject ZIP64 sizes/counts before reading any media.
var LIMIT=4294967295,CHUNK_SIZE=1048576,UTF8=2048;
var crcTable=new Uint32Array(256);
for(var n=0;n<256;n++){
 var value=n;
 for(var bit=0;bit<8;bit++)value=(value&1)?(3988292384^(value>>>1)):(value>>>1);
 crcTable[n]=value>>>0;
}
function cancelled(o){if(o.cancelled&&o.cancelled())throw Error("Export cancelled");}
function report(o,value){if(o.progress)o.progress("Samler eksportpakke / Packaging export bundle",value);}
function pause(){return new Promise(function(resolve){setTimeout(resolve,0);});}
function safeName(value){
 if(typeof value!=="string"||!value)throw Error("ZIP file name is missing");
 var name=value.normalize("NFC"),parts=name.split("/");
 if(/[\\\x00-\x1f\x7f<>:\"|?*]/.test(name)||parts.some(function(part){
  return !part||part==="."||part===".."||/[ .]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part);
 }))throw Error("Unsafe ZIP file name: "+value);
 // TextEncoder replaces unpaired surrogates; reject them instead of creating
 // colliding replacement-character names in the extracted package.
 for(var i=0;i<name.length;i++){
  var code=name.charCodeAt(i);
  if(code>=55296&&code<=56319){
   var next=name.charCodeAt(++i);
   if(!(next>=56320&&next<=57343))throw Error("Invalid Unicode ZIP file name");
  }else if(code>=56320&&code<=57343)throw Error("Invalid Unicode ZIP file name");
 }
 return name;
}
function header(length){var bytes=new Uint8Array(length);return {bytes:bytes,view:new DataView(bytes.buffer)};}
function localHeader(file,crc){
 var h=header(30+file.nameBytes.length),v=h.view;
 v.setUint32(0,67324752,true);v.setUint16(4,20,true);v.setUint16(6,UTF8,true);
 v.setUint16(8,0,true);v.setUint16(10,0,true);v.setUint16(12,33,true);
 v.setUint32(14,crc,true);v.setUint32(18,file.blob.size,true);v.setUint32(22,file.blob.size,true);
 v.setUint16(26,file.nameBytes.length,true);v.setUint16(28,0,true);
 h.bytes.set(file.nameBytes,30);return h.bytes;
}
function centralHeader(file,crc,offset){
 var h=header(46+file.nameBytes.length),v=h.view;
 v.setUint32(0,33639248,true);v.setUint16(4,20,true);v.setUint16(6,20,true);
 v.setUint16(8,UTF8,true);v.setUint16(10,0,true);v.setUint16(12,0,true);v.setUint16(14,33,true);
 v.setUint32(16,crc,true);v.setUint32(20,file.blob.size,true);v.setUint32(24,file.blob.size,true);
 v.setUint16(28,file.nameBytes.length,true);v.setUint32(42,offset,true);
 h.bytes.set(file.nameBytes,46);return h.bytes;
}
function endHeader(count,size,offset){
 var h=header(22),v=h.view;
 v.setUint32(0,101010256,true);v.setUint16(8,count,true);v.setUint16(10,count,true);
 v.setUint32(12,size,true);v.setUint32(16,offset,true);return h.bytes;
}
async function zip(files,options){
 var o=options||{},seen=Object.create(null),encoder=new TextEncoder();
 cancelled(o);
 if(!Array.isArray(files))throw Error("ZIP files must be an array");
 if(files.length>=65535)throw Error("ZIP has too many files; split the export package");
 var localSize=0,centralSize=0,totalBytes=0;
 var entries=files.map(function(file){
  if(!file||!file.blob||!Number.isSafeInteger(file.blob.size)||file.blob.size<0||typeof file.blob.slice!=="function")
   throw Error("ZIP entry requires a readable Blob");
  var name=safeName(file.name),key=name.toLowerCase(),bytes=encoder.encode(name);
  if(seen[key])throw Error("Duplicate ZIP file name: "+name);
  seen[key]=true;
  if(bytes.length>65535)throw Error("ZIP file name is too long");
  if(file.blob.size>=LIMIT)throw Error("ZIP file exceeds the 4 GiB limit; export a shorter scene");
  localSize+=30+bytes.length+file.blob.size;centralSize+=46+bytes.length;totalBytes+=file.blob.size;
  if(localSize+centralSize+22>=LIMIT)throw Error("ZIP package exceeds the 4 GiB limit; export a shorter scene");
  return {nameBytes:bytes,blob:file.blob};
 });
 // A duck-typed object can provide valid CRC bytes via slice(), yet Blob
 // construction would stringify that object and silently corrupt the ZIP.
 // The native method checks the internal Blob slot, including across realms.
 entries.forEach(function(file){
  try{Blob.prototype.slice.call(file.blob,0,0);}catch(_){throw Error("ZIP entry requires a readable Blob");}
 });
 var content=[],directory=[],offset=0,processed=0;
 report(o,0);
 for(var i=0;i<entries.length;i++){
  cancelled(o);
  var file=entries[i],crc=4294967295;
  for(var start=0;start<file.blob.size;start+=CHUNK_SIZE){
   cancelled(o);
   var end=Math.min(start+CHUNK_SIZE,file.blob.size);
   var bytes=new Uint8Array(await file.blob.slice(start,end).arrayBuffer());
   cancelled(o);
   if(bytes.byteLength!==end-start)throw Error("ZIP source could not be read completely");
   for(var j=0;j<bytes.length;j++)crc=crcTable[(crc^bytes[j])&255]^(crc>>>8);
   processed+=bytes.length;bytes=null;
   report(o,totalBytes?processed/totalBytes:0);
   await pause();cancelled(o);
  }
  crc=(crc^4294967295)>>>0;
  var local=localHeader(file,crc);
  content.push(local,file.blob);directory.push(centralHeader(file,crc,offset));
  offset+=local.length+file.blob.size;
 }
 cancelled(o);
 var result=new Blob(content.concat(directory,[endHeader(entries.length,centralSize,offset)]),{type:"application/zip"});
 report(o,1);cancelled(o);
 return result;
}
exports.zip=zip;
})();
