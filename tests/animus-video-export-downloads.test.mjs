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

async function mp4TrackKinds(blob){
 const bytes=Buffer.from(await blob.arrayBuffer());
 function atoms(start,end){const rows=[];for(let at=start;at<end;){const size=bytes.readUInt32BE(at);assert.ok(size>=8&&at+size<=end);rows.push({type:bytes.toString('ascii',at+4,at+8),start:at+8,end:at+size});at+=size;}return rows;}
 const moov=atoms(0,bytes.length).find(box=>box.type==='moov');assert.ok(moov);
 return atoms(moov.start,moov.end).filter(box=>box.type==='trak').map(track=>{
  const mdia=atoms(track.start,track.end).find(box=>box.type==='mdia');
  const hdlr=atoms(mdia.start,mdia.end).find(box=>box.type==='hdlr');return bytes.toString('ascii',hdlr.start+8,hdlr.start+12);
 });
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

function fixture({lang='da',beginExport}={}){
 const doc=svgDocument(),downloads=[],urls=new Map();
 const state={encoders:0,audioRenders:0,stemIds:[],seeks:[],scrolled:[],position:.8,burnedText:0,
  revision:{visual:0,audio:0,captions:0},audioStarted:deferred(),stemStarted:deferred()};
 doc.documentElement.lang=lang;
 const create=doc.createElement;
 doc.createElement=tag=>{
  const node=create(tag);node.scrollIntoView=()=>state.scrolled.push(node);
  if(tag==='canvas')node.getContext=()=>({save(){},restore(){},fillRect(){},drawImage(){},fillText(){state.burnedText++;},measureText:text=>({width:text.length*6})});
  if(tag==='a')node.click=()=>{
   assert.ok(urls.has(node.href),'download points at an existing result Blob');downloads.push({name:node.download,blob:urls.get(node.href)});
  };
  return node;
 };
 const host=doc.createElement('div'),stage=doc.createElement('div'),controls=doc.createElement('div');
 doc.body.appendChild(host);host.append(stage,controls);
 const svg=doc.createElement('svg');svg.cloneNode=()=>doc.createElement('svg');stage.appendChild(svg);
 const caption=doc.createElement('span');caption.className='plato-caption-text';caption.textContent='De kan vende sig mod lyset.';stage.appendChild(caption);
 // Deterministic media doubles reach the real lifecycle and download handlers.
 // Native encoder correctness is covered by the separate browser checks.
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
  async render(options){state.audioRenders++;state.audioOptions=options;state.audioStarted.resolve();if(state.audioGate)await state.audioGate;
   if(options.cancelled?.())throw Error('Export cancelled');if(state.audioError)throw Error(state.audioError);
   return {sampleRate:48000,channels:2,frameCount:options.frameCount,description:Uint8Array.from([0x11,0x90]),
    samples:Array.from({length:Math.ceil(options.frameCount/1024)},(_,i)=>({data:Uint8Array.from([1,2,3,i]),timestamp:Math.round(i*1024/48000*1e6)}))};
  },
  async renderStems(options){
   const selected=['music','speech','effects'].filter(id=>options[id]);state.stemIds.push(...selected);state.stemStarted.resolve();
   if(state.stemGate)await state.stemGate;if(options.cancelled?.())throw Error('Export cancelled');if(state.stemError)throw Error(state.stemError);
   return selected.map(id=>{
    const writer=new wav.Writer(48000,2,options.frameCount),data=new Float32Array(options.frameCount).fill({music:.1,speech:.2,effects:.3}[id]);
    writer.append([data,data],0,data.length);return {id,...writer.finish()};
   });
  }
 };
 let nextUrl=0;
 const URL={createObjectURL(blob){const id='blob:test-'+(++nextUrl);urls.set(id,blob);return id;},revokeObjectURL(id){urls.delete(id);}};
 const runtime=module('runtime.js',{document:doc,window:doc.defaultView,navigator:{},URL,Image,XMLSerializer,clearTimeout,
  setTimeout(fn,delay){if(delay>=60000)return 0;return setTimeout(fn,delay);},
  require(name){return {
   '$:/plugins/huwiki/animus-video-export/mp4.js':module('mp4.js'),
   '$:/plugins/huwiki/animus-video-export/audio.js':soundtrack,
   '$:/plugins/huwiki/animus-video-export/bundle.js':module('bundle.js')
  }[name];}
 });
 const exporter=runtime.attach({host,stage,controls,scene:{name:'Turn Around',scenes:[{duration:1}],musical:{audioClips:[]}},duration:()=>1,
  getSourceRevision:()=>state.revision,position:()=>state.position,pause(){state.paused=true;state.pauseCalls=(state.pauseCalls||0)+1;},
  beginExport:beginExport?()=>beginExport(state):undefined,
  seek(time){state.seeks.push(time);if(state.failSeekAt===time)throw Error('Scene restore failed');state.position=time;}});
 exporter.open();
 const dialog=()=>doc.querySelector('.huw-video-modal'),start=()=>dialog().querySelector('.huw-video-primary');
 function setting(selector,value){const input=dialog().querySelector(selector);assert.ok(input,selector);input.value=value;input.dispatch('change');}
 function check(id,checked){const input=dialog().querySelector('[data-export-file="'+id+'"]');assert.ok(input,id);input.checked=checked;input.dispatch('change');}
 function selected(ids){for(const id of ['video','music','speech','effects','captions'])check(id,ids.includes(id));}
 function range(from,to){const inputs=dialog().querySelectorAll('.huw-video-range input');inputs[0].value=String(from);inputs[1].value=String(to);inputs.forEach(input=>input.dispatch('change'));}
 function byFile(name){return dialog().querySelectorAll('.huw-video-file-download').find(button=>button.getAttribute('aria-label')===(lang==='da'?'Hent ':'Save ')+name);}
 function download(button){assert.ok(button,'download control exists');assert.equal(button.hidden,false);assert.equal(button.disabled===true,false);const count=downloads.length;button.click();assert.equal(downloads.length,count+1);return downloads.at(-1);}
 range(.2,.3);
 return {doc,caption,get dialog(){return dialog();},get start(){return start();},state,downloads,setting,check,selected,range,byFile,download,exporter,
  all:()=>dialog().querySelector('.huw-video-download-all'),
  async run(){await start().onclick();assert.doesNotMatch(dialog().querySelector('.huw-video-status').textContent,/Eksportfejl:|Export error:/);},
  reopen(){dialog()?.querySelector('.huw-video-close').click();exporter.open();}
 };
}

