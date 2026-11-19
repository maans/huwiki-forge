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

  // Original Vis-Network Add Node / Add Edge buttons are the only persistent
  // edit controls. The three Forge forms are mutually exclusive popovers.
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  const graphStage=page.locator('.tc-tiddler-frame[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage').first();
  const editor=graphStage.locator('.forge-graph-editor').first();
  const nativeTools=graphStage.locator('.vis-manipulation').first();
  const addNode=nativeTools.locator('.vis-button.vis-add').first();
  const addEdge=nativeTools.locator('.vis-button.vis-connect').first();
  await addNode.waitFor({state:'visible'});
  await addEdge.waitFor({state:'visible'});
  assert.equal(await editor.isVisible(),false,'Forge editor must be hidden until a graph action');
  assert.equal(await graphStage.locator('.forge-graph-editor-panels > .forge-graph-editor-panel').count(),3);
  await editor.evaluate(node=>{window.__forgeActionEvents=[];node.addEventListener('forge-graph-action',e=>window.__forgeActionEvents.push(e.detail));});
  await addNode.click();
  const debug=await graphStage.evaluate(stage=>({
   editorCount:stage.querySelectorAll('.forge-graph-editor').length,
   editorClass:stage.querySelector('.forge-graph-editor')?.className,
   nativeButtons:[...stage.querySelectorAll('.vis-button')].map(n=>({c:n.className,t:n.textContent?.trim().slice(0,60)})),
   modules:Object.keys($tw.modules.getModulesByTypeAsHashmap('vis-property')).filter(x=>/forge/i.test(x)),
   captured:window.__forgeActionEvents||[],
   bridgeTags:[...stage.querySelectorAll('[data-forge-control-init]')].map(e=>({cls:e.className,flag:e.getAttribute('data-forge-control-init')})),
   addAncestor:stage.querySelector('.vis-add')?.closest('.graph-canvas')?.className||null,
   stageClass:stage.className
  }));
  console.log('GRAPH TOOL DEBUG',JSON.stringify(debug).slice(0,2500));
  assert.equal(await editor.isVisible(),true,'The original Add Node button opens the compact node editor');
  assert.equal(await editor.locator('.forge-graph-editor-panel:visible').count(),1,'Only one context panel is open');
  await editor.locator('.forge-graph-close').click();
  assert.equal(await editor.isVisible(),false,'Close returns to the full graph');
  await addNode.click();
  const newNode='Brugerens grafprøve';
  await editor.locator('.forge-graph-node-name').fill(newNode);
  await editor.locator('.forge-graph-create-node').click();
  await page.waitForFunction(title=>window.$tw?.wiki?.getTiddler(title)?.hasTag('Graph/Mindmap'),newNode);
  assert.equal(await editor.isVisible(),false,'Saving a node closes its context panel');
  assert.equal(await page.evaluate(title=>$tw.wiki.getTiddler(title).fields['graph-shape'],newNode),'box');
  await addEdge.click();
  assert.equal(await editor.isVisible(),true,'The original Add Edge button opens the connection editor');
  assert.equal(await editor.locator('.forge-graph-editor-panel:visible').count(),1);
  await editor.locator('.forge-graph-edge-from').selectOption('Idéens kerne');
  await editor.locator('.forge-graph-edge-to').selectOption(newNode);
  await editor.locator('.forge-graph-edge-type').selectOption('forbinder');
  await editor.locator('.forge-graph-add-edge').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler('Idéens kerne').getFieldList('forbinder').includes(title),newNode);
  assert.equal(await editor.isVisible(),false,'Saving an edge closes its context panel');
  // A real Vis node click emits the matching context event via the adapter.
  // Dispatch the same event to verify the panel independently of canvas hit testing.
  await editor.dispatchEvent('forge-graph-action',{detail:{mode:'style',node:newNode}});
  assert.equal(await editor.isVisible(),true,'Node selection opens appearance');
  assert.equal(await editor.locator('.forge-graph-editor-panel:visible').count(),1);
  await editor.locator('.forge-graph-style-node').selectOption(newNode);
  await editor.locator('.forge-graph-style-shape').selectOption('diamond');
  await editor.locator('.forge-graph-style-color').fill('#9475ba');
  await editor.locator('.forge-graph-style-size').fill('42');
  await editor.locator('.forge-graph-apply-style').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title).fields['graph-shape']==='diamond',newNode);
  assert.equal(await editor.isVisible(),false,'Appearance closes after save');
  const shape=await page.evaluate(title=>{let t=$tw.wiki.getTiddler(title);return [t.fields['graph-shape'],t.fields.color,t.fields['graph-size']];},newNode);
  assert.deepEqual(shape,['diamond','#9475ba','42']);
  await editor.dispatchEvent('forge-graph-action',{detail:{mode:'style',node:newNode}});
  await editor.locator('.forge-graph-style-shape').selectOption('image');
  await editor.locator('.forge-graph-style-icon').selectOption('GraphStudio/Sun');
  await editor.locator('.forge-graph-apply-style').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title).fields.icon==='GraphStudio/Sun',newNode);
  assert.equal(await editor.isVisible(),false);
  assert.equal(await page.locator('.tc-error-form').count(),0);
  await graphStage.locator('canvas').first().waitFor();
  console.log('PASS',language,'native Add Node/Add Edge buttons, contextual styling and SVG images');

  await page.evaluate(()=>$tw.wiki.addTiddler({title:'Nyt begreb',tags:['Graph/Mindmap'],text:'En ny redigerbar node.'}));
  assert.equal(await page.evaluate(()=>$tw.wiki.filterTiddlers('[tag[Graph/Mindmap]]').length),9);
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  await page.locator('[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage canvas').first().waitFor();
  assert.equal(await page.locator('.tc-error-form').count(),0,'No TiddlyWiki error dialogs');
  assert.deepEqual(errors,[],'No uncaught browser errors: '+errors.join('; '));
  console.log('PASS',language,'offline graph boot, three canvases, relation datasets, new editable node');
  await context.close();
 }

 // Chromium touch emulation: original canvas buttons open the contextual panels,
 // and taps inside them work without pushing the graph down the page.
 const touchContext=await browser.newContext({locale:'da-DK',hasTouch:true,isMobile:true,deviceScaleFactor:2,viewport:{width:834,height:1112}});
 await touchContext.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 const touchPage=await touchContext.newPage();touchPage.setDefaultTimeout(25000);
 const touchErrors=[];touchPage.on('pageerror',error=>touchErrors.push(error.message));
 await touchPage.goto(pathToFileURL(path.join(dir,'graph-da-DK.html')).href);
 const touchStage=touchPage.locator('.tc-tiddler-frame[data-tiddler-title="Graph Edition · Start"] .forge-graph-stage').first();
 const touchEditor=touchStage.locator('.forge-graph-editor').first();
 const touchTools=touchStage.locator('.vis-manipulation').first();
 assert.equal(await touchEditor.isVisible(),false,'iPad graph starts with no large editor');
 await touchTools.locator('.vis-button.vis-add').first().tap();
 assert.equal(await touchEditor.isVisible(),true);
 await touchEditor.locator('.forge-graph-node-name').fill('Touch prøve');
 await touchEditor.locator('.forge-graph-create-node').tap();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Touch prøve')?.hasTag('Graph/Platon'));
 assert.equal(await touchEditor.isVisible(),false);
 await touchTools.locator('.vis-button.vis-connect').first().tap();
 await touchEditor.locator('.forge-graph-edge-from').selectOption('Hulen');
 await touchEditor.locator('.forge-graph-edge-to').selectOption('Touch prøve');
 await touchEditor.locator('.forge-graph-edge-type').selectOption('forbinder');
 await touchEditor.locator('.forge-graph-add-edge').tap();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Hulen').getFieldList('forbinder').includes('Touch prøve'));
 assert.equal(await touchEditor.isVisible(),false);
 await touchEditor.dispatchEvent('forge-graph-action',{detail:{mode:'style',node:'Touch prøve'}});
 await touchEditor.locator('.forge-graph-style-shape').selectOption('star');
 await touchEditor.locator('.forge-graph-apply-style').tap();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Touch prøve').fields['graph-shape']==='star');
 await touchEditor.dispatchEvent('forge-graph-action',{detail:{mode:'style',node:'Touch prøve'}});
 await touchEditor.locator('.forge-graph-style-shape').selectOption('image');
 await touchEditor.locator('.forge-graph-style-icon').selectOption('GraphStudio/Idea');
 await touchEditor.locator('.forge-graph-apply-style').tap();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Touch prøve').fields.icon==='GraphStudio/Idea');
 assert.equal(await touchEditor.isVisible(),false);
 assert.deepEqual(touchErrors,[],'No touch-only JavaScript errors');
 console.log('PASS simulated iPad viewport: native toolbar taps, one popover at a time');
 await touchContext.close();
}finally{await browser.close();}
