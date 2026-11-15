import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const tiddler=JSON.parse(readFileSync(new URL('../plugins/ai/src/i18n.js.json',import.meta.url),'utf8'));
const exports={};
runInNewContext(tiddler.text,{exports,WeakMap});
const da={getTiddlerText:()=>'$:/languages/da-DK'};
const en={getTiddlerText:()=>'$:/languages/en-GB'};
test('AI Forge labels resolve to intended Danish/English text',()=>{
 assert.equal(exports.label('307',da),'Din viden. Din AI. Din wiki.');
 assert.equal(exports.label('310',da),'Kom i gang →');
 assert.equal(exports.label('311',da),'Åbn AI-chat');
 assert.equal(exports.label('540',da),'↗ Chat bliver til tiddlere');
 assert.equal(exports.label('302',da),'Forside');
 assert.equal(exports.label('360',da),'Forbind din AI');
 assert.equal(exports.label('294',da),'Test AI-svar');
 assert.equal(exports.label('310',en),'Get started →');
});
