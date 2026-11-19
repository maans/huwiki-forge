import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadChoices,composeWiki} from '../assembler/compose.mjs';

const root=new URL('../',import.meta.url);
const fetcher=async url=>{
 const value=JSON.parse(await readFile(new URL('.'+new URL(url).pathname,root),'utf8'));
 return {ok:true,json:async()=>value};
};

test('canonical Turn Around default composition includes audience and native-editor export without preview overlays',async()=>{
 const choices=await loadChoices('https://forge.example/assembler/',fetcher);
 const {manifest,tiddlers,added}=await composeWiki({choices,editionId:'turn-around',language:'da-DK'},fetcher);
 const byTitle=new Map(tiddlers.map(t=>[t.title,t]));
 assert.equal(manifest.id,'turn-around');
 assert.equal(byTitle.get('$:/language')?.text,'$:/languages/da-DK');
 assert.equal(byTitle.get('$:/DefaultTiddlers')?.text,'[[Turn Around]]');
 assert.match(byTitle.get('$:/StoryList')?.list||'',/\[\[Turn Around\]\]/);
 assert.match(byTitle.get('Turn Around')?.text||'',/<\$plato-player\b/);
 assert.match(byTitle.get('Turn Around · AniMus')?.text||'',/<\$plato-studio\b/);
 const exporter=byTitle.get('$:/plugins/huwiki/animus-video-export');
 assert.equal(exporter?.['plugin-type'],'plugin','exporter is bundled by the public Edition manifest');
 assert.ok(JSON.parse(exporter.text).tiddlers['$:/plugins/huwiki/animus-video-export/runtime.js']);
 const adapter=byTitle.get('$:/plugins/maans/plato/video-export.js');
 assert.equal(adapter?.['module-type'],'startup','audience export adapter is part of the default composition');
 const musical=byTitle.get('$:/plugins/huwiki/musical');
 assert.ok(JSON.parse(musical.text).tiddlers['$:/plugins/huwiki/musical/widget.js']);
 for(const packageTitle of [exporter.title,musical.title]){
  assert.equal(byTitle.get(packageTitle).version,choices.packages.find(p=>p.title===packageTitle)?.version,'default recipe and public plugin registry agree');
  assert.ok(!added.some(p=>p.title===packageTitle),'no manually selected package is needed for '+packageTitle);
 }
 const film=JSON.parse(byTitle.get('Turn Around · Complete performance (film)').text);
 assert.equal(film.duration,481.377);
 assert.equal(film.scenes.length,14);
 assert.ok(film.musical.songs.every(song=>song.muted),'written guide scores do not replace the recorded soundtrack');
});

test('ordinary AniMus Edition also includes the same reusable exporter by default',async()=>{
 const choices=await loadChoices('https://forge.example/assembler/',fetcher);
 const {tiddlers,added}=await composeWiki({choices,editionId:'animus',language:'en-GB'},fetcher);
 const exporters=tiddlers.filter(t=>t.title==='$:/plugins/huwiki/animus-video-export');
 assert.equal(exporters.length,1);
 assert.equal(exporters[0].version,choices.packages.find(p=>p.title===exporters[0].title)?.version);
 assert.ok(!added.some(p=>p.title===exporters[0].title));
});

test('previous export preview links open the canonical demo and retain language and tiddler location',async()=>{
 const html=await readFile(new URL('../previews/animus-export/index.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 for(const language of ['da','en','unexpected',null]){
  let destination;
  const url=new URL('https://forge.example/previews/animus-export/');
  if(language)url.searchParams.set('lang',language);
  url.hash='Turn%20Around';
  vm.runInNewContext(script,{URL,location:{href:url.href,replace:value=>{destination=new URL(value);}}});
  assert.equal(destination.origin,url.origin);
  assert.equal(destination.pathname,'/demo/');
  assert.equal(destination.searchParams.get('edition'),'turn-around');
  assert.equal(destination.searchParams.get('lang'),['da','en'].includes(language)?language:null);
  assert.equal(destination.hash,url.hash);
 }
});
