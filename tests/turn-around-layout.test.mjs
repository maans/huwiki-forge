import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readJson=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));

test('Turn Around story river follows the native TiddlyWiki sidebar state',async()=>{
  const manifest=await readJson('editions/turn-around/manifest.json');
  assert.ok(manifest.tiddlers.includes('tiddlers/layout-fix.json'));

  const tiddlers=await readJson('editions/turn-around/tiddlers/layout-fix.json');
  const style=tiddlers.find(t=>t.title==='$:/plugins/maans/plato/sidebar-layout.css');
  const state=tiddlers.find(t=>t.title==='$:/plugins/maans/plato/sidebar-width-state');

  assert.equal(style?.type,'text/css');
  assert.equal(style?.tags,'$:/tags/Stylesheet');
  assert.equal(state?.tags,'$:/tags/ClassFilters/PageTemplate');
  assert.equal(state?.text,'[{$:/state/sidebar}match[no]then[plato-sidebar-closed]]');

  // The sidebar remains in the DOM even when collapsed. Presence is not visibility.
  assert.doesNotMatch(style.text,/:has\\(\\.tc-sidebar-scrollable\\)/);
  // Open: reserve room for the native sidebar; closed: reclaim that room.
  assert.match(style.text,/margin:\\s*0 280px 0 24px !important/);
  assert.match(style.text,/\\.plato-sidebar-closed \\.tc-story-river/);
  assert.match(style.text,/margin-right:\\s*24px !important/);
  // Retain the native tiddler toolbar (the audience player is a separate UI).
  assert.match(style.text,/\\.tc-titlebar/);
});
