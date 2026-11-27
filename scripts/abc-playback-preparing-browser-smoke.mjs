/** Check real transport buttons while audio resume is deliberately held.
 * Runs in CI. No soundfonts, audio devices or external network are required.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root=path.resolve(import.meta.dirname,'..');
const plugin=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const danish=JSON.parse(await readFile(path.join(root,'languages/da-DK/plugin.json'),'utf8'));
assert.equal(danish['plugin-type'],'language','Use the real packaged Danish language plugin');
let replaced=0;
const html=(await readFile(path.join(root,'editions/silba-atno-repertoire/index.html'),'utf8')).replace(
 /(<script\b[^>]*class=["'][^"']*\btiddlywiki-tiddler-store\b[^"']*["'][^>]*>)([\s\S]*?)(<\/script>)/g,
 (all,open,body,close)=>{
  const rows=JSON.parse(body);
  if(!Array.isArray(rows))return all;
  const hasABC=rows.some(row=>row.title===plugin.title);
  const updated=rows.filter(row=>row.title!==danish.title&&row.title!=='$:/language').map(row=>{if(row.title!==plugin.title)return row;replaced++;return plugin;});
  if(hasABC)updated.push(danish,{title:'$:/language',text:danish.title});
  return open+JSON.stringify(updated).replace(/</g,'\\u003c')+close;
 });
assert.equal(replaced,1,'Exactly one production ABC plugin must be installed');
const temporary=await mkdtemp(path.join(os.tmpdir(),'abc-preparing-browser-'));
const file=path.join(temporary,'index.html');await writeFile(file,html);
const output=path.join(root,'test-results/playback-preparing');await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const diagnostics=[],errors=[];
let page;
try{
 const context=await browser.newContext({viewport:{width:1380,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(file).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.$tw&&$tw.wiki&&$tw.rootWidget);
 assert.equal(await page.evaluate(()=>$tw.modules.execute('$:/plugins/huwiki/abc/i18n.js').language($tw.wiki)),'da','The browser fixture must start with an installed Danish locale');
 await page.evaluate(()=>{
  // Preserve production styles while replacing the unrelated edition story.
  for(const style of document.body.querySelectorAll('style'))document.head.appendChild(style.cloneNode(true));
  document.body.replaceChildren();
  const style=document.createElement('style');
  style.textContent='body{margin:0;background:#fff}.preparing-fixture{box-sizing:border-box;width:calc(100% - 350px);padding:24px}.tc-sidebar-scrollable{position:fixed;top:20px;right:15px;width:305px;max-height:940px;overflow:auto}.tc-sidebar-header{height:48px}';
  document.head.appendChild(style);
  const sidebar=document.createElement('aside');sidebar.className='tc-sidebar-scrollable';
  sidebar.style.cssText='position:fixed;display:block;visibility:visible;top:20px;right:15px;left:auto;width:305px;max-height:940px;overflow:auto;transform:none';
  sidebar.innerHTML='<div><header class="tc-sidebar-header">Playback preparation test</header></div>';document.body.appendChild(sidebar);
 });
 async function setup(mode,sidebar=false,language='da'){
  await page.evaluate(async({mode,sidebar,language})=>{
   const previous=window.preparingHarness;
   if(previous){if(previous.player)previous.player.destroy();else if(previous.reader)previous.reader.onDestroy();previous.host.remove();}
   $tw.wiki.setText('$:/state/sidebar','text',null,'yes');window.scrollTo(0,0);
   $tw.wiki.setText('$:/language','text',null,language==='da'?'$:/languages/da-DK':'$:/languages/en-GB');
   const ABC=await $tw.modules.execute('$:/plugins/huwiki/abc/loader.js').load();
   const Reserve=$tw.modules.execute('$:/plugins/huwiki/abc/reserve-mixer.js');
   const h={mode,sidebar,language,pending:[],resumeCalls:0,primes:0,starts:0,state:'idle',buffers:[]};
   window.preparingHarness=h;
   const host=document.createElement('main');host.className='preparing-fixture';host.id='preparing-fixture';document.body.appendChild(host);h.host=host;
   const heading=document.createElement('h1');heading.textContent=mode+' · delayed playback';host.appendChild(heading);
   h.context={resume(){h.resumeCalls++;return new Promise((resolve,reject)=>h.pending.push({resolve,reject}));}};
   ABC.synth.activeAudioContext=()=>h.context;
   ABC.TimingCallbacks=function(){this.start=()=>{};this.stop=()=>{};this.pause=()=>{};this.reset=()=>{};this.setProgress=()=>{};};
   Reserve.createMixer=(unused,config,options)=>{
    const buffer={duration:8,init(){h.state='loading';options.onStatus?.({engine:'original',phase:'loading'});return Promise.resolve({status:'created'});},
     prime(){h.primes++;h.state='ready';options.onStatus?.({engine:'original',phase:'ready'});return Promise.resolve();},
     start(){h.starts++;h.state='playing';},stop(){},pause(){},cancel(){},release(){},seek(){},setVolumes(){},
     getState(){return {engine:'original',phase:h.state};}};
    h.buffers.push(buffer);return buffer;
   };
   const source='X:1\nT:Preparation test\nM:4/4\nL:1/4\nQ:1/4=90\nK:C\nC D E F | G A B c |';
   const title='Preparation '+mode+(sidebar?' sidebar':' floating');
   const fields={title,'abc-source':source,'abc-bars-per-line':'4'};
   if(mode==='minimal'){
    const Minimal=$tw.modules.execute('$:/plugins/huwiki/abc/minimal-player.js');
    h.player=Minimal.mount(host,{ABC,source,fields,wiki:$tw.wiki,audio:true,paged:true,showTitle:true,mixerButton:true,mixerTitle:title,sidebarMixer:sidebar});
    h.controller=h.player.controller;h.pager=h.player.pager;
   }else{
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
    const parser=$tw.wiki.parseText('text/vnd.tiddlywiki','<$huwiki-abc tiddler="'+title+'" view="full" embedded="yes"/>');
    h.widget=$tw.wiki.makeWidget(parser,{document});h.widget.render(host,null);
   }
   h.readerFrom=function find(widget){if(widget?._audioController)return widget;for(const child of widget?.children||[]){const found=find(child);if(found)return found;}return null;};
   h.main=()=>host.querySelector('.abcjs-midi-start')||h.pager?.element.querySelector('.abcjs-midi-start');
   h.mini=()=>document.querySelector('.huwabc-mini-mixer-play');
   h.release=()=>{const item=h.pending.shift();if(!item)throw Error('No held resume');item.resolve();};
   h.reject=()=>{const item=h.pending.shift();if(!item)throw Error('No held resume');item.reject(new Error('Deterministic resume failure'));};
   h.snapshot=()=>{
    function state(button){const spinner=button?.querySelector('.huwabc-preparing-spinner'),label=button?.querySelector('.huwabc-preparing-label');return {busy:button?.getAttribute('aria-busy')==='true',label:label?.textContent,
     spinnerVisible:!!spinner&&!spinner.hidden&&getComputedStyle(spinner).display!=='none'&&spinner.getBoundingClientRect().width>0,
     labelVisible:!!label&&!label.hidden&&getComputedStyle(label).display!=='none'&&label.getBoundingClientRect().width>0};}
    return {language:h.language,main:state(h.main()),mini:state(h.mini()),resumeCalls:h.resumeCalls,pending:h.pending.length,primes:h.primes,starts:h.starts,
     isPreparing:h.controller?.isPreparing,started:h.controller?.isStarted,state:h.state,
     floating:document.querySelector('.huwabc-mini-mixer')?.classList.contains('huwabc-mini-mixer--floating')};
   };
  },{mode,sidebar,language});
  await page.waitForFunction(()=>{
   const h=window.preparingHarness;
   if(!h.controller&&h.widget){h.reader=h.readerFrom(h.widget);h.controller=h.reader?._audioController;h.pager=h.reader?._pager;}
   return !!h.controller?.visualObj&&!!h.main()&&!h.main().disabled;
  });
 }
 async function state(){return page.evaluate(()=>window.preparingHarness.snapshot());}
 async function assertBusy(name,withMixer=true){
  const current=await state();diagnostics.push({name,...current});
  for(const surface of withMixer?['main','mini']:['main']){
   assert.equal(current[surface].busy,true,name+': '+surface+' must report busy before resume resolves');
   assert.equal(current[surface].label,current.language==='da'?'Gør klar …':'Preparing …',name+': '+surface+' has the requested locale preparation label');
   assert.equal(current[surface].spinnerVisible,true,name+': '+surface+' has a visible spinner');
   assert.equal(current[surface].labelVisible,true,name+': '+surface+' has visible preparation text');
  }
  assert.equal(current.starts,0,name+': no premature audio start');return current;
 }
 async function assertIdle(name){
  await page.waitForFunction(()=>!window.preparingHarness.controller.isPreparing);
  const current=await state();diagnostics.push({name,...current});
  assert.equal(current.main.busy,false,name+': primary busy state cleared');assert.equal(current.mini.busy,false,name+': mixer busy state cleared');
  assert.equal(current.main.spinnerVisible,false,name+': primary spinner cleared');assert.equal(current.mini.spinnerVisible,false,name+': mixer spinner cleared');
 }

 await setup('minimal');
 await page.locator('#preparing-fixture .abcjs-midi-start').click();
 await assertBusy('minimal initial gesture',false);
 await page.locator('#preparing-fixture .huwabc-mini-open').click();
 assert.equal((await assertBusy('mixer opened during preparation')).floating,true);
 await page.locator('.huwabc-mini-mixer-play').click();
 assert.equal((await state()).resumeCalls,1,'Another play button coalesces into the existing request');
 await page.screenshot({path:path.join(output,'minimal-floating-loading.png')});
 await page.evaluate(()=>window.preparingHarness.release());
 await page.waitForFunction(()=>window.preparingHarness.primes===1&&window.preparingHarness.resumeCalls===2);
 await assertBusy('samples ready but real start still pending');
 await page.evaluate(()=>window.preparingHarness.release());
 await page.waitForFunction(()=>window.preparingHarness.starts===1&&window.preparingHarness.controller.isStarted);
 await assertIdle('successful minimal start');
 await page.evaluate(()=>window.preparingHarness.controller.huwikiStop());

 await setup('minimal',true);
 await page.locator('#preparing-fixture .huwabc-mini-open').click();
 // The production mixer deliberately remembers floating placement across
 // scores. Exercise its real Dock control before checking the docked case.
 if((await state()).floating){
  const dock=page.locator('.huwabc-mini-mixer-detach');
  assert.equal(await dock.textContent(),'I sidepanel','A remembered floating mixer offers its normal Dock action');
  await dock.click();
 }
 await page.waitForFunction(()=>{
  const panel=document.querySelector('.huwabc-mini-mixer');
  return panel&&!panel.hidden&&!panel.classList.contains('huwabc-mini-mixer--floating')&&panel.getBoundingClientRect().width>0;
 });
 assert.equal((await state()).floating,false,'This case uses the docked sidebar mixer');
 await page.locator('.huwabc-mini-mixer-play').click();
 await assertBusy('sidebar mixer starts primary transport');
 await page.locator('.huwabc-mini-mixer-title').click();
 await assertBusy('collapsed sidebar mixer retains preparation feedback');
 await page.screenshot({path:path.join(output,'minimal-sidebar-collapsed-loading.png')});
 await page.evaluate(()=>window.preparingHarness.controller.huwikiStop());
 await assertIdle('cancelled sidebar request');
 await page.evaluate(()=>window.preparingHarness.release());
 await page.waitForTimeout(50);
 assert.equal((await state()).starts,0,'Cancelled preparation never starts later');

 await setup('advanced');
 await page.locator('#preparing-fixture .huwabc-page-desk').click();
 // Fullscreen owns a body-level surface outside the original score fixture.
 await page.locator('.huwabc-page-is-desk .huwabc-page-mixer').click();
 assert.equal(await page.locator('.huwabc-page-is-desk .huwabc-mini-mixer--floating').count(),1,'The mixer stays inside its fullscreen owner');
 await page.locator('.huwabc-mini-mixer-play').click();
 await assertBusy('advanced music stand and floating mixer');
 assert.equal(await page.locator('.huwabc-page-is-desk .abcjs-midi-start[aria-busy="true"]').count(),1,'Music stand retains the busy shared transport');
 await page.screenshot({path:path.join(output,'advanced-music-stand-loading.png')});
 await page.evaluate(()=>window.preparingHarness.controller.huwikiStop());
 await assertIdle('advanced music stand cancellation');
 await page.evaluate(()=>window.preparingHarness.release());
 await page.waitForTimeout(50);
 assert.equal((await state()).starts,0,'Cancelled advanced preparation never starts later');
 await page.locator('.huwabc-page-is-desk .huwabc-page-desk').click();

 await setup('advanced');
 await page.locator('#preparing-fixture .abcjs-midi-start').click();
 await assertBusy('advanced initial gesture',false);
 await page.evaluate(()=>window.preparingHarness.reject());
 await assertIdle('audio resume failure');
 assert.equal((await state()).starts,0,'Failed resume does not start playback');
 assert.ok(await page.locator('#preparing-fixture .huwabc-error').count(),'The failed resume gives a visible error');
 await setup('minimal',false,'en');
 await page.locator('#preparing-fixture .abcjs-midi-start').click();
 await page.locator('#preparing-fixture .huwabc-mini-open').click();
 await assertBusy('English primary and minimixer agree');
 await page.evaluate(()=>window.preparingHarness.controller.huwikiStop());
 await assertIdle('English cancellation');
 await page.evaluate(()=>window.preparingHarness.release());
 assert.deepEqual(errors,[],'No browser exceptions or unhandled rejections');
 await writeFile(path.join(output,'diagnostics.json'),JSON.stringify({ok:true,diagnostics,errors},null,2));
 console.log(JSON.stringify({ok:true,cases:diagnostics.map(row=>row.name),samplesDownloaded:0}));
}catch(error){
 try{if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}
 catch(screenshotError){diagnostics.push({screenshotError:screenshotError.message});}
 await writeFile(path.join(output,'diagnostics.json'),JSON.stringify({diagnostics,errors,error:error.message},null,2));
 throw error;
}finally{await browser.close();await rm(temporary,{recursive:true,force:true});}
