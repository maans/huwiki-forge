/** Browser smoke test: actual Flibbles canvas, three editable Graph views and offline boot.
 * Run after node scripts/build-graph-edition.mjs:
 * npm install --no-save --no-package-lock --ignore-scripts playwright-core@1.56.1
 * CHROME_BIN=/usr/bin/google-chrome node scripts/graph-browser-smoke.mjs
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {loadChoices,composeWiki} from '../assembler/compose.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..');
const fetcher=async url=>{
 try {const filename=path.join(root,new URL(url).pathname);const content=await readFile(filename,'utf8');return {ok:true,json:async()=>JSON.parse(content)};}
 catch {return {ok:false,status:404};}
};
const choices=await loadChoices('https://forge.test/assembler/',fetcher);
const core=await readFile(path.join(root,'core/empty.html'),'utf8');
const dir=await mkdtemp(path.join(tmpdir(),'forge-graph-'));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 for(const language of ['da-DK','en-GB']){
  const {tiddlers}=await composeWiki({choices,editionId:'graph',language},fetcher);
  const file=path.join(dir,'graph-'+language+'.html');
  await writeFile(file,assembleHtml(core,tiddlers));
  const context=await browser.newContext({locale:language==='da-DK'?'da-DK':'en-US',viewport:{width:1120,height:850},acceptDownloads:true});
  const errors=[];
  await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
  const page=await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror',error=>errors.push(String(error.message||error)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(()=>window.$tw && $tw.wiki && document.querySelector('.forge-graph-stage canvas'));
  const pluginNames=await page.evaluate(()=>['$:/plugins/flibbles/graph','$:/plugins/flibbles/vis-network','$:/plugins/huwiki/graph-studio'].map(x=>$tw.wiki.getTiddler(x)?.fields.title));
  assert.deepEqual(pluginNames,['$:/plugins/flibbles/graph','$:/plugins/flibbles/vis-network','$:/plugins/huwiki/graph-studio']);
  for(const [title,graph,count]of [['Graph Edition · Start','Platon',13],['Graph Edition · Mindmap','Mindmap',7],['Graph Edition · Projekt','Projekt',7]]){
   await page.evaluate(title=>$tw.wiki.addTiddler({title:'$:/StoryList',list:[title]}),title);
   await page.locator('[data-tiddler-title='+JSON.stringify(title)+'] .forge-graph-stage canvas').first().waitFor();
   const bounds=await page.locator('[data-tiddler-title='+JSON.stringify(title)+'] .forge-graph-stage .graph-canvas').first().boundingBox();
   assert.ok(bounds && bounds.width>=250 && bounds.height>=300,graph+' must have a usable graph stage');
   const actual=await page.evaluate(g=>$tw.wiki.filterTiddlers('[tag[Graph/'+g+']]').length,graph);
   assert.equal(actual,count,graph+' node count');
   const pos=await page.evaluate(g=>JSON.parse($tw.wiki.getTiddlerText('$:/graph/'+g)),graph);
   assert.equal(Object.keys(pos).length,count,graph+' stored positions');
  }
  // Check the rendered DOM. A single newline after a widget opening tag makes
  // TiddlyWiki parse its contents inline, leaking ! and # as literal text.
  const localized=language==='da-DK'
   ?{guide:'Kom i gang',create:'Nyt kort',start:'Videnskort, du kan arbejde i'}
   :{guide:'Get started',create:'New map',start:'Knowledge maps you can work in'};
  for(const [title,heading] of [
   ['Graph Edition · Start',localized.start],
   ['Graph Edition · Platon',language==='da-DK'?'Platons hulelignelse':'Plato’s allegory of the cave'],
   ['Graph Edition · Mindmap',language==='da-DK'?'Mindmap · Fra idé til form':'Mind map · From idea to form'],
   ['Graph Edition · Projekt',language==='da-DK'?'Projektkort · Afhængigheder':'Project map · Dependencies'],
   ['Graph Edition · Kom i gang',localized.guide]
  ]){
   await page.evaluate(title=>$tw.wiki.addTiddler({title:'$:/StoryList',list:[title]}),title);
   const container=page.locator('[data-tiddler-title='+JSON.stringify(title)+'] .forge-graph-workbench');
   const headingElement=container.locator('h1,h2').first();
   await headingElement.waitFor();
   assert.equal((await headingElement.innerText()).trim(),heading,title+' rendered heading');
   assert.ok(await container.locator('p').count()>=1,title+' should have paragraph formatting');
  }
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Kom i gang']}));
  const guide=page.locator('[data-tiddler-title="Graph Edition · Kom i gang"] .forge-graph-workbench');
  assert.equal(await guide.locator('ol > li').count(),6,'Guide should have six numbered steps');
  assert.equal((await guide.locator('h1,h2').nth(1).innerText()).trim(),localized.create,'Second heading should be formatted');
  assert.doesNotMatch(await guide.innerText(),/(?:^|\n)\s*[!#]\s/,'Literal heading/list WikiText must not show');
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Hulen']}));
  const node=page.locator('[data-tiddler-title="Hulen"] .tc-tiddler-body');
  await node.locator('h1,h2').first().waitFor();
  assert.equal((await node.locator('h1,h2').first().innerText()).trim(),'Hulen');
  assert.ok(await node.locator('p').count()>=1,'Node content should have paragraph formatting');

  // Real editor acceptance: change tiddlers only through clickable controls.
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  const editor=page.locator('[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-editor');
  await editor.waitFor();
  assert.equal(await editor.locator('.forge-graph-create-node').count(),1,'The Forge add-node button must be present');
  assert.equal(await editor.locator('.forge-graph-add-edge').count(),1,'The Forge add-edge button must be present');
  const newNode='Brugerens grafprøve';
  await editor.locator('.forge-graph-node-name').fill(newNode);
  await editor.locator('.forge-graph-create-node').click();
  await page.waitForFunction(title=>window.$tw?.wiki?.getTiddler(title)?.hasTag('Graph/Mindmap'),newNode);
  assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields['graph-shape'],newNode),'box');
  await editor.locator('.forge-graph-edge-from').selectOption('Idéens kerne');
  await editor.locator('.forge-graph-edge-to').selectOption(newNode);
  await editor.locator('.forge-graph-edge-type').selectOption('forbinder');
  await editor.locator('.forge-graph-add-edge').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler('Idéens kerne').getFieldList('forbinder').includes(title),newNode);
  await editor.locator('.forge-graph-style-node').selectOption(newNode);
  await editor.locator('.forge-graph-style-shape').selectOption('diamond');
  await editor.locator('.forge-graph-style-color').fill('#9475ba');
  await editor.locator('.forge-graph-style-size').fill('42');
  await editor.locator('.forge-graph-apply-style').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title).fields['graph-shape']==='diamond',newNode);
  const shape=await page.evaluate(title=>{let t=$tw.wiki.getTiddler(title);return [t.fields['graph-shape'],t.fields.color,t.fields['graph-size']];},newNode);
  assert.deepEqual(shape,['diamond','#9475ba','42']);
  await editor.locator('.forge-graph-style-shape').selectOption('image');
  await editor.locator('.forge-graph-style-icon').selectOption('GraphStudio/Sun');
  await editor.locator('.forge-graph-apply-style').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title).fields.icon==='GraphStudio/Sun',newNode);
  assert.equal(await page.locator('.tc-error-form').count(),0,'The direct graph editor must not trigger error dialogs');
  // The graph remains rendered after actions (no blank/disabled player).
  await page.locator('[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage canvas').first().waitFor();
  console.log('PASS',language,'touch-style node creation, typed connections, shapes, color, size, SVG icons');

  await page.evaluate(()=>$tw.wiki.addTiddler({title:'Nyt begreb',tags:['Graph/Mindmap'],text:'En ny redigerbar node.'}));
  assert.equal(await page.evaluate(()=>$tw.wiki.filterTiddlers('[tag[Graph/Mindmap]]').length),8);
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  await page.locator('[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage canvas').first().waitFor();
  assert.equal(await page.locator('.tc-error-form').count(),0,'No TiddlyWiki error dialogs');
  assert.deepEqual(errors,[],'No uncaught browser errors: '+errors.join('; '));
  console.log('PASS',language,'offline graph boot, three canvases, relation datasets, new editable node');
  await context.close();
 }
}finally{await browser.close();}
