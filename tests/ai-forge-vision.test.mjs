import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Script,runInNewContext} from 'node:vm';

const root=new URL('../plugins/ai/',import.meta.url);
async function source(name){return JSON.parse(await readFile(new URL('src/'+name+'.json',root),'utf8'));}
async function bundle(){return JSON.parse(await readFile(new URL('dist/plugin.json',root),'utf8'));}
const localImageId='123e4567-e89b-12d3-a456-426614174000';
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]).toString('base64');

test('AI Forge source modules compile and distributable bundle matches source tiddlers',async()=>{
 const files=(await readdir(new URL('src/',root))).filter(n=>n.endsWith('.json')).sort();
 const built=await bundle(),included=JSON.parse(built.text).tiddlers;
 const meta=JSON.parse(await readFile(new URL('plugin-info.json',root),'utf8'));
 const edition=JSON.parse(await readFile(new URL('../editions/ai/manifest.json',import.meta.url),'utf8'));
 assert.equal(built.version,meta.version);
 assert.equal(edition.version,meta.version);
 assert.equal(Object.keys(included).length,files.length);
 for(const file of files){
   const t=await source(file.slice(0,-5));
   assert.deepEqual(included[t.title],t,'dist mismatch: '+file);
   if(t['module-type'])assert.doesNotThrow(()=>new Script(t.text,{filename:file}));
 }
});

test('AI Forge forwards screenshot attachments and reports missing image generation separately',async()=>{
 const module=await source('forgeshare.js'),requests=[];
 const exports={};
 runInNewContext(module.text,{exports,$tw:{wiki:{getTiddlerText:()=>'$:/languages/huwiki-da-DK'}},
   window:{location:{protocol:'https:'}},
   fetch:async(url,request)=>{requests.push({url,body:JSON.parse(request.body)});
     return {ok:true,json:async()=>({ok:true,content:'Billedanalyse klar'})};}
 });
 const image={mimeType:'image/png',data:png};
 await exports.rpc('huPrivateVaultAiGenerate',{consent:true,connectionId:'local-ai',model:'google/gemma-4-e4b',
   messages:[{role:'user',content:'Beskriv'}],images:[image]});
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/_forgeshare/bridge/generate');
 assert.equal(requests[0].body.images[0].data,png);
 assert.equal(requests[0].body.consent,true);
 await assert.rejects(exports.rpc('huPrivateVaultAiGenerateImage',{consent:true}),/Billedgenerering/);
});

test('image references use approved local media, not Google Apps Script or Drive',async()=>{
 const t=await source('image-replies.js'),ops=[],exports={};
 const mocks={
  '$:/plugins/huwiki/ai/i18n.js':{choose:(da)=>da,text:s=>s},
  '$:/plugins/huwiki/ai/forgeshare.js':{call:async(op,payload)=>{
    ops.push({op,payload});return {ok:true,id:localImageId,mimeType:'image/png',data:png};}}
 };
 runInNewContext(t.text,{exports,require:id=>mocks[id],Map,Promise,Buffer});
 const fields=exports.referenceFields('Testbillede',{id:localImageId,mimeType:'image/png'},['Billede'],'chat','message');
 assert.equal(fields['ai-media-id'],localImageId);
 assert.equal(fields['av-file-id'],undefined);
 assert.doesNotMatch(JSON.stringify(fields),/google\.com|base64|drive/i);
 const refs=exports.references({imageRefs:JSON.stringify([{title:'Testbillede',mediaId:localImageId,mimeType:'image/png',index:0}])});
 assert.equal(refs.length,1);
 const url=await exports.loadSavedImage(refs[0]);
 assert.equal(url,'data:image/png;base64,'+png);
 assert.deepEqual(ops.map(x=>x.op),['media-get']);
 const legacy=exports.references({imageRefs:JSON.stringify([{title:'Gammelt',fileId:'old-drive-abcdef',mimeType:'image/png',index:0}])});
 assert.equal(legacy.length,1,'old Drive references remain readable as metadata');
 assert.doesNotMatch(t.text,/google\.script|huGetAvPlayback|huSaveAvMedia|huGetAvConsent/);
});

test('screenshot UI retains image on retry or explicitly rejects a text-only retry',async()=>{
 const chat=(await source('chat-library-widget.js')).text;
 assert.match(chat,/self\.makeChatRequest\(true\)/);
 assert.match(chat,/loadSavedImage\(ref\)/);
 assert.match(chat,/Det oprindelige billede var kun midlertidigt/);
 assert.doesNotMatch(chat,/ikke gemt i AV/);
 assert.match(chat,/Gem billedet lokalt/);
});
