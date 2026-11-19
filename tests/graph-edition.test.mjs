import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
test('Graph Edition is registered as a self-contained original-plugin demo',async()=>{
 const manifest=await read('editions/graph/manifest.json');
 const catalog=await read('catalog/editions.json');
 const lang=await read('catalog/assembler-i18n.json');
 assert.equal(manifest.id,'graph');
 assert.equal(manifest.coreVersion,'5.4.1');
 assert.ok(manifest.tiddlers.includes('../shared/libraries.json'));
 assert.ok(catalog.editions.some(x=>x.id==='graph'));
 assert.ok(lang.editions.graph.da.name && lang.editions.graph.en.name);
 for(const n of ['flibbles-graph','flibbles-vis-network','graph-studio'])assert.ok(manifest.plugins.some(p=>p.includes('/'+n+'/dist/plugin.json')));
 const studio=await read('plugins/graph-studio/dist/plugin.json');
 assert.equal(studio['plugin-type'],'plugin');
 assert.match(studio.dependents,/flibbles\/graph/);
 assert.match(studio.dependents,/flibbles\/vis-network/);
});
test('All three demo graphs connect existing tagged tiddlers',async()=>{
 const data=await read('editions/graph/tiddlers/seed.json');
 const titles=new Set(data.map(t=>t.title));
 const rels=['symboliserer','fører-til','forudsætter','forbinder'];
 for(const [id,tag] of [['Platon','Graph/Platon'],['Mindmap','Graph/Mindmap'],['Projekt','Graph/Projekt']]){
  const graph=data.find(t=>t.title==='$:/graph/'+id);
  assert.equal(graph.type,'application/json');
  const positions=JSON.parse(graph.text);
  const members=data.filter(t=>t.tags?.split(' ').includes(tag));
  assert.ok(members.length>=7);
  assert.deepEqual(new Set(Object.keys(positions)),new Set(members.map(t=>t.title)));
  for(const t of members){
   for(const name of rels){for(const target of (t[name]||'').matchAll(/\[\[([^\]]+)\]\]/g))assert.ok(titles.has(target[1]),t.title+' '+name+' → '+target[1]);}
  }
 }
 const start=data.find(x=>x.title==='Graph Edition · Start');
 assert.match(start.text,/<\$graph.view \$tiddler="\$:\/graph\/Platon"/);
});
test('Pinned release bundles are byte-for-byte verified and contain TiddlyWiki plugins',async()=>{
 const items=[
  ['plugins/flibbles-graph/dist/plugin.json','259b7f6b70214347a6ce031cfda61c3ee7df16dc00d4a4dd26cbd7c7ff2e55b5','$:/plugins/flibbles/graph','1.7.1'],
  ['plugins/flibbles-vis-network/dist/plugin.json','e2922b21a88d7934b05cf58774fff1da4f8efe89cf41b4effcb4f3a268b65bd5','$:/plugins/flibbles/vis-network','10.6.3']
 ];
 for(const [file,digest,title,version] of items){
  const bytes=await readFile(new URL('../'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
  const plugin=JSON.parse(bytes.toString('utf8'));
  assert.equal(plugin.title,title);
  assert.equal(plugin.version,version);
  assert.ok(Object.keys(JSON.parse(plugin.text).tiddlers).length>5);
 }
});

test('Graph WikiText keeps block mode for headings and numbered lists within bilingual widgets',async()=>{
 const data=await read('editions/graph/tiddlers/seed.json');
 const tiddlers=data.filter(t=>t.title.startsWith('Graph Edition · ')||t.tags?.startsWith('Graph/'));
 assert.equal(tiddlers.length,32);
 for(const t of tiddlers){
  assert.match(t.text,/<\$list [^\n]+>\n\n! /,t.title+' must enter block mode after list widget');
  assert.doesNotMatch(t.text,/<\$list [^\n]+>\n! /,t.title+' must not enter inline mode');
  if(t.text.includes('class="forge-graph-workbench"')){
   assert.ok(t.text.startsWith('<div class="forge-graph-workbench">\n\n'),t.title+' requires block mode after div');
  }
 }
 const guide=tiddlers.find(t=>t.title==='Graph Edition · Kom i gang').text;
 assert.match(guide,/\n\n# Åbn et af kortene/,'Danish WikiText numbered list');
 assert.match(guide,/\n\n# Open one of the maps/,'English WikiText numbered list');
});

test('Graph Studio exposes an independent direct editor and per-node visual properties',async()=>{
 const studio=await read('plugins/graph-studio/dist/plugin.json');
 const components=JSON.parse(studio.text).tiddlers;
 const nodeWidget=components['$:/plugins/huwiki/graph-studio/widgets/editor.js'];
 const template=components['$:/plugins/huwiki/graph-studio/templates/forge-graph'];
 assert.equal(nodeWidget['module-type'],'widget');
 assert.match(nodeWidget.text,/exports\["forge-graph-editor"\]/);
 assert.match(template.text,/shape=\{\{!!graph-shape\}\}/);
 assert.match(template.text,/size=\{\{!!graph-size\}\}/);
 assert.match(template.text,/<\$nodes\.writable \$field=filter>/,'Original editable graph engine remains in use');
 for(const icon of ['GraphStudio/Sun','GraphStudio/Flame','GraphStudio/Idea']){
  assert.equal(components[icon].type,'image/svg+xml');
  assert.match(components[icon].text,/<svg[^>]+viewBox=/);
 }
 const nodes=await read('editions/graph/tiddlers/seed.json');
 const shapes=new Set(nodes.filter(t=>t.tags?.startsWith('Graph/')).map(t=>t['graph-shape']));
 assert.ok(shapes.size>=6,'Examples must use multiple shapes, not just circles');
 for(const name of ['Platon','Mindmap','Projekt']){
  const graph=nodes.find(t=>t.title==='$:/graph/'+name);
  assert.equal(graph.template,'$:/plugins/huwiki/graph-studio/templates/forge-graph');
  assert.equal(graph['forge-node-tag'],'Graph/'+name);
  assert.notEqual(JSON.parse(graph['graph.nodes']).shape,'dot');
 }
 for(const title of ['Graph Edition · Start','Graph Edition · Platon','Graph Edition · Mindmap','Graph Edition · Projekt']){
  const page=nodes.find(t=>t.title===title);
  assert.match(page.text,/<\$forge-graph-editor graph="\$:/);
 }
});

test('Upstream graph gestures are not intercepted and Appearance is explicitly signposted',async()=>{
 const plugin=await read('plugins/graph-studio/dist/plugin.json');
 const shadows=JSON.parse(plugin.text).tiddlers;
 const bridge=shadows['$:/plugins/huwiki/graph-studio/vis-controls.js'];
 const editor=shadows['$:/plugins/huwiki/graph-studio/widgets/editor.js'];
 const css=shadows['$:/plugins/huwiki/graph-studio/styles'].text;
 assert.equal(bridge['module-type'],'vis-property');
 assert.match(bridge.text,/network.on\("click"/);
 assert.match(bridge.text,/nativeManipulation.inMode!==false/);
 assert.doesNotMatch(bridge.text,/preventDefault|stopImmediatePropagation/);
 assert.doesNotMatch(bridge.text,/vis-add|vis-connect|pointerdown/);
 assert.match(bridge.text,/Klik på en node for at ændre form eller billede/);
 assert.match(editor.text,/SHAPE_NAMES/);
 assert.match(editor.text,/Diamant/);
 assert.match(editor.text,/nodePanel.hidden=/);
 assert.match(editor.text,/edgePanel.hidden=/);
 assert.match(editor.text,/stylePanel.hidden=/);
 assert.match(css,/\.forge-graph-shape-hint/);
 assert.doesNotMatch(css,/\.vis-manipulation\{display:none/);
 const pages=await read('editions/graph/tiddlers/seed.json');
 for(const title of ['Graph Edition · Start','Graph Edition · Platon','Graph Edition · Mindmap','Graph Edition · Projekt']){
  const page=pages.find(p=>p.title===title);
  assert.match(page.text,/<div class="forge-graph-stage">\n\n<\$forge-graph-editor /,title);
 }
 for(const name of ['Platon','Mindmap','Projekt']){
  const graph=pages.find(p=>p.title==='$:/graph/'+name);
  assert.notEqual(JSON.parse(graph['graph.graph']).hideControls,true);
 }
});
test('Graph Studio minor beta and on-demand Edition versions stay aligned',async()=>{
 const plugin=await read('plugins/graph-studio/dist/plugin.json');
 const edition=await read('editions/graph/manifest.json');
 const catalog=await read('catalog/editions.json');
 assert.equal(plugin.version,'0.2.3-beta.1');
 assert.equal(edition.version,plugin.version);
 assert.equal(catalog.editions.find(e=>e.id==='graph').version,plugin.version);
});
