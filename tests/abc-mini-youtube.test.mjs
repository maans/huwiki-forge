import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
const read=p=>readFile(new URL('../plugins/abc/src/'+p,import.meta.url),'utf8');
class Tiddler{constructor(...values){this.fields=Object.assign({},...values.map(v=>v?.fields||v));}}
async function fixture(){
 const rows=new Map([['Wave',{fields:{title:'Wave','repertoire-youtube':'https://youtu.be/8UNtQpMMSEM'}}],['Wave lead',{fields:{title:'Wave lead','repertoire-work-title':'Wave'}}]]);
 const wiki={getTiddler:t=>rows.get(t),getTiddlerText:(_t,f)=>f,addTiddler:t=>rows.set(t.fields.title,t),addEventListener(){},removeEventListener(){}};
 const youtube={};runInNewContext(await read('mini-youtube.js'),{exports:youtube,$tw:{Tiddler}});
 const doc=svgDocument(),host=doc.createElement('div');doc.body.appendChild(host);
 Object.assign(doc.defaultView,{innerWidth:1100,innerHeight:800,requestAnimationFrame:fn=>fn(),sessionStorage:{getItem:()=>null,setItem(){}},addEventListener(){},removeEventListener(){}});
 return {rows,wiki,youtube,doc,host};
}
test('the mini video resolves the canonical tune through a leadsheet and validates video hosts',async()=>{
 const f=await fixture();assert.equal(f.youtube.video(f.wiki,'Wave lead').id,'8UNtQpMMSEM');assert.equal(f.youtube.video(f.wiki,'Wave lead').workTitle,'Wave');
 for(const url of ['https://evil.test/embed/8UNtQpMMSEM','https://youtube.com.evil.test/watch?v=8UNtQpMMSEM','javascript:alert(1)'])assert.equal(f.youtube.id(url),'');
 const view=f.youtube.mount(f.host,{wiki:f.wiki,title:'Wave lead'});assert.equal(f.host.querySelector('iframe'),null,'video loads only on demand');view.show();
 assert.match(f.host.querySelector('iframe').src,/youtube-nocookie\.com\/embed\/8UNtQpMMSEM/);
 const input=f.host.querySelector('input');input.value='https://youtu.be/YUeuU9mu8mU';f.host.querySelector('button').click();
 assert.match(f.rows.get('Wave').fields['repertoire-youtube'],/YUeuU9mu8mU/);assert.equal(f.rows.get('Wave lead').fields['repertoire-youtube'],undefined);
 const frame=f.host.querySelector('iframe');view.hide();assert.equal(frame.src,'about:blank');view.destroy();
});
test('collapsing the mixer keeps the video player alive; changing audio source or closing destroys it',async()=>{
 const f=await fixture(),mixer={},config={voiceSettings:{},backingModes:{},bassSource:'',reverb:0};let stopped=0;
 const players=[];f.doc.defaultView.YT={Player:class{constructor(frame,settings){this.frame=frame;this.events=settings.events;this.plays=0;this.pauses=0;players.push(this);}playVideo(){this.plays++;this.events.onStateChange({data:1});}pauseVideo(){this.pauses++;this.events.onStateChange({data:2});}destroy(){}}};
 runInNewContext(await read('floating-mixer.js'),{exports:mixer,require(name){
  if(name.endsWith('mini-youtube.js'))return f.youtube;
  if(name.endsWith('voice-routing.js'))return {describe:()=>[],clean:()=>({})};
  if(name.endsWith('accompaniment.js'))return {clean:()=>config,activeSolo:()=>false};
  if(name.endsWith('chord-chart.js'))return {extract:()=>({chords:[],measures:[]})};
  if(name.endsWith('playback-feedback.js'))return {update(){}};
  return {};
 }});
 const panel=mixer.mount({ABC:{},host:f.host,wiki:f.wiki,title:'Wave lead',initialFloating:true,initiallyVisible:true,onStopPlayback(){stopped++;}});
 panel.selectTab('youtube');assert.equal(stopped,1);const frame=f.doc.querySelector('iframe');assert.ok(frame);
 await Promise.resolve();players[0].events.onReady();
 panel.collapse(true);assert.equal(f.doc.querySelector('iframe'),frame);assert.notEqual(frame.src,'about:blank','collapse hides the player without stopping its sound');
 const play=panel.element.querySelector('.huwabc-mini-mixer-play');play.click();assert.equal(players[0].plays,1,'the collapsed mixer play button starts YouTube');play.click();assert.equal(players[0].pauses,1,'the same button pauses YouTube');
 panel.collapse(false);assert.equal(f.doc.querySelector('iframe'),frame);
 panel.updatePlayback(true);assert.equal(frame.src,'about:blank','ABC playback stops the video');
 panel.selectTab('youtube');const replacement=f.doc.querySelector('iframe');panel.hide();assert.equal(replacement.src,'about:blank');
 panel.show();assert.ok(f.doc.querySelector('iframe'));panel.destroy();assert.equal(f.doc.querySelector('iframe'),null);
 const pdfMixer=mixer.mount({host:f.host,wiki:f.wiki,title:'Wave',videoOnly:true,initialFloating:true});
 assert.ok(pdfMixer.element.querySelector('iframe'),'PDF-only songs have a video mixer without loading an ABC engine');pdfMixer.destroy();
});
