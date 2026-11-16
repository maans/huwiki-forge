import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,symlink,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createServer} from 'node:http';
import {Vault,systemStore,invitation,decodeImageAttachment} from '../plugins/forgeshare/helper/Vault.mjs';
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
 await saveSharing(root,{mode:'funnel',allowAnonymous:false},entry.id);
 await guiMain({root,libraryId:entry.id,quick:true,appMode:false,findTailscale:async()=>'/mock/tailscale',readJSON:async()=>({}),checkAddressPort:async()=>{},findTiddlyWiki:async()=>assert.fail('Sites do not need TW'),
  dialog:async(kind,message,initial)=>{if(kind==='password'){requested++;return 'visitor';}if(kind==='choice')return initial[0];if(kind==='text'||kind==='optional')return '';assert.fail(message);},
  startSession:async options=>{started=true;assert.equal(options.kind,'site');assert.equal(options.codeAccess.readerCode,'visitor');assert.notEqual(options.codeAccess.editorCode,'visitor');return {url:'https://example.test.ts.net:10000',finished:new Promise(()=>{}),stop:async()=>{}};}
 });assert.equal(requested,1);assert.equal(started,true);
});


test('Gemini uses Google AI Studio API key via the native vault, without OAuth or browser secrets',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-gemini-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let saved={},calls=[];
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const vault=new Vault({root,lock:async()=>()=>{},store:{read:async()=>structuredClone(saved),write:async x=>{saved=structuredClone(x);}},
   library:async()=>({entries:[{id:'wiki-one',name:'AI Edition'}]}),
   fetcher:async(url,options)=>{
     calls.push({url,options});
     if(url.includes('/v1beta/models?pageSize=100&pageToken=second'))return response({models:[{name:'models/gemini-3.5-flash',supportedGenerationMethods:['generateContent']}]});
     if(url.includes('/v1beta/models?pageSize=100'))return response({models:[
       {name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},
       {name:'models/text-embedding',supportedGenerationMethods:['embedContent']}
     ],nextPageToken:'second'});
     return response({candidates:[{content:{parts:[{text:'Klar'}]}}]});
   }});
 await assert.rejects(vault.saveConnection({name:'Gemini',provider:'gemini',serverUrl:'https://wrong.example',model:'gemini-2.5-flash',secret:''}),/Gemini/);
 const publicConnection=await vault.saveConnection({name:'Gemini',provider:'gemini',serverUrl:'https://wrong.example',model:'gemini-2.5-flash',secret:'gemini-private-key'});
 assert.equal(publicConnection.serverUrl,'https://generativelanguage.googleapis.com');
 assert.equal(publicConnection.provider,'gemini');
 assert.equal(JSON.stringify(publicConnection).includes('gemini-private-key'),false);
 const pair=await vault.pair('wiki-one','iPad');
 await vault.approve((await vault.pending())[0].id,[publicConnection.id],[]);
 const list=await vault.call('wiki-one',pair.token,'models',{connectionId:publicConnection.id});
 assert.deepEqual(list.models,['gemini-2.5-flash','gemini-3.5-flash']);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models')));
 assert.ok(calls.every(x=>x.options.headers['x-goog-api-key']==='gemini-private-key'));
 assert.ok(calls.every(x=>!x.url.includes('gemini-private-key')&&!('Authorization' in x.options.headers)));
 await assert.rejects(vault.call('wiki-one',pair.token,'generate',{connectionId:publicConnection.id,model:'gemini-2.5-flash',messages:[{role:'user',content:'Hej'}]}),/Bekræft/);
 const answer=await vault.call('wiki-one',pair.token,'generate',{connectionId:publicConnection.id,model:'gemini-2.5-flash',messages:[{role:'system',content:'Be brief'},{role:'user',content:'Hej'},{role:'assistant',content:'Hej'},{role:'user',content:'Sig klar'}],consent:true});
 assert.equal(answer.content,'Klar');
 const call=calls.at(-1);assert.equal(call.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
 const body=JSON.parse(call.options.body);
 assert.equal(body.systemInstruction.parts[0].text,'Be brief');
 assert.deepEqual(body.contents.map(c=>c.role),['user','model','user']);
 assert.equal(JSON.stringify(answer).includes('gemini-private-key'),false);
 await assert.rejects(vault.call('wiki-one',pair.token,'generate',{connectionId:publicConnection.id,model:'https://evil.example',messages:[{role:'user',content:'x'}],consent:true}),/Gemini-modelnavn/);
});
test('Gemini errors do not expose its API key, user data or raw upstream response',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-gemini-error-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const vault=new Vault({root,lock:async()=>()=>{},store:{read:async()=>structuredClone(vault._db||{}),write:async x=>{vault._db=structuredClone(x);}},
 library:async()=>({entries:[{id:'wiki-one'}]}),fetcher:async()=>new Response('secret-google-key', {status:403})});
 const c=await vault.saveConnection({name:'Gemini',provider:'gemini',serverUrl:'https://generativelanguage.googleapis.com',model:'gemini-2.5-flash',secret:'secret-google-key'});
 const pair=await vault.pair('wiki-one','iPad');await vault.approve((await vault.pending())[0].id,[c.id],[]);
 await assert.rejects(vault.call('wiki-one',pair.token,'models',{connectionId:c.id}),e=>/403/.test(e.message)&&!e.message.includes('secret-google-key'));
});