test('file-first defaults create a playback-audio MP4 and VTT, with separate accessible downloads and no automatic saves',async()=>{
 const f=fixture();assert.equal(f.dialog.querySelector('.huw-video-mode'),null,'there is no export-mode coupling');
 for(const id of ['video','music','speech','effects','captions'])assert.equal(f.dialog.querySelector('[data-export-file="'+id+'"]').checked,['video','captions'].includes(id),id+' default');
 assert.equal(f.dialog.querySelector('.huw-video-audio').value,'playback');
 assert.equal(f.dialog.querySelector('.huw-video-captions').value,'burn');
 assert.equal(f.byFile('music.wav').disabled,true,'an uncreated file has no working download');
 await f.run();assert.equal(f.downloads.length,0);
 const video=f.download(f.byFile('video.mp4')),captions=f.download(f.byFile('captions.vtt'));
 assert.deepEqual(await mp4TrackKinds(video.blob),['vide','soun'],'WAV boxes off never silences the MP4');
 for(const kind of ['music','speech','effects'])assert.equal(f.state.audioOptions[kind],true,'playback MP4 includes '+kind);
 assert.deepEqual(f.state.stemIds,[]);assert.ok(f.state.burnedText>0);
 assert.match(await captions.blob.text(),/^WEBVTT\n/);assert.match(await captions.blob.text(),/De kan vende sig mod lyset/);
 const files=await unzip(f.download(f.all()).blob);assert.deepEqual([...files.keys()].sort(),['captions.vtt','video.mp4']);
 assert.deepEqual(files.get('video.mp4'),Buffer.from(await video.blob.arrayBuffer()));
 assert.deepEqual(files.get('captions.vtt'),Buffer.from(await captions.blob.arrayBuffer()));
 for(const name of ['video.mp4','captions.vtt']){const button=f.byFile(name);assert.ok(button.closest('.huw-video-file-row'));assert.match(button.textContent,/↓/);}
 assert.equal(f.all().getAttribute('aria-label'),'Hent alle valgte filer');
 assert.doesNotMatch(f.start.textContent,/Opret igen|Create again/i);assert.equal(f.start.disabled,true,'ready current files require no creation');
 assert.equal(f.state.position,.8);assert.ok(f.state.scrolled.includes(f.dialog.querySelector('.huw-video-files')));
 const counts=[f.state.encoders,f.state.audioRenders,f.state.stemIds.length,f.state.seeks.length];
 await f.run();assert.deepEqual([f.state.encoders,f.state.audioRenders,f.state.stemIds.length,f.state.seeks.length],counts,'unchanged repeated start performs no media work');
});

