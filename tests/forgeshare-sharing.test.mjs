import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {addLibraryEntry,listLibrary,readSharing,saveSharing,chooseSharing,jsonCommand,findTailscale,libraryMain} from '../plugins/forgeshare/helper/ForgeShare.mjs';
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
