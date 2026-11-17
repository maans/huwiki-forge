import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

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
 assert.match(demo,/cache:'no-store'/);
 assert.match(html,/allow="autoplay;/);
 assert.match(html,/demo\.mjs\?v=animus-audio-20261117/);
});
