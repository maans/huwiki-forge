import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

async function setup({preferShare=false,navigator={},printError=null}={}){
 const doc=svgDocument(),lib={},listeners={},revoked=[],errors=[],calls=[];doc.head=doc.createElement('head');
 const create=doc.createElement;doc.createElement=tag=>{const node=create(tag);if(tag==='img')Object.defineProperty(node,'src',{set(value){this._src=value;queueMicrotask(()=>this.onload?.());},get(){return this._src;}});return node;};
 let serial=0;const win={URL:{createObjectURL:()=>`blob:page-${++serial}`,revokeObjectURL:url=>revoked.push(url)},focus(){calls.push('focus');},print(){calls.push('print');assert.equal(doc.body.classList.contains('huprint-native-printing'),true);if(printError)throw printError;},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]};
 runInNewContext(await readFile(new URL('../plugins/print-article/src/output-actions.js',import.meta.url),'utf8'),{exports:lib,Blob,Promise});
 const output=lib.mount({document:doc,window:win,navigator,preferShare,language:'da',onError:error=>errors.push(error)});
 return {doc,output,calls,errors,revoked,listeners};
}
const pages=[{data:new Uint8Array([1])},{blank:true},{data:new Uint8Array([2])}];

test('desktop Print uses the exact prepared PDF pages and opens Print even when Web Share exists',async()=>{
 let shares=0;const f=await setup({navigator:{share(){shares++;},canShare:()=>true}});
 assert.equal(f.output.activate({}),false,'unfinished pages cannot print');
 await f.output.prepare(pages);assert.equal(f.output.isReady(),true);
 assert.equal(f.doc.body.querySelectorAll('.huprint-native-pages > section').length,3);
 assert.equal(f.doc.body.querySelectorAll('.huprint-native-pages img').length,2);
 assert.equal(f.output.activate({}),true);assert.deepEqual(f.calls,['focus','print']);assert.equal(shares,0);
 f.listeners.afterprint();assert.equal(f.doc.body.classList.contains('huprint-native-printing'),false);
 f.output.destroy();assert.equal(f.revoked.length,2);assert.equal(f.doc.body.querySelector('.huprint-native-pages'),null);
});

test('touch devices retain file sharing and a cancelled share never prints',async()=>{
 for(const cancelled of [false,true]){
  let shares=0;const f=await setup({preferShare:true,navigator:{canShare:()=>true,share(){shares++;return cancelled?Promise.reject({name:'AbortError'}):Promise.resolve();}}});
  await f.output.prepare(pages);assert.equal(await f.output.activate({}),!cancelled);assert.equal(shares,1);assert.deepEqual(f.calls,[]);f.output.destroy();
 }
});

test('unavailable, rejected and synchronously broken sharing all fall back to real printing',async()=>{
 for(const navigator of [{},{canShare:()=>false,share(){assert.fail();}},{canShare(){throw Error('unsupported');},share(){assert.fail();}},{share(){return Promise.reject({name:'NotAllowedError'});}},{share(){throw Error('host bridge failure');}}]){
  const f=await setup({preferShare:true,navigator});await f.output.prepare(pages);
  assert.equal(await f.output.activate({}),true);assert.deepEqual(f.calls,['focus','print']);assert.deepEqual(f.errors,[]);f.output.destroy();
 }
});

test('a print failure is visible and leaves the wiki usable; a reset cannot print stale pages',async()=>{
 const f=await setup({printError:Error('no printer bridge')});await f.output.prepare(pages);
 assert.equal(f.output.activate({}),false);assert.equal(f.errors[0].message,'no printer bridge');
 assert.equal(f.doc.body.classList.contains('huprint-native-printing'),false);
 f.output.reset();assert.equal(f.output.isReady(),false);assert.equal(f.output.activate({}),false);assert.equal(f.revoked.length,2);f.output.destroy();
});
