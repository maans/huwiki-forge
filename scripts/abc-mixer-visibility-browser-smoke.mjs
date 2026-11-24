import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,webkit,devices} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),engineName=process.env.ABC_READER_BROWSER||'webkit';
const out=path.join(root,'test-results/mixer-visibility',engineName);await mkdir(out,{recursive:true});
const engine={webkit,chromium}[engineName],browser=await engine.launch({headless:true,...(engineName==='chromium'?{args:['--no-sandbox'],...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})}: {})});
try{
 for(const size of [{name:'portrait',width:834,height:1194},{name:'landscape',width:1194,height:834}]){
  const context=await browser.newContext({...devices['iPad Pro 11'],viewport:{width:size.width,height:size.height},screen:{width:size.width,height:size.height}});
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=pathToFileURL(path.join(root,'editions/silba-atno-repertoire/index.html')).href;
  // The old URL must continue opening the same single, neutral library piece.
  await page.goto(url+'#'+encodeURIComponent('SilbaÄtno · Purim Niggun'));
  const score=page.locator('.huwabc-standalone[data-huwabc-title="Purim Niggun"]');await score.locator('svg').first().waitFor();
  assert.equal(await page.evaluate(()=>$tw.wiki.tiddlerExists('SilbaÄtno · Purim Niggun')),false);
  const source=await page.evaluate(()=>$tw.wiki.getTiddler('Purim Niggun').fields['abc-source']);
  const button=score.locator('.huwabc-mini-open');
  for(const state of ['normal','scrolled','hidden']){
   await page.evaluate(state=>{
    $tw.wiki.setText('$:/state/sidebar','text',null,state==='hidden'?'no':'yes');
    if(state==='scrolled'){
     const button=document.querySelector('.huwabc-mini-open');window.scrollTo(0,Math.max(0,button.getBoundingClientRect().top+window.scrollY-65));
    }else window.scrollTo(0,0);
   },state);
   await button.tap();
   const panel=page.locator('.huwabc-mini-mixer');await panel.waitFor();
   await page.waitForFunction(size=>{
    const panel=document.querySelector('.huwabc-mini-mixer');if(!panel||panel.hidden)return false;
    const r=panel.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=size.width+2&&r.bottom<=size.height+2;
   },size,{timeout:5000});
   const rect=await panel.boundingBox();assert.ok(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+2&&rect.y+rect.height<=size.height+2,JSON.stringify({engineName,size,state,rect}));
   assert.equal(await button.getAttribute('aria-expanded'),'true');
   await panel.getByRole('tab',{name:/^(Stemmer|Voices)$/}).tap();
   await panel.locator('.huwabc-mini-mixer-mode--cycle').first().tap();
   await panel.getByRole('tab',{name:/^(Akkompagnement|Accompaniment)$/}).tap();
   assert.ok(await panel.locator('.huwabc-mini-mixer-reverb').isVisible());
   await page.screenshot({path:path.join(out,size.name+'-'+state+'.png')});
   await panel.locator('.huwabc-mini-mixer-close').tap();assert.equal(await button.getAttribute('aria-expanded'),'false');
  }
  assert.equal(await page.evaluate(()=>$tw.wiki.getTiddler('Purim Niggun').fields['abc-source']),source);
  assert.deepEqual(errors,[]);console.log(engineName,size.name,'normal view: mixer visible in normal/scrolled/hidden-sidebar cases; controls and unchanged source passed');
  await context.close();
 }
}finally{await browser.close();}
