/** Compare the real Minimal player's rendered Easy Money audio with parsed audio.
 * No samples are downloaded and playback never starts.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root=path.resolve(import.meta.dirname,'..');
const plugin=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const abc=process.env.ABC_SWING_SOURCE
 ?await readFile(path.resolve(process.env.ABC_SWING_SOURCE),'utf8')
 :await fetch('https://raw.githubusercontent.com/maans/hjem/89b8b4941754ac039705a3363c15028fb6595127/wiki/birdland/guitar/easy-money.abc').then(response=>{
  if(!response.ok)throw Error('Cannot read the published Easy Money source: '+response.status);
  return response.text();
 });
const source=abc.split(/(?=^X:)/m).find(text=>/^T:Easy Money\s*$/m.test(text));
assert.ok(source,'The fixture must contain the actual Easy Money chart');
assert.match(source,/^%%MIDI program 26\s*$/m);

// Use a complete existing wiki, replacing only its ABC package before boot.
let replaced=0;
const html=(await readFile(path.join(root,'editions/silba-atno-repertoire/index.html'),'utf8')).replace(
 /(<script\b[^>]*class=["'][^"']*\btiddlywiki-tiddler-store\b[^"']*["'][^>]*>)([\s\S]*?)(<\/script>)/g,
 (all,open,body,close)=>{
  const rows=JSON.parse(body);
  if(!Array.isArray(rows))return all;
  const updated=rows.map(row=>{if(row.title!==plugin.title)return row;replaced++;return plugin;});
  return open+JSON.stringify(updated).replace(/</g,'\\u003c')+close;
 });
assert.equal(replaced,1,'The browser fixture must contain exactly one ABC plugin');
const temp=await mkdtemp(path.join(os.tmpdir(),'abc-swing-browser-'));
const wikiFile=path.join(temp,'index.html');
await writeFile(wikiFile,html);
const output=path.join(root,'test-results/swing');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
 headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const debug=[];
try{
 const context=await browser.newContext({viewport:{width:1180,height:820}});
 await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(60000);
 page.on('pageerror',error=>debug.push({browserError:error.message}));
 await page.goto(pathToFileURL(wikiFile).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.$tw&&$tw.wiki&&$tw.rootWidget);
 for(const instrument of ['c','bb']){
  const result=await page.evaluate(async({source,instrument})=>{
   const ABC=await $tw.modules.execute('$:/plugins/huwiki/abc/loader.js').load();
   const Accompaniment=$tw.modules.execute('$:/plugins/huwiki/abc/accompaniment.js');
   const Minimal=$tw.modules.execute('$:/plugins/huwiki/abc/minimal-player.js');
   const Instrument=$tw.modules.execute('$:/plugins/huwiki/abc/instrument-view.js');
   Instrument.change(instrument);
   const fields={title:'Easy Money',type:'text/vnd.tiddlywiki','abc-source':source,
    'abc-rhythm-playback':'written','abc-bars-per-line':'4','abc-parts-new-line':'no',
    'abc-accompaniment':'{"style":"swing"}'};
   const config=Accompaniment.read(fields);
   const parsed=ABC.parseOnly(source)[0];
   Accompaniment.prepare(ABC,parsed,source,config,true,fields);
   const host=document.createElement('section');document.body.appendChild(host);
   let clickNote=null;
   const renderAbc=ABC.renderAbc;
   ABC.renderAbc=function(...args){
    if(args[2]&&typeof args[2].clickListener==='function')clickNote=args[2].clickListener;
    return renderAbc.apply(this,args);
   };
   let player;
   try{player=Minimal.mount(host,{ABC,source,fields,wiki:$tw.wiki,audio:true,
    showTitle:false,paged:true,shortcutHost:host,mixerButton:true,mixerTitle:"Easy Money"});}
   finally{ABC.renderAbc=renderAbc;}
   const notes=sequence=>sequence.tracks[0].filter(note=>note.cmd==='note'&&note.volume>0)
    .map(note=>({start:note.start,duration:note.duration,pitch:note.pitch,volume:note.volume,
     instrument:note.instrument,instrumentType:typeof note.instrument}));
   const rendered=player.visual&&player.visual.setUpAudio({});
   const actual=rendered?notes(rendered):[];
   const expected=notes(parsed.setUpAudio({}));
   const controllerSequence=player.controller?.visualObj?.setUpAudio({});
   const controller=controllerSequence?notes(controllerSequence):[];
   const first=actual.length?actual.filter(note=>Math.abs(note.start-actual[0].start)<.004):[];
   const pianoTrack=(controllerSequence?.tracks||[]).find(track=>track.huwabcPart==='chordVolume')||[];
   const pianoNotes=pianoTrack.filter(note=>note.cmd==='note'&&note.volume>0);
   const firstPiano=pianoNotes.length?pianoNotes.filter(note=>Math.abs(note.start-pianoNotes[0].start)<.004):[];
   host.querySelector('.huwabc-mini-open')?.click();
   const voiceSlider=document.querySelector('.huwabc-mini-mixer [data-voice-index="0"] input[type="range"]');
   const mixerLevel=voiceSlider?Number(voiceSlider.value):null;
   const voiceGain=Accompaniment.channelGain('voice:0',config);
   const mismatch=actual.findIndex((note,index)=>JSON.stringify(note)!==JSON.stringify(expected[index]));
   const rhythm=(player.visual?.lines||[]).flatMap(line=>(line.staff||[])
    .flatMap(staff=>(staff.voices||[]).flat())).find(event=>event.el_type==='note'&&event.style==='rhythm');
   const auditions=[];
   if(player.controller)player.controller.audition=async notes=>{auditions.push(JSON.parse(JSON.stringify(notes)));return true;};
   if(rhythm&&clickNote){
    const target=host.querySelector('.abcjs-note')||host.querySelector('svg');
    clickNote(rhythm,0,[],{selectableElement:target},false,{target});
    await Promise.resolve();await Promise.resolve();
   }
   const noteAudition=auditions.at(-1)||[];
   const chord=host.querySelector('.abcjs-chord');
   if(chord){chord.dispatchEvent(new MouseEvent('click',{bubbles:true}));await Promise.resolve();await Promise.resolve();}
   const chordAudition=auditions.length>1?auditions.at(-1):[];
   const detail={instrument,semitones:Instrument.current().semitones,plugin:$tw.wiki.getTiddler(pluginTitle()).fields.version,
    parsedCount:expected.length,renderedCount:actual.length,controllerCount:controller.length,
    firstParsed:expected.slice(0,6),firstRendered:actual.slice(0,6),firstController:controller.slice(0,6),
    firstChord:first,firstPiano,mixerLevel,voiceGain,noteAudition,chordAudition,chordText:chord?.textContent,
    displayedMidiPitches:rhythm?.midiPitches,mismatch,mismatchActual:actual[mismatch],mismatchExpected:expected[mismatch],
    renderedMatches:JSON.stringify(actual)===JSON.stringify(expected),
    controllerMatches:JSON.stringify(controller)===JSON.stringify(expected),
    controllerVisualSame:player.controller?.visualObj===player.visual,
    messages:Array.from(host.querySelectorAll('.huwabc-error')).map(node=>node.textContent),
    svgCount:host.querySelectorAll('svg').length};
   function pluginTitle(){return '$:/plugins/huwiki/abc';}
   player.destroy();host.remove();return detail;
  },{source,instrument});
  debug.push(result);console.log('ABC SWING RENDER',JSON.stringify(result));
  await writeFile(path.join(output,'diagnostic.json'),JSON.stringify(debug,null,2));
  assert.ok(result.svgCount>0,'The actual score must be rendered');
  assert.ok(result.controllerVisualSame,'The controller must retain the prepared rendered tune');
  assert.deepEqual(result.firstChord.map(note=>note.pitch),[43,53,58],instrument+': low guitar shell');
  assert.deepEqual(result.firstChord.map(note=>note.volume),[92,80,80],instrument+': guitar articulation before channel gain');
  assert.deepEqual(result.firstPiano.map(note=>note.pitch),[55,65,70],instrument+': piano retains its bright independent opening');
  assert.equal(result.mixerLevel,50,instrument+': guitar mixer slider must show 50%');
  assert.equal(result.voiceGain,.5,instrument+': the actual guitar bus gain must be half');
  assert.ok(result.renderedMatches,instrument+': rendered player differs from parsed playback');
  assert.ok(result.controllerMatches,instrument+': controller playback differs from parsed playback');
  const previewShape=notes=>notes.map(note=>typeof note==='number'?{pitch:note}:({pitch:note.pitch,volume:note.volume,instrument:note.instrument}));
  const expectedPreview=result.firstChord.map(({pitch,volume,instrument})=>({pitch,volume,instrument}));
  assert.deepEqual(previewShape(result.noteAudition),expectedPreview,instrument+': note click must preview the same low, guitar shell on the half-gain voice bus');
  assert.deepEqual(previewShape(result.chordAudition),expectedPreview,instrument+': chord click must preview the same low, guitar shell on the half-gain voice bus');
  assert.ok(result.noteAudition.every(note=>note.huwabcPreviewPart==='voice:0'),instrument+': note preview uses the guitar voice bus');
  assert.ok(result.chordAudition.every(note=>note.huwabcPreviewPart==='voice:0'),instrument+': chord preview uses the guitar voice bus');
 }
 const rhythmResult=await page.evaluate(async()=>{
  const ABC=await $tw.modules.execute('$:/plugins/huwiki/abc/loader.js').load();
  const Minimal=$tw.modules.execute('$:/plugins/huwiki/abc/minimal-player.js');
  $tw.modules.execute('$:/plugins/huwiki/abc/instrument-view.js').change('c');
  const source='X:1\nT:Written comp figures\nR:Swing\nM:4/4\nL:1/8\nQ:1/4=126\nU:s=!style=rhythm!\nV:G name="Guitar"\n%%MIDI program 26\nK:C\n"Gm7"sB2 sB2 sB2 sB2 | "Gm7"z sB z sB2 z sB2 | "C7"sB2-sB2 z2 sB2 | "N.C."z8 | "Gm7"sB2 sB2 sB2 sB2 |';
  const fields={title:'Written comp figures','abc-source':source,'abc-rhythm-playback':'written','abc-accompaniment':'{"style":"swing","enabled":true,"variation":0}'};
  const host=document.createElement('section');document.body.appendChild(host);
  const player=Minimal.mount(host,{ABC,source,fields,wiki:$tw.wiki,audio:true,showTitle:false,paged:true});
  const sequence=player.visual.setUpAudio({});
  const guitar=sequence.tracks[0].filter(n=>n.cmd==='note'&&n.volume>0);
  const piano=(sequence.tracks.find(t=>t.huwabcPart==='chordVolume')||[]).filter(n=>n.cmd==='note'&&n.volume>0);
  const starts=(notes,start,end)=>Array.from(new Set(notes.filter(n=>n.start>=start-.00001&&n.start<end-.00001).map(n=>Math.round(n.start*100000)/100000))).sort((a,b)=>a-b);
  const held=(notes)=>Math.max(...notes.filter(n=>Math.abs(n.start-2)<.00001).map(n=>n.duration));
  const result={guitarFigures:starts(guitar,1,3),pianoFigures:starts(piano,1,3),guitarRegular:starts(guitar,0,1),pianoRegular:starts(piano,0,1),pianoStop:starts(piano,3,4),guitarHold:held(guitar),pianoHold:held(piano),tempo:sequence.tempo};
  player.destroy();host.remove();return result;
 });
 debug.push(rhythmResult);console.log('ABC WRITTEN COMP',JSON.stringify(rhythmResult));
 await writeFile(path.join(output,'diagnostic.json'),JSON.stringify(debug,null,2));
 assert.deepEqual(rhythmResult.pianoFigures,rhythmResult.guitarFigures,'Rendered piano follows syncopations, stops and tied hits in the guitar chart');
 assert.notDeepEqual(rhythmResult.pianoRegular,rhythmResult.guitarRegular,'Regular four-quarter guitar keeps the piano free to comp');
 assert.deepEqual(rhythmResult.pianoStop,[],'N.C. does not acquire piano attacks');
 assert.ok(Math.abs(rhythmResult.pianoHold-rhythmResult.guitarHold)<.00001,'Written tied figures keep one sustained piano attack');
 assert.equal(rhythmResult.tempo,126,'Following written figures does not alter tempo');
 console.log('Verified Easy Money low guitar, independent bright piano and half channel gain through rendered Minimal/controller audio');
}catch(error){
 await writeFile(path.join(output,'diagnostic.json'),JSON.stringify(debug,null,2));
 throw error;
}finally{
 await browser.close();await rm(temp,{recursive:true,force:true});
}
