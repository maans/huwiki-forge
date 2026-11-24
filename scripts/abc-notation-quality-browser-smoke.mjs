import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'test-results/notation-quality');await mkdir(dir,{recursive:true});
const songs=JSON.parse(await readFile(path.join(root,'editions/silba-atno-repertoire/tiddlers/repertoire.json'),'utf8'));
const song=songs.find(s=>s.title.includes('Dalar')),source=song['abc-source'];
const plugin=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const da=JSON.parse(await readFile(path.join(root,'languages/da-DK/plugin.json'),'utf8'));
const file=path.join(dir,'fixture.html');
await writeFile(file,assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[plugin,da,
 {title:'$:/language',text:'$:/languages/da-DK'},{title:'$:/DefaultTiddlers',text:'Acceptance'},
 {...song,title:'Test score'},{title:'Acceptance',text:'<$huwiki-abc tiddler="Test score" view="full"/>'}
]));
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1180,height:1000}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);
 await page.locator('.huwabc-paper svg').first().waitFor();
 for(const [capo,written] of [['2','^d'],['4','^c']]){
  await page.getByRole('combobox',{name:'Capo',exact:true}).selectOption(capo);
  const state=await page.evaluate(()=>{
   function find(w){if(w.title==='Test score'&&w._audioController)return w;for(const c of w.children||[]){const hit=find(c);if(hit)return hit;}}
   const widget=find($tw.rootWidget),tune=widget&&widget._audioController.visualObj;
   if(!tune)return {error:'No prepared score'};
   const source=$tw.wiki.getTiddler('Test score').fields['abc-source'];
   const lines=tune.lines.filter(l=>l.staff).map(l=>l.staff.flatMap(s=>(s.voices||[]).flatMap(v=>v.filter(e=>e.el_type==='note'))));
   const pitches=lines.flat().flatMap(e=>e.pitches||[]);
   const first=source.indexOf('[1'),second=source.indexOf('[2'),nextPart=source.indexOf('[P:B]');
   const firstLine=lines.findIndex(es=>es.some(e=>e.startChar>=first&&e.startChar<second));
   const secondLine=lines.findIndex(es=>es.some(e=>e.startChar>=second&&e.startChar<nextPart));
   const ABC=$tw.modules.execute('$:/plugins/huwiki/abc/vendor/abcjs.js'),acc=$tw.modules.execute('$:/plugins/huwiki/abc/accompaniment.js');
   const raw=ABC.parseOnly(source)[0],fields=$tw.wiki.getTiddler('Test score').fields;
   acc.prepare(ABC,raw,source,acc.read(fields),true,fields);
   return {source,leading:pitches[7].name,tonicAccidental:pitches[8].accidental||'',firstLine,secondLine,
    concert:JSON.stringify(raw.setUpAudio({chordsOff:true})),shown:JSON.stringify(tune.setUpAudio({chordsOff:true}))};
  });
  assert.equal(state.error,undefined,state.error);assert.equal(state.source,source);
  assert.equal(state.leading,written);assert.equal(state.tonicAccidental,'');
  assert.ok(state.firstLine>=0&&state.secondLine>=0);assert.equal(state.secondLine,state.firstLine,'the two short endings must share one system');
  assert.equal(state.shown,state.concert,'harmonic spelling must not alter the concert arrangement');
  await page.getByRole('button',{name:'PDF / Udskriv',exact:true}).click();
  await page.getByRole('link',{name:'Gem PDF',exact:true}).waitFor({timeout:90000});
  const pdfLabels=await page.locator('.huwabc-print-overlay .abcjs-ending').allTextContents();
  assert.ok(pdfLabels.length>=2,'PDF retains volta brackets');
  await page.screenshot({path:path.join(dir,'dalarne-capo-'+capo+'-pdf.png')});
  await page.getByRole('button',{name:'Tilbage til wikien',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log('Dalarne Em/Dm: raised leading notes, paired short voltas, unchanged concert audio and real PDF passed');
}finally{await browser.close();}