test('adding WAV and VTT after MP4 reuses the movie and captured captions, and ZIP includes only checked outputs',async()=>{
 const f=fixture();f.selected(['video']);f.setting('.huw-video-captions','none');await f.run();
 const original=f.download(f.byFile('video.mp4')),movieBytes=Buffer.from(await original.blob.arrayBuffer());
 const framesBefore=f.state.seeks.filter(time=>time!==.8).length;
 assert.equal(f.state.burnedText,0);assert.equal(f.byFile('captions.vtt').disabled,true);
 f.check('music',true);f.check('captions',true);assert.equal(f.start.disabled,false);await f.run();
 assert.equal(f.state.encoders,1);assert.equal(f.state.audioRenders,1);assert.deepEqual(f.state.stemIds,['music']);
 assert.equal(f.state.seeks.filter(time=>time!==.8).length,framesBefore,'adding a sidecar reuses captured captions without seeking every frame');
 const files=await unzip(f.download(f.all()).blob);
 assert.deepEqual([...files.keys()].sort(),['README.txt','captions.vtt','manifest.json','music.wav','video.mp4']);
 assert.deepEqual(files.get('video.mp4'),movieBytes,'adding separate files preserves the exact original mixed movie');
 assert.deepEqual(Buffer.from(await f.download(f.byFile('music.wav')).blob.arrayBuffer()),files.get('music.wav'));
 const manifest=JSON.parse(files.get('manifest.json'));assert.equal(manifest.video.audio,true);assert.equal(manifest.video.burnedCaptions,false);
 assert.deepEqual(manifest.audio.map(track=>track.id),['music']);
 f.check('music',false);await f.run();
 const smaller=await unzip(f.download(f.all()).blob);assert.deepEqual([...smaller.keys()].sort(),['captions.vtt','video.mp4']);
 assert.deepEqual(smaller.get('video.mp4'),movieBytes);assert.equal(f.byFile('music.wav').disabled,false,'previously ready WAV remains individually downloadable');
 assert.equal(f.state.encoders,1);assert.equal(f.state.audioRenders,1);assert.deepEqual(f.state.stemIds,['music']);
});

test('silent MP4 is explicit and independent of selected WAVs and caption-file selection',async()=>{
 const f=fixture({lang:'en'});f.selected(['video','speech']);f.setting('.huw-video-audio','silent');await f.run();
 assert.deepEqual(await mp4TrackKinds(f.download(f.byFile('video.mp4')).blob),['vide']);
 assert.equal(f.state.audioRenders,0);assert.deepEqual(f.state.stemIds,['speech']);
 assert.ok(f.state.burnedText>0,'burned subtitles remain active when the VTT file is unchecked');
 assert.equal(f.byFile('captions.vtt').disabled,true);
 const files=await unzip(f.download(f.all()).blob);assert.deepEqual([...files.keys()].sort(),['README.txt','manifest.json','speech.wav','video.mp4']);
 const manifest=JSON.parse(files.get('manifest.json'));assert.equal(manifest.video.audio,false);assert.equal(manifest.video.burnedCaptions,true);assert.equal(manifest.captions,null);
 assert.equal(f.all().getAttribute('aria-label'),'Save all selected files');
 f.check('speech',false);await f.run();const only=f.download(f.all());assert.equal(only.blob.type,'video/mp4');
 assert.equal(f.state.encoders,1,'unchecking a WAV never regenerates or changes MP4 sound');
});

