/** Real browser: choose packages -> download -> offline boot -> native save. */
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{
 try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep))throw Error('outside root');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.mjs')?'text/javascript':'application/json');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.FORGE_HOME_URL||`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('assembler/?lang=da',base).href);
 await page.locator('#assemble:enabled').waitFor();
 await page.locator('#wiki-name').fill('Mit musikværksted');
 await page.locator('input[value="$:/plugins/huwiki/music"]').check();
 await page.locator('input[value="$:/plugins/huwiki/lessons-jazz"]').check();
 await page.locator('#theme').selectOption('$:/themes/huwiki/modern');
 assert.match(await page.locator('#summary').innerText(),/Tilføjes automatisk.*ABC/);
 if(process.env.FORGE_SCREENSHOTS){await mkdir(process.env.FORGE_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOTS,'forge-composer.png'),fullPage:true});}
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#assemble').click()]);
 const dir=await mkdtemp(path.join(tmpdir(),'forge-compose-')),saved=path.join(dir,'custom.html');await download.saveAs(saved);
 await context.close();
 const offline=await browser.newContext({acceptDownloads:true});await offline.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 const wiki=await offline.newPage();wiki.on('pageerror',e=>errors.push(e.message));
 await wiki.goto(pathToFileURL(saved).href);await wiki.waitForFunction(()=>window.$tw?.wiki && document.querySelector('.tc-tiddler-frame'));
 const state=await wiki.evaluate(()=>({name:$tw.wiki.getTiddlerText('$:/SiteTitle'),lang:$tw.wiki.getTiddlerText('$:/language'),theme:$tw.wiki.getTiddlerText('$:/theme'),plugins:Object.keys($tw.wiki.getPluginInfo('$:/plugins/huwiki/abc').tiddlers),libraries:$tw.wiki.getTiddlerText('$:/config/HUWikiPluginLibrary')}));
 assert.equal(state.name,'Mit musikværksted');assert.equal(state.lang,'$:/languages/da-DK');assert.equal(state.theme,'$:/themes/huwiki/modern');assert.ok(state.plugins.length);assert.ok(state.libraries);
 assert.equal(await wiki.locator('.huw-forge-home').getAttribute('href'),'https://forge.måns.dk/');
 assert.equal(await wiki.locator('.tc-error-form').count(),0);
 // Native saver round trip, after a real wiki state edit.
 const saving=wiki.waitForEvent('download');
 await wiki.evaluate(()=>{$tw.wiki.addTiddler({title:'Min prøve',text:'Gemmer lokalt'});$tw.rootWidget.dispatchEvent({type:'tm-save-wiki'});});
 const again=await saving;const savedAgain=path.join(dir,'saved.html');await again.saveAs(savedAgain);
 await wiki.goto(pathToFileURL(savedAgain).href);await wiki.waitForFunction(()=>window.$tw?.wiki && document.querySelector('.tc-tiddler-frame'));
 assert.equal(await wiki.evaluate(()=>$tw.wiki.getTiddlerText('Min prøve')),'Gemmer lokalt');
 console.log('PASS Danish composer, dependency summary, theme, responsive layout, download, offline boot, native save/reopen and F/libraries');
 assert.deepEqual(errors,[]);await offline.close();
 // A different starting Edition with a content dependency chain exercises base selection and helpers.
 const drawing=await browser.newPage();await drawing.goto(new URL('assembler/?edition=hupedia&lang=en',base).href);await drawing.locator('#assemble:enabled').waitFor();
 assert.equal(await drawing.locator('#edition').inputValue(),'hupedia');
 assert.equal(await drawing.locator('input[value="$:/plugins/huwiki/hupedia"]').isDisabled(),true);
 await drawing.locator('input[value="tegne-examples"]').check();
 assert.match(await drawing.locator('#summary').innerText(),/React/);
 const [d]=await Promise.all([drawing.waitForEvent('download'),drawing.locator('#assemble').click()]);
 const drawingFile=path.join(dir,'drawing.html');await d.saveAs(drawingFile);await drawing.goto(pathToFileURL(drawingFile).href);await drawing.waitForFunction(()=>window.$tw?.wiki && document.querySelector('.tc-tiddler-frame'));
 assert.equal(await drawing.evaluate(()=>$tw.wiki.getTiddlerText('$:/language')),'$:/languages/en-GB');
 assert.ok(await drawing.evaluate(()=>$tw.wiki.getPluginInfo('$:/plugins/itw/tw-excalidraw')));
 assert.equal(await drawing.locator('.tc-error-form').count(),0);
 console.log('PASS existing Edition selection, included markers, drawing content dependencies and combined wiki boot');
}finally{await browser.close();await new Promise(r=>server.close(r));}
