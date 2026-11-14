// Headless, isolated local wiki. No user browser/profile, external network or services.
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assembleHtml} from '../assembler/assemble.mjs';
import {libraryExport} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root=path.resolve(import.meta.dirname,'..');
const plugin=JSON.parse(await readFile(path.join(root,'plugins/forgeshare/dist/plugin.json'),'utf8'));
const title='$:/plugins/huwiki/forgeshare/home';
const html=assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[plugin,
  {title:'$:/DefaultTiddlers',text:'[['+title+']]'},
  {title:'$:/language',text:'$:/languages/huwiki-da-DK'},
  {title:'$:/config/AutoSave',text:'no'},
  {title:'$:/state/sidebar',text:'no'}]);
const dir=await mkdtemp(path.join(tmpdir(),'forgeshare-preview-'));
const file=path.join(dir,'preview.html');await writeFile(file,html);
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:1200},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>/^(file:|data:)/.test(route.request().url())?route.continue():route.abort());
 await page.goto(pathToFileURL(file).href);
 const panel=page.locator('.hu-forgeshare'); await panel.waitFor();
 assert.equal(await panel.locator('h1').innerText(),'Dit indhold. Dine forbindelser.');
 assert.equal(await panel.locator('.hu-share-downloads a').count(),3);
 assert.equal(await panel.locator('details[open]').count(),0);
 const download=await panel.locator('.hu-share-downloads').boundingBox();
 assert.ok(download.y<700,'Downloads must remain near the top, after the server-type cards and before long help text');
 const capture=async name=>{if(process.env.FORGESHARE_PREVIEW_DIR){await mkdir(process.env.FORGESHARE_PREVIEW_DIR,{recursive:true});await panel.screenshot({path:path.join(process.env.FORGESHARE_PREVIEW_DIR,name+'.png')});}};
 await capture('ForgeShare-dansk');
 // The browser checks actual downloadable bytes for all three platforms.
 for(const platform of ['mac','windows','linux']) {
  const href=await panel.locator(`[download="ForgeShare-${platform}.zip"]`).getAttribute('href');
  const bytes=Buffer.from(href.split(',')[1],'base64');
  assert.ok(bytes.equals(await readFile(path.join(root,`plugins/forgeshare/dist/ForgeShare-${platform}.zip`))));
 }
 await page.setViewportSize({width:390,height:844});
 const bounds=await panel.boundingBox(); assert.ok(bounds.x+bounds.width<=391,'Panel must fit inside the mobile viewport');
 const overflow=await panel.evaluate(el=>el.scrollWidth-el.clientWidth);
 assert.ok(overflow<3,'Mobile guide must not scroll horizontally');
 await capture('ForgeShare-mobil');
 const firstSummary=panel.locator('summary').first();await firstSummary.focus();await page.keyboard.press('Enter');
 assert.equal(await panel.locator('details[open]').count(),1,'Help supports native keyboard activation');
 await page.evaluate(()=>window.$tw.wiki.setText('$:/language','text',undefined,'$:/languages/en-GB'));
 await page.waitForFunction(()=>document.querySelector('.hu-forgeshare h1')?.textContent==='Your content. Your connections.');
 assert.equal(await panel.locator('.hu-share-downloads').count(),1,'Language refresh must not duplicate content');
 await page.setViewportSize({width:1100,height:1200});await capture('ForgeShare-english');
 // Exercise the normal core import review and Import button with a selected export.
 const library={id:'11111111-1111-4111-8111-111111111111',entries:[
  {id:'22222222-2222-4222-8222-222222222222',name:'Projektwiki',description:'Fælles noter og idéer',kind:'folder',location:'/private/project',shareUrl:'https://example.example.ts.net:21000'},
  {id:'33333333-3333-4333-8333-333333333333',name:'Private noter',description:'Skal ikke eksporteres',kind:'html',location:'/private/notes.html'}]};
 const importSelected=async exported=>{
  await page.evaluate(tiddlers=>{
   const find=w=>w.parseTreeNode?.type==='navigator'?w:(w.children||[]).map(find).find(Boolean);
   const navigator=find(window.$tw.rootWidget);if(!navigator)throw Error('Navigator not found');
   navigator.dispatchEvent({type:'tm-import-tiddlers',param:JSON.stringify(tiddlers)});
  },exported);
  await page.getByRole('button',{name:'Import',exact:true}).first().click();
  await page.waitForFunction(()=>window.$tw.wiki.getTiddler('$:/Import')?.fields.status==='complete');
 };
 let exported=libraryExport(library,[library.entries[0].id],{includeAddresses:true});
 await importSelected(exported);
 await page.evaluate(title=>window.$tw.wiki.setText('$:/StoryList','list',undefined,[title]),exported[0].title);
 const overview=page.locator('.tc-tiddler-frame').filter({has:page.locator('h2',{hasText:'My wikis'})});
 await overview.waitFor();assert.ok((await overview.innerText()).includes('Projektwiki'));
 assert.ok(!(await overview.innerText()).includes('Private noter'));
 assert.equal(await overview.getByRole('link',{name:'Open shared address'}).getAttribute('href'),library.entries[0].shareUrl);
 library.entries[0].description='Opdateret beskrivelse';exported=libraryExport(library,[library.entries[0].id]);
 await importSelected(exported);
 await page.evaluate(title=>window.$tw.wiki.setText('$:/StoryList','list',undefined,[title]),exported[0].title);
 await page.waitForFunction(()=>document.body.textContent.includes('Opdateret beskrivelse'));
 assert.equal(await overview.getByRole('link',{name:'Open shared address'}).count(),0,'A fresh private export clears a previously imported address');
 assert.equal(await page.evaluate(()=>window.$tw.wiki.filterTiddlers('[has[forgeshare-id]]').length),1,'Reimport updates the existing entry');
 // Each exported information page has content and a readable title/date.
 await page.evaluate(title=>window.$tw.wiki.setText('$:/StoryList','list',undefined,[title]),exported[1].title);
 await page.waitForFunction(()=>document.body.textContent.includes('The wiki’s contents have not been copied here.'));
 const details=page.locator('.tc-tiddler-frame').filter({has:page.locator('h2',{hasText:'Projektwiki'})});
 assert.ok(!(await details.innerText()).includes('22222222-2222'));
 assert.match(await details.innerText(),/Snapshot saved:.*\d{4}-\d{2}-\d{2}/s);
 if(process.env.FORGESHARE_PREVIEW_DIR)await details.screenshot({path:path.join(process.env.FORGESHARE_PREVIEW_DIR,'ForgeShare-wiki-details.png')});
 for(const language of ['da','en']) {
  await page.goto(pathToFileURL(path.join(root,'plugins/forgeshare/helper/help-'+language+'.html')).href);
  assert.equal(await page.locator('html').getAttribute('lang'),language);
  assert.equal(await page.locator('details').count(),16);
  await page.locator('summary').nth(5).focus();await page.keyboard.press('Enter');
  assert.ok(await page.locator('details').nth(5).getAttribute('open')!==null);
  assert.ok((await page.locator('details').nth(5).innerText()).includes(language==='da'?'Start ved login':'Start at login'));
  assert.ok((await page.locator('body').innerText()).includes(language==='da'?'AI og nøgleboks':'AI and the vault'));
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  if(process.env.FORGESHARE_PREVIEW_DIR)await page.screenshot({path:path.join(process.env.FORGESHARE_PREVIEW_DIR,'ForgeShare-help-'+language+'.png'),fullPage:false});
 }
 assert.deepEqual(errors,[]);
 console.log('Headless guide and library: language refresh, downloads, mobile layout, selected import and stable reimport passed');
} finally {await browser.close();}