test('selected audio files work without video codecs and support files accurately describe their common origin',async()=>{
 const f=fixture();delete f.doc.defaultView.VideoEncoder;delete f.doc.defaultView.VideoFrame;
 f.selected(['speech','effects','captions']);await f.run();
 assert.equal(f.state.encoders,0);assert.equal(f.state.audioRenders,0);assert.deepEqual(f.state.stemIds.sort(),['effects','speech']);
 const files=await unzip(f.download(f.all()).blob);assert.deepEqual([...files.keys()].sort(),['README.txt','captions.vtt','effects.wav','manifest.json','speech.wav']);
 for(const name of ['speech.wav','effects.wav','captions.vtt']){
  const button=f.byFile(name);assert.match(button.textContent,/↓/);assert.deepEqual(Buffer.from(await f.download(button).blob.arrayBuffer()),files.get(name));
 }
 const manifest=JSON.parse(files.get('manifest.json'));assert.equal(manifest.video,null);assert.equal(manifest.timeline.audioFrames,4800);
 assert.deepEqual(manifest.audio.map(stem=>stem.id).sort(),['effects','speech']);
 assert.deepEqual(manifest.sourceRange,{startSeconds:.2,endSeconds:.3});
 f.selected(['speech']);await f.run();
 const single=f.download(f.all()),individual=f.download(f.byFile('speech.wav'));
 assert.equal(single.blob.type,'audio/wav','one selected WAV downloads directly without an unnecessary ZIP');
 assert.equal(single.name,individual.name,'all-files and the arrow keep the same identifiable WAV filename');
 assert.match(single.name,/-speech\.wav$/);
 assert.deepEqual(Buffer.from(await single.blob.arrayBuffer()),Buffer.from(await individual.blob.arrayBuffer()));
 assert.deepEqual(f.state.stemIds.sort(),['effects','speech'],'changing the selection reuses the existing WAV');
});

test('closing and reopening preserves settings, ready files and reuse while source revisions invalidate the affected outputs',async()=>{
 const f=fixture();f.selected(['video','music','captions']);f.setting('.huw-video-captions','none');await f.run();
 const saved=f.download(f.byFile('video.mp4')).blob;
 f.reopen();assert.equal(f.dialog.querySelector('.huw-video-captions').value,'none');assert.equal(f.dialog.querySelector('[data-export-file="music"]').checked,true);
 assert.equal(f.dialog.querySelectorAll('.huw-video-range input')[0].value,'0.2');
 assert.deepEqual(Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer()),Buffer.from(await saved.arrayBuffer()));
 await f.run();assert.equal(f.state.encoders,1);assert.deepEqual(f.state.stemIds,['music']);
 f.setting('.huw-video-resolution','1920');await f.run();assert.equal(f.state.encoders,2);assert.deepEqual(f.state.stemIds,['music'],'picture resolution does not invalidate WAV');
 f.state.revision.visual++;f.reopen();await f.run();assert.equal(f.state.encoders,3);assert.deepEqual(f.state.stemIds,['music']);
 f.state.revision.audio++;f.reopen();await f.run();assert.equal(f.state.encoders,4,'changed source sound invalidates a playback-audio movie');assert.deepEqual(f.state.stemIds,['music','music']);
 f.caption.textContent='They can turn toward the light.';f.state.revision.captions++;f.reopen();await f.run();
 assert.equal(f.state.encoders,4,'a caption-language change leaves clean-picture MP4 intact');
 assert.match(await f.download(f.byFile('captions.vtt')).blob.text(),/They can turn toward the light/);
 assert.deepEqual(f.state.stemIds,['music','music'],'caption changes do not rerender audio');
 f.setting('.huw-video-captions','burn');await f.run();assert.equal(f.state.encoders,5);
 f.caption.textContent='Nu kan de se lyset.';f.state.revision.captions++;f.reopen();await f.run();
 assert.equal(f.state.encoders,6,'changed burned captions invalidate the picture');
 assert.match(await f.download(f.byFile('captions.vtt')).blob.text(),/Nu kan de se lyset/);
 f.range(.4,.5);await f.run();assert.equal(f.state.encoders,7);assert.deepEqual(f.state.stemIds,['music','music','music']);
 const files=await unzip(f.download(f.all()).blob);assert.deepEqual(JSON.parse(files.get('manifest.json')).sourceRange,{startSeconds:.4,endSeconds:.5});
});

