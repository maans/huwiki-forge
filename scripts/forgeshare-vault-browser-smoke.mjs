// Real TiddlyWiki + helper IPC + browser, with an isolated mock AI account.
// No personal vault, external model, Tailscale configuration or production wiki is used.
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {startWiki,stopChild,acquireLock} from '../plugins/forgeshare/helper/ForgeShare.mjs';
import {Vault} from '../plugins/forgeshare/helper/Vault.mjs';
import {parseTid} from './build-forgeshare.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core'),require=createRequire(import.meta.url);
const root=await mkdtemp(path.join(os.tmpdir(),'forgeshare-vault-browser-')),wiki=path.join(root,'wiki');let child,browser;
try{
 await mkdir(path.join(wiki,'tiddlers'),{recursive:true});await writeFile(path.join(wiki,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/filesystem','tiddlywiki/tiddlyweb']}));
 const tiddlers=[{title:'$:/DefaultTiddlers',text:'[[$:/plugins/huwiki/forgeshare/library]]'},{title:'$:/language',text:'$:/languages/huwiki-da-DK'}];
 for(const file of await readdir(new URL('../plugins/forgeshare/src/',import.meta.url)))if(file.endsWith('.tid'))tiddlers.push(parseTid(await readFile(new URL('../plugins/forgeshare/src/'+file,import.meta.url),'utf8')));
 tiddlers.push(JSON.parse(await readFile(new URL('../plugins/ai/dist/plugin.json',import.meta.url),'utf8')));
 await writeFile(path.join(wiki,'tiddlers/test.json'),JSON.stringify(tiddlers));
 let saved={},outbound=[];const vault=new Vault({root,lock:acquireLock,store:{read:async()=>structuredClone(saved),write:async value=>{saved=structuredClone(value);}},library:async()=>({entries:[{id:'wiki-one',name:'Musik',description:'Fælles sange',kind:'folder',shareUrl:'https://example.test.ts.net',location:'/private/example'},{id:'wiki-secret',name:'Unapproved diary',kind:'folder'}]}),fetcher:async(url,options)=>{outbound.push({url,options});return new Response(JSON.stringify(url.endsWith('/models')?{data:[{id:'local-test'}]}:{choices:[{message:{content:'Svar med æ, ø og å'}}]}));}});
 const connection=await vault.saveConnection({name:'Min AI',provider:'lmstudio',serverUrl:'http://127.0.0.1:1234',model:'local-test',secret:'test-only-api-secret'});
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=startWiki({wiki,port,allowAnonymous:true,boot:require.resolve('tiddlywiki/boot/boot.js'),bridge:{root,wikiId:'wiki-one',vault}});child=server.child;await server.ready;
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});const context=await browser.newContext(),page=await context.newPage();
 const origin='http://127.0.0.1:'+port;await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin);await page.waitForFunction(()=>!!window.$tw?.wiki);await page.getByRole('button',{name:'Forbind til ForgeShare',exact:true}).waitFor();
 let code;page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('Test tablet');else {code=d.message().match(/[A-F0-9]{8}$/)?.[0];await d.accept();}});
 await page.getByRole('button',{name:'Forbind til ForgeShare',exact:true}).click();
 await page.waitForTimeout(300);const pending=(await vault.pending())[0];assert.ok(pending);assert.equal(code,pending.code);
 await vault.approve(pending.id,[connection.id],['wiki-one']);await page.getByRole('button',{name:'Opdatér oversigt',exact:true}).click();await page.getByRole('heading',{name:'Musik',exact:true}).waitFor();assert.equal(await page.getByText('Unapproved diary').count(),0);
 const result=await page.evaluate(async id=>{const api=$tw.modules.execute('$:/plugins/huwiki/ai/forgeshare.js');return {list:await api.rpc('huPrivateVaultList'),models:await api.rpc('huPrivateVaultAiModels',id),reply:await api.rpc('huPrivateVaultAiGenerate',{connectionId:id,model:'local-test',messages:[{role:'user',content:'Hej'}],consent:{approved:true}}),cookies:document.cookie,storage:JSON.stringify(localStorage),body:document.body.innerText};},connection.id);
 assert.equal(result.list.connections[0].name,'Min AI');assert.deepEqual(result.models.models,['local-test']);assert.equal(result.reply.content,'Svar med æ, ø og å');assert.equal(JSON.stringify(result).includes('test-only-api-secret'),false);assert.equal(result.cookies.includes('ForgeShareAccess'),false);assert.equal(result.body.includes('/private/example'),false);assert.equal(outbound[1].options.headers.Authorization,'Bearer test-only-api-secret');
 await page.evaluate(()=>{$tw.wiki.addTiddler({title:'AI connection test',text:'<$huwiki-ai-connection-status/>'});$tw.wiki.setText('$:/StoryList','list',undefined,['AI connection test']);});
 const panel=page.locator('.huw-ai-connection-status');await panel.getByRole('button',{name:'Test AI-svar',exact:true}).waitFor();await panel.getByRole('button',{name:'Test AI-svar',exact:true}).click();await panel.getByText('✓ AI svarede: Svar med æ, ø og å',{exact:true}).waitFor();
 await vault.revoke(saved.grants[0].id);const denied=await page.evaluate(async()=>{try{await $tw.modules.execute('$:/plugins/huwiki/ai/forgeshare.js').rpc('huPrivateVaultList');return false;}catch{return true;}});assert.equal(denied,true);
 console.log('PASS: real wiki pairing, scoped live library, AI plugin model/chat request, HttpOnly approval and revocation.');
}finally{if(browser)await browser.close();if(child)await stopChild(child);await rm(root,{recursive:true,force:true});}
