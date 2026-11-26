/** Exercise real XML DOM parsing, ABC engraving and MIDI programs in Chrome. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');

const root=path.resolve(import.meta.dirname,'..');
const sources={};
for(const file of ['converter.js','percussion.js'])sources[file]=await readFile(path.join(root,'plugins/musescore-import/src',file),'utf8');
const pkg=JSON.parse(await readFile(path.join(root,'plugins/abc/dist/plugin.json'),'utf8'));
const abcSource=JSON.parse(pkg.text).tiddlers['$:/plugins/huwiki/abc/vendor/abcjs.js'].text;
const output=path.join(root,'test-results/musescore');
await mkdir(output,{recursive:true});
const names=['Trompet 1','Trompet 2','Klarinet','Tenorsax','Barytonsax','Klaver (højre)','Klaver (venstre)','Bas'];
const programs=[56,56,71,66,67,0,0,32];
const note=(pitch,type='whole')=>`<Chord><durationType>${type}</durationType><Note><pitch>${pitch}</pitch></Note></Chord>`;
function museFixture(metadata){
 const parts=names.map((name,i)=>`<Part><Staff id="${i+1}"><defaultClef>G</defaultClef></Staff><trackName>${name}</trackName><Instrument><trackName>${name}</trackName>${metadata?`<Channel><program value="${programs[i]}"/></Channel>`:''}</Instrument></Part>`).join('');
 const staves=names.map((name,i)=>`<Staff id="${i+1}"><Measure><voice><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>${note(60+i)}</voice></Measure></Staff>`).join('');
 return `<museScore version="4.0"><Score><metaTag name="workTitle">Instrumenter</metaTag>${parts}<Part><Staff id="9"><defaultClef>PERC</defaultClef></Staff><trackName>Trommer</trackName><Instrument><useDrumset>1</useDrumset></Instrument></Part>${staves}<Staff id="9"><Measure><voice>${[42,38,42,38].map(n=>note(n,'quarter')).join('')}</voice><voice>${[36,36].map(n=>note(n,'half')).join('')}</voice></Measure></Staff></Score></museScore>`;
}
function xmlFixture(metadata){
 const parts=names.map((name,i)=>`<score-part id="P${i+1}"><part-name>${name}</part-name>${metadata?`<score-instrument id="I${i+1}"><instrument-name>${name}</instrument-name></score-instrument><midi-instrument id="I${i+1}"><midi-channel>${i+1}</midi-channel><midi-program>${programs[i]+1}</midi-program></midi-instrument>`:''}</score-part>`).join('');
 const staff=names.map((name,i)=>`<part id="P${i+1}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part>`).join('');
 const drum=(midi,voice,duration)=>`<note><instrument id="D${midi}"/><unpitched><display-step>${midi===36?'F':midi===38?'C':'G'}</display-step><display-octave>${midi===36?4:5}</display-octave></unpitched><duration>${duration}</duration><voice>${voice}</voice><type>${duration===1?'quarter':'half'}</type></note>`;
 return `<score-partwise version="4.0"><work><work-title>Instrumenter XML</work-title></work><part-list>${parts}<score-part id="P9"><part-name>Trommer</part-name>${[36,38,42].map(n=>`<score-instrument id="D${n}"><instrument-name>Drum ${n}</instrument-name></score-instrument><midi-instrument id="D${n}"><midi-channel>10</midi-channel><midi-unpitched>${n+1}</midi-unpitched></midi-instrument>`).join('')}</score-part></part-list>${staff}<part id="P9"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign></clef></attributes>${[42,38,42,38].map(n=>drum(n,1,1)).join('')}<backup><duration>4</duration></backup>${[36,36].map(n=>drum(n,2,2)).join('')}</measure></part></score-partwise>`;
}
const fixtures=[
 {id:'muse-metadata',format:'mscx',raw:museFixture(true)},
 {id:'muse-names',format:'mscx',raw:museFixture(false)},
 {id:'xml-metadata',format:'musicxml',raw:xmlFixture(true)},
 {id:'xml-names',format:'musicxml',raw:xmlFixture(false)}
];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1300}});
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html><body style="font-family: sans-serif"><h1>MuseScore import: instrumenter og trommer</h1></body></html>');
 const results=await page.evaluate(({sources,abcSource,fixtures})=>{
  const cache={};
  const load=id=>{const file=id.split('/').pop();if(cache[file])return cache[file];const module={exports:{}};cache[file]=module.exports;new Function('module','exports','require',sources[file])(module,module.exports,load);cache[file]=module.exports;return module.exports;};
  const converter=load('converter.js'),abcModule={exports:{}};
  new Function('module','exports','require',abcSource)(abcModule,abcModule.exports,load);
  const ABC=abcModule.exports;
  return fixtures.map(fixture=>{
   const model=fixture.format==='mscx'?converter.parseMuse(fixture.raw,'browser.mscx'):converter.parseMusicXML(fixture.raw,'browser.musicxml');
   const selected=model.staves.flatMap(staff=>staff.voices.map(voice=>voice.id));
   const result=converter.renderABC(model,selected,1,1,{barsPerLine:4});
   const host=document.createElement('section');host.id=fixture.id;document.body.appendChild(host);
   const title=document.createElement('h2');title.textContent=fixture.id;host.appendChild(title);
   const engraving=document.createElement('div');host.appendChild(engraving);
   const tune=ABC.renderAbc(engraving,result.abc,{add_classes:true,staffwidth:850})[0];
   const audio=tune.setUpAudio({});
   const staffCounts=tune.lines.filter(line=>line.staff).map(line=>line.staff.map(staff=>({clef:staff.clef.type,voices:staff.voices.length,lines:staff.stafflines??staff.clef.stafflines??5})));
   // ABCJS names each SVG notehead after the input pitch, rather than its glyph.
   // RelativeElement.c identifies the engraved symbol; graphelem is its SVG path.
   const heads=(tune.engraver?.staffgroups||[]).flatMap(group=>group.voices.flatMap(voice=>voice.children.flatMap(element=>element.heads||[])));
   const crossHeads=heads.filter(head=>head.c==='noteheads.indeterminate');
   const visibleCrossHeads=crossHeads.filter(head=>{
    const node=head.graphelem;
    return node&&engraving.contains(node)&&node.matches('path.abcjs-notehead')&&node.getAttribute('d')&&node.getBBox().width>0;
   });
   return {id:fixture.id,programs:model.staves.map(staff=>staff.program),sources:model.staves.map(staff=>staff.instrumentSource),
    warnings:result.warnings,abcWarnings:tune.warnings||[],abc:result.abc,staffCounts,
    tracks:audio.tracks.map(track=>track.filter(event=>event.cmd==='note').map(event=>({pitch:event.pitch,instrument:event.instrument,start:event.start,duration:event.duration}))),
    xheads:visibleCrossHeads.length,
    noteheadDiagnostics:heads.map(head=>({glyph:head.c,name:head.name,svg:head.graphelem?.outerHTML||null})),
    svg:engraving.querySelectorAll('svg').length};
  });
 },{sources,abcSource,fixtures});
 await page.screenshot({path:path.join(output,'drums.png'),fullPage:true});
 await writeFile(path.join(output,'diagnostics.json'),JSON.stringify(results,null,2)+'\n');
 for(const result of results){
  assert.deepEqual(result.programs,[...programs,128],`${result.id}: imported instruments`);
  assert.equal(result.tracks.length,10,`${result.id}: separate playback voices`);
  result.tracks.slice(0,8).forEach((track,index)=>{
   assert.ok(track.length,`${result.id}: melodic voice ${index+1} has notes`);
   assert.ok(track.every(event=>Number(event.instrument)===programs[index]),`${result.id}: program of melodic voice ${index+1}`);
  });
  assert.deepEqual(result.tracks[8].map(note=>note.pitch),[42,38,42,38],`${result.id}: hat and snare sounds`);
  assert.deepEqual(result.tracks[9].map(note=>note.pitch),[36,36],`${result.id}: bass drum sounds`);
  assert.ok(result.tracks.slice(8).flat().every(note=>Number(note.instrument)===128),`${result.id}: percussion playback`);
  const first=result.staffCounts[0];
  assert.equal(first.length,9,`${result.id}: two drum voices share a staff`);
  assert.equal(first.at(-1).voices,2,`${result.id}: two simultaneous drum voices`);
  assert.equal(first.at(-1).lines,5,`${result.id}: five drum staff lines`);
  assert.match(first.at(-1).clef,/perc/,`${result.id}: percussion clef`);
  assert.match(result.abc,/^%%percmap\s+\S+\s+42\s+x\s*$/m,`${result.id}: hi-hat cross noteheads`);
  assert.ok(result.xheads>0,`${result.id}: visible SVG cross noteheads; ${JSON.stringify(result.noteheadDiagnostics)}`);
  assert.ok(result.svg>0,`${result.id}: visible score`);
  assert.equal(result.abcWarnings.length,0,`${result.id}: valid ABC`);
  assert.ok(!result.warnings.some(w=>/unpitched|Slagtøjsnotation/.test(w)),`${result.id}: no obsolete percussion warning`);
 }
 console.log(JSON.stringify({ok:true,fixtures:results.map(r=>r.id),voices:10,drumStaff:'five lines, two voices',screenshot:path.relative(root,path.join(output,'drums.png'))}));
}finally{await browser.close();}
