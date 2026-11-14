import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {addLibraryEntry,listLibrary,editLibraryEntry,libraryExport,writeLibraryExport,registerWiki,readRegistry,startSession,libraryMain} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require=createRequire(import.meta.url),{TiddlyWiki}=require('tiddlywiki/boot/boot.js');
let temp;
test.before(async()=>{temp=await mkdtemp(path.join(os.tmpdir(),'forgeshare-library-'));});
test.after(async()=>{await rm(temp,{recursive:true,force:true});});
async function fixture(name) {
 const dir=path.join(temp,name);await mkdir(dir);
 const html=path.join(dir,'Private notes æ.html'),folder=path.join(dir,'Wiki folder'),root=path.join(dir,'settings');
 await writeFile(html,'<!doctype html><meta name="application-name" content="TiddlyWiki">');
 await mkdir(folder);await writeFile(path.join(folder,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/tiddlyweb','tiddlywiki/filesystem']}));
 return {root,html,folder};
}
test('adding local HTML/folders persists stable IDs without installing or sharing; duplicate paths reuse entries',async()=>{
 const {root,html,folder}=await fixture('local');
 const a=await addLibraryEntry({root,location:html,kind:'html',name:'Notes'});
 const b=await addLibraryEntry({root,location:folder,kind:'folder',name:'Project'});
 assert.equal((await addLibraryEntry({root,location:html,kind:'html',name:'Other name'})).id,a.id);
 const library=await listLibrary(root);assert.equal(library.entries.length,2);assert.ok(library.entries.every(e=>e.available));
 assert.equal((await listLibrary(root)).id,library.id);
 assert.deepEqual(await readRegistry(root),{version:1,wikis:[]},'No port registry or Tailscale setup for adding a wiki');
 await editLibraryEntry(a.id,{name:'My notes',description:'Personal notebook'},root);
 assert.equal((await listLibrary(root)).entries.find(e=>e.id===a.id).description,'Personal notebook');
 await assert.rejects(editLibraryEntry(b.id,{name:'My notes',description:''},root));
 await rm(html);const missing=(await listLibrary(root)).entries.find(e=>e.id===a.id);assert.equal(missing.available,false);assert.equal(missing.name,'My notes');
});
test('existing shared profiles join the library and renaming preserves ports and ID',async()=>{
 const {root,folder}=await fixture('legacy');
 const p=await registerWiki({root,wiki:folder,name:'Old name',localOnly:true},{checkAddressPort:async()=>{},readJSON:async()=>assert.fail('Local setup must not query Tailscale')});
 const library=await listLibrary(root);assert.equal(library.entries[0].id,p.id);
 await editLibraryEntry(p.id,{name:'New name',description:'Renamed'},root);
 assert.deepEqual((await readRegistry(root)).wikis[0],{...p,name:'New name'});
 assert.equal((await listLibrary(root)).entries.length,1);
});
test('selected export is portable and inert, omits private paths and addresses by default and renders in actual TW',async()=>{
 const {root,html,folder}=await fixture('export');
 const a=await addLibraryEntry({root,location:html,kind:'html',name:'Notes <$action-sendmessage $message="tm-close-all-tiddlers"/>',description:'<script>alert(1)</script> [[Secret]]'});
 await addLibraryEntry({root,location:folder,kind:'folder',name:'Unselected private project'});
 const library=await listLibrary(root);library.entries[0].shareUrl='https://computer.example.ts.net:21000';
 const now=new Date('2026-11-14T12:00:00Z'),out=libraryExport(library,[a.id],{now});
 assert.equal(out.length,2);const text=JSON.stringify(out);
 for(const value of [html,folder,'Unselected private project','https://computer.example.ts.net','password','credentials'])assert.ok(!text.includes(value),value);
 assert.equal(out[1].type,'text/plain');assert.equal(out[1]['forgeshare-snapshot'],now.toISOString());
 assert.equal(libraryExport(library,[a.id],{includeAddresses:true})[1]['forgeshare-address'],library.entries[0].shareUrl);
 library.entries[0].shareUrl='file:///private/secret';assert.equal(libraryExport(library,[a.id],{includeAddresses:true})[1]['forgeshare-address'],'');
 assert.throws(()=>libraryExport(library,[]));assert.throws(()=>libraryExport(library,['unknown']));
 const tw=TiddlyWiki();tw.boot.argv=[path.join(temp,'render')];await new Promise(resolve=>tw.boot.boot(resolve));
 for(const t of out)tw.wiki.addTiddler(t);
 for(const [lang,expected] of [['$:/languages/huwiki-da-DK','Mine wikier'],['$:/languages/en-GB','My wikis']]) {
  tw.wiki.addTiddler({title:'$:/language',text:lang});const rendered=tw.wiki.renderText('text/html','text/vnd.tiddlywiki','<$transclude $tiddler="'+out[0].title+'" $mode="block"/>');
  assert.match(rendered,new RegExp(expected));assert.ok(rendered.includes('&lt;script&gt;'),rendered);assert.ok(!rendered.includes('<script>'));assert.ok(rendered.includes('Secret'));assert.ok(!rendered.includes('Filter error'));
 }
 const filename=path.join(temp,'selected overview æ.json');await writeLibraryExport(filename,library,[a.id]);const before=await readFile(filename,'utf8');
 await assert.rejects(writeLibraryExport(filename,library,[a.id]),{code:'EEXIST'});assert.equal(await readFile(filename,'utf8'),before);
 await assert.rejects(writeLibraryExport(filename+'.html',library,[a.id]));
 const again=libraryExport(library,[a.id]);assert.equal(again[0].title,out[0].title);assert.equal(again[1].title,out[1].title);
});
test('cancelled export writes nothing and never changes the selected wikis',async()=>{
 const {root,html}=await fixture('cancel');const e=await addLibraryEntry({root,location:html,kind:'html',name:'Notes'});let reports=[];
 await libraryMain('export',Buffer.from(JSON.stringify({ids:[e.id]})).toString('base64'),{root,report:v=>reports.push(v),dialog:async()=>{throw Object.assign(Error('cancel'),{cancelled:true});}});
 assert.deepEqual(reports,[{cancelled:true}]);assert.match(await readFile(html,'utf8'),/TiddlyWiki/);
});
test('local-only real server requires login and never invokes Tailscale',async()=>{
 const {folder}=await fixture('local server');const credentials=path.join(temp,'local-login.csv');await writeFile(credentials,'username,password\nalice,a-long-test-password\n',{mode:0o600});
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const session=await startSession({localOnly:true,wiki:folder,credentials,port,boot:require.resolve('tiddlywiki/boot/boot.js')},{readJSON:async()=>assert.fail('Tailscale must not be read'),spawn:()=>assert.fail('Tailscale must not start')});
 try {
  assert.equal(session.url,'http://127.0.0.1:'+port);assert.equal((await fetch(session.url+'/status')).status,401);
  assert.equal((await fetch(session.url+'/status',{headers:{Authorization:'Basic '+Buffer.from('alice:a-long-test-password').toString('base64')}})).status,200);
 }finally{await session.stop();await session.finished;}
});
