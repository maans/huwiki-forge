/** Exercise archive browsing inside wide and narrow TiddlyWiki story columns. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:920}});
 await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 await mkdir(path.join(root,'test-results/archive'),{recursive:true});
 for(const [id,name,tune] of [['akustisk-elektrisk','Akustisk Elektrisk','Sat'],['silba-atno','Silba Ätno','Om dagen är du städs för mig']]){
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  const title='Nodearkiv · '+name;
  const url=pathToFileURL(path.join(root,'editions/'+id+'-repertoire/index.html')).href+'#'+encodeURIComponent(title);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const archive=page.locator('.huwabc-search');
  await archive.locator('.huwabc-suggestion').last().waitFor();
  assert.equal(await page.getByRole('heading',{name:'Nodearkiv',exact:true}).count(),1);
  assert.equal(await archive.locator('h2').count(),0,'archive heading should not be repeated');
  assert.equal(await archive.locator('.huwabc-suggestion').count(),6);
  assert.equal(await archive.locator('.huwabc-search-save').isVisible(),false,'empty selection stays hidden');
  const openLabel=await page.locator('.tc-sidebar-lists').innerText();
  assert.ok(openLabel.includes(title),'sidebar uses the friendly archive title');
  assert.ok(!openLabel.includes('/browse'),'sidebar never exposes the internal browse path');
  const frame=archive.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," tc-tiddler-frame ")]');
  async function contained(label){
   const geometry=await archive.evaluate(node=>{
    const host=node.getBoundingClientRect();
    const outside=[...node.querySelectorAll('button,input,select,summary')].filter(n=>n.getClientRects().length).map(n=>({text:(n.innerText||n.getAttribute('aria-label')||n.tagName).slice(0,80),rect:n.getBoundingClientRect()})).filter(x=>x.rect.left<host.left-2||x.rect.right>host.right+2).map(x=>x.text);
    return {width:node.clientWidth,scroll:node.scrollWidth,outside};
   });
   assert.ok(geometry.scroll<=geometry.width+2,label+': archive overflows '+JSON.stringify(geometry));
   assert.deepEqual(geometry.outside,[],label+': controls must fit their own story column');
  }
  for(const width of [800,520,360]){
   await frame.evaluate((node,w)=>node.style.width=w+'px',width);
   await contained(id+' '+width+'px overview');
   await archive.locator('.huwabc-filters>summary').click();
   await contained(id+' '+width+'px expanded filters');
   await archive.locator('.huwabc-filters>summary').click();
  }
  await frame.evaluate(node=>node.style.removeProperty('width'));
  await page.screenshot({path:path.join(root,'test-results/archive/'+id+'-overview.png'),fullPage:true});
  await archive.getByRole('searchbox').fill(tune);
  await archive.getByRole('searchbox').press('Enter');
  await archive.locator('.huwabc-search-row').first().waitFor();
  assert.equal(await archive.locator('.huwabc-collection-suggestions').isVisible(),false);
  await archive.getByRole('button',{name:/^(Se detaljer|View details)$/}).first().click();
  await archive.locator('.huwabc-search-info dl').waitFor();
  await frame.evaluate(node=>node.style.width='360px');
  await contained(id+' narrow details');
  await archive.getByRole('checkbox').first().check();
  assert.equal(await archive.locator('.huwabc-search-save').isVisible(),true);
  await contained(id+' narrow selection');
  await archive.getByRole('button',{name:/^(Ryd valg|Clear selection)$/}).click();
  assert.equal(await archive.locator('.huwabc-search-save').isVisible(),false);
  await page.screenshot({path:path.join(root,'test-results/archive/'+id+'-narrow.png'),fullPage:true});
  await page.close();
 }
 console.log('Both archives fit 800px, 520px and 360px story columns; filtering, details and selection work.');
}finally{await browser.close();}
