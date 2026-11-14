/** Local/offline acceptance only. Does not publish to a Google account or expose Funnel. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {composeWiki,loadChoices} from '../assembler/compose.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'forge-shop-'));
const fetcher=async url=>{try{const body=await readFile(path.join(root,new URL(url).pathname),'utf8');return {ok:true,json:async()=>JSON.parse(body)};}catch{return {ok:false,status:404};}};
const choices=await loadChoices('https://forge.test/assembler/',fetcher),core=await readFile(path.join(root,'core/empty.html'),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 for(const language of ['da-DK','en-GB']){
  const da=language==='da-DK',t=(a,b)=>da?a:b,result=await composeWiki({choices,editionId:'shop',language},fetcher),file=path.join(dir,'Shop-'+language+'.html');await writeFile(file,assembleHtml(core,result.tiddlers));
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});await context.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);await page.goto(pathToFileURL(file).href);const ui=page.locator('.forge-shop');await ui.waitFor();
  assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language/SideBar/Open/Caption')),t('Åbne','Open'));
  await ui.getByLabel(t('Butikkens navn','Shop name'),{exact:true}).fill(t('Prøvebutik','Test shop'));
  await ui.getByLabel(t('Offentlige kontaktoplysninger','Public contact details'),{exact:true}).fill('shop@example.org');
  await ui.getByRole('checkbox').first().check();assert.match(await ui.locator('.shop-progress').innerText(),/^1 \/ /);
  await ui.getByRole('button',{name:t('2. Bestillingsformular','2. Order form'),exact:true}).click();
  await ui.getByLabel(t('Respondentlink (bliver offentligt)','Responder link (will be public)'),{exact:true}).fill('https://docs.google.com/forms/d/e/TEST/viewform');
  assert.match(await ui.locator('pre').innerText(),t(/Festbillet/,/Event ticket/));
  await ui.getByRole('checkbox').first().check();
  await ui.getByRole('button',{name:t('3. Dit private ordreark','3. Your private order sheet'),exact:true}).click();
  await ui.getByLabel(t('Privat adresse til ordrearket','Private order sheet address'),{exact:true}).fill('https://docs.google.com/spreadsheets/d/PRIVATE-SHEET/edit');
  await ui.getByText(t('Se et afprøvet eksempel','See a tested example'),{exact:true}).click();
  await ui.locator('.shop-example img').evaluate(img=>img.decode());assert.ok(await ui.locator('.shop-example img').evaluate(img=>img.naturalWidth>0),'offline screenshot must decode');
  await ui.getByRole('button',{name:t('4. Prøv som kunde','4. Try it as a customer'),exact:true}).click();await ui.getByRole('checkbox').first().check();
  // Changing a product must invalidate previous order checks.
  await ui.getByRole('button',{name:t('1. Din butik','1. Your shop'),exact:true}).click();await ui.getByLabel(t('Pris (DKK)','Price (DKK)'),{exact:true}).first().fill('55');
  assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerData('$:/plugins/huwiki/shop/data').checks['anonymous-form']),undefined);
  await ui.getByRole('button',{name:t('5. Opret dit Shop Site','5. Create your Shop Site'),exact:true}).click();
  await ui.frameLocator('iframe').getByRole('heading',{name:t('Prøvebutik','Test shop'),exact:true}).waitFor();
  const [customer]=await Promise.all([page.waitForEvent('download'),ui.getByRole('button',{name:t('Hent kundeside: index.html','Download customer site: index.html'),exact:true}).click()]);
  const customerFile=path.join(dir,'customer-'+language+'.html');await customer.saveAs(customerFile);const html=await readFile(customerFile,'utf8');assert.doesNotMatch(html,/PRIVATE-SHEET|"checks"|\$:\/plugins/);assert.match(html,/55[,.]00/);
  const customerPage=await context.newPage();await customerPage.goto(pathToFileURL(customerFile).href);assert.equal(await customerPage.locator('a.button').first().getAttribute('href'),'https://docs.google.com/forms/d/e/TEST/viewform');
  await ui.getByRole('button',{name:t('Vis kode til Google Sites','Show code for Google Sites'),exact:true}).click();const fragment=await ui.getByLabel(t('Kode til Google Sites','Code for Google Sites'),{exact:true}).inputValue();assert.match(fragment,/<style>/);assert.doesNotMatch(fragment,/PRIVATE-SHEET/);
  const embed=await context.newPage();await embed.setContent('<iframe sandbox="allow-popups allow-popups-to-escape-sandbox" style="width:100%;height:800px"></iframe>');await embed.locator('iframe').evaluate((el,html)=>el.srcdoc=html,fragment);await embed.frameLocator('iframe').getByRole('heading',{name:t('Prøvebutik','Test shop'),exact:true}).waitFor();
  assert.equal(await embed.frameLocator('iframe').locator('a.button').first().getAttribute('target'),'_blank');
  await ui.getByRole('checkbox').first().check();
  const [saved]=await Promise.all([page.waitForEvent('download'),ui.getByRole('button',{name:t('Gem min arbejdswiki','Save my working wiki'),exact:true}).click()]);const savedFile=path.join(dir,'saved-'+language+'.html');await saved.saveAs(savedFile);
  const reopened=await context.newPage();await reopened.goto(pathToFileURL(savedFile).href);await reopened.locator('.forge-shop').waitFor();assert.equal(await reopened.evaluate(()=>$tw.wiki.getTiddlerData('$:/plugins/huwiki/shop/data').draft.items[0].price),'55');assert.equal(await reopened.evaluate(()=>$tw.wiki.getTiddlerData('$:/plugins/huwiki/shop/data').checks['preview-checked']),true);
  // Native language switching changes the guide, without translating the owner's catalog data.
  await reopened.evaluate(lang=>$tw.wiki.addTiddler({title:'$:/language',text:'$:/languages/'+lang}),da?'en-GB':'da-DK');await reopened.getByRole('heading',{name:da?'From idea to your own Shop':'Fra idé til din egen Shop',exact:true}).waitFor();
  await ui.getByRole('button',{name:t('6. Del med kunder','6. Share with customers'),exact:true}).click();await ui.getByText(t('Se et afprøvet eksempel','See a tested example'),{exact:true}).click();await ui.locator('.shop-example img').evaluate(img=>img.decode());assert.ok(await ui.locator('.shop-example img').evaluate(img=>img.naturalWidth>0));await ui.getByLabel(t('Udgivelsesvej','Publishing route'),{exact:true}).selectOption('funnel');
  const [helper]=await Promise.all([page.waitForEvent('download'),ui.getByRole('button',{name:t('Hent shop-server.cjs','Download shop-server.cjs'),exact:true}).click()]);const helperFile=path.join(dir,'shop-server-'+language+'.cjs');await helper.saveAs(helperFile);assert.equal(await readFile(helperFile,'utf8'),await readFile('plugins/shop/src/shop-server.cjs','utf8'));
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await ui.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'wizard overflow at '+width);await customerPage.setViewportSize({width,height:1000});assert.ok(await customerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'customer page overflow at '+width);}
  if(process.env.SHOP_SCREENSHOT&&da){await page.setViewportSize({width:1440,height:1000});await ui.getByRole('button',{name:'2. Bestillingsformular',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.SHOP_SCREENSHOT,fullPage:true});}
  assert.deepEqual(errors,[]);assert.equal(await page.locator('.tc-error-form').count(),0);console.log('PASS Shop',language,'offline editing, saved checklist, invalidation, public HTML, isolated embed, helper and mobile layout');await context.close();
 }
}finally{await browser.close();}
console.log('Google Sites account publication and public Funnel remain manual acceptance steps. Artifacts:',dir);
