import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
async function fixture(){
 const rows=new Map();class Tiddler{constructor(...args){this.fields=Object.assign({},...args.map(a=>a?.fields||a));}}
 const wiki={allTitles:()=>[...rows.keys()],getTiddler:t=>rows.get(t),getTiddlerText:(t,f='')=>rows.get(t)?.fields.text??f,getCreationFields:()=>({}),tiddlerExists:t=>rows.has(t),addTiddler:t=>rows.set(t.fields.title,t),getTiddlerList:(t,field='list')=>JSON.parse(rows.get(t)?.fields[field]||'[]')};
 const model={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/model.js',import.meta.url),'utf8'),{exports:model,$tw:{Tiddler,utils:{stringifyList:JSON.stringify}}});
 const add=f=>wiki.addTiddler(new Tiddler(f));return {wiki,model,add};
}
test('video selection resolves through orchestra items and preserves scores and set order',async()=>{
 const {wiki,model,add}=await fixture();
 add({title:'Tune','repertoire-kind':'piece','abc-source':'X:1\nK:C\nC4|','repertoire-youtube':'https://youtu.be/8UNtQpMMSEM','repertoire-youtube-match':'original','repertoire-youtube-start':'12','notes':'Keep'});
 add({title:'Item','repertoire-kind':'orchestra-item','music-title':'Tune'});
 add({title:'Set','repertoire-kind':'setlist',list:'["Item"]','repertoire-overrides':'{}'});
 const before=JSON.stringify(wiki.getTiddler('Tune').fields),order=JSON.stringify(model.entries(wiki,'Set'));
 model.setPresentation(wiki,'Set',null,'youtube');const view=model.presentation(wiki,'Set','Item');
 assert.equal(view.format,'youtube');assert.equal(view.abc,false);assert.equal(view.pdf,'');assert.equal(view.video.id,'8UNtQpMMSEM');assert.equal(view.video.start,12);
 assert.equal(JSON.stringify(wiki.getTiddler('Tune').fields),before);assert.equal(JSON.stringify(model.entries(wiki,'Set')),order);
 model.setVideo(wiki,'Item','https://www.youtube.com/watch?v=YUeuU9mu8mU');
 assert.equal(model.video(wiki,'Item').match,'manual');assert.equal(model.video(wiki,'Item').start,0);assert.equal(wiki.getTiddler('Tune').fields.notes,'Keep');
});
test('arbitrary iframe sources and malformed video IDs are rejected',async()=>{
 const {model}=await fixture();
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=8UNtQpMMSEM','https://example.com/embed/8UNtQpMMSEM','<iframe src="evil">','https://youtu.be/8UNtQpMMSEMextra'])assert.equal(model.youtubeId(url),'');
 for(const url of ['8UNtQpMMSEM','https://youtu.be/8UNtQpMMSEM?t=12','https://www.youtube.com/shorts/8UNtQpMMSEM','https://m.youtube.com/watch?v=8UNtQpMMSEM&list=abc'])assert.equal(model.youtubeId(url),'8UNtQpMMSEM');
});
test('embedded video is click-to-play and is unloaded when its view closes',async()=>{
 const doc=svgDocument(),module={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/youtube-video.js',import.meta.url),'utf8'),{exports:module});
 const video=module.mount(doc.body,{title:'Libertango',video:{id:'8UNtQpMMSEM',match:'reference',note:'Arrangement ikke bekræftet',start:0}}),frame=doc.body.querySelector('iframe');
 assert.match(frame.src,/^https:\/\/www.youtube-nocookie.com\/embed\/8UNtQpMMSEM\?autoplay=0/);assert.equal(frame.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');assert.match(doc.body.textContent,/ikke bekræftet/);
 video.destroy();video.destroy();assert.equal(frame.src,'about:blank');assert.equal(doc.body.querySelector('iframe'),null);
});
