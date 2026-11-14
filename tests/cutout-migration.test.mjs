import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const original=JSON.parse(gunzipSync(Buffer.from((await read('migration/cutout/original-plugin.b64')).trim(),'base64')));
const plugin=JSON.parse(await read('plugins/cutout/dist/plugin.json'));
const before=JSON.parse(original.text).tiddlers,after=JSON.parse(plugin.text).tiddlers,prefix='$:/plugins/huwiki/cutout/';
test('CutOut preserves original engine, project model, samples and vendor license',async()=>{
 for(const name of ['engine.js','model.js','clock.js','publish.js','vendor/jszip.js','vendor/jszip-license'])assert.deepEqual(after[prefix+name],before[prefix+name]);
 for(const title of ['Demo – Tændstikmand','Demo – Tændstikmand (dukke)'])assert.deepEqual(after[title],before[title]);
 assert.equal(plugin.author,original.author);assert.equal(plugin.license,original.license,'Do not invent a license absent from the original');
 assert.equal(await read('plugins/cutout/licenses/JSZip.txt'),before[prefix+'vendor/jszip-license'].text);
});
test('CutOut has no executable Google bridge, server publication button or extra language selector',()=>{
 for(const row of Object.values(after)){if(row.type==='application/javascript'){
  assert.doesNotMatch(row.text,/google\.script|DriveApp|HUDriveApp/);
  new vm.Script(row.text,{filename:row.title});
 }}
 assert.doesNotMatch(after[prefix+'i18n.js'].text,/CutOut language \/ CutOut-sprog|s\.onchange/);
 assert.doesNotMatch(after[prefix+'widgets/publisher.js'].text,/H\.siteDialog\(/);
 assert.match(after[prefix+'hosting.js'].text,/P\.downloadBlob\(P\.archiveHtml/);
});
test('Native language translates CutOut without changing user project data',()=>{
 const context={exports:{}};vm.runInNewContext(after[prefix+'i18n.js'].text,context);
 const ui=context.exports;
 for(const [lang,expected] of [['da-DK','Projekt'],['en-GB','Project']]){
  const wiki={getTiddlerText:()=>'$:/languages/'+lang};assert.equal(ui.t('Projekt',wiki),expected);
 }
 assert.equal(ui.t('My unique project',{getTiddlerText:()=>'$:/languages/en-GB'}),'My unique project');
});
