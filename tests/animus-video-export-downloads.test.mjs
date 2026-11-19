import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const source=name=>readFileSync(new URL('../plugins/animus-video-export/src/'+name,import.meta.url),'utf8');
function module(name,globals={}){
 const exports={};
 vm.runInNewContext(source(name),{exports,Blob,TextEncoder,Uint8Array,Uint32Array,Float32Array,DataView,ArrayBuffer,
  Math,Number,String,Object,Array,Map,JSON,Promise,setTimeout,...globals},{filename:name});
 return exports;
}

// Read the downloaded archive independently, so missing or substituted outputs
// cannot pass merely because a button has the expected label.
async function unzip(blob){
 const bytes=Buffer.from(await blob.arrayBuffer()),end=bytes.length-22,files=new Map();
 assert.equal(bytes.readUInt32LE(end),0x06054b50,'download contains a ZIP directory');
 const count=bytes.readUInt16LE(end+10);let at=bytes.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  assert.equal(bytes.readUInt32LE(at),0x02014b50);
  assert.equal(bytes.readUInt16LE(at+10),0,'stored media retains its original bytes');
  const size=bytes.readUInt32LE(at+24),length=bytes.readUInt16LE(at+28),local=bytes.readUInt32LE(at+42);
  const name=bytes.toString('utf8',at+46,at+46+length);
  assert.equal(bytes.readUInt32LE(local),0x04034b50);
  const begin=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  files.set(name,bytes.subarray(begin,begin+size));
  at+=46+length+bytes.readUInt16LE(at+30)+bytes.readUInt16LE(at+32);
 }
 assert.equal(at,end);assert.equal(files.size,count);return files;
}

function fixture({lang='da',audioGate}={}){
 const doc=svgDocument(),downloads=[],urls=new Map(),state={encoders:0,audioRenders:0,stemRenders:0,seeks:[],scrolled:[],position:.8};
 doc.documentElement.lang=lang;
 const create=doc.createElement;
 doc.createElement=tag=>{
  const node=create(tag);
  node.scrollIntoView=()=>state.scrolled.push(node);
  if(tag==='canvas')node.getContext=()=>({save(){},restore(){},fillRect(){},drawImage(){},fillText(){},measureText:text=>({width:text.length*6})});
  if(tag==='a')node.click=()=>{
   assert.ok(urls.has(node.href),'download points at an existing result Blob');
   downloads.push({name:node.download,blob:urls.get(node.href)});
  };
  return node;
 };
 const host=doc.createElement('div'),stage=doc.createElement('div'),controls=doc.createElement('div');
 doc.body.appendChild(host);host.append(stage,controls);
 const svg=doc.createElement('svg');svg.cloneNode=()=>doc.createElement('svg');stage.appendChild(svg);
 const caption=doc.createElement('span');caption.className='plato-caption-text';caption.textContent='De kan vende sig mod lyset.';stage.appendChild(caption);
 // These small media doubles let the real runtime reach its completed-download
 // state. Native encoding/decoding is verified separately by the browser smoke.
 class Encoder{
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){this.callbacks=callbacks;this.encodeQueueSize=0;state.encoders++;}
  configure(){}
  encode(frame,{keyFrame}){
   const data=Uint8Array.from([0,0,0,2,0x65,frame.timestamp%251]);
   this.callbacks.output({byteLength:data.length,timestamp:frame.timestamp,type:keyFrame?'key':'delta',copyTo:target=>target.set(data)},
    {decoderConfig:{description:Uint8Array.from([1,77,0,31,255,225,0,4,103,77,0,31,1,0,2,104,0])}});
  }
  async flush(){}
  close(){}
 }
 class Frame{constructor(_canvas,options){Object.assign(this,options);}close(){}}
 class Image{async decode(){}}
 class XMLSerializer{serializeToString(){return '<svg xmlns="http://www.w3.org/2000/svg"/>';}}
 doc.defaultView.VideoEncoder=Encoder;doc.defaultView.VideoFrame=Frame;
 const wav=module('wav.js');
 const soundtrack={
  async render(options){state.audioRenders++;state.audioOptions=options;if(audioGate)await audioGate;
   return {sampleRate:48000,channels:2,frameCount:options.frameCount,description:Uint8Array.from([0x11,0x90]),
    samples:Array.from({length:Math.ceil(options.frameCount/1024)},(_,i)=>({data:Uint8Array.from([1,2,3,i]),timestamp:Math.round(i*1024/48000*1e6)}))};
  },
  async renderStems(options){state.stemRenders++;state.audioOptions=options;
   return ['music','speech','effects'].filter(id=>options[id]).map((id,index)=>{
    const writer=new wav.Writer(48000,2,options.frameCount),data=new Float32Array(options.frameCount).fill(.1*(index+1));
    writer.append([data,data],0,data.length);return {id,...writer.finish()};
   });
  }
 };
 let nextUrl=0;
 const URL={createObjectURL(blob){const id='blob:test-'+(++nextUrl);urls.set(id,blob);return id;},revokeObjectURL(id){urls.delete(id);}};
 const runtime=module('runtime.js',{document:doc,window:doc.defaultView,navigator:{},URL,Image,XMLSerializer,
  setTimeout(fn,delay){if(delay>=60000)return 0;return setTimeout(fn,delay);},
  require(name){return {
   '$:/plugins/huwiki/animus-video-export/mp4.js':module('mp4.js'),
   '$:/plugins/huwiki/animus-video-export/audio.js':soundtrack,
   '$:/plugins/huwiki/animus-video-export/bundle.js':module('bundle.js')
  }[name];}
 });
 const exporter=runtime.attach({host,stage,controls,scene:{name:'Turn Around',scenes:[{duration:1}]},duration:()=>1,
  position:()=>state.position,pause(){},seek(time){state.position=time;state.seeks.push(time);}});
 exporter.open();
 const dialog=doc.querySelector('.huw-video-modal'),start=dialog.querySelector('.huw-video-primary');
 const ranges=dialog.querySelectorAll('.huw-video-range input');ranges[0].value='.2';ranges[1].value='.3';
 function checkbox(pattern){
  const found=dialog.querySelectorAll('.huw-video-check').find(row=>pattern.test(row.textContent));
  assert.ok(found,'checkbox '+pattern);return found.querySelector('input');
 }
 function chooseMode(mode){const select=dialog.querySelector('.huw-video-mode');select.value=mode;select.dispatch('change');}
 function check(pattern,checked){const input=checkbox(pattern);input.checked=checked;input.dispatch('change');}
 function byFile(name){return dialog.querySelectorAll('.huw-video-file-download').find(button=>button.getAttribute('aria-label')===(lang==='da'?'Hent ':'Save ')+name);}
 function rowNames(){return dialog.querySelectorAll('.huw-video-file-download').map(button=>button.getAttribute('aria-label').replace(/^(Hent|Save) /,''));}
 function download(button){assert.ok(button,'download control exists');assert.equal(button.hidden,false);assert.equal(button.disabled===true,false);const count=downloads.length;button.click();assert.equal(downloads.length,count+1);return downloads.at(-1);}
 return {doc,dialog,start,state,downloads,chooseMode,check,checkbox,byFile,rowNames,download,exporter,
  summary:()=>dialog.querySelector('.huw-video-summary').textContent,
  all:()=>dialog.querySelector('.huw-video-download-all'),
  async run(){await start.onclick();assert.match(dialog.querySelector('.huw-video-status').textContent,/klar:|ready:/);}
 };
}

