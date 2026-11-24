import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const dir=new URL('../editions/silba-atno-repertoire/tiddlers/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,dir),'utf8'));
const songs=await read('songs.json'),scores=await read('repertoire.json'),pending=await read('pending.json'),workspace=await read('repertoire-workspace.json');
test('library pieces have independent titles and orchestra posts resolve to the shared originals',()=>{
 const library=new Map([...scores,...pending].map(t=>[t.title,t]));
 assert.equal(library.size,21);assert.ok(library.has('Purim Niggun'));
 assert.ok(songs.every(t=>!t.title.startsWith('SilbaÄtno · ')));
 assert.ok([...library.keys()].every(t=>!t.startsWith('SilbaÄtno · ')));
 for(const item of workspace.filter(t=>t['repertoire-kind']==='orchestra-item')){
  assert.ok(library.has(item['music-title']),item['music-title']);
  assert.equal(item.title,'Repertoire/Poster/'+encodeURIComponent(item['orchestra-title'])+'/'+encodeURIComponent(item['music-title']));
  assert.equal(item['abc-source'],undefined);
 }
 const set=workspace.find(t=>t['repertoire-kind']==='setlist');
 for(const item of workspace.filter(t=>t['repertoire-kind']==='orchestra-item'))assert.ok(set.list.includes('[['+item.title+']]'));
});
test('old deep links resolve to the neutral title without creating duplicate or prefixed scores',async()=>{
 const script=(await read('config.json')).find(t=>t['module-type']==='startup');
 const exports={},records=new Set(['Purim Niggun']),listeners=[];let story=['SilbaÄtno · Purim Niggun'];
 runInNewContext(script.text,{exports,$tw:{wiki:{
  getTiddlerList:()=>story,tiddlerExists:t=>records.has(t),setText(_t,_f,_i,list){story=list;},
  addEventListener(_name,fn){listeners.push(fn);}
 }}});
 exports.startup();assert.deepEqual(Array.from(story),['Purim Niggun']);
 records.add('SilbaÄtno · Purim Niggun');story=['SilbaÄtno · Purim Niggun'];listeners[0]({'$:/StoryList':true});
 assert.equal(story[0],'SilbaÄtno · Purim Niggun','never redirect over an existing user tiddler');
});
