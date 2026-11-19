import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

function muxer(){
 const exports={};
 vm.runInNewContext(readFileSync(new URL('../plugins/animus-video-export/src/mp4.js',import.meta.url),'utf8'),{exports,Uint8Array,Number,Array,Math,Object,String});
 return exports;
}
function atoms(data,start=0,end=data.length){
 const rows=[];
 for(let at=start;at<end;){
  const size=data.readUInt32BE(at),type=data.toString('ascii',at+4,at+8);
  assert.ok(size>=8&&at+size<=end,'valid '+type+' atom');
  rows.push({type,at,size,end:at+size});at+=size;
 }
 return rows;
}
function child(data,parent,type){
 const row=atoms(data,parent.at+8,parent.end).find(row=>row.type===type);
 assert.ok(row,'missing '+type+' atom');return row;
}
function structure(bytes){
 const data=Buffer.from(bytes),moov=atoms(data).find(row=>row.type==='moov'),mvhd=child(data,moov,'mvhd');
 const tracks=atoms(data,moov.at+8,moov.end).filter(row=>row.type==='trak').map(track=>{
  const tkhd=child(data,track,'tkhd'),mdia=child(data,track,'mdia'),mdhd=child(data,mdia,'mdhd'),hdlr=child(data,mdia,'hdlr');
  const kind=data.toString('ascii',hdlr.at+16,hdlr.at+20);
  const result={kind,presentation:data.readUInt32BE(tkhd.at+28),scale:data.readUInt32BE(mdhd.at+20),media:data.readUInt32BE(mdhd.at+24)};
  if(kind==='soun'){
   const edit=child(data,child(data,track,'edts'),'elst');
   assert.equal(data.readUInt32BE(edit.at+12),1,'one continuous presentation edit');
   result.editDuration=data.readUInt32BE(edit.at+16);result.priming=data.readInt32BE(edit.at+20);
   assert.equal(data.readUInt16BE(edit.at+24),1,'normal playback rate');
   const stbl=child(data,child(data,mdia,'minf'),'stbl'),sgpd=child(data,stbl,'sgpd'),sbgp=child(data,stbl,'sbgp');
   assert.equal(data[sgpd.at+8],1);assert.equal(data.toString('ascii',sgpd.at+12,sgpd.at+16),'roll');
   assert.equal(data.readUInt32BE(sgpd.at+16),2);assert.equal(data.readUInt32BE(sgpd.at+20),1);
   assert.equal(data.readInt16BE(sgpd.at+24),-1,'AAC decoder needs one preceding packet');
   assert.equal(data.toString('ascii',sbgp.at+12,sbgp.at+16),'roll');
   assert.equal(data.readUInt32BE(sbgp.at+16),1);assert.equal(data.readUInt32BE(sbgp.at+24),1);
   assert.equal(data.readUInt32BE(sbgp.at+20)*1024,result.media,'roll group covers every AAC packet');
  }
  return result;
 });
 return {scale:data.readUInt32BE(mvhd.at+20),duration:data.readUInt32BE(mvhd.at+24),tracks};
}
function video(frames=31){return {width:1280,height:720,fps:30,description:Uint8Array.of(1,77,0,31,255),samples:Array.from({length:frames},(_,i)=>({data:Uint8Array.of(1,2,3),key:i===0,timestamp:Math.round(i*1e6/30)}))};}
function audio({frames=49600,priming=1024}={}){
 const count=Math.ceil((frames+priming)/1024);
 return {sampleRate:48000,channels:2,description:Uint8Array.of(0x11,0x90),frameCount:frames,
  samples:Array.from({length:count},(_,i)=>({data:Uint8Array.of(10,20),timestamp:Math.round((i*1024-priming)*1e6/48000)}))};
}

test('MP4 edit skips AAC priming and trims padded end to the exact video cut',()=>{
 const sound=audio(),info=structure(muxer().mux(video(),sound));
 assert.equal(info.scale,48000);
 assert.equal(info.duration,49600);
 const a=info.tracks.find(t=>t.kind==='soun'),v=info.tracks.find(t=>t.kind==='vide');
 assert.equal(v.presentation,49600);assert.equal(a.presentation,49600);assert.equal(a.editDuration,49600);
 assert.equal(a.priming,1024);assert.equal(a.media,sound.samples.length*1024);
 assert.ok(a.media>a.priming+a.presentation,'encoded tail remains decodable but outside the presentation');
});

test('MP4 preserves non-packet-aligned AAC priming and explicit zero-delay trim',()=>{
 for(const priming of [0,2112]){
  const info=structure(muxer().mux(video(),audio({priming})));
  assert.equal(info.tracks.find(t=>t.kind==='soun').priming,priming);
  assert.equal(info.duration,49600);
 }
});

