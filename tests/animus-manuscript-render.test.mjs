import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
let TiddlyWiki;
try {
  ({TiddlyWiki} = require('tiddlywiki'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'tiddlywiki'")) throw error;
}

test('Fyrtøjet manuscript renders nine scene headings below the three act headings', {
  skip: TiddlyWiki ? false : 'Install the pinned TiddlyWiki devDependency to run the real WikiText renderer (CI installs it with the browser controller).'
}, async () => {
  const wikiFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'animus-manuscript-render-'));
  try {
    const $tw = TiddlyWiki();
    $tw.boot.argv = [wikiFolder];
    $tw.boot.disabledStartupModules = ['commandline'];
    await new Promise(resolve => $tw.boot.boot(resolve));
    const pkg = JSON.parse(fs.readFileSync(new URL('../plugins/animus-example-fyrtoejet/dist/plugin.json', import.meta.url), 'utf8'));
    const manuscript = JSON.parse(pkg.text).tiddlers['Fyrtøjet · Manuskript'];
    const wiki = new $tw.Wiki();
    wiki.addTiddler(manuscript);
    const html = wiki.renderTiddler('text/html', manuscript.title);
    const headings = [...html.matchAll(/<(h[1-6])(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)]
      .map(match => ({level: Number(match[1].slice(1)), text: match[2].replace(/<[^>]*>/g, '').trim()}));

    assert.deepEqual(headings, [
      {level: 1, text: 'FYRTØJET — EN MUSICAL I TRE AKTER'},
      {level: 2, text: 'Personer'},
      {level: 2, text: 'Prolog'},
      {level: 2, text: 'AKT 1 — Skovens hemmelighed'},
      {level: 3, text: 'Scene 1.1 — Skovens sti'},
      {level: 3, text: 'Scene 1.2 — Træets tre rum'},
      {level: 3, text: 'Scene 1.3 — Fyrtøjets pris'},
      {level: 2, text: 'AKT 2 — Guldets glans'},
      {level: 3, text: 'Scene 2.1 — Byens gyldne gader'},
      {level: 3, text: 'Scene 2.2 — Prinsessens vindue'},
      {level: 3, text: 'Scene 2.3 — Et besøg i natten'},
      {level: 2, text: 'AKT 3 — Frihedens gnist'},
      {level: 3, text: 'Scene 3.1 — Kongens retssal'},
      {level: 3, text: 'Scene 3.2 — Hundene på torvet'},
      {level: 3, text: 'Scene 3.3 — Lys over byen'},
      {level: 2, text: 'Epilog'},
      {level: 2, text: 'Produktionsprincip'}
    ]);
    assert.doesNotMatch(html, /<li\b[^>]*>\s*!!\s*Scene/, 'scene headings must not become numbered list items');
    assert.match(html, /<strong>Scenetid:<\/strong> 3:36–4:12/, 'scene content still renders below its heading');
  } finally {
    fs.rmSync(wikiFolder, {recursive: true, force: true});
  }
});
