import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {assembleHtml} from '../assembler/assemble.mjs';

const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'test-results/capo-tabs');await mkdir(dir,{recursive:true});
const source=['X:1','T:Capo and TAB acceptance','M:4/4','L:1/4','K:C',
 ...Array(4).fill('"C"e f g a | "F"b a g e | "G"d e f g | "C"e4 |')].join('\n');
const pkg=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const fixture=assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[pkg,
 {title:'$:/DefaultTiddlers',text:'Acceptance'},
 {title:'$:/language',text:'$:/languages/da-DK'},
 {title:'Test score','abc-source':source,'abc-accompaniment':'{"melody":true,"bass":"off","chords":"off","drums":"off"}'},
 {title:'Acceptance',text:'<$huwiki-abc tiddler="Test score" view="full"/>'}
]);
const file=path.join(dir,'fixture.html');await writeFile(file,fixture);
if(process.argv.includes('--fixture-only')){console.log(file);process.exit(0);}
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1180,height:900}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href);
 const score=page.locator('.huwabc-paper');await score.locator('svg').first().waitFor();
 const instrument=page.getByRole('combobox',{name:'Instrumentnoder',exact:true});
 const capo=page.getByRole('combobox',{name:'Capo',exact:true});
 const tab=page.getByRole('combobox',{name:'Tabulaturinstrument',exact:true});
 assert.equal(await page.locator('.huwabc-instrument-select').count(),3);
 const svgCount=await score.locator('svg').count();
 const tabs=()=>score.locator('[data-huwabc-tab-midi]').evaluateAll(nodes=>nodes.map(n=>({midi:Number(n.dataset.huwabcTabMidi),string:Number(n.dataset.huwabcTabString),fret:Number(n.textContent)})));
 const tuning={guitar:[40,45,50,55,59,64],ukulele:[55,60,64,69],tenorbanjo:[48,55,62,69],irishbanjo:[43,50,57,64],mandolin:[55,62,69,76],banjo5:[67,50,55,59,62],charango:[67,72,64,69,76]};
 for(const preset of Object.keys(tuning)){
  await instrument.selectOption('c');await tab.selectOption(preset);
  for(const fret of [0,1,2,5,8]){
   await capo.selectOption(String(fret));await score.locator('[data-huwabc-tab-midi]').first().waitFor();
   const digits=await tabs();assert.ok(digits.length>30,preset+' capo '+fret+' missing notes');
   for(const d of digits){
    assert.ok(Number.isInteger(d.fret)&&d.fret>=0&&d.fret<=24,JSON.stringify({preset,fret,d}));
    const index=tuning[preset].length-d.string,offset=preset==='banjo5'&&index===0?0:fret;
    assert.equal(tuning[preset][index]+offset+d.fret,d.midi,JSON.stringify({preset,fret,d}));
   }
   assert.equal(await score.locator('svg').count(),svgCount,'TAB/capo must retain concert system breaks');
  }
 }
 // Wind view must not leak written transposition into fret numbering.
 await tab.selectOption('guitar');await instrument.selectOption('tenor');await capo.selectOption('2');
 for(const d of await tabs())assert.equal(tuning.guitar[6-d.string]+2+d.fret,d.midi);
 // Return to an ordinary guitar part before testing the real page/PDF path.
 await instrument.selectOption('c');await page.getByRole('button',{name:'PDF / Udskriv',exact:true}).click();
 await page.getByRole('dialog',{name:'Udskriftsvisning'}).waitFor();
 await page.getByRole('link',{name:'Gem PDF',exact:true}).waitFor({timeout:90000});
 assert.match(await page.locator('.huwabc-print-header').innerText(),/Capo 2.*Tab.*Guitar/);
 assert.ok(await page.locator('.huwabc-print-overlay [data-huwabc-tab-midi]').count()>30);
 await page.getByRole('button',{name:'Tilbage til wikien',exact:true}).click();
 await tab.selectOption('off');await capo.selectOption('0');
 assert.equal(await score.locator('[data-huwabc-tab-midi]').count(),0);
 assert.equal(await score.locator('svg').count(),svgCount);
 // Source and audio are still concert pitch after all of the UI changes.
 assert.equal(await page.evaluate(()=> $tw.wiki.getTiddlerText('Test score')||$tw.wiki.getTiddler('Test score').fields['abc-source']),source);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(dir,'controls.png'),fullPage:false});
 console.log('Three controls; seven tunings, capo 0/1/2/5/8, physical fret/pitch mapping, unchanged systems and real PDF: passed');
}finally{await browser.close();}
