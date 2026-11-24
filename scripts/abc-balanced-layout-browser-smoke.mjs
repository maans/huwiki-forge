import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'test-results/balanced-layout');
await mkdir(dir,{recursive:true});
const songs=JSON.parse(await readFile(path.join(root,'editions/silba-atno-repertoire/tiddlers/repertoire.json'),'utf8'));
const song=songs.find(s=>s.title.includes('Purim'));
const plugin=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const da=JSON.parse(await readFile(path.join(root,'languages/da-DK/plugin.json'),'utf8'));
const file=path.join(dir,'fixture.html');
await writeFile(file,assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[plugin,da,
 {title:'$:/language',text:'$:/languages/da-DK'},{title:'$:/DefaultTiddlers',text:'[['+song.title+']]'},song
]));
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1180,height:1050}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href);
 try{await page.locator('.huwabc-paper svg').first().waitFor();}
 catch(e){console.log('Purim boot diagnostics',JSON.stringify({errors,body:await page.locator('body').innerText()}));throw e;}
 const state=await page.evaluate(()=>{
  const song=$tw.wiki.getTiddler('Purim Niggun'),source=song.fields['abc-source'];
  const ABC=$tw.modules.execute('$:/plugins/huwiki/abc/vendor/abcjs.js'),sheet=$tw.modules.execute('$:/plugins/huwiki/abc/sheet-layout.js');
  const settings=sheet.options(ABC,source,song.fields);
  const tune=ABC.parseOnly(source,settings)[0];sheet.prepare(tune,song.fields,source);
  const balanced=$tw.modules.execute('$:/plugins/huwiki/abc/balanced-layout.js');
  const original=ABC.parseOnly(source)[0],raw=original.deline({lineBreaks:false})[0].staff[0].voices[0];
  const metrics=ABC.tuneMetrics(source,{staffwidth:720,jazzchords:true,format:{gchordfont:'Helvetica 18 bold'}})[0].sections[0];
  const plan=balanced.plan(raw,metrics.measureWidths,metrics.left,{pickup:true,parts:song.fields['abc-parts-new-line']!=='no'});
  const rows=tune.lines.filter(l=>l.staff).map(l=>balanced.measures(l.staff[0].voices[0],false).map(b=>({ending:b.ending,notes:b.notes})));
  const paper=document.querySelector('.huwabc-paper');
  return {settings,metrics,plan,rows,pickup:original.getPickupLength(),pages:Number(paper.dataset.pageCount),source,
   svg:Array.from(paper.querySelectorAll('svg'),s=>({width:s.viewBox.baseVal.width,height:s.viewBox.baseVal.height,systems:s.querySelectorAll('.abcjs-staff-wrapper').length})),
   firstSystemNotes:paper.querySelector('svg .abcjs-staff-wrapper')?.querySelectorAll('.abcjs-note').length||0};
 });
 console.log('Purim measured layout',JSON.stringify(state));
 assert.ok(state.settings.lineBreaks,'balanced mode must use measured line breaks');
 assert.ok(state.firstSystemNotes>1,'pickup may not occupy its own system');
 assert.equal(state.pickup,.125,'keep the eighth-note anacrusis');
 assert.equal(state.pages,1,'Purim must fit on one normally scaled A4 page');
 assert.ok(state.rows.every(row=>!(row.length===2&&row[0].ending&&row.every(m=>m.ending===row[0].ending))),'no whole system for one two-bar ending');
 assert.equal(state.source,song['abc-source']);
 await page.screenshot({path:path.join(dir,'purim-normal.png'),fullPage:true});
 await page.locator('.huwabc-view-toggle').click();
 await page.getByRole('button',{name:/^(PDF \/ Udskriv|PDF \/ Print)$/}).click();
 await page.locator('.huwabc-print-overlay').waitFor();
 assert.equal(await page.locator('.huwabc-print-overlay .huwabc-page').count(),1);
 await page.getByRole('link',{name:/^(Gem PDF|Save PDF)$/}).waitFor({timeout:90000});
 await page.screenshot({path:path.join(dir,'purim-pdf.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Purim: attached pickup, measured balanced systems, intact two-bar voltas and one-page normal/PDF passed');
}finally{await browser.close();}
