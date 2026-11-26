import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {FixtureDOMParser} from './helpers/xml-fixture-dom.mjs';

const percussion={};
runInNewContext(await readFile(new URL('../plugins/musescore-import/src/percussion.js',import.meta.url),'utf8'),{exports:percussion});
const converter={};
runInNewContext(await readFile(new URL('../plugins/musescore-import/src/converter.js',import.meta.url),'utf8'),{exports:converter,DOMParser:FixtureDOMParser,require:id=>{assert.equal(id,'$:/plugins/huwiki/musescore-import/percussion.js');return percussion;}});
const pkg=JSON.parse(await readFile(new URL('../plugins/musescore-import/dist/plugin.json',import.meta.url),'utf8'));
const module={exports:{}};
runInNewContext(JSON.parse(pkg.text).tiddlers[pkg.title+'/abcjs.js'].text,{module,exports:module.exports,window:{}});
const ABC=module.exports;
function render(model){const out=converter.renderABC(model,model.staves.flatMap(st=>st.voices.map(v=>v.id)),1,model.totalMeasures);const tune=ABC.parseOnly(out.abc)[0],audio=tune.setUpAudio({chordsOff:true});return {out,tune,audio};}
const notes=track=>Array.from(track).filter(e=>e.cmd==='note').map(e=>[e.pitch,e.start,e.duration,e.instrument]);
const chord=(pitch,type='quarter')=>`<Chord><durationType>${type}</durationType><Note><pitch>${pitch}</pitch></Note></Chord>`;
const muse=(definitions='',clef='PERC')=>`<museScore version="4.0"><Score><Part><Staff id="1"><defaultClef>${clef}</defaultClef></Staff><trackName>Kit</trackName><Instrument><useDrumset>1</useDrumset>${definitions}</Instrument></Part><Staff id="1"><Measure><voice><KeySig><accidental>-3</accidental></KeySig><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>${[42,38,46,51].map(p=>chord(p)).join('')}</voice><voice>${chord(36,'half')}${chord(36,'half')}</voice></Measure></Staff></Score></museScore>`;

test('MuseScore kit layers share one five-line staff while sounds, overlaps and rhythm survive flat keys',()=>{
 const {out,tune,audio}=render(converter.parseMuse(muse(),'kit.mscx'));
 assert.deepEqual(Array.from(tune.warnings||[]),[]);
 assert.equal(tune.lines[0].staff.length,1);assert.equal(tune.lines[0].staff[0].voices.length,2);
 assert.equal(tune.lines[0].staff[0].clef.type,'perc');assert.equal(tune.lines[0].staff[0].clef.stafflines,5);
 assert.deepEqual(notes(audio.tracks[0]),[[42,0,.25,128],[38,.25,.25,128],[46,.5,.25,128],[51,.75,.25,128]]);
 assert.deepEqual(notes(audio.tracks[1]),[[36,0,.5,128],[36,.5,.5,128]]);
 for(const sound of [42,46,51]){const [token,mapping]=Object.entries(tune.formatting.percmap).find(([,m])=>m.sound===sound);assert.equal(mapping.noteHead,'x');assert.ok(percussion.tokenPitch(token)>=10);}
 const [snare]=Object.entries(tune.formatting.percmap).find(([,m])=>m.sound===38);assert.equal(percussion.tokenPitch(snare),7);
 const [kick]=Object.entries(tune.formatting.percmap).find(([,m])=>m.sound===36);assert.equal(percussion.tokenPitch(kick),3);
 assert.equal(out.warnings.length,0);
});

test('MuseScore custom kit positions and notehead overrides are respected',()=>{
 const defs='<Drum pitch="42"><head>diamond</head><line>2</line><voice>0</voice><name>Custom hat</name></Drum><Drum pitch="38"><head>normal</head><line>5</line><voice>0</voice></Drum>';
 const {tune,audio}=render(converter.parseMuse(muse(defs),'custom.mscx'));
 const [hat,map]=Object.entries(tune.formatting.percmap).find(([,m])=>m.sound===42);
 assert.equal(percussion.tokenPitch(hat),8);assert.equal(map.noteHead,'harmonic');
 assert.deepEqual(notes(audio.tracks[0]).map(e=>e[0]),[42,38,46,51]);
});

function musicXML(){
 const sounds=[36,38,42];
 const instruments=sounds.map(p=>`<score-instrument id="D${p}"><instrument-name>Drum ${p}</instrument-name></score-instrument><midi-instrument id="D${p}"><midi-channel>10</midi-channel><midi-unpitched>${p+1}</midi-unpitched></midi-instrument>`).join('');
 const drum=(pitch,duration,voice)=>`<note><unpitched><display-step>${pitch===36?'F':pitch===38?'C':'G'}</display-step><display-octave>${pitch===36?4:5}</display-octave></unpitched><duration>${duration}</duration><instrument id="D${pitch}"/><voice>${voice}</voice><type>${duration===1?'quarter':'half'}</type>${pitch===42?'<notehead>x</notehead>':''}</note>`;
 return `<score-partwise><part-list><score-part id="P1"><part-name>Trommer</part-name>${instruments}</score-part><score-part id="P2"><part-name>Trompet</part-name><midi-instrument id="T"><midi-program>57</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure><attributes><divisions>1</divisions><key><fifths>-3</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign></clef></attributes>${[42,38,42,38].map(p=>drum(p,1,1)).join('')}<backup><duration>4</duration></backup>${drum(36,2,2)}${drum(36,2,2)}</measure></part><part id="P2"><measure><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>`;
}

