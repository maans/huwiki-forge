import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEdition} from '../assembler/assemble.mjs';

const root=new URL('../',import.meta.url);
const fetchLocal=async address=>({ok:true,json:async()=>JSON.parse(await readFile(new URL(new URL(address).pathname.slice(1),root),'utf8'))});

test('Theseus fourteen-scene production assembles in both languages without external media',async()=>{
 const {manifest,tiddlers}=await loadEdition('https://forge.example/editions/theseus-ship/manifest.json',fetchLocal);
 assert.equal(manifest.id,'theseus-ship');assert.equal(manifest.version,'0.2.0-beta.1');
 const wiki=new Map(tiddlers.map(t=>[t.title,t]));assert.equal(wiki.size,tiddlers.length);
 assert(!wiki.has('Turn Around'));
 const front=wiki.get('Theseus’ skib — Det, vi bærer videre');assert.match(front.text,/<\$animus-language-player/);assert(!/Arbejdsudgave|timing|teknisk/i.test(front.text));
 let speech=0,songs=0,captionLines=0,duets=0;
 for(const language of ['da','en']){
  const film=JSON.parse(wiki.get('Theseus II · Film'+(language==='en'?' · English':'')).text);
  assert.equal(film.scenes.length,14);assert(film.duration>500);
  let offset=0;
  for(const clip of film.scenes){
   const scene=JSON.parse(wiki.get(clip.source).text),parts=new Map(scene.parts.map(p=>[p.id,p]));
   assert.equal(parts.size,scene.parts.length);assert(parts.size<=300);
   const foreground=scene.parts.findIndex(p=>p.id==='harbour-foreground');assert(foreground>=0);
   for(const id of ['continued-ship','rebuilt-ship'])if(parts.has(id))assert(scene.parts.findIndex(p=>p.id===id)<foreground);
   for(const id of ['mara','pip','ione'])assert(scene.parts.findIndex(p=>p.id===id)>foreground);
   for(const part of scene.parts){if(part.parent)assert(parts.has(part.parent));if(part.asset)assert.match(wiki.get(part.asset)?.type||'',/^image\//);}
   for(const cue of scene.songCaptionCues||[]){
    captionLines++;assert(cue.end>cue.start);const part=parts.get(cue.id);assert(part.lipSync.enabled);
    assert(part.lipSync.visemes.some(v=>v.open>0));
    if(cue.speaker==='Mara & Pip'){duets++;assert.deepEqual(part.lipSync.targets,['mara','pip']);}
   }
   offset+=clip.duration;
  }
  assert(Math.abs(offset-film.duration)<.001);
  for(const take of film.musical.audioClips){const audio=wiki.get(take.asset);assert.equal(audio?.type,'audio/mpeg');assert(Buffer.from(audio.text,'base64').length>100);if(take.kind==='song')songs++;else if(take.kind==='speech')speech++;}
  const guides=film.musical.songs.filter(s=>wiki.get(s.score)?.['animus-cue-score']);assert.equal(guides.length,14);
  for(const guide of guides){assert.equal(guide.muted,true);assert.equal(guide.volume,0);}
 }
 assert.equal(speech,206);assert.equal(songs,4);assert.equal(captionLines,67);assert.equal(duets,20);
});

test('Theseus production files have content-specific cache keys and string-only tiddler fields',async()=>{
 const manifest=JSON.parse(await readFile(new URL('editions/theseus-ship/manifest.json',root),'utf8'));
 for(const reference of manifest.tiddlers.filter(p=>p.startsWith('tiddlers/'))){assert.match(reference,/\?v=[a-f0-9]{12}$/);const rows=JSON.parse(await readFile(new URL(new URL(reference,'https://forge.example/editions/theseus-ship/').pathname.slice(1),root),'utf8'));for(const row of rows)for(const value of Object.values(row))assert.equal(typeof value,'string');}
});
