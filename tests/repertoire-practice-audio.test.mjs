import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const practice={};
runInNewContext(await readFile(new URL("../plugins/repertoire/src/practice.js",import.meta.url),"utf8"),{exports:practice});
// Exercise the shipped audio mixer's gain calculation, not a separate model of
// audibility. This catches a checked metronome silently excluded by global Solo.
const abc=JSON.parse(JSON.parse(await readFile(new URL("../plugins/abc/dist/plugin.json",import.meta.url),"utf8")).text).tiddlers;
const modules=new Map();
function requireABC(id){
 if(modules.has(id))return modules.get(id);
 assert.ok(abc[id],"Missing ABC dependency: "+id);
 const exports={};modules.set(id,exports);
 runInNewContext(abc[id].text,{exports,require:requireABC},{filename:id});
 return exports;
}
const mixer=requireABC("$:/plugins/huwiki/abc/accompaniment.js");
const enabled={enabled:true,metronome:true,voice:"1"};

test("practice metronome remains audible when an existing voice is soloed",()=>{
 const base={metronome:false,metronomeVolume:60,melodyVolume:90,
  voiceSettings:{"0":{mode:"solo",volume:80},"1":{mode:"normal",volume:90},"2":{mode:"normal"}},
  backingModes:{metronome:"mute"}};
 const before=JSON.stringify(base),mix=practice.overlay(base,enabled);
 assert.equal(mix.backingModes.metronome,"solo");
 assert.ok(mixer.channelGain("metronomeVolume",mix)>0);
 assert.ok(mixer.channelGain("voice:0",mix)>0);
 assert.equal(mixer.channelGain("voice:1",mix),0);
 assert.equal(mixer.channelGain("voice:2",mix),0,"the existing solo selection remains effective");
 assert.equal(JSON.stringify(base),before);
 assert.equal(JSON.stringify(practice.overlay(base,{enabled:false})),before);
});

test("muting the only solo voice does not let the metronome silence all remaining voices",()=>{
 const base={metronome:false,voiceSettings:{"0":{mode:"normal"},"1":{mode:"solo"},"2":{mode:"normal"}}};
 const mix=practice.overlay(base,enabled);
 assert.equal(mix.backingModes.metronome,"normal");
 assert.ok(mixer.channelGain("metronomeVolume",mix)>0);
 assert.ok(mixer.channelGain("voice:0",mix)>0);
 assert.equal(mixer.channelGain("voice:1",mix),0);
 assert.ok(mixer.channelGain("voice:2",mix)>0);
});

test("a normal mix and a previously soloed metronome do not create a new practice solo",()=>{
 for(const previousMetronome of ["normal","mute","solo"]){
  const base={metronome:true,backingModes:{metronome:previousMetronome},voiceSettings:{"0":{mode:"normal"},"1":{mode:"normal"}}};
  const mix=practice.overlay(base,enabled);
  assert.equal(mix.backingModes.metronome,"normal");
  assert.ok(mixer.channelGain("voice:0",mix)>0);
  assert.equal(mixer.channelGain("voice:1",mix),0);
  assert.ok(mixer.channelGain("metronomeVolume",mix)>0);
 }
});

test("metronome joins only backing solos that the actual mixer considers active",()=>{
 const cases=[
  [{enabled:true,backingModes:{chords:"solo"}},true],
  [{enabled:false,backingModes:{chords:"solo"}},false],
  [{enabled:true,backingModes:{drums:"solo"}},true],
  [{droneEnabled:true,backingModes:{drone:"solo"}},true],
  [{droneEnabled:false,backingModes:{drone:"solo"}},false],
  [{enabled:false,bassSource:"style",backingModes:{bass:"solo"}},false],
  [{enabled:true,bassSource:"none",backingModes:{bass:"solo"}},false],
  [{enabled:false,bassSource:"voice:0",backingModes:{bass:"solo"}},true]
 ];
 for(const [base,solo] of cases){
  const mix=practice.overlay(base,enabled);
  assert.equal(mix.backingModes.metronome,solo?"solo":"normal",JSON.stringify(base));
  assert.ok(mixer.channelGain("metronomeVolume",mix)>0,JSON.stringify(base));
  for(const channel of Object.keys(base.backingModes))
   assert.equal(mix.backingModes[channel],base.backingModes[channel],"other backing modes remain unchanged");
 }
});

test("turning the practice metronome off removes its gain without changing the chosen solo voice",()=>{
 const base={metronome:false,voiceSettings:{"0":{mode:"solo"},"1":{mode:"normal"}}};
 const mix=practice.overlay(base,{...enabled,metronome:false});
 assert.equal(mix.backingModes.metronome,"mute");
 assert.equal(mixer.channelGain("metronomeVolume",mix),0);
 assert.ok(mixer.channelGain("voice:0",mix)>0);
 assert.equal(mixer.channelGain("voice:1",mix),0);
});
