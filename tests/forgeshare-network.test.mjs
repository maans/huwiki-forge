import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
import {isPrivateIPv4,homeNetworkAddresses,serverArgs,validateCredentials,startSession,guiMain,addLibraryEntry,listLibrary,libraryExport} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require=createRequire(import.meta.url),boot=require.resolve('tiddlywiki/boot/boot.js');
const interfaces={en0:[{address:'192.168.1.20',internal:false,family:'IPv4'}]};
let temp;
test.before(async()=>{temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-network-')));});
test.after(async()=>{await rm(temp,{recursive:true,force:true});});
async function wiki(name) {const folder=path.join(temp,name);await mkdir(folder);await writeFile(path.join(folder,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/tiddlyweb','tiddlywiki/filesystem']}));return folder;}
test('password length is chosen by the user; empty or structurally invalid login is rejected',()=>{
 for(const password of ['a','pw','familie','æøå'])assert.equal(validateCredentials('username,password\nwiki,'+password+'\n'),1);
 for(const password of ['', 'a,b','a"b','a\nb'])assert.throws(()=>validateCredentials('username,password\nwiki,'+password+'\n'));
});
test('home network selection excludes wildcard, public, loopback, IPv6 and known VPN/virtual interfaces',()=>{
 for(const value of ['10.0.0.1','172.16.0.1','172.31.255.254','192.168.1.20'])assert.equal(isPrivateIPv4(value),true);
 for(const value of ['0.0.0.0','127.0.0.1','172.15.0.1','172.32.0.1','100.64.0.1','8.8.8.8','::1','192.168.1.999','192.168.1.20;anything'])assert.equal(isPrivateIPv4(value),false);
 const data={...interfaces,utun0:[{address:'10.0.0.1'}],docker0:[{address:'172.18.0.1'}],loop:[{address:'10.0.0.2',internal:true}],public:[{address:'8.8.8.8'}],duplicate:interfaces.en0};
 assert.deepEqual(homeNetworkAddresses(data),[{name:'en0',address:'192.168.1.20'}]);
});
test('no-login is explicit, CSRF remains on, and LAN binds only the selected private address',()=>{
 assert.throws(()=>serverArgs('/wiki',undefined));assert.throws(()=>serverArgs('/wiki',undefined,8080,{allowAnonymous:'true'}));
 const local=serverArgs('/wiki',undefined,20000,{allowAnonymous:true});
 assert.ok(local.includes('host=127.0.0.1'));assert.ok(local.includes('readers=(anon)'));assert.ok(local.includes('writers=(anon)'));
 assert.ok(local.includes('csrf-disable=no'));assert.ok(!local.some(arg=>arg.startsWith('credentials=')));
 const lan=serverArgs('/wiki','/private/login.csv',20000,{lanHost:'192.168.1.20'});
 assert.ok(lan.includes('host=192.168.1.20'));assert.ok(lan.includes('readers=(authenticated)'));
 assert.throws(()=>serverArgs('/wiki',undefined,20000,{allowAnonymous:true,lanHost:'0.0.0.0'}));
});
class Child extends EventEmitter {exitCode=null;signalCode=null;killed=false;kill(signal){this.killed=true;this.signalCode=signal;queueMicrotask(()=>this.emit('exit'));return true;}}
test('LAN validates the actual binding and login mode without ever calling Tailscale',async()=>{
 for(const allowAnonymous of [true,false]) {
  const child=new Child();const session=await startSession({lanHost:'192.168.1.20',port:20000,allowAnonymous},{networkInterfaces:()=>interfaces,checkPort:async()=>{},startWiki:options=>{assert.equal(options.lanHost,'192.168.1.20');return {child,ready:Promise.resolve({address:'192.168.1.20',port:20000})};},probe:async()=>allowAnonymous?200:401,readJSON:async()=>assert.fail('Tailscale must not be queried'),spawn:()=>assert.fail('Tailscale must not start')});
  assert.equal(session.url,'http://192.168.1.20:20000');await session.stop();await session.finished;assert.equal(child.killed,true);
 }
 for(const scenario of [{address:'0.0.0.0',status:200},{address:'192.168.1.20',status:401}]) {
  const child=new Child();await assert.rejects(startSession({lanHost:'192.168.1.20',port:20000,allowAnonymous:true},{networkInterfaces:()=>interfaces,checkPort:async()=>{},startWiki:()=>({child,ready:Promise.resolve({address:scenario.address,port:20000})}),probe:async()=>scenario.status}));assert.ok(child.killed);
 }
 await assert.rejects(startSession({lanHost:'192.168.1.20',port:20000},{networkInterfaces:()=>({}),startWiki:()=>assert.fail('A disappeared interface must not start')}));
});
for(const mode of ['local','lan'])test(`${mode} start checks installed Tailscale before binding and again before reporting ready`,async()=>{
 const host=mode==='local'?'127.0.0.1':'192.168.1.20';
 const options={...(mode==='local'?{localOnly:true}:{lanHost:host}),tailscale:'/mock/tailscale',port:20000,allowAnonymous:true};
 const stale={Foreground:{old:{TCP:{10000:{HTTPS:true}},Web:{'mac.example.ts.net:10000':{Handlers:{'/':{Proxy:'http://127.0.0.1:20000'}}}},AllowFunnel:{'mac.example.ts.net:10000':true}}}};
 for(const when of ['before','during','unknown','unavailable','clear']) {
  const child=new Child();let reads=0,starts=0;
  const deps={networkInterfaces:()=>interfaces,checkPort:async()=>{},readJSON:async(executable,args)=>{
   assert.equal(executable,options.tailscale);assert.deepEqual(args,['serve','status','--json']);reads++;
   if(when==='before' || when==='during' && reads===2)return structuredClone(stale);
   if(when==='unknown' && reads===2)return {UnknownField:{}};
   if(when==='unavailable' && reads===2)throw Error('Sharing status unavailable');
   return {};
  },startWiki:()=>{starts++;return {child,ready:Promise.resolve({address:host,port:20000})};},probe:async()=>200,spawn:()=>assert.fail('Local opening must not change Tailscale routes')};
  if(when==='clear') {
   const session=await startSession(options,deps);assert.equal(reads,2);assert.equal(starts,1);assert.equal(child.killed,false);
   await session.stop();await session.finished;assert.equal(child.killed,true);
  }else {
   await assert.rejects(startSession(options,deps));
   assert.equal(starts,when==='before'?0:1);assert.equal(child.killed,when!=='before');
  }
 }
});
test('real no-login wiki allows read/write but keeps CSRF protection; tests bind loopback only',async()=>{
 const folder=await wiki('open wiki'),listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const session=await startSession({wiki:folder,boot,port,localOnly:true,allowAnonymous:true});
 try {
  assert.equal((await fetch(session.url+'/status')).status,200);
  const url=session.url+'/recipes/default/tiddlers/Open%20note';
  const body=JSON.stringify({title:'Open note',text:'Saved without a wiki login',type:'text/vnd.tiddlywiki'});
  assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body})).status,403);
  assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'TiddlyWiki'},body})).status,204);
  assert.equal((await (await fetch(url)).json()).text,'Saved without a wiki login');
 }finally{await session.stop();await session.finished;}
});
test('graphical LAN sharing works without Tailscale and skips login prompts, confirms the selected mode and exports the last LAN link only on request',async()=>{
 const folder=await wiki('LAN GUI'),root=path.join(temp,'LAN settings');const entry=await addLibraryEntry({root,location:folder,name:'Home wiki',kind:'folder'});
 const input=new PassThrough(),reports=[];let finish,started=false,confirmed=false;const finished=new Promise(resolve=>{finish=resolve;});
 await guiMain({root,libraryId:entry.id,appMode:true,input,networkInterfaces:()=>interfaces,checkAddressPort:async()=>{},readJSON:async()=>assert.fail('No Tailscale configuration'),findTailscale:async()=>null,findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
  dialog:async(kind,message,choices)=>{
   if(kind==='confirm'){if(message.startsWith('Start')){assert.match(message,/Home network/);assert.match(message,/No wiki login/);confirmed=true;}return '';}
   if(kind==='choice')return choices.find(value=>value.startsWith(message.startsWith('Where')?'Home network':'Without'));
   assert.fail('Unexpected login/install dialog: '+kind+' '+message);
  },
  startSession:async options=>{assert.ok(confirmed);assert.equal(options.credentials,undefined);assert.equal(options.allowAnonymous,true);assert.equal(options.lanHost,'192.168.1.20');started=true;return {url:'http://192.168.1.20:'+options.port,finished,stop:async()=>finish()};},
  report:event=>{reports.push(event);if(event.event==='ready')input.end();}
 });
 assert.ok(started);assert.equal(reports.at(-1).mode,'lan');assert.equal(reports.at(-1).access,'open');
 const library=await listLibrary(root);assert.equal(library.entries[0].shareUrl,reports.at(-1).url);
 assert.equal(libraryExport(library,[entry.id])[1]['forgeshare-address'],'');assert.equal(libraryExport(library,[entry.id],{includeAddresses:true})[1]['forgeshare-address'],reports.at(-1).url);
});
test('a short chosen password works in the helper and its temporary file is removed',async()=>{
 const folder=await wiki('short password'),root=path.join(temp,'short settings');const entry=await addLibraryEntry({root,location:folder,name:'Private wiki',kind:'folder'});
 let credentials;
 await guiMain({root,libraryId:entry.id,localOnly:true,findTailscale:async()=>null,checkAddressPort:async()=>{},findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
  dialog:async(kind,message,initial)=>{if(kind==='confirm')return '';if(kind==='choice')return initial.find(v=>v.startsWith('With wiki'));if(kind==='password')return 'pw';if(kind==='text')return initial.startsWith('http:')?'':'wiki';assert.fail(message);},
  startSession:async options=>{credentials=options.credentials;assert.equal(await readFile(credentials,'utf8'),'username,password\nwiki,pw\n');return {url:'http://127.0.0.1:'+options.port,finished:new Promise(()=>{}),stop:async()=>{}};}
 });
 await assert.rejects(readFile(credentials),{code:'ENOENT'});
});

