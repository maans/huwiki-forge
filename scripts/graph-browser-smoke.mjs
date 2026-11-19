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

  // Native Flibbles workflows, not Forge intercepts:
  // Add Node -> canvas click -> original Tiddler selector modal;
  // Add Edge -> drag between two nodes -> original typed-field modal.
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  const graphStage=page.locator('.tc-tiddler-frame[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage').first();
  const editor=graphStage.locator('.forge-graph-editor').first();
  const nativeTools=graphStage.locator('.vis-manipulation').first();
  const addNode=nativeTools.locator('.vis-button.vis-add').first();
  await addNode.waitFor({state:'visible'});
  const hint=graphStage.locator('.forge-graph-shape-hint').first();
  await hint.waitFor();
  assert.match(await hint.innerText(),language==='da-DK'?/Klik på en node.*form/:/Click a node.*shape/);
  assert.equal(await editor.isVisible(),false,'No permanent Forge configurator');
  await addNode.click();
  const afterAdd=await graphStage.evaluate(stage=>{
   const c=stage.querySelector('.graph-canvas');
   return {mode:c._forgeVisNetwork?.manipulation?.inMode,toolbar:c.querySelector('.vis-manipulation')?.textContent?.slice(0,120)};
  });
  console.log('Native Add Node mode:',afterAdd.mode,'toolbar:',afterAdd.toolbar);
  assert.equal(afterAdd.mode,'addNode','Native Add Node enters the original canvas-click mode');
  assert.equal(await editor.isVisible(),false,'Native Add Node must not open the Forge node form');
  const surface=graphStage.locator('.graph-canvas').first();
  const rect=await surface.boundingBox();
  assert.ok(rect&&rect.width>350&&rect.height>300);
  await page.mouse.click(rect.x+rect.width*0.12,rect.y+rect.height*0.88);
  const afterCanvas=await graphStage.evaluate(stage=>{
   const c=stage.querySelector('.graph-canvas');
   return {mode:c._forgeVisNetwork?.manipulation?.inMode,toolbar:c.querySelector('.vis-manipulation')?.textContent?.slice(0,120),
    overlays:document.querySelectorAll('.tc-modal-wrapper,.tc-modal').length,opened:[...document.querySelectorAll('.tc-modal-wrapper,.tc-modal')].map(x=>x.textContent.slice(0,100))};
  });
  assert.equal(afterCanvas.mode,'addNode','Native node modal should be triggered from the canvas');
  await page.locator('input.graph-select').first().waitFor({state:'visible'});
  assert.match(await page.locator('.tc-modal').first().innerText(),/Select tiddler/);
  const newNode='Brugerens grafprøve';
  await page.locator('input.graph-select').first().fill(newNode);
  await page.getByRole('button',{name:'Okay',exact:true}).first().click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title)&&
    $tw.wiki.filterTiddlers($tw.wiki.getTiddler('$:/graph/Mindmap').fields.filter).includes(title),newNode);
  assert.equal(await editor.isVisible(),false,'Native modal closes without revealing Forge editing');
  console.log('PASS',language,'original canvas-click Select Tiddler modal and editable graph node');

  const back=graphStage.locator('.vis-button.vis-back').first();
  if(await back.isVisible())await back.click();
  const addEdge=graphStage.locator('.vis-button.vis-connect').first();
  await addEdge.waitFor({state:'visible'});
  await addEdge.click();
  assert.equal(await editor.isVisible(),false,'Native Add Edge must not open the Forge edge form');
  // Use the actual Vis coordinate transform to drag the edge across its nodes.
  const nodePoints=await surface.evaluate(el=>{
   const vis=el._forgeVisNetwork;
   if(!vis)throw Error('Missing Vis coordinate accessor');
   const positions=vis.getPositions(['Idéens kerne','Brugerens grafprøve']);
   return ['Idéens kerne','Brugerens grafprøve'].map(title=>vis.canvasToDOM(positions[title]));
  });
  const edgeRect=await surface.boundingBox();
  await page.mouse.move(edgeRect.x+nodePoints[0].x,edgeRect.y+nodePoints[0].y);
  await page.mouse.down();
  await page.mouse.move(edgeRect.x+nodePoints[1].x,edgeRect.y+nodePoints[1].y,{steps:18});
  await page.mouse.up();
  await page.locator('input.graph-select').first().waitFor({state:'visible'});
  assert.match(await page.locator('.tc-modal').first().innerText(),/Select field/);
  await page.locator('input.graph-select').first().fill('forbinder');
  await page.getByRole('button',{name:'Okay',exact:true}).first().click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler('Idéens kerne').getFieldList('forbinder').includes(title),newNode);
  assert.equal(await editor.isVisible(),false,'Native edge drag does not show the Forge edge form');
  if(await back.isVisible())await back.click();
  console.log('PASS',language,'original drag-to-connect workflow and typed-field selector');

  // A normal click on a node, outside manipulation mode, opens only Appearance.
  const styledNode=await surface.evaluate(el=>{
   const vis=el._forgeVisNetwork;
   return vis.canvasToDOM(vis.getPositions(['Brugerens grafprøve'])['Brugerens grafprøve']);
  });
  const shapeRect=await surface.boundingBox();
  await page.mouse.click(shapeRect.x+styledNode.x,shapeRect.y+styledNode.y);
  await editor.waitFor({state:'visible'});
  assert.equal(await editor.locator('.forge-graph-editor-panel:visible').count(),1,
    'Only the Appearance panel appears on a normal node click');
  assert.equal(await editor.locator('.forge-graph-editor-title').innerText(),
    language==='da-DK'?'Udseende':'Appearance');
  assert.equal(await editor.locator('.forge-graph-style-shape option[value="diamond"]').innerText(),
    language==='da-DK'?'Diamant':'Diamond');
  await editor.locator('.forge-graph-style-shape').selectOption('diamond');
  await editor.locator('.forge-graph-style-color').fill('#9475ba');
  await editor.locator('.forge-graph-style-size').fill('42');
  await editor.locator('.forge-graph-apply-style').click();
  await page.waitForFunction(title=>$tw.wiki.getTiddler(title).fields['graph-shape']==='diamond',newNode);
  assert.equal(await editor.isVisible(),false);
  const shape=await page.evaluate(title=>{const t=$tw.wiki.getTiddler(title);return [t.fields['graph-shape'],t.fields.color,t.fields['graph-size']];},newNode);
  assert.deepEqual(shape,['diamond','#9475ba','42']);
  console.log('PASS',language,'single-click Appearance → localized Shape → Save');
  assert.equal(await page.locator('.tc-error-form').count(),0);
  await graphStage.locator('canvas').first().waitFor();

  await page.evaluate(()=>$tw.wiki.addTiddler({title:'Nyt begreb',tags:['Graph/Mindmap'],text:'En ny redigerbar node.'}));
  assert.equal(await page.evaluate(()=>$tw.wiki.filterTiddlers('[tag[Graph/Mindmap]]').length),8);
  await page.evaluate(()=>$tw.wiki.addTiddler({title:'$:/StoryList',list:['Graph Edition · Mindmap']}));
  await page.locator('[data-tiddler-title="Graph Edition · Mindmap"] .forge-graph-stage canvas').first().waitFor();
  assert.equal(await page.locator('.tc-error-form').count(),0,'No TiddlyWiki error dialogs');
  assert.deepEqual(errors,[],'No uncaught browser errors: '+errors.join('; '));
  console.log('PASS',language,'offline graph boot, three canvases, relation datasets, new editable node');
  await context.close();
 }

 // Native Add Node with a real tap at an iPad-sized viewport, and a normal
 // touch on a node opens the same concise appearance panel.
 const touchContext=await browser.newContext({locale:'da-DK',hasTouch:true,isMobile:true,deviceScaleFactor:2,viewport:{width:834,height:1112}});
 await touchContext.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 const touchPage=await touchContext.newPage();touchPage.setDefaultTimeout(25000);
 const touchErrors=[];touchPage.on('pageerror',error=>touchErrors.push(error.message));
 await touchPage.goto(pathToFileURL(path.join(dir,'graph-da-DK.html')).href);
 const touchStage=touchPage.locator('.tc-tiddler-frame[data-tiddler-title="Graph Edition · Start"] .forge-graph-stage').first();
 const touchEditor=touchStage.locator('.forge-graph-editor').first();
 const touchCanvas=touchStage.locator('.graph-canvas').first();
 await touchStage.locator('.vis-manipulation .vis-button.vis-add').first().tap();
 assert.equal(await touchEditor.isVisible(),false);
 const touchRect=await touchCanvas.boundingBox();
 await touchPage.touchscreen.tap(touchRect.x+touchRect.width*0.10,touchRect.y+touchRect.height*0.85);
 await touchPage.locator('input.graph-select').first().waitFor();
 await touchPage.locator('input.graph-select').first().fill('Touch prøve');
 await touchPage.getByRole('button',{name:'Okay',exact:true}).first().click();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Touch prøve')&&
  $tw.wiki.filterTiddlers($tw.wiki.getTiddler('$:/graph/Platon').fields.filter).includes('Touch prøve'));
 const touchBack=touchStage.locator('.vis-button.vis-back').first();
 if(await touchBack.isVisible())await touchBack.tap();
 const touchNode=await touchCanvas.evaluate(el=>{
  const vis=el._forgeVisNetwork;
  return vis.canvasToDOM(vis.getPositions(['Touch prøve'])['Touch prøve']);
 });
 const touchCanvasRect=await touchCanvas.boundingBox();
 await touchPage.touchscreen.tap(touchCanvasRect.x+touchNode.x,touchCanvasRect.y+touchNode.y);
 await touchEditor.waitFor({state:'visible'});
 await touchEditor.locator('.forge-graph-style-shape').selectOption('star');
 await touchEditor.locator('.forge-graph-apply-style').tap();
 await touchPage.waitForFunction(()=>$tw.wiki.getTiddler('Touch prøve').fields['graph-shape']==='star');
 assert.equal(await touchEditor.isVisible(),false);
 assert.deepEqual(touchErrors,[]);
 console.log('PASS simulated iPad viewport: native canvas tap adds node and node tap opens Shape');
 await touchContext.close();
}finally{await browser.close();}