test('MP4 removes measured native priming when AAC timestamps start at zero',()=>{
 const sound=audio({priming:2112});
 sound.samples.forEach((sample,index)=>{sample.timestamp=Math.round(index*1024e6/48000);});
 sound.primingFrames=2112;
 const info=structure(muxer().mux(video(),sound));
 assert.equal(info.tracks.find(t=>t.kind==='soun').priming,2112);
 assert.equal(info.duration,49600);
 const raw=structure(muxer().muxAudio({...sound,primingFrames:0,frameCount:sound.samples.length*1024}));
 assert.equal(raw.tracks.length,1);assert.equal(raw.tracks[0].priming,0);
 assert.equal(raw.duration,sound.samples.length*1024,'calibration decodes all raw packets without automatic trimming');
 for(const invalid of [-1,1.5,Infinity,10000])
  assert.throws(()=>muxer().mux(video(),{...sound,primingFrames:invalid}),/complete requested audio interval/);
});

test('MP4 rejects audio gaps, missing packets and mismatched requested durations',()=>{
 const m=muxer(),delayed=audio();delayed.samples.forEach(s=>s.timestamp+=100000);
 assert.throws(()=>m.mux(video(),delayed),/after the requested start/);
 const gap=audio();gap.samples[12].timestamp+=10000;
 assert.throws(()=>m.mux(video(),gap),/discontinuous timestamps/);
 const short=audio();short.samples.pop();
 assert.throws(()=>m.mux(video(),short),/complete requested audio interval/);
 assert.throws(()=>m.mux(video(30),audio()),/durations do not match/);
});

// This integration test uses real AVC/AAC packets from FFmpeg, then asks an
// independent demuxer/decoder to read our MP4. It does not claim to test the
// device's WebCodecs encoder. It catches edit-list placement and priming shifts
// that atom-only tests cannot see. Local builds without FFmpeg keep unit tests.
const hasFfmpeg=['ffmpeg','ffprobe'].every(name=>spawnSync(name,['-version'],{stdio:'ignore'}).status===0);
test('real AAC payload roundtrip preserves the transient and exact MP4 duration',{skip:!hasFfmpeg},()=>{
 const dir=mkdtempSync(join(tmpdir(),'animus-mp4-'));
 function run(name,args){
  const result=spawnSync(name,args,{encoding:null,maxBuffer:16*1024*1024});
  assert.equal(result.status,0,name+' failed: '+result.stderr?.toString());return result.stdout;
 }
 function fromHex(value){
  return Buffer.from(String(value||'').split('\n').filter(line=>/^\s*[0-9a-f]+:/i.test(line)).map(line=>line.replace(/^\s*[0-9a-f]+:\s*/i,'').split(/\s{2,}/)[0].replace(/\s/g,'')).join(''),'hex');
 }
 try{
  const frames=49600,rate=48000,source=join(dir,'source.mp4'),output=join(dir,'export.mp4'),raw=join(dir,'input.f32');
  const pcm=Buffer.alloc(frames*2*4);
  for(const sample of [12000,36000])for(let c=0;c<2;c++)pcm.writeFloatLE(.8,(sample*2+c)*4);
  writeFileSync(raw,pcm);
  run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=64x64:r=30','-f','f32le','-ar','48000','-ac','2','-i',raw,
   '-frames:v','31','-c:v','libx264','-profile:v','baseline','-bf','0','-g','30','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-y',source]);
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_packets','-show_data','-show_entries',
   'stream=index,codec_type,time_base,extradata,width,height,sample_rate,channels:packet=stream_index,pts,dts,pos,size,flags','-of','json',source]).toString());
  const original=readFileSync(source),track=kind=>probe.streams.find(s=>s.codec_type===kind);
  function packets(stream){
   const [num,den]=stream.time_base.split('/').map(Number);
   return probe.packets.filter(p=>p.stream_index===stream.index).map(p=>({
    data:original.subarray(Number(p.pos),Number(p.pos)+Number(p.size)),timestamp:Math.round(Number(p.pts)*num/den*1e6),key:p.flags.includes('K')
   }));
  }
  const vs=track('video'),as=track('audio');
  const v={width:vs.width,height:vs.height,fps:30,description:fromHex(vs.extradata),samples:packets(vs)};
  const a={sampleRate:Number(as.sample_rate),channels:as.channels,description:fromHex(as.extradata),samples:packets(as),frameCount:frames};
  assert.ok(a.samples[0].timestamp<0,'reference encoder exposes real AAC priming');
  writeFileSync(output,muxer().mux(v,a));
  const metadata=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,start_time,duration','-of','json',output]).toString());
  for(const stream of metadata.streams){assert.equal(Number(stream.start_time),0);assert.ok(Math.abs(Number(stream.duration)-frames/rate)<1/rate);}
  assert.ok(Math.abs(Number(metadata.format.duration)-frames/rate)<1/rate);
  const decode=path=>run('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','-']);
  const reference=decode(source),rendered=decode(output);
  assert.ok(reference.length>=frames*8&&rendered.length>=frames*8,'the entire source interval decodes');
  assert.deepEqual(rendered.subarray(0,frames*8),reference.subarray(0,frames*8),'priming is discarded exactly once; audio stays at the same zero');
  let maximum=0,peak=0;
  for(let i=0;i<24000;i++){const value=Math.abs(rendered.readFloatLE(i*8));if(value>maximum){maximum=value;peak=i;}}
  assert.ok(Math.abs(peak-12000)<=1,'first transient remains at 250 ms, not one AAC packet late');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
