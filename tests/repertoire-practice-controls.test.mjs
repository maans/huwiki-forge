import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const practice={};
runInNewContext(await readFile(new URL('../plugins/repertoire/src/practice.js',import.meta.url),'utf8'),{exports:practice});
const bookExports={};
function Widget(){}
runInNewContext(await readFile(new URL('../plugins/repertoire/src/book-widget.js',import.meta.url),'utf8'),{
 exports:bookExports,require(name){
  if(name==='$:/core/modules/widgets/widget.js')return {widget:Widget};
  if(name==='$:/plugins/huwiki/repertoire/practice.js')return practice;
  return {};
 }
});
const Book=bookExports['huwiki-repertoire-book'];
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const doc=svgDocument(),book=Object.create(Book.prototype),writes=[];
 const original={enabled:true,metronome:true,metronomeVolume:33,backingModes:{metronome:'solo',bass:'normal'},
  voiceSettings:{'0':{mode:'normal',volume:75},'1':{mode:'solo',volume:90}},melodyVolume:81,bassVolume:64};
 let current=clone(original);
 Object.assign(book,{document:doc,activeItem:'Tune A',practiceEnabled:false,practiceMetronome:false,
  practiceMuteByItem:Object.create(null),practiceOpen:false,
  _score:{_accompControls:{config(){return current;},setConfig(next,persist){writes.push({config:clone(next),persist});current=clone(next);}}}
 });
 doc.body.appendChild(book.practicePanel(doc));
 const scoreHost=book._practiceScoreHost=doc.createElement('section');
 for(const [id,name] of [['0','Trompet 1'],['1','Klaver']]){
  const row=doc.createElement('div');row.className='huwabc-voice-row';row.setAttribute('data-voice-index',id);
  const label=doc.createElement('span');label.className='huwabc-voice-name';label.textContent=name;row.appendChild(label);scoreHost.appendChild(row);
 }
 book.syncPracticeVoices();
 const controls=book._practiceControls;
 function selectVoice(value){assert.equal(Boolean(controls.voice.disabled),false,'voice choice stays available');controls.voice.value=value;controls.voice.dispatch('change');}
 function togglePractice(value){controls.enabled.checked=value;controls.enabled.dispatch('change');}
 function toggleMetronome(value){controls.metronome.checked=value;controls.metronome.dispatch('change');}
 return {book,controls,writes,original,selectVoice,togglePractice,toggleMetronome,get current(){return current;}};
}

test('Choosing the first Music Minus One voice enables practice in one action without persisting the mix',()=>{
 const f=fixture();
 assert.equal(f.book.practiceEnabled,false);assert.equal(f.controls.enabled.checked,false);
 assert.equal(Boolean(f.controls.voice.disabled),false,'voice selector is usable before checking practice');
 assert.deepEqual(f.controls.voice.children.map(option=>[option.value,option.textContent]),[['','Ingen – alle stemmer høres'],['0','Trompet 1'],['1','Klaver']]);
 f.selectVoice('0');
 assert.equal(f.book.practiceEnabled,true);assert.equal(f.controls.enabled.checked,true);
 assert.equal(f.controls.metronome.disabled,false);assert.equal(f.book.practiceMuteByItem['Tune A'],'0');
 assert.equal(f.current.voiceSettings['0'].mode,'mute');assert.equal(f.current.voiceSettings['0'].volume,75);
 assert.deepEqual(f.current.voiceSettings['1'],f.original.voiceSettings['1']);
 assert.match(f.controls.status.textContent,/valgte stemme er lydløs/);
 assert.ok(f.writes.length>0);assert.ok(f.writes.every(write=>write.persist===false),'practice remains a temporary listening overlay');
});

test('Turning practice off restores the original mix and voice choices can re-enable it',()=>{
 const f=fixture();f.selectVoice('0');f.toggleMetronome(true);f.togglePractice(false);
 assert.equal(f.book.practiceEnabled,false);assert.equal(f.controls.enabled.checked,false);
 assert.equal(f.controls.metronome.disabled,true);assert.equal(Boolean(f.controls.voice.disabled),false);
 assert.deepEqual(f.current,f.original,'original voice modes, volumes and metronome mix are restored exactly');
 assert.equal(f.controls.voice.value,'','the dropdown shows no muted voice when practice is off');
 assert.equal(f.book.practiceMuteByItem['Tune A'],'0','the previous practice choice is remembered separately');
 assert.match(f.controls.status.textContent,/almindelige lydblanding er gendannet/);
 f.selectVoice('0');
 assert.equal(f.book.practiceEnabled,true,'choosing the same voice again still re-enables practice');
 assert.equal(f.controls.enabled.checked,true);assert.equal(f.current.voiceSettings['0'].mode,'mute');
 f.togglePractice(false);f.togglePractice(true);
 assert.equal(f.controls.voice.value,'0','the checkbox restores the remembered choice');
 assert.equal(f.current.voiceSettings['0'].mode,'mute');
 f.togglePractice(false);
 f.selectVoice('1');
 assert.equal(f.book.practiceEnabled,true);assert.equal(f.controls.enabled.checked,true);
 assert.deepEqual(f.current.voiceSettings['0'],f.original.voiceSettings['0'],'the previous practice mute is removed');
 assert.equal(f.current.voiceSettings['1'].mode,'mute');assert.equal(f.current.voiceSettings['1'].volume,90);
 assert.equal(f.current.metronome,true,'the practice metronome preference survives disabling practice');
 f.togglePractice(false);assert.deepEqual(f.current,f.original,'repeated enable/disable keeps the same baseline');
});

test('Choosing no muted voice preserves active practice and its metronome preference',()=>{
 const f=fixture();f.selectVoice('0');f.toggleMetronome(true);f.selectVoice('');
 assert.equal(f.book.practiceEnabled,true);assert.equal(f.controls.enabled.checked,true);
 assert.equal(f.controls.metronome.disabled,false);assert.equal(f.controls.metronome.checked,true);
 assert.deepEqual(f.current.voiceSettings,f.original.voiceSettings,'all voice modes and levels return to the baseline');
 assert.equal(f.current.metronome,true);assert.equal(f.current.backingModes.metronome,'normal','practice retains control of the metronome channel');
 assert.match(f.controls.status.textContent,/Alle noterede stemmer kan høres/);
 assert.match(f.controls.status.textContent,/Metronom til/);
 f.togglePractice(false);assert.deepEqual(f.current,f.original);
});

test('Choosing no muted voice while practice is off leaves the original mix active',()=>{
 const f=fixture();f.selectVoice('');
 assert.equal(f.book.practiceEnabled,false);assert.equal(f.controls.enabled.checked,false);
 assert.equal(f.controls.metronome.disabled,true);assert.deepEqual(f.current,f.original);
});

test('entering Spil selv preserves the sound settings most recently chosen outside practice',()=>{
 const f=fixture();f.book.applyPractice();
 const control=f.book._score._accompControls,next=clone(control.config());next.style='bossa';next.chordVolume=37;
 control.setConfig(next,true);f.book.practiceEnabled=true;f.book.practiceMuteByItem[f.book.activeItem]='0';f.book._practiceAppliedKey=null;f.book.applyPractice();
 f.book.practiceEnabled=false;f.book._practiceAppliedKey=null;f.book.applyPractice();
 assert.equal(control.config().style,'bossa');assert.equal(control.config().chordVolume,37);
});
