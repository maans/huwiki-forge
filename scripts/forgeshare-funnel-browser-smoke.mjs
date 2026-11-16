// Headless acceptance against a real isolated TW server. Public HTTPS is routed
// through an isolated loopback TLS proxy to the local gateway: no Tailscale or public service is started.
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {request as httpRequest} from 'node:http';
import {createServer as createHTTPS} from 'node:https';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startSession,startCodeGateway,acquireLock,startWiki} from '../plugins/forgeshare/helper/ForgeShare.mjs';
import {Vault} from '../plugins/forgeshare/helper/Vault.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core'),require=createRequire(import.meta.url);
const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'forgeshare-browser-codes-'))),wiki=path.join(temp,'wiki'),credentials=path.join(temp,'login.csv');
let session,gateway,browser,tls,wikiChild;
let vaultData={};const vault=new Vault({root:temp,lock:acquireLock,store:{read:async()=>structuredClone(vaultData),write:async d=>{vaultData=structuredClone(d);}},library:async()=>({entries:[{id:'public-wiki',name:'Shared wiki',kind:'folder'}]})});
try {
 await mkdir(wiki);await writeFile(path.join(wiki,'tiddlywiki.info'),JSON.stringify({plugins:['tiddlywiki/filesystem','tiddlywiki/tiddlyweb']}));
 await writeFile(credentials,'username,password\nreader,rs\neditor,es\n',{mode:0o600});
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 session=await startSession({wiki,credentials,port,localOnly:true,codeRoles:true,bridge:{root:temp,wikiId:'public-wiki',vault},boot:require.resolve('tiddlywiki/boot/boot.js')},{startWiki:options=>{const started=startWiki(options);wikiChild=started.child;return started;}});
 const origin='https://wiki.test.ts.net:10000';gateway=await startCodeGateway({port,origin,readerCode:'read',editorCode:'edit',readerSecret:'rs',editorSecret:'es',language:'da',bridge:true});
 wikiChild.send({type:'bridge-origins',origins:[origin,new URL(gateway.ownerUrl).origin]});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),'-days','1','-subj','/CN=wiki.test.ts.net'],{stdio:'ignore'});
 tls=createHTTPS({key:await readFile(path.join(temp,'key.pem')),cert:await readFile(path.join(temp,'cert.pem'))},(req,res)=>{const headers={...req.headers};const q=httpRequest({host:'127.0.0.1',port:gateway.port,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});q.on('error',()=>{res.writeHead(502);res.end();});req.pipe(q);});
 await new Promise(r=>tls.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP wiki.test.ts.net 127.0.0.1:'+tls.address().port]});
 const context=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true});
 await context.route('**/*',route=>[origin,new URL(gateway.ownerUrl).origin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
 const page=await context.newPage();await page.goto(origin);assert.equal(await page.locator('input').count(),1);
 assert.equal(await page.locator('input').getAttribute('type'),'password');assert.equal(await page.locator('h1').innerText(),'Åbn wikien');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.FORGESHARE_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.FORGESHARE_PREVIEW_DIR,'ForgeShare-kodelogin.png')});
 await page.locator('input').fill('read');await page.getByRole('button',{name:'Åbn wiki',exact:true}).click();
 await page.waitForFunction(()=>window.$tw?.wiki?.getTiddlerText('$:/status/IsReadOnly')==='yes');
 const write=()=>page.evaluate(async()=>({status:(await fetch('/recipes/default/tiddlers/Browser%20note',{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'TiddlyWiki'},body:JSON.stringify({title:'Browser note',text:'Browser saved'})})).status}));
 assert.equal((await write()).status,403);
 const bridgeCall=(op,input={})=>page.evaluate(async({op,input})=>{const r=await fetch('/_forgeshare/bridge/'+op,{method:'POST',headers:{'Content-Type':'application/json','X-ForgeShare':'1'},body:JSON.stringify(input)});return {status:r.status,data:await r.json()};},{op,input});
 assert.equal((await bridgeCall('connections')).status,403,'Reader code is not AI permission');
 assert.equal((await bridgeCall('pair',{label:'Reader tablet'})).status,200);
 await vault.approve((await vault.pending())[0].id,[],['public-wiki']);
 assert.equal((await bridgeCall('library')).data.entries[0].name,'Shared wiki');
 assert.equal((await write()).status,403,'Vault approval does not grant wiki editing');

 await page.goto(origin+'/_forgeshare/login');await page.locator('input').fill('edit');await page.getByRole('button',{name:'Åbn wiki',exact:true}).click();
 await page.waitForFunction(()=>window.$tw?.wiki?.getTiddlerText('$:/status/IsReadOnly')==='no');assert.equal((await write()).status,204);
 await page.goto(gateway.ownerUrl);await page.waitForFunction(()=>window.$tw?.wiki?.getTiddlerText('$:/status/IsReadOnly')==='no');assert.equal((await write()).status,204);
 assert.equal((await bridgeCall('pair',{label:'Owner browser'})).status,200);
 console.log('PASS: mobile code login, reader denies write, editor saves, owner edits without entering a guest code.');
}finally{if(browser)await browser.close();if(tls)await new Promise(r=>{tls.close(r);tls.closeAllConnections();});if(gateway)await gateway.stop();if(session)await session.stop();await rm(temp,{recursive:true,force:true});}
