import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2),at=args.indexOf('--catalog');
const catalog=path.resolve(at>=0?args[at+1]:'.leadsheet-fixtures/catalog/repertoire');
const index=JSON.parse(await readFile(path.join(catalog,'index.json'),'utf8')),fixtures=[];
for(const entry of index.entries)for(const version of entry.variants.filter(v=>v.role==='leadsheet'&&v.format==='abc')){
 const fields=JSON.parse(await readFile(path.join(catalog,version.abcPath),'utf8'));
 fixtures.push({title:entry.title,fields});
}
assert.ok(fixtures.length>=30,'use the real shared leadsheet library');
const dir=path.join(root,'test-results/leadsheet-layout');await mkdir(dir,{recursive:true});
const plugin=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const file=path.join(dir,'fixture.html');
await writeFile(file,assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[plugin,{title:'$:/DefaultTiddlers',text:'[[Layout acceptance]]'},{title:'Layout acceptance',text:'Automatic leadsheet layout acceptance'}]));
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1180,height:1050}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);
 await page.getByText('Automatic leadsheet layout acceptance',{exact:true}).waitFor();
 const report=await page.evaluate(fixtures=>{
  const ABC=$tw.modules.execute('$:/plugins/huwiki/abc/vendor/abcjs.js'),sheet=$tw.modules.execute('$:/plugins/huwiki/abc/sheet-layout.js'),balanced=$tw.modules.execute('$:/plugins/huwiki/abc/balanced-layout.js');
  const round=n=>typeof n==='number'?Math.round(n*1e9)/1e9:n;
  // Engraving may sort simultaneous chord pitches. Compare the same timed
  // musical events, rather than the array order of notes sounding together.
  const audio=t=>(t.setUpAudio({chordsOff:true}).tracks||[]).map(track=>track.filter(e=>e.cmd==='note').map(e=>[round(e.start),round(e.duration),e.pitch,e.instrument]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]||a[1]-b[1]||a[3]-b[3]));
  const output=[];
  for(const fixture of fixtures){
   const source=fixture.fields['abc-source'],fields={...fixture.fields,'abc-bars-per-line':'0'},before=JSON.stringify(audio(ABC.parseOnly(source)[0]));
   const row={title:fixture.title,modes:[]};
   for(const transpose of [0,2,9]){
    const host=document.createElement('div');host.style.width='900px';document.body.appendChild(host);
    const options=sheet.options(ABC,source,fields);
    const visual=ABC.renderAbc(host,source,{staffwidth:720,scale:1,add_classes:true,oneSvgPerLine:true,expandToWidest:true,jazzchords:true,format:{stretchlast:true,gchordfont:'Helvetica 18 bold'},wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:3},...options,visualTranspose:transpose,afterParsing:t=>sheet.prepare(t,fields,source)})[0];
    const systems=visual.lines.filter(l=>l.staff).map(l=>balanced.measures(l.staff[0].voices[0],false).length).filter(Boolean);
    const after=transpose===0?JSON.stringify(audio(visual)):before;
    row.modes.push({transpose,systems,measured:!!options.lineBreaks,audioUnchanged:after===before});
    if(after!==before){const a=JSON.parse(before),b=JSON.parse(after);row.audioDifference={beforeNotes:a.map(t=>t.length),afterNotes:b.map(t=>t.length),first:a.flat().findIndex((n,i)=>JSON.stringify(n)!==JSON.stringify(b.flat()[i]))};const at=row.audioDifference.first;row.audioDifference.before=a.flat().slice(Math.max(0,at-1),at+2);row.audioDifference.after=b.flat().slice(Math.max(0,at-1),at+2);}
    if(fixture.title==='Easy Money'&&transpose===0){host.id='easy-money-layout';host.style.border='1px solid #ccc';}else host.remove();
   }
   output.push(row);
  }
  return output;
 },fixtures);
 await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
 for(const row of report){
  assert.ok(row.modes.every(m=>m.measured),row.title+': automatic must use measured line breaks');
  assert.ok(row.modes.every(m=>m.audioUnchanged),row.title+': layout changed musical playback '+JSON.stringify(row.audioDifference||{}));
  for(const mode of row.modes)assert.deepEqual(mode.systems,row.modes[0].systems,row.title+': written transposition must retain system breaks');
 }
 const easy=report.find(r=>r.title==='Easy Money');assert.ok(easy,'Easy Money included');
 assert.ok(easy.modes[0].systems.every(n=>n>1),'no isolated Easy Money bars');
 assert.ok(easy.modes[0].systems.length<=9,'Easy Money must no longer occupy thirteen systems');
 assert.equal(easy.modes[0].systems.reduce((a,b)=>a+b,0),33,'preserve the intro and all 32 form measures');
 await page.locator('#easy-money-layout').screenshot({path:path.join(dir,'easy-money.png')});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({leadsheetVersions:report.length,transposingViews:report.length*3,easyMoney:easy.modes[0].systems,playbackPreserved:true}));
}finally{await browser.close();}
