import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {addLibraryEntry,listLibrary,editLibraryEntry,libraryExport,writeLibraryExport,registerWiki,readRegistry,startSession,libraryMain,discoverWikiFolders,defaultDiscoveryRoots,addDiscoveredFolders,dialogCommand} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require=createRequire(import.meta.url),{TiddlyWiki}=require('tiddlywiki/boot/boot.js');
let temp;
test.before(async()=>{temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-library-')));});
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

test('discovery finds wiki folders without following links, scanning contents or adding anything',async()=>{
 const {root,folder}=await fixture('discovery');const base=path.dirname(folder);
 const wiki=async location=>{await mkdir(location,{recursive:true});await writeFile(path.join(location,'tiddlywiki.info'),'{}');return location;};
 const second=await wiki(path.join(base,'Documents','Notes'));
 await wiki(path.join(folder,'backup'));
 await wiki(path.join(base,'.hidden','Hidden wiki'));
 await wiki(path.join(base,'node_modules','Dependency'));
 await wiki(path.join(base,'Some.app','Contents','Packaged wiki'));
 const invalid=await wiki(path.join(base,'Invalid'));await writeFile(path.join(invalid,'tiddlywiki.info'),'not json');
 const outside=await wiki(path.join(temp,'outside search'));
 await symlink(outside,path.join(base,'Shortcut'),process.platform==='win32'?'junction':'dir');
 const result=await discoverWikiFolders({roots:[base,base,path.join(base,'missing')],timeoutMs:60000});
 assert.deepEqual(new Set(result.entries.map(e=>e.location)),new Set([folder,second]));
 assert.deepEqual(await readRegistry(root),{version:1,wikis:[]});
 await assert.rejects(readFile(path.join(root,'library.json')),{code:'ENOENT'});
 assert.deepEqual((await discoverWikiFolders({roots:[base],known:[folder,second],timeoutMs:60000})).entries,[]);
 assert.deepEqual(defaultDiscoveryRoots(base),['Wikis','Documents','Desktop','Downloads'].map(name=>path.join(base,name)));
});
test('discovery respects depth, directory, entry, result and time limits',async()=>{
 const {folder}=await fixture('search limits'),base=path.dirname(folder);
 for(const options of [{maxDepth:0},{maxDirectories:1},{maxEntries:1},{maxResults:0},{timeoutMs:0}]) {
  const result=await discoverWikiFolders({roots:[base],...options});assert.equal(result.limited,true);assert.deepEqual(result.entries,[]);
 }
 const result=await discoverWikiFolders({roots:[folder],maxResults:1});assert.equal(result.entries.length,1);
});
test('suggestions add only accepted folders, disambiguate names and revalidate atomically',async()=>{
 const {root,folder}=await fixture('accept suggestions');
 const other=path.join(path.dirname(folder),'other','Wiki folder');await mkdir(other,{recursive:true});await writeFile(path.join(other,'tiddlywiki.info'),'{}');
 const found=await discoverWikiFolders({roots:[path.dirname(folder)]});
 assert.equal(found.entries.length,2);
 const added=await addDiscoveredFolders(found.entries,root);
 assert.deepEqual(added.map(e=>e.name).sort(),['Wiki folder','Wiki folder (2)']);
 assert.deepEqual(await addDiscoveredFolders(found.entries,root),[]);
 assert.deepEqual(await readRegistry(root),{version:1,wikis:[]});
 const freshRoot=path.join(path.dirname(root),'other settings');await rm(path.join(other,'tiddlywiki.info'));
 await assert.rejects(addDiscoveredFolders([{name:'First',location:folder},{name:'Gone',location:other}],freshRoot));
 assert.equal((await listLibrary(freshRoot)).entries.length,0,'A changed candidate must not leave a partially imported selection');
});
test('Add offers discovery and only saves the chosen suggestion; cancel leaves the library unchanged',async()=>{
 const {root,folder}=await fixture('discovery dialog');const reports=[];
 const second=path.join(path.dirname(folder),'Second');await mkdir(second);await writeFile(path.join(second,'tiddlywiki.info'),'{}');
 const third=path.join(path.dirname(folder),'Leave alone');await mkdir(third);await writeFile(path.join(third,'tiddlywiki.info'),'{}');
 const result={entries:[{name:'My wiki',location:folder},{name:'Other wiki',location:second},{name:'Unselected',location:third}],limited:false,unreadable:0};
 await libraryMain('add','',{root,discover:async()=>result,report:r=>reports.push(r),dialog:async(kind,message,choices)=>{
  if(kind==='choice'){assert.match(choices[0],/^Find/);return choices[0];}
  assert.equal(kind,'choices');assert.match(message,/Intet bliver startet eller delt/);return choices.slice(0,2).join('\r\n');
 }});
 assert.equal((await listLibrary(root)).entries.length,2);assert.deepEqual(reports,[{ok:true}]);
 const before=await readFile(path.join(root,'library.json'),'utf8');
 await libraryMain('add','',{root,discover:async()=>result,report:()=>{},dialog:async(kind,message,choices)=>{
  if(kind==='choice')return choices[0];throw Object.assign(Error('cancel'),{cancelled:true});
 }});
 assert.equal(await readFile(path.join(root,'library.json'),'utf8'),before);
});
test('multi-selection dialogs carry untrusted long labels as data on all platforms',()=>{
 const labels=['Wiki " & $(example) æ','Second wiki'];
 const mac=dialogCommand('darwin','choices','Choose',labels);
 assert.match(mac[1][1],/multiple selections allowed/);assert.deepEqual(mac[1].slice(-2),labels);
 const linux=dialogCommand('linux','choices','Choose',labels);assert.ok(linux[1].includes('--checklist'));
 const many=Array.from({length:100},(_,i)=>i+' — '+labels[0].repeat(10));
 const win=dialogCommand('win32','choices','Choose',many);
 assert.ok(win[1].join(' ').length<30000,'Large result lists must not overflow the Windows command line');
 assert.deepEqual(JSON.parse(Buffer.from(win[2],'base64').toString()).initial,many);
 const source=Buffer.from(win[1].at(-1),'base64').toString('utf16le');assert.ok(!source.includes(labels[0]));assert.match(source,/CheckedListBox/);
});
test('native discovery dialog scripts compile without opening UI',()=>{
 if(process.platform==='darwin') {
  const script=dialogCommand('darwin','choices','Choose',['One','Two'])[1][1];
  const result=spawnSync('/usr/bin/osacompile',['-o',path.join(temp,'choices.scpt'),'-e',script],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
 }else if(process.platform==='win32') {
  const script=Buffer.from(dialogCommand('win32','choices','Choose',['One','Two'])[1].at(-1),'base64').toString('utf16le');
  const parser='$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors);if($errors.Count){Write-Output $errors;exit 1}';
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(parser,'utf16le').toString('base64')],{input:script,encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(result.status,0,result.stdout+result.stderr);
 }
});
