import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {promisify} from 'node:util';
import {findTailscale,startSession,stopChild} from '../plugins/forgeshare/helper/ForgeShare.mjs';

const execute=promisify(execFile),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const appBinary='/Applications/Tailscale.app/Contents/MacOS/Tailscale';

test('Mac discovery prefers the direct Tailscale app binary over PATH and standard shell wrappers',async()=>{
 const checked=[];
 const found=await findTailscale({platform:'darwin',env:{PATH:'/custom/bin:/usr/local/bin:/opt/homebrew/bin'},exists:async(file,mode)=>{checked.push(file);assert.equal(mode,constants.X_OK);}});
 assert.equal(found,appBinary);assert.deepEqual(checked,[appBinary]);
});

test('Mac discovery falls back to installed CLI and makes missing Tailscale optional only when requested',async()=>{
 const checked=[];
 const exists=async(file,mode)=>{checked.push(file);assert.equal(mode,constants.X_OK);if(file!=='/usr/local/bin/tailscale')throw Object.assign(Error('not installed'),{code:'ENOENT'});};
 assert.equal(await findTailscale({platform:'darwin',env:{PATH:''},exists}),'/usr/local/bin/tailscale');
 assert.deepEqual(checked,[appBinary,'/usr/local/bin/tailscale']);
 const missing={platform:'darwin',env:{PATH:''},exists:async()=>{throw Object.assign(Error('not installed'),{code:'ENOENT'});}};
 assert.equal(await findTailscale({...missing,optional:true}),null);
 await assert.rejects(findTailscale(missing));
});

class WikiChild extends EventEmitter {
 exitCode=null;signalCode=null;kills=[];
 kill(signal){this.kills.push(signal);queueMicrotask(()=>{this.signalCode=signal;this.emit('exit',null,signal);});return true;}
}
async function running(pid) {
 try {
  process.kill(pid,0);
  const {stdout}=await execute('ps',['-p',String(pid),'-o','stat=']);
  return !!stdout.trim() && !stdout.trim().startsWith('Z');
 }catch{return false;}
}
async function waitUntil(check,message) {
 const deadline=Date.now()+5000;
 while(!await check()){if(Date.now()>deadline)assert.fail(message);await pause(25);}
}
async function wrappers(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-process-'));
 const wrapper=path.join(root,'wrapper.sh'),worker=path.join(root,'worker.mjs'),groups=[];
 await writeFile(wrapper,'#!/bin/sh\n"$FORGESHARE_TEST_NODE" "$FORGESHARE_TEST_WORKER" "$FORGESHARE_TEST_MODE" &\nwait "$!"\n');
 await writeFile(worker,`const mode=process.argv[2];
setInterval(()=>{},1000);
if(mode==='delayed')process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),250));
if(mode==='ignores')process.on('SIGTERM',()=>{});
process.stdout.write(JSON.stringify({pid:process.pid})+'\\n');
`);
 t.after(async()=>{
  let firstError;
  for(const child of groups){try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')firstError ||= error;}}
  await rm(root,{recursive:true,force:true});
  if(firstError)throw firstError;
 });
 function launch(mode='normal',options={}) {
  const child=spawn('/bin/sh',[wrapper],{...options,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,FORGESHARE_TEST_NODE:process.execPath,FORGESHARE_TEST_WORKER:worker,FORGESHARE_TEST_MODE:mode}});
  groups.push(child);
  child.ready=new Promise((resolve,reject)=>{
   let output='';const timer=setTimeout(()=>reject(Error('Synthetic child did not become ready')),5000);
   child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(output.split('\n')[0]));}catch(error){reject(error);}}});
   child.once('error',error=>{clearTimeout(timer);reject(error);});
   child.once('exit',()=>{clearTimeout(timer);reject(Error('Synthetic wrapper exited before ready'));});
  });
  return child;
 }
 return {launch};
}
async function serveSession(t,mode='normal') {
 const {launch}=await wrappers(t),server=new WikiChild(),hostname='synthetic.example.ts.net';let serve;
 const preserved={TCP:{443:{HTTPS:true}},Web:{[hostname+':443']:{Handlers:{'/':{Proxy:'http://127.0.0.1:11434'}}}}};
 const shared={...preserved,Foreground:{test:{TCP:{21808:{HTTPS:true}},Web:{[hostname+':21808']:{Handlers:{'/':{Proxy:'http://127.0.0.1:20808'}}}}}}};
 const deps={checkPort:async()=>{},checkAddressPort:async()=>{},probe:async()=>401,
  startWiki:()=>({child:server,ready:Promise.resolve({address:'127.0.0.1',port:20808})}),
  readJSON:async(executable,args)=>{
   assert.equal(executable,'/synthetic/tailscale');
   if(args[0]==='status')return {BackendState:'Running',Self:{DNSName:hostname+'.'}};
   assert.deepEqual(args,['serve','status','--json']);
   if(serve)await serve.ready;
   return structuredClone(serve?shared:preserved);
  },
  spawn:(executable,args,options)=>{
   assert.equal(executable,'/synthetic/tailscale');assert.deepEqual(args,['serve','--https=21808','http://127.0.0.1:20808']);
   assert.equal(options.detached,true,'Only our Serve wrapper receives its own process group');
   serve=launch(mode,options);return serve;
  }
 };
 const session=await startSession({tailscale:'/synthetic/tailscale',port:20808,httpsPort:21808},deps);
 return {session,serve,server,worker:(await serve.ready).pid,launch};
}

