import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createContext,Script} from 'node:vm';

const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const base='$:/plugins/huwiki/site-publisher/',musical='$:/plugins/huwiki/musical/';
let adapters,publisher,viewer,cutout,abcRows;
test.before(async()=>{
 [adapters,publisher,viewer,cutout]=await Promise.all([
  Promise.all([read('plugins/site-publisher/src/media-export.js'),read('plugins/site-publisher/src/animus-export.js')]).then(x=>x.join('\n')),
  read('plugins/site-publisher/src/publisher.js'),read('plugins/site-publisher/src/animus-viewer.js'),read('plugins/site-publisher/src/cutout-viewer.js')
 ]);
 abcRows=JSON.parse(JSON.parse(await read('plugins/abc/dist/plugin.json')).text).tiddlers;
});
function wave(seconds=1){
 const rate=8000,n=Math.round(rate*seconds),buffer=Buffer.alloc(44+n*2);buffer.write('RIFF');buffer.writeUInt32LE(36+n*2,4);buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)buffer.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*440*i/rate)*Math.min(1,i/100,(n-i)/100)),44+i*2);return buffer;
}
function fixtures(){
 const pose=t=>({t,x:60,y:60,r:0,sx:1,sy:1,opacity:1});
 const scene={version:1,name:'Scene',width:800,height:450,duration:8,background:'#f7eddb',sceneNotes:'PRIVATE DRAFT NOTE',parts:[
  {id:'body',type:'circle',geo:{r:15},fill:'#a34e42',keys:[pose(0),{...pose(8),x:600}]},
  {id:'spoken-0',type:'text',text:'A recorded line',keys:[{...pose(0),opacity:0},{...pose(1),opacity:1},{...pose(4),opacity:0,easing:'step'}]}
 ]};
 const film={version:1,name:'A little musical',width:800,height:450,duration:8,parts:[],scenes:[{source:'Scene',duration:8}],musical:{songs:[{id:'song',score:'Score',start:0,duration:8,volume:1}],audioClips:[{id:'voice',asset:'Recorded voice',start:1,offset:.1,duration:.8,sourceDuration:1,volume:.5}],sfx:[{id:'effect',t:2,type:'bell',duration:.4,volume:.2}],animationClips:[{id:'move',target:'body',start:0,duration:8,beatsPerLoop:2,motion:{body:[{...pose(0),r:-20},{...pose(1),r:20},{...pose(2),r:-20}]}}]}};
 return {
  Film:{title:'Film',type:'application/json','cutout-id':'film',text:JSON.stringify(film)},
  Scene:{title:'Scene',type:'application/json','cutout-id':'scene',text:JSON.stringify(scene)},
  Score:{title:'Score',type:'text/vnd.abc',text:'X:1\nT:Test\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nC D E F | G A B c |', 'abc-accompaniment':'{"enabled":false,"metronome":false}',_canonical_uri:'file:///private/score'},
  'Recorded voice':{title:'Recorded voice',type:'audio/wav',text:wave().toString('base64'),_canonical_uri:'file:///private/voice.wav'},
  Secret:{title:'Secret',type:'text/plain',text:'This unrelated tiddler must not be exported'}
 };
}
function lipsyncFixtures(){
 const rows=fixtures(),scene=JSON.parse(rows.Scene.text);
 function actor(id,name,x){const pose=(opacity=1)=>({t:0,x:0,y:0,r:0,sx:1,sy:1,opacity});return [
  {id,name,type:'group',parent:null,keys:[{...pose(),x,y:180}]},
  {id:id+'-head',name:'Head',parent:id,type:'circle',geo:{r:40},fill:'#e4bc8b',keys:[pose()]},
  {id:id+'-mouth-closed',name:'Mund lukket',parent:id,type:'path',geo:{d:'M -16 12 Q 0 20 16 12'},fill:'none',stroke:'#4c2929',strokeWidth:3,keys:[pose()]},
  {id:id+'-mouth-open',name:'Mund åben',parent:id,type:'ellipse',geo:{rx:13,ry:10,cy:14},fill:'#4c2929',keys:[pose(0)]}
 ];}
 scene.parts.push(...actor('ci-alma','Alma',260),...actor('ci-bo','Bo',540));
 const cue=scene.parts.find(p=>p.id==='spoken-0');cue.text='ALMA: Aaaaaa.';cue.keys=[{t:0,opacity:0,easing:'step'},{t:1,opacity:1,easing:'step'},{t:5,opacity:0,easing:'step'}];cue.lipSync={enabled:true,target:'ci-alma',open:'ci-alma-mouth-open',closed:'ci-alma-mouth-closed',timing:'script',offset:0,strength:1};
 rows.Scene.text=JSON.stringify(scene);return rows;
}
function wiki(rows){return {getTiddler:k=>rows[k]?{fields:rows[k]}:null,getTiddlerText:(k,f='')=>rows[k]?.text??f,each(fn){Object.keys(rows).forEach(k=>fn({fields:rows[k]},k));},getTagMap:()=>({})};}
function adapter(rows){return new Function('$tw','safe',adapters+'\nreturn {collectAnimus,isAnimusTitle,animusWidgetMarkup,animusWidgetPlaceholders,animusBundle};')({wiki:wiki(rows)},s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));}
async function runtimeRows(rows=fixtures()){
 const all={...abcRows,...rows};
 for(const name of ['playlist','motion','sync','sfx','narration-player','lipsync'])all[musical+name+'.js']={text:await read('plugins/musical/src/'+name+'.js')};
 all[base+'cutout/viewer.js']={text:cutout};all[base+'cutout/viewer.css']={text:'.huw-site-cutout{width:100%}'};
 all[base+'animus/viewer.js']={text:viewer};all[base+'animus/viewer.css']={text:await read('plugins/site-publisher/src/animus-viewer.css')};
 return all;
}
async function siteHtml(rows){
 const all=await runtimeRows(rows),exports={},context=createContext({exports,$tw:{wiki:wiki(all),modules:{execute(){throw Error('No score article requested');}}},document:{documentElement:{lang:'en'}},navigator:{language:'en'}});
 const source=publisher.replace('exports.startup=function(){','exports.build=makeSite;\nexports.startup=function(){');new Script(source).runInContext(context);
 return exports.build([{title:'Film'}],{title:'AniMus publication',lang:'en',layout:'standard'});
}
test('AniMus export collects referenced scenes, scores and recorded audio, with no private URI or scene notes',()=>{
 const rows=fixtures(),api=adapter(rows),ctx={rows:{},used:false};
 assert.equal(api.isAnimusTitle('Film'),true);assert.equal(api.isAnimusTitle('Scene'),false);
 assert.match(api.animusWidgetMarkup('Film','',ctx),/class="huw-site-animus"/);
 assert.deepEqual(Object.keys(ctx.rows).sort(),['Film','Scene','Score','Recorded voice'].sort());assert.equal(ctx.animus,true);
 assert.match(ctx.rows['Recorded voice'].text,/^data:audio\/wav;base64,/);
 assert.equal(ctx.rows.Score['abc-accompaniment'],rows.Score['abc-accompaniment']);
 assert.doesNotMatch(JSON.stringify(ctx.rows),/PRIVATE DRAFT|file:\/\/\/private|unrelated tiddler/);
});
test('AniMus export reports missing score or recording before creating an incomplete site',()=>{
 const rows=fixtures();delete rows['Recorded voice'];assert.throws(()=>adapter(rows).collectAnimus('Film','',{rows:{},used:false}),/recorded audio is missing/);
 const missing=fixtures();delete missing.Score;assert.throws(()=>adapter(missing).collectAnimus('Film','',{rows:{},used:false}),/missing score/);
});
test('SVG image parts with variant-only sources publish all frames and still reject missing frame media',async()=>{
 const rows=fixtures(),scene=JSON.parse(rows.Scene.text),svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path d="M2 2L28 28" stroke="red"/></svg>',inline='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 const part={id:'svg-layer',type:'image',geo:{x:0,y:0,w:30,h:30},variants:[{id:'frame-1',imageData:inline},{id:'frame-2',asset:'SVG frame'}],keys:[{t:0,variantId:'frame-1'},{t:1,variantId:'frame-2',easing:'step'}]};
 scene.parts.push(part);rows.Scene.text=JSON.stringify(scene);rows['SVG frame']={title:'SVG frame',type:'image/svg+xml',text:svg,_canonical_uri:'file:///private/frame.svg'};
 const ctx={rows:{},used:false};adapter(rows).collectAnimus('Film','',ctx);
 const exported=JSON.parse(ctx.rows.Scene.text).parts.find(p=>p.id==='svg-layer');
 assert.equal(exported.imageData,undefined,'variant-only parts do not need a duplicate base image');assert.deepEqual(exported.variants,part.variants);assert.equal(ctx.rows['SVG frame'].text,svg);assert.equal(ctx.rows['SVG frame']._canonical_uri,undefined);
 const html=await siteHtml(rows);assert.match(html,/svg-layer/);assert.match(html,/frame-2/);
 delete part.variants[0].imageData;rows.Scene.text=JSON.stringify(scene);assert.throws(()=>adapter(rows).collectAnimus('Film','',{rows:{},used:false}),/lacks an image source/);
 part.variants[0].imageData='https://example.com/frame.svg';rows.Scene.text=JSON.stringify(scene);assert.throws(()=>adapter(rows).collectAnimus('Film','',{rows:{},used:false}),/non-embedded image source/);
 part.variants=[];rows.Scene.text=JSON.stringify(scene);assert.throws(()=>adapter(rows).collectAnimus('Film','',{rows:{},used:false}),/lacks an image source/);
});
test('musical-stage uses a publication placeholder and rejects unresolved widget attributes',()=>{
 const api=adapter(fixtures()),snippets=[],ctx={rows:{},used:false};
 const text=api.animusWidgetPlaceholders('<$musical-stage scene="Film" score="Score"/>',ctx,snippets);
 assert.equal(text,snippets[0].tag);assert.match(snippets[0].html,/data-animus-title="Film"/);
 assert.throws(()=>api.animusWidgetPlaceholders('<$musical-stage scene={{Current}}/>',ctx,[]),/missing scene attribute/);
 const rows=fixtures();rows.Show={title:'Show','animus-scene':'Film','animus-score':'Score'};const selected=[];
 adapter(rows).animusWidgetPlaceholders('<$musical-stage scene={{!!animus-scene}} score={{!!animus-score}}/>',{rows:{},used:false},selected,'Show');
 assert.match(selected[0].html,/data-animus-title="Film"/);assert.match(selected[0].html,/data-animus-score="Score"/);
});
test('published HTML carries the actual shared runtime without editor or recorder modules',async()=>{
 const html=await siteHtml(fixtures());
 assert.match(html,/data-huwiki-animus-reader="1"/);assert.match(html,/data-animus-title=\\"Film\\"/);
 assert.match(html,/musical\/narration-player\.js/);assert.doesNotMatch(html,/getUserMedia|musical\/workspace\.js|musical\/editor\.js|musical\/puppet\.js/);
 assert.match(html,/"engineMode":"original"/);assert.match(html,/HUWikiAniMusSite\.dispose\(article\)/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const s of scripts){if(/type="(?:application\/json|text\/plain)"/.test(s[0].slice(0,s[0].indexOf('>'))))continue;new Script(s[1]);}
});
test('Site publication retains explicit mouth bindings and embeds the shared lipsync module',async()=>{
 const rows=lipsyncFixtures(),ctx={rows:{},used:false};adapter(rows).collectAnimus('Film','',ctx);
 const source=JSON.parse(rows.Scene.text).parts.find(p=>p.id==='spoken-0'),published=JSON.parse(ctx.rows.Scene.text).parts.find(p=>p.id==='spoken-0');
 assert.deepEqual(published.lipSync,source.lipSync);assert.equal(published.text,source.text);
 const html=await siteHtml(rows);assert.match(html,/musical\/lipsync\.js/);assert.match(html,/ci-alma-mouth-open/);assert.doesNotMatch(html,/PRIVATE DRAFT NOTE|musical\/manuscript\.js/);
});

