import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const p=JSON.parse(await readFile('plugins/shop/dist/plugin.json','utf8')),rows=JSON.parse(p.text).tiddlers,cache={};
function load(id){if(cache[id])return cache[id];const t=rows[id];if(t.type==='application/json')return cache[id]=JSON.parse(t.text);const exports={};vm.runInNewContext(t.text,{exports,require:load,URL},{timeout:1000});return cache[id]=exports;}
const m=load('$:/plugins/huwiki/shop/model.js');
test('Shop retains nine source templates and exports all three original layouts in both languages',()=>{
 assert.equal(m.templates.length,9);for(const t of m.templates)for(const lang of ['da','en'])for(const layout of ['gallery','list','poster']){const d=m.fromTemplate(t.id,lang);d.mode='catalog';d.layout=layout;const out=m.site(d,lang,false);assert.match(out.html,/<!doctype html>/);assert.ok(out.html.includes('lang="'+lang+'"'));assert.ok(out.html.includes('shop-site '+layout));assert.equal(out.html.includes('google.script.run'),false);assert.equal(out.fragment.includes('<html'),false);}
 assert.equal(p.title,'$:/plugins/huwiki/shop');assert.equal(p.author,'HUWiki');assert.equal(p.license,undefined);
});
test('Public Shop export uses an allowlist and escapes content; private setup and arbitrary HTML cannot leak',()=>{
 const d=m.fromTemplate('fest','en');d.formUrl='https://docs.google.com/forms/d/e/TEST/viewform';d.sheetUrl='PRIVATE-SHEET';d.orders='PRIVATE-ORDER';d.checks='PRIVATE-CHECK';d.title='<script>alert(1)</script>';d.items[0].name='<img src=x onerror=alert(2)>';d.contact='<a href="javascript:evil">';
 const out=m.site(d,'en',false).html;assert.doesNotMatch(out,/PRIVATE-|<script|<img src=x|javascript:evil">/);assert.match(out,/&lt;script&gt;/);assert.match(out,/&lt;img/);assert.match(out,/noopener noreferrer/);
 for(const url of ['javascript:alert(1)','data:text/html,evil','https://user:pass@example.org']){assert.throws(()=>m.site({...d,formUrl:url},'en',false));assert.throws(()=>m.site({...d,items:[{...d.items[0],image:url}]},'en',false));}
});
test('Google edit links are rejected; responder links work; catalogs remain independent of Google',()=>{
 const d=m.fromTemplate('fri','da');for(const url of ['https://docs.google.com/forms/d/ID/edit','https://docs.google.com/spreadsheets/d/ID/edit','https://example.org/form'])assert.throws(()=>m.site({...d,formUrl:url},'da',false),/form/);
 for(const url of ['https://docs.google.com/forms/d/e/ID/viewform','https://docs.google.com/forms/d/ID/viewform','https://forms.gle/abc'])assert.ok(m.site({...d,formUrl:url},'da',false).html.includes(url));
 assert.throws(()=>m.site(d,'da',false),/form/);assert.ok(m.site({...d,mode:'catalog'},'da',false));assert.ok(m.site({...d,mode:'external',formUrl:'https://example.org/order'},'da',false));
 assert.throws(()=>m.catalog({...d,items:[{name:'bad',price:'NaN'}]}),/price/);assert.throws(()=>m.catalog({...d,items:[]}),/items/);
});
test('Shop helper only serves the exported file and refuses writes and private paths',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shop-server-'));await writeFile(path.join(dir,'index.html'),'PUBLIC-SHOP');await writeFile(path.join(dir,'private.txt'),'PRIVATE');await writeFile(path.join(dir,'shop-server.cjs'),await readFile('plugins/shop/src/shop-server.cjs'));
 const proc=spawn(process.execPath,[path.join(dir,'shop-server.cjs')],{stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{let error='';const timer=setTimeout(()=>reject(Error('Shop helper startup timeout')),5000);proc.stdout.once('data',()=>{clearTimeout(timer);resolve();});proc.stderr.on('data',d=>error+=d);proc.once('exit',code=>{clearTimeout(timer);reject(Error('Shop helper exited '+code+': '+error));});});
  assert.equal(await (await fetch('http://127.0.0.1:8787/')).text(),'PUBLIC-SHOP');
  assert.equal((await fetch('http://127.0.0.1:8787/private.txt')).status,404);assert.equal((await fetch('http://127.0.0.1:8787/',{method:'POST',body:'x'})).status,405);
  assert.equal(await (await fetch('http://127.0.0.1:8787/',{method:'HEAD'})).text(),'');
  await writeFile(path.join(dir,'index.html'),'UPDATED-SHOP');assert.equal(await (await fetch('http://127.0.0.1:8787/')).text(),'UPDATED-SHOP');
 }finally{proc.kill();await rm(dir,{recursive:true,force:true});}
});
