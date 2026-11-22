import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../plugins/musical/src/asset-library.js',import.meta.url),'utf8');
class Tiddler{constructor(...x){this.fields=Object.assign({},...x.map(t=>t?.fields||t));}}
function api(){const exports={};vm.runInNewContext(code,{exports,$tw:{Tiddler},DataView,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),Date,JSON,Number,AbortController});return exports;}
function wiki(initial=[]){const rows=new Map(initial.map(x=>[x.title,new Tiddler(x)]));return {rows,getTiddler:t=>rows.get(t),getTiddlerText:(t,f)=>rows.get(t)?.fields.text??f,getTiddlersWithTag:t=>[...rows].filter(([,x])=>(x.fields.tags||'').includes(t)).map(([t])=>t),addTiddler:t=>rows.set(t.fields.title,t),generateNewTitle:t=>t+' 2'};}
const entry={id:'apple',name:'Apple',category:'prop',collection:'glitch',author:'Tiny Speck',license:'CC0-1.0',source:'https://github.com/tinyspeck/glitch-items',keywords:'food',assets:[{id:'apple',url:'https://raw.githubusercontent.com/example/pinned/apple.png',mime:'image/png',width:20,height:30}],grip:{x:.5,y:.65}};
const png=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(20,16);png.writeUInt32BE(30,20);
const response=()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>png.buffer.slice(png.byteOffset,png.byteOffset+png.length)});
test('Danish search and independent background category',()=>{const a=api(),bg={...entry,id:'forest',name:'Forest background',category:'background'},tree={...entry,id:'tree',name:'Tree',category:'scenery'};assert.equal(a.search([entry,bg,tree],'æble','','').length,1);assert.equal(a.search([entry,bg,tree],'træ','scenery','')[0].id,'tree');assert.equal(a.search([entry,bg,tree],'baggrund','background','')[0].id,'forest');assert.equal(a.search([entry,bg,tree],'','background','').length,1);});
test('Import stores only selected dependencies with provenance and reuses them offline',async()=>{const a=api(),w=wiki();let requests=0;const item=await a.importEntry(w,entry,{fetcher:async()=>{requests++;return response();}});assert.equal(requests,1);assert.equal(w.rows.size,2);assert.equal(w.getTiddler(item.assets[0].title).fields['animus-author'],'Tiny Speck');await a.importEntry(w,entry,{fetcher:async()=>{throw Error('offline');}});assert.equal(requests,1);assert.equal(w.rows.size,2);});
test('A failed second dependency leaves no partial library item',async()=>{const a=api(),w=wiki();let n=0;await assert.rejects(a.importEntry(w,{...entry,assets:[...entry.assets,{...entry.assets[0],id:'second'}]},{fetcher:async()=>{if(n++)throw Error('network');return response();}}),/network/);assert.equal(w.rows.size,0);});
test('Background goes behind existing figures; props attach to an existing hand',()=>{const a=api(),s={width:960,height:540,parts:[{id:'actor',type:'group'},{id:'hand',parent:'actor',type:'group'}]},local={...entry,assets:[{...entry.assets[0],title:'image'}]};const bg=a.place(s,{...local,category:'background'},{});assert.equal(bg.scene.parts[0]['animus-library-id'],'apple');assert.equal(bg.scene.parts[1].id,'actor');const prop=a.place(s,local,{parent:'hand'}).scene.parts.at(-1);assert.equal(prop.parent,'hand');assert.equal(prop.keys[0].x,0);assert.equal(s.parts.length,2);assert.throws(()=>a.place(s,local,{parent:'missing'}),/Attachment/);});
test('Articulated figures preserve hierarchy, crops and unique identities',()=>{const a=api(),local={...entry,category:'figure',assets:[{...entry.assets[0],title:'image'}],parts:[{id:'root',type:'group',keys:[]},{id:'arm',parent:'root',type:'image',asset:'apple',geo:{crop:{x:1,y:2,w:3,h:4,sourceWidth:20,sourceHeight:30}},keys:[]}]};const first=a.place({parts:[]},local).scene;const second=a.place(first,local).scene;assert.equal(new Set(second.parts.map(p=>p.id)).size,4);assert.equal(second.parts[1].parent,second.parts[0].id);assert.equal(second.parts[1].asset,'image');assert.equal(second.parts[1].geo.crop.x,1);});
test('Malformed image responses and external source URLs are rejected',async()=>{const a=api(),w=wiki();await assert.rejects(a.importEntry(w,{...entry,assets:[{...entry.assets[0],url:'http://example.com/a.png'}]},{fetcher:async()=>response()}),/Unsupported/);await assert.rejects(a.importEntry(w,entry,{fetcher:async()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>new ArrayBuffer(24)})}),/PNG/);assert.equal(w.rows.size,0);});
test('Starting from a template keeps the original and creates independent project sources',()=>{const exported={},w=wiki([{title:'sample',text:JSON.stringify({version:1,id:'sample',kind:'animation',width:960,height:540,duration:16,parts:[{id:'actor',type:'group',keys:[{t:0,x:10}]}]})}]);vm.runInNewContext(fs.readFileSync(new URL('../plugins/musical/src/projects.js',import.meta.url),'utf8'),{exports:exported,$tw:{Tiddler},require:name=>name.includes('widgets/widget')?{widget:function(){}}:name.includes('scenes.js')?{blankScene(){throw Error('template expected');}}:{},Date,Math});const original=w.getTiddlerText('sample');const result=exported.create(w,'My film','sample');const stage=JSON.parse(w.getTiddlerText(result.stageTitle));stage.parts[0].keys[0].x=99;w.addTiddler(new Tiddler({title:result.stageTitle,text:JSON.stringify(stage)}));assert.equal(w.getTiddlerText('sample'),original);assert.equal(JSON.parse(w.getTiddlerText(result.filmTitle)).width,960);assert.notEqual(stage.id,'sample');});

