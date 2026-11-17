import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script,runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url);
const read=async path=>readFile(new URL(path,root),'utf8');
test('AniMus play gesture unlocks the shared ABC audio context before async SoundFont work',async()=>{
 const p=JSON.parse(await read('plugins/musical/dist/plugin.json'));
 const t=JSON.parse(p.text).tiddlers;
 const widget=t['$:/plugins/huwiki/musical/widget.js'].text;
 new Script(widget,{filename:'musical/widget.js'});
 assert.match(widget,/function unlockMusicAudio\(/);
 assert.match(widget,/synth\.activeAudioContext\(\)/);
 assert.match(widget,/synth\.registerAudioContext\(ctx\)/);
 assert.match(widget,/ctx\.resume\(\)/);
 const click=widget.slice(widget.indexOf('play.onclick=function(){'),widget.indexOf('time.addEventListener("input"'));
 assert.ok(click.indexOf('unlockMusicAudio()')>0);
 assert.ok(click.indexOf('unlockMusicAudio()')<click.indexOf('Playback.start(session)'));
 assert.ok(click.indexOf('unlockMusicAudio()')<click.indexOf('syncAudio(timeline.value())'));
 assert.match(widget,/onStatus:function\(info\)/);
 assert.match(widget,/retryFailedAudio\(\)/);
 assert.match(widget,/play\.disabled=false;\s*host\.dataset\.audioMode="stage-only"/);
 assert.equal(p.dependents,'$:/plugins/huwiki/cutout $:/plugins/huwiki/abc');
 assert.doesNotMatch(p.dependents,/\/music(?:\s|$)/);
});
test('AniMus demo revalidates its current manifest and the sound plugin',async()=>{
 const demo=await read('demo/demo.mjs');
 const html=await read('demo/index.html');
 assert.match(demo,/isEditionManifest/);
 assert.match(demo,/isAniMusAudioPlugin/);
 assert.match(demo,/isAbcAudioPlugin/);
 assert.match(demo,/isAniMusScriptExample/);
 assert.match(demo,/isCutoutEditorPlugin/);
 assert.match(demo,/cache:'no-store'/);
 assert.match(html,/allow="autoplay;/);
 assert.match(html,/demo\.mjs\?v=animus-presentation-20261117/);
});

test('ABC fallback uses hosted audio resources for public blob HTTPS demos',async()=>{
 const abc=JSON.parse(await read('plugins/abc/dist/plugin.json'));
 const source=JSON.parse(abc.text).tiddlers['$:/plugins/huwiki/abc/reserve-runtime.js'].text;
 new Script(source,{filename:'abc/reserve-runtime.js'});
 function sourceFor(page,online=true,config=''){
  const exports={};
  runInNewContext(source,{exports,require(){return {};},URL,
   document:{baseURI:page},navigator:{onLine:online}});
  return exports.sourceFor(config?{base:config}:{});
 }
 const demo=sourceFor('blob:https://forge.måns.dk/07f3-123');
 assert.equal(demo.mode,'hosted');
 assert.match(demo.base,/^https:\/\/cdn\.jsdelivr\.net\//);
 assert.equal(sourceFor('https://forge.måns.dk/demo/').mode,'hosted');
 assert.equal(sourceFor('blob:http://localhost:8080/123').mode,'local');
 assert.equal(sourceFor('blob:null/123').mode,'local');
 assert.equal(sourceFor('file:///Users/example/score.html').mode,'local');
 assert.equal(sourceFor('blob:https://forge.måns.dk/07f3-123',false).mode,'local');
 assert.equal(sourceFor('blob:https://forge.måns.dk/07f3-123',true,'https://example.test/av/').mode,'local');
});

test('No forced backing instruments or metronome when AniMus ABC score has accompaniment off',async()=>{
 const p=JSON.parse(await read('plugins/musical/dist/plugin.json'));
 const score=JSON.parse(p.text).tiddlers['$:/plugins/huwiki/musical/widget.js'].text;
 assert.match(score,/Accompaniment\.prepare\(ABC,song\.tune,song\.source,song\.config,song\.config\.enabled===true,song\.fields\)/);
 assert.doesNotMatch(score,/Accompaniment\.prepare\(ABC,song\.tune,song\.source,song\.config,true,song\.fields\)/);
 assert.match(score,/c\.start-t<=20/);
 for(const path of ['plugins/animus-example-orchestra/dist/plugin.json','plugins/animus-example-fyrtoejet/dist/plugin.json']){
  const examples=JSON.parse(JSON.parse(await read(path)).text).tiddlers;
  const scoreTiddlers=Object.values(examples).filter(t=>t['abc-source']);
  assert.ok(scoreTiddlers.length>=2,path);
  for(const t of scoreTiddlers){
   const stored=String(t['abc-accompaniment']||'').trim();
   const config=stored.startsWith('{')?JSON.parse(stored):{};
   assert.notEqual(config.enabled,true,t.title+' must use only its written notes');
  }
 }
});