test('MusicXML unpitched instrument references preserve MIDI identity and display positions',()=>{
 const model=converter.parseMusicXML(musicXML(),'kit.musicxml'),{out,tune,audio}=render(model);
 assert.equal(model.staves[0].midiInstruments.D38.unpitched,38);
 assert.equal(tune.lines[0].staff.length,2);assert.equal(tune.lines[0].staff[0].voices.length,2);
 assert.deepEqual(notes(audio.tracks[0]),[[42,0,.25,128],[38,.25,.25,128],[42,.5,.25,128],[38,.75,.25,128]]);
 assert.deepEqual(notes(audio.tracks[1]),[[36,0,.5,128],[36,.5,.5,128]]);
 assert.deepEqual(notes(audio.tracks[2]),[[60,0,1,56]]);
 assert.equal(out.warnings.length,0);assert.deepEqual(Array.from(tune.warnings||[]),[]);
});

test('Distinct percussion sounds sharing a display position retain unique playback mappings',()=>{
 const kit=percussion.createMap([42,46,49,57].map(p=>({pitch:p,percussion:{displayStep:'G',displayOctave:5,head:'x'}})));
 const source='X:1\nM:4/4\nL:1/4\n'+kit.directives.join('\n')+'\nK:C clef=perc stafflines=5\n'+[42,46,49,57].map(p=>kit.byPitch[p].token).join(' ')+'|';
 const tune=ABC.parseOnly(source)[0],audio=tune.setUpAudio({});
 assert.deepEqual(notes(audio.tracks[0]).map(e=>e[0]),[42,46,49,57]);
 assert.ok(Object.values(kit.byPitch).every(d=>percussion.tokenPitch(d.token)===11));
});

test('Percussion clef alone identifies a kit, and unfamiliar MIDI sounds survive with a review warning',()=>{
 const xml=muse().replace('<useDrumset>1</useDrumset>','<Channel><program value="0"/></Channel>').replaceAll('<pitch>42</pitch>','<pitch>27</pitch>');
 const model=converter.parseMuse(xml,'unfamiliar.mscx'),{out,audio}=render(model);
 assert.equal(model.staves[0].program,128);assert.equal(model.staves[0].percussion,true);
 assert.deepEqual(notes(audio.tracks[0]).map(e=>e[0]),[27,38,46,51]);
 assert.ok(out.warnings.some(w=>w.includes('GM-standarden')&&w.includes('27')));
});

test('Repeated MuseScore drum bars retain the imported kit mapping and exact played notes',()=>{
 const xml=muse().replace('</Measure></Staff>', '</Measure><Measure><voice><RepeatMeasure><subtype>1</subtype><duration>1/1</duration></RepeatMeasure></voice><voice><MeasureRepeat><subtype>1</subtype><duration>1/1</duration></MeasureRepeat></voice></Measure><Measure><voice><RepeatMeasure><subtype>1</subtype></RepeatMeasure></voice><voice><RepeatMeasure><subtype>1</subtype></RepeatMeasure></voice></Measure></Staff>');
 const {out,audio}=render(converter.parseMuse(xml,'repeat-kit.mscx'));
 assert.deepEqual(notes(audio.tracks[0]).map(e=>e[0]),[42,38,46,51,42,38,46,51,42,38,46,51]);
 assert.deepEqual(notes(audio.tracks[1]).map(e=>e[0]),[36,36,36,36,36,36]);
 assert.equal(notes(audio.tracks[0]).at(-1)[1],2.75);assert.equal(out.warnings.length,0);
});

test('Open hi-hat gets an open circle, including simultaneous notes, without changing sound or rhythm',()=>{
 const xml=muse().replace('<Note><pitch>42</pitch></Note>','<Note><pitch>46</pitch></Note><Note><pitch>36</pitch></Note>');
 const {tune,audio}=render(converter.parseMuse(xml,'open-hat.mscx'));
 const events=Array.from(tune.lines).flatMap(l=>Array.from(l.staff||[]).flatMap(s=>Array.from(s.voices).flatMap(v=>Array.from(v)))).filter(e=>e.midiPitches?.length);
 const opened=events.filter(e=>e.midiPitches.some(n=>n.pitch===46));
 assert.equal(opened.length,2);assert.ok(opened.every(e=>e.decoration?.includes('open')));
 assert.ok(events.filter(e=>!e.midiPitches.some(n=>n.pitch===46)).every(e=>!e.decoration?.includes('open')));
 assert.deepEqual(notes(audio.tracks[0]),[[46,0,.25,128],[36,0,.25,128],[38,.25,.25,128],[46,.5,.25,128],[51,.75,.25,128]]);
 assert.deepEqual(Array.from(tune.warnings||[]),[]);
});