test('approved LM Studio vision request carries real image bytes; text chat stays unchanged',async t=>{
 const {vault,calls}=await fixture(t);
 const c=await vault.saveConnection({name:'Gemma 4',provider:'lmstudio',serverUrl:'http://127.0.0.1:1234',model:'google/gemma-4-e4b',secret:''});
 const pair=await vault.pair('wiki-one','iPad');await vault.approve((await vault.pending())[0].id,[c.id],[]);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(640000,0)]).toString('base64');
 const result=await vault.call('wiki-one',pair.token,'generate',{connectionId:c.id,model:'google/gemma-4-e4b',
   consent:true,messages:[{role:'system',content:'Answer in Danish'},{role:'user',content:'Beskriv billedet'}],
   images:[{mimeType:'image/png',data:png}]});
 assert.equal(result.ok,true);
 const request=JSON.parse(calls.at(-1).options.body);
 assert.equal(request.messages.at(-1).content[0].text,'Beskriv billedet');
 assert.equal(request.messages.at(-1).content[1].type,'image_url');
 assert.equal(request.messages.at(-1).content[1].image_url.url,'data:image/png;base64,'+png);
 assert.equal(JSON.stringify(result).includes(png),false);
 const reply=await vault.call('wiki-one',pair.token,'generate',{connectionId:c.id,consent:true,messages:[{role:'user',content:'Hej'}]});
 assert.equal(reply.ok,true);
 assert.equal(typeof JSON.parse(calls.at(-1).options.body).messages[0].content,'string');
 await assert.rejects(vault.call('wiki-one',pair.token,'generate',{connectionId:c.id,consent:true,
   messages:[{role:'user',content:'no'}],images:[{mimeType:'image/jpeg',data:png}]}),/Billedet passer/);
});
test('Ollama, Gemini and OpenAI-compatible adapters use their own image structure',async t=>{
 const {root}=await fixture(t);
 let state={},calls=[];
 const vault=new Vault({root,lock:async()=>()=>{},
   store:{read:async()=>structuredClone(state),write:async x=>{state=structuredClone(x);}},
   library:async()=>({entries:[{id:'wiki-one'}]}),
   fetcher:async (url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('/api/chat')?
     {message:{content:'ok'}}:url.includes('generativelanguage')?{candidates:[{content:{parts:[{text:'ok'}]}}]}:
     {choices:[{message:{content:'ok'}}]}));}});
 const img={mimeType:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,0,0]).toString('base64')};
 for(const [provider,serverUrl] of [['ollama','http://127.0.0.1:11434'],['gemini','https://generativelanguage.googleapis.com'],['compatible','http://127.0.0.1:1234']]){
   const c=await vault.saveConnection({name:provider,provider,serverUrl,model:provider==='gemini'?'gemini-2.5-flash':'test-model',secret:provider==='gemini'?'test-private-key':''});
   const result=await vault.request({...c,secret:provider==='gemini'?'test-private-key':''},'generate',{
     consent:true,messages:[{role:'user',content:'What is this?'}],images:[img]});
   assert.equal(result.content,'ok');
   const body=JSON.parse(calls.at(-1).options.body);
   if(provider==='ollama')assert.deepEqual(body.messages[0].images,[img.data]);
   if(provider==='gemini')assert.deepEqual(body.contents[0].parts[1],{inline_data:{mime_type:img.mimeType,data:img.data}});
   if(provider==='compatible')assert.equal(body.messages[0].content[1].image_url.url,'data:image/png;base64,'+img.data);
 }
});
test('local image storage is scoped to approved wiki and does not enter its tiddlers or Vault',async t=>{
 const {vault,get}=await fixture(t);
 const c=await vault.saveConnection({name:'Local AI',provider:'lmstudio',serverUrl:'http://127.0.0.1:1234',model:'gemma',secret:''});
 const pair=await vault.pair('wiki-one','Mac');await vault.approve((await vault.pending())[0].id,[c.id],[]);
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]).toString('base64');
 const image={mimeType:'image/png',data:png,name:'Screenshot'};
 const stored=await vault.call('wiki-one',pair.token,'media-save',image);
 assert.equal(stored.ok,true);assert.match(stored.id,/^[0-9a-f-]{36}$/);
 assert.equal(JSON.stringify(get()).includes(png),false);
 const loaded=await vault.call('wiki-one',pair.token,'media-get',{id:stored.id});
 assert.equal(loaded.data,png);assert.equal(loaded.mimeType,'image/png');
 await assert.rejects(vault.call('wiki-two',pair.token,'media-get',{id:stored.id}),/godkendelse|Approval/);
 await assert.rejects(vault.call('wiki-one',pair.token,'media-save',{...image,mimeType:'image/jpeg'}),/Billedet passer/);
 await assert.rejects(vault.call('wiki-one',pair.token,'media-get',{id:'../secrets'}),/billedreference/);
 await vault.revoke(get().grants[0].id);
 await assert.rejects(vault.call('wiki-one',pair.token,'media-get',{id:stored.id}),/godkendelse|Approval/);
 assert.throws(()=>decodeImageAttachment({mimeType:'image/png',data:'not-base64'}),/Ugyldigt/);
});
test('bridge accepts bounded image posts larger than previous 512 KiB and rejects excessive uploads',async t=>{
 const {vault}=await fixture(t);
 const c=await vault.saveConnection({name:'Gemma',provider:'lmstudio',serverUrl:'http://127.0.0.1:1234',model:'gemma',secret:''});
 const server=createServer((req,res)=>res.end('wiki'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port;
 installBridge(server,(op,token,input)=>op==='pair'?vault.pair('wiki-one',input.label,token):vault.call('wiki-one',token,op,input),{origins:()=>[origin]});
 const headers={'Content-Type':'application/json','X-ForgeShare':'1',Origin:origin};
 const pairing=await fetch(origin+'/_forgeshare/bridge/pair',{method:'POST',headers,body:'{"label":"Tablet"}'});
 const cookie=pairing.headers.get('set-cookie').split(';')[0];
 await vault.approve((await vault.pending())[0].id,[c.id],[]);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(500000)]).toString('base64');
 const options={method:'POST',headers:{...headers,Cookie:cookie},body:JSON.stringify({connectionId:c.id,consent:true,
   messages:[{role:'user',content:'Image'}],images:[{mimeType:'image/png',data:png}]})};
 const response=await fetch(origin+'/_forgeshare/bridge/generate',options);
 assert.equal(response.status,200);assert.equal((await response.json()).content,'Hello secret-example');
 const rejected=await fetch(origin+'/_forgeshare/bridge/generate',{method:'POST',headers:{...headers,Cookie:cookie},
   body:JSON.stringify({connectionId:c.id,padding:'x'.repeat(7*1024*1024)})});
 assert.equal(rejected.status,413);
});