test('startup is off by default, accepts only a known server wiki and never stores credentials',async()=>{
 const {saveStartup,readStartup}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const folder=await wiki('Startup choices'),root=path.join(temp,'Startup settings');
 const e=await addLibraryEntry({root,location:folder,name:'Startup wiki',kind:'folder'});
 assert.equal(await readStartup(root),null);
 const setting={wikiId:e.id,mode:'local',allowAnonymous:true};await saveStartup(root,setting);assert.deepEqual(await readStartup(root),setting);
 for(const invalid of [{...setting,password:'secret'},{...setting,mode:'public'},{...setting,wikiId:'unknown'},{...setting,allowAnonymous:'true'}])await assert.rejects(saveStartup(root,invalid));
 assert.deepEqual(await readStartup(root),setting);await saveStartup(root,null);assert.equal(await readStartup(root),null);
});
test('approved local startup needs no Tailscale, starts only the selected wiki without dialogs and obeys STOP',async()=>{
 const {saveStartup,readStartup}=await import('../plugins/forgeshare/helper/ForgeShare.mjs');
 const folder=await wiki('Automatic local'),root=path.join(temp,'Automatic local settings');
 const e=await addLibraryEntry({root,location:folder,name:'Auto',kind:'folder'});
 await saveStartup(root,{wikiId:e.id,mode:'local',allowAnonymous:true});
 const input=new PassThrough();let finish,started=false;const finished=new Promise(r=>finish=r);
 await guiMain({root,startup:await readStartup(root),appMode:true,input,checkAddressPort:async()=>{},findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
  dialog:async(kind,message)=>assert.fail('No dialog expected: '+message),findTailscale:async()=>null,
  startSession:async options=>{started=true;assert.equal(options.localOnly,true);assert.equal(options.allowAnonymous,true);assert.equal(options.credentials,undefined);return {url:'http://127.0.0.1:'+options.port,finished,stop:async()=>finish()};},
  report:event=>{if(event.event==='ready')input.end();}
 });assert.ok(started);
});
test('startup with login asks for credentials and never silently downgrades to anonymous access',async()=>{
 const folder=await wiki('Automatic authenticated'),root=path.join(temp,'Automatic auth settings');
 const e=await addLibraryEntry({root,location:folder,name:'Protected',kind:'folder'});
 let credentials,passwords=0,started=false;
 await guiMain({root,startup:{wikiId:e.id,mode:'local',allowAnonymous:false},appMode:false,findTailscale:async()=>null,checkAddressPort:async()=>{},findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
  dialog:async(kind,message,initial)=>{if(kind==='choice')return initial[0];if(kind==='password'){passwords++;return 'pw';}if(kind==='text')return initial.startsWith('http:')?'':'owner';assert.fail(message);},
  startSession:async options=>{started=true;assert.equal(options.allowAnonymous,false);credentials=options.credentials;assert.match(await readFile(credentials,'utf8'),/owner,pw/);return {url:'http://127.0.0.1:'+options.port,finished:new Promise(()=>{}),stop:async()=>{}};}
 });assert.ok(started);assert.equal(passwords,2);await assert.rejects(readFile(credentials),{code:'ENOENT'});
});