test('completed MP4 plus selected captions offers both individual files and one complete ZIP without re-encoding',async()=>{
 const f=fixture();
 assert.match(f.summary(),/video\.mp4/);assert.match(f.summary(),/captions\.vtt/);
 assert.match(f.summary(),/samlet|blande|mix/i);
 await f.run();
 assert.equal(f.downloads.length,0,'completing an export does not trigger a download without the user');
 assert.deepEqual(f.rowNames().sort(),['captions.vtt','video.mp4']);
 const video=f.download(f.byFile('video.mp4')),caption=f.download(f.byFile('captions.vtt'));
 assert.equal(video.blob.type,'video/mp4');assert.match(await caption.blob.text(),/^WEBVTT\n/);
 assert.match(await caption.blob.text(),/De kan vende sig mod lyset/);
 const all=f.download(f.all());assert.match(all.name,/\.zip$/);assert.equal(all.blob.type,'application/zip');
 const files=await unzip(all.blob);
 assert.deepEqual([...files.keys()].sort(),['captions.vtt','video.mp4']);
 assert.deepEqual(files.get('video.mp4'),Buffer.from(await video.blob.arrayBuffer()));
 assert.deepEqual(files.get('captions.vtt'),Buffer.from(await caption.blob.arrayBuffer()));
 assert.equal(f.state.encoders,1,'all downloads reuse the completed movie');assert.equal(f.state.audioRenders,1);
 assert.equal(f.dialog.querySelector('.huw-video-download'),f.byFile('video.mp4'),'existing direct-MP4 action stays available');
 assert.equal(f.all().getAttribute('aria-label'),'Hent alle valgte filer');
 assert.equal(f.start.textContent,'Opret igen');assert.ok(f.start.classList.contains('huw-video-recreate'));
 const list=f.dialog.querySelector('.huw-video-files');assert.equal(f.doc.activeElement,list);assert.ok(f.state.scrolled.includes(list));
 assert.equal(f.state.position,.8,'download completion restores the paused source position');
});

