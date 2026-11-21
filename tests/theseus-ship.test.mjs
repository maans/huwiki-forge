import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEdition} from '../assembler/assemble.mjs';

const root=new URL('../',import.meta.url);
const fetchLocal=async address=>{
 const bytes=await readFile(new URL(new URL(address).pathname.slice(1),root),'utf8');
 return {ok:true,json:async()=>JSON.parse(bytes)};
};

test('the independent Theseus edition plays and edits the same bilingual musical',async()=>{
 const {manifest,tiddlers}=await loadEdition('https://forge.example/editions/theseus-ship/manifest.json',fetchLocal);
 const wiki=new Map(tiddlers.map(t=>[t.title,t]));
 const filmRow=tiddlers.find(t=>t['cutout-kind']==='theatre');
 const film=JSON.parse(filmRow.text);
 assert.equal(manifest.id,'theseus-ship');
 assert.deepEqual(tiddlers.filter(t=>t['cutout-kind']==='theatre').map(t=>t.title),[filmRow.title]);
 assert.ok(!wiki.has('Turn Around'));
 const start=wiki.get('$:/DefaultTiddlers').text.slice(2,-2);
 assert.ok(wiki.get(start).text.includes('<$plato-player film="'+filmRow.title+'"'));
 assert.ok(tiddlers.some(t=>t.text.includes('<$musical-stage scene="'+filmRow.title+'"')));
 const translation=JSON.parse(tiddlers.find(t=>t.tags==='$:/tags/HUW/CaptionTranslations').text);
 assert.equal(translation.sourceTiddler,filmRow.title);
 assert.equal(translation.targetLanguage,'da');
 let offset=0,sung=0,dialogue=0;
 for(const clip of film.scenes){
  const scene=JSON.parse(wiki.get(clip.source).text);
  const parts=new Map(scene.parts.map(p=>[p.id,p]));
  assert.equal(parts.size,scene.parts.length);
  assert.ok(parts.size<=300,'within CutOut renderer limit');
  for(const p of scene.parts){
   if(p.parent)assert.ok(parts.has(p.parent),p.parent);
   if(p.asset)assert.equal(wiki.get(p.asset)?.type,'image/webp');
  }
  const takes=film.musical.audioClips.filter(a=>a.sceneTitle===clip.source);
  assert.ok(takes.some(t=>t.kind==='music'));
  for(const take of takes){
   const audio=wiki.get(take.asset);
   assert.equal(audio?.type,'audio/mpeg');
   assert.ok(Buffer.from(audio.text,'base64').length>100);
   assert.ok(take.start>=offset-.001 && take.start+take.duration<=offset+clip.duration+.001);
   if(!take.cueId)continue;
   const cue=parts.get(take.cueId),entry=translation.entries[scene.id][cue.id];
   assert.equal(entry.source,take.text);
   assert.ok(entry.text && entry.text!==entry.source);
   assert.ok(cue.text.endsWith(entry.source));
   assert.ok(Math.abs(cue.keys[1].t+offset-take.start)<.001);
   assert.ok(parts.has(cue.lipSync.target)&&parts.has(cue.lipSync.open)&&parts.has(cue.lipSync.closed));
   if(take.kind==='song')sung++;else dialogue++;
  }
  const score=film.musical.songs.find(t=>Math.abs(t.start-offset)<.001);
  assert.match(wiki.get(score.score)['abc-source'],/%%score/);
  offset+=clip.duration;
 }
 assert.ok(dialogue>=12 && sung>=8);
 assert.ok(offset<120 && Math.abs(offset-film.duration)<.001);
});
