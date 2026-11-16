import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {request as httpRequest} from 'node:http';
import {createRequire} from 'node:module';
import {startSession,startCodeGateway,serverArgs,validateSharing} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require=createRequire(import.meta.url);
test('Funnel cannot select anonymous access and TW writers are restricted to editors',()=>{
 assert.deepEqual(validateSharing({mode:'funnel',allowAnonymous:true}),{mode:'funnel',allowAnonymous:false});
 assert.ok(serverArgs('/wiki','/private',20000,{codeRoles:true}).includes('writers=editor'));
});
test('real gateway: codes enforce reader/editor roles, owner can edit, anonymous and spoofed requests fail',async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-codes-'))),wiki=path.join(root,'wiki'),credentials=path.join(root,'credentials.csv');
 await mkdir(wiki);await writeFile(path.join(wiki,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/filesystem','tiddlywiki/tiddlyweb']}));
 await writeFile(credentials,'username,password\nreader,reader-secret\neditor,editor-secret\n',{mode:0o600});
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const upstream=await startSession({wiki,credentials,port,localOnly:true,codeRoles:true,boot:require.resolve('tiddlywiki/boot/boot.js')});
 let gateway,time=100000;
 try {
  const options={port,origin:'https://wiki.test.ts.net:10000',readerCode:'læser',editorCode:'redaktør',readerSecret:'reader-secret',editorSecret:'editor-secret',language:'da',now:()=>time};
  await assert.rejects(startCodeGateway({...options,editorCode:'læser'}));
  gateway=await startCodeGateway(options);
  const base='http://127.0.0.1:'+gateway.port,host='wiki.test.ts.net:10000',origin=options.origin;
  const request=(url,opts={})=>new Promise((resolve,reject)=>{const q=httpRequest(base+url,{method:opts.method||'GET',headers:{host,...opts.headers}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve(new Response([204,304].includes(r.statusCode)?null:Buffer.concat(chunks),{status:r.statusCode,headers:r.headers})));});q.on('error',reject);q.end(opts.body?.toString());});
  const login=async(code,extra={})=>request('/_forgeshare/login',{method:'POST',headers:{origin,'Content-Type':'application/x-www-form-urlencoded',...extra},body:new URLSearchParams({code})});
  const anonymous=await request('/',{headers:{'sec-fetch-site':'cross-site'}});assert.equal(anonymous.status,401);assert.match(await anonymous.text(),/Indtast den kode/);
  assert.equal((await request('/status',{headers:{authorization:'Basic '+Buffer.from('editor:editor-secret').toString('base64'),'tailscale-user-login':'editor','x-forwarded-user':'editor'}})).status,401);
  assert.equal((await fetch(base+'/status')).status,421);
  assert.equal((await login('redaktør',{origin:'https://evil.example'})).status,403);
  assert.equal((await login('wrong')).status,401);
  const cookie=async code=>{const r=await login(code);assert.equal(r.status,303);const c=r.headers.get('set-cookie');assert.match(c,/HttpOnly; SameSite=Strict/);assert.match(c,/Secure/);return c.split(';')[0];};
  const reader=await cookie('læser'),editor=await cookie('redaktør');
  const status=async c=>(await request('/status',{headers:{cookie:c}})).json();
  assert.equal((await status(reader)).read_only,true);assert.equal((await status(editor)).read_only,false);
  const target='/recipes/default/tiddlers/Shared%20note',body=JSON.stringify({title:'Shared note',text:'From editor',type:'text/vnd.tiddlywiki'});
  const put=c=>request(target,{method:'PUT',headers:{cookie:c,origin,'Content-Type':'application/json','X-Requested-With':'TiddlyWiki'},body});
  assert.equal((await put(reader)).status,403);assert.equal((await put(editor)).status,204);
  assert.equal((await request(target,{headers:{cookie:reader}})).status,200);
  assert.equal((await request('/admin',{headers:{cookie:editor}})).status,404);
  assert.equal((await request(target,{method:'DELETE',headers:{cookie:editor,origin:'https://evil.example','X-Requested-With':'TiddlyWiki'}})).status,403);
  // Even bypassing the gateway with the internal reader credential cannot write.
  assert.equal((await fetch(upstream.url+target,{method:'PUT',headers:{Authorization:'Basic '+Buffer.from('reader:reader-secret').toString('base64'),'X-Requested-With':'TiddlyWiki','Content-Type':'application/json'},body})).status,401);
  const owner=new URL(gateway.ownerUrl),opened=await fetch(owner,{redirect:'manual'});assert.equal(opened.status,303);const ownerCookie=opened.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(owner.origin+'/status',{headers:{cookie:ownerCookie}})).json()).read_only,false);
  assert.equal((await fetch(owner.origin+target,{method:'PUT',headers:{cookie:ownerCookie,origin:owner.origin,'X-Requested-With':'TiddlyWiki','Content-Type':'application/json'},body})).status,204);
  assert.equal((await request('/status',{headers:{cookie:ownerCookie}})).status,401);
  assert.equal((await request('/_forgeshare/owner?token='+owner.searchParams.get('token'))).status,401);
  time+=28800001;assert.equal((await request('/status',{headers:{cookie:editor}})).status,401);
  for(let i=0;i<20;i++)assert.equal((await login('wrong')).status,401);
  assert.equal((await login('redaktør',{'x-forwarded-for':'1.2.3.4'})).status,429);
  time+=60001;assert.equal((await login('redaktør')).status,303);
 }finally {if(gateway)await gateway.stop();await upstream.stop();await rm(root,{recursive:true,force:true});}
});

