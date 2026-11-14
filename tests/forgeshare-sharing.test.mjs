import test from 'node:test';
import {PassThrough} from 'node:stream';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {addLibraryEntry,listLibrary,readSharing,saveSharing,chooseSharing,confirmSavedSharing,jsonCommand,findTailscale,libraryMain,guiMain,forgetFailedSharing} from '../plugins/forgeshare/helper/ForgeShare.mjs';
async function setup(t){const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-sharing-'));t.after(()=>rm(root,{recursive:true,force:true}));const add=async name=>{const location=path.join(root,name);await mkdir(location);await writeFile(path.join(location,'index.html'),'<h1>Hello</h1>');return addLibraryEntry({root,location,name,kind:'site'});};return {root,add};}
test('sharing belongs to each item, cancellation preserves it and new items inherit nothing',async t=>{
 const {root,add}=await setup(t),a=await add('A'),b=await add('B');
 await saveSharing(root,{mode:'lan',allowAnonymous:true},a.id);await saveSharing(root,{mode:'funnel',allowAnonymous:true},b.id);
 assert.deepEqual(await readSharing(root,a.id),{mode:'lan',allowAnonymous:true});assert.deepEqual(await readSharing(root,b.id),{mode:'funnel',allowAnonymous:false});
 await assert.rejects(chooseSharing(root,a.id,async()=>{throw Object.assign(Error('cancel'),{cancelled:true});}));
 assert.equal((await readSharing(root,a.id)).mode,'lan');
 const c=await add('C');assert.equal(await readSharing(root,c.id),null);
 await chooseSharing(root,c.id,async(kind,message,choices)=>choices[0]);assert.equal((await readSharing(root,c.id)).mode,'tailscale');assert.equal((await readSharing(root,b.id)).mode,'funnel');
 await assert.rejects(saveSharing(root,{mode:'lan',allowAnonymous:true}));
});
test('saved connections offer reuse, change and cancel without silently reconnecting',async t=>{
 const {root,add}=await setup(t),a=await add('Saved'),b=await add('Other');
 await saveSharing(root,{mode:'tailscale',allowAnonymous:true},a.id);
 await saveSharing(root,{mode:'funnel',allowAnonymous:false},b.id);
 const saved=await readSharing(root,a.id);
 let prompted=0;
 const cancel=async(kind,message,choices)=>{
   assert.equal(kind,'choice');assert.match(message,/Saved/);
   assert.match(choices[0],/Tailscale/);assert.match(choices[1],/another sharing method/);
   prompted++;return choices[2];
 };
 await assert.rejects(confirmSavedSharing(root,a.id,saved,cancel),e=>e.cancelled===true);
 assert.equal(prompted,1);assert.deepEqual(await readSharing(root,a.id),saved);
 const reuse=await confirmSavedSharing(root,a.id,saved,async(_kind,_message,choices)=>choices[0]);
 assert.deepEqual(reuse,saved);
 const changed=await confirmSavedSharing(root,a.id,saved,async(_kind,_message,choices)=>{
   prompted++;return prompted===2?choices[1]:choices[1]; // Change, then choose home network.
 });
 assert.equal(changed.mode,'lan');
 assert.equal((await readSharing(root,b.id)).mode,'funnel');
});
test('GUI Share prompts again for a saved setting and can switch modes without losing other settings',async t=>{
 const {root,add}=await setup(t),entry=await add('Reusable site'),other=await add('Other site');
 await saveSharing(root,{mode:'tailscale',allowAnonymous:true},entry.id);
 await saveSharing(root,{mode:'funnel',allowAnonymous:false},other.id);
 let choiceCalls=0,started=0;
 await guiMain({root,libraryId:entry.id,quick:true,findTailscale:async options=>{
   assert.equal(options.optional,true);return null;
 },checkAddressPort:async()=>{},
   networkInterfaces:()=>({WiFi:[{address:'192.168.1.8',family:'IPv4',internal:false}]}),
   dialog:async(kind,message,options)=>{
     if(kind==='choice'){
       choiceCalls++;
       return choiceCalls===1?options[1]:choiceCalls===2?options[1]:options[0];
     }
     assert.equal(kind,'text',message);return '';
   },
   startSession:async options=>{
     started++;assert.equal(options.lanHost,'192.168.1.8');
     assert.equal(options.funnel,false);return sessionResult(options);
   }
 });
 assert.equal(choiceCalls,3);assert.equal(started,1);
 assert.equal((await readSharing(root,entry.id)).mode,'lan');
 assert.equal((await readSharing(root,other.id)).mode,'funnel');
});
test('old global settings migrate to existing items once without affecting future items',async t=>{
 const {root,add}=await setup(t),a=await add('Old');
 const file=path.join(root,'library.json'),data=JSON.parse(await readFile(file));data.sharing={mode:'lan',allowAnonymous:false};await writeFile(file,JSON.stringify(data));
 await listLibrary(root);assert.equal((await readSharing(root,a.id)).mode,'lan');assert.equal(JSON.parse(await readFile(file)).sharing,undefined);
 const b=await add('New');assert.equal(await readSharing(root,b.id),null);
});
test('Tailscale text and failed commands produce actionable errors without JSON diagnostics',async()=>{
 for(const run of [async()=>({stdout:'The Tailscale CLI failed to start: internal detail'}),async()=>({stdout:'null'}),async()=>{throw Error('private raw output');}]){
  await assert.rejects(jsonCommand('/test',['status','--json'],run),e=>e.message.includes('Open Tailscale')&&!/JSON|token|internal detail|private raw/.test(e.message));
 }
 assert.deepEqual(await jsonCommand('/test',[],async()=>({stdout:'{"BackendState":"Running"}'})),{BackendState:'Running'});
 const found=await findTailscale({platform:'darwin',env:{PATH:'/usr/bin:/bin'},exists:async file=>{if(file!=='/usr/local/bin/tailscale')throw Error('missing');}});assert.equal(found,'/usr/local/bin/tailscale');
});
test('devices handles disconnected Tailscale without presenting an empty or broken list',async t=>{
 const {root}=await setup(t),messages=[];
 await libraryMain('devices','',{root,findTailscale:async()=>'/test',readJSON:async()=>({BackendState:'NeedsLogin'}),dialog:async(k,m)=>messages.push(m),report:()=>{}});
 assert.equal(messages.length,1);assert.match(messages[0],/not connected/);
});

const occupiedFunnel={TCP:{443:{HTTPS:true},8443:{HTTPS:true},10000:{HTTPS:true}}};
function sessionResult(options,onStop=()=>{}) {
 let finish;const finished=new Promise(resolve=>finish=resolve);
 return {url:options.localOnly?`http://127.0.0.1:${options.port}`:options.lanHost?`http://${options.lanHost}:${options.port}`:'https://test.ts.net:21000',finished,stop:async()=>{onStop();finish();}};
}
test('occupied Funnel asks no codes; retry can choose private or home network, while Open remains local',async t=>{
 for(const next of ['tailscale','lan','local'])await t.test(next,async t=>{
  const {root,add}=await setup(t),entry=await add('Retry'),other=await add('Other');
  await saveSharing(root,{mode:'funnel',allowAnonymous:false},entry.id);
  await saveSharing(root,{mode:'tailscale',allowAnonymous:true},other.id);
  const common={root,libraryId:entry.id,quick:true,findTailscale:async()=>'/mock',readJSON:async()=>occupiedFunnel,checkAddressPort:async()=>{},findTiddlyWiki:async()=>assert.fail('Sites need no wiki runtime')};
  let info=0;
  await guiMain({...common,dialog:async(kind,message,options)=>{if(kind==='choice')return options[0];assert.equal(kind,'info','No codes before checking availability');assert.match(message,/Choose Share again/);assert.match(message,/10000/);assert.match(message,/443/);info++;},startSession:async()=>assert.fail('Occupied Funnel must not start')});
  assert.equal(info,1);assert.equal((await readSharing(root,entry.id)).mode,'funnel');assert.equal((await readSharing(root,other.id)).mode,'tailscale');
  let choices=0,started=0,stopped=0;
  await guiMain({...common,localOnly:next==='local',networkInterfaces:()=>({WiFi:[{address:'192.168.1.8',family:'IPv4',internal:false}]}),openAddress:async()=>{},
   findTailscale:async options=>{if(next!=='tailscale'){assert.equal(options.optional,true);return null;}return '/mock';},
   dialog:async(kind,message,options)=>{if(kind==='choice'){choices++;return options[choices===1?1:choices===2?(next==='lan'?1:0):0];}assert.equal(kind,'text',message);return '';},
   startSession:async options=>{started++;assert.equal(options.funnel,false);assert.equal(options.localOnly,next==='local');assert.equal(!!options.lanHost,next==='lan');return sessionResult(options,()=>stopped++);}
  });
  assert.equal(started,1);assert.ok(stopped>0);assert.equal(choices,next==='local'?0:3);
  assert.equal((await readSharing(root,entry.id))?.mode||null,next==='local'?'funnel':next);
 });
});
test('cancelled codes and failed launch release the saved choice and allow a successful retry',async t=>{
 for(const failure of ['cancel','launch'])await t.test(failure,async t=>{
  const {root,add}=await setup(t),entry=await add('Retry');await saveSharing(root,{mode:'funnel',allowAnonymous:false},entry.id);
  let codes=0,errors=0;const reports=[];
  await guiMain({root,libraryId:entry.id,quick:true,findTailscale:async()=>'/mock',readJSON:async()=>({}),checkAddressPort:async()=>{},
   appMode:true,input:new PassThrough(),report:event=>reports.push(event),
   dialog:async(kind,message,options)=>{if(kind==='password'){codes++;if(failure==='cancel')throw Object.assign(Error('Cancelled'),{cancelled:true});return 'visitor';}if(kind==='choice')return options[0];assert.equal(kind,'info');assert.equal(reports.at(-1).event,'failed','Failure reaches the app before the dialog');errors++;},
   startSession:async()=>{throw Error('Simulated start failure');}
  });assert.equal(codes,1);assert.equal(errors,failure==='cancel'?0:1);assert.equal((await readSharing(root,entry.id)).mode,'funnel');
  // Register/start locks from the failed attempt must not block the next local opening.
  let started=false;await guiMain({root,libraryId:entry.id,quick:true,localOnly:true,findTailscale:async()=>null,checkAddressPort:async()=>{},openAddress:async()=>{},dialog:async(kind,message)=>{assert.equal(kind,'text',message);return '';},startSession:async options=>{started=true;return sessionResult(options);}});assert.ok(started);
 });
});
test('failed trial restores the previous successful choice only for that item',async t=>{
 const {root,add}=await setup(t),entry=await add('Previously shared'),other=await add('Other');
 const before={mode:'tailscale',allowAnonymous:true},trial={mode:'funnel',allowAnonymous:false};
 await saveSharing(root,before,entry.id);await saveSharing(root,{mode:'lan',allowAnonymous:true},other.id);
 await saveSharing(root,trial,entry.id);
 await forgetFailedSharing(root,entry.id,trial,before);
 assert.deepEqual(await readSharing(root,entry.id),before);
 assert.equal((await readSharing(root,other.id)).mode,'lan');
});
test('failure recovery leaves a newer per-item choice intact',async t=>{
 const {root,add}=await setup(t),entry=await add('Choice');
 const failed={mode:'funnel',allowAnonymous:false};await saveSharing(root,failed,entry.id);await saveSharing(root,{mode:'lan',allowAnonymous:true},entry.id);
 await forgetFailedSharing(root,entry.id,failed);assert.equal((await readSharing(root,entry.id)).mode,'lan');
});