test('a production item downloads its model and own dependencies once, then works offline',async()=>{
 const a=api(),w=wiki(),urls=[];const item={...entry,id:'production-test',modelUrl:'https://forge.xn--mns-ula.dk/assets/animus/models/test.json'};
 const model={parts:[{id:'root',type:'group'},{id:'arm',parent:'root',type:'image',asset:'apple'}]};
 const local=await a.importEntry(w,item,{fetcher:async url=>{urls.push(url);return url===item.modelUrl?{ok:true,text:async()=>JSON.stringify(model)}:response();}});
 assert.deepEqual(urls,[item.modelUrl,item.assets[0].url]);assert.equal(local.parts[1].parent,'root');
 const reused=await a.importEntry(w,item,{fetcher:async()=>{throw Error('offline');}});assert.equal(reused.parts.length,2);
 const placed=a.place({parts:[]},reused).scene;assert.equal(placed.parts[1].parent,placed.parts[0].id);
});
test('vector props need only their model, without fake image downloads',async()=>{
 const a=api(),w=wiki(),model={parts:[{id:'table',type:'path',geo:{d:'M0 0h80v10H0z'},keys:[{t:0}]}]},item={...entry,id:'production-table',assets:[],modelUrl:'https://forge.xn--mns-ula.dk/assets/animus/models/table.json'};
 let calls=0;const local=await a.importEntry(w,item,{fetcher:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify(model)};}});assert.equal(calls,1);assert.equal(w.rows.size,1);assert.equal(a.place({parts:[]},local).scene.parts[0].type,'path');
});
test('a missing or malformed production model leaves no partial imported item',async()=>{
 const a=api(),w=wiki(),item={...entry,id:'production-bad',assets:[],modelUrl:'https://forge.xn--mns-ula.dk/assets/animus/models/bad.json'};
 await assert.rejects(a.importEntry(w,item,{fetcher:async()=>({ok:true,text:async()=>JSON.stringify({parts:[]})})}),/Invalid material/);assert.equal(w.rows.size,0);
});

test('a downloaded audio effect is reusable offline and inserts only on the effects lane',async()=>{
 const a=api(),w=wiki(),wav=Buffer.alloc(48);wav.write('RIFF',0);wav.write('WAVE',8);
 const item={...entry,id:'wood-audio',name:'Wood creak',category:'sound',duration:.8,icon:'🪵',assets:[{id:'wood-audio',url:'https://forge.xn--mns-ula.dk/assets/animus/files/audio/wood.wav',mime:'audio/wav'}]};
 const local=await a.importEntry(w,item,{fetcher:async()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.length)})});
 const stored=w.getTiddler(local.assets[0].title).fields;assert.equal(stored.type,'audio/wav');assert(stored.tags.includes('AudioEffect'));
 const film={duration:10,parts:[],musical:{songs:[{id:'song'}],sfx:[{id:'midi'}],audioClips:[{id:'speech',kind:'speech'}]}};
 const placed=a.placeSound(film,local,3);assert.equal(placed.musical.audioClips.at(-1).kind,'effects');assert.equal(placed.musical.audioClips.at(-1).start,3);assert.deepEqual(placed.musical.songs,film.musical.songs);assert.deepEqual(placed.musical.sfx,film.musical.sfx);assert.equal(film.musical.audioClips.length,1);
 await a.importEntry(w,item,{fetcher:async()=>{throw Error('offline');}});
});

test('Kenney props are picked individually and neither the starter scene nor the puppet inserts them',()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../plugins/animus-starter-kenney/dist/plugin.json',import.meta.url),'utf8'));
 const items=JSON.parse(pkg.text).tiddlers;
 const scene=JSON.parse(items[pkg.title+'/template'].text);
 const item=id=>JSON.parse(items[pkg.title+'/items/'+id].text);
 const props=['glitch-food-apple-apple','glitch-tools-hatchet-class-axe-class-axe'].map(item);
 const propImages=props.map(prop=>prop.assets[0].title);
 const library=api();
 const withPuppet=library.place(scene,item('kenney-female-person'),{}).scene;
 assert(!withPuppet.parts.some(part=>propImages.includes(part.asset)));
 for(const prop of props){
  const placed=library.place(withPuppet,prop,{}).scene;
  assert.equal(placed.parts.length,withPuppet.parts.length+1);
  assert.equal(placed.parts.at(-1).asset,prop.assets[0].title);
 }
});
