import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {get} from 'node:http';
import {start,convert} from '../tools/slideshow-converter/server.mjs';
import {translateSource} from '../scripts/creative-language.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8'),json=async p=>JSON.parse(await read(p));
const original=async name=>{const data=JSON.parse(gunzipSync(Buffer.from((await read('migration/creative/'+name+'.b64')).trim(),'base64')));return Array.isArray(data)?data[0]:data;};
const plugin=async name=>json('plugins/'+name+'/dist/plugin.json');
const rows=p=>JSON.parse(p.text).tiddlers;
test('Every recovered creative source matches the recorded decompressed SHA-256 and size',async()=>{
 const record=await json('migration/creative/provenance.json');for(const[name,entry]of Object.entries(record.bundles)){const data=gunzipSync(Buffer.from((await read('migration/creative/'+name+'.b64')).trim(),'base64'));assert.equal(data.length,entry.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256,name);}
});
test('Original Slideshow vendors and all seven example data sets remain unchanged',async()=>{
 const before=rows(await original('slideshow')),after=rows(await plugin('slideshow'));let vendors=0,examples=0;
 for(const[title,t]of Object.entries(before))if(title.includes('/vendor/')||t['huwiki-example-resource']==='yes'&&t.type==='application/json'){assert.deepEqual(after[title],t,title);if(title.includes('/vendor/'))vendors++;else examples++;}
 assert.ok(vendors>=5);assert.ok(examples>=7);
});
test('CutOut examples retain every original resource except the obsolete setting and duplicate Studio wrapper',async()=>{
 const before=await original('cutout-pages'),after=rows(await plugin('cutout-examples'));for(const[title,t]of Object.entries(before))if(!['$:/config/itw/tw-excalidraw/Language','HUWiki CutOut – Studio'].includes(title))assert.deepEqual(after[title],t,title);
 assert.ok(Object.keys(after).length>350);
});
test('Original licenses/authors remain intact; absent top-level licenses are not invented',async()=>{
 for(const name of ['slideshow','pasteup','theatre','cutout-excalidraw']){const a=await original(name),b=await plugin(name);assert.equal(a.author,b.author);assert.equal(a.license,b.license);for(const[title,t]of Object.entries(rows(a)))if(/license/i.test(title))assert.deepEqual(rows(b)[title],t);}
 assert.equal((await plugin('pasteup')).license,'CC-BY-NC-SA-4.0');
});
test('Non-vendor creative modules compile without executable Google dependencies or stray translation placeholders',async()=>{
 for(const name of ['slideshow','pasteup','theatre','cutout-excalidraw','cutout-examples'])for(const[title,t]of Object.entries(rows(await plugin(name)))){
  assert.doesNotMatch(t.text||'',/[\uE000\uE001]/,title);
  if(t.type==='application/javascript'&&!title.includes('/vendor/')){new vm.Script(t.text,{filename:title});assert.doesNotMatch(t.text,/google\.script|DriveApp\.|HUDriveApp\.|UrlFetchApp\./,title);}
 }
});
test('Native Slideshow translation changes only static UI literals and follows $:/language',async()=>{
 const strings=await read('plugins/slideshow/src/strings.json');let language='$:/languages/en-GB';const c={exports:{},$tw:{wiki:{getTiddlerText:title=>title==='$:/language'?language:strings}}};vm.runInNewContext(await read('plugins/slideshow/src/i18n.js'),c);const t=c.exports.t;
 assert.equal(t('Gem præsentation'),'Save presentation');assert.equal(t(' Mit eget æøå '),' Mit eget æøå ');
 assert.equal(t('<button title="Gem præsentation">Gem præsentation</button>'),'<button title="Save presentation">Save presentation</button>');
 language='$:/languages/da-DK';assert.equal(t('Gem præsentation'),'Gem præsentation');
});
test('WikiText source translation preserves canonical links, paths and macro placeholders',()=>{
 const text='[[Gem|Min Gem tiddler]] <$text text="$:/temp/HUWiki/PasteUp/$(pasteUpData)$"/> Gem';
 const result=translateSource(text,{Gem:'Save',PasteUp:'wrong'},['Min Gem tiddler','PasteUp']);assert.equal(result,'[[Save|Min Gem tiddler]] <$text text="$:/temp/HUWiki/PasteUp/$(pasteUpData)$"/> Save');
});
test('Local converter requires a session code and local Host; optional health endpoint works',async()=>{
 const {server,url,token}=await start({port:0});try{
  assert.equal((await fetch(url+'/health')).status,401);
  const headers={Authorization:'Bearer '+token};const health=await fetch(url+'/health',{headers});assert.equal(health.status,200);assert.equal((await health.json()).service,'huwiki-local-office');
  assert.equal(await new Promise((resolve,reject)=>get(url+'/health',{headers:{...headers,Host:'remote.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject)),403);
  const invalid=await fetch(url+'/convert',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'bad.exe',base64:'eA=='})});assert.equal(invalid.status,400);assert.match((await invalid.json()).error,/Unsupported/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Local converter rejects unsupported, malformed and oversized documents before launching Office',async()=>{
 for(const input of [{name:'x.exe',base64:'eA=='},{name:'x.docx',base64:'bad*data'},{name:'x.docx',base64:''},{name:'x.docx',base64:'A'.repeat(29e6)}])await assert.rejects(convert(input,{binary:'must-not-run'}),/Unsupported|Invalid|between/);
});