test('owned Serve stop terminates a real shell wrapper and its child while preserving unrelated groups',{skip:process.platform==='win32'},async t=>{
 const {session,serve,worker,server,launch}=await serveSession(t);
 const unrelated=launch(),otherWorker=(await unrelated.ready).pid;
 assert.ok(await running(serve.pid));assert.ok(await running(worker));
 await Promise.all([session.stop(),session.stop()]);await session.finished;
 await waitUntil(async()=>!await running(serve.pid) && !await running(worker),'Owned wrapper or child survived Stop');
 assert.ok(await running(unrelated.pid));assert.ok(await running(otherWorker));
 assert.deepEqual(server.kills,['SIGTERM']);
 await session.stop();await stopChild(serve);
 assert.ok(await running(unrelated.pid));assert.ok(await running(otherWorker));
});

test('an owned wrapper exiting first still causes its remaining child and wiki to stop',{skip:process.platform==='win32'},async t=>{
 const {session,serve,worker,server}=await serveSession(t);
 assert.ok(await running(worker));serve.kill('SIGTERM');
 await session.finished;
 await waitUntil(async()=>!await running(worker),'The exited wrapper left its child running');
 assert.deepEqual(server.kills,['SIGTERM']);
});

test('owned group stop waits for a delayed descendant even when the wrapper has already exited',{skip:process.platform==='win32'},async t=>{
 const {session,worker}=await serveSession(t,'delayed');
 const start=Date.now();await session.stop();await session.finished;
 assert.ok(Date.now()-start>=200,'Stop returned before the descendant completed its delayed shutdown');
 assert.equal(await running(worker),false);
});

test('owned group stop force-terminates a descendant that ignores graceful shutdown',{skip:process.platform==='win32'},async t=>{
 const {session,worker}=await serveSession(t,'ignores');
 const start=Date.now();await session.stop();await session.finished;
 assert.ok(Date.now()-start<6000,'Forced cleanup must remain bounded');
 assert.equal(await running(worker),false);
});

test('a transient permission result while probing an exiting group does not abandon cleanup',{skip:process.platform==='win32'},async t=>{
 const {session,serve,worker,server}=await serveSession(t),kill=process.kill;let injected=false;
 process.kill=function(pid,signal){if(pid===-serve.pid && signal===0 && !injected){injected=true;throw Object.assign(Error('Group is disappearing'),{code:'EPERM'});}return kill.call(process,pid,signal);};
 try{await session.stop();await session.finished;}finally{process.kill=kill;}
 assert.ok(injected);assert.equal(await running(worker),false);assert.deepEqual(server.kills,['SIGTERM']);
});

test('a Serve cleanup failure still stops the wiki and rejects both lifecycle promises with the original error',{skip:process.platform==='win32',timeout:5000},async t=>{
 const {session,serve,worker,server}=await serveSession(t),kill=process.kill;
 const denied=Object.assign(Error('Synthetic Serve cleanup denied'),{code:'EPERM'});let attempts=0,results;
 process.kill=function(pid,signal){if(pid===-serve.pid && signal==='SIGTERM'){attempts++;throw denied;}return kill.call(process,pid,signal);};
 try{results=await Promise.allSettled([session.stop(),session.finished]);}finally{process.kill=kill;}
 assert.equal(attempts,1);assert.deepEqual(server.kills,['SIGTERM'],'The failed Serve cleanup must not prevent backend cleanup');
 for(const result of results){assert.equal(result.status,'rejected');assert.equal(result.reason,denied);}
 assert.ok(await running(worker),'The denied synthetic signal is real; fixture cleanup will remove only its own group');
 await assert.rejects(session.stop(),error=>error===denied);assert.equal(attempts,1);
});

test('ordinary child shutdown signals only that child, never an unowned process group',{skip:process.platform==='win32'},async t=>{
 const {launch}=await wrappers(t),wrapper=launch(),worker=(await wrapper.ready).pid;
 await Promise.all([stopChild(wrapper),stopChild(wrapper)]);
 await waitUntil(async()=>!await running(wrapper.pid),'Ordinary wrapper did not stop');
 assert.ok(await running(worker),'A group not owned by ForgeShare Serve must remain untouched');
 await stopChild(wrapper);assert.ok(await running(worker));
});