test('graphical Funnel asks only for codes, preserves private port assignment and never exports owner access or secrets',async()=>{
 const {guiMain,addLibraryEntry,saveSharing,listLibrary,readRegistry,libraryExport}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const {readFile}=await import('node:fs/promises'),{PassThrough}=await import('node:stream');
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-funnel-ui-'))),wiki=path.join(root,'wiki');
 await mkdir(wiki);await writeFile(path.join(wiki,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/filesystem','tiddlywiki/tiddlyweb']}));
 const entry=await addLibraryEntry({root,location:wiki,kind:'folder',name:'Public test'});await saveSharing(root,{mode:'funnel',allowAnonymous:false},entry.id);
 const input=new PassThrough();let credentials,finish,ready,passwords=0;const finished=new Promise(r=>finish=r);
 try {
  await guiMain({root,libraryId:entry.id,quick:true,appMode:true,input,readJSON:async()=>({}),checkAddressPort:async()=>{},findTailscale:async()=>'/mock',findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
   dialog:async(kind,message,initial)=>{if(kind==='choice')return initial[0];assert.equal(kind,'password',message);return passwords++===0?'reader-code':'editor-code';},
   startSession:async opts=>{assert.equal(opts.funnel,true);assert.equal(opts.codeRoles,true);assert.equal(opts.allowAnonymous,false);assert.equal(opts.httpsPort,10000);assert.equal(opts.codeAccess.readerCode,'reader-code');credentials=opts.credentials;const csv=await readFile(credentials,'utf8');assert.ok(!csv.includes('reader-code'));assert.match(csv,/reader,[a-f0-9]{64}/);return {url:'https://wiki.test.ts.net:10000',ownerUrl:'http://127.0.0.1:43210/_forgeshare/owner?token=private-owner-token',finished,stop:async()=>finish()};},
   report:event=>{if(event.event==='ready'){ready=event;input.end();}}
  });
  assert.equal(passwords,2);assert.equal(ready.mode,'funnel');assert.match(ready.ownerUrl,/private-owner-token/);
  assert.ok((await readRegistry(root)).wikis[0].httpsPort>=21000);
  const exported=JSON.stringify(libraryExport(await listLibrary(root),[entry.id],{includeAddresses:true}));assert.match(exported,/wiki.test.ts.net/);assert.doesNotMatch(exported,/private-owner-token|reader-code|editor-code|43210/);
  await assert.rejects(readFile(credentials),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});

test('real site gateway serves nested pages and assets, protects every file, stays read-only and releases addresses on stop',async t=>{
 const {startSite}=await import('../plugins/forgeshare/helper/Site.mjs');
 const {readFile}=await import('node:fs/promises');
 const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-site-gateway-')),site=path.join(root,'site'),credentials=path.join(root,'credentials.csv');
 let upstream,gateway;
 t.after(async()=>{if(gateway)await gateway.stop();if(upstream)await new Promise(r=>{upstream.close(r);upstream.closeAllConnections();});await rm(root,{recursive:true,force:true});});
 await mkdir(path.join(site,'assets'),{recursive:true});await mkdir(path.join(site,'about'));
 await writeFile(path.join(site,'index.html'),'<h1>My site</h1><link rel="stylesheet" href="assets/style.css"><img src="assets/icon.svg">');
 await writeFile(path.join(site,'assets/style.css'),'h1 {color: teal}');await writeFile(path.join(site,'assets/icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');await writeFile(path.join(site,'about/index.html'),'<h1>About</h1>');
 await writeFile(credentials,'username,password\nreader,rs\neditor,es\n',{mode:0o600});
 upstream=await startSite({wiki:site,port:0,credentials});const port=upstream.address().port;
 const options={port,origin:'https://site.test.ts.net:10000',readerCode:'visit',editorCode:'owner-code',readerSecret:'rs',editorSecret:'es',site:true};
 gateway=await startCodeGateway(options);const base='http://127.0.0.1:'+gateway.port;
 const request=(url,opts={})=>new Promise((resolve,reject)=>{const q=httpRequest(base+url,{method:opts.method||'GET',headers:{host:'site.test.ts.net:10000',...opts.headers}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,text:Buffer.concat(chunks).toString()}));});q.on('error',reject);q.end(opts.body);});
 for(const url of ['/','/assets/style.css','/assets/icon.svg','/about/']){const response=await request(url);assert.equal(response.status,401);assert.match(response.text,/Open the site/);assert.doesNotMatch(response.text,/Open the wiki/);}
 const login=await request('/_forgeshare/login',{method:'POST',headers:{origin:options.origin,'content-type':'application/x-www-form-urlencoded'},body:'code=visit'});assert.equal(login.status,303);
 const cookie=login.headers['set-cookie'][0].split(';')[0];
 for(const [url,mime,body] of [['/','text/html','My site'],['/assets/style.css','text/css','teal'],['/assets/icon.svg','image/svg+xml','svg'],['/about/','text/html','About']]){
  const response=await request(url,{headers:{cookie}});assert.equal(response.status,200);assert.ok(response.headers['content-type'].startsWith(mime));assert.ok(response.text.includes(body));
 }
 const head=await request('/assets/style.css',{method:'HEAD',headers:{cookie}});assert.equal(head.status,200);assert.equal(head.text,'');
 for(const url of ['/.env','/missing.html','/_forgeshare/bridge/connections'])assert.equal((await request(url,{headers:{cookie}})).status,404);
 assert.equal((await request('/index.html',{method:'PUT',headers:{cookie,origin:options.origin},body:'changed'})).status,403);
 const owner=new URL(gateway.ownerUrl),open=await fetch(owner,{redirect:'manual'});assert.equal(open.status,303);const ownerCookie=open.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(owner.origin+'/index.html',{method:'PUT',headers:{cookie:ownerCookie,origin:owner.origin},body:'changed'})).status,405);
 assert.match(await readFile(path.join(site,'index.html'),'utf8'),/My site/);
 await gateway.stop();gateway=undefined;await assert.rejects(fetch(base));await assert.rejects(fetch(owner.origin));
 // Stopping sharing leaves the static server under its own owner's control.
 assert.equal((await fetch('http://127.0.0.1:'+port)).status,401);
 await new Promise(r=>{upstream.close(r);upstream.closeAllConnections();});upstream=undefined;
 await assert.rejects(fetch('http://127.0.0.1:'+port));
 upstream=await startSite({wiki:site,port,allowAnonymous:true});assert.match(await (await fetch('http://127.0.0.1:'+port)).text(),/My site/);
});
