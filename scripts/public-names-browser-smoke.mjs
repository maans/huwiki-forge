/** All Editions retain canonical navigation and apply native language on first boot. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {composeWiki,loadChoices} from '../assembler/compose.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..');
const fetcher=async url=>{try{const body=await readFile(path.join(root,new URL(url).pathname),'utf8');return {ok:true,json:async()=>JSON.parse(body)};}catch{return {ok:false,status:404};}};
const choices=await loadChoices('https://forge.test/assembler/',fetcher),core=await readFile(path.join(root,'core/empty.html'),'utf8'),dir=await mkdtemp(path.join(tmpdir(),'forge-names-'));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 for(const edition of choices.editions)for(const language of ['da-DK','en-GB']){
  console.log('Checking',edition.id,language);
  const result=await composeWiki({choices,editionId:edition.id,language},fetcher);
  const file=path.join(dir,edition.id+'-'+language+'.html');await writeFile(file,assembleHtml(core,result.tiddlers));
  const context=await browser.newContext({locale:language==='da-DK'?'en-US':'da-DK'});await context.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(file).href);await page.locator('.tc-tiddler-frame').first().waitFor();
  assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language/SideBar/Open/Caption')),language==='da-DK'?'Åbne':'Open',edition.id+' native language');
  assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language/Buttons/ControlPanel/Caption')),language==='da-DK'?'Kontrolpanel':'control panel');
  assert.doesNotMatch(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/SiteTitle')),/^HUWiki\b/i);
  if(edition.id==='forge')assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/SiteTitle')),'TiddlyWiki Forge');
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/state/sidebar',text:'yes'}));
  assert.equal((await page.locator('.tc-sidebar-header [data-tab-title="$:/core/ui/SideBar/Open"]').innerText()).trim(),language==='da-DK'?'Åbne':'Open');
  await page.getByRole('button',{name:language==='da-DK'?'Kontrolpanel':'control panel',exact:true}).first().waitFor();
  assert.equal(await page.locator('.huw-forge-home').getAttribute('aria-label'),'TiddlyWiki Forge');
  const selected=await page.evaluate(()=>$tw.wiki.getTiddlerList('$:/StoryList'));
  for(const title of selected.filter(t=>t.startsWith('HUWiki '))){const heading=await page.locator('[data-tiddler-title='+JSON.stringify(title)+'] .tc-titlebar').innerText();assert.doesNotMatch(heading,/HUWiki/i,edition.id+' visible title '+title);assert.ok(await page.evaluate(t=>!!$tw.wiki.getTiddler(t),title));}
  assert.doesNotMatch(await page.locator('.tc-sidebar-tab-open').innerText(),/HUWiki/);
  if(edition.id==='music'){
   const start=page.locator('.tc-sidebar-tab-open a[href="#HUWiki%20Musik%20%E2%80%93%20Start"]');await start.click();assert.ok(await page.evaluate(()=>$tw.wiki.getTiddlerList('$:/StoryList').includes('HUWiki Musik – Start')));
  }
  if(edition.id==='slideshow'){await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['PasteUp']}));await page.locator('[data-tiddler-title="PasteUp"] .tc-titlebar').waitFor();assert.match(await page.locator('[data-tiddler-title="PasteUp"] .tc-titlebar').innerText(),/PasteUp Forge/);assert.equal(await page.evaluate(()=>$tw.wiki.getTiddler('$:/plugins/huwiki/pasteup').fields.author),'Eric L. Shulman; dansk tilpasning: HUWiki');}
  assert.equal(await page.locator('.tc-error-form').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS',edition.id,language,'public names, canonical links and native translated controls on first boot');await context.close();
 }
}finally{await browser.close();}
