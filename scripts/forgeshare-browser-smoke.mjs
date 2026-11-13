// Headless, isolated local wiki. No user browser/profile, external network or services.
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assembleHtml} from '../assembler/assemble.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root=path.resolve(import.meta.dirname,'..');
const plugin=JSON.parse(await readFile(path.join(root,'plugins/forgeshare/dist/plugin.json'),'utf8'));
const title='$:/plugins/huwiki/forgeshare/home';
const html=assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),[plugin,
  {title:'$:/DefaultTiddlers',text:'[['+title+']]'},
  {title:'$:/language',text:'$:/languages/huwiki-da-DK'},
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
 assert.equal(await panel.locator('h1').innerText(),'Din wiki. Sammen.');
 assert.equal(await panel.locator('.hu-share-downloads a').count(),3);
 assert.equal(await panel.locator('details[open]').count(),0);
 const download=await panel.locator('.hu-share-downloads').boundingBox();
 assert.ok(download.y<500,'Downloads must appear before long help text');
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
 await page.waitForFunction(()=>document.querySelector('.hu-forgeshare h1')?.textContent==='Your wiki. Together.');
 assert.equal(await panel.locator('.hu-share-downloads').count(),1,'Language refresh must not duplicate content');
 await page.setViewportSize({width:1100,height:1200});await capture('ForgeShare-english');
 assert.deepEqual(errors,[]);
 console.log('Headless guide: Danish/English live refresh, three exact downloads, keyboard disclosures, mobile layout passed');
} finally {await browser.close();}
