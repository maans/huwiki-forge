import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {registerWiki,readRegistry,startNamedSession} from '../plugins/forgeshare/helper/ForgeShare.mjs';

const hostname='mac.example.ts.net';
const route=(httpsPort,port)=>({TCP:{[httpsPort]:{HTTPS:true}},Web:{[hostname+':'+httpsPort]:{Handlers:{'/':{Proxy:'http://127.0.0.1:'+port}}}}});
const existing=()=>({TCP:{443:{HTTPS:true},8443:{HTTPS:true},10000:{HTTPS:true}},Web:{
 [hostname+':443']:{Handlers:{'/':{Proxy:'http://127.0.0.1:11434'}}},
 [hostname+':8443']:{Handlers:{'/':{Proxy:'http://127.0.0.1:1234'}}},
 [hostname+':10000']:{Handlers:{'/':{Proxy:'http://127.0.0.1:8080'}}}
},Foreground:{old:route(21001,20001)}});
async function fixture(t,kind='wiki') {
 const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-port-recovery-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 async function add(name) {
  const wiki=path.join(root,name);await mkdir(wiki);
  if(kind==='site')await writeFile(path.join(wiki,'index.html'),'<h1>Site</h1>');
  else await writeFile(path.join(wiki,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/tiddlyweb','tiddlywiki/filesystem']}));
  return registerWiki({root,wiki,name,localOnly:true,...(kind==='site'?{kind}:{})},{checkAddressPort:async()=>{}});
 }
 const other=await add('Other'),profile=await add('Selected');
 return {root,profile,other,add};
}
function running(options) {
 let finish;const finished=new Promise(resolve=>{finish=resolve;});
 return {url:'https://'+hostname+':'+options.httpsPort,finished,stop:async()=>finish()};
}
for(const kind of ['wiki','site'])test(`${kind}: an old private route is preserved while a fresh safe address is remembered`,async t=>{
 const {root,profile,other}=await fixture(t,kind),config=existing(),before=structuredClone(config),starts=[];
 assert.equal(profile.port,20001);assert.equal(profile.httpsPort,21001);
 const deps={readJSON:async()=>structuredClone(config),checkAddressPort:async()=>{},startSession:async selected=>{starts.push({...selected});return running(selected);}};
 const session=await startNamedSession(profile,{root,tailscale:'/mock/tailscale'},deps);
 assert.equal(starts[0].port,20002,'Do not expose a new server through an old proxy');
 assert.equal(starts[0].httpsPort,21002);
 assert.equal(session.url,'https://'+hostname+':21002');
 const saved=(await readRegistry(root)).wikis.find(e=>e.id===profile.id);
 assert.equal(saved.port,20002);assert.equal(saved.httpsPort,21002);
 assert.deepEqual((await readRegistry(root)).wikis.find(e=>e.id===other.id),other);
 assert.deepEqual(config,before,'No existing Tailscale route was modified');
 await session.stop();await session.finished;
 const restarted=await startNamedSession(saved,{root,tailscale:'/mock/tailscale'},deps);
 assert.equal(starts[1].port,saved.port);assert.equal(starts[1].httpsPort,saved.httpsPort);
 await restarted.stop();await restarted.finished;
 assert.deepEqual(config,before);
});

test('private recovery skips other saved addresses, nested services, public permission and OS listeners',async t=>{
 const {root,profile,add}=await fixture(t),reserved=await add('Reserved'),config=existing(),checked=[];
 config.Services={service:{TCP:{21003:{HTTPS:true}},Web:{[hostname+':21003']:{Handlers:{'/':{Proxy:'http://127.0.0.1:23000'}}}}}};
 config.AllowFunnel={[hostname+':21004']:true};
 let selected;
 const session=await startNamedSession(profile,{root,tailscale:'/mock'}, {
  readJSON:async()=>config,checkAddressPort:async port=>{checked.push(port);if([20003,21005].includes(port))throw Error('occupied');},
  startSession:async options=>{selected=options;return running(options);}
 });
 assert.equal(reserved.port,20002);assert.equal(reserved.httpsPort,21002);
 assert.equal(selected.port,20004);assert.equal(selected.httpsPort,21006);
 assert.ok(checked.includes(20003));assert.ok(checked.includes(21005));
 await session.stop();await session.finished;
});

test('recovery refuses an occupied old local server instead of creating a second writer',async t=>{
 const {root,profile}=await fixture(t),before=await readRegistry(root);let starts=0;
 await assert.rejects(startNamedSession(profile,{root,tailscale:'/mock'},{
  readJSON:async()=>existing(),checkAddressPort:async port=>{if(port===profile.port)throw Error('already running');},
  startSession:async options=>{starts++;return running(options);}
 }));
 assert.equal(starts,0);assert.deepEqual(await readRegistry(root),before);
});

test('recovery keeps saved addresses unchanged if startup fails or status is unknown',async t=>{
 const {root,profile}=await fixture(t),before=await readRegistry(root);let starts=0;
 await assert.rejects(startNamedSession(profile,{root,tailscale:'/mock'},{readJSON:async()=>existing(),checkAddressPort:async()=>{},startSession:async()=>{starts++;throw Error('server failed');}}),/server failed/);
 assert.equal(starts,1);assert.deepEqual(await readRegistry(root),before);
 await assert.rejects(startNamedSession(profile,{root,tailscale:'/mock'},{readJSON:async()=>({UnknownField:{}}),checkAddressPort:async()=>{},startSession:async()=>assert.fail('Unknown status must not start anything')}));
 assert.deepEqual(await readRegistry(root),before);
});

test('simultaneous recovery uses separate addresses and retains the one-server-per-wiki lock',async t=>{
 const {root,profile,add}=await fixture(t),second=await add('Second'),config=existing(),starts=[];
 config.Foreground.anotherOld=route(second.httpsPort,second.port);
 const deps={readJSON:async()=>structuredClone(config),checkAddressPort:async()=>{},startSession:async options=>{starts.push(options);return running(options);}};
 const sessions=await Promise.all([startNamedSession(profile,{root,tailscale:'/mock'},deps),startNamedSession(second,{root,tailscale:'/mock'},deps)]);
 try {
  assert.equal(starts.length,2);assert.equal(new Set(starts.map(e=>e.port)).size,2);assert.equal(new Set(starts.map(e=>e.httpsPort)).size,2);
  for(const entry of starts){assert.ok(![profile.port,second.port].includes(entry.port));assert.ok(![profile.httpsPort,second.httpsPort].includes(entry.httpsPort));}
  const saved=(await readRegistry(root)).wikis.find(e=>e.id===profile.id);
  await assert.rejects(startNamedSession(saved,{root,tailscale:'/mock'},deps),/already running/);
  assert.equal(starts.length,2);
 }finally{for(const session of sessions){await session.stop();await session.finished;}}
});

test('local opening works without Tailscale and keeps saved sharing addresses',async t=>{
 const {root,profile}=await fixture(t),before=await readRegistry(root);let selected;
 const session=await startNamedSession(profile,{root,localOnly:true},{findTailscale:async options=>{assert.equal(options.optional,true);return null;},readJSON:async()=>assert.fail('Missing Tailscale must not be queried'),checkAddressPort:async()=>{},startSession:async options=>{selected=options;return running(options);}});
 assert.equal(selected.port,profile.port);assert.equal(selected.httpsPort,profile.httpsPort);assert.deepEqual(await readRegistry(root),before);
 await session.stop();await session.finished;
});

for(const kind of ['wiki','site'])for(const mode of ['local','lan'])test(`${kind}: ${mode} opening avoids old sharing targets without changing sharing routes`,async t=>{
 const {root,profile,other}=await fixture(t,kind),config=existing(),before=structuredClone(config),starts=[];
 const options={root,...(mode==='local'?{localOnly:true}:{lanHost:'192.168.1.20'})};
 const deps={findTailscale:async options=>{assert.equal(options.optional,true);return '/mock/tailscale';},readJSON:async(exe,args)=>{assert.equal(exe,'/mock/tailscale');assert.deepEqual(args,['serve','status','--json']);return structuredClone(config);},checkAddressPort:async()=>{},startSession:async selected=>{starts.push({...selected});return running(selected);}};
 const session=await startNamedSession(profile,options,deps);
 assert.equal(starts[0].port,20002,'A local opening must not revive the old sharing route');
 assert.equal(starts[0].httpsPort,profile.httpsPort,'A local opening does not reallocate the saved sharing address');
 assert.equal(starts[0].tailscale,'/mock/tailscale','The actual local start can recheck for changes');
 const registry=await readRegistry(root),saved=registry.wikis.find(e=>e.id===profile.id);
 assert.equal(saved.port,20002);assert.equal(saved.httpsPort,profile.httpsPort);
 assert.deepEqual(registry.wikis.find(e=>e.id===other.id),other);assert.deepEqual(config,before);
 await session.stop();await session.finished;
 const reopened=await startNamedSession(saved,options,deps);
 assert.equal(starts[1].port,saved.port);assert.equal(starts[1].httpsPort,saved.httpsPort);
 await reopened.stop();await reopened.finished;
 assert.deepEqual(config,before);
});

test('local recovery fails safely when installed Tailscale status is unavailable or unknown',async t=>{
 for(const readJSON of [async()=>{throw Error('Cannot read sharing status');},async()=>({UnknownField:{}})]) {
  const {root,profile}=await fixture(t),before=await readRegistry(root);
  await assert.rejects(startNamedSession(profile,{root,localOnly:true},{findTailscale:async()=>'/mock/tailscale',readJSON,checkAddressPort:async()=>{},startSession:async()=>assert.fail('Unverified sharing must not start a local server')}));
  assert.deepEqual(await readRegistry(root),before);
 }
});

test('local recovery preserves the profile when the old server is running or the new start fails',async t=>{
 for(const occupied of [true,false]) {
  const {root,profile}=await fixture(t),before=await readRegistry(root);let starts=0;
  await assert.rejects(startNamedSession(profile,{root,localOnly:true},{findTailscale:async()=>'/mock/tailscale',readJSON:async()=>existing(),checkAddressPort:async port=>{if(occupied && port===profile.port)throw Error('Old server still running');},startSession:async()=>{starts++;throw Error('New start failed');}}),occupied?/Old server still running/:/New start failed/);
  assert.equal(starts,occupied?0:1);assert.deepEqual(await readRegistry(root),before);
 }
});

test('recovery also avoids old TCP forwarding and loopback aliases',async t=>{
 for(const makeConfig of [
  ()=>({TCP:{21001:{TCPForward:'localhost:20001'}}}),
  ()=>({Services:{service:{TCP:{21001:{TCPForward:'[::1]:20001'}}}}}),
  ()=>({Web:{[hostname+':21001']:{Handlers:{'/':{Proxy:'http://localhost:20001'}}}},AllowFunnel:{[hostname+':21001']:true}})
 ]) {
  const {root,profile}=await fixture(t),config=makeConfig(),before=structuredClone(config);let selected;
  const session=await startNamedSession(profile,{root,tailscale:'/mock'},{readJSON:async()=>config,checkAddressPort:async()=>{},startSession:async options=>{selected=options;return running(options);}});
  assert.notEqual(selected.port,20001);assert.notEqual(selected.httpsPort,21001);assert.deepEqual(config,before);
  await session.stop();await session.finished;
 }
});

test('no free private address leaves existing services and the saved profile unchanged',async t=>{
 const {root,profile}=await fixture(t),registry=await readRegistry(root),config=existing();
 for(let port=21000;port<=21999;port++)config.TCP[port]={HTTPS:true};
 const before=structuredClone(config);
 await assert.rejects(startNamedSession(profile,{root,tailscale:'/mock'},{readJSON:async()=>config,checkAddressPort:async()=>{},startSession:async()=>assert.fail('No address must mean no new session')}),/No free address/);
 assert.deepEqual(await readRegistry(root),registry);assert.deepEqual(config,before);
});
