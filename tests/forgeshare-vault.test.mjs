import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,symlink,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createServer} from 'node:http';
import {Vault,systemStore,invitation} from '../plugins/forgeshare/helper/Vault.mjs';
import {installBridge} from '../plugins/forgeshare/helper/Bridge.mjs';
import {startSite} from '../plugins/forgeshare/helper/Site.mjs';
import {configureLogin,loginFile} from '../plugins/forgeshare/helper/Startup.mjs';
import {acquireLock,addLibraryEntry,listLibrary,registerWiki,startWiki,stopChild} from '../plugins/forgeshare/helper/ForgeShare.mjs';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-vault-'));t.after(()=>rm(root,{recursive:true,force:true}));let value={};const calls=[];const vault=new Vault({root,lock:acquireLock,store:{read:async()=>structuredClone(value),write:async v=>{value=structuredClone(v);}},library:async()=>({entries:[{id:'wiki-one',name:'Notes',description:'Shared notes',shareUrl:'https://notes.test.ts.net',location:'/private/path',kind:'folder'},{id:'wiki-two',name:'Private',description:'',kind:'folder'}]}),fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('models')?{data:[{id:'test-model'}]}:{choices:[{message:{content:'Hello secret-example'}}]}));}});return {root,vault,calls,get:()=>value};}
test('vault requires explicit scoped approval; secrets never appear in metadata, completions or library',async t=>{
 const {vault,calls,get}=await fixture(t);const c=await vault.saveConnection({name:'LM',provider:'lmstudio',serverUrl:'http://127.0.0.1:1234',model:'test-model',secret:'secret-example'});
 assert.equal(c.hasKey,true);assert.equal(JSON.stringify(c).includes('secret-example'),false);
 const p=await vault.pair('wiki-one','Tablet');await assert.rejects(vault.call('wiki-one',p.token,'connections'));
 await vault.approve((await vault.pending())[0].id,[c.id],['wiki-one']);
 await assert.rejects(vault.call('wiki-two',p.token,'connections'));await assert.rejects(vault.call('wiki-one','x','connections'));
 assert.equal((await vault.call('wiki-one',p.token,'connections')).connections.length,1);
 const library=await vault.call('wiki-one',p.token,'library');assert.deepEqual(library.entries.map(e=>e.name),['Notes']);assert.equal(JSON.stringify(library).includes('/private'),false);
 await assert.rejects(vault.call('wiki-one',p.token,'generate',{connectionId:c.id,messages:[{role:'user',content:'Hi'}]}));
 const reply=await vault.call('wiki-one',p.token,'generate',{connectionId:c.id,messages:[{role:'user',content:'Hi'}],consent:true});assert.equal(reply.content,'Hello [private]');
 assert.equal(calls[0].options.headers.Authorization,'Bearer secret-example');assert.equal(calls[0].options.redirect,'error');
 await vault.revoke(get().grants[0].id);await assert.rejects(vault.call('wiki-one',p.token,'models',{connectionId:c.id}));
});
test('vault does not allow browser-chosen URLs or arbitrary secret retrieval; approval expires',async t=>{
 const {vault,calls}=await fixture(t);const c=await vault.saveConnection({name:'Cloud',provider:'openai',serverUrl:'https://attacker.invalid',model:'test',secret:'key'});
 const pair=await vault.pair('wiki-one','Phone');await vault.approve((await vault.pending())[0].id,[c.id],[]);
 await assert.rejects(vault.call('wiki-one',pair.token,'password'));
 await vault.call('wiki-one',pair.token,'models',{connectionId:c.id,url:'http://attacker.invalid'});assert.equal(calls[0].url,'https://api.openai.com/v1/models');
 vault.now=()=>Date.now()+31*86400000;await assert.rejects(vault.call('wiki-one',pair.token,'connections'));
});
test('same-origin bridge blocks cross-origin requests and keeps approval token in HttpOnly cookie',async t=>{
 const {vault}=await fixture(t),server=createServer((req,res)=>res.end('wiki'));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port;installBridge(server,(op,token,input)=>op==='pair'?vault.pair('wiki-one',input.label,token):vault.call('wiki-one',token,op,input),{origins:()=>[origin]});
 const headers={'Content-Type':'application/json','X-ForgeShare':'1',Origin:origin};
 let r=await fetch(origin+'/_forgeshare/bridge/pair',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:'{"label":"Phone"}'});assert.equal(r.status,403);
 r=await fetch(origin+'/_forgeshare/bridge/pair',{method:'POST',headers,body:'{"label":"Phone"}'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.equal((await r.json()).token,undefined);
 const request=(await vault.pending())[0];await vault.approve(request.id,[],['wiki-one']);
 r=await fetch(origin+'/_forgeshare/bridge/library',{method:'POST',headers:{...headers,Cookie:cookie.split(';')[0]},body:'{}'});assert.equal(r.status,200);assert.equal((await r.json()).entries[0].name,'Notes');
});
test('sites serve selected files read-only and block traversal, dotfiles, symlinks and unrelated files',async t=>{
 const {root}=await fixture(t),site=path.join(root,'site');await mkdir(site);await writeFile(path.join(site,'index.html'),'<h1>Site</h1>');await writeFile(path.join(site,'.secret'),'secret');await writeFile(path.join(root,'outside.txt'),'outside');await symlink(path.join(root,'outside.txt'),path.join(site,'outside.txt'));
 const s=await startSite({wiki:site,port:0,allowAnonymous:true});t.after(()=>new Promise(r=>{s.close(r);s.closeAllConnections();}));const base='http://127.0.0.1:'+s.address().port;
 assert.equal(await (await fetch(base)).text(),'<h1>Site</h1>');for(const file of ['/.secret','/outside.txt','/%2e%2e%2foutside.txt','/nope.csv'])assert.equal((await fetch(base+file)).status,404);
 assert.equal((await fetch(base,{method:'PUT',body:'changed'})).status,405);assert.equal(await readFile(path.join(site,'index.html'),'utf8'),'<h1>Site</h1>');
 const e=await addLibraryEntry({root,location:site,name:'Site',kind:'site'});assert.equal((await listLibrary(root)).entries[0].id,e.id);
 const profile=await registerWiki({root,wiki:site,name:'Site',kind:'site',localOnly:true});const child=startWiki({...profile,allowAnonymous:true});t.after(()=>stopChild(child.child));await child.ready;assert.equal(await(await fetch('http://127.0.0.1:'+profile.port)).text(),'<h1>Site</h1>');
});
test('login startup is opt-in, reversible and escapes paths without modifying another entry',async t=>{
 const {root}=await fixture(t),options={platform:'darwin',home:root};await configureLogin(true,'/Applications/Notes & Sites.app',options);assert.match(await readFile(loginFile(options),'utf8'),/Notes &amp; Sites/);await configureLogin(false,'',options);await assert.rejects(readFile(loginFile(options)));await writeFile(loginFile(options),'someone else');await assert.rejects(configureLogin(true,'/app',options));assert.equal(await readFile(loginFile(options),'utf8'),'someone else');
});
test('mail invitation defaults to link only; explicit code option is encoded as body data',()=>{
 const uri=invitation({name:'Notes',url:'https://notes.test.ts.net',comment:'Hello & hi\nsecond line'});const u=new URL(uri);assert.equal(u.searchParams.has('cc'),false);assert.match(u.searchParams.get('body'),/Hello & hi\nsecond line/);assert.doesNotMatch(uri,/Access%20code/);
 const withCode=new URL(invitation({name:'Notes',url:'https://notes.test.ts.net',code:'a&bcc=evil',role:'Reader'}));assert.equal(withCode.searchParams.has('bcc'),false);assert.match(withCode.searchParams.get('body'),/a&bcc=evil/);
});
test('system vault sends secrets through stdin and never through command arguments',async()=>{
 const calls=[],store=systemStore({platform:'darwin',native:'/app/ForgeShare',run:async(...args)=>{calls.push(args);return '{}';}});await store.write({secret:'private-value'});await store.read();assert.deepEqual(calls[0].slice(0,2),['/app/ForgeShare',['--vault','write']]);assert.equal(calls[0][2],'{"secret":"private-value"}');
});
test('sharing an HTML site needs no TiddlyWiki installation and Funnel asks only a visitor code',async t=>{
 const {guiMain,saveSharing}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const {root}=await fixture(t),site=path.join(root,'Website');await mkdir(site);await writeFile(path.join(site,'index.html'),'<h1>Public page</h1>');
 const entry=await addLibraryEntry({root,location:site,name:'Website',kind:'site'});let requested=0,started=false;
 await saveSharing(root,{mode:'funnel',allowAnonymous:false});
 await guiMain({root,libraryId:entry.id,quick:true,appMode:false,findTailscale:async()=>'/mock/tailscale',readJSON:async()=>({}),checkAddressPort:async()=>{},findTiddlyWiki:async()=>assert.fail('Sites do not need TW'),
  dialog:async(kind,message,initial)=>{if(kind==='password'){requested++;return 'visitor';}if(kind==='choice')return initial[0];if(kind==='text'||kind==='optional')return '';assert.fail(message);},
  startSession:async options=>{started=true;assert.equal(options.kind,'site');assert.equal(options.codeAccess.readerCode,'visitor');assert.notEqual(options.codeAccess.editorCode,'visitor');return {url:'https://example.test.ts.net:10000',finished:new Promise(()=>{}),stop:async()=>{}};}
 });assert.equal(requested,1);assert.equal(started,true);
});
