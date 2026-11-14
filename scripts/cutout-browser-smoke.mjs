/** CutOut native editor, playback, bilingual state, export and saver in Chromium. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {loadEdition,assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'cutout-'));
const localFetch=async url=>{try{const data=await readFile(path.join(root,new URL(url).pathname),'utf8');return {ok:true,json:async()=>JSON.parse(data)};}catch{return {ok:false,status:404};}};
const {tiddlers}=await loadEdition('https://forge.test/editions/cutout/manifest.json',localFetch);
const file=path.join(dir,'CutOut.html');await writeFile(file,assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),tiddlers));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 await page.goto(pathToFileURL(file).href);await page.getByRole('heading',{name:'HUWiki CutOut — offline test release',exact:true}).waitFor();
 assert.equal(await page.locator('.tc-error-form').count(),0);
 await page.getByRole('link',{name:'Open workshop',exact:true}).click();
 await page.locator('.co-studio').waitFor();
 await page.getByLabel('Project library',{exact:true}).selectOption('Demo – Tændstikmand (dukke)');
 await page.locator('.co-stage svg').waitFor();
 const studio=page.locator('.co-studio');
 assert.equal(await studio.locator('.co-language').count(),0);
 await studio.getByRole('button',{name:'Animation studio',exact:true}).click();
 await page.getByLabel('Project library',{exact:true}).selectOption('Demo – Tændstikmand');
 await studio.getByRole('button',{name:'▶ Play',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('.co-timeline input[type=range]').value)>0.1);
 await studio.getByRole('button',{name:'Back to start',exact:true}).click();
 const timeline=studio.locator('.co-timeline input[type=range]');
 await timeline.fill('1');await timeline.dispatchEvent('input');
 await studio.getByRole('button',{name:'Parts and properties',exact:true}).click();
 // The actual property editor creates a keyframe by rotating the selected body part.
 const beforeEdit=await page.evaluate(()=>$tw.wiki.getTiddlerText('Demo – Tændstikmand'));
 await studio.getByRole('button',{name:'↷ Rotate',exact:true}).click();
 await studio.getByRole('button',{name:'Save project',exact:true}).click();
 const edited=await page.evaluate(()=>$tw.wiki.getTiddlerText('Demo – Tændstikmand'));
 assert.notDeepEqual(JSON.parse(edited),JSON.parse(beforeEdit),'Rotation must change actual project data');
 await page.getByRole('button',{name:'control panel',exact:true}).click();
 const languages=page.locator('select').filter({has:page.locator('option[value="$:/languages/da-DK"]')});
 await languages.selectOption('$:/languages/da-DK');
 await studio.getByRole('button',{name:'Gem projekt',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('Demo – Tændstikmand')),edited);
 await languages.selectOption('$:/languages/en-GB');
 await studio.getByRole('button',{name:'Save project',exact:true}).waitFor();
 console.log('PASS offline puppet/animation workshop, actual playback, keyframe editing, project save, native da/en and preserved data');
 // Export from the original workshop, unzip and open the actual generated viewing HTML.
 await studio.getByText('Project and file',{exact:true}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),studio.getByRole('button',{name:'Export project',exact:true}).click()]);
 const zip=path.join(dir,'animation.zip');await download.saveAs(zip);
 const html=execFileSync('unzip',['-p',zip,'index.html'],{maxBuffer:20*1024*1024});
 const exported=path.join(dir,'view.html');await writeFile(exported,html);
 const viewer=await context.newPage();viewer.on('pageerror',e=>errors.push(e.message));await viewer.goto(pathToFileURL(exported).href);
 await viewer.locator('svg').first().waitFor();assert.equal(await viewer.locator('.tc-error-form').count(),0);
 await viewer.getByRole('button',{name:'▶ Play',exact:true}).click();
 await viewer.waitForFunction(()=>Number(document.querySelector('input[type=range]').value)>0.1);
 await viewer.close();
 // Native wiki saver preserves edited project and language across an offline reopen.
 const [save]=await Promise.all([page.waitForEvent('download'),page.locator('button[class*="Buttons%2Fsave-wiki"]').click()]);
 const saved=path.join(dir,'saved.html');await save.saveAs(saved);await page.goto(pathToFileURL(saved).href);
 await page.getByRole('link',{name:'Open workshop',exact:true}).click();
 await page.locator('.co-studio').waitFor();
 assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('Demo – Tændstikmand')),edited);
 assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language')),'$:/languages/en-GB');
 assert.equal(await page.locator('.huw-forge-home').getAttribute('href'),'https://forge.måns.dk/');
 await page.getByLabel('Project library',{exact:true}).selectOption('Demo – Tændstikmand (dukke)');
 await page.locator('.co-studio').getByRole('button',{name:'Full screen',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.co-studio.co-full'));
 console.log('PASS original ZIP export/viewing HTML, native wiki save/reopen, F and no Google network access');
 if(process.env.FORGE_SCREENSHOTS){await mkdir(process.env.FORGE_SCREENSHOTS,{recursive:true});await page.waitForFunction(()=>{const e=document.querySelector('.co-studio.co-full').closest('.tc-tiddler-frame');return getComputedStyle(e).transform==='none';});await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOTS,'forge-cutout.png')});}
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
