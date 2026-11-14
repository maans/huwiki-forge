import test from 'node:test';
import assert from 'node:assert/strict';
import {planFunnel,verifyFunnelRoute} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const existing={TCP:{443:{HTTPS:true},8443:{HTTPS:true}},Web:{'mac.example.ts.net:443':{Handlers:{'/':{Proxy:'http://127.0.0.1:11434'}}},'mac.example.ts.net:8443':{Handlers:{'/':{Proxy:'http://127.0.0.1:1234'}}}}};
const publicRoute={TCP:{10000:{HTTPS:true}},Web:{'mac.example.ts.net:10000':{Handlers:{'/':{Proxy:'http://127.0.0.1:20000'}}}},AllowFunnel:{'mac.example.ts.net:10000':true}};
test('Funnel plans only free supported ports, preserves AI services and never enables background/reset/yes',async()=>{
 const original=structuredClone(existing),checked=[];
 const plan=await planFunnel(existing,20000,async port=>checked.push(port));
 assert.deepEqual(plan,{port:10000,args:['funnel','--https=10000','http://127.0.0.1:20000']});assert.deepEqual(checked,[10000]);assert.deepEqual(existing,original);
 await assert.rejects(planFunnel({...existing,Foreground:{privateWiki:publicRoute}},20000,async()=>assert.fail('No occupied port may be reused')));
 await assert.rejects(planFunnel(existing,20000,async()=>{throw Error('Another listener');}));
});
test('public readiness requires the owned foreground proxy and explicit Funnel flag, with unrelated settings unchanged',()=>{
 const after={...structuredClone(existing),Foreground:{owned:structuredClone(publicRoute)}};
 assert.equal(verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000),true);
 delete after.Foreground.owned.AllowFunnel;assert.equal(verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000),false);
 after.Foreground.owned=structuredClone(publicRoute);after.Foreground.owned.Web['mac.example.ts.net:10000'].Handlers['/other']={Proxy:'http://127.0.0.1:1234'};
 assert.equal(verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000),false);
 after.TCP[443]={TCPForward:'elsewhere'};assert.throws(()=>verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000));
});

test('public routes with another owner or a background listener on the same port are rejected',()=>{
 const after={...structuredClone(existing),Foreground:{owned:structuredClone(publicRoute),other:structuredClone(publicRoute)}};
 assert.equal(verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000),false);
 delete after.Foreground.other;after.TCP[10000]={HTTPS:true};assert.equal(verifyFunnelRoute(existing,after,'mac.example.ts.net',20000,10000),false);
});

test('Funnel exposes only the code gateway, returns a separate owner link and stops its own children',async()=>{
 const {startSession}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const {EventEmitter}=await import('node:events');
 class Child extends EventEmitter {exitCode=null;signalCode=null;kill(signal){this.signalCode=signal;queueMicrotask(()=>this.emit('exit'));}}
 const server=new Child(),funnel=new Child();let route,invocation;
 const opts={funnel:true,codeRoles:true,credentials:'/private/login.csv',port:20001,httpsPort:10000,tailscale:'/mock',codeAccess:{readerCode:'r',editorCode:'e',readerSecret:'rs',editorSecret:'es'}};
 const deps={checkPort:async()=>{},checkAddressPort:async()=>{},probe:async()=>401,startWiki:options=>{assert.equal(options.codeRoles,true);return {child:server,ready:Promise.resolve({address:'127.0.0.1',port:20001})};},readJSON:async(_exe,args)=>args[0]==='status'?{BackendState:'Running',Self:{DNSName:'mac.example.ts.net'}}:route||existing,spawn:(_exe,args)=>{invocation=args;const target=args[2];assert.notEqual(target,'http://127.0.0.1:20001');route={...existing,Foreground:{owned:{TCP:{10000:{HTTPS:true}},Web:{'mac.example.ts.net:10000':{Handlers:{'/':{Proxy:target}}}},AllowFunnel:{'mac.example.ts.net:10000':true}}}};return funnel;}};
 const session=await startSession(opts,deps);
 try {assert.equal(invocation[0],'funnel');assert.equal(session.url,'https://mac.example.ts.net:10000');assert.match(session.ownerUrl,/^http:\/\/127\.0\.0\.1:\d+\/_forgeshare\/owner\?token=/);assert.equal((await fetch(invocation[2])).status,421);}finally{await session.stop();await session.finished;}
 assert.equal(server.signalCode,'SIGTERM');assert.equal(funnel.signalCode,'SIGTERM');
 await assert.rejects(fetch(invocation[2]));
 await assert.rejects(startSession({...opts,allowAnonymous:true},deps));
});
