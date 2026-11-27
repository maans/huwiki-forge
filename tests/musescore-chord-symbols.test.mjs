import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {FixtureDOMParser} from './helpers/xml-fixture-dom.mjs';
const converter={};
runInNewContext(await readFile(new URL('../plugins/musescore-import/src/converter.js',import.meta.url),'utf8'),{exports:converter,DOMParser:FixtureDOMParser});
test('MusicXML chord qualities become playable compact symbols, including the Desafinado sixths and diminished sevenths',()=>{
 const kinds=[['diminished-seventh','Bbdim7'],['minor-sixth','Bbm6'],['major-sixth','Bb6'],['major-seventh','Bbmaj7'],['half-diminished','Bbm7b5'],['dominant-ninth','Bb9'],['suspended-fourth','Bbsus4']];
 const measures=kinds.map(([kind])=>`<measure><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>${kind}</kind></harmony><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`).join('');
 const xml=`<score-partwise><part-list><score-part id="P1"><part-name>Melodi</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
 const model=converter.parseMusicXML(xml,'Desafinado.musicxml');
 const result=converter.renderABC(model,model.staves[0].voices.map(v=>v.id),1,model.totalMeasures);
 for(const [,symbol] of kinds)assert.ok(result.abc.includes('"'+symbol+'"'),symbol);
 assert.doesNotMatch(result.abc,/diminished-seventh|minor-sixth|major-sixth/);
});
