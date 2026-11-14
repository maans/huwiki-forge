/** Real Chromium acceptance: static HTTP -> native saver -> editable offline file.
 * FORGE_HOME_URL optionally checks a deployed Pages URL without writing to it.
 */
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{
 try {const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep))throw Error('outside root');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'application/json');
 res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.FORGE_HOME_URL||`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try {
 for(const [locale,expected]of [['da-DK','da-DK'],['da','da-DK'],['en-US','en-GB'],['de-DE','en-GB']]){const languageContext=await browser.newContext({locale});const probe=await languageContext.newPage();await probe.goto(base);await probe.locator('.forge-home').waitFor();assert.equal(await probe.evaluate(()=>$tw.wiki.getTiddlerText('$:/language')),'$:/languages/'+expected);assert.equal(await probe.evaluate(()=>$tw.wiki.getTiddlerText('$:/language/SideBar/Open/Caption')),expected==='da-DK'?'Åbne':'Open');assert.equal(await probe.evaluate(()=>$tw.wiki.getTiddlerText('$:/language/Buttons/ControlPanel/Caption')),expected==='da-DK'?'Kontrolpanel':'control panel');await languageContext.close();}
 console.log('PASS browser-language startup before the native language switcher starts, Danish variants and English fallback');
 const context=await browser.newContext({locale:'en-US',acceptDownloads:true,viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(base);assert.equal(response.status(),200);
 await page.waitForSelector('.forge-card');
 await page.locator('[data-plugin="forgeshare"]').getByRole('heading',{name:'Share your wikis'}).waitFor();
 const featured=JSON.parse(await readFile(path.join(root,'editions/forge/tiddlers/featured-plugins.json'),'utf8'))[0];
 assert.equal(await page.locator('[data-plugin="forgeshare"] a').count(),featured.available==='yes'?1:0);
 const catalog=JSON.parse(await readFile(path.join(root,'catalog/editions.json'),'utf8'));
 assert.equal(await page.locator('.forge-card[data-edition]').count(),catalog.editions.length);
 assert.equal(await page.getByRole('button',{name:'show sidebar',exact:true}).isVisible(),true);
 const columns=await page.locator('.forge-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 assert.equal(columns,3,'Three Edition cards across at 1440px');
 assert.equal(await page.getByRole('link',{name:'Forge your own wiki ↗',exact:true}).getAttribute('href'),'https://forge.måns.dk/assembler/?lang=en');
 assert.equal(await page.getByRole('link',{name:'Open InstantWiki ↗',exact:true}).getAttribute('href'),'https://forge.måns.dk/instantwiki/');
 assert.equal(await page.locator('.forge-grid > p .forge-card[data-edition]').count(),catalog.editions.length);
 assert.equal(await page.getByRole('button',{name:'Edit this tiddler',exact:true}).isVisible(),false,'HTTP guest view hides edit');
 await page.getByRole('button',{name:'show sidebar',exact:true}).click();
 assert.equal((await page.locator('.tc-site-title').innerText()).trim(),'TiddlyWiki Forge');
 const toolsTab=page.locator('.tc-sidebar-header [data-tab-title="$:/core/ui/SideBar/Tools"]');
 assert.equal(await toolsTab.isVisible(),false,'Tools hidden in reading mode');
 assert.equal(await page.locator('[data-tab-title="HUWiki Community"]').count(),0);
 assert.equal(await page.locator('.forge-library-links a').filter({hasText:'TiddlyWiki Community'}).getAttribute('href'),'https://tiddlywiki.com/#Community');
 const homeFrame=page.locator('[data-tiddler-title="HUWiki Forge"]');
 await homeFrame.getByRole('button',{name:'more',exact:true}).click();
 await homeFrame.getByRole('button',{name:'Reading / Editing',exact:true}).click();
 await homeFrame.getByRole('button',{name:'Edit this tiddler',exact:true}).waitFor({state:'visible'});
 await toolsTab.waitFor({state:'visible'});
 await toolsTab.click();
 await homeFrame.getByRole('button',{name:'more',exact:true}).click();
 await homeFrame.getByRole('button',{name:'Reading / Editing',exact:true}).click();
 await homeFrame.getByRole('button',{name:'Edit this tiddler',exact:true}).waitFor({state:'hidden'});
 await toolsTab.waitFor({state:'hidden'});
 await page.locator('.tc-sidebar-header [data-tab-title="$:/core/ui/SideBar/Open"][aria-selected="true"]').waitFor();
 await page.getByRole('button',{name:'hide sidebar',exact:true}).click();
 await page.getByRole('button',{name:'show sidebar',exact:true}).waitFor({state:'visible'});
 console.log('PASS Tools returns in editing; reading hides Tools and switches an active Tools tab to Open');
 console.log('PASS original padlock in native More menu reversibly restores editing');
 for(const edition of catalog.editions)assert.equal(await page.locator(`[data-edition="${edition.id}"] .forge-card-action`).getAttribute('href'),'https://forge.måns.dk/assembler/?edition='+edition.id+'&lang=en');
 assert.ok((await page.locator('.forge-home').innerText()).includes('does not change the public website'));
 if(process.env.FORGE_SCREENSHOTS){await mkdir(process.env.FORGE_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOTS,'forge-home-en.png'),fullPage:true});}
 if(await page.getByRole('button',{name:'show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'show sidebar',exact:true}).click();
 assert.equal(await page.locator('.huw-forge-home').getAttribute('href'),'https://forge.måns.dk/');
 await page.getByRole('button',{name:'control panel',exact:true}).click();
 const languages=page.locator('select').filter({has:page.locator('option[value="$:/languages/da-DK"]')});
 await languages.selectOption('$:/languages/da-DK');
 await page.getByRole('heading',{name:'Form din næste wiki.',exact:true}).waitFor();
 assert.equal((await page.locator('.forge-card-action').first().innerText()).replace(/\s+/g,' '),'Vælg Edition ↗');
 assert.ok((await page.locator('.tc-site-subtitle').innerText()).includes('Skab din egen'));
 assert.equal(await toolsTab.isVisible(),false,'Danish Tools hidden in reading mode');
 await languages.selectOption('$:/languages/en-GB');
 await page.getByRole('heading',{name:'Forge your next wiki.',exact:true}).waitFor();
 await languages.selectOption('$:/languages/da-DK');
 console.log('PASS HTTP guest view, native Danish/English switch, catalog-derived cards and direct F link');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Gem din kopi af Forge ↓',exact:true}).click();
 const download=await downloadPromise;
 const dir=await mkdtemp(path.join(tmpdir(),'forge-home-'));const saved=path.join(dir,'Forge.html');await download.saveAs(saved);
 assert.ok((await readFile(saved,'utf8')).length>2_000_000);
 await context.close();
 const offline=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
 await offline.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 const local=await offline.newPage();local.setDefaultTimeout(15000);local.on('pageerror',e=>errors.push(e.message));
 await local.goto(pathToFileURL(saved).href);
 await local.getByRole('heading',{name:'Form din næste wiki.',exact:true}).waitFor();
 assert.equal(await local.locator('.forge-card[data-edition]').count(),catalog.editions.length);
 const frame=local.locator('[data-tiddler-title="HUWiki Forge"]');
 const edit=frame.locator('button[class*="Buttons%2Fedit"]');assert.equal(await edit.isVisible(),true,'Saved local copy is editable');
 // Exercise native draft editor and commit, then save/reopen the actual download.
 await edit.click();
 const draft=local.locator('.tc-tiddler-edit-frame');
 const editor=draft.locator('textarea.tc-edit-texteditor').first();
 // TiddlyWiki may use an iframe-backed text editor; interact with the native body editor.
 await local.waitForFunction(()=>{const frame=document.querySelector('.tc-tiddler-edit-frame');return !!frame?.querySelector('iframe')?.contentDocument?.querySelector('textarea')||Array.from(frame?.querySelectorAll('textarea.tc-edit-texteditor-body')||[]).some(e=>e.offsetWidth>0);});
 if(await draft.locator('iframe').count()){const body=draft.frameLocator('iframe').locator('textarea');await body.fill((await body.inputValue())+'\n\nFORGE-OFFLINE-EDIT');}
 else {const body=draft.locator('textarea.tc-edit-texteditor-body:visible');await body.fill((await body.inputValue())+'\n\nFORGE-OFFLINE-EDIT');}
 await draft.locator('button[class*="Buttons%2Fsave"]:not([class*="save-wiki"])').click();
 await local.getByText('FORGE-OFFLINE-EDIT',{exact:false}).first().waitFor();
 await local.waitForFunction(()=>!document.querySelector('.tc-tiddler-edit-frame')&&document.querySelectorAll('.forge-home').length===1);
 const [again]=await Promise.all([local.waitForEvent('download'),local.getByRole('button',{name:'Gem din kopi af Forge ↓',exact:true}).click()]);
 const second=path.join(dir,'Forge-edited.html');await again.saveAs(second);
 await local.goto(pathToFileURL(second).href);
 await local.getByText('FORGE-OFFLINE-EDIT',{exact:false}).first().waitFor();
 assert.equal(await local.locator('.forge-home').count(),1);
 console.log('PASS native download, offline reopen, preserved Danish, native edit, second save and reopen');
 for(const width of [1440,768,390]){
  await local.setViewportSize({width,height:1000});
  const overflow=await local.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false,`No horizontal overflow at ${width}px`);
 }
 if(process.env.FORGE_SCREENSHOTS){await local.setViewportSize({width:1440,height:1000});await local.screenshot({path:path.join(process.env.FORGE_SCREENSHOTS,'forge-home-da.png'),fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS desktop/tablet/mobile fit and no uncaught JavaScript errors');
 await offline.close();
} finally {await browser.close();await new Promise(r=>server.close(r));}
