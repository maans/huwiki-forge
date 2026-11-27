import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const source=await readFile(new URL('../plugins/abc/src/fullscreen.js',import.meta.url),'utf8');
function fixture(){
 const exports={};runInNewContext(source,{exports});
 const doc=svgDocument(),scrolls=[];
 doc.documentElement=doc.createElement('html');
 doc.createComment=text=>{const comment=doc.createElement('#comment');comment.textContent=text;return comment;};
 Object.assign(doc.defaultView,{scrollX:11,scrollY:470,scrollTo(x,y){scrolls.push([x,y]);}});
 const frame=doc.createElement('article'),before=doc.createElement('button'),host=doc.createElement('section'),after=doc.createElement('p');
 doc.body.append(frame);frame.append(before,host,after);before.focus();
 doc.body.style.overflow='auto';doc.documentElement.style.overflow='scroll';
 let exits=0;
 const controller=exports.mount({host,onExit(){exits++;}});
 return {doc,frame,before,host,after,controller,exports,scrolls,exits:()=>exits};
}

test('denied native fullscreen still moves the unchanged reader outside its tiddler and restores its exact position',async()=>{
 const h=fixture();let requests=0;
 h.host.requestFullscreen=()=>{requests++;return Promise.reject(Error('Unavailable on this device'));};
 h.controller.enter(true);await Promise.resolve();
 assert.equal(requests,1);assert.equal(h.host.parentNode,h.doc.body);
 assert.equal(h.host.classList.contains('huwabc-fullscreen-surface'),true);
 assert.equal(h.doc.body.style.overflow,'hidden');assert.equal(h.doc.documentElement.style.overflow,'hidden');
 const sameChild=h.doc.createElement('button');h.host.append(sameChild);sameChild.focus();
 h.controller.exit();
 assert.deepEqual(h.frame.childNodes,[h.before,h.host,h.after]);
 assert.equal(h.host.firstChild,sameChild,'the score and audio DOM are moved, never cloned or rendered again');
 assert.equal(h.doc.body.style.overflow,'auto');assert.equal(h.doc.documentElement.style.overflow,'scroll');
 assert.equal(h.doc.activeElement,h.before);assert.deepEqual(h.scrolls,[[11,470]]);
 assert.equal(h.exits(),0,'programmatic exit does not notify itself recursively');
 h.controller.destroy();
});

test('browser Escape closes the owner once, and WebKit void-return fullscreen is supported',()=>{
 const h=fixture();let nativeExits=0;
 h.host.webkitRequestFullscreen=()=>{h.doc.webkitFullscreenElement=h.host;h.doc.dispatch('webkitfullscreenchange',{});};
 h.doc.webkitExitFullscreen=()=>{nativeExits++;h.doc.webkitFullscreenElement=null;h.doc.dispatch('webkitfullscreenchange',{});};
 h.controller.enter(true);assert.equal(h.doc.webkitFullscreenElement,h.host);
 h.doc.webkitFullscreenElement=null;h.doc.dispatch('webkitfullscreenchange',{});
 assert.equal(h.controller.isActive(),false);assert.equal(h.exits(),1);
 assert.equal(h.host.parentNode,h.frame);assert.equal(nativeExits,0);
 h.controller.enter(true);h.controller.destroy();
 assert.equal(nativeExits,1);assert.equal(h.exits(),1);
 h.doc.dispatch('webkitfullscreenchange',{});assert.equal(h.exits(),1);
});

test('overlapping reading surfaces keep scrolling locked until the last owner leaves',()=>{
 const h=fixture(),second=h.doc.createElement('section');h.frame.append(second);
 const other=h.exports.mount({host:second});
 h.controller.enter(false);other.enter(false);h.controller.exit();
 assert.equal(h.doc.body.style.overflow,'hidden');assert.equal(h.scrolls.length,0);
 other.destroy();assert.equal(h.doc.body.style.overflow,'auto');assert.deepEqual(h.scrolls,[[11,470]]);
 h.controller.destroy();
});

test('a child remains inside the existing native fullscreen book',()=>{
 const h=fixture();h.doc.fullscreenElement=h.frame;
 let requests=0;h.host.requestFullscreen=()=>{requests++;};
 h.controller.enter(true);
 assert.equal(h.host.parentNode,h.frame);assert.equal(requests,0);
 h.controller.exit();assert.equal(h.doc.fullscreenElement,h.frame,'closing a child must not exit its owner');
 assert.deepEqual(h.frame.childNodes,[h.before,h.host,h.after]);h.controller.destroy();
});

test('a native request resolving after the reader closes cannot leave an orphan fullscreen surface',async()=>{
 const h=fixture();let resolve,nativeExits=0;
 h.host.requestFullscreen=()=>new Promise(done=>{resolve=done;});
 h.doc.exitFullscreen=()=>{nativeExits++;h.doc.fullscreenElement=null;return Promise.resolve();};
 h.controller.enter(true);h.controller.destroy();
 h.doc.fullscreenElement=h.host;resolve();await Promise.resolve();
 assert.equal(nativeExits,1);assert.equal(h.doc.fullscreenElement,null);assert.equal(h.host.parentNode,h.frame);
});
