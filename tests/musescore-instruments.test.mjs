import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

// A fixture-only DOM adapter keeps these parser integration tests dependency free.
// Production uses the browser DOMParser; its native DOM is also smoke-tested.
class FixtureElement {
 constructor(name,attributes={}){this.localName=name;this.attributes=attributes;this.children=[];}
 get firstElementChild(){return this.children.find(x=>x instanceof FixtureElement)||null;}
 get nextElementSibling(){const peers=this.parent?.children||[],at=peers.indexOf(this);return peers.slice(at+1).find(x=>x instanceof FixtureElement)||null;}
 get textContent(){return this.children.map(x=>typeof x==="string"?x:x.textContent).join("");}
 getAttribute(name){return this.attributes[name]??null;}
 getElementsByTagName(name){return this.children.flatMap(x=>x instanceof FixtureElement?[...(x.localName===name?[x]:[]),...x.getElementsByTagName(name)]:[]);}
}
const unescape=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,c=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[c]);
class FixtureDOMParser {
 parseFromString(source){
  const doc=new FixtureElement("#document"),stack=[doc];
  for(const token of source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g)||[]){
   if(token.startsWith("<?")||token.startsWith("<!--"))continue;
   if(token.startsWith("</")){stack.pop();continue;}
   if(token.startsWith("<![CDATA[")){stack.at(-1).children.push(token.slice(9,-3));continue;}
   if(token.startsWith("<")){
    const name=token.match(/^<([^\s/>]+)/)?.[1];if(!name)throw Error("Invalid fixture XML");
    const attributes={};for(const match of token.matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g))attributes[match[1]]=unescape(match[3]);
    const element=new FixtureElement(name,attributes);element.parent=stack.at(-1);element.parent.children.push(element);
    if(!token.endsWith("/>"))stack.push(element);
   }else stack.at(-1).children.push(unescape(token));
  }
  doc.documentElement=doc.firstElementChild;return doc;
 }
}
const percussion={};
runInNewContext(await readFile(new URL("../plugins/musescore-import/src/percussion.js",import.meta.url),"utf8"),{exports:percussion});
const converter={};
runInNewContext(await readFile(new URL("../plugins/musescore-import/src/converter.js",import.meta.url),"utf8"),{exports:converter,DOMParser:FixtureDOMParser,require:id=>{assert.equal(id,"$:/plugins/huwiki/musescore-import/percussion.js");return percussion;}});
const pkg=JSON.parse(await readFile(new URL("../plugins/musescore-import/dist/plugin.json",import.meta.url))),tiddlers=JSON.parse(pkg.text).tiddlers;
const abc={exports:{}};
runInNewContext(tiddlers[pkg.title+"/abcjs.js"].text,{module:abc,exports:abc.exports,window:{}});

const musePart=(id,name,metadata="",staves=`<Staff id="${id}"><defaultClef>G</defaultClef></Staff>`)=>`<Part>${staves}<trackName>${name}</trackName><Instrument><longName>${name}</longName>${metadata}</Instrument></Part>`;
const museStaff=(id,extra="")=>`<Staff id="${id}"><Measure><voice>${extra}<Chord><durationType>whole</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord></voice></Measure></Staff>`;
const mscx=(parts,staves)=>`<museScore version="4.0"><programVersion>4.6</programVersion><Score>${parts}${staves}</Score></museScore>`;
const xmlPart=(id,name,metadata="")=>`<score-part id="${id}"><part-name>${name}</part-name>${metadata}</score-part>`;
const xmlStaff=(id,attributes="",extra="")=>`<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>${attributes}</attributes>${extra}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part>`;
const musicXML=(parts,staves)=>`<score-partwise version="4.0"><part-list>${parts}</part-list>${staves}</score-partwise>`;
function render(model,selection=model.staves.flatMap(s=>s.voices.map(v=>v.id))){return converter.renderABC(model,selection,1,1).abc;}
function audioPrograms(source){return Array.from(abc.exports.parseOnly(source)[0].setUpAudio({chordsOff:true}).tracks,t=>Array.from(new Set(Array.from(t).filter(e=>e.cmd==="note").map(e=>e.instrument))));}

test("MuseScore preserves explicit zero-based programs, including piano zero, before printed names",()=>{
 const model=converter.parseMuse(mscx(musePart(1,"Trompet1",'<Channel><program value="0"/></Channel>')+musePart(2,"Klaver",'<Channel><program value="56"/></Channel>'),museStaff(1)+museStaff(2)),"metadata.mscx");
 assert.deepEqual(Array.from(model.staves,s=>s.program),[0,56]);
 assert.ok(model.staves.every(s=>s.instrumentSource==="metadata"));
 const out=render(model);assert.deepEqual(audioPrograms(out),[[0],[56]]);
 assert.match(out,/K:C\nV:1\n%%MIDI program 0\n/);
 assert.match(out,/V:2\n%%MIDI program 56\n/);
});