test('a failed new file leaves the completed movie downloadable and retry only produces the missing file',async()=>{
 const f=fixture();f.selected(['video']);await f.run();const original=Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer());
 f.check('music',true);f.state.stemError='Recording unavailable';await f.start.onclick();
 assert.match(f.dialog.querySelector('.huw-video-status').textContent,/Recording unavailable/);
 assert.deepEqual(Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer()),original);
 assert.equal(f.byFile('music.wav').disabled,true);assert.equal(f.state.encoders,1);
 f.reopen();assert.deepEqual(Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer()),original);
 f.state.stemError=null;await f.run();assert.equal(f.state.encoders,1);assert.equal(f.state.audioRenders,1);
 const files=await unzip(f.download(f.all()).blob);assert.deepEqual(files.get('video.mp4'),original);assert.ok(files.has('music.wav'));
});

test('cancelling an addition retains prior downloads and active duplicate clicks cannot create another render',async()=>{
 const f=fixture();f.selected(['video']);await f.run();const original=Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer());
 const gate=deferred();f.state.stemGate=gate.promise;f.check('speech',true);
 const pending=f.start.onclick();await f.state.stemStarted.promise;
 assert.equal(f.start.disabled,true);await f.start.onclick();assert.deepEqual(f.state.stemIds,['speech']);
 assert.deepEqual(Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer()),original,'a finished file stays downloadable while another file is rendering');
 const cancel=f.dialog.querySelector('.huw-video-cancel');assert.ok(cancel);cancel.click();gate.resolve();await pending;
 assert.ok(f.dialog,'cancel keeps the export panel and its finished files');
 assert.deepEqual(Buffer.from(await f.download(f.byFile('video.mp4')).blob.arrayBuffer()),original);
 assert.equal(f.byFile('speech.wav').disabled,true);assert.equal(f.state.encoders,1);assert.equal(f.state.audioRenders,1);
 f.state.stemGate=null;await f.run();assert.deepEqual(f.state.stemIds,['speech','speech']);assert.equal(f.state.encoders,1);
});



test('export returns to the original scene before restoring selection zoom and editor visibility',async()=>{
 const restores=[];
 const f=fixture({beginExport(state){
  state.previewSuspended=true;state.zoomActive=true;
  // The selected body part exists only in the edited scene. The end of the
  // exported interval is in another scene with no corresponding geometry.
  return ()=>{restores.push(state.position);state.previewSuspended=false;state.zoomActive=state.position>=.5;};
 }});
 f.selected(['captions']);f.range(.2,.3);await f.run();
 assert.ok(f.state.seeks.some(time=>time<.5),'the export visits a different scene');
 assert.deepEqual(restores,[.8],'preview restoration observes the original edited scene');
 assert.equal(f.state.zoomActive,true,'selection zoom survives an export ending in another scene');
 assert.equal(f.state.previewSuspended,false);assert.equal(f.state.paused,true);
});

test('failed return seek still releases export preview suspension and pauses the player',async()=>{
 let restored=0;
 const f=fixture({beginExport(state){state.previewSuspended=true;return ()=>{restored++;state.previewSuspended=false;};}});
 f.selected(['captions']);f.state.failSeekAt=.8;const pausesBefore=f.state.pauseCalls;await f.run();
 assert.equal(restored,1,'cleanup is guaranteed even if the original scene can no longer be sought');
 assert.equal(f.state.pauseCalls,pausesBefore+2,'the final pause still runs after a failed return seek');
 assert.equal(f.state.previewSuspended,false);assert.equal(f.state.paused,true);
 assert.equal(f.byFile('captions.vtt').disabled,false,'a completed caption file remains downloadable');
});