test('unselected captions are absent from MP4 output and the single-file all action downloads the movie directly',async()=>{
 const f=fixture({lang:'en'});f.check(/\.vtt/i,false);
 assert.doesNotMatch(f.summary(),/captions\.vtt/);
 await f.run();assert.deepEqual(f.rowNames(),['video.mp4']);
 assert.equal(f.byFile('captions.vtt'),undefined);
 const all=f.download(f.all()),video=f.download(f.byFile('video.mp4'));
 assert.match(all.name,/\.mp4$/);assert.equal(all.blob.type,'video/mp4');
 assert.deepEqual(Buffer.from(await all.blob.arrayBuffer()),Buffer.from(await video.blob.arrayBuffer()));
 assert.equal(f.all().getAttribute('aria-label'),'Save all selected files');
 assert.equal(f.state.encoders,1);
});

test('editing and audio-only packages expose exactly the selected WAVs, captions and all package support files',async()=>{
 for(const mode of ['bundle','stems'])for(const captions of [false,true]){
  const f=fixture();f.chooseMode(mode);f.check(/Musik|Music/,false);f.check(/Tale|Speech/,true);f.check(/Lydeffekter|Sound effects/,true);
  f.check(/\.vtt/i,captions);
  assert.match(f.summary(),/speech\.wav/);assert.match(f.summary(),/effects\.wav/);assert.doesNotMatch(f.summary(),/music\.wav/);
  if(mode==='stems')assert.doesNotMatch(f.summary(),/video\.mp4/);
  await f.run();
  const expected=['speech.wav','effects.wav','manifest.json','README.txt'];
  if(mode==='bundle')expected.push('video.mp4');if(captions)expected.push('captions.vtt');
  assert.deepEqual(f.rowNames().sort(),expected.sort(),mode+' every actual output has an individual download');
  const all=f.download(f.all()),files=await unzip(all.blob);assert.deepEqual([...files.keys()].sort(),expected.sort());
  assert.equal(f.dialog.querySelector('.huw-video-download'),f.all(),'existing ZIP action remains the all-files action');
  for(const name of expected){
   const button=f.byFile(name);assert.ok(button?.closest('.huw-video-file-row'),name+' has its own accessible row');
   assert.match(button.textContent,/↓/,'each file has its visible download arrow');
   if(name==='manifest.json'||name==='README.txt'){
    const details=button.closest('details');assert.ok(details,'support files are in the expandable package details');details.open=true;
   }
   const direct=f.download(button);assert.deepEqual(Buffer.from(await direct.blob.arrayBuffer()),files.get(name),name+' individual bytes equal ZIP bytes');
  }
  const manifest=JSON.parse(files.get('manifest.json'));assert.deepEqual(manifest.audio.map(stem=>stem.id).sort(),['effects','speech']);
  assert.equal(!!manifest.video,mode==='bundle');assert.equal(!!manifest.captions,captions);
  assert.equal(f.state.stemRenders,1);assert.equal(f.state.encoders,mode==='bundle'?1:0);
 }
});

test('an active export rejects a second creation and a deliberate Opret igen clears old outputs before replacing them',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const f=fixture({audioGate:gate}),first=f.start.onclick();
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.start.disabled,true);
 await f.start.onclick();assert.equal(f.state.audioRenders,1,'second active click does not render again');
 assert.equal(f.all().hidden,true);assert.equal(f.downloads.length,0);
 release();await first;assert.equal(f.state.audioRenders,1);assert.equal(f.state.encoders,1);
 assert.equal(f.start.textContent,'Opret igen');
 f.check(/\.vtt/i,false);
 assert.equal(f.dialog.querySelector('.huw-video-changed').hidden,false,'changed selections identify the existing files as the previous export');
 const second=f.start.onclick();
 assert.equal(f.all().hidden,true,'prior all-files download is hidden while rebuilding');
 assert.equal(f.dialog.querySelectorAll('.huw-video-file-download').length,0,'prior per-file controls are cleared immediately');
 await second;
 assert.deepEqual(f.rowNames(),['video.mp4']);assert.equal(f.state.audioRenders,2);assert.equal(f.state.encoders,2);
 assert.equal(f.dialog.querySelector('.huw-video-changed').hidden,true,'new output matches the current selections');
 const latest=f.download(f.all());assert.equal(latest.blob.type,'video/mp4','no stale VTT or prior ZIP survives the new export');
});