async function playerHarness({delay=false,fail=false,rows=fixtures()}={}){
 let now=0,nextFrame=0,frames=new Map(),audioContext=null,release;
 const controllers=[],media=[],calls={prepare:[],seek:[],tones:0};
 function element(tag){const attrs={},events={},children=[],classes=new Set();let text='';
  const n={tagName:tag.toUpperCase(),localName:tag,style:{},children,isConnected:true,parentNode:null,
   setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k]??null,removeAttribute(k){delete attrs[k];},
   classList:{add(c){classes.add(c);},remove(c){classes.delete(c);},contains:c=>classes.has(c),toggle(c,on){if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);return on;}},
   appendChild(c){children.push(c);c.parentNode=n;return c;},remove(){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.isConnected=false;},
   addEventListener(k,fn){(events[k]||(events[k]=[])).push(fn);},removeEventListener(k,fn){events[k]=(events[k]||[]).filter(x=>x!==fn);},
   fire(k,event={}){for(const fn of events[k]||[])fn({...event,target:event.target||n,preventDefault(){}});},
   querySelectorAll(){return [];},contains(c){return c===n||children.some(x=>x.contains(c));},
   get textContent(){return text;},set textContent(v){text=String(v);children.length=0;}
  };
  if(tag==='audio'){Object.assign(n,{paused:true,currentTime:0,duration:1,volume:1,muted:false,playbackRate:1,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){}});media.push(n);}
  return n;
 }
 function param(){return {value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}};}
 class Context{constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination={};}resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
  createDynamicsCompressor(){return {threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){}};}
  createGain(){return {gain:param(),connect(){}};}createOscillator(){return {frequency:param(),connect(){},start(){calls.tones++;},stop(){}};}
 }
 const doc={documentElement:{lang:'en'},hidden:false,createElement:element,createElementNS:(_,tag)=>element(tag),addEventListener(){},removeEventListener(){}};
 const win={addEventListener(){},AudioContext:Context};
 function Controller(){controllers.push(this);this.isLoaded=false;this.isLoading=false;this.isStarted=false;this.timer={};this.midiBuffer={setVolumes(){}};this.load=(node,control)=>{this.cursor=control;};this.setTune=tune=>{this.visualObj=tune;return Promise.resolve();};}
 win.ABCJS={renderAbc(){return [{getTotalTime:()=>8}];},synth:{supportsAudio:()=>true,SynthController:Controller,activeAudioContext:()=>audioContext,registerAudioContext:c=>{audioContext=c;}}};
 const modules={};
 modules['$:/plugins/huwiki/abc/accompaniment.js']={read:f=>({melodyVolume:80,...JSON.parse(f['abc-accompaniment']||'{}')}),prepare(...args){calls.prepare.push(args[4]);}};
 modules['$:/plugins/huwiki/abc/start-position.js']={seek(c,t,ms){calls.seek.push(ms);c.position=ms;}};
 modules['$:/plugins/huwiki/abc/audio-controller.js']={install(c,ABC,o){c.options=o;c.pause=()=>{c.isStarted=false;c.isLoading=false;};c.destroy=()=>{c.disposed=true;c.pause();};c.play=()=>{o.beforePlay();c.isStarted=true;return Promise.resolve();};
  c.go=()=>{c.isLoading=true;const done=()=>{c.isLoading=false;c.isLoaded=true;};if(fail)return Promise.reject(Error('Samples unavailable'));if(delay)return new Promise(resolve=>{release=()=>{done();resolve();};});done();return Promise.resolve();};return c;
 }};
 const context=createContext({window:win,document:doc,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:n=>frames.delete(n),console,Promise,URL,Uint8Array,Float32Array,setTimeout,clearTimeout});
 new Script(cutout).runInContext(context);modules['$:/plugins/huwiki/cutout/engine.js']=win.HUWikiCutOutSite;
 for(const name of ['playlist','motion','sync','sfx','narration-player','lipsync']){context.exports={};context.require=name=>modules[name];new Script(await read('plugins/musical/src/'+name+'.js')).runInContext(context);modules[musical+name+'.js']=context.exports;}
 win.HUWikiAniMusModules={require:name=>{assert.ok(modules[name],name);return modules[name];}};new Script(viewer).runInContext(context);
 const ctx={rows:{},used:false};adapter(rows).collectAnimus('Film','',ctx);const host=element('section');host.ownerDocument=doc;host.setAttribute('data-animus-title','Film');
 const player=win.HUWikiAniMusSite.mount(host,ctx.rows,{engineMode:'original'});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 return {player,host,calls,controllers,media,flush,release:()=>release&&release(),tick(ms){now+=ms;const running=[...frames.values()];frames.clear();running.forEach(fn=>fn(now));},find(cls){const search=n=>n.className===cls?n:n.children.map(search).find(Boolean);return search(host);}};
}
test('Site runtime shares the clock between SVG motion, music, speech, FX, seek and pause',async()=>{
 const h=await playerHarness();assert.deepEqual(h.calls.prepare,[false]);h.player.play();await h.flush();
 assert.equal(h.controllers.length,1);assert.equal(h.controllers[0].options.engineMode,'original');assert.equal(h.controllers[0].isStarted,true);
 h.player.seek(1.5);await h.flush();assert.equal(h.player.value(),1.5);assert.equal(h.calls.seek.at(-1),1500);
 assert.equal(h.find('huw-animus-line').textContent,'A recorded line');assert.equal(h.media[0].paused,false);assert.ok(Math.abs(h.media[0].currentTime-.6)<.001);assert.equal(h.media[0].volume,.5);
 h.tick(520);await h.flush();assert.ok(h.calls.tones>0,'FX cue fires at its time');assert.equal(h.media[0].paused,true,'speech stops at the trimmed clip end');
 const posed=h.player.view.clips[0].view.nodes.body.el.getAttribute('transform');assert.match(posed,/rotate\(/);assert.doesNotMatch(posed,/rotate\(0\)/);
 h.player.pause();const at=h.player.value();h.tick(500);assert.equal(h.player.value(),at);assert.equal(h.controllers[0].isStarted,false);assert.equal(h.media[0].paused,true);
 h.find('huw-animus-fullscreen').fire('click');assert.equal(h.host.classList.contains('huw-animus-focus'),true);h.find('huw-animus-fullscreen').fire('click');assert.equal(h.host.classList.contains('huw-animus-focus'),false);
 h.player.stop();assert.equal(h.player.value(),0);h.player.dispose();assert.equal(h.controllers[0].disposed,true);assert.equal(h.host.getAttribute('data-animus-ready'),null);
});
test('late or failed music preparation never blocks the stage or starts sound after pause',async()=>{
 const delayed=await playerHarness({delay:true});delayed.player.play();await delayed.flush();delayed.tick(600);assert.ok(delayed.player.value()>.5);
 delayed.player.pause();delayed.release();await delayed.flush();assert.equal(delayed.controllers[0].isStarted,false);delayed.player.dispose();
 const failed=await playerHarness({fail:true});failed.player.play();await failed.flush();failed.tick(500);
 assert.ok(failed.player.value()>.4);assert.equal(failed.host.getAttribute('data-playing'),'true');assert.equal(failed.host.getAttribute('data-audio-mode'),'stage-only');assert.match(failed.find('huw-animus-status').textContent,/Samples unavailable/);failed.player.dispose();
});
test('Site mouth follows play, seek and pause while the other actor and source shapes stay unchanged',async()=>{
 const h=await playerHarness({rows:lipsyncFixtures()}),scene=h.player.view.clips[0].view,source=JSON.stringify(scene.scene.parts),opacity=id=>Number(scene.nodes[id].el.getAttribute('opacity'));
 assert.equal(opacity('ci-alma-mouth-open'),0);assert.equal(opacity('ci-alma-mouth-closed'),1);
 h.player.seek(1.4);assert.ok(opacity('ci-alma-mouth-open')>0);assert.equal(opacity('ci-alma-mouth-closed'),0);assert.equal(opacity('ci-bo-mouth-open'),0);assert.equal(opacity('ci-bo-mouth-closed'),1);
 h.player.play();await h.flush();h.tick(200);await h.flush();assert.ok(h.player.value()>1.4);assert.ok(opacity('ci-alma-mouth-open')>0);h.player.pause();
 const paused=h.player.value(),mouth=opacity('ci-alma-mouth-open');h.tick(500);assert.equal(h.player.value(),paused);assert.equal(opacity('ci-alma-mouth-open'),mouth);
 h.player.seek(4.8);assert.equal(opacity('ci-alma-mouth-open'),0,'punctuation closes the mouth while its caption is still visible');assert.equal(opacity('ci-alma-mouth-closed'),1);
 h.player.seek(5.5);assert.equal(opacity('ci-alma-mouth-open'),0);assert.equal(opacity('ci-alma-mouth-closed'),1);
 h.player.seek(1.4);assert.ok(opacity('ci-alma-mouth-open')>0);h.player.stop();assert.equal(opacity('ci-alma-mouth-open'),0);assert.equal(opacity('ci-alma-mouth-closed'),1);
 assert.equal(JSON.stringify(scene.scene.parts),source,'lipsync changes rendered mouth state, not the original geometry or keys');h.player.dispose();
});

// Browser checks use the real bundled ABCJS + shared AudioController. Local
// WAV responses stand in for sample downloads; no network or extra synth is
// needed. Browser checks are opt-in locally and mandatory in their CI job.
async function browserRuntime(t){
 if(process.env.ANIMUS_BROWSER_TESTS!=='1'){t.skip('Set ANIMUS_BROWSER_TESTS=1 in an environment that permits Chromium');return null;}
 const require=createRequire(import.meta.url);let playwright;
 try{playwright=require('playwright');}catch(_){try{playwright=require('playwright-core');}catch(_){
  if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('ANIMUS_BROWSER_TESTS=1 requires playwright or playwright-core');
  const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/x.js');try{playwright=runtime('playwright');}catch(_){playwright=runtime('playwright-core');}
 }}
 let executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
 if(!executablePath)for(const candidate of ['/usr/bin/google-chrome','/usr/bin/chromium'])try{await access(candidate);executablePath=candidate;break;}catch(_){}
 // Explicitly requested browser checks must fail on launch or test errors.
 // A skipped browser test must never turn a broken CI gate green.
 return playwright.chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
}
test('real Site view plays SVG, ABC music and recorded audio, seeks, pauses and closes fullscreen',async t=>{
 const browser=await browserRuntime(t);if(!browser)return;t.after(()=>browser.close());
 const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>{requests.push(route.request().url());return route.fulfill({status:200,contentType:'audio/wav',body:wave(.6)});});
 await page.setContent(await siteHtml(lipsyncFixtures()),{waitUntil:'domcontentloaded'});
 const host=page.locator('.huw-site-animus');await host.waitFor();assert.equal(await host.getAttribute('data-animus-ready'),'1');
 assert.match(await page.locator('.huw-animus-play').innerText(),/Play/);assert.match(await page.locator('.huw-animus-stop').innerText(),/Stop/);assert.match(await page.locator('.huw-animus-fullscreen').innerText(),/Full screen/);
 assert.equal(await page.locator('.huw-animus-stage svg').count(),2);assert.equal(await page.locator('.huw-puppet-workshop,.huw-musical-workspace').count(),0);
 await page.locator('.huw-animus-play').click();
 await page.waitForFunction(()=>document.querySelector('.huw-site-animus')?.getAttribute('data-audio-mode')==='playing',null,{timeout:15000});
 await page.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>.2);
 assert.ok(requests.length>0,'ABC original engine requests its instrument samples');assert.ok(requests.every(url=>!/(?:acoustic_bass|drums|fluid|tiny)/i.test(url)),'disabled accompaniment does not load extra instruments');
 await page.locator('.huw-animus-play').click();const paused=Number(await host.getAttribute('data-time'));
 await page.waitForTimeout(150);assert.equal(Number(await host.getAttribute('data-time')),paused);
 await page.locator('.huw-animus-range').evaluate(n=>{n.value='1.5';n.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(Number(await host.getAttribute('data-time')),1.5);assert.equal(await page.locator('.huw-animus-line').textContent(),'ALMA: Aaaaaa.');
 const mouth=id=>page.locator(`[data-cutout-id="${id}"]`);assert.ok(Number(await mouth('ci-alma-mouth-open').getAttribute('opacity'))>0);assert.equal(Number(await mouth('ci-alma-mouth-closed').getAttribute('opacity')),0);assert.equal(Number(await mouth('ci-bo-mouth-open').getAttribute('opacity')),0);assert.equal(Number(await mouth('ci-bo-mouth-closed').getAttribute('opacity')),1);
 await page.locator('.huw-animus-range').evaluate(n=>{n.value='4.8';n.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(Number(await mouth('ci-alma-mouth-open').getAttribute('opacity')),0);assert.equal(Number(await mouth('ci-alma-mouth-closed').getAttribute('opacity')),1);
 await page.locator('.huw-animus-range').evaluate(n=>{n.value='5.5';n.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(Number(await mouth('ci-alma-mouth-open').getAttribute('opacity')),0);
 await page.locator('.huw-animus-range').evaluate(n=>{n.value='1.5';n.dispatchEvent(new Event('input',{bubbles:true}));});assert.ok(Number(await mouth('ci-alma-mouth-open').getAttribute('opacity'))>0);
 const transform=await page.locator('[data-cutout-id="body"]').getAttribute('transform');assert.match(transform,/rotate\(/);assert.notEqual(transform,'translate(60 60) rotate(0) scale(1 1) translate(0 0)');
 await page.locator('.huw-animus-fullscreen').click();await page.waitForFunction(()=>document.querySelector('.huw-animus-fullscreen')?.getAttribute('aria-pressed')==='true');
 await page.locator('.huw-animus-fullscreen').click();await page.waitForFunction(()=>document.querySelector('.huw-animus-fullscreen')?.getAttribute('aria-pressed')==='false');
 await page.locator('.huw-animus-stop').click();assert.equal(Number(await host.getAttribute('data-time')),0);assert.equal(await host.getAttribute('data-playing'),'false');assert.deepEqual(errors,[]);
});
test('failed music cannot freeze the show and disposing a site stops pending playback',async t=>{
 const browser=await browserRuntime(t);if(!browser)return;t.after(()=>browser.close());const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>route.abort());await page.setContent(await siteHtml(fixtures()),{waitUntil:'domcontentloaded'});
 await page.locator('.huw-animus-play').click();await page.waitForFunction(()=>Number(document.querySelector('.huw-site-animus')?.getAttribute('data-time'))>.3);
 assert.equal(await page.locator('.huw-site-animus').getAttribute('data-playing'),'true');
 await page.evaluate(()=>window.HUWikiAniMusSite.dispose(document));assert.equal(await page.locator('.huw-site-animus').getAttribute('data-playing'),'false');
 await page.waitForTimeout(150);assert.deepEqual(errors,[]);
});
