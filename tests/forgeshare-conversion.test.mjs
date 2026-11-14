import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir,rename,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {assembleHtml} from '../assembler/assemble.mjs';
import {addLibraryEntry,listLibrary,prepareHTML,convertHTMLWorker,dialogCommand,libraryMain,startWiki,stopChild,trashHTML} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require=createRequire(import.meta.url),boot=require.resolve('tiddlywiki/boot/boot.js');
const core=await readFile(new URL('../core/empty.html',import.meta.url),'utf8');
let temp;test.before(async()=>{temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-convert-')));});
test.after(async()=>rm(temp,{recursive:true,force:true}));
const records=[{title:'Song æ',text:'Music & notes',tags:'[[Music book]]',created:'20260102030405000',custom:'value'},
 {title:'Cover.png',type:'image/png',text:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII='},
 {title:'$:/plugins/test/preserved','plugin-type':'plugin',type:'application/json',version:'1.0.0',text:JSON.stringify({tiddlers:{'A shadow':{title:'A shadow',text:'Plugin content'}}})}];
async function fixture(label,extension='html',extra=[]) {
 const dir=path.join(temp,label);await mkdir(dir);const location=path.join(dir,'Music.'+extension),root=path.join(dir,'settings');
 await writeFile(location,assembleHtml(core,[...records,...extra]));
 const entry=await addLibraryEntry({root,location,kind:'html',name:'Music',description:'My music'});
 return {root,id:entry.id,boot,location,dir};
}
test('HTML picker does not depend on Finder type or extension case',async()=>{
 const command=dialogCommand('darwin','file','Choose');assert.doesNotMatch(command[1].join(' '),/of type/);
 for(const ext of ['html','Html','HTML','htm'])assert.equal((await fixture('case-'+['html','Html','HTML','htm'].indexOf(ext),ext)).id.length,36);
});
test('conversion keeps IDs, fields, embedded images and plugins; verified server can read and save; original moved only after commit',async()=>{
 const f=await fixture('complete');let trashed=false;
 const result=await prepareHTML(f,{trash:async file=>{
   const lib=await listLibrary(f.root);assert.equal(lib.entries.length,1);assert.equal(lib.entries[0].kind,'folder');
   assert.ok((await readdir(path.join(lib.entries[0].location,'tiddlers'))).length>=records.length);
   await rename(file,file+'.test-trash');trashed=true;
 }});
 assert.equal(trashed,true);assert.equal(result.originalKept,false);assert.equal(result.entry.id,f.id);assert.equal(result.entry.description,'My music');
 const started=startWiki({boot,wiki:result.entry.location,port:0,allowAnonymous:true});
 try {
  const ready=await started.ready;const url='http://127.0.0.1:'+ready.port;
  for(const t of records) {const response=await fetch(url+'/recipes/default/tiddlers/'+encodeURIComponent(t.title));assert.equal(response.status,200);const loaded=await response.json();for(const [field,value] of Object.entries(t))assert.equal((loaded[field]??loaded.fields?.[field]),value,field);}
  const response=await fetch(url+'/recipes/default/tiddlers/After%20conversion',{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'TiddlyWiki'},body:JSON.stringify({title:'After conversion',text:'Saved'})});assert.equal(response.status,204);
 } finally {await stopChild(started.child);}
 const saved=(await readdir(path.join(result.entry.location,'tiddlers')));assert.ok(saved.some(file=>file.includes('After')));
});
test('failed conversion, changed source and preexisting destination never remove or replace originals',async()=>{
 for(const mode of ['failure','changed']) {
  const f=await fixture(mode),original=await readFile(f.location);
  await mkdir(f.location.replace(/\.html$/,'-server'));await writeFile(path.join(f.dir,'Music-server','keep'),'untouched');
  await assert.rejects(prepareHTML(f,{convert:async(...args)=>{if(mode==='failure')throw Error('disk full');await convertHTMLWorker(...args);await writeFile(f.location,Buffer.concat([original,Buffer.from('\n<!-- changed -->')]));},trash:async()=>assert.fail('Do not trash on failure')}));
  assert.equal((await listLibrary(f.root)).entries[0].kind,'html');assert.ok((await readFile(f.location)).subarray(0,original.length).equals(original));
  assert.equal(await readFile(path.join(f.dir,'Music-server','keep'),'utf8'),'untouched');assert.ok(!(await readdir(f.dir)).includes('Music-server-2'));
 }
});
test('trash failure leaves usable converted entry and reports retained original',async()=>{
 const f=await fixture('trash-failure');const result=await prepareHTML(f,{trash:async()=>{throw Error('no trash');}});
 assert.equal(result.originalKept,true);assert.ok((await readFile(f.location)).length>0);assert.equal((await listLibrary(f.root)).entries[0].kind,'folder');
});
test('external local attachments are rejected without loss',async()=>{
 const f=await fixture('external','html',[{title:'Outside.png',type:'image/png',_canonical_uri:'../outside.png',text:''}]);
 await assert.rejects(prepareHTML(f,{trash:async()=>assert.fail('Original must stay')}));assert.equal((await listLibrary(f.root)).entries[0].kind,'html');
});
test('share prepares HTML automatically, without a conversion questionnaire',async()=>{
 const f=await fixture('automatic');let result;
 await libraryMain('prepare',Buffer.from(JSON.stringify({ids:[f.id]})).toString('base64'),{root:f.root,findTiddlyWiki:async()=>path.dirname(path.dirname(boot)),trash:async()=>{},report:v=>{result=v;},dialog:async()=>assert.fail('No extra questions for conversion')});
 assert.equal(result.ok,true);assert.equal(result.entries[0].kind,'folder');
});
test('trash commands pass filenames as data and never permanently delete',async()=>{
 for(const platform of ['darwin','win32','linux']) {let call;await trashHTML('/path/quotes "; $(bad).html',{platform,run:async(...args)=>{call=args;}});assert.ok(call);assert.ok(!['rm','del'].includes(call[0]));}
});

test('automatic discovery lists HTML and server wikis once without starting or converting them',async()=>{
 const {discoverLibraryAutomatically}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const f=await fixture('discovery'),server=path.join(f.dir,'Server');await mkdir(server);await writeFile(path.join(server,'tiddlywiki.info'),'{}');
 const first=await discoverLibraryAutomatically(f.root,[f.dir]),second=await discoverLibraryAutomatically(f.root,[f.dir]);
 assert.equal(first.entries.length,2);assert.deepEqual(first.entries.map(e=>e.id),second.entries.map(e=>e.id));assert.equal(first.entries.find(e=>e.id===f.id).kind,'html');
 assert.ok((await readFile(f.location)).length>0);
});
test('Share uses remembered network settings and starts without intermediate dialogs',async()=>{
 const {saveSharing,readSharing,guiMain}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');const {PassThrough}=await import('node:stream');
 const f=await fixture('quick');await prepareHTML(f,{trash:async()=>{}});
 assert.equal(await readSharing(f.root,f.id),null);
 await saveSharing(f.root,{mode:'lan',allowAnonymous:true},f.id);assert.deepEqual(await readSharing(f.root,f.id),{mode:'lan',allowAnonymous:true});
 const input=new PassThrough();let finish,started=false;const finished=new Promise(r=>finish=r);
 await guiMain({root:f.root,libraryId:f.id,quick:true,appMode:true,input,checkAddressPort:async()=>{},findTiddlyWiki:async()=>path.dirname(path.dirname(boot)),networkInterfaces:()=>({WiFi:[{address:'192.168.1.8',family:'IPv4',internal:false}]}),findTailscale:async()=>null,
 dialog:async(kind,message)=>assert.fail('No intermediate dialog: '+message),startSession:async options=>{started=true;assert.equal(options.allowAnonymous,true);assert.equal(options.lanHost,'192.168.1.8');return {url:'http://192.168.1.8:'+options.port,finished,stop:async()=>finish()};},report:event=>{if(event.event==='ready')input.end();}});
 assert.equal(started,true);
});

test('the actual Forge Music Edition converts with every supplied plugin and field intact',async()=>{
 const {loadEdition}=await import('../assembler/assemble.mjs');
 const repo=new URL('../',import.meta.url);
 const {tiddlers}=await loadEdition('https://forge.test/editions/music/manifest.json',async url=>({ok:true,status:200,json:async()=>JSON.parse(await readFile(new URL(new URL(url).pathname.slice(1),repo),'utf8'))}));
 const dir=path.join(temp,'music-edition');await mkdir(dir);const location=path.join(dir,'HUWiki-music.html'),root=path.join(dir,'settings');await writeFile(location,assembleHtml(core,tiddlers));
 const entry=await addLibraryEntry({root,location,kind:'html',name:'Musik'});
 const result=await prepareHTML({root,id:entry.id,boot},{trash:async()=>{}});
 const saved=[];for(const file of await readdir(path.join(result.entry.location,'tiddlers')))saved.push(...JSON.parse(await readFile(path.join(result.entry.location,'tiddlers',file),'utf8')));
 for(const original of tiddlers){const actual=saved.find(t=>t.title===original.title);assert.ok(actual,original.title);for(const [key,value] of Object.entries(original))assert.equal(actual[key],value,original.title+':'+key);}
});

test('Open prepares an HTML wiki automatically and starts locally with bridge access, ignoring saved public sharing',async()=>{
 const {guiMain,saveSharing,readSharing}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');const {PassThrough}=await import('node:stream');
 const f=await fixture('open-html');await saveSharing(f.root,{mode:'funnel',allowAnonymous:false},f.id);
 const input=new PassThrough();let finish,started=false,ready=false;const finished=new Promise(r=>finish=r);
 await guiMain({root:f.root,libraryId:f.id,localOnly:true,quick:true,appMode:true,input,
  findTiddlyWiki:async()=>path.dirname(path.dirname(boot)),trash:async file=>rename(file,file+'.test-trash'),checkAddressPort:async()=>{},
  findTailscale:async()=>null,dialog:async(kind,message)=>assert.fail('Open must not ask about sharing or conversion: '+message),
  startSession:async options=>{started=true;assert.equal((await listLibrary(f.root)).entries[0].kind,'folder');assert.equal(options.localOnly,true);assert.equal(options.allowAnonymous,true);assert.equal(options.funnel,false);assert.equal(options.lanHost,undefined);assert.equal(options.bridge.wikiId,f.id);return {url:'http://127.0.0.1:'+options.port,finished,stop:async()=>finish()};},
  report:event=>{if(event.event==='ready'){ready=true;assert.equal(event.mode,'local');assert.match(event.url,/^http:\/\/127\.0\.0\.1:/);input.end();}}});
 assert.ok(started&&ready);assert.equal((await listLibrary(f.root)).entries[0].shareUrl,undefined);assert.equal((await readSharing(f.root,f.id)).mode,'funnel');
});
test('Open failure keeps the original HTML and never starts a server',async()=>{
 const {guiMain}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');const f=await fixture('open-failure');const bytes=await readFile(f.location);let info=false;
 await guiMain({root:f.root,libraryId:f.id,localOnly:true,quick:true,findTiddlyWiki:async()=>path.dirname(path.dirname(boot)),
  convert:async()=>{throw Error('Cannot prepare');},trash:async()=>assert.fail('Original stays'),startSession:async()=>assert.fail('No server on failed preparation'),
  dialog:async kind=>{assert.equal(kind,'info');info=true;}});
 assert.ok(info);assert.deepEqual(await readFile(f.location),bytes);assert.equal((await listLibrary(f.root)).entries[0].kind,'html');
});
test('Open starts a static site locally without TiddlyWiki or Tailscale, and opens its local address',async()=>{
 const {guiMain}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');const dir=path.join(temp,'open-site');await mkdir(dir);await writeFile(path.join(dir,'index.html'),'<h1>Site</h1>');
 const root=path.join(temp,'site-settings');const entry=await addLibraryEntry({root,location:dir,kind:'site',name:'Site'});let opened,started=false,finish;const finished=new Promise(r=>finish=r);
 await guiMain({root,libraryId:entry.id,localOnly:true,quick:true,checkAddressPort:async()=>{},
  findTiddlyWiki:async()=>assert.fail('A site needs no wiki runtime'),findTailscale:async()=>null,
  openAddress:async url=>{opened=url;},dialog:async kind=>assert.equal(kind,'text'),
  startSession:async options=>{started=true;assert.equal(options.kind,'site');assert.equal(options.localOnly,true);assert.equal(options.bridge,undefined);return {url:'http://127.0.0.1:'+options.port,finished,stop:async()=>finish()};}});
 assert.ok(started);assert.match(opened,/^http:\/\/127\.0\.0\.1:/);
});