test("Danish and English voice names supply safe instrument fallbacks and real playback",()=>{
 const named=[["Trompet1",56],["Trumpet 2",56],["Klarinet",71],["Tenorsax",66],["Barytonsax",67],["Klaverhøjre",0],["Klaver venstre",0],["Bas",32],["Electric bass",33]];
 const model=converter.parseMuse(mscx(named.map(([name],i)=>musePart(i+1,name)).join(""),named.map((_,i)=>museStaff(i+1)).join("")),"names.mscx");
 assert.deepEqual(Array.from(model.staves,s=>s.program),named.map(([,p])=>p));
 assert.deepEqual(audioPrograms(render(model)),named.map(([,p])=>[p]));
 assert.ok(model.staves.every(s=>s.instrumentSource==="name"));
});

test("Unknown names remain unspecified and do not inherit another voice's program",()=>{
 const model=converter.parseMuse(mscx(musePart(1,"Trompet")+musePart(2,"Mysterium"),museStaff(1)+museStaff(2)),"unknown.mscx");
 assert.equal(model.staves[1].program,null);
 const out=render(model);assert.equal((out.match(/%%MIDI program/g)||[]).length,1);
 assert.deepEqual(audioPrograms(out),[[56],[0]]);
 assert.equal(converter.namedProgram("Bassoon"),70);
 assert.equal(converter.namedProgram("Bass clarinet"),71);
 assert.equal(converter.namedProgram("Bass melody"),null);
});

test("MusicXML converts one-based program metadata and keeps valid piano program one",()=>{
 const parts=xmlPart("P1","Klaver",'<midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>57</midi-program></midi-instrument>')+xmlPart("P2","Trompet",'<midi-instrument id="I2"><midi-program>1</midi-program></midi-instrument>')+xmlPart("P3","Klarinet",'<midi-instrument id="I3"><midi-program>0</midi-program></midi-instrument>');
 const model=converter.parseMusicXML(musicXML(parts,xmlStaff("P1")+xmlStaff("P2")+xmlStaff("P3")),"metadata.musicxml");
 assert.deepEqual(Array.from(model.staves,s=>s.program),[56,0,71]);
 assert.deepEqual(audioPrograms(render(model)),[[56],[0],[71]]);
 assert.equal(model.staves[0].midiInstruments.I1.program,56);
 assert.equal(model.staves[2].instrumentSource,"name");
});

test("MusicXML instrument-name supplies a fallback when the part label is generic",()=>{
 const model=converter.parseMusicXML(musicXML(xmlPart("P1","Stemme 1",'<score-instrument id="I1"><instrument-name>Tenor Saxophone</instrument-name></score-instrument>'),xmlStaff("P1")),"instrument-name.xml");
 assert.equal(model.staves[0].program,66);
 assert.deepEqual(audioPrograms(render(model)),[[66]]);
});

test("Percussion metadata selects a drum kit without changing the following melodic channel",()=>{
 const muse=converter.parseMuse(mscx(musePart(1,"Kit",'<useDrumset>1</useDrumset><Channel><program value="0"/></Channel>')+musePart(2,"Trompet"),museStaff(1)+museStaff(2)),"kit.mscx");
 assert.equal(muse.staves[0].program,128);assert.equal(muse.staves[0].clef,"perc");
 const out=render(muse);assert.match(out,/V:1 name="Kit" clef=perc/);assert.doesNotMatch(out,/%%MIDI channel/);
 assert.deepEqual(audioPrograms(out),[[128],[56]]);
 const xml=converter.parseMusicXML(musicXML(xmlPart("P1","Kit",'<midi-instrument id="snare"><midi-channel>10</midi-channel><midi-unpitched>39</midi-unpitched></midi-instrument>')+xmlPart("P2","Mysterium"),xmlStaff("P1")+xmlStaff("P2")),"kit.xml");
 assert.equal(xml.staves[0].program,128);assert.equal(xml.staves[0].midiInstruments.snare.unpitched,38);
 assert.deepEqual(audioPrograms(render(xml)),[[128],[0]]);
});

test("Piano staves share their source part and retain octave clefs and imported harmony",()=>{
 const part=musePart(1,"Klaver",'<Channel><program value="0"/></Channel>','<Staff id="1"><defaultClef>G</defaultClef></Staff><Staff id="2"><defaultClef>F8vb</defaultClef></Staff>');
 const model=converter.parseMuse(mscx(part,museStaff(1,'<Harmony><root>14</root><name>7</name></Harmony>')+museStaff(2)),"piano.mscx");
 assert.equal(model.staves[0].partId,model.staves[1].partId);
 assert.equal(model.staves[1].clef,"bass-8");
 const out=render(model);assert.equal((out.match(/name="Klaver"/g)||[]).length,1);assert.match(out,/V:2 clef=bass-8/);assert.match(out,/"C7"/);
 assert.deepEqual(audioPrograms(out),[[0],[0]]);
});

test("Instrument metadata leaves MusicXML transposition and slash harmony intact",()=>{
 const model=converter.parseMusicXML(musicXML(xmlPart("P1","Klarinet",'<midi-instrument id="I1"><midi-program>72</midi-program></midi-instrument>'),xmlStaff("P1",'<transpose><chromatic>-2</chromatic></transpose>','<harmony><root><root-step>C</root-step></root><kind>dominant</kind><bass><bass-step>G</bass-step></bass></harmony>')),"clarinet.xml");
 assert.equal(model.staves[0].measures[0].transpose,-2);
 const out=render(model);assert.match(out,/"C7\/G"/);assert.deepEqual(audioPrograms(out),[[71]]);
});
